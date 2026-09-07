# 扩展示例

pi-coding-agent 的扩展示例。

- API 手册：[docs/extensions.zh.md](../../docs/extensions.zh.md)
- 实现导读（加载 / runner / 事件分发）：[docs/extensions-impl.zh.md](../../docs/extensions-impl.zh.md)

## 用法

```bash
# 用 --extension 加载扩展
pi --extension examples/extensions/permission-gate.ts

# 或复制到 extensions 目录以自动发现
cp permission-gate.ts ~/.pi/agent/extensions/
```

## 示例

### 生命周期与安全

| 扩展 | 说明 |
|-----------|-------------|
| `permission-gate.ts` | 在危险 bash 命令（rm -rf、sudo 等）执行前请求确认 |
| `project-trust.ts` | 演示用户/全局扩展与 CLI 扩展的 `project_trust` 事件 |
| `protected-paths.ts` | 阻止写入受保护路径（.env、.git/、node_modules/） |
| `confirm-destructive.ts` | 在破坏性会话操作（clear、switch、fork）前确认 |
| `dirty-repo-guard.ts` | 存在未提交 git 变更时阻止会话切换 |
| `sandbox/` | 使用 `@anthropic-ai/sandbox-runtime` 做操作系统级沙箱，支持按项目配置 |
| `gondolin/` | 把内置工具和 `!` 命令路由进 Gondolin 微虚拟机 |

### 自定义工具

| 扩展 | 说明 |
|-----------|-------------|
| `todo.ts` | Todo 列表工具 + `/todos` 命令，带自定义渲染和状态持久化 |
| `hello.ts` | 最小自定义工具示例 |
| `question.ts` | 演示用 `ctx.ui.select()` 向用户提问并使用自定义 UI |
| `questionnaire.ts` | 多问题输入，问题之间用 tab 栏切换 |
| `tool-override.ts` | 覆盖内置工具（例如给 `read` 加日志/访问控制） |
| `dynamic-tools.ts` | 启动后（`session_start`）以及运行时通过命令注册工具，带 prompt snippets 和工具级 prompt guidelines |
| `kimi-deferred-tools.ts` | 按 Kimi 的延迟工具加载协议搜索并逐步激活工具 |
| `structured-output.ts` | 最终结构化输出工具，返回 `terminate: true`，让 agent 在该 tool call 上结束 |
| `built-in-tool-renderer.ts` | 为内置工具（read、bash、edit、write）提供自定义紧凑渲染，同时保留原有行为 |
| `minimal-mode.ts` | 覆盖内置工具渲染为最小显示（折叠模式下只显示 tool call，不显示输出） |
| `truncated-tool.ts` | 包装 ripgrep，正确截断输出（50KB/2000 行） |
| `ssh.ts` | 通过可插拔 operations，把所有工具委托给远程机器（SSH） |
| `subagent/` | 把任务委托给带隔离上下文窗口的专用 subagent |

### 命令与 UI

| 扩展 | 说明 |
|-----------|-------------|
| `preset.ts` | 通过 `--preset` flag 和 `/preset` 命令，为模型、thinking level、工具和 instructions 提供命名预设 |
| `plan-mode/` | Claude Code 风格的只读探索 plan mode，带 `/plan` 命令和步骤跟踪 |
| `tools.ts` | 交互式 `/tools` 命令，启用/禁用工具并在会话中持久化 |
| `handoff.ts` | 通过 `/handoff <goal>` 把上下文转移到一个新的聚焦会话 |
| `qna.ts` | 用 `ctx.ui.setEditorText()` 把上次回复中的问题提取到编辑器 |
| `status-line.ts` | 用 `ctx.ui.setStatus()` 在页脚显示回合进度，带主题色 |
| `github-issue-autocomplete.ts` | 叠加自定义 autocomplete provider，预加载 `gh issue list` 的开放 issue，补全 `#1234` |
| `widget-placement.ts` | 用 `ctx.ui.setWidget()` 的 placement 在编辑器上方和下方显示 widget |
| `hidden-thinking-label.ts` | 用 `ctx.ui.setHiddenThinkingLabel()` 自定义折叠 thinking 的标签 |
| `working-indicator.ts` | 用 `ctx.ui.setWorkingIndicator()` 自定义流式 working indicator |
| `model-status.ts` | 通过 `model_select` hook 在状态栏显示模型变更 |
| `snake.ts` | 贪吃蛇：自定义 UI、键盘处理和会话持久化 |
| `tic-tac-toe.ts` | 与 agent 下井字棋；工具使用 `executionMode: "sequential"`，避免共享光标状态竞态 |
| `send-user-message.ts` | 演示用 `pi.sendUserMessage()` 从扩展发送用户消息 |
| `timed-confirm.ts` | 演示用 AbortSignal 自动关闭 `ctx.ui.confirm()` 和 `ctx.ui.select()` 对话框 |
| `rpc-demo.ts` | 演练所有 RPC 支持的扩展 UI 方法；配合 [`examples/rpc-extension-ui.ts`](../rpc-extension-ui.ts) 使用 |
| `modal-editor.ts` | 通过 `ctx.ui.setEditorComponent()` 实现类 vim 的模态编辑器 |
| `rainbow-editor.ts` | 通过自定义编辑器实现彩虹文字动画 |
| `notify.ts` | agent 完成时通过 OSC 777 发送桌面通知（Ghostty、iTerm2、WezTerm） |
| `titlebar-spinner.ts` | agent 工作时在终端标题显示 Braille spinner 动画 |
| `summarize.ts` | 用 GPT-5.2 总结对话，并在瞬时 UI 中展示 |
| `custom-footer.ts` | 通过 `ctx.ui.setFooter()` 自定义页脚（git 分支和 token 统计） |
| `custom-header.ts` | 通过 `ctx.ui.setHeader()` 自定义页头 |
| `overlay-test.ts` | 测试 overlay 合成：行内文本输入和边界情况 |
| `overlay-qa-tests.ts` | 全面的 overlay QA：锚点、边距、堆叠、溢出、动画 |
| `doom-overlay/` | 以 overlay 形式运行 DOOM，35 FPS（演示实时游戏渲染） |
| `shutdown-command.ts` | 添加 `/quit` 命令，演示 `ctx.shutdown()` |
| `reload-runtime.ts` | 添加 `/reload-runtime` 和 `reload_runtime` 工具，演示安全 reload 流程 |
| `interactive-shell.ts` | 通过 `user_bash` hook 运行交互式命令（vim、htop），使用完整终端 |
| `inline-bash.ts` | 通过 `input` 事件转换，展开 prompt 中的 `!{command}` 模式 |
| `input-transform-streaming.ts` | 通过 `streamingBehavior`，在中途 steering 时跳过昂贵的输入预处理 |

