---
title: 阶段 02｜相互通信：消息和回答准确到达指定 Pi
status: draft
type: process
requirements: confirmed
implementation_status: not_implemented
acceptance_status: not_run
updated: 2026-09-21
---

# 阶段 02｜相互通信：消息和回答准确到达指定 Pi

## 1. 最终目标与本阶段验证点

最终目标：多个手动启动的在线 Pi 可通过对话协作，随后支持正式任务和小队；Go 管协作状态，TS 只适配 Pi，目标继续使用既有会话，Herdr 非必要。

本阶段验证**“A 知道 B 的 ID 后，能够准确发信息、提问并收到对应回答”**。不是任务编排：收到“请修改代码”文字，不代表系统已创建任务、接收工作或承诺完成。

用户里程碑：operator 发现 reviewer → 发送一条带唯一标记的消息 → reviewer 看见正确来源 → operator 提问 → reviewer 自动回答 → operator 查到同一个 ask 的结果。成员在事先配置的协作权限内无需逐次确认。

## 2. 用户能力与行为

工具统一为 `agent_message`，动作 `send/ask/reply/read`；用户使用 `/squad inbox`、`/squad send`、`/squad ask`、`/squad reply`。Go CLI 提供等价命令用于排查和重复验收。

| 动作 | 默认行为 |
|---|---|
| `send` | 传递通知。接收方记录、显示，不立即驱动模型，不登记正式任务；模型需要内容时用 read 工具取回。 |
| `ask` | 创建有 ask_id 的问题。在线目标空闲时触发一次回答；忙时在 Go 排队，不中断原工作。 |
| `reply` | 必须关联 ask_id，校验回答者身份；传回提出问题的绑定，不能靠最近一个聊天对象猜测。 |
| `read` | 读取自己有权访问的消息或问题记录，让模型显式获取消息正文。 |

**模型侧 ask 默认异步返回 ask_id，不让 tool Promise 长时间占住发问者 Pi。** 逻辑上“等待回答”，不等于阻塞当前 agent loop。回答到达后，在原绑定仍有效时，最多安排一次结果通知/续接；reply 本身不会自动变成另一个 ask。CLI `message wait` 可以阻塞终端等待，超时不等于撤回问题。

只向当前在线目标发送。已经离线返回 `AGENT_OFFLINE` 并保留失败记录；不做离线邮箱自动投递、不替用户启动 Pi。在线但忙可以排队；排队期间离线或 `/new`，停止投递，等待用户明确重试。

## 3. 消息协议与状态

```json
{
  "message_id":"msg_uuid", "kind":"ask", "ask_id":"ask_uuid",
  "from_agent_id":"agt_operator", "to_agent_id":"agt_reviewer",
  "target_binding":{"runtime_id":"run_uuid","session_id":"pi_uuid","binding_epoch":4},
  "body":{"text":"只回答 REVIEW-42"},
  "created_at":"RFC3339", "expires_at":"RFC3339",
  "reply_to":null, "retry_of":null, "trace_id":"trace_uuid"
}
```

from 由 Go 使用认证连接填写；目的地提交时精确解析 alias 为 agent_id，再冻结绑定，不在每次重试时重新按 alias 选人。正文默认 64 KiB；不接受自动加载任意文件路径的附件。阶段 02 先支持纯文本，结构化文件上下文留到阶段 03。

交付状态区分 `stored → delivered → received → recorded`。ask 另有 `queued → injection_requested → answering → replied`，失败可为 `offline/session_changed/expired/delivery_unknown`。`stored` 只代表 Go 落库，`received` 只代表扩展收到，**调用 Pi 的 void API 不能被当作模型已处理**。answering 要有对应的输入/agent_start 关联证据，reply 要有明确回复工具事件。

每条状态附时间与事件 seq。相同 request_id＋相同请求体返回相同 message_id；相同 key 不同请求体返回 `IDEMPOTENCY_CONFLICT`。消息至少在接收绑定内做 ID 去重；Go 发送与 Pi 注入无法做一个跨进程原子事务，故崩溃窗口可能存在 outcome_unknown，**不承诺 exactly-once 模型执行**。

## 4. Pi 接入与排队规则

普通通知用 `appendEntry` 和自定义 entry renderer 记录/展示，不隐式升级为系统提示。ask 由 Go 发入站命令，扩展在最新上下文满足 `ctx.isIdle() && !ctx.hasPendingMessages()`、没有已占用执行槽时注入，并携带唯一消息标记。`sendUserMessage` 不开启 prompt template/命令展开，入站 `/new` 等文本只能作为文本处理。

