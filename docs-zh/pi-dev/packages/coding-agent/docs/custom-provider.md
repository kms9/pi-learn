本文是 `custom-provider.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 自定义 Provider {#custom-providers}

扩展可以通过 `pi.registerProvider()` 注册自定义模型 provider。这可以用于：

- **代理** - 通过企业代理或 API 网关路由请求
- **自定义端点** - 使用自托管或私有模型部署
- **OAuth/SSO** - 为企业 provider 添加认证流程
- **自定义 API** - 为非标准 LLM API 实现流式处理

## 示例扩展 {#example-extensions}

参见这些完整的 provider 示例：

- [`examples/extensions/custom-provider-anthropic/`](../examples/extensions/custom-provider-anthropic/)
- [`examples/extensions/custom-provider-gitlab-duo/`](../examples/extensions/custom-provider-gitlab-duo/)

## 目录 {#table-of-contents}

- [示例扩展](#example-extensions)
- [快速参考](#quick-reference)
- [覆盖现有 Provider](#override-existing-provider)
- [注册新 Provider](#register-new-provider)
- [注销 Provider](#unregister-provider)
- [OAuth 支持](#oauth-support)
- [自定义流式 API](#custom-streaming-api)
- [上下文溢出错误](#context-overflow-errors)
- [测试你的实现](#testing-your-implementation)
- [配置参考](#config-reference)
- [模型定义参考](#model-definition-reference)

## 快速参考 {#quick-reference}

扩展可以注册完整的 pi-ai `Provider`，或使用遗留的 provider-config 形式。当需要自定义认证、过滤、刷新或流式行为时，优先使用完整 provider。Pi 会把 `models.json` 覆盖组合在已注册的原生 provider 之上。

```typescript
import { createProvider, openAICompletionsApi } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerProvider(createProvider({
    id: "native-local",
    name: "Native Local",
    baseUrl: "http://localhost:8080/v1",
    auth: {
      apiKey: {
        name: "Local server API key",
        async login(interaction) {
          return {
            type: "api_key",
            key: await interaction.prompt({ type: "secret", message: "API key" })
          };
        },
        async resolve({ credential }) {
          return credential?.key
            ? { auth: { apiKey: credential.key }, source: "stored API key" }
            : undefined;
        }
      }
    },
    models: [],
    api: openAICompletionsApi()
  }));

  // 遗留 provider-config 形式：
  // 覆盖现有 provider 的 baseUrl
  pi.registerProvider("anthropic", {
    baseUrl: "https://proxy.example.com"
  });

  // 注册带模型的新 provider
  pi.registerProvider("my-provider", {
    name: "My Provider",
    baseUrl: "https://api.example.com",
    apiKey: "$MY_API_KEY",
    api: "openai-completions",
    models: [
      {
        id: "my-model",
        name: "My Model",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096
      }
    ]
  });
}
```

扩展 factory 也可以是 `async`。对于动态模型发现，请在 factory 中获取并注册模型，而不是在 `session_start` 中。pi 会在启动继续之前等待 factory，因此该 provider 在交互式启动期间以及对 `pi --list-models` 都可用。

## 覆盖现有 Provider {#override-existing-provider}

最简单的用例：把现有 provider 重定向到代理。

```typescript
// 所有 Anthropic 请求现在都经过你的代理
pi.registerProvider("anthropic", {
  baseUrl: "https://proxy.example.com"
});

// 向 OpenAI 请求添加自定义 headers
pi.registerProvider("openai", {
  headers: {
    "X-Custom-Header": "value"
  }
});

