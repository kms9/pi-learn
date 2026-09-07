本文是 `values.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 类型化 value 与 list {#typed-values-and-lists}

本文规定 Session、harness 与应用所使用的可变存储原语。

对外抽象是**绑定的类型化地址**：

- `value<T>(namespace, key?)` 命名一个可替换的持久 value；
- `list<T>(namespace, key?)` 命名一个元素类型为 `T` 的仅追加持久 list。

namespace/key 对在构造地址时绑定一次。之后每次操作只接收该地址。因此应用代码写成：

```ts
const state = value<ApplicationState>("my-app.state");
const events = list<ApplicationEvent>("my-app.events");

await session.getValue(state, context);
await session.setValue(state, nextState, context);
await session.readList(events, { limit: 100 }, context);
await session.appendList(events, event, context);
```

它**不会**反复传入第二个未解释的 key：

```ts
// 不是本 API。
await session.readList(events, "another-key", { limit: 100 }, context);
```

当应用确实有按 key 区分的实例时，为该实例构造地址：

```ts
const workspaceEvents = (workspaceId: string) =>
  list<ApplicationEvent>("my-app.events", workspaceId);

await session.readList(workspaceEvents("pi"), { limit: 100 }, context);
```

存储在物理上可以把地址索引为 `(kind, namespace, key)`，但该表示不会泄漏进每次读或写调用。Storage、Session、harness 代码与应用使用同一套地址词汇。没有全局 value 类型表、动态 registry、token catalog，也没有单独的应用状态存储机制。

## 目标 {#goals}

1. 给一个精确的持久地址一个编译期 value 类型。
2. 让应用定义标量 value 与 list，无需 declaration merging 或编辑核心类型表。
3. 从 Storage 到 Session 使用相同的类型化地址与操作名。
4. 保留当前的标量替换语义。
5. 追加一个 list 元素，而不读取或重写已有元素。
6. 给每个 list 元素其既有的 session 全局事务 `seq`，用于排序与分页。
7. 把 value 与 list 元素与 entry、usage 原子地一起提交。
8. 在 Memory、JSONL 与 SQLite 上产生相同的逻辑行为。
9. 保持 list 读取有界且显式。
10. 保持标量操作状态为权威；辅助 list 从不选择恢复状态。

## 非目标 {#non-goals}

本切片不定义：

- assistant-frame 内容或归约语义；
- tool-progress 语义；
- 对受信任进程内 value 的运行时校验；
- 按元素或按 list 的字节上限；
- list 截断或按元素删除；
- 通用事件日志、journal、流恢复协议或操作 reducer；
- 全局注册地址对象；
- 向工具暴露原始 Session 或事务访问。

消费者拥有地址构造、内容上限、清理点、fork 策略、迁移策略，以及消费时 hydration。`assistant-durability.md` 定义第一个 list 消费者。

## 绑定地址模型 {#bound-address-model}

```ts
declare const storedValueType: unique symbol;

interface StoredAddressBase {
  /** 稳定的持久分组名。 */
  readonly namespace: string;
  /** 该分组内的精确成员。空字符串合法。 */
  readonly key: string;
  readonly kind: "value" | "list";
}

export interface Value<T> extends StoredAddressBase {
  readonly kind: "value";
  /** 仅编译期，且对 T 不变。 */
  readonly [storedValueType]?: (value: T) => T;
}

export interface ValueList<T> extends StoredAddressBase {
  readonly kind: "list";
  /** T 是一个元素，不是整个 list。 */
  readonly [storedValueType]?: (value: T) => T;
}

export function value<T>(namespace: string, key = ""): Value<T> {
  validateAddress(namespace, key);
  return Object.freeze({ namespace, key, kind: "value" });
}

