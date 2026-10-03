---
title: 2026-09-27 阶段 04 实施进展
type: session
status: draft
created: 2026-09-27
updated: 2026-09-27
tags:
  - project-wiki
  - session
---

# 阶段 04 实施进展

用户授权 openspec-apply-change 开始完整实施，并明确先完成全部开发、再整体集成测试，不新增或运行单元测试。任务文件已记录执行顺序覆盖；89 个场景保持原判据，未运行项不勾选。

## 开发中

新增 project 严格加载、进程锁/discovery/operator 文件、只读迁移计划；task 实体/SQLite 表/事务/outbox；scheduler 身份/原子 Run 准入、任务派发/结果/恢复/LeaderStep 与续接；projection 和 v2 HTTP 路由；TS project/client/gate/context/invocation/工具与命令。均为工作中的实现，尚未完成全链路及运行验证，不能当成已交付。

本机只读核对 Pi 0.87.1 的类型 API，Go 1.27.0、Node v24.16.0、TypeScript 7.0.2。开发期间 `go build ./...`（controller cwd）和 `tsc --noEmit` 类型检查通过；没有运行单元或集成测试，没有启动测试 Controller/Pi。

## 跟踪

- [OpenSpec 任务](../../openspec/changes/pi-squad-team-orchestration/tasks.md)
- [整体集成索引](../../pi_squad_case/04-team-orchestration/integration/README.md)
- [[sessions/2026-09-27-pi-squad-phase04-cursor-review]]

## 开发收口与集成起点

已补齐严格配置/协议、显式迁移、独立 operator 凭据、身份与 roster 原子准入、Task/Attempt/segment、恢复审计、checker/review/human/parent 验收、native 输入隔离、受管读写工具、消息兼容、CLI/Pi 命令、Go/Pi Dashboard 和仅集成入口的故障窗口。使用说明已改为 v2；schema 从 Go 类型重新导出。生产及集成构建、TS 类型检查、diff whitespace 检查通过，未运行单元测试。

接下来统一执行真实 Pi + HTTP/SQLite 整体集成。89 项仍保持 NOT_RUN，验证子项未勾选；开发完成不构成验收通过。发现问题在整体流程中修复、保留失败与复测链。

## 本机 native API 核对

只读核对安装的 Pi 0.87.1：`dist/modes/interactive/interactive-mode.js` 的 resetExtensionUI 在 session invalidate/reload 清空 autocomplete wrappers，因此按 session_start 安装；`dist/core/agent-session.js` 的 isIdle 不包括 executeBash，原生 bash 完成通过记录 bashExecution 观察，不能单靠 idle 释放。UI prompt start/end 独立反映 blocked 与底层 working；session_before_* 只使待注入 generation 失效，实际 session/branch 变化才持久中断，避免 selector 取消误伤。对应运行顺序仍待真实 Pi 验证。

安装包 source commit 未能由元数据证明时 doctor 显示 unknown，不把仓库参考 commit 冒充安装版本。能力声明与脱敏运行探针分开；观察到 hook 不等于通过所有场景。

## 整体集成进行中

独立验收在 Herdr `wJ` 的 Controller、Go Dashboard、Leader 和 counter/summer/reviewer 三个真实 Pi 中进行；回传登记在 `pi_squad_case/04-team-orchestration/HANDOFF.md`。首轮真实 count=3/sum=60、独立审查和 Run 释放已观察到，完整记录见 `pi_squad_case/04-team-orchestration/integration/RESULT.md`；不代表 89 项通过。

首轮发现模型省略 refs 会使审查结果缺少输入版本引用，Controller 已强制固定 Task refs 到 Result；受管 read 返回实际文件 hash/length，供模型提交产物引用。后续真实产物改版触发 acceptance_invalidated，阻止旧版本被最终验收。生命周期事件记录调整为先 settled 事实、再同事务的验收/释放派生事件；旧运行证据保留原顺序，待新版本复测。

严格 JSON 字段名负例发现 Go 默认接受大写 TEAM_ID；已补精确键名检查。r5 doctor 在隔离配置目录执行共享 15 个有效/无效 fixture，均符合期望；证据为 `pi_squad_case/04-team-orchestration/integration/evidence/codex-config-cli-fixtures.json`，只证明 Go CLI 行为，不冒充 TS 或完整场景通过。没有运行单元测试。

迁移 CLI 集成又发现旧参数兼容器截断所有 `=value`，导致 `--dry-run=false` 实际仍预览；已修复为仅转换已登记的旧单横线参数。r6 真实 CLI 复测：dry-run 文件 hash 不变、无确认拒绝、有确认迁移成功、WAL 已提交记录进入备份、旧消息/squad/owner/撤销记录保留、迁移实例标离线、重复迁移拒绝。见 `integration/evidence/codex-migration-cli.json`；该隔离负例不代替实际 Pi 迁移/混协议全项验收。Pi Dashboard 同步补 waits/capacity/evidence 与旧刷新响应 generation 隔离，待 UI 场景验证。

多 Team 实测观察到 stats-team 与不相交 audit-team 同时准入、共享 reviewer 的 share-team 完整排队且不占 Role、Secondary 未替代 Primary。独立验收指出只存 blockers、缺显式 waiting_roles；r7 在 Run 中同事务持久 role/owner Team/owner Run/ownership revision，并同步 schema，待释放唤醒复测。TR-A08 保持 PARTIAL。

r7 真实复测观察到 waiting_roles owner/revision 完整，seq 1623 roles_released 后 seq 1625 share Run 准入并清空等待。r8 又封住 `serve --db` 对旧库的隐式升级：旧库启动需显式迁移产物、manifest hash 与备份，旧库原文 hash 保持不变；迁移后的隔离 Project 在 wJ:p3 可见启动成功，未挂 Pi。该子项证据不等于 P4-A06 整项通过。

wrong-sum 首轮没有覆盖返工：summer 的稳定 Role 规则要求真实求和，覆盖故障夹具而提交 60；reviewer 仅 dispatch_intent 后失租。对照现场在线心跳与代码发现本地冻结门释放遗漏：reportStopped 已把本地 Attempt 标 released，但 poll 的条件恰好跳过清门，导致后续注入被永久拒绝。已修复并给 `/squad transport` 增加脱敏 gate 状态，消息恢复会清旧错误状态；待安全 reload 后复测。

r9 同时修复 planned DAG 节点提前耗尽 deadline：未 accepted 不执行该截止时间，planned→accepted 时冻结 120 秒等待预算；显式已受理的排队任务仍受 deadline 约束。`review_rejected` 边可读取已完成 review 控制任务的结构化拒绝结论，保留业务候选的精确验收 hash 检查，不再要求 review 自身递归验收。未将首轮错误夹具当作通过。

独立控制面负例已记录：第二 Controller 被进程锁拒绝且 discovery hash 不变；CLI preview 参数含多个等号仍完整、无写事件；18 个旧写路由/握手/凭据负例均拒绝，前后 revision 与实体数不变。证据分别为 `codex-exclusive-controller.json`、`codex-cli-preview.json`、`codex-protocol-auth-http.json`，只覆盖对应子项。

r10 加固模型来源 scope：被活动 Run 持有的 Primary 或活动 Leader，即使当前没有 Attempt，也不能通过 root direct 借 Secondary 逃出 Team；Controller 根据持久 ownership/Leader binding 裁决，返回 ACTIVE_TEAM_SCOPE_CONFLICT。独立 operator 用户管理和已存在 standalone parent 的 scope 继承保持原规则，待运行子项验证。

## 恢复与完成判定的集成复测

r11 修复 LeaderStep retry 错误地按空 Role 寻找 Primary：改按 Team 查 Leader，仍要求旧执行停止证明、恢复与显式重绑。隔离 HTTP/SQLite 链先复现 r10 的 ROLE_NOT_SCHEDULABLE，再验证 r11 retry、Run resume、新 Attempt 的 retry_of 与旧历史保留。另修复完成提议的 revision 绑定：complete 后若收到 guidance，旧提议在 settled 时失效；新的 LeaderStep 必须重新判定并提出 complete。实际 HTTP 复测确认旧提议不终结，新提议 settled 后才释放 Role。

独立真实 Pi 返工 Run `run-9bf7a88fcbf4ec7722c657e7b000b139e89a66f1a53b8b9282c376ffb3b96a61` 在 r9 epoch=6 完成：sum=50 被拒绝，返工 sum=60 后重新审查 accepted，最终 completed/released。完整 Task/hash 见 integration/RESULT.md，旧失败 Run 保留。

