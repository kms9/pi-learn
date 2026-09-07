本文是 `providers.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 提供商 {#providers}

Pi 通过 OAuth 支持订阅类提供商，并通过环境变量或 auth 文件支持 API key 提供商。内置目录随 pi 一起提供；已配置的提供商可能会刷新更新的目录，并缓存到 `~/.pi/agent/models-store.json` 以便离线使用。

## 目录 {#table-of-contents}

- [订阅](#subscriptions)
- [API Keys](#api-keys)
- [Auth 文件](#auth-file)
- [云提供商](#cloud-providers)
- [llama.cpp](#llamacpp)
- [自定义提供商](#custom-providers)
- [解析顺序](#resolution-order)

## 订阅 {#subscriptions}

在交互模式中使用 `/login`，然后选择提供商：

- ChatGPT Plus/Pro（Codex）
- Claude Pro/Max
- GitHub Copilot
- xAI（Grok/X 订阅）
- OpenRouter（OAuth 签发的 API key，从 OpenRouter credits 计费）
- Radius

使用 `/logout` 清除凭据。Token 存储在 `~/.pi/agent/auth.json` 中，过期后会自动刷新。OpenRouter 则签发用户可控的 API key，不会自动过期。

### OpenAI Codex {#openai-codex}

- 需要 ChatGPT Plus 或 Pro 订阅
- 由 OpenAI 官方认可：[Codex for OSS](https://developers.openai.com/community/codex-for-oss)

### Claude Pro/Max {#claude-promax}

Anthropic 订阅认证对 Claude Pro/Max 账户生效。第三方 harness 用量来自 [extra usage](https://claude.ai/settings/usage)，按 token 计费，不计入 Claude 套餐限额。

### GitHub Copilot {#github-copilot}

- 按 Enter 使用 github.com，或输入你的 GitHub Enterprise Server 域名
- 如果出现 "model not supported"，在 VS Code 中启用：Copilot Chat → 模型选择器 → 选择模型 → "Enable"

### xAI（Grok/X 订阅） {#xai-grokx-subscription}

- 运行 `/login xai`，然后选择 **Use a subscription**
- `XAI_API_KEY` 仍可通过 **Use an API key** 使用

### OpenRouter {#openrouter}

- 运行 `/login openrouter`，然后选择 **Sign in with OpenRouter** 打开 OpenRouter PKCE 授权流程
- 授权会创建用户可控的 OpenRouter API key，从你的 OpenRouter credits 计费
- 在远程/无头机器上（例如通过 SSH），浏览器无法到达 loopback 回调；请把最终重定向 URL（或授权码）粘贴到登录提示中
- `OPENROUTER_API_KEY` 仍可通过 **Use an API key** 使用

### Radius {#radius}

Radius 是动态的 `pi-messages` gateway。`/login radius` 把 OAuth token 存入 `auth.json`；gateway 目录会独立刷新并缓存到 `models-store.json`。自定义 Radius gateway 可以在 `models.json` 中用 `"oauth": "radius"` 和 gateway 的 `baseUrl` 声明。

## API Keys {#api-keys}

### 环境变量或 Auth 文件 {#environment-variables-or-auth-file}

在交互模式中使用 `/login` 并选择提供商，把 API key 存入 `auth.json`，或通过环境变量设置凭据：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

| 提供商 | 环境变量 | `auth.json` key |
|----------|----------------------|------------------|
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic` |
| Ant Ling | `ANT_LING_API_KEY` | `ant-ling` |
| Azure OpenAI Responses | `AZURE_OPENAI_API_KEY` | `azure-openai-responses` |
| OpenAI | `OPENAI_API_KEY` | `openai` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek` |
| NVIDIA NIM | `NVIDIA_API_KEY` | `nvidia` |
| Google Gemini | `GEMINI_API_KEY` | `google` |
| Amazon Bedrock | `AWS_BEARER_TOKEN_BEDROCK` | `amazon-bedrock` |
| Mistral | `MISTRAL_API_KEY` | `mistral` |
| Groq | `GROQ_API_KEY` | `groq` |
| Cerebras | `CEREBRAS_API_KEY` | `cerebras` |
| Cloudflare AI Gateway | `CLOUDFLARE_API_KEY`（另需 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_GATEWAY_ID`） | `cloudflare-ai-gateway` |
| Cloudflare Workers AI | `CLOUDFLARE_API_KEY`（另需 `CLOUDFLARE_ACCOUNT_ID`） | `cloudflare-workers-ai` |
| xAI | `XAI_API_KEY` | `xai` |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter` |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` | `vercel-ai-gateway` |
| ZAI Coding Plan（Global） | `ZAI_API_KEY` | `zai` |
| ZAI Coding Plan（China） | `ZAI_CODING_CN_API_KEY` | `zai-coding-cn` |
| OpenCode Zen | `OPENCODE_API_KEY` | `opencode` |
| OpenCode Go | `OPENCODE_API_KEY` | `opencode-go` |
| Radius | `RADIUS_API_KEY` | `radius` |
| Hugging Face | `HF_TOKEN` | `huggingface` |
| Fireworks | `FIREWORKS_API_KEY` | `fireworks` |
| Together AI | `TOGETHER_API_KEY` | `together` |
| Baseten | `BASETEN_API_KEY` | `baseten` |
| Kimi For Coding | `KIMI_API_KEY` | `kimi-coding` |
| MiniMax | `MINIMAX_API_KEY` | `minimax` |
| MiniMax（China） | `MINIMAX_CN_API_KEY` | `minimax-cn` |
| Qwen Token Plan（existing catalog） | `QWEN_TOKEN_PLAN_API_KEY` | `qwen-token-plan` |
| Qwen Token Plan（Individual） | `QWEN_TOKEN_PLAN_API_KEY` | `qwen-token-plan-individual` |
| Qwen Token Plan（China） | `QWEN_TOKEN_PLAN_CN_API_KEY` | `qwen-token-plan-cn` |
| Xiaomi MiMo | `XIAOMI_API_KEY` | `xiaomi` |
| Xiaomi MiMo Token Plan（China） | `XIAOMI_TOKEN_PLAN_CN_API_KEY` | `xiaomi-token-plan-cn` |
| Xiaomi MiMo Token Plan（Amsterdam） | `XIAOMI_TOKEN_PLAN_AMS_API_KEY` | `xiaomi-token-plan-ams` |
| Xiaomi MiMo Token Plan（Singapore） | `XIAOMI_TOKEN_PLAN_SGP_API_KEY` | `xiaomi-token-plan-sgp` |

