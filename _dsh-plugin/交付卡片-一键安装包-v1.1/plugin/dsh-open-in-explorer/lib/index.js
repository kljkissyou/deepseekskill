/**
 * dsh-open-in-explorer — 宿主半边。
 *
 * 解决三个层面：
 *
 * 1) 全局修复（patchSpawnForGuiLaunchers）
 *    DSH Desktop 启动时用 resources/windows-child-process-hide.mjs 给
 *    Harness 的 child_process.spawn 打补丁，把「调用方没显式写 windowsHide」
 *    的调用一律变成 windowsHide: true：
 *
 *        function applyWindowsHide(options) {
 *          if (options && typeof options === 'object' && options.windowsHide !== undefined) {
 *            return options                              // 显式指定 -> 尊重
 *          }
 *          ...return { ...options, windowsHide: true }    // 否则强加 true
 *        }
 *
 *    windowsHide: true 会让 Node 给 CreateProcess 传 CREATE_NO_WINDOW。
 *    对 explorer.exe / open 这类 GUI 启动器，结果是：进程起来了、路由返回
 *    {"started":true}，但**窗口永远不显示**——用户看到的就是「点了没反应」。
 *
 *    dsh-better-sidebar 的 launchExternal() 正是这种情况：
 *        spawn(spec.command, spec.args, { detached: true, stdio: "ignore" })
 *    它同时支撑「右键 → 资源管理器 / 在文件夹中显示」和「用默认应用打开」。
 *
 *    所以这里把 spawn 再包一层：只对已知的 GUI 启动器显式补上
 *    windowsHide: false（补丁见到显式值即原样放行），其它命令一律不碰。
 *    做在这里而不是改第三方源码，是为了不受插件升级覆盖。
 *
 * 2) 本插件自己的两个动作路由
 *    POST /open-in-explorer/open    { path } 用系统默认应用打开真实文件
 *    POST /open-in-explorer/reveal  { path } 在系统文件管理器中定位（打开所在文件夹）
 *    POST /open-in-explorer/diag             现场诊断日志
 *    客户端「交付文件」卡片点击走这两条，路径最短、行为最确定：
 *      - 「打开」按钮        -> explorer.exe <path>          （ShellExecute，等同双击）
 *      - 整卡 / 菜单「在文件资源管理器中显示」-> explorer.exe /select,<path>
 *    两者都显式 windowsHide: false，不再依赖官方 /api/present.open 或
 *    better-sidebar 的 /sidebar/api/open.external。
 *
 * 3) 免界面自检入口（重启 DSH 后可在浏览器直接验证）
 *    GET /open-in-explorer/test       定位到测试文件（资源管理器）
 *    GET /open-in-explorer/test-open  用默认应用打开测试文件
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { spawn } from 'node:child_process'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'

/**
 * DSH_HOME（会话日志根目录的父目录）。
 *
 * v1.1 起不再写死机器路径，按下面顺序探测，取第一个"看起来像 DSH home"的目录
 * （含 profiles 子目录）：
 *   ① 环境变量 DSH_HOME
 *   ② ~/.dsh                  —— 新版桌面版的默认 home
 *   ③ %APPDATA%\dsh-desktop\harness      —— 旧版桌面版
 *   ④ %LOCALAPPDATA%\dsh-desktop\harness —— 旧版桌面版（另一种安装位置）
 * 都探测不到时退回 ②（宁可空着，也不往别人机器的固定盘符里写东西）。
 */
const DSH_HOME = (() => {
    const candidates = []
    if (process.env.DSH_HOME) candidates.push(process.env.DSH_HOME)
    try {
        candidates.push(path.join(os.homedir(), '.dsh'))
    } catch {
        /* 极端环境下 homedir() 可能抛错，忽略 */
    }
    if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'dsh-desktop', 'harness'))
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'dsh-desktop', 'harness'))
    for (const dir of candidates) {
        if (!dir) continue
        try {
            if (fs.existsSync(path.join(dir, 'profiles'))) return dir
        } catch {
            /* 权限问题就跳过 */
        }
    }
    return candidates[1] || path.join(os.tmpdir(), 'dsh-home')
})()

