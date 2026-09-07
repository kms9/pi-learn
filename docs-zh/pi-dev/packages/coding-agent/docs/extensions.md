本文是 `extensions.md` 的中文阅读版，便于理解 pi 扩展系统；API 名称保持英文。

**建议阅读顺序：**

1. 本文：扩展能做什么、事件与 `pi.*` / `ctx.*` API
2. [extensions-impl.zh.md](./extensions-impl.zh.md)：扩展在源码里如何加载、绑定、分发事件
3. [examples/extensions/README.zh.md](../examples/extensions/README.zh.md)：可运行示例索引

> pi 可以创建扩展。让它按你的场景构建一个即可。

# 扩展 {#extensions}

扩展是用于扩展 pi 行为的 TypeScript 模块。它们可以订阅生命周期事件、注册供 LLM 调用的自定义工具、添加命令等。

> **`/reload` 的放置位置：** 将扩展放在 `~/.pi/agent/extensions/`（全局）或 `.pi/extensions/`（项目本地）以便自动发现。仅在快速测试时使用 `pi -e ./path.ts`。位于自动发现路径中的扩展可通过 `/reload` 热重载。

**核心能力：**
- **自定义工具** - 通过 `pi.registerTool()` 注册 LLM 可调用的工具
- **事件拦截** - 拦截或修改工具调用、注入上下文、自定义压缩
- **用户交互** - 通过 `ctx.ui` 提示用户（select、confirm、input、notify）
- **自定义 UI 组件** - 通过 `ctx.ui.custom()` 提供带键盘输入的完整 TUI 组件，用于复杂交互
- **自定义命令** - 通过 `pi.registerCommand()` 注册类似 `/mycommand` 的命令
- **会话持久化** - 通过 `pi.appendEntry()` 存储可在重启后保留的状态
- **自定义渲染** - 控制工具调用/结果以及消息在 TUI 中的显示方式

**示例用例：**
- 权限门禁（在 `rm -rf`、`sudo` 等操作前确认）
- Git 检查点（每轮 stash，分支时还原）
- 路径保护（阻止写入 `.env`、`node_modules/`）
- 自定义压缩（按你的方式总结对话）
- 对话摘要（参见 `summarize.ts` 示例）
- 交互式工具（提问、向导、自定义对话框）
- 有状态工具（待办列表、连接池）
- 外部集成（文件监视、webhook、CI 触发）
- 等待时的小游戏（参见 `snake.ts` 示例）

工作实现见 [examples/extensions/](../examples/extensions/)。

## 目录 {#table-of-contents}

