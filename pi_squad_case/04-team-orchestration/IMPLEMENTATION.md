# 阶段 04 开发收口表

本表对应 OpenSpec 的 18 条需求，记录代码入口与开发核对，不替代 `tasks.md` 的实施完成条件或 `integration/cases.json` 的 89 项验收。用户要求：先完成全部开发，再由 Codex 统一验收；不交给 Claude，不新增或运行单元测试。2026-10-04开发与整体集成已收口，71/71任务、89/89主ID通过；版本和证据范围见末尾最终记录。下文旧轮次状态是历史进度。

下列路径均相对 `pi_squad/`。

| 需求 | 实现入口 | 开发核对关注点 |
|---|---|---|
| TR-01 Project/激活 | controller/project/{config,runtime,migration,database}.go；extension/{project,team-extension}.ts | 最近根、锁、协议、no-op、启动失败 |
| TR-02 Leader | controller/scheduler/{service,leader,runs}.go；extension/{invocation,task-tools}.ts | LeaderStep、guidance、settled 后 Gate、唯一身份 |
| TR-03 Primary/Secondary | controller/scheduler/{service,operations}.go；controller/projection/snapshot.go | 原子资格、tombstone、显式换人、旧凭据 |
| TR-04 Run 准入 | controller/scheduler/runs.go、operations.go | 整 roster、FIFO、公平、终结与安全释放 |
| TR-05 等待 | controller/scheduler/{waitgraph,progress,dispatch,invalidation}.go | blocker 集合、环、持久事件、无丢唤醒 |
| TR-06 执行许可 | controller/scheduler/{dispatch,execution,continuation}.go；extension/{execution-gate,managed-files}.ts | capacity、lease、reservation、实际工具执行 fence |
| TR-07 正式调用 | controller/scheduler/{tasks,messages}.go；extension/{task-tools,team-messaging}.ts | scope、direct 授权、ask、queue、deadline |
| TR-08 上下文 | controller/scheduler/dispatch.go；extension/{context-assembly,invocation}.ts | 进程/Run/Attempt/segment 快照、最终 payload |
| TR-09 配置 | controller/project/config.go；controller/task/store.go；controller/scheduler/runs.go | 严格 schema、immutable snapshot、planned→accepted |
| TR-10 Dashboard | controller/{projection/snapshot,cli/project_tui,client/project}.go；extension/{dashboard,team-client,team-roster}.ts | identity/presence/ownership 分开、stale、选择隔离 |
| TR-11 验收 Gate | controller/scheduler/{acceptance,reviews,references,leader,invalidation}.go | 结果版本、独立 review、rework、parent覆盖 |
| TR-12 mention/Picker | extension/{handoff-input,team-roster,squad-commands}.ts | 多行、文件歧义、错误handled、草稿及generation |
| TR-13 命令 | extension/squad-commands.ts；controller/cli/{tasks,operations}.go | 完整入口、严格参数、显式Run、旧上下文 |
| TR-14 父子 | controller/scheduler/{tasks,continuation,clarification,recovery}.go | yield/affinity、capacity=1、澄清、amend、祖先传播 |
| TR-15 恢复 | controller/scheduler/{recovery,recover_result,operations}.go；extension/invocation.ts | 未知执行不重放、原生会话、停止证据、旧新binding |
| TR-16 一致性 | controller/task/store.go；controller/httpapi/team*.go；extension/team-client.ts | 事务、幂等、outbox、迁移、SSE身份与断档 |
| TR-17 权限/错误 | controller/scheduler/{service,tasks,operations}.go；extension/{execution-gate,managed-files,managed-search}.ts | operator隔离、工具交集、控制路径、截断 |
| TR-18 能力/交付 | controller/project/{doctor,probe}.go；extension/doctor.ts；integration/pi-probe.ts | fail closed、真实API探针、版本与证据、89/160追踪 |

## 当前修复后仍需完成的开发核对

- [x] 对上述入口完成一轮连贯的来源→鉴权→事务→派发→工具→settled→Gate→cleanup核对，不能用“文件存在”推断完成。
- [x] 核对全部命令参数与 HTTP/schema/USAGE 一致，特别是 request_id、expected_revision、旧新绑定与错误返回。
- [x] 核对 runtime capability 缺失、原生 session/user_bash/compaction、SSE reconnect 与管理预览的完整实现（源码路径核对，运行行为仍待统一验收）。
- [x] 汇总生产/集成构建与 TS 类型检查结果，明确开发已收口；统一验收现场将在下一步新建。

