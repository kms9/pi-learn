本文是 `models.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 自定义模型 {#custom-models}

通过 `~/.pi/agent/models.json` 添加自定义 provider 和模型（Ollama、vLLM、LM Studio、代理）。

## 目录 {#table-of-contents}

- [最小示例](#minimal-example)
- [完整示例](#full-example)
- [支持的 API](#supported-apis)
- [Provider 配置](#provider-configuration)
- [模型配置](#model-configuration)
- [覆盖内置 Provider](#overriding-built-in-providers)
- [按模型覆盖](#per-model-overrides)
- [Anthropic Messages 兼容性](#anthropic-messages-compatibility)
- [OpenAI 兼容性](#openai-compatibility)

## 最小示例 {#minimal-example}

对于本地模型（Ollama、LM Studio、vLLM），每个模型只需 `id`：

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "llama3.1:8b" },
        { "id": "qwen2.5-coder:7b" }
      ]
    }
  }
}
```

`apiKey` 值是占位符，因为 Ollama 会忽略它。pi 仍然把模型视为需要认证后才会出现在 `/model` 中，因此无密钥的本地服务器应保留一个虚拟值、用 `/login` 为该 provider 保存密钥，或在选择模型时传入 `--api-key`。

一些 OpenAI 兼容服务器不理解用于具备推理能力的模型的 `developer` 角色。对这些 provider，将 `compat.supportsDeveloperRole` 设为 `false`，以便 pi 把系统提示作为 `system` 消息发送。如果服务器也不支持 `reasoning_effort`，同样将 `compat.supportsReasoningEffort` 设为 `false`。

你可以在 provider 级别设置 `compat` 以应用于所有模型，或在模型级别覆盖特定模型。这通常适用于 Ollama、vLLM、SGLang 以及类似的 OpenAI 兼容服务器。

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [
        {
          "id": "gpt-oss:20b",
          "reasoning": true
        }
      ]
    }
  }
}
```

## 完整示例 {#full-example}

在需要特定值时覆盖默认值：

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        {
          "id": "llama3.1:8b",
          "name": "Llama 3.1 8B (Local)",
          "reasoning": false,
          "input": ["text"],
          "contextWindow": 128000,
          "maxTokens": 32000,
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
        }
      ]
    }
  }
}
```

每次打开 `/model` 时都会重新加载该文件。可在会话中编辑；无需重启。

## Google AI Studio 示例 {#google-ai-studio-example}

使用带 `baseUrl` 的 `google-generative-ai` 来添加来自 Google AI Studio 的模型，包括自定义 Gemma 4 条目：

```json
{
  "providers": {
    "my-google": {
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
      "api": "google-generative-ai",
      "apiKey": "$GEMINI_API_KEY",
      "models": [
        {
          "id": "gemma-4-31b-it",
          "name": "Gemma 4 31B",
          "input": ["text", "image"],
          "contextWindow": 262144,
          "reasoning": true
        }
      ]
    }
  }
}
```

向 `google-generative-ai` API 类型添加自定义模型时，`baseUrl` 是必需的。

## 支持的 API {#supported-apis}

| API | 说明 |
|-----|-------------|
| `openai-completions` | OpenAI Chat Completions（兼容性最广） |
| `openai-responses` | OpenAI Responses API |
| `anthropic-messages` | Anthropic Messages API |
| `google-generative-ai` | Google Generative AI |

在 provider 级别设置 `api`（作为所有模型的默认值），或在模型级别设置（按模型覆盖）。

## Provider 配置 {#provider-configuration}

