# 交付卡片 · 一键安装包

> 目标：**以后所有需要交付的文件，都自动生成"交付卡片"**（文件图标 + 说明 + 「打开」按钮 + ⌄ 菜单），
> 并且**换一台电脑也能一键装起来**。
> 适用：DSH Desktop（Windows）。装完必须**完整退出并重新启动 DSH Desktop**。

---

## 一、先搞清楚：卡片不是"一个插件"，而是三层拼出来的

| 层次 | 由谁提供 | 默认状态 | 需要做什么 |
| --- | --- | --- | --- |
| **① 卡片行本体**（present 工具 + 交付文件卡片 UI + 打开/定位菜单） | DSH 内置：`@deepseek-ai/dsh-tool-present`（宿主侧）+ `@deepseek-ai/dsh-client-ui-deliverables`（界面侧） | 界面侧随应用包**默认就有**；宿主侧 `tool-present` **默认没挂载** | 在该机器的 profile（`profiles/*/cordis.patch.yml`）里**插入一条挂载** |
| **② 「打开」的真实行为** | 本安装包携带的本地插件 `dsh-open-in-explorer` | 默认「打开」= **开侧边栏预览** | 装插件 + 挂载 + 完整重启（插件内含 explorer.exe 的 spawn 补丁） |
| **③ agent 侧"每次都生成卡片"** | `present` 工具 + **全局指令约定** | 模型有时会忘记声明交付件 | 安装包会往 `DSH_HOME/AGENTS.md` 追加「交付文件卡片」约定段落 |

**结论**：不需要新造一个渲染卡片的插件（那部分是 DSH 自带的）；需要的是把上面三层**打包成一键安装/卸载**——这就是本包干的事。

> 装了本包之后：卡片上点「打开」= 用系统默认应用打开真实文件；点整张卡片或 ⌄ 菜单「在文件资源管理器中显示」= 打开资源管理器并选中该文件。

---

## 二、安装（每台电脑一次）

1. 把整个 `交付卡片-一键安装包` 文件夹拷到目标电脑（任意位置，U 盘也行）。
2. **完全退出 DSH Desktop**（托盘也要退）。
3. 双击 **`安装.cmd`**（不需要管理员权限）。
4. 看输出：出现 `结果：全部通过 ✅` 即成功。
5. **重新启动 DSH Desktop**（宿主半边只在启动时加载；不重启等于没装）。

安装脚本是**幂等**的：重复运行只会覆盖插件文件、不会重复加挂载行。

### 命令行用法（可选）

```bat
REM 只看计划，不写任何文件
node install.mjs --dry-run

REM 只体检（打印挂载状态 / 插件哈希 / 全局约定 / 插件日志末尾）
node install.mjs --check

REM 指定 DSH_HOME（默认自动探测 %DSH_HOME% 或 %APPDATA%\dsh-desktop\harness）
node install.mjs --dsh-home "D:\某目录\dsh-desktop\harness"
```

---

## 三、装完怎么验证

| 验证项 | 怎么做 | 期望 |
| --- | --- | --- |
| 挂载与文件 | `node install.mjs --check` | 全绿；`tool-present 已启用` + `open-in-explorer 已启用` |
| 打开真实文件 | 浏览器开 `http://127.0.0.1:43129/open-in-explorer/test-open` | 系统默认应用弹出打开测试文件 |
| 资源管理器定位 | 浏览器开 `http://127.0.0.1:43129/open-in-explorer/test` | 资源管理器打开并选中该文件 |
| 卡片实际渲染 | 让 agent 交付一个文件，看回合末尾先出现「交付文件卡片」 | 卡片数、按钮数见日志 |
| 插件日志 | `_dsh-plugin\diag.log` 里的 `census` 行 | `cardCount / previewCount / openButtonCount` 都 > 0 |

`census` 行含义：页面每次加载都会扫描一次卡片 DOM，`cardCount:0, openButtonCount:0` = **那一页没有渲染出交付卡片**（不是插件坏了）。

