## Context

动机见 [proposal.md](proposal.md)。本设计落实当前工作区的 [阶段 04 设计](../../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_DESIGN.md) C01—C22、D01—D11；行为契约见本 change 六份 specs。原需求及其 89 项验收仍为追踪基准，OpenSpec 转换不改动已确认范围。

本轮只读核对了现有扩展、Registry、HTTP、TUI、配置测试和 SSE 测试；未重跑运行验收，未宣称新的 API 探针已通过。

| 当前代码证据 | 观察 | 本 change 的落点 |
|---|---|---|
| `extension/config.ts`、`config.test.ts` | cwd 下旧 `.agents/roles`、frontmatter、进程快照；不向上发现 | Project discovery、严格新 schema、显式迁移 |
| `extension/index.ts`、`registration.ts` | 固定 18741 fallback；整段 systemPrompt；即使未选择身份也登记工具 | discovery 握手、无身份提前 no-op、可组合 sections |
| `extension/messaging.ts` | 非 extension 输入直接 userPending，ask 独立 gate，agent_end 收尾，已有 generation 和 injection_requested | 统一输入分类及执行 gate；正式任务以 settled 收尾 |
| `controller/agent/registry.go` | token/撤销/previous_session；消息失效在 Upsert 事务外；additive schema | 保留身份机制，统一事务与 outbox，版本化迁移 |
| `controller/agent/events.go`、`httpapi/events_sse_test.go` | 现有消息 SSE 唤醒及绑定测试 | 复用传输模式，新增持久事件及 snapshot 对账 |
| `controller/cli/tui.go`、`client/` | 只读 Agent 列表与详情 | 统一 Team/Role/Agent/Run/Task projection |
| `package.json`、`controller/go.mod` | Node test、Go 1.27.0、既定 Go 栈 | 沿用测试入口和库版本，不引入第二服务 |

当前没有 Task/Attempt/TeamRun 存储或调度器，不能把阶段 03 当作已存在前置。`openspec/specs/` 为空，因此本次六能力全部为 ADDED。既有 wiki 的差距评估与上述代码一致；固定 Pi API 的细节证据来自已编译 wiki 和阶段设计 S1，本轮未重读上游或更新 submodule。

## Goals / Non-Goals

**Goals:**

- 由单一 Controller 保证身份、资源、任务和事件的一致性；TS 只负责 Pi 生命周期、输入、工具 gate 和视图适配。
- 先建立可持久、可隔离的单 Task 路径，再组合单 Team DAG；以独立 4a 门交付后增加多 Team 公平准入和 UI 加固。
- 把已接受、注入、执行完成、业务验收、物理清理分开，使故障后可解释且不会隐式重执行。

**Non-Goals:**

- 不承诺物理 exactly-once、不提供任意外部进程的文件沙箱或副作用自动回滚。
- 不建立第二 broker/Workflow Engine，不把 Go 控制面迁往 TS，不接 Herdr location adapter，不创建或管理 Pi 进程。
- 不为吞吐放松整 roster 占用、单 Primary 或单 Team active Run；不引入暂停 Run 后释放 Role 的新操作。

## Decisions

### 1. Project discovery 和版本化协议

复用现有二进制及 Viper/Cobra 配置，在 `controller/project/` 增加 canonical root、配置快照、进程锁和迁移；TS 配置读取同一契约。最近 `.agents/pisquad` 是根，目录项实际大小写、realpath 越界、嵌套 Project 均校验。`role.md` 使用 name/description、非空正文、64 KiB 上限；ID 小写 ASCII 字母开头。`agents.md` 和 instructions.md 可为空但必须存在。Team/Workflow schema 依 D02，未知字段拒绝；同 config_version 异内容返回 CONFIG_VERSION_CONFLICT。