隔离 Controller capacity=1 的 HTTP/SQLite 模拟覆盖父 yield、子澄清、父 response-only segment2、子答复续接、父 segment3、单租约、旧 segment 拒绝、proposed 与 settled 区分、父验收精确覆盖 child hash 及失效传播。证据 `integration/evidence/codex-http-boundary.json` 明确为 synthetic adapter，不能冒充真实 Pi；真实 capacity=1 验收仍由独立验收方继续。

r11 生产构建在可见 wJ:p3 启动，带有效 operator 凭据调用故障入口返回 404，snapshot revision 225 未变；证据 `codex-production-fault-isolation.json`。隔离实例确认没有未释放 Attempt 或活动 Run后停止，主验收 Controller/Pi 未受影响。生产构建、TS noEmit、diff whitespace 检查通过，未运行单元测试，全量验收仍未完成。

r12 补齐取消过期 Task 的最终 Gate 语义：跳过显式 cancelled 节点自身的结果义务，存活节点仍检查其依赖/refs，所有 Attempt 仍参加 cleanup 检查。HTTP 复测先保留依赖旧节点的任务，complete 被 GATE_NOT_READY 拒绝；再显式取消过期依赖，当前 accepted 结果可完成并在 settled 后释放。隔离实例停止前通过 views 确认未释放 Attempt/Run 均为 0；真实 Pi 验收继续，版本切换由验收方选择安全窗口。

r13/r14 补 Presence suspect 阶段与时间可观测性：心跳达到 timeout 标 suspect、2×timeout 标 offline，两者阻止新派发但不释放身份/资源；lease expiry 单独隔离。fake-clock HTTP 实测 +16 秒 suspect 时旧许可仍 admitted/pending，+31 秒 offline 且 lease_expired/needs_review，迟到 heartbeat 只恢复 online，不复活许可；人工声明合成 adapter 未注入后显式清理。doctor 的 configured_timing 与在线 snapshot.timing 实际默认参数一致，Agent 有 suspect_at/offline_at。证据 codex-presence-lease-http.json；本轮同样没有真实 Pi 或单元测试。隔离 p3 再次安全停止，临时凭据会话文件删除。

TR-A01 的初次 stats-lead-2/INVALID_LEADER 只是配置身份负例，不能算重复 Leader。改用同 Agent ID stats-lead、同 Team 的第二 Pi，在 r14 epoch=9 得到 IDENTITY_ALREADY_OWNED，原 Leader runtime 保持不变；但第二 Pi 仍只有 squad_run_create/agent_task_get，未退回普通工具。TS 已补明确拒绝后禁用 Leader 模式、恢复非 Squad 工具、普通输入不路由为原 Run guidance、停止动态 Squad prompt 注入；whoami 增加 disabled_reason/active_tools。实际 reload 复测尚待独立验收，失败证据保留。

独立真实 Pi 复测已确认第二 Leader 安全 reload 后退出模式：whoami 有 disabled_reason，工具恢复 read/write/edit/grep/find，管理 Run 返回 LEADER_MODE_DISABLED，普通输入只回复 ordinary，不调用工具、不读取原 Leader Run，原 runtime 不变。TR-A01 因其他子断言未全覆盖仍 PARTIAL；未声称恢复列表含 bash。counter 空闲 /new 保持 runtime/Primary，只改变 session，native 其余子项仍待测。

r15 加固旧会话请求来源：r14 HTTP 实测接受带旧 source binding、当前 heartbeat body 的 runtime 请求，说明只鉴权进程 token 会套用最新会话。r15 要求 runtime 请求头精确绑定，缺失/旧 session/旧 epoch 拒绝 BINDING_CHANGED；当前绑定 heartbeat/dispatch 正常，拒绝前后 snapshot revision 不变。TS 在请求进入时固定 source binding，串行工具回调检查发起 binding/Attempt/segment，失效旧回调不冻结新任务；Primary epoch 显式刷新时 heartbeat 同步 header。证据 codex-source-binding-http.json；真实 Pi 由验收方先安全 reload 再换 r15，尚待实际生命周期复测。隔离 p3 无未释放执行后停止，临时凭据文件删除。

隔离 HTTP/SQLite 故障窗口进一步验证：先在 task_before_persist 暂停，保证注入命中特定请求；transaction_before_commit fail 返回400且Task/幂等记录/event全部回滚，重试创建一份；transaction_after_commit fail 返回400但Task与幂等记录已提交，同键重试返回原Task，最终仍仅一份。证据 codex-transaction-windows-http.json，失败响应不当作“未接受”。合成目标一直 working，从未注入模型，取消排队任务后停止隔离Controller；不等于全部崩溃/磁盘满窗口通过。

TS 旧回调隔离同时避免迟到 heartbeat 响应覆盖新绑定：仅当请求 binding 仍是当前 binding 才应用响应；旧 poll 的失败只影响它原来的绑定，不冻结新会话。该调整通过类型检查，真实生命周期竞争仍待集成探针确认。

真实 capacity=1 澄清链的审计更正：独立报告曾因未找到 agent_clarify 事件而判断模型猜答案；但工具名不是 Controller 事件名，snapshot.events 仅保留最近200项。只读分页 /v2/events?after=7200 查得同一Run `run-15f1ed932769559c36730f2e9cf74d3a8cb436dca1ebce707b46a2c5c99b3824`：7528 clarification_requested，7538 clarification_response_ready，7551 clarification_answer（父segment2），7561 child continuation_ready（segment2），7576 parent continuation_ready（segment3）。精确GET Task/Attempt确认父counter与子summer均settled/released且归属正确Run；p7也展示父答复后的加数。原始分页与7511—7585事件段保存在 codex-real-clarification-events.json。已要求验收方保留并撤回旧错误判定，不将本链冒充全部P4-A13或阶段通过。历史审计应分页读取事件，不能用最近窗口的缺席推断工具未调用。

将实际事务窗口步骤整理为可复用 integration/transaction-windows.py（仅连接已可见启动的隔离Controller，不启动Pi、不属于单元测试）。r15真实执行两个窗口matched，合成runtime显式release返回200，任务取消、未释放Run/Attempt均为0；证据codex-transaction-driver-r15.json。输出使用新文件，保留旧失败历史，不写入凭据；README附使用边界。

修复 session_start 的工具能力基线：startup/reload 保存普通基线，/new 与 /resume 复用，避免把 Leader/Task 当前受限 active_tools 误登记为全部 available_tools。真实 r15 回归中，Leader 安全 reload/new 后 binding_epoch=2、runtime 保持，registered available_tools 保留 squad_run_get/squad_decide；Run `run-230e92b9a547926b82706e62dc73f253a47d0f4b1c9a6d36437de40cee3882b3` 得到 count=3/sum=60 与 reviewer accepted，最终 completed/released。此前长历史 Run `run-e7ed1e8ee4cfa9aca13a2c9243fe0b976b919c1b446b953ed19c36ffa45d93ce` 的权威中断是 seq9381 deadline，随后取消；pane 的 auto-compaction cancelled 不能单独证明压缩主动中断，失败历史保留。

Project发现与握手补测：Go CLI和生产TS TeamClient实际连接可见隔离r15服务，正确canonical/alias可读snapshot；嵌套最近根、另一Project、错误project/protocol/controller/epoch及失效端口均拒绝。正常shutdown删除discovery；保留精确旧文件后，由不相关HTTP服务占据原端口，两客户端仅health后拒绝，未访问snapshot/写入口。证据codex-discovery-clients-r15.json，F/E边界，不冒充Pi模型运行。服务停止且人为旧discovery已删除。

P4-A03代码核对发现首次Controller连接失败时，Leader仍留受限工具且普通输入触发失败的snapshot。现仅在尚未发起注册、无历史session/binding/current时退回普通Pi并一次告警；已注册或注册请求结果不明仍隔离。whoami显示disabled_reason，修复服务后reload重试。USAGE同步，TS类型检查通过；真实Pi负例由独立验收继续，不能用静态检查宣称通过。

r16严格Project容量：实际r15 doctor接受配置1.5，Viper GetInt静默截断违反正整数契约。改为对合并后的配置值精确解析，r16实际CLI覆盖文件的1.5/0/-1/bool/非法字符串/2、环境的1.5/4、flag的1.5/4共10组均符合预期；证据codex-config-capacity-integer.json保留r15失败。生产和集成构建通过，主现场仍r15（合法整数配置），下一安全窗口切换，无单元测试。独立验收现将P4-A01/A02/A13标PASS，OpenSpec任务2.2据此完成；全阶段尚未通过。

