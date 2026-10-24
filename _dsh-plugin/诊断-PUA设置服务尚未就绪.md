# 诊断：PUA 设置卡片显示「PUA 设置服务尚未就绪」

> 时间：2026-10-11 ｜ 宿主：DSH Desktop 内置 dsh **0.2.0-rc.2**（win32 x64，Node v24.17.0）
> 现象：插件列表 → `PUA 配置 v0.3.25 @michengai/dsh-pua` 卡片，开关下方红字「PUA 设置服务尚未就绪。 重新读取配置」

---

## 〇、01:05 复查（用户问「能用了吗」时的最新状态）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 宿主是否重启过 | ❌ 没有 | `running\web.json` 仍为 `"pid": 25532` / `"startedAt": "2026-10-10T16:27:58.304Z"`；日志最后一条启动仍是行 9681（16:27:59Z）`dsh web: http://127.0.0.1:43129/?token=…` |
| 最新一次启动的 pending 项 | 只有 dsh-schedule | 行 9680 `[loader] still waiting for 1 plugin entries after 6s: @deepseek-ai/dsh-schedule (schedule)` |
| 日志里 PUA 自己的记录 | **0 条** | 全文 grep `michengai` 只命中**另一个** MichengAI 插件（`@michengai/dsh-skills-manager` 的 peerDependencies 兼容性告警）；`dsh-pua` 既没加载失败、也没报错 |
| 会话级 PUA | ✅ 正常 | 本次提问就是经 `/pua` 提交的，且 PUA 的指令段已注入当前会话 ⇒ 插件主体活着、命令通道可用 |
| 全局设置卡片 | ⚠️ 大概率仍是红字 | 未重启 ⇒ 除非点过「重新读取配置」并已自愈（界面状态无法从文件侧读取） |

⇒ 结论不变：**「插件活着」≠「报告的问题已修」**。唯一的判定标准是那张卡片上的红字有没有变成可点的开关。

---

## 一、结论（机制层，均有逐行证据）

1. **这句话不是 DSH 报的，是 PUA 插件自己抛的。**
   唯一出处：`...\profiles\web\node_modules\.pnpm\@michengai+dsh-pua@0.3.25_*\/node_modules\@michengai\dsh-pua\lib\remote.js:85`

   ```js
   const settings = this.ctx.get('settings');
   const descriptor = settings?.describe().find(item => item.ns === SETTINGS_NAMESPACE);
   if (settings && !descriptor) throw new Error('PUA 设置服务尚未就绪。');
   ```

   `SETTINGS_NAMESPACE = 'michengai-pua'`（`lib/settings.js:4`）。
   触发条件：**宿主 settings 服务存在，但它的 `describe()` 列表里没有 `michengai-pua` 这个命名空间。**

2. **宿主 0.2.0-rc.2 的 settings 已经没有老的 `register(ns, schema)` 了**，命名空间改为「由插件导出的 `Config` 派生」。
   证据：`%APPDATA%\dsh-desktop\logs\harness.log`

   ```
   [harness-log] warn dsh-market: this host's settings service has no register()
   (dsh 0.1.7 derives settings from a plugin Config schema); the market keeps its composed
   configuration and shows no allowRestart switch on this host yet (#677)
   ```

   以及 app.asar 内 `@deepseek-ai/dsh-settings` 的 `describe()`：

   ```js
   if (schema === void 0 || entry.fiber === void 0 || entry.fiber.runtime === null
       || entry.fiber.state !== 2 /* FiberState.ACTIVE */) return [];   // ← 跳过该 entry
   ...
   this.revisions.set(entry.id, { raw, revision, ns: entry.options.id, autoGenerate });
   ```

   ⇒ 命名空间 `ns` = **loader entry 的 id**；`schema` = **该 entry 插件模块导出的 `Config`**；
   只要「schema 取不到 / entry 没有 fiber / runtime 为 null / fiber 不是 ACTIVE」四条里中任意一条，这个 entry 就**不进 describe() 列表**。

3. **命名空间名字本身没问题。** PUA 自带的 loader patch（包内 `cordis.patch.yml`）就是：

   ```yaml
   - insert:
       - id: michengai-pua-remote
         name: '@michengai/dsh-pua/remote'
       - id: michengai-pua          # ← 与 SETTINGS_NAMESPACE 字面一致
         name: '@michengai/dsh-pua'
   ```

   PUA 也按新 API 写了 volatile 分支（`lib/settings.js` 内 `settings.configure({ auto: false }, ctx.fiber)`），
   并且 `package.json` 声明支持到 `0.2.0-rc.2`（CHANGELOG 0.3.20 起）。

