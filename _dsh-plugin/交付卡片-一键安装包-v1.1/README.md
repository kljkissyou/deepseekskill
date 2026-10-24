# 交付卡片 · 一键安装包 v1.1

> 目标：**以后所有需要交付的文件，都自动生成"交付卡片"**（文件图标 + 说明 + 「打开」按钮 + ⌄ 菜单），
> 并且**换一台电脑、换一个账号也能一键装起来**。
> 适用：DSH Desktop（Windows）。装完必须**完整退出并重新启动 DSH Desktop**。

---

## 一、先搞清楚：卡片不是"一个插件"，而是三层拼出来的

| 层次 | 由谁提供 | 默认状态 | 需要做什么 |
| --- | --- | --- | --- |
| **① 卡片行本体**（present 工具 + 交付文件卡片 UI + 打开/定位菜单） | DSH 内置：`@deepseek-ai/dsh-tool-present`（宿主侧）+ `@deepseek-ai/dsh-client-ui-deliverables`（界面侧） | 界面侧随应用包**默认就有**；宿主侧 `tool-present` **默认没挂载** | 在该机器的 profile（`profiles/*/cordis.patch.yml`）里**插入一条挂载** |
| **② 「打开」的真实行为** | 本安装包携带的本地插件 `dsh-open-in-explorer` | 默认「打开」= **开侧边栏预览** | 装插件 + 挂载 + 完整重启（插件内含 explorer.exe 的 spawn 补丁） |
| **③ agent 侧"每次都生成卡片"** | `present` 工具 + **全局指令约定** | 模型有时会忘记声明交付件 | 安装包会往 `<DSH_HOME>/AGENTS.md` 追加「交付文件卡片」约定段落（带标记，可安全重复安装/卸载） |

**结论**：不需要新造一个渲染卡片的插件（那部分是 DSH 自带的）；需要的是把上面三层**打包成一键安装/卸载**——这就是本包干的事。

> 装了本包之后：卡片上点「打开」= 用系统默认应用打开真实文件；点 ⌄ 菜单「在文件资源管理器中显示」= 打开资源管理器并选中该文件。

---

## 二、安装（每台电脑一次）

1. 把整个文件夹拷到目标电脑（任意位置，U 盘也行）。
2. **完全退出 DSH Desktop**（含托盘）。
3. 双击 **`安装.cmd`**（不需要管理员权限，不会弹 UAC）。
4. 看输出：出现 `结果：全部通过 ✅` 即成功。
5. **重新启动 DSH Desktop**（宿主半边只在启动时加载；不重启等于没装）。

安装脚本是**幂等**的：重复运行不会重复加挂载行、插件文件哈希一致时也不会重复备份复制。

### 命令行用法（可选）

```bat
REM 只看计划，不写任何文件
node install.mjs --dry-run

REM 只体检（挂载状态 / 插件哈希 / 全局约定 / 插件日志末尾 / 两个自测端点）
node install.mjs --check

REM 指定 DSH_HOME（默认自动探测，见第四节）
node install.mjs --dsh-home "D:\某目录\dsh"

REM 卸载（连插件目录一起删）
node install.mjs --uninstall --purge
```

---

## 三、装完怎么验证

| 验证项 | 怎么做 | 期望 |
| --- | --- | --- |
| 挂载与文件 | `node install.mjs --check` | 全绿：`tool-present 已启用` + `open-in-explorer 已启用` |
| 打开真实文件 | 浏览器开 `http://127.0.0.1:43129/open-in-explorer/test-open` | 系统默认应用弹出，打开一个测试文本文件 |
| 资源管理器定位 | 浏览器开 `http://127.0.0.1:43129/open-in-explorer/test` | 资源管理器打开并选中该测试文件 |
| 卡片实际渲染 | 让 agent 交付一个文件，看回合末尾 | 出现「交付文件卡片」：文件图标 + 说明 + 「打开」 |
| 插件日志 | `<DSH_HOME>\logs\open-in-explorer.log` 里的 `census` 行 | `cardCount / openButtonCount` 都 > 0 |

`census` 行含义：页面每次加载扫一次卡片 DOM，`cardCount:0, openButtonCount:0` = **那一页没有渲染出交付卡片**（不是插件坏了）。

---

## 四、跨机注意事项（v1.1 重点修复的地方）

1. **DSH_HOME 自动探测（已修）**
   顺序：环境变量 `DSH_HOME` → `~/.dsh` → `%APPDATA%\dsh-desktop\harness` → `%LOCALAPPDATA%\dsh-desktop\harness`。
   取第一个**存在 `profiles` 子目录**的路径。
   注意 `~/.dsh` 必须排第二：新版 DSH Desktop 用 `~/.dsh`，而旧版安装包找的是 `%APPDATA%\dsh-desktop\harness`，
   在全新机器上这个目录不存在，旧版会装到黑窟窿里。
   也可以用 `--dsh-home` 显式指定；探测到的路径会打印在输出第一行，装前先看一眼。
