本文是 `06-session-branch-lane-separation.md` 的中文阅读版；命令、路径、API 名称保持英文。

# WP06 — Session、Branch、Lane 分离 {#wp06--session-branch-lane-separation}

**状态：在 WP05 M4 之前已实现。** WP05 M3 仍已完成。Retry/deferred 工作在此处落地的组合、mutation 和所有权边界上恢复。

本包用四个显式概念替换混合的 `SessionTree`/隐式 main 继承设计：

```text
Session       global durable data + one mutation line
Branch        one path through the entry tree, with a movable tip
AgentLane     Branch data surface + agent operations/configuration
AgentHarness  manager of AgentLanes; never a lane itself
```

---

## 0. 必读 {#0-mandatory-reading}

编辑前完整阅读：

1. `packages/agent/docs/harness.md`。
2. `packages/agent/docs/work-packages/05-direct-durable-drive.md`。
3. `packages/agent/src/harness/session/types.ts`。
4. `packages/agent/src/harness/session/session.ts`。
5. `packages/agent/src/harness/session/memory.ts`。
6. `packages/agent/src/harness/session/jsonl/repo.ts` 和 `jsonl/storage.ts`。
7. `packages/session-backends/sqlite-node/src/sqlite/session.ts`、`storage.ts` 以及 repo 实现。
8. `packages/agent/src/harness/runtime/lane.ts`、`harness.ts`、`restore.ts` 和 `types.ts`。
9. `packages/agent/src/harness/agent-harness.ts`。
10. `packages/agent/src/harness/session/fork.ts` 以及 repository 符合性测试。
11. 修改之前 §8 中点名的每一个测试。

不要检查已删除的 runtime 实现或 Git 历史。当前源码、`harness.md`、WP05 以及本包是唯一真实来源。

---

## 1. 问题 {#1-problem}

### 1.1 `SessionTree` 混合了无关所有权 {#11-sessiontree-mixes-unrelated-ownership}

`SessionTree` 当前包含：

```ts
interface SessionTree {
	// Lane/path data.
	getLeafId(...): Promise<string | null>;
	findEntriesOnBranch(...): Promise<Entry[]>;
	findEntryOnBranch(...): Promise<Entry | undefined>;
	appendMessage(...): Promise<string>;
	appendCustomEntry(...): Promise<string>;

	// Session-global data that is not lane- or branch-owned.
	getEntry(...): Promise<Entry | undefined>;
	getStats(...): Promise<SessionStats>;
	findEntries(...): Promise<Entry[]>;
	findEntry(...): Promise<Entry | undefined>;
	getValue(...): Promise<StoredValue<unknown> | undefined>;
	setValue(...): Promise<void>;
	readList(...): Promise<ListElement<unknown>[]>;
	appendList(...): Promise<void>;
	getName(...): Promise<string | undefined>;
	setName(...): Promise<void>;
	getLabel(...): Promise<string | undefined>;
	setLabel(...): Promise<void>;
}
```

选定的 tree view 只改变全局写入进入哪一条 mutation 队列。它不改变持久地址。因此两个 views 可以在不同 lane lines 下读取同一全局值并 commit 一次丢失更新。

### 1.2 `Session` 静默意味着 `main` {#12-session-silently-means-main}

`Session extends SessionTree`。其继承的 branch 方法和高层写入静默委托给 `main` lane。`session.setValue(...)` 实际上是 `setValueForLane("main", ...)`。一份全新仓库 session 在任何 harness 存在之前就创建一个部分隐式 main lane。

### 1.3 `AgentHarness` 静默意味着 `main` {#13-agentharness-silently-means-main}

`AgentHarness extends AgentLane`，并且 runtime `Harness extends Lane`。管理器对象作为 `main` 插入它自己的 lane map。诸如 `harness.prompt(...)`、`harness.watch(...)` 或 `harness.getModel(...)` 的调用静默瞄准 main。

### 1.4 每 lane mutation 队列解决了错误的问题 {#14-per-lane-mutation-queues-solve-the-wrong-problem}

Storage 已经序列化原子 commits，并为每一次写入分配一个 session 范围的 `seq`。每 lane mutation 队列允许有用的准备重叠，但这个 runtime 现在不需要那种复杂度：全部 harness mutation 回调执行有界存储读取、准备一份 write 集合、至多 commit 一次、发布进程局部状态并返回。Providers、tools、hooks、timers 以及异步事件投递在 mutation 回调之外。

已批准的首次实现使用一条 Session mutation line。如果剖析证明全局 line 是瓶颈，以后可以添加 keyed lines；那次未来变更需要一次可变所有权审计，但不需要公开 API 重设计。

---

## 2. 已批准的术语与所有权 {#2-approved-terminology-and-ownership}

### Session {#session}

拥有：