---

## 四、跨机注意事项

1. **Node.js**：脚本用 Node 运行（`安装.cmd` 会优先用 PATH 里的 `node`，其次找 DSH 应用包里的 node）。
   目标机完全没有 Node 时，先装 Node.js（或把 node 目录加进 PATH）。
2. **路径自动探测**：`DSH_HOME` 优先取环境变量，其次 `%APPDATA%\dsh-desktop\harness`、`%LOCALAPPDATA%\dsh-desktop\harness`；
   也可以显式 `--dsh-home` 指定。装错位置不会破坏任何东西（只会在那边新建文件）。
3. **多 profile**：默认**只动活动 profile**（`profiles\web` 等），并自动跳过
   `safe-mode`、`*.bak-*`、`*.broken-*`、`*_bad`、`*.generations` 这类目录——
   它们要么是历史残留，要么明确写着"刻意省略第三方 bundle"。
   确实需要全部处理时加 `--all-profiles`。
   另外：patch 文件为空文档 `[]` 的 profile（常见于从未改过的 profile），脚本会把 `[]`
   **替换**成挂载条目而不是在其后追加（在 `[]` 之后追加会让 YAML 非法）。
4. **平台差异**：`dsh-open-in-explorer` 目前是 **Windows 专用**（内部调用 `explorer.exe <path>` / `explorer.exe /select,<path>`）。
   macOS/Linux 上装本包仍可让卡片出现（①②层之外的第③层与 tool-present 挂载与平台无关），但「打开」按钮需另写平台分支。
5. **不需要联网**：`dsh-tool-present` 与卡片界面都随 DSH 应用包分发（本机版本 `0.1.5-rc.2`），本包不回连 npm。

---

## 五、回滚 / 卸载

```bat
卸载.cmd            REM 移除两条挂载 + AGENTS.md 里的约定段落（插件目录保留）
卸载.cmd --purge    REM 连插件目录一起删
```

卸载前会**自动备份**成 `*.bak-deliverycards-*` / `*.bak-deliverycards-uninstall-*`，需要时直接改名还原即可。

---

## 六、常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 交付后**完全没有**卡片 | ①`tool-present` 没挂载；②agent 这一轮没调用 `present`；③装完没重启；④页面没刷新 | 先 `--check`，再 Ctrl+R 刷新页面，仍无则完整重启 DSH |
| 卡片有了，但「打开」只开侧边栏预览 | `open-in-explorer` 挂载缺失，或装完没重启 | 重跑 `安装.cmd` → 完整重启 |
| 卡片里混进了备份/说明等杂物 | agent 把非交付件也 `present` 了 | 已在 AGENTS.md 约定里明确禁止；你也可以在对话里说"只挂成品" |
| 点了「打开」窗口不弹 | DSH 的 `windowsHide` 强制隐藏 | 本插件的 spawn 补丁已处理；确认插件已装且已重启 |
| 想确认是"卡片没渲染"还是"插件坏了" | 看 `diag.log` 的 `census` 行 | `cardCount=0` = 卡片没渲染；`cardCount>0` 但 `openButtonCount=0` = 按钮拦截失效（DSH 大版本升级后类名哈希变了，需要重新对选择器） |

---

## 七、本包包含什么

```
交付卡片-一键安装包\
├─ 安装.cmd                      ← 双击安装
├─ 卸载.cmd                      ← 双击卸载
├─ install.mjs                   ← 安装/卸载/体检逻辑（幂等、自动备份、YAML 校验）
├─ agent-instruction-block.md    ← 会被追加到 DSH_HOME\AGENTS.md 的约定段落（可先审阅）
└─ plugin\dsh-open-in-explorer\  ← 本地插件整包（打开真实文件 / 资源管理器定位 + spawn 补丁）
```

*版本：2026-09-24 首发（对应 DSH 应用包 `0.1.5-rc.2` 的 tool-present / client-ui-deliverables）。*