`serve` 是唯一写库者，锁定 `.runtime/controller.lock` 后监听 `127.0.0.1:0`，原子写 controller.json（schema_version、protocol_version、controller_id/epoch、project_root、endpoint、pid）。客户端包括 URL override 都核对 `/health` 身份。wire=`pi-squad/2`、配置 schema=1、V1 调度策略是三个版本维度。未启用身份时不安装 Squad 工具/gate/补全；配置错误不吞掉普通 Pi。

不采用固定端口回落或新旧目录双轨扫描：它们会将旧服务或另一 Project 误识别为目标。迁移流程见后文。

### 2. 业务服务、持久模型与组合事务

`agent/` 保留 Registry/认证；`project/` 管配置/迁移；`task/` 管 Task、Attempt、结果和 typed dependency；`scheduler/` 管 Run admission、Primary、Role ownership、lease、WaitGraph；`recovery/` 管 fencing/cancel/reconcile；`projection/` 管一致读模型。`httpapi/` 只认证、解析和返回业务结果，`cli/`、Resty client 与 TUI 不打开数据库。沿用 Go AGENTS 规定的库版本。

持久实体使用 D03：TeamLeaderBinding、RolePrimaryBinding、ConfigSnapshot、TeamRun、TeamRoleMembership、Task、TaskDependency、TaskAttempt、AgentTaskReservation、ExecutionLease、RoleActionOwnership、WriteReservation、WaitEdge、Result/Review、IdempotencyRecord、Event/Outbox、RecoveryAction。Project scope 下唯一索引约束 Team Leader、Role Primary/owner、Agent 非终态 Attempt；同 Team 未安全清理的 admitted Run 唯一。revision 与 controller/binding/primary epochs 用于 CAS/fencing。

短写事务统一提交状态、资源和事件/outbox；网络和模型调用在提交后。现有消息失效与 Registry 更新必须接入共同事务，不保留跨事务的部分成功。请求键为 project+认证 source+operation+request_id；同内容重放返回原实体，异内容冲突。不能只用内存 mutex 或 SSE 的发送成功作为持久承诺。

### 3. Run 准入与 Task 派发分两层

创建 Run 校验配置、权限、Leader online 并固定快照，分配 Project 单调 queue_seq。同队 FIFO 只允许一个 active Run。准入事务一次取得全部 roster Role；任一冲突则整体 queued、只记 waiting_roles、不拿资源。离线 Primary 不阻止 Role ownership，但不准派发。M1 建立此不变量的单 Team 路径，M7 补齐多 Team 的竞争、公平和唤醒，不先发布部分占用语义。

跨 Team 重评估按 queue_seq：更早且 roster 相交的 Run 优先，不相交的可越过。queued Run 不持资源，因而不形成 Role 互占环。不采用 lazy acquire 或 Task 完成即释放：两者分别违背已确认的激活语义和整个 Run 的角色归属。

Task 接受时保存 expected Primary/runtime/session/epoch；排队不建 Attempt。真正派发再核验 Run、typed dependencies、Primary、ownership、Agent affinity、capacity、write_set，同事务生成 Attempt、reservation、segment lease、dispatch_intent/outbox。事务失败不返回 accepted、也不注入。Role ownership 只在 Run 准入与安全收尾改变，派发失败不得误删它。

Task blockers 是带 revision 的集合；取消/改版只清自己的边。WaitGraph 覆盖依赖、父子、affinity 与写资源，queued Run 的 ownership 等待链用于解释。环拒绝或 needs_review，不自动抢占。持久事件先保存后通知，事件消费依据当前 revision 重评估，不能直接重放旧派发决定。

### 4. Pi 执行 gate 与权限

新增 `execution-gate.ts`、`invocation.ts`、`handoff-input.ts`，将现有 messaging 的 userPending/generation/ask 纳入一个入口。正式任务与 ask 共享模型工作 gate，但 message receipt 不是 Task 结果。notice 和读状态不触发模型；Team ask 是受管 kind=ask，仅允许关联 get/reply；正式 execute 才可使用经交集授权的工具。