| 字段 | 说明 |
|-------|-------------|
| `baseUrl` | API 端点 URL |
| `api` | API 类型（见上） |
| `apiKey` | 可选的 API key 配置（见下方的值解析）。当认证由 `/login`/`auth.json` 或 CLI `--api-key` 提供时可以省略。 |
| `oauth` | 动态 OAuth provider 类型。当前支持 `"radius"`；需要网关 `baseUrl`。 |
| `headers` | 自定义 headers（见下方的值解析） |
| `authHeader` | 设为 `true` 以自动添加 `Authorization: Bearer <apiKey>` |
| `models` | 模型配置数组 |
| `modelOverrides` | 对该 provider 上内置或扩展注册模型的按模型覆盖 |

对于带有 `models` 的 provider，非内置 provider 配置需要 `baseUrl`，以及在 provider 或模型级别的 `api` 值。加载文件不要求 `apiKey`：当通过 `/login`/`auth.json`、CLI `--api-key` 或 provider `apiKey` 配置了认证后，模型才会可用。如果没有配置认证，模型会加载，但在 `/model` 和 `--list-models` 中保持不可用。

### 值解析 {#value-resolution}

`apiKey` 和 `headers` 字段支持命令执行、环境变量插值以及字面量：

- **Shell 命令：** 以 `"!command"` 开头会把整个值作为命令执行，并使用 stdout
  ```json
  "apiKey": "!security find-generic-password -ws 'anthropic'"
  "apiKey": "!op read 'op://vault/item/credential'"
  ```
- **环境变量插值：** `"$ENV_VAR"` 或 `"${ENV_VAR}"` 使用该命名变量的值。插值可以出现在更大的字面量中。
  ```json
  "apiKey": "$MY_API_KEY"
  "apiKey": "${KEY_PREFIX}_${KEY_SUFFIX}"
  ```
  `$FOO_BAR` 是变量 `FOO_BAR`；当 `BAR` 是字面文本时使用 `${FOO}_BAR`。缺失的环境变量会使该值无法解析。
- **转义：** `"$$"` 发出字面 `"$"`；`"$!"` 发出字面 `"!"` 且不触发命令执行。
  ```json
  "apiKey": "$$literal-dollar-prefix"
  "apiKey": "$!literal-bang-prefix"
  ```
- **字面值：** 直接使用。纯大写字符串如 `MY_API_KEY` 是字面量；环境变量请使用 `$MY_API_KEY`。
  ```json
  "apiKey": "sk-..."
  ```

对于 `models.json`，shell 命令在请求时解析。pi 有意不对任意命令应用内置 TTL、过期复用或恢复逻辑。不同命令需要不同的缓存与失败策略，pi 无法推断正确的那一种。

如果你的命令很慢、很贵、有速率限制，或应在瞬时失败时继续使用先前的值，请把它包进你自己实现了所需缓存或 TTL 行为的脚本或命令中。

`/model` 可用性检查使用已配置的认证是否存在，不会执行 shell 命令。

### 自定义 Headers {#custom-headers}

```json
{
  "providers": {
    "custom-proxy": {
      "baseUrl": "https://proxy.example.com/v1",
      "apiKey": "$MY_API_KEY",
      "api": "anthropic-messages",
      "headers": {
        "x-portkey-api-key": "$PORTKEY_API_KEY",
        "x-secret": "!op read 'op://vault/item/secret'"
      },
      "models": [...]
    }
  }
}
```

## 模型配置 {#model-configuration}

| 字段 | 必需 | 默认值 | 说明 |
|-------|----------|---------|-------------|
| `id` | 是 | — | 模型标识符（传给 API） |
| `name` | 否 | `id` | 人类可读的模型标签。用于匹配（`--model` 模式），并显示为次要模型详情文本。 |
| `api` | 否 | provider 的 `api` | 覆盖该模型的 provider API |
| `reasoning` | 否 | `false` | 支持扩展 thinking |
| `thinkingLevelMap` | 否 | 省略 | 将 pi thinking 级别映射到 provider 值，并标记不支持的级别（见下） |
| `input` | 否 | `["text"]` | 输入类型：`["text"]` 或 `["text", "image"]` |
| `contextWindow` | 否 | `128000` | 上下文窗口大小（tokens） |
| `maxTokens` | 否 | `16384` | 最大输出 tokens |
| `samplingParams` | 否 | 省略 | 原样合并进每个请求体的采样参数（见下） |
| `cost` | 否 | 全为零 | 每百万 token 费率，以及可选的请求级输入定价档位 |
| `compat` | 否 | provider `compat` | Provider 兼容性覆盖。当两者都设置时，与 provider 级 `compat` 合并。 |

