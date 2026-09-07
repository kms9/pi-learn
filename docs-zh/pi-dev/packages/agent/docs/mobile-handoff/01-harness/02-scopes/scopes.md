本文是 `scopes.md` 的中文阅读版；命令、路径、API 名称保持英文。

# Session 存储：Scopes {#session-storage-scopes}

> **状态：** 设计证据。可执行的 Step 1 契约是 [`implementation-handoff.md`](implementation-handoff.md)，它在序号分配、可复用 scope ID、退役权威 / 记录、sidecar 布局、实现顺序，以及把 JSONL 编码拆到 Step 2 这些点上取代本文档。
>
> **范围：** `packages/agent/src/harness/session/`，外加 §10 列出的 `runtime/` 调用点。
>
> **依赖 [01-delta](../01-delta/delta.md)**，以获取 pending 状态所存储的已落地 Chord op 词汇（§2、§11），以及记录编码所携带的 `WireOp` 形式（§12）。两者在其他方面独立且叠加：编码缩小每一次写入，scopes 把某一类写入完全移出主日志。
>
> 这里的每一项主张都对照 `runtime/lane.ts`、`runtime/progress.ts` 和 `runtime/drive/*.ts` 核对过。§6 的类型级强制用 `tsc --strict` 验证过，包括混合 scope 提交是它*唯一*拒绝的事情。

## 1. 问题 {#1-the-problem}

operation 状态 — pending 工具输出、pending assistant 输出 — 只在 operation 运行时要紧。它是崩溃恢复脚手架，不是历史。

JSONL 日志是只追加的，因此它照样持久化。更糟的是，删除它*增加*记录：`deleteValue` 和 `deleteList` 各写一行，那些行也持久化。今天只有完整快照重写才能回收空间，不存在原地 compaction（`jsonl/storage.ts` 有 `createFromSnapshot`，用于 fork）。

在 20 个 operation 上测量，每个 400 个 assistant frame 外加 2 个工具、对 50 KB 窗口做 60 次 checkpoint：

| | 大小 |
| --- | --- |
| JSONL 总计 | 93.89 MB |
| 已结算 transcript 条目 — 真正是历史的那部分 | **0.06 MB** |

文件的三个数量级是已完成 operation 的脚手架。

**两个独立修复，它们不是二选一：**

- **编码**（[delta.md](../01-delta/delta.md)）：value 写入携带 Chord ops 而不是整值，地址被 intern。把同样负载变成**单个文件 5.32 MB**，原子性不变。op 词汇和 flush 时 tracker 已落地；存储集成尚未落地。
- **Scopes**（本文档）：pending 状态完全离开主日志，因此它从一开始就不是历史。

先做编码。scopes 仍然值得，因为每 20 个 operation 仍有 5.32 MB 死重量累积，而且没有 compaction 遍次去回收它。

## 2. 地址上的 scope {#2-scope-on-the-address}

scope 有不得混淆的两半：不携带数据的**类型级标签**，以及命名文件的**运行时 scope id**。

```ts
export type SessionScope   = { readonly kind: "session" };
export type EphemeralScope = { readonly kind: "ephemeral" };
export type Scope = SessionScope | EphemeralScope;

// Passing a scopeId is what makes an address ephemeral.
export function value<T>(namespace: string, key: string): Value<T, SessionScope>;
export function value<T>(namespace: string, key: string, scopeId: string): Value<T, EphemeralScope>;

export function list<T>(namespace: string, key: string): ValueList<T, SessionScope>;
export function list<T>(namespace: string, key: string, scopeId: string): ValueList<T, EphemeralScope>;

/** A main-log record retiring an ephemeral scope. See §5. */
export function retireScope(id: string): Write<SessionScope>;
```

后缀不是装饰：`Session` 已经在 `harness/session/types.ts` 中命名会话接口，复用它会产生 `TS2440`/`TS2484`，外加来自 `session/index.ts` 的歧义再导出。

