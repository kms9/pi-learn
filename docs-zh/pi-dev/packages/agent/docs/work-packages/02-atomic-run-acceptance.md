本文是 `02-atomic-run-acceptance.md` 的中文阅读版；命令、路径、API 名称保持英文。

# WP02 — 原子接纳与一致的 lane 观察 {#wp02--atomic-acceptance-and-coherent-lane-observation}

## 状态 {#status}

已完成。Phase A 建立了最小 attachment、open-operation inventory、Session-line 的 inspection/watch 捕获、commit-continuation 的接收方绑定，以及带内 identity-failure 词汇。Phase B 落在 `beac75ecc`，聚焦测试、monorepo-check、完整套件以及最终 Fable 评审均通过。

实现还更新了因公开契约变更而必需的下游 protocol/coding-agent 线投影。没有添加 execution owner、provider/tool effect、timer、retry、polling、cancellation 过程、manual action 或终端结算。

## 目标 {#goal}

交付两条无 effect 的边界：

```text
idle lane
→ atomic prompt/skill/template acceptance
→ durable open operation in payload-free starting

open or running lane
→ Session-line watch capture
→ complete snapshot plus gap-free subsequent events
```

在 `AgentHarness.create(options, context)` 成功之后：

- 每一个已配置的 lane 都有一份完整的小型进程局部投影；
- `open` 清点每一个持久的当前 operation，而不预测 model/tool 可用性；
- attachment 不启动任何 hook、provider、tool、timer、breakpoint、drive owner 或 application callback；
- `inspectExecution(context)` 在 Session line 上观察小型投影和本地 owner；
- `watch(context)` 注册缓冲、克隆 live presentation，并在一个无写入的 lane job 中执行有界 snapshot 读取；
- 每一个 committing 的 lane job 都发布 memory，并在 commit continuation 中同步绑定其事件批次；
- mutation 不 await listener 投递，而公开操作会。

WP02 不实现 drive、provider generation、hooks、tools、retries、deferred polling、cancellation 过程、manual action 执行或终端结算。

## 决策 {#decisions}

### 1. Attachment 恢复投影，而不是 presentation {#1-attachment-restores-projection-not-presentation}

把打开的 Session 传给 `AgentHarness.create()`，会在 create 拒绝或 harness 关闭之前转移编排所有权。在该区间内禁止直接的 `Session.mutate`、`Session.createLane`、保留地址写入以及第二次 harness 构造，因此 lane inventory 不能与带外的 lane 创建竞态。

Attachment 只读取：

- `branchTip`、`laneConfig`、`laneState`，以及可选的 `laneLastResult`；
- 当前 operation 的 `operationMeta` 和 `operationState`。

它校验必需存在性、operation id/lane 所有权，以及 intent/state kind 兼容性。投影损坏会使 `create()` 失败。

Attachment 不读取 transcript、queues、pending writes、drained payloads、deferred sources、frames、tool calls、arguments、checkpoints、preparations、memos 或 staged outcomes。那些引用在被消费时由 `watch()` 或 drive 检查。缺失或矛盾的必需 payload 数据是终端存储损坏，并使该消费者失败。可选的 frame/checkpoint 缺失是合法的。

### 2. Watch 拥有详细 snapshot 读取 {#2-watch-owns-detailed-snapshot-reads}

一个无写入的 Session mutation job 定义 watch 边界：

```text
enter after all earlier lane jobs
→ synchronously register buffering watcher
→ synchronously clone live presentation state
→ perform bounded durable reads while later lane jobs are excluded
→ assemble snapshot
→ release Session line
→ return handle
```

没有特殊的 first-watch 缓存。同一条路径处理 attachment 后立即 watch、reconnect，以及 live 执行期间的 watch。

有界读取集合是：

- 从当前 tip 出发的一次 compaction 有界 branch scan；
- 对 next-run、steer、follow-up、writes 以及 abort drains 的精确 `pendingEntry(id)` 读取；
- 被表示时精确的 deferred source entry；
- tools-phase 的 assistant entry，以及对被表示的 `effect_pending` 调用的精确 args，使用 `batch.turnId` 作为 args step id；
- 有界的精确 assistant-frame 页以及精确的可选 tool checkpoints。

