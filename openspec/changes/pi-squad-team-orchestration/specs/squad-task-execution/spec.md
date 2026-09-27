## Purpose

定义正式任务从接受到执行、父子续接及恢复的行为契约，使用户能够区分模型执行、逻辑归属和副作用资源，并在中断或结果未知时保留真实状态与恢复依据。

## ADDED Requirements

### Requirement: TR-06 执行许可、容量与写资源

系统 SHALL 满足以下行为契约。

实际执行前原子检查 Task revision/依赖、当前 runtime/session、AgentTaskReservation、执行额度、Project capacity、write_set；Team scope 另检查 Run active、Team 授权、ownership 和 Team capacity。成员 Task 核验 Primary，LeaderStep 核验 TeamLeaderBinding；standalone 按 root 授权校验，不要求虚构 Run 或 Team ownership。

同 Agent 最多一个非终态正式 Attempt（包括 suspended），同 Pi 最多一个模型执行片段；不得以 team_id+agent_id 创建多个槽。Controller admission 后 TS 在输入注入前再检查最新 idle、pending、generation 和本地 gate；最后检查与调用输入 API 之间不得插入新的异步等待。竞争失败留队列，不 steer/abort 手工工作。

写任务先声明规范化 write_set；文件别名、目录包含关系和同一文件的多种路径不能绕过互斥。只在 Project 自己的可写树内受管写入，排除嵌套其它 Project、配置及 runtime 控制文件。任意 shell 副作用不能靠路径声明得到强隔离保证；V1 验收写任务使用可检查路径的 write/edit 工具，未能约束的 shell 写入应拒绝。


Project 容量由 Controller `serve --max-parallel-tasks` / `PI_SQUAD_MAX_PARALLEL_TASKS` 配置，默认 2，必须为正整数；Team 容量仍由 `policy.max_parallel_tasks` 配置。所有实际 LeaderStep、Worker 和 response-only segment 都计入 Project 容量，Team scope 的这些 segment 同时计入 Team 容量；standalone 只计 Project 容量。受理时记录策略快照，派发还必须满足 Controller 当前全局上限。不同层上限都必须满足，不用 suspended affinity 冒充执行额度，也不因逻辑 Attempt 终态就解除尚未安全清理的 reservation。多 Team 并行验收夹具 SHALL 显式配置 Project capacity 至少 4，并配置足够 Team 容量。

#### Scenario: TR-A14 同 Primary 两正式任务

- **WHEN** 同 Primary 两正式任务
- **THEN** 系统 SHALL 满足：一个 Attempt/执行片段，其余排队，Pi 无重入
- **AND** 系统 SHALL 满足另填满默认 32 项等待队列，下一请求明确拒绝，不产生 Task/Attempt 半记录。
- **AND** 验收记录保留 U/E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A31 同 Agent串行、不同文件并行、相同写资源互斥

- **WHEN** 分别向同 Agent、不同 Agent 的不同文件、不同 Agent 的相同写资源派发正式任务
- **THEN** 系统 SHALL 满足：同 Agent 的执行区间不重叠；不同文件且额度足够时真实并行；相同写资源互斥，并有 lease/write reservation 证据
- **AND** 验收记录保留 U/E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A11 Run准入整体占用roster时、及首次派发时注入capacity/write冲突及事务失败

- **WHEN** Run准入整体占用roster时、及首次派发时注入capacity/write冲突及事务失败
- **THEN** 系统 SHALL 满足：无部分Role占用，无lease/Attempt半成功；已有本Run ownership不误删
- **AND** 验收记录保留 F/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A37 相同文件别名、目录包含、符号链接、嵌套其它Project路径

- **WHEN** 相同文件别名、目录包含、符号链接、嵌套其它Project路径
- **THEN** 系统 SHALL 满足：受管写入正确互斥或拒绝越界；不声称任意进程沙箱
- **AND** 验收记录保留 F/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

### Requirement: TR-07 消息、正式调用与 scope

系统 SHALL 满足以下行为契约。

notice、状态查询、读取既有结果只记录/展示，不启动目标模型，也不占 Role。新模型工作的 Team ask、execute、review、rework、peer invoke、用户 handoff 必须走相同 Role Gate 和本地 work gate。