Controller admission 后 adapter 再核验绑定、generation、idle/pending、affinity。准备输入后最后检查至 Pi 输入 API 调用之间没有 await。分别持久 dispatch_intent、adapter_received、injection_requested、input_observed；重复 dispatch 返回已有状态。已请求注入但结果不明时 outcome_unknown，不能自动再送。工具枚举用 StringEnum，机器状态放 details，展示截断；受管文件修改遵守 withFileMutationQueue() 并校验声明路径，不能通过 shell 绕过 write_set。

scope 由认证来源和当前 Attempt 裁决；Team 调用不能靠 direct 或 Secondary ID 逃逸。Leader 工具集合只协调，read_only 由 gate 实施。对 standalone 的合法 direct 调用保留独立权限，不隐式创建 Team Run。

### 5. 父子、结果和恢复

yield 后等待真正 settled/no pending 才释放当前 segment 的执行 capacity；保留父 AgentTaskReservation、Role ownership 和写资源。child 完成恢复同一父 Attempt 的新 segment，重取 lease/fencing，不创建重试。capacity=1 能让 child 运行；无关任务不能抢父会话。child 申请父写资源在接受前拒绝。澄清使用受限 response-only continuation，不形成反向执行祖先。

result_proposed + 对应绑定/segment 的无错 settled + idle/no pending + schema/refs 校验才算 execution completed。`agent_end` 不能替代 settled。缺结果显示 RESULT_MISSING。普通业务边默认 acceptance_accepted，review 边用 execution_completed；审查绑定 goal/result revision/artifact hashes。rework/re-review 创建新节点，保留旧拒绝；最终 Gate 事务复核所有当前结果、依赖、审查、blocker、故障和未知执行。

Worker 普通用户输入、显式 takeover 或执行中 /new 持久中断并向所有等待祖先传播失败；活动 Run 的 Leader 普通文字记录为 run_guidance 并在安全边界应用；相关 amend/handoff 则记录 source context，活动父须 yield 后才派 child。取消先关闭新派发，再按精确绑定中止相关 segment、对账子树；queued Task 不 abort 无关模型。failed/cancelled 与 cleanup=released 分离；TTL 不证明执行停止。

Controller epoch 变化或失联冻结新输入，自动只读对账；恢复需显式授权。recover 关联旧证据，retry 创建新 Attempt 并记录 retry_of/rebind，promote 只改角色代表。旧结果只进入历史，不复活故障。正常事件续接与故障恢复使用不同 gate。

### 6. 上下文快照与最终请求证据

`context-assembly.ts` 通过 Pi 原生 systemPromptOptions.sections 装配稳定标识块；不返回覆盖全局的 systemPrompt。role.md 为进程快照，agents.md 为 Attempt 快照，Team config/instructions 为 Run 快照，roster/briefing 为 segment 动态内容。TaskContract 保存 role/Primary、team/run/task/attempt/segment、kind、goal、source/root/parent、typed dependencies、不可变 refs、expected_output/acceptance、工具和 write_set、hashes。续接不热换快照，动态块结束即清理。

以 `before_provider_request` 对最终 payload 做脱敏结构/hash/工具集合证据；不能以 whoami 或组装字符串替代。M0 对固定 Pi API 编译及运行能力探针，M2 证基本闭环，M9 补重试/压缩/后置改写/长上下文。已有聊天历史可能保留，不宣称跨 Team 历史隔离。

### 7. 输入、命令、投影和 API

`team-roster.ts` 给命令补全、mention wrapper 和 Picker 同源 projection；缓存 key 为 project/team/run/config_hash/generation，值含 revision/data age，旧异步结果作废。`squad-commands.ts` 提供 TR-13 全部命令和三个 alias；Picker 只填草稿。仅用户交互首 token 精确路由，文件冲突拒绝歧义；`@role:`、`@./` 显式区分。已识别交接失败或未知不能继续本地 LLM。

