# 阶段 04 开发收口表

本表对应 OpenSpec 的 18 条需求，记录代码入口与开发核对，不替代 `tasks.md` 的实施完成条件或 `integration/cases.json` 的 89 项验收。用户要求：先完成全部开发，再由 Codex 统一验收；不交给 Claude，不新增或运行单元测试。本轮需求代码开发与源码核对已收口，状态为待统一运行验收；不代表需求行为已全部验证。

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