环境变量和 `auth.json` key 的参考：[`packages/ai/src/env-api-keys.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/env-api-keys.ts) 中的 [`const envMap`](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/env-api-keys.ts)。

#### Auth 文件 {#auth-file}

把凭据存在 `~/.pi/agent/auth.json`：

```json
{
  "anthropic": { "type": "api_key", "key": "sk-ant-..." },
  "ant-ling": { "type": "api_key", "key": "..." },
  "openai": { "type": "api_key", "key": "sk-..." },
  "deepseek": { "type": "api_key", "key": "sk-..." },
  "nvidia": { "type": "api_key", "key": "nvapi-..." },
  "google": { "type": "api_key", "key": "..." },
  "opencode": { "type": "api_key", "key": "..." },
  "opencode-go": { "type": "api_key", "key": "..." },
  "together": { "type": "api_key", "key": "..." },
  "qwen-token-plan":  { "type": "api_key", "key": "sk-sp-..." },
  "qwen-token-plan-individual": { "type": "api_key", "key": "sk-sp-..." },
  "qwen-token-plan-cn": { "type": "api_key", "key": "sk-sp-..." },
  "xiaomi": { "type": "api_key", "key": "..." },
  "xiaomi-token-plan-cn":  { "type": "api_key", "key": "..." },
  "xiaomi-token-plan-ams": { "type": "api_key", "key": "..." },
  "xiaomi-token-plan-sgp": { "type": "api_key", "key": "..." }
}
```

`qwen-token-plan-individual` 使用与 `qwen-token-plan` 相同的国际端点和 `QWEN_TOKEN_PLAN_API_KEY`，但把选择器限制为 Individual 订阅文档中的模型。现有提供商保留更广的目录以保持向后兼容。使用 `auth.json` 时，把凭据存在你选择的那个提供商下；两个国际提供商共享同一个环境变量。

该文件以 `0600` 权限创建（仅用户可读写）。Auth 文件中的凭据优先于环境变量。

API key 凭据也可以包含提供商作用域的环境值。解析凭据 key、提供商/模型头，以及 Cloudflare 账户 ID、Azure OpenAI 设置、Vertex 项目/位置、Bedrock 设置、`PI_CACHE_RETENTION` 和 `HTTP_PROXY`/`HTTPS_PROXY` 等提供商配置时，这些值会先于进程环境变量使用。

```json
{
  "cloudflare-ai-gateway": {
    "type": "api_key",
    "key": "$CLOUDFLARE_API_KEY",
    "env": {
      "CLOUDFLARE_API_KEY": "...",
      "CLOUDFLARE_ACCOUNT_ID": "account-id",
      "CLOUDFLARE_GATEWAY_ID": "gateway-id"
    }
  }
}
```

当 pi 应使用与项目 shell 环境不同的提供商设置时，使用这种方式。

### Key 解析 {#key-resolution}

`key` 字段支持命令执行、环境插值和字面量：

- **Shell 命令：** 以 `"!command"` 开头时，把整个值作为命令执行，并使用 stdout（在进程生命周期内缓存）
  ```json
  { "type": "api_key", "key": "!security find-generic-password -ws 'anthropic'" }
  { "type": "api_key", "key": "!op read 'op://vault/item/credential'" }
  ```
- **环境插值：** `"$ENV_VAR"` 或 `"${ENV_VAR}"` 使用命名变量的值。插值可以出现在更大的字面量中。
  ```json
  { "type": "api_key", "key": "$MY_ANTHROPIC_KEY" }
  { "type": "api_key", "key": "${KEY_PREFIX}_${KEY_SUFFIX}" }
  ```
  `$FOO_BAR` 是变量 `FOO_BAR`；当 `BAR` 是字面文本时使用 `${FOO}_BAR`。缺失的环境变量会使该值无法解析。
- **转义：** `"$$"` 发出字面 `"$"`；`"$!"` 发出字面 `"!"` 且不触发命令执行。
  ```json
  { "type": "api_key", "key": "$$literal-dollar-prefix" }
  { "type": "api_key", "key": "$!literal-bang-prefix" }
  ```
- **字面值：** 直接使用。纯大写字符串如 `MY_API_KEY` 是字面量；环境变量请使用 `$MY_API_KEY`。
  ```json
  { "type": "api_key", "key": "sk-ant-..." }
  { "type": "api_key", "key": "public" }
  ```

OAuth 凭据在 `/login` 后也存储在这里，并自动管理。

## 云提供商 {#cloud-providers}

### Azure OpenAI {#azure-openai}

```bash
export AZURE_OPENAI_API_KEY=...
export AZURE_OPENAI_BASE_URL=https://your-resource.ai.azure.com
# 也支持：https://your-resource.cognitiveservices.azure.com
# 也支持：https://your-resource.openai.azure.com
# 根端点会自动规范化为 /openai/v1
# 或使用资源名而不是 base URL
export AZURE_OPENAI_RESOURCE_NAME=your-resource

# 可选
export AZURE_OPENAI_API_VERSION=2024-02-01
export AZURE_OPENAI_DEPLOYMENT_NAME_MAP=gpt-4=my-gpt4,gpt-4o=my-gpt4o
```

### Amazon Bedrock {#amazon-bedrock}

使用 `/login amazon-bedrock` 存储 Bedrock API key，或配置下面的环境 AWS 凭据源之一：

```bash
# 方式 1：AWS Profile
export AWS_PROFILE=your-profile

# 方式 2：IAM Keys
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...

# 方式 3：Bearer Token
export AWS_BEARER_TOKEN_BEDROCK=...

# 可选 region（默认为 us-east-1）
export AWS_REGION=us-west-2
```

也支持 ECS task roles（`AWS_CONTAINER_CREDENTIALS_*`）和 IRSA（`AWS_WEB_IDENTITY_TOKEN_FILE`）。

```bash
pi --provider amazon-bedrock --model us.anthropic.claude-sonnet-4-20250514-v1:0
```

对于 ID 中包含可识别模型名的 Claude 模型（基础模型和系统定义的 inference profile），会自动启用 prompt caching。对于应用 inference profile（其 ARN 不包含模型名），设置 `AWS_BEDROCK_FORCE_CACHE=1` 以启用 cache points：

```bash
export AWS_BEDROCK_FORCE_CACHE=1
pi --provider amazon-bedrock --model arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123
```

如果连接到 Bedrock API 代理，可以使用以下环境变量：

```bash
# 设置 Bedrock 代理的 URL（标准 AWS SDK 环境变量）
export AWS_ENDPOINT_URL_BEDROCK_RUNTIME=https://my.corp.proxy/bedrock

# 若代理不需要认证则设置
export AWS_BEDROCK_SKIP_AUTH=1

# 若代理只支持 HTTP/1.1 则设置
export AWS_BEDROCK_FORCE_HTTP1=1
```

### Cloudflare AI Gateway {#cloudflare-ai-gateway}

`CLOUDFLARE_API_KEY` 可通过 `/login` 设置。账户 ID 和 gateway slug 可以作为环境变量设置，或放在 `auth.json` 中 API key 凭据的 `env` 对象里。

```bash
export CLOUDFLARE_API_KEY=...           # 或使用 /login
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_GATEWAY_ID=...        # 在 dash.cloudflare.com → AI → AI Gateway 创建
pi --provider cloudflare-ai-gateway --model "claude-sonnet-4-5"
```

通过 Cloudflare AI Gateway 路由到 OpenAI、Anthropic 和 Workers AI。Workers AI 使用 Unified API（`/compat`）和带前缀的模型 ID（`workers-ai/@cf/...`）。OpenAI 使用 OpenAI passthrough 路由（`/openai`），以及原生 OpenAI 模型 ID，例如 `gpt-5.1`。Anthropic 使用 Anthropic passthrough 路由（`/anthropic`），以及原生 Anthropic 模型 ID，例如 `claude-sonnet-4-5`。

AI Gateway 认证把 `CLOUDFLARE_API_KEY` 用作 `cf-aig-authorization`。上游认证可以是以下之一：

| 模式 | 请求认证 | 上游认证 |
|------|--------------|---------------|
| Workers AI | 仅 Cloudflare token | Cloudflare 原生 |
| Unified billing | 仅 Cloudflare token | Cloudflare 处理上游认证并扣除 credits |
| Stored BYOK | 仅 Cloudflare token | Cloudflare 注入存储在 AI Gateway 控制台中的提供商密钥 |
| Inline BYOK | Cloudflare token 加上游 `Authorization` 头 | 请求提供上游提供商密钥 |

对于常规 pi 用法，优先使用 unified billing 或 stored BYOK。Inline BYOK 需要为 Cloudflare AI Gateway 提供商配置额外的上游 `Authorization` 头，例如通过 `models.json` 的提供商/模型覆盖。

### Cloudflare Workers AI {#cloudflare-workers-ai}

`CLOUDFLARE_API_KEY` 可通过 `/login` 设置。`CLOUDFLARE_ACCOUNT_ID` 可以作为环境变量设置，或放在 `auth.json` 中 API key 凭据的 `env` 对象里。

```bash
export CLOUDFLARE_API_KEY=...           # 或使用 /login
export CLOUDFLARE_ACCOUNT_ID=...
pi --provider cloudflare-workers-ai --model "@cf/moonshotai/kimi-k2.6"
```

Pi 会自动设置 `x-session-affinity`，以获得 [prefix caching](https://developers.cloudflare.com/workers-ai/features/prompt-caching/) 折扣。

### Google Vertex AI {#google-vertex-ai}

使用 Application Default Credentials：

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=your-project
export GOOGLE_CLOUD_LOCATION=us-central1
```

或将 `GOOGLE_APPLICATION_CREDENTIALS` 设为服务账号密钥文件。

## llama.cpp {#llamacpp}

Pi 支持 llama.cpp router 服务器。用 `/login llama.cpp` 配置，用 `/llama` 管理已加载模型，用 `/model` 选择已加载模型。

服务器配置、模型目录布局、环境变量和命令用法见 [llama.cpp](llama-cpp.md)。

## 自定义提供商 {#custom-providers}

**通过 models.json：** 添加 Ollama、LM Studio、vLLM，或任何使用受支持 API 的提供商（OpenAI Completions、OpenAI Responses、Anthropic Messages、Google Generative AI）。见 [models.md](models.md)。

**通过扩展：** 对于需要自定义 API 实现或 OAuth 流程的提供商，创建扩展。见 [custom-provider.md](custom-provider.md) 和 [examples/extensions/custom-provider-gitlab-duo](../examples/extensions/custom-provider-gitlab-duo/)。

## 解析顺序 {#resolution-order}

解析提供商凭据时：

1. CLI `--api-key` 标志
2. `auth.json` 条目（API key 或 OAuth token）
3. 环境变量
4. 来自 `models.json` 的自定义提供商密钥
