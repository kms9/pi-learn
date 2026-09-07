本文是 `04-mutation-publication.md` 的中文阅读版；命令、路径、API 名称保持英文。

# WP04 — Mutation 发布与事件投递 {#wp04--mutation-publication-and-event-delivery}

## 状态 {#status}

已完成。Phase A 以及最终实现再评审经 Fable 通过，没有发现。聚焦的 agent/server/SQLite 测试、`npm run build`、`npm run check` 和 `./test.sh` 通过。`packages/agent/docs/harness.md` 仍具有规范性。

> 历史注记：WP06 后来用一条 Session line 上的原子 `AgentHarness.lane()` 获取，替换了本已完成交接文档中描述的 lane-creation API 和 keyed line。事件发布保证仍然现行。

WP02 建立了原子接纳、接收方绑定，以及一致的 lane watches。WP03 移除了 drive deadlines。WP04 在不削弱那些保证的前提下移除调用方操作的事件投递门控，并让历史的 `Session.createLane()` 端到端拥有 lane 创建。直接持久 drive 包作为 WP05 跟进。

## 问题 {#problem}

一个 committing 的 lane job 当前使用两部分事件 API：

```text
inside Session.mutate:
  commit
  publish process-local state
  delivery = events.enqueue(batch, context)

outside Session.mutate:
  await delivery.start()
```

这种拆分保留了正确边界，但它是一把脚枪：过早调用 `emit()`、过早调用 `start()`，或丢掉 `start()`，都会破坏观察语义或卡住全局事件尾。历史的 `Harness.createLane()` 手动重复这套编排。

Lane 创建还有第二条一次性边界。历史的 `Session.createLane()` 拥有校验和持久事务，但 Harness 不能从同一个 commit continuation 发布其进程局部 `Lane` 并绑定 `lane_created` 接收方。因此 Harness 自己打开 `Session.mutate()` 并调用导出的 `createLaneWithMutator()`。

WP04 移除这两处调用方操作的接缝，同时保留当前的直接 listener 和 hook 屏障。

## 必需语义 {#required-semantics}

### 直接事件仍是被等待的观察 {#direct-events-remain-awaited-observations}

直接 `events.on()` listeners 仍是被动的，但因果有序：

```text
hook or preparation
→ commit
→ publish process-local state
→ bind and append event batch
→ release lane mutation line
→ await direct listeners
→ resolve operation
→ later hook or transition
```

被动意味着 listener 不能变换进行中的 operation，且 listener 失败被隔离为 `handler_error`。它并不意味着 fire-and-forget。扩展可以在 event listener 中更新进程局部状态，并在后续 hook 中检查它。Await 也提供生产者背压。

直接 listener 不得调用会变更状态的 harness API：被发出的 mutation 会把后续事件排到当前正在等待该 listener 的事件后面。只读 lane 调用仍然合法。

有意的例外保持不变：

- watchers 和 RPC/watch 消费者使用自己的缓冲 FIFO，不被 operations 等待；
- fault 发布是 fire-and-forget，close 从不等待 listener 完成；
- 高频 tool 更新入队每一个事件，只保留最新的投递 promise；tool 结算在 `after_tool` 和 outcome 发布之前 await 该 promise，从而通过全局 FIFO 排空所有更早的更新，而没有每次更新的背压。

### Commit 与接收方绑定仍是一个 continuation {#commit-and-recipient-binding-remain-one-continuation}

每一个产生事件的 committing lane job 都在观察成功 commit 的精确 continuation 中执行：

```text
commit succeeds
→ publish complete process-local state
→ synchronously call emitBatch(batch, context)
   - clone payloads
   - bind current ordinary listeners and watchers
   - append the complete batch to the global delivery tail
→ return from the mutation callback
```

没有调度器拥有的 after-release 发布阶段。把接收方绑定移到后续 promise continuation 会制造缺口，另一个任务可能在其中观察到已 commit 的状态，并在旧事件绑定接收方之前注册 listener。

`emitBatch()` 立即开始异步投递并返回其完成 promise。Mutation 回调从不 await 该 promise。Listener 代码可能在发布/绑定之后、mutation line 技术上释放之前开始；重入的 lane 读取排在当前 job 后面。Command 把 promise 带出 `Session.mutate()`，并在公开 resolve 之前 await 它。

这保留了两种合法的 watcher 竞态：

```text
watcher registration first
→ snapshot-before + complete buffered batch

commit publication first
→ snapshot-after + no old event
```

### 顺序 {#ordering}

- 一次非空的 `emitBatch()` 调用发布一个连续批次。
- 批次按 `emitBatch()` 调用顺序进入现有全局事件尾，包括跨 lanes。
- 批次内事件保留源顺序。
- 直接 listeners 按注册顺序串行运行。
- 同一 lane 的 committing jobs 按 lane mutation 顺序绑定批次。
- Lane 过程在调用下一个 hook 或 transition 之前 await 每个 command 的投递。
- 无关 lanes 上的 hooks 可以重叠；没有总的跨 lane hook 顺序。
- Context 仍是精确的发出 invocation Context，并且始终是最后一个参数。