一个 cost 档位提供完整的替代费率集合，并在总输入用量（`input + cacheRead + cacheWrite`）超过 `inputTokensAbove` 时应用于整个请求。当多个档位匹配时，最高阈值胜出。

```json
{
  "cost": {
    "input": 5,
    "output": 30,
    "cacheRead": 0.5,
    "cacheWrite": 6.25,
    "tiers": [
      {
        "inputTokensAbove": 272000,
        "input": 10,
        "output": 45,
        "cacheRead": 1,
        "cacheWrite": 12.5
      }
    ]
  }
}
```

当前行为：
- `/model`、`--list-models` 以及交互式页脚按模型 `id` 显示条目。
- 配置的 `name` 用于模型匹配和次要模型详情文本。它不会替换页脚/状态栏中的模型 id。

### 采样参数 {#sampling-parameters}

`samplingParams` 是一个自由形式对象，会在 pi 自己设置的字段之后原样合并进该模型的每个请求体，因此它的键会胜出。用它发送 pi 未建模的采样参数——包括服务器特定参数，例如 llama.cpp 的 `min_p` 或 vLLM 的 `top_k`：

```json
{
  "id": "deepseek-v4-flash",
  "samplingParams": {
    "temperature": 1.0,
    "top_p": 0.95,
    "top_k": 0,
    "min_p": 0.0
  }
}
```

只有 OpenAI 兼容 API 会应用它（`openai-completions`、`openai-responses`、`azure-openai-responses`）；其他 API 会忽略它。键会覆盖 pi 的命名请求字段（例如这里的 `temperature` 键会胜过请求级 temperature），因此最好把它作为该模型采样的单一真实来源。在 `modelOverrides` 中，`samplingParams` 会按键与基础模型的值合并。

常量 thinking-token 上限也可以放在这里，但它不会跟随 `thinkingBudgets`，也不会为答案留出空间。为此请优先使用 `compat.thinkingTokenBudgetField`（或 `supportsThinkingTokenBudget` 别名）。

### Thinking 级别映射 {#thinking-level-map}

在模型上使用 `thinkingLevelMap` 来描述模型特定的 thinking 控制。键是 pi thinking 级别：`off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`。映射可以有空洞；例如，一个模型可以暴露 `high` 和 `max` 而不暴露 `xhigh`。

值是三态的：

| 值 | 含义 |
|-------|---------|
| 省略 | 直到 `high` 的标准级别使用 provider 的默认映射；扩展的 `xhigh` 和 `max` 级别不受支持 |
| string | 该级别受支持，并且这个值会发送给 provider |
| `null` | 该级别不受支持，会被隐藏/跳过/钳制掉 |

仅支持 off、high 和 max reasoning 的模型示例：

```json
{
  "id": "deepseek-v4-pro",
  "reasoning": true,
  "thinkingLevelMap": {
    "minimal": null,
    "low": null,
    "medium": null,
    "high": "high",
    "xhigh": null,
    "max": "max"
  }
}
```

thinking 无法关闭的模型示例：

```json
{
  "id": "always-thinking-model",
  "reasoning": true,
  "thinkingLevelMap": {
    "off": null
  }
}
```

迁移：使用 `compat.reasoningEffortMap` 的旧配置应将该映射移到模型级 `thinkingLevelMap`。对不应出现在 UI 中的级别使用 `null`。

## 覆盖内置 Provider {#overriding-built-in-providers}

