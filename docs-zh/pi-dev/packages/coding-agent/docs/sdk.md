本文是 `sdk.md` 的中文阅读版；命令、路径、API 名称保持英文。

> pi 可以帮助你使用 SDK。让它按你的场景构建集成即可。

# SDK {#sdk}

SDK 提供对 pi agent 能力的编程访问。用它把 pi 嵌入其他应用、构建自定义界面，或集成到自动化工作流。

**示例用例：**
- 构建自定义 UI（web、桌面、移动）
- 将 agent 能力集成到现有应用
- 创建带 agent 推理的自动化流水线
- 构建会派生 sub-agent 的自定义工具
- 以编程方式测试 agent 行为

工作示例见 [examples/sdk/](../examples/sdk/)，覆盖从最小用法到完全控制。

## 快速开始 {#quick-start}

```typescript
import { createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";

const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  modelRuntime,
});

session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("What files are in the current directory?");
```

## 安装 {#installation}

```bash
npm install @earendil-works/pi-coding-agent
```

SDK 包含在主包中。无需单独安装。

## 核心概念 {#core-concepts}

### createAgentSession() {#createagentsession}

用于创建单个 `AgentSession` 的主工厂函数。

`createAgentSession()` 使用 `ResourceLoader` 提供扩展、技能、prompt 模板、主题和上下文文件。如果你不提供，它会使用带标准发现逻辑的 `DefaultResourceLoader`。

```typescript
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

// 最小用法：使用 DefaultResourceLoader 的默认值
const { session } = await createAgentSession();

// 自定义：覆盖特定选项
const { session } = await createAgentSession({
  model: myModel,
  tools: ["read", "bash"],
  sessionManager: SessionManager.inMemory(),
});
```

### AgentSession {#agentsession}

会话管理 agent 生命周期、消息历史、模型状态、压缩和事件流。

```typescript
interface AgentSession {
  // 发送 prompt 并等待完成
  prompt(text: string, options?: PromptOptions): Promise<void>;

  // 在流式过程中排队消息
  steer(text: string): Promise<void>;
  followUp(text: string): Promise<void>;

  // 订阅事件（返回取消订阅函数）
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;

  // 会话信息
  sessionFile: string | undefined;
  sessionId: string;

  // 模型控制
  setModel(model: Model): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): void;
  cycleModel(): Promise<ModelCycleResult | undefined>;
  cycleThinkingLevel(): ThinkingLevel | undefined;

  // 状态访问
  agent: Agent;
  model: Model | undefined;
  thinkingLevel: ThinkingLevel;
  messages: AgentMessage[];
  isStreaming: boolean;

  // 在当前会话文件内进行原地树导航
  navigateTree(targetId: string, options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string }): Promise<{ editorText?: string; cancelled: boolean }>;

  // 压缩
  compact(customInstructions?: string): Promise<CompactionResult>;
  abortCompaction(): void;

  // 中止当前操作
  abort(): Promise<void>;

  // 清理
  dispose(): void;
}
```

诸如 new-session、resume、fork 和 import 这类会话替换 API 位于 `AgentSessionRuntime` 上，而不是 `AgentSession`。

### createAgentSessionRuntime() 与 AgentSessionRuntime {#createagentsessionruntime-and-agentsessionruntime}

当你需要替换活动会话并重建绑定到 cwd 的运行时状态时，使用 runtime API。
这与内置 interactive、print 和 RPC 模式使用的是同一层。

`createAgentSessionRuntime()` 接受一个 runtime 工厂以及初始的 cwd/session 目标。该工厂会闭包进程全局的固定输入，为有效 cwd 重新创建绑定到 cwd 的服务，对照这些服务解析会话选项，并返回完整的 runtime 结果。

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
    })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});
```

`AgentSessionRuntime` 负责在以下操作中替换活动 runtime：

- `newSession()`
- `switchSession()`
- `fork()`
- 通过 `fork(entryId, { position: "at" })` 实现的 clone 流程
- `importFromJsonl()`

重要行为：

- 这些操作之后 `runtime.session` 会变化
- 事件订阅绑定到特定的 `AgentSession`，因此替换后需要重新订阅
- 如果你使用扩展，请为新会话再次调用 `runtime.session.bindExtensions(...)`
- 创建会在 `runtime.diagnostics` 上返回诊断信息
- 如果 runtime 创建或替换失败，方法会抛出，由调用方决定如何处理

```typescript
let session = runtime.session;
let unsubscribe = session.subscribe(() => {});

