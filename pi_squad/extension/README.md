# Pi Squad Extension（P0）

`export default function (pi: ExtensionAPI)`。只做控制面适配：注册、心跳、`list_agents`。

由 Pi 的 jiti 加载，依赖 `@earendil-works/pi-coding-agent` / `typebox` / `@earendil-works/pi-ai`（随 Pi 运行时解析，本目录不单独 `npm install`）。

## 环境变量

| 变量 | 必填 | 含义 |
|------|------|------|
| `PI_SQUAD_AGENT_ID` | 是 | 逻辑身份，upsert 键 |
| `PI_SQUAD_ROLE` | 是 | Registry 角色标签，不是 system prompt |
| `PI_SQUAD_ID` | 是 | 小队 id |
| `PI_SQUAD_CONTROLLER_URL` | 否 | 默认 `http://127.0.0.1:18741` |
| `PI_SQUAD_HEARTBEAT_INTERVAL_MS` | 否 | 默认 `5000` |
| `HERDR_PANE_ID` | 否 | → `pane_id` |
| `HERDR_WORKSPACE_ID` | 否 | → `space_id` |
| `PI_SQUAD_HERDR_SESSION_ID` / `HERDR_SESSION_NAME` / `HERDR_SESSION` | 否 | → `herdr_session_id`；未提供则空 |
| `PI_SQUAD_SPACE_ID` / `PI_SQUAD_PANE_ID` | 否 | 无 Herdr 时的手工对照 |

`runtime_session_id` 只来自 `ctx.sessionManager.getSessionId()`。拿不到就留空，不伪造。

`/new` 会拆旧 runtime：`session_shutdown` 清定时器，新实例 `session_start` 再注册。`agent_id` 不变。