在不重新定义模型的情况下，把内置 provider 路由到代理：

```json
{
  "providers": {
    "anthropic": {
      "baseUrl": "https://my-proxy.example.com/v1"
    }
  }
}
```

所有内置 Anthropic 模型仍然可用。现有的 OAuth 或 API key 认证会继续工作。

要把自定义模型合并进内置 provider，请包含 `models` 数组：

```json
{
  "providers": {
    "anthropic": {
      "baseUrl": "https://my-proxy.example.com/v1",
      "apiKey": "$ANTHROPIC_API_KEY",
      "api": "anthropic-messages",
      "models": [...]
    }
  }
}
```

合并语义：
- 内置模型会保留。
- 自定义模型按 `id` 在该 provider 内 upsert。
- 如果自定义模型 `id` 与内置模型 `id` 匹配，自定义模型会替换该内置模型。
- 如果自定义模型 `id` 是新的，它会与内置模型一起添加。

## 按模型覆盖 {#per-model-overrides}

使用 `modelOverrides` 自定义内置模型以及匹配的扩展注册模型，而不替换该 provider 的完整模型列表。

```json
{
  "providers": {
    "openrouter": {
      "modelOverrides": {
        "anthropic/claude-sonnet-4": {
          "name": "Claude Sonnet 4 (Bedrock Route)",
          "compat": {
            "openRouterRouting": {
              "only": ["amazon-bedrock"]
            }
          }
        }
      }
    }
  }
}
```

`modelOverrides` 对每个模型支持这些字段：`name`、`reasoning`、`thinkingLevelMap`、`input`、`cost`（部分）、`contextWindow`、`maxTokens`、`samplingParams`（按键合并）、`headers`、`compat`。

直接的 OpenAI GPT-5.6 Sol、Terra 和 Luna 默认使用 `272000` 上下文窗口，以便请求保持在 OpenAI 的短上下文定价档位内。若要选择加入 OpenAI 的 1.05M 上下文窗口，请为你使用的每个模型增大它：

```json
{
  "providers": {
    "openai": {
      "modelOverrides": {
        "gpt-5.6-sol": {
          "contextWindow": 1050000
        }
      }
    }
  }
}
```

该覆盖会保留内置定价元数据。总输入 tokens 超过 272K 的请求会对整个请求使用 GPT-5.6 的长上下文费率。需要时对 `gpt-5.6-terra` 或 `gpt-5.6-luna` 应用相同覆盖。

行为说明：
- `modelOverrides` 会应用于内置 provider 模型以及匹配的扩展注册 provider 模型。
- 未知模型 ID 会被忽略。
- 你可以把 provider 级 `baseUrl`/`headers` 与 `modelOverrides` 组合使用。
- 覆盖 `name` 只改变模型匹配和次要详情文本；页脚和主要模型列表继续显示模型 `id`。
- 如果某个 provider 也定义了 `models`，自定义模型会在内置覆盖之后合并。具有相同 `id` 的自定义模型会替换被覆盖的内置模型条目。

## Anthropic Messages 兼容性 {#anthropic-messages-compatibility}

对于使用 `api: "anthropic-messages"` 的 provider 或代理，使用 `compat` 控制 Anthropic 特定的请求兼容性。

默认情况下，pi 会发送每个工具的 `eager_input_streaming: true`。如果代理或 Anthropic 兼容后端拒绝该字段，将 `supportsEagerToolInputStreaming` 设为 `false`。Pi 会省略 `tools[].eager_input_streaming`，并改为对启用工具的请求发送遗留的 `fine-grained-tool-streaming-2025-05-14` beta header。

一些 Anthropic 模型需要自适应 thinking（`thinking.type: "adaptive"` 加上 `output_config.effort`），而不是基于预算的遗留 thinking payload。内置模型会自动设置这一点。对于路由到这些模型的自定义 provider 或别名，将 `forceAdaptiveThinking` 设为 `true`。