await runtime.newSession();

unsubscribe();
session = runtime.session;
unsubscribe = session.subscribe(() => {});
```

### 提示与消息排队 {#prompting-and-message-queueing}

`PromptOptions` 控制 prompt 展开、流式过程中的排队行为，以及 prompt preflight 通知：

```typescript
interface PromptOptions {
  expandPromptTemplates?: boolean;
  images?: ImageContent[];
  streamingBehavior?: "steer" | "followUp";
  source?: InputSource;
  preflightResult?: (success: boolean) => void;
}
```

每次调用 `prompt()` 都会调用一次 `preflightResult`：

- `true` 表示 prompt 已被接受、排队，或立即处理
- `false` 表示 prompt 在接受前被 preflight 拒绝

它会在 `prompt()` resolve 之前触发。`prompt()` 仍仅在完整的已接受运行结束后才 resolve，包括重试。接受之后的失败会通过正常的事件和消息流报告，而不是通过 `preflightResult(false)`。

`prompt()` 方法处理 prompt 模板、扩展命令和消息发送：

```typescript
// 基本 prompt（非流式时）
await session.prompt("What files are here?");

// 带图片
await session.prompt("What's in this image?", {
  images: [{ type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } }]
});

// 流式过程中：必须指定如何排队消息
await session.prompt("Stop and do this instead", { streamingBehavior: "steer" });
await session.prompt("After you're done, also check X", { streamingBehavior: "followUp" });
```

**行为：**
- **扩展命令**（例如 `/mycommand`）：立即执行，即使在流式过程中。它们通过 `pi.sendMessage()` 自行管理 LLM 交互。
- **基于文件的 prompt 模板**（来自 `.md` 文件）：在发送或排队前展开为内容。
- **流式过程中未指定 `streamingBehavior`**：抛出错误。直接使用 `steer()` 或 `followUp()`，或指定该选项。
- **`preflightResult(true)`**：表示 prompt 已被接受、排队，或立即处理。
- **`preflightResult(false)`**：表示在接受前被 preflight 拒绝。

要在流式过程中显式排队：

```typescript
// 排队一条 steering 消息，在当前 assistant 轮次完成其工具调用后投递
await session.steer("New instruction");

// 等待 agent 完成（仅在 agent 停止时投递）
await session.followUp("After you're done, also do this");
```

`steer()` 和 `followUp()` 都会展开基于文件的 prompt 模板，但会对扩展命令报错（扩展命令不能排队）。

### Agent 与 AgentState {#agent-and-agentstate}

`Agent` 类（来自 `@earendil-works/pi-agent-core`）处理核心 LLM 交互。通过 `session.agent` 访问。

```typescript
// 访问当前状态
const state = session.agent.state;

// state.messages: AgentMessage[] - 对话历史
// state.model: Model - 当前模型
// state.thinkingLevel: ThinkingLevel - 当前 thinking 级别
// state.systemPrompt: string - 系统提示
// state.tools: AgentTool[] - 可用工具
// state.streamingMessage?: AgentMessage - 当前部分 assistant 消息
// state.errorMessage?: string - 最近的 assistant 错误

// 替换消息（适用于分支或恢复）
session.agent.state.messages = messages; // 复制顶层数组

// 替换工具
session.agent.state.tools = tools; // 复制顶层数组