r16隔离HTTP/SQLite验证amend与重复结果：运行中接受新goal_revision但仅安全segment续接时应用，旧结果不完成新要求且保存superseded历史；同Attempt segment2提交新结果完成，同键结果/settled重放不重复写，同键异内容409。最终两版不可变历史、一个当前结果；证据codex-result-replay-amend-r16.json附实际driver，未启动模型。合成runtime释放200、未释放Attempt/Run均0，隔离Controller已停止。

补齐配置/迁移证据：r16 doctor额外16组覆盖direct名单、重复声明/目录ID不符、非法acceptance/JSON/YAML与不解析旁路文件，sidecar hash不变。已有显式迁移产物可见启动r16；对照备份/迁移agent行，保留旧scope/session且last_seen重置1970，v2实例为空。旧写与混协议23组全部拒绝、revision/旧行不变，随后停止隔离服务。证据codex-extra-config-cli-r16.json及codex-migrated-protocol-offline-r16.json，交独立验收按P4-A04/A06原判据裁决。

真实三层链后续Run `run-14c1193e6e824c61536888d86f3e20b7ab133213e5c75e062c0fd3a643c4dab5` 的counter仅dispatch_intent后失租，未到/new验收。代码定位旧suspended本地current的释放检查只在gate.frozen时执行；operator对账释放但本地未frozen会永久挡新Attempt。TS改为所有保留current都先查远端cleanup，released且local idle/no pending才清门，仍busy则保持门且不误abort可能的新普通轮次；异步响应须匹配原binding/current。类型检查通过，待真实安全reload后的直接reconcile→新Task回归；不把/new标通过。

独立验收确认清门缺陷对应关系：reload前counter frozen=false/generation10、local current=`attempt-1e699a86215b783341deb202b7eedf64288832ec2f312aece3b5d4b7389e393f`且cleanup=pending，而远端seq12349已interrupted/released；随后新Attempt seq12364仅dispatch_intent、12422失租。证据codex-gate-stale-current-r15.json保留；直接无reload复测正在进行。

清门直接真实回归通过：attempt-871caf4e在suspended/pending时operator reconcile（seq13217）后，counter local current清空、generation仍11，未reload；同runtime新attempt-50202f4f的13266dispatch_intent、13270adapter_received、13272input_observed、13299settled/released完整。证据codex-gate-reconcile-redispatch-r15.json，不冒充/new传播通过。独立报告更正summer只确认发送reload，未见加载完成证据；后续需先确认，不按已加载假定。

P4-A17并发缺口补证：隔离r16用task_before_persist暂停第一事务，令amend与settled两条HTTP都在途。amend先时seq313→314 superseded→315 settled，旧结果不能完成新要求，segment2再完成；settled先时seq328完成，amend因旧revision冲突拒绝且无amend事件。证据codex-concurrent-amend-settled-r16.json，两个方向均匹配，合成runtime释放200、无未释放执行后停止。

最新真实/new窗口未通过：summer第二次reload确认实际加载；run-97fee8c的leaf先seq14402 settled，再seq14404注册新session，没有中断/祖先传播。读本机Pi 0.87.1 agent-session-runtime确认before_switch→await abort/agent_settled→session_shutdown；插件原先到shutdown才中断，settled可能抢先清current。现prepare后延后一轮事件循环确认settled，让实际shutdown先interrupt并回报idle停止；取消before-hook仍可正常settled，不在before事件直接持久中断。类型检查通过，真实相同窗口由独立验收复测；TR-A29仍未通过。

r17预算修正有真实HTTP边界证据：standalone规范是每root最多20child，原SQL包含root导致第20child拒绝；排除root后20接受/21拒绝。Team预算仍含全部业务Task，root+19child后拒绝；两scope各3个不同Attempt后第4retry拒绝。另8项验证self/ancestor/dependency cycle及depth4拒绝无半记录。codex-child-budget-r16.json保存旧失败，r17成功分别存child-budget/team-retry-budget，call-boundaries-r16存循环/深度；均无Pi/model、不冒充真实递归。隔离资源清理为0并停止p3，主现场未重启。

真实/new修复复测：codex-new-ancestor-r15b.json记录reviewer安全reload，run-fa422e1的leaf attempt-4637f81b先seq15790 interrupted(session_changed)，后seq15792新session注册；summer/counter两祖先均dependency_interrupted，旧Attempt released、新session无current_task。独立判TR-A29 PASS，旧失败仍保留，P4-A15仍PARTIAL待fork/tree/resume等子项。P4-A13与P4-A17已分别独立PASS，任务5.11受理/应用amend与capacity1澄清续接据此完成（7/71）；其余有关原生命令的任务不提前勾选。

r18仅增加ownership INSERT后测试构建故障点（生产为no-op），补足中途整组回滚窗口。隔离HTTP并发证据codex-atomic-admission-r18.json：capacity4；写入一项后失败不留下Run/owner/Attempt、revision不变；同键重试成功。交叉roster并发只一组完整获得占用，另一组全排队，不相交gamma仍可准入；重放不重复、release后恰一次admission。6项matched，未释放资源0后停止p3；主现场仍r15，真实fork在独立验收进行。

写预约/多blocker隔离HTTP补证：文件别名、目录包含和父子同锁拒绝，不同资源并行；越界symlink、nested Project与真正Project内控制路径均拒绝；同Task agent_affinity/write_conflict并存时第三分支可运行。amend后两wait保留，0.46秒内刷新revision；解除写owner只清写wait，agent affinity保留，最后owner释放才派发。首次即时revision断言在调度tick前读取而失败，保留r18原证据，r18b在2秒观测窗口通过。无真实Pi写工具，不作为CMD-A09证据，隔离p3已安全停止。

身份竞争HTTP补证codex-identity-races-r18.json：并发首注册唯一Primary；重复Leader无论online/offline均不能夺权；release后保留Primary空位，新注册仍Secondary；同revision并发promote仅一项成功，旧binding拒绝。Leader显式release后换runtime成功，旧凭据拒绝，实际binding历史/撤销行保留。9项matched，无Pi/model，不替代真实身份轮次，fake clock已复原、隔离p3停止。

用户再次强调执行顺序：不写、不跑对应单元测试，先完成开发，再整体集成。此前独立HTTP/SQLite证据属于运行Controller的集成检查，但拆分过碎；现停止扩展零散夹具，集中既有多Pi整体流程，实际阻塞先取证、修复后针对原场景复测。隔离p3已停止；已向独立验收同步，不继续盲目新建相同失败Run。现有证据保留，不因节奏调整改写通过状态。

真实fork批次停止后只读核对：run-e37a9e4 Leader attempt-c785834c后续seq17166 interrupted(deadline)、17167 adapter_stop_confirmed，Run needs_review；counter仍suspended，summer未能获得capacity。stats-lead pane上下文88.4%，显示Auto-compaction cancelled及operation aborted；不能凭pane断言自动压缩主动中断，权威原因是deadline。证据codex-fork-leader-deadline-r15.json关联原stopped报告，无新夹具。已交独立验收先收尾旧Run、确认实际idle后Leader安全/new，再只复测一轮fork，保持120秒；检查fork填回的旧编辑草稿避免误提交普通输入。fork仍未通过，r16—r18 HTTP证据尚未经独立裁决。

单轮fork复测253b36仅验证selector esc无中断，实际选择前child已settled，仍不算fork通过。后续代码定位已有result_after_commit_before_settled暂停点处于Invocation.serial内，renew也排同队列，暂停会阻塞续约并使leaf lease_expired污染场景。修为结果HTTP完成/本地Attempt更新并释放serial后暂停工具返回；生产入口不提供暂停实现，语义仍是result提交后、工具完成/settled前。类型检查和diff检查通过；继续现有真实Pi三层fork集成，先安全收尾/确认reviewer reload，不新增夹具或单测。

真实fork窗口确认：codex-fork-paused-child-r15.json记录run-72ede11，reviewer结果暂停时seq18179/18197/18215等续约持续、未失租；suspended summer实际fork后seq18228 session_changed，counter seq18227 dependency_interrupted(owner=session_changed)，summer新session seq18231且旧Attempt释放。解除暂停后child seq18276 settled，父及祖先未前进，Run保持needs_review。证明暂停点移出serial后有效，也补实际fork子项；P4-A15仍需tree/resume等，不整项提前通过。


## 再次 apply：开发缺口核对（2026-09-27）

