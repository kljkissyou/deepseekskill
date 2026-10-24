#!/usr/bin/env node
/**
 * 交付卡片一键安装包 —— 让 DSH 的「交付文件卡片」在所有机器上开箱可用。
 *
 * 这个脚本做三件事（全部幂等，重复运行安全）：
 *   ① 启用 @deepseek-ai/dsh-tool-present —— 卡片行本体（present 工具 → 交付文件卡片 + 打开/定位菜单）。
 *      该模块随 DSH 应用包一起安装，无需联网、无需 npm install，只是默认没有挂载。
 *   ② 安装本地插件 dsh-open-in-explorer —— 把卡片上的「打开」改成"用默认应用打开真实文件"，
 *      整卡点击 / ⌄ 菜单「在文件资源管理器中显示」= 资源管理器定位（否则只会开侧边栏预览）。
 *   ③ 往全局指令 AGENTS.md 追加「交付文件卡片」约定 —— 让以后所有会话的交付文件都主动生成卡片。
 *
 * 用法：
 *   node install.mjs                 # 安装 / 修复
 *   node install.mjs --dry-run       # 只看计划，不写任何文件
 *   node install.mjs --check         # 只体检，不写入（打印状态表 + 插件日志末尾）
 *   node install.mjs --uninstall     # 卸载插件与挂载（保留备份，AGENTS.md 段落一并移除）
 *   node install.mjs --uninstall --purge   # 卸载并删除插件目录
 *   node install.mjs --dsh-home <目录>     # 指定 DSH_HOME（自测用）
 *   node install.mjs --all-profiles        # 连 safe-mode / 历史备份 profile 一起处理（默认跳过）
 *
 * 装完必须【完整退出并重新启动 DSH Desktop】——宿主半边只在启动时加载。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (name, fallback) => {
    const i = argv.indexOf(name)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const dryRun = has('--dry-run')
const checkOnly = has('--check')
const uninstall = has('--uninstall')
const purge = has('--purge')
const allProfiles = has('--all-profiles')
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

let problems = 0
const ok = (s) => console.log('  [OK] ' + s)
const info = (s) => console.log('  [--] ' + s)
const bad = (s) => { problems += 1; console.log('  [XX] ' + s) }
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16)
const readText = (p) => fs.readFileSync(p, 'utf8')
const eolOf = (t) => (t.includes('\r\n') ? '\r\n' : '\n')

/* ───────────────────────── 定位 DSH_HOME ───────────────────────── */
function findDshHome() {
    const explicit = val('--dsh-home', '')
    if (explicit) return path.resolve(explicit)
    if (process.env.DSH_HOME) return path.resolve(process.env.DSH_HOME)
    const cands = []
    for (const base of [process.env.APPDATA, process.env.LOCALAPPDATA]) {
        if (base) cands.push(path.join(base, 'dsh-desktop', 'harness'))
    }
    cands.push(path.join(os.homedir(), 'AppData', 'Roaming', 'dsh-desktop', 'harness'))
    for (const c of cands) {
        if (fs.existsSync(path.join(c, 'profiles'))) return c
    }
    return cands[0]
}

function findProfiles(home) {
    const root = path.join(home, 'profiles')
    if (!fs.existsSync(root)) return []
    // 默认只动活动 profile：跳过历史备份/损坏/迁移残留，以及 safe-mode
    // （safe-mode 的 patch 文件明确写着"刻意省略第三方 bundle"，不该被我们改）
    const skip = allProfiles ? /(?!)/ : /(\.bak|\.broken|\.old|_bad|_migrated|^\.generations|safe-?mode)/i
    const list = fs.readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !skip.test(d.name))
        .map((d) => path.join(root, d.name, 'cordis.patch.yml'))
        .filter((p) => fs.existsSync(p))
    // web 优先，其余按名字排
    return list.sort((a, b) => {
        const wa = /[\\/]web[\\/]/.test(a) ? 0 : 1
        const wb = /[\\/]web[\\/]/.test(b) ? 0 : 1
        return wa - wb || a.localeCompare(b)
    })
}