4. **所以事实是：宿主没把 `michengai-pua` 这条 entry 收录进 settings 命名空间**，于是卡片上的全局开关读不到、也写不了。

---

## 二、可能的具体原因（按可能性排序，尚未实测分辨）

| # | 原因 | 判断依据 |
|---|---|---|
| ① | **启动/热重载竞态**：`describe()` 是快照，entry 重建的那个窗口里它被跳过 | 点「重新读取配置」或等 4 秒（客户端本来就在轮询）若能自愈，就是这条 |
| ② | **`fiber.runtime.Config` 在宿主侧取不到**（模块导出折叠 / 版本间派生机制有偏差） | PUA 的 `Config = Schema.object(...)` 走 `.volatile()`；host 侧 `resolveConfig` 要求 `runtime.Config['~standard']` |
| ③ | **该 entry 的 fiber 不是 ACTIVE**（未挂载、pending 或被 disabled 继承）**——但这条偏弱** | 反证：remote 入口能应答（`michengai-pua-remote` 的 `static inject` 含 `puaConfiguration`，而它只在主 entry 的 `apply` 里创建）⇒ 主 entry 大概率是活的 |

**支持「宿主侧 / 版本适配」这一大方向的旁证**（同一份 harness.log，每次启动都有，说明这台宿主上「第三方插件设置命名空间」普遍不顺）：
`[modlens] settings namespace skipped: TypeError: scope.settings.register is not a function`、
`[modsearch] …`、`[harness-log] error dsh-context: TypeError: sctx.settings.register is not a function`、
`[dsh-chat-import] settings register failed: sctx.settings.register is not a function`。
（这些在 2026-10-10T04:35 之后消失，说明新版插件已适配；PUA 日志里则**完全没有记录**，即它没加载失败、没报错。）

---

## 三、行动清单（从便宜到贵）

1. **点一次卡片上的「重新读取配置」**（或等 4 秒）。错误消失 = 竞态，无需处理。
2. 一直不消失 → **完全退出 DSH Desktop 再启动**（README 明确：仅刷新浏览器不够）。
3. 依旧 → **升级/重装插件后重启**：

   ```powershell
   [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
   $OutputEncoding = [System.Text.Encoding]::UTF8
   dsh plugin --profile web add @michengai/dsh-pua@latest --registry=https://registry.npmjs.org/
   ```

4. **影响面其实很小**：全局开关（「允许使用 PUA」）不可用，但**会话级**用法不受影响——
   聊天里的 PUA 入口 / `/pua` 走的是 `getSession` / `setSession`（会话级存储），不依赖这个命名空间。
   README 也是这个口径：全局开关只决定 `/pua` 与聊天入口是否可见，真正的注入是会话级的。
5. 想反馈给作者时，可直接引用本文件第一节的两段证据（harness.log 的 `no register()` 行 + asar 里 `describe()` 的跳过条件）。

---

## 四、本次排查的限制

- 本会话的 `pwsh` 工具全程不可用：`[exit code: 3221225794]`（0xC0000142 STATUS_DLL_INIT_FAILED），无 stdout。
  ⇒ 只能做静态取证（read / grep / glob），无法在宿主进程里实测 `describe()` 的实际返回值。
- `read` 无法读 `app.asar`（`Cannot mix BigInt and other types`），只能用 `grep` 按行取源码切片。

## 五、本次用到的关键路径

| 用途 | 路径 |
|---|---|
| 抛错点 | `...\profiles\web\node_modules\.pnpm\@michengai+dsh-pua@0.3.25_*\node_modules\@michengai\dsh-pua\lib\remote.js:85` |
| 命名空间常量 | 同目录 `lib\settings.js:4`（`SETTINGS_NAMESPACE = 'michengai-pua'`） |
| entry 声明 | 同目录 `cordis.patch.yml` |
| 宿主源码 | `E:\Program Files\DeepSeek\DSH Desktop\resources\app.asar`（dsh-settings `describe()` 区段，旧格式 922678 / 新格式 923079） |
| 启动日志 | `%APPDATA%\dsh-desktop\logs\harness.log` |
| 用户 patch 层 | `%APPDATA%\dsh-desktop\harness\profiles\web\cordis.patch.yml` |

---

## 六、17:20 复查：重启无效 + 新证据 + 下一步动作

### 6.1 已排除（都有证据）