/** 诊断日志：落在 <DSH_HOME>/logs 下（DSH 自己的日志目录），不写机器专属路径。 */
const LOG_FILE = path.join(DSH_HOME, 'logs', 'open-in-explorer.log')

/**
 * GET /open-in-explorer/test* 使用的自检路径。
 * v1.1 起用系统临时目录，并在第一次被访问时按需创建，不再依赖某台机器的固定目录。
 */
const TEST_DIR = path.join(os.tmpdir(), 'dsh-open-in-explorer-test')
const DEFAULT_TEST_PATH = path.join(TEST_DIR, '测试文件.txt')

/** 确保自检文件存在，返回它的绝对路径。 */
function ensureTestPath() {
    try {
        fs.mkdirSync(TEST_DIR, { recursive: true })
        if (!fs.existsSync(DEFAULT_TEST_PATH)) {
            fs.writeFileSync(DEFAULT_TEST_PATH, 'dsh-open-in-explorer self test\n', 'utf8')
        }
    } catch (error) {
        append(`host: 自检文件创建失败 ${error && error.message}`)
    }
    return DEFAULT_TEST_PATH
}

/** 会话日志根目录：$DSH_HOME/sessions/<workspace>/<session-id>/session.v3.jsonl.zstd */
const SESSIONS_ROOT = path.join(DSH_HOME, 'sessions')

/** zstd 帧魔数（多帧追加写入，必须按帧拆）。 */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/**
 * 列出最近的会话日志文件（按修改时间倒序）。
 * @param {number} limit 最多返回多少个
 * @returns {Array<{sessionId: string, file: string, mtime: number}>}
 */
function listSessionLogs(limit) {
    const out = []
    const walk = (dir, depth) => {
        if (depth > 3) return
        let entries
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch {
            return
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) walk(full, depth + 1)
            else if (/^session.*\.jsonl(\.zstd)?$/.test(entry.name)) {
                try {
                    const stat = fs.statSync(full)
                    out.push({
                        sessionId: path.basename(path.dirname(full)),
                        workspace: path.basename(path.dirname(path.dirname(full))),
                        file: full,
                        mtime: stat.mtimeMs
                    })
                } catch {
                    /* skip */
                }
            }
        }
    }
    walk(SESSIONS_ROOT, 0)
    return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit)
}

/**
 * 按 zstd 多帧拆解并解出会话日志全文。
 * Node 的 zstdDecompressSync 只解第一帧，所以必须按魔数切帧逐帧解。
 * @param {string} file 日志文件
 * @returns {string} 解出的 JSONL 文本（失败返回空串）
 */
function decodeSessionLog(file) {
    let buf
    try {
        buf = fs.readFileSync(file)
    } catch {
        return ''
    }
    if (buf.length > 4 && buf[0] === ZSTD_MAGIC[0] && buf[1] === ZSTD_MAGIC[1]) {
        const starts = []
        for (let i = 0; i + 4 <= buf.length; i += 1) {
            if (buf[i] === ZSTD_MAGIC[0] && buf[i + 1] === ZSTD_MAGIC[1] && buf[i + 2] === ZSTD_MAGIC[2] && buf[i + 3] === ZSTD_MAGIC[3]) starts.push(i)
        }
        starts.push(buf.length)
        let text = ''
        for (let i = 0; i < starts.length - 1; i += 1) {
            try {
                text += zlib.zstdDecompressSync(buf.subarray(starts[i], starts[i + 1])).toString('utf8')
            } catch {
                /* 坏帧跳过 */
            }
        }
        return text
    }
    return buf.toString('utf8')
}

/**
 * 会话日志解码结果的短缓存：客户端会定时轮询，避免每次都解 5MB 的 zstd。
 * 只保留最近一个文件的解码结果（够用且不占内存）。
 */
const decodeCache = new Map()

/**
 * 带缓存地解码会话日志：文件 mtime 未变就复用上次结果。
 * @param {string} file 日志文件
 * @returns {string} JSONL 文本
 */
function decodeSessionLogCached(file) {
    let mtime = 0
    try {
        mtime = fs.statSync(file).mtimeMs
    } catch {
        return ''
    }
    const hit = decodeCache.get(file)
    if (hit && hit.mtime === mtime) return hit.text
    const text = decodeSessionLog(file)
    decodeCache.clear()
    decodeCache.set(file, { mtime: mtime, text: text })
    return text
}

