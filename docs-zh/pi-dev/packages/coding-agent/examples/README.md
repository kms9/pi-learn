本文是 `README.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 示例 {#examples}

pi-coding-agent 的 SDK 与扩展示例代码。

## 目录 {#directories}

### [sdk/](sdk/) {#sdk}

通过 `createAgentSession()` 进行编程接入。展示如何自定义模型、提示词、工具、扩展和会话管理。

### [extensions/](extensions/) {#extensions}

扩展示例，演示：
- 生命周期事件处理（工具拦截、安全门禁、上下文修改）
- 自定义工具（待办列表、提问、子 agent、输出截断）
- 命令与键盘快捷键
- 自定义 UI（页脚、页头、编辑器、覆盖层）
- Git 集成（检查点、自动提交）
- 系统提示词修改与自定义压缩
- 外部集成（SSH、文件监视、系统主题同步）
- 自定义提供商（带自定义流式传输的 Anthropic、GitLab Duo）

### [plugins/pi-example-plugin/](plugins/pi-example-plugin/) {#pluginspi-example-plugin}

一个实验性插件包。Pi 会自动将其构建为独立的 Session-worker 与 TUI Chord 切面。

## 文档 {#documentation}

- [SDK 参考](sdk/README.zh.md)
- [扩展文档](../docs/extensions.zh.md)
- [技能文档](../docs/skills.zh.md)
