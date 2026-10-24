# -*- coding: utf-8 -*-
import re, io

src = r"E:\Deepseek\妖市夜巡\需要核对的内容\《妖市夜巡》分镜脚本_精修版.md"
dst = r"E:\Deepseek\妖市夜巡\需要核对的内容\《妖市夜巡》分镜脚本_导演3.0预设.md"

with io.open(src, "r", encoding="utf-8") as f:
    lines = f.read().splitlines()

seg_idx = []
for i, line in enumerate(lines):
    if re.match(r'^第[一二三四五六七八九十]+段', line.strip()):
        seg_idx.append(i)
seg_idx.append(len(lines))

header = r'''# 《妖市夜巡》第一集《吃梦妖》· 前3分钟 · 分镜脚本（3.0 导演版·分段式）

> **Seedance 2.0 / 提示词导演 3.0（妖市夜巡导演版）** · 版式参考《百万合同妻子》第11集 3.01 导演版
> **分段规则**：每次「第一大类：基础设定」重新开始 = 一个新的 15 秒 AI 生成分段；每一段都是自包含的完整提示词（基础设定 + 氛围画质 + 画面叙述），可单独复制生成；段内镜头重新编号（镜头 1/2/3…），段尾段首同景接镜。
> **内容范围**：场 1-1 她不记得母亲 / 场 1-2 嘴边有雾的小妖 / 场 1-3 彩线验梦
> **画幅**：16:9 横屏 · 1920×1080 · 24fps
> **v3.0 排版配色**：⭐ 标星标记文字标红；表演/钩子内容标橙；表演目的/勾子点标深绿；台词/对话用紫色加粗。

---

## 元信息卡

| 项 | 内容 |
|---|---|
| 片名 | 《妖市夜巡》第一集·吃梦妖（前 3 分钟） |
| 题材 | 东方暗黑奇幻 / 悬疑探案 / 人妖共治市集 |
| 风格 | 东方暗黑奇幻 · 超写实真人实景拍摄 · 冷青夜色 × 暖红灯笼对撞 |
| 台词语言 | 中文（保留原稿台词，逐字不改） |
| 分段 | 16 个 15 秒生成段（每段自包含完整提示词），共 78 镜头 |
| 总时长 | 约 03:33（分段估算合计）；成片剪辑目标约 03:15 |
| 画面 | 16:9 横屏 · 1920×1080 · 24fps，8K 超清、60 帧动态、轻微胶片颗粒 |
| 节奏 | 东门异象→追梦雾→验梦反转→真凶混入人群 |

## 连续性锁定（全片一致性锚点）

- 妖市东门：青砖牌楼、两层摊位、暖红灯笼、湿润石板路。
- 纪临夜（主体1）：二十八岁左右，束黑发，黑灰夜巡袍，暗红护甲，佩刀与镇妖索；行动利落，先救人再查案。
- 阿满（主体2）：十八岁左右，杏色短衫、青绿色围裙，糖画摊少女。
- 沈万筹（主体3）：四十五岁左右，靛蓝旧长衫，神情克制沉重，袖中藏「万民请神书」。
- 绛绡（主体4）：年轻女妖探员，暗红衣裙、红绸随身，指尖可抽取情丝。
- 团团（主体5）：猫崽大小，奶白绒毛、耷耳、歪角、红色灯芯尾，腹部三盏灯只亮一盏。
- 情丝颜色规则（不可变更）：金色=被珍惜｜蓝色=遗憾｜灰色=主人亲手放弃。
- 魇砂：凶手强行吃幸福记忆时留下的黑色晶砂，一粒一粒。

## 素材配置策略（重要素材前置）

| 序号 | 功能 | 内容 | 优先级 |
|---|---|---|---|
| 图片1 | 角色定妆 | 纪临夜 大头照（无表情）+ 全身照 | ★★★ 最前 |
| 图片2 | 角色定妆 | 阿满 大头照 + 全身照 | ★★★ 最前 |
| 图片3 | 角色定妆 | 沈万筹 大头照（靛蓝旧长衫） | ★★ |
| 图片4 | 角色定妆 | 绛绡 大头照（含红绸元素全身） | ★★ |
| 图片5 | 角色定妆 | 团团 参考图（奶白绒毛+耷耳+歪角+红色灯芯尾+腹部三盏灯仅一盏亮） | ★★★ 最前 |
| 图片6 | 场景定调 | 妖市东门/百面街 场景图（冷暖对撞） | ★★ |
| 图片7 | 场景定调 | 丝衣铺 场景图（织机+布匹+油灯） | ★★ |
| 音频1 | 音色参考 | 绛绡 音色参考（年轻女性、慵懒带笑、尾音上翘、声线柔中带韧） | 中 |

> 若素材位受限：优先保留人物定妆图（图片1/2/3/4/5），场景可用文字锚点；团团可文生视频首帧直出。

## 断句说明（气口规则）

1. `/` 为短句换气；`//` 为长停顿换气。
2. 中文台词按 4 字/秒、OS/旁白按 5 字/秒估算；单镜 ≤4s，每段 ≤15s。
3. 排版配色（v3.0）：⭐标星文字红、表演/钩子内容橙、表演目的/勾子点深绿、台词对话紫色加粗。

---

'''