```ts
interface Value<T, Sc extends Scope = SessionScope> extends ScopedAddress<Sc> {
  readonly namespace: string;
  readonly key: string;
  /** Present iff Sc is Ephemeral. Routes the write and names the sidecar. */
  readonly scopeId?: string;
}
```

id 是普通运行时字符串，因为它是 operation id — 在运行时生成，对类型系统不可用。这正是为什么 §6 能静态区分*session 与 ephemeral*，却不能区分*两个不同的 ephemeral scope*：标签在类型里，id 不在。

```ts
// Durable lists carry encoded batches; one encoder/decoder pair belongs to each value stream.
export const pendingToolOutput = (operationId: string, invocationId: string) =>
  list<WireOp[]>("pi.pending.tool_output", `${operationId}:${invocationId}`, operationId);

export const pendingAssistantOutput = (operationId: string, entryId: string) =>
  list<WireOp[]>("pi.pending.assistant_output", `${operationId}:${entryId}`, operationId);

export const operationToolMemo = (operationId: string, invocationId: string, name: string) =>
  value<JsonValue>("pi.op.tool_memo", `${operationId}:${invocationId}:${name}`, operationId);

// unchanged — no scopeId, so Session by inference
export const laneStateValue = (lane: string) => value<DurableLaneState>("pi.lane.state", lane);
```

**scope 就是文件。** session-scoped 写入进入主日志；ephemeral-scoped 写入进入 `<session>.<scopeId>.jsonl`。

其他 backend 完全不需要 sidecar：内存按 scope id 丢掉一个 `Map`，SQLite 发一次 `DELETE ... WHERE scope = ?`。scope 对它们只作为寿命提示有意义。需要文件拆分的是 JSONL，§4 和 §5 的约束也来自那里。

## 3. 哪些地址被 scoped，以及为什么 {#3-which-addresses-are-scoped-and-why}

边界由**写入隔离**划出，不是由寿命。

以「它随 operation 死亡」为由把 `pi.op.*` 下的一切都 scoped 看起来对，其实错。`lane.ts` 说明为什么：**每一次** operation 提交都把 `operationState` 与 `laneState` 捆在一起。

```ts
// lane.ts:405/431, 659/660, 749/750, 1071/1072 — the same shape each time
writes: [
  ...decision.writes,
  setValue(operationStateValue(operationId), decision.operationState),
  setValue(laneStateValue(this.name), durableLaneState(...)),
]
```

那一对是协调状态：lane 状态说 operation 在步骤 N，operation 状态持有步骤 N 的数据。把它们拆到不同文件，崩溃会产生一个相信自己处于数据并不支持之处的 lane。

**批量**值的行为不同。`openProgress` 恰好提交一次写入（`runtime/progress.ts:51`），而 `pendingToolOutput` / `pendingAssistantFrames` 只作为*删除*出现在多写入事务中。

| | 地址 |
| --- | --- |
| **ephemeral（sidecar）** | `pi.pending.tool_output`、`pi.pending.assistant_output`、`pi.op.tool_memo` |
| **session（主日志）** | `pi.lane.state`、`pi.op.state`、`pi.op.meta`、`pi.result`、`pi.pending.entry`、`pi.branch.tip`、`pi.op.tool_args`、`pi.op.preparation` |

`operationToolMemo` 是 ephemeral，以便 `harness-tools.md` §7.5 中的 memo 加 checkpoint 捆绑是单文件事务。`terminal.ts:34` 已经把 `operationToolMemoPrefix` 和 `pendingToolOutputPrefix` 当作同一清理类，因此这与代码已经对它们的看法一致。

把 `operationState` 留在后面不影响体积收益：§1 中 93.89 MB 实际上全是 pending 工具和 assistant 输出。

## 4. 两个文件不是原子的 {#4-two-files-are-not-atomic}

在 Session 线上串行给出的是**顺序，不是原子性**。对两个描述符的两次 `write()`，两次 fsync，没有跨越它们的 journal。中间崩溃会让文件不一致，JSONL 没有任何东西可用来修复。

因此设计并不试图让跨文件事务工作。它确保它们不存在：