| 假设 | 结论 | 证据 |
|---|---|---|
| 启动竞态（点「重新读取配置」就好） | ❌ 排除 | 用户点过「重新读取配置」，红字不变；客户端本身也在每 4 秒轮询 |
| 需要重启宿主 | ❌ 排除 | 日志 `2026-10-11T09:07:08Z`（本地 17:07）有一轮新启动：行 9780-9782 `tombstone(s)` / `projected generations: 17 linked, 0 unlinked`、行 9828 `dsh web: http://127.0.0.1:43129/?token=zgVf…`；重启后卡片依旧 |
| 宿主升级超出插件支持范围 | ❌ 排除 | app.asar 内 `"@deepseek-ai/dsh-settings": "0.2.0-rc.2"`（29 处命中）与 `"@deepseek-ai/dsh-config-editor": "0.2.0-rc.2"` 未变，正是 PUA 0.3.25 声明支持的上限 |
| 宿主缺少 settings 服务 | ❌ 排除 | 抛错条件是 `if (settings && !descriptor)`（`lib/remote.js:82-85`），要求 `settings` 为真；缺服务时不会抛这句 |
| entry id 与命名空间常量不一致 | ❌ 排除 | 包内 `cordis.patch.yml`：`id: michengai-pua` / `id: michengai-pua-remote`；`lib/settings.js:4`：`SETTINGS_NAMESPACE = 'michengai-pua'` —— 字面一致 |

### 6.2 新证据：PUA 是唯一没有「generation 投影」的插件

`%APPDATA%\dsh-desktop\harness\profiles\web\package.json`：

- line 5 `"@michengai/dsh-pua": "0.3.25"`；line 34 `dsh.profile.bundles` 里也有 `@michengai/dsh-pua` ⇒ 装是装了、也进 bundles 了；
- 但同文件的 `dsh.desktop.generationProjection.plugins` 与 `pnpm.overrides`（约 190-199 行的 `link:` 块）里，其余 17 个插件都有 `generationId` + `link: ../.generations/live/<pkg>+<ver>+<hash>/node_modules/<pkg>`；**grep `pua` 只命中上面那两行** —— PUA 既无 generationId，也无 `link:` 覆盖；
- 日志行 1990 `[desktop] migration: moving 8 plugin(s) to generations: …` 名单里同样没有 `@michengai/dsh-pua`。

⇒ PUA 不是经 DSH Desktop 自己的安装管线装进来的（很可能是 `dsh plugin add` 直接写 profile）。**这是目前唯一与其它插件不一致的结构性差异**，也是下一轮要验证的方向。

### 6.3 功能影响（重要）

插件自己的降级设计（`lib/settings.js:75-101`）：

```js
current() {
    if (this.scope) return materializePreferences(this.scope.get());          // legacy: settings.register
    if (this.mode === 'volatile') return materializePreferences(this.config); // 0.1.7+: 条目 volatile Config
    return undefined;                                                          // 都没有 → 仅当前会话生效
}
```

- 宿主给不出命名空间 ⇒ `current()` 返回 `undefined` ⇒ 全局配置读不到 ⇒ **新会话默认是「关」**，需要在会话里开一次（发 `/pua …` 或点会话内开关）；
- 但会话命令与技术本体不受影响：`lib/index.js:60` 无条件注册 `/pua`；`lib/index.js:42-57` 只在 `state.enabled` 时注入完整 PUA 提示；
- `lib/remote.js:81-85` **只有它硬抛错**，而 `PreferencesBridge` 能优雅降级 ⇒ 卡片红字属于**插件侧的降级不一致**（`getGlobal()` 本来可以返回默认值 + 提示）。

### 6.4 下一步（用户侧：30 秒诊断 + 一次重装尝试）

1. **诊断（30 秒）**：打开 **设置 → 插件**，看有没有「PUA 配置」这一行；同时看其它第三方插件（`dsh-context` / `@liustack/modlens` / `dsh-cost-meter`）有没有配置表单。三种结果指向不同结论：
   - 有 PUA 且能改 ⇒ 命名空间其实存在，问题在卡片 / remote 侧；
   - **所有第三方插件都没有** ⇒ 宿主 0.2.0-rc.2 的「Config → 命名空间」派生对这些插件都没生效（宿主级问题）；
   - 只有 PUA 没有 ⇒ 印证 6.2 的「非桌面管线安装」假设。
2. **尝试修复**：用**桌面自带的插件市场/安装入口**把 `@michengai/dsh-pua` 重装一次（README 记录的 CLI 写法：`dsh plugin --profile web add @michengai/dsh-pua@latest --registry=https://registry.npmjs.org/`），让桌面补上 generation + link，然后**完整重启** DSH，再看卡片。

### 6.5 本轮工具限制

本会话 `pwsh` 仍全程不可用（`[exit code: 3221225794]` = `0xC0000142`），无法在宿主进程内直接实测 `settings.describe()`；`read` 也读不了 `app.asar`（`Cannot mix BigInt and other types`），只能靠 `grep` 按行取源码。要一步定论，只能在宿主进程内或终端里做上面 6.4 的检查。