// 等待 agent 完成处理
await session.agent.waitForIdle();
```

### 事件 {#events}

订阅事件以接收流式输出和生命周期通知。

```typescript
session.subscribe((event) => {
  switch (event.type) {
    // 来自 assistant 的流式文本
    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      if (event.assistantMessageEvent.type === "thinking_delta") {
        // Thinking 输出（如果启用了 thinking）
      }
      break;
    
    // 工具执行
    case "tool_execution_start":
      console.log(`Tool: ${event.toolName}`);
      break;
    case "tool_execution_update":
      // 流式工具输出
      break;
    case "tool_execution_end":
      console.log(`Result: ${event.isError ? "error" : "success"}`);
      break;
    
    // 消息生命周期
    case "message_start":
      // 新消息开始
      break;
    case "message_end":
      // 消息完成
      break;
    
    // Agent 生命周期
    case "agent_start":
      // Agent 开始处理 prompt
      break;
    case "agent_end":
      // Agent 完成（event.messages 包含新消息）
      break;
    
    // 轮次生命周期（一次 LLM 响应 + 工具调用）
    case "turn_start":
      break;
    case "turn_end":
      // event.message: assistant 响应
      // event.toolResults: 本轮的工具结果
      break;
    
    // 会话事件（队列、压缩、重试）
    case "queue_update":
      console.log(event.steering, event.followUp);
      break;
    case "compaction_start":
    case "compaction_end":
    case "auto_retry_start":
    case "auto_retry_end":
    case "summarization_retry_scheduled":
    case "summarization_retry_attempt_start":
    case "summarization_retry_finished":
      break;
  }
});
```

## 选项参考 {#options-reference}

### 目录 {#directories}

```typescript
const { session } = await createAgentSession({
  // DefaultResourceLoader 发现用的工作目录
  cwd: process.cwd(), // 默认
  
  // 全局配置目录
  agentDir: "~/.pi/agent", // 默认（会展开 ~）
});
```

`cwd` 被 `DefaultResourceLoader` 用于：
- 项目扩展（`.pi/extensions/`）
- 项目技能：
  - `.pi/skills/`
  - `cwd` 及祖先目录中的 `.agents/skills/`（直到 git 仓库根，或不在仓库时直到文件系统根）
- 项目 prompt（`.pi/prompts/`）
- 上下文文件（从 cwd 向上查找 `AGENTS.md`）
- 会话目录命名

`agentDir` 被 `DefaultResourceLoader` 用于：
- 全局扩展（`extensions/`）
- 全局技能：
  - `agentDir` 下的 `skills/`（例如 `~/.pi/agent/skills/`）
  - `~/.agents/skills/`
- 全局 prompt（`prompts/`）
- 全局上下文文件（`AGENTS.md`）
- 设置（`settings.json`）
- 自定义模型（`models.json`）
- 凭据（`auth.json`）
- 会话（`sessions/`）

当你传入自定义 `ResourceLoader` 时，`cwd` 和 `agentDir` 不再控制资源发现。它们仍会影响会话命名和工具路径解析。

### 模型 {#model}

```typescript
import { getModel } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

const modelRuntime = await ModelRuntime.create();

// create() 会恢复缓存的目录，但默认不会从 pi.dev 刷新它们。
// 选择在创建时进行网络刷新，并限制其耗时：
const refreshedRuntime = await ModelRuntime.create({
  allowModelNetwork: true,
  modelRefreshTimeoutMs: 15_000,
});

// 查找特定内置模型（不检查 API key 是否存在）
const opus = getModel("anthropic", "claude-opus-4-5");
if (!opus) throw new Error("Model not found");

// 按 provider/id 查找任意模型，包括来自 models.json 的自定义模型
// （不检查 API key 是否存在）
const customModel = modelRuntime.getModel("my-provider", "my-model");

// 仅获取已配置有效认证的模型
const available = await modelRuntime.getAvailable();

const { session } = await createAgentSession({
  model: opus,
  thinkingLevel: "medium", // off, minimal, low, medium, high, xhigh, max
  
  // 用于循环切换的模型（交互模式中的 Ctrl+P）
  scopedModels: [
    { model: opus, thinkingLevel: "high" },
    { model: haiku, thinkingLevel: "off" },
  ],
  
  modelRuntime,
});
```

如果未提供模型：
1. 尝试从会话恢复（如果是继续会话）
2. 使用设置中的默认值
3. 回退到第一个可用模型

远程目录会持久化到本地，以便后续 runtime 无需网络请求即可恢复。默认文件是 `~/.pi/agent/models-store.json`；设置 `modelsStorePath` 可选择其他位置，或注入 `modelsStore` 以控制持久化。除非强制，网络刷新会按每个 provider 每四小时节流一次。要立即强制刷新，调用 `await modelRuntime.refresh({ allowNetwork: true, force: true, signal })`。设置 `PI_OFFLINE` 会禁用模型网络访问。

要匹配 CLI 模型解析，使用导出的 resolver 辅助函数：

```typescript
import {
  resolveCliModel,
  resolveModelScopeWithDiagnostics,
} from "@earendil-works/pi-coding-agent";

