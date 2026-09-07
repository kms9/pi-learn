本文是 `environment-variables.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 环境变量 {#environment-variables}

Pi 以三种方式使用环境变量：

- 诸如 `PI_OFFLINE` 的变量用于配置 Pi 进程。
- Pi 会设置进程标记，以便子进程识别启动自己的 agent 是 Pi。
- LLM 可调用的 shell 工具所运行的命令会收到描述当前会话的 `PI_*` 变量。

提供商 API 密钥变量另行记录于 [提供商](providers.zh.md#environment-variables-or-auth-file)。

## 进程标记 {#process-marker}

CLI 和 RPC 入口会设置两个进程标记：

- `AI_AGENT=pi` 是通用标记，让工具识别启动该进程的 agent 是 Pi。
- `PI_CODING_AGENT=true` 是 Pi 专用标记，让子进程检测自己运行在 Pi 内部。

子进程会继承这两个标记。它们与会话无关；通过 SDK 嵌入 Pi 时不会自动设置。

## Shell 工具的会话环境 {#shell-tool-session-environment}

由 `bash` 和 `powershell` 工具运行的命令会收到当前 Pi 会话状态：

| 变量 | 说明 |
|----------|-------------|
| `PI_SESSION_ID` | 当前会话 ID |
| `PI_SESSION_FILE` | 当前会话 JSONL 文件的绝对路径；临时会话不设置 |
| `PI_PROVIDER` | 当前选中的模型提供商 |
| `PI_MODEL` | 当前选中的模型 ID |
| `PI_REASONING_LEVEL` | 当前生效的推理级别：`off`、`minimal`、`low`、`medium`、`high`、`xhigh` 或 `max` |

这些值在每条命令启动时解析。因此切换模型或更改推理级别会影响下一条 shell 命令，无需重启 Pi。`PI_PROVIDER` 和 `PI_MODEL` 标识的是所选的 Pi 模型，而不是路由器内部可能另行选择的上游模型。

当被问及正在运行哪个模型或提供商时，应检查这些变量，而不是从系统提示词推断：

```bash
printf '%s/%s\n' "$PI_PROVIDER" "$PI_MODEL"
printf 'reasoning=%s session=%s\n' "$PI_REASONING_LEVEL" "$PI_SESSION_ID"
```

会话为持久会话时，可以直接查看会话文件：

```bash
if [ -n "$PI_SESSION_FILE" ]; then
  tail -n 1 "$PI_SESSION_FILE"
fi
```

这些变量会注入到 LLM 可调用的 `bash` 和 `powershell` 工具中。它们不会注入到用户输入的 `!` 或 `!!` 命令中。

### 自定义 Shell 工具 {#custom-shell-tools}

用 `createBashTool()` 或 `createPowerShellTool()` 创建的工具在向 Pi 注册后，默认会暴露会话环境。注入发生在 `spawnHook` 之前，因此 hook 会在 `ctx.env` 中收到这些变量：

```typescript
const bashTool = createBashTool(cwd, {
  spawnHook: (ctx) => ({
    ...ctx,
    env: { ...ctx.env, CI: "1" },
  }),
});
```

可独立于 spawn hook 关闭会话元数据：

```typescript
const powershellTool = createPowerShellTool(cwd, {
  exposeSessionEnvironment: false,
  spawnHook: (ctx) => ctx,
});
```

关闭后，Pi 会移除这些变量的继承值，以免嵌套的 Pi 进程暴露过期的父会话元数据。

## Pi 进程配置 {#pi-process-configuration}

这些变量由 Pi 自身读取：

| 变量 | 说明 |
|----------|-------------|
| `PI_CODING_AGENT_DIR` | 覆盖配置目录；默认为 `~/.pi/agent` |
| `PI_CODING_AGENT_SESSION_DIR` | 覆盖会话存储目录；会被 `--session-dir` 覆盖 |
| `PI_PACKAGE_DIR` | 覆盖包目录，适用于 Nix/Guix store 路径 |
| `PI_SERVER_DIR` | 覆盖实验性 server 的 profile 与 socket 目录；默认为 `~/.pi/server` |
| `PI_SERVER_ID` | 在省略 `--server-id` 时选择逻辑上的实验性 server ID |
| `PI_OFFLINE` | 禁用启动时的网络操作，包括更新检查、包更新以及安装/更新遥测 |
| `PI_SKIP_VERSION_CHECK` | 禁用向 `pi.dev` 请求最新版本 |
| `PI_TELEMETRY` | 覆盖安装/更新遥测和提供商归因请求头：`1`/`true`/`yes` 或 `0`/`false`/`no` |
| `PI_CACHE_RETENTION` | 设为 `long` 可在支持的提供商上延长提示词缓存 |
| `PI_SHARE_VIEWER_URL` | 覆盖 `/share` 使用的基础 URL |
| `PI_HARDWARE_CURSOR` | 设为 `1` 以显示硬件光标；见 [终端设置](terminal-setup.zh.md) |
| `PI_HYPERLINKS` | 用 `1`、`0` 或 `auto` 覆盖 OSC 8 超链接检测 |
| `PI_IMAGE_PROTOCOL` | 用 `kitty`、`iterm2`、`none` 或 `auto` 覆盖行内图片检测 |
| `PI_TRUE_COLOR` | 用 `1`、`0` 或 `auto` 覆盖真彩色检测 |
| `PI_TUI_ESC_TIMEOUT` | 单独收到 ESC 后等待多久才将其视为 Escape，单位毫秒；SSH 上默认为 `100`，否则为 `10`。若 Alt 键输入被误判为 Escape，请增大该值 |
| `VISUAL`、`EDITOR` | 未设置 `externalEditor` 时的外部编辑器回退 |
| `HTTP_PROXY`、`HTTPS_PROXY` | 代理出站 HTTP 请求 |

`ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等提供商凭据以及云提供商配置列于 [提供商](providers.zh.md#environment-variables-or-auth-file)。