// 同时覆盖 baseUrl 和 headers
pi.registerProvider("google", {
  baseUrl: "https://ai-gateway.corp.com/google",
  headers: {
    "X-Corp-Auth": "$CORP_AUTH_TOKEN"  // 环境变量或字面量
  }
});
```

当只提供 `baseUrl` 和/或 `headers`（没有 `models`）时，该 provider 的所有现有模型都会保留，并使用新端点。

## 注册新 Provider {#register-new-provider}

要添加一个全新的 provider，请连同所需配置一起指定 `models`。

如果模型列表来自远程端点，使用 async 扩展 factory：

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

这会在启动完成之前注册获取到的模型。

```typescript
pi.registerProvider("my-llm", {
  baseUrl: "https://api.my-llm.com/v1",
  apiKey: "$MY_LLM_API_KEY",  // 环境变量引用
  api: "openai-completions",  // 使用哪种流式 API
  models: [
    {
      id: "my-llm-large",
      name: "My LLM Large",
      reasoning: true,        // 支持扩展 thinking
      input: ["text", "image"],
      cost: {
        input: 3.0,           // 美元/百万 tokens
        output: 15.0,
        cacheRead: 0.3,
        cacheWrite: 3.75
      },
      contextWindow: 200000,
      maxTokens: 16384
    }
  ]
});
```

当提供 `models` 时，它会**替换**该 provider 的所有现有模型。

`apiKey` 和自定义 header 值使用与 `models.json` 相同的配置值语法：以 `!command` 开头会把整个值作为命令执行，`$ENV_VAR` 和 `${ENV_VAR}` 会插值环境变量，`$$` 发出字面 `$`，`$!` 发出字面 `!`。

## 注销 Provider {#unregister-provider}

使用 `pi.unregisterProvider(name)` 移除先前通过 `pi.registerProvider(name, ...)` 注册的 provider：

```typescript
// 注册
pi.registerProvider("my-llm", {
  baseUrl: "https://api.my-llm.com/v1",
  apiKey: "$MY_LLM_API_KEY",
  api: "openai-completions",
  models: [
    {
      id: "my-llm-large",
      name: "My LLM Large",
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
      contextWindow: 200000,
      maxTokens: 16384
    }
  ]
});

// 稍后移除它
pi.unregisterProvider("my-llm");
```

注销会移除该 provider 的动态模型、API key 回退、OAuth provider 注册以及自定义 stream handler 注册。任何被覆盖的内置模型或 provider 行为都会恢复。

在初始扩展加载阶段之后进行的调用会立即生效，因此不需要 `/reload`。

### API 类型 {#api-types}

`api` 字段决定使用哪种流式实现：

| API | 用于 |
|-----|---------|
| `anthropic-messages` | Anthropic Claude API 及其兼容实现 |
| `openai-completions` | OpenAI Chat Completions API 及其兼容实现 |
| `openai-responses` | OpenAI Responses API |
| `azure-openai-responses` | Azure OpenAI Responses API |
| `openai-codex-responses` | OpenAI Codex Responses API |
| `mistral-conversations` | 原生 Mistral Chat Completions 流式处理 |
| `google-generative-ai` | Google Generative AI API |
| `google-vertex` | Google Vertex AI API |
| `bedrock-converse-stream` | Amazon Bedrock Converse API |

大多数 OpenAI 兼容 provider 可以与 `openai-completions` 一起使用。使用模型级 `thinkingLevelMap` 处理模型特定的 thinking 级别，使用 `compat` 处理 provider 怪癖。`xhigh` 和 `max` 级别是 opt-in，需要非 null 的映射条目，并且可能被不支持的空洞隔开：

```typescript
models: [{
  id: "custom-model",
  // ...
  reasoning: true,
  thinkingLevelMap: {              // 将 pi 级别映射到 provider 值；null 隐藏不支持的级别
    minimal: null,
    low: null,
    medium: null,
    high: "default",
    xhigh: null,
    max: "max"
  },
  compat: {
    supportsDeveloperRole: false,   // 使用 "system" 而不是 "developer"
    supportsReasoningEffort: true,
    maxTokensField: "max_tokens",   // 而不是 "max_completion_tokens"
    requiresToolResultName: true,   // 工具结果需要 name 字段
    thinkingFormat: "qwen",        // 顶层 enable_thinking: true
    cacheControlFormat: "anthropic" // Anthropic 风格的 cache_control 标记
  }
}]
```

对 OpenRouter 风格的 `reasoning: { effort }` 控制使用 `openrouter`。对 Together 风格的 `reasoning: { enabled }` 控制使用 `together`；在启用 `supportsReasoningEffort` 时，它也会发送 `reasoning_effort`。对读取 `chat_template_kwargs.enable_thinking` 并需要 `preserve_thinking` 的本地 Qwen 兼容服务器使用 `qwen-chat-template`。
对通过系统提示、最后一个工具定义，以及最后一条 user、assistant 或 tool-result 文本内容上的 `cache_control` 暴露 Anthropic 风格 prompt caching 的 OpenAI 兼容 provider，使用 `cacheControlFormat: "anthropic"`。

对于使用 `api: "anthropic-messages"` 的 Anthropic 兼容 provider，在其上游模型需要自适应 thinking（`thinking.type: "adaptive"` 加上 `output_config.effort`）的模型或 provider 上设置 `compat.forceAdaptiveThinking: true`。内置自适应 Claude 模型会自动设置这一点。仅对发出空 thinking 签名并期望在回放时使用 `signature: ""` 的 provider 设置 `compat.allowEmptySignature: true`。

> 迁移说明：Mistral 已从 `openai-completions` 迁移到 `mistral-conversations`。
> 对原生 Mistral 模型使用 `mistral-conversations`。
> 如果你有意把 Mistral 兼容/自定义端点路由到 `openai-completions`，请按需显式设置 `compat` 标志。

### Auth Header {#auth-header}

如果你的 provider 期望 `Authorization: Bearer <key>` 但不使用标准 API，设置 `authHeader: true`：

```typescript
pi.registerProvider("custom-api", {
  baseUrl: "https://api.example.com",
  apiKey: "$MY_API_KEY",
  authHeader: true,  // 添加 Authorization: Bearer header
  api: "openai-completions",
  models: [...]
});
```

密钥会为每个请求解析。显式的请求 `Authorization` header 优先于生成的值。

## OAuth 支持 {#oauth-support}

添加与 `/login` 集成的 OAuth/SSO 认证：

```typescript
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";