## 2026-09-27 本批开发改动

已修复的代码边界包括：未绑定 Role/ownership 投影；同 revision 观察时间排序；GET/SSE Controller身份；poll/事件/ACK旧回调；取消树revision与上行传播；rebind边界；恢复binding审计；父覆盖与返工Gate；多行mention/严格参数；受管文件队列的发起上下文fence及模型工具响应隔离。

本批只执行编译、类型和diff检查；每项修复仍须统一运行验收。此前失败、PARTIAL/NOT_RUN及既有PASS保留，不以本表覆盖。

本批补充：interruption 接入事务幂等，schema增加5类实际请求；SSE重连先discovery/snapshot，失效提示按批resnapshot，Controller ID隔离迟到快照。源码核对已定位这些缺口并修复；仍需完成能力检查和命令协议的剩余连贯核对。

管理入口开发补充：Dashboard 增加 Role/Leader release 预览，操作固定所见 snapshot 的 Controller 身份及执行上下文；命令在异步读取目标后复核上下文。能力清单补 agent_before_settle，声明检查移到注册开始之前。Go/TS 编译通过；未运行验收，剩余连贯核对清单仍保持未完成。

能力探针开发补充：ReadProbe 不再聚合互不相关事件判 ready，改用扩展输入到 settled 的有序链，包含任务执行身份与 payload 关联证据。生产 Go 编译和含 probe 的 TS 类型检查通过；未运行探针或改变用例结果。

命令开发核对补充：Pi 固定参数数量、目标/操作矩阵、逐操作选项及引号错误在请求前校验；amend 正文不再误触 preview；send 读取目标及 run 返回后隔离旧上下文。Go CLI 与 Service 共用操作名称校验。编译/类型检查通过，尚未运行命令验收。

## 调度主链源码核对记录（2026-09-27）

以下仅记录已读到的代码路径及本轮修复，运行判据继续留在统一验收清单。

| 路径 | 本轮源码核对结果 | 运行证据要求 |
|---|---|---|
| CreateRun→admitRuns | config freeze、queue_seq、roster写入与事件在同事务；相交/同Team受前序阻塞，不相交可继续 | 全有或全无、跨Team公平、回滚窗口 |
| Tick→startAttempt | Run/依赖/父yield/绑定/ownership/能力/容量/affinity/write/ref检查后写intent与租约；本轮补事务内重读及失败上行 | 并发容量、旧绑定、注入窗口 |
| AttemptEvent | request幂等、binding/epoch/segment/fence/CAS；结果提交不等于settled；实际释放在settled或明确对账 | 重复/迟到事件、结果和pending窗口 |
| resumeReady | 同Attempt递增segment，保留affinity/write；本轮补事务内Task重读 | capacity=1、amend与澄清续接 |
| cleanupRun | 未清Attempt阻止释放；终态且清理完成才删ownership并记事件 | 取消/离线执行不提前释放、释放唤醒 |

本轮同时修正上一批probe将segment_id误作字符串的问题：生产协议为正整数，probe按数字记录并核对payload中的值。Go/TS编译、diff检查通过，未执行运行验收。尚需连贯核对Task准入/鉴权、Leader决策与验收Gate、配置/权限工具及native生命周期；不将本表当成全部开发完成证明。

Task/Leader/Gate源码核对补充：已连贯读取HTTP principal→事务replay绑定重验→Task scope/授权/预算→Leader批量决策→refs/review/最终Gate。修复端点与body scope冲突、child Run冲突、refs形状和重复依赖准入、依赖目标版本及blocker检查；review自审/预算失败增加持久原因和上行传播。Go编译通过（首次在根目录误执行build未找到module，随后在controller目录编译通过），无运行验收。剩余开发核对集中于配置/工具权限/native生命周期及协议文档总核对。

## 配置、工具和native生命周期核对（2026-09-27）

