本文是 `05-direct-durable-drive.md` 的中文阅读版；命令、路径、API 名称保持英文。

# WP05 — 直接持久 drive {#wp05--direct-durable-drive}

**状态：WP05 完成到 M10：lane 拥有的 inbox、不可变结果记录、13 个家族中性 leaves、原子边界规划、完全 cancellation/dispatch、公开与可复制 lane 表面、文档调和，以及 lane 安全的 provider cache 身份。剩余 assistant-output 工作由 [mobile assistant-output 交接](../mobile-handoff/01-harness/05-assistant-output/message-update.md) 拥有，位于公开 drive 门控之外。**

WP06 的 Session/Branch/Lane 分离是基础的一部分。公开 drive 已启用；`watchSession` 是唯一推迟的 Harness 方法。

Format 4 仍是进行中的工作。本包中每一次持久类型替换都不要求 migration，也不要求针对重设计前形态的兼容 decoder。

先前出现在本文档中的独立 compaction inbox/promotion 设计已 **撤回**（§5）。R1–R3 和 M7/M8 替换它。M9 调和了 `docs/harness.md`，它再次自行具有规范性。

## 0. 必读 {#0-mandatory-reading}

实现工作前完整阅读：

1. `packages/agent/docs/harness.md`（规范性；由 M9 调和）
2. `packages/agent/docs/runtime-simplification.md`（其 22-leaf 列表由 R3 替换）
3. `packages/agent/src/harness/session/types.ts`
4. `packages/agent/src/harness/session/values.ts`
5. `packages/agent/src/harness/runtime/lane.ts`
6. `packages/agent/src/harness/runtime/types.ts`
7. 每一个现有的 `packages/agent/src/harness/runtime/drive/*.ts`
8. `packages/agent/src/harness/runtime/progress.ts`
9. `packages/agent/src/harness/runtime/restore.ts`
10. `packages/agent/src/harness/execution/{effect-gate,assistant,tools}.ts`
11. 相关聚焦 runtime 测试

不要检查 Git 历史或已移除的 runtime 实现。当前源码和这些文档是唯一实现输入。

## 1. Runtime 模型（目标） {#1-runtime-model-target}

### Lane 权威 {#lane-authority}

当 Harness 拥有其 Session 时，`Lane.state` 是权威的。它包含 dispatch 所需的全部编排状态：

- tip；
- lane 配置；
- lane inbox：带标签的排队输入 ids（R1）；
- 上一次 operation id（R2）；
- operation 元数据；
- 扁平 operation 状态，包括 control。

每一个受支持的 mutation 都在那一条 Session mutation line 上 commit，并在释放 line 之前发布匹配的 `Lane.state`。Drive 过程从不从存储重读 `laneState`、`operationMeta`、`operationState`、`branchTip`、`laneConfig` 或 `operationResult`。

`SessionReader` 只用于解引用内存状态命名的内容，以及枚举 operation 拥有的 cleanup 地址：

- tree entries 和 branch 上下文；
- pending entry payloads；
- assistant frame lists；
- tool arguments、checkpoints 和 memos；
- structural preparations；
- 暂存的 tool outcomes；
- cleanup-prefix 扫描。

### 一个 lane 拥有的 inbox（R1） {#one-lane-owned-inbox-r1}

排队输入由 lane 拥有，从不由 operation 拥有。`LaneState`（持久和进程局部）携带一份有序 inbox，其中是 `kind: "steer" | "followUp" | "nextRun" | "write"` 的 `{ entryId, kind }` 项。Payload 暂存不变：enqueue 铸造 entry id 并写入 `pendingEntry(id)`；inbox 只持有 ids。项生命周期是接纳 → 消费 | cancellation；终端 cleanup 从不触碰 queue payloads。

标签是消费资格标记，不是所有权。Enqueue 总是成功——在 runs、structural operations、cancellation 和空闲期间。每一个 drain 点按标签选择合格项，在选择时应用 queue modes，但把全部选定项放在 inbox 的单一全局接纳顺序中。标签分组不得重排用户输入。在接纳时，请求 prompt entries 跟在选定 inbox 项之后，因为该请求是最新接纳。

| Drain 点 | 资格与决策顺序 |
| --- | --- |
| 接纳（空闲 lane） | write + nextRun（全部）、steer（`steeringMode`：全部或最旧）以及 followUp（`followUpMode`）合格。按全局接纳顺序放置选定项，然后是请求 prompt entries。接纳事务放置它们并移除其 ids；`starting` 不 drain 任何东西。followUp 合格，因为空闲 lane 空洞地满足其“当前工作之后”条件。 |
| turn-end 边界 pass（run） | write + steer 在 threshold/continuation 规划之前合格，并按全局接纳顺序放置。followUp 只在 `may_finish` 时、在 `before_run_end` 和 finish 之前变得合格。nextRun 在 run 中途从不合格，也从不阻塞 finish。 |
| 空闲直接 append | 排队 write 项按接纳顺序放置，然后是新 entry，在一次 commit 中 |
| abort（M7） | steer + followUp 从 inbox 移除，payload 值被删除，payloads 被返回；nextRun 和 write 项留下 |

**一次决策，至多一次 commit（R1b）。** 边界 pass 可以为有界读取和 `before_run_end` 调解多次进入 mutation line，但它执行 **至多一次 commit**，并且该 commit 总是落在既不 drain 也不再检查的状态中（`assistant.ready`、`summary.deciding`、已放置 entries + `assistant.ready`，或终端事务）。没有任何边界决策会 commit 回 `checkpoint`。Commit 之前的崩溃用什么都没消费的状态重跑整个决策；之后的崩溃落在决策点之后。因此 `skipInboxOnce` 和 `thresholdCheckedTriggerEntryId` 被删除：drains 不能再触发，因为其目标状态不 drain，并且 threshold 标记被替换为从 branch 自身派生的守卫——threshold 只在 `shouldCompact` 成立 **并且** branch 最新 compaction entry 比 trigger entry 更旧时开火，因此一次已 commit 的 threshold compaction 就是它自己的持久标记。Mode 余项保持排队，并在更晚的边界被消费，给出每 turn 的 steer 节奏和每 run-end 的 followUp 节奏。

没有终端 drain。`cancelQueued` 分诊不变且单点。排队输入在 operation 终止后存活（包括 abort，针对 nextRun/write）直到被消费或取消；这是有意的产品决策。

### 扁平状态（R3） {#flat-state-r3}

`OperationState` 有一个 `at` 判别器，带 **13** 个直接 leaves：

- `starting`
- `checkpoint`
- `assistant.ready`
- `assistant.effect_pending`
- `assistant.retry_wait`
- `tools`
- `deferred.suspended`
- `deferred.effect_pending`
- `summary.deciding`
- `summary.ready`
- `summary.effect_pending`
- `summary.retry_wait`
- `navigation.ready_to_commit`

每一个 leaf 携带一份统一 scope `{ control, settings, latestAssistantEntryId }`。没有 `run.`/`compaction.`/`navigation.` leaf 前缀，没有按家族的 scope 类型，也没有 intersection 动物园。四个 `summary.*` leaves 携带一份 `SummaryTask`，其 `boundary` 数据（封闭三臂 union，§8）决定结果边界处发生什么。`starting` 和 `navigation.ready_to_commit` 是意图锁定的入口 leaves。`ToolBatch`/`ToolCall` 仍是嵌套子集合状态机。`Control` 保持正交，并在 M7 安装 drain-and-return abort 时失去其 drained 字段。

