# Seedance 提示词导演 3.01 —— 跨机部署说明（便携包）

> 适用：把「Seedance 2.0 导演版 v3.01」Agent 预设安装到**另一台电脑**的 DSH 桌面版。
> 3.01 相对 3.0 的变化：① 段内镜头号改为**段号-镜号**（镜头1-1/1-2…，每段从 1 重新计数，便于定位）；② 「氛围和画质」大类统一归入**海外真人短剧写实摄影**风格组（50mm 标准人像定焦 + 院线电影柔和影棚柔光 + 8K 超高清画质细节拉满，按 风格核心/视觉基调/画质与细节/色彩与影调 四行归类）；③ 转换工具改为**随包安装的相对路径约定**（不再写死 E:\ / D:\ 盘符）；④ 彩色标记语法统一为 **`[[色|文字]]`**（规避 cordis 模板 `{{...}}` 占位符冲突），转换工具已**双语法兼容**（`[[红|]]` 与 `{{红|}}` 均可渲染）。

---

## 一、究竟需要安装多少个设置文件？（答案：1 个预设目录 + 3 处配置键 + 1 个模型凭据 + 3 个工具脚本）

| # | 类别 | 内容 | 数量 | 缺失后果 |
|---|---|---|---|---|
| 1 | **预设本体**（必须） | `agent-presets\seedance-prompter-v301\` 整个文件夹：`preset.yml`、`agent.cordis.yml`、`skills\seedance-camera\SKILL.md`、`skills\material-design\SKILL.md` | 1 个目录（4 文件） | 预设根本不存在，无法使用 |
| 2 | **DSH 配置挂载**（必须） | `settings.yaml` 中 3 处键：`agent-presets.default`、`agent-default-model`、`llm-pi-ai.providers.tt`（见 `settings-配置参考\`） | 3 处键 | 预设不生效，或跑在错误模型上（效果大降） |
| 3 | **模型凭据**（必须） | `TT_API_KEY` 环境变量（或 DSH 凭据管理里填 key） | 1 处 | 无法调用模型 / 回退默认模型 |
| 4 | **转换工具**（强烈建议） | `tools-转换工具\` 下 3 个脚本：`md2docx-multicolor.ps1`、`md2docx.ps1`、`gen-table-xlsx.ps1` → 安装到目标机工作区 `.tools\md2docx\` 与 `.tools\` | 3 个脚本 | 交付 .docx/.xlsx 失败，只能给 Markdown 文本 |
| 5 | **全局语言指令**（可选） | `AGENTS.md`（中文交流规则，放 DSH_HOME 根） | 1 文件 | 回复可能变英文，不影响生成效果 |

> **核心结论**：预设不是「1 个文件」的事——是 **1 预设目录 + 3 配置键 + 1 凭据 + 3 工具脚本** 的组合。只拷 persona 文本、只拷文件夹、或漏掉配置/凭据/工具中的任何一环，都会导致装完"效果不如预期"。

---

## 二、★ 一键安装（推荐）—— 双击 install.bat 即可

便携包内置一键安装器（`install.bat` / `install.ps1`），自动完成上面 5 步：

1. **解压**便携包到目标电脑任意目录；
2. **双击 `install.bat`**（或右键以 PowerShell 运行 `install.ps1`）；
3. 按提示输入 `TT_API_KEY`（回车可跳过、稍后手动配）；
4. 脚本自动完成：装预设（含 skills）→ 备份并智能合并 settings.yaml → 装工具脚本到工作区 `.tools\`；
5. 完全退出 DSH 再重开 → 新建会话选择「Seedance 2.0 导演版 v3.01」→ 用 skill 加载 seedance-camera 验证。

**智能合并策略（绝不破坏目标机既有配置）**：
- `settings.yaml` 先自动备份为 `settings.yaml.bak-时间戳`；
- `agent-presets.default` → 自动指向 v301（已有其他预设会覆盖为 v301）；
- `agent-default-model` / `llm-pi-ai` **已存在则不动**（保护目标机现有模型路由），仅缺失时补参考配置（baseURL 默认 `https://tbtk.asia/v1`，按实际中转修改）；
- 预设/工具**已存在则跳过**（可重复运行，幂等安全）。

