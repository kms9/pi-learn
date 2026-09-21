---
title: 阶段 03｜相互调用：委派任务、拿回结果、识别失败
status: draft
type: process
requirements: confirmed
implementation_status: not_implemented
acceptance_status: not_run
updated: 2026-09-21
---

# 阶段 03｜相互调用：委派任务、拿回结果、识别失败

## 1. 最终目标与本阶段验证点

最终目标：用户通过 Pi 对话调用在线独立 Agent 或小队；运行时由用户手动管理，任务进入目标既有会话，Go 负责可靠记录及编排，TS 适配 Pi，Herdr 最后再接。

本阶段验证**“一次委派有明确任务、执行归属、状态、结果和验收，而不只是发出一句话”**。先做 operator→reviewer，再做 worker→reviewer；最后验证一个 Agent 在自己的任务内调用第三个 Agent。此时不需要 Team。

用户里程碑：说“让 reviewer 读取这个数字文件并返回统计结果” → 看见 task_id → 目标 Pi 在现有会话执行 → 得到关联结果；目标离线、任务取消、`/new` 或服务故障时，用户能准确知道发生了什么。

## 2. 需求边界

只调用已在线、已授权 Agent；离线返回 `AGENT_OFFLINE`，不 spawn、不恢复进程、不自动建立新 session。目标空闲即执行，忙则 Go 排队；每个 Agent 最多一项活动正式任务，队列默认 32。跨 Agent 可以并行，同一 Pi 不能并行跑两个正式任务。

正式任务沿用目标当前 session，包括其既有历史。`ContextEnvelope` 是新增任务材料，不保证清除原上下文；需要清理时用户亲自 `/new`。角色或任务 prompt 不能覆盖用户已有 system instruction 或扩大原工具权限。

本阶段不做任意 shell 远程执行、不自动 checkout/worktree、不自动合并文件、不把共享目录当作共享内存。默认只读验收；Go 下发允许工具/路径上限，TS `tool_call` 拦截超限工具。只读 fixture 禁止 bash/edit/write 及未批准扩展，不能把 read_only 当成单纯提示词。需要写文件时声明 write_set，阶段 04 再统一冲突调度；本轮不声称能隔离同用户恶意代码。

## 3. Task Contract 与接口

模型工具：`agent_invoke`、`agent_task_get`、`agent_task_yield`、`agent_task_complete`；用户命令 `/squad call <alias> <goal>`、`/squad task <id>`、`/squad cancel <id>`。由 Go 创建任务及 attempt，模型不得自造 owner 或已完成状态。

```json
{
  "task_id":"task_uuid", "attempt_id":"attempt_uuid",
  "caller_agent_id":"agt_operator", "target_agent_id":"agt_reviewer",
  "binding":{"runtime_id":"run_uuid","session_id":"pi_uuid","binding_epoch":7},
  "goal":"读取 numbers.txt，返回 count 与 sum",
  "context":{"summary":"仅统计本文件","refs":[{"path":"numbers.txt","sha256":"实际摘要"}]},
  "constraints":{"read_only":true},
  "expected_output":{"type":"object","required":["count","sum"]},
  "parent_task_id":null, "root_task_id":"task_uuid",
  "ancestor_agent_ids":["agt_operator"], "depth":1, "max_depth":3,
  "write_set":[], "deadline_at":"RFC3339"
}
```

Go 对 refs 进行 realpath 校验、根目录限制、大小限制和内容摘要；跨进程在同一机器上可以引用本地文件，不必复制整个 transcript。`context` 中的任务说明、摘要和引用被标记为来自调用方的数据，不提升为更高优先级指令。私密凭证和整个环境变量表不传入 context。

**调用默认异步返回 task_id。** `agent_task_get` 查询状态；`agent_task_yield(waiting_for=[...])` 声明等待依赖后结束当前模型轮，不能用阻塞 Promise 锁住 Pi。正式等待时保留任务归属；依赖完成后只唤醒该任务的 continuation，不接入一个无关新任务。