/* ───────────────────────── 挂载块定义 ───────────────────────── */
const BLOCKS = [
    {
        id: 'tool-present',
        marker: 'id: tool-present',
        comment: '# --- 交付卡片：声明式交付（present 工具 → 交付文件卡片行 + 打开/定位菜单） ---',
        lines: ["- insert:", "    - id: tool-present", "      name: '@deepseek-ai/dsh-tool-present'"],
    },
    {
        id: 'open-in-explorer',
        marker: 'id: open-in-explorer',
        comment: '# --- 交付文件卡片：用默认应用打开真实文件 / 资源管理器定位（见 plugins-local/dsh-open-in-explorer） ---',
        lines: ["- insert:", "    - id: open-in-explorer", "      name: 'dsh-open-in-explorer'"],
    },
]

const PLUGIN_FILES = ['package.json', 'dsh.plugin.json', 'cordis.patch.yml', 'lib/client.js', 'lib/index.js', 'README.md']
const AGENT_BEGIN = '<!-- dsh-delivery-cards:begin'
const AGENT_END = '<!-- dsh-delivery-cards:end -->'

/* ───────────────────────── 工具函数 ───────────────────────── */
function backupOnce(p, suffix) {
    let bak = `${p}.bak-${suffix}-${ts}`
    // 同一轮里多次调用不能互相覆盖：第一次的备份才是"改动前"的原始状态
    let n = 2
    while (fs.existsSync(bak)) { bak = `${p}.bak-${suffix}-${ts}-${n}`; n += 1 }
    if (dryRun) { console.log(`  [计划] 备份 ${p} -> ${path.basename(bak)}`); return bak }
    fs.copyFileSync(p, bak)
    ok(`已备份 -> ${path.basename(bak)}`)
    return bak
}

function appendBlock(patchPath, block) {
    const text = readText(patchPath)
    if (text.includes(block.marker)) { ok(`${path.basename(path.dirname(patchPath))}: 已有 ${block.id} 挂载，跳过`); return false }
    if (dryRun) { console.log(`  [计划] 向 ${path.basename(patchPath)} 追加 ${block.id} 挂载块`); return true }
    backupOnce(patchPath, 'deliverycards')
    const eol = eolOf(text)
    const body = [block.comment, ...block.lines, ''].join(eol)
    const lines = text.split(/\r?\n/)
    // 空文档 `[]` 的 profile：必须把它替换掉，否则 `[]` 之后追加内容会让 YAML 非法
    const emptyIdx = lines.findIndex((l) => /^\s*\[\s*\]\s*$/.test(l))
    if (emptyIdx >= 0) {
        lines[emptyIdx] = body.trimEnd()
        fs.writeFileSync(patchPath, lines.join(eol), 'utf8')
        ok(`${path.basename(path.dirname(patchPath))}: 空文档 [] 已被替换为 ${block.id} 挂载块`)
        return true
    }
    const head = text.endsWith('\n') || text.endsWith(eol) ? text : text + eol
    fs.writeFileSync(patchPath, head + body, 'utf8')
    ok(`${path.basename(path.dirname(patchPath))}: 已追加 ${block.id} 挂载块`)
    return true
}

function removeBlock(patchPath, block) {
    const text = readText(patchPath)
    if (!text.includes(block.marker)) { info(`${path.basename(path.dirname(patchPath))}: 没有 ${block.id} 挂载，跳过`); return false }
    const eol = eolOf(text)
    const lines = text.split(/\r?\n/)
    const out = []
    let removed = 0
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        if (/^\s*-\s*insert:\s*$/.test(line)) {
            // 看后面几行里有没有我们的 id
            const win = lines.slice(i, i + 6).join('\n')
            if (win.includes(block.marker)) {
                // 连带删掉紧邻上方的注释行（我们写的那条）
                while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
                if (out.length > 0 && out[out.length - 1].trim().startsWith('#') && /交付卡片|交付文件卡片|open-in-explorer|tool-present/.test(out[out.length - 1])) out.pop()
                // 跳过整个 insert 块（到下一个顶格条目为止）
                let j = i + 1
                while (j < lines.length && (lines[j].trim() === '' || /^\s/.test(lines[j]))) j += 1
                i = j - 1
                removed += 1
                continue
            }
        }
        out.push(line)
    }
    if (removed === 0) return false
    if (dryRun) { console.log(`  [计划] 从 ${path.basename(patchPath)} 移除 ${block.id} 挂载块`); return true }
    backupOnce(patchPath, 'deliverycards-uninstall')
    fs.writeFileSync(patchPath, out.join(eol), 'utf8')
    ok(`${path.basename(path.dirname(patchPath))}: 已移除 ${block.id} 挂载块`)
    return true
}

