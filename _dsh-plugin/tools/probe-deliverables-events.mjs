#!/usr/bin/env node
/**
 * probe-deliverables-events.mjs —— 会话日志里到底有哪些"交付相关"事件？
 * 用于决定方案 B 的取数方式（deliverables/presented 事件 vs present 工具调用+结果）。
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

const file = process.argv[2]
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
console.log('deliverables/presented 事件 :', count(/"type":"deliverables\/presented"/g))
console.log('present 工具调用            :', count(/"name":"present"/g))
console.log('surfaceOp:append            :', count(/"surfaceOp":"append"/g))
console.log('turn/start                  :', count(/"type":"turn\/start"/g))
console.log('所有事件类型（去重）        :')
const types = {}
for (const m of text.matchAll(/"type":"([a-z]+\/[a-z\-]+)"/g)) types[m[1]] = (types[m[1]] || 0) + 1
for (const [k, v] of Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log('   ', k, v)