/**
 * 从会话日志里抽出"交付文件"事件。
 * 权威事件是 `deliverables/presented`（present 工具写下的持久事件）；
 * 若一条都没有，则退回用 `tool/call`(present) + `tool/result` 配对推断。
 * @param {string} text 会话日志全文
 * @returns {Array<{turn: number, seq: number, callId: string, files: Array<{path: string, description?: string}>}>}
 */
function extractDeliverables(text) {
    const direct = []
    const pendingCalls = new Map()
    const settledCalls = new Map()
    let seqCounter = 0
    for (const line of text.split('\n')) {
        if (line.length < 8 || line.charCodeAt(0) !== 123) continue
        let event
        try {
            event = JSON.parse(line)
        } catch {
            continue
        }
        if (typeof event.seq === 'number') seqCounter = event.seq
        const data = event.data
        if (event.type === 'deliverables/presented' && data && Array.isArray(data.files)) {
            direct.push({
                turn: typeof data.turn === 'number' ? data.turn : 0,
                seq: typeof event.seq === 'number' ? event.seq : seqCounter,
                callId: typeof data.callId === 'string' ? data.callId : '',
                files: data.files.filter((f) => f && typeof f.path === 'string' && f.path.trim().length > 0)
            })
            continue
        }
        if (event.type === 'tool/call' && data && data.name === 'present') {
            try {
                const args = typeof data.arguments === 'string' ? JSON.parse(data.arguments) : data.arguments
                if (args && Array.isArray(args.files)) {
                    pendingCalls.set(data.callId, {
                        turn: typeof data.turn === 'number' ? data.turn : 0,
                        seq: typeof event.seq === 'number' ? event.seq : seqCounter,
                        callId: data.callId,
                        files: args.files.filter((f) => f && typeof f.path === 'string')
                    })
                }
            } catch {
                /* 参数解析失败就跳过 */
            }
            continue
        }
        if (event.type === 'tool/result' && data && data.message && data.message.source && data.message.source.callId) {
            settledCalls.set(data.message.source.callId, event.seq ?? seqCounter)
        }
    }
    if (direct.length > 0) return direct
    const fallback = []
    for (const [callId, item] of pendingCalls) {
        if (!settledCalls.has(callId)) continue
        fallback.push({ ...item, seq: settledCalls.get(callId) })
    }
    return fallback
}

/** 需要宿主服务：webServer（注册路由）。sandboxPolicy 走 ctx.get 软取，避免注入不满足导致插件不加载。 */
export const inject = ['webServer']

/**
 * 把交付声明里的路径解析成绝对路径。
 * present 允许相对路径（相对会话工作区），但 explorer.exe 必须拿到绝对路径。
 * @param {string} p 声明路径
 * @param {string} workspaceRoot 工作区根（可能为空）
 * @returns {string} 绝对路径
 */
function toAbsolutePath(p, workspaceRoot) {
    if (typeof p !== 'string' || p.trim().length === 0) return ''
    const value = p.trim()
    if (/^[a-zA-Z]:[\\/]/.test(value)) return value
    if (value.startsWith('\\\\') || value.startsWith('/')) return value
    if (typeof workspaceRoot === 'string' && workspaceRoot.length > 0) return path.join(workspaceRoot, value)
    return value
}

/**
 * 从会话目录名反推工作区根（形如 `--E-Deepseek--` → `E:\Deepseek`）。
 * 仅作 sandboxPolicy 不可用时的兜底。
 * @param {string} sessionId 会话目录名
 * @returns {string} 猜测的工作区根，猜不出返回空串
 */
function workspaceFromSessionDir(sessionId) {
    const m = /^--(.+)--$/.exec(sessionId)
    if (m === null) return ''
    const drive = /^([A-Za-z])-/.exec(m[1])
    if (drive === null) return ''
    const rest = m[1].slice(2).split('-').filter((s) => s.length > 0).join('\\')
    return `${drive[1]}:\\${rest}`
}

