# DSH `workspace-write` 沙箱 0xC0000142 修复包

> 修复日期：2026-10-16　适用：本机 DSH Desktop（`E:\Program Files\DeepSeek\DSH Desktop`）
> 背景调研全文见 [`DSH沙箱0xC0000142-调研报告.md`](E:\Deepseek\DSH沙箱0xC0000142-调研报告.md)

## 1. 问题

文件策略设为 **`workspace-write`（工作区内修改）** 时，**任何 shell 命令都无法启动**：

- 退出码 `3221225794` = `0xC0000142` = `STATUS_DLL_INIT_FAILED`，且**没有任何输出**（连 `echo` 都跑不起来）；
- `read-only`（仅可查看）与 `danger-full-access`（完全权限）**都正常**；
- 文件读写通道（`read` / `glob` / `grep` / hex 读取）不受影响——坏的只有「起子进程」。

精确复现（直接调用沙箱 runner，绕开 GUI）：

| 测试 | 命令 | 结果 |
| --- | --- | --- |
| T1 | `runner.js`（不给参数） | `EXIT=127` + `windows-acl-run: missing --workspace` ⇒ runner 本身活着 |
| T2 | `--mode read-only -- cmd.exe /c echo HI-READONLY` | 打印 `HI-READONLY`、`EXIT=0` ⇒ 正常 |
| T3 | `--mode workspace-write -- cmd.exe /c echo HI-WRITE` | 无输出、`EXIT=-1073741502` ⇒ **故障复现** |

## 2. 根因

DSH 在 Windows 上用「**ACL 受限令牌**」实现沙箱：把当前令牌改造成 `WRITE_RESTRICTED` 受限令牌，再加 Low 完整性标签。关键代码在
`resources\app.asar` → `node_modules/@deepseek-ai/dsh-sandbox-windows-acl/lib/types-*.js`（本机为 `types-Cl_DXjhk.js`）：

```js
// 第 1293 行（修复前）
setTokenDefaultDaclGrant(api, restrictedToken, this.tempWriteSidPtr ?? this.writeSidPtr ?? worldSid);
```

`setTokenDefaultDaclGrant` 会把传入 SID 的 `FILE_ALL_ACCESS` 合并进**令牌的默认 DACL**。workspace-write 传的是**只存在于受限列表、不在令牌普通组里**的写能力 SID（`S-1-4-x-y`）。于是受限子进程**新建的任何对象**都带着一个指向「自己令牌里没有的 SID」的 ACE，在加载器/DLL 早期初始化时**连自己的访问检查都过不去**，进程直接 `0xC0000142` 死掉。

- `read-only` 不受影响：它没有写 SID，表达式落到 `?? worldSid`（Everyone，每个令牌的普通组里都有）⇒ 正常。
- 这解释了为什么「同一台机器、同一个宿主，read-only 通、workspace-write 死」。

该根因与社区报告一致（DSH issue **#9507**，2026-10-12，含隔离矩阵与同一行修复建议；相关讨论 **#8295**、**#810**；官方文档 `packages/sandbox/sandbox-windows-acl/README.md` 亦承认该边界）。

## 3. 已做的修改（本机已生效）

对 `E:\Program Files\DeepSeek\DSH Desktop\resources\app.asar` 做**等长原地字节替换**（100 字节 → 100 字节，asar 偏移全部不变）：

| 项 | 值 |
| --- | --- |
| 文件内路径 | `node_modules/@deepseek-ai/dsh-sandbox-windows-acl/lib/types-Cl_DXjhk.js` |
| asar 绝对偏移 | `59906147` |
| 替换长度 | 100 字节 |
| 替换前 | `setTokenDefaultDaclGrant(api, restrictedToken, this.tempWriteSidPtr ?? this.writeSidPtr ?? worldSid);` |
| 替换后 | `setTokenDefaultDaclGrant(api, restrictedToken, worldSid` + 44 个空格 + `);` |
| sha256 原文件 | `c6ad1d6a90b2f52154be97210c0e32cbbedc471822d3fe2f3f74b21c619b1007` |
| sha256 修改后 | `ab3d815be6a49f62e69d73b41ff2d09f86b3681c6f97f63abf2f7ff4b15a8a50` |
| 备份（可回滚） | `E:\Deepseek\_backup-asar\app.asar.orig-2026-10-15T16-36-01-882Z` |
| 变更记录 | `E:\Deepseek\_backup-asar\patch-record-2026-10-15T16-36-01-882Z.json` |