export function list<T>(namespace: string, key = ""): ValueList<T> {
  validateAddress(namespace, key);
  return Object.freeze({ namespace, key, kind: "list" });
}
```

phantom 函数使 `T` 不变：一种类型的地址不能悄悄 widen 成另一种。它没有运行时字段。

规则：

- `namespace` 必须非空；
- namespace `pi` 以及每个 `pi.*` namespace 按契约保留给内置项；
- 构造保留地址的应用是有缺陷的受信任进程内代码；不存在运行时权限分割、registry 或 catalog；
- 任一组件都不得包含 Memory 后端的内部分隔符（`\u0000`）；
- 空 key 合法，并且是一个应用范围 value 或 list 的自然地址；
- 对象身份没有持久含义；
- 分别构造、但具有相同 `(kind, namespace, key)` 的地址标识同一持久位置；
- 用不相容的 TypeScript 类型构造同一持久位置是受信任编程缺陷；
- 标量与 list 地址在同一 storage version 中不得共享同一 `(namespace, key)`；违反这一点是受信任编程缺陷，存储不做跨 kind 碰撞检查；
- 改变地址的 namespace、key、kind 或不相容的 value 形状需要迁移。

这两个组件保持分离，而不是拼接。因此动态应用 key 与 operation ID 除存储分隔符规则外不需要转义约定。

### 精确地址，不是族 {#exact-addresses-not-families}

一个地址命名一个 value 或一个 list。内部代码在有动态 key 时使用小型构造器：

```ts
export const branchTip = (lane: string) =>
  value<string | null>("pi.branch.tip", lane);

export const operationState = (operationId: string) =>
  value<OperationState>("pi.op.state", operationId);

export const operationToolArgs = (
  operationId: string,
  stepId: string,
  sourceIndex: number,
) => value<Record<string, JsonValue>>(
  "pi.op.tool_args",
  `${operationId}:${stepId}:${sourceIndex}`,
);

export const pendingAssistantFrames = (
  operationId: string,
  responseEntryId: string,
) => list<AssistantMessageFrame>(
  "pi.pending.assistant_frame",
  `${operationId}:${responseEntryId}`,
);
```

这把每种 key 文法封装在其所有者处。调用点收到已经绑定的类型化地址：

```ts
await reader.getValue(operationState(operationId));
await reader.readList(pendingAssistantFrames(operationId, responseEntryId), options);
```

### 没有全局 value map {#no-global-value-map}

删除现有的全局 namespace-to-type map：

```ts
interface RegisterValues { /* 删除 */ }
interface ListRegisterValues { /* 删除 */ }
type RegisterNamespace = keyof RegisterValues; // 删除
```

类型属于地址构造器：

```ts
export const applicationState = value<MyApplicationState>("my-app.state");
export const applicationEvents = list<MyApplicationEvent>("my-app.events");
```

应用应使用稳定、抗碰撞的 namespace 前缀。Namespace `pi` 以及完整的 `pi.*` 前缀按契约保留给内置项；外形相近的名字如 `pi2` 仍然合法。同一套 `value()` 与 `list()` 构造器服务核心与应用代码。测试断言每个内置地址使用其保留前缀。没有运行时权限分割、registry 或 catalog。

## 内置地址 {#built-in-addresses}

内置构造器集中放在 `packages/agent/src/harness/session/values.ts`，由消费者直接 import。代表性定义：

```ts
export const branchTip = (lane: string) =>
  value<string | null>("pi.branch.tip", lane);
export const laneConfig = (lane: string) =>
  value<LaneConfiguration>("pi.lane.config", lane);
export const laneState = (lane: string) =>
  value<LaneState>("pi.lane.state", lane);
export const operationResult = (operationId: string) =>
  value<OperationResultRecord>("pi.result", operationId);

/** 仅由 scanValues() 用来枚举 Branch 名。 */
export const branchTipInventoryPrefix = () =>
  value<string | null>("pi.branch.tip");

export const operationMeta = (operationId: string) =>
  value<OperationMeta>("pi.op.meta", operationId);
export const operationState = (operationId: string) =>
  value<OperationState>("pi.op.state", operationId);
export const operationToolArgs = (operationId: string, stepId: string, sourceIndex: number) =>
  value<Record<string, JsonValue>>(
    "pi.op.tool_args",
    `${operationId}:${stepId}:${sourceIndex}`,
  );
export const operationToolMemo = (operationId: string, invocationId: string, name: string) =>
  value<JsonValue>("pi.op.tool_memo", `${operationId}:${invocationId}:${name}`);
export const operationPreparation = (operationId: string, taskId: string) =>
  value<DurableStructuralPreparation>(
    "pi.op.preparation",
    `${operationId}:${taskId}`,
  );