### Git 集成

| 扩展 | 说明 |
|-----------|-------------|
| `git-checkpoint.ts` | 每个回合创建 git stash checkpoint，便于 fork 时恢复代码 |
| `auto-commit-on-exit.ts` | 退出时自动提交，用最后一条 assistant 消息作为 commit message |

### System Prompt 与压缩

| 扩展 | 说明 |
|-----------|-------------|
| `pirate.ts` | 演示用 `systemPromptAppend` 动态修改 system prompt |
| `claude-rules.ts` | 扫描 `.claude/rules/` 并把规则列入 system prompt |
| `custom-compaction.ts` | 自定义压缩：总结整段对话 |
| `trigger-compact.ts` | 上下文用量超过 100k tokens 时触发压缩，并添加 `/trigger-compact` 命令 |

### 系统集成

| 扩展 | 说明 |
|-----------|-------------|
| `mac-system-theme.ts` | 把 pi 主题与 macOS 深色/浅色模式同步 |

### 资源

| 扩展 | 说明 |
|-----------|-------------|
| `dynamic-resources/` | 使用 `resources_discover` 加载 skills、prompts 和 themes |

### 消息与通信

| 扩展 | 说明 |
|-----------|-------------|
| `message-renderer.ts` | 通过 `registerMessageRenderer` 自定义消息渲染（颜色、可展开详情） |
| `entry-renderer.ts` | 通过 `appendEntry` 和 `registerEntryRenderer` 做仅 TUI 的会话 entry 渲染 |
| `event-bus.ts` | 通过 `pi.events` 做扩展间通信 |

### 会话元数据

| 扩展 | 说明 |
|-----------|-------------|
| `session-name.ts` | 通过 `setSessionName` 为会话选择器命名会话 |
| `bookmark.ts` | 通过 `setLabel` 给 entry 打标签，便于 `/tree` 导航 |

### 自定义 Provider

| 扩展 | 说明 |
|-----------|-------------|
| `custom-provider-anthropic/` | 自定义 Anthropic provider，支持 OAuth 和自定义流式实现 |
| `custom-provider-gitlab-duo/` | GitLab Duo provider：通过代理使用 pi-ai 内置的 Anthropic/OpenAI 流式 |

### 外部依赖

| 扩展 | 说明 |
|-----------|-------------|
| `with-deps/` | 自带 package.json 和依赖的扩展（演示 jiti 模块解析） |
| `file-trigger.ts` | 监视 trigger 文件，并把内容注入对话 |

## 编写扩展

完整文档见 [docs/extensions.md](../../docs/extensions.md)。中文 API 文档见 [docs/extensions.zh.md](../../docs/extensions.zh.md)。

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // Subscribe to lifecycle events
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });

  // Register custom tools
  pi.registerTool({
    name: "greet",
    label: "Greeting",
    description: "Generate a greeting",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}!` }],
        details: {},
      };
    },
  });

  // Register commands
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify("Hello!", "info");
    },
  });
}
```

## 关键模式

**字符串参数用 StringEnum**（Google API 兼容所必需）：
```typescript
import { StringEnum } from "@earendil-works/pi-ai";

// Good
action: StringEnum(["list", "add"] as const)

// Bad - doesn't work with Google
action: Type.Union([Type.Literal("list"), Type.Literal("add")])
```

**通过 details 持久化状态：**
```typescript
// Store state in tool result details for proper forking support
return {
  content: [{ type: "text", text: "Done" }],
  details: { todos: [...todos], nextId },  // Persisted in session
};

// Reconstruct on session events
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.toolName === "my_tool") {
      const details = entry.message.details;
      // Reconstruct state from details
    }
  }
});
```