用户再次明确先完成全部开发，再整体集成；不新增或运行单元测试。本次只执行源码核对、Go 编译与 TS 类型检查，未启动新 Controller/Pi 夹具。OpenSpec 当前 7/71，未将仅编译的工作勾为验收完成。

- M5/M8：原 autocomplete、命令参数与 Picker 各取不同角色数据。现在共用按 Project、Team、Run、config hash、generation、epoch、revision 键控的角色投影，展示 Primary、presence/activity、owner。Picker 保留中途编辑的草稿，终态 Run 不提供 roster；管理子命令补上身份参数补全。
- M8：TeamClient 原来虽未缓存较旧快照，却仍将该响应返回调用方。现在返回最新缓存，并在 epoch 变更清缓存；并发 discovery 加 generation 隔离。Pi Dashboard 断线后只读 rediscovery/resnapshot，跨 epoch 重置选择，不触发执行恢复。
- M2：CreateTask 原来源 scope 检查只对 model/runtime 生效，显式 Pi operator 命令能绕过。现在所有带 Pi binding 的根调用均核对活动 Team/Task scope；独立 CLI 无 Pi binding 的管理权限保留。完整来源 binding 已由事务 replay 校验，无需重复添加 handler 校验。
- 检查：`go build ./...`、生产与集成 TS 的 `tsc --noEmit` 通过。上述改动尚无运行验收证据，不改 RESULT/cases 的 PASS/PARTIAL。
- 环境续接：Herdr 中原测试 workspace wJ 已不在列表，wB:p1 未识别为运行 Agent；停止消息返回 agent_not_found，不能记为已交付。后续整体验收须重新核对当前 workspace/Agent/Controller，不能沿用旧 pane 地址或假定旧进程已安全清理。


## 开发优先与直接验收

用户再次明确先完成 spec 全部开发，再统一检查；最终由 Codex 直接验收，不再交给 Claude。新 handoff 02 因 pane 关闭未送达；短暂启动的 wK 测试现场已关闭，未提交 Run/模型任务或运行验收场景，不增加通过项。开发继续，不运行单元测试。源码补齐 autocomplete 失败回退的 generation/Run/取消隔离，防止 fallback 迟到响应污染新上下文；tsc 类型检查通过。r19 集成二进制已构建，但不代表运行验收。


## 投影与读取身份开发补齐

继续遵守先全部开发后统一验收，不启动测试现场、不跑单元测试。本轮对照 TR-10/P4-A02/A26 补齐：

- Role 配置按内容 hash 保留不可变修订，投影合并配置、Primary、ownership 和 Team roster；尚未注册 Primary 的已占用角色不再从观察面消失。发现配置不建立 Primary tombstone，不改变首次注册资格。
- 补全 cache 加 observed_at；同 revision 的 snapshot 按观察时间拒绝倒退，避免基于时间推导的 presence 被旧响应覆盖。空 Primary 显示 unassigned。
- Go TUI 在 epoch 变化时清选择/详情，在行数变小时修正选择；Go/Pi Team 列表显示嵌套配置中的 Team ID。
- 带握手身份的 v2 GET 校验 Controller ID/protocol，SSE 客户端也带同一身份，防止旧端口被另一同 epoch Controller 复用后误读。公开未绑定查询/health 保持发现入口。

Go build、TS noEmit、git diff --check 通过；上述是代码开发证据，仍待统一运行检查，不勾对应任务、不新增 PASS。


## 原生会话与异步回调开发补齐

继续只开发，不启动运行验收。按 P4-A39/TR-A29 的旧回调隔离契约核对 Invocation：原 poll 仅部分分支校验 binding，inbox/heartbeat/dispatch 迟到返回可能在新会话继续处理；serial 在排队时没有 generation fence，生命周期响应也仅按 current 引用更新。

本轮为 poll 固定 context/session/generation/binding，所有异步入口返回后复核；仅合法 Primary epoch 刷新更新本轮 binding。serial 排队和事件返回都复核 generation/segment/binding，旧响应返回 STALE_LOCAL_CALLBACK，不冻结新工作。输入故障窗口结束后复核原上下文，不给新 Attempt 发送旧 input_observed。reportStopped 在远端读取后再次核对精确 session/segment、idle/no pending，返回后仅更新仍匹配的本地 Attempt。

`tsc -p /tmp/pi-squad-typecheck.json` 与 `git diff --check` 通过；没有单元/集成测试，没有新增验收 PASS。后续统一验收须覆盖切换发生在 heartbeat、inbox、renew、ACK 和 stopped 读取中的各窗口。


## 取消与恢复开发边界补齐

仅源码核对和编译，仍未开始新验收。取消递归现在重新读取事务内 Task，避免 Run 遍历旧列表时再次覆盖已取消子项 revision；取消清该 Task 自身 blockers/wait_edges。单独取消 child 向等待祖先传播未完成，覆盖 standalone 无 Run 的等待链；Run 整体取消保留自己的收尾路径。

rebind 仅允许非终态 accepted 且有冻结 target、从未有 Attempt 的 Task，不允许把 planned 直接变 accepted。恢复审计增加精确 old_binding/new_binding（task rebind/retry、Run resume）。已 released 的 cleanup/reconcile 不重复发布释放事件，也不把已完成执行改成人工中断。

`go build ./...`、`git diff --check` 通过；未运行单元测试或集成验收，任务与89项状态不因编译而改判。统一验收需覆盖取消树 revision、standalone child 取消传播、planned rebind 拒绝及重复收尾事件。


## 验收覆盖与最终 Gate 开发补齐

源码对照发现 coverChildren 仅检查父旧 acceptance/result hash，没有检查父子 completed、blockers 和 acceptance goal revision；父被中断后仍可能沿用历史覆盖。现要求父子当前版本均正常完成，失效清理发布 acceptance_invalidated；中断上行、amend/retry 与 cancel 在同事务重算覆盖，不等待下次tick。

finalGate 原来无条件跳过带 superseded_by 的旧候选；现跟踪同scope的rework链，防环且校验rework_of，最终替代结果须当前completed/accepted且goal/result版本匹配。其它候选继续按原Gate验证产物和依赖。数字checker再次核对实际读取字节的artifact hash/length，拒绝非有限数字和合计溢出；validateArtifacts检查打开的文件为regular。

Go build 和 diff检查通过；只开发，不运行单元或集成测试。新增边界统一留待最终验收，当前不改变OpenSpec任务勾选或cases结果。


## 命令与 mention 开发收口

对照 TR-12/TR-13 与 P4-A21/A22/A24/A38：parseHandoff 原来只接受 Role 后空格，直接换行会变普通输入；显式role内含路径也会被文件fallback提前接走。已支持多行分隔并优先拒绝非法显式ID。已识别但不在Run roster的Role明确拒绝，不回落LLM；普通文件先本地分类，不因Run结束/查询失败误作交接。call/ask/管理命令增加选项白名单、重复/缺值/多余参数拒绝，leader promote明确拒绝。

关联call在读取parent后复核generation/binding/current/run；use-run及input读取后复核原上下文，迟到返回不选新Run、不将旧用户输入发送到新任务。RUN_TERMINAL仍明确报错并清选中上下文。

类型检查与diff检查通过；未启动Controller/Pi、未运行单元或集成验收，没有新增PASS。


## 工具执行队列与开发收口表

受管write/edit原来在操作回调中读取当前gate，旧调用等待文件队列后可能借用新任务权限。本轮每次execute固定发起fence，保留Pi原生withFileMutationQueue，在实际操作和返回前复核；read/grep/find及clarify/invoke/decide响应也隔离旧执行。没有承诺回滚已发起系统调用。类型检查和diff检查通过，无运行验收。

新增 `pi_squad_case/04-team-orchestration/IMPLEMENTATION.md` 映射18条需求的源码入口并列出剩余开发核对步骤；文件存在不表示完成，仍须连贯核对后才开始统一验收，不改变71项任务或89项结果。


## 中断幂等与SSE开发补齐

`/agents/interruption` 原handler丢弃request_id，现用Interruption类型并接入同事务replay/remember，同键重试不重复中断/祖先revision。schema导出新增interruption、stopped_evidence、clarification、decision、message_receipt，运行schema代码生成更新协议文件（无Controller/Pi启动）。SSE重连先discovery+snapshot，批次失效后resnapshot再唤醒，防旧cursor跨Controller；snapshot缓存同时比较Controller ID/epoch，拒绝另一同epoch服务的迟到响应。

