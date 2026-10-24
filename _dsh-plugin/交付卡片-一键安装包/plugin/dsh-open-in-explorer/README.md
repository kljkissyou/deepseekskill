# dsh-open-in-explorer

让 DSH Web GUI 的「交付文件」卡片**点开就是系统动作**，不再进右侧应用内预览：

| 你点的地方 | 结果 |
|---|---|
| 卡片空白处（整卡覆盖层） | **资源管理器定位该文件**（打开所在文件夹并选中） |
| 卡片上的「打开」按钮 | **用系统默认应用打开真实文件**（等同双击） |
| 卡片右侧 `⌄` → 用默认应用打开 | 用默认应用打开（官方链路，本插件宿主补丁修好 spawn 隐藏问题） |
| 卡片右侧 `⌄` → 在文件资源管理器中显示 / 打开所在文件夹 | 资源管理器定位（官方链路 + 本插件兜底） |
| 其它插件的 GUI 调起（如 better-sidebar 的「资源管理器」） | 由全局 spawn 补丁修好（见下） |

## 为什么需要它

两个本机故障叠加：

1. **官方卡片默认行为**：`@deepseek-ai/dsh-client-ui-deliverables` 的 `PresentedFileCard`
   把整张卡片铺了一层 `.cardPreview` 覆盖按钮，它的 `onClick` 固定是 `onPreview`
   （打开右侧预览）；split 里那颗写着「打开」的主按钮 `onClick` **也是** `onPreview`。
2. **GUI 启动器被隐藏窗口**：DSH Desktop 用 `windows-child-process-hide.mjs` 把
   「调用方没显式写 `windowsHide`」的 spawn 一律改成 `windowsHide: true`。
   `explorer.exe` 这类 GUI 启动器会因此进程起来了、接口返回成功，但**窗口永远不显示**。
   `dsh-better-sidebar` 的 `launchExternal()` 正是这种写法。

## 它做什么

**宿主半边（lib/index.js）**

- 全局把 `child_process.spawn` 包一层：只对已知 GUI 启动器
  （`explorer.exe` / `explorer` / `open` / `xdg-open`）显式补 `windowsHide: false`，
  其它命令一律不碰（对照实验见 `../ab-test.js`）。
- 提供两个动作路由（显式 `windowsHide: false`，绕开官方与 better-sidebar）：

```http
POST /open-in-explorer/open    { "path": "E:\\Deepseek\\某文件.xlsx" }   # explorer.exe <path>           默认应用打开
POST /open-in-explorer/reveal  { "path": "E:\\Deepseek\\某文件.xlsx" }   # explorer.exe /select,<path>   资源管理器定位
POST /open-in-explorer/diag    { ... }                                    # 现场诊断日志
```

- 免界面自检入口（重启 DSH 后浏览器直接打开）：

```
http://127.0.0.1:43129/open-in-explorer/test        定位测试文件
http://127.0.0.1:43129/open-in-explorer/test-open   默认应用打开测试文件
```

**客户端半边（lib/client.js）**

- 捕获阶段接管三处点击：整卡覆盖层 → reveal；split 的「打开」主按钮 → open；
  `⌄` 菜单里的「在文件资源管理器中显示 / 打开所在文件夹」→ reveal（菜单是 portal，
  用「最近点击的卡片 + 15 秒 + 420px」关联回来）。
- 卡内 `⌄` 按钮本身、以及「用默认应用打开」菜单项保持原样（官方链路，
  已经被上面的 spawn 补丁修好）。

## 类名依赖

卡片 DOM 类名带构建哈希前缀（如 `nyYjTG_open`），客户端按**键名**做子串匹配
（`button[class*="open"]`、`button[class*="cardPreview"]`、`[class*="split"]`），
并保留结构化兜底；DSH 大版本升级后若官方改了 DOM，请先看
`E:\Deepseek\_dsh-plugin\diag.log` 里的 `census` 记录（会报 cardCount / openButtonCount）。

## 部署（一键，需要你执行一次）

智能体的命令沙箱只能写工作区（`E:\Deepseek`），写不了 `DSH_HOME`，
所以最后一步由你跑：双击

```
E:\Deepseek\_dsh-plugin\deploy-open-in-explorer.cmd
```

等价命令：`node E:\Deepseek\_dsh-plugin\deploy-open-in-explorer.mjs`
（`--dry-run` 只看计划；`--dsh-home <目录>` 用于自测）。

脚本做四件事，全部幂等：**备份旧插件 → 整包复制到 `plugins-local\dsh-open-in-explorer`
→ 给 `profiles\web\cordis.patch.yml` 追加挂载行（已有则不重复加）→ 校验哈希 + YAML**。
回滚：`plugins-local\_backup-dsh-open-in-explorer-<时间戳>\` 与
`cordis.patch.yml.bak-before-openinexplorer-<时间戳>`。

## 依赖与生效

- 挂载：`profiles\web\cordis.patch.yml` 里 `- insert: { id: open-in-explorer, name: dsh-open-in-explorer }`，
  包体在 `DSH_HOME\plugins-local\dsh-open-in-explorer`。
- **改完必须重启 DSH Desktop 才生效**（宿主半边在启动时加载，客户端脚本在页面加载时注入）。
- 改动后自检：`node _dsh-plugin/verify-spawn-patch.mjs`、`node _dsh-plugin/validate.js`。