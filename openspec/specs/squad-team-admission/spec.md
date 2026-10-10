# squad-team-admission Specification

## Purpose

定义团队身份、角色代表和 Run 准入的可观察约束，使多个团队在共享角色时按明确顺序排队，保持唯一占用、可解释等待及安全释放，不由离线状态推断换人。

## Requirements

### Requirement: TR-02 Leader 身份

系统 SHALL 满足以下行为契约。

`mode=leader` 必须指定稳定 agent_id 和 team_id，且匹配 team.json 的 leader.agent_ref；一个进程只绑定一个 Team，不在进程内切成别队 Leader。同 Team 第二个有效 Leader 返回 `TEAM_LEADER_ALREADY_ACTIVE`，退出第二个 Leader 模式但不终止普通 Pi。

`/new` 不创建第二个 Leader。Runtime 重启保留稳定 Agent identity，但仅凭同 agent_id 或 offline 不允许接管：需要合法连续性证明，或用户确认旧执行并显式释放。旧 Runtime、旧 session、旧 epoch 的写入拒绝。Leader 默认只协调，实施工具必须在代码层限制，不只依赖 prompt。


Leader 的每次正式协调轮 SHALL 以同一 Task Store 中的 `kind=leader_step` 记录，使用 TeamLeaderBinding 而非成员 RolePrimaryBinding 授权；与 Worker 共用 dispatch intent、lease、capacity、本地 gate、settled、fencing 和 outcome_unknown 处理。LeaderStep 不计入 20 个业务 Task 的数量预算，但按 Run 状态 revision 去重，无进展不得创建新协调轮。`squad_decide complete` 先保存带 revision 的 completion intent；该 LeaderStep 正常 settled 并释放自身执行额度后，Controller SHALL 重新校验最终 Gate，再终结及安全清理 Run，不能因 Leader 自己还在执行而自锁，也不能提前释放 Role。

**用户确认（2026-09-27）**：active Run 中用户在 Leader Pi 的普通文字 SHALL 作为 `run_guidance` 持久关联当前 Run/revision，返回受理状态；在当前协调轮安全 settled 后加入下一 LeaderStep，不 steer、不新建 Run、不扩大权限。它不构成 manual_interference。显式 takeover、实际会话/分支更换及用户 shell 执行仍按相应中断规则处理；Worker 普通输入规则不变。

#### Scenario: TR-A01 同时启动同 Team 两 Leader

- **WHEN** 同时启动同 Team 两 Leader
- **THEN** 系统 SHALL 满足：第二个拒绝并退出 Leader 模式，第一个及普通 Pi 不受影响
- **AND** 系统 SHALL 满足：补查 LeaderStep 与Worker共用gate，complete意图须自身settled后通过Gate，未知注入不得重新触发Leader。
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A16 同身份重启

- **WHEN** 同身份重启
- **THEN** 系统 SHALL 满足：按连续性或显式 release 重绑，旧 runtime/epoch 写入拒绝
- **AND** 系统 SHALL 满足：补查Leader显式释放/重绑、旧runtime拒绝及历史保留。
- **AND** 验收记录保留 U/E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A07 并发注册、Leader失联但未释放、旧Runtime恢复、promote竞争

- **WHEN** 并发注册、Leader失联但未释放、旧Runtime恢复、promote竞争
- **THEN** 系统 SHALL 满足：offline不等于release；CAS唯一，旧凭据/epoch不能夺回身份
- **AND** 验收记录保留 F/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

### Requirement: TR-03 Role Primary / Secondary

系统 SHALL 满足以下行为契约。

首个成功原子绑定的稳定 agent_id 成为唯一 Primary，不按终端打开时间或客户端时钟裁决。其它同 Role Agent 正常注册为 Secondary，`team_schedulable=false`，可以普通手工对话和 standalone 工作。

Team execute/review/rework/ask/peer invoke/mention 均不能选 Secondary，包括显式 agent_id 和伪造 direct scope。Primary offline/suspect 时不可调度，不自动提升 Secondary。显式 promote/release 必须对账旧 Primary 的执行，确认无 suspended/active/quarantined Attempt 后再变更 binding epoch。Role 的 Run ownership 属于 team/run 而非 Agent，换 Primary 不解除也不转移 ownership。

Primary 资格与当前在线状态分开保存。新 Runtime 不能凭同 ID 抢占旧 Runtime；释放某次执行额度不等于释放 Primary。


`/squad role release` 只解除 PrimaryBinding，不解除 RoleActionOwnership；界面 SHALL 展示这一差异。解绑保留历史与 unassigned 标记；现有 Secondary 不自动提升，随后新注册也不能抢占曾被显式解绑的 Primary，须用户显式 promote。只有从未建立 PrimaryBinding 的 Role 才采用首次原子注册成为 Primary 的规则。新进程的 runtime/token 不是旧进程连续性证明；同进程 reload/new 的合法凭据连续性与新进程显式释放后重绑分开验证。

#### Scenario: TR-A03 启第一个 reviewer