`ToolCall.sourceIndex` 是 assistant 消息完整 content 数组中的下标，而不是过滤后的 tool-call 序号。被表示的调用必须索引到一个 tool-call 块。

### 3. 接收方绑定属于 commit continuation {#3-recipient-binding-belongs-in-the-commit-continuation}

一个成功 committing 的 lane job 执行：

```text
commit
→ publish small owned projection
→ synchronously bind recipients and append the complete `{ event, context }` batch
→ return from the mutation without awaiting delivery
→ await delivery before the public operation resolves
```

WP02 最初用 `enqueue()` 加上调用方操作的 `start()` 实现这一点。WP04 用同一 commit-observation continuation 中一次立即的 `emitBatch()` 调用替换该门控。接收方绑定和投递等待保持不变。在 `emitBatch()` 之后注册的 listener 或 watcher 不能收到那条历史事件。

唯一的 watcher/publication 顺序是：

```text
watcher first
→ snapshot-before + complete buffered event batch

publication/`emitBatch` first
→ snapshot-after + no old event
```

Live 的 provider/tool presentation 更新遵循相同的同步 publish-plus-`emitBatch` 纪律。Frame/checkpoint commits 是 lane jobs，排在 watch 捕获之后。

### 4. Inspection 是无写入的 Session-line 观察 {#4-inspection-is-a-no-write-session-line-observation}

`inspectExecution(context)` 观察：

- lane 和 tip；
- 配置的 model 身份，作为未解析的 `{ provider, modelId }` 字符串；
- 当前 operation 的 id/kind/start time；
- 进程状态 `running`、`open`，或持久的 `aborting`；
- 当当前持久 phase 包含一份时，被捕获的 model 身份；
- 可选的最新结果。

它不解析 model/tool registries，也不读取 transcript 或 presentation payloads。

### 5. 缺失实现是带内 outcomes {#5-missing-implementations-are-in-band-outcomes}

没有 `blocked`、missing-identity 挂起、预测分类器，或接纳 registry 预检。

在实际执行边界：

- 在 provider intent 成为不可重试的配置失败之前，不可用的被捕获 model 或已配置的 active-tool 定义；
- 意图前的配置失败不预留 response/usage ids，也不伪造 assistant response 或 usage 行；
- 被恢复的 `effect_pending` 在其现有预留 ids 下结算不确定性，然后再发生任何后续配置失败；
- 不可用的 deferred model 通过配置失败持久地放弃赎回；R7 实现并测试被恢复的 `effect_pending` 放弃，包括删除其精确的旧 assistant-frame list，同时丢弃预留的 response/usage 字符串且不伪造结算；
- 缺失的被请求 tool 暂存一条直接的 `isError` `ToolResultMessage` 并继续；
- 缺失/不再安全的回放实现合成 interruption，而不是等待。

合成的 harness tool 结果省略 `details`。Tool 拥有其 details 契约的类型；harness 不得发明 `{}` 或诊断对象。`isError` 和人类可读内容承载 tool 级诊断。Run 级配置失败仍然通过 `OperationError` 和 `laneLastResult` 机器可读。

稳定的配置错误码：

- `model_unavailable`，details `{ provider, modelId }`；
- `configured_tools_unavailable`，details `{ tools: string[] }`。

`failure_drain` 获得 `{ kind: "configuration" }` provenance。实际 transitions 随拥有它们的执行包落地；WP02 只落地规范性/源码词汇。

### 6. 接纳独立于进程 registries {#6-acceptance-is-independent-of-process-registries}

接纳校验持久的调用方输入和 lane 状态，而不是当前的 model/tool 注册。这避免了 time-of-check/time-of-use 检查，并允许在一个进程中接纳、在另一个进程中执行。

配置错误的便利 prompt 最终会从 drive 返回一次持久失败的 run。显式托管接纳即使在执行 worker 加载实现之前也仍然持久。

### 7. Invocation Context 保持显式 {#7-invocation-context-remains-explicit}

每一个当前公开的 harness/lane 操作都接收尾部的 `context: Context`。接纳、attachment、watch 捕获、Session 读取/commit、faults 以及事件发布都保留它。共享的 harness/lane/Session 接收器不保留调用方 Context。Context 及其 signal/telemetry 值从不是持久业务数据。