const cliModel = resolveCliModel({
  cliModel: "anthropic/claude-opus-4-5:high",
  modelRuntime,
});
if (cliModel.error) throw new Error(cliModel.error);
if (cliModel.warning) console.warn(cliModel.warning);

const { scopedModels, diagnostics } = await resolveModelScopeWithDiagnostics(
  ["anthropic/*:high", "gpt-5"],
  modelRuntime,
);
for (const diagnostic of diagnostics) {
  console.warn(diagnostic.message);
}
```

`resolveCliModel()` 使用所有已注册模型，因此类似 `--api-key` 的首次设置可以在存储的认证存在之前解析模型。`resolveModelScopeWithDiagnostics()` 匹配 `--models` 和 `enabledModels` 语义，同时返回警告而不是打印它们。

> 参见 [examples/sdk/02-custom-model.ts](../examples/sdk/02-custom-model.ts)

### API 密钥与 OAuth {#api-keys-and-oauth}

认证解析优先级（由 `ModelRuntime` 处理）：
1. Runtime 覆盖（通过 `setRuntimeApiKey`，不持久化）
2. `auth.json` 中存储的凭据（API 密钥或 OAuth token）
3. 环境变量（`ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等）
4. Fallback resolver（用于来自 `models.json` 的自定义 provider 密钥）

```typescript
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { createAgentSession, ModelRuntime } from "@earendil-works/pi-coding-agent";

// 默认：使用 ~/.pi/agent/auth.json 和 ~/.pi/agent/models.json
const modelRuntime = await ModelRuntime.create();

// Provider 自有的认证方法与当前状态
for (const provider of modelRuntime.getProviders()) {
  const status = await modelRuntime.checkAuth(provider.id);
  console.log(provider.name, provider.auth, status);
}

// Runtime API key 覆盖（不持久化到磁盘）
await modelRuntime.setRuntimeApiKey("anthropic", "sk-my-temp-key");

// 自定义凭据和模型位置
const customRuntime = await ModelRuntime.create({
  authPath: "/my/app/auth.json",
  modelsPath: "/my/app/models.json",
});

// 或注入任意 pi-ai CredentialStore
const credentials = new InMemoryCredentialStore();
const inMemoryRuntime = await ModelRuntime.create({ credentials });

const { session } = await createAgentSession({
  modelRuntime: customRuntime,
});
```

`login()`、`logout()`、`setRuntimeApiKey()` 和 `removeRuntimeApiKey()` 会在受影响 provider 的缓存/内置目录、组合以及可用性快照在本地一致后 resolve。它们不会等待远程目录新鲜度。如果凭据已提交但本地同步失败，它们会以导出的 `CredentialSynchronizationError` 拒绝；请检查其 `providerId`、`operation`、`credential` 和 `cause` 字段，而不是盲目重试凭据变更。

公开的模型/认证操作以及 `ModelRuntime.create({ signal })` 接受可选 abort signal；省略时无界。SDK 应用自行负责远程目录新鲜度的截止策略：

```typescript
const signal = AbortSignal.timeout(15_000);
const result = await modelRuntime.refresh({
  providers: ["anthropic"],
  signal,
});
if (result.aborted) console.warn("Catalog refresh timed out; using cached models");
for (const [providerId, error] of result.errors) {
  console.warn(`Could not refresh ${providerId}:`, error);
}
```

失败或超时的网络刷新不会撤销已成功的凭据操作。`refresh()` 会启动新的 provider generation，因此它不会排在更早的卡住刷新后面，过期的 generation 之后也不能再发布。

> 参见 [examples/sdk/09-api-keys-and-oauth.ts](../examples/sdk/09-api-keys-and-oauth.ts)

### 系统提示 {#system-prompt}

使用 `ResourceLoader` 覆盖系统提示：