核对路径：Go/TS Project discovery→配置快照→execution-gate→受管文件队列与search→Invocation native事件/注入/settled。按当前spec，suspended且无活动segment的手动compact保持快照；实际session/tree变更和user_bash仍走中断，自动compact不造新Attempt。read/write/edit操作保留队列与调用fence，搜索输出逐路径过滤；本轮补充工具gate只接受running/result_proposed且租约有效的未释放Attempt，文件解析异常明确拒绝。Go discovery改用Lstat检测损坏marker symlink，Go/TS均不将权限错误当成不存在而向上回退。

生产Go、integration构建和TS noEmit通过。开发核对清单第1、第3项记录为已完成一轮源码核对，不代表对应OpenSpec行为已验收。剩余：命令/HTTP/schema/USAGE最终一致性核对，以及完成该核对后的汇总构建和开发收口声明。尚未进入统一运行验收。

## 本轮开发收口：待 Codex 统一验收

代码覆盖18条需求的入口，前述四项开发核对已完成一轮；下一步进入用户授权的统一验收，不再派发Claude。71项OpenSpec任务中的运行子项及89场景仍以原结果保留，任何PARTIAL/FAIL/NOT_RUN均不视为通过。

最终构建：生产 `go build ./...`、故障版 `go build -tags pisquad_integration -o /tmp/pi-squad-phase04-controller-r20 ./cmd/controller`、`tsc -p /tmp/pi-squad-typecheck.json` 和 `git diff --check` 通过。此前使用 `-tags integration` 的构建未启用故障代码，不能作为该能力构建证据；本轮已纠正并成功构建。没有运行单元测试或新的运行验收。代码及schema SHA256见 [development-build.json](development-build.json)；r19二进制不再用于本轮验收。

补齐heartbeat/instance/snapshot的Go schema导出；USAGE区分支持preview的管理命令与amend正文，并注明suspended纯compact例外。后续若验收发现实现问题，保存失败证据后修复复测，不覆盖既有记录。

## 统一验收发现的r21修复

`squad_run_get`原实现只读Run对象，没有工具描述承诺的DAG状态，导致真实share Leader刷新CAS revision却沿用旧briefing等待。改为一次snapshot输出当前Run revision、任务结果/验收及blocker；与注入briefing共用内容预览。只改TS，类型检查通过；生产Controller r20未变。旧构建清单保留在integration/evidence/r20/development-build.json，当前清单记录r21。实际工具已在guidance恢复路径使用，另以新Run验证自动路径。

## r22/r23调用参数与Picker补齐

验收夹具将CLI的agent:前缀错用于agent_invoke，工具说明现明确Team填role_id、standalone填agent_id的裸ID；原失败保留。Picker无同名文件时改填@Role，有冲突才填@role:Role，满足CMD-A03并保留显式消歧。两次TS类型检查通过，真实Pi复测见r22/r23；任务5.5全部指定行为已有证据，未据此勾选预算、循环或其它UI边界任务。

### r24 命令帮助与旧别名一致性

实际Pi发现help只有命令名和少数参数，旧alias忽略多余参数。已补齐所有现有入口用法、管理预览及operator轮换说明；alias转交参数给同一handler。tsc通过，wM:pC真实验证help、root/Role/Run补全、三个旧alias；alias和canonical多余参数均INVALID_ARGUMENTS，快照无新增Task/Run、无模型轮。P4-A24 PASS，证据integration/evidence/r24/P4-A24.json。其余10个空闲Pi已/reload并逐pane确认，Controller仍r20/epoch3。当前40 PASS、24 PARTIAL、25 NOT_RUN；OpenSpec仍9/71（6.1其它子项尚未通过），整体未完成，无单元测试。

### r24 FIFO、queued handoff及r25按键修复

stats-team占共享reviewer期间，share-team的两个Run整体queued_run，queue_seq21/22；相同request重复提交返回同一Run。用户从reviewer-secondary Pi选中第一queued Run提交@reviewer，正式Task queued但无Attempt，无绕过ownership。事件顺序：owner释放11361→first准入11364→first释放11456→second准入11458→second释放11555，三Run全部completed/released，handoff checker accepted。TR-A33/CMD-A07 PASS；P4-A08仅重复request/FIFO子项通过，Leader离线/重绑等仍PARTIAL。夹具初次断言误用queued而非queued_run，未重复提交变更，已记录。证据r24/fifo-cases.json。