### 持久 operation 结果（R2） {#durable-operation-results-r2}

每一次终端事务都在 `operationResult(operationId)`（命名空间 `pi.result`，operation id 键）写入一份小型不可变结果记录。该记录是 lane 存活的；把它放在 `pi.op.*` 之外，使该命名空间“不晚于终端事务删除”的语法完全且无例外。`LaneState.lastOperationId` 指向最新记录。`laneLastResult`（值、地址构造器和类型 union）被删除。

- `drive(id)` 对已结算 operations 变为完全的：当前 id → 安装/加入；记录存在 → 返回记录本身；两者都没有 → `OperationMismatch`。
- Recovery 和 attachment 从不读取结果记录；它们只是观察。
- 终端 control 不变量：在持久 `cancel_requested` 下执行的终端事务总是记录 `status: "aborted"`；等价地，任何其他 status 都意味着 running 终端 control。（每一条非 aborted 终端路径都经过 `continueOperation`，它在 cancellation 下转向，并且 mutation line 把该标记与终端 commit 序列化。）
- 没有针对记录的 listing、filtering、pagination 或 retention API——也没有 hydration 层。`getResult(operationId)` 和 drive 的 settled 臂是全部读取表面；两者都返回记录且不解引用 entry，因此观察从不能因缺失 entries 而失败。

### 一个 lane 拥有的 Drive {#one-lane-owned-drive}

不变：每个 lane 一次进程局部 Drive pass；第一个匹配调用方安装，后来的匹配调用方观察同一完成；安装之后没有任何调用方拥有它；invocation cancellation 只拒绝该调用方的观察；已安装 Drive 从不在进程内被放弃或替换；`requestAbort(operationId)` 是唯一的持久 operation cancellation；陈旧 operation id 返回 `OperationMismatch` 且不影响任何东西。`Drive.context` 移除安装 invocation 的 signal。

### Close {#close}

不变：close 不是 abort。它封闭 mutation 接纳，用 `HarnessClosed` 拒绝本地观察，观察分离 pass 失败，排空封闭前已接纳的 mutations，并关闭 Session。它不写入 cancellation 标记或合成终端状态，也从不替换 Drive。

### 没有外部终结 {#no-external-finalization}

不变：没有 live-process 外部终结路径、`OperationEnded`、`finalizedOutcome`、ownership-loss 结果，或 exact-Drive ABA 栅栏。

## 2. 过程形态 {#2-procedure-shape}

Live 过程是普通直线 async 函数：

```text
prepare
→ commit intent
→ admit and await effect
→ commit settlement
```

过程是改变其顶层 `at` leaf 的唯一写入者。`requestAbort` 只改变 `control`（以及 lane inbox）；inbox 接纳只改变 lane inbox。Operation 状态恰好有两个受支持的写入者：过程和 `requestAbort`。

Lane 像今天一样提供 `continueOperation` 和 `settleOperation`。终端决策追加通用后缀：

1. 过程特定的发布和 cleanup 写入；
2. `setValue(operationResult(operationId), record)`；
3. 带 `currentOperationId: null`、`lastOperationId: operationId` 以及被保留 inbox 的空闲 `laneState`；
4. 空闲进程局部投影；
5. 终端结果和事件物化。

状态参数是由 dispatcher 控制流建立的类型能力，从不在运行时与当前状态比较。

## 3. 剩余并发检查 {#3-remaining-concurrency-checks}

只在另一受支持写入者可以改变相关事实处保留检查：

1. `requestAbort` 对 effect 接纳和结算；
2. drain 点、summary 结果边界或终端 finish 之前的 lane-inbox 到达；
3. 并行 tool-call 状态和 source-ready 放置；
4. 排队的 frame/checkpoint 写入对结算；
5. invocation memo/checkpoint 调用对 effect 完成；
6. retry timers 对 cancellation/close；
7. deferred permit 消费；
8. accept/claim 序列化；
9. 外部/provider/内容校验。

不要把 operation 身份、expected-`at`、exact-Drive 或 ownership-loss 检查重新引入普通 transitions。

`requestAbort` 保持两步门控顺序：cancellation mutation 之前 `beginAbort`，commit `cancel_requested`，commit 之后 `signalAbort`。

## 4. 已完成里程碑 {#4-completed-milestones}

### M0 — 撤回的 execution-step 控制 {#m0--withdrawn-execution-step-controls}

已完成。Breakpoints、手动 drive 和 drive deadlines 不存在。

### M1–M2 — 基础与终端机制 {#m1m2--foundations-and-terminal-mechanics}

已完成。包括拆分的 effect gate、确定性门控存储、权威进程局部 Lane 投影、commit-result usage totals、progress channels、终端 cleanup，以及不可变 operation-result 观察。

### M3 — Assistant generation 与 recovery {#m3--assistant-generation-and-recovery}

已完成。包括 `run.starting → run.checkpoint`、assistant ready/intent/effect/settlement、frame 持久化与 cleanup、配置失败、未知结果 assistant recovery，以及 response/usage/state 原子性。

### M4 — Retry 与 deferred {#m4--retry-and-deferred}

已完成。包括持久 retry waits、本地 wait 策略、每次 pass 一个 deferred poll permit、在全新 ids 下的未知 poll 替换，以及保留事件流的 `Models.streamDeferred`。

### M5 — 持久 tools {#m5--durable-tools}

已完成。包括 planned/effect-pending/outcome-ready/completed 调用、安全回放、不安全 interruption、invocation memos、有界 checkpoints、完成顺序暂存、源顺序放置、顺序和并行模式，以及 tool 报告的 usage。

### Pre-M6 简化 {#pre-m6-simplification}

已完成。规范扁平 `at` 类型、`continueOperation`/`settleOperation`、移除 installer 拥有的 Drive 模型，以及转换 M3–M5 过程。

### M6 结构基础 {#m6-structural-foundation}

已提交（`9b23c6583`）：`runtime/drive/structural.ts`、`test/harness/runtime/drive-structural.test.ts`、compaction 模块中的单 provider-request 接缝、threshold 路由、overflow 准备、按请求的 structural intent/usage 结算、hook 决策、structural retry/recovery，以及未摘要的 navigation commit。其家族笛卡尔积层（三重复制的四元组、三臂 publishers）由 R3 重建；其 effect 接缝、preparation 管道、threshold/overflow 逻辑以及 navigation commit 被保留。

## 5. 已撤回：独立 compaction inbox 与 run-continuation promotion {#5-withdrawn-standalone-compaction-inbox-and-run-continuation-promotion}

给 `compaction.*` leaves 一份 `RunScope` inbox、并在结果边界处单向跨家族移入 `run.*` 的设计已撤回。其问题：带定制 restore 规则的放松 intent/state 不变量、`compact()` 用不符合 `CompactionResult` 的 run outcome resolve、被抑制的 `run_start` 产生不平衡事件括号、为避免 `cancelQueued` 搁浅而融合的消费规则，以及调和、cleanup、watch 和接纳中特定于 promotion 的臂。

替换方案分布在本包中：