语义：第三参恒为 `worldSid`——即**去掉能力 SID 分支，退回 read-only 模式一直在用的那种默认 DACL 形状**。

**完整性校验不影响**：asar 头部确实带 per-file `integrity` 哈希，但本机未启用校验（Electron fuse `EnableEmbeddedAsarIntegrityValidation` 读数为 `0`；实测把副本改掉后，通过 Electron 的 asar 包装层仍能正常读取改后的字节）。

## 4. 验证证据

| 验证 | 结果 |
| --- | --- |
| 副本（`test.asar`）打补丁后跑 runner：read-only | `EXIT=0`，`HI-READONLY-COPY` |
| 副本打补丁后跑 runner：workspace-write | **`EXIT=0`，`HI-WRITE-COPY`**（修复前必为 0xC0000142） |
| 真实 `app.asar` 打补丁后：read-only | `EXIT=0`，`HI-READONLY-REAL` |
| 真实 `app.asar` 打补丁后：workspace-write | **`EXIT=0`，`HI-WRITE-REAL`** |
| 真实 `app.asar` 打补丁后：受限子进程**实际写文件** | `echo x > …\sbx-test\written-by-sandbox.txt` → `EXIT=0`，文件确实生成 |
| 改后模块经 Electron asar 包装层读取 | 正常读到 64309 字节，补丁行可见 |
| 回归对照 | 修复前同样命令 → `EXIT=-1073741502`（0xC0000142） |

## 5. 回滚 / 升级后重打

- **回滚**：双击 `回滚.cmd`（或 `powershell -ExecutionPolicy Bypass -File restore-asar.ps1`）。会把当前 app.asar 另存一份 `app.asar.before-restore-*`，再用备份覆盖并校验哈希。
- **升级 DSH Desktop 之后**：安装包会替换 `app.asar`，补丁随之丢失（表现为 workspace-write 又崩）。双击 `重新打补丁.cmd` 重打即可；脚本幂等，已打过会直接报 `ALREADY PATCHED`，找不到目标串会报 `TARGET NOT FOUND`（说明官方已改这段代码，需重新调研）。
- 补丁只动 100 字节，脚本每次都会先备份 + 校验 sha256 再写。

## 6. 安全影响

- 沙箱**仍然生效**：受限令牌（`WRITE_RESTRICTED`）、Low 完整性标签、工作区/临时目录的能力 SID 授权全部保留。
- 唯一变化：受限子进程**新建对象**的默认 DACL 从「授予能力 SID」改为「授予 Everyone」——这正是 `read-only` 模式原本就在用的形状（且工作正常）。
- 即：修好的是「子进程连自己创建的对象都打不开」这一**自伤**，而不是放宽工作区权限。

## 7. 附：本机相关的其他事实

- Harness 宿主的**隐藏控制台** trampoline 已在位并生效：`resources\harness-node-entry.mjs:71-81` 在 win32 分支调用 `resources\windows-hidden-console.mjs`（koffi 调 `AllocConsole()` + `ShowWindow(SW_HIDE)`）；实测 Harness 进程 `AttachConsole` 成功 ⇒ `HAS-CONSOLE`。所以本机**不是**「宿主无控制台」那条老根因，而是上面第 2 节的默认 DACL 问题。
- Electron-as-node 环境下 **ESM `--import` 加载钩子不生效**（钩子模块会被执行，但 `load`/`resolve` 钩子一次都不触发）⇒ 不能用「运行时改写源码」的方式打补丁，只能改文件本身。
- `@koromix/koffi-win32-x64` 位于 `resources\app.asar.unpacked\`（不在 asar 内）。