继续观察时发现r24 Pi Dashboard原始ANSI比较不识别方向键（j/k可滚动）；改为Pi matchesKey解析up/down/tab/enter/escape/backspace。r25真实方向键选择/详情上下滚动、Tab、Enter、筛选Backspace和Escape退出复测通过；保留P4-A25旧失败子项并附修复结果。tsc通过，USAGE同步，11个idle Pi已加载当前扩展，Controller仍r20/epoch3。当前45 PASS、23 PARTIAL、21 NOT_RUN，OpenSpec仍10/71；未运行单元测试，整体未完成。

### r26 共享状态投影补齐与TR-A17

检查发现Team视图只有config/hash/instructions/workflows，缺少当前运行总览。新增只读projection/overview.go，在同一snapshot读事务的已有行上汇总Team Leader/current binding、active/queued Run、成员状态；Run提供明确命名current_roster及非授权next_step，Agent Secondary增加standalone_only。Go TUI列表显示身份与队列数量，Pi Dashboard直接复用投影。生产Go与正确tag集成构建通过，无单元测试。

确认全部Runreleased后，在wM:p1更换r26 Controller，同一DB升级到epoch4，endpoint63136、pid79454，11个Pi恢复online；p2重新打开对应r26 TUI。实际share Run占用reviewer、stats Run排队，Go Team/Role/Agent与Pi Team详情和API一致；Leader/session/epoch、owner、阻塞、Attempt/affinity/lease、Secondary standalone且不计Team容量均有可见证据。UI检查暂停过久触发deadline及随后lease_expired，故障状态/owner保持可见；不宣称这两个业务Run通过，已显式取消、解除暂停并确认全资源释放。Herdr逻辑Enter本轮未可靠展开Go详情，标准CR可用，未扩大为键盘兼容性通过。

TR-A17 PASS，证据integration/evidence/r26/TR-A17.json；OpenSpec2.8/7.1完成，现17/71。当前57 PASS、24 PARTIAL、8 NOT_RUN。USAGE、构建清单和旧版本/失败证据同步保留，整体仍未完成。

## 2026-10-04 阶段 04 继续实施与真实复测

本轮直接执行 `pi-squad-team-orchestration`，不委派开发/验收 Agent。当前 **62/71 任务完成，61 PASS / 24 PARTIAL / 4 NOT_RUN**；不能据此宣称 4a、4b 或阶段完成。历史记录保留，当前矩阵以 `integration/cases.json` 为准。

新增开发与实际证据：

- 补齐 `POST /v2/tasks/:id/acceptance` 和 schema，复用 operator、CAS、幂等及审计；实际 accepted/rejected、旧 revision、非法 decision、同键重试均验证。
- 实际 Pi 复现 suspended 父任务 `/compact` 的中断标记污染后续 continuation；修复为在 native manual compaction hook 立即隔离活动 segment，不再把标记延后到下一轮。旧失败、首版修复失败和最终活动 segment 修复证据均保留。最终代码的 suspended 正例正在复测。
- 隔离 Controller 用真实 SQLite `max_page_count` 配额触发 `SQLITE_FULL`（不是 mock，也没有填满用户磁盘）。修复写错误 HTTP 分类为 503 `STORAGE_UNAVAILABLE`；失败事务无 Task/Attempt/lease，恢复配额后的同键重试及再次重放只有一个 Task。P4-A19 与既有 Run 准入回滚证据合并后 PASS。
- P4-A07 的真实 HTTP/SQLite 身份并发 9 个子项通过；保留动态 presence 比较及测试 DB 路径错误的夹具失败与纠正链。
- 真实 standalone reviewer 完成 count=3/sum=60，保留原 session/PID；离线调用被 `AGENT_OFFLINE` 拒绝。Worker 自由文本没有结构化结果时得到 `RESULT_MISSING`，不会 completed。任务 3.8 完成。
- 数字第一轮 counter/summer 执行区间重叠约 5.3 秒，真实独立 review/Gate 收尾。第二轮 stats/share/audit 三 Team：共享 reviewer 的 B 整体排队、无 researcher 半占用，A 的 sum=50 被拒后返工、重审，释放后 B 只准入一次；不相交 C 可并行，但 C 的整个 Run 释放晚于 A 约 0.7 秒，不能写成 C Run 先完成。
- Project capacity=1 下真实父子 clarification：父 work → child yield → 父 response-only → child continuation → 父 continuation → review/Gate 完成，同 Attempt 递增 segment，无容量死锁。任务 5.8 完成。
- 三层链的实际 `/tree` 与 `/resume` 切换使叶子中断、两层等待祖先 `needs_review`，旧 settled 不推进；原生 selector 取消无副作用。
- 真实 Leader threshold 自动压缩成功，仍保持正式 Attempt；Pi Dashboard 断线呈 STALE，Controller epoch 变化后重新取快照。