// 用 CJS require 动态加载 DSH 应用包里的 js-yaml（免安装、免联网）
let _require = null
let _yaml = null
async function getRequire() {
    if (!_require) {
        const { createRequire } = await import('node:module')
        _require = createRequire(import.meta.url)
    }
    return _require
}
async function loadYamlAsync(mod, text) {
    if (!_yaml) _yaml = (await getRequire())(mod)
    return _yaml.load(text)
}

/* ───────────────────────── 主流程 ───────────────────────── */
console.log('=== DSH 交付卡片 · 一键安装包 ===')
const dshHome = findDshHome()
const profiles = findProfiles(dshHome)
const pluginSrc = path.join(here, 'plugin', 'dsh-open-in-explorer')
const pluginDst = path.join(dshHome, 'plugins-local', 'dsh-open-in-explorer')
const agentsPath = path.join(dshHome, 'AGENTS.md')
const agentBlockPath = path.join(here, 'agent-instruction-block.md')
const diagPath = path.join(here, '..', 'diag.log')

console.log('DSH_HOME :', dshHome)
console.log('profile  :', profiles.length ? profiles.map((p) => path.basename(path.dirname(p))).join(', ') : '(没找到 cordis.patch.yml)')
console.log('插件目录 :', pluginDst)
console.log('全局指令 :', agentsPath)
console.log('模式     : ' + (checkOnly ? '--check（只体检）' : uninstall ? '--uninstall（卸载）' : dryRun ? '--dry-run（不写文件）' : '实际安装') + '\n')

if (!fs.existsSync(path.join(dshHome, 'profiles'))) bad(`DSH_HOME 里没有 profiles 目录，确认路径是否正确：${dshHome}`)

if (checkOnly) {
    console.log('--- 体检 ---')
    for (const p of profiles) {
        const t = readText(p)
        const name = path.basename(path.dirname(p))
        const hasPresent = t.includes('id: tool-present')
        const hasExplorer = t.includes('id: open-in-explorer')
        ;(hasPresent ? ok : bad)(`${name}: tool-present 挂载 ${hasPresent ? '已启用（卡片行本体）' : '缺失（不会出现交付卡片）'}`)
        ;(hasExplorer ? ok : bad)(`${name}: open-in-explorer 挂载 ${hasExplorer ? '已启用（打开=真实文件/资源管理器定位）' : '缺失（打开只会开侧边栏预览）'}`)
        const y = await yamlParseAsync(p)
        if (y.ok === true) ok(`${name}: ${y.note}`)
        else if (y.ok === false) bad(`${name}: ${y.note}`)
        else info(`${name}: ${y.note}`)
    }
    for (const f of PLUGIN_FILES) {
        const a = path.join(pluginSrc, f)
        const b = path.join(pluginDst, f)
        if (!fs.existsSync(a)) { info(`源包缺 ${f}（跳过）`); continue }
        if (!fs.existsSync(b)) { bad(`插件未安装：${f}`); continue }
        if (sha(a) === sha(b)) ok(`插件文件一致 ${f} (${sha(b)})`)
        else bad(`插件文件不一致 ${f}：源 ${sha(a)} / 目标 ${sha(b)}`)
    }
    if (fs.existsSync(agentsPath)) {
        if (readText(agentsPath).includes(AGENT_BEGIN)) ok('全局 AGENTS.md：已含「交付文件卡片」约定')
        else bad('全局 AGENTS.md：还没有「交付文件卡片」约定（agent 不会自动生成卡片）')
    } else bad(`找不到 ${agentsPath}`)
    if (fs.existsSync(diagPath)) {
        const tail = readText(diagPath).trim().split(/\r?\n/).filter((l) => l.includes('census')).slice(-3)
        if (tail.length) { console.log('  [--] 插件日志最近几次页面扫描：'); for (const l of tail) console.log('       ' + l) }
    }
    console.log('')
    console.log(problems ? `体检结果：${problems} 项待修 —— 运行 install.mjs 即可修复。` : '体检结果：全部正常 ✅')
    process.exit(problems ? 1 : 0)
}