阶段 02 即建立单 Pi execution gate：本机用户输入、入站 ask 不能抢同一个空闲窗口。扩展在输入 hook 标记用户工作，并在注入前再次比较 binding；仅在本地占位成功后开始输入。回复到达可直接更新等待记录，不应因为发送者忙就丢失答案。

`/new` 前暂停入站，旧绑定队列标记 session_changed；新 session_start 更新绑定。不得把旧 ask 送入新会话；已发出的旧问题收到晚答时仅存历史，不触发新会话。`/reload` 清理旧监听和计时器，重建时按 ID/绑定恢复记录，不自动重复触发模型。

接收任务文字只是协作请求，不绕过 Pi 工具权限；当前阶段不提供任意 shell/control 指令。自动 ask 使用受限问答执行范围：仅允许回复/读消息及已明确允许的只读工具，TS 在 `tool_call` 中执行 Go 下发的工具上限；禁用 bash、edit、write 和未批准的扩展工具。收到正文时不做命令展开；不能仅靠“请勿执行”的 prompt 保证只读。此限制只作用于本次入站 ask，不永久修改用户原会话配置。Go 记录允许的 send/ask/reply 范围；缺少许可返回 `POLICY_DENIED`，不追加逐次确认弹窗。全流程只承诺合作型单用户实验，不隔离同 UID 恶意代码。

## 5. 实施文件与顺序（待实现）

| 文件 | 职责 |
|---|---|
| `cmd/squad/main.go` | 继承 00/01；新增 `message send/ask/reply/get/wait/retry`、`inbox`。 |
| `pkg/messaging/{service,router}.go` | 精确寻址、冻结绑定、在线判断、正文上限、授权。 |
| `pkg/messaging/{store,receipts}.go` | 消息/ask/reply/事件持久化，幂等、迟到答案、状态查询。 |
| `pkg/messaging/queue.go` | 忙时 FIFO、过期、单目标排队上限 32、离线/会话变化停止投递。 |
| `extension/{index,inbox,delivery-gate,message-tool}.ts` | 必要 Pi 命令/工具、消息展示、安全注入及生命周期清理。 |
| `tests/` | 重复帧、乱序回复、重启窗口、session_changed、真实 Pi 对话。 |

先完成不调用模型的 send/收件箱；再完成 ask/reply 和自动回应；最后补幂等、超时、/new、服务重启。持久状态在 Go，不复制完整 Pi transcript 到数据库。TS 只保留 Pi 侧接收标记与处理上下文；可用 Pi custom entry 辅助排错，但不能代替 Go 审计账本。

默认排队期限 10 分钟，CLI 可设置更短超时用于测试。自动重连仅修复传输；投递状态未知时不自动重发有副作用的输入。用户 `message retry <id>` 必须查看目标新绑定，创建新 message_id 并保留 retry_of。

## 6. 用户操作流程

阶段 01 已通过。构建本阶段 CLI，使用 `$HOME/.psq/02`，创建 operator/worker/reviewer，手动启动 Go 和三个 Pi。启动形式同阶段 01，但扩展路径改为 `02-agent-messaging/extension/index.ts`，CLI 构建路径改为 `./02-agent-messaging/cmd/squad`。所有 squad 命令均待实现。

首次执行前，由用户在配置终端一次性授权；不是每条消息弹窗确认。reply 权限仅由对应 ask 授予，不提供任意回复冒名能力。

```bash
squad policy allow --from operator --to reviewer --actions send,ask
squad policy allow --from worker --to reviewer --actions send,ask
```

在 operator：

```text
/squad agents
/squad send reviewer NOTE-42：这是一条通知，不需要执行任务。
/squad ask reviewer 只回答 REVIEW-42，并使用回复工具关联这次提问。
```

在 reviewer 查看 `/squad inbox`；观察自动回答轨迹。operator 查看 `/squad inbox` 和 ask 状态。再从 operator 用自然语言说：“请询问 reviewer：只回答第二个标记 REVIEW-43。”验收必须检查真实工具调用和消息 ID。

CLI 排查示例：

```bash
squad message get <message-id> --json
squad message wait <ask-id> --timeout 30s
squad events list --trace <trace-id>
```

## 7. 用户验收矩阵

