#!/usr/bin/env node
/**
 * test-deliverables-route.mjs —— 本地自测：宿主半边的"交付清单"取数逻辑。
 * 直接调用插件宿主半的 __internals，验证能不能从会话日志里抽出交付文件。
 *
 * 用法：node test-deliverables-route.mjs [可选：会话日志路径]
 */
import fs from 'node:fs'
const mod = await import('file:///E:/Deepseek/_dsh-plugin/dsh-open-in-explorer/lib/index.js')
const { listSessionLogs, decodeSessionLog, extractDeliverables, toAbsolutePath, workspaceFromSessionDir } = mod.__internals

const explicit = process.argv[2]
let target = explicit
let ws = ''
if (!target) {
    const logs = listSessionLogs(5)
    if (logs.length === 0) { console.log('没有找到会话日志'); process.exit(1) }
    console.log('最近 5 个会话日志：')
    for (const l of logs) console.log('   ', l.sessionId, new Date(l.mtime).toISOString(), '-> 工作区', workspaceFromSessionDir(l.workspace || ''))
    target = logs[0].file
    ws = workspaceFromSessionDir(logs[0].workspace || '')
}
if (ws === '') ws = 'E:\\Deepseek'
console.log('目标日志：', target)
const text = decodeSessionLog(target)
console.log('解出文本：', text.length, '字符')
const items = extractDeliverables(text)
console.log('交付事件：', items.length, '条')
console.log('解析用工作区根：', ws)
for (const item of items) {
    console.log('  turn=' + item.turn, 'seq=' + item.seq, 'files=' + item.files.length)
    for (const f of item.files) {
        const abs = toAbsolutePath(f.path, ws)
        const exists = fs.existsSync(abs)
        console.log('      -', abs, abs === f.path ? '' : '（相对路径已解析）', exists ? '[存在]' : '[缺文件]', '|', f.description ?? '')
    }
}