调用 SHALL 异步返回 task_id，并提供 `agent_task_get` 查询；任务进入目标既有 session，保留其历史，不创建后台 Pi/session。同 Agent 忙时排队，沿用阶段 03 默认队列上限 32，满队列明确拒绝。TaskContract SHALL 记录 deadline_at，超时停止下游并显式待核实，不推断执行停止。

正式 handoff 不映射为现有 `send_message(kind=ask)`。Team ask 可产生 kind=ask 的受管 Task 并关联消息，仍保留受限回答工具；执行 Task 则使用其正式工具契约。已有 message_id、receipt、reply 与 task_id、attempt_id 不相互替代。

Direct invocation（原阶段 03 定义，本阶段 4a 交付）通过显式 agent target 和独立授权调用真正 standalone Agent；目标离线返回 `AGENT_OFFLINE`，不启动或接管 Pi；它不隐式新建 Team Run。携带活动 Team/Task 上下文的调用者不能靠 `scope=direct` 或 `agent:<secondary>` 逃逸；scope 由认证源和执行上下文裁决。已被 Team Run 持有的 Primary 不接无关 direct 模型工作。非 Team、无冲突的 standalone 使用仍有效。


`standalone` 是执行 scope，不是第三种 Pi 启动 mode：Pi 仍以 leader 或 role 启动，未选择身份仍 no-op；无 Team ownership/活动 Team Attempt 冲突的 role 实例可执行合法 standalone 调用。standalone 的根和 child 均有 team_id/run_id=null，继承 root 的授权、工具/路径及预算，不得借此进入 Team 或切换 scope。Team child 则必须保持同 Run。standalone 第一版正式调用只读，Project 提供默认深度 3、每 root 最多 20 个 child、每 Task 最多 3 个 Attempt、每 Agent 最多 32 项等待队列；这些是有来源的实验默认，不能由 prompt 提升。Task 的 deadline_at、预算来源和权限交集 SHALL 可查询。

#### Scenario: TR-A13 他队或 standalone 用 ask/peer invoke/direct 请求被 active Run 占用的 Role/Primary

- **WHEN** 他队或 standalone 用 ask/peer invoke/direct 请求被 active Run 占用的 Role/Primary
- **THEN** 系统 SHALL 满足：返回 ROLE_BUSY，不创建目标 Attempt，不能改选 Secondary
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: CMD-A09 用已声明 write_set 的正式 backend Task 修改 fixture

- **WHEN** 用已声明 write_set 的正式 backend Task 修改 fixture
- **THEN** 系统 SHALL 满足：不以 Messaging ask 代替，工具权限正确
- **AND** 验收记录保留 U/E/R 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: CMD-A12 未加载 Squad Skill 仍可路由

- **WHEN** 调用方与目标均未预先加载 Squad Skill，提交正式调用
- **THEN** 系统 SHALL 满足：正式 Router 仍可路由；目标可按需加载自己的 Skill，不能将 Skill 当作路由授权前提
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A28 Team成员通过direct/agent:secondary/旧send入口绕过，另测合法standalone

- **WHEN** Team成员通过direct/agent:secondary/旧send入口绕过，另测合法standalone
- **THEN** 系统 SHALL 满足：前者拒绝，后者按独立权限工作；scope不是调用者自报
- **AND** 系统 SHALL 满足4a 已须拒绝 direct 到 active Run 持有的 Primary（ROLE_BUSY），4b TR-A13 扩测跨 Team 入口。
- **AND** 系统 SHALL 满足：runtime/model凭据伪造user origin不能管理；无direct预授权的模型root调用拒绝，operator显式direct仍受目标gate。
- **AND** 验收记录保留 U/E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

### Requirement: TR-14 父子调用、yield 与用户介入

系统 SHALL 满足以下行为契约。

Agent-to-Agent 必须通过 structured Tool：Leader 使用 squad_decide，Member 使用 async peer invoke；Assistant 文本 @role 不执行。child Task 保存 root/parent/depth、Caller 绑定和继承约束；Team child 保持同 Run，standalone child 保持 team_id/run_id=null。拒绝调用自己/祖先、DAG 环、资源等待环及超预算。