| 用例 | 操作 | 通过标准 |
|---|---|---|
| MSG-01 指定收件人 | operator 发 NOTE-42 给 reviewer。 | reviewer 收件箱出现一次，worker 不出现；发送者和目标为完整 agent_id。 |
| MSG-02 通知不是任务 | 发“请修改代码”但使用 send。 | 只记录通知；无自动模型轮、无 task_id、无文件变化。 |
| MSG-03 自动回答 | 发 ask 要求 REVIEW-42。 | reviewer 在权限范围内自动回答，不弹审批；reply 关联原 ask_id，operator 可查到内容。 |
| MSG-04 同时两个问题 | operator、worker 分别问 reviewer，要求不同标记。 | 两个 ask_id、两份正确归属的答案；未指定 ask_id 的歧义回复被拒绝。 |
| MSG-05 目标忙 | reviewer 正在真实模型工作时发送 ask。 | Go 显示 queued；不 abort 原工作；原工作 settled 后处理，执行顺序可查。 |
| MSG-06 离线 | 用户退出 reviewer，再 send/ask。 | 2 秒内明确“reviewer 离线”；无自动启动、无后续重开自动投递。 |
| MSG-07 去重 | `squad lab message-check --case duplicate` 向同一绑定重复同一 ID。 | 记录及触发均不重复；不同内容复用相同 key 被拒绝。 |
| MSG-08 超时/晚答 | CLI wait 设置 2 秒，稍后 reviewer 回答。 | wait 报超时但不称“已取消”；历史仍记录晚答，且不会重复触发。 |
| MSG-09 排队时 `/new` | reviewer 忙时排入 ask，再由用户 `/new`。 | 旧 ask 进入 session_changed，旧内容不进入新会话；需显式重试。 |
| MSG-10 收到 `/new` 文本 | 发 ask 正文含 `/new`、shell 片段。 | 正文不被 adapter 解析成斜杠命令；自动问答范围禁止 bash/写工具；不得因这条输入改变 session 或文件。 |
| MSG-11 Go 故障 | 发消息后人工重启 Go；分别覆盖已记录与注入未知窗口。 | 历史可查询；未知状态明确呈现，不伪装 delivered/replied，不自动重复注入。 |
| MSG-12 自然语言使用 | 用对话请求发送/提问。 | 模型实际调用正确工具，目标和内容可审计；单有自然语言“已发送”不通过。 |

send 从 Go 提交到目标 received 的本机控制面目标为 2 秒内；空闲 ask 从 Go 接受至 injection_requested 目标为 2 秒内。模型出答案可用 120 秒作为一次实验等待预算，但超时需分层诊断，不能据此宣称 broker 丢消息。

## 8. 源码参考及差异

固定 SHA 与链接见 [SOURCES](../SOURCES.md)。

| 已读源码 | 对应逻辑 |
|---|---|
| Intercom `broker/protocol.ts`：`isMessage/isMessageReceipt/isMessageControl`。 | 消息类型、关联和收据严格校验；本实验将 receipt 与正式任务状态分开。 |
| Intercom `reply-tracker.ts`：`ReplyTracker.recordIncomingMessage/resolveReplyTarget/markReplied`。 | ask 对应关系和歧义失败；Go 重写并持久化，本实验默认要求明确 ask_id。 |
| Intercom `broker/broker.ts`：`MessageReceiptRoute/DeliveryRecord/MailboxMessage`。 | 路由、幂等和未知结果建模参考；不启用其离线邮箱语义。 |
| Pi `packages/coding-agent/src/core/extensions/types.ts`：`sendMessage/sendUserMessage/appendEntry/registerEntryRenderer`。 | 区分显示、状态 entry 和驱动模型的输入；void 调用不当作完成 ACK。 |
| Subagents `src/extension/herdr-pi-bridge.ts`：`accepted/control-ack/event/settled` 发帧逻辑。 | 借鉴分层确认；不复用远程 runtime dir、manifest 或 SSH。 |

尤其不照搬 Intercom ask 的长时间阻塞 Promise。后续允许递归调用时，它可能与既有会话单执行槽形成循环等待；本实验先用异步 ID＋结果通知，阶段 03 再建立任务依赖图。

## 9. 退出门槛与恢复

MSG-01—12 全部通过，身份/发现无回归；导出消息记录、receipt 时间线、三个 Pi 的可见证据。按 [验收模板](../ACCEPTANCE.md) 区分 transport、adapter、model、policy 四类失败。当前状态 **NOT RUN**。

回退只停止实验组件并切回已通过阶段；保留 DB 和原 Pi session 文件。下一阶段在已有消息通道上引入正式 Task Contract，不把文字中出现“完成”当作任务结果。