支持按 turn effort 的 Claude 模型使用 `supportsMidConvoEffort`。Pi 随后会持久化每次响应的 provider effort，在后续请求上重建仅含 effort 的系统消息，并发送带有 `prefix_mismatch_behavior: "drop_block"` 的 thinking 绑定控制，以避免过期的已签名 thinking 前缀导致持续的 400 响应。仅对忠实 Anthropic Messages 传输上受支持的精确 Claude 模型设置此项；不要为仅仅模仿 Messages 形态的 API 启用它。

一些 Anthropic 兼容 provider 会发出带有空签名的 thinking 块，并且仍然期望在回放时带上它们。仅对这些 provider 将 `allowEmptySignature` 设为 `true`；真正的 Anthropic 会拒绝空的 thinking 签名。

内置 Anthropic 模型在其模型元数据中启用 `supportsStrictTools`。当端点接受严格 JSON-schema 工具定义时，自定义 Anthropic 兼容模型必须将其设为 `true`。

```json
{
  "providers": {
    "anthropic-proxy": {
      "baseUrl": "https://proxy.example.com",
      "api": "anthropic-messages",
      "apiKey": "$ANTHROPIC_PROXY_KEY",
      "compat": {
        "supportsEagerToolInputStreaming": false,
        "supportsLongCacheRetention": true,
        "forceAdaptiveThinking": true,
        "allowEmptySignature": true
      },
      "models": [
        {
          "id": "claude-opus-4-7",
          "reasoning": true,
          "input": ["text", "image"]
        }
      ]
    }
  }
}
```

| 字段 | 说明 |
|-------|-------------|
| `supportsEagerToolInputStreaming` | provider 是否接受每个工具的 `eager_input_streaming`。默认：`true`。设为 `false` 以省略该字段，并在启用工具的请求上使用遗留的 fine-grained tool streaming beta header。 |
| `supportsLongCacheRetention` | 当 cache retention 为 `long` 时，provider 是否接受 Anthropic 长缓存保留（`cache_control.ttl: "1h"`）。默认：`true`。 |
| `sendSessionAffinityHeaders` | 启用缓存时是否从 session id 发送 `x-session-affinity`。默认：对已知 provider 自动检测。 |
| `supportsCacheControlOnTools` | provider 是否接受工具定义上的 Anthropic 风格 `cache_control` 标记。默认：`true`。 |
| `forceAdaptiveThinking` | 是否为该模型发送自适应 thinking（`thinking.type: "adaptive"` 加上 `output_config.effort`）。内置自适应模型会自动设置。默认：`false`。 |
| `supportsMidConvoEffort` | 精确的 Claude 模型传输是否支持按 turn 的 effort 系统消息和 thinking 绑定控制。启用时，Pi 会持久化原生 effort 级别，并始终发送 `drop_block`。默认：`false`。 |
| `allowEmptySignature` | 是否将空的 thinking 签名作为 `signature: ""` 回放，而不是把 thinking 转换为文本。默认：`false`。 |
| `supportsStrictTools` | provider 是否接受严格 JSON-schema 工具定义。默认：`false`；内置 Anthropic 模型在生成的元数据中启用它。 |

## OpenAI 兼容性 {#openai-compatibility}

对于只有部分 OpenAI 兼容性的 provider，使用 `compat` 字段。

- Provider 级 `compat` 会作为该 provider 下所有模型的默认值。
- 模型级 `compat` 会覆盖该模型的 provider 级值。

```json
{
  "providers": {
    "local-llm": {
      "baseUrl": "http://localhost:8080/v1",
      "api": "openai-completions",
      "compat": {
        "supportsUsageInStreaming": false,
        "maxTokensField": "max_tokens"
      },
      "models": [...]
    }
  }
}
```

