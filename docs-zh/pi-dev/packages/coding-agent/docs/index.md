本文是 `index.md` 的中文阅读版；命令、路径、API 名称保持英文。

中文阅读入口见 [README.zh.md](README.zh.md)。下文链接仍指向英文原稿；同目录均有对应的 `.zh.md`。

# Pi 文档 {#pi-documentation}

Pi 是一个极简的终端编码工具。它的核心刻意保持精小，并通过 TypeScript 扩展、技能、提示词模板、主题以及 pi 包来扩展能力。

## 快速开始 {#quick-start}

用 npm 安装 Pi：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

`--ignore-scripts` 会在安装时禁用依赖的生命周期脚本。常规 npm 安装不需要 Pi 的 install 脚本。

在 Linux 或 macOS 上，也可以使用安装脚本：

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

要卸载 pi 本身，curl 安装和 npm 安装都用 npm：

```bash
npm uninstall -g @earendil-works/pi-coding-agent
```

若用 pnpm、Yarn 或 Bun 安装，请使用对应的全局卸载命令：`pnpm remove -g @earendil-works/pi-coding-agent`、`yarn global remove @earendil-works/pi-coding-agent`，或 `bun uninstall -g @earendil-works/pi-coding-agent`。

然后在项目目录中运行：

```bash
pi
```

订阅类提供商用 `/login` 认证；或在启动 pi 之前设置 API key，例如 `ANTHROPIC_API_KEY`。

完整首次运行流程见 [快速开始](quickstart.md)。

## 从这里开始 {#start-here}

- [快速开始](quickstart.md) - 安装、认证并运行第一次会话。
- [使用 Pi](usage.md) - 交互模式、斜杠命令、上下文文件和 CLI 参考。
- [提供商](providers.md) - 内置提供商的订阅与 API key 配置。
- [llama.cpp](llama-cpp.md) - 运行本地 router，并用 `/llama` 管理模型。
- [安全](security.md) - 项目信任、沙箱边界与漏洞报告。
- [容器化](containerization.md) - 用 Gondolin、Docker 或 OpenShell 为 pi 做沙箱。
- [设置](settings.md) - 全局与项目设置。
- [快捷键](keybindings.md) - 默认快捷键与自定义绑定。
- [会话](sessions.md) - 会话管理、分支与树导航。
- [压缩](compaction.md) - 上下文压缩与分支摘要。

## 自定义 {#customization}

- [扩展](extensions.md) - 用于工具、命令、事件和自定义 UI 的 TypeScript 模块。
- [技能](skills.md) - 可按需复用的 Agent Skills。
- [提示词模板](prompt-templates.md) - 通过斜杠命令展开的可复用提示词。
- [主题](themes.md) - 内置与自定义终端主题。
- [Pi 包](packages.md) - 打包并分享扩展、技能、提示词和主题。
- [自定义模型](models.md) - 为受支持的提供商 API 添加模型条目。
- [自定义提供商](custom-provider.md) - 实现自定义 API 与 OAuth 流程。

## 编程方式使用 {#programmatic-usage}

- [SDK](sdk.md) - 在 Node.js 应用中嵌入 pi。
- [RPC 模式](rpc.md) - 通过 stdin/stdout JSONL 集成。
- [JSON 事件流模式](json.md) - 带结构化事件的打印模式。
- [TUI 组件](tui.md) - 为扩展构建自定义终端 UI。

## 参考 {#reference}

- [环境变量](environment-variables.md) - Pi 进程配置，以及 bash 工具可用的会话元数据。
- [会话格式](session-format.md) - JSONL 会话文件格式、条目类型和 SessionManager API。

## 平台配置 {#platform-setup}

- [Windows](windows.md)
- [Android 上的 Termux](termux.md)
- [tmux](tmux.md)
- [终端配置](terminal-setup.md)
- [Shell 别名](shell-aliases.md)

## 开发 {#development}

- [开发](development.md) - 本地搭建、项目结构与调试。