可用参数（高级）：
```
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -DSHHome <路径> -Workspace <路径> -SkipKey -DryRun
```
`-DryRun` 只预览不写入；`-SkipKey` 跳过 Key 交互；`-DSHHome`/`-Workspace` 指定非默认路径。

---

## 三、手动安装步骤（5 步，原理同上，供排查时对照）

### 第 1 步：安装预设本体
把 `agent-presets\seedance-prompter-v301\` **整个文件夹**（含 skills\ 子目录）复制到目标电脑：

```
%APPDATA%\dsh-desktop\harness\.agent-presets\
```

> ⚠️ 必须连 `skills\` 子目录一起拷！`agent.cordis.yml` 靠相对路径解析预设自己的 `skills\`（seedance-camera 运镜库/语气库/模板、material-design 物料模板都在里面）。只拷 yml 不拷 skills = 知识库全丢 = 效果大变。

### 第 2 步：合并 DSH 配置（settings.yaml）
把 `settings-配置参考\settings.yaml.合并参考.txt` 里的 3 处配置合并进目标机 `%APPDATA%\dsh-desktop\harness\settings.yaml`：
- `llm-pi-ai.providers.tt`：模型中转站定义（baseURL 按新电脑实际地址修改）
- `agent-default-model`：默认模型路由（provider: tt / model: deepseek-v4-flash-0731）
- `agent-presets.default`：默认 Agent 预设指向 `seedance-prompter-v301`

### 第 3 步：配置模型凭据
`llm-pi-ai.providers.tt` 用的是 `apiKeyEnv: TT_API_KEY`，即 API Key 从**环境变量**读取：
- 控制面板 → 系统 → 高级系统设置 → 环境变量 → 新建 `TT_API_KEY` = 你的中转站 Key
- 或在 DSH 设置 → 模型提供商 里填写（效果等同）

> ⚠️ 模型与 Key 不对，是「装完效果不如预期」的头号原因：3.0 系列预设的提示词按 deepseek-v4-flash-0731 + 该中转的行为习惯调教，跑到别的模型/别的中转上，导演味会明显丢失。

### 第 4 步：安装转换工具（交付 .docx/.xlsx 用）
把 `tools-转换工具\` 里的 3 个脚本放到目标机工作区，保持目录结构：

```
<你的工作区>\.tools\md2docx\md2docx-multicolor.ps1   ← 分镜脚本彩色版
<你的工作区>\.tools\md2docx\md2docx.ps1             ← 分镜脚本普通版
<你的工作区>\.tools\gen-table-xlsx.ps1              ← 通用 xlsx 生成器（物料/服装表）
```

> 3.01 预设已改为按 `工作区\.tools\` 相对路径找工具，不再依赖 E:\Deepseek 或 D:\deepseek 固定盘符。
> 脚本已统一为 **UTF-8 with BOM** 编码——Windows PowerShell 5.1 读无 BOM 的 .ps1 会把中文读成乱码，这是跨机最容易踩的坑（本包已规避）。

### 第 5 步：重启并验证
1. 完全退出 DSH 桌面版再重开（settings.yaml 在启动时读取）；
2. 新建会话 → Agent 预设下拉选择 **Seedance 2.0 导演版 v3.01**（或保持 default，若你合并了 `agent-presets.default`）；
3. 会话里调用 `skill` 工具加载 `seedance-camera`，确认返回的是「3.01 分段式」模板；
4. 跑一个小样例（如 15 秒片段），确认 .docx 生成且带红/橙/绿/紫彩色排版、.xlsx 正常。

---

## 四、为什么以前打包后「效果不如预期」？—— 5 大根因排查表

| 根因 | 现象 | 本包对策 |
|---|---|---|
| 1. **模型/中转不同** | 语言风格、分镜深度、格式纪律全部漂移 | 3 配置键 + TT_API_KEY 一并打包并写明 |
| 2. **只拷 prompt 没拷 skills** | 运镜库/语气库/模板缺失，镜头描写退化 | 预设目录连 `skills\` 整包复制 |
| 3. **工具脚本绝对路径失效** | 交付 docx/xlsx 时报错或生成失败 | 3.01 改为随包 `.tools\` 相对约定，工具已附包内 |
| 4. **.ps1 中文乱码（无 BOM）** | 转换脚本中文全乱、直接失败 | 包内 3 个脚本已标准化为 UTF-8 BOM |
| 5. **settings.yaml 没合并** | 装了但默认仍指向旧预设/旧模型 | 提供 `settings.yaml.合并参考.txt`，一键对照 |

---

## 五、包内文件清单

```
seedance-prompter-v301-便携包\
├── install.bat                            ← ★ 一键安装入口（双击运行）
├── install.ps1                            ← 一键安装脚本本体（UTF-8 BOM）
├── README-部署说明.md                      ← 本文件
├── agent-presets\
│   └── seedance-prompter-v301\
│       ├── preset.yml                      ← 预设元信息（显示名 v3.01）
│       ├── agent.cordis.yml                ← 预设主体（persona 提示词 + skill 挂载 + 工具注册）
│       └── skills\
│           ├── seedance-camera\SKILL.md    ← Seedance 2.0 提示词知识库（v3.01 分段式模板）
│           └── material-design\SKILL.md    ← 物料设计知识库（人物/场景/服装表）
├── settings-配置参考\
│   └── settings.yaml.合并参考.txt          ← 3 处配置键的合并片段（不含密钥）
├── tools-转换工具\
│   ├── md2docx-multicolor.ps1              ← docx 彩色版（[[红|]] 新语法 + {{红|}} 旧语法 双兼容）
│   ├── md2docx.ps1                         ← docx 普通版（仅加粗）
│   └── gen-table-xlsx.ps1                  ← JSON→xlsx 通用生成器
└── 版本校验.sha256.txt                     ← 全部文件 SHA-256 校验
```

## 六、彩色标记语法（v3.01 起，装完必读）

分镜/物料 Markdown 里的彩色排版标记，**默认写法已改为双方括号**：

| 标记 | 颜色 | 用途 |
|---|---|---|
| `[[红\|文字]]` | 红色 C00000 | ⭐ 标星重点、吸睛开场、结尾钩子 |
| `[[橙\|文字]]` | 橙色 ED7D31 | 表演内容、钩子内容 |
| `[[绿\|文字]]` | 深绿 2E7D32 | 表演目的、勾子点 |
| `[[紫\|文字]]` | 紫色 7030A0 | 台词 / 对话（紫色加粗） |
| `[[蓝\|文字]]` | 蓝色 1F4E79 | 引用 / 提示词 |
| `**文字**` | 黑色加粗 | 一般强调 |

**为什么改成 `[[ ]]`**：`{{...}}` 与 DSH cordis 组态层的模板占位符（`{{model}}`、`{{cwd}}`）语法冲突，写在 `agent.cordis.yml` 的 persona 里有被模板引擎吞掉的风险，故统一迁移。

**兼容性**：`tools-转换工具\md2docx-multicolor.ps1` 已同时支持 `[[色|文字]]` 与 `{{色|文字}}` 两种写法（旧文档无需改写即可继续转换），并已验证五种颜色 + 粗体均正常渲染、无残留标记符号。若目标机使用旧版脚本（只认 `{{ }}`），会出现"颜色全部丢失"——**务必使用本包内的脚本**。

---

> 目标机 DSH 版本要求：与制作机同主版本（预设依赖 dsh-agent-presets 的 standing-scope 挂载机制与 tool-skill 工具，跨大版本前请先确认 GUI 里能正常加载本机现有预设）。
