# dsh-chinese 安装说明（其他电脑）

这个插件让 DeepSeek Harness **用中文回复**（自然语言交流用中文；代码、命令、
路径、报错原文保持原样），并带一个**设置页开关**（「中文回复」，默认开启，
放在设置靠上位置）。

## 分发包内容

复制整个 `dsh-chinese` 文件夹到目标电脑即可（它**自包含**，除 DSH 自带的
`@deepseek-ai/*` 和 `react` 外不依赖任何东西）。

```
dsh-chinese/
├── lib/
│   ├── index.js          # 主机侧（中文开关逻辑）
│   ├── client.js         # 客户端侧（设置页开关）
│   └── types/
├── package.json          # 插件元数据（dsh.bundle + dsh.client）
├── cordis.patch.yml      # 挂载补丁
├── dsh.plugin.json
├── install.cmd           # 一键安装脚本（Windows）
├── README-安装说明.md     # 本文档
└── src/                  # 源码（可选，供重新构建）
```

## 安装

### 方式一：官方 dsh 命令（推荐）

在目标电脑上，命令行执行：

```bat
dsh plugin --profile web add D:\路径\dsh-chinese
```

- `dsh plugin` 会把插件装进 profile，并**自动**把 `dsh-chinese`
  加入 `dsh.profile.bundles`（因为它的 package.json 声明了 `dsh.bundle`）。
- 如果 profile 名不是 `web`，把 `web` 换成实际 profile 名。

> 说明：`dsh plugin add` 是 DSH 官方命令（pnpm 转发器，支持
> git / path / tarball / registry 来源）。它要求目标机 PATH 上有 `pnpm`；
> 若没有，用下面的手动方式。

### 方式二：运行 install.cmd（Windows 一键）

把 `dsh-chinese` 文件夹拷到目标机后，双击/在命令行运行：

```bat
dsh-chinese\install.cmd
```

脚本会优先走官方 `dsh plugin add`；若 `dsh` 不在 PATH，则退化为手动拷贝 +
打印需要你在 profile package.json 里补充的字段（见说明）。

### 方式三：完全手动

1. 把 `dsh-chinese` 整个文件夹复制到：
   `<DSH_HOME>\profiles\<profile>\node_modules\dsh-chinese\`
   （本机是 `%APPDATA%\dsh-desktop\harness\profiles\web\node_modules\dsh-chinese`）
2. 打开同目录的 `package.json`，确保：
   - `dependencies` 里有 `"dsh-chinese": "file:./node_modules/dsh-chinese"`
   - `dsh.profile.bundles` 数组里加 `"dsh-chinese"`
3. 保存并**重启 DeepSeek Harness**。

## 生效

重启 DSH 后：
- 新会话的回复自动用中文（方案 A 的 AGENTS.md + 方案 B 的 system-prompt 段落，双保险）。
- 「设置」页会出现「中文回复」开关（靠近顶部），可随时开/关，**即时生效，无需重启**。
- 关掉开关后，中文段落移除，回复语言恢复正常；再打开即恢复。

## 卸载

1. 从 profile 的 node_modules 删除 `dsh-chinese` 目录。
2. 从 profile `package.json` 的 `dependencies` 和 `dsh.profile.bundles` 移除 `dsh-chinese`。
3. （可选）删除 DSH 数据根目录下的 `AGENTS.md`（方案 A 的全局指令，不影响其它功能）。
4. 重启 DeepSeek Harness。

## 故障排查

- **设置页没出现开关**：多半是手写 client 构建在目标机上未生效。删掉
  `node_modules\dsh-chinese\lib\client.js` 即回退为纯主机模式（中文仍默认开启，
  只是开关不在 UI）；或在有 esbuild/typescript 的机器上重新 `npm run build`
  生成 client.js 覆盖。
- **插件没生效**：确认 profile 名、重启了 DSH、且 `dsh-chinese` 确实在
  `dsh.profile.bundles` 里。
- **其他电脑缺 pnpm**：`dsh plugin add` 需要 pnpm；用方式三手动安装可绕开。

## 重新构建（可选）

在装有 node/esbuild 的机器上：

```bash
cd dsh-chinese
npm install
npm run build
```

会重新生成 `lib/index.js` 和 `lib/client.js`。