- session 元数据；
- 全局 entry 和 usage 查询；
- application values 和 lists；
- session 名称和 entry labels；
- Branch 发现/创建；
- 每一受支持 mutation 的一条进程局部 mutation line；
- 一份打开的 storage/backend 生命周期。

Session 不实现 Branch，也没有隐式 branch。

### Branch {#branch}

只描述穿过不可变 entry tree 的一条具名路径的数据能力。

只拥有：

- 其当前 tip；
- 相对 branch 的 entry 查询；
- 用 message 或 custom entries 直接扩展其 tip。

Branch 没有 model 配置、queues、operation 状态、drive、hooks 或 agent 策略。

### AgentLane {#agentlane}

一个 Branch 加上 agent 配置和操作。它直接暴露 Branch 方法，而不是暴露嵌套的 `Branch`、tree、store、view 或 access 对象。

空闲时，`AgentLane.appendMessage` / `appendCustomEntry` 直接扩展 tip。在活动 run 期间，它们保留现有延迟写入语义：预留 entry id，持久化 `pendingEntry(id)`，并把该 id 入队到 operation inbox 以供 checkpoint 放置。原始 Branch append 始终是直接数据 append；当 Harness 拥有对应 lane 时的原始 Branch mutation 是受信任编程缺陷。

### AgentHarness {#agentharness}

拥有全局 registries/配置、hooks、events、生命周期，以及一份 AgentLanes 的 map。它不是 AgentLane，也不暴露隐式 main 操作方法。

---

## 3. 目标公开类型 {#3-target-public-types}

### 3.1 Session reader 与 mutation {#31-session-reader-and-mutation}

```ts
export interface SessionReader {
  getEntries(ids: string[], context: Context): Promise<Map<string, Entry>>;
  getValue<T>(
    address: Value<T>,
    context: Context,
  ): Promise<StoredValue<T> | undefined>;
  scanValues<T>(prefix: Value<T>, context: Context): Promise<StoredValue<T>[]>;
  readList<T>(
    address: ValueList<T>,
    options: ListReadOptions | undefined,
    context: Context,
  ): Promise<ListElement<T>[]>;
  scanBranch(query: StorageBranchScan, context: Context): Promise<Entry[]>;
}

export interface SessionMutation extends SessionReader {
  /** Exactly zero or one attempt. A second call rejects, including after failure. */
  commit(writes: Write[], context: Context): Promise<CommitResult>;
  /** Wait for any admitted commit, invalidate the capability, and release the Session line. */
  end(context: Context): Promise<void>;
}

export type SessionMutator = Omit<SessionMutation, "end">;

export type SessionMutationCallback<TResult> = (
  mutator: SessionMutator,
  context: Context,
) => TResult | Promise<TResult>;
```

`beginMutation()`/`SessionMutation.end()` 仍是当前远程 Session protocol 使用的可传输 scope。它们无 key，也不携带 lane 字段。普通本地/harness 代码使用 `mutate()`；没有任何调用方选择 mutation key。

### 3.2 Branch {#32-branch}

```ts
export interface Branch {
  readonly name: string;
  getTipId(context: Context): Promise<string | null>;
  findEntries(
    query: BranchScan | undefined,
    context: Context,
  ): Promise<Entry[]>;
  findEntry(
    query: BranchScan | undefined,
    context: Context,
  ): Promise<Entry | undefined>;
  appendMessage(message: AgentMessage, context: Context): Promise<string>;
  appendCustomEntry(
    customType: string,
    data: JsonValue | undefined,
    context: Context,
  ): Promise<string>;
}
```

因为接收者已经是 Branch，公开名称是 `findEntries` 和 `findEntry`，而不是 `findEntriesOnBranch` 和 `findEntryOnBranch`。

### 3.3 Session {#33-session}

```ts
export interface Session<
  TMetadata extends SessionMetadata = SessionMetadata,
> extends SessionReader {
  readonly metadata: TMetadata;
  readonly idGenerator: IdGenerator;

  // Direct reads. No mutation-line acquisition.
  getEntry(id: string, context: Context): Promise<Entry | undefined>;
  getStats(context: Context): Promise<SessionStats>;
  findEntries(
    query: EntryQuery | undefined,
    context: Context,
  ): Promise<Entry[]>;
  findEntry(
    query: EntryQuery | undefined,
    context: Context,
  ): Promise<Entry | undefined>;
  getName(context: Context): Promise<string | undefined>;
  getLabel(targetId: string, context: Context): Promise<string | undefined>;

  // Existing Branch acquisition performs durable I/O and therefore receives Context.
  branch(name: string, context: Context): Promise<Branch | undefined>;
  createBranch(
    name: string,
    at: string | null,
    context: Context,
  ): Promise<Branch>;

  // Transportable explicit scope; RemoteSession maps begin/read/commit/end over RPC.
  beginMutation(context: Context): Promise<SessionMutation>;

  // Trusted sharp edge. The callback holds the sole Session mutation line.
  mutate<TResult>(
    mutation: SessionMutationCallback<TResult>,
    context: Context,
  ): Promise<TResult>;

  // One-write conveniences implemented through mutate().
  setValue<T>(
    address: Value<T>,
    next: NoInfer<T>,
    context: Context,
  ): Promise<void>;
  deleteValue<T>(address: Value<T>, context: Context): Promise<void>;
  appendList<T>(
    address: ValueList<T>,
    element: NoInfer<T>,
    context: Context,
  ): Promise<void>;
  deleteList<T>(address: ValueList<T>, context: Context): Promise<void>;
  setName(name: string | undefined, context: Context): Promise<void>;
  setLabel(
    targetId: string,
    label: string | undefined,
    context: Context,
  ): Promise<void>;

  close(context: Context): Promise<void>;
}
```

