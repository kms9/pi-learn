本文是 `docs.json` 的中文阅读版；命令、路径、API 名称保持英文。

# Pi 文档阅读地图 {#pi-documentation}

从这里浏览全部中文阅读版。英文原文位于同目录下的 `.md` 文件。分组与 `docs.json` 一致，并补入导航中未列出的 [llama.cpp](llama-cpp.zh.md) 与 [环境变量](environment-variables.zh.md)。

## 从这里开始 {#start-here}

- [概览](index.zh.md) — Pi 是什么、安装与文档入口
- [快速开始](quickstart.zh.md) — 安装、认证并运行第一次会话
- [使用 Pi](usage.zh.md) — 交互模式、斜杠命令、上下文文件和 CLI 参考
- [提供商](providers.zh.md) — 内置提供商的订阅与 API key 配置
- [llama.cpp](llama-cpp.zh.md) — 运行本地 router，并用 `/llama` 管理模型
- [安全](security.zh.md) — 项目信任、沙箱边界与漏洞报告
- [容器化](containerization.zh.md) — 用 Gondolin、Docker 或 OpenShell 为 pi 做沙箱
- [设置](settings.zh.md) — 全局与项目设置
- [快捷键](keybindings.zh.md) — 默认快捷键与自定义绑定
- [会话](sessions.zh.md) — 会话管理、分支与树导航
- [压缩](compaction.zh.md) — 上下文压缩与分支摘要

## 自定义 {#customization}

- [扩展](extensions.zh.md) — 用于工具、命令、事件和自定义 UI 的 TypeScript 模块
- [扩展实现导读](extensions-impl.zh.md) — 加载、runner、事件分发与源码地图
- [技能](skills.zh.md) — 可按需复用的 Agent Skills
- [提示词模板](prompt-templates.zh.md) — 通过斜杠命令展开的可复用提示词
- [主题](themes.zh.md) — 内置与自定义终端主题
- [Pi 包](packages.zh.md) — 打包并分享扩展、技能、提示词和主题
- [自定义模型](models.zh.md) — 为受支持的提供商 API 添加模型条目
- [自定义提供商](custom-provider.zh.md) — 实现自定义 API 与 OAuth 流程

## 参考 {#reference}

- [会话格式](session-format.zh.md) — JSONL 会话文件格式、条目类型和 SessionManager API
- [环境变量](environment-variables.zh.md) — Pi 进程配置，以及 bash 工具可用的会话元数据

## 编程接入 {#programmatic-usage}

- [SDK](sdk.zh.md) — 在 Node.js 应用中嵌入 pi
- [RPC 模式](rpc.zh.md) — 通过 stdin/stdout JSONL 集成
- [JSON 事件流模式](json.zh.md) — 带结构化事件的打印模式
- [TUI 组件](tui.zh.md) — 为扩展构建自定义终端 UI

## 平台 {#platform-setup}

- [Windows](windows.zh.md)
- [Android 上的 Termux](termux.zh.md)
- [tmux](tmux.zh.md)
- [终端设置](terminal-setup.zh.md)
- [Shell 别名](shell-aliases.zh.md)

## 开发 {#development}

- [开发](development.zh.md) — 本地搭建、项目结构与调试