证据位于 ignored `integration/evidence/r29-20261004/`。Pi 使用独立 npm 1.0.1、Node v24.16.0、Go1.27.0，模型 `local-grok/grok-4.7`；用户全局 Pi、上游源码和已有服务未修改。测试 workspace wZ 从项目 cwd 启动五种 Role、三 Leader 和 reviewer Secondary，Controller 与对应 Go Dashboard 独立 pane。Go build、TS noEmit 通过；未新增或运行单元测试。

剩余重点：逐一真实崩溃/恢复窗口、自动 retry/overflow 与长 Role、观察端乱序/slow consumer、权限绕行及策略子断言、89/160 全量收口和安全清理。旧父 ID 的 PASS 不能覆盖新增子断言。

## 2026-10-04 自动重试、压缩与长 Role 收口

P4-A31 已 PASS，任务10.1完成：当前63/71任务、62 PASS / 24 PARTIAL / 3 NOT_RUN。真实503后原生retry、400后原生overflow compaction（from_extension=false）、threshold压缩、长55188字节Role及后置section framing都有末位payload hash/身份/tools证据。每次retry保持同一个Attempt/segment，早期agent_end仍idle=false，最终settled才完成。

活动手动压缩复测进一步发现poll会取消原生摘要。修复在native manual compaction期间不重复abort维护摘要，成功/失败事件清理维护状态；保留正式gate与停止证明。最终原生摘要从59132 tokens成功压缩，正式Task仍manual_compaction中断并released，无自动续跑。原终端SIGSTOP后的输入协议夹具失败与真实poll-abort失败分别保存，未混作同一产品失败。长Role原文件已按原bytes恢复，测试Auditor显式release后恢复同一个session，旧runtime历史保留。

三层真实user_bash在leaf settled确认前介入，leaf interrupted/manual_interference，两层祖先needs_review，旧settled不推进。仍继续原89项的剩余子断言，不宣称阶段完成。

## 2026-10-04 提交前恢复门修复

真实SIGKILL发生在Task已受理、dispatch intent尚未提交的事务窗口。r32重启后未等待授权便自动创建Attempt并注入，保存为`crash-before-intent-unauthorized-replay-failure.json`。r33启动对账补齐accepted且无Attempt的standalone Task：标needs_review、controller_restart blocker与task_recovery_hold审计，不新建许可/输入。相同物理窗口复测后目标已在线及超过TTL仍无Attempt；操作者显式rebind后仅一个Attempt/一次input完成。USAGE同步恢复入口；Go生产/集成构建、TS、严格OpenSpec校验和diff检查通过。

首个提交后物理窗口也完成：actual intent提交后、adapter receipt前SIGKILL真实测试Pi和Controller，重启及TTL后仍隔离，无自动replay；错误runtime停止声明拒绝，精确human_attestation后release，再恢复同SID并显式retry完成，只新增一个Attempt、一次input。不是自动停止证明。before_final_gate窗口同样完成，其他逐窗口继续运行。

本轮矩阵当前64 PASS / 22 PARTIAL / 3 NOT_RUN，OpenSpec63/71。全部失败和夹具准备错误保留，阶段仍未完成。

## 2026-10-04 逐窗物理崩溃完成

任务4.7和P4-A18完成，`physical-crash-windows-summary.json`索引9个实际SIGKILL窗口及同SID恢复：intent提交前、提交后receipt前、最后注入gate、input的ACK前/后、result提交前/后、Pi settled未确认、Controller settled确认后。无结果窗口仅显式retry/rebind后输入；已有candidate显式recover无新模型请求；已确认完成在重启后保持completed/released。停止声明记录human_attestation，旧目标/epoch/历史保留，未宣称自动证明。

