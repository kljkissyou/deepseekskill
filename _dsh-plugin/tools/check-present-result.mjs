#!/usr/bin/env node
/**
 * check-present-result.mjs —— 在会话日志里核对 present 的「工具结果」是否落盘。
 * 卡片行（ui-deliverables）是读会话日志里的 tool/result 事件渲染的，
 * 所以只要这里能查到 present 的结果事件，就说明"数据链"是通的，问题在渲染侧。
 *
 * 用法：node check-present-result.mjs <session.v3.jsonl.zstd>
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

const file = process.argv[2]
if (!file) { console.log('用法：node check-present-result.mjs <session.v3.jsonl.zstd>'); process.exit(1) }
const buf = fs.readFileSync(file)
const starts = []
for (let i = 0; i + 4 <= buf.length; i += 1) {
    if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) starts.push(i)
}
starts.push(buf.length)
let text = ''
for (let i = 0; i < starts.length - 1; i += 1) {
    try { text += zlib.zstdDecompressSync(buf.subarray(starts[i], starts[i + 1])).toString('utf8') } catch { /* skip */ }
}
const count = (re) => (text.match(re) || []).length
console.log('解出文本        :', text.length, '字符')
console.log('tool/call       :', count(/"type":"tool\/call"/g))
console.log('tool/result     :', count(/"type":"tool\/result"/g))
console.log('present 调用    :', count(/"name":"present"/g))
console.log('Presented 文本  :', count(/Presented /g))
console.log('presented 事件键:', count(/"presented[A-Za-z]*"/g))
console.log('turnBoundary    :', count(/turnBoundary/g))

// 找一条 tool/result 且带 Presented 的片段
const i = text.indexOf('Presented ')
if (i >= 0) {
    console.log('--- 含 "Presented" 的片段（前后各 400 字符）---')
    console.log(text.slice(Math.max(0, i - 400), i + 400).replace(/\s+/g, ' '))
} else {
    console.log('⚠️ 日志里没有 "Presented" 文本：present 的结果事件可能没落盘')
}