所有入口复用 D08 的服务路径：`GET /health`、`GET /v2/snapshot`、`GET /v2/teams/{id}/roles`、`GET /v2/events?after=seq`；Run create/read、handoffs、decisions；Task children/direct/read/amend/cancel/recover/retry；Attempt yield/result/events；Role release/promote。Run cancel 有独立端点。writes 带 request_id、适用的 expected_revision 和当前 source binding；生命周期证据接口只给认证 adapter。`squad_run_create`、`squad_decide`、`agent_invoke`、`agent_task_get`、`agent_task_yield`、`agent_task_complete` 不另建执行路径。

Go TUI（M6）和 Pi `dashboard.ts`（M8）共用 snapshot/事件读模型。SSE 只作 invalidation；乱序/gap/epoch 变化重取 snapshot，断线显示 stale。不把 Presence、Activity、Binding、Ownership、Task、Acceptance 合成一个状态。预览管理命令不写库；用户显式提交后重新 CAS 并审计。选 Run 不授予权限，/new、终结及绑定变化清 UI context。

## Risks / Trade-offs

- [范围包含未实现阶段 03] → 任务按 M0—M9 落到现有模块，4a 先完成真实 direct/单 Task 和恢复，不用 ask 代替。
- [整体 roster 占用降低并发] → 作为已确认行为保留；UI 展示 owner/等待原因，不以优化名义缩小占用。
- [Pi 实际安装版本与固定源码能力可能不同] → M0 doctor/probe 阻止不支持的调用；具体版本当前 unknown，不靠猜 API 实现。
- [注入与 ACK 非原子] → 明确 outcome_unknown、持久 intent、用户恢复；不许自动重发副作用工作。
- [文件写入不能覆盖外部进程] → 限定本 Controller 的 write/edit，拒绝越界及无法约束的 shell 写入，报告写明实际保证。
- [多扩展 hook 顺序、压缩和重试改变 payload] → 统一分类 gate，最终 payload 证据和组合 harness，M9 真实回归。
- [旧 DB 与授权丢失、迁移后错误在线] → 一致备份、显式映射、失败回退、协议隔离和重新握手，禁止自动清库。
- [规格与阶段文档漂移] → 同步核对 18 条需求、89 个唯一 ID、71/18 门和 INV 映射；修改行为时一起更新二者，不能用新计数掩盖未测。

## Migration Plan

1. M0 提供只读 dry-run 和 doctor，列旧目录/角色/DB/协议及无法唯一映射的数据，不移动文件或调用模型。
2. M1 实现显式迁移命令：先停止旧写者、获取真实锁，制作含 WAL 的一致备份及 manifest，校验数据和 schema_version。
3. 按明确映射转换到 `.agents/pisquad`；不改原生 AGENTS.md，不猜 Team 成员，不删除旧 messages/owners/撤销与授权快照。新增 `.runtime` Git 忽略规则。
4. 校验后原子发布新 discovery；拒绝旧调度客户端混跑。历史 online 不自动恢复，Pi 以新身份重新握手。根、插件和 Controller AGENTS 及 USAGE 在功能落地同批更新。
5. 迁移失败恢复旧一致备份与旧 discovery，保留失败证据。启用新调度后如需回退，先停止新写者、对账执行并保留新库/产物；不覆盖新数据或假装副作用已回滚。
6. M0—M6 后以 4a 71 项和关键旧功能回归为交付门；M7—M9 后以 4b 18 项及 4a 无回归为阶段完成门。部署和迁移不包含本轮 propose。

## Review Resolution