```typescript
import { createAgentSession, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  systemPromptOverride: () => "You are a helpful assistant.",
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参见 [examples/sdk/03-custom-prompt.ts](../examples/sdk/03-custom-prompt.ts)

### 工具 {#tools}

指定要启用的内置工具：

- 内置工具名：`read`、`bash`、`powershell`、`edit`、`write`、`grep`、`find`、`ls`
- 默认内置：`read`、`bash`、`edit`、`write`
- `noTools: "all"` 禁用所有工具
- `noTools: "builtin"` 禁用默认内置工具，同时保留扩展和自定义工具
- `excludeTools` 在应用任何 `tools` 允许列表之后，禁用特定的内置、扩展或自定义工具名

`edit` 工具会为 Pi 的 TUI 显示返回 `details.diff`，并为 SDK 消费者返回作为标准 unified patch 的 `details.patch`。

```typescript
import { createAgentSession } from "@earendil-works/pi-coding-agent";

// 只读模式
const { session } = await createAgentSession({
  tools: ["read", "grep", "find", "ls"],
});

// 挑选特定工具
const { session } = await createAgentSession({
  tools: ["read", "bash", "grep"],
});

// 在 Windows 上使用 PowerShell 而不是 Bash
const { session } = await createAgentSession({
  tools: ["read", "powershell", "edit", "write"],
});

// 禁用一个工具，同时保留其余可用工具
const { session } = await createAgentSession({
  excludeTools: ["ask_question"],
});
```

#### 带自定义 cwd 的工具 {#tools-with-custom-cwd}

当你传入自定义 `cwd` 时，`createAgentSession()` 会为该 cwd 构建所选的内置工具。

```typescript
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

const cwd = "/path/to/project";

// 为自定义 cwd 使用默认工具
const { session } = await createAgentSession({
  cwd,
  sessionManager: SessionManager.inMemory(cwd),
});

// 或为自定义 cwd 挑选特定工具
const { session } = await createAgentSession({
  cwd,
  tools: ["read", "bash", "grep"],
  sessionManager: SessionManager.inMemory(cwd),
});
```

> 参见 [examples/sdk/05-tools.ts](../examples/sdk/05-tools.ts)

### 自定义工具 {#custom-tools}

```typescript
import { Type } from "typebox";
import { createAgentSession, defineTool } from "@earendil-works/pi-coding-agent";

// 内联自定义工具
const myTool = defineTool({
  name: "my_tool",
  label: "My Tool",
  description: "Does something useful",
  parameters: Type.Object({
    input: Type.String({ description: "Input value" }),
  }),
  execute: async (_toolCallId, params) => ({
    content: [{ type: "text", text: `Result: ${params.input}` }],
    details: {},
  }),
});