`mutate()` 仍是公开的。插件被信任不保留 mutator、不调用嵌套公开 writers、不执行 effects，或不跨越无界工作持有 line。误用可能阻塞该 Session 中每一次 mutation，并且是插件缺陷。`beginMutation()` 为传输/生命周期集成而存在，而不是普通插件工作；每一个直接调用方必须在 `finally` 中调用 `end()`。

### 3.4 AgentLane {#34-agentlane}

`AgentLane` 保留其操作/配置/观察方法，并直接加入 Branch 表面：

```ts
export interface AgentLane {
  readonly name: string;

  getTipId(context: Context): Promise<string | null>;
  findEntries(
    query: BranchScan | undefined,
    context: Context,
  ): Promise<Entry[]>;
  findEntry(
    query: BranchScan | undefined,
    context: Context,
  ): Promise<Entry | undefined>;
  appendMessage(message: AgentMessage, context: Context): Promise<string>;
  appendCustomEntry(
    customType: string,
    data: JsonValue | undefined,
    context: Context,
  ): Promise<string>;

  getLastResult(context: Context): Promise<LaneLastResult | undefined>;
  accept(
    request: OperationRequest,
    context: Context,
  ): Promise<OperationAdmissionResult>;
  drive(options: DriveOptions, context: Context): Promise<DriveResult>;
  requestAbort(
    operationId: string,
    context: Context,
  ): Promise<AbortRequestResult>;
  inspectExecution(context: Context): Promise<LaneExecutionInfo>;
  // Existing convenience, queue, configuration, idle, and watch methods remain.
}
```

删除 `AgentLane.sessionTree`。

### 3.5 AgentHarness {#35-agentharness}

```ts
export interface AcquireLaneOptions {
  /** Used only when the AgentLane does not exist. Defaults to null. */
  createAt?: string | null;
}

export interface AgentHarness<
  TContext extends object | undefined = object | undefined,
> {
  lane(name: string, context: Context): Promise<AgentLane>;
  lane(
    name: string,
    options: AcquireLaneOptions,
    context: Context,
  ): Promise<AgentLane>;
  lanes(context: Context): Promise<LaneInfo[]>;

  // Session-global metadata wrappers preserve existing value_update events.
  getName(context: Context): Promise<string | undefined>;
  setName(name: string | undefined, context: Context): Promise<void>;
  getLabel(targetId: string, context: Context): Promise<string | undefined>;
  setLabel(
    targetId: string,
    label: string | undefined,
    context: Context,
  ): Promise<void>;

  // Existing global tools/resources/options/settings/hooks/events/watchSession/close surface.
}
```

`AgentHarness` 不扩展 `AgentLane`。删除 `createLane`；`lane()` 是原子 get-or-create。现有 lanes 忽略 `createAt`。缺失的 lane 使用 `createAt ?? null`。并发获取返回同一已发布 AgentLane。无效名称和未知非 null 目标用现有带标签错误拒绝；close/fault 用其现有生命周期错误拒绝。

全新 Session 和全新 Harness 不含隐式 main Branch 或 AgentLane。`await harness.lane("main", context)` 完整创建 main。`lanes()` 可以返回 `[]`。

---

## 4. Mutation 与读取语义 {#4-mutation-and-read-semantics}

### 4.1 一条 Session mutation line {#41-one-session-mutation-line}

用单条 `MutationLine` 替换 `LaneMutationLine`：

```ts
export class MutationLine {
  private tail: Promise<void> = Promise.resolve();
  private sealedError: Error | undefined;

  run<TResult>(operation: () => TResult | Promise<TResult>): Promise<TResult>;
  seal(error: Error): Promise<void>;
}
```

`StorageBackedSession.beginMutation()` 获取该 line 并返回一份显式无 key 能力；只有 `end()` 释放它。`mutate()` 是从 begin/end 构建的回调便利，并且总是在 `finally` 中结束。回调可以读取、准备、commit 一次、发布进程局部状态、同步绑定事件接收方并返回。`close()` 封闭接纳，并在关闭 Storage 之前等待每一个已获取 scope 结束。