/* ── 卸载分支 ── */
if (uninstall) {
    console.log('--- 卸载 ---')
    for (const p of profiles) for (const b of BLOCKS) removeBlock(p, b)
    if (fs.existsSync(agentsPath)) {
        const t = readText(agentsPath)
        if (t.includes(AGENT_BEGIN)) {
            if (dryRun) console.log('  [计划] 从 AGENTS.md 移除「交付文件卡片」段落')
            else {
                backupOnce(agentsPath, 'deliverycards-uninstall')
                const eol = eolOf(t)
                const start = t.indexOf(AGENT_BEGIN)
                const end = t.indexOf(AGENT_END)
                const cut = end >= 0 ? t.slice(0, start) + t.slice(end + AGENT_END.length) : t.slice(0, start)
                fs.writeFileSync(agentsPath, cut.replace(/\n{3,}/g, eol + eol), 'utf8')
                ok('AGENTS.md：已移除「交付文件卡片」段落')
            }
        } else info('AGENTS.md：没有我们的段落，跳过')
    }
    if (purge) {
        if (fs.existsSync(pluginDst)) {
            if (dryRun) console.log(`  [计划] 删除插件目录 ${pluginDst}`)
            else { fs.rmSync(pluginDst, { recursive: true, force: true }); ok('已删除插件目录') }
        }
    } else info('插件目录保留（如需删除加 --purge）')
    console.log('')
    console.log('卸载完成，请完整重启 DSH Desktop 生效。')
    process.exit(problems ? 1 : 0)
}

/* ── 安装分支 ── */
console.log('--- 0) 源自检 ---')
for (const f of PLUGIN_FILES) {
    if (fs.existsSync(path.join(pluginSrc, f))) ok(`源文件存在 ${f}`)
    else bad(`源文件缺失 ${f}（安装包不完整）`)
}
if (!fs.existsSync(agentBlockPath)) bad(`缺少 ${path.basename(agentBlockPath)}（全局交付约定片段）`)
if (problems > 0) { console.log('\n源不完整，中止。'); process.exit(1) }

console.log('\n--- 1) 启用交付卡片 + 打开增强（挂载 profile） ---')
if (!profiles.length) bad('没有可挂载的 profile（cordis.patch.yml）')
for (const p of profiles) for (const b of BLOCKS) appendBlock(p, b)

console.log('\n--- 2) 安装 dsh-open-in-explorer 插件 ---')
if (fs.existsSync(pluginDst)) {
    const bakDir = path.join(dshHome, 'plugins-local', `_backup-dsh-open-in-explorer-${ts}`)
    if (dryRun) console.log(`  [计划] 备份 ${pluginDst} -> ${path.basename(bakDir)}`)
    else { fs.cpSync(pluginDst, bakDir, { recursive: true }); ok(`已备份旧插件 -> ${path.basename(bakDir)}`) }
} else info('目标插件目录尚不存在，将新建')
if (dryRun) console.log(`  [计划] 复制 ${PLUGIN_FILES.length} 个文件 -> ${pluginDst}`)
else {
    fs.mkdirSync(path.join(pluginDst, 'lib'), { recursive: true })
    for (const f of PLUGIN_FILES) {
        fs.copyFileSync(path.join(pluginSrc, f), path.join(pluginDst, f))
        ok(`复制 ${f}  (sha=${sha(path.join(pluginSrc, f))})`)
    }
}