Go编译、TS类型和diff检查通过，无单元或运行验收。能力与管理入口仍在开发核对，未宣称所有开发完成。

## 管理预览与能力检查开发补齐

Dashboard 原来仅有 cancel/recover/promote，现补 Role/Leader release，保持显式预览和提交；提交固定 snapshot 所属 Controller ID/epoch 与本地 binding/generation/segment，防旧预览借新上下文发送。管理命令异步读目标后也复核上下文；Controller 继续按 expected_revision 裁决。能力清单补实际使用的 agent_before_settle，检查在 registrationStarted 之前执行，使首次启动缺能力恢复普通工具而不留下半激活。

Go build、tsc noEmit 和 diff 检查通过；未新增或运行单元测试，未启动验收现场，没有新增验收 PASS。

## 核心能力探针证据关联

ReadProbe 原实现将整份报告里任意 input/section/provider/settled 合并为 ready，可能跨会话或模型轮误判。现仅以有序的 extension input→任务 section→对应 Task/Attempt/segment payload→before-settle→idle且无pending settled 链判核心观察成立；session生命周期、真实tree变化、user_bash重置未完成链。输出首尾seq和执行身份，旧报告缺关联字段不会判ready，保留 scenario_acceptance=NOT_EVALUATED。

这是探针开发修复，Go build 与 TS 类型检查通过；没有运行单元测试、探针或统一验收。

## 命令参数与操作矩阵核对

补齐只读/管理命令参数数量、目标类型和操作组合检查，逐操作限制 flags，拒绝重复 evidence 别名和未闭合引号。amend 的正文不再误作 preview；send 目标查询和 run 返回后增加旧上下文隔离。Go CLI 和 Service 共用操作名称校验，CLI 不再生成不存在操作的预览。

Go build、tsc noEmit、diff 检查通过；未运行单元测试或运行验收，不新增 PASS。

## 调度主链源码核对

连贯阅读Run准入、Task派发、Attempt事件、续接和cleanup路径，核对事务内许可与释放顺序。修复Tick/resumeReady批量读取后使用旧Task的问题，以及绑定失效/Attempt预算耗尽缺少祖先失败传播的问题；开发收口表增加路径级记录及待运行证明。另纠正前轮probe的segment_id类型：生产为正整数，不能按字符串读取。

Go build、TS类型及diff检查通过，没有运行单元或集成验收；全量开发仍未完成。

## Task准入与Leader/Gate源码核对

核对principal、replay、Task准入、Leader决策、引用与review和finalGate。补端点scope一致性和父Run冲突拒绝，refs准入格式/重复/跨scope检查、重复依赖拒绝；依赖与引用校验包含当前goal revision和blocker，review自审和预算失败向祖先持久传播。

Go编译通过；一次在仓库根执行build因无module失败，改到controller后通过。没有运行单元/集成测试。协议、USAGE和开发清单已同步，整体开发仍待剩余核对。

## 配置与工具生命周期开发核对

补齐工具gate的Attempt状态、cleanup及非法租约时间拒绝，路径解析非ENOENT错误不再被当缺文件；Go Project发现改为Lstat检测损坏symlink，Go/TS权限错误不向上回退。核对native事件行为与当前spec：suspended纯compact保留快照，实际历史变化/user_bash中断，自动compact不新建Attempt。

生产Go、integration构建和TS类型检查通过，未运行单元或集成验收。开发收口表第1、第3项源码核对完成，剩命令/协议/文档一致性和最终构建汇总；OpenSpec任务和场景结果仍按实际证据保留。

## 本轮开发收口，转入统一验收准备

完成命令/HTTP/schema/USAGE核对，补heartbeat/instance/snapshot导出和说明歧义；四项开发核对闭合。生产Go、正确pisquad_integration标签构建、TS类型检查通过。之前integration标签不启用故障实现，本轮已纠正。新增development-build.json固定源码/schema/二进制hash；r20供后续Codex亲自验收，尚未启动新现场、不新增PASS、不跑单元测试。

## Codex r20统一验收开始

新wM真实三Role+Leader、独立Controller/Dashboard正常数字流程完成；TR-A21复测PASS，保留r2失败。Worker区间重叠、独立review精确refs、Leader settled119在释放120之前，独立文件count3/sum60/hash一致。counter probe真实链通过doctor核心观察，但P4-A39整体未判通过。其余89项继续验收，无单元测试、无Claude派发。

## r20返工复审通过

真实wrong-sum流程sum50被拒绝，独立返工sum60再经reviewer接受，旧结果及替代链保留；角色ownership期间不释放，每次执行独立lease，Leader settled后最终释放。TR-A18/TR-A22 PASS，P4-A33仅新增子项证据，整体仍PARTIAL。

## r20单额度父子续接

测试Controller确认清理后以Project capacity1/epoch2重启，Pi自动恢复在线。真实父counter→summer child→原Attempt segment2续接及parent覆盖通过，Run最终释放。TR-A27/CMD-A11/P4-A13仅增子项证据，未验standalone/澄清/无关任务竞争；Team仍4，不冒称Team容量1通过。

## r20澄清第一轮失败

Team与Project容量1，无关counter任务被affinity阻挡；Leader自动压缩期间父子任务120秒deadline到期，澄清未完成。保留pane/事件/快照，显式取消并记录cleanup；P4-A13/P4-A31仍未全通过，下一轮新Run复测。

## 再次确认开发与验收顺序

用户再次确认：先完成 spec 全部需求开发，再统一检查；验收由 Codex 本人负责，不交给 cc/Claude。开发期间允许必要的构建、类型检查与静态核对，完整运行验收放在开发收口后；不将开发完成等同于验收通过。既有运行结果和失败证据保留，不因顺序确认而重置。

## r20双容量1澄清与竞争复测

P4-A13真实复测通过：父原Attempt三segment，child澄清/yield→父受限答复→child续接→父完成，无关同Agent任务在父settled后才派发；事件核算最大执行并发1，payload工具仅查询和澄清答复。Run仍未通过：reviewer夹具只允许文件60，错误拒绝任务30；保存拒绝后安全取消，修正fixture范围并将Team版本升为15，完整Gate待复测。不改生产代码，不重置旧失败。

补充：version15第一次复测实际context已刷新，但role.md与新agents.md仍冲突，review仍拒绝30；保存clarify3失败后取消释放。修正role.md正文并/reload，clarify4新Run复测中。

clarify4父子完成30，Leader重复等待文本但不settled，review留队；显式取消后released，保留模型重复输出证据。完整Gate仍待新Leader会话复测，不将P4-A13执行链通过扩展成整个Run通过。

## 多Team准入实测与Run查询补齐

r20 epoch3 Projectcapacity4下，A整体角色占用，B共享reviewer整体排队，C不相交先完成，A释放后B单次准入；Secondary普通对话未生成Attempt。TR-A07/A09/A10/A11/A20复测通过，P4-A34仅取消排队子项通过。B Leader依据旧任务状态wait而停留planning，记录失败，未掩盖。

r21修复`squad_run_get`仅返回Run而无任务图的缺口：从一次新snapshot输出任务状态、结果、验收、blocker和Run CAS revision，复用有界内容预览。类型检查通过。B经显式guidance读取新工具后complete/released；新Run继续验证无追加guidance路径。r20证据与manifest保留。

澄清第五轮父子执行完成，reviewer查找正式答复超时；安全取消并保留失败，完整澄清Gate未通过。

r21新Run通过：真实Leader查询最新任务图后complete，无追加guidance，只有count和LeaderStep两个节点，最终released、capacity空。证据fresh-run-status.json；旧r20失败保留。其余空闲Pi同步/reload后继续后续场景。

## r22父子调用与r23Pi界面验收

standalone父子调用保持null Team/Run，在原Attempt segment2续接；独立产物验证与显式human父验收覆盖child。首轮fixture错误使用agent:前缀保留，工具说明补裸ID。Team counter调用reviewer child、yield、续接及最终review/释放通过。TR-A27/CMD-A11与既有P4-A13共同证明任务5.5，OpenSpec勾选为完成。

Picker无歧义时应填@Role，原来始终@role:与CMD-A03不符，已修正并实测。CMD-A01/02/03/04/05/13/14/15/16、P4-A21具备真实Pi与控制面证据；旧草稿在Run终结与角色换owner后拒绝、原生文件补全保留、无上下文不隐式创建Run。P4-A23已有草稿和迟到响应尚未验收。