结果必须经 `agent_task_complete` 提交结构化数据、摘要和 artifact refs。服务端由当前绑定推导 owner/attempt，校验目标、schema 和文件摘要；不能让 Agent 完成别人任务。提交只是 result_proposed，必须再等待真正 settled。

## 4. 任务状态、执行结果与验收分离

```text
queued → dispatching → running → result_proposed → completed
                    ↘ waiting_dependency → running
任一未终态 → interrupted / failed / cancelled / needs_review
```

`completed` 表示本 attempt 正常执行结束且有合格结果载体；另有 `acceptance=pending|accepted|rejected` 表示结果是否满足任务要求。任务运行结束不等于业务验收通过。

Go 至少记录：`task_created`、`dispatch_intent`、`adapter_received`、`input_observed`、`agent_started`、`result_proposed`、`agent_settled`、`acceptance_recorded`。只有匹配同一绑定/attempt、确有 result_proposed、无错误或中断，并且收到 `agent_settled` 且 idle/无 pending 的证据，才能标 completed。

不得只用 `agent_end`、最后一段 assistant 文本、Herdr idle 或“完成了”关键词判断完成。正常 settled 但缺结果，记录 `RESULT_MISSING`；模型报错、取消、用户干预不能包装为成功。结果 schema 校验通过不代表推理正确；示例中的 count/sum 用确定性检查器进一步验收。

## 5. 既有会话中的并发、用户操作与递归

Go 执行槽与 TS 本地 gate 双重检查：Go 先保留槽、持久化 dispatch_intent；TS 再校验绑定、最新 idle、pending 和本地槽。校验和调用 Pi 输入之间不得插入新的异步等待。竞争失败返回 BUSY，Go 留在队列，不使用 steer 抢占用户正在执行的工作。

已有正式任务执行时，普通用户输入可能改变模型目标；不能静默把混合结果继续归属给任务。用户 `/squad takeover` 可明确中断任务归属；未通过该命令的用户输入也要被 input hook 识别，将 attempt 标为 `needs_review/manual_interference` 并停止自动报成功，不屏蔽用户对 Pi 的控制。`/new` 始终由用户决定，旧任务标 `interrupted/session_changed`，旧队列不跨 session 自动执行。

递归必须通过同一 Go Router：A→B→C 的任务记录 root/parent/depth。第一版拒绝同一责任链中调用自己或祖先 Agent，返回 `CALL_CYCLE`；不同顶层任务仍可分别 A→B、B→A。Go 同时检查等待依赖图，禁止 DAG 环和占用执行槽导致的循环等待。默认最大委派深度 3、每根任务最多 20 个子任务；这是实验配置，不是上游常量。

成员需要父 Agent 决策时可用阶段 02 ask；ask 默认异步，不阻塞对方。如果将 ask 作为当前任务等待条件，同样登记等待关系。明确区分“成员互相可联系”与“允许无界递归”。父任务处于 waiting_dependency 时，可接收同一 root 内的关联澄清问题，并作为 response-only continuation 回答；它不创建第二项正式任务、不释放原任务归属、不能顺便执行无关工作。服务重启或绑定变化后，这类续接也必须先完成对账。

## 6. 取消、超时与故障恢复

取消排队任务只改队列，不中断目标 Pi 的别的工作。取消运行任务前核对该 Agent 当前活动 attempt；只有完全匹配才使用最新 `ctx.abort()`，并等待中断证据。发出 cancel 不代表已取消；离线无法确认时标 `needs_review`，不虚报 stopped。

超时只是预算/等待终止，不证明 Pi 已停。超时后停止下游调度并标 `needs_review/deadline_exceeded`，允许用户显式 cancel。已写入文件不自动回滚。

Go 重启：记录恢复、在线重新握手；未终结任务进入 reconciliation/needs_review，不自动重派。Pi 可能仍继续原工作，界面必须明示“执行状态待核实”。只读收集同一绑定的进度/结果证据允许自动进行，但不得自动提交新的模型输入。