高层 Session 写入、Branch 创建/appends、每一个 `Lane.command`、进度写入、需要一致性的 restore snapshots，以及 Harness lane 获取都调用同一 `Session.mutate()`。

### 4.2 读取绕过该 line {#42-reads-bypass-the-line}

普通 Session 和 Branch 读取直接调用 Storage。它们在每一次读取执行时观察最新完全应用的原子存储 commit：

- 排队/规划/未应用的 mutation 不可见；
- 没有任何部分 commit 可见；
- 一旦 Storage commit resolve，即使 mutation 回调仍在发布进程局部状态，直接读取也可以观察到它；
- 一次 `mutate()` 之外的多次读取不是 snapshot；
- 一致的 read-decide-write/CAS 使用 `Session.mutate()`。

### 4.3 Effects 留在外面 {#43-effects-stay-outside}

Mutation 回调不得执行或 await：

- providers 或 deferred fetch/cancel；
- tools；
- hooks；
- timers；
- 异步事件投递；
- idle 回调或 Drive 完成；
- 嵌套 Session/Branch/AgentLane mutators。

回调可以在发布之后同步调用 `emitBatch` 以绑定接收方并保留其投递 promise。公开操作在 `mutate()` 返回之后 await 投递。

### 4.4 Storage 保持独立原子 {#44-storage-remains-independently-atomic}

Storage 保留其单 session commit 序列化器，并为每一次写入分配一个全局 `seq`。Session mutation line 保护 read-decide-commit-publication 过程；Storage 队列保护原子事务应用、序列分配、fork snapshots 以及 backend 调用方。不要合并这两个抽象。

---

## 5. Branch 与 lane 持久形态 {#5-branch-and-lane-durable-shape}

### 5.1 没有隐式 main {#51-no-implicit-main}

仓库 `create()` 只写入 session 元数据/header/catalog 状态。它不写入 branch tip、lane 配置或 lane 状态。从 Memory 和 JSONL 创建以及从 SQLite 初始化中移除 main 播种。

遗留 coding-agent v3 规范化仍可能产生一个 main Branch，因为被导入的 transcript 有一条选定路径。

### 5.2 Branch 完整性 {#52-branch-completeness}

Branch 恰好在其必需 tip 值存在时存在。`createBranch(name, at, context)` 校验名称、缺席以及非 null 目标，然后在一次 mutation 中写入 tip。它不写入 model 配置或 operation 状态。

在源码中使用 Branch 术语。本包把类型化构造器和公开概念重命名为 `branchTip`/`tipId`。持久命名空间和持久字段拼写决策必须在全部 backends 和文档中一致：

- 使用 `pi.branch.tip`，并把 format-4 字段从 leaf 重命名为 tip，而不是保留误导性的新代码别名；
- format 4 和新 harness 是 WIP，因此就地替换其 schema 和字段名：没有 storage-version bump、migration、兼容 decoder 或旧格式拒绝路径；
- 遗留 coding-agent v3 import 仍受支持：它把它选定的 main leaf 映射到一个 main Branch tip，并走那条选定物理祖先以独立重建最近的 `model_change`、`thinking_level_change` 和 `active_tools_change`；不受支持的最近值不回退到更旧历史；
- 当导入器可以重建一份完整配置时，它在返回 Session 之前写入普通 `laneConfig("main")` 加上全新空闲 `laneState("main")`；缺失的 active-tools 历史规范化为 `[]`，因为 v3 不持久化初始 tool inventory；
- 如果必需的 model 或 thinking 配置缺失或不受支持，导入器留下一个仅数据 main Branch，而不是持久化部分兼容状态；
- 更新遗留 active-tools 记录类型以读取其编码的 `activeToolNames` 数组；
- 在同一包中为公开 `tipId` 字段更新 protocol schemas 和 experimental adapters。

Inventory 使用 `branchTipInventoryPrefix()`。遗留 import 只发出普通 Branch/Lane 值；没有临时兼容地址或 attachment 时 migration。

### 5.3 AgentLane 完整性 {#53-agentlane-completeness}

AgentLane 把完整 `laneConfig`、`laneState`、可选 `laneLastResult` 以及可选当前 operation 值加到一个现有 Branch 上。

`harness.lane(name, options?, context)` 执行一次 Session mutation 并恰好处理这些情况：

| 持久状态 | 结果 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch 缺席；lane 值缺席 | 校验 `createAt`，commit Branch tip + 不可变 `AgentHarnessOptions` seed config + 空闲 lane 状态，发布一个 AgentLane 和 `lane_created { at: createAt ?? null }` |
| Branch 存在；lane config/state 缺席且没有 last result | 在现有 tip 处 commit 不可变 seed config + 空闲 lane 状态，发布一个 AgentLane 和 `lane_created { at: existingTip }` |
| Branch 和完整 lane 值都存在 | 返回被恢复/发布的 AgentLane；没有 commit/event |
| 任何部分或矛盾组合 | 作为存储损坏失败 |

Committing 回调把新 Branch/AgentLane 发布进进程局部 maps，并在从 `Session.mutate()` 返回之前同步调用 `emitBatch(lane_created, context)`。事件投递在 line 释放之后被等待。

`AgentHarness.create()` 恢复每一个完整持久 AgentLane 和打开 operation，但不创建任何东西，也不要求 main。仅数据 Branch 在 `harness.lane(name, ...)` 附着 agent 状态之前仍是 Branch。

### 5.4 Append 行为 {#54-append-behavior}

`Branch.appendMessage` / `appendCustomEntry` 始终 commit 一条以当前 tip 为 parent 的不可变 entry，并在同一事务中移动 tip。

`AgentLane.appendMessage` / `appendCustomEntry` 保留 harness 语义：

- 空闲：立即 append 并移动 tip；
- 活动 run：暂存 `pendingEntry(id)` 并入队 `inbox.writes`；
- 活动 structural operation：当该表面落地时保留现有 wait/re-evaluate 契约；
- pending assistant 消息在 commit 之前拒绝。

两者都返回在其 mutation 之前预留的 entry id。

---

## 6. Runtime 组合 {#6-runtime-composition}

### 6.1 Harness {#61-harness}

用组合替换继承：

```ts
export class Harness<
  TContext extends object | undefined,
> implements AgentHarness<TContext> {
  readonly session: Session;
  readonly models: Models;
  readonly hooks: HookRegistry;
  readonly events: HarnessEventBus;
  readonly lanesByName = new Map<string, Lane<TContext>>();
  // global config/lifecycle fields
}
```

构造器把每一个被恢复的 Lane 构建为普通对象。它从不调用 `super("main", ...)`，也从不把 `this` 插入 `lanesByName`。

Fault 和 close 迭代普通 Lane 对象。全局 getters/setters 只住在 Harness 上。Coding-agent experimental 服务和 workers 必须在调用 lane 操作之前显式获取/缓存 `main`。

### 6.2 Lane {#62-lane}

`Lane.command` 和 `commandDriveOwned` 调用无 key 的 `session.mutate(plan, context)`。Live `Lane.state` 仍是权威进程投影。精确 Drive fencing 仍紧挨 commit 接纳。

Lane 直接实现 Branch 查询/append 名称。它可以持有一份包私有 Branch 实现以供直接数据读取，但没有任何嵌套 Branch 被公开暴露。

### 6.3 Restore {#63-restore}

Restore 不再进入具名 mutation line。`AgentHarness.create()` 拥有 Session attachment 区间，并执行一次有界无 key 的 `Session.mutate()` 回调，以在发布 Harness 之前清点/恢复每一个完整 AgentLane；它只在需要有意 attachment 规范化时 commit。一致的 live watch/inspection 同样把 `Session.mutate()` 用作无 commit 回调。

Restore 把完整 AgentLanes 与仅数据 Branches 分开清点。缺失 main 合法。

---

## 7. Repository、backend 与 fork 要求 {#7-repository-backend-and-fork-requirements}

### Memory/JSONL/SQLite {#memoryjsonlsqlite}

全部 Session facades：

- 从 begin/mutate 能力中移除 lane 参数和 lane 字段；
- 为本地生命周期和远程传输保留显式 `beginMutation(context)` / `SessionMutation.end(context)` 转发；
- 保持显式 scope 被接纳直到 `end()`，并保持回调 `mutate()` 通过其隐式 finally/end 被接纳；
- 暴露 Branch 获取/创建；
- 把直接读取留在 line 之外；
- 保持 Storage commit 序列不变。

SQLite 和未来 SQL backends 仍在 Storage 中序列化分配序列的 commits。Session mutation line 有意只在一个打开 Session 所有者内序列化完整回调；分开的 sessions 仍并发。

### Forks {#forks}

保留一份一致的源 Storage snapshot。把术语从 lane leaf 更新为 Branch tip。

- branch-scope fork 在被复制路径上创建目的地 Branch `main`；
- 如果没有提供显式源 entry，源 `main` 必须存在，否则 fork 拒绝；
- branch scope 复制源 main 的配置并写入空闲 lane 状态，**当且仅当** 源 main 是完整已配置 AgentLane；未配置/仅数据源 main 只产生仅数据目的地 main Branch；
- tree scope 复制每一个 Branch tip；每一个完整已配置源 AgentLane 一起复制其配置加上全新空闲 lane 状态，而每一个仅数据 Branch 保持仅数据；
- operation 值、pending values/lists、last results 和 usage 行仍被排除；
- 目的地 sessions 不获得无关隐式 main；
- 保留显式 begin/commit/end fork 顺序接缝：必须在开始 fork snapshot 之前接纳一次 commit 的代码调用无 key 的 `beginMutation()`，调用 `commit()`，只在 commit 接纳之后开始仓库 snapshot，并在 `finally` 中调用 `end()`；Storage 把源 snapshot 对 commits 排队，以选择一个一致边界。

---

## 8. 实现阶段与文件清单 {#8-implementation-phases-and-file-manifest}

公开 drive 仍禁用。在恢复 WP05 M4 之前完成本包。

### Phase A — Session mutation 与 Branch {#phase-a--session-mutation-and-branch}

**重命名**

- `src/harness/session/lane-mutations.ts` → `mutation-line.ts`。

**修改**

- `src/harness/session/types.ts` — `Branch`、无 key 的 `Session.mutate` 以及无 key 的 begin/end 传输 scope，没有 `SessionTree`，Session 全局方法。
- `src/harness/session/session.ts` — 一条 line，Branch 实现，没有隐式 main 委托，直接 Branch append；把 lane 创建校验错误重命名为 Branch 术语。
- Memory/JSONL/SQLite format-4 schema 和 codecs — 就地替换 WIP leaf/lane 拼写；不要添加版本门控或 migration。
- `src/harness/session/memory.ts`。
- `src/harness/session/jsonl/repo.ts`、`jsonl/legacy-v3.ts` 以及相关 open/create facade 文件。
- `packages/session-backends/sqlite-node/src/sqlite/session.ts` 以及 repo 创建。
- `src/harness/session/fork.ts`。
- `src/harness/session/index.ts` 以及包导出。
- storage/repository 基准和符合性调用点。

**重命名测试**

- `test/harness/session-tree.test.ts` → `branch.test.ts`。
- `test/harness/session-create-lane.test.ts` → `session-create-branch.test.ts`。

**修改测试**

- `test/harness/storage-backed-session.test.ts`。
- `test/harness/memory-session-repo.test.ts`。
- `test/harness/jsonl-session-repo.test.ts`。
- `test/harness/memory-conformance.test.ts`。
- `src/harness/session/testing/conformance/session-repo.ts`。
- SQLite repo/storage 测试。
- compaction/branch-summarization 类型 fixtures。

### Phase B — Harness/Lane 组合 {#phase-b--harnesslane-composition}

**修改**

- `src/harness/agent-harness.ts`。
- `src/harness/runtime/harness.ts`。
- `src/harness/runtime/lane.ts`。
- `src/harness/runtime/restore.ts`。
- `src/harness/runtime/types.ts` 中 `leafId` 变为 `tipId` 处。
- `src/harness/session/values.ts` 以及 Branch tip 命名的持久状态类型。
- 已经存在的全部 runtime drive 模块（`checkpoint`、`generation`、`recovery`、`terminal`、`progress`）只在名称/签名变更处。
- `src/harness/compaction/branch-summarization.ts`。
- `packages/protocol/src/harness.ts`。
- `packages/coding-agent/src/experimental/services/agent-controller-provider.ts`。
- `packages/coding-agent/src/experimental/services/models-provider.ts`。
- `packages/coding-agent/src/experimental/session-worker.ts`。
- experimental harness wire/session worker 测试。

**修改聚焦测试**

- 每一个使用 keyed mutate、隐式 Harness-as-main、`sessionTree`、`leafId` 或 `createLane` 的 `test/harness/runtime/*.test.ts` helper/调用点；
- `test/harness/types.test.ts`；
- `test/harness/branch-summarization.test.ts`；
- protocol 和 coding-agent experimental 测试。

Phase A 和 B 是一次原子落地。移除 `SessionTree`、keyed mutate 和 Harness 继承不能作为分开提交的兼容阶段编译，并且本包有意不添加临时别名。

### Phase C — 规范性文档 {#phase-c--normative-documentation}

完整且一致地更新 `packages/agent/docs/harness.md`：

- 导向/系统模型和已完成示例；
- 绑定 Branch tip 地址；
- Branch、Session 元数据、查询、forks 以及 repository 边界；
- operation 元数据/结果/snapshot `tipId` 术语；
- Parts 3–5 中的一条 Session mutation line；
- 没有必需 main 的 attachment；
- 公开 Branch、AgentLane、AgentHarness 和 Session 表面；
- Session line 下的 event/watcher 顺序；
- 移除旧的第二条 harness-settings-line 锁顺序叙述：当需要一致 snapshot 时，harness 全局 settings 和每一次持久 lane mutation 现在通过唯一 Session line 序列化；纯同步 registry 读取仍直接；
- 工作包表、不变量、竞态、backend 符合性以及术语表。