- [快速开始](#quick-start)
- [扩展位置](#extension-locations)
- [可用导入](#available-imports)
- [编写扩展](#writing-an-extension)
  - [扩展风格](#extension-styles)
- [事件](#events)
  - [生命周期概览](#lifecycle-overview)
  - [资源事件](#resource-events)
  - [会话事件](#session-events)
  - [Agent 事件](#agent-events)
  - [模型事件](#model-events)
  - [工具事件](#tool-events)
- [ExtensionContext](#extensioncontext)
- [ExtensionCommandContext](#extensioncommandcontext)
- [ExtensionAPI 方法](#extensionapi-methods)
- [状态管理](#state-management)
- [自定义工具](#custom-tools)
  - [动态工具加载](#dynamic-tool-loading)
- [自定义 UI](#custom-ui)
- [错误处理](#error-handling)
- [模式行为](#mode-behavior)
- [示例参考](#examples-reference)

## 快速开始 {#quick-start}

创建 `~/.pi/agent/extensions/my-extension.ts`：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // 响应事件
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Extension loaded!", "info");
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });

  // 注册自定义工具
  pi.registerTool({
    name: "greet",
    label: "Greet",
    description: "Greet someone by name",
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

  // 注册命令
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello ${args || "world"}!`, "info");
    },
  });
}
```

使用 `--extension`（或 `-e`）标志测试：

```bash
pi -e ./my-extension.ts
```

## 扩展位置 {#extension-locations}

> **安全：** 扩展以你的完整系统权限运行，并可执行任意代码。只从你信任的来源安装。

扩展会从受信任位置自动发现。项目本地的 `.pi/extensions` 条目仅在项目被信任后才会加载。

| 位置 | 范围 |
|----------|-------|
| `~/.pi/agent/extensions/*.ts` | 全局（所有项目） |
| `~/.pi/agent/extensions/*/index.ts` | 全局（子目录） |
| `.pi/extensions/*.ts` | 项目本地 |
| `.pi/extensions/*/index.ts` | 项目本地（子目录） |

可通过 `settings.json` 添加额外路径：

```json
{
  "packages": [
    "npm:@foo/bar@1.0.0",
    "git:github.com/user/repo@v1"
  ],
  "extensions": [
    "/path/to/local/extension.ts",
    "/path/to/local/extension/dir"
  ]
}
```

要通过 npm 或 git 以 pi 包的形式共享扩展，参见 [packages.md](packages.md)。

## 可用导入 {#available-imports}

| 包 | 用途 |
|---------|---------|
| `@earendil-works/pi-coding-agent` | 扩展类型（`ExtensionAPI`、`ExtensionContext`、事件） |
| `typebox` | 工具参数的 schema 定义 |
| `@earendil-works/pi-ai` | AI 工具（用于 Google 兼容枚举的 `StringEnum`） |
| `@earendil-works/pi-tui` | 用于自定义渲染的 TUI 组件 |

npm 依赖也可以用。在扩展旁边（或上级目录）添加 `package.json`，运行 `npm install`，来自 `node_modules/` 的导入会自动解析。

对于通过 `pi install` 安装的已分发 pi 包（npm 或 git），运行时依赖必须放在 `dependencies` 中。包安装默认使用生产安装（`npm install --omit=dev`），因此运行时不可用 `devDependencies`；当配置了 `npmCommand` 时，git 包会使用普通 `install`，以便与包装器兼容。

Node.js 内置模块（`node:fs`、`node:path` 等）同样可用。

## 编写扩展 {#writing-an-extension}

扩展导出一个接收 `ExtensionAPI` 的默认工厂函数。该工厂可以是同步或异步的：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 订阅事件
  pi.on("event_name", async (event, ctx) => {
    // ctx.ui 用于用户交互
    const ok = await ctx.ui.confirm("Title", "Are you sure?");
    ctx.ui.notify("Done!", "info");
    ctx.ui.setStatus("my-ext", "Processing...");  // 页脚状态
    ctx.ui.setWidget("my-ext", ["Line 1", "Line 2"]);  // 编辑器上方的 widget（默认）
  });

  // 注册工具、命令、快捷键、标志
  pi.registerTool({ ... });
  pi.registerCommand("name", { ... });
  pi.registerShortcut("ctrl+x", { ... });
  pi.registerFlag("my-flag", { ... });
}
```

扩展通过 [jiti](https://github.com/unjs/jiti) 加载，因此 TypeScript 无需编译即可使用。

如果工厂返回 `Promise`，pi 会在继续启动前等待它完成。这意味着异步初始化会在 `session_start`、`resources_discover` 之前完成，也在通过 `pi.registerProvider()` 排队的 provider 注册被刷新之前完成。

### 异步工厂函数 {#async-factory-functions}

对一次性启动工作使用异步工厂，例如拉取远程配置或动态发现可用模型。

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
  const response = await fetch("http://localhost:1234/v1/models");
  const payload = (await response.json()) as {
    data: Array<{
      id: string;
      name?: string;
      context_window?: number;
      max_tokens?: number;
    }>;
  };

  pi.registerProvider("local-openai", {
    baseUrl: "http://localhost:1234/v1",
    apiKey: "$LOCAL_OPENAI_API_KEY",
    api: "openai-completions",
    models: payload.data.map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.context_window ?? 128000,
      maxTokens: model.max_tokens ?? 4096,
    })),
  });
}
```

这种模式使拉取到的模型在正常启动期间以及 `pi --list-models` 中都可用。

### 长生命周期资源与关闭 {#long-lived-resources-and-shutdown}

扩展工厂可能在从未启动会话的调用中运行。不要在工厂中启动后台资源，例如进程、套接字、文件监视器或定时器。

将后台资源启动推迟到 `session_start`，或推迟到真正需要该资源的命令/工具/事件。注册一个幂等的 `session_shutdown` 处理函数，以关闭你启动的任何会话范围资源。

### 扩展风格 {#extension-styles}

**单文件** - 最简单，适合小型扩展：

```
~/.pi/agent/extensions/
└── my-extension.ts
```

**带 index.ts 的目录** - 适合多文件扩展：

```
~/.pi/agent/extensions/
└── my-extension/
    ├── index.ts        # 入口点（导出默认函数）
    ├── tools.ts        # 辅助模块
    └── utils.ts        # 辅助模块
```

**带依赖的包** - 适合需要 npm 包的扩展：

```
~/.pi/agent/extensions/
└── my-extension/
    ├── package.json    # 声明依赖和入口点
    ├── package-lock.json
    ├── node_modules/   # npm install 之后
    └── src/
        └── index.ts
```

```json
// package.json
{
  "name": "my-extension",
  "dependencies": {
    "zod": "^3.0.0",
    "chalk": "^5.0.0"
  },
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

在扩展目录中运行 `npm install`，之后来自 `node_modules/` 的导入会自动生效。

## 事件 {#events}

### 生命周期概览 {#lifecycle-overview}

```
pi starts
  │
  ├─► project_trust（仅用户/全局和 CLI 扩展，在项目资源加载之前）
  ├─► session_start { reason: "startup" }
  └─► resources_discover { reason: "startup" }
      │
      ▼
用户发送提示 ─────────────────────────────────────────┐
  │                                                        │
  ├─►（先检查扩展命令，找到则绕过）  │
  ├─► input（可拦截、转换或自行处理）          │
  ├─►（若未处理则进行 skill/template 展开）            │
  ├─► before_agent_start（可注入消息、修改系统提示）
  ├─► agent_start                                          │
  ├─► message_start / message_update / message_end         │
  │                                                        │
  │   ┌─── turn（LLM 调用工具时会重复） ───┐       │
  │   │                                            │       │
  │   ├─► turn_start                               │       │
  │   ├─► context（可修改消息）            │       │
  │   ├─► before_provider_headers（可变更 headers）     |
  │   ├─► before_provider_request（可检查或替换 payload）
  │   ├─► after_provider_response（status + headers，在消费 stream 之前）
  │   │                                            │       │
  │   │   LLM 响应，可能调用工具：            │       │
  │   │     ├─► tool_execution_start               │       │
  │   │     ├─► tool_call（可拦截）              │       │
  │   │     ├─► tool_execution_update              │       │
  │   │     ├─► tool_result（可修改）           │       │
  │   │     └─► tool_execution_end                 │       │
  │   │                                            │       │
  │   └─► turn_end                                 │       │
  │                                                        │
  ├─► agent_end                                            │
  └─► agent_settled（没有剩余的 retry/compaction/follow-up）   │
                                                           │
用户发送另一条提示 ◄────────────────────────────────┘

/new（新会话）或 /resume（切换会话）
  ├─► session_before_switch（可取消）
  ├─► session_shutdown
  ├─► session_start { reason: "new" | "resume", previousSessionFile? }
  └─► resources_discover { reason: "startup" }

/fork 或 /clone
  ├─► session_before_fork（可取消）
  ├─► session_shutdown
  ├─► session_start { reason: "fork", previousSessionFile }
  └─► resources_discover { reason: "startup" }

/name 或 pi.setSessionName()
  └─► session_info_changed

/compact 或自动压缩
  ├─► session_before_compact（可取消或自定义）
  ├─► session_compact（成功）
  └─► session_compact_failed（失败或中止）

/tree 导航
  ├─► session_before_tree（可取消或自定义）
  └─► session_tree

/model 或 Ctrl+P（模型选择/循环）
  ├─► thinking_level_select（如果模型变更会改变/钳制 thinking level）
  └─► model_select

thinking level 变化（settings、快捷键、pi.setThinkingLevel()）
  └─► thinking_level_select

退出（Ctrl+C、Ctrl+D、SIGHUP、SIGTERM）
  └─► session_shutdown
```

### 启动事件 {#startup-events}

#### project_trust {#project_trust}

在 pi 决定是否信任带有动态配置（`.pi` 或 `.agents/skills`）的项目之前触发。它在启动期间运行，以及当会话替换（例如 `/resume`）进入当前进程尚未解析信任状态的 cwd 时运行。只有用户/全局扩展和 CLI `-e` 扩展会参与；项目本地扩展在信任解析完成之前不会加载。

```typescript
pi.on("project_trust", async (event, ctx) => {
  // event.cwd - 当前工作目录
  // ctx 具有有限的信任上下文：cwd、mode、hasUI，以及 select/confirm/input/notify UI 辅助方法
  if (await ctx.ui.confirm("Trust project?", event.cwd)) {
    return { trusted: "yes", remember: true };
  }
  return { trusted: "undecided" };
});
```

`project_trust` 处理函数必须返回 `{ trusted: "yes" | "no" | "undecided" }`。返回 `"yes"` 或 `"no"` 的用户/全局或 CLI 扩展拥有该决策权；第一个 yes/no 决策生效，并抑制内置信任提示。使用 `remember: true` 持久化 yes/no 决策；否则它仅应用于当前进程。返回 `"undecided"` 可让后续处理函数或内置信任流程决定。提示前请检查 `ctx.hasUI`。如果没有处理函数返回 yes/no，则继续正常信任解析：先应用已保存的 `trust.json` 决策，然后由 `defaultProjectTrust` 控制 pi 是询问、信任还是默认拒绝。

### 资源事件 {#resource-events}

#### resources_discover {#resources_discover}

在 `session_start` 之后触发，以便扩展贡献额外的 skill、prompt 和 theme 路径。
启动路径使用 `reason: "startup"`。重载使用 `reason: "reload"`。

```typescript
pi.on("resources_discover", async (event, _ctx) => {
  // event.cwd - 当前工作目录
  // event.reason - "startup" | "reload"
  return {
    skillPaths: ["/path/to/skills"],
    promptPaths: ["/path/to/prompts"],
    themePaths: ["/path/to/themes"],
  };
});
```

### 会话事件 {#session-events}

会话存储内部机制和 SessionManager API 参见 [Session Format](session-format.md)。

#### session_start {#session_start}

在会话启动、加载或重载时触发。

```typescript
pi.on("session_start", async (event, ctx) => {
  // event.reason - "startup" | "reload" | "new" | "resume" | "fork"
  // event.previousSessionFile - 对 "new"、"resume" 和 "fork" 存在
  ctx.ui.notify(`Session: ${ctx.sessionManager.getSessionFile() ?? "ephemeral"}`, "info");
});
```

#### session_info_changed {#session_info_changed}

当当前会话显示名称通过 `/name`、RPC 或 `pi.setSessionName()` 设置时触发。

```typescript
pi.on("session_info_changed", async (event, ctx) => {
  // event.name - 当前规范化名称，清除时为 undefined
  ctx.ui.notify(`Session renamed: ${event.name ?? "(none)"}`, "info");
});
```

#### session_before_switch {#session_before_switch}

在启动新会话（`/new`）或切换会话（`/resume`）之前触发。

```typescript
pi.on("session_before_switch", async (event, ctx) => {
  // event.reason - "new" 或 "resume"
  // event.targetSessionFile - 要切换到的会话（仅对 "resume"）

  if (event.reason === "new") {
    const ok = await ctx.ui.confirm("Clear?", "Delete all messages?");
    if (!ok) return { cancel: true };
  }
});
```

成功切换或新建会话后，pi 会为旧扩展实例发出 `session_shutdown`，为新会话重载并重新绑定扩展，然后发出带有 `reason: "new" | "resume"` 和 `previousSessionFile` 的 `session_start`。
在 `session_shutdown` 中做清理工作，然后在 `session_start` 中重新建立任何内存状态。

#### session_before_fork {#session_before_fork}

通过 `/fork` 分叉或通过 `/clone` 克隆时触发。

```typescript
pi.on("session_before_fork", async (event, ctx) => {
  // event.entryId - 所选条目的 ID
  // event.position - /fork 为 "before"，/clone 为 "at"
  return { cancel: true }; // 取消 fork/clone
  // 或者
  return { skipConversationRestore: true }; // 预留给未来的对话恢复控制
});
```

成功 fork 或 clone 后，pi 会为旧扩展实例发出 `session_shutdown`，为新会话重载并重新绑定扩展，然后发出带有 `reason: "fork"` 和 `previousSessionFile` 的 `session_start`。
在 `session_shutdown` 中做清理工作，然后在 `session_start` 中重新建立任何内存状态。

#### session_before_compact / session_compact / session_compact_failed {#session_before_compact-session_compact-session_compact_failed}

在压缩时触发。详情参见 [compaction.md](compaction.md)。

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, reason, willRetry, signal } = event;

  // reason - "manual"（/compact）、"threshold" 或 "overflow"
  // willRetry - 中止的 turn 是否在压缩后重试（overflow 恢复）

  // 取消：
  return { cancel: true };

  // 自定义摘要：
  return {
    compaction: {
      summary: "...",
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      // usage: summaryResponse.usage, // 可选；会计入会话总计
    }
  };
});

pi.on("session_compact", async (event, ctx) => {
  // event.compactionEntry - 已保存的压缩
  // event.fromExtension - 是否由扩展提供
  // event.reason - "manual"（/compact）、"threshold" 或 "overflow"
  // event.willRetry - 中止的 turn 是否在压缩后重试（overflow 恢复）
});

pi.on("session_compact_failed", async (event, ctx) => {
  // event.reason - "manual"（/compact）、"threshold" 或 "overflow"
  // event.errorMessage - 非中止失败时存在
  // event.aborted - 对取消/中止的压缩为 true
  // event.willRetry - 中止的 turn 是否本应在压缩后重试
  // event.fromExtension - 是否正在使用扩展提供的压缩内容
});
```

#### session_before_tree / session_tree {#session_before_tree-session_tree}

在 `/tree` 导航时触发。树导航概念参见 [Sessions](sessions.md)。

```typescript
pi.on("session_before_tree", async (event, ctx) => {
  const { preparation, signal } = event;
  return { cancel: true };
  // 或者提供自定义摘要：
  return {
    summary: {
      summary: "...",
      // usage: summaryResponse.usage, // 可选；会计入会话总计
      details: {},
    },
  };
});

pi.on("session_tree", async (event, ctx) => {
  // event.newLeafId, oldLeafId, summaryEntry, fromExtension
});
```

#### session_shutdown {#session_shutdown}

在已启动的会话运行时被拆除之前触发。用它清理从 `session_start` 或其他会话范围钩子打开的资源。

```typescript
pi.on("session_shutdown", async (event, ctx) => {
  // event.reason - "quit" | "reload" | "new" | "resume" | "fork"
  // event.targetSessionFile - 会话替换流程的目标会话
  // 清理、保存状态等
});
```

### Agent 事件 {#agent-events}

#### before_agent_start {#before_agent_start}

在用户提交提示之后、agent 循环之前触发。可以注入消息和/或修改系统提示。

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  // event.prompt - 用户的提示文本
  // event.images - 附加的图片（如果有）
  // event.systemPrompt - 当前处理函数的链式系统提示
  //   （包含更早 before_agent_start 处理函数的更改）
  // event.systemPromptOptions - 用于构建系统提示的结构化选项
  //   .customPrompt - 任何自定义系统提示（来自 --system-prompt、SYSTEM.md 或自定义模板）
  //   .selectedTools - 当前在提示中处于活动状态的工具
  //   .toolSnippets - 每个工具的一行描述
  //   .promptGuidelines - 自定义指南条目
  //   .appendSystemPrompt - 来自 --append-system-prompt 标志的文本
  //   .cwd - 工作目录
  //   .contextFiles - AGENTS.md 文件及其他已加载的上下文文件
  //   .skills - 已加载的 skills

  return {
    // 注入一条持久消息（存储在会话中，发送给 LLM）
    message: {
      customType: "my-extension",
      content: "Additional context for the LLM",
      display: true,
    },
    // 替换本轮系统提示（跨扩展链式传递）
    systemPrompt: event.systemPrompt + "\n\nExtra instructions for this turn...",
  };
});
```

`systemPromptOptions` 字段让扩展可以访问 Pi 用于构建系统提示的同一份结构化数据。这样你可以检查 Pi 已加载的内容——自定义提示、指南、工具摘要、上下文文件、skills——而无需重新发现资源或重新解析标志。当你的扩展需要在尊重用户配置的同时，对系统提示做深入、有依据的修改时，使用它。

在 `before_agent_start` 内部，`event.systemPrompt` 和 `ctx.getSystemPrompt()` 都反映截至当前处理函数的链式系统提示。后续的 `before_agent_start` 处理函数仍可再次修改它。

#### agent_start / agent_end / agent_settled {#agent_start-agent_end-agent_settled}

`agent_start` 在底层 agent 运行开始时触发。`agent_end` 在该次运行结束时触发，但 Pi 仍可能自动重试、自动压缩并重试，或继续处理排队的后续消息。对需要知道 Pi 不会再自动继续运行的状态集成，使用 `agent_settled`。

```typescript
pi.on("agent_start", async (_event, ctx) => {});

pi.on("agent_end", async (event, ctx) => {
  // event.messages - 此次底层运行中的消息
});

pi.on("agent_settled", async (_event, ctx) => {
  // 除非另一个扩展启动了新的运行，否则此处 ctx.isIdle() 为 true。
});
```

#### ui_prompt_start / ui_prompt_end {#ui_prompt_start-ui_prompt_end}

面向用户的阻塞式扩展 UI 提示的仅通知生命周期事件。它们围绕 `ctx.ui.select()`、`ctx.ui.confirm()`、`ctx.ui.input()`、`ctx.ui.editor()` 和 `ctx.ui.custom()` 触发，以便宿主/状态集成可以报告“正在等待用户”，而不仅仅是“正在运行”。

嵌套或重叠的提示会合并为一段外层等待区间。处理函数以尽力而为方式调用，在显示或关闭提示前不会被等待。

```typescript
pi.on("ui_prompt_start", async (event, ctx) => {
  // event.reason === "ui_prompt"
  // event.kind: "select" | "confirm" | "input" | "editor" | "custom"
  // event.title: 可用时的提示标题
});

pi.on("ui_prompt_end", async (event, ctx) => {
  // Pi 不再等待该 UI 提示区间。
});
```

#### turn_start / turn_end {#turn_start-turn_end}

对每一轮（一次 LLM 响应 + 工具调用）触发。

```typescript
pi.on("turn_start", async (event, ctx) => {
  // event.turnIndex, event.timestamp
});

pi.on("turn_end", async (event, ctx) => {
  // event.turnIndex, event.message, event.toolResults
});
```

#### message_start / message_update / message_end {#message_start-message_update-message_end}

针对消息生命周期更新触发。

- `message_start` 和 `message_end` 对 user、assistant 和 toolResult 消息触发。
- `message_update` 对 assistant 流式更新触发。
- `message_end` 处理函数可以返回 `{ message }` 以替换最终确定的消息。替换必须保持相同的 `role`。

```typescript
pi.on("message_start", async (event, ctx) => {
  // event.message
});

pi.on("message_update", async (event, ctx) => {
  // event.message
  // event.assistantMessageEvent（逐 token 的流事件）
});

pi.on("message_end", async (event, ctx) => {
  if (event.message.role !== "assistant") return;

  return {
    message: {
      ...event.message,
      usage: {
        ...event.message.usage,
        cost: {
          ...event.message.usage.cost,
          total: 0.123,
        },
      },
    },
  };
});
```

#### tool_execution_start / tool_execution_update / tool_execution_end {#tool_execution_start-tool_execution_update-tool_execution_end}

针对工具执行生命周期更新触发。

在并行工具模式下：
- `tool_execution_start` 在预检阶段按 assistant 源顺序发出
- `tool_execution_update` 事件可能跨工具交错
- `tool_execution_end` 在每个工具最终确定后按工具完成顺序发出
- 最终的 `toolResult` 消息事件仍稍后按 assistant 源顺序发出

```typescript
pi.on("tool_execution_start", async (event, ctx) => {
  // event.toolCallId, event.toolName, event.args
});

pi.on("tool_execution_update", async (event, ctx) => {
  // event.toolCallId, event.toolName, event.args, event.partialResult
});

pi.on("tool_execution_end", async (event, ctx) => {
  // event.toolCallId, event.toolName, event.result, event.isError
});
```

#### context {#context}

在每次 LLM 调用之前触发。以非破坏性方式修改消息。消息类型参见 [Session Format](session-format.md)。

```typescript
pi.on("context", async (event, ctx) => {
  // event.messages - 深拷贝，可安全修改
  const filtered = event.messages.filter(m => !shouldPrune(m));
  return { messages: filtered };
});
```

#### before_provider_headers {#before_provider_headers}

在组装完即将发出的 HTTP headers 之后触发。用它添加、覆盖或移除请求头。

处理函数就地修改 `event.headers`。将某个键设为字符串以添加或覆盖，设为 `null` 以删除。

```typescript
pi.on("before_provider_headers", (event, ctx) => {
  // 添加或覆盖 — 例如用于网关追踪/归因的 session id
  event.headers["x-session-id"] = ctx.sessionManager.getSessionId();

  // 删除 pi 为本调用添加的追踪头
  event.headers["X-OpenRouter-Title"] = null;
});
```

每个 provider 请求运行一次；重试会复用相同 headers，而不会再次触发该钩子。

#### before_provider_request {#before_provider_request}

在构建完 provider 特定 payload 之后、请求即将发送之前触发。处理函数按扩展加载顺序运行。返回 `undefined` 保持 payload 不变。返回任何其他值会替换后续处理函数以及实际请求使用的 payload。

此钩子可以改写 provider 级系统指令，或将其完全移除。这些 payload 级更改不会反映在 `ctx.getSystemPrompt()` 中，后者报告的是 Pi 的系统提示字符串，而不是最终序列化的 provider payload。

```typescript
pi.on("before_provider_request", (event, ctx) => {
  console.log(JSON.stringify(event.payload, null, 2));

  // 可选：替换 payload
  // return { ...event.payload, temperature: 0 };
});
```

这主要用于调试 provider 序列化和缓存行为。

#### after_provider_response {#after_provider_response}

在收到 HTTP 响应之后、消费其 stream body 之前触发。处理函数按扩展加载顺序运行。

```typescript
pi.on("after_provider_response", (event, ctx) => {
  // event.status - HTTP 状态码
  // event.headers - 规范化后的响应头
  if (event.status === 429) {
    console.log("rate limited", event.headers["retry-after"]);
  }
});
```

header 可用性取决于 provider 和传输层。抽象 HTTP 响应的 provider 可能不暴露 headers。

### 模型事件 {#model-events}

#### model_select {#model_select}

当模型通过 `/model` 命令、模型循环（`Ctrl+P`）或会话恢复而改变时触发。

```typescript
pi.on("model_select", async (event, ctx) => {
  // event.model - 新选中的模型
  // event.previousModel - 之前的模型（首次选择时为 undefined）
  // event.source - "set" | "cycle" | "restore"

  const prev = event.previousModel
    ? `${event.previousModel.provider}/${event.previousModel.id}`
    : "none";
  const next = `${event.model.provider}/${event.model.id}`;

  ctx.ui.notify(`Model changed (${event.source}): ${prev} -> ${next}`, "info");
});
```

用它在活动模型改变时更新 UI 元素（状态栏、页脚）或执行模型特定的初始化。

#### thinking_level_select {#thinking_level_select}

在 thinking level 改变时触发。这是仅通知事件；处理函数的返回值会被忽略。

```typescript
pi.on("thinking_level_select", async (event, ctx) => {
  // event.level - 新选中的 thinking level
  // event.previousLevel - 之前的 thinking level

  ctx.ui.setStatus("thinking", `thinking: ${event.level}`);
});
```

当 `pi.setThinkingLevel()`、模型变更或内置 thinking-level 控件改变当前 thinking level 时，用它更新扩展 UI。

### 工具事件 {#tool-events}

#### tool_call {#tool_call}

在 `tool_execution_start` 之后、工具执行之前触发。**可以拦截。** 使用 `isToolCallEventType` 进行收窄并获得类型化输入。

在 `tool_call` 运行之前，pi 会等待先前发出的 Agent 事件通过 `AgentSession` 排空。这意味着 `ctx.sessionManager` 已更新到当前 assistant 工具调用消息。

在默认的并行工具执行模式下，同一 assistant 消息中的兄弟工具调用会按顺序预检，然后并发执行。不能保证 `tool_call` 能在 `ctx.sessionManager` 中看到同一 assistant 消息中兄弟工具的结果。

`event.input` 是可变的。就地修改它可以在执行前修补工具参数。

行为保证：
- 对 `event.input` 的修改会影响实际工具执行
- 后续 `tool_call` 处理函数会看到先前处理函数所做的修改
- 修改后不会重新执行校验
- `tool_call` 的返回值通过 `{ block: true, reason?: string, terminate?: boolean }` 控制拦截
- `terminate` 仅适用于被拦截的调用；仅当批次中每个最终确定的结果都是 terminating 时，agent 才会提前停止

```typescript
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
  // event.toolName - "bash"、"read"、"write"、"edit" 等。
  // event.toolCallId
  // event.input - 工具参数（可变）

  // 内置工具：不需要类型参数
  if (isToolCallEventType("bash", event)) {
    // event.input 为 { command: string; timeout?: number }
    event.input.command = `source ~/.profile\n${event.input.command}`;

    if (event.input.command.includes("rm -rf")) {
      return { block: true, reason: "Dangerous command", terminate: true };
    }
  }

  if (isToolCallEventType("read", event)) {
    // event.input 为 { path: string; offset?: number; limit?: number }
    console.log(`Reading: ${event.input.path}`);
  }
});
```

#### 为自定义工具输入添加类型 {#typing-custom-tool-input}

自定义工具应导出其输入类型：

```typescript
// my-extension.ts
export type MyToolInput = Static<typeof myToolSchema>;
```

对 `isToolCallEventType` 使用显式类型参数：

```typescript
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { MyToolInput } from "my-extension";

pi.on("tool_call", (event) => {
  if (isToolCallEventType<"my_tool", MyToolInput>("my_tool", event)) {
    event.input.action;  // 已类型化
  }
});
```

#### tool_result {#tool_result}

在工具执行完成之后、`tool_execution_end` 以及最终工具结果消息事件发出之前触发。**可以修改结果。**

在并行工具模式下，`tool_result` 和 `tool_execution_end` 可能按工具完成顺序交错，而最终的 `toolResult` 消息事件仍稍后按 assistant 源顺序发出。

`tool_result` 处理函数像中间件一样链式运行：
- 处理函数按扩展加载顺序运行
- 每个处理函数看到的是先前处理函数更改后的最新结果
- 处理函数可以返回部分补丁（`content`、`details`、`isError` 或 `usage`）；省略的字段保留当前值

在处理函数内部的嵌套异步工作中使用 `ctx.signal`。这让 Esc 可以取消模型调用、`fetch()` 以及扩展启动的其他可中止操作。

```typescript
import { isBashToolResult } from "@earendil-works/pi-coding-agent";

pi.on("tool_result", async (event, ctx) => {
  // event.toolName, event.toolCallId, event.input
  // event.content, event.details, event.isError, event.usage

  if (isBashToolResult(event)) {
    // event.details 类型为 BashToolDetails
  }

  const response = await fetch("https://example.com/summarize", {
    method: "POST",
    body: JSON.stringify({ content: event.content }),
    signal: ctx.signal,
  });

  // 修改结果：
  return { content: [...], details: {...}, isError: false, usage: nestedModelUsage };
});
```

### 用户 Bash 事件 {#user-bash-events}

#### user_bash {#user_bash}

当用户执行 `!` 或 `!!` 命令时触发。**可以拦截。**

```typescript
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";

pi.on("user_bash", (event, ctx) => {
  // event.command - bash 命令
  // event.excludeFromContext - 如果是 !! 前缀则为 true
  // event.cwd - 工作目录

  // 选项 1：提供自定义 operations（例如 SSH）
  return { operations: remoteBashOps };

  // 选项 2：包装 pi 的内置本地 bash 后端
  const local = createLocalBashOperations();
  return {
    operations: {
      exec(command, cwd, options) {
        return local.exec(`source ~/.profile\n${command}`, cwd, options);
      }
    }
  };

  // 选项 3：完全替换 - 直接返回结果
  return { result: { output: "...", exitCode: 0, cancelled: false, truncated: false } };
});
```

### 输入事件 {#input-events}

#### input {#input}

在收到用户输入时触发，发生在扩展命令检查之后、skill 和模板展开之前。该事件看到的是原始输入文本，因此 `/skill:foo` 和 `/template` 尚未展开。

**处理顺序：**
1. 先检查扩展命令（`/cmd`）- 如果找到，则运行处理函数并跳过 input 事件
2. 触发 `input` 事件 - 可以拦截、转换或自行处理
3. 如果未处理：skill 命令（`/skill:name`）展开为 skill 内容
4. 如果未处理：prompt 模板（`/template`）展开为模板内容
5. 开始 agent 处理（`before_agent_start` 等）

```typescript
pi.on("input", async (event, ctx) => {
  // event.text - 原始输入（skill/template 展开之前）
  // event.images - 附加的图片（如果有）
  // event.source - "interactive"（键入）、"rpc"（API）或 "extension"（通过 sendUserMessage）
  // event.streamingBehavior - "steer" | "followUp" | undefined
  //   空闲时为 undefined，流中途打断为 "steer"，
  //   排队直到 agent 完成的消息为 "followUp"

  // 转换：在展开前改写输入
  if (event.text.startsWith("?quick "))
    return { action: "transform", text: `Respond briefly: ${event.text.slice(7)}` };

  // 处理：不经过 LLM 直接响应（扩展显示自己的反馈）
  if (event.text === "ping") {
    ctx.ui.notify("pong", "info");
    return { action: "handled" };
  }

  // 按来源路由：跳过对扩展注入消息的处理
  if (event.source === "extension") return { action: "continue" };

  // 在展开前拦截 skill 命令
  if (event.text.startsWith("/skill:")) {
    // 可以转换、拦截或放行
  }

  return { action: "continue" };  // 默认：放行到展开
});
```

**结果：**
- `continue` - 原样放行（处理函数无返回值时的默认行为）
- `transform` - 修改文本/图片，然后继续展开
- `handled` - 完全跳过 agent（第一个返回此值的处理函数生效）

转换会跨处理函数链式进行。感知 `streamingBehavior` 的路由参见 [input-transform.ts](../examples/extensions/input-transform.ts) 和 [input-transform-streaming.ts](../examples/extensions/input-transform-streaming.ts)。

## ExtensionContext {#extensioncontext}

所有处理函数都接收 `ctx: ExtensionContext`。

### ctx.ui {#ctxui}

用于用户交互的 UI 方法。完整细节参见 [自定义 UI](#custom-ui)。

### ctx.mode {#ctxmode}

当前运行模式：`"tui"`、`"rpc"`、`"json"` 或 `"print"`。使用 `ctx.mode === "tui"` 来保护仅终端功能，例如 `custom()`、组件工厂、终端输入和直接 TUI 渲染。

### ctx.hasUI {#ctxhasui}

在 TUI 和 RPC 模式下为 `true`。在 print 模式（`-p`）和 JSON 模式下为 `false`。用它保护在 TUI 和 RPC 模式下都可用的对话框方法（`select`、`confirm`、`input`、`editor`）以及即发即忘方法（`notify`、`setStatus`、`setWidget`、`setTitle`、`setEditorText`）。在 RPC 模式下，部分 TUI 特定方法是空操作或返回默认值（参见 [rpc.md](rpc.md#extension-ui-protocol)）。

### ctx.cwd {#ctxcwd}

当前工作目录。

构造项目本地配置路径时，使用 `CONFIG_DIR_NAME` 而不是硬编码 `.pi`。重品牌发行版可以使用不同的配置目录名。

```typescript
import { CONFIG_DIR_NAME, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    const projectConfigPath = join(ctx.cwd, CONFIG_DIR_NAME, "my-extension.json");
    // ...
  });
}
```

### ctx.isProjectTrusted() {#ctxisprojecttrusted}

返回当前会话上下文中项目本地信任是否处于活动状态。这包括临时信任决策和 CLI 信任覆盖，而不仅仅是全局信任存储中已保存的决策。

在读取仅应在受信任项目中生效的项目本地扩展配置之前使用此方法。

### ctx.sessionManager {#ctxsessionmanager}

对会话状态的只读访问。完整 SessionManager API 和条目类型参见 [Session Format](session-format.md)。

对于 `tool_call`，该状态在处理函数运行前会同步到当前 assistant 消息。在并行工具执行模式下，仍不保证包含同一 assistant 消息中兄弟工具的结果。

```typescript
ctx.sessionManager.getEntries()             // 所有条目
ctx.sessionManager.getBranch()              // 当前分支
ctx.sessionManager.buildContextEntries()    // 已应用压缩的活动分支条目
ctx.sessionManager.getLeafId()              // 当前叶子条目 ID
```

### ctx.modelRegistry / ctx.model / ctx.thinkingLevel / ctx.scopedModels {#ctxmodelregistry-ctxmodel-ctxthinkinglevel-ctxscopedmodels}

访问模型、provider 和已解析的认证。`ctx.modelRegistry.getProvider(id)` 返回有效的 pi-ai provider，而 `getProviderAuth(id)` 解析其当前 API key、headers、base URL 以及 provider 范围的环境，无需已加载的模型。`ctx.model` 是活动模型，`ctx.thinkingLevel` 是其当前有效 thinking level。

`ctx.scopedModels` 是限定到当前会话的只读模型列表——与 `/scoped-models` 命令显示的集合相同。它在会话启动时根据 `--models` CLI 标志和 `enabledModels` 设置解析（用 minimatch 对照可用目录匹配 `provider/modelId` 或裸 `modelId`）。未配置范围限定时为空，表示所有可用模型都可使用。每个条目是 `{ model, thinkingLevel? }`，仅当某个模式钉住了 thinking level 时才设置 `thinkingLevel`（例如 `anthropic/*:high`）。用它填充镜像内置选择器的模型选择器，而不是通过 `ctx.modelRegistry.getAvailable()` 枚举整个目录。

### ctx.signal {#ctxsignal}

当前 agent 中止信号；当没有活动 agent turn 时为 `undefined`。

用于扩展处理函数启动的可中止嵌套工作，例如：
- `fetch(..., { signal: ctx.signal })`
- 接受 `signal` 的模型调用
- 接受 `AbortSignal` 的文件或进程辅助函数

`ctx.signal` 通常在活动 turn 事件中定义，例如 `tool_call`、`tool_result`、`message_update` 和 `turn_end`。
在空闲或非 turn 上下文中通常为 `undefined`，例如会话事件、扩展命令，以及 pi 空闲时触发的快捷键。

```typescript
pi.on("tool_result", async (event, ctx) => {
  const response = await fetch("https://example.com/api", {
    method: "POST",
    body: JSON.stringify(event),
    signal: ctx.signal,
  });

  const data = await response.json();
  return { details: data };
});
```

### ctx.isIdle() / ctx.abort() / ctx.hasPendingMessages() {#ctxisidle-ctxabort-ctxhaspendingmessages}

控制流辅助方法。当 Pi 正在处理 agent 运行、自动重试、自动压缩重试或排队的续传时，`ctx.isIdle()` 为 false。

### ctx.shutdown() {#ctxshutdown}

请求优雅关闭 pi。

- **交互模式：** 推迟到 agent 变为空闲（处理完所有排队的 steering 和 follow-up 消息之后）。
- **RPC 模式：** 推迟到下一个空闲状态（完成当前命令响应后，等待下一条命令时）。
- **Print 模式：** 空操作。所有提示处理完后进程会自动退出。

退出前向所有扩展发出 `session_shutdown` 事件。在所有上下文中可用（事件处理函数、工具、命令、快捷键）。

```typescript
pi.on("tool_call", (event, ctx) => {
  if (isFatal(event.input)) {
    ctx.shutdown();
  }
});
```

### ctx.getContextUsage() {#ctxgetcontextusage}

返回当前活动模型的上下文用量。优先使用最近一次 assistant usage，然后估算尾部消息的 token。

```typescript
const usage = ctx.getContextUsage();
if (usage && usage.tokens > 100_000) {
  // ...
}
```

### ctx.compact() {#ctxcompact}

触发压缩而不等待完成。使用 `onComplete` 和 `onError` 做后续动作。

```typescript
ctx.compact({
  customInstructions: "Focus on recent changes",
  onComplete: (result) => {
    ctx.ui.notify("Compaction completed", "info");
  },
  onError: (error) => {
    ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
  },
});
```

### ctx.getSystemPrompt() {#ctxgetsystemprompt}

返回 Pi 当前的系统提示字符串。

- 在 `before_agent_start` 期间，这反映截至当前 turn 已发生的链式系统提示更改。
- 它不包含后续的 `context` 消息变更。
- 它不包含 `before_provider_request` 的 payload 改写。
- 如果后加载的扩展在你之后运行，它们仍可改变最终发送的内容。

```typescript
pi.on("before_agent_start", (event, ctx) => {
  const prompt = ctx.getSystemPrompt();
  console.log(`System prompt length: ${prompt.length}`);
});
```

## ExtensionCommandContext {#extensioncommandcontext}

命令处理函数接收 `ExtensionCommandContext`，它在 `ExtensionContext` 基础上扩展了会话控制方法。这些方法仅在命令中可用，因为从事件处理函数中调用它们可能导致死锁。

### ctx.getSystemPromptOptions() {#ctxgetsystempromptoptions}

返回 Pi 当前用于构建系统提示的基础输入。

```typescript
const options = ctx.getSystemPromptOptions();
const contextPaths = options.contextFiles?.map((file) => file.path) ?? [];
```

这与 `before_agent_start` 的 `event.systemPromptOptions` 具有相同的形状和可变性：自定义提示、活动工具、工具摘要、提示指南、追加的系统提示文本、cwd、已加载的上下文文件，以及已加载的 skills。它可能包含完整的上下文文件内容，因此应将其视为敏感的扩展本地数据，避免通过命令列表、日志或自动补全元数据暴露。

这报告的是当前基础提示输入。它不包含每轮 `before_agent_start` 的链式系统提示更改、后续 `context` 事件的消息变更，或 `before_provider_request` 的 payload 改写。

### ctx.waitForIdle() {#ctxwaitforidle}

等待 agent 完全稳定，包括自动重试、自动压缩重试和排队的续传：

```typescript
pi.registerCommand("my-cmd", {
  handler: async (args, ctx) => {
    await ctx.waitForIdle();
    // Agent 现已空闲，可以安全修改会话
  },
});
```

### ctx.newSession(options?) {#ctxnewsessionoptions}

创建新会话：

```typescript
const parentSession = ctx.sessionManager.getSessionFile();
const kickoff = "Continue in the replacement session";

const result = await ctx.newSession({
  parentSession,
  setup: async (sm) => {
    sm.appendMessage({
      role: "user",
      content: [{ type: "text", text: "Context from previous session..." }],
      timestamp: Date.now(),
    });
  },
  withSession: async (ctx) => {
    // 这里只使用替换会话的 ctx。
    await ctx.sendUserMessage(kickoff);
  },
});

if (result.cancelled) {
  // 某个扩展取消了新会话
}
```

选项：
- `parentSession`：记录在新会话头中的父会话文件
- `setup`：在 `withSession` 运行前修改新会话的 `SessionManager`
- `withSession`：针对全新的替换会话上下文运行切换后工作。不要使用捕获的旧 `pi` / 命令 `ctx`；参见 [会话替换生命周期与陷阱](#session-replacement-lifecycle-and-footguns)。

### ctx.fork(entryId, options?) {#ctxforkentryid-options}

从特定条目分叉，创建新的会话文件：

```typescript
const result = await ctx.fork("entry-id-123", {
  withSession: async (ctx) => {
    // 这里只使用替换会话的 ctx。
    ctx.ui.notify("Now in the forked session", "info");
  },
});
if (result.cancelled) {
  // 某个扩展取消了 fork
}

const cloneResult = await ctx.fork("entry-id-456", { position: "at" });
if (cloneResult.cancelled) {
  // 某个扩展取消了 clone
}
```

选项：
- `position`：`"before"`（默认）在所选用户消息之前分叉，并将该提示还原到编辑器
- `position`：`"at"` 复制经过所选条目的活动路径，不还原编辑器文本
- `withSession`：针对全新的替换会话上下文运行切换后工作。不要使用捕获的旧 `pi` / 命令 `ctx`；参见 [会话替换生命周期与陷阱](#session-replacement-lifecycle-and-footguns)。

### ctx.navigateTree(targetId, options?) {#ctxnavigatetreetargetid-options}

导航到会话树中的不同点：

```typescript
const result = await ctx.navigateTree("entry-id-456", {
  summarize: true,
  customInstructions: "Focus on error handling changes",
  replaceInstructions: false, // true = 完全替换默认提示
  label: "review-checkpoint",
});
```

选项：
- `summarize`：是否为被放弃的分支生成摘要
- `customInstructions`：给摘要器的自定义指令
- `replaceInstructions`：如果为 true，`customInstructions` 会替换默认提示，而不是追加
- `label`：附加到分支摘要条目的标签（若不摘要则附加到目标条目）

### ctx.switchSession(sessionPath, options?) {#ctxswitchsessionsessionpath-options}

切换到不同的会话文件：

```typescript
const result = await ctx.switchSession("/path/to/session.jsonl", {
  withSession: async (ctx) => {
    await ctx.sendUserMessage("Resume work in the replacement session");
  },
});
if (result.cancelled) {
  // 某个扩展通过 session_before_switch 取消了切换
}
```

选项：
- `withSession`：针对全新的替换会话上下文运行切换后工作。不要使用捕获的旧 `pi` / 命令 `ctx`；参见 [会话替换生命周期与陷阱](#session-replacement-lifecycle-and-footguns)。

要发现可用会话，使用静态的 `SessionManager.list()` 或 `SessionManager.listAll()` 方法：

```typescript
import { SessionManager } from "@earendil-works/pi-coding-agent";

pi.registerCommand("switch", {
  description: "Switch to another session",
  handler: async (args, ctx) => {
    const sessions = await SessionManager.list(ctx.cwd);
    if (sessions.length === 0) return;
    const choice = await ctx.ui.select(
      "Pick session:",
      sessions.map(s => s.file),
    );
    if (choice) {
      await ctx.switchSession(choice, {
        withSession: async (ctx) => {
          ctx.ui.notify("Switched session", "info");
        },
      });
    }
  },
});
```

### 会话替换生命周期与陷阱 {#session-replacement-lifecycle-and-footguns}

`withSession` 接收全新的 `ReplacedSessionContext`，它在 `ExtensionCommandContext` 基础上扩展了绑定到替换会话的异步 `sendMessage()` 和 `sendUserMessage()` 辅助方法。

生命周期与陷阱：
- `withSession` 仅在旧会话已发出 `session_shutdown`、旧运行时已被拆除、替换会话已重新绑定、且新扩展实例已收到 `session_start` 之后运行。
- 回调仍在原始闭包中执行，而不是在新扩展实例内部。这意味着你的旧扩展实例可能已经在 `withSession` 开始前运行了其关闭清理。
- 捕获的旧 `pi` / 旧命令 `ctx` 的会话绑定对象在替换后会过期，使用时会抛出。会话绑定工作只使用传给 `withSession` 的 `ctx`。
- 先前提取的原始对象仍由你负责。例如，如果在替换前捕获 `const sm = ctx.sessionManager`，`sm` 仍是旧的 `SessionManager` 对象。替换后不要复用它。
- `withSession` 中的代码应假定任何被你的 `session_shutdown` 处理函数失效的状态已经消失。只捕获能干净地在关闭后存活的纯数据，例如字符串、id 和序列化配置。

安全模式：

```typescript
pi.registerCommand("handoff", {
  handler: async (_args, ctx) => {
    const kickoff = "Continue from the replacement session";
    await ctx.newSession({
      withSession: async (ctx) => {
        await ctx.sendUserMessage(kickoff);
      },
    });
  },
});
```

不安全模式：

```typescript
pi.registerCommand("handoff", {
  handler: async (_args, ctx) => {
    const oldSessionManager = ctx.sessionManager;
    await ctx.newSession({
      withSession: async (_ctx) => {
        // 过期的旧对象：不要这样做
        oldSessionManager.getSessionFile();
        pi.sendUserMessage("wrong");
      },
    });
  },
});
```

### ctx.reload() {#ctxreload}

运行与 `/reload` 相同的重载流程。

```typescript
pi.registerCommand("reload-runtime", {
  description: "Reload extensions, skills, prompts, themes, and context files",
  handler: async (_args, ctx) => {
    await ctx.reload();
    return;
  },
});
```

重要行为：
- `await ctx.reload()` 会为当前扩展运行时发出 `session_shutdown`
- 然后它重载资源，并发出 `reason: "reload"` 的 `session_start` 以及 reason 为 `"reload"` 的 `resources_discover`
- 当前正在运行的命令处理函数仍在旧调用帧中继续
- `await ctx.reload()` 之后的代码仍来自重载前的版本
- `await ctx.reload()` 之后的代码不得假定旧的内存扩展状态仍然有效
- 处理函数返回后，未来的命令/事件/工具调用使用新的扩展版本

为了可预测的行为，将该处理函数中的 reload 视为终点（`await ctx.reload(); return;`）。

工具使用 `ExtensionContext` 运行，因此不能直接调用 `ctx.reload()`。用命令作为 reload 入口，然后暴露一个将命令作为 follow-up 用户消息排队的工具。

LLM 可调用以触发 reload 的示例工具：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("reload-runtime", {
    description: "Reload extensions, skills, prompts, themes, and context files",
    handler: async (_args, ctx) => {
      await ctx.reload();
      return;
    },
  });

  pi.registerTool({
    name: "reload_runtime",
    label: "Reload Runtime",
    description: "Reload extensions, skills, prompts, themes, and context files",
    parameters: Type.Object({}),
    async execute() {
      pi.sendUserMessage("/reload-runtime", { deliverAs: "followUp" });
      return {
        content: [{ type: "text", text: "Queued /reload-runtime as a follow-up command." }],
      };
    },
  });
}
```

## ExtensionAPI 方法 {#extensionapi-methods}

### pi.on(event, handler) {#pionevent-handler}

订阅事件。事件类型和返回值参见 [事件](#events)。

### pi.registerTool(definition) {#piregistertooldefinition}

注册供 LLM 调用的自定义工具。完整细节参见 [自定义工具](#custom-tools)。

`pi.registerTool()` 在扩展加载期间和启动之后都可以工作。你可以在 `session_start`、命令处理函数或其他事件处理函数中调用它。新工具会在同一会话中立即刷新，因此它们会出现在 `pi.getAllTools()` 中，并且无需 `/reload` 即可被 LLM 调用。

使用 `pi.setActiveTools()` 在运行时启用或禁用工具（包括动态添加的工具）。

使用 `promptSnippet` 让自定义工具以一行条目加入 `Available tools`，使用 `promptGuidelines` 在工具处于活动状态时向默认 `Guidelines` 部分追加工具特定条目。

**重要：** `promptGuidelines` 条目会扁平追加到 `Guidelines` 部分，没有工具名前缀。每条指南必须点名它所指的工具——避免写 “Use this tool when...”，因为 LLM 无法判断 “this” 指哪个工具。应写成 “Use my_tool when...”。

完整示例参见 [dynamic-tools.ts](../examples/extensions/dynamic-tools.ts)。

```typescript
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does",
  promptSnippet: "Summarize or transform text according to action",
  promptGuidelines: ["Use my_tool when the user asks to summarize previously generated text."],
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),
    text: Type.Optional(Type.String()),
  }),
  prepareArguments(args) {
    // 可选的兼容垫片。在 schema 校验之前运行。
    // 返回当前 schema 形状，例如将旧字段
    // 折叠进现代参数对象。
    return args;
  },

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // 流式进度
    onUpdate?.({ content: [{ type: "text", text: "Working..." }] });

    return {
      content: [{ type: "text", text: "Done" }],
      details: { result: "..." },
    };
  },

  // 可选：自定义渲染
  renderCall(args, theme, context) { ... },
  renderResult(result, options, theme, context) { ... },
});
```

### pi.sendMessage(message, options?) {#pisendmessagemessage-options}

向会话注入自定义消息。自定义消息会参与 LLM 上下文。对于不应发送给 LLM 的持久 TUI-only 内容，使用 [`pi.appendEntry()`](#piappendentrycustomtype-data) 配合 [`pi.registerEntryRenderer()`](#piregisterentryrenderercustomtype-renderer)。

```typescript
pi.sendMessage({
  customType: "my-extension",
  content: "Message text",
  display: true,
  details: { ... },
}, {
  triggerTurn: true,
  deliverAs: "steer",
});
```

**选项：**
- `deliverAs` - 投递模式：
  - `"steer"`（默认）- 在流式期间排队消息。在当前 assistant turn 完成其工具调用执行后、下一次 LLM 调用之前投递。
  - `"followUp"` - 等待 agent 完成。仅当 agent 没有更多工具调用时投递。
  - `"nextTurn"` - 排队到下一次用户提示。不中断也不触发任何内容。
- `triggerTurn: true` - 如果 agent 空闲，立即触发一次 LLM 响应。仅适用于 `"steer"` 和 `"followUp"` 模式（对 `"nextTurn"` 忽略）。

### pi.sendUserMessage(content, options?) {#pisendusermessagecontent-options}

向 agent 发送用户消息。与发送自定义消息的 `sendMessage()` 不同，这会发送一条看起来像用户键入的实际用户消息。始终触发一轮。

```typescript
// 简单文本消息
pi.sendUserMessage("What is 2+2?");

// 带内容数组（文本 + 图片）
pi.sendUserMessage([
  { type: "text", text: "Describe this image:" },
  { type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } },
]);

// 流式期间 - 必须指定投递模式
pi.sendUserMessage("Focus on error handling", { deliverAs: "steer" });
pi.sendUserMessage("And then summarize", { deliverAs: "followUp" });

// 选择启用扩展命令分发以及 skill/prompt 模板展开
pi.sendUserMessage("/review src/index.ts", { expandPromptTemplates: true });
```

**选项：**
- `deliverAs` - 当 agent 正在流式时必填：
  - `"steer"` - 将消息排队，在当前 assistant turn 完成其工具调用执行后投递
  - `"followUp"` - 等待 agent 完成所有工具
- `expandPromptTemplates` - 分发扩展命令，并展开 skill 命令和 prompt 模板。默认为 `false`。

非流式时，消息会立即发送并触发新的一轮。流式时若不提供 `deliverAs`，会抛出错误。

完整示例参见 [send-user-message.ts](../examples/extensions/send-user-message.ts)。

### pi.appendEntry(customType, data?) {#piappendentrycustomtype-data}

持久化扩展数据。自定义条目**不**参与 LLM 上下文。在交互模式下，配合 `pi.registerEntryRenderer()` 时也可以在聊天记录中渲染。

```typescript
pi.appendEntry("my-state", { count: 42 });
pi.appendEntry("status-card", { title: "Indexed files", count: 17 });

// 重载时还原
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "my-state") {
      // 从 entry.data 重建
    }
  }
});
```

### pi.setSessionName(name) {#pisetsessionnamename}

设置会话显示名称（在会话选择器中显示，而不是第一条消息）。

```typescript
pi.setSessionName("Refactor auth module");
```

### pi.getSessionName() {#pigetsessionname}

获取当前会话名称（如果已设置）。

```typescript
const name = pi.getSessionName();
if (name) {
  console.log(`Session: ${name}`);
}
```

### pi.setLabel(entryId, label) {#pisetlabelentryid-label}

为条目设置或清除标签。标签是用户定义的书签和导航标记（显示在 `/tree` 选择器中）。

```typescript
// 设置标签
pi.setLabel(entryId, "checkpoint-before-refactor");

// 清除标签
pi.setLabel(entryId, undefined);

// 通过 sessionManager 读取标签
const label = ctx.sessionManager.getLabel(entryId);
```

标签会持久化在会话中，并在重启后保留。用它们在对话树中标记重要点（轮次、检查点）。

### pi.registerCommand(name, options) {#piregistercommandname-options}

注册命令。

如果多个扩展注册相同的命令名，pi 会全部保留，并按加载顺序分配数字调用后缀，例如 `/review:1` 和 `/review:2`。

```typescript
pi.registerCommand("stats", {
  description: "Show session statistics",
  handler: async (args, ctx) => {
    const count = ctx.sessionManager.getEntries().length;
    ctx.ui.notify(`${count} entries`, "info");
  }
});
```

可选：为 `/command ...` 添加参数自动补全：

```typescript
import type { AutocompleteItem } from "@earendil-works/pi-tui";

pi.registerCommand("deploy", {
  description: "Deploy to an environment",
  getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
    const envs = ["dev", "staging", "prod"];
    const items = envs.map((e) => ({ value: e, label: e }));
    const filtered = items.filter((i) => i.value.startsWith(prefix));
    return filtered.length > 0 ? filtered : null;
  },
  handler: async (args, ctx) => {
    ctx.ui.notify(`Deploying: ${args}`, "info");
  },
});
```

### pi.getCommands() {#pigetcommands}

获取当前会话中可通过 `prompt` 调用的斜杠命令。包括扩展命令、prompt 模板和 skill 命令。
列表与 RPC `get_commands` 的排序一致：先扩展，然后模板，然后 skills。

```typescript
const commands = pi.getCommands();
const bySource = commands.filter((command) => command.source === "extension");
const userScoped = commands.filter((command) => command.sourceInfo.scope === "user");
```

每个条目的形状如下：

```typescript
{
  name: string; // 可调用的命令名，不含前导斜杠。可能带后缀，如 "review:1"
  description?: string;
  source: "extension" | "prompt" | "skill";
  sourceInfo: {
    path: string;
    source: string;
    scope: "user" | "project" | "temporary";
    origin: "package" | "top-level";
    baseDir?: string;
  };
}
```

将 `sourceInfo` 作为权威来源字段。不要从命令名或临时路径解析推断所有权。

内置交互命令（如 `/model` 和 `/settings`）不包含在此。它们仅在交互模式下处理，如果通过 `prompt` 发送则不会执行。

### pi.registerMessageRenderer(customType, renderer) {#piregistermessagerenderercustomtype-renderer}

为带有你的 `customType` 的自定义消息注册自定义 TUI 渲染器。自定义消息通过 `pi.sendMessage()` 创建，并参与 LLM 上下文。参见 [自定义 UI](#custom-ui)。

### pi.registerMarkdownTransformer(transformer) {#piregistermarkdowntransformertransformer}

为普通用户文本、assistant 文本和 thinking 块中的 Markdown 注册转换器。转换器按扩展加载顺序运行，每个转换器接收前一个转换器返回的 Markdown。链路完成后，Pi 用其内置渲染器渲染转换后的内容。

转换器接收 Markdown 字符串以及包含以下内容的上下文：

- `messageType` — `"user"`、`"assistant"` 或 `"assistant-thinking"`
- `isStreaming` — 对部分 assistant 更新为 `true`；对用户、最终确定的 assistant 以及恢复的消息为 `false`
- `availableWidth` — 转换后 Markdown 内容可用的精确终端列数

返回转换后的 Markdown：

```typescript
pi.registerMarkdownTransformer((markdown, { messageType, isStreaming }) => {
  if (isStreaming || messageType === "assistant-thinking") return markdown;
  return markdown.replaceAll("-->", "→");
});
```

如果转换器抛出异常，Pi 会保留到目前为止产生的 Markdown，并继续下一个转换器。该钩子仅用于显示：原始消息在会话和模型上下文中保持不变。它会针对新用户消息、assistant 流式更新、恢复的会话消息以及终端宽度变化运行，因此转换器应保持同步且开销小。

### pi.registerEntryRenderer(customType, renderer) {#piregisterentryrenderercustomtype-renderer}

为带有你的 `customType` 的自定义条目注册自定义 TUI 渲染器。自定义条目通过 `pi.appendEntry()` 创建，不参与 LLM 上下文。

```typescript
import { Box, Text } from "@earendil-works/pi-tui";

pi.registerEntryRenderer("status-card", (entry, { expanded }, theme) => {
  const data = entry.data as { title: string; count: number };
  const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
  box.addChild(new Text(`${theme.bold(data.title)}: ${data.count}`));
  if (expanded) {
    box.addChild(new Text(theme.fg("dim", JSON.stringify(data, null, 2))));
  }
  return box;
});

pi.appendEntry("status-card", { title: "Indexed files", count: 17 });
```

### pi.registerShortcut(shortcut, options) {#piregistershortcutshortcut-options}

注册键盘快捷键。快捷键格式和内置快捷键参见 [keybindings.md](keybindings.md)。

```typescript
pi.registerShortcut("ctrl+shift+p", {
  description: "Toggle plan mode",
  handler: async (ctx) => {
    ctx.ui.notify("Toggled!");
  },
});
```

### pi.registerFlag(name, options) {#piregisterflagname-options}

注册 CLI 标志。

```typescript
pi.registerFlag("plan", {
  description: "Start in plan mode",
  type: "boolean",
  default: false,
});

// 检查值
if (pi.getFlag("plan")) {
  // 计划模式已启用
}
```

### pi.exec(command, args, options?) {#piexeccommand-args-options}

执行 shell 命令。

```typescript
const result = await pi.exec("git", ["status"], { signal, timeout: 5000 });
// result.stdout, result.stderr, result.code, result.killed
```

### pi.getActiveTools() / pi.getAllTools() / pi.setActiveTools(names) {#pigetactivetools-pigetalltools-pisetactivetoolsnames}

管理活动工具。这对内置工具和动态注册的工具都有效。`pi.getActiveTools()` 以 `string[]` 返回活动工具名；`pi.getAllTools()` 返回所有已配置工具的元数据。

```typescript
const active = pi.getActiveTools(); // ["read", "bash", ...]
const all = pi.getAllTools();
// all = [{
//   name: "read",
//   description: "Read file contents...",
//   parameters: ...,
//   promptGuidelines: ["Use read to examine files instead of cat or sed."],
//   sourceInfo: { path: "<builtin:read>", source: "builtin", scope: "temporary", origin: "top-level" }
// }, ...]
const builtinTools = all.filter((t) => t.sourceInfo.source === "builtin");
const extensionTools = all.filter((t) => t.sourceInfo.source !== "builtin" && t.sourceInfo.source !== "sdk");
pi.setActiveTools([...new Set([...active, "my_custom_tool"])]); // 保留当前工具并启用 my_custom_tool
pi.setActiveTools(["read", "bash"]); // 切换为只读
```

`pi.getAllTools()` 返回 `name`、`description`、`parameters`、`promptGuidelines` 和 `sourceInfo`。

典型的 `sourceInfo.source` 值：
- `builtin` 表示内置工具
- `sdk` 表示通过 `createAgentSession({ customTools })` 传入的工具
- 扩展源元数据表示由扩展注册的工具

### pi.setModel(model) {#pisetmodelmodel}

为当前会话设置模型。该更改会记录在会话历史中，并在恢复该会话时还原，但不会改变新会话使用的已配置 `defaultProvider` 或 `defaultModel`。如果该模型的 provider 未配置认证，则返回 `false`。配置自定义模型参见 [models.md](models.md)。

```typescript
const model = ctx.modelRegistry.find("anthropic", "claude-sonnet-4-5");
if (model) {
  const success = await pi.setModel(model);
  if (!success) {
    ctx.ui.notify("No API key for this model", "error");
  }
}
```

### pi.getThinkingLevel() / pi.setThinkingLevel(level) {#pigetthinkinglevel-pisetthinkinglevellevel}

获取当前 thinking level。level 会被钳制到模型能力范围内（非推理模型始终使用 `"off"`）。更改会发出 `thinking_level_select`。

`pi.setThinkingLevel()` 更改当前会话的 thinking level。该更改会记录在会话历史中，并在恢复该会话时还原，但不会改变新会话使用的已配置默认值。

```typescript
const current = pi.getThinkingLevel();  // "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
pi.setThinkingLevel("high");
```

### pi.events {#pievents}

用于扩展之间通信的共享事件总线：

```typescript
pi.events.on("my:event", (data) => { ... });
pi.events.emit("my:event", { ... });
```

### pi.registerProvider(name, config) {#piregisterprovidername-config}

动态注册或覆盖模型 provider。适用于代理、自定义端点或团队范围的模型配置。

在扩展工厂函数期间进行的调用会排队，并在 runner 初始化后应用。之后的调用——例如来自用户设置流程之后的命令处理函数——会立即生效，无需 `/reload`。

动态 provider 可以实现 `refreshModels`。Pi 在模型刷新期间调用它，通过 provider 同步发布返回的列表，并传入规范的凭证/已存储目录/网络/signal 上下文。扩展决定是否通过带 generation 检查的 `context.publish({ persist: entry })` 持久化目录元数据；像 llama.cpp 这样的实时服务器可以返回模型而不持久化它们。

`context.signal` 始终是具体的 signal，provider 回调必须将其传递给阻塞 I/O。公共的 `ModelRuntime.refresh()` 和 `ModelRegistry.refresh()` 调用接受可选 signal；省略时无界。扩展和应用程序选择自己的截止时间。即使 provider 忽略该 signal，取消也会停止调用方等待，但仍需要协作才能停止底层工作。

需要原生 provider 认证、过滤、刷新或流行为的扩展可以注册来自 `@earendil-works/pi-ai` 的完整 `Provider`。该 provider 成为组合基础，`models.json` 覆盖仍会应用在其上。

```typescript
import { createProvider, openAICompletionsApi } from "@earendil-works/pi-ai";

const provider = createProvider({
  id: "local-server",
  name: "Local Server",
  baseUrl: "http://localhost:8080/v1",
  auth: {
    apiKey: {
      name: "Local server setup",
      async login(interaction) {
        return {
          type: "api_key",
          key: await interaction.prompt({ type: "secret", message: "API key" }),
        };
      },
      async resolve({ credential }) {
        return credential?.key
          ? { auth: { apiKey: credential.key }, source: "stored API key" }
          : undefined;
      },
    },
  },
  models: [],
  api: openAICompletionsApi(),
});

pi.registerProvider(provider);

// 使用自定义模型注册新 provider
pi.registerProvider("my-proxy", {
  name: "My Proxy",
  baseUrl: "https://proxy.example.com",
  apiKey: "$PROXY_API_KEY",  // 环境变量引用
  api: "anthropic-messages",
  models: [
    {
      id: "claude-sonnet-4-20250514",
      name: "Claude 4 Sonnet (proxy)",
      reasoning: false,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 16384
    }
  ]
});

// 注册实时 llama.cpp 目录，不持久化发现的模型
pi.registerProvider("llama.cpp", {
  baseUrl: "http://localhost:8080/v1",
  apiKey: "local",
  api: "openai-completions",
  async refreshModels({ signal }) {
    const response = await fetch("http://localhost:8080/v1/models", { signal });
    const { data } = await response.json();
    return data.map(({ id }) => ({
      id,
      name: id,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 16384
    }));
  }
});

// 覆盖现有 provider 的 baseUrl（保留所有模型）
pi.registerProvider("anthropic", {
  baseUrl: "https://proxy.example.com"
});

// 注册支持 OAuth 的 provider，用于 /login
pi.registerProvider("corporate-ai", {
  baseUrl: "https://ai.corp.com",
  api: "openai-responses",
  models: [...],
  oauth: {
    name: "Corporate AI (SSO)",
    async login(callbacks) {
      // 自定义 OAuth 流程
      callbacks.onAuth({ url: "https://sso.corp.com/..." });
      const code = await callbacks.onPrompt({ message: "Enter code:" });
      return { refresh: code, access: code, expires: Date.now() + 3600000 };
    },
    async refreshToken(credentials, signal) {
      signal.throwIfAborted();
      // 刷新逻辑
      return credentials;
    },
    getApiKey(credentials) {
      return credentials.access;
    }
  }
});
```

对象形式接受完整的 pi-ai `Provider`，包括原生 `auth`、`getModels`、`refreshModels`、`filterModels`、`stream` 和 `streamSimple` 行为。

**旧版配置选项：**
- `name` - provider 在 `/login` 等 UI 中的显示名称。
- `baseUrl` - API 端点 URL。定义模型时必填。
- `apiKey` - API key 字面量、环境插值（`$ENV_VAR` 或 `${ENV_VAR}`），或以 `!command` 开头。定义模型时必填（除非提供了 `oauth`）。`$$` 转义 `$`，`$!` 转义字面量 `!` 而不触发命令执行。
- `api` - API 类型：`"anthropic-messages"`、`"openai-completions"`、`"openai-responses"` 等。
- `headers` - 要包含在请求中的自定义 headers。
- `authHeader` - 如果为 true，自动添加 `Authorization: Bearer` header。
- `models` - 模型定义数组。如果提供，会替换该 provider 的所有现有模型。模型定义可以设置 `baseUrl` 以覆盖该模型的 provider 端点。
- `refreshModels` - 异步动态发现回调。其返回的模型会替换扩展提供的模型。`context.stored` 包含已持久化的 provider 快照；仅当更新后的目录数据应持久化时，才使用带 generation 检查的 `context.publish({ persist: entry })`。使用 `persist: null` 删除该快照。
- `oauth` - 用于 `/login` 支持的 OAuth provider 配置。提供时，该 provider 会出现在登录菜单中。
- `streamSimple` - 用于非标准 API 的自定义流式实现。

高级主题参见 [custom-provider.md](custom-provider.md)：自定义流式 API、OAuth 细节、模型定义参考。

### pi.unregisterProvider(name) {#piunregisterprovidername}

移除先前注册的 provider 及其模型。被该 provider 覆盖的内置模型会恢复。如果该 provider 未被注册，则无效果。

与 `registerProvider` 一样，在初始加载阶段之后调用会立即生效，因此不需要 `/reload`。

```typescript
pi.registerCommand("my-setup-teardown", {
  description: "Remove the custom proxy provider",
  handler: async (_args, _ctx) => {
    pi.unregisterProvider("my-proxy");
  },
});
```

## 状态管理 {#state-management}

带状态的扩展应将其存储在工具结果的 `details` 中，以获得正确的分支支持：

```typescript
export default function (pi: ExtensionAPI) {
  let items: string[] = [];

  // 从会话重建状态
  pi.on("session_start", async (_event, ctx) => {
    items = [];
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" && entry.message.role === "toolResult") {
        if (entry.message.toolName === "my_tool") {
          items = entry.message.details?.items ?? [];
        }
      }
    }
  });

  pi.registerTool({
    name: "my_tool",
    // ...
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      items.push("new item");
      return {
        content: [{ type: "text", text: "Added" }],
        details: { items: [...items] },  // 存储以便重建
      };
    },
  });
}
```

## 自定义工具 {#custom-tools}

通过 `pi.registerTool()` 注册 LLM 可调用的工具。工具会出现在系统提示中，并且可以有自定义渲染。

使用 `promptSnippet` 在默认系统提示的 `Available tools` 部分提供简短的一行条目。如果省略，自定义工具不会出现在该部分。

使用 `promptGuidelines` 向默认系统提示的 `Guidelines` 部分添加工具特定条目。这些条目仅在工具处于活动状态时包含（例如，在 `pi.setActiveTools([...])` 之后）。

**重要：** `promptGuidelines` 条目会扁平追加到 `Guidelines` 部分，没有工具名前缀或分组。每条指南必须点名它所指的工具——避免写 “Use this tool when...”，因为 LLM 无法判断 “this” 指哪个工具。应写成 “Use my_tool when...”。

注意：有些模型会把 @ 前缀包含在工具路径参数中。内置工具在解析路径前会去掉前导 @。如果你的自定义工具接受路径，也应规范化前导 @。

如果你的自定义工具会变更文件，使用 `withFileMutationQueue()`，以便它与内置 `edit` 和 `write` 参与同一套按文件队列。这很重要，因为工具调用默认并行运行。没有该队列时，两个工具可能读到同一份旧文件内容，计算出不同的更新，然后后写入的那个会覆盖另一个。

失败示例：你的自定义工具编辑 `foo.ts`，同时内置 `edit` 也在同一 assistant turn 中更改 `foo.ts`。如果你的工具不参与队列，两者都可能读到原始 `foo.ts`，分别应用更改，其中一处更改会丢失。

将真实目标文件路径传给 `withFileMutationQueue()`，而不是原始用户参数。先相对 `ctx.cwd` 或工具的工作目录解析为绝对路径。对已有文件，该辅助函数会通过 `realpath()` 规范化，因此同一文件的符号链接别名共享一个队列。对新文件，它回退到已解析的绝对路径，因为还没有东西可以 `realpath()`。

在该目标路径上排队整个变更窗口。这包括读-改-写逻辑，而不仅仅是最终写入。

```typescript
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
  const absolutePath = resolve(ctx.cwd, params.path);

  return withFileMutationQueue(absolutePath, async () => {
    await mkdir(dirname(absolutePath), { recursive: true });
    const current = await readFile(absolutePath, "utf8");
    const next = current.replace(params.oldText, params.newText);
    await writeFile(absolutePath, next, "utf8");

    return {
      content: [{ type: "text", text: `Updated ${params.path}` }],
      details: {},
    };
  });
}
```

### 工具定义 {#tool-definition}

```typescript
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does (shown to LLM)",
  promptSnippet: "List or add items in the project todo list",
  promptGuidelines: [
    "Use my_tool for todo planning instead of direct file edits when the user asks for a task list."
  ],
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),  // 使用 StringEnum 以兼容 Google
    text: Type.Optional(Type.String()),
  }),
  prepareArguments(args) {
    if (!args || typeof args !== "object") return args;
    const input = args as { action?: string; oldAction?: string };
    if (typeof input.oldAction === "string" && input.action === undefined) {
      return { ...input, action: input.oldAction };
    }
    return args;
  },

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // 检查取消
    if (signal?.aborted) {
      return { content: [{ type: "text", text: "Cancelled" }] };
    }

    // 流式进度更新
    onUpdate?.({
      content: [{ type: "text", text: "Working..." }],
      details: { progress: 50 },
    });

    // 通过 pi.exec 运行命令（从扩展闭包捕获）
    const result = await pi.exec("some-command", [], { signal });

    // 返回结果
    return {
      content: [{ type: "text", text: "Done" }],  // 发送给 LLM
      details: { data: result },                   // 用于渲染和状态
      // usage: nestedModelResponse.usage,          // 可选的嵌套 LLM usage
      // 可选：当该批次中每个最终确定的工具结果
      // 也都返回 terminate: true 时，在此工具批次后停止。
      terminate: true,
    };
  },

  // 可选：自定义渲染
  renderCall(args, theme, context) { ... },
  renderResult(result, options, theme, context) { ... },
});
```

**用量记账：** 如果工具进行嵌套 LLM 调用，将其合并后的 `Usage` 作为 `usage` 返回。Pi 会将其持久化到工具结果中，并计入页脚、`/session` 和 RPC 会话总计。`tool_result` 处理函数可以检查或替换该值。

**发出错误信号：** 要将工具执行标记为失败（在结果上设置 `isError: true` 并报告给 LLM），从 `execute` 抛出错误。无论返回对象中包含什么属性，返回值都不会设置错误标志。

**提前终止：** 从 `execute()` 返回 `terminate: true`，以提示在当前工具批次之后应跳过自动后续 LLM 调用。仅当该批次中每个最终确定的工具结果都是 terminating 时才会生效。最小示例参见 [examples/extensions/structured-output.ts](../examples/extensions/structured-output.ts)，其中 agent 在最终结构化输出工具调用时结束。

```typescript
// 正确：抛出以发出错误信号
async execute(toolCallId, params) {
  if (!isValid(params.input)) {
    throw new Error(`Invalid input: ${params.input}`);
  }
  return { content: [{ type: "text", text: "OK" }], details: {} };
}
```

**重要：** 对字符串枚举使用来自 `@earendil-works/pi-ai` 的 `StringEnum`。`Type.Union`/`Type.Literal` 无法与 Google 的 API 一起工作。

**参数准备：** `prepareArguments(args)` 是可选的。如果定义了，它会在 schema 校验之前以及 `execute()` 之前运行。当 pi 恢复旧会话、其中存储的工具调用参数不再匹配当前 schema 时，用它模拟旧的可接受输入形状。返回你希望按 `parameters` 校验的对象。保持公开 schema 严格。不要仅仅为了让旧的恢复会话继续工作，就向 `parameters` 添加已弃用的兼容字段。

示例：旧会话可能包含带有顶层 `oldText` 和 `newText` 的 `edit` 工具调用，而当前 schema 只接受 `edits: [{ oldText, newText }]`。

```typescript
pi.registerTool({
  name: "edit",
  label: "Edit",
  description: "Edit a single file using exact text replacement",
  parameters: Type.Object({
    path: Type.String(),
    edits: Type.Array(
      Type.Object({
        oldText: Type.String(),
        newText: Type.String(),
      }),
    ),
  }),
  prepareArguments(args) {
    if (!args || typeof args !== "object") return args;

    const input = args as {
      path?: string;
      edits?: Array<{ oldText: string; newText: string }>;
      oldText?: unknown;
      newText?: unknown;
    };

    if (typeof input.oldText !== "string" || typeof input.newText !== "string") {
      return args;
    }

    return {
      ...input,
      edits: [...(input.edits ?? []), { oldText: input.oldText, newText: input.newText }],
    };
  },
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // params 现在匹配当前 schema
    return {
      content: [{ type: "text", text: `Applying ${params.edits.length} edit block(s)` }],
      details: {},
    };
  },
});
```

### 覆盖内置工具 {#overriding-built-in-tools}

扩展可以通过注册同名工具来覆盖内置工具（`read`、`bash`、`powershell`、`edit`、`write`、`grep`、`find`、`ls`）。交互模式在发生这种情况时会显示警告。

```bash
# 扩展的 read 工具替换内置 read
pi -e ./tool-override.ts
```

或者，使用 `--no-builtin-tools` 在没有任何内置工具的情况下启动，同时保留扩展工具启用：
```bash
# 没有内置工具，只有扩展工具
pi --no-builtin-tools -e ./my-extension.ts
```

完整示例参见 [examples/extensions/tool-override.ts](../examples/extensions/tool-override.ts)，它用日志记录和访问控制覆盖 `read`。

**渲染：** 内置渲染器继承按槽位解析。执行覆盖和渲染覆盖是独立的。如果你的覆盖省略 `renderCall`，则使用内置 `renderCall`。如果你的覆盖省略 `renderResult`，则使用内置 `renderResult`。如果两者都省略，则自动使用内置渲染器（语法高亮、diff 等）。这让你可以为日志记录或访问控制包装内置工具，而无需重新实现 UI。

**提示元数据：** `promptSnippet` 和 `promptGuidelines` 不会从内置工具继承。如果你的覆盖应保留这些提示指令，请在覆盖上显式定义它们。

**你的实现必须匹配精确的结果形状**，包括 `details` 类型。UI 和会话逻辑依赖这些形状进行渲染和状态跟踪。

内置工具实现：
- [read.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/read.ts) - `ReadToolDetails`
- [bash.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/bash.ts) - `BashToolDetails`
- [powershell.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/powershell.ts) - `PowerShellToolDetails`
- [edit.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/edit.ts)
- [write.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/write.ts)
- [grep.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/grep.ts) - `GrepToolDetails`
- [find.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/find.ts) - `FindToolDetails`
- [ls.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/ls.ts) - `LsToolDetails`

### 远程执行 {#remote-execution}

内置工具支持可插拔 operations，以便委托给远程系统（SSH、容器等）：

```typescript
import { createReadTool, createBashTool, type ReadOperations } from "@earendil-works/pi-coding-agent";

// 使用自定义 operations 创建工具
const remoteRead = createReadTool(cwd, {
  operations: {
    readFile: (path) => sshExec(remote, `cat ${path}`),
    access: (path) => sshExec(remote, `test -r ${path}`).then(() => {}),
  }
});

// 注册，在执行时检查标志
pi.registerTool({
  ...remoteRead,
  async execute(id, params, signal, onUpdate, _ctx) {
    const ssh = getSshConfig();
    if (ssh) {
      const tool = createReadTool(cwd, { operations: createRemoteOps(ssh) });
      return tool.execute(id, params, signal, onUpdate);
    }
    return localRead.execute(id, params, signal, onUpdate);
  },
});
```

**Operations 接口：** `ReadOperations`、`WriteOperations`、`EditOperations`、`BashOperations`、`PowerShellOperations`、`LsOperations`、`GrepOperations`、`FindOperations`

对于 `user_bash`，扩展可以通过 `createLocalBashOperations()` 复用 pi 的本地 shell 后端，而不是重新实现本地进程生成、shell 解析和进程树终止。

`bash` 和 `powershell` 工具还支持 spawn hook，以便在执行前调整命令、cwd 或 env：

```typescript
import { createBashTool } from "@earendil-works/pi-coding-agent";

const bashTool = createBashTool(cwd, {
  spawnHook: ({ command, cwd, env }) => ({
    command: `source ~/.profile\n${command}`,
    cwd: `/mnt/sandbox${cwd}`,
    env: { ...env, CI: "1" },
  }),
});
```

`createBashTool()` 和 `createPowerShellTool()` 通过 `PI_SESSION_ID`、`PI_SESSION_FILE`、`PI_PROVIDER`、`PI_MODEL` 和 `PI_REASONING_LEVEL` 向命令暴露当前会话。注入发生在 `spawnHook` 之前，因此 hook 会在 `env` 中收到这些值，并在像上面那样展开现有环境时保留它们。设置 `exposeSessionEnvironment: false` 以禁用它们：

```typescript
const bashTool = createBashTool(cwd, {
  exposeSessionEnvironment: false,
});
```

变量语义参见 [Shell tool session environment](environment-variables.md#shell-tool-session-environment)。带 `--ssh` 标志的完整 SSH 示例参见 [examples/extensions/ssh.ts](../examples/extensions/ssh.ts)。

### 输出截断 {#output-truncation}

**工具必须截断其输出**，以免淹没 LLM 上下文。过大的输出可能导致：
- 上下文溢出错误（提示过长）
- 压缩失败
- 模型性能下降

内置限制是 **50KB**（约 10k tokens）和 **2000 行**，以先到达者为准。使用导出的截断工具：

```typescript
import {
  truncateHead,      // 保留前 N 行/字节（适合文件读取、搜索结果）
  truncateTail,      // 保留后 N 行/字节（适合日志、命令输出）
  truncateLine,      // 将单行截断到 maxBytes，带省略号
  formatSize,        // 人类可读大小（例如 "50KB"、"1.5MB"）
  DEFAULT_MAX_BYTES, // 50KB
  DEFAULT_MAX_LINES, // 2000
} from "@earendil-works/pi-coding-agent";

async execute(toolCallId, params, signal, onUpdate, ctx) {
  const output = await runCommand();

  // 应用截断
  const truncation = truncateHead(output, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let result = truncation.content;

  if (truncation.truncated) {
    // 将完整输出写入临时文件
    const tempFile = writeTempFile(output);

    // 告知 LLM 在何处查找完整输出
    result += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`;
    result += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
    result += ` Full output saved to: ${tempFile}]`;
  }

  return { content: [{ type: "text", text: result }] };
}
```

**要点：**
- 对开头更重要的内容使用 `truncateHead`（搜索结果、文件读取）
- 对结尾更重要的内容使用 `truncateTail`（日志、命令输出）
- 始终在输出被截断时告知 LLM，以及在何处查找完整版本
- 在工具描述中记录截断限制

完整示例参见 [examples/extensions/truncated-tool.ts](../examples/extensions/truncated-tool.ts)，它用正确的截断包装 `rg`（ripgrep）。

### 多个工具 {#multiple-tools}

一个扩展可以注册多个共享状态的工具：

```typescript
export default function (pi: ExtensionAPI) {
  let connection = null;

  pi.registerTool({ name: "db_connect", ... });
  pi.registerTool({ name: "db_query", ... });
  pi.registerTool({ name: "db_close", ... });

  pi.on("session_shutdown", async () => {
    connection?.close();
  });
}
```

### 自定义渲染 {#custom-rendering}

工具可以提供 `renderCall` 和 `renderResult` 用于自定义 TUI 显示。完整组件 API 参见 [tui.md](tui.md)，工具行如何组合参见 [tool-execution.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/modes/interactive/components/tool-execution.ts)。

默认情况下，工具输出会包装在处理内边距和背景的 `Box` 中。已定义的 `renderCall` 或 `renderResult` 必须返回 `Component`。如果某个槽位渲染器未定义，`tool-execution.ts` 会对该槽位使用回退渲染。

当工具应渲染自己的外壳而不是使用默认 `Box` 时，设置 `renderShell: "self"`。这对需要完全控制边框或背景行为的工具很有用，例如必须在工具稳定后保持视觉稳定的大型预览。

```typescript
pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "Custom shell example",
  parameters: Type.Object({}),
  renderShell: "self",
  async execute() {
    return { content: [{ type: "text", text: "ok" }], details: undefined };
  },
  renderCall(args, theme, context) {
    return new Text(theme.fg("accent", "my custom shell"), 0, 0);
  },
});
```

`renderCall` 和 `renderResult` 各自接收一个 `context` 对象，其中包含：
- `args` - 当前工具调用参数
- `state` - `renderCall` 和 `renderResult` 之间共享的行本地状态
- `lastComponent` - 该槽位先前返回的组件（如果有）
- `invalidate()` - 请求重新渲染此工具行
- `toolCallId`、`cwd`、`executionStarted`、`argsComplete`、`isPartial`、`expanded`、`showImages`、`isError`

使用 `context.state` 做跨槽位共享状态。当你希望跨渲染复用并变更同一组件时，将槽位本地缓存保留在返回的组件实例上。

#### renderCall {#rendercall}

渲染工具调用或标题：

```typescript
import { Text } from "@earendil-works/pi-tui";

renderCall(args, theme, context) {
  const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  let content = theme.fg("toolTitle", theme.bold("my_tool "));
  content += theme.fg("muted", args.action);
  if (args.text) {
    content += " " + theme.fg("dim", `"${args.text}"`);
  }
  text.setText(content);
  return text;
}
```

#### renderResult {#renderresult}

渲染工具结果或输出：

```typescript
renderResult(result, { expanded, isPartial }, theme, context) {
  if (isPartial) {
    return new Text(theme.fg("warning", "Processing..."), 0, 0);
  }

  if (result.details?.error) {
    return new Text(theme.fg("error", `Error: ${result.details.error}`), 0, 0);
  }

  let text = theme.fg("success", "✓ Done");
  if (expanded && result.details?.items) {
    for (const item of result.details.items) {
      text += "\n  " + theme.fg("dim", item);
    }
  }
  return new Text(text, 0, 0);
}
```

如果某个槽位有意没有可见内容，返回空的 `Component`，例如空的 `Container`。

#### 快捷键提示 {#keybinding-hints}

使用 `keyHint()` 显示尊重活动快捷键配置的快捷键提示：

```typescript
import { keyHint } from "@earendil-works/pi-coding-agent";

renderResult(result, { expanded }, theme, context) {
  let text = theme.fg("success", "✓ Done");
  if (!expanded) {
    text += ` (${keyHint("app.tools.expand", "to expand")})`;
  }
  return new Text(text, 0, 0);
}
```

可用函数：
- `keyHint(keybinding, description)` - 格式化已配置的快捷键 id，例如 `"app.tools.expand"` 或 `"tui.select.confirm"`
- `keyText(keybinding)` - 返回快捷键 id 的原始已配置按键文本
- `rawKeyHint(key, description)` - 格式化原始按键字符串

使用带命名空间的快捷键 id：
- coding-agent id 使用 `app.*` 命名空间，例如 `app.tools.expand`、`app.editor.external`、`app.session.rename`
- 共享 TUI id 使用 `tui.*` 命名空间，例如 `tui.select.confirm`、`tui.select.cancel`、`tui.input.tab`

快捷键 id 和默认值的完整列表参见 [keybindings.md](keybindings.md)。`keybindings.json` 使用相同的带命名空间 id。

自定义编辑器和 `ctx.ui.custom()` 组件会将 `keybindings: KeybindingsManager` 作为注入参数接收。它们应直接使用该注入的管理器，而不是调用 `getKeybindings()` 或 `setKeybindings()`。

#### 最佳实践 {#best-practices}

- 对 `Text` 使用内边距 `(0, 0)`。默认 Box 处理内边距。
- 对多行内容使用 `\n`。
- 处理 `isPartial` 以显示流式进度。
- 支持 `expanded` 以按需显示细节。
- 保持默认视图紧凑。
- 在 `renderResult` 中读取 `context.args`，而不是把 args 复制到 `context.state`。
- 仅对必须在 call 和 result 槽位之间共享的数据使用 `context.state`。
- 当同一组件实例可以就地更新时，复用 `context.lastComponent`。
- 仅在默认 boxed shell 碍事时使用 `renderShell: "self"`。在 self-shell 模式下，工具负责自己的边框、内边距和背景。

#### 回退 {#fallback}

如果某个槽位渲染器未定义或抛出：
- `renderCall`：显示工具名
- `renderResult`：显示来自 `content` 的原始文本

### 动态工具加载 {#dynamic-tool-loading}

扩展可以注册许多工具，同时只让一小部分初始集合保持活动。然后工具可以在执行期间通过 `pi.setActiveTools()` 添加更多工具。Pi 会检测纯增量更改，将该工具结果上新可用的工具名记录下来，并在下一次模型请求前应用更新后的活动集合。

这对所有模型都有效。具有原生延迟加载支持的模型会保留稳定的提示前缀，并在工具结果位置加载新定义。其他模型使用下面描述的回退。

生命周期是：

1. 用 `pi.registerTool()` 注册每个工具，使其出现在 `pi.getAllTools()` 中。
2. 保持加载器工具（例如 `search_tools`）处于活动状态，让可搜索工具保持非活动。
3. 在加载器执行期间，调用 `pi.setActiveTools([...currentTools, ...matchingTools])`。更改必须是增量的：不要在同一次调用中移除当前活动工具。
4. Pi 在加载器的工具结果上记录添加了哪些工具。
5. 在下一次模型响应之前，Pi 在支持时使用原生延迟加载暴露添加的定义，否则使用普通活动工具列表。

你不需要返回 provider 特定的工具引用，也不需要将加载器标记为特殊搜索工具。活动工具更改就是信号。传给 `pi.setActiveTools()` 的名称必须已经注册；未知名称会被忽略。

#### 具有原生延迟加载的模型 {#models-with-native-deferred-loading}

- **Anthropic**
  - **模型：** Sonnet、Opus、Fable 4.5 或更新版本（不含 Haiku）
  - **原生表示：** 延迟定义使用 `defer_loading`；加载点使用 `tool_reference` 内容。
- **OpenAI**
  - **模型：** `gpt-5.4` 及更新系列
  - **原生表示：** Pi 在加载点添加已完成的客户端 `tool_search_call` 和 `tool_search_output` 项。

对于已验证的自定义模型或代理，原生处理可以通过为 `anthropic-messages` 设置 `compat.supportsToolReferences: true`，或为 `openai-responses` 和 `openai-codex-responses` 设置 `compat.supportsToolSearch: true` 来启用。除非端点和模型接受相应的原生协议，否则保持这些选项禁用。

#### 回退行为 {#fallback-behavior}

对所有其他模型和 provider，动态激活仍然有效：Pi 在下一次请求中正常发送完整的当前活动工具列表。模型可以调用新激活的工具，但添加它们的定义可能会使 provider 的缓存提示前缀失效。

当活动集合不是纯增量时，例如用一组工具替换另一组，Pi 也会使用这种安全回退。因此工具移除是有效的，但它们不会使用延迟加载。

为了获得最佳缓存行为，在整个会话中保持加载器工具处于活动状态，并添加工具而不是替换活动集合。还要注意，激活带有 `promptSnippet` 或 `promptGuidelines` 的工具会重建系统提示；即使 provider 支持延迟 schema，该系统提示更改也可能使前缀失效。延迟加载的工具通常应依赖其工具 `description`，并省略仅在活动时生效的提示元数据。

#### 搜索工具示例 {#search-tool-example}

以下扩展注册两个可搜索工具，将它们从初始活动集合中移除，并只将 `search_tools` 保留为它们的加载器。该示例使用简单的关键字匹配，但搜索实现可以使用 BM25、embeddings、远程目录或项目特定路由。

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const SEARCHABLE_TOOL_NAMES = new Set(["lookup_weather", "search_issues"]);

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "lookup_weather",
    label: "Lookup Weather",
    description: "Look up the current weather for a city",
    parameters: Type.Object({ city: Type.String() }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: `Weather for ${params.city}: sunny` }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "search_issues",
    label: "Search Issues",
    description: "Search project issues by keyword",
    parameters: Type.Object({ query: Type.String() }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: `No open issues matching ${params.query}` }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "search_tools",
    label: "Search Tools",
    description: "Search for and enable tools relevant to a task",
    promptSnippet: "Search for additional tools when the active tools cannot perform the task",
    promptGuidelines: [
      "Use search_tools when a task requires a capability that is not currently available.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Capability or task to search for" }),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
    }),
    async execute(_toolCallId, params) {
      const terms = params.query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const matches = pi.getAllTools()
        .filter((tool) => SEARCHABLE_TOOL_NAMES.has(tool.name))
        .map((tool) => ({
          tool,
          score: terms.reduce(
            (score, term) =>
              score + (`${tool.name} ${tool.description}`.toLowerCase().includes(term) ? 1 : 0),
            0,
          ),
        }))
        .filter((match) => match.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, params.limit ?? 3)
        .map((match) => match.tool.name);

      if (matches.length === 0) {
        return {
          content: [{ type: "text", text: `No tools found for: ${params.query}` }],
          details: { matches: [] },
        };
      }

      const active = pi.getActiveTools();
      const added = matches.filter((name) => !active.includes(name));
      pi.setActiveTools([...new Set([...active, ...added])]);

      return {
        content: [{
          type: "text",
          text: added.length > 0
            ? `Loaded tools: ${added.join(", ")}`
            : `Matching tools already active: ${matches.join(", ")}`,
        }],
        details: { matches, added },
      };
    },
  });

  pi.on("session_start", () => {
    // 保持可搜索工具已注册但初始非活动。保留内置工具
    // 以及其他扩展拥有的工具，并保持加载器本身处于活动状态。
    const initialTools = pi.getActiveTools().filter(
      (name) => !SEARCHABLE_TOOL_NAMES.has(name),
    );
    pi.setActiveTools([...new Set([...initialTools, "search_tools"])]);
  });
}
```

当 `search_tools` 添加匹配项时，模型会在紧随其后的请求中收到该定义。在具备原生能力的模型上，该定义锚定在搜索结果之后，而不改变初始工具 schema 前缀。在其他模型上，它会出现在同一次后续请求的普通工具列表中。

## 自定义 UI {#custom-ui}

扩展可以通过 `ctx.ui` 方法与用户交互，并自定义消息/工具的渲染方式。

**关于自定义组件，参见 [tui.md](tui.md)**，其中有可复制粘贴的模式，用于：
- 选择对话框（SelectList）
- 可取消的异步操作（BorderedLoader）
- 设置开关（SettingsList）
- 状态指示器（setStatus）
- 流式期间的工作消息、可见性和指示器（`setWorkingMessage`、`setWorkingVisible`、`setWorkingIndicator`）
- 编辑器上方/下方的 widget（setWidget）
- 叠加在内置斜杠/路径补全之上的自动补全提供者（addAutocompleteProvider）
- 自定义页脚（setFooter）

### 对话框 {#dialogs}

```typescript
// 从选项中选择
const choice = await ctx.ui.select("Pick one:", ["A", "B", "C"]);

// 确认对话框
const ok = await ctx.ui.confirm("Delete?", "This cannot be undone");

// 文本输入
const name = await ctx.ui.input("Name:", "placeholder");

// 多行编辑器
const text = await ctx.ui.editor("Edit:", "prefilled text");

// 通知（非阻塞）
ctx.ui.notify("Done!", "info");  // "info" | "warning" | "error"
```

#### 带倒计时的定时对话框 {#timed-dialogs-with-countdown}

对话框支持 `timeout` 选项，会以实时倒计时显示自动关闭：

```typescript
// 对话框显示 "Title (5s)" → "Title (4s)" → ... → 到 0 时自动关闭
const confirmed = await ctx.ui.confirm(
  "Timed Confirmation",
  "This dialog will auto-cancel in 5 seconds. Confirm?",
  { timeout: 5000 }
);

if (confirmed) {
  // 用户确认
} else {
  // 用户取消或超时
}
```

**超时时的返回值：**
- `select()` 返回 `undefined`
- `confirm()` 返回 `false`
- `input()` 返回 `undefined`

#### 使用 AbortSignal 手动关闭 {#manual-dismissal-with-abortsignal}

要获得更多控制（例如区分超时和用户取消），使用 `AbortSignal`：

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

const confirmed = await ctx.ui.confirm(
  "Timed Confirmation",
  "This dialog will auto-cancel in 5 seconds. Confirm?",
  { signal: controller.signal }
);

clearTimeout(timeoutId);

if (confirmed) {
  // 用户确认
} else if (controller.signal.aborted) {
  // 对话框超时
} else {
  // 用户取消（按下 Escape 或选择 "No"）
}
```

完整示例参见 [examples/extensions/timed-confirm.ts](../examples/extensions/timed-confirm.ts)。

### Widget、状态和页脚 {#widgets-status-and-footer}

```typescript
// 页脚中的状态（持续到清除）
ctx.ui.setStatus("my-ext", "Processing...");
ctx.ui.setStatus("my-ext", undefined);  // 清除

// 工作加载器（流式期间显示）
ctx.ui.setWorkingMessage("Thinking deeply...");
ctx.ui.setWorkingMessage();  // 恢复默认
ctx.ui.setWorkingVisible(false);  // 完全隐藏内置工作加载器行
ctx.ui.setWorkingVisible(true);   // 显示内置工作加载器行

// 工作指示器（流式期间显示）
ctx.ui.setWorkingIndicator({ frames: [ctx.ui.theme.fg("accent", "●")] });  // 静态点
ctx.ui.setWorkingIndicator({
  frames: [
    ctx.ui.theme.fg("dim", "·"),
    ctx.ui.theme.fg("muted", "•"),
    ctx.ui.theme.fg("accent", "●"),
    ctx.ui.theme.fg("muted", "•"),
  ],
  intervalMs: 120,
});
ctx.ui.setWorkingIndicator({ frames: [] });  // 隐藏指示器
ctx.ui.setWorkingIndicator();  // 恢复默认旋转器

// 编辑器上方的 widget（默认）
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"]);
// 编辑器下方的 widget
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"], { placement: "belowEditor" });
ctx.ui.setWidget("my-widget", (tui, theme) => new Text(theme.fg("accent", "Custom"), 0, 0));
ctx.ui.setWidget("my-widget", undefined);  // 清除

// 自定义页脚（完全替换内置页脚）
ctx.ui.setFooter((tui, theme) => ({
  render(width) { return [theme.fg("dim", "Custom footer")]; },
  invalidate() {},
}));
ctx.ui.setFooter(undefined);  // 恢复内置页脚

// 终端标题
ctx.ui.setTitle("pi - my-project");

// 编辑器文本
ctx.ui.setEditorText("Prefill text");
const current = ctx.ui.getEditorText();

// 粘贴到编辑器（触发粘贴处理，包括对大内容的折叠）
ctx.ui.pasteToEditor("pasted content");

// 将自定义自动补全行为叠加在内置提供者之上
ctx.ui.addAutocompleteProvider((current) => ({
  triggerCharacters: ["#"],
  async getSuggestions(lines, line, col, options) {
    const beforeCursor = (lines[line] ?? "").slice(0, col);
    const match = beforeCursor.match(/(?:^|[ \t])#([^\s#]*)$/);
    if (!match) {
      return current.getSuggestions(lines, line, col, options);
    }

    return {
      prefix: `#${match[1] ?? ""}`,
      items: [{ value: "#2983", label: "#2983", description: "Extension API for autocomplete" }],
    };
  },
  applyCompletion(lines, line, col, item, prefix) {
    return current.applyCompletion(lines, line, col, item, prefix);
  },
  shouldTriggerFileCompletion(lines, line, col) {
    return current.shouldTriggerFileCompletion?.(lines, line, col) ?? true;
  },
}));

// 工具输出展开
const wasExpanded = ctx.ui.getToolsExpanded();
ctx.ui.setToolsExpanded(true);
ctx.ui.setToolsExpanded(wasExpanded);

// 自定义编辑器（vim 模式、emacs 模式等）
ctx.ui.setEditorComponent((tui, theme, keybindings) => new VimEditor(tui, theme, keybindings));
const currentEditor = ctx.ui.getEditorComponent();
ctx.ui.setEditorComponent((tui, theme, keybindings) =>
  new WrappedEditor(tui, theme, keybindings, currentEditor?.(tui, theme, keybindings))
);
ctx.ui.setEditorComponent(undefined);  // 恢复默认编辑器

// 主题管理（创建主题参见 themes.md）
const themes = ctx.ui.getAllThemes();  // [{ name: "dark", path: "/..." | undefined }, ...]
const lightTheme = ctx.ui.getTheme("light");  // 加载但不切换
const result = ctx.ui.setTheme("light");  // 按名称切换
if (!result.success) {
  ctx.ui.notify(`Failed: ${result.error}`, "error");
}
ctx.ui.setTheme(lightTheme!);  // 或按 Theme 对象切换
ctx.ui.theme.fg("accent", "styled text");  // 访问当前主题
```

自定义工作指示器帧会按原样渲染。如果你想要颜色，自己把它们加到帧字符串中，例如使用 `ctx.ui.theme.fg(...)`。

### 自动补全提供者 {#autocomplete-providers}

使用 `ctx.ui.addAutocompleteProvider()` 将自定义自动补全逻辑叠加在内置斜杠命令和路径提供者之上。为 `$` 等自定义自然触发器设置 `triggerCharacters`。

典型模式：

- 检查光标前的文本
- 当匹配你的扩展特定语法时返回自己的建议
- 否则委托给 `current.getSuggestions(...)`
- 委托 `applyCompletion(...)`，除非你需要自定义插入行为

```typescript
pi.on("session_start", (_event, ctx) => {
  ctx.ui.addAutocompleteProvider((current) => ({
    triggerCharacters: ["#"],
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const line = lines[cursorLine] ?? "";
      const beforeCursor = line.slice(0, cursorCol);
      const match = beforeCursor.match(/(?:^|[ \t])#([^\s#]*)$/);
      if (!match) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      return {
        prefix: `#${match[1] ?? ""}`,
        items: [
          { value: "#2983", label: "#2983", description: "Extension API for registering custom @ autocomplete providers" },
          { value: "#2753", label: "#2753", description: "Reload stale resource settings" },
        ],
      };
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  }));
});
```

完整示例参见 [github-issue-autocomplete.ts](../examples/extensions/github-issue-autocomplete.ts)，它用 `gh issue list` 预加载最近的开放 GitHub issues，并在本地过滤以获得快速的 `#...` 补全。它需要 GitHub CLI（`gh`）和 GitHub 仓库检出。

### 自定义组件 {#custom-components}

对于复杂 UI，使用 `ctx.ui.custom()`。这会暂时用你的组件替换编辑器，直到调用 `done()`：

```typescript
import { Text, Component } from "@earendil-works/pi-tui";

const result = await ctx.ui.custom<boolean>((tui, theme, keybindings, done) => {
  const text = new Text("Press Enter to confirm, Escape to cancel", 1, 1);

  text.onKey = (key) => {
    if (key === "return") done(true);
    if (key === "escape") done(false);
    return true;
  };

  return text;
});

if (result) {
  // 用户按下了 Enter
}
```

回调接收：
- `tui` - TUI 实例（用于屏幕尺寸、焦点管理）
- `theme` - 用于样式的当前主题
- `keybindings` - 应用快捷键管理器（用于检查快捷键）
- `done(value)` - 调用以关闭组件并返回值

完整组件 API 参见 [tui.md](tui.md)。

#### 覆盖层模式（实验性） {#overlay-mode-experimental}

传入 `{ overlay: true }`，将组件渲染为浮在现有内容之上的浮动模态，而不清除屏幕：

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyOverlayComponent({ onClose: done }),
  { overlay: true }
);
```

对于高级定位（锚点、边距、百分比、响应式可见性），传入 `overlayOptions`。使用 `onHandle` 以编程方式控制焦点或可见性：

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyOverlayComponent({ onClose: done }),
  {
    overlay: true,
    overlayOptions: { anchor: "top-right", width: "50%", margin: 2 },
    onHandle: (handle) => {
      handle.focus(); // 聚焦此覆盖层并将其带到视觉最前
      // handle.unfocus({ target: editorComponent }); // 将输入释放给特定组件
      // handle.setHidden(true/false); // 切换可见性
      // handle.hide(); // 永久移除
    }
  }
);
```

已聚焦且可见的覆盖层可以在临时非覆盖层自定义 UI 关闭后重新获取输入。如果你有意让另一个组件在覆盖层保持可见时继续持有输入，调用 `handle.unfocus({ target })`。传入 `{ target: null }` 会释放覆盖层而不聚焦另一个组件。

完整 `OverlayOptions` 和 `OverlayHandle` API 参见 [tui.md](tui.md)，示例参见 [overlay-qa-tests.ts](../examples/extensions/overlay-qa-tests.ts)。

### 自定义编辑器 {#custom-editor}

用自定义实现替换主输入编辑器（vim 模式、emacs 模式等）：

```typescript
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";

class VimEditor extends CustomEditor {
  private mode: "normal" | "insert" = "insert";

  handleInput(data: string): void {
    if (matchesKey(data, "escape") && this.mode === "insert") {
      this.mode = "normal";
      return;
    }
    if (this.mode === "normal" && data === "i") {
      this.mode = "insert";
      return;
    }
    super.handleInput(data);  // 应用快捷键 + 文本编辑
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new VimEditor(tui, theme, keybindings)
    );
  });
}
```

**要点：**
- 扩展 `CustomEditor`（而不是基础 `Editor`），以获得应用快捷键（escape 中止、ctrl+d、模型切换）
- 对你不处理的按键调用 `super.handleInput(data)`
- 自定义编辑器默认保留独立的工作行。将 `{ embedWorkingStatus: true }` 作为第四个 `CustomEditor` 构造函数参数传入，以使用内置编辑器边框旋转器。
- 工厂从应用接收 `tui`、`theme` 和 `keybindings`
- 在 `setEditorComponent()` 之前使用 `ctx.ui.getEditorComponent()` 来包装先前配置的自定义编辑器
- 传入 `undefined` 以恢复默认：`ctx.ui.setEditorComponent(undefined)`

要与已经替换编辑器的另一个扩展组合，在设置你的工厂之前捕获先前的工厂：

```typescript
const previous = ctx.ui.getEditorComponent();
ctx.ui.setEditorComponent((tui, theme, keybindings) =>
  new MyEditor(tui, theme, keybindings, { base: previous?.(tui, theme, keybindings) })
);
```

带模式指示器的完整示例参见 [tui.md](tui.md) Pattern 7。

### 消息和条目渲染 {#message-and-entry-rendering}

为带有你的 `customType` 的消息注册自定义渲染器。对应当参与 LLM 上下文的内容使用消息渲染器：

```typescript
import { Text } from "@earendil-works/pi-tui";

pi.registerMessageRenderer("my-extension", (message, options, theme) => {
  const { expanded, outputPad } = options;
  let text = theme.fg("accent", `[${message.customType}] `);
  text += message.content;

  if (expanded && message.details) {
    text += "\n" + theme.fg("dim", JSON.stringify(message.details, null, 2));
  }

  return new Text(text, outputPad, 0);
});
```

消息通过 `pi.sendMessage()` 发送：

```typescript
pi.sendMessage({
  customType: "my-extension",  // 匹配 registerMessageRenderer
  content: "Status update",
  display: true,               // 在 TUI 中显示
  details: { ... },            // 在渲染器中可用
});
```

对于不应发送给 LLM 的 TUI-only 内容，改为渲染自定义条目：

```typescript
pi.registerEntryRenderer("my-card", (entry, options, theme) => {
  return new Text(theme.fg("accent", JSON.stringify(entry.data)));
});

pi.appendEntry("my-card", { status: "done" });
```

### 主题颜色 {#theme-colors}

所有渲染函数都接收一个 `theme` 对象。创建自定义主题和完整调色板参见 [themes.md](themes.md)。

```typescript
// 前景色
theme.fg("toolTitle", text)   // 工具名
theme.fg("accent", text)      // 高亮
theme.fg("success", text)     // 成功（绿）
theme.fg("error", text)       // 错误（红）
theme.fg("warning", text)     // 警告（黄）
theme.fg("muted", text)       // 次要文本
theme.fg("dim", text)         // 第三级文本

// 文本样式
theme.bold(text)
theme.italic(text)
theme.strikethrough(text)
```

在自定义工具渲染器中做语法高亮：

```typescript
import { highlightCode, getLanguageFromPath } from "@earendil-works/pi-coding-agent";

// 用显式语言高亮代码
const highlighted = highlightCode("const x = 1;", "typescript", theme);

// 从文件路径自动检测语言
const lang = getLanguageFromPath("/path/to/file.rs");  // "rust"
const highlighted = highlightCode(code, lang, theme);
```

## 错误处理 {#error-handling}

- 扩展错误会被记录，agent 继续运行
- `tool_call` 错误会拦截该工具（故障安全）
- 工具 `execute` 错误必须通过抛出来发出信号；抛出的错误会被捕获，以 `isError: true` 报告给 LLM，然后执行继续

## 模式行为 {#mode-behavior}

| 模式 | `ctx.mode` | `ctx.hasUI` | 说明 |
|------|------------|-------------|-------|
| Interactive | `"tui"` | `true` | 带终端渲染的完整 TUI |
| RPC（`--mode rpc`） | `"rpc"` | `true` | 通过 JSON 协议进行对话框和通知；`custom()` 返回 `undefined`。参见 [rpc.md](rpc.md) |
| JSON（`--mode json`） | `"json"` | `false` | 事件流到 stdout；UI 方法为空操作 |
| Print（`-p`） | `"print"` | `false` | 扩展会运行但不能提示 |

在 TUI 特定功能（`custom()`、组件工厂、终端输入）之前使用 `ctx.mode === "tui"`。在 TUI 和 RPC 模式下都可用的对话框和通知方法之前使用 `ctx.hasUI`。

## 示例参考 {#examples-reference}

所有示例都在 [examples/extensions/](../examples/extensions/)。

| 示例 | 描述 | 关键 API |
|---------|-------------|----------|
| **工具** |||
| `hello.ts` | 最小工具注册 | `registerTool` |
| `question.ts` | 带用户交互的工具 | `registerTool`、`ui.select` |
| `questionnaire.ts` | 多步向导工具 | `registerTool`、`ui.custom` |
| `todo.ts` | 带持久化的有状态工具 | `registerTool`、`appendEntry`、`renderResult`、会话事件 |
| `dynamic-tools.ts` | 在启动后和命令期间注册工具 | `registerTool`、`session_start`、`registerCommand` |
| `structured-output.ts` | 带 `terminate: true` 的最终结构化输出工具 | `registerTool`、terminating 工具结果 |
| `truncated-tool.ts` | 输出截断示例 | `registerTool`、`truncateHead` |
| `tool-override.ts` | 覆盖内置 read 工具 | `registerTool`（与内置同名） |
| **命令** |||
| `pirate.ts` | 每轮修改系统提示 | `registerCommand`、`before_agent_start` |
| `summarize.ts` | 对话摘要命令 | `registerCommand`、`ui.custom` |
| `handoff.ts` | 跨 provider 模型交接 | `registerCommand`、`ui.editor`、`ui.custom` |
| `qna.ts` | 带自定义 UI 的问答 | `registerCommand`、`ui.custom`、`setEditorText` |
| `send-user-message.ts` | 注入用户消息 | `registerCommand`、`sendUserMessage` |
| `reload-runtime.ts` | Reload 命令和 LLM 工具交接 | `registerCommand`、`ctx.reload()`、`sendUserMessage` |
| `shutdown-command.ts` | 优雅关闭命令 | `registerCommand`、`shutdown()` |
| **事件与门禁** |||
| `permission-gate.ts` | 拦截危险命令 | `on("tool_call")`、`ui.confirm` |
| `project-trust.ts` | 从用户/全局或 CLI 扩展决定或推迟项目信任 | `on("project_trust")`、信任 UI、必需的信任结果 |
| `protected-paths.ts` | 拦截对特定路径的写入 | `on("tool_call")` |
| `confirm-destructive.ts` | 确认会话更改 | `on("session_before_switch")`、`on("session_before_fork")` |
| `dirty-repo-guard.ts` | 在脏 git 仓库上警告 | `on("session_before_*")`、`exec` |
| `input-transform.ts` | 转换用户输入 | `on("input")` |
| `input-transform-streaming.ts` | 感知流式的输入转换 | `on("input")`、`streamingBehavior` |
| `model-status.ts` | 响应模型更改 | `on("model_select")`、`setStatus` |
| `provider-payload.ts` | 检查 payload 和 provider 响应头 | `on("before_provider_request")`、`on("after_provider_response")` |
| `system-prompt-header.ts` | 显示系统提示信息 | `on("agent_start")`、`getSystemPrompt` |
| `claude-rules.ts` | 从文件加载规则 | `on("session_start")`、`on("before_agent_start")` |
| `prompt-customizer.ts` | 使用 `systemPromptOptions` 添加上下文感知的工具指南 | `on("before_agent_start")`、`BuildSystemPromptOptions` |
| `file-trigger.ts` | 文件监视器触发消息 | `sendMessage` |
| **压缩与会话** |||
| `custom-compaction.ts` | 自定义压缩摘要 | `on("session_before_compact")` |
| `trigger-compact.ts` | 手动触发压缩 | `compact()` |
| `git-checkpoint.ts` | 各轮 git stash | `on("turn_start")`、`on("session_before_fork")`、`exec` |
| `git-merge-and-resolve.ts` | Fetch、merge 并解决冲突 | `on("agent_end")`、`exec`、`sendUserMessage` |
| `auto-commit-on-exit.ts` | 关闭时提交 | `on("session_shutdown")`、`exec` |
| **UI 组件** |||
| `status-line.ts` | 页脚状态指示器 | `setStatus`、会话事件 |
| `working-indicator.ts` | 自定义流式工作指示器 | `setWorkingIndicator`、`registerCommand` |
| `github-issue-autocomplete.ts` | 通过从 `gh issue list` 预加载最近开放 issues，在内置自动补全之上添加 `#1234` issue 补全 | `addAutocompleteProvider`、`on("session_start")`、`exec` |
| `custom-footer.ts` | 完全替换页脚 | `registerCommand`、`setFooter` |
| `custom-header.ts` | 替换启动头 | `on("session_start")`、`setHeader` |
| `modal-editor.ts` | Vim 风格模态编辑器 | `setEditorComponent`、`CustomEditor` |
| `rainbow-editor.ts` | 自定义编辑器样式 | `setEditorComponent` |
| `widget-placement.ts` | 编辑器上方/下方的 widget | `setWidget` |
| `overlay-test.ts` | 覆盖层组件 | 带 overlay 选项的 `ui.custom` |
| `overlay-qa-tests.ts` | 全面的覆盖层测试 | `ui.custom`、所有 overlay 选项 |
| `notify.ts` | 简单通知 | `ui.notify` |
| `timed-confirm.ts` | 带超时的对话框 | 带 timeout/signal 的 `ui.confirm` |
| `mac-system-theme.ts` | 自动切换主题 | `setTheme`、`exec` |
| **复杂扩展** |||
| `plan-mode/` | 完整计划模式实现 | 所有事件类型、`registerCommand`、`registerShortcut`、`registerFlag`、`setStatus`、`setWidget`、`sendMessage`、`setActiveTools` |
| `preset.ts` | 可保存预设（模型、工具、thinking） | `registerCommand`、`registerShortcut`、`registerFlag`、`setModel`、`setActiveTools`、`setThinkingLevel`、`appendEntry` |
| `tools.ts` | 开关工具的 UI | `registerCommand`、`setActiveTools`、`SettingsList`、会话事件 |
| **远程与沙箱** |||
| `ssh.ts` | SSH 远程执行 | `registerFlag`、`on("user_bash")`、`on("before_agent_start")`、工具 operations |
| `interactive-shell.ts` | 持久 shell 会话 | `on("user_bash")` |
| `sandbox/` | 沙箱化工具执行 | 工具 operations |
| `gondolin/` | 将内置工具和 `!` 命令路由到 Gondolin 微型 VM | 工具 operations、内置工具覆盖、`on("user_bash")` |
| `subagent/` | 生成子 agent | `registerTool`、`exec` |
| **游戏** |||
| `snake.ts` | 贪吃蛇游戏 | `registerCommand`、`ui.custom`、键盘处理 |
| `space-invaders.ts` | 太空入侵者游戏 | `registerCommand`、`ui.custom` |
| `doom-overlay/` | 覆盖层中的 Doom | 带 overlay 的 `ui.custom` |
| **Providers** |||
| `custom-provider-anthropic/` | 自定义 Anthropic 代理 | `registerProvider` |
| `custom-provider-gitlab-duo/` | GitLab Duo 集成 | 带 OAuth 的 `registerProvider` |
| **消息与通信** |||
| `message-renderer.ts` | 自定义消息渲染 | `registerMessageRenderer`、`sendMessage` |
| `entry-renderer.ts` | 仅 TUI 的自定义条目渲染 | `registerEntryRenderer`、`appendEntry` |
| `event-bus.ts` | 扩展间事件 | `pi.events` |
| **会话元数据** |||
| `session-name.ts` | 为选择器命名会话 | `setSessionName`、`getSessionName` |
| `bookmark.ts` | 为 /tree 中的条目添加书签 | `setLabel` |
| **杂项** |||
| `inline-bash.ts` | 工具调用中的内联 bash | `on("tool_call")` |
| `bash-spawn-hook.ts` | 在执行前调整 bash 命令、cwd 和 env | `createBashTool`、`spawnHook` |
| `with-deps/` | 带 npm 依赖的扩展 | 带 `package.json` 的包结构 |