- 任何 operation 期间的排队输入由 lane 拥有（R1）——不存在要 promote 的 operation inbox；
- 独立 compaction/navigation 之后的 continuation 是带全新 id 的 **第二次普通 run operation**，在便利层中组合（M8）；
- 每一个 operation 恰好交付一份结果；两份结果都由便利调用返回，并且都是持久记录（R2）。

没有代码实现 promotion。M9 从 `harness.md` 移除了被撤回的设计；本节只作为历史决策记录保留。

## 6. R1 — Lane 拥有的带标签 inbox {#6-r1--lane-owned-tagged-inbox}

### 目标 {#goal}

先把全部排队输入移到一个 lane 拥有的带标签 inbox（R1a，已实现），然后——在 R3 之后——用一个共享原子边界规划器替换过渡性逐步 checkpoint drains（R1b）。`Control.drained*` 保留到 M7 引入 drain-and-return abort；它不是 inbox 所有权的一部分。

### R1a — 所有权搬迁 {#r1a--ownership-relocation}

- `src/harness/session/types.ts` — 带 `InboxItem { entryId, kind }` 的持久 `LaneState { currentOperationId, inbox }` 替换 `pendingNextRun`；删除 `Inbox` 和 `RunScope.inbox`。暂时保留 `Control.drained*`、`skipInboxOnce` 和 `thresholdCheckedTriggerEntryId`。
- `src/harness/runtime/types.ts` — 进程局部 `LaneState.inbox` 替换 `pendingNextRun`；`LanePatch.inbox` 把持久 lane-state 替换与进程局部发布配对。
- `src/harness/runtime/lane.ts` — 接纳按标签和 mode 选择，但把选定项按全局接纳顺序放置，然后是请求 prompt entries；它与 `LaneBusy` 检查原子地删除选定 pending 值并移除其 ids。单独排队的 write 从不校验接纳。任何 operation 期间的 `append` 入队一个 write 标签的 lane 项而不触碰 operation 状态；空闲 `append` 先放置排队 writes，然后是新 entry，在一次 commit 中。`watch` 从 lane inbox 派生 queues 和 pending writes。
- `src/harness/runtime/drive/checkpoint.ts` — 过渡性逐步 drains 读取并替换 lane inbox，而不是 operation 状态。`skipInboxOnce` 和 `thresholdCheckedTriggerEntryId` 继续保护那些临时多 commit 边界。
- `src/harness/runtime/drive/terminal.ts` — operation cleanup 从不删除 lane-inbox payloads。暂存的 `outcome_ready` 结果、被 drain 的 abort payloads 以及其他 operation 拥有的地址不变。
- `src/harness/runtime/drive/{generation,response,deferred,tools,structural}.ts` — `runScopeOf` 和 scope 副本丢掉 `inbox`；普通 operation-state transitions 不能覆盖并发输入。
- `src/harness/runtime/restore.ts`、fork/遗留规范化以及聚焦测试使用带标签的 lane inbox。

### R1b — 共享原子边界规划器 {#r1b--shared-atomic-boundary-planner}

**在 R3 之后落地**，因为 R3 之前 structural 结果边界分散在三重复制的 publishers 中：把规划器融进三臂再在 R3 中折叠它们会是双倍工作，而 R3 之后单个 `ResultBoundary` switch 恰好是一个规划器调用点。两个 `CheckpointData` patch 字段作为惰性行李通过 R3 的机械重命名。

**核心不变量：没有任何边界决策会 commit 回 `checkpoint`。** `checkpoint` 是持久的“边界 pending”休息 leaf，只从 settlements、run-start 消费和 deferred 赎回进入。其 pass 的每一次退出都是 `assistant.ready`（带任何已放置 entries）、`summary.deciding`、已放置 follow-up + `assistant.ready`，或终端事务。

一个带进程局部 `threshold: "check" | "skip"` 参数的共享边界规划器恰好有两个调用方：

- `checkpoint` pass（`threshold: "check"`）：选择 write + steer（modes，全局接纳顺序）→ threshold 守卫 → continuation → followUp（在 `may_finish`）→ `before_run_end` → finish；一次 commit；
- `resume_checkpoint` 的 structural 结果边界（`threshold: "skip"`）：**同一规划器在发布 commit 内部运行**——compaction entry（成功时）在先，然后是选定 write/steer 项，然后是被路由的 continuation，全部在一次事务中。任何已放置的对话项都路由到以该项为 trigger 的 `assistant.ready`，覆盖 `may_finish` resume continuation（steer 语义）。没有排队时：`need_assistant` resume 直接 commit `assistant.ready`；`may_finish` resume 把 `checkpoint{may_finish}` 作为休息 leaf commit，live pass 继续进入 finish 阶段。

**没有持久标记的 threshold。** 守卫从 branch 派生：threshold 只在 `shouldCompact` 成立且最新 compaction entry 比 trigger entry 更旧时开火。因此一次已 commit 的 threshold compaction 就是它自己的标记——任何崩溃再进入都会看到更新的 compaction 并跳过。一次 **被拒绝的** threshold compaction 不发布 entry 且不需要标记：拒绝从不落在 `checkpoint` 上。拒绝决策在其单次 continuation commit（`assistant.ready`、follow-up + ready，或 `before_run_end` 之后的终端）之前保持进程局部在 `summary.deciding`；该窗口中的崩溃恢复 `deciding` 并按其文档化的重复契约重跑 `before_compaction`。Live 拒绝/再检查循环在结构上不可能，因为没有任何拒绝路径再进入检查 threshold 的 pass。

**mutation line 上没有 hooks 的 `before_run_end`。** Finish 臂是那一个多阶段情况：（1）线上裁决，不 commit——只在 `may_finish` 且没有合格 write/steer/followUp 时到达；（2）hook 在 line 外运行；（3）线上 **从当前状态重新规划**——如果 inbox 获得了合格项或 control 改变了，陈旧 hook 结果被丢弃，规划器采取新决策；否则单次 commit 是 follow-up 注入（entry + `assistant.ready`）或终端事务。丢弃陈旧是重新规划，不是版本检查。

具体 control 轨迹（R3 之后的名称；带 `may_finish` resume 以及 compaction 中途到达的 steer 的 threshold compaction）：

```text
TX1 settlement:  response n7 + usage + tip, S=checkpoint{may_finish, trigger n7}
pass (check):    shouldCompact && newestCompaction < n7 → prepare
TX2:             preparation, S=summary.deciding{boundary: resume_checkpoint{may_finish, n7}}
TX3 (any time):  steer s1 → pendingEntry(s1), laneState.inbox += s1
TX4..n:          deciding → ready → effect_pending → nested request/usage settlements
TX-pub (skip):   insert compaction c1, tip=c1, insert s1 entry (parent c1),
                 delete pendingEntry(s1), laneState.inbox -= s1,
                 S=assistant.ready{trigger s1}          ← one commit, checkpoint never re-entered
…turn answers s1; next settlement → checkpoint{may_finish, trigger n9}
pass (check):    newestCompaction c1 > … tokens small → no threshold; inbox empty; verdict finish
                 → before_run_end off-line → replan: still empty, still running
TX-final:        record + cleanup + laneState{current: null, last: op}
```

TX4..n 与 TX-pub 之间的崩溃 → structural recovery（attempt 未知，按现有规则）；hook 窗口期间的崩溃 → `checkpoint{may_finish}` 被恢复，pass 重跑（threshold 被新近性守卫跳过），hook 按契约重跑。