35/89主ID通过，24部分、30未执行；任务8/71完成。测试临时文件已清理，所有Run释放、无活动租约。全量目标未完成，不委派cc，不运行单元测试。

### r23 写入并行与独立阻塞证据收口

write-check 两个正式 Task 分别以 edit/write 修改 a/b，事件区间6772—6850与6775—6830重叠。write-locks 的6个 execute Task均checker accepted，Run completed/released；完整事件、最终pane及独立文件hash已保存在 `integration/evidence/r23/write-cases.json` 及其相邻证据。TR-A24通过：counter在7376—7437推进；nested任务解除agent占用后仍受write_conflict阻塞（7519），目录任务settled7613后才于7627执行。相同Agent串行、别名和目录互斥已有真实证据，但TR-A31仍缺运行中reservation表直接观察，CMD-A09工具/session探针与P4-A37边界证据整理仍未收口，不扩大为通过。三处越界sentinel独立核对未变后清理，成功写入产物保留。当前36 PASS、27 PARTIAL、26 NOT_RUN；无单元测试，整体验收未完成。

### r23 写入验收补齐

CMD-A09、TR-A31、P4-A37补齐后PASS。CMD-A09-write.json记录前后相同runtime/session/binding及真实provider工具集合，backend实际edit、frontend实际write，均无bash。reservation-live.json直接记录frontend执行lease与目录write reservation相同Attempt/fencing=101，backend子文件任务仅write_conflict且无Attempt。解除暂停后两任务accepted；Leader经历真实auto-compaction后仍completed/released，最终两表为空（reservation-released-tables.json）。原write-locks事件证明同Agent串行/别名及目录互斥，write-check证明不同文件并行；三处越界请求HTTP400、未建Task，sentinel未变。OpenSpec 4.6勾选，当前9/71；89项为39 PASS、24 PARTIAL、26 NOT_RUN。没有运行单元测试，整体仍待其余验收。

### r24 命令帮助与旧别名一致性

实际Pi发现help只有命令名和少数参数，旧alias忽略多余参数。已补齐所有现有入口用法、管理预览及operator轮换说明；alias转交参数给同一handler。tsc通过，wM:pC真实验证help、root/Role/Run补全、三个旧alias；alias和canonical多余参数均INVALID_ARGUMENTS，快照无新增Task/Run、无模型轮。P4-A24 PASS，证据integration/evidence/r24/P4-A24.json。其余10个空闲Pi已/reload并逐pane确认，Controller仍r20/epoch3。当前40 PASS、24 PARTIAL、25 NOT_RUN；OpenSpec仍9/71（6.1其它子项尚未通过），整体未完成，无单元测试。

### r24 Dashboard同revision与观察退出

Pi原生Dashboard和Go TUI在epoch3/revision9929展示相同reviewer Primary/Secondary/owner字段，在revision10028展示同一Task的checker accepted及result_hash；均实际使用筛选、列表选择和详情。当前加载项仅adapter-entry.ts与pi-probe.ts，前者只为生产installTeamExtension添加时钟/故障点，无Herdr adapter；Herdr仅充当终端宿主与外部查看工具。Pi退出回空编辑器（0.0%上下文），Go TUI退出到zsh，Controller pid50968/epoch3及11个Pi保持，随后重新打开同Controller的Go TUI。CLI缺revision及非法run:retry均拒绝，agents list成功返回revision10264；无新增Task或人工中断事件。证据r24/dashboard-cases.json。P4-A25/P4-A38 PASS；9.1勾选，OpenSpec10/71，当前42 PASS、22 PARTIAL、25 NOT_RUN。TR-A17尚需完整Team/Agent/owner/blocker视图，未因两项详情通过扩大结论。

### r24 Primary等待队列上限与串行

真实counter-main standalone root在result后/settled前暂停。通过可见operator pane逐个CLI提交32个root Task，均queued且无Attempt；第33请求HTTP409 QUEUE_FULL，最终快照无该Task。取消其中31个，只保留第一个queued任务，其agent_affinity wait保留，未取消无关root。解除暂停后root输入/settled区间10478—10786，后继10799—10839，同Pi无重入；两个执行结果均来自实际read，独立核对count3/sum60。最终capacity/waits均空。证据r24/TR-A14-queue.json及原始CLI/pane/events；两Task仅执行completed，无acceptance，不冒称业务验收。TR-A14 PASS，P4-A10/P4-A16分别补充仅清自身wait与queued取消子项，其余仍PARTIAL。当前43 PASS、22 PARTIAL、24 NOT_RUN，OpenSpec仍10/71，无单元测试。

### r24 FIFO、queued handoff及r25按键修复

stats-team占共享reviewer期间，share-team的两个Run整体queued_run，queue_seq21/22；相同request重复提交返回同一Run。用户从reviewer-secondary Pi选中第一queued Run提交@reviewer，正式Task queued但无Attempt，无绕过ownership。事件顺序：owner释放11361→first准入11364→first释放11456→second准入11458→second释放11555，三Run全部completed/released，handoff checker accepted。TR-A33/CMD-A07 PASS；P4-A08仅重复request/FIFO子项通过，Leader离线/重绑等仍PARTIAL。夹具初次断言误用queued而非queued_run，未重复提交变更，已记录。证据r24/fifo-cases.json。

继续观察时发现r24 Pi Dashboard原始ANSI比较不识别方向键（j/k可滚动）；改为Pi matchesKey解析up/down/tab/enter/escape/backspace。r25真实方向键选择/详情上下滚动、Tab、Enter、筛选Backspace和Escape退出复测通过；保留P4-A25旧失败子项并附修复结果。tsc通过，USAGE同步，11个idle Pi已加载当前扩展，Controller仍r20/epoch3。当前45 PASS、23 PARTIAL、21 NOT_RUN，OpenSpec仍10/71；未运行单元测试，整体未完成。

### r25 Primary离线路由

确认无活动Run/lease后，仅SIGSTOP测试reviewer-main Pi pid42407，等待权威presence=offline；reviewer-secondary仍online且未提升。share-team Run可持有逻辑roster，但即时@reviewer接受须目标online，真实Pi返回ROLE_PRIMARY_OFFLINE并保留草稿，没有业务Task/目标Attempt，唯一新增Task为LeaderStep。显式取消测试Run并确认released后SIGCONT同一pid；恢复online，runtime/session/binding/primary epoch全部保持，capacity空。CMD-A06 PASS，证据r25/CMD-A06.json。

夹具第一次误断言“成员离线必须queued_run”，核对需求TR-06/TR-10后确认：Run创建检查Leader在线，Role ownership是逻辑归属；planned→accepted/即时handoff时检查成员在线，二者不可混同。此断言失败未重复提交Run、未修改产品实现，已保留记录。当前46 PASS、23 PARTIAL、20 NOT_RUN，OpenSpec仍10/71，无单元测试。

### r25 working_here、Leader正式调用及无Skill路由

share Leader先输出文字“@reviewer 这只是文字示例”并wait，权威snapshot只有完成的LeaderStep，无业务Task。用户后续普通guidance触发新的LeaderStep，原生JSONL确认唯一squad_decide dispatch创建leader-count正式Task。该Task result_proposed暂停期间，reviewer-secondary的@reviewer同Run handoff接受为queued、无Attempt，ownership仍同Run；解除暂停后两执行区间12723—12878、12894—12950不重叠。两项checker accepted，Run completed/released。调用方无模型轮/native session文件，目标完整原生会话无SKILL.md读取，正式Router不依赖预先加载Squad Skill。CMD-A08/A10/A12 PASS，证据r25/working-here-cases.json及native/probe/pane/events。

OpenSpec6.4所有关联CMD-A01/A02/A05/A06/A08现已通过，勾选后11/71。当前49 PASS、23 PARTIAL、17 NOT_RUN；未运行单元测试，剩余恢复/故障/身份/上下文子项继续验收。

### r25 准入与首次派发事务回滚窗口

在真实r20集成构建、真实Pi空闲环境，经operator故障接口分别注入ownership_acquire_each及ownership_after_acquire_each失败。两个创建Run请求HTTP400 INTEGRATION_FAULT，SQLite已提交Run/Task/Attempt/ownership/lease/write reservation及queue_seq/fencing均前后相同；无部分角色占用，无返回已接受。另将首次LeaderStep派发停在dispatch_before_intent，注入transaction_before_commit失败，并在下一次dispatch重试前再次暂停；确认已有Run的两Role ownership不变，而LeaderStep/Attempt/lease/fencing增量全部回滚。所有故障reset后只创建一个正常LeaderStep/Attempt，真实share Pi完成wait；显式cancel Run后released、capacity空。