console.log('\n--- 3) 追加全局交付约定（AGENTS.md） ---')
if (!fs.existsSync(agentsPath)) {
    if (dryRun) console.log('  [计划] 新建 AGENTS.md')
    else { fs.writeFileSync(agentsPath, '', 'utf8'); ok('已新建 AGENTS.md') }
}
const agentsText = fs.existsSync(agentsPath) ? readText(agentsPath) : ''
if (agentsText.includes(AGENT_BEGIN)) ok('AGENTS.md 已含「交付文件卡片」约定，跳过')
else if (dryRun) console.log('  [计划] 向 AGENTS.md 追加「交付文件卡片」约定段落')
else {
    backupOnce(agentsPath, 'deliverycards')
    const snippet = readText(agentBlockPath).trimEnd()
    const eol = eolOf(agentsText || '\n')
    const head = agentsText && !agentsText.endsWith('\n') ? agentsText + eol : agentsText
    fs.writeFileSync(agentsPath, head + eol + snippet + eol, 'utf8')
    ok('AGENTS.md：已追加「交付文件卡片」约定')
}

console.log('\n--- 4) 校验 ---')
for (const f of PLUGIN_FILES) {
    const a = path.join(pluginSrc, f)
    const b = path.join(pluginDst, f)
    if (!fs.existsSync(b)) { if (!dryRun) bad(`${f} 未落到目标目录`); continue }
    if (sha(a) === sha(b)) ok(`哈希一致 ${f} (${sha(b)})`)
    else bad(`哈希不一致 ${f}`)
}
for (const p of profiles) {
    const patchText = readText(p)
    const name = path.basename(path.dirname(p))
    const mp = BLOCKS.every((b) => patchText.includes(b.marker))
    if (dryRun) info(`${name}: 两条挂载将在安装后写入（tool-present + open-in-explorer）`)
    else (mp ? ok : bad)(`${name}: 两条挂载都在（tool-present + open-in-explorer）`)
    const y = await yamlParseAsync(p)
    if (y.ok === true) ok(`${name}: ${y.note}`)
    else if (y.ok === false) bad(`${name}: ${y.note}`)
    else info(`${name}: ${y.note}`)
}
if (fs.existsSync(agentsPath)) {
    const agentsNow = readText(agentsPath)
    if (dryRun) info('AGENTS.md: 「交付文件卡片」约定将在安装后写入')
    else (agentsNow.includes(AGENT_BEGIN) ? ok : bad)('AGENTS.md: 「交付文件卡片」约定已就位')
}

console.log('')
if (problems > 0) {
    console.log(`结果：有 ${problems} 个问题，请把上面的输出发我。`)
    process.exit(1)
}
console.log('结果：全部通过 ✅')
if (!dryRun) {
    console.log('')
    console.log('下一步（必须）：完整退出并重新启动 DSH Desktop —— 卡片行与 spawn 补丁只在启动时加载。')
    console.log('重启后自测：')
    console.log('  打开真实文件      http://127.0.0.1:43129/open-in-explorer/test-open')
    console.log('  资源管理器定位    http://127.0.0.1:43129/open-in-explorer/test')
    console.log('  只体检            node install.mjs --check')
    console.log('  插件日志          ' + path.resolve(diagPath))
}

/* 异步 YAML 校验的包装（兼容 CJS require） */
async function yamlParseAsync(patchPath) {
    const appRoots = [
        'C:\\Program Files\\DeepSeek\\DSH Desktop\\resources\\app',
        'D:\\Program Files\\DeepSeek\\DSH Desktop\\resources\\app',
        'E:\\Program Files\\DeepSeek\\DSH Desktop\\resources\\app',
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DeepSeek', 'DSH Desktop', 'resources', 'app'),
    ]
    for (const root of appRoots) {
        const mod = path.join(root, 'node_modules', 'js-yaml')
        if (!fs.existsSync(mod)) continue
        try {
            const doc = await loadYamlAsync(mod, readText(patchPath))
            if (Array.isArray(doc)) return { ok: true, note: `YAML 解析通过（${doc.length} 条顶层条目）` }
            return { ok: false, note: `YAML 顶层不是数组：${typeof doc}` }
        } catch (error) {
            return { ok: false, note: `YAML 解析失败：${error && error.message}` }
        }
    }
    return { ok: null, note: '未找到 js-yaml，跳过 YAML 校验' }
}