切片，按顺序（顺序是承重的——在拒绝仍再进入 `checkpoint` 时删除标记会造成 live 循环）：

1. **R1b-1**：把未来共享规划器融进 structural `resume_checkpoint` 边界（`threshold: "skip"`）；structural 成功/拒绝直接路由，除了 `may_finish` 休息 checkpoint，在持久标记仍存在时对任一结果都安全。保持路由内联，直到 R1b-2 创建其第二个调用方。两个 patch 字段仍由旧 checkpoint pass 写入和检查——无害。
2. **R1b-2**：把 `checkpoint` pass 转换为带新近性守卫的单 commit 退出，实现三阶段 finish 臂，删除 `skipInboxOnce` 和 `thresholdCheckedTriggerEntryId`。

### 规则 {#rules}

- §1 资格表、全局放置顺序，以及一次决策一次 commit 目标是规范性的。
- Queue modes 在选择时应用。余项保留全局接纳顺序，并且只在更晚的合格边界被消费。
- nextRun 项从不在 run 中途被消费，也从不阻塞 run finish。
- Deferred-suspension enqueue 总是接纳；消费发生在赎回后边界。

### 聚焦验证 {#focused-validation}

空闲/run/structural/cancelled 状态期间的 enqueue 总是接纳；接纳在应用 modes 并保留余项的情况下保持全局顺序；`one-at-a-time` 节奏给每一个剩余 steer 它自己的更晚边界；followUp 在空闲接纳时被捕获，并且在 run 期间只在 `may_finish` 时被捕获；边界 commit 之前的崩溃不消费任何东西；threshold 按构造每个边界至多检查一次；空闲 append 先放置排队 writes；项在每一种终端状态和进程丢失后存活；`cancelQueued` 在每一个边界工作；watch 按标签分组而不改变顺序；没有任何终端事务删除 lane-inbox payload；单独排队的 write 从不校验接纳。

## 7. R2 — 中性 operation outcome 与持久结果记录 {#7-r2--neutral-operation-outcome-and-durable-result-records}

### 目标 {#goal}

用一份不可变的每 operation 结果记录替换三个按家族的 outcome unions 和 `laneLastResult`。该记录 **就是** 公开 settled outcome；没有单独的 outcome 类型，没有嵌入 entries，也没有 hydration。

### 类型 {#types}

```ts
type TerminalStatus = "completed" | "declined" | "aborted" | "failed";

/** Stored at operationResult(operationId) — namespace "pi.result" — by the terminal transaction. Immutable, lane-lived. */
interface OperationResultRecord {
  operationId: string;
  kind: "run" | "compaction" | "navigation";   // meta.intent.kind; matches OperationAdmission.kind
  status: TerminalStatus;
  error?: OperationError;              // status "failed"
  fromTipId: string | null;            // meta.sourceTipId — start of the transcript segment
  tipId: string | null;                // lane tip at terminal — end of the segment
  startedAt: number;                   // Unix ms, from meta
  endedAt: number;                     // Unix ms, Date.now() at terminal planning
}

/** Convenience-only suspension observation for prompt()/resume() (M8). Never stored. */
interface SuspendedRun { operationId: string; status: "suspended"; deferred: DeferredHandle }
```

该记录是一份处置加上指向 transcript 段 `(fromTipId, tipId]` 的指针。它从不列出中间工作（compactions、turns、tools），也从不嵌入 entries。**没有 `tipEntry` 也没有 `OperationOutcome` union**：想要 payload 的调用方用已经公开的 `getEntry`/`findEntry` 解引用 `tipId`（对 runs，最终消息另外已由 `message_end`/`entry_added` 投递）。这买到三件事：终端规划器执行零次 outcome 读取，观察不能因缺失 entry 而失败（hydration 内部的 `getEntries` 抛出曾是只读便利的 harness-fault 路径），并且未来 protocol 从不在结果内序列化 `Entry`——一份结果帧是八个扁平字段。`SuspendedRun` 是那一个非终端观察，只存在于便利返回上，并且不携带可在别处派生的任何东西。

### 文件 {#files}

- `src/harness/session/types.ts` — 添加记录；删除 `LaneLastResult` union；`LaneState` 获得 `lastOperationId: string | null`；删除 `failure_drain`、`RunFailureDrainOperation` 和 `FailureProvenance`。
- `src/harness/session/values.ts` — `operationResult(operationId) = value<OperationResultRecord>("pi.result", operationId)`；删除 `laneLastResult`。`pi.op.*` 生命周期语法保持完全：没有任何 operation 存活命名空间在其终端事务之后存活。
- `src/harness/agent-harness.ts` — 删除 `RunOutcome`、`CompactionOutcome`、`NavigationOutcome`、`OptionalFinalAssistant`、`TerminalOperationOutcome`、`ResumeOutcome` 以及过渡性 `OperationOutcome` union；`DriveOutcome.settled` 直接携带 `OperationResultRecord`（没有重复的 `operationId` 字段）；结果别名变为
  `RunResult = Result<OperationResultRecord | SuspendedRun, …>`，
  `CompactionResult = Result<{ compaction: OperationResultRecord; run?: OperationResultRecord | SuspendedRun }, …>`，
  `NavigationResult = Result<{ navigation: OperationResultRecord; run?: OperationResultRecord | SuspendedRun }, …>`，
  `ResumeResult = Result<OperationResultRecord | SuspendedRun, …>`；
  `QueueResult` 失去 `NoActiveRun` 并吸收 `NextRunResult`。`SuspendedRun` 在此声明，但只由 M8 便利路径构造。
- 结束事件 payloads，每种事件类型一种形态：`run_end` 和 `navigation_end` 携带 `{ runId, status, error?, fromTipId, tipId }`。`compaction_end` 是段事件，不是终端事件——它也关闭 run 内 threshold/overflow 括号——并且总是携带 `{ runId, reason, status: "completed" | "declined" | "failed" | "aborted", error?, entryId? }`，其中 `entryId` 在成功时命名 compaction entry。嵌入的 `entry`/`summaryEntry`/最终 assistant 字段在各处被丢掉（`entry_added`/`message_end` 已经投递 payloads）。
- `src/harness/runtime/types.ts` — `FinishDecision` 携带记录而不是 `lastResult`。
- `src/harness/runtime/lane.ts` — 按 §2 的终端后缀；`getLastResult` 被 `getResult(operationId, context): Promise<OperationResultRecord | undefined>` 替换——一次 `getValue`，别无其他；`inspectExecution` 只报告 `lastOperationId`。
- `src/harness/runtime/drive/terminal.ts` — `hydrateTerminalOutcome`/`hydrateOperationOutcome` 被彻底删除；该文件只保留 `operationCleanupWrites` 和 `operationResultRecord` 构造器。Finish 决策从它们已经构建的记录物化 `{ kind: "settled", outcome: record }`——任何终端规划器内部都没有 reader 解引用。
- `src/harness/runtime/drive/{checkpoint,response,structural,recovery,deferred,tools}.ts` — 每一个 finish 决策都构造记录；`runCompletion`、按家族的 last-result 构造以及结果中的最终 assistant 管道被删除。每一个先前的 `failure_drain` 生产者改为直接 commit 终端失败：response 发布和 cleanup 留在同一事务中，run 内 structural 失败先关闭 `compaction_end` 再关闭 `run_end`，排队的 lane 输入保持不动以供更晚的普通 run。（`latestAssistantEntryId` 留在 scope 中用于 cancellation 分类和 checkpoint 逻辑；它只是不再喂给结果。）
- `src/harness/runtime/restore.ts` — restore `lastOperationId`；attachment 从不读取记录。
- 聚焦测试。