## Event bus 契约 {#event-bus-contract}

用下列内容替换公开/内部投递拆分：

```ts
class HarnessEventBus implements Events {
  emit(event: HarnessEvent, context: Context): Promise<void>;
  emitBatch(events: readonly HarnessEvent[], context: Context): Promise<void>;
}
```

`emitBatch()`：

1. 对空批次或已关闭的 bus 返回已经 resolve 的 promise；
2. 同步 structured-clone 每一个 payload 并绑定其当前接收方；
3. 把一次连续投递追加到现有全局尾；
4. 用发出 Context 串行投递被克隆的 payloads；
5. 隔离 listener 失败，并像今天一样发布非递归的 `handler_error`；
6. 返回一个在合格直接 listeners 结算后 resolve、且从不因 listener 失败而 reject 的 promise。

同步发布缺陷，例如不可克隆的内部 payload，仍在调用方的 commit continuation 中抛出，并走现有 harness-fault 路径。

删除：

- `HarnessEventDelivery`；
- `HarnessEventBus.enqueue()`；
- 调用方操作的 `start()`；
- 投递门控和 `pendingStarts`；
- close 时强制的门控释放。

`close(error)` 立即封闭 listener/watch 注册以及未来发布。已经追加的批次保留其绑定接收方，并通过现有尾排空；listener 完成仍然不阻塞 Harness close。

## Lane command 集成 {#lane-command-integration}

`Lane.command()` 的 commit 分支返回一份朴素内部 outcome，包含调用方结果和可选投递 promise：

```ts
const events = decision.events?.(commit) ?? [];
const delivery = events.length === 0
  ? undefined
  : this.onEvent(events, context);

return {
  kind: "return",
  result,
  ...(delivery === undefined ? {} : { delivery }),
};
```

`onEvent` 返回 `Promise<void>` 并委托给 `emitBatch()`。它只在 commit、完整进程局部状态发布以及同步结果物化之后调用，作为返回 mutation outcome 之前的最终动作。

在 `Session.mutate()` 返回之后：

```ts
if (outcome.kind === "reject") throw outcome.error;
await outcome.delivery;
return outcome.result;
```

预期的无 commit 拒绝不发布事件。Commit/物化/发布错误保留现有 harness-fault 语义。

## Session lane 创建契约 {#session-lane-creation-contract}

历史的 `Session.createLane()` 拥有校验、commit，以及同步的 committed-publication 回调。Context 仍在最后：

```ts
createLane(
  name: string,
  at: string | null,
  configuration: LaneConfiguration,
  onCommitted: ((context: Context) => void | Promise<void>) | undefined,
  context: Context,
): Promise<SessionTree>;
```

实现执行：

```text
enter the prospective lane's mutation line
→ validate name, absence, complete lane shape, and target
→ commit lane configuration + leaf + idle lane state
→ synchronously invoke onCommitted(context) in that same commit continuation
→ retain its returned promise inside a non-thenable outcome object
→ return from the mutation callback and release the line
→ await the retained promise
→ return Session.view(name)
```

回调既不接收 `SessionTree` 也不接收 `SessionMutator`。它只是进程局部发布点。其同步前缀必须完成在另一个同 lane job 可以运行之前所需的发布。普通 Session 调用方传入 `undefined`。

如果校验或 commit 失败，不调用回调。如果回调在 commit 之后抛出，或其保留的 promise 在 line 释放之后 reject，持久 lane 仍然存在而调用方 reject；Harness 把该 committed-publication 缺陷转换到其现有 fault 路径。Harness 回调返回的 promise 是事件投递，其 listener 失败由 bus 隔离。

当前的 lane 校验/事务实现变为 Session 私有。删除导出的 `createLaneWithMutator()` 及其直接测试。

Harness 预先构造一个分离的 `Lane`，然后调用 Session：

```ts
const lane = this.buildLane(name, state);

await this.session.createLane(
  name,
  at,
  this.seed,
  (context) => {
    if (this.closedError !== undefined) lane.seal(this.closedError);
    this.lanesByName.set(name, lane);
    return this.events.emitBatch(
      [{ type: "lane_created", lane: name, at }],
      context,
    );
  },
  context,
);

return Result.ok(lane);
```

回调的同步前缀在第一个创建 job 释放其 line 之前发布 `lanesByName` 并绑定 `lane_created`。因此排队的重复不能在胜者通过 `harness.lane(name)` 可见之前报告 `LaneExists`。

如果 close 或 fault 在 commit 已被接纳时获胜，回调发布被封闭的新 Lane。在已经关闭的 bus 上发射是已 resolve 的 no-op，匹配现有的已接纳创建竞态。成功的已接纳创建仍返回其被封闭的 Lane。

## 范围 {#scope}

### 源码 {#source}

修改：

- `packages/agent/src/harness/events.ts`；
- `packages/agent/src/harness/runtime2/lane.ts`；
- `packages/agent/src/harness/runtime2/harness.ts`；
- `packages/agent/src/harness/session/types.ts`；
- 历史 `createLane` 签名所要求的本地 Session 实现和测试；
- 直接事件原语、接纳、watch、lane 以及 harness 测试。