/** 前缀地址仅导出给 namespace 作用域的 scanValues()。 */
export const operationToolArgsPrefix = (operationId: string, stepId?: string) =>
  value<Record<string, JsonValue>>(
    "pi.op.tool_args",
    stepId === undefined ? `${operationId}:` : `${operationId}:${stepId}:`,
  );
export const operationToolMemoPrefix = (operationId: string, invocationId?: string) =>
  value<JsonValue>(
    "pi.op.tool_memo",
    invocationId === undefined ? `${operationId}:` : `${operationId}:${invocationId}:`,
  );
export const operationPreparationPrefix = (operationId: string) =>
  value<DurableStructuralPreparation>("pi.op.preparation", `${operationId}:`);

export const pendingEntry = (entryId: string) =>
  value<PendingEntry>("pi.pending.entry", entryId);
export const pendingToolOutput = (operationId: string, invocationId: string) =>
  value<AgentToolResult<unknown>>(
    "pi.pending.tool_output",
    `${operationId}:${invocationId}`,
  );
export const pendingAssistantFrames = (operationId: string, responseEntryId: string) =>
  list<AssistantMessageFrame>(
    "pi.pending.assistant_frame",
    `${operationId}:${responseEntryId}`,
  );
export const pendingToolOutputPrefix = (operationId: string) =>
  value<AgentToolResult<unknown>>("pi.pending.tool_output", `${operationId}:`);

export const sessionName = value<string>("pi.session.name");
export const entryLabel = (entryId: string) => value<string>("pi.entry.label", entryId);
```

`OperationMeta` 是存储在 `pi.op.meta` 的不可变 acceptance 元数据。进程本地的 `Operation` 投影是 `{ meta: OperationMeta, state: OperationState }`，由分开的 metadata 与 state value 组装；它从不存储在一个地址上。

五个导出的 scan-prefix 构造器是 `branchTipInventoryPrefix`、`operationToolArgsPrefix`、`operationToolMemoPrefix`、`operationPreparationPrefix` 与 `pendingToolOutputPrefix`。它们的地址仅由 `scanValues()` 消费。

应用直接定义自己的 `value()` 与 `list()` 地址；没有内置的自定义应用状态 namespace 或 custom-state API。`AgentHarnessToolInvocation.getMemo()` 与 `setMemo()` 是覆盖 `operationToolMemo(...)` 的 invocation 围栏能力，不是原始 Session 访问。Invocation memo 仍由 operation 拥有，并在其 tool outcome 变得持久时删除。

测试断言内置构造器产生文档中的 kind、namespace 与 key 文法。因为构造器可以是动态的，不存在试图枚举每个可能地址的运行时 catalog。

## 共享读 API {#shared-read-api}

Storage、Session、SessionReader 与 SessionMutator 使用相同的读签名：

```ts
export interface StoredValue<T> {
  address: Value<T>;
  value: T;
  seq: number;
}

export interface ListElement<T> {
  /** 由存储分配的全局事务写序号。 */
  seq: number;
  value: T;
}

export interface ListCursor {
  seq: number;
}

export interface ListReadOptions {
  /** 排他游标。 */
  cursor?: ListCursor;
  /** 默认：asc。 */
  order?: "asc" | "desc";
  /** 查询页大小。默认：1,000。超过 10,000 的值钳到 10,000。 */
  limit?: number;
}

interface ValueReader {
  getValue<T>(address: Value<T>): Promise<StoredValue<T> | undefined>;

  /** 内部有界前缀操作。地址 key 被解释为前缀。 */
  scanValues<T>(prefix: Value<T>): Promise<StoredValue<T>[]>;

  readList<T>(
    address: ValueList<T>,
    options?: ListReadOptions,
  ): Promise<ListElement<T>[]>;
}
```

`scanValues(prefixAddress)` 扫描恰好该 namespace、且 key 以绑定 key 开头的标量地址，按 key 升序返回。核心调用点只使用上面导出的前缀构造器，因此原始 namespace/key 文法留在 `session/values.ts`。前缀地址只传给 `scanValues()`，从不传给精确的 get/set/delete 操作。没有无限制的跨 namespace dump。普通应用读取使用精确地址。

`Session` 使用相同地址暴露直接的单次转换写入：

```ts
interface Session extends ValueReader {
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
}
```

`getName()`、`setName()`、`getLabel()` 与 `setLabel()` 等面向用途的 helper 可以保持为内置地址上的薄包装。应用直接定义并使用自己的标量/list 地址。

`SessionMutator` 仍是读能力加上一次原子 `commit(writes)`。它不暴露会单独消耗其唯一 commit 的直接 `setValue()`/`appendList()` 方法；调用者构造类型化 write 数组并一起提交。

## 类型化事务写入 {#typed-transaction-writes}

写入通过类型化 helper 构造。Entry 与 usage 构造器隐藏其存储判别式；value/list 擦除只在 helper 检查过地址/value 类型关系之后发生：

```ts
interface EntryWrite {
  kind: "entry";
  entry: NewEntry;
}

interface UsageWrite {
  kind: "usage";
  row: Omit<UsageRow, "seq">;
}

interface ValueSetWrite {
  kind: "value";
  op: "set";
  namespace: string;
  key: string;
  value: unknown;
}

interface ValueDeleteWrite {
  kind: "value";
  op: "delete";
  namespace: string;
  key: string;
}

interface ListAppendWrite {
  kind: "list";
  op: "append";
  namespace: string;
  key: string;
  value: unknown;
}

interface ListDeleteWrite {
  kind: "list";
  op: "delete";
  namespace: string;
  key: string;
}

export function insertEntry(entry: NewEntry): EntryWrite;
export function insertUsage(row: Omit<UsageRow, "seq">): UsageWrite;
export function setValue<T>(address: Value<T>, next: NoInfer<T>): ValueSetWrite;
export function deleteValue<T>(address: Value<T>): ValueDeleteWrite;
export function appendList<T>(address: ValueList<T>, element: NoInfer<T>): ListAppendWrite;
export function deleteList<T>(address: ValueList<T>): ListDeleteWrite;
```

`NoInfer<T>` 使地址成为权威。TypeScript 不得从不相容的写入值推断更宽的 `T`。

`Write` 包含全部六个 helper 返回类型。一次事务可以原子地混合每一种写入 kind。Harness 与应用代码使用 helper，而不是手工构造存储写入形状。

直接 Session 方法与事务 helper 有意使用相同的操作名。一个执行并提交单次 Session mutation；另一个为显式组合的事务构造一次写入。

## 标量语义 {#scalar-semantics}

对一个 `Value<T>` 地址：

- `setValue` 替换当前 value；
- `deleteValue` 移除它；
- 删除不存在的 value 是 no-op；
- 删除后再 set 会重建它；
- 不保留 value 历史；
- 当前 value 记录其最近一次 set 的 `seq`；
- 失败的事务既不暴露该标量写入，也不暴露任何兄弟写入。

## List 语义 {#list-semantics}

一次 append 写入携带一个不可变元素。一次事务追加多个元素就包含多次 append 写入。每次写入都收到其既有的全局递增事务序号：

```text
TX[
  appendList(frames, A),       // seq 41
  setValue(operationState, X), // seq 42
  appendList(frames, B),       // seq 43
]
```

读取 `frames` 返回 `A`，然后是 `B`。来自无关写入的空隙是预期的。一个 list 元素的 `seq` 是 session 全局的，并且对该次已提交写入唯一；它是排序/游标身份，不是应用领域 ID。需要领域身份的应用把它放进 `T`。

规则：

- append 从不读取已有元素；
- 元素在提交后不可变；
- `deleteList(address)` 移除该精确地址上的每个元素；
- 删除不存在的 list 是 no-op；
- 在一次事务中先 delete 再 append 会原子地创建全新 list；
- 不存在按元素的 update、delete、插入或截断；
- 接纳事务所需要的全部校验与序列化在 Memory 状态变化之前完成；
- 失败的事务不暴露其任何 list 或非 list 写入。

“仅追加”描述的是 list 存在期间的元素。整表删除是生命周期清理，不是元素 mutation。

### List 读取 {#list-reads}

- 升序读取返回 `seq > cursor.seq`；
- 降序读取返回 `seq < cursor.seq`；
- 结果先按 `order` 排序，再应用 `limit`；
- 不存在与空都返回 `[]`；
- 调用者用最后返回元素的 `seq` 继续；
- 空页结束迭代；
- `limit` 只是查询页大小：必须是正的安全整数，默认 1,000，超过 10,000 的值钳到 10,000；它从不限制 list 总长度或字节。

```ts
let cursor: ListCursor | undefined;
while (true) {
  const page = await reader.readList(events, { cursor, order: "asc", limit: 100 });
  if (page.length === 0) break;
  consume(page);
  cursor = { seq: page[page.length - 1]!.seq };
}
```

游标是序号过滤器，不是快照或 list 世代 token。并发的后续 append 可能出现在后续升序页上。整表删除可能使游标过期；读取只是把它的序号比较应用到当前仍存活的元素。

不要添加无界的“读取整个 list”helper。

## Assistant 部分帧 {#assistant-partial-frames}

Assistant 部分持久化是第一个内置 list 消费者：

```ts
const frames = pendingAssistantFrames(operationId, responseEntryId);
```

`AssistantMessageFrame`、`AssistantMessageFrameEncoder` 与 `reduceAssistantMessageFrames()` 来自 `@earendil-works/pi-ai`。不要定义第二套帧编解码器或 reducer。

对每个可转换的非终端 provider 事件，assistant 过程：

```text
把事件转换成 frame
→ 在 Session mutation line 上同步入队 appendList(frames, frame)
→ 把普通 harness-fault observer 挂到该返回的 promise
→ 替换进程本地的 latestFrameWrite 引用
→ 发出并等待现有的 message 事件
→ 消费下一个 provider 事件
```

Provider 循环不为每一帧等待存储。同步入队保留 provider 事件顺序。替换最新 promise 引用从不会让更早的 rejection 无人观察，因为每个 promise 都收到 fault observer。有界输出约束排队工作。在流结算时，该过程停止接纳帧，并在 `after_response` 之前等待最新 append promise；Session mutation FIFO 意味着该完成蕴含每个更早的 append 都已完成。没有 timer、batcher、coalescer 或 flush API。

标量 assistant `effect_pending` 仍是权威。每次 append 在其 mutation 执行时验证同一 operation、attempt 与 response ID 仍拥有该 lane。帧从不证明请求接纳、完成、成功或失败。

最终或合成的 assistant 结算把精确 list 与其不可变响应、usage、Branch tip 以及下一个标量状态原子删除：

```text
TX[
  insert final assistant entry,
  insert usage,
  deleteList(frames),
  setValue(operationState(operationId), nextState),
]
```

`assistant-durability.md` 定义帧转换、未知 outcome 合成、取消、deferred polling、快照与事件顺序。

## 恢复策略 {#restore-policy}

标量操作状态仍是唯一的重启权威：

1. 从所需标量 value 构造受信任的 lane/operation 投影；
2. 信任已提交的类型化 value，而不是审计每个被引用的 payload 或阶段关系；
3. 当过程或快照消费辅助状态时，从当前类型化标量状态派生其精确绑定地址；
4. 只 hydrate 该消费者需要的有界标量 value 或 list 页。

缺失的辅助 list 合法，除非其消费者显式要求一个元素。List 内容从不证明外部 effect 已完成。实时 mutation 仍验证当前 operation、phase、attempt 与保留身份作为并发围栏；那不是恢复校验。

基础恢复不枚举 list。对 assistant 帧，快照或恢复仅在消费类型化 assistant/deferred `effect_pending` 状态时派生 `pendingAssistantFrames(operationId, responseEntryId)`。

每个 list 消费者定义：

- 地址文法；
- 元素与总字节上限；
- 页/hydration 预算；
- 清理转换；
- fork 与迁移策略。

## Memory 后端 {#memory-backend}

Memory 可以为当前 value 与 list 元素保持分开的 map：

```ts
const scalarValues = new Map<string, StoredValue<unknown>>();
const listValues = new Map<string, ListElement<unknown>[]>();

function physicalKey(address: StoredAddressBase): string {
  return `${address.namespace}\u0000${address.key}`;
}
```

- 标量 set 替换一个 map value；
- 标量 delete 移除它；
- list append 推入已经编序号的元素；
- list delete 移除完整数组；
- list 读取按排他游标过滤，并切到已校验的 limit；
- 事务准备在 entries、values、lists、usage 或 stats mutation 之前完成。

JSONL/fork 工具使用的存储快照包含当前标量 value 以及带原始序号的存活 list 元素。

## SQLite 后端 {#sqlite-backend}

逻辑 schema 有一张当前 value 表和一张 list 元素表：

```sql
CREATE TABLE scalar_values (
  namespace TEXT NOT NULL,
  key       TEXT NOT NULL,
  seq       INTEGER NOT NULL,
  value     TEXT NOT NULL,
  PRIMARY KEY (namespace, key)
) WITHOUT ROWID;

CREATE TABLE list_values (
  namespace TEXT    NOT NULL,
  key       TEXT    NOT NULL,
  seq       INTEGER NOT NULL,
  value     TEXT    NOT NULL,
  PRIMARY KEY (namespace, key, seq)
) WITHOUT ROWID;
```

WP01 原地替换未完成的 format-4 schema：编辑 `sqlite/migrations/001_initial.sql`，把物理 `registers` 表重命名为 `scalar_values`，添加 `list_values`，并保持 `SQLITE_STORAGE_VERSION = 1`。这个 WIP 实现没有 migration runner，且不支持 WP01 之前的 SQLite 文件。不要在本包中添加迁移机制。

List 操作：

```sql
INSERT INTO list_values(namespace, key, seq, value) VALUES (?, ?, ?, ?);

