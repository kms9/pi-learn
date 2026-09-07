本文是 `runtime-simplification.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 现有 AgentHarness runtime 简化 {#existing-agentharness-runtime-simplification}

## 范围 {#scope}

重做 `packages/agent/src/harness/runtime/` 下的真实实现，以及 `packages/agent/src/harness/session/types.ts` 中的规范持久化类型。这不是隔离的 scratch spike。

执行图是完备的，公开 drive 已启用。Format 4 仍在进行中，因此持久化类型替换不需要迁移或兼容表示。

## 实现状态 {#implementation-status}

M6 之前的完成度量：

- 简化前 runtime 在 `eb1185d93`：5,358 行 TypeScript；
- 第一次简化后 runtime 在 `417905647`：4,667 行；
- 简化后的 substrate 在 `0e77e57d9`：4,654 行；
- M6 之前总减少：704 行（13.1%）。

简化回合已实现：

- 显式 `ContinueOperationResult<T>`，带 `cancel_requested`，取代隐式 `undefined`；
- 具体的 generation、deferred-poll 和 tool-call 阶段：准备不可变输入、发布持久化 intent、执行 effect、发布持久化结果；
- 共享的 assistant stream 协议消费与 Drive response 生命周期；
- 用于 assistant/deferred 共同持久化发布的 `publishResponse`，以及用于二者相同的 intent 前失败转换的 `publishConfigurationFailure`；
- 源顺序 tool 发布、一次读取的不可变源校验，以及隔离在 `runtime/drive/tool-placement.ts` 中的共享 tool-batch 重建；
- 同一次调用的 tool status 防御、未检查的 `toolOperation()` 强制转换及其结果联合类型被移除；真正的 sibling/progress/memo 检查被保留；
- 集中的 lane-storage 分类，没有重复的投影读取；
- 移除 checkpoint 死检查，并精确保留 checkpoint；
- `runtime/transcript.ts` 中的共享 transcript 机制；
- 更窄的 `LanePatch`，没有多余的 Drive promise-settlement 标志，也没有未使用的 operation reject 分支。

简化完成时，最大的文件是 `runtime/lane.ts`（约 996）、`runtime/drive/tools.ts`（约 663）、`runtime/drive/checkpoint.ts`（约 452）和 `runtime/drive/response.ts`（约 417）。

### WP05 结构状态 {#wp05-structural-status}

M6 在简化后的 substrate 上建立了结构性执行。其第一个连贯切片加入了：

- 共享的 compaction 有界 transcript/context 读取，以及已提交 entry 的事件装饰；
- 调用方拥有的单次 provider 请求接缝，用于 compaction 和 branch summary，同时为现有非 harness 调用方保留重试行为；
- `runtime/drive/structural.ts` 中每个结构性 `at` 叶子的直接过程；
- 每个触发一次的阈值路由，以及原子 overflow 准备发布；
- 每次请求的结构性 intent 与 usage settlement、attempt retry/recovery、hook 决策、compaction/navigation 发布，以及终端清理；
- 针对阈值/overflow 入口、跨 turn 拆分的请求记账、生成与 hook 结果、retry/cap/recovery、模型缺失、请求中途的持久化取消、navigation，以及准备损坏的聚焦覆盖。

随后 R1a、R2 和 R3 把排队输入移到 lane，用不可变 operation 记录替换 hydrated family 结果，并把 family 笛卡尔积折叠为 13 个中性叶子。R1b 用一个共享的原子边界规划器、从 transcript 派生的阈值守卫，以及离线 finish-hook 再规划，替换过渡性的 checkpoint drain 和标记字段。M7 移除已 drain 的控制，加入原子 drain-and-return 取消，对全部 13 个叶子做对账，并安装完备的直接 dispatcher。

M8 加入原语/便利 lane 表面、一个有序带标签 inbox、idle 所有权、snapshot/event 复制、`reduceLaneSnapshot` 以及远程 resnapshot。M9 对账规范说明。M10 恰好转发一个稳定的普通 provider 身份，由 Session metadata id 加 lane name 派生；结构性 summary 保持新鲜的请求身份。M10 完成时 runtime 为 7,410 行，`runtime/drive` 为 4,147，`lane.ts` 为 1,992，`structural.ts` 为 1,221，新的规范 reducer 为 193 行。相对已审查的 M7 checkpoint，公开/复制表面增加了 1,130 行 runtime；持久化的 13 叶子过程模型保持不变。

保持可见的持久化过程顺序：
`prepare → publish intent → perform effect → publish outcome`。
不要引入通用 Procedure 接口、runner、scheduler、graph、callback plan 或依赖 facade。历史 work-package 文档保持不变。

## 核心模型 {#core-model}

Lane 是一个进程本地 actor，覆盖一个持久化 lane 投影。

- `Lane.state` 对 tip、configuration、当前 operation、control、inbox ID 以及最新 operation ID 是权威的。
- 每一个受支持的 mutation 都通过 Session mutation line 提交，并在释放它之前发布匹配的 `Lane.state`。
- 一个 lane 拥有的 Drive 是推进 operation state 的唯一 writer。
- 同一 operation 的调用方观察同一个 Drive。没有任何调用方拥有它。
- 调用取消在 Drive 安装之后只停止该调用方的观察。
- `requestAbort` 是唯一的持久化 operation 取消。
- Close 封闭 mutation 受理。它既不改变 operation state，也不替换 Drive。
- 进程丢失销毁所有存活 continuation；恢复在附着之后从持久化状态开始。
- 执行期间的 Session 读取解引用 `Lane.state` 所命名的内容；它们从不重新发现控制状态。

## 持久化状态 {#durable-state}

`OperationState` 有一个判别器 `at`，带 13 个直接叶子：

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

每个叶子携带一个统一的 `OperationScope`。summary 四元组携带一个 `SummaryTask`；其封闭的 `ResultBoundary` 选择 run 内 checkpoint 恢复、独立 finish 或 navigation commit。summary 算法从该边界派生，而不是在状态中复制。`Control` 保持正交。`ToolBatch` 仍是子状态机，因为并行 tool 子项确实会并发地改变 sibling call status。

## 状态与内容边界 {#state-and-content-boundary}

过程从不读取这些地址来决定执行：

- `laneState`
- `operationMeta`
- `operationState`
- `branchTip`
- `laneConfig`
- `operationResult`

它们使用 mutation line 提供的当前 `Lane.state`。

存储读取仍只用于内容和清理：

- prompt、assistant、deferred-source、final-assistant 以及已完成 tool 的 entry；
- compaction 有界的 branch context；
- `pendingEntry` payload；
- assistant-frame list；
- tool 参数、memo 和 checkpoint；
- 结构性准备；
- 暂存的 tool 结果；
- 终端清理所需的 operation 拥有的前缀扫描。

## 并发模型 {#concurrency-model}

### Operation 推进 {#operation-advancement}

当 Drive 过程存活时，没有任何受支持的并发 actor 能够改变或移除其 operation state：

- inbox 方法只改变 inbox 字段；
- `requestAbort` 只改变 `control`；
- close 阻止后续 mutation 受理；
- 另一个同一 operation 的调用方加入现有 Drive；
- lane 忙碌时不能接受另一个 operation；
- 进程崩溃移除 continuation 本身。

因此，普通过程转换不重新检查 operation 是否存在、operation ID、operation kind、`at`、attempt 身份或嵌套 status。那些是 dispatch 建立的过程前置条件，不是受支持的竞态。

剩余的真实竞态是：

1. 取消在 effect 受理之前或 settlement 之前到达；
2. inbox 在 checkpoint 路由或终端 finish 之前到达；
3. 并行 tool 子项暂存并物化 sibling 结果；
4. 排队的 frame/checkpoint/memo 写入与 effect settlement 竞态；
5. retry 定时器与取消或 close 竞态；
6. deferred permit 消费；
7. Session line 上的 accept/claim 串行化。

### 取消边界 {#cancellation-boundaries}

取消只在三处检查：

1. 普通 dispatch 之前的 drive 循环；
2. 外部 effect 开始之前紧邻的 gate；
3. effect settlement，它看到当前 `control` 并提交相应的已取消结果。

普通转换 helper 可以在当前 control 为 `cancel_requested` 时集中拒绝推进。过程不手动重复该分支。

### Close {#close}

关闭 harness：

1. 标记 harness/lane 受理已关闭；
2. 封闭并排空 Session mutation line；
3. 通过 harness-close 观察 promise 拒绝客户端观察；
4. 保持每一个分离的 pass promise 被观察，以便后续拒绝永远不会变成未处理；
5. 在已受理 mutation 排空之后关闭 Session。

Close 不执行持久化写入，不安装替换 Drive，也不创建所有权丢失状态。迟到的 effect 可能返回，但其 mutation 会以 `HarnessClosed` 被拒绝。

Close 是否同时向进程本地的 provider/tool 工作发信号，是资源清理策略，不是持久化状态机行为。不要把它与 Drive 替换或恢复耦合。

## 小型具体 mutation API {#small-concrete-mutation-api}

用两个具体的 Lane 操作替换过程中反复出现的 `LaneCommand` 仪式。它们不是 scheduler、graph 或 action interpreter。

### `continueOperation` {#continueoperation}

用于普通非终端推进。

- 进入 Session mutation line。
- 接收当前权威的 Lane 投影和 operation state。
- 若 control 已取消，返回显式 `cancel_requested` 且不调用语义规划器；调用方不能把取消与规划器值混淆。
- 规划器提供过程特定的写入、下一个完整 `OperationState`、物化以及事件。
- helper 追加 `operationState` 写入，并发布匹配的进程本地 operation 投影。
- 它不校验期望状态或 `at` 值。

### `settleOperation` {#settleoperation}

用于已受理的 provider/tool/结构性 effect 之后，以及真正的并行子转换。

- 即使 control 已取消，也进入 Session mutation line。
- 向语义 settlement 规划器提供当前 control/inbox 字段以及进程本地 effect 结果。
- 原子提交 payload、usage、tip 移动、清理以及分类后的下一状态。
- 追加规范的 operation-state 写入并发布匹配投影。
- 当规划器返回终端决策时，追加不可变 `operationResult`、带 `lastOperationId` 的 idle `laneState`，以及 idle 的进程本地投影。

调用方提供类型化结果、清理/发布写入、最后结果和事件。终端业务决策仍在拥有该过程的代码中可见。

## 持久化过程形状 {#durable-procedure-shape}

有 effect 的过程暴露四个具体阶段：

```text
prepare immutable inputs
→ publish durable effect intent
→ perform the external effect
→ publish one durable outcome
```

intent 阶段必须保持可见，并且位于外部 effect 之前。否则 effect 之后、intent 之前崩溃会留下无法恢复的未知结果标记。每个过程使用诸如 `prepareGeneration`、`publishGenerationIntent`、`performGeneration` 和 `publishResponse` 这样的具体函数；没有通用 Procedure 抽象。

## Drive 生命周期 {#drive-lifecycle}

删除 installer 拥有模型。

- 移除 `installerSignal`。
- 移除 `DriveAbandoned`。
- 从过程结果中移除 `LostOwnership` 和 `lost_ownership`。
- 移除精确对象 ABA fencing 和 `commandDriveOwned`。
- 移除 `finalizedOutcome` 以及计划中的外部终结 owner 保留，除非 Flue 调查确立了具体需求。
- 只把 `activeDrive` 作为 lane 的 install/join 槽位保留。
- 安装把工作转移给 lane。每个调用方（包括 installer）用自己的调用 Context 观察完成。
- 安装之前的调用方 signal abort 什么也不安装。安装之后它只拒绝该调用方的观察。
- Drive 在其 pass 结算或到达持久化等待之后被移除。没有任何存活 pass 在进程内被替换。

`requestAbort` 保留两部分 gate 顺序：

```text
beginAbort before cancellation mutation
commit cancel_requested
signalAbort after commit
```

这防止新的 effect 在持久化标记正在提交时进入。

## 仍然保留的检查 {#checks-that-remain}

不要移除对外部或被引用内容的校验：

- 所需 entry 的存在与角色；
- pending payload 种类；
- deferred handle 身份；
- provider stream 协议顺序；
- response stop-reason 不变量；
- UUIDv7 follower 时间戳解析；
- 已配置 model/tool 的可用性；
- tool-call 源索引与暂存结果身份；
- 并行 tool call status 与 ready-prefix 放置；
- progress/memo 调用身份；
- retry 时间戳与 deferred permit 算术。

这些校验数据或真正的子并发。它们不是对 operation 状态机的防御性再校验。

## 已完成的分阶段实现计划 {#completed-staged-implementation-plan}

### 阶段 1 — 规范扁平持久化类型 {#stage-1--canonical-flat-durable-types}

文件：

- `src/harness/session/types.ts`
- `src/harness/runtime/` 中的仅编译消费者、restore、一致性 helper 以及聚焦测试
- `docs/harness.md`
- `docs/work-packages/05-direct-durable-drive.md`

动作：

- 用扁平 `at` 联合类型替换嵌套 operation state 声明。
- 保留每一个持久化数据，不使用兼容别名。
- 机械更新模式匹配，不改变行为。
- 保持 ToolBatch/ToolCall 嵌套。
- 在同一变更中更新规范文档。

退出：`npm run check`；现有聚焦 runtime 测试通过；规范 operation state 中不再有 `phase.kind`、generation `status`、deferred `status` 或结构性决策 `status`。

### 阶段 2 — 加入规范转换操作 {#stage-2--add-canonical-transition-operations}

文件：

- `src/harness/runtime/lane.ts`
- `src/harness/runtime/types.ts`
- 聚焦 Lane 测试

动作：

- 加入 `continueOperation` 和 `settleOperation`，包括终端决策后缀。
- 在一次实现中把每一次持久化 operation-state 写入与进程本地投影发布配对。
- 集中普通取消分流。
- 信任 dispatcher 建立的当前叶子；不做期望状态检查。
- 让过程特定的写入和事件构建器在调用点保持可见。

退出：聚焦测试证明每次 helper 提交之后，持久化状态与 `Lane.state` 保持相同。

### 阶段 3 — 转换 starting、checkpoint 和 assistant {#stage-3--convert-starting-checkpoint-and-assistant}

文件：

- `runtime/drive/checkpoint.ts`
- `runtime/drive/generation.ts`
- `runtime/drive/recovery.ts`
- `runtime/progress.ts`

动作：

- 移除反复出现的 operation/null/kind/state 检查和 `same*` 谓词。
- 把普通推进转换为 `continueOperation`。
- 把 assistant settlement 转换为 `settleOperation`。
- 只保留 checkpoint inbox/finish 竞态和 progress-channel 所有权检查。
- 若更小，则把 assistant 恢复折入 effect-pending handler。

退出：没有控制状态存储读取；没有反复的 assistant 状态校验；聚焦 generation 测试通过。

### 阶段 4 — 转换 deferred 和 tools {#stage-4--convert-deferred-and-tools}

文件：

- `runtime/drive/deferred.ts`
- `runtime/drive/tools.ts`
- `runtime/progress.ts`

动作：

- 在语义匹配处共享 assistant/deferred 的 response-entry、usage 和 tool-plan 构造。
- 保留 deferred permit 和 handle 检查。
- 移除顶层 operation-state 再校验。
- 保留每次调用的 tool status 合并、完成顺序暂存、源顺序放置、memo fencing 和 progress fencing。
- 对 live、recovery 和 cancellation 模式使用一个 tool-batch 过程，而不是分开的所有权结果路径。

退出：tool status 检查只存在于真正的 sibling 并发；聚焦 deferred/tool/progress 测试通过。

### 阶段 5 — 移除所有权丢失机制 {#stage-5--remove-ownership-loss-machinery}

文件：

- `runtime/types.ts`
- `runtime/lane.ts`
- `execution/effect-gate.ts`
- 所有现有 `runtime/drive/*.ts`
- 相关聚焦测试

动作：

- 移除 `LostOwnership`、`commandDriveOwned`、精确 Drive 检查、`installerSignal`、`DriveAbandoned` 和 `finalizedOutcome`。
- 让所有 drive 调用方成为观察对等方。
- 为 Drive 完成等待加入仅观察的 Context 取消。
- 只为 install/join 仲裁保留 `activeDrive`。
- 移除 ABA/替换测试，代之以 install/join/观察取消测试。

退出：grep 在生产 runtime 中找不到所有权丢失或 installer 放弃词汇。

### 阶段 6 — Close 与 fault {#stage-6--close-and-fault}

文件：

- `runtime/harness.ts`
- `runtime/lane.ts`
- Drive 观察 helper
- 生命周期测试

动作：

- 封闭 mutation 受理并排空已受理 mutation。
- 在 close/fault 时拒绝客户端观察，不替换 Drive，也不改变持久化 operation state。
- 观察分离 pass 的失败。
- 验证迟到的 effect 不能在 close 之后提交。
- 是否向本地 effect 发信号以做资源清理，另行决定。

退出：close 与进程丢失留下相同的持久化重启点；没有任何 close 路径写入取消或合成 settlement。

### 阶段 7 — 在更简单的 substrate 上完成 WP05 {#stage-7--finish-wp05-on-the-simpler-substrate}

文件：

- `runtime/drive/structural.ts`
- `runtime/drive/reconcile.ts`
- `runtime/drive.ts`
- `runtime/lane.ts` 公开表面

动作：

- 直接在扁平叶子和转换操作之上实现结构性生成。
- 把取消对账实现为一个扁平状态 switch。
- 把完备 drive switch 实现为一个 `state.at` switch。
- 只在每个叶子都完备之后，再接线公开 claim/join/观察和便利方法。

外部终结被排除，除非 Flue 调查识别出一个具体、当前的调用方，且无法通过 close、显式 abort、恢复或离线管理来表达。

## 校验 {#validation}

每个代码阶段之后：

```bash
npm run check
```

从 package 根目录运行每个被修改的聚焦测试文件。不要直接运行完整 Vitest suite。公开 drive 只在最后阶段使每个叶子完备之后才启用。

最终审计：

```bash
rg 'lost_ownership|LostOwnership|DriveAbandoned|commandDriveOwned|installerSignal|finalizedOutcome' packages/agent/src/harness
rg 'operationState\(|laneState\(|branchTip\(|laneConfig\(' packages/agent/src/harness/runtime/drive
```

第二次审计可能匹配写入构造器，但任何 reader 调用都不得使用那些控制地址。