Remote/experimental runtime 行为不是 WP04 的设计约束。Session mutation 权威仍是进程局部的；不要添加远程 Session 回调传输、protocol 机制、兼容抽象或边界测试。

### 文档 {#documentation}

更新规范性的 `harness.md`：

- 用同步 `emitBatch` 绑定和 mutation 后等待替换 enqueue/start 语言；
- 准确说明 listener 执行可能在发布/绑定之后、技术 line 释放之前开始；
- 保留被等待的直接 listener、event/hook、watcher、Context、close 以及顺序语义；
- 用历史的 `Session.createLane(onCommitted, context)` 替换共享导出的 mutator-procedure lane 创建；
- 更新不变量、竞态、测试、术语表以及 Part 8；
- 链接 WP04，并把直接持久 drive 移到 WP05。

只在历史 WP02 交接文档向前指向或声称旧机制仍然现行的地方更新它。不要把它已完成包的记录改写得好像 WP04 行为落在了 WP02 中。

## 非目标 {#non-goals}

- fire-and-forget 直接事件或公开 flush API；
- sequence/watermark 投递重设计；
- 每扩展事件队列；
- 改变 hook 聚合或 event/hook 因果屏障；
- 改变 watcher/RPC 缓冲；
- 改变 tool-update 结算屏障；
- 让 event-listener mutation 变得安全；
- drive、breakpoints、providers、tools、recovery、retries、polling、abort 或终端结算；
- 通用 Session post-commit/after-release 任务 API；
- 远程回调执行或 remote-runtime 重设计。

## 必需测试 {#required-tests}

### 事件原语 {#event-primitives}

- `emitBatch` 同步绑定普通 listeners 和 watchers；
- 在 `emitBatch` 之后、延迟投递之前注册的 listener 收不到任何东西；
- 完整批次是连续的并保留事件顺序；
- 并发批次发布保留调用顺序；
- listener payload mutation 保持隔离；
- listener rejection 发出一次非递归 `handler_error` 且不 reject 投递；
- 空批次和 close 后批次不投递即 resolve；
- 已经追加的批次在 close 之后排空；
- 不再有 gate/start 测试。

### Lane commands 与 watch {#lane-commands-and-watch}

- 直接 listeners 可以执行重入只读 lane inspection 而不死锁；
- command 在其直接 listeners 完成之前不 resolve；
- 已 commit 的 memory 对 listeners 可见；
- commit 失败不发布任何东西；
- 观察到持久状态的迟到 listener 收不到历史事件；
- watcher-first 产生 snapshot-before 加上完整缓冲批次；
- publication-first 产生 snapshot-after 且不回放；
- 源 Context 身份在延迟和缓冲投递中存活。

### Lane 创建 {#lane-creation}

- Session 回调恰好在成功 commit 之后运行一次，从不在校验/commit 失败时运行；
- 回调的同步发布发生在排队的重复报告 `LaneExists` 之前；
- Harness Lane 和持久配置对 `lane_created` listeners 可见；
- Harness 在 resolve 之前等待异步 `lane_created` listeners；
- 与 close 竞态的已接纳创建发布被封闭的 Lane，并且不要求事件投递；
- 回调抛出以及保留 promise 在 commit 之后 reject，遵循文档中的 committed-publication 失败路径；
- 普通 Session 创建传入 `undefined` 返回其 view；
- 不再有导出的 `createLaneWithMutator`。

### 顺序屏障 {#ordering-barriers}

- 接纳事件在 `accept()` resolve 之前完成；
- command resolve 不能超过其被等待的直接事件投递；WP05 测试第一个后续过程 hook；
- 事件批次在并发 lane 发布中全局有序；
- 在已实现处，tool-update 最新投递结算行为保持不变。

## 验证 {#validation}

文档之后：

```bash
git diff --check -- \
  packages/agent/docs/harness.md \
  packages/agent/docs/work-packages/02-atomic-run-acceptance.md \
  packages/agent/docs/work-packages/04-mutation-publication.md \
  packages/agent/docs/work-packages/05-direct-durable-drive.md
```

实现之后，运行每一个被修改的聚焦测试，然后：

```bash
git diff --check
npm run check
./test.sh
```

在宣布 WP04 完成之前，用 Fable 评审最终实现。未经用户明确批准不要 commit。

## 停止条件 {#stop-condition}

当下列条件满足时 WP04 完成：

- 事件发布只有一次 `emitBatch()` 操作，没有调用方操作的门控；
- 接收方绑定仍在精确的 commit-observation continuation 中；
- 直接事件投递仍是全局 FIFO，并在公开操作 resolve 之前被等待；
- 现有 event/hook 因果屏障保持完好；
- lane watches 恰好保留两种一致的竞态结果；
- Session 拥有 lane 创建，并在释放创建 job 之前调用 Harness 发布；
- `createLaneWithMutator()` 已消失；
- Context 在各处都是尾部且源相同；
- 聚焦测试、`npm run check` 和 `./test.sh` 通过；
- 最终 Fable 评审报告没有发现。