### 规则 {#rules}

- 记录恰好由终端事务写入一次，并且从不被 recovery 删除、更新或读取。
- 终端 control 不变量（§1）：在持久 `cancel_requested` 下的终端事务记录 `aborted`；没有任何路径在 cancellation 下 commit 任何其他 status。M7 添加强制测试；M9 添加 Part 9 不变量。
- Forks 排除 `pi.result` 值。
- `drive(id)` 臂：当前 → 安装/加入；记录 → 直接返回；两者都没有 → `OperationMismatch`。

### 聚焦验证 {#focused-validation}

为每一种 operation kind 和 status 的每一条终端路径写入记录；`drive(id)` 跨 reopen 为任意旧 ids 返回记录；`getResult` 是返回记录或 `undefined` 的朴素 value 读取；没有任何终端规划器或观察路径为结果读取 entries；`lastOperationId` restore；suspension 从不存储；fork 排除；段指针正确（`fromTipId` = 接纳前 tip，包括 navigation）；`compaction_end` 关闭独立和 run 内括号，包括通过调和的 `aborted`；每一个先前的 failure-drain 生产者在一次事务中完成，并为更晚的 run 保留每一个 lane-inbox 项。

## 8. R3 — 家族中性 leaves 与 structural 重建 {#8-r3--family-neutral-leaves-and-structural-rebuild}

### 目标 {#goal}

把 22 个 leaves 折叠为 §1 中的 13 个；在一份带显式结果边界数据的 summary 四元组上重建 `structural.ts` 的状态形态层。

### 类型 {#types}

```ts
interface OperationScope { control: Control; settings: RunSettings; latestAssistantEntryId: string | null }

type ResultBoundary =                                  // closed; do not extend
  | { kind: "resume_checkpoint"; resumeAfter: CheckpointData }   // in-run threshold/overflow
  | { kind: "finish" }                                            // standalone compaction
  | { kind: "commit_navigation"; targetId: string; label?: string };

interface SummaryTask {
  taskId: string;
  reason?: "manual" | "threshold" | "overflow";
  customInstructions?: string;
  boundary: ResultBoundary;
}
```

Summary 算法 kind **从 boundary 派生**（`resume_checkpoint`/`finish` → compaction；`commit_navigation` → branch summary）；它不被存储，因此没有任何矛盾的 kind/boundary 组合可表示。`summary.ready/effect_pending/retry_wait` 另外携带 generation snapshot（结果 entry id、配置、stream options、retry 策略、attempt 计数器）；snapshot 丢掉它先前重复的 `taskId`/`kind`/`reason` 字段。规范声明落在 `session/types.ts`。统一 scope 意味着 compaction/navigation 接纳像 run 接纳一样恰好捕获 `settings`；对 structural intents，`latestAssistantEntryId` 保持 null。

### 可达性（restore 检查；替换 intent-prefix 检查） {#reachability-restore-check-replaces-the-intent-prefix-check}

| Intent | 可接纳 leaves |
| --- | --- |
| run | `starting`、`checkpoint`、`assistant.*`、`tools`、`deferred.*`、boundary 为 `resume_checkpoint` 的 `summary.*` |
| compaction | boundary 为 `finish` 的 `summary.*` |
| navigation | `navigation.ready_to_commit`；boundary 为 `commit_navigation` 的 `summary.*` |

按构造禁止且不可达（在测试中断言，从不实现）：除接纳之外进入 `starting` 或 `navigation.ready_to_commit` 的任何边；`summary.*` 直接 → `tools`/`assistant.*`；`navigation.ready_to_commit` → `summary.*`；终端 → 任何东西。

### 结果边界规则 {#result-boundary-rule}

每一个 summary 边界（hook 拒绝、hook 提供的结果、生成成功、终端 generation 失败、model 不可用）都在 mutation line 上规划，并在一个可见处对 `boundary` switch：

- `resume_checkpoint` → 在成功或 threshold 拒绝时发布结果并恢复被标记的 checkpoint；overflow 拒绝或 structural 失败在同一 commit 中关闭 compaction 括号并终端失败该 run；
- `finish` → 在一次 commit 中发布 compaction entry 并终端完成（或终端拒绝/失败）；
- `commit_navigation` → 单次 move/summary/label/终端 commit（或终端拒绝/失败）。

`cancel_requested` 边界推迟给调和，并且从不采取其 continuation。

### 文件 {#files}

- `src/harness/session/types.ts` — 13-leaf union、`OperationScope`、`SummaryTask`、`ResultBoundary`；删除 `RunScope`、`CompactionScope`、`NavigationScope`、`NavigationSummaryScope`、`RunCompactionScope`、`StructuralTask`、按家族的 `Extract` 别名、`isRunOperationState`。
- `src/harness/runtime/drive/structural.ts` — 重建：保留 `durableCompactionPreparation`/readers、嵌套 request 接缝、`performStructuralAttempt`、`runCompactionThreshold`、`prepareOverflowCompaction`、`commitNavigation`；删除七个 union 别名、`startsWith` 守卫，以及三臂的 `effectPendingFromReady`/`retryWaitFromEffect`/`readyFromRetryWait`/`publishStructuralReady`/`publishStructuralDecline`/`publishStructuralFailure`/`publishCompactionResult`-vs-`publishNavigationSummary` 拆分；一份四元组转换器加上一次边界 switch 替换它们。
- `src/harness/runtime/drive/{checkpoint,generation,response,recovery,deferred,tools,tool-placement,terminal}.ts` — leaf 字面量重命名（`run.checkpoint` → `checkpoint`，…）；`response.ts` overflow 臂用 `resume_checkpoint` 构造 `summary.deciding`；没有其他行为变更。
- `src/harness/runtime/progress.ts` — frame/checkpoint 栅栏当前匹配 leaf 字面量 `"run.assistant.effect_pending"`、`"run.deferred.effect_pending"` 和 `"run.tools"`；把它们重新指向中性 leaves。
- `src/harness/runtime/restore.ts` — 上面的可达性谓词。
- `src/harness/runtime/lane.ts` — `capturedModel` 和 `watch` 在中性 leaves 上 switch；接纳写入中性初始 leaves。
- `docs/runtime-simplification.md` — 替换 22-leaf 列表和状态。
- `test/harness/runtime/drive-structural.test.ts` 以及其他聚焦测试 — 重新指向；行为断言存活。

### 聚焦验证 {#focused-validation}

M6 基础覆盖的一切，在中性 leaves 上重新表达，加上：可达性接受/拒绝矩阵（包括损坏的 boundary/intent 组合使 restore 失败）；每一个边界臂 × {success, hook result, decline, failure, model absence} × {running, cancelled}；一次 post-terminal 泄漏扫描，断言每一个 leaf 的每一个 `pi.op.*` 地址都已消失，同时 `pi.result` 记录存在；在每一种能到达它的 intent 下，在每一个 leaf 处崩溃/reopen。

## 9. M7 — Cancellation 调和与完全 switch {#9-m7--cancellation-reconciliation-and-total-switch}

### 目标 {#goal}