> **一笔事务中的所有写入共享一个 scope。**

这做得到，因为它对代码已经为真 — 审计见 §5。

*不*需要跨文件提交的两个后果：

- **文件之间不需要写入顺序。** 若没有事务跨越文件，提交记录模式（先 sidecar，fsync，然后主日志记录确认它）是不必要的。没有东西需要确认。
- **sidecar 专用写入不需要提交标记。** 一种诱人的设计是为 `openProgress` 在主日志放一条小记录，因为没有任何东西确认它的写入。不需要：那笔事务是一个文件里的一次写入，已经原子。撕裂的尾部与主日志同样处理 — 每一行都是完整 op 或整批，因此读者停在最后一条完好的。

剩下的是**持久性**选择，不是一致性选择：若 sidecar 的 fsync 不那么积极，最近的 checkpoint 可能丢失。那是 checkpoint 间隔已经接受的同样有界丢失，但它应当是故意的策略，而不是意外。

## 5. 审计：现有代码满足这条规则吗？ {#5-audit-does-the-existing-code-satisfy-the-rule}

读过 `lane.ts` 中每一次提交（12 处）以及 `runtime/drive/*.ts` 中每一个 `writes:` 生产者（32 处）。

**结果：是，只需一处调整。** 没有事务写入两个文件。跨越情形全是与主日志写入捆绑的 ephemeral 状态*删除*：

- `response.ts:340` — settle 提交：`insertEntry`、`insertUsage`、`setValue(branchTip)`，外加 `deleteList(pendingAssistantFrames(...))`。
- `terminal.ts:50` `operationCleanupWrites` — 把主日志删除与 `toolMemos` 和 `toolOutputs` 删除捆在一起，返回到与 `operationResultValue` 和 `laneStateValue` 同一数组。
- `tools.ts:230, 257` — 与主日志写入一起的 `deleteValue(pendingToolOutput)`。
- `deferred.ts:157` — `deleteList(pendingAssistantFrames)`。

**调整：退役变成主日志记录。**

```ts
retireScope(operationId): Write<SessionScope>
```

日志是真相；sidecar 文件是缓存。恢复读退役记录并忽略 — 然后移除 — sidecar。提交后急切 unlink 是纯粹优化；丢掉 unlink 花费磁盘，从不花费正确性。

这让上面四处都变成单 scope，因为个别 ephemeral 删除消失。它也*简化* `operationCleanupWrites`：对 `operationToolMemoPrefix` 和 `pendingToolOutputPrefix` 的 `scanValues` 调用被一次 `retireScope` 取代。

并且它让打开时清扫成为有原则的，而不是启发式的。sidecar 死亡当且仅当主日志退役了它，或其 operation 不存在 — 不从 operation 状态推断。

### 5.1 一笔事务中的两个 ephemeral scope 不可能出现 {#51-two-ephemeral-scopes-in-one-transaction-cannot-arise}

lane 持有 `operation: { meta, state } | null` — **单数**。每一个写入集合使用一个 `operationId`，要么是 `drive.operationId`，要么是 `startOperation` 中新创建的那个，后者断言没有 operation 活跃。退役与开始永远是分开的事务：`lane.ts:427` 和 `response.ts:339` 的 settle 提交把 lane 状态设为 `null`。

并发跨 **lane**，而每个 lane 最多一个活跃 operation，因此两个 ephemeral scope 从不在一次提交中相遇。§6 的运行时断言是对未来变更的防御，不是现存缺口。

## 6. 静态强制 {#6-static-enforcement}

> **`scopes.variance.ts` 与本文档一起交付**，是本节的可执行形式：`npx tsc --noEmit --strict --lib es2023 scopes.variance.ts`。
> 静默意味着规则成立。它的三行 `@ts-expect-error` 若开始通过类型检查就会让编译失败，因此它既抓住强制被削弱，也抓住强制被打破。

两个 phantom 类型，只在 `Sc` 出现的位置上不同。这个区分是承重的，也是这里最容易弄错的一件事。