父 Task 使用 yield 声明依赖，结束模型轮并确认 settled 后释放**执行额度**；AgentTaskReservation、Role ownership、尚有效的 WriteReservation 保留，不能在共享 Session 插入无关正式任务。child 完成后仅恢复该父 Attempt 的新 segment，重新取得 lease/capacity，并使用原 Attempt 快照。父子 write_set 冲突必须在接受 child 前拒绝；V1 不通过静默释放父写锁实现文件交接。

同 root 的澄清问题可作为父 Attempt 的 response-only continuation，使用同一逻辑归属、受限工具及新的执行 lease，不产生第二项正式任务。child 若等待该答复，SHALL 先登记 clarification 关联并 yield，确认 settled 后释放自身执行额度；父 response-only segment 取得正常额度回答并 settled 后，再恢复 child 同 Attempt 的新 segment。不得占着唯一额度等父回答，不额外预留或超卖 capacity。此关联是同 root 的受限答复控制边，不是反向执行祖先或满足父任务的 child-success 依赖；普通执行调用祖先仍拒绝。

用户操作先由统一 InputClassifier 分类。只读命令/Picker/dashboard 不中断任务。明确关联的 amend 或 peer handoff 记录 source task/attempt/revision，不算普通接管；活动模型中先保存 child intent，等待安全边界及父 yield 才派发，不自动 steer 或抢占。父已终结则拒绝 intent。除 TR-02 的 Leader run_guidance 例外，Worker 没有关联的普通输入以及显式 takeover 立即将原 Attempt 标 `interrupted/manual_interference`，向直接调用方和所有等待祖先持久传播“未完成，用户已介入”。未知物理执行状态仍隔离，不能因逻辑中断就放行新任务。


父子续接边 SHALL 使用 execution_completed，不能默认使用 acceptance_accepted，以免父任务等待自己尚未有机会验收的 child；这只允许父读取并判断子结果，不把 child 执行成功自动当业务验收通过。澄清答复不满足该完成边。最终 Gate 中哪些 child 需单独验收，由固定的 acceptance policy 决定，不得临时把所有 child 一律当已验收。

amend SHALL 区分受理 goal_revision 与已应用 revision，保存操作者、正文和关联 Attempt。活动 segment 不自动 steer；在安全 settled 边界将补充应用到同 Attempt 的新 segment，保持原 Role/working/Team 快照及工具/路径上限。pending amend 未应用时旧 revision 结果只保留为历史，不能完成新要求；已终结任务拒绝 amend，amend/result/complete 竞争使用 CAS。

#### Scenario: TR-A27 父 invoke child 后 yield

- **WHEN** 父 invoke child 后 yield
- **THEN** 系统 SHALL 满足：释放执行额度而保留 affinity，结果只续接正确父任务
- **AND** 系统 SHALL 满足：另跑无Team的standalone root→child→continuation，team_id/run_id=null且scope不逃逸。
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A28 self/ancestor/dependency cycle 及超 max_depth

- **WHEN** self/ancestor/dependency cycle 及超 max_depth
- **THEN** 系统 SHALL 满足：返回 CALL_CYCLE/DEPTH_LIMIT，不遗留无法完成的 Attempt
- **AND** 系统 SHALL 满足：分别覆盖Team与standalone预算/环，超max_attempts的retry拒绝且保留cancel收尾入口。
- **AND** 验收记录保留 E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: CMD-A10 Leader 真正调用成员

- **WHEN** Leader 真正调用成员
- **THEN** 系统 SHALL 满足：使用 structured decision，文本 mention 不执行
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: CMD-A11 Worker 调 reviewer child

- **WHEN** Worker 调 reviewer child
- **THEN** 系统 SHALL 满足：父 yield、安全续接，无阻塞 Promise 或第二项正式工作
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A13 Team capacity=1，父调用另一Role child，同时投无关父Agent任务

- **WHEN** Team capacity=1，父调用另一Role child，同时投无关父Agent任务
- **THEN** 系统 SHALL 满足：child可执行，父保留affinity；无关任务不能占其会话；父正确续接
- **AND** 系统 SHALL 满足child 等父澄清时先 yield/settled，父 response-only 后再恢复 child，同样不超卖 capacity。
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A14 child请求父持有的相同文件或其它等待环资源