**已实现并已评审。** 在没有公开接线的情况下让内部图完全。

创建 `src/harness/runtime/drive/reconcile.ts`、`src/harness/runtime/drive.ts`，以及聚焦调和与 switch 测试。

### `requestOperationAbort` {#requestoperationabort}

包私有的 expected-id 原语：

1. 当 expected id 不是当前持久 operation 时用 `OperationMismatch` 拒绝，包括该 id 已经有一份 settled 结果记录时；
2. 在匹配的 live Drive 上同步 `beginAbort`；
3. Session line 上一次 commit：`control = cancel_requested`（没有 drained 字段）**加上** 从 lane inbox 移除 steer/followUp 标签的 ids 并删除其 `pendingEntry` 值；payloads 在同一 mutation 中读取并返回；nextRun/write 项留下；
4. commit 之后 `signalAbort`；
5. 在新请求的 abort commit 之后，发布 `{ type: "operation_abort", operationId, steer, followUp }`，并在 cancellation 持久后返回一次。这个家族中性事件替换 `run_abort`/`runId`；lane snapshot 已经标识 operation kind。针对同一当前已取消 operation 的重复调用不发布任何东西，不再进一步 drain，并报告 `newlyRequested: false`。

没有 Drive 但有匹配的当前持久 operation 时，它 commit 同一标记并且不启动 pass。没有 `control.drained*`；被 drain 的 payloads 只存在于返回结果中（已接受的损失：abort 窗口内的崩溃丢失其内容）。

### 调和 {#reconciliation}

在 `before_drive` 和普通 dispatch 之前检查；在 13 个 leaves 上单次 switch；从不启动新的普通工作。它必须处理：

- 带 live 或重建结果的 assistant 和 deferred effects；
- planned/effect-pending/outcome-ready tool 调用；
- structural 进程局部结果（除非已经原子发布，否则丢弃）；
- 已取消 summary 边界以 `aborted` 完成，而不采取其 `ResultBoundary` continuation；
- retry waits、checkpoints 以及被挂起的 deferred 工作；
- 使用 Drive 仅 close 的 signal、从不使用其已经触发的 operation-abort 门控的尽力 deferred-provider cancellation；
- aborted 终端事务（结果记录 `status: "aborted"`）；
- 终端 control 不变量测试：没有任何终端路径在已取消 control 下 commit 非 aborted status（这让 §10 的 continuation 规则只从记录即可判定）。

排队的 lane-inbox 项 **不** 被调和应用或删除；nextRun/write 项只是保持排队。

每一个 Drive 拥有一个私有 close controller，并将其 signal 暴露给强制 cleanup。`closeGate()` 在 harness close 或 fault 时 abort 该 controller；operation abort 不这样做。Deferred-provider cancellation 使用这个仅 close 的 signal，因此 cleanup 请求可以在持久 operation cancellation 之后开始，但不能活过 harness shutdown。不要添加 harness 全局 cancellation controller。

### 完全 switch {#total-switch}

`runtime/drive.ts` 拥有一次直接的 `state.at` switch，覆盖 13 个 leaves。它只导入完整过程模块。没有图表、action interpreter、ownership-loss 臂、外部终结臂或 storage-state 重载。`continue` 结果必须对应被替换的 `Lane.state` 投影 **或** 当前可观察的 `cancel_requested` control，switch 在普通 dispatch 之前把它路由到调和；任何其他未改变的 continuation 都是不变量缺陷。

公开方法在 M7 期间仍被守卫。

## 10. M8 — 公开表面 {#10-m8--public-surfaces}

**已实现。** 只在每一个 leaf 和调和路径都变为完全之后才移除执行守卫。

顺序：

1. 接纳 compaction/navigation 请求（接纳捕获 `settings`；写入 R3 入口 leaves）；
2. 实现 `drive` 安装/加入/记录查找（三臂，§7）；
3. 暴露 `requestAbort`；
4. 添加便利组合；
5. 添加 queues/configuration/usage/idle 表面；
6. 把 `watchSession` 保留为唯一的 `SliceNotImplemented` 方法。

### Queues {#queues}

`steer`/`followUp`/`nextRun` 是一次 enqueue 上的标签糖，并且总是接纳。`queue_update` 和 `LaneSnapshot.queues` 暴露同一带标签有序 inbox，包括 pending writes；客户端按标签分组而不重排它。

### 客户端复制表面 {#client-replication-surface}

来自一份可工作的 RPC 形态客户端副本（mini TUI 练习）的发现在此折叠进来。目标是一份可测试契约：远程客户端只从复制的 `LaneSnapshot` 和事件流渲染，没有旁路 getters。

- **规范性 reducer。** 从 `packages/agent` 导出 `reduceLaneSnapshot(snapshot, event): LaneSnapshot | { rebase: true }`。它是唯一受支持的事件折叠：run 内 `compaction_start`/`compaction_end` 是段，不得清除 `operation`（折叠知道打开 operation 的 kind，因此不需要事件字段）；`run_suspend` 保持 `operation` 非 null 并设置 `deferred`；只有 `run_end`、`navigation_end`，以及 compaction-kind operation 下的 `compaction_end` 是 operation 终端。`navigation_end` 返回 `{ rebase: true }`，因为被移动的 tip 可能位于副本之外。符合性断言：对每一个非 navigation 流，把一份 `watch()` snapshot 折叠过其自己的事件流等于稍后的 `watch()` snapshot——这个等价测试就是保持事件词汇完整的东西。
- **Snapshot 完整性。** `LaneSnapshot` 获得 `configuration: LaneConfiguration`、`lastResult?: OperationResultRecord`（替换光秃的 `lastOperationId` 字段）、真实的 `faulted` 标志（当前硬编码的 `false` 是缺陷），以及作为 usage 基线的 session `stats: SessionStats`（usage 事件已经携带 `totals`；snapshot 在第一个事件之前提供该值）。
- **可复制配置事件。** 每一个其值是数据的 `config_update` 变体都携带 `value`/`previous`（`streamOptions`、`retryPolicy`、`compactionSettings`、`steeringMode`、`followUpMode`，加上现有 lane 变体）；`tools`/`resources` 保持仅通知，因为 registries 是代码——客户端重新获取名称。
- **基于身份的 `setModel`。** `setModel` 接受 `ModelIdentity`（`{ provider, modelId }`）；live `Model` 对象是进程局部 registry 关切，未注册身份在 generation 时带内失败，恰好像任何 registry 缺失一样。
- **Re-basing。** `WatchHandle.resnapshot(context): Promise<LaneSnapshot>` 在 mutation line 上捕获一份针对同一流序列化的全新 snapshot——`{ rebase: true }` 之后没有拆除/再订阅编排的恢复路径。
- **Start 事件时间戳。** `run_start`/`compaction_start`/`navigation_start` 携带 `startedAt`（operation 开始：`meta.startedAt`；run 内段开始：commit 时间戳），因此折叠从不发明时间。

### 便利组合与 continuation {#convenience-compositions-and-continuation}