2026-09-27 经 w6:p1 Cursor 三轮协商与用户四项裁决，采用 [权威设计 D12](../../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_DESIGN.md#d12) 的完整补充契约。状态转移、操作端点、凭据、acceptance schema、planned/rebind、原生hook及配额均以该节和本 change specs 同步实现。下列是对前文省略的明确补充：

### 1 LeaderStep 与终结顺序

同一TaskStore使用kind=leader_step，授权目标为TeamLeaderBinding，不强行映射成员Primary；状态/dispatch intent/lease/outcome_unknown/fencing沿用执行公共路径。所有leader/worker/response-only segment计Project容量，Team scope同时计Team容量。LeaderStep不占20个业务Task预算，但同Run revision不能零进展重复触发。

complete首先记录completion intent，正常settled后再跑Gate。Gate检查当前业务结果、typed边、review/覆盖、未解决故障和其它执行；通过后才能终结，再安全整体释放。等待结果的Leader必须settle让出额度，capacity=1不能把自己占的额度当作worker启动前提。普通Leader输入保存run_guidance修订，不能steer；显式takeover仍中断。已终结Run的迟到guidance拒绝，不自动建新Run。

### 2 planned、绑定、amend 和配额

Workflow planned节点与accepted Task存在同一Store，前者已有ID/revision、计业务预算，但无expected_target/Attempt。Controller在依赖满足、Run active且无recovery hold时转换；在线验证失败留blocker。接受后冻结完整目标，不因/new/promote自动替换。`POST /v2/tasks/{id}/rebind`只允许从未有Attempt的已接受Task，需operator、expected_revision、旧/新绑定和审计；不建Attempt。曾有Attempt只能retry，超过上限拒绝，不提供暗中覆盖。

amend保存受理goal_revision和applied_revision；safe settled后新segment才应用，不改变原Role/working/Team快照或扩大工具。旧修订结果保留历史，不能满足新要求。竞争通过CAS给出唯一顺序。

Project参数`serve --max-parallel-tasks` / `PI_SQUAD_MAX_PARALLEL_TASKS`（Viper键max-parallel-tasks）默认2、正整数；Team policy.max_parallel_tasks也是含Leader的实际segment上限。Project上限单独配置，不能让各Team自报不同的全局值。多Team夹具显式Project≥4且Team额度充足，记录真实重叠区间。待执行队列上限32按目标Agent计算，满队列拒绝；planned尚未进入Agent执行队列，但仍受业务节点预算约束。deadline_at必须明确保存；实验120秒预算不是lease TTL。

standalone root/child的team_id/run_id为null，scope由认证source和父context派生；默认depth=3、root child≤20、attempt≤3、Agent队列32。第一版direct只读，不能通过Team source绕进direct。Project Viper配置`direct.allowed_callers`、`direct.allowed_targets`显式列稳定Agent ID，默认空（不授权模型root direct）；`direct.allowed_tools`默认read/grep/find/ls并与本地可用和目标约束取交集。操作者可显式发起合法direct；自然语言模型root调用须先配置上述授权，实验配置记录在USAGE。child继承同root授权/预算，不再索取管理员权力。

### 3 恢复状态与用户操作

| 当前状态/条件 | 显式操作或事件 | 结果 |
|---|---|---|
| queued且Leader快照离线/变化 | 正常准入扫描 | 保留queue_seq和blocker，不占Role，相交后队不越过 |
| controller重启/失租/未知注入 | 只读reconcile | recovery hold；不新增模型输入 |
| 旧进程无法回报 | operator reconcile confirm-stopped | 人工声明、原因/证据与旧绑定审计；撤销许可并仅清理已核实资源，不冒充自动验证 |
| Run hold且无未知执行/未解故障 | resume run + revision CAS | 恢复queued或当前DAG对应phase；正常调度仍重新检查依赖/资源 |
| 绑定变更 | 合法release/promote/rebind及resume | 展示旧新绑定，显式更新并保留历史；不自动搬任务 |
| 非终态但预算耗尽 | 重试请求 | 拒绝超预算，保持needs_review；允许用户cancel安全收尾后另建请求 |
| active/queued Run | cancel | cancel_requested、阻止新派发；相关执行对账后cleanup=released，整体释放 |
| 业务完成候选 | Leader complete intent及自身settled | Gate复核，全部条件满足才completed并清理 |
| failed/cancelled且cleanup pending | 晚到结果/心跳 | 只补证据，不复活或因TTL放资源 |

新增`POST /v2/runs/{id}/resume`、`POST /v2/attempts/{id}/reconcile`、`POST /v2/teams/{id}/leader/release`、`POST /v2/tasks/{id}/rebind`；每个操作都有request_id、expected_revision、目标旧绑定/证据和审计。resume不是retry；reconcile不自动执行；role release仅解绑Primary。Primary显式解绑后保留unassigned tombstone，仅promote可重建；从未绑定才首注册自动Primary。Leader/Primary/Runtime撤销保留历史，不用DELETE抹掉授权证据。

### 4 授权与验收

Project管理员持独立`.runtime/operator.token`（目录0700、文件0600）；discovery不含token。管理HTTP端点仅接受operator credential，runtime token即使自报origin=user_command也拒绝。Pi显式管理handler使用独立operator客户端并记录当前binding，CLI operator没有Pi binding；模型tools不暴露该客户端。受管read/write禁止访问凭据及控制文件，日志/工具参数/模型payload不包含管理token；同OS用户恶意进程不是本地协作协议可隔离的边界。凭据轮换使旧令牌失效，权限错误不能退回旧无认证release路径。

TaskContract增加不可变acceptance_policy。Team policy.acceptance_policy声明checker或review默认；无策略且无法解析时拒绝业务Task。standalone无预授权checker/reviewer时固定human模式。用户root默认选择解析为具体mode并固定。mode=checker使用预注册checker_ref；mode=review使用独立reviewer_ref；mode=human只接受operator；mode=parent记录covered_by及精确child hashes。child_policy=inherit_parent为默认，separate要求单独验收。review、leader_step、response-only控制节点不递归生成review义务。

`POST /v2/tasks/{id}/acceptance`由operator显式accept/reject，或由Controller内部经正常settled的review/已注册checker证据提交；执行者不能自行记录accepted。Review绑定goal/result/artifact版本且agent_id不同，同Role自审配置拒绝。父子continuation边execution_completed，父验收覆盖只在父当前accepted且引用匹配时生效；其它业务边仍按policy使用acceptance_accepted。旧review/覆盖随相关版本变化失效，不覆盖历史。

### 5 Pi 原生输入边界

固定Pi `agent-session.ts:1327`先执行registered command再emitInput；因此所有/squad handler与input共用分类服务。`sendUserMessage`注入显式`expandPromptTemplates=false`、source=extension，正文即使以/开头也不执行命令。

`interactive-mode.ts`原生命令和!bash可绕过两条路径。接入session_before_switch/fork/tree、session_start.reason、session_tree、session_before_compact/compact/compact_failed和user_bash；before事件只准备fence，确认变化后持久session_changed；取消selector不能中断。tree即使session_id不变也改变context generation，所有非终态/suspended Attempt不得跨历史续接。手动compact()先abort、后触发before_compact，必须依据实际中断与reason=manual标manual_compaction并上行未完成，不声称hook阻止了原生abort。自动threshold/overflow/重试按原Attempt处理，真正settled才完成。

活动Worker含suspended时的plain@或无parent call handled拒绝ACTIVE_TASK_SCOPE_CONFLICT；显式`--parent current`保留source revision，安全yield后派child。阻塞澄清使用child yield/settled→父response-only→child新segment，计正常容量；答复控制边不是祖先执行边，也不满足父child-success边。WaitGraph接受新边发现环即原子拒绝，晚发现则隔离最新等待节点并展示环，不释放资源。

### 6 证据和实施顺序补充

M0补原生事件/注入探针；M1补operator凭据、planned/schema和绑定历史；M2补direct授权/ROLE_BUSY/队列上限；M3补显式reconcile/resume/rebind、manual_compaction和凭据拒绝；M4补LeaderStep、run_guidance、父子澄清与Acceptance覆盖；M5补命令；M7沿用同一准入唤醒服务加固多Team。既有89个ID增加下属断言，不新增主ID，也不把新子场景算已PASS。实验2秒可见目标/120秒模型预算保留，不转为产品SLA。

