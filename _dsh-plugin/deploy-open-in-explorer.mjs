/**
 * 一键部署 dsh-open-in-explorer 到 DSH_HOME，并把它挂载进 web profile 的 cordis.patch.yml。
 *
 * 为什么需要你手动跑一次：
 *   智能体的命令沙箱只允许写工作区（E:\Deepseek）与会话临时目录，
 *   写 DSH_HOME（C:\Users\...\AppData\Roaming\dsh-desktop\harness）会被拒绝。
 *   本脚本由你以你自己的权限运行，做四件事：备份 → 复制 → 挂载 → 校验。
 *
 * 用法：
 *   node _dsh-plugin/deploy-open-in-explorer.mjs              # 正常部署
 *   node _dsh-plugin/deploy-open-in-explorer.mjs --dry-run    # 只看计划，不写任何文件
 *   node _dsh-plugin/deploy-open-in-explorer.mjs --dsh-home <目录>   # 指定 DSH_HOME（自测用）
 *
 * 幂等：重复运行只会覆盖插件文件，不会再往 cordis.patch.yml 里加第二遍挂载行。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const argValue = (name, fallback) => {
const i = argv.indexOf(name)
return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const dryRun = argv.includes('--dry-run')
const defaultHome = process.env.DSH_HOME || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'dsh-desktop', 'harness')
const dshHome = path.resolve(argValue('--dsh-home', defaultHome))

const srcDir = path.join(here, 'dsh-open-in-explorer')
const dstDir = path.join(dshHome, 'plugins-local', 'dsh-open-in-explorer')
const patchPath = path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml')
const FILES = ['package.json', 'dsh.plugin.json', 'cordis.patch.yml', 'lib/client.js', 'lib/index.js', 'README.md']
const MARKER = 'id: open-in-explorer'
const BLOCK_LINES = [
'',
'# --- 交付文件卡片：直接用默认应用打开真实文件 / 资源管理器定位（见 plugins-local/dsh-open-in-explorer） ---',
'- insert:',
'    - id: open-in-explorer',
"      name: 'dsh-open-in-explorer'",
''
]

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16)
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
let problems = 0
const ok = (s) => console.log('  ✔ ' + s)
const bad = (s) => { problems += 1; console.log('  ✘ ' + s) }

console.log('=== dsh-open-in-explorer 部署 ===')
console.log('DSH_HOME :', dshHome)
console.log('源目录   :', srcDir)
console.log('目标目录 :', dstDir)
console.log('挂载文件 :', patchPath)
console.log(dryRun ? '模式     : --dry-run（不写任何文件）\n' : '模式     : 实际写入\n')

// 0) 源完整性
for (const f of FILES) {
if (fs.existsSync(path.join(srcDir, f))) ok(`源文件存在 ${f}`)
else bad(`源文件缺失 ${f}`)
}
if (!fs.existsSync(patchPath)) bad(`找不到 cordis.patch.yml：${patchPath}`)
if (problems > 0) {
console.log('\n源不完整，中止。')
process.exit(1)
}

// 1) 备份
const ts = stamp()
if (fs.existsSync(dstDir)) {
const backupDir = path.join(path.dirname(dstDir), `_backup-dsh-open-in-explorer-${ts}`)
if (dryRun) console.log(`[计划] 备份 ${dstDir} -> ${backupDir}`)
else {
fs.cpSync(dstDir, backupDir, { recursive: true })
ok(`已备份旧插件 -> ${backupDir}`)
}
} else {
console.log('[信息] 目标插件目录还不存在，将新建（跳过备份）')
}

// 2) 复制
if (dryRun) console.log(`[计划] 复制 ${FILES.join(' / ')} -> ${dstDir}`)
else {
fs.mkdirSync(path.join(dstDir, 'lib'), { recursive: true })
for (const f of FILES) {
fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f))
ok(`复制 ${f}  (sha=${sha(path.join(srcDir, f))})`)
}
}

// 3) 挂载
let patchText = fs.readFileSync(patchPath, 'utf8')
const eol = patchText.includes('\r\n') ? '\r\n' : '\n'
if (patchText.includes(MARKER)) {
ok('cordis.patch.yml 里已存在 open-in-explorer 挂载行，跳过')
} else if (dryRun) {
console.log('[计划] 向 cordis.patch.yml 追加 open-in-explorer 挂载块（先备份）')
} else {
const patchBackup = `${patchPath}.bak-before-openinexplorer-${ts}`
fs.copyFileSync(patchPath, patchBackup)
ok(`已备份 patch -> ${path.basename(patchBackup)}`)
const block = BLOCK_LINES.join(eol)
const head = patchText.endsWith(eol) || patchText.endsWith('\n') ? patchText : patchText + eol
fs.writeFileSync(patchPath, head + block, 'utf8')
patchText = fs.readFileSync(patchPath, 'utf8')
ok('已追加 open-in-explorer 挂载块')
}

// 4) 校验
console.log('\n--- 校验 ---')
for (const f of FILES) {
const a = path.join(srcDir, f)
const b = path.join(dstDir, f)
if (!fs.existsSync(b)) { bad(`${f} 未落到目标目录`); continue }
if (sha(a) === sha(b)) ok(`${f} 哈希一致 (${sha(b)})`)
else bad(`${f} 哈希不一致 源=${sha(a)} 目标=${sha(b)}`)
}
if (patchText.includes(MARKER) && patchText.includes("name: 'dsh-open-in-explorer'")) ok('cordis.patch.yml 挂载行完整')
else bad('cordis.patch.yml 缺少挂载行')

// 5) YAML 解析（有 js-yaml 就解析，没有就跳过，不视为失败）
try {
const { createRequire } = await import('node:module')
const require = createRequire(import.meta.url)
const jsYaml = require('E:/Program Files/DeepSeek/DSH Desktop/resources/app/node_modules/js-yaml')
const doc = jsYaml.load(patchText)
const last = Array.isArray(doc) ? doc[doc.length - 1] : null
const hit = last && Array.isArray(last.insert) && last.insert.some((e) => e && e.id === 'open-in-explorer' && e.name === 'dsh-open-in-explorer')
if (hit) ok('YAML 解析通过，最后一条就是 open-in-explorer 挂载')
else bad(`YAML 解析通过但最后一条不是挂载块：${JSON.stringify(last)}`)
} catch (error) {
console.log(`  (跳过 YAML 解析：${error && error.message})`)
}

console.log('')
if (problems > 0) {
console.log(`结果：有 ${problems} 个问题，请把上面的输出发给我。`)
process.exit(1)
}
console.log('结果：全部通过 ✅')
if (!dryRun) {
console.log('')
console.log('下一步（必须）：完全退出并重新启动 DSH Desktop —— 宿主半边只在启动时加载。')
console.log('重启后可自测：')
console.log('  定位测试文件      http://127.0.0.1:43129/open-in-explorer/test')
console.log('  默认应用打开      http://127.0.0.1:43129/open-in-explorer/test-open')
console.log('  诊断日志          E:\\Deepseek\\_dsh-plugin\\diag.log')
}