- **WHEN** child请求父持有的相同文件或其它等待环资源
- **THEN** 系统 SHALL 满足：明确RESOURCE_DEPENDENCY_CONFLICT/环，不静默释放父写锁
- **AND** 验收记录保留 F/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A15 三层嵌套中叶子遭用户普通输入、/new或失败

- **WHEN** 三层嵌套中叶子遭用户普通输入、/new或失败
- **THEN** 系统 SHALL 满足：失败沿祖先持久传播，停止成功后继；上层不永久等成功
- **AND** 系统 SHALL 满足：补查manual_compaction与实际fork/tree/resume切换的中断向祖先传播，suspended父任务也不能跨历史续接。
- **AND** 验收记录保留 U/E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A29 活动Task时查询status/open dashboard，再普通输入

- **WHEN** 活动Task时查询status/open dashboard，再普通输入
- **THEN** 系统 SHALL 满足：查询不打断；普通输入立即记录manual_interference及上行失败
- **AND** 系统 SHALL 满足：4a观察路径用status/Go TUI，Pi overlay由4b P4-A25补验；Worker普通输入中断，Leader普通文字记run_guidance，显式takeover中断。
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A30 活动Worker用户发关联handoff，分别在父yield前/父完成后

- **WHEN** 活动Worker用户发关联handoff，分别在父yield前/父完成后
- **THEN** 系统 SHALL 满足：intent只在安全边界成为child；父终结后拒绝，不误接管或并发注入
- **AND** 系统 SHALL 满足：活动或suspended Worker的plain@ handled拒绝且不接管，--parent current才产生关联intent。
- **AND** 验收记录保留 U/E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

### Requirement: TR-15 故障、会话变化与恢复

系统 SHALL 满足以下行为契约。

`/new` 始终由用户决定：空闲时身份不变，执行中则原 Attempt interrupted/session_changed，旧队列不跨 session 自动执行，旧回调不污染新会话。扩展 reload 更新 generation、清除旧订阅及回调，不能靠重新加载重放未知输入。

Controller 重启、失租、超时、Runtime 失联时记录 reconciliation/needs_review/quarantined/outcome_unknown，禁止自动重派或仅因 TTL 释放副作用资源。只读对账可自动，新的模型输入必须等显式恢复授权。正常无故障的 child 完成/Role 释放可以事件续接；经历故障的 Run 即使后来收到事件也不能绕过恢复门。

cancel 是请求而非停止证明；取消排队任务不 abort 目标其它工作。取消 Run/父任务时持久阻止新的后继，追踪所有子任务及实际执行，确认全部相关资源可安全释放后才关闭 cleanup。晚到结果保留为历史证据，不能自动复活失败、取消或旧 epoch 的执行。

release/promote/recover/retry 分开：recover 不执行，retry 新 Attempt；角色换人不是重试；Primary offline 不是 release。用户手动恢复需保存证据摘要、实际副作用处理方式及操作审计，不声称自动回滚文件。


**用户确认（2026-09-27）**：旧 Pi 无法回报时，允许本地操作者通过 `/squad reconcile attempt:<id> --confirm-stopped --note <原因> [--evidence <ref>]` 显式声明该执行及其相关子进程已停止。系统 SHALL 记录声明人、时间、精确旧绑定/Attempt/revision、原因、证据及副作用处置说明，标记证据来源为 human_attestation，不伪称程序已验证或文件已回滚；撤销旧执行许可后才能推进相关 cleanup。该操作不接受模型工具调用，不绕过其他仍未核实的执行。旧结果仍保留历史，不自动复活成功。

Run 恢复入口 SHALL 为 `/squad resume run:<id>`：先检查全部相关执行已对账、待处理结果/绑定可解释、revision 和权限有效，再解除对应 recovery hold；它不是 Task retry，不重放未知输入。queued Run 恢复后仍按原顺序准入；有未知执行或未解决 blocker 时明确拒绝并列下一步。即使干净重启也不自动恢复新模型输入。新 Leader 须先合法显式释放/重绑，resume 时展示并确认旧/新 Leader 快照，再以 CAS 审计更新，不自动换人。

