本文是 `quickstart.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 快速开始 {#quickstart}

本页带你从安装走到一次有用的首次 pi 会话。

## 安装 {#install}

Pi 以 npm 包分发：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

`--ignore-scripts` 会在安装时禁用依赖的生命周期脚本。常规 npm 安装不需要 Pi 的 install 脚本。

### 卸载 {#uninstall}

使用当初安装 pi 的包管理器。curl 安装脚本会全局使用 npm，因此 curl 安装和 npm 安装都用 npm 卸载：

```bash
# curl 安装脚本或 npm install -g
npm uninstall -g @earendil-works/pi-coding-agent

# pnpm
pnpm remove -g @earendil-works/pi-coding-agent

# Yarn
yarn global remove @earendil-works/pi-coding-agent

# Bun
bun uninstall -g @earendil-works/pi-coding-agent
```

卸载 pi 不会删除 `~/.pi/agent/` 中的设置、凭据、会话和已安装的 pi 包。

然后在你希望 pi 处理的项目目录中启动：

```bash
cd /path/to/project
pi
```

## 认证 {#authenticate}

Pi 可以通过 `/login` 使用订阅类提供商，也可以通过环境变量或 auth 文件使用 API key 提供商。

### 方式 1：订阅登录 {#option-1-subscription-login}

启动 pi 并运行：

```text
/login
```

然后选择一个提供商。内置订阅登录包括 Claude Pro/Max、ChatGPT Plus/Pro（Codex）和 GitHub Copilot。

### 方式 2：API key {#option-2-api-key}

在启动 pi 之前设置 API key：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

也可以运行 `/login` 并选择 API key 提供商，将密钥存入 `~/.pi/agent/auth.json`。

所有受支持的提供商、环境变量和云提供商配置见 [提供商](providers.md)。

## 第一次会话 {#first-session}

pi 启动后，输入请求并按 Enter：

```text
Summarize this repository and tell me how to run its checks.
```

默认情况下，pi 会给模型四个工具：

- `read` - 读取文件
- `write` - 创建或覆盖文件
- `edit` - 修补文件
- `bash` - 运行 shell 命令

其他内置只读工具（`grep`、`find`、`ls`）可通过工具选项启用。Pi 在当前工作目录中运行，并可以修改该目录中的文件。若需要方便回滚，请使用 git 或其他检查点工作流。

## 给 pi 项目说明 {#give-pi-project-instructions}

Pi 会在启动时加载上下文文件。添加 `AGENTS.md`，告诉它如何在项目中工作：

```markdown
# Project Instructions

- 代码变更后运行 `npm run check`。
- 不要在本地运行生产环境迁移。
- 保持回复简洁。
```

Pi 会加载：

- `~/.pi/agent/AGENTS.md` 作为全局说明
- 父目录和当前目录中的 `AGENTS.md` 或 `CLAUDE.md`

如果某个目录包含 `AGENTS.override.md`，Pi 会加载它，而不是该目录中的 `AGENTS.md` 或 `CLAUDE.md`。

更改上下文文件后，请重启 pi，或运行 `/reload`。

## 常见用法 {#common-things-to-try}

### 引用文件 {#reference-files}

在编辑器中输入 `@` 可对文件做模糊搜索，也可以在命令行传入文件：

```bash
pi @README.md "Summarize this"
pi @src/app.ts @src/app.test.ts "Review these together"
```

图片或文本可用 Ctrl+V 粘贴（Windows 上为 Alt+V）；在受支持的终端中也可以把图片拖进去。

### 运行 shell 命令 {#run-shell-commands}

在交互模式中：

```text
!npm run lint
```

命令输出会发给模型。使用 `!!command` 可运行命令但不把输出加入模型上下文。

### 切换模型 {#switch-models}

使用 `/model` 或 Ctrl+L 为当前会话选择模型。在模型选择器中按 Ctrl+S，可将高亮的模型保存为启动默认值。使用 `/thinking` 为当前会话选择思考级别，或在该选择器中按 Ctrl+S 保存启动默认思考级别。使用 Shift+Tab 循环切换思考级别。使用 Ctrl+P / Shift+Ctrl+P 循环切换范围内模型。

### 稍后再继续 {#continue-later}

会话会自动保存：

```bash
pi -c                  # 继续最近一次会话
pi -r                  # 浏览以往会话
pi --name "my task"    # 启动时设置会话显示名称
pi --session <path|id> # 打开指定会话
```

在 pi 内，使用 `/resume`、`/new`、`/tree`、`/fork` 和 `/clone` 管理会话。

### 非交互模式 {#non-interactive-mode}

用于一次性提示：

```bash
pi -p "Summarize this codebase"
cat README.md | pi -p "Summarize this text"
pi -p @screenshot.png "What's in this image?"
```

使用 `--mode json` 输出 JSON 事件，或使用 `--mode rpc` 做进程集成。

## 下一步 {#next-steps}

- [使用 Pi](usage.md) - 交互模式、斜杠命令、会话、上下文文件和 CLI 参考。
- [提供商](providers.md) - 认证与模型配置。
- [设置](settings.md) - 全局与项目配置。
- [快捷键](keybindings.md) - 快捷键与自定义。
- [Pi 包](packages.md) - 安装共享的扩展、技能、提示词和主题。

平台说明：[Windows](windows.md)、[Termux](termux.md)、[tmux](tmux.md)、[终端配置](terminal-setup.md)、[Shell 别名](shell-aliases.md)。
