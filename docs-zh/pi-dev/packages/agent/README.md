本文是 `README.md` 的中文阅读版；命令、路径、API 名称保持英文。

更完整的 harness / plugins / session 文档见 [docs/README.zh.md](docs/README.zh.md)。

# @earendil-works/pi-agent-core {#earendil-workspi-agent-core}

带工具执行和事件流的有状态 agent。构建于 `@earendil-works/pi-ai` 之上。

## 安装 {#installation}

```bash
npm install @earendil-works/pi-agent-core
```

### SQLite session backend {#sqlite-session-backends}

SQLite session backend 以及 `node:sqlite` adapter 位于单独的包 `@earendil-works/pi-session-backend-sqlite-node` 中，因此核心包默认不会拉入运行时内置或原生 SQLite 依赖。该 backend 接受运行时特定的 SQLite factory，以便将来其他 session backend 可以作为自己的包发布。

## 快速开始 {#quick-start}

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());
const model = models.getModel("anthropic", "claude-sonnet-4-6");
if (!model) throw new Error("Model not found");

const agent = new Agent({
  initialState: {
    systemPrompt: "You are a helpful assistant.",
    model,
  },
  streamFn: models.streamSimple.bind(models),
});

agent.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    // 只流式输出新增的文本块
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await agent.prompt("Hello!");
```

## 实验性 facet 服务 {#experimental-facet-services}

传输无关的 facet-service 原语位于 `@earendil-works/chord`。Agent core 不导出服务运行时。

## 核心概念 {#core-concepts}

### AgentMessage 与 LLM Message {#agentmessage-vs-llm-message}

Agent 使用 `AgentMessage`，这是一种灵活类型，可以包含：
- 标准 LLM 消息（`user`、`assistant`、`toolResult`）
- 通过 declaration merging 加入的自定义应用消息类型

LLM 只理解 `user`、`assistant` 和 `toolResult`。`convertToLlm` 函数通过在每次 LLM 调用前过滤和变换消息来弥合这一差距。

### 消息流 {#message-flow}

```
AgentMessage[] → transformContext() → AgentMessage[] → convertToLlm() → Message[] → LLM
                    （可选）                           （必需）
