# -*- coding: utf-8 -*-
p = r"E:\Deepseek\妖市夜巡\需要核对的内容\《妖市夜巡》分镜脚本_导演3.0预设.md"
with open(p, encoding="utf-8") as f:
    lines = f.read().splitlines()
cut = None
for i, line in enumerate(lines):
    if line.strip().startswith("附：素材配置建议"):
        cut = i
        break
if cut is not None:
    keep = lines[:cut]
    while keep and keep[-1].strip() == "":
        keep.pop()
    with open(p, "w", encoding="utf-8") as f:
        f.write("\n".join(keep))
    print("cut at", cut)
else:
    print("not found")
