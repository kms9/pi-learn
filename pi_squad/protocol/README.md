# pi-squad/2 HTTP 契约

结构快照由 `controller schema` 从 Go 类型导出到 `protocol-v2.schema.json`，TS adapter 使用同名字段。语义约束仍由 project/task/scheduler 校验：JSON 无未知/重复字段，配置 ID、DAG、引用、ownership、binding、epoch、fencing 和 CAS 不能仅靠 JSON schema 判断。反例输入在阶段 04 `integration/fixtures/contracts.json`，随整体集成运行。

写请求必须带 `X-Pi-Squad-Protocol: pi-squad/2`、与 discovery 相符的 `X-Pi-Squad-Controller`。除初次 register 外，使用 `Authorization: Bearer <private credential>`；runtime 带 `X-Pi-Squad-Agent` 与完整请求源 `X-Pi-Squad-Binding`，服务端拒绝缺失或旧 session/epoch 绑定；进程 token 不能代替请求源绑定。Pi 显式 operator 命令同样带完整当前 `X-Pi-Squad-Binding`，服务端事务内再次校验，CLI operator 不冒充模型来源。凭据不能出现在 URL 或报告。

| 方法/路径 | 契约 |
|---|---|
| GET `/health` | Project/协议/Controller ID/epoch/endpoint 握手 |
| GET `/v2/snapshot` | 同事务读取多视图、revision、epoch、observed_at |
| GET `/v2/agents[/:id]` | Agent 投影；`/agents[/:id]` 为兼容只读别名 |
| GET `/v2/teams/:id/roles` | 最近已冻结 Team 配置的 roster 与 Primary/owner |
| POST `/v2/agents/register` | Register；返回完整 Instance/Binding |
| POST `/v2/agents/heartbeat` | binding、activity、underlying_activity |
| POST `/v2/runs` | CreateRun：request_id、team_id、goal、可选 workflow_id |
| POST `/v2/runs/:id/handoffs` | CreateTask，服务端固定 URL Run |
| POST `/v2/tasks/direct` | CreateTask，显式 standalone，空 Team/Run |
| POST `/v2/tasks/:id/children` | CreateTask，URL parent + expected_revision |
| GET `/v2/runs/:id`、`tasks/:id`、`attempts/:id` | 实体、精确状态及版本 |
| GET `/v2/dispatches` | 当前 runtime 的派发/隔离通知 |
| POST `/v2/attempts/:id/events` | AttemptEvent，包含 epoch/segment/fence/CAS |
| POST `/v2/attempts/:id/yield`、`result` | 同 AttemptEvent，限制 type |
| POST `/v2/attempts/:id/clarify` | ClarificationRequest，当前 child 的受限答复控制边 |
| POST `/v2/attempts/:id/stopped` | 精确原 runtime/binding/segment/fence 的 settled/no pending 证据 |
| POST `/v2/agents/interruption` | 当前 binding 生命周期中断；不等于停止证明 |
| POST `/v2/runs/:id/decisions` | Decision，仅当前 LeaderStep |
| POST `/v2/runs/:id/{cancel,resume,guidance}` | operator Operation |
| POST `/v2/tasks/:id/{cancel,amend,recover,retry,rebind,accept,reject}` | operator Operation |
| POST `/v2/attempts/:id/reconcile` | operator 人工确认停止，必须 note/expected_runtime/confirm_stopped |
| POST `/v2/roles/:id/{release,promote}` | operator 精确绑定 CAS，ownership 不变 |
| POST `/v2/teams/:id/leader/release` | operator Leader 身份释放 |
| POST `/v2/agents/:id/release` | operator runtime 撤销 |
| GET `/v2/requests/:id` | 按认证来源查询幂等提交结果，未知提交先查再决定 |
| POST `/v2/messages/send` | SendMessage，精确 expected_target，仅 passive notice/reply |
| GET `/v2/messages/inbox`、`messages/:id` | 当前绑定可见消息；受管 ask Task ID 可查询 |
| POST `/v2/messages/:id/receipt` | received/recorded 回执 |
| GET `/v2/events?after=<seq>` | JSON 事件页；Accept:text/event-stream 时 SSE 提示 |

旧 v1 写请求返回 PROTOCOL_MISMATCH，不做猜测迁移。真实 ask 走 kind=ask 的 CreateTask；受理 ID 是 task_id，不用 message receipt 冒充 Task 状态。

幂等键为认证来源 + operation + request_id，服务端保存规范化请求 hash；同 key/同请求返回已有关联，同 key/异内容拒绝。失败不写成功记录；提交后断线不能假定失败。所有管理请求保留操作员来源、目标、请求、证据和时间审计。

执行权由完整 binding、controller_epoch、attempt_id、segment_id、fencing_token、lease 共同约束。lease 过期/旧 epoch/会话变化 fail closed；只有确定未调用输入 API 的 deferred 可回到等待。未知执行不自动重试；正常 yield/clarification continuation 保持 Attempt 与上下文、增加 segment/fence。

Error 形状为 `{code,message,details?}`。输入/解析错误 HTTP 400，未认证 401，越权 403，状态/版本/资源冲突 409，精确 Agent 未找到 404。资源冲突可附 owner/role/Primary/revision；持久 Task/Run blockers 提供完整集合及等待开始时间。

SSE 是投影失效提示，不是新的事实源。断线/gap 后重新读取 snapshot，慢客户端写超时断开；客户端拒绝旧 epoch 和低 revision 覆盖，不重放写操作。只读 UI 不读取 SQLite，也不持有 operator 凭据。

恢复边界：`rebind` 对未 accepted/无冻结目标/终态 Task 返回 `INVALID_REBIND_STATE`；已有 Attempt 返回 `RETRY_REQUIRED`。rebind/retry/resume 的 recovery_actions 带 `old_binding`/`new_binding`，与状态修改在同一事务提交。已 released 的 reconcile/Run cleanup 不重复改写执行结果或发布 Role 释放事件。

`Interruption` 的 request_id 在同一事务接入幂等记录；同键异内容拒绝，同键同内容不重复修改 Attempt/祖先 revision。schema同时导出 interruption、stopped_evidence、clarification、decision、message_receipt，以及 heartbeat、instance、snapshot。snapshot/SSE带握手身份的GET在服务端校验Controller ID，重连先resnapshot再选cursor。

创建 Task 的端点限定 scope：direct 仅 standalone root；Run handoff 不接受 parent 或冲突的 run_id；children 的 parent_id 必须匹配 URL，run_id 若显式给出必须匹配父 Task。refs 可以是未固定版本的 Task 引用（revision=0/hash为空/length=0），或完整 revision/hash；拒绝重复ID、负长度和半套版本字段，派发时再固定并校验结果。