`/squad leader release <team_id> --expected-runtime <id>` SHALL 在相关执行安全对账后非破坏性撤销 Leader binding，保留历史；不停止 Pi、不解除其他 Run 的 Role 占用。预算耗尽的 Run 进入 needs_review，超过 max_attempts_per_task 的 retry SHALL 拒绝，不提供隐式预算覆盖；用户可以取消安全收尾后另建请求。squad_decide 保持 dispatch/wait/complete，不增加自动 fail 或抢占。

Presence suspect 只表示联系异常并阻止新派发，lease expiry 是独立的执行许可事件；续约周期、提前量、到期时间 SHALL 在 doctor/投影展示并由配置校验。过期 lease 不因迟到心跳自动复活，不能以额外宽限静默继续新工具；过期后的副作用资源保持隔离直到对账。


会话控制覆盖 SHALL 包含原生生命周期，不能仅依赖 input hook。只打开或取消 /tree、/fork、/resume 的选择界面不算切换；实际切换会话/分支时（含 session_id 不变的 tree navigation）全部非终态 Attempt，包括 suspended 父任务，都按 session_changed 中断，更新上下文 generation，旧回调/队列不得进入新历史。用户 `!`/`!!` shell 执行按 manual_interference 处理，仍不声称系统能回滚用户操作。

手动 `/compact` 若实际中止正在执行的正式 segment，SHALL 记 manual_compaction，向直接调用方及等待祖先传播未完成，并走显式恢复；不能把后续压缩完成当旧任务成功或自动续跑。固定 Pi 的 compact() 在 before_compact 前已调用 abort，适配器不得声称该 hook 能事前阻止 abort。已 suspended 且无活动 segment 时的纯上下文压缩不自动新建任务，保留快照；自动 threshold/overflow 压缩/重试仍属于原受管 Attempt，按真实 settled 和最终 payload 校验。

#### Scenario: TR-A15 空闲 Primary /new

- **WHEN** 空闲 Primary /new
- **THEN** 系统 SHALL 满足：agent/Primary/ownership 不变，session 更新
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A19 失租/Controller 重启

- **WHEN** 失租/Controller 重启
- **THEN** 系统 SHALL 满足：执行状态待核实，不自动重派或按 TTL 释放资源
- **AND** 系统 SHALL 满足：补查无Task的queued Run在重启后可显式resume、未知执行时resume拒绝，干净重启仍不自动派发。
- **AND** 验收记录保留 U/E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A29 执行中 /new

- **WHEN** 执行中 /new
- **THEN** 系统 SHALL 满足：旧 Attempt interrupted，旧任务不入新会话，晚结果不推进
- **AND** 验收记录保留 U/E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A16 分别取消排队Task、父Task和Run，含离线child

- **WHEN** 分别取消排队Task、父Task和Run，含离线child
- **THEN** 系统 SHALL 满足：不abort无关工作；级联停止派发；未确认执行不提前释放
- **AND** 验收记录保留 U/E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A18 intent提交前后、Pi注入前后、ACK前后、settled后分别崩溃

- **WHEN** intent提交前后、Pi注入前后、ACK前后、settled后分别崩溃
- **THEN** 系统 SHALL 满足：可区分未接受/可核实/未知结果；未知注入不自动重放
- **AND** 验收记录保留 F/E/U 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A35 quarantined/suspended时promote/release；仅改TTL或DB显示状态

- **WHEN** quarantined/suspended时promote/release；仅改TTL或DB显示状态
- **THEN** 系统 SHALL 满足：拒绝；只有可核实执行对账和显式命令才推进
- **AND** 系统 SHALL 满足：补查人工confirm-stopped附精确旧绑定、原因/证据和审计，清理不伪称自动验证、不回滚文件、不放行仍未知子执行。
- **AND** 验收记录保留 F/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A36 deadline、长等待、故障后role_available/child结果迟到

- **WHEN** deadline、长等待、故障后role_available/child结果迟到
- **THEN** 系统 SHALL 满足：时间和原因可见；不推断已停、不自动重执行，不绕恢复门
- **AND** 系统 SHALL 满足：区分presence suspect、到期lease及旧心跳；失租不自动复活，未知执行仍隔离。
- **AND** 验收记录保留 U/E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