缓冲事件保留精确的发出 Context。Invocation cancellation 仍然与持久的 `requestAbort()` 不同。

## 终态公开契约 {#end-state-public-contract}

```ts
export interface ModelIdentity {
  provider: string;
  modelId: string;
}

export type OperationStatus = "running" | "open" | "aborting";

export interface OpenOperation {
  lane: string;
  operationId: string;
  kind: "run" | "compaction" | "navigation";
  startedAt: number;
  aborting?: true;
}

export interface CurrentOperationInfo {
  id: string;
  kind: "run" | "compaction" | "navigation";
  startedAt: number;
  status: OperationStatus;
  capturedModel?: ModelIdentity;
}

export interface LaneExecutionInfo {
  lane: string;
  tipId: string | null;
  configuredModel: ModelIdentity;
  current: CurrentOperationInfo | null;
  lastResult?: LaneLastResult;
}

export interface LaneInfo {
  name: string;
  tipId: string | null;
  operation: CurrentOperationInfo | null;
}

export interface AgentHarnessConstructor {
  create<TContext extends object | undefined = object | undefined>(
    options: AgentHarnessOptions<TContext>,
    context: Context,
  ): Promise<{ harness: AgentHarness<TContext>; open: OpenOperation[] }>;
}
```

规则：

- `open` 对每一个持久当前 operation 恰好有一项，并省略空闲 lanes；
- `aborting:true` 只来自持久的 `cancel_requested`；
- `open` 是 inventory，不是调度或身份建议；
- 普通应用建立 watch 并调用 `resume(context)`；
- 托管调度器保留 expected-id 的 `drive` fencing；
- 配置的/捕获的身份字段是持久字符串，可能无法解析。

### Outcomes {#outcomes}

删除 `MissingIdentitySuspension`、`MissingIdentities`、missing-identity drive waiting，以及 missing-identity 挂起事件。

把 deferred 挂起保留为 provider 语义：

```ts
{ kind: "suspended"; reason: "deferred"; ... }
```

WP05 在启用执行之前移除被撤回的 action outcome。便利 operation outcomes 仍是 `ResumeOutcome` 的带 operation 标签的分支。

### Snapshot {#snapshot}

```ts
export interface LaneSnapshot {
  lane: string;
  transcript: Entry[];
  tipId: string | null;
  lastResult?: LaneLastResult;
  operation: null | {
    id: string;
    kind: "run" | "compaction" | "navigation";
    startedAt: number;
    status: OperationStatus;
    action?: ActionInfo;
    retry?: { attempt: number; maxAttempts: number; nextAttemptAt: number };
    deferred?: { handle: DeferredHandle; poll: number };
    drained?: { steer: QueuedItem[]; followUp: QueuedItem[] };
    streamingMessage?: AssistantMessage;
    runningTools: {
      toolCallId: string;
      toolName: string;
      args: unknown;
      partialResult?: AgentToolResult<unknown>;
    }[];
  };
  queues: { steer: QueuedItem[]; followUp: QueuedItem[]; nextRun: QueuedItem[] };
  pendingWrites: {
    entryId: string;
    type: EntryType;
    customType?: string;
    message?: AgentMessage;
    data?: JsonValue;
  }[];
  faulted: boolean;
}
```

配置不在 snapshots 中重复。`inspectExecution()` 暴露配置的/捕获的 model 身份；getters 暴露当前配置。

## 原子 run 接纳 {#atomic-run-acceptance}

WP02 为 prompt、skill 和 prompt-template 请求实现 `accept()`。Compaction/navigation 接纳仍随它们的执行包。

与状态无关的规范化发生在 `Lane.command(plan, context)` 之前：

- prompt 字符串/图片；
- 提供的 message 或 message 数组；
- 显式 skill 格式化；
- prompt-template 格式化；
- pending assistant 拒绝；
- 未知 skill/template 错误；
- 提供或铸造的 operation 和 prompt-entry ids。

公开 prompt 便利重载仍然恰好是 `[text, images | undefined, context]` 和 `[messageOrMessages, context]`，但便利实现在 R2 之前仍是 `SliceNotImplemented`。

