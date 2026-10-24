# dsh-chinese

一个极简的 DeepSeek Harness 插件，让**每一次回复都用中文交流**——同时保证
代码、shell 命令、文件路径、标识符和报错文本**原样不变**。

## 工作原理

它在系统提示词组装里注册**一条「输出格式约定」段落**（`order 106`），紧随
bash 工具指引（104）与 genui fence 语言段（105）之后。因为它是普通的
`system-prompt` 段落，所以对 profile 里的**每个 agent / 每个会话**都生效——
无需会话级状态、无需拦截 pre-step、不需要任何自定义工具。

注入的指令：

- 与用户交流的所有自然语言叙述一律使用**中文（简体）**。
- 绝不翻译或改写需要保持字面的内容：
  - 代码、命令、工具参数、路径、标识符——原样保留；
  - 报错 / 异常文本、日志行、终端输出——逐字引用；
  - 枚举值、键名、URL、专有名词——不改。

## 安装

1. 构建插件：

   ```bash
   cd plugins/dsh-chinese
   npm install
   npm run build
   ```

2. 把插件注册到 profile 的 bundle（或把 `cordis.patch.yml` 内容并入 profile 的
   cordis 组合）。具体到本机（桌面版 DeepSeek Harness）的操作见下：

### 本机 profile 接入步骤（Windows / 桌面版）

活动 profile 位于：
`%APPDATA%\dsh-desktop\harness\profiles\web`

1. 构建出 `lib/index.js`（见上）。
2. 把 `dsh-chinese` 目录复制（或符号链接）到 profile 的
   `node_modules` 下，或通过 profile `package.json` 的依赖声明指向本地路径。
3. 在 profile `package.json` 的 `dsh.profile.bundles` 数组里追加
   `"dsh-chinese"`，并在 `dependencies` 里声明它。
4. 重启 DeepSeek Harness，即可让新会话生效。

## 卸载

从活动 profile 移除 `dsh-chinese` bundle 条目及其 patch 行，重启即可。

## 许可证

MIT
