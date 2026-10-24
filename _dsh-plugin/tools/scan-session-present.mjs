#!/usr/bin/env node
/**
 * scan-session-present.mjs —— 按 zstd 多帧拆解 DSH 会话日志，检查 present 调用是否落盘。
 * 用途：判断"交付卡片"的数据到底是持久化在会话日志里（刷新后能回放），
 *      还是只存在于当前渲染内存里（刷新即消失）。
 *
 * 用法：node scan-session-present.mjs <session.v3.jsonl.zstd>
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

const file = process.argv[2]
if (!file) { console.log('用法：node scan-session-present.mjs <session.v3.jsonl.zstd>'); process.exit(1) }

const buf = fs.readFileSync(file)
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const starts = []
for (let i = 0; i + 4 <= buf.length; i += 1) {
    if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) starts.push(i)
}
starts.push(buf.length)

let text = ''
let frames = 0
let failed = 0
for (let i = 0; i < starts.length - 1; i += 1) {
    const frame = buf.subarray(starts[i], starts[i + 1])
    try {
        text += zlib.zstdDecompressSync(frame).toString('utf8')
        frames += 1
    } catch { failed += 1 }
}

console.log(`文件           : ${file}`)
console.log(`总字节         : ${buf.length}`)
console.log(`zstd 帧        : ${frames} 帧解出，${failed} 帧失败`)
console.log(`解出文本       : ${text.length} 字符`)
console.log(`含 "present"   : ${(text.match(/present/g) || []).length} 处`)
console.log(`含 present 工具调用: ${(text.match(/"name"\s*:\s*"present"/g) || []).length} 处`)
console.log(`含 presented_file / deliverable 字段: ${(text.match(/presented_file|deliverable/gi) || []).length} 处`)

const idx = []
let at = text.indexOf('"name":"present"')
while (at >= 0 && idx.length < 5) { idx.push(at); at = text.indexOf('"name":"present"', at + 1) }
if (!idx.length) {
    at = text.indexOf('present')
    while (at >= 0 && idx.length < 5) { idx.push(at); at = text.indexOf('present', at + 1) }
}
for (const i of idx) {
    const s = Math.max(0, i - 150)
    console.log('--- 片段 ---')
    console.log(text.slice(s, i + 250).replace(/\s+/g, ' '))
}