在一次 lane command 内部：

1. 拒绝 busy；
2. 捕获当前 `pendingNextRun` ids；
3. 读取并校验被捕获的 pending messages；
4. 拒绝零条已放置 messages；
5. 在请求 prompt entries 之前，先 parent 被捕获的 next-run entries；
6. 恰好 commit 一次；
7. 发布小型拥有投影；
8. 用接纳事件批次和接纳 Context 同步调用 `emitBatch`；
9. 从 mutation 回调返回，不 await 投递；
10. 在 `accept` resolve 之前 await 事件投递。

精确写入：

```text
insert captured nextRun message entries
insert request prompt entries
delete captured pendingEntry values
set branchTip
set operationMeta
set operationState(run starting)
set laneState(current operation, pendingNextRun=[])
```

精确事件顺序：

```text
run_start
for each placed message:
  message_start
  message_end
  entry_added
queue_update if nextRun was captured
```

接纳不启动 drive 或 effect，也不写入 Context。

## Phase A — 规范性重写 {#phase-a--normative-rewrite}

在 runtime 源码之前更新 `harness.md`：

- 用最小投影 restore 替换急切的 attachment hydration；
- 用 open inventory 替换预测性 status/classifier；
- 规定不解析的配置/捕获身份 inspection；
- 把详细读取移到临时的 Session-line watch 捕获；
- 要求在精确的 commit-observation continuation 中绑定接收方；
- 移除 identity preflight/suspension/error/event 类型；
- 规定带内的 model/tool 不可用以及配置 provenance；
- 要求直接的、无 details 的合成 tool-result 消息；
- 更新不变量、竞态、路线图、术语表以及 Appendix C。

评审停止点：

1. `git diff --check`；
2. 新的 Terra contradiction/source-feasibility 审计；
3. 对照完整文档和源码的全上下文 Fable 评审；
4. 解决全部发现并重复，直到没有发现；
5. 在 runtime 源码之前获得用户批准。

## Phase B — 实现 {#phase-b--implementation}

### 公开与持久类型 {#public-and-durable-types}

修改 `agent-harness.ts`：

- 移除 `SuspendedOperation`、`MissingIdentityInfo`、`MissingIdentities`，以及 missing-identity 的 outcome/event 分支；
- 添加 `ModelIdentity`、`OperationStatus`、`OpenOperation`，以及更正后的 inspection/snapshot 类型；
- 把 create 结果从 `suspended` 改为 `open`；
- 落地带 operation 标签的 action-required outcome 族；
- 更正 `executeAction`/`runToCompletion` 签名；
- 在各处保留尾部 Context。

修改 session 类型：

- 添加 `failure_drain` 配置 provenance；
- 添加已经规范性的 `ToolCall.outcome_ready` 词汇，但不添加生产者；
- 把 `sourceIndex` 文档化为完整 assistant-content 下标；
- 向 `SessionReader` 添加回调范围的 `scanBranch`；由 `SessionMutator` 和 `Session` 继承是有意的；
- 在 `StorageBackedSession` 及其 mutator 和 `MemorySessionFacade` 中实现它；Session mutation 权威仍是进程局部的，没有远程 Session facade。

### 事件发布 {#event-publication}

WP02 最初加入了带预留投递门控的同步接收方绑定。WP04 只取代该机制：

- `HarnessEventBus.emitBatch()` 同步快照普通接收方和 watcher 接收方；
- 投递只使用那份绑定列表；
- watcher 缓冲保留 `{ event, context }`；
- 在 `emitBatch` 之后注册的 watcher 收不到该事件。

`LaneCommand` 的 commit 决策保留同步的 post-commit 事件批次。Commit 成功后，`Lane.command` 发布 `next`，把 `emitBatch` 作为其最终 mutation 动作调用，并在 `Session.mutate` 之外携带投递 promise，然后再 await 它。每一个现有的产生事件的 commit 都使用这条路径，包括直接 idle/pending appends、lane 配置 setters，以及 session-name/entry-label setters。