在 M4 之前更新 WP05：

- 替换 `SessionTree`/lane-line/继承假设；
- 在新类型名要求处替换 `leafId` 源码示例；
- 保留全部 M0–M3 历史行为和 M4–M8 持久要求；
- 陈述 WP06 是 M3 与 M4 之间的基础。

更新每一份其公开名称或顺序陈述改变的现行支持文档：

- `docs/assistant-durability.md` 和 `docs/tool-durability.md` — Session-line FIFO 和 `branchTip` 术语；
- `docs/values.md` — Session 全局 value/list 表面、Branch tip 地址，以及没有 `SessionTree`；
- `docs/telemetry.md` — 接收器 inventory 和 Session mutation spans；
- `docs/plugins.md` — 移除 `sessionTree`；插件的 AgentLane 直接提供 Branch 方法，而有范围的 Session-data facet 提供全局 value/list/name/label/query 方法，并排除原始 `mutate`、`idGenerator`、close 以及 backend 权威；
- `docs/extensions/pi-extensions-v2.md` 和 `docs/extensions/pi-server-artifact/index.md` 中示例/类型使用被改变表面处；
- 已完成 WP00–WP04 只在前瞻/现行状态陈述否则会声称被移除 API 仍存在处。

保留当前远程 Session mutation 契约，并把它从具名 lane line 更新为唯一 Session line：worker `RemoteSession.mutate()` 执行无 key begin RPC → 带远程读取/一次远程 commit 的本地回调 → 本地 post-commit 发布 → end RPC。Server 通过 commit 和发布持有 Session line，直到 end 确认。Disconnect/timeout 在现有托管策略下终止该 scope。更新当前远程 protocol/vertical-slice 文档以及 dev 上存在的每一个实现/测试；不要删除或推迟该行为。

不要重写已发版 changelog 各节。不要在非 main/非 PR 开发分支上添加 changelog 条目。

---

## 9. 必需测试 {#9-required-tests}

### Session mutation line {#session-mutation-line}

- 并发 `mutate()` 回调全局序列化，包括从不同 AgentLanes 调用的回调；
- 第二个回调直到第一个回调在 commit/发布之后返回才进入；
- 直接读取不等待尚未 commit 的回调；
- 即使该 mutation 回调在 commit 之后仍打开，直接读取也观察完全落地的 commit；
- 没有任何直接读取观察到部分多写 commit；
- 两次 read-modify-write 计数器 mutations 产生 `1`，然后 `2`；
- 分开的直接 `getValue` + `setValue` 调用保持有意非原子；
- 零 commit 回调合法；
- 无 key 的 `beginMutation()` 排除每一个其他 mutation 直到 `end()`，commit 不释放它，不 commit 的 end 合法，重复 end 幂等，并且 close 等待 end；
- RemoteSession begin/read/commit/发布/end 保留同一 scope；
- 第二次 commit 尝试拒绝，包括在失败的第一次尝试之后；
- 来自 mutation 回调的嵌套公开写入被文档化为无效，并按所选守卫确定性地阻塞/拒绝；
- close-first 拒绝 mutation；mutation-first 完成并且 close 等待；永不返回的受信任回调可以阻塞 close；
- Storage commit `seq` 和 stats 行为不变。

### Session 与 Branch {#session-and-branch}

- 全新 Session 有零个 Branches 且没有 main tip 值；
- 对被替换的 WIP format-4 schema 不添加 storage-version bump、migration、兼容 decoder 或拒绝路径；
- 当存在有效 model/thinking 历史时，遗留 coding-agent v3 import 在返回前重建普通完整 main-lane 配置加上空闲状态；否则它返回仅数据 main Branch；
- 遗留配置测试覆盖完整和不完整历史、无效遗留字段，以及只有选定 main 路径上的变更适用的分叉历史；
- `branch(name, context)` 对缺席返回 undefined，并在读取上接收精确 Context；
- `createBranch` 原子校验名称、目标和重复；
- 两次并发 create 有一个胜者；
- Branch 查询默认到其 tip，并保留 scan/filter/cursor 行为；
- 直接 Branch message/custom append 原子扩展其 tip；
- 带缺席 data 的 custom entry 仍有效；
- pending assistant append 拒绝；
- Session 全局 values/lists/name/labels/全局查询不再依赖 branch；
- 全部 close 前 Branch 对象在 close 之后拒绝；
- branch-scope fork 当且仅当源 main 已配置时一起复制 config + 空闲状态；tree scope 对每一个已配置 lane 独立做同样的事；仅数据 Branches 保持仅数据；
- 显式无 key begin/commit/end 保留 commit-before-fork-snapshot 顺序，并捕获一个 Storage 序列化的 snapshot 边界。

### AgentHarness 与 AgentLane {#agentharness-and-agentlane}