- `prompt`/`skill`/`promptFromTemplate`：accept + drive；返回 `Result<OperationResultRecord | SuspendedRun, …>` — 终端 outcomes 是记录，run defer 时是 `SuspendedRun`。
- `compact`/`navigateTree`：accept A + drive A。如果 A 以 status `completed`、`declined` 或 `failed` 结算，并且存在合格 steer/followUp/nextRun 项，则用 **公开空 prompt 请求**（`{ kind: "prompt", prompt: "" }`）接纳 continuation run B：接纳不放置请求消息，并且恰好当其捕获放置至少一条对话项时合法；`OperationMeta.intent` 是带空 `promptEntryIds` 的普通 run intent。然后 drive B 并返回 `{ compaction|navigation: A, run?: B }`。从不在 `aborted` 之后：abort 已经 drain 了 steer/followUp，并且终端 control 不变量（§7）使 `status ∈ {completed, declined, failed}` 意味着该 operation 从未被持久取消，因此该规则只从记录即可判定。B 是一次普通 run——它发出 `run_start`，运行 `before_run`（带 `prompt: []`，现有仅捕获接纳形态），并拥有完整 run 图，没有 continuation 感知特例。
- Continuation 竞态：赢得空闲窗口的竞争 accept 把排队输入捕获进它自己的 run；continuation accept 随后空失败（`InvalidMessage`）或 `LaneBusy`，便利返回没有 `run` 的 A。两种历史都有效。A 的终端与 B 的接纳之间的崩溃让项保持排队；reopen 时没有自动启动。
- `resume`：inspect + drive 当前 id，一个 deferred-poll permit；返回 `OperationResultRecord | SuspendedRun`。
- `abort`：inspect + `requestAbort` + 确保一次调和 pass；返回被 drain 的 steer/followUp payloads。
- `getResult(operationId)`：公开。
- 等价：每一次便利调用 ≡ 只用公开请求 kinds 的其原语组合（带 continuation 的 `compact()` ≡ `accept(A); drive(A); accept({ kind: "prompt", prompt: "" }); drive(B)`），字节相同的写入和事件——可由任何调度器从外部复现。

### 聚焦验证 {#focused-validation}

一次安装和同 id 加入；陈旧 id 隔离；旧 ids 的记录查找；安装前/后的调用方 cancellation；合作和不合作 effects 期间的 close/fault；accept/drive 对便利等价，包括通过公开空 prompt 请求的 continuation；仅 steer、仅 followUp 和仅 nextRun 的 continuation 各自启动 run B；两种 continuation 竞态顺序；abort drain-and-return，包括两种顺序的 abort/settlement 竞态；通过公开表面在每一种状态期间 enqueue；跨全部 13 个 leaves 的完整崩溃矩阵；没有未处理的分离 rejection；除 `watchSession` 外没有 `SliceNotImplemented`；跨每一个非 navigation 流的 reducer 折叠等价（包括 run 内 compaction 段、suspend/resume、retry waits 以及流中途再附着）；`navigation_end` 折叠返回 rebase，并且 `resnapshot` 恢复等价；snapshot `configuration`/`lastResult`/`faulted`/`stats` 只通过事件复制。

## 11. M9 — 文档调和 {#11-m9--documentation-reconciliation}

**已实现。** `docs/harness.md` 已与 runtime 调和并自行具有规范性。更新的各节包括：

- §1.3 地址表和生命周期语法：新的 lane 存活 `pi.result` 命名空间，移除 `laneLastResult`，`LaneState.inbox`/`lastOperationId`；`pi.op.*` 保持严格 operation 存活；
- §1.7 引用 `pi.lane.lastResult` 的 JSONL/SQLite 示例；陈述有界增长权衡——每个 operation 一份小型不可变记录，永久保留，经 JSONL snapshot compaction 携带；
- §2.9 精确重写：决定并记录对那些其 `tipId` 被 rewrite 移除的记录的策略（保留悬空或删除）；
- §3.1–§3.2 状态形态：13 个中性 leaves、`OperationScope`、`SummaryTask`/`ResultBoundary`（kind 从 boundary 派生）、没有 drained 字段的 `Control`、没有 `skipInboxOnce`/`thresholdCheckedTriggerEntryId` 的 `CheckpointData`；
- §3.5 图（一份 summary 四元组，边界臂）；
- §3.6 接纳：按标签尊重 mode 的选择、全局接纳顺序放置、prompt entries 最后、空闲 followUp 资格，以及空 prompt continuation 接纳；
- §3.9/§3.10 在边界数据上一次表达的 summary 机制；
- §3.11 完整重写：一个 lane inbox、选择表、一次决策一次 commit 边界、迟到 steer 的静默推迟（未消费的 steer 成为未来 run 输入而不是错误），以及 structural operations 期间无界 write 挂起，带 `waitForIdle`-then-append 逃生口；
- §3.12 checkpoint 过程：一次 commit 的边界决策替换逐步算法；失败终端化，同时排队 lane 输入留给更晚的普通 run；
- §3.13 终端事务：结果记录、通用后缀、观察契约（`drive(id)` 完全，`getResult`）；
- §4.6 abort：drain-and-return、没有 drained control，以及客户端可见后果——被 drain 的 steer/followUp payloads 只存在于返回结果中，因此该窗口中的崩溃或丢失响应会永久丢失其内容；
- §5.1 lane 表面和全部结果类型；§5.5 `queue_update` 和结束事件 payloads（带 `aborted` 的作为段事件的 `compaction_end`）；
- Part 9：invariants 12–16、21、26（结果记录生命周期、通过记录观察、continuation 等价）、新的终端 control 不变量（非 aborted 终端 status 意味着 running 终端 control），以及触及 drained 项、`cancelQueued` 和 continuation 的 race catalog 行；
- Appendix A 术语表（Inbox、Result record、Continuation run、Boundary pass；移除 Drained）；
- §5.5 事件分类：明确陈述哪些事件是 operation 终端（`run_end`、`navigation_end`、compaction-kind `compaction_end`）对段括号（run 内 `compaction_start`/`compaction_end`）对非终端生命周期（`run_suspend` 让 operation 持久打开），并命名 `reduceLaneSnapshot` 为规范性折叠；
- §2.5 branch-scan 锐边：`stopAtType` 在排序之后应用，因此 `oldestFirst` + `stopAtType: "compaction"` 返回最旧段；把规范上下文读取文档化为 `newestFirst` + reverse；
- serving-layer 边界陈述：相对 branch 的读取/appends 留在 `AgentLane` 上，而整棵 tree 浏览、forks、label inventory 和 session listing 住在它旁边、由 RPC facade 组合的 Session/repository 服务中。

还更新 `docs/runtime-simplification.md` 状态，并移除仓库文档中每一处剩余 promotion 引用。Grep 门控：

```bash
rg -i 'promotion|drainedSteer|drainedFollowUp|laneLastResult|lastResult|skipInboxOnce|thresholdChecked' packages/agent/src packages/agent/docs
```

（`src` 中匹配必须为零；文档可以只在已完成里程碑记录内保留历史注记。）

## 12. M10 — Provider KV-cache 身份评审 {#12-m10--provider-kv-cache-identity-review}

### 目标 {#goal}

**已实现并已评审。** 单独的核心 Session 身份不是有效的 provider cache 谱系：若干 lanes 可能在分叉 transcripts 上发出并发请求。因此普通 assistant 请求从 Session metadata id 加上 lane 名称派生身份；structural 请求保持隔离。

### 评审范围 {#review-scope}