```ts
declare const storedScopeType: unique symbol;

/** Addresses: COVARIANT — Sc only in return position. */
export interface ScopedAddress<Sc extends Scope> {
	readonly [storedScopeType]?: () => Sc;
}

/** Writes: INVARIANT — Sc in both parameter and return position. */
export interface Scoped<Sc extends Scope> {
	readonly [storedScopeType]?: (scope: Sc) => Sc;
}

export interface Value<T, Sc extends Scope = SessionScope>
	extends StoredAddressBase, ScopedAddress<Sc> { … }

export interface ValueSetWrite<Sc extends Scope> extends Scoped<Sc> { … }
```

**它们为何不同。** 读地址在任何 scope 都安全 — `getValue` 不关心值活在哪个文件，因此 `Value<T, SessionScope>` 必须能用在期望 `Value<T, Scope>` 的地方。形成事务在任何 scope 都*不安全*，因为两个文件不是原子的，因此提交必须钉死恰好一个。

因此强制属于事务形成之处，不属于地址被读取之处。`setValue<T, Sc>(address: Value<T, Sc>, …): Write<Sc>` 是桥梁：它从协变地址推断 scope，并把它盖到不变写入上。

> **弄错这个很昂贵。** 让地址也变成不变会打破每一个读取者 — `getValue`、`scanValues`、`readList` 以及下游的一切 — 并在什么也没做错的存储 backend 上产生 36 个错误的级联。诱人的变通是让每个读取者对 `Sc` 泛型以表示「任意 scope」，那会把类型参数传播过整个存储栈，去表达 variance 免费给出的东西。

用 `tsc --noEmit --strict` 验证过。两种 scope 的读取都通过：

```ts
getValue(laneState);        // Value<T, SessionScope>
getValue(pendingOutput);    // Value<T, EphemeralScope>
```

单 scope 提交通过：

```ts
commit([setValue(laneState, a), setValue(operationState, b)]);
commit([setValue(toolMemo, m), setValue(pendingOutput, o)]);
commit([setValue(laneState, a), retireScope("op_1")]);
```

混合 scope 提交失败，并且是*唯一*失败的事情：

```ts
commit([setValue(laneState, a), setValue(pendingOutput, o)]);   // ERROR
commit([setValue(pendingOutput, o), retireScope("op_1")]);      // ERROR
```

### 6.1 类型系统抓不到什么 {#61-what-the-type-system-cannot-catch}

两个不同的 ephemeral scope 都类型为 `Write<EphemeralScope>`，因为 id 是运行时字符串（§2）。提交时的运行时断言覆盖它 — 比较所有写入的 `scopeId` — 按 §5.1 它永远不应触发。

## 7. 恢复与清扫 {#7-recovery-and-sweeping}

打开时，与主日志一起枚举 sidecar 并加载它们。它们的记录与主日志记录完全一样地参与重放。

当主日志为它持有 `retireScope` 记录，或其 operation 不存在时 — 提交与 unlink 之间的崩溃 — sidecar 被移除。撕裂尾部语义不变：每一行自包含，因此写入中途崩溃恰好丢失尾随那一行。

## 8. 序号 {#8-sequence-numbers}

scoped 写入按 scope 获得自己的序号空间。scope 之外没有任何东西相对其内容排序，把它们分开意味着主头部中的 `nextSeq` 不必计入将被删除的文件所消耗的数字。

共享编号会在若干 operation 结算后留下大缺口，高水位需要单独持久化。

## 9. 测得的效果 {#9-measured-effect}

与 §1 同样的负载：

| | 大小 | 相对今天 |
| --- | --- | --- |
| 今天，单个 JSONL | 93.89 MB | — |
| ops + intern 地址，单个 JSONL | 5.32 MB | 5.7% |
| **加上 scopes — 主日志** | **0.06 MB** | **0.06%** |
| — sidecar，settle 时退役 | 5.26 MB | 峰值每个 operation 0.26 MB |