证据r25/ownership-rollback.json、dispatch-rollback.json和transaction-cleanup.json（含可见pane与驱动源码）。这些是故障点诱发的事务回滚，不冒称真实磁盘满；P4-A11/P4-A19仍PARTIAL，容量/写冲突组合及其它窗口未扩大为PASS。当前49 PASS、24 PARTIAL、16 NOT_RUN，OpenSpec11/71，无单元测试。

### r25 两Run并发整体准入

两个HTTP CreateRun请求实际重叠17.874792ms。share-team获queue_seq26并完整持有researcher/reviewer；stats-team获27且整体queued，SQLite无其任何部分ownership。share释放14025之后stats仅准入一次14028；每个Run各一次run_admitted/roles_released，两个真实Leader均只执行wait。最后显式取消两Run并确认released、capacity空。TR-A12 PASS，证据r25/TR-A12.json；此轮没有重复迟到role_available/gap注入，不计TR-A25通过。

为隔离准入与业务工作，stats-team测试config21临时无default_workflow；收尾后恢复原default_workflow=stats并升级config22，旧Run保留各自不可变快照。当前50 PASS、24 PARTIAL、15 NOT_RUN，OpenSpec11/71，整体尚未完成；未运行单元测试。

### r25 实际provider动态块隔离与reviewer显式恢复

增强只读pi-probe：从实际provider payload的system/developer文本解析pi_squad动态块，仅保存Role/Team/Run/Task/Attempt/segment、内容hash与工具集合，不保存原始prompt/凭据。恢复后的同一reviewer历史session先执行share-team count，再执行stats-team sum；六次真实请求各仅一个当前task系统块，全部身份/role_hash/working_hash/config_hash与Controller Attempt.context一致，role/working/team正文hash逐项独立一致。TR-A30 PASS，证据r25/TR-A30-payload-checks.json，作用域仅上下文隔离。

第一次启动检查发现wM:p6已是shell（退出原因unknown），/reload及此前/squad-probe-save未执行为Pi命令；首个context Run的业务Task保持planned无Attempt，已取消释放。确认无执行占用后显式release旧runtime，再用--session恢复同一历史会话；新pid68043、runtime31c44abe-f226-4b0c-b336-65db12d34378、binding_epoch2、primary_epoch1。TR-A16仅此子项PARTIAL，旧凭据写入及Leader重绑未验。发现working-here-reviewer-probe.json为旧副本（01:22:57Z），已在working-here-cases注明不可用于该Run；CMD-A08/A10/A12仍以原native记录、事件、快照和pane为证，不用这份旧探针。

count重试Runcompleted/released。sum返回正确sum60及文件artifact，但夹具只要求sum，checker因缺count拒绝，失败快照保留并显式cancel/released；不声称业务验收成功。已修正context-sum未来夹具要求count+sum，stats config24，尚未宣称修正夹具复测。所有测试Run均released、capacity空。当前51 PASS、25 PARTIAL、13 NOT_RUN；OpenSpec11/71，tsc通过，无单元测试。

### r25 进程/Attempt/Run快照边界

真实counter父任务调用reviewer并yield，child result后/settled前暂停；另一个counter Task已接受queued但无Attempt。此时给counter role.md、agents.md和stats Team instructions分别加入不同无行为标记，并升级Team config25。解除暂停后父原Attempt segment2继续使用原context及hash；排队Task的新Attempt采用新working规则，但仍用旧Run instructions；随后新Run采用新Team指令/config，新旧Run的counter Role body/hash均保持进程启动版本。11次实际provider请求的唯一当前系统动态块与这些边界一致。父/排队/新Run业务Task均accepted，两Run completed/released。

证据r25/P4-A05.json，含修改前后hash、实际probe、控制面、完整事件和pane。已恢复原role/working/Team指令，Team config26；snapshot-count工作流作为可复用夹具保留。P4-A05 PASS，OpenSpec3.5关联TR-A30/CMD-A12/P4-A05均通过，现12/71；当前52 PASS、25 PARTIAL、12 NOT_RUN。无单元测试，整体仍未完成。

### 用户重申开发与统一检查顺序

用户确认先完成 spec 全部需求开发，再统一检查；验收由 Codex 本人执行，不交给 cc/Claude。开发期间只做必要的编译、类型与静态检查，不新增或运行单元测试。开发完成与验收通过分别记录；本次仅确认执行安排，不改动既有验收结果或任务完成状态。

### r25 同版本异内容冲突拒绝

在现有wM现场确认Controller存活、三个Role Pi与Dashboard可见、所有Run已released且capacity为空后，临时以不同内容复用已冻结的stats-team config_version25。真实HTTP创建Run返回409 CONFIG_VERSION_CONFLICT。SQLite前后Run/Task/Attempt/ownership/lease/write reservation/queue_seq/fencing及完整config_snapshots均不变；没有接受请求或模型派发，配置26已逐字节恢复。证据为integration/evidence/r25/config-version-conflict.json及可见operator pane记录。结合已核对的P4-A01/A04/A05证据，OpenSpec2.1完成，现13/71；主场景计数仍52 PASS、25 PARTIAL、12 NOT_RUN。未运行单元测试，整体仍未完成。

### r25 standalone委派环与任务预算子项

真实counter父任务在result后/settled前暂停。operator提交self和依赖parent的child分别得到CALL_CYCLE，驱动数据库与parent依赖/revision不变断言通过；20个合法child均queued且无Attempt，第21个TASK_BUDGET_EXHAUSTED。收尾逐个取消child使用旧snapshot revision时遭409 REVISION_CONFLICT，导致内存原始响应报告未落盘；保留原驱动和终端错误，不声称完整原始响应证据。解除暂停后按最新parent revision显式cancel，21个Task最终全部cancelled，capacity/waits为空，真实counter显示Operation aborted。

TR-A28仅PARTIAL，详见integration/evidence/r25/TR-A28-progress.json；Team、ancestor、depth、retry预算及原始响应补证仍待完成。当前52 PASS、26 PARTIAL、11 NOT_RUN，OpenSpec13/71；无单元测试，整体未完成。

### r25 父写资源冲突与Team预算

write-reservation真实frontend父任务完成write/read、在result后/settled前暂停，SQLite中保留目录write reservation与segment lease。对backend提出同目录、目录内文件两个child请求，均409 RESOURCE_DEPENDENCY_CONFLICT；self及依赖parent的child均409 CALL_CYCLE。每次原始请求/响应、数据库实体/资源、parent依赖/revision即时落盘，拒绝后均不变。随后18个child接受为queued、无Attempt，加工作流原有2个业务Task达到20预算；再提交明确TASK_BUDGET_EXHAUSTED。

先显式cancel Run，确认cancelled/reconciling后解除测试暂停；真实frontend报abort，随后Run released，ownership/lease/write reservation/affinity及waits均空。P4-A14 PASS；TR-A28补Team环/任务预算子项，ancestor/depth/retry及standalone原始响应补证仍待完成。证据integration/evidence/r25/P4-A14.json、team-cycle-write.json及pane/driver。当前53 PASS、26 PARTIAL、10 NOT_RUN，OpenSpec13/71；没有单元测试，整体未完成。

### r25 Team祖先/深度与standalone重试预算

新增可复用depth-boundary工作流，stats config27。真实counter→summer→reviewer→backend形成depth0/1/2/3链；末端result后/settled前暂停时，summer调用counter被409 CALL_CYCLE拒绝，backend再委派frontend被409 DEPTH_LIMIT拒绝。原始响应和数据库/父依赖/revision前后均保存且不变。解除暂停后原链逐层续接，四任务全部accepted，Run completed/released，证明拒绝未损坏原链。证据r25/team-depth-boundary.json及真实pane。

另由reviewer-secondary执行standalone数字读取，显式retry形成三个Attempt，retry_of逐项链接且runtime/session/binding相同；第三Attempt result暂停时第四次retry返回ATTEMPT_BUDGET_EXHAUSTED，Task与实体/资源不变。显式cancel成功后解除暂停，真实Pi abort，三个Attempt均released，capacity为空。证据r25/standalone-attempt-budget.json及原始CLI输出。前两次仅execution completed，不冒称human业务验收；此次专验预算。

TR-A28仍PARTIAL，待standalone祖先/深度、先前standalone原始拒绝响应补证及Team重试预算。主计数53 PASS、26 PARTIAL、10 NOT_RUN，OpenSpec13/71不变。无单元测试，整体未完成。

