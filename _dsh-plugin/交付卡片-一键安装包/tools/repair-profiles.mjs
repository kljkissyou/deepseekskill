#!/usr/bin/env node
/**
 * repair-profiles.mjs —— 把被旧版安装脚本误改的 profile patch 还原成"未被我们碰过"的样子。
 *
 * 背景：旧版脚本对内容为空数组 `[]` 的 profile（safe-mode、历史备份 profile）也做了追加，
 * 结果 `[]` 之后跟着条目 → YAML 非法。本脚本把"我们追加过的块"整段删掉，
 * 让文件回到原来的注释 + `[]`。
 *
 * 用法：node repair-profiles.mjs <cordis.patch.yml 列表…>
 */
import fs from 'node:fs'
import path from 'node:path'

const files = process.argv.slice(2)
if (!files.length) {
    console.log('用法：node repair-profiles.mjs <cordis.patch.yml> [更多文件…]')
    process.exit(1)
}

const OUR_COMMENT = /^#\s*---\s*(交付卡片|交付文件卡片)/
let fixed = 0

for (const p of files) {
    if (!fs.existsSync(p)) { console.log(`  [--] 不存在，跳过：${p}`); continue }
    const text = fs.readFileSync(p, 'utf8')
    const eol = text.includes('\r\n') ? '\r\n' : '\n'
    const lines = text.split(/\r?\n/)
    const out = []
    let removed = 0
    for (let i = 0; i < lines.length; i += 1) {
        if (OUR_COMMENT.test(lines[i])) {
            // 连同后面的 - insert: 块（3 行）一起跳过
            let j = i + 1
            let sawInsert = false
            while (j < lines.length) {
                const t = lines[j]
                if (t.trim().startsWith('- insert:')) { sawInsert = true; j += 1; continue }
                if (sawInsert && /^\s+\S/.test(t)) { j += 1; continue }
                break
            }
            i = j - 1
            removed += 1
            continue
        }
        out.push(lines[i])
    }
    if (!removed) { console.log(`  [--] 没有我们追加的块：${path.basename(path.dirname(p))}`); continue }
    const cleaned = out.join(eol).replace(/(\r?\n){3,}/g, eol + eol).trimEnd() + eol
    fs.copyFileSync(p, `${p}.bak-repair-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`)
    fs.writeFileSync(p, cleaned, 'utf8')
    console.log(`  [OK] 已还原（移除 ${removed} 个追加块）：${path.basename(path.dirname(p))}`)
    fixed += 1
}
console.log(fixed ? `处理完成：${fixed} 个文件` : '没有需要处理的文件')