pi.registerProvider("corporate-ai", {
  baseUrl: "https://ai.corp.com/v1",
  api: "openai-responses",
  models: [...],
  oauth: {
    name: "Corporate AI (SSO)",

    async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
      const method = await callbacks.onSelect({
        message: "Select login method:",
        options: [
          { id: "browser", label: "Browser OAuth" },
          { id: "device", label: "Device code" }
        ]
      });
      if (!method) throw new Error("Login cancelled");

      let code: string;
      if (method === "device") {
        callbacks.onDeviceCode({
          userCode: "ABCD-1234",
          verificationUri: "https://sso.corp.com/device",
          intervalSeconds: 5,
          expiresInSeconds: 900
        });
        code = await pollDeviceCodeUntilComplete();
      } else {
        callbacks.onAuth({ url: "https://sso.corp.com/authorize?..." });
        code = await callbacks.onPrompt({ message: "Enter SSO code:" });
      }

      // 用 code 换取 tokens（你的实现）
      const tokens = await exchangeCodeForTokens(code);

      return {
        refresh: tokens.refreshToken,
        access: tokens.accessToken,
        expires: Date.now() + tokens.expiresIn * 1000
      };
    },

    async refreshToken(credentials: OAuthCredentials, signal: AbortSignal): Promise<OAuthCredentials> {
      const tokens = await refreshAccessToken(credentials.refresh, signal);
      return {
        refresh: tokens.refreshToken ?? credentials.refresh,
        access: tokens.accessToken,
        expires: Date.now() + tokens.expiresIn * 1000
      };
    },

    getApiKey(credentials: OAuthCredentials): string {
      return credentials.access;
    }
  }
});
```

注册后，用户可以通过 `/login corporate-ai` 进行认证。

### OAuthLoginCallbacks {#oauthlogincallbacks}

`callbacks` 对象为 provider 自有流程提供与 UI 无关的交互：

```typescript
interface OAuthLoginCallbacks {
  // 在浏览器中打开 URL（用于 OAuth 重定向）
  onAuth(params: { url: string }): void;