### r25 TR-A28委派环与预算收口

standalone首次四层夹具根Pi持续重复文字、未建child；保存原始pane/snapshot，显式cancel释放，原因unknown。空闲时/new并改用更短中文描述，以新request重试，reviewer-secondary→counter→summer→reviewer形成真实depth0—3链。self/ancestor/dependency分别CALL_CYCLE，depth4请求DEPTH_LIMIT；随后17个queued child加原链3个后代达到20预算，额外请求TASK_BUDGET_EXHAUSTED。逐条保存原始请求/响应、父版本和数据库对照，拒绝无变化；始终仅4个原链Attempt。显式取消后21个Task全cancelled、四Attemptreleased。此前standalone缺原始响应的限制由本次新证据补齐，旧失败仍保留。

Team以config28冻结max_attempts_per_task=1，真实counter首Attempt result暂停时第二次retry被ATTEMPT_BUDGET_EXHAUSTED拒绝，Task/资源不变；显式cancel Run后解除暂停，最终cancelled/released。未来配置已恢复原3次预算并升config29。结合前轮Team self/dependency/ancestor/depth/20任务及standalone三Attempt拒绝，TR-A28完整矩阵通过，证据integration/evidence/r25/TR-A28.json。

最终所有Run released，ownership、execution lease、write reservation、agent affinity及waits为空，无pause控制文件。当前54 PASS、25 PARTIAL、10 NOT_RUN；OpenSpec仍13/71（相关复合任务其它用例未齐）。无单元测试，整体未完成。

### r25 planned、显式rebind与旧Run草稿验收

新增rebind-boundary工作流/config30：frontend持目录写资源、counter作为前置，backend依赖counter，reviewer依赖frontend。两前置result暂停时，backend/reviewer均planned、target=null；空闲backend/new到binding2不冻结planned目标。counter完成后backend才accepted并冻结binding2，因写冲突无Attempt。再次/new到binding3，旧任务needs_review且Run hold，不自动跟随。planned rebind、已有Attempt rebind、旧CAS分别INVALID_REBIND_STATE/RETRY_REQUIRED/REVISION_CONFLICT且无变化；合法rebind记录epoch2→3完整审计、不建Attempt、不解除hold。

frontend完成后，依赖已就绪的reviewer仍planned/null target，无Attempt。显式resume后backend/reviewer才执行；四步均accepted，Run completed/released。真实Secondary选Run后/new提交旧草稿显示NO_ACTIVE_TEAM_CONTEXT；再次选活跃Run保留草稿至Run结束再提交显示RUN_TERMINAL，0%模型上下文、没有新增Task/Run。测试草稿随后清理。

P4-A09 PASS，证据integration/evidence/r25/P4-A09.json；结合TR-A28，OpenSpec4.9完成，现14/71。当前55 PASS、25 PARTIAL、9 NOT_RUN，最终角色/执行/写/affinity资源为空。无单元测试，整体未完成。

### r25 queued Leader离线/绑定变化与FIFO收口

owner stats Run queue37持有角色时，share first queue38与stats later queue39整体排队。share Leader空闲/new使实际binding1→2，queued Run仍固定旧绑定；随后仅暂停该测试Pi pid50231。owner完成释放后first因leader_offline仍queued且全Project ownership为空，later因earlier_run未越过。SIGCONT同一进程后first明确binding_changed仍不准入；不确认的resume返回LEADER_REBIND_REQUIRED且无状态变化，显式expected-runtime/rebind-current恢复后审计保留old/new binding，原queue38不变。

完整事件验证owner释放→first唯一准入→first释放→later唯一准入；三个Run均completed/released，执行、角色、写与affinity资源/等待为空，share Leader已恢复运行。证据integration/evidence/r25/P4-A08.json，结合r24命令创建、重复request、同队FIFO证据，P4-A08 PASS。P4-A08/A09/A24齐全，OpenSpec6.1完成，现15/71；当前56 PASS、24 PARTIAL、9 NOT_RUN。没有单元测试，整体仍未完成。

### r26 共享状态投影补齐与TR-A17

检查发现Team视图只有config/hash/instructions/workflows，缺少当前运行总览。新增只读projection/overview.go，在同一snapshot读事务的已有行上汇总Team Leader/current binding、active/queued Run、成员状态；Run提供明确命名current_roster及非授权next_step，Agent Secondary增加standalone_only。Go TUI列表显示身份与队列数量，Pi Dashboard直接复用投影。生产Go与正确tag集成构建通过，无单元测试。

确认全部Runreleased后，在wM:p1更换r26 Controller，同一DB升级到epoch4，endpoint63136、pid79454，11个Pi恢复online；p2重新打开对应r26 TUI。实际share Run占用reviewer、stats Run排队，Go Team/Role/Agent与Pi Team详情和API一致；Leader/session/epoch、owner、阻塞、Attempt/affinity/lease、Secondary standalone且不计Team容量均有可见证据。UI检查暂停过久触发deadline及随后lease_expired，故障状态/owner保持可见；不宣称这两个业务Run通过，已显式取消、解除暂停并确认全资源释放。Herdr逻辑Enter本轮未可靠展开Go详情，标准CR可用，未扩大为键盘兼容性通过。

TR-A17 PASS，证据integration/evidence/r26/TR-A17.json；OpenSpec2.8/7.1完成，现17/71。当前57 PASS、24 PARTIAL、8 NOT_RUN。USAGE、构建清单和旧版本/失败证据同步保留，整体仍未完成。


## r28 Claude 全量执行（Codex 额度用尽后）

用户要求由 Claude 执行到全部 OpenSpec 任务完成。新测试 space `wP` / squad-p4-r27，隔离库 `/tmp/pi-squad-p4-r27.sqlite`，二进制 r28，epoch 3 端口以 discovery 为准。不跑单元测试。

已观察到：
- 数字 review Run `run-90cfc5f9` completed/released，count=3、sum=60、review accepted。
- wrong-sum `run-08d9660e`：sum=50 rejected，返工 sum=60 accepted，复审 accepted，Leader settled 后 released。
- audit-team 与 stats 不相交期间 audit Run completed。
- 交叉 roster：cross-a 同时占用 backend+reviewer，cross-b 整体 queued 且两条 waiting_roles，A 释放后 B 只准入一次。TR-A26 记 PASS，证据 `integration/evidence/r28/cross-roster.json`。OpenSpec 8.1 勾选。
- 重复 stats-lead 被 IDENTITY_ALREADY_OWNED，whoami 为 ordinary 且恢复普通工具。
- cross-b-lead SIGSTOP 到 offline 后 binding_epoch/runtime 不变，SIGCONT 后仍是同一绑定。
- Dashboard 在 Controller 停止时显示 STALE，重启到 epoch 3 后 current，12 个 Agent 恢复 online。
- `!date` 中断记 manual_interference。`/compact` 在过小会话先 abort 且不发 before_compact；原实现记 RESULT_MISSING。已改为 settlement 延后一轮，`session_compact_failed reason=manual` 同步置位，复测 seq 4677 `attempt_interrupted reason=manual_compaction`。
- 数字 checker 不再因额外数组字段拒绝含 count/sum 的结果。
- 活动/已 yield 的 counter plain `@summer` 返回 ACTIVE_TASK_SCOPE_CONFLICT，未建额外 child。以 `/` 开头的 standalone goal 未执行成命令。

未完成：53 个 OpenSpec 任务，以及 TR-A25、P4-A07/A12/A26/A30/A39/A40 等仍未整项通过。现场保持运行，继续补剩余场景。


## r28 续跑

- 澄清链 `run-da7f7258` 的 yield/clarification_answer/continuation 与 sum=30 已保存；后续 Leader 中断，Run 已取消，不算 Gate 通过。
- `--parent current` child `task-102cc396` 在父 yield 后完成。P4-A30 仍 PARTIAL。
- 重复 `roles_released` seq 6830 被消费后，waiter 的 `run_admitted` 仍为 1，ownership revision 仍为 2。TR-A25 PASS。
- `/squad status` 不中断；Worker 普通输入 seq 7271 `manual_interference`；Leader 普通文字 seq 7412 `operator_guidance`，没有接管。
- auditor 对已被 cross-a 占用的 reviewer 发 `/squad call` 得到 ROLE_BUSY，未建 Attempt。TR-A13 仍缺模型工具直接调用。
- OpenSpec 仍 22/71。已勾选且本轮新增的是 1.1、6.5、7.2、8.1、8.4。