5.7% 这个数字**依赖速率，绝不能单独引用**：它在每次 checkpoint 2 KB 工具输出时成立，并在超过 cap 时反转，那时整值替换获胜。

scope 结果**不**依赖速率。主日志无论编码如何都持有已结算条目，而那才是管辖会话文件增长的数字。

## 10. 现有代码要改什么 {#10-what-changes-in-the-existing-code}

编译器会替你找到这些：一旦地址携带 scope 且 `Write<Sc>` 不变，每一个在一笔事务中混合 scope 的位置都会无法通过类型检查。这份列表是完整过一遍得到的，因此你知道何时做完。

**新增，在 `session/values.ts` 和 `session/types.ts`**

`SessionScope` / `EphemeralScope` / `Scope`；§6 的两个 phantom；`Value<T, Sc>` 和 `ValueList<T, Sc>`；地址上的 `scopeId`；`value` / `list` 重载；`retireScope`；保持 scope 的 `setValue` / `deleteValue` / `appendList` / `deleteList`；`Write<Sc>`，其中 entries、usage 和退役在构造上只属于 session。

**泛型化**

`CommitDecision<TResult, Sc>`、`lane.command<TResult, Sc>`、`Storage.commit<Sc>`。
给 `Sc` 一个 `SessionScope` 默认值：条件类型不是推断位点，因此没有默认时混合数组会回退到约束 `Scope`，每一个调用点都会失败。`settleOperation` 和 `continueOperation` 保持**非**泛型 — 见 §5。

**已提交的写入**

`CommittedScopeRetireWrite`，以及 `scopeId` 穿过已提交形状，以便 `JsonlStorage` 能按它路由。

**必须变更的调用点** — 每一个当前都在一笔事务中混合 scope：

| 位置 | 今天做什么 | 变成什么 |
| --- | --- | --- |
| `drive/terminal.ts` `operationCleanupWrites` | 经 `scanValues` 枚举工具 memo 和工具输出，与 session 删除一起删除每一个 | 一次 `retireScope(operationId)`；它的四次扫描中有两次消失 |
| `drive/response.ts`（settle） | 与 operation 状态捆绑的 `deleteList(pendingAssistantOutput)` | 丢掉它 — sidecar 在退役时被丢弃 |
| `drive/deferred.ts`（被取代的响应） | 同样 | 同样 |
| `drive/tools.ts`（工具 settle） | session 写入数组中的 `deleteValue(pendingToolOutput)` 外加 memo 删除 | 丢掉它们 |
| `drive/tool-placement.ts` | `deleteValue(pendingToolOutput)` | 丢掉它 |

模式到处相同：**operation 内部对 ephemeral 状态的清理是不可能的**，因为那些提交也写 operation 和 lane 状态。sidecar 在退役时整份丢弃。代价是多轮 operation 会把被取代的 pending 输出持有到 settle — 由轮次界定，并且永远到不了主日志。

**存储**

`JsonlStorage.commit` 中的 sidecar 路由（断言每笔事务一个 scope id，路由追加），在 `scope` 记录上于提交**之后** unlink，以及打开时清扫：加载 sidecar 并移除主日志已经退役的任何。内存按 scope id 丢掉一个 `Map`；SQLite 发一次 `DELETE ... WHERE scope = ?`，并把退役记录当作 no-op，因为它没有 sidecar，终端事务显式删除 scoped 值。

**预期的测试扰动**

九个测试断言旧的清理写入集合并将失败 — `drive-terminal`（3）、`drive-retry-deferred`（2）、`drive-tools`、`drive-reconcile`、`drive-generation`，以及一个钉住保留命名空间的。它们期望六或七次个别删除，而新代码发出更少外加一次 `retireScope`。那正是即将落地的变更，不是回归。

## 11. List tag 与停止条件 {#11-list-tags-and-stop-conditions}

被跟踪状态存储为 op 批次列表（`delta.md` §9）。恢复需要「自最后一个 base batch 以来的批次」而不拆开每一行，而今天的 list 无法表达：`ListReadOptions` 只有 `cursor`、`order` 和 `limit`。