WP04 还把 harness lane 发布移进 `Session.createLane` 的 committed-publication 回调。Session commits，Harness 在该 continuation 中发布 `lanesByName` 并调用 `emitBatch(lane_created)`，Session 在释放 line 之后 await 保留的投递 promise。

不要在 line 上执行 listeners。

### Attachment {#attachment}

保持 `restore.ts` 仅投影。校验 lane/operation 所有权和 kind 兼容性。从 `createAgentHarness` 移除 `describeSuspension` 以及所有 payload hydration。构造 lanes 并返回 `open` inventory，不解析 registries。

### Inspection {#inspection}

把 `inspectExecution(context)` 实现为无写入的 `Lane.command` 观察。从当前持久 phase 派生被捕获的 model 身份。不读取存储 payloads，不解析 registry 身份。

### Watch {#watch}

把 `watch(context)` 实现为一个无写入的 lane job：

- 同步注册 watcher 并克隆 live presentation；
- 通过回调范围的 readers 执行上面的有界读取矩阵；
- 组装隔离的 snapshot payloads；
- 在必需损坏时失败并退订；
- 保留合法的可选缺失；
- 在返回之前释放 line。

允许一个聚焦的内部 snapshot helper。不要创建持久的 hydrated presentation 缓存或通用 reducer。

### 超出范围 {#out-of-scope}

`drive`、`resume`、prompt 便利、compaction/navigation 接纳、abort/queues、`executeAction` 以及 `runToCompletion` 在尚未实现处仍是 `SliceNotImplemented`。

Provider/tool/configuration-failure transitions 现在被规定，但由 R2/R3/R4/R7/R8 实现。WP02 不添加 effect、active operation、timer、hook、provider request、tool 执行、retry、deferred fetch、cancellation 调和或终端事务。

## 必需测试 {#required-tests}

### 公开类型 {#public-types}

- `SuspendedOperation`、`MissingIdentities` 以及 missing-identity 的 status/outcomes/events 不存在；
- open/current/status unions 穷尽收窄；
- 配置的和捕获的 model 身份是未解析字符串；
- action-required outcome 族和方法签名匹配；
- prompt 重载元组保持精确；
- `AgentHarnessOptions` 没有接收器 telemetry 默认值。

### 接纳 {#acceptance}

- 仅文本、仅图片、文本加图片、提供的数组；
- pending assistant 拒绝；
- skills/templates 以及未知资源；
- 空输入不写入任何东西，除非被捕获的 nextRun 提供输入；
- 没有 identity registry 预检；
- 提供/铸造的 operation ids；
- 精确写入、parent 链、元数据、starting 状态、settings、commit 物化；
- pending-next-run 捕获/删除；
- busy run/structural operation；
- 一次并发 accept 胜者；
- commit 失败和 close 竞态；
- 精确事件顺序以及对象相同的接纳 Context；
- 不调用 hook、provider、tool、timer、drive-owner 或 option callback；被动 event-listener 投递仍是必需的。

### Attachment 与 inspection {#attachment-and-inspection}

- 空闲被省略，每一个 open operation 都被清点；
- 持久 cancellation 只设置 `aborting:true`；
- create 时不读取 transcript/pending/frame/tool；
- 配置的和捕获的 model 身份可以不同，并且在未解析时仍然可见；
- inspection 在 Session line 上运行，并且不执行 payload 读取；
- 投影损坏使 create 失败；
- 不启动 option callback/effect。

### 事件发布与 watch {#event-publication-and-watch}

- 接收方集合在 `emitBatch` 时绑定：在发布之后、投递之前注册的 watcher 收不到任何东西；
- 状态/事件批次发布发生在 Session-line 释放之前；
- 直接 append、lane 配置、session-name/entry-label、接纳以及 lane-creation commits 都使用该发布路径；
- `value_update` 和 `lane_created` 在其 commit continuation 中绑定接收方，因此后来的 listeners 收不到任何历史事件；
- watcher-first 给出 snapshot-before 加上完整事件；
- publication-first 给出 snapshot-after 且没有旧事件；
- 在被等待的捕获期间发生的 live 更新，只作为缓冲事件出现在被克隆的 live snapshot 之后；
- frame/checkpoint mutations 排在捕获之后；
- 第一次 watch 和 reconnect 使用同一条路径；
- 精确的 transcript、queues、writes、drain、deferred、frame、tool args/checkpoint 字段；
- 必需 payload 损坏使 watch 失败并移除 watcher；
- 缺失的 frames/checkpoints 省略可选 partials；
- 预注册生命周期不被回放；
- 缓冲事件保留对象相同的发出 Context；
- payload mutation 不能影响后续状态/listeners；
- close/fault 生命周期与 event bus 匹配。