```

1. **transformContext**：裁剪旧消息，注入外部上下文
2. **convertToLlm**：过滤掉仅用于 UI 的消息，把自定义类型转换成 LLM 格式

## 事件流 {#event-flow}

Agent 会发出事件以供 UI 更新。理解事件顺序有助于构建响应式界面。

### prompt() 事件序列 {#prompt-event-sequence}

当你调用 `prompt("Hello")` 时：

```
prompt("Hello")
├─ agent_start
├─ turn_start
├─ message_start   { message: userMessage }      // 你的 prompt
├─ message_end     { message: userMessage }
├─ message_start   { message: assistantMessage } // LLM 开始响应
├─ message_update  { message: partial... }       // 流式块
├─ message_update  { message: partial... }
├─ message_end     { message: assistantMessage } // 完整响应
├─ turn_end        { message, toolResults: [] }
└─ agent_end       { messages: [...] }
```

### 带工具调用 {#with-tool-calls}

如果 assistant 调用工具，循环会继续：

```
prompt("Read config.json")
├─ agent_start
├─ turn_start
├─ message_start/end  { userMessage }
├─ message_start      { assistantMessage with toolCall }
├─ message_update...
├─ message_end        { assistantMessage }
├─ tool_execution_start  { toolCallId, toolName, args }
├─ tool_execution_update { partialResult }           // 若工具会流式输出
├─ tool_execution_end    { toolCallId, result }
├─ message_start/end  { toolResultMessage }
├─ turn_end           { message, toolResults: [toolResult] }
│
├─ turn_start                                        // 下一轮
├─ message_start      { assistantMessage }           // LLM 对 tool result 作出响应
├─ message_update...
├─ message_end
├─ turn_end
└─ agent_end
```

工具执行模式可配置：

- `parallel`（默认）：按序做工具调用的 preflight，并发执行被允许的工具，每个工具一完成就发出 `tool_execution_end`，然后按 assistant 源顺序发出 toolResult 消息和 `turn_end.toolResults`
- `sequential`：逐个执行工具调用，与历史行为一致

在 parallel 模式下，工具完成事件跟随工具完成顺序，但持久化的 toolResult 消息仍跟随 assistant 源顺序。

该模式可以通过 agent 配置中的 `toolExecution` 全局设置，或通过 `AgentTool` 上的 `executionMode` 按工具设置。如果一批中的任何工具调用指向带 `executionMode: "sequential"` 的工具，则无论全局设置如何，整批都按序执行。

`beforeToolCall` hook 在 `tool_execution_start` 以及已校验的参数解析之后运行。它可以阻止执行，并在被阻止的结果上附加 `terminate: true`。`afterToolCall` hook 在工具执行结束后、发出 `tool_execution_end` 以及最终 tool result 消息事件之前运行。

工具、被阻止的 `beforeToolCall` 结果，以及 `afterToolCall` 覆盖可以返回 `terminate: true`，以提示应跳过自动的后续 LLM 调用。只有当该批中每个已完成的 tool result 都设置了 `terminate: true` 时，循环才会提前停止。混合批次会正常继续。

`Agent` 类在 `AgentOptions` 中接受 `shouldStopAfterTurn`。底层循环调用方可以在 `AgentLoopConfig` 中设置同一 hook：

```typescript
const stream = agentLoop(
  prompts,
  context,
  {
    model,
    convertToLlm,
    shouldStopAfterTurn: async ({ message, toolResults, context, newMessages }) => {
      return shouldCompactBeforeNextTurn(context.messages);
    },
  },
  undefined,
  models.streamSimple.bind(models),
);
```

`shouldStopAfterTurn` 在发出 `turn_end` 之后、以及 assistant 响应和任何工具执行已正常完成后运行。如果它返回 `true`，循环会发出 `agent_end` 并退出，而不会轮询 steering 或 follow-up 队列，也不会开始另一次 LLM 调用。它不会中止 provider 流，不会取消正在运行的工具，也不会改变 assistant 消息的 stop reason。`AgentOptions` 回调还会把当前 run 的 `AbortSignal` 作为第二个参数接收。

当你使用 `Agent` 类时，assistant 的 `message_end` 处理被当作工具 preflight 开始前的屏障。这意味着 `beforeToolCall` 看到的 agent 状态已经包含请求该工具调用的 assistant 消息。

### continue() 事件序列 {#continue-event-sequence}

`continue()` 从现有上下文恢复，而不添加新消息。用于错误后的重试。

```typescript
// 出错后，从当前状态重试
await agent.continue();
```

上下文中的最后一条消息必须是 `user` 或 `toolResult`（不能是 `assistant`）。

### 事件类型 {#event-types}

| 事件 | 说明 |
|-------|-------------|
| `agent_start` | Agent 开始处理 |
| `agent_end` | 本次 run 的最终事件。该事件的被 await 的订阅者仍计入结算 |
| `turn_start` | 新一轮开始（一次 LLM 调用 + 工具执行） |
| `turn_end` | 一轮完成，带 assistant 消息和 tool results |
| `message_start` | 任意消息开始（user、assistant、toolResult） |
| `message_update` | **仅 assistant。** 包含带 delta 的 `assistantMessageEvent` |
| `message_end` | 消息完成 |
| `tool_execution_start` | 工具开始 |
| `tool_execution_update` | 工具流式报告进度 |
| `tool_execution_end` | 工具完成 |

`Agent.subscribe()` 监听器按注册顺序被 await。`agent_end` 表示不会再发出更多循环事件，但 `await agent.waitForIdle()` 和 `await agent.prompt(...)` 只有在被 await 的 `agent_end` 监听器结束后才结算。

## Agent 选项 {#agent-options}

```typescript
const agent = new Agent({
  // 初始状态
  initialState: {
    systemPrompt: string,
    model: Model<any>,
    thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max",
    tools: AgentTool<any>[],
    messages: AgentMessage[],
  },

  // 把 AgentMessage[] 转换成 LLM Message[]（自定义消息类型时必需）
  convertToLlm: (messages) => messages.filter(...),

  // 在 convertToLlm 之前变换上下文（用于裁剪、压缩）
  transformContext: async (messages, signal) => pruneOldMessages(messages),

  // Steering 模式："one-at-a-time"（默认）或 "all"
  steeringMode: "one-at-a-time",

  // Follow-up 模式："one-at-a-time"（默认）或 "all"
  followUpMode: "one-at-a-time",

  // 必需的 stream 函数
  streamFn: models.streamSimple.bind(models),

  // 用于 provider 缓存的 Session ID
  sessionId: "session-123",

  // 动态 API key 解析（用于会过期的 OAuth token）
  getApiKey: async (provider) => refreshToken(),

  // 工具执行模式："parallel"（默认）或 "sequential"
  toolExecution: "parallel",

  // 参数校验后对每个工具调用做 preflight。可以阻止执行。
  beforeToolCall: async ({ toolCall, args, context }) => {
    if (toolCall.name === "bash") {
      return { block: true, reason: "bash is disabled", terminate: true };
    }
  },

  // 在发出最终工具事件之前后处理每个 tool result。
  afterToolCall: async ({ toolCall, result, isError, context }) => {
    if (toolCall.name === "notify_done" && !isError) {
      return { terminate: true };
    }
    if (!isError) {
      return { details: { ...result.details, audited: true } };
    }
  },

  // 在已完成的一轮之后、轮询排队消息之前优雅停止。
  shouldStopAfterTurn: async ({ context }, signal) => {
    return shouldCompactBeforeNextTurn(context.messages, signal);
  },

  // 面向基于 token 的 provider 的自定义 thinking budget
  thinkingBudgets: {
    minimal: 128,
    low: 512,
    medium: 1024,
    high: 2048,
  },
});
```

## Agent 状态 {#agent-state}

```typescript
interface AgentState {
  systemPrompt: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool<any>[];
  messages: AgentMessage[];
  readonly isStreaming: boolean;
  readonly streamingMessage?: AgentMessage;
  readonly pendingToolCalls: ReadonlySet<string>;
  readonly errorMessage?: string;
}
```

通过 `agent.state` 访问状态。

赋值 `agent.state.tools = [...]` 或 `agent.state.messages = [...]` 会在存储前复制顶层数组。变更返回的数组会变更当前 agent 状态。

流式过程中，`agent.state.streamingMessage` 包含当前的部分 assistant 消息。

`agent.state.isStreaming` 在 run 完全结算之前保持为 `true`，包括被 await 的 `agent_end` 订阅者。

## 方法 {#methods}

### 发送 Prompt {#prompting}

```typescript
// 文本 prompt
await agent.prompt("Hello");