| 字段 | 说明 |
|-------|-------------|
| `supportsStore` | Provider 支持 `store` 字段 |
| `supportsDeveloperRole` | 使用 `developer` 还是 `system` 角色 |
| `supportsReasoningEffort` | 支持 `reasoning_effort` 参数 |
| `supportsUsageInStreaming` | 支持 `stream_options: { include_usage: true }`（默认：`true`） |
| `supportsFinishReason` | 流式响应是否包含 `finish_reason`。为 `false` 时，pi 在流结束时推断 `stop` 或 `toolUse`。默认：`true`。 |
| `maxTokensField` | 使用 `max_completion_tokens` 或 `max_tokens` |
| `requiresToolResultName` | 在工具结果消息上包含 `name` |
| `requiresAssistantAfterToolResult` | 在工具结果之后、用户消息之前插入一条 assistant 消息 |
| `requiresThinkingAsText` | 将 thinking 块转换为纯文本 |
| `requiresReasoningContentOnAssistantMessages` | 启用 reasoning 时，在所有回放的 assistant 消息上包含空的 `reasoning_content` |
| `thinkingFormat` | 使用 `reasoning_effort`、`openrouter`、`deepseek`、`together`、`baseten`、`zai`、`qwen`、`chat-template` 或 `qwen-chat-template` thinking 参数 |
| `chatTemplateKwargs` | 用于 `thinkingFormat: "chat-template"` 的 `chat_template_kwargs` 值；使用 `{ "$var": "thinking.enabled" }`、`{ "$var": "thinking.effort" }` 或 `{ "$var": "thinking.budget" }` 表示由 pi 控制的 thinking 值 |
| `chatTemplateArgs` | 用于 `thinkingFormat: "baseten"` 的 `chat_template_args` 值；使用 `{ "$var": "thinking.enabled" }`、`{ "$var": "thinking.effort" }` 或 `{ "$var": "thinking.budget" }` 表示由 pi 控制的 thinking 值 |
| `thinkingTokenBudgetField` | 用于从 `thinkingBudgets` 限制 reasoning tokens 的顶层请求字段，会钳制以便至少为答案保留 1024 tokens。`"thinking_token_budget"`（vLLM）、`"thinking_budget"`（Qwen/DashScope/SGLang）、`"thinking_budget_tokens"`（llama.cpp）。默认关闭；不会设置在生成的目录上。 |
| `supportsThinkingTokenBudget` | `thinkingTokenBudgetField: "thinking_token_budget"`（vLLM）的别名。优先使用 `thinkingTokenBudgetField`。默认：`false`。 |
| `cacheControlFormat` | 在系统提示、最后一个工具定义，以及最后一条 user、assistant 或 tool-result 文本内容上使用 Anthropic 风格的 `cache_control` 标记。当前仅支持 `anthropic`。 |
| `sendSessionAffinityHeaders` | 对于 `openai-completions`，在启用缓存时从 session id 发送 session-affinity headers。默认：`false`。 |
| `sessionAffinityFormat` | 对于 `openai-completions` 和 `openai-responses`，session-affinity header 格式：`openai` 发送 `session_id`/`x-client-request-id`（completions 还会发送 `x-session-affinity`），`openai-nosession` 省略包含下划线的 `session_id` header，`openrouter` 发送 `x-session-id`。不影响 `prompt_cache_key` body 参数。默认：自动检测。 |
| `supportsStrictMode` | provider 是否接受严格 JSON-schema function 工具定义。默认值取决于 API；内置 OpenAI 模型带有显式能力元数据。 |
| `supportsOpenAIGrammarTools` | OpenAI 兼容 API 是否发出自定义 Lark/regex grammar 工具。为 `false` 时，受语法约束的工具会回退为普通 function 工具。默认：`false`；内置模型目录会为 OpenAI、OpenAI Codex、Azure OpenAI、GitHub Copilot、opencode 和 Cloudflare AI Gateway 上的 GPT-5+ 模型启用它。 |
| `deferredToolsMode` | 使用 provider 特定的延迟工具序列化。当前仅支持 `"kimi"`，用于 Kimi 的 OpenAI 兼容 Chat Completions 格式。 |
| `supportsLongCacheRetention` | 当 cache retention 为 `long` 时，provider 是否接受长缓存保留：OpenAI prompt caching 为 `prompt_cache_retention: "24h"`，当 `cacheControlFormat` 为 `anthropic` 时为 `cache_control.ttl: "1h"`。默认：`true`。 |
| `openRouterRouting` | OpenRouter provider 路由偏好。该对象会原样发送到 [OpenRouter API 请求](https://openrouter.ai/docs/guides/routing/provider-selection) 的 `provider` 字段中。 |
| `vercelGatewayRouting` | 用于 provider 选择的 Vercel AI Gateway 路由配置（`only`、`order`） |

`openrouter` 使用 `reasoning: { effort }`。`together` 使用 `reasoning: { enabled }`，并且在启用 `supportsReasoningEffort` 时也使用 `reasoning_effort`。`qwen` 使用顶层 `enable_thinking`。对需要 `chat_template_kwargs.enable_thinking` 和 `preserve_thinking` 的本地 Qwen 兼容服务器使用 `qwen-chat-template`。对需要可配置 `chat_template_kwargs` 的 vLLM/Hugging Face chat templates 使用 `chat-template`，例如 DeepSeek V3.x 模板的 `chatTemplateKwargs: { "thinking": { "$var": "thinking.enabled" } }`。对通过 `chat_template_args` 暴露开关控制、并且可选支持顶层 `reasoning_effort` 的 provider，使用带 `chatTemplateArgs` 的 `thinkingFormat: "baseten"`。

`thinkingTokenBudgetField` 独立于 `thinkingFormat`。不要在生成的 Qwen 目录上启用它：这些模型已经发送 `reasoning_effort`，并且 DashScope 会拒绝 `thinking_budget` 与 `reasoning_effort` 一起使用。

`cacheControlFormat: "anthropic"` 适用于通过文本内容和工具定义上的 `cache_control` 标记暴露 Anthropic 风格 prompt caching 的 OpenAI 兼容 provider。

示例：

```json
{
  "providers": {
    "openrouter": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "$OPENROUTER_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "openrouter/anthropic/claude-3.5-sonnet",
          "name": "OpenRouter Claude 3.5 Sonnet",
          "compat": {
            "openRouterRouting": {
              "allow_fallbacks": true,
              "require_parameters": false,
              "data_collection": "deny",
              "zdr": true,
              "enforce_distillable_text": false,
              "order": ["anthropic", "amazon-bedrock", "google-vertex"],
              "only": ["anthropic", "amazon-bedrock"],
              "ignore": ["gmicloud", "friendli"],
              "quantizations": ["fp16", "bf16"],
              "sort": {
                "by": "price",
                "partition": "model"
              },
              "max_price": {
                "prompt": 10,
                "completion": 20
              },
              "preferred_min_throughput": {
                "p50": 100,
                "p90": 50
              },
              "preferred_max_latency": {
                "p50": 1,
                "p90": 3,
                "p99": 5
              }
            }
          }
        }
      ]
    }
  }
}
```

Vercel AI Gateway 示例：

```json
{
  "providers": {
    "vercel-ai-gateway": {
      "baseUrl": "https://ai-gateway.vercel.sh/v1",
      "apiKey": "$AI_GATEWAY_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "moonshotai/kimi-k2.5",
          "name": "Kimi K2.5 (Fireworks via Vercel)",
          "reasoning": true,
          "input": ["text", "image"],
          "cost": { "input": 0.6, "output": 3, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 262144,
          "maxTokens": 262144,
          "compat": {
            "vercelGatewayRouting": {
              "only": ["fireworks", "novita"],
              "order": ["fireworks", "novita"]
            }
          }
        }
      ]
    }
  }
}
```