  // 显示设备码（用于设备授权流程）
  onDeviceCode(params: {
    userCode: string;
    verificationUri: string;
    intervalSeconds?: number;
    expiresInSeconds?: number;
  }): void;

  // 显示瞬时进度
  onProgress?(message: string): void;

  // 提示用户输入（用于手动 token 输入）
  onPrompt(params: { message: string }): Promise<string>;

  // 显示交互式选择器，例如选择浏览器 OAuth 还是设备码
  onSelect(params: {
    message: string;
    options: { id: string; label: string }[];
  }): Promise<string | undefined>;
}
```

### OAuthCredentials {#oauthcredentials}

凭据会持久化到 `~/.pi/agent/auth.json`：

```typescript
interface OAuthCredentials {
  refresh: string;   // Refresh token（用于 refreshToken()）
  access: string;    // Access token（由 getApiKey() 返回）
  expires: number;   // 过期时间戳，单位毫秒
}
```

## 自定义流式 API {#custom-streaming-api}

对于使用非标准 API 的 provider，实现 `streamSimple`。在编写自己的实现之前，先研究现有的 API 实现：

**参考实现：**
- [anthropic-messages.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/api/anthropic-messages.ts) - Anthropic Messages API
- [mistral-conversations.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/api/mistral-conversations.ts) - Mistral Conversations API
- [openai-completions.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/api/openai-completions.ts) - OpenAI Chat Completions
- [openai-responses.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/api/openai-responses.ts) - OpenAI Responses API
- [google-generative-ai.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/api/google-generative-ai.ts) - Google Generative AI
- [bedrock-converse-stream.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/api/bedrock-converse-stream.ts) - AWS Bedrock

### 流模式 {#stream-pattern}

所有 provider 都遵循相同的模式：

```typescript
import {
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  calculateCost,
  createAssistantMessageEventStream,
} from "@earendil-works/pi-ai";