`BranchScan` 已经为 entries 解决了同一问题，要复制的就是它的词汇 — 作为终止符的 `stopAtType` / `stopAtId`，作为过滤器的普通字段名。

```ts
appendList<T, Sc>(address: ValueList<T, Sc>, element: T, tag?: string): ListAppendWrite<Sc>;

export interface ListElement<T> {
  seq: number;
  value: T;
  tag?: string;
}

export interface ListReadOptions {
  cursor?: ListCursor;
  order?: "asc" | "desc";
  limit?: number;
  /** Include elements up to and including the first carrying this tag, then stop. */
  stopAtTag?: string;
  /** Return only elements carrying this tag. */
  tag?: string;
}
```

**`stopAtTag` 是页内停止条件，不是保证。** 它只能比 `limit` 更早结束一页；它从不覆盖它。若带标签的元素不在页中，消费者看不到带标签元素，并用 cursor 再翻一页 — `readAssistantFrames` 已经运行的同一循环。两个界限之间没有顺序问题，也没有「未找到」错误。

为了让那个循环工作，`readList` 必须在每个元素上返回 tag。否则消费者无法在不解析值的情况下分辨「页在 tag 处结束」与「页在 limit 处结束」，而这正是 tag 存在所要避免的事。

**生产者设置 tag，不是存储。** 对被跟踪的值，调用者已经知道，因为 `isBase(ops)` 是对第一个 op 的 token 比较（`delta.md` §2）：

```ts
const ops = tracker.flush();
if (ops.length === 0) return;
writes: [appendList(address, enc.encode(ops), isBase(ops) ? "base" : undefined)];
```

存储永远不得检查元素以派生 tag。这正是让 op 批次对存储层不透明的东西，也是让 `EntryScan.type` 工作的同一性质：判别式是存储列，不是从载荷派生的东西。

**tag 活在存储记录上**，在 `seq` 和 `value` 旁边：

```jsonc
["l",7,9,[["r",{…}]],"base"]        // per §12.1
```

存储永远不得解析元素以求值谓词。这正是让 ops 对存储不透明、让持久化路径没有领域知识的东西（`harness-tools.md` §7.7）。这也是为什么 `EntryScan.type` 能工作：判别式是存储列，不是从载荷派生的东西。

`order` 保持 `"asc" | "desc"`，而不是 `BranchScan` 的 `"newestFirst" | "oldestFirst"`。分支顺序是语义的 — 从 tip 穿过树的行走。list 顺序在 `seq` 上。借用分支用词会暗示并未发生的遍历。

backend：SQLite 得到 `tag` 列和真正的谓词。JSONL 已经在内存中持有 list，因此它向后扫描并检查一个字段 — 不比今天更差。内存同样。

这个原语推广到 frame 之外：任何想要「自最后一个 checkpoint 以来的尾部」的 list 都能得到它。

## 12. JSONL 记录编码 {#12-jsonl-record-encoding}

两层两套字典。它们是同一技巧并且独立：**地址**字典在记录上覆盖 `namespace` + `key`；**path** 字典覆盖值的 ops *内部*的 path（`delta.md` §4）。

### 12.1 记录 {#121-records}

```
["@", addrId, namespace, key]              address definition
["v", addrId, seq, wireOps]                value write   — WireOp[], delta.md §4
["l", addrId, seq, element, tag?]          list append   — element is WireOp[]
                                             for a tracked value
["x", addrId, seq]                         delete (value or list)
["!", addrId, seq]                         retire an ephemeral scope
```

**记录动词与 op 动词是在不同层级读取的分开词汇**，但它们不得看起来一样。退役用 `!` 而不是 `r`：`r` 是 delta 的 replace op，扫描文件的读者不应必须记住自己在哪一层嵌套才能知道元组意味着什么。

退役像其他一切一样取地址 id，由 `["@", id, …]` 定义，其 namespace 就是 scope。这让整个文件保持一条 intern 规则，而不是为一种记录做特例。