- 清点每一个设置、保留、派生或消费 `SimpleStreamOptions.sessionId` 的 harness 和 pi-ai 路径，包括 prompt-cache keys、affinity headers、WebSocket/session-resource caches、deferred 请求以及 structural summary 请求。普通 harness generation 现在转发派生的 lane 身份；遗留 `src/agent.ts` 保留其独立 conversation id；structural summary 请求铸造全新 ids。
- 定义与持久 Session id 和 operation id 不同的 provider-request cache 谱系。并发 lanes 不得仅仅因为属于同一 Session 就共享一条谱系。
- 把普通 assistant 谱系派生为 `Session metadata id + ":" + lane name`；不要存储另一份持久标识符。它对 lane 的生命周期保持稳定，并在同一 Session 的 lanes 之间不同。
- 在普通 assistant turns 和 retries 上保留同 lane 复用。Compaction、navigation、branch 替换和 model 变更可能错过旧前缀，但不能错误复用它；不要添加轮换机制。
- 保持 structural summary 请求隔离：`cacheRetention: "none"` 以及每个嵌套请求的全新请求身份仍是基线，除非评审证明一种安全、有用的替代。
- 把 cache 身份与可观察性关联区分开。Session、lane、operation、task 和 request ids 仍可供 telemetry 使用，而不被盲目复用为 provider affinity/cache keys。
- 评审特定于 provider 的语义，而不是假定 `sessionId` 只意味着 KV caching；一些 adapters 也用它做 headers、WebSocket 复用、fallback 状态或资源 cleanup。

### 聚焦验证 {#focused-validation}

- 同一 Session 中两个活动 lanes 发出并发、分叉的 prompts，并接收不同的 provider cache/affinity 身份。
- 一个 lane 在复用有效的仅追加 assistant/tool turns 上保持稳定谱系。
- 上下文前缀不连续安全地错过旧缓存前缀，而不做谱系轮换。
- Assistant retries 保留 lane 身份；deferred handle polling 不需要 cache 身份。
- Structural 拆分 turn 请求保持与 transcript assistant caching 隔离。
- Faux-provider 测试断言稳定的同 lane 和不同的跨 lane 请求身份。

### 退出条件 {#exit-condition}

普通 assistant 请求使用派生的 lane 身份，structural 请求保持带 `cacheRetention: "none"` 的全新身份，并且 deferred handle polling 不发送 cache 身份。该策略记录在 `docs/harness.md` 中，并在 WP05 完成之前独立评审。

## 13. Mobile assistant-output 交接 {#13-mobile-assistant-output-handoff}

**被跟踪的跟进；不是 M8/M10 公开 drive 门控的一部分。** 一次平凡的 mini coding-agent Session 产生了大约 300 KB 的 JSONL 文件，因为 live assistant streaming 持久化许多 `pi.pending.assistant_frame` list appends。逻辑 frame cleanup 不回收已经追加到 JSONL 历史的字节，因此短对话可以有不成比例的持久存储和回放成本。

权威跟进是 [mobile assistant-output 交接](../mobile-handoff/01-harness/05-assistant-output/message-update.md) 及其在 [mobile 交接 README](../mobile-handoff/README.md) 中的编号前置条件。它处理完整路径，而不仅仅是批处理 frames：Chord op 跟踪、有范围的 pending-output 持久、tool/assistant 输出缩减，以及 `message_update` 复制放大。保留现有崩溃契约：已被接纳的 assistant effect 仍可重建，进度观察仍有用，并且结算退役 operation 拥有的 pending 状态。

退出检查：

- 代表性短流式响应不创建数十万字节的持久 frame 历史；
- 在每一个 assistant 和 deferred effect 边界崩溃/reopen 重建同一 pending 消息；
- frame/checkpoint writers 仍被栅栏到拥有的持久 effect；
- backend 符合性覆盖重建和有界写入放大。

## 14. 模块边界 {#14-module-boundaries}

```text
session/**             durable storage; imports no runtime module
execution/**           neutral provider/tool/gate mechanics
runtime/types.ts       LaneState, Drive, command decisions
runtime/progress.ts    frame/tool progress channels
runtime/drive/*.ts     direct procedures
runtime/drive.ts       total flat switch, created only in M7
runtime/lane.ts        Lane actor and public surfaces
runtime/harness.ts     Harness lifecycle and Lane composition
```

过程模块只类型导入具体 `Lane<TContext>`。`TContext` 保持 `object | undefined` 不变。没有 `any`、`Lane<any>`、`as unknown as`、`@ts-expect-error`、inline imports、parameter properties、enums 或其他不可擦除 TypeScript 语法。

## 15. 排除项 {#15-exclusions}

不要引入：

- 通用调度器、图、action interpreter 或 effect-plan DSL — `ResultBoundary` 保持封闭三臂数据 union，在一个可见处 switch；
- 按家族的 outcome unions、`OptionalFinalAssistant`，或存储记录中嵌入的结果 entries；
- 结果记录 listing、filtering、pagination、status 查询或 retention 机制；
- operation 拥有的 queues、drained-control 字段或终端 queue cleanup；
- 在便利层之下任何地方的自动 continuation（从不在 `drive` 内部）；
- 第二条 mutation line 或事务框架；
- 针对唯一顶层写入者的 expected-`at` 运行时检查；
- 进程局部 Drive 替换或调用方拥有的生命周期；
- 外部终结；
- 权威 control 状态的存储重读；
- 读缓存、读预算或通用 `getValues` 批处理；
- 任何重设计前持久形态的兼容别名；
- structural 事件上的 `phase`/段判别字段 — reducer 从打开 operation 的 kind 派生段对终端；
- `AgentLane` 上的整棵 tree、fork、label-inventory 或 repository 方法；相对 branch 的读取/appends 仍是 lane facade 的一部分，而更广的管理住在它旁边。

过程特定写入、effect 接纳、结算分类以及事件构造在其调用点保持可见。

## 16. 验证与评审 {#16-validation-and-reviews}

每一个代码阶段之后：

```bash
npm run check
```

从包根目录运行每一个被修改的聚焦测试文件。不要直接调用完整 Vitest 套件。只为最终包验证或在被明确要求时运行 `./test.sh`。

评审检查点在 R3、R1b、M7、M10 以及最终完成结束时强制。委托评审使用 provider `anthropic` 和 model `claude-fable-5`。

最终 greps：

```bash
rg 'lost_ownership|LostOwnership|DriveAbandoned|commandDriveOwned|installerSignal|finalizedOutcome|OperationEnded' \
  packages/agent/src/harness packages/agent/test/harness
rg 'drainedSteer|drainedFollowUp|laneLastResult|RunOutcome|CompactionOutcome|NavigationOutcome|TerminalOperationOutcome|skipInboxOnce|thresholdCheckedTriggerEntryId' \
  packages/agent/src/harness
rg 'SliceNotImplemented' packages/agent/src/harness/runtime
rg ': any\b|<any>|as unknown as|@ts-expect-error' packages/agent/src/harness/runtime
```

最终退出条件：

- 每一个扁平 leaf 都可 drive 且可调和；
- 公开原语/便利行为等价，包括 continuation；
- 每一个聚焦测试和 backend 符合性路径通过；
- 公开 drive 不暴露部分图；
- `watchSession` 是唯一推迟的公开方法；
- `drive(id)` 回答 session 中每一个已结算 operation id；
- harness.md 与实现自洽（M9）；
- provider cache/affinity 身份在并发和上下文重置历史上 lane 安全（M10）；
- 独立最终评审报告没有阻塞项。