- Harness 在类型或运行时都没有 AgentLane 方法；
- Session 在类型或运行时都没有 Branch 方法；
- AgentLane 直接拥有 Branch 方法，并且没有 `sessionTree`/嵌套 Branch 属性；
- 全新 Harness `lanes()` 为空；
- `lane("main")` 原子创建完整 main；
- 缺失具名 lane 默认为 null tip；`createAt` 锚定创建；
- 现有仅数据 Branch 变成一个完整 AgentLane 而不移动其 tip；
- 现有完整 AgentLane 获取不 commit 任何东西，也不发出创建事件；
- 并发获取返回同一对象，并恰好发出一次 `lane_created`；
- 创建 commit 在释放 `Session.mutate` 之前发布 Lane 并绑定接收方；
- 无效名称/未知锚点不 commit 任何东西；
- 被恢复的完整 lanes/打开 operations 被清点而不创建 main；
- 部分 Branch/config/lane-state 组合失败；
- Harness 全局元数据包装保留 commit → 发布 → `value_update` 投递；
- AgentLane 空闲 append 移动 tip；活动 run append 暂存一次延迟写入并保留权威状态；
- close/fault 封闭每一个普通 Lane，而不依赖 Harness 继承。

### 回归 {#regression}

- M2 精确 Drive ABA 栅栏仍在 commit 接纳之前立即检查；
- 除被重命名的持久/公开字段外，M3 generation intent/frame/settlement 写入字节相同；
- 在一条 Session line 下 frame FIFO 仍正确；
- watch 只有 snapshot-first 或 publication-first 结果；
- usage totals 跨 lanes 保持 commit 边界精确；
- Context 在各处都是尾部且源相同；
- Memory、JSONL 和 SQLite repository/storage 符合性通过。

---

## 10. 排除项 {#10-exclusions}

不要添加：

- keyed mutation lines、任意锁名、资源锁、多锁顺序、versions 或乐观 retries；
- 调度器、事务框架、action interpreter 或通用 post-commit 任务系统；
- AgentLane 上的嵌套 Branch/tree/store/access 属性；
- `SessionTree`、`view`、隐式 Session main 方法、Harness lane 方法或 `createLane` 的兼容别名；
- keyed/具名 begin/end RPC scopes，或移除当前无 key RemoteSession mutation 传输；
- `Session.mutate()` 内部的 effects；
- 第二套 Storage commit/序列机制；
- 从 `AgentHarness.create()` 或 `harness.lane()` 自动开始工作；
- WP05 M8 之前的公开 drive。

除本包要求的签名/名称传播外，不要修改 provider/tool 行为、持久执行阶段、retry/deferred 策略或 assistant-frame 语义。

---

## 11. 验证 {#11-validation}

运行每一个被修改的聚焦测试，然后：

```bash
git diff --check
npm run check
./test.sh

rg -n "SessionTree|sessionTree|\.view\(|LaneMutationLine|extends AgentLane|extends Lane" \
  packages/agent/src packages/agent/test packages/agent/docs \
  packages/session-backends packages/protocol packages/coding-agent/src/experimental \
  packages/coding-agent/test/experimental*

rg -n "beginMutation\([^)]*,|mutate\([^)]*,[^)]*," \
  packages/agent/src packages/agent/test packages/session-backends packages/coding-agent/src/experimental

rg -n "session\.mutate\([^)]*\"|\.mutate\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*," \
  packages/agent/src packages/agent/test packages/session-backends
```

预期第一次 grep 只匹配本包的问题陈述、明确历史工作包 API 描述、否定类型断言，以及无关的 coding-agent tree-widget 名称例如 `SessionTreeNode`；没有任何现行 harness `SessionTree` 概念残留。Keyed-mutate grep 在手动检查误报之后必须为空。

在 commit 之前用 Fable 评审完整实现和规范性文档更新。未经用户明确批准不要 commit。

---

## 12. 停止条件 {#12-stop-condition}

当下列条件满足时 WP06 完成：

- Session 有一条无 key mutation line；回调 `mutate()` 和显式 begin/commit/end 远程传输共享它，并且两者都不接受 lane key；
- 直接读取绕过该 line，并且只暴露完全应用的 Storage commits；
- `SessionTree` 和隐式 main Session 行为已消失；
- Branch 是仅数据的路径/tip 抽象；
- AgentLane 直接暴露 Branch 方法，并保留感知 operation 的 append 语义；
- AgentHarness 只是组合，没有 AgentLane 方法，并且原子获取/创建 lanes；
- 全新 Session/Harness 不要求 main；
- 全部进程局部发布和事件绑定边界仍正确；
- 全部三个 backends 和聚焦竞态测试通过；
- `harness.md` 和 WP05 一致描述新模型；
- 最终 Fable 评审报告没有发现；
- WP05 M4 可以恢复。
