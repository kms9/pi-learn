本文是 `README.md` 的中文阅读版；命令、路径、API 名称保持英文。

# SDK 示例 {#sdk-examples}

通过 `createAgentSession()` 和 `createAgentSessionRuntime()` 以编程方式使用 pi-coding-agent。

运行时示例展示如何编写一个 recreate 函数：它闭包捕获进程级的固定输入，并在当前会话的 cwd 变化时重建与 cwd 绑定的服务和会话。

## 示例 {#examples}

| 文件 | 说明 |
|------|-------------|
| `01-minimal.ts` | 使用全部默认值的最简用法 |
| `02-custom-model.ts` | 选择模型与思考级别 |
| `03-custom-prompt.ts` | 替换或修改系统提示词 |
| `04-skills.ts` | 发现、过滤或替换技能 |
| `05-tools.ts` | 内置工具允许列表 |
| `06-extensions.ts` | 日志、拦截、结果修改 |
| `07-context-files.ts` | AGENTS.md 上下文文件 |
| `08-slash-commands.ts` | 基于文件的斜杠命令 |
| `09-api-keys-and-oauth.ts` | API 密钥解析、OAuth 配置 |
| `10-settings.ts` | 覆盖压缩、重试、终端设置 |
| `11-sessions.ts` | 内存、持久化、继续、列出会话 |
| `12-full-control.ts` | 替换一切，不做发现 |
| `13-session-runtime.ts` | 管理由 runtime 支持的会话替换 |

## 运行 {#running}

```bash
cd packages/coding-agent
npx tsx examples/sdk/01-minimal.ts
```

## 快速参考 {#quick-reference}

```typescript
import { getModel } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const modelRuntime = await ModelRuntime.create();

// 最小用法
const { session } = await createAgentSession({ modelRuntime });

// 自定义模型
const model = getModel("anthropic", "claude-opus-4-5");
const { session } = await createAgentSession({ model, thinkingLevel: "high", modelRuntime });

// 修改提示词
const loader = new DefaultResourceLoader({
  systemPromptOverride: (base) => `${base}\n\nBe concise.`,
});
await loader.reload();
const { session } = await createAgentSession({ resourceLoader: loader, modelRuntime });

// 只读
const { session } = await createAgentSession({ tools: ["read", "grep", "find", "ls"], modelRuntime });

// 内存会话
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  modelRuntime,
});

// 完全控制
const customRuntime = await ModelRuntime.create({
  authPath: "/my/app/auth.json",
  modelsPath: "/my/app/models.json",
});
await customRuntime.setRuntimeApiKey("anthropic", process.env.MY_KEY!);

const resourceLoader = new DefaultResourceLoader({
  systemPromptOverride: () => "You are helpful.",
  extensionFactories: [myExtension],
  skillsOverride: () => ({ skills: [], diagnostics: [] }),
  agentsFilesOverride: () => ({ agentsFiles: [] }),
  promptsOverride: () => ({ prompts: [], diagnostics: [] }),
});
await resourceLoader.reload();

const { session } = await createAgentSession({
  model,
  modelRuntime: customRuntime,
  resourceLoader,
  tools: ["read", "bash", "my_tool"],
  customTools: [myTool],
  sessionManager: SessionManager.inMemory(),
  settingsManager: SettingsManager.inMemory(),
});

// 运行提示
session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});
await session.prompt("Hello");
```

## 选项 {#options}

| 选项 | 默认值 | 说明 |
|--------|---------|-------------|
| `modelRuntime` | 使用 `agentDir/auth.json` 和 `models.json` 的 runtime | 规范的模型与认证 runtime |
| `cwd` | `process.cwd()` | 工作目录 |
| `agentDir` | `~/.pi/agent` | 配置目录 |
| `model` | 来自设置/第一个可用模型 | 要使用的模型 |
| `thinkingLevel` | 来自设置/`"off"` | off、low、medium、high |
| `tools` | `["read", "bash", "edit", "write"]` 内置工具 | 跨内置、扩展和自定义工具的允许列表 |
| `customTools` | `[]` | 额外的工具定义 |
| `resourceLoader` | DefaultResourceLoader | 扩展、技能、提示词、主题和上下文文件的资源加载器 |
| `sessionManager` | `SessionManager.create(cwd)` | 持久化 |
| `settingsManager` | `SettingsManager.create(cwd, agentDir)` | 设置覆盖 |

## 事件 {#events}

```typescript
session.subscribe((event) => {
  switch (event.type) {
    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      break;
    case "tool_execution_start":
      console.log(`Tool: ${event.toolName}`);
      break;
    case "tool_execution_end":
      console.log(`Result: ${event.result}`);
      break;
    case "agent_settled":
      console.log("Done");
      break;
  }
});
```