// 直接传入自定义工具
const { session } = await createAgentSession({
  customTools: [myTool],
});
```

使用 `defineTool()` 进行独立定义，以及类似 `customTools: [myTool]` 的数组。内联的 `pi.registerTool({ ... })` 已经能正确推断参数类型。

通过 `customTools` 传入的自定义工具会与扩展注册的工具合并。由 ResourceLoader 加载的扩展也可以通过 `pi.registerTool()` 注册工具。

如果你传入 `tools`，请包含你想启用的每个自定义或扩展工具名，例如 `tools: ["read", "bash", "my_tool"]`。

> 参见 [examples/sdk/05-tools.ts](../examples/sdk/05-tools.ts)

### 扩展 {#extensions}

扩展由 `ResourceLoader` 加载。`DefaultResourceLoader` 会从 `~/.pi/agent/extensions/`、`.pi/extensions/` 以及 settings.json 的扩展源发现扩展。

```typescript
import { createAgentSession, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  additionalExtensionPaths: ["/path/to/my-extension.ts"],
  extensionFactories: [
    (pi) => {
      pi.on("agent_start", () => {
        console.log("[Inline Extension] Agent starting");
      });
    },
  ],
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

扩展可以注册工具、订阅事件、添加命令等。完整 API 见 [extensions.md](extensions.md)。

**命名内联扩展：** 默认情况下，内联工厂在启动时的 Extensions 列表中显示为 `<inline:1>`、`<inline:2>` 等。要改为显示描述性名称，请包装工厂：

```typescript
import type { InlineExtension } from "@earendil-works/pi-coding-agent";

const myProvider: InlineExtension = {
  name: "my-provider",
  factory: (pi) => {
    pi.on("agent_start", () => {
      console.log("[my-provider] Agent starting");
    });
  },
};

const loader = new DefaultResourceLoader({
  extensionFactories: [myProvider],
});
```

这会显示为 `<inline:my-provider>` 而不是 `<inline:1>`。为向后兼容，仍接受裸工厂函数。

**事件总线：** 扩展可以通过 `pi.events` 通信。如果需要从外部发出或监听，请向 `DefaultResourceLoader` 传入共享的 `eventBus`：

```typescript
import { createEventBus, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const eventBus = createEventBus();
const loader = new DefaultResourceLoader({
  eventBus,
});
await loader.reload();

eventBus.on("my-extension:status", (data) => console.log(data));
```

> 参见 [examples/sdk/06-extensions.ts](../examples/sdk/06-extensions.ts) 和 [docs/extensions.md](extensions.md)

### 技能 {#skills}

```typescript
import {
  createAgentSession,
  DefaultResourceLoader,
  type Skill,
} from "@earendil-works/pi-coding-agent";

const customSkill: Skill = {
  name: "my-skill",
  description: "Custom instructions",
  filePath: "/path/to/SKILL.md",
  baseDir: "/path/to",
  source: "custom",
};

const loader = new DefaultResourceLoader({
  skillsOverride: (current) => ({
    skills: [...current.skills, customSkill],
    diagnostics: current.diagnostics,
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参见 [examples/sdk/04-skills.ts](../examples/sdk/04-skills.ts)

### 上下文文件 {#context-files}

```typescript
import { createAgentSession, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  agentsFilesOverride: (current) => ({
    agentsFiles: [
      ...current.agentsFiles,
      { path: "/virtual/AGENTS.md", content: "# Guidelines\n\n- Be concise" },
    ],
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参见 [examples/sdk/07-context-files.ts](../examples/sdk/07-context-files.ts)

### 斜杠命令 {#slash-commands}

```typescript
import {
  createAgentSession,
  DefaultResourceLoader,
  type PromptTemplate,
} from "@earendil-works/pi-coding-agent";

const customCommand: PromptTemplate = {
  name: "deploy",
  description: "Deploy the application",
  source: "(custom)",
  content: "# Deploy\n\n1. Build\n2. Test\n3. Deploy",
};

const loader = new DefaultResourceLoader({
  promptsOverride: (current) => ({
    prompts: [...current.prompts, customCommand],
    diagnostics: current.diagnostics,
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参见 [examples/sdk/08-prompt-templates.ts](../examples/sdk/08-prompt-templates.ts)

### 会话管理 {#session-management}

会话使用带 `id`/`parentId` 链接的树结构，支持原地分支。

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSession,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

// 内存（不持久化）
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
});

// 新的持久化会话
const { session: persisted } = await createAgentSession({
  sessionManager: SessionManager.create(process.cwd()),
});

// 继续最近会话
const { session: continued, modelFallbackMessage } = await createAgentSession({
  sessionManager: SessionManager.continueRecent(process.cwd()),
});
if (modelFallbackMessage) {
  console.log("Note:", modelFallbackMessage);
}

// 打开特定文件
const { session: opened } = await createAgentSession({
  sessionManager: SessionManager.open("/path/to/session.jsonl"),
});

// 恢复保存在文件系统之外的会话，例如数据库中
const { session: restored } = await createAgentSession({
  sessionManager: SessionManager.inMemory(process.cwd(), { id: sessionId }, entries),
});

// 列出会话
const currentProjectSessions = await SessionManager.list(process.cwd());
const allSessions = await SessionManager.listAll(process.cwd());

// 用于 /new、/resume、/fork、/clone 和 import 流程的会话替换 API。
const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
    })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

// 用全新会话替换活动会话
await runtime.newSession();

// 用另一个已保存会话替换活动会话
await runtime.switchSession("/path/to/session.jsonl");

// 用从特定用户条目 fork 出的会话替换活动会话
await runtime.fork("entry-id");

// 克隆到特定条目为止的活动路径
await runtime.fork("entry-id", { position: "at" });
```

**SessionManager 树 API：**

```typescript
const sm = SessionManager.open("/path/to/session.jsonl");

// 会话列表
const currentProjectSessions = await SessionManager.list(process.cwd());
const allSessions = await SessionManager.listAll(process.cwd());

// 树遍历
const entries = sm.getEntries();        // 所有条目（不含 header）
const tree = sm.getTree();              // 完整树结构
const path = sm.getPath();              // 从 root 到当前 leaf 的路径
const leaf = sm.getLeafEntry();         // 当前 leaf 条目
const entry = sm.getEntry(id);          // 按 ID 获取条目
const children = sm.getChildren(id);    // 条目的直接子节点

// 标签
const label = sm.getLabel(id);          // 获取条目的标签
sm.appendLabelChange(id, "checkpoint"); // 设置标签

// 分支
sm.branch(entryId);                     // 将 leaf 移到更早的条目
sm.branchWithSummary(id, "Summary...");  // 带上下文摘要的分支
sm.createBranchedSession(leafId);       // 将路径提取到新文件
```

> 参见 [examples/sdk/11-sessions.ts](../examples/sdk/11-sessions.ts) 和 [Session Format](session-format.md)

### 设置管理 {#settings-management}

```typescript
import { createAgentSession, SettingsManager, SessionManager } from "@earendil-works/pi-coding-agent";

// 默认：从文件加载（全局 + 项目合并）
const { session } = await createAgentSession({
  settingsManager: SettingsManager.create(),
});

// 带覆盖
const settingsManager = SettingsManager.create();
settingsManager.applyOverrides({
  compaction: { enabled: false },
  retry: { enabled: true, maxRetries: 5 },
});
const { session } = await createAgentSession({ settingsManager });

// 内存（无文件 I/O，用于测试）
const { session } = await createAgentSession({
  settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
  sessionManager: SessionManager.inMemory(),
});

// 自定义目录
const { session } = await createAgentSession({
  settingsManager: SettingsManager.create("/custom/cwd", "/custom/agent"),
});
```

**静态工厂：**
- `SettingsManager.create(cwd?, agentDir?)` - 从文件加载
- `SettingsManager.inMemory(settings?)` - 无文件 I/O

**项目特定设置：**

设置从两个位置加载并合并：
1. 全局：`~/.pi/agent/settings.json`
2. 项目：`<cwd>/.pi/settings.json`

项目覆盖全局。嵌套对象会合并键。setter 默认修改全局设置。

**持久化与错误处理语义：**

- 设置的 getter/setter 对内存状态是同步的。
- setter 会异步排队持久化写入。
- 当你需要持久化边界时调用 `await settingsManager.flush()`（例如在进程退出前，或在测试中断言文件内容之前）。
- `SettingsManager` 不会打印设置 I/O 错误。使用 `settingsManager.drainErrors()` 并在应用层报告它们。

> 参见 [examples/sdk/10-settings.ts](../examples/sdk/10-settings.ts)

## ResourceLoader {#resourceloader}

使用 `DefaultResourceLoader` 发现扩展、技能、prompt、主题和上下文文件。

```typescript
import {
  DefaultResourceLoader,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  cwd,
  agentDir: getAgentDir(),
});
await loader.reload();

const extensions = loader.getExtensions();
const skills = loader.getSkills();
const prompts = loader.getPrompts();
const themes = loader.getThemes();
const contextFiles = loader.getAgentsFiles().agentsFiles;
```

## 返回值 {#return-value}

`createAgentSession()` 返回：

```typescript
interface CreateAgentSessionResult {
  // 会话
  session: AgentSession;
  
  // 扩展结果（用于 runner 设置）
  extensionsResult: LoadExtensionsResult;
  
  // 如果会话模型无法恢复则给出警告
  modelFallbackMessage?: string;
}

interface LoadExtensionsResult {
  extensions: Extension[];
  errors: Array<{ path: string; error: string }>;
  runtime: ExtensionRuntime;
}
```

## 完整示例 {#complete-example}

```typescript
import { getModel } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const modelRuntime = await ModelRuntime.create({
  authPath: "/custom/agent/auth.json",
  modelsPath: "/custom/agent/models.json",
});
if (process.env.MY_KEY) {
  await modelRuntime.setRuntimeApiKey("anthropic", process.env.MY_KEY);
}

// 内联工具
const statusTool = defineTool({
  name: "status",
  label: "Status",
  description: "Get system status",
  parameters: Type.Object({}),
  execute: async () => ({
    content: [{ type: "text", text: `Uptime: ${process.uptime()}s` }],
    details: {},
  }),
});

const model = getModel("anthropic", "claude-opus-4-5");
if (!model) throw new Error("Model not found");

// 带覆盖的内存设置
const settingsManager = SettingsManager.inMemory({
  compaction: { enabled: false },
  retry: { enabled: true, maxRetries: 2 },
});

const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: "/custom/agent",
  settingsManager,
  systemPromptOverride: () => "You are a minimal assistant. Be concise.",
});
await loader.reload();

const { session } = await createAgentSession({
  cwd: process.cwd(),
  agentDir: "/custom/agent",

  model,
  thinkingLevel: "off",
  modelRuntime,

  tools: ["read", "bash", "status"],
  customTools: [statusTool],
  resourceLoader: loader,

  sessionManager: SessionManager.inMemory(),
  settingsManager,
});

session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("Get status and list files.");
```

## 运行模式 {#run-modes}

SDK 导出运行模式工具，用于在 `createAgentSession()` 之上构建自定义界面：

### InteractiveMode {#interactivemode}

完整 TUI 交互模式，带编辑器、聊天历史和所有内置命令：

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  InteractiveMode,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};
const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

const mode = new InteractiveMode(runtime, {
  migratedProviders: [],
  modelFallbackMessage: undefined,
  initialMessage: "Hello",
  initialImages: [],
  initialMessages: [],
});

await mode.run();
```

### runPrintMode {#runprintmode}

一次性模式：发送 prompt，输出结果，然后退出：

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  runPrintMode,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};
const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

await runPrintMode(runtime, {
  mode: "text",
  initialMessage: "Hello",
  initialImages: [],
  messages: ["Follow up"],
});
```

### runRpcMode {#runrpcmode}

用于子进程集成的 JSON-RPC 模式：

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  runRpcMode,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};
const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

await runRpcMode(runtime);
```

JSON 协议见 [RPC documentation](rpc.md)。

## RPC 模式替代方案 {#rpc-mode-alternative}

对于不通过 SDK 构建、基于子进程的集成，直接使用 CLI：

```bash
pi --mode rpc --no-session
```

JSON 协议见 [RPC documentation](rpc.md)。

在以下情况更适合使用 SDK：
- 你想要类型安全
- 你在同一个 Node.js 进程中
- 你需要直接访问 agent 状态
- 你想以编程方式自定义工具/扩展

在以下情况更适合使用 RPC 模式：
- 你从另一种语言集成
- 你想要进程隔离
- 你在构建与语言无关的客户端

## 导出 {#exports}

主入口导出：

```typescript
// 工厂
createAgentSession
createAgentSessionRuntime
AgentSessionRuntime

// 认证与模型
ModelRuntime // 实现 pi-ai Models，并拥有凭据存储
ModelRegistry // 同步的扩展兼容门面
CredentialSynchronizationError
resolveCliModel
resolveModelScopeWithDiagnostics

// 资源加载
DefaultResourceLoader
type ResourceLoader
createEventBus

// 常量和辅助函数
CONFIG_DIR_NAME
defineTool
getAgentDir
getPackageDir
getReadmePath
getDocsPath
getExamplesPath

// 会话管理
SessionManager
SettingsManager

// 工具工厂
createCodingTools
createReadOnlyTools
createReadTool, createBashTool, createPowerShellTool, createEditTool, createWriteTool
createGrepTool, createFindTool, createLsTool

// 类型
type CreateAgentSessionOptions
type CreateAgentSessionResult
type ExtensionFactory
type InlineExtension
type ExtensionAPI
type ToolDefinition
type Skill
type PromptTemplate
type Tool
```

扩展类型的完整 API 见 [extensions.md](extensions.md)。