entries 和 usage 行保持当前带键形式：它们写一次，从不重复地址，并且被与 ops 无关的机制读取。

地址在其**第二次**使用时定义，与 path intern 一致 — 对只写一次的地址，定义是纯粹开销，而会话有许多那样的地址。

### 12.2 完整示例 {#122-worked-example}

跨两个地址的四次写入，之前与之后。

```jsonc
// today — 1250 bytes
{"kind":"value","op":"set","seq":7,"namespace":"pi.op.state","key":"01a04cf6-…","value":{"at":"starting","control":{…},"settings":{…},"latestAssistantEntryId":null}}
{"kind":"value","op":"set","seq":8,"namespace":"pi.lane.state","key":"main","value":{"currentOperationId":"01a04cf6-…",…}}
{"kind":"value","op":"set","seq":9,"namespace":"pi.op.state","key":"01a04cf6-…","value":{"at":"checkpoint",…}}
{"kind":"value","op":"set","seq":12,"namespace":"pi.op.state","key":"01a04cf6-…","value":{"at":"assistant.ready",…}}
```

```jsonc
// with both dictionaries — 547 bytes
["@",0,"pi.op.state","01a04cf6-…"]
["v",0,7,[["r",{"at":"starting","control":{…},"settings":{…},"latestAssistantEntryId":null}]]]
["@",1,"pi.lane.state","main"]
["v",1,8,[["r",{"currentOperationId":"01a04cf6-…",…}]]]
["v",0,9,[["#",0,["at"]],["s",0,"checkpoint"]]]
["v",0,12,[["s","assistant.ready"]]]
```

| 行 | 之前 | 之后 |
| --- | --- | --- |
| 地址定义 | – | 61 |
| op.state -> `starting`（base batch） | 353 | 256 |
| 地址定义 | – | 31 |
| lane.state（base batch） | 181 | 114 |
| op.state -> `checkpoint` | 355 | **48** |
| op.state -> `assistant.ready` | 361 | **37** |
| **总计** | **1250** | **547**（44%） |

形状比总计更要紧。base batch 几乎不缩小 — 353 到 256 只是信封，因为值反正整份运送。转移折叠约 8 倍，因为它们携带一个变更字段，而不是包括从不变更的 `settings` 块在内的整份状态。

两套字典都出现在第 5 行：`["v",0,9,…]` 中的 `0` 是**地址** id，而 `["#",0,["at"]]` 在值的 ops 内部定义一个**path** id。同一技巧，不同层，分开的表。然后第 6 行完全丢掉 path — arity 省略，因为它瞄准该批中前一个 op 的同一 path。

**不要把 44% 当作文件级节省来引用。** 字典条目是一次性的，因此真实 operation 约 11 次 op.state 写入会摊销它们，比例变好；但 transcript 条目未被动，而它们在一次 67 KB 偏工具的运行中是 18 KB。应用到那里会打中约 27 KB 的 value 写入，并把文件缩小大约五分之一，而不是一半。

### 12.3 读取 {#123-reading}

读者在重放时构建两张表，因此撕裂尾部恰好花费尾随那些行，不需要重写头部。快照重写从新表开始，并自然地重新发出定义。

未见过定义的数字 `addrId` 是损坏文件，不是可恢复状态 — 与缺失的 path id 不同，后者不会发生，因为 path 定义与其首次使用在同一条记录内。

## 13. 开放问题 {#13-open-questions}

- 跨并发 lane 的文件句柄压力，每个都有活着的 sidecar。大概没问题，未测量。
- sidecar 的 fsync 策略（§4） — 与主日志匹配，还是因内容是有界丢失的脚手架而放松。
- 长时间运行的 operation 是否应轮转其 sidecar。`rebase()`（`delta.md` §3.2.3）约束*恢复*长度但不约束文件大小，因此跑数小时的命令仍会无界增长其 sidecar。
- 主日志的原地 compaction 遍次是否仍值得构建。`createFromSnapshot` 加原子替换是机制；scopes 降低需求但没有移除它，因为被取代的 session-scoped 值仍会累积。