- **WHEN** 启第一个 reviewer
- **THEN** 系统 SHALL 满足：成为唯一 Primary
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A04 再启同 Role

- **WHEN** 再启同 Role
- **THEN** 系统 SHALL 满足：成为 Secondary，正常对话但不被 Team 选择
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A05 Primary offline、Secondary online

- **WHEN** Primary offline、Secondary online
- **THEN** 系统 SHALL 满足：明确不可调度，无自动提升
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A06 显式 promote

- **WHEN** 显式 promote
- **THEN** 系统 SHALL 满足：先对账并解除旧占用，再更新 epoch，旧写入失效
- **AND** 系统 SHALL 满足：补查role release仅解绑Primary、无Primary tombstone及显式promote，旧ownership和历史不被删除。
- **AND** 验收记录保留 U/E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A20 Secondary 普通独立工作

- **WHEN** Secondary 普通独立工作
- **THEN** 系统 SHALL 满足：不受 Team 禁用，但不形成 Team capacity
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: CMD-A05 Primary/Secondary 都在线

- **WHEN** Primary/Secondary 都在线
- **THEN** 系统 SHALL 满足：@role 只解析 Primary
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: CMD-A06 Primary offline

- **WHEN** Primary offline
- **THEN** 系统 SHALL 满足：错误明确，不投给 Secondary
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

### Requirement: TR-04 Team 激活、Role 占用与 Run 准入

系统 SHALL 满足以下行为契约。

允许多个 Team 同时运行、共享 RoleDefinition。普通成员只配置 role_ref，由 Controller 解析当前 Primary；同 Team 不重复 role_ref。

**激活即整体占用**。Run 准入时，在同一事务中为该 Run 配置快照 roster 的全部 role_ref 获取 RoleActionOwnership（owner=team_id+run_id）。任一 Role 已被其它 Run 持有，则一个也不获取，Run 保持 queued，记录 waiting_roles（role、owner team/run、ownership revision）。不部分占用，也不在派发 Task 时再逐个获取。Primary offline 不阻止占用 Role，但对该 Role 的派发返回 `ROLE_PRIMARY_OFFLINE`。

active Run 持有的 Role 只接受本 Run 的正式模型工作，包括排队、review/rework 间隙和暂时 idle。其它 Team 的 handoff/ask/peer invoke 与 standalone direct 模型工作返回 `ROLE_BUSY`（附 role、Primary、owner team/run、revision），不创建目标 Attempt、不拿目标 lease/write reservation。notice、状态查询、读取已有结果不受限。

**释放**。只在 Run 终止（completed/failed/cancelled）且相关执行已安全对账（cleanup=released）后，整体释放全部 Role，并在同一事务写 event/outbox。“释放 active 状态”就是显式 `/squad cancel run:<id>`：写 cancel_requested、停止新派发、对账子任务及实际执行，确认安全后整体释放。`failed/cancelled` 标签或 TTL 本身不构成释放证明。V1 不提供保留 Run 而单独释放 Role 的暂停操作。

**同 Team 默认 FIFO、一个 active Run**。后续请求形成 queued Run，固定请求时配置快照，不持有 Role/Agent/write 资源。前一 Run 安全收尾后才准入下一 Run；needs_review、quarantined 或仍在停止的前一 Run 不被跳过。取消尚未准入的 Run 不影响活动 Run。

**跨 Team 准入顺序**。Role 释放后按 Project 级请求顺序（queue_seq）重评估 queued Run：只有 roster 全部空闲、且不存在更早排队并与其 roster 相交的 Run 时才准入。roster 不相交的 Run 可以越过，相交的先来先准入，避免大 roster Run 被持续插队。queued Run 不持有任何 Role，因此跨 Team 不会形成 Role 互占环。


Run 真正准入前 SHALL 再检查创建时的 Leader binding 快照仍有效且在线。失败时保持 queued，记录 leader_offline 或 binding_changed，不占任何 roster Role；保留原 queue_seq，相交后队不得越过，不相交 Run 仍可准入。用户可显式取消阻塞的 queued Run，或在合法重绑并对账后显式恢复；Controller 不自动替换 Leader 快照。

#### Scenario: TR-A02 启动 roster 不相交的两个 Team Leader

- **WHEN** 启动 roster 不相交的两个 Team Leader
- **THEN** 系统 SHALL 满足：两个 Run 同时 active 并各自调度
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A07 A Run 准入

- **WHEN** A Run 准入
- **THEN** 系统 SHALL 满足：同一事务占用 roster 全部 Role（owner=A/Run A），roster 外 Role 不被占用
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A08 roster 含 A 已占 reviewer 的 B Run 提交

- **WHEN** roster 含 A 已占 reviewer 的 B Run 提交
- **THEN** 系统 SHALL 满足：B 整体 queued，记录 waiting_roles 与 owner，不持有任何 Role、不创建 Attempt 或半资源
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A09 B queued 期间，其 roster 中空闲的 researcher 不被部分占用