用户恢复有两条明确动作：`task recover --attach-evidence` 关联既有、可验证的结果，不重执行；`task retry --rebind-current` 创建新 attempt，显示当前 session 与前次差异后由用户明确提交。新 attempt 保留原失败记录和 retry_of。文档不承诺任意指令恰好执行一次；模糊注入窗口必须暴露 outcome_unknown。

## 7. 实施目录与可验证增量（待实现）

| 文件 | 逻辑 |
|---|---|
| `cmd/squad/main.go` | 继承前阶段；增加 task invoke/get/events/cancel/recover/retry。 |
| `pkg/invocation/{contract,service}.go` | Task/Attempt/Result、schema、owner 校验、状态迁移。 |
| `pkg/invocation/{scheduler,gate}.go` | 单 Agent 执行槽、排队、二次占位、deadline。 |
| `pkg/invocation/{context,result}.go` | 文件引用、摘要校验、artifact 检查、验收记录。 |
| `pkg/invocation/{dependencies,recovery}.go` | 责任树/等待图、深度预算、崩溃对账、显式恢复。 |
| `extension/{index,task-tools,executor}.ts` | Pi task 工具、输入标记、结果提交、settled 采集与 ctx.abort。 |
| `fixtures/numbers.txt` | 三行 `10`、`20`、`30`，固定验收真值 count=3、sum=60。 |
| `tests/` | 状态机、错 owner、cancel 竞争、会话代次、循环依赖、重启注入窗口。 |

先完成单任务只读闭环；再处理同 Agent 排队与取消；然后验证 `/new`、重启及显式恢复；最后才增加 B→C 委派和 yield。每个增量都能用下面具体场景验收，不能只跑模拟 mock。

## 8. 用户主流程

阶段 02 已通过。本阶段状态目录 `$HOME/.psq/03`，构建 `./03-agent-invocation/cmd/squad`，扩展路径 `03-agent-invocation/extension/index.ts`。手动开 operator、worker、reviewer 三个 Pi，保持 Go 服务在线。以下接口待实现。

配置终端先准备唯一的测试输入及授权；三个 Pi 都由用户从这个 workspace 目录启动（CASE 仍为工程绝对路径）。

```bash
mkdir -p "$SQUAD_HOME/workspace"
printf '10\n20\n30\n' > "$SQUAD_HOME/workspace/numbers.txt"
squad policy allow --from operator --to reviewer --actions invoke,send,ask
squad policy allow --from operator --to worker --actions invoke,send,ask
squad policy allow --from worker --to reviewer --actions invoke,send,ask
# 每个 Pi 的启动终端先执行：cd "$SQUAD_HOME/workspace"
```

用户先在 reviewer 说“本次会话用于统计实验”，记录其 session_id；在 operator：

```text
请调用 reviewer，读取实验文件 numbers.txt，返回 JSON 中的 count 和 sum。
只读，不修改文件；使用正式任务工具，完成后给我 task_id 和结果。
```

CLI 观察：

```bash
squad task get <task-id> --json
squad task events <task-id>
squad task verify <task-id> --check count-sum --input <numbers.txt的绝对路径>
```

必须看到 reviewer 仍在原 session 执行，结果 count=3、sum=60，且关联 owner、attempt、结果摘要。再让 worker 接收一项“委派 reviewer 完成统计后汇总”的任务，以验证 Agent→Agent 调用，而不是只有人通过 CLI 派发。

## 9. 用户验收矩阵