### 带内身份词汇 {#in-band-identity-vocabulary}

类型/直接状态测试证明：

- 接纳没有 `MissingIdentities` 路径；
- 配置失败 provenance 和稳定错误码可表示；
- deferred 配置放弃仍分配给 R7，而不是在此添加执行 transition；
- 缺失 tool 的合成 `ToolResultMessage` 可以省略 `details`；
- sourceIndex 使用完整 assistant-content 索引；
- outcome-ready 调用不渲染为 running。

WP02 不添加任何执行 transition。

## 文件 {#files}

### 添加 {#add}

- `packages/agent/test/harness/runtime2/accept.test.ts`
- 如果现有文件变得过大，则添加聚焦 watch 测试。

### 修改 {#modify}

- `packages/agent/docs/harness.md`
- `packages/agent/docs/work-packages/02-atomic-run-acceptance.md`
- `packages/agent/src/harness/agent-harness.ts`
- `packages/agent/src/harness/events.ts`
- `packages/agent/src/harness/session/types.ts`
- `packages/agent/src/harness/session/session.ts`
- `packages/agent/src/harness/session/memory.ts`
- `packages/agent/src/harness/session/remote.ts`
- `packages/server/src/remote-session-manager.ts`
- `packages/agent/src/harness/runtime2/harness.ts`
- `packages/agent/src/harness/runtime2/lane.ts`
- `packages/agent/src/harness/runtime2/restore.ts`
- `packages/agent/src/harness/runtime2/types.ts`
- `packages/agent/test/harness/runtime2/harness.test.ts`
- `packages/agent/test/harness/runtime2/lane.test.ts`
- `packages/agent/test/harness/runtime2/restore.test.ts`
- `packages/agent/test/harness/types.test.ts`
- `packages/agent/test/harness/storage-backed-session.test.ts`
- `packages/agent/test/harness/memory-session-repo.test.ts`
- `packages/server/test/conformance.test.ts`
- 接收方绑定和回调范围 branch 读取所要求的 event/session 测试文件。

预期没有 backend schema、telemetry schema、coding-agent 或 changelog 变更。如果有必要则停下来做边界评审。在 `dev` 上推迟 changelog 条目。

## 验证 {#validation}

Phase A 之后：

```bash
git diff --check -- \
  packages/agent/docs/harness.md \
  packages/agent/docs/work-packages/02-atomic-run-acceptance.md
```

Phase B 之后：

```bash
cd packages/agent
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run \
  test/harness/runtime2/accept.test.ts \
  test/harness/runtime2/harness.test.ts \
  test/harness/runtime2/lane.test.ts \
  test/harness/runtime2/restore.test.ts \
  test/harness/types.test.ts

cd "$(git rev-parse --show-toplevel)"
git diff --check
npm run check
./test.sh
```

报告 runtime2 源码行数。同步的 WP02 之前 runtime2 基线是 967 行；把超过 1,900 源码行的增长当作设计评审触发，而不是目标。

## 停止条件 {#stop-condition}

当下列条件满足时停止：

- 接纳恰好 commit 一次进入无 payload 的 `starting`，且没有 registry 预检；
- attachment 返回最小完整投影和 open inventory；
- inspection 是一致的 Session-line 无写入观察；
- watch 在 Session line 上临时捕获详细状态；
- 状态发布和 `emitBatch` 接收方绑定发生在 commit continuation 中，而 mutation 从不 await 投递；
- snapshots 和缓冲事件没有缺口或重复；
- 必需 payload 损坏使其消费者失败；
- 没有引入执行 effect 或 owner；
- 聚焦测试、`npm run check` 以及完整测试通过；
- 最终 Fable 评审没有发现。

不要开始第一个真正的 drive 包。