- **WHEN** 提交 B Run，使其 roster 同时包含 A 已占的 reviewer 和空闲 researcher，再提交与 A/B roster 不相交的 C Run
- **THEN** 系统 SHALL 满足：B 整体排队且 researcher 不被部分占用；C 可准入并执行
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A10 A reviewer Task 完成但 Run 未结束

- **WHEN** A reviewer Task 完成但 Run 未结束
- **THEN** 系统 SHALL 满足：B 不能准入
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A11 A Run 安全收尾

- **WHEN** A Run 安全收尾
- **THEN** 系统 SHALL 满足：整体释放与事件同事务持久，B 按准入顺序原子准入并通知 B Leader
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A12 两个 roster 相交的 Run 同时准入

- **WHEN** 两个 roster 相交的 Run 同时准入
- **THEN** 系统 SHALL 满足：只有一个占用成功，另一个整体 queued，无部分占用
- **AND** 验收记录保留 F/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A26 A（backend+reviewer）与 B（reviewer+backend）交叉 roster 先后提交

- **WHEN** A（backend+reviewer）与 B（reviewer+backend）交叉 roster 先后提交
- **THEN** 系统 SHALL 满足：后者整体排队，不出现互占环，排队链可见；A 收尾后 B 准入
- **AND** 验收记录保留 U/E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A33 同 Team 第二个 Run

- **WHEN** 同 Team 第二个 Run
- **THEN** 系统 SHALL 满足：FIFO queued，不覆盖旧 Run或持有其资源，安全收尾后准入
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A08 从零使用命令创建Team Run，重复request，再提交同队第二Run

- **WHEN** 从零使用命令创建Team Run，重复request，再提交同队第二Run
- **THEN** 系统 SHALL 满足：一个逻辑请求一个Run；第二FIFO；无需隐藏手工改DB
- **AND** 系统 SHALL 满足：补查Leader离线/换绑定的queued Run不占Role，原queue_seq相交公平顺序保留。
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A34 取消queued Run，再结束前Run；另测前Run cleanup未完成

- **WHEN** 取消queued Run，再结束前Run；另测前Run cleanup未完成
- **THEN** 系统 SHALL 满足：已取消Run不准入；清理未完成不跳到下一Run
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

### Requirement: TR-05 部分等待、唤醒与等待环

系统 SHALL 满足以下行为契约。

两级等待分开保存。Run 级：queued Run 保存 waiting_roles 或等待的前序 Run，不持有资源。Task 级：active Run 内每个 Task 持久化自己的 blocker 集合（依赖、Agent 逻辑归属或执行额度、capacity、写资源、Primary offline、隔离），而不是一个全 Run 的 blocked_on 字段。一个分支等待不阻止其它就绪分支；取消或改版 Task 只删除其自身有效 blocker。

Leader briefing 提供本 Run 各 Role 的 Primary、idle/working/offline/quarantined 及当前 Task，但不是锁。提交时 Controller 再次 CAS。Role 释放与可重放 event/outbox 在同一事务提交；等待登记与事件订阅不存在丢唤醒窗口。重复、迟到事件不能重复准入或重复派发。Leader 无进展时结束协调轮，不用模型轮询；Controller 自身的 heartbeat、对账或有界投影刷新不属于模型忙等。

统一 WaitGraph 覆盖 Task 依赖、父子调用、Agent affinity 和写资源，注册新边时做环检测，环及资源链可见：接受新依赖/等待边时能发现的环 SHALL 在同一事务拒绝该新边，返回完整环路径且不遗留半任务；仅在派发/对账时发现的环 SHALL 将构成环的最新等待节点置 needs_review，冻结其后继、保留资源，用户取消环上任务并安全对账后重新计算。不得自动抢占。Role 占用边只出现在 queued Run → owner Run 之间；由于 queued Run 不持有资源，这类边不会成环，WaitGraph 仍展示排队链供解释。等待时长可见；V1 不承诺有限等待时间。

#### Scenario: TR-A24 同 Run 内两 Task 分别被 Agent 占用与写冲突阻塞，第三分支就绪

- **WHEN** 同 Run 内两 Task 分别被 Agent 占用与写冲突阻塞，第三分支就绪
- **THEN** 系统 SHALL 满足：第三执行，解除一个 blocker 不清另一个
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A25 重复、迟到 role_available

- **WHEN** 重复、迟到 role_available
- **THEN** 系统 SHALL 满足：不重复准入或派发，多个排队 Run 按准入顺序原子竞争
- **AND** 验收记录保留 E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A10 多blocker并存时取消/改版一个Task

- **WHEN** 多blocker并存时取消/改版一个Task
- **THEN** 系统 SHALL 满足：仅清对应revision的wait，其它分支正确推进
- **AND** 验收记录保留 F/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A12 在登记等待/释放/订阅/snapshot间注入竞态和事件gap

- **WHEN** 在登记等待/释放/订阅/snapshot间注入竞态和事件gap
- **THEN** 系统 SHALL 满足：无永久漏唤醒；重复事件去重；epoch/gap触发对账
- **AND** 验收记录保留 F/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

