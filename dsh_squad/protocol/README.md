# squad/3 HTTP 契约

DSH Squad Controller（`dsh_squad/controller`）与 DSH 宿主里的 Adapter（`dsh_squad/adapter`）之间的协议。2026-10-19 决策 D3：新定义，不与 `pi-squad/2` 互通，新旧数据不混跑。结构快照由 `controller schema` 从 Go 类型导出到 [`squad-3.schema.json`](squad-3.schema.json)；语义约束（ID、DAG、引用、binding、epoch、fence、CAS）仍由 Controller 校验。

## 相对 pi-squad/2 的变化

| 项 | pi-squad/2 | squad/3 |
|---|---|---|
| 请求头 | `X-Pi-Squad-*` | `X-Squad-Protocol: squad/3`、`X-Squad-Controller`、`X-Squad-Agent`、`X-Squad-Binding` |
| runtime | 一个 Pi 进程一个 runtime | 一个 DSH 宿主进程里多个 runtime：每个受控（Bot, 位置）各自注册、各自持凭据 |
| 注册 | — | 必带 `host`：`profile`（必须是 `dsh/0.2.1-rc.2+ds-bot/ae63b45`）、`host_id`、`bot_id`、`place`（`chat` 或 `group-member`）、群里时 `room_id`。同一（Bot, 位置）在线时不能被另一个身份注册（`HOST_PLACE_TAKEN`） |
| 能力 | Pi 钩子名 | `input_gate`、`settle_judge`、`route_freeze`、`context_sections`、`memory_review_gate`（宿主不让 DS Bot 的记忆复盘读写受控会话，D12），缺一不派发 |
| 业务截止 | 120 秒 `deadline_at` | 无（2026-10-04 决策）。只有 lease、心跳这类通信超时 |
| 心跳 | 只报活动 | `POST /v2/agents/heartbeat` 可另带 `route`（冻结路由；Controller 只补上原来没有的思考档位，从不换模型）和 `folder`（会话工作目录，DS Bot 0.2.0 的总工作区或群文件夹，只用于显示）。Controller 自己停了超过一个租约（机器休眠）时，醒来给仍有效的租约和在线状态一个周期的宽限（事件 `controller_resumed`） |
| 父任务结束 | — | 有未结束的 child 或依赖未回传时，`result_proposed` 返回 `CHILDREN_PENDING` |
| 中断原因 | 4 种 | 另加 `host_restart`、`outcome_unknown` |
| 被扣留的输入 | 无 | `POST /v2/agents/held-inputs`，持久化，快照视图 `held_inputs`，处理方式待定（M2） |
| 项目目录 | `.agents/pisquad/` | `.agents/dshsquad/` |

## Binding

`{agent_id, runtime_id, session_id, binding_epoch, primary_epoch}`。DSH 里：`agent_id` 是该（Bot, 位置）在项目里的稳定身份；`runtime_id` 是 Adapter 为它生成并持久保存的 UUID v4（宿主重启不变）；`session_id` 是 DSH 会话 id。DS Bot 切段换了新 part 会话时，Adapter 带 `previous_session_id` 重新注册，`binding_epoch` 加 1，旧 epoch 的事件一律 `STALE_EXECUTION`。

## 一次正式 Attempt 的上报顺序

Adapter 只上报它亲眼看到的事实：

1. `GET /v2/dispatches` 拿到 attempt（`dispatch_intent`）→ `adapter_received`
2. 经 seam 把带 `attempt_id` + `fence`（= `fencing_token`）的输入放进会话 → `injection_requested`
3. Gate 在 pre-step 用这条输入开启 attempt → `input_observed`（Attempt 进入 `running`）
4. 运行中定期 `renew`
5. 模型调用任务工具提交结构化结果 → `result_proposed`
6. 结束判定（实时 `turn/end` + 持久日志 + 工具配对 + 审批清零）：
   - `settled_completed` → `settled {idle:true, pending:false, outcome:"completed"}`
   - `settled_aborted` / `settled_blocked` / `settled_failed` → `settled`，`outcome` 为对应值
   - `outcome_unknown`（含宿主重启）→ `POST /v2/agents/interruption {reason}`，等 operator `reconcile`

`result_proposed` 不等于完成；没有 settled 证据，Task 不会进 `completed`。

## 接口

沿用 `pi-squad/2` 的 `/v2/...` 路径与形状（Run、Task、children、attempt events、clarify、stopped、operator 操作、events/SSE、snapshot），只换头与上表的变化。错误形状 `{code,message,details?}`：输入 400、未认证 401、越权 403、冲突 409。幂等键为认证来源 + operation + `request_id`。