P4-A10新增F/E子断言完整复测：隔离r33、合成adapter（不是Pi/model）10/10匹配；同Task双blocker、第三分支运行、amend刷新自身wait不清peer、cancel只删自己的revision wait、分别释放写owner和affinity、最后派发。根fixture缺agents.md、Team human policy及observer project mismatch属于准备错误，均保留；最终资源全部released。主现场真实Pi与合成控制面有各自Controller/Dashboard。

当前OpenSpec64/71，89项为66 PASS /20 PARTIAL /3 NOT_RUN。剩余7个实施任务是7.3/7.5/7.6/10.2/10.3/10.4/10.5，仍含多Team第三轮故障、投影/交互竞争与全量子断言；不能标阶段完成。

## 2026-10-04 阶段 04 全量收口

OpenSpec **71/71** 任务完成，原 **89/89 PASS**：4a **71/71**、4b **18/18**。当前会话直接完成开发与独立运行核对，未委派协作 Agent；产品自身运行了 counter、summer、reviewer、auditor、researcher，以及三个 Team Leader 和 Reviewer Secondary。全局160仍是计划总数，其它阶段不据此判通过。

实际环境为独立npm **Pi1.0.1/TUI**、Node24.16.0、Go1.27.0、TS7.0.2、local-grok/grok-4.7；主控制面r29→r35/epoch18，最终配置错误和生产故障隔离使用r36。全局Pi1.0.0、用户服务和上游源码未修改。验收期间Pi提示有1.0.2更新，本轮没有切换宿主，结论仅覆盖实际1.0.1；RPC/JSON/print继续明确拒绝正式激活。

本次修复：canonical acceptance HTTP入口；原生手动压缩的及时fence及维护期间不重复abort；真实SQLite FULL的503分类；Controller重启前已受理但无Attempt的standalone恢复hold；管理CAS失败的持久拒绝审计；被占Role的Secondary及跨Team调用不再绕过ROLE_BUSY；缺acceptance mode先显示ACCEPTANCE_POLICY_MISSING。可用行为同步USAGE。

三轮真实实验完成：单Team两个计算Role并行得3/60、独立review与错误50返工；共享Reviewer时B整体排队、C不相交运行、A收尾唤醒；第三轮三层树取消与离线Reviewer、queued取消、Controller重启、Leader显式release/rebind、其它Team候选recover、旧回调不能推进。九个真实SIGKILL窗口分别留证；人工精确停止声明保留human_attestation，不冒称程序验证或自动回滚。

交互补验：原生Picker已有草稿取消/填稿、快速切Run与旧补全隔离；真实代理duplicate/gap/旧epoch/slow snapshot/断连恢复；native Dashboard cancel/promote/recover预览竞争CAS失败不改业务revision且留审计。Worker观察不中断、plain@拒绝、相关parent intent受理后才yield，普通输入接管；Leader普通guidance与takeover分开。普通“完成了”不构成结果。

验收策略补验：实际review接受pending候选；等长产物变化撤销旧review/acceptance，旧goal恢复拒绝，显式retry后以goal2新结果revision25独立重审并完成Gate；同稳定Agent实际/new换SID仍SELF_REVIEW。真实standalone父子及独立人工验收，F/E补checker错真值、人工作废、精确parent覆盖随child/goal变化撤销、不递归审review、无策略无业务Task。合成adapter仅作实际HTTP/SQLite的F/E，不冒充模型结果。

安全收尾：10个实际Pi原生退出并精确runtime release；两个Controller、proxy及Go观察退出，discovery删除，SQLite备份；两库execution_leases、role_ownership、agent_reservations、write_reservations、wait_edges均0，所有Run/Attempt cleanup released；本次wZ关闭，用户其它workspace保留。数字源恢复9字节原值；自己的故障开关清除，历史/极小clone artifact和证据保持ignored便于阅读。

逐项矩阵、U/E/R/F/D来源、INV01—15、89/160静态核对及失败/重测在本地ignored `integration/cases.json`、`integration/RESULT.md`、`integration/evidence/r29-20261004/`。其中临时helper输出全局变量误指旧报告，损坏的capacity-write-outbox-r33-retest.json不用于最终证明，重新运行r35并留完整4/4证据。多个夹具准备错误、暂停过久超时和真实产品失败均保留；不把它们合并成通过。未新增或运行单元测试，未提交、未archive。