SELECT seq, value FROM list_values
WHERE namespace = ? AND key = ? AND seq > ?
ORDER BY seq ASC LIMIT ?;

SELECT seq, value FROM list_values
WHERE namespace = ? AND key = ? AND seq < ?
ORDER BY seq DESC LIMIT ?;

DELETE FROM list_values WHERE namespace = ? AND key = ?;
```

缺少游标时，省略序号谓词。每次写入都参与既有的 `BEGIN IMMEDIATE` 事务；可写 Session 所有权属于 host 生命周期，不属于 SQLite 存储。用 `EXPLAIN QUERY PLAN` 断言分页使用主键且没有临时排序。

## JSONL 后端 {#jsonl-backend}

逻辑记录携带绑定地址的物理组件：

```jsonl
{"kind":"list","op":"append","seq":41,"namespace":"pi.pending.assistant_frame","key":"O:R","value":{"type":"text_delta","contentIndex":0,"delta":"hi"}}
{"kind":"list","op":"delete","seq":52,"namespace":"pi.pending.assistant_frame","key":"O:R"}
```

标量记录使用 `kind:"value"` 以及 `op:"set"|"delete"`。WP01 保持 JSONL format 4 与 storage version 1，但原地替换未完成的记录拼写；不支持 WP01 之前的 format-4 文件，也不再保留遗留 `kind:"register"` 解码器。

Replay 把记录折叠进 Memory 状态：

- 标量 set 替换当前地址；
- 标量 delete 移除它；
- list append 添加 `{ seq, value }`；
- list delete 移除完整 list。

一次事务仍是一行物理 JSONL，多写时使用数组。因此撕尾处理在没有新分帧的情况下仍保持原子。

### 快照压缩 {#snapshot-compaction}

压缩把每个存活 list 元素连同其原始 `seq` 写出，并按序号顺序与存活 entries、标量 value 以及 usage 行合并。不要把一个活 list 折叠成一个合成元素，也不要分配新序号；任一改变都会破坏游标与后端等价。

已删除的 list 不产生快照记录。快照重写把 `nextSeq` 持久化进 format-4 header，这样丢掉最近一次 delete 就不能允许序号重用；普通仅追加文件可以省略该字段，并从 replay 的写入派生它。

## Fork 与 rewrite {#forks-and-rewrites}

Fork 与精确 rewrite 代码按具体地址文法决定策略：

- operation 拥有的 `pi.op.*` 标量 value 不复制进空闲 fork；
- 不可变 `pi.result` operation 记录不被 fork 复制；
- `pi.pending.entry`、`pi.pending.tool_output` 与 `pi.pending.assistant_frame` 的 value/list 不复制；
- lane 与语义 session value 遵循其既有 scope 规则；
- 应用定义的 value/list 不被通用 fork 复制；消费该状态的功能必须在依赖已复制的应用状态之前添加显式的地址特定策略。

保留 list 元素的精确 rewrite 保留其 `seq` 值，除非它显式重映射整个目标序号空间。

## Schema 演进 {#schema-evolution}

绑定地址的 namespace、key 文法、kind 与 value 类型是持久 schema：

- 改变 namespace 或 key 文法需要显式地址迁移；
- 把标量改成 list 或把 list 改成标量需要显式迁移；
- 存储从不从观察到的记录推断或强制 kind；
- 改变 TypeScript value 形状，在旧存储 value 不相容时需要全量 value 迁移；
- list 迁移按序号顺序分页元素，要么在保留 `seq` 的同时映射它们，要么删除完整 list；
- 迁移不得一次加载无界逻辑 list。

添加通用 list 存储会原地替换当前 WIP 后端 schema。构造一个没有已持久 value 的新应用地址不需要迁移。

## 插装与 telemetry {#instrumentation-and-telemetry}

插装存储装饰器暴露基于地址的读 API，并按精确事务顺序记录已提交的擦除写入。

Telemetry 的 session-write item kind 区分标量 value 写入与 list 写入。当 telemetry schema 允许时，namespace/key 名可以作为属性，但 values、assistant 帧、prompt 与 tool 输出从不进入 telemetry。

Append 路径测试证明在 append 提交之前不发生 `readList` 调用。帧持久化 promise 始终收到 harness fault observer，即使更早的 promise 已不再是最新的结算顺序引用。

## 不变量 {#invariants}

1. 在一个 storage version 中，一个绑定地址有一个稳定的 namespace/key/kind 以及一个受信任的 value 类型。
2. 地址对象身份没有持久含义。
3. Namespace `pi` 以及每个 `pi.*` 按契约保留；每个内置 namespace 以 `pi.` 开头，应用使用是受信任编程缺陷。
4. 恰好五个内置前缀构造器封装 Branch 清单与 operation 清理文法；其结果仅由 namespace 作用域的 `scanValues()` 消费。
5. 标量与 list 地址不得占用同一物理位置；这是受信任编程规则，不是运行时跨 kind 碰撞检查。
6. 类型化读取与 helper 构造的写入保留 `T`。
7. 标量 helper 拒绝 list 地址；list helper 拒绝标量地址。
8. Session/Storage 操作在地址构造之后从不要求第二个 key。
9. 每个 list 元素不可变，并携带其全局唯一的已提交写入 `seq`。
10. 一个 list 地址上的元素在每个后端上都按序号顺序返回。
11. Append 不对目标 list 执行读取。
12. 标量/list 写入与同一事务中的 entries 和 usage 原子。
13. 整表 delete 在该地址上不留下元素。
14. 缺失与空 list 都读成 `[]`。
15. 基础恢复只依赖所需标量状态，从不枚举辅助 list。
16. 辅助 list 从不确立 effect 完成，也不选择重启状态。
17. JSONL 压缩保留存活元素的序号。
18. 终端清理不留下 operation 拥有的标量 value 或 list。

## 所需测试 {#required-tests}

### 地址类型与身份 {#address-typing-and-identity}

- `value<T>()` 与 `list<T>()` 不变地保留其声明的 `T`；
- 标量读取推断绑定地址的 value 类型；
- list 读取推断其元素类型；
- `setValue` 在编译期拒绝不相容的 value；
- `appendList` 在编译期拒绝不相容的元素；
- 标量 helper 拒绝 list 地址，list helper 拒绝标量地址；
- 独立构造的相等地址访问同一持久位置；
- 同一物理地址的不相容定义作为编程缺陷被文档化/测试；
- 空 key 可用，而空 namespace 与含分隔符的组件被拒绝；
- 核心与应用代码使用同一套 `value()` 与 `list()` 构造器，没有私有构造器、权限 token、registry 或 catalog；
- 内置地址构造器产生精确的 `pi.branch.tip`、`pi.lane.*`、`pi.op.*`、`pi.pending.*`、`pi.session.name` 与 `pi.entry.label` namespace/key/kind 三元组；
- 每个内置 namespace 以 `pi.` 开头，而应用 fixture 使用非保留 namespace；
- `branchTipInventoryPrefix()` 绑定空 key 的 `pi.branch.tip` 清单前缀，并且只用于通过 `scanValues` 枚举 Branches；
- tool-args 前缀覆盖一个 operation 以及可选的一个 step，tool-memo 前缀覆盖一个 operation 以及可选的一个 invocation，preparation 与 tool-output 前缀恰好覆盖一个 operation；
- 每个前缀构造器结果只由 `scanValues` 使用，且没有任何清单或清理调用构造原始保留 namespace；
- 应用地址无需 declaration merging 或核心 catalog 即可工作；
- 没有 Storage 或 Session 操作接受额外的 key 参数。

### 标量回归 {#scalar-regression}

- set/get/delete/recreate 行为不变；
- 替换只保留最新逻辑 value 与最近一次 set 的 `seq`；
- 类型化写入 helper 保留混合事务顺序；
- 前缀扫描把绑定地址 key 解释为前缀，并保持 namespace 作用域；
- 新的标量 JSONL/SQLite 文件只使用 value/list schema；WP01 之前的 WIP 文件被显式不支持。

### List 一致性 {#list-conformance}

扩展共享后端一致性套件：

- 追加一个元素并分页读取它；
- 一次事务中对同一地址多次 append；
- 被无关写入隔开的 append 保留每个 list 的顺序；
- 每个元素收到自己的全局写入 `seq`；
- 升序与降序排他游标；
- 默认、显式、非法与封顶的 limit；
- 不存在的 list 返回 `[]`；
- 整表 delete 以及删除不存在的 list；
- 一次事务中先 delete 再 append；
- 后续写入非法时回滚；
- 原子的 list + entry + usage + 标量事务；
- Memory、JSONL 与 SQLite 上相同的页与游标；
- JSONL 撕尾的多写事务不暴露任何 list 元素；
- JSONL replay 与压缩保留游标；
- SQLite 分页使用主键且没有临时排序；
- append 不执行 list 读取；
- 基础恢复在不读取 list 的情况下构造受信任标量投影，随后是有界的消费时 hydration；
- close 拒绝后续读取，并兑现已经接纳的 commit。

### 应用表面 {#application-surface}

- 应用范围的标量 value 在 get/set 时不需要额外 key；
- 应用范围的 list 在 read/append 时不需要额外 key；
- 应用可以显式构造动态的按 workspace 地址；
- Storage 与 Session 接受相同的地址对象并推断相同类型；
- 直接 Session 写入序列化并提交一次；
- 显式 `Session.mutate()` 可以把类型化 value/list 写入与 entries、usage 原子组合。

### Assistant 帧集成 — 推迟到 WP01 之后 {#assistant-frame-integration--deferred-beyond-wp01}

- 每个已转换的非终端帧追加在精确绑定的 effect-pending 响应地址下；
- 终端 `done`/`error` 事件不追加任何内容；
- append 同步入队，没有 provider 背压；
- 每个帧写入 promise 都有被观察的 fault 路径；
- 仅为结算顺序保留最新 promise 引用；
- 等待最新 promise 蕴含每个更早的 append 都已完成；
- 归约后的页重建与不中断流式传输相同的部分消息；
- 缺失 list 恢复为没有持久部分；
- 最终/合成结算原子删除帧 list；
- 未知 effect 恢复只读取从当前标量状态派生的有界 list；
- 外部终结删除 operation 拥有的 list；
- 空闲 fork 不含帧 list；
- 后端字节增长是追加线性，而不是重复快照增长。

## 实现地图 {#implementation-map}

预期的主要变更：

- 用 `packages/agent/src/harness/session/values.ts` 替换 `session/registers.ts`，其中包含地址、构造器、类型化写入 helper 以及内置地址构造器；
- 从 `session/types.ts` 移除 `RegisterValues`、namespace union、register token 类型，以及原始 namespace/key 读签名；
- 通过 Storage、SessionReader、SessionMutator 与 Session 暴露 `ValueReader`；
- 在 Session 上用绑定地址暴露直接的应用标量/list 方法；
- 更新 Memory 状态、JSONL codec/storage、快照、fork/rewrite 代码、插装以及一致性套件；
- 原地用 `scalar_values` 与 `list_values` 替换 SQLite 未完成的初始 schema；保持 storage version 1，不添加 migration runner；
- 更新 telemetry schema 源并重新生成 `telemetry-schema.md`；不要手工编辑该生成文件。

WP01 在通用地址/存储以及仅投影的恢复覆盖之后停止。`assistant-durability.md` 规定后续消费生命周期；assistant 执行、deferred polling、恢复、快照 hydration、memo/checkpoint 能力以及 operation 清理只随其运行时工作包落地。