// 带图片
await agent.prompt("What's in this image?", [
  { type: "image", data: base64Data, mimeType: "image/jpeg" }
]);

// 直接使用 AgentMessage
await agent.prompt({ role: "user", content: "Hello", timestamp: Date.now() });

// 从当前上下文继续（最后一条消息必须是 user 或 toolResult）
await agent.continue();
```

### 状态管理 {#state-management}

```typescript
agent.state.systemPrompt = "New prompt";
agent.state.model = getModel("openai", "gpt-4o");
agent.state.thinkingLevel = "medium";
agent.state.tools = [myTool];
agent.toolExecution = "sequential";
agent.beforeToolCall = async ({ toolCall }) => undefined;
agent.afterToolCall = async ({ toolCall, result }) => undefined;
agent.shouldStopAfterTurn = async ({ context }) => shouldCompactBeforeNextTurn(context.messages);
agent.state.messages = newMessages; // 顶层数组会被复制
agent.state.messages.push(message);
agent.reset();
```

### Session 与 thinking budget {#session-and-thinking-budgets}

```typescript
agent.sessionId = "session-123";

agent.thinkingBudgets = {
  minimal: 128,
  low: 512,
  medium: 1024,
  high: 2048,
};
```

### 控制 {#control}

```typescript
agent.abort();           // 取消当前操作
await agent.waitForIdle(); // 等待完成
```

### 事件 {#events}

```typescript
const unsubscribe = agent.subscribe(async (event, signal) => {
  if (event.type === "agent_end") {
    // 本次 run 的最终屏障工作
    await flushSessionState(signal);
  }
});
unsubscribe();
```

## Steering 与 Follow-up {#steering-and-follow-up}

Steering 消息让你在工具运行时打断 agent。Follow-up 消息让你在 agent 本来会停止之后排队工作。

```typescript
agent.steeringMode = "one-at-a-time";
agent.followUpMode = "one-at-a-time";

// 当 agent 正在运行工具时
agent.steer({
  role: "user",
  content: "Stop! Do this instead.",
  timestamp: Date.now(),
});

// 在 agent 完成当前工作之后
agent.followUp({
  role: "user",
  content: "Also summarize the result.",
  timestamp: Date.now(),
});

const steeringMode = agent.steeringMode;
const followUpMode = agent.followUpMode;

agent.clearSteeringQueue();
agent.clearFollowUpQueue();
agent.clearAllQueues();
```

使用 clearSteeringQueue、clearFollowUpQueue 或 clearAllQueues 丢弃已排队的消息。

当一轮完成后检测到 steering 消息时：
1. 当前 assistant 消息中的所有工具调用已经结束
2. 注入 steering 消息
3. LLM 在下一轮作出响应

Follow-up 消息仅在没有更多工具调用且没有 steering 消息时检查。如果有任何排队项，它们会被注入并再跑一轮。

## 自定义消息类型 {#custom-message-types}

通过 declaration merging 扩展 `AgentMessage`：

```typescript
declare module "@earendil-works/pi-agent-core" {
  interface CustomAgentMessages {
    notification: { role: "notification"; text: string; timestamp: number };
  }
}