/**
 * 追加一行诊断日志，永不抛出。
 * @param {string} line 日志内容
 */
function append(line) {
    try {
        fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
        fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`, 'utf8')
    } catch {
        /* 诊断失败绝不能影响宿主 */
    }
}

/**
 * 已知的需要真实窗口的 GUI 启动器（按可执行文件名小写匹配）。
 * 只对它们强制 windowsHide: false，其它命令完全不动。
 */
const GUI_LAUNCHERS = new Set(['explorer.exe', 'explorer', 'open', 'xdg-open'])

/** 防止重复包装。 */
const PATCH_FLAG = '__dshOpenInExplorerSpawnPatched'

/**
 * 取出命令的裸文件名（小写）。
 * @param {unknown} command 命令
 * @returns {string} 文件名，无法识别时为空串
 */
function baseName(command) {
    if (typeof command !== 'string') return ''
    const parts = command.toLowerCase().split(/[\\/]/)
    return parts.length > 0 ? parts[parts.length - 1] : ''
}

/**
 * 把 spawn 包一层：GUI 启动器显式 windowsHide: false。
 */
function patchSpawnForGuiLaunchers() {
    try {
        const target = childProcess
        if (target.spawn[PATCH_FLAG] === true) {
            append('host: spawn 补丁已存在，跳过')
            return
        }
        const original = target.spawn

        /**
         * 包装后的 spawn。签名与 node:child_process 的 spawn 保持一致。
         * @param {string} command 命令
         * @param {unknown} args 参数数组或选项对象
         * @param {unknown} options 选项对象
         * @returns {import('node:child_process').ChildProcess} 子进程
         */
        function patchedSpawn(command, args, options) {
            if (GUI_LAUNCHERS.has(baseName(command))) {
                if (Array.isArray(args)) {
                    return original.call(this, command, args, Object.assign({}, options, { windowsHide: false }))
                }
                return original.call(this, command, Object.assign({}, args, { windowsHide: false }))
            }
            if (Array.isArray(args)) return original.call(this, command, args, options)
            return original.call(this, command, args)
        }

        patchedSpawn[PATCH_FLAG] = true
        target.spawn = patchedSpawn
        // 关键：让 `import { spawn } from "node:child_process"` 的实时绑定同步到新函数
        syncBuiltinESMExports()
        append('host: ★ spawn 补丁已生效（explorer.exe / open 将强制 windowsHide:false）')
    } catch (error) {
        append(`host: spawn 补丁失败 ${error && error.message}`)
    }
}

/** 校验路径：非空、绝对、且真实存在。 */
function requireExistingAbsolute(target, action) {
    if (typeof target !== 'string' || target.trim().length === 0) {
        throw new Error(`${action} 需要一个非空路径`)
    }
    if (!path.isAbsolute(target)) {
        throw new Error(`${action} 需要绝对路径，收到：${target}`)
    }
    if (!fs.existsSync(target)) {
        throw new Error(`${action} 目标不存在：${target}`)
    }
    return target
}

/**
 * 用系统默认应用打开文件（或目录）本身。
 *
 * Windows 用 `explorer.exe <path>`：Explorer 对文件参数执行 ShellExecute，
 * 等同在资源管理器里双击该文件，也就是「直接打开真实文件」。
 * 实测：`explorer.exe E:\...\测试文件.txt` 会拉起默认文本编辑器。
 *
 * @param {string} target 绝对路径（文件或目录）
 * @returns {string} 实际执行的命令行
 */
function openWithDefaultApp(target) {
    const file = requireExistingAbsolute(target, 'open')
    const base = { detached: true, stdio: 'ignore', windowsHide: false }
    let spec
    if (process.platform === 'win32') {
        spec = { command: 'explorer.exe', args: [file], options: base }
    } else if (process.platform === 'darwin') {
        spec = { command: 'open', args: [file], options: base }
    } else {
        spec = { command: 'xdg-open', args: [file], options: base }
    }

    const child = spawn(spec.command, spec.args, spec.options)
    child.on('error', (error) => append(`host: open spawn error ${error && error.message}`))
    child.unref()
    return `${spec.command} ${spec.args.join(' ')}`
}

/**
 * 在系统文件管理器中定位路径。
 *
 * Windows 用 `explorer.exe /select,<path>`：打开该文件所在文件夹并选中它，
 * 地址栏即文件的存储位置，用户可以继续在文件夹里自己操作文件。
 *
 * @param {string} target 绝对路径（文件或目录）
 * @returns {string} 实际执行的命令行
 */
function revealInFileManager(target) {
    const file = requireExistingAbsolute(target, 'reveal')
    const base = { detached: true, stdio: 'ignore', windowsHide: false }
    let spec
    if (process.platform === 'win32') {
        spec = { command: 'explorer.exe', args: [`/select,${file}`], options: base }
    } else if (process.platform === 'darwin') {
        spec = { command: 'open', args: ['-R', file], options: base }
    } else {
        spec = { command: 'xdg-open', args: [path.dirname(file)], options: base }
    }

    const child = spawn(spec.command, spec.args, spec.options)
    child.on('error', (error) => append(`host: spawn error ${error && error.message}`))
    child.unref()
    return `${spec.command} ${spec.args.join(' ')}`
}

/**
 * 读取并解析请求体（上限 64KB）。
 * @param {import('node:http').IncomingMessage} req 请求
 * @returns {Promise<object>} 解析后的 JSON，失败返回空对象
 */
async function readJson(req) {
    let body = ''
    for await (const chunk of req) {
        body += chunk
        if (body.length > 65536) break
    }
    if (body.trim().length === 0) return {}
    try {
        return JSON.parse(body)
    } catch {
        return {}
    }
}

/**
 * 发送 JSON 响应。
 * @param {import('node:http').ServerResponse} res 响应
 * @param {number} status 状态码
 * @param {object} payload 载荷
 */
function sendJson(res, status, payload) {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(payload))
}

/**
 * 挂载：先打全局 spawn 补丁，再注册自己的路由。
 * @param {object} ctx 宿主上下文
 */
export function apply(ctx) {
    append('host: plugin apply() 进入')
    patchSpawnForGuiLaunchers()

    try {
        ctx.effect(
            () =>
            ctx.webServer.register({
                    kind: 'prefix',
                    path: '/open-in-explorer',
                    handler: async (req, res) => {
                        try {
                            const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname

                            // 免界面的自检入口：浏览器地址栏直接打开（端口以本机 GUI 实际地址为准）
                            //   http://127.0.0.1:<端口>/open-in-explorer/test       定位测试文件
                            //   http://127.0.0.1:<端口>/open-in-explorer/test-open  默认应用打开测试文件
                            // 不依赖任何界面元素，用来排除「找不到按钮」这类干扰。
                            if (req.method === 'GET' && (pathname.endsWith('/test') || pathname.endsWith('/test-open'))) {
                                const wantsOpen = pathname.endsWith('/test-open')
                                const testPath = ensureTestPath()
                                try {
                                    const command = wantsOpen
                                    ? openWithDefaultApp(testPath)
                                    : revealInFileManager(testPath)
                                    append(`host: ${wantsOpen ? 'test-open' : 'test'} OK  ${command}`)
                                    sendJson(res, 200, { ok: true, action: wantsOpen ? 'open' : 'reveal', command: command, path: testPath })
                                } catch (error) {
                                    append(`host: ${wantsOpen ? 'test-open' : 'test'} FAIL ${error && error.message}`)
                                    sendJson(res, 400, { ok: false, error: String(error && error.message) })
                                }
                                return
                            }

                            // GET /open-in-explorer/deliverables?sessionId=xxx
                            // 方案 B 取数入口：直接读会话日志里的 `deliverables/presented` 事件，
                            // 不依赖官方交付行的 slot 注册（官方行在部分版本上因 slot 未声明而静默不渲染）。
                            if (req.method === 'GET' && pathname.endsWith('/deliverables')) {
                                try {
                                    const url = new URL(req.url ?? '/', 'http://dsh.internal')
                                    const wanted = url.searchParams.get('sessionId')
                                    const all = listSessionLogs(40)
                                    const chosen = wanted ? (all.find((s) => s.sessionId === wanted) || { sessionId: wanted, file: '' }) : all[0]
                                    let items = []
                                    if (chosen && chosen.file) items = extractDeliverables(decodeSessionLogCached(chosen.file))
                                    // 工作区根：优先用会话目录名推断（sandboxPolicy.workspaceRoot 在 Desktop 下常是 launch-root，
                                    // 会把相对交付路径解析错），推不出来才退回 sandboxPolicy。
                                    let workspaceRoot = workspaceFromSessionDir(chosen.workspace || '') || ''
                                    if (workspaceRoot.length === 0) {
                                        try {
                                            const policy = typeof ctx.get === 'function' ? ctx.get('sandboxPolicy') : ctx.sandboxPolicy
                                            workspaceRoot = policy && typeof policy.workspaceRoot === 'string' ? policy.workspaceRoot : ''
                                        } catch {
                                            workspaceRoot = ''
                                        }
                                    }
                                    const turns = items.map((item) => ({
                                        turn: item.turn,
                                        seq: item.seq,
                                        files: item.files.map((f) => {
                                            const absolute = toAbsolutePath(f.path, workspaceRoot)
                                            return {
                                                path: absolute,
                                                declared: f.path,
                                                description: f.description === undefined ? null : f.description,
                                                name: path.basename(absolute),
                                                exists: absolute.length > 0 && fs.existsSync(absolute)
                                            }
                                        })
                                    }))
                                    const fileCount = turns.reduce((n, t) => n + t.files.length, 0)
                                    append(`host: deliverables OK  session=${chosen.sessionId} ws=${workspaceRoot} turns=${turns.length} files=${fileCount}`)
                                    sendJson(res, 200, {
                                        ok: true,
                                        sessionId: chosen.sessionId,
                                        workspaceRoot: workspaceRoot,
                                        sessions: all.slice(0, 20).map((s) => ({ sessionId: s.sessionId, mtime: s.mtime })),
                                        turns: turns
                                    })
                                } catch (error) {
                                    append(`host: deliverables FAIL ${error && error.message}`)
                                    sendJson(res, 500, { ok: false, error: String(error && error.message) })
                                }
                                return
                            }

                            if (req.method !== 'POST') {
                                sendJson(res, 405, { ok: false, error: 'method not allowed' })
                                return
                            }
                            const payload = await readJson(req)

                            if (pathname.endsWith('/open')) {
                                const target = typeof payload.path === 'string' ? payload.path : ''
                                try {
                                    const command = openWithDefaultApp(target)
                                    append(`host: open OK  ${command}`)
                                    sendJson(res, 200, { ok: true, command: command })
                                } catch (error) {
                                    append(`host: open FAIL ${error && error.message}`)
                                    sendJson(res, 400, { ok: false, error: String(error && error.message) })
                                }
                                return
                            }

                            if (pathname.endsWith('/reveal')) {
                                const target = typeof payload.path === 'string' ? payload.path : ''
                                try {
                                    const command = revealInFileManager(target)
                                    append(`host: reveal OK  ${command}`)
                                    sendJson(res, 200, { ok: true, command: command })
                                } catch (error) {
                                    append(`host: reveal FAIL ${error && error.message}`)
                                    sendJson(res, 400, { ok: false, error: String(error && error.message) })
                                }
                                return
                            }

                            if (pathname.endsWith('/diag')) {
                                append(`client: ${JSON.stringify(payload).slice(0, 1200)}`)
                                sendJson(res, 200, { ok: true })
                                return
                            }

                            sendJson(res, 404, { ok: false, error: 'unknown method' })
                        } catch (error) {
                            append(`host: route error ${error && error.message}`)
                            try {
                                sendJson(res, 500, { ok: false, error: 'internal' })
                            } catch {
                                /* ignore */
                            }
                        }
                    }
                }),
            'open-in-explorer: routes'
        )
        append('host: 路由已注册 /open-in-explorer/open + /reveal + /diag')
    } catch (error) {
        append(`host: 注册失败 ${error && error.message}`)
    }
}
/** 仅供本地自检/单元测试使用：不改插件行为。 */
export const __internals = { openWithDefaultApp, revealInFileManager, listSessionLogs, decodeSessionLog, extractDeliverables, toAbsolutePath, workspaceFromSessionDir }