| 用例 | 用户操作 | 通过标准 |
|---|---|---|
| INV-01 正式调用 | 按主流程通过对话调用 reviewer。 | 有真实工具轨迹、task_id、目标接收和结果；count=3/sum=60；不把 send 文本当调用。 |
| INV-02 既有会话 | 调用前后比较 reviewer whoami 和会话。 | session_id 不变，原历史未被清空；不新建后台 Pi 或任务 session。 |
| INV-03 同端排队 | 给忙碌 reviewer 连续派两个任务。 | 第二个 queued，两个 running 区间不重叠，结果分别归属各自 attempt。 |
| INV-04 跨端并行 | 给 worker/reviewer 各派一个任务。 | 允许 running 区间重叠，不被全局串行锁误挡。 |
| INV-05 离线 | reviewer 退出后调用。 | 返回“reviewer 离线”；不会启动/接管任何 Pi；手动重开后需重新提交。 |
| INV-06 取消排队 | 取消第二个排队任务。 | 队列移除；第一个任务继续，不对其调用 abort。 |
| INV-07 取消运行 | 对明确 running attempt 发 cancel。 | cancel_requested 后出现中断证据；未确认时不显示 cancelled；不回滚文件。 |
| INV-08 `/new` | running/queued 时由用户在目标 `/new`。 | 旧 attempt interrupted；旧队列不进入新会话；agent_id/runtime_id 保持，session_id 更新。 |
| INV-09 用户插话 | 执行中输入另一条用户需求。 | 有 manual_interference/needs_review，不把混合输出当原任务成功。 |
| INV-10 假完成 | 测试模型只说“完成了”而不提交结果，或仅触发 agent_end。 | 不标 completed；显示 RESULT_MISSING 或继续等待 settled。 |
| INV-11 结果不合格 | 提交 count=3/sum=999 或错 artifact 摘要。 | schema/验收区分清楚；错误真值 acceptance=rejected，错摘要不通过。 |
| INV-12 递归调用 | operator→worker→reviewer，worker yield 后汇总。 | root/parent 链完整；reviewer 结果唤醒 worker 原任务；不误归属。 |
| INV-13 环和深度 | 尝试同链 B→A 或超 max_depth。 | CALL_CYCLE/DEPTH_LIMIT 明确出现，不无限互叫；已有任务记录保留。 |
| INV-14 故障恢复 | 执行中重启 Go，再手动恢复。 | 先 needs_review；无自动重派；attach-evidence 不执行，retry 生成新 attempt。 |
| INV-15 边界模拟 | `squad lab invocation-check --cases wrong-owner,stale-result,cancel-race,injection-unknown`。 | 不接收旧结果/他人结果；终态竞争一致；未知窗口不虚报。 |

控制面接受/拒绝目标 2 秒内可见；实验模型结果等待预算 120 秒，超时逐层归因。INV-01、02、03、08、12、14 必须用真实 Pi，模拟用例只验证确定性边界。

## 10. 源码依据与迁移边界

完整版本与链接见 [SOURCES](../SOURCES.md)。

| 已读文件 | 借鉴与约束 |
|---|---|
| `pi-subagents/src/extension/herdr-pi-bridge.ts`：`execute`、`activeRequestId`、message_end、agent_settled、supervisor 通道。 | 参考 command→accepted→event→settled 的关联；不复用单 run 的远程启动/manifest；长期多任务需要本实验自己的 attempt 隔离。 |
| `pi-subagents/src/runs/shared/herdr-pi-protocol.ts`：`HerdrPiFrame`、decoder。 | 参考版本/请求身份校验，不使用其 JSONL 作为我们的 IPC framing。 |
| `pi-dev/packages/coding-agent/src/core/extensions/types.ts`：`AgentSettledEvent`、`ExtensionContext.abort/isIdle/hasPendingMessages`、`sendUserMessage/appendEntry`。 | 使用真实公开 API；不能照搬 bridge 中把 pi 强转为含 abort 的对象。 |
| `pi-intercom/reply-tracker.ts`：`resolveReplyTarget`。 | 关联问题/回答；正式 task/attempt 不复用 message_id 混充。 |
| `tmustier/pi-agent-teams/extensions/teams/task-store.ts`：`isTaskBlocked/agentHasActiveTask/claimTask/completeTask`。 | 借鉴任务依赖和 owner；本实验把检查/占用做成 Go 原子事务，补取消、失败、验收和会话绑定。 |

## 11. 退出门槛

INV-01—15 全部通过，前阶段无回归，保留每条任务状态链及失败复测证据。当前为 **NOT RUN**。下一阶段只组合已验证的 invocation，不另建一套小队执行机制。

回退前先检查仍可能运行的 Pi 工作，不能把“停 Go”当作“工作已停止”；用户确认实际状态后再回退代码。数据备份及复测方法见 [验收模板](../ACCEPTANCE.md)。