function streamMyProvider(
  model: Model<any>,
  context: Context,
  options?: SimpleStreamOptions
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  (async () => {
    // 初始化输出消息
    const output: AssistantMessage = {
      role: "assistant",
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "pending",
      timestamp: Date.now(),
    };

    try {
      // 推送 start 事件
      stream.push({ type: "start", partial: output });

      // 发起 API 请求并处理响应...
      // 在内容到达时推送 content 事件，并根据终止事件设置 stopReason。
      if (output.stopReason === "pending") {
        throw new Error("Provider stream ended without a stop reason");
      }
      if (output.stopReason === "error" || output.stopReason === "aborted") {
        throw new Error(output.errorMessage || "An unknown error occurred");
      }

      // 推送 done 事件
      stream.push({
        type: "done",
        reason: output.stopReason,
        message: output
      });
      stream.end();
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = error instanceof Error ? error.message : String(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  })();

  return stream;
}
```

### 事件类型 {#event-types}

通过 `stream.push()` 按此顺序推送事件：

1. `{ type: "start", partial: output }` - 流已开始

2. 内容事件（可重复，为每个块跟踪 `contentIndex`）：
   - `{ type: "text_start", contentIndex, partial }` - 文本块已开始
   - `{ type: "text_delta", contentIndex, delta, partial }` - 文本分片
   - `{ type: "text_end", contentIndex, content, partial }` - 文本块已结束
   - `{ type: "thinking_start", contentIndex, partial }` - Thinking 已开始
   - `{ type: "thinking_delta", contentIndex, delta, partial }` - Thinking 分片
   - `{ type: "thinking_end", contentIndex, content, partial }` - Thinking 已结束
   - `{ type: "toolcall_start", contentIndex, partial }` - 工具调用已开始
   - `{ type: "toolcall_delta", contentIndex, delta, partial }` - 工具调用 JSON 分片
   - `{ type: "toolcall_end", contentIndex, toolCall, partial }` - 工具调用已结束

3. `{ type: "done", reason, message }` 或 `{ type: "error", reason, error }` - 流已结束

每个事件中的 `partial` 字段包含当前的 `AssistantMessage` 状态。在收到数据时更新 `output.content`，然后将 `output` 作为 `partial` 包含进去。

### 内容块 {#content-blocks}

在内容块到达时把它们加入 `output.content`：

```typescript
// 文本块
output.content.push({ type: "text", text: "" });
stream.push({ type: "text_start", contentIndex: output.content.length - 1, partial: output });

// 文本到达时
const block = output.content[contentIndex];
if (block.type === "text") {
  block.text += delta;
  stream.push({ type: "text_delta", contentIndex, delta, partial: output });
}

// 块完成时
stream.push({ type: "text_end", contentIndex, content: block.text, partial: output });
```

### 工具调用 {#tool-calls}

工具调用需要累积 JSON 并解析：

```typescript
// 开始工具调用
output.content.push({
  type: "toolCall",
  id: toolCallId,
  name: toolName,
  arguments: {}
});
stream.push({ type: "toolcall_start", contentIndex: output.content.length - 1, partial: output });

// 累积 JSON
let partialJson = "";
partialJson += jsonDelta;
try {
  block.arguments = JSON.parse(partialJson);
} catch {}
stream.push({ type: "toolcall_delta", contentIndex, delta: jsonDelta, partial: output });

// 完成
stream.push({
  type: "toolcall_end",
  contentIndex,
  toolCall: { type: "toolCall", id, name, arguments: block.arguments },
  partial: output
});
```

### 用量与费用 {#usage-and-cost}

根据 API 响应更新 usage 并计算费用：

```typescript
output.usage.input = response.usage.input_tokens;
output.usage.output = response.usage.output_tokens;
output.usage.cacheRead = response.usage.cache_read_tokens ?? 0;
output.usage.cacheWrite = response.usage.cache_write_tokens ?? 0;
output.usage.totalTokens = output.usage.input + output.usage.output +
                           output.usage.cacheRead + output.usage.cacheWrite;
calculateCost(model, output.usage);
```

### 上下文溢出错误 {#context-overflow-errors}

当请求超过模型的上下文窗口时，pi 可以通过压缩对话并重试来自动恢复。只有当 pi 把该失败识别为 overflow 时，这种恢复才会启动。

检测会在最终确定的 assistant 消息上运行：

- `stopReason === "error"`
- `errorMessage` 匹配 pi 已知的 overflow 模式之一（参见 [`packages/ai/src/utils/overflow.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/utils/overflow.ts)）

如果你的 provider 返回的 overflow 错误消息不被 pi 识别，请从注册该 provider 的同一扩展中规范化错误。使用 `message_end` 处理函数改写 assistant 消息，使其 `errorMessage` 以 pi 能识别的短语开头。通用回退 `context_length_exceeded` 是最安全的选择。

```typescript
const MY_PROVIDER_OVERFLOW_PATTERN = /your provider's overflow phrase/i;

export default function (pi: ExtensionAPI) {
  pi.registerProvider("my-provider", { /* ... */ });

  pi.on("message_end", (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant") return;
    if (message.stopReason !== "error") return;
    if (
      message.provider !== "my-provider" &&
      ctx.model?.provider !== "my-provider"
    )
      return;

    const errorMessage = message.errorMessage ?? "";
    if (errorMessage.includes("context_length_exceeded")) return;
    if (!MY_PROVIDER_OVERFLOW_PATTERN.test(errorMessage)) return;

    return {
      message: {
        ...message,
        errorMessage: `context_length_exceeded: ${errorMessage}`,
      },
    };
  });
}
```

`message_end` 会在 pi 为自动压缩跟踪 assistant 消息之前运行，因此 pi 检查的是改写后的 `errorMessage`。有了这一点，pi 将会：

1. 从 `errorMessage` 检测 overflow。
2. 从活动上下文中丢弃失败的 assistant 消息。
3. 运行压缩。
4. 重试该请求一次。

请仔细保护这次改写：

- 把它限定到你的 provider（`message.provider` 和 `ctx.model?.provider`），这样其他 provider 的无关错误不会被改动。
- 匹配 provider 特定模式，而不是 pi 的通用 overflow 模式。改写速率限制或节流错误（`rate limit`、`too many requests`）会错误触发压缩，而不是 pi 正常的退避重试路径。
- 当 `errorMessage` 已经包含 `context_length_exceeded` 时跳过，以便处理函数是幂等的。

### 注册 {#registration}

注册你的 stream 函数：

```typescript
pi.registerProvider("my-provider", {
  baseUrl: "https://api.example.com",
  apiKey: "$MY_API_KEY",
  api: "my-custom-api",
  models: [...],
  streamSimple: streamMyProvider
});
```

## 测试你的实现 {#testing-your-implementation}

用内置 provider 使用的同一套测试套件测试你的 provider。从 [packages/ai/test/](https://github.com/earendil-works/pi-mono/tree/main/packages/ai/test) 复制并改编这些测试文件：

| 测试 | 用途 |
|------|---------|
| `stream.test.ts` | 基础流式处理、文本输出 |
| `tokens.test.ts` | Token 计数与 usage |
| `abort.test.ts` | AbortSignal 处理 |
| `empty.test.ts` | 空/最小响应 |
| `context-overflow.test.ts` | 上下文窗口限制 |
| `image-limits.test.ts` | 图像输入处理 |
| `unicode-surrogate.test.ts` | Unicode 边界情况 |
| `tool-call-without-result.test.ts` | 工具调用边界情况 |
| `image-tool-result.test.ts` | 工具结果中的图像 |
| `total-tokens.test.ts` | 总 token 计算 |
| `cross-provider-handoff.test.ts` | Provider 之间的上下文交接 |

用你的 provider/模型对运行测试以验证兼容性。

## 配置参考 {#config-reference}

```typescript
interface ProviderConfig {
  /** 在 /login 等 UI 中显示的 provider 名称。 */
  name?: string;

  /** API 端点 URL。定义模型时必需。 */
  baseUrl?: string;

  /** API key 字面量、环境变量插值（$ENV_VAR 或 ${ENV_VAR}），或 !command。定义模型时必需（除非使用 oauth）。 */
  apiKey?: string;

  /** 用于流式处理的 API 类型。定义模型时，在 provider 或模型级别必需。 */
  api?: Api;

  /** 非标准 API 的自定义流式实现。 */
  streamSimple?: (
    model: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions
  ) => AssistantMessageEventStream;

  /** 要包含在请求中的自定义 headers。值使用与 apiKey 相同的解析语法。 */
  headers?: Record<string, string>;

  /** 若为 true，会用解析后的 API key 添加 Authorization: Bearer header。 */
  authHeader?: boolean;

  /** 要注册的模型。如果提供，会替换该 provider 的所有现有模型。 */
  models?: ProviderModelConfig[];

  /** 用于 /login 支持的 OAuth provider。 */
  oauth?: {
    name: string;
    login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;
    refreshToken(credentials: OAuthCredentials, signal: AbortSignal): Promise<OAuthCredentials>;
    getApiKey(credentials: OAuthCredentials): string;
  };
}
```

## 模型定义参考 {#model-definition-reference}

```typescript
interface ProviderModelConfig {
  /** 模型 ID（例如 "claude-sonnet-4-20250514"）。 */
  id: string;

  /** 显示名称（例如 "Claude 4 Sonnet"）。 */
  name: string;

  /** 该特定模型的 API 类型覆盖。 */
  api?: Api;

  /** 该特定模型的 API 端点 URL 覆盖。 */
  baseUrl?: string;

  /** 模型是否支持扩展 thinking。 */
  reasoning: boolean;

  /** 将 pi thinking 级别映射到 provider/模型特定值；null 标记某级别不受支持。 */
  thinkingLevelMap?: Partial<Record<"off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", string | null>>;

  /** 支持的输入类型。 */
  input: ("text" | "image")[];

  /** 每百万 tokens 的费用（用于用量跟踪）。 */
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };

  /** 最大上下文窗口大小（tokens）。 */
  contextWindow: number;

  /** 最大输出 tokens。 */
  maxTokens: number;

  /** 该特定模型的自定义 headers。 */
  headers?: Record<string, string>;

  /** 所选 API 的兼容性设置。 */
  compat?: {
    // openai-completions
    supportsStore?: boolean;
    supportsDeveloperRole?: boolean;
    supportsReasoningEffort?: boolean;
    supportsUsageInStreaming?: boolean;
    supportsFinishReason?: boolean;
    supportsStrictMode?: boolean;
    supportsOpenAIGrammarTools?: boolean; // openai-completions/openai-responses；false 时回退为普通 function 工具
    maxTokensField?: "max_completion_tokens" | "max_tokens";
    requiresToolResultName?: boolean;
    requiresAssistantAfterToolResult?: boolean;
    requiresThinkingAsText?: boolean;
    requiresReasoningContentOnAssistantMessages?: boolean;
    thinkingFormat?: "openai" | "openrouter" | "deepseek" | "together" | "baseten" | "zai" | "qwen" | "chat-template" | "qwen-chat-template" | "string-thinking" | "ant-ling";
    chatTemplateKwargs?: Record<string, string | number | boolean | null | { "$var": "thinking.enabled" | "thinking.effort" | "thinking.budget"; omitWhenOff?: boolean }>;
    chatTemplateArgs?: Record<string, string | number | boolean | null | { "$var": "thinking.enabled" | "thinking.effort" | "thinking.budget"; omitWhenOff?: boolean }>;
    thinkingTokenBudgetField?: "thinking_token_budget" | "thinking_budget" | "thinking_budget_tokens";
    supportsThinkingTokenBudget?: boolean;
    cacheControlFormat?: "anthropic";
    sessionAffinityFormat?: "openai" | "openai-nosession" | "openrouter";
    sendSessionAffinityHeaders?: boolean;

    // anthropic-messages
    supportsEagerToolInputStreaming?: boolean;
    supportsLongCacheRetention?: boolean;
    sendSessionAffinityHeaders?: boolean;
    supportsCacheControlOnTools?: boolean;
    forceAdaptiveThinking?: boolean;
    allowEmptySignature?: boolean;
    supportsStrictTools?: boolean;
  };
}
```

`openrouter` 发送 `reasoning: { effort }`。`deepseek` 发送 `thinking: { type: "enabled" | "disabled" }`，并在启用时发送 `reasoning_effort`。`together` 发送 `reasoning: { enabled }`，并且在启用 `supportsReasoningEffort` 时也发送 `reasoning_effort`。`qwen` 用于 DashScope 风格的顶层 `enable_thinking`。对读取 `chat_template_kwargs.enable_thinking` 并需要 `preserve_thinking` 的本地 Qwen 兼容服务器使用 `qwen-chat-template`。对可配置的 `chat_template_kwargs` 使用 `chat-template`，例如在 vLLM 后面的 DeepSeek V3.x，使用 `chatTemplateKwargs: { "thinking": { "$var": "thinking.enabled" } }`。当 provider 期望开关值位于 `chat_template_args` 下、并且可选支持顶层 `reasoning_effort` 时，使用带 `chatTemplateArgs` 的 `thinkingFormat: "baseten"`。
`thinkingTokenBudgetField` 会把按级别钳制后的 thinking 预算作为顶层请求字段发送（vLLM 上为 `thinking_token_budget`，Qwen/SGLang 上为 `thinking_budget`，llama.cpp 上为 `thinking_budget_tokens`）。`supportsThinkingTokenBudget: true` 是 vLLM 字段名的别名。不要在 DashScope Qwen 模型上把它与 `reasoning_effort` 组合使用。
`cacheControlFormat: "anthropic"` 会把 Anthropic 风格的 `cache_control` 标记应用到系统提示、最后一个工具定义，以及最后一条 user、assistant 或 tool-result 文本内容。