2. **Node.js**：`安装.cmd` 依次找 PATH 里的 `node`、`%ProgramFiles%\nodejs\node.exe`、
   DSH 应用包内自带的 node（含 Visual Studio 版路径）。找不到会给出明确提示并退出（不会半装）。
3. **插件日志位置（已修）**：写入 `<DSH_HOME>/logs/open-in-explorer.log`，安装时打印绝对路径。
   旧版硬编码 `~/.dsh/logs/...`，非默认布局下日志丢失、排障时看不到任何线索。
4. **多 profile**：默认**只动活动 profile**（`profiles\web` 等），自动跳过
   `safe-mode`、`*.bak-*`、`*.broken-*`、`*_bad`、`*.generations` 这类目录——它们要么是历史残留，要么明确写着"刻意省略第三方 bundle"。
   需要全部处理加 `--all-profiles`。
   另外：patch 文件为空文档 `[]` 的 profile，脚本会把 `[]` **替换**成挂载条目而不是追加（在 `[]` 后面追加会让 YAML 非法）。
5. **YAML 校验（已修）**：优先在 profile 的 `node_modules` 里找 `js-yaml` 真解析一遍；
   找不到就退回结构性校验（括号配平 + 每条记录是 `- insert:` 块）。
   校验失败会打印具体原因（行号级），不会"装了个坏的配置还以为成功"。
6. **平台差异**：`dsh-open-in-explorer` 目前是 **Windows 专用**（内部调用 `explorer.exe <path>` / `explorer.exe /select,<path>`）。
   macOS/Linux 上装本包仍可让卡片出现（第③层与 tool-present 挂载与平台无关），但「打开」按钮需另写平台分支。
7. **不联网**：`dsh-tool-present` 与卡片界面随 DSH 应用包分发，本包不 npm install、不回连任何服务。

---

## 五、回滚 / 卸载

```bat
卸载.cmd             REM 移除两条挂载 + AGENTS.md 里的约定段落（插件目录保留）
卸载.cmd --purge     REM 连插件目录一起删
```

- 卸载前**自动备份**成 `*.bak-deliverycards-uninstall-*`，需要时改名还原即可。
- 若某个 profile 原来就是空文档 `[]`，卸载会**还原成 `[]`**（不会留下空文件或错误缩进）。
- 只删本包写入的内容：挂载块按块删除，AGENTS.md 按 `<!-- dsh-delivery-cards:begin/end -->` 标记整段删除，人工内容不受影响。

---

## 六、常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 交付后**完全没有**卡片 | ①`tool-present` 没挂载；②agent 这轮没调用 `present`；③装完没重启；④页面没刷新 | `安装.cmd --check`（`卸载.cmd --check` 也可以）→ Ctrl+R → 仍无则完整重启 |
| 卡片有了，但「打开」只开侧边栏预览 | `open-in-explorer` 挂载缺失或装完没重启 | 重跑 `安装.cmd` → 完整重启 |
| 卡片里混进备份/说明等杂物 | agent 把非交付件也 `present` 了 | AGENTS.md 约定里已明确禁止；对话里补一句"只挂成品" |
| 点了「打开」窗口不弹 | DSH 的 `windowsHide` 强制隐藏 | 插件里的 spawn 补丁已处理；确认插件已装 + 已重启 |
| 日志文件不存在 | 说明插件没被加载（或 DSH_HOME 装错了） | `--check` 看「日志」那行；先确认输出里的 DSH_HOME 对不对 |
| 想确认"卡片没渲染"还是"插件坏了" | 看日志 `census` 行 | `cardCount=0` = 卡片没渲染；`cardCount>0` 但 `openButtonCount=0` = 拦截失效（DSH 大版本升级后类名哈希变了，需重新对选择器） |
| 装完 `--check` 报 YAML 解析失败 | patch 文件被改坏 | 从同名 `*.bak-deliverycards-*` 备份还原，再重装；或把该 profile 的 `cordis.patch.yml` 改回 `[]` 再装 |

---

## 七、本包包含什么

```
交付卡片-一键安装包v1.1\
├─ 安装.cmd                      ← 双击安装（负责找 Node 后调 install.mjs）
├─ 卸载.cmd                      ← 双击卸载
├─ install.mjs                   ← 安装/卸载/体检/校验逻辑（幂等、自动备份、YAML 校验）
├─ agent-instruction-block.md    ← 会被追加到 <DSH_HOME>\AGENTS.md 的约定段落（可先审阅）
├─ tools\find-node.ps1           ← cmd 用：跨机器找可用的 node.exe
├─ tools\repair-profiles.mjs     ← 备用：批量修复历史残留 profile（safe-mode / bak）
└─ plugin\dsh-open-in-explorer\  ← 本地插件整包（打开真实文件 / 资源管理器定位 + spawn 补丁）
    ├─ package.json / dsh.plugin.json / cordis.patch.yml
    └─ lib\{index.js, client.js}
```

*版本：v1.1（在首发版基础上修了 4 个跨机坑：DSH_HOME 探测、日志路径、YAML 校验、空 profile 的 `[]` 处理；
卸载改为精确还原；cmd 脚本统一 CRLF + 边界括号。）*