def clean_bullet(st):
    return re.sub(r'^•\s*', '', st).strip()

def convert_marker_line(st):
    s = clean_bullet(st)
    m = re.match(r'^(【吸睛开场】|【结尾钩子】)⭐?\s*(.*)$', s)
    if m:
        kind = m.group(1)
        body = m.group(2).strip()
        parts = re.split(r'[，,]\s*(?:勾子|钩子)[：:]\s*', body, maxsplit=1)
        if len(parts) == 2:
            content, hook = parts
        else:
            parts = re.split(r'——\s*(?:勾子|钩子)[：:]\s*', body, maxsplit=1)
            if len(parts) == 2:
                content, hook = parts
            else:
                content, hook = body, ''
        if hook:
            return f'=={kind}⭐==：{{{{{content.strip()}}}}}，%%勾子点：{hook.strip()}%%'
        return f'=={kind}⭐==：{{{{{content.strip()}}}}}'
    m = re.match(r'^(【重点表演】)⭐?\s*(.*)$', s)
    if m:
        body = m.group(2).strip()
        body = re.sub(r'^重点表演\s*', '', body)
        parts = re.split(r'[，,]\s*表演目的[：:]\s*', body, maxsplit=1)
        if len(parts) == 2:
            perf, purpose = parts
            return f'==【重点表演】⭐== {{{{ {perf.strip()} }}}}，%%表演目的：{purpose.strip()}%%'
        return f'==【重点表演】⭐== {{{{ {body} }}}}'
    return None

def convert_special_note(st):
    s = clean_bullet(st)
    if s.startswith('【重点】'):
        return '> ' + s
    return None

bodies = []
for si in range(len(seg_idx)-1):
    block = lines[seg_idx[si]:seg_idx[si+1]]
    title = block[0].strip()
    m = re.match(r'^第([一二三四五六七八九十]+)段\s*(.*?)（(.*?)·.*?约(\d+)s）$', title)
    if m:
        subtitle = m.group(2).strip()
        duration = int(m.group(4))
    else:
        m2 = re.match(r'^第([一二三四五六七八九十]+)段\s*(.*)$', title)
        subtitle = m2.group(2) if m2 else ''
        duration = ''
    out = [f'# 段 {si+1} ｜ {subtitle}（约 {duration}s）\n']
    shot_counter = 0
    for raw in block[1:]:
        st = raw.strip()
        if not st:
            continue
        if st.startswith('①'):
            out.append('\n## 第一大类：基础设定\n')
            continue
        if st.startswith('②'):
            out.append('\n## 第二大类：氛围和画质\n')
            continue
        if st.startswith('③'):
            out.append(f'\n## 第三大类：画面叙述（分镜头脚本，本段约 {duration}s）\n')
            continue
        mshot = re.match(r'^镜头\s*(\d+)\s*[-－—]\s*(\d+)\s*[|｜]\s*(.*)$', st)
        if mshot:
            shot_counter += 1
            out.append(f'\n#### 镜头 {shot_counter}\n')
            continue
        marker = convert_marker_line(st)
        if marker:
            out.append(marker + '\n')
            continue
        note = convert_special_note(st)
        if note:
            out.append(note + '\n')
            continue
        if st.startswith('• 时长估算：'):
            out.append('**预估表演时长**：' + re.sub(r'^•\s*时长估算：\s*约?', '', st) + '\n')
            continue
        if st.startswith('• 景别：'):
            out.append('**景别**：' + st[len('• 景别：'):] + '\n')
            continue
        if st.startswith('• 运镜：'):
            out.append('**运镜**：' + st[len('• 运镜：'):] + '\n')
            continue
        if st.startswith('• 画面内容：'):
            out.append('**画面内容**：' + st[len('• 画面内容：'):] + '\n')
            continue
        if st.startswith('• 角色台词：'):
            out.append('**角色台词**：' + st[len('• 角色台词：'):] + '\n')
            continue
        if st.startswith('• 音效：'):
            out.append('**音效**：' + st[len('• 音效：'):] + '\n')
            continue
        if st.startswith('• 特效：'):
            out.append('**特效**：' + st[len('• 特效：'):] + '\n')
            continue
        if st.startswith('•'):
            out.append('- ' + clean_bullet(st) + '\n')
            continue
        out.append(st + '\n')
    text = re.sub(r'\n{3,}', '\n\n', ''.join(out))
    bodies.append(text)

with io.open(dst, "w", encoding="utf-8") as f:
    f.write(header)
    for i, b in enumerate(bodies):
        if i > 0:
            f.write('\n---\n\n')
        f.write(b)

print("Saved", dst, "segments", len(bodies))