// 现在有效
const msg: AgentMessage = { role: "notification", text: "Info", timestamp: Date.now() };
```

在 `convertToLlm` 中处理自定义类型：

```typescript
const agent = new Agent({
  streamFn: models.streamSimple.bind(models),
  convertToLlm: (messages) => messages.flatMap(m => {
    if (m.role === "notification") return []; // 过滤掉
    return [m];
  }),
});
```

## 工具 {#tools}

使用 `AgentTool` 定义工具：

```typescript
import { Type } from "typebox";

const readFileTool: AgentTool = {
  name: "read_file",
  label: "Read File",  // 用于 UI 显示
  description: "Read a file's contents",
  parameters: Type.Object({
    path: Type.String({ description: "File path" }),
  }),
  // 覆盖此工具的执行模式（可选）。
  // "sequential" 强制整批一次只跑一个。
  // "parallel" 允许与其他工具调用并发执行。
  // 若省略，则应用全局 toolExecution 配置。
  executionMode: "sequential",
  execute: async (toolCallId, params, signal, onUpdate) => {
    const content = await fs.readFile(params.path, "utf-8");

    // 可选：流式报告进度
    onUpdate?.({ content: [{ type: "text", text: "Reading..." }], details: {} });

    // 可选：在此添加 `terminate: true`，以便在该批每个已完成的
    // tool result 都这样做时，跳过自动的后续 LLM 调用。
    return {
      content: [{ type: "text", text: content }],
      details: { path: params.path, size: content.length },
    };
  },
};

agent.state.tools = [readFileTool];
```

### 错误处理 {#error-handling}

**工具失败时抛出错误。** 不要把错误消息作为 content 返回。

```typescript
execute: async (toolCallId, params, signal, onUpdate) => {
  if (!fs.existsSync(params.path)) {
    throw new Error(`File not found: ${params.path}`);
  }
  // 仅在成功时返回 content
  return { content: [{ type: "text", text: "..." }] };
}
```

抛出的错误会被 agent 捕获，并以 `isError: true` 作为工具错误报告给 LLM。

从 `execute()`、被阻止的 `beforeToolCall` 或 `afterToolCall` 返回 `terminate: true`，以提示 agent 应在当前工具批次之后停止。这只有在该批每个已完成的 tool result 都在终止时才生效。该提示仅在运行时有效；发出的 `toolResult` transcript 消息仍是标准 LLM tool results。

## 代理用法 {#proxy-usage}

对于通过后端代理的浏览器应用：

```typescript
import { Agent, streamProxy } from "@earendil-works/pi-agent-core";

const agent = new Agent({
  streamFn: (model, context, options) =>
    streamProxy(model, context, {
      ...options,
      authToken: "...",
      proxyUrl: "https://your-server.com",
    }),
});
```

## 底层 API {#low-level-api}

用于不使用 Agent 类的直接控制：

```typescript
import { agentLoop, agentLoopContinue } from "@earendil-works/pi-agent-core";

const context: AgentContext = {
  systemPrompt: "You are helpful.",
  messages: [],
  tools: [],
};

const config: AgentLoopConfig = {
  model: getModel("openai", "gpt-4o"),
  convertToLlm: (msgs) => msgs.filter(m => ["user", "assistant", "toolResult"].includes(m.role)),
  toolExecution: "parallel",  // 若设置了按工具的 executionMode 则会覆盖
  beforeToolCall: async ({ toolCall, args, context }) => undefined,
  afterToolCall: async ({ toolCall, result, isError, context }) => undefined,
};

const userMessage = { role: "user", content: "Hello", timestamp: Date.now() };

const streamFn = models.streamSimple.bind(models);
for await (const event of agentLoop([userMessage], context, config, undefined, streamFn)) {
  console.log(event.type);
}

// 从现有上下文继续
for await (const event of agentLoopContinue(context, config, undefined, streamFn)) {
  console.log(event.type);
}
```

这些底层流是观察性的。它们保留事件顺序，但不会在后续 producer 阶段继续之前等待你的异步事件处理结算。如果你需要消息处理在工具 preflight 之前充当屏障，请使用 `Agent` 类，而不是原始的 `agentLoop()` 或 `agentLoopContinue()`。

## 许可证 {#license}

MIT
