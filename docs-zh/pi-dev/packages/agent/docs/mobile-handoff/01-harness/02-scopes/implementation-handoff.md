本文是 `implementation-handoff.md` 的中文阅读版；命令、路径、API 名称保持英文。

# Scoped 存储 Step 1 — 可执行的实现交接 {#scoped-storage-step-1--actionable-implementation-handoff}

**状态：可执行，尚未实现。**

**准备对照：** `c4b0e35ab`（`dev`）。若实现基线发生实质性变化，重新审计点名的源文件。

本交接只实现存储 scopes。**在 [`scopes.md`](scopes.md) 之前先读本文件。** 它取代那里冲突的细节，尤其是每 scope 序号空间、从 operation 派生的孤儿检测、一次性 scope ID、原始字符串 scope 参数、以 `.jsonl` 结尾的 sidecar、提议的 intern 退役元组，以及把 JSONL delta/地址编码捆进同一次变更。`scopes.md` 中更广的动机与测量仍是设计证据；凡本文件不同之处，其签名和实现顺序都不是当前的。

Step 2—Chord 编码的 JSONL 值、地址 intern、紧凑元组记录及其测量—是单独的包。在 Step 1 经过测试、评审、用户明确批准、提交并推送之前，不要开始 Step 2。

## 0. 交付协议 {#0-delivery-protocol}

本包有强制的用户检查点：

1. 只实现 Step 1。
2. 运行每一个必需的聚焦测试、`npm run check` 和 `./test.sh`。
3. 评审完整 diff 并报告结果。若使用委托评审，用 provider `anthropic` 和 model `claude-fable-5` 运行。
4. **停下并等待用户明确批准。**
5. 批准之后，只提交本包的文件并推送那次 commit。
6. 在设计或实现 Step 2 之前确认已推送的 commit。

不要把 Step 1 和 Step 2 的 commit 合在一起。不要在批准之前提交或推送。

## 1. 必读 {#1-mandatory-reading}

编辑前完整阅读：

1. `packages/agent/docs/harness.md` §§0.2–0.9、1.1–1.7、2.7–2.8、3.7–3.8、3.13、4.4–4.8、5.4、Part 7、Part 9。
2. `packages/agent/docs/values.md`。
3. `packages/agent/docs/mobile-handoff/README.md`。
4. [`scopes.md`](scopes.md)，冲突处以本交接为准。
5. `../01-delta/delta.md` 仅用于词汇所有权；Step 1 不存储 Chord ops。
6. `../04-tool-output/harness-tools.md` §§7.1–7.7 作为后续消费者上下文；不要在这里实现其输出再设计。
7. `../05-assistant-output/message-update.md` §7 作为后续消费者上下文；不要在这里实现它。
8. `packages/agent/src/harness/session/{types,values,commit,in-memory-storage-state,memory,session,index}.ts`。
9. `packages/agent/src/harness/session/jsonl/` 下的每一个文件，以及 `packages/agent/src/harness/{types,env/nodejs}.ts` 中的 `FileSystem` 声明 / 实现。
10. `packages/agent/src/harness/runtime/{progress,lane}.ts`、`runtime/drive/{terminal,response,deferred,tools,reconcile,structural,boundary}.ts`，以及每一个 `operationCleanupWrites` 调用者。通过 grep 审计检查 `tool-placement.ts`，但当前源码那里没有 scoped 删除。
11. `packages/session-backends/sqlite-node/src/{index,sqlite/index}.ts`、`sqlite/{storage,repo}.ts`、`migrations/001_initial.sql`，以及 `session/{values,session-sequences}.ts`。
12. 共享存储 / repository 一致性，以及 §9 点名的每一个聚焦测试。
13. `scopes.variance.ts` 仅用于协变地址 / 不变写入 phantom 机制。其当前无 ID 的 `EphemeralScope` 和 `retireScope(id: string)` 签名被 §2 取代，必须在 Slice A 中更新。

不要把 `dist/` 当作实现输入。Format 4 仍是 WIP；本包不含 R11 迁移。

## 2. 固定的 scope 契约 {#2-fixed-scope-contract}

### 2.1 运行时 scope 身份 {#21-runtime-scope-identity}

scope ID 是可复用的逻辑寿命名，不是全局一次性 token：

```ts
export type SessionScope = { readonly kind: "session" };

export interface EphemeralScope {
	readonly kind: "ephemeral";
	readonly id: string;
}

export type Scope = SessionScope | EphemeralScope;

export function ephemeralScope(id: string): EphemeralScope;
```

`ephemeralScope(id)` 要求非空、良构的 Unicode 字符串，并返回冻结值。相等的 ID 标识同一物理 scope；对象身份没有意义。JSONL 用 `encodeURIComponent` 编码 ID。编码后的分量最多 180 个 ASCII 字符；拒绝更长的 ID 以及单独的 surrogate 输入。物理文件名永远带固定的 `scope-` 前缀，因此编码后的 `.` / `..` 值不能变成路径段。不要把未编码的调用者输入直接插入路径。

不存在 create/open-scope 事务。第一次 scoped value/list 写入创建物理状态。稍后的 `retireScope(scope)` 通过其被分配的全局序号结束该 scope 中的一切。退役后同一 ID 下的写入开始新的逻辑寿命。

Harness operation scope 使用 `ephemeralScope(operationId)`。通用应用 scope 可以使用稳定名称。存储从不把 scope ID 解析为 operation ID，也从不读取 Harness operation 状态来决定寿命。

### 2.2 复用与退役边界 {#22-reuse-and-retirement-boundary}

全局序号顺序定义可复用世代：

```text
seq 10  scoped write S
seq 20  scoped write S
seq 30  retireScope(S)
seq 40  scoped write S       # new lifetime
```

对给定 scope ID，只有 `seq` 大于其最近一次已提交退役序号的 scoped 记录是活的。Memory 和 SQLite 通过在退役时删除当前行 / map，并允许稍后写入重建它们来实现这一点。JSONL 把退役序号当作其重放边界（§6）。

退役在存储意义上是幂等的：退役没有当前状态的 scope 是合法的，并推进边界。稍后的写入仍开始新寿命。存储不维护全时已用 ID 登记，也不拒绝复用。

因此，退役之后到达提交线的 scoped 写入是新寿命写入。Harness 调用围栏和结算排空必须继续确保迟到的 assistant/tool progress 作业不能在终端退役之后重建 operation 输出。为这个边界添加显式测试。

### 2.3 显式退役是唯一权威 {#23-explicit-retirement-is-the-sole-authority}

```ts
export function retireScope(scope: EphemeralScope): Write<SessionScope>;
```

存储从不从 operation 缺失、命名空间、当前状态或缺失的 owner 推断孤儿。唯一有效的寿命边界是已提交的 `retireScope` 写入。若 owner 从不退役其 scope，那是 owner 缺陷，scope 保持存活。

崩溃行为：

- 退役事务提交前崩溃：scope 保持存活并重新打开；
- 退役提交后、JSONL unlink 前崩溃：重放看到退役边界，忽略边界前的 sidecar 记录，并重试物理删除；
- 稍后被复用的寿命期间崩溃：最近一次退役之后的记录正常重新打开。

Repository 删除另行移除被删除 Session 所属的每一个物理 sidecar。它不需要 operation 语义。

### 2.4 地址与写入类型 {#24-address-and-write-typing}

地址携带协变 scope 标签；写入携带不变 scope 标签。独立保持值类型不变性：

```ts
interface Value<T, Sc extends Scope = SessionScope> { /* existing fields + scope */ }
interface ValueList<T, Sc extends Scope = SessionScope> { /* existing fields + scope */ }

declare function value<T>(namespace: string, key?: string): Value<T, SessionScope>;
declare function value<T>(namespace: string, key: string, scope: EphemeralScope): Value<T, EphemeralScope>;
declare function list<T>(namespace: string, key?: string): ValueList<T, SessionScope>;
declare function list<T>(namespace: string, key: string, scope: EphemeralScope): ValueList<T, EphemeralScope>;
```

session-scoped 地址没有运行时 scope ID。ephemeral 地址携带其 scope ID。scope 是物理身份的一部分：session scope 与 ephemeral scope 中相等 namespace/key 的地址，或两个不同 ephemeral ID 中的，都是不同的。

`setValue`、`deleteValue`、`appendList` 和 `deleteList` 在 `Write<Sc>` 中保留地址 scope。entry 和 usage 写入是 session-scoped。`retireScope` 是 session-scoped，即使应用它会删除 ephemeral 状态。

普通事务中的所有写入有一个静态 scope。session 事务可以包含 session 值、entries、usage，以及一次或多次 `retireScope` 写入。它不得包含直接的 ephemeral set/delete/append。ephemeral 事务只能包含 value/list 写入。运行时，一笔事务中的每一次 ephemeral 写入必须携带同一 scope ID；两个不同 ID 有相同的 TypeScript 标签，需要这个断言。

做保持这一点所必需的最小泛型变更，穿过 `Write`、`CommittedWrite`、`Storage.commit`、Session mutation 能力、`CommitDecision` 和 lane command。遵循 `scopes.variance.ts` 中的 variance 证明；不要让读取者变成不变的，也不要在只读 API 上传播不必要的 scope 类型参数。

### 2.5 一个全局序号空间 {#25-one-global-sequence-space}

Memory、JSONL 主记录、JSONL sidecar 记录和 SQLite 行共享一个 Session 全局序号空间。每一个被接纳的提交保持串行，并按接纳顺序获得递增序号。缺口仍然合法。

- Memory 继续使用一个 `nextSeq`。
- SQLite 继续在写入事务内从 `sessions.next_seq` 分配。
- JSONL 主追加和 sidecar 追加共享一个提交队列和一个常驻 `nextSeq`。

JSONL 打开从主头部以及每一个匹配 sidecar 中的每一条完整记录计算高水位，**然后**才删除或忽略已退役的物理文件。已退役 sidecar 的序号随后可以变成缺口，但永远不能被复用。被撕裂的未提交最终事务不推进持久化高水位。

不允许预留记录、每 scope 序号计数器或范围分配器。

## 3. List tag {#3-list-tags}

Step 1 只增加后续被跟踪输出恢复所需的机制：

```ts
export interface ListElement<T> {
	seq: number;
	value: T;
	tag?: string;
}

export interface ListReadOptions {
	cursor?: ListCursor;
	order?: "asc" | "desc";
	limit?: number;
	stopAtTag?: string;
}

export function appendList<T, Sc extends Scope>(
	address: ValueList<T, Sc>,
	element: NoInfer<T>,
	tag?: string,
): ListAppendWrite<Sc>;
```

tag 若存在则是非空字符串。存储存储并返回 tag，而不解释元素。

读取语义：

1. 应用地址 scope、排他 cursor 和顺序。
2. 最多检查规范化后的 `limit` 个元素。
3. 停在并包含第一个携带 `stopAtTag` 的元素。
4. 返回那一页，可能被缩短。

`stopAtTag` 从不搜索超过页限制。若页中没有，调用者从最后返回的序号再翻一页。**不要**增加草案中的 `tag` 过滤器；当前没有任何消费者需要它，并且把过滤与现有 cursor 形状组合是含糊的。

SQLite 可以取出带索引的 `limit` 行，并在 TypeScript 中于第一个返回的 tag 处截断；存储仍然从不解析载荷。保持现有主键查询计划，没有临时排序。

## 4. Step 1 持久化载荷保持不变 {#4-step-1-durable-payloads-remain-unchanged}

本包改变寿命和路由，不改变输出表示：

- `pendingToolOutput` 仍是 `Value<AgentToolResult<unknown>, EphemeralScope>`；
- `pendingAssistantFrames` 仍是 `ValueList<AssistantMessageFrame, EphemeralScope>`；
- `operationToolMemo` 仍是 `JsonValue` 标量；
- JSONL 事务记录仍是可读的带键对象；
- assistant progress 仍按每个被接受的 frame 追加一个 frame；
- 工具 checkpoint 仍替换整份快照；
- `message_update` 和 `tool_update` 事件形状不变；
- 安全重放保留其当前 checkpoint 行为，包括已知的、由后续工具输出包拥有的删除后再重放 bug。

不要在这里重命名 `pendingAssistantFrames`、引入 `pendingAssistantOutput`、存储 `WireOp[]`、增加 Chord tracker/codec、再设计 `AgentHarnessTool`，或改变输出节奏。

## 5. 运行时所有权与清理 {#5-runtime-ownership-and-cleanup}

### 5.1 移到 operation scope 的地址 {#51-addresses-moved-to-the-operation-scope}

用 `ephemeralScope(operationId)` 构造这些地址：

- `operationToolMemo(operationId, invocationId, name)`；
- `pendingToolOutput(operationId, invocationId)`；
- `pendingAssistantFrames(operationId, responseEntryId)`。

所有其他当前内建保持 session-scoped。特别是，`pi.op.state`、`pi.op.meta`、`pi.op.tool_args`、`pi.op.preparation` 和 `pi.pending.entry` 留在主 scope，因为它们的写入与 lane/operation 状态原子协调。

### 5.2 没有跨文件清理事务 {#52-no-cross-file-cleanup-transaction}

从也写入 session 状态的事务中移除直接的 ephemeral 删除：

- assistant 响应结算；
- deferred 响应被取代；
- `drive/tools.ts` 中的工具结果暂存；
- 取消 / 恢复决定；
- 终端按地址清理。

当前 `drive/tool-placement.ts` 没有 ephemeral 删除；不要在那里发明变更。

`operationCleanupWrites` 停止扫描工具 memo 和工具输出，并停止构造状态导向的 assistant-frame 删除。它保留 session-scoped 的 operation/meta/args/preparation/pending-entry 清理，并在通用终端后缀中恰好增加一次 `retireScope(ephemeralScope(operationId))`。

移除当前暂存 / 终端扫描之后，移除 `operationToolMemoPrefix` 和 `pendingToolOutputPrefix`；当前源码没有其他生产消费者。把规范导出的前缀构造器数量从五个更新为三个，并更新精确构造器测试，而不是保留死掉的清单 API。

仅 ephemeral 的删除仍然合法。例如，当前安全重放的 checkpoint 删除保留，因为它的事务不含 session 写入；修复其行为属于后续工具输出包，不属于 scoped 存储或 JSONL 优化。

### 5.3 不可达的 scoped 残留 {#53-unreachable-scoped-residue}

响应结算、deferred 响应被取代，或工具到达 `outcome_ready` 之后，其先前的 frame/checkpoint/memo 可能在仍活跃的 operation scope 内物理上和逻辑上仍可寻址。当前标量 operation 状态不再引用它们；没有任何恢复或快照路径扫描该 scope 以推断权威。终端退役删除整个 scope。

称之为**不可达的 scoped 残留**，不是孤儿。更新当前要求 `outcome_ready` 调用没有物理存在的 memo/checkpoint 的 `harness.md` 不变量。替换不变量是：已结算的子状态从不消费或暴露残留，终端退役与 operation 完成原子地移除所有 scoped 状态。

close 和 fault 是受控崩溃，从不退役 scope。重新打开只通过从当前权威 operation 状态派生的地址恢复 scoped progress。

## 6. JSONL sidecar {#6-jsonl-sidecars}

### 6.1 物理布局 {#61-physical-layout}

主会话文件除已提交的 scope 退役记录外保持不变。每一个主文件在 `${mainPath}.scopes` 拥有一个已知 sidecar 目录；这不需要 dirname API 或 `FileSystem` 扩展。用 `createDir(..., { recursive: true })` 惰性创建它。在那条精确路径上用 `listDir` 发现 scopes。sidecar 文件名恰好是 `scope-${encodeURIComponent(scope.id)}.scope`，受 §2.1 的 180 字符编码分量限制。后缀不以 `.jsonl` 结尾，sidecar 目录本身是目录，因此 repository 列举永远不会把两者误认为 Session。

sidecar 以这个精确头部开始：

```ts
interface JsonlScopeHeader {
	v: 4;
	kind: "scope_header";
	sessionId: string;
	scopeId: string;
	storageVersion: 1;
}
```

重放前校验精确的 session/scope 身份。通过 `${mainPath}.scopes` 内的临时文件外加原子 rename 创建第一个头部。临时文件名以 `.tmp` 结尾，永远不会被发现为 sidecar。使用现有 `FileSystem` 能力；不要增加 dirname 方法、扩展 `JsonlStorageOptions`，或向 agent core 增加仅 Node 的文件系统访问。

Step 1 sidecar 写入保留当前对象记录拼写，并在已提交形状中携带 / 校验其 scope ID。每一笔物理事务仍是一行完整行或一行数组。sidecar 事务只能包含该精确 scope 的 value/list 写入。

### 6.2 退役记录 {#62-retirement-record}

主日志记录一次显式已提交写入：

```ts
interface CommittedScopeRetireWrite {
	kind: "scope";
	op: "retire";
	seq: number;
	scopeId: string;
}
```

其 Step 1 JSON 表示是对应的可读对象。不要使用草案 `['!', addrId, seq]`：scope 不是 intern 的 value/list 地址。紧凑元组拼写属于 Step 2，必须在那里设计。

应用已提交的退役会移除该 scope 中的常驻 value/list。完整主事务持久化之后，JSONL 在同一提交队列上同步串行生命周期清理：关闭任何拥有的 sidecar 资源，尝试 unlink，然后释放队列。unlink 失败对已经提交的业务事务是非致命的；sidecar 在逻辑上仍受退役序号约束，删除在重新打开时重试。

### 6.3 重放与可复用 ID {#63-replay-and-reusable-ids}

打开在接纳写入之前执行这些逻辑阶段：

1. 读取 / 修复主文件并解析完整主事务。
2. 发现并校验匹配的 sidecar；忽略无关文件。
3. 解析完整 sidecar 事务并修复被撕裂的最终事务。
4. 从头部以及**所有**完整的主 / sidecar 记录计算全局序号高水位，包括稍后被退役排除的记录。
5. 从主事务确定每个 scope 的最近退役序号。
6. 保留序号大于该 scope 最近退役的 sidecar 写入。
7. 按全局序号合并保留的主事务和 sidecar 事务，并按全局顺序重放它们，保留事务边界，拒绝重复 / 非单调序号。
8. 推进到预先计算的高水位。
9. 移除在其最近退役之后没有记录的 sidecar；清理失败不会让已退役内容变活。

主事务在发生 sidecar 事务的地方有序号缺口。sidecar 在其他 scope / 主提交发生的地方有缺口。两者都仍然有效。

含有退役之后记录的 sidecar 是活跃的被复用寿命，不得删除。把退役清理与稍后写入串行，以便旧的 unlink 不能竞态并移除新近复用的 sidecar。

活跃 sidecar 中畸形的内部记录或身份不匹配是存储损坏，并使打开失败。被撕裂的最终事务被整份丢弃。被中断的原子创建留下的临时文件是清理产物，永远不成 sidecar。

### 6.4 遗留 v3 {#64-legacy-v3}

遗留 v3 没有 scopes。普通 Harness operation 在任何 progress 写入之前提交 session-scoped 接受，因此它在正常路径上先升级。仍要定义并测试第一个调用者写入是 ephemeral 时的通用存储行为：在全局提交队列下完成现有的 v3 到 v4 主重写 / usage 调整，然后提交 scoped 事务而不把它放进主文件。sidecar 追加前崩溃不会留下已提交的调用者事务，并可以复用其未提交序号。

### 6.5 Repository 与 fork 行为 {#65-repository-and-fork-behavior}

- Repository `list()` 通过其现有的非文件 / `.jsonl` 过滤忽略 `${mainPath}.scopes` 目录及其文件。
- Repository `delete()` 通过其当前路径移除主文件，然后用 `force: true` 递归移除 `${mainPath}.scopes`；scope 目录清理失败在主文件结果已知之后拒绝删除，而不推断 Harness 状态。缺失的 scope 目录是合法的。
- `JsonlStorage.close()` 像今天一样排空其已接纳的主 / sidecar 提交；`JsonlSessionRepo.close()` 保留其当前生命周期行为，因为 repository 所有权是单独的包。没有任何 progress scope 仅仅因为句柄关闭而被退役。
- 精确保留当前 fork 允许列表。不要向任一 fork scope 增加通用应用值或 list。确保源快照和 backend fork 读取者忽略所有 ephemeral value/list，无论命名空间；当前目标在逻辑上保持不变，只是 ephemeral 状态不能泄漏。
- fork 目标不含 sidecar 或退役状态。
- WP08 稍后可能替换 fork 物化，但必须保留这个 scope 策略。

J1 compaction 被排除。当 J1 最终落地时，只有在丢失该边界不能让任何物理 sidecar 变活之后，才可以省略历史退役记录。

## 7. Memory backend {#7-memory-backend}

用 scope 扩展 `InMemoryStorageState` 的物理 value/list 身份。session scope 与每一个 ephemeral ID 都是不同的。保留一个全局 `nextSeq` 和当前 stats 行为。

应用 `CommittedScopeRetireWrite` 在周围事务的同一次同步应用中删除该 scope 中的每一个标量 / list。它不删除 entries 或 usage，后者不能是 ephemeral。稍后的 scoped 写入在同一 ID 下重建状态。

快照暴露 scope 以便 fork 代码能拒绝 ephemeral 状态，但 `createForkSnapshot` 保持其当前内建允许列表，不得开始复制通用 session-scoped 应用值或 list。插桩仍必须报告精确的已提交写入顺序，包括退役。

## 8. SQLite backend {#8-sqlite-backend}

就地更改 WIP schema，没有迁移：

```sql
scalar_values(
  session_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  seq INTEGER NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY(session_id, scope_id, namespace, key)
) WITHOUT ROWID;

list_values(
  session_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  seq INTEGER NOT NULL,
  value TEXT NOT NULL,
  tag TEXT,
  PRIMARY KEY(session_id, scope_id, namespace, key, seq)
) WITHOUT ROWID;
```

session scope 使用 `scope_id = ''`，否则使用精确 scope ID。每一点读取、前缀扫描、set/delete、append/delete、快照和查询计划断言都包含 scope 身份。

在同一 `BEGIN IMMEDIATE` 事务内，退役写入执行：

```sql
DELETE FROM scalar_values WHERE session_id = ? AND scope_id = ?;
DELETE FROM list_values   WHERE session_id = ? AND scope_id = ?;
```

它仍通过 `sessions.next_seq` 消耗其被分配的全局序号，即使没有留下已退役 scope 的墓碑行。稍后同一 ID 下的写入自然重建行。退役回滚必须恢复 scoped 行以及所有兄弟主写入。

fork 路径只复制 `scope_id = ''`。共享容器删除仍是 Session 范围的，并连同其他 Session 行一起移除所有值 / list，无论 scope。

## 9. 必需测试 {#9-required-tests}

在每个实现切片之前或同时移植测试。从拥有包使用仓库的 Vitest 二进制。不要直接运行完整 Vitest 套件。

### 9.1 类型与构造器测试 {#91-type-and-constructor-tests}

- Session 地址默认为 `SessionScope`。
- Ephemeral 重载保留 `EphemeralScope`，同时保持不变的 `T`。
- 地址 scope 对读取是协变的；写入 scope 是不变的。
- 同 scope 的 session 事务通过类型检查。
- 同 scope 的 ephemeral 事务通过类型检查。
- session 写入加 `retireScope` 通过类型检查。
- 一笔事务中的直接 session + ephemeral 写入以 `@ts-expect-error` 失败。
- 两个 ephemeral ID 逃避静态区分，但在运行时同一 ID 断言上失败。
- scope 对象身份无关；相等 ID 访问同一状态。
- 空的和过长的编码 ID 被拒绝；分隔符 / Unicode 编码而不路径逃逸。
- 具有相等 namespace/key 的 session 与 ephemeral 地址不别名。

### 9.2 共享 backend 一致性 {#92-shared-backend-conformance}

在 Memory、JSONL 和 SQLite 上同样运行：

- ephemeral 标量 set/get/replace/delete；
- ephemeral list append/分页/整 list 删除；
- 具有相等 namespace/key 的独立 scopes；
- session scope 独立于相等的 ephemeral 地址；
- 混合 session/ephemeral 事务在 mutation 前被拒绝；
- 一笔事务中的两个 ephemeral ID 在 mutation 前被拒绝；
- 退役删除精确 scope 中的每一个 value/list，而不删除其他 scope；
- 退役与 session 兄弟写入原子；
- 退役缺失状态是合法的；
- 退役后的写入重建新寿命；
- 重复退役推进边界而不让稍后写入消失；
- 主、scope A、scope B、退役和被复用的 A 提交按接纳顺序获得全局递增序号；
- 已退役 / 已删除的物理元素留下合法缺口，重新打开后的第一次提交分配在每一条先前完整记录之上；
- list tag 往返，页限制保持有界，升序 / 降序 `stopAtTag` 包含标记；
- stats 忽略 scoped value/list 和退役；
- close 排空已接纳的 scoped 提交，并拒绝稍后的读 / 写。

### 9.3 JSONL 聚焦测试 {#93-jsonl-focused-tests}

- 第一次 scoped 写入恰好创建一个有效 sidecar，没有主 value/list 记录；
- 一笔 scoped 事务中的若干写入保持为一行物理 sidecar 行；
- 主文件和多个 sidecar 按全局序号顺序重放；
- 头部 `nextSeq` 以及所有完整 sidecar 记录贡献给重新打开高水位；
- 被撕裂的 sidecar 最终事务被整份丢弃并修复；
- 畸形的内部活跃 sidecar 和头部身份不匹配使打开失败；
- 退役前崩溃让 scoped 数据保持存活；
- 主退役之后、unlink 之前崩溃让数据在逻辑上不存在，清理重试；
- unlink 失败不拒绝已经提交的终端事务；
- 退役后复用只重放最近退役序号之后的记录；
- 多次退役 / 复用循环选择最近边界；
- 退役清理被串行，以便稍后复用不能被更早的 unlink 删除；
- 被忽略的边界前记录仍阻止序号复用；
- sidecar 和临时文件从不出现在 repository 列举中；
- repository 删除移除所有 sidecar；
- fork 排除通用应用拥有的 ephemeral value/list；
- 遗留 v3 的第一次 session 写入和第一次 scoped 写入路径都产生有效 v4 状态；
- close/重新打开保留活跃 operation progress，并且不退役它。

### 9.4 SQLite 聚焦测试 {#94-sqlite-focused-tests}

- schema 和查询辅助包含 `scope_id`；list 行保留可空 tag；
- 一笔事务原子删除 scoped 标量 / list 行并写入终端主状态；
- 在 scope 删除之后的强制失败回滚删除和兄弟写入；
- 退役后复用在同一 scope ID 下重建行；
- `sessions.next_seq` 为退役推进；
- list 分页计划仍使用 scoped 主键，没有临时 b-tree；
- 每文件和共享容器布局都隔离 Session 和 scope ID；
- fork 和 Session 删除正确排除 / 移除 scoped 行。

### 9.5 Harness 集成 {#95-harness-integration}

更新现有精确写入测试，而不是削弱它们：

- assistant/deferred 结算丢掉混合 scope 的 frame 删除；
- 工具结果暂存丢掉混合 scope 的 checkpoint/memo 删除；
- 不可达残留在其拥有子结算后从不被快照 / 恢复消费；
- 安全重放当前仅 ephemeral 的删除保持有序且被围栏；
- 每一个终端叶子在文档化的清理位置发出一次退役；
- close/fault 不发出退役，重新打开恢复当前 frame/checkpoint/memo；
- 取消和未知结果恢复只在终端完成时退役；
- 迟到排队的 assistant/tool progress 不能在终端退役之后提交或重新打开 scope；
- 终端清理不再扫描 memo/output 前缀；
- §12 旧删除 / 前缀 grep 找到的每一个聚焦测试和 fixture 都被有意更新；不要依赖历史数字测试计数；
- 经 `drive/{response,reconcile,structural,boundary}.ts` 中 `operationCleanupWrites` 调用者到达的每一条终端路径都被覆盖，包括每一个 operation 族和取消。

可能的聚焦文件包括：

```text
packages/agent/test/harness/values.test.ts
packages/agent/test/harness/{memory,jsonl}-storage*.test.ts
packages/agent/test/harness/{memory,jsonl}-session-repo*.test.ts
packages/agent/test/harness/runtime/drive-{terminal,retry-deferred,tools,reconcile,generation}.test.ts
packages/session-backends/sqlite-node/test/{storage,storage-conformance,repo,repo-conformance}.test.ts
```

用编译器和 grep 守卫寻找额外受影响的测试，而不是假定这份列表穷尽。

## 10. 实现切片 {#10-implementation-slices}

### Slice A — 契约、类型、Memory 参照、list tag {#slice-a--contract-types-memory-reference-list-tags}

主要文件：

```text
CREATE packages/agent/src/harness/session/scope.ts for `SessionScope`, `EphemeralScope`, `Scope`, `ephemeralScope`, scope phantoms/helpers, and runtime scope-ID validation
MODIFY packages/agent/src/harness/session/{types,values,commit,in-memory-storage-state,memory,session,index}.ts
MODIFY packages/agent/src/harness/session/testing/{conformance/storage,instrumented-storage,storage-decorator,gating-storage}.ts
MODIFY packages/agent/test/harness/{values,memory-conformance,memory-storage,storage-backed-session}.test.ts
MODIFY packages/agent/docs/mobile-handoff/01-harness/02-scopes/scopes.variance.ts
```

1. 增加 scope 值 / 地址 / 写入 variance 以及可复用 ID 语义。
2. 增加退役已提交写入和单 scope 事务校验。
3. 增加 tag/`stopAtTag` 行为。
4. 实现 Memory 物理身份、退役、全局序号、快照。
5. 在继续之前通过类型测试和 Memory 一致性。

### Slice B — SQLite {#slice-b--sqlite}

主要文件：

```text
MODIFY packages/session-backends/sqlite-node/src/sqlite/migrations/001_initial.sql
MODIFY packages/session-backends/sqlite-node/src/sqlite/{storage,repo}.ts
MODIFY packages/session-backends/sqlite-node/src/sqlite/session/{values,session-sequences}.ts
MODIFY packages/session-backends/sqlite-node/test/{storage,storage-conformance,repo,repo-conformance}.test.ts
```

1. 增加 scoped schema/查询身份和 tag。
2. 实现原子 `DELETE ... WHERE scope_id` 退役。
3. 保留全局序号分配、stats、分支索引、共享容器行为。
4. 从 fork 排除 ephemeral 行。
5. 在继续之前通过 SQLite 聚焦 / 一致性测试。

### Slice C — JSONL sidecar {#slice-c--jsonl-sidecars}

主要文件：

```text
CREATE packages/agent/src/harness/session/jsonl/scope-files.ts for fixed directory/file naming, exact header parsing/serialization, discovery, atomic first creation, torn-tail parsing/repair, and recursive cleanup helpers
MODIFY packages/agent/src/harness/session/jsonl/{types,codec,storage,repo,legacy-v3,index}.ts
MODIFY packages/agent/test/harness/jsonl-{storage,storage-conformance,session-repo,session-repo-conformance,v3-migration}.test.ts
```

1. 增加 sidecar 命名 / 头部 / 创建 / 发现。
2. 把 scoped 提交路由到 sidecar，同时全局分配。
3. 持久化主退役记录和串行 unlink。
4. 实现多文件高水位计算和带可复用边界的全局有序重放。
5. 处理撕裂尾部、损坏、v3、列举、删除、close 和 fork。
6. 在运行时迁移之前通过所有 JSONL 测试。

### Slice D — Harness 迁移 {#slice-d--harness-migration}

主要文件：

```text
MODIFY packages/agent/src/harness/session/values.ts
MODIFY packages/agent/src/harness/runtime/{progress,lane}.ts to propagate scoped write generics through progress channels and lane commands
MODIFY packages/agent/src/harness/runtime/drive/{terminal,response,deferred,tools,reconcile,structural,boundary}.ts
INSPECT packages/agent/src/harness/runtime/drive/tool-placement.ts; current source needs no scoped cleanup change
MODIFY all focused runtime tests found by the §12 greps
```

1. 按 operation ID 给 memo/tool/frame 地址加 scope。
2. 移除混合 scope 删除和清理扫描。
3. 在通用后缀中增加终端退役。
4. 保留当前输出 / 重放 / 事件行为。
5. 证明迟到写入围栏以及每一条终端 / close / 恢复路径。

### Slice E — 文档与最终校验 {#slice-e--documentation-and-final-validation}

更新当前规范 / 参考文档：

```text
packages/agent/docs/harness.md
packages/agent/docs/values.md
packages/agent/docs/post-wp05-roadmap.md
packages/agent/docs/mobile-handoff/README.md
packages/agent/docs/mobile-handoff/01-harness/02-scopes/scopes.md
packages/session-backends/sqlite-node/README.md
packages/agent/src/harness/telemetry.ts and generated `packages/agent/docs/telemetry-schema.md`: add the `scope` session-write item kind without implementing spans
```

不要重写历史 WP00–WP07 交接或已发布 changelog 段落。在 `dev` 上，按仓库仅 main 的规则不要增加 changelog 条目。

运行：

```bash
npm run check
./test.sh
```

每个切片之后也运行每一个被修改的聚焦测试。为批准检查点记录完整命令结果。

## 11. 排除项 {#11-exclusions}

不要包含：

- Chord `Op`/`WireOp` 存储集成；
- JSONL 地址 / path intern 或紧凑元组记录；
- pending 输出地址重命名；
- `ToolOutput`、工具 API 变更、重放 seed、memo/checkpoint 原子性、progress 节奏、限速、exec-env 变更；
- 紧凑 `message_update`、assistant 增量 reducer 变更，或协议复制变更；
- J1 主日志快照 compaction；
- 超出从当前 fork 排除 ephemeral 状态的 WP08 fork 再设计；
- repository 生命周期契约变更；
- 超出为新写入种类保持已声明 schema 准确的遥测实现；
- 更旧 WIP format-4 SQLite schema 的迁移或兼容；
- 应用级自动 scope 所有权、从 operation 派生的孤儿推断、lease、TTL 或后台 scope 收集。

若实现需要被排除的项，停下并在扩大范围之前修订本交接。

## 12. Grep 守卫 {#12-grep-guards}

最终评审前，检查每一个剩余匹配：

```text
operationToolMemoPrefix
pendingToolOutputPrefix
deleteList(pendingAssistantFrames
deleteValue(pendingToolOutput
scopeId
retireScope
stopAtTag
```

预期结果：

- 没有 session-scoped 事务直接删除 ephemeral 地址；
- 没有终端路径省略退役；
- 没有 backend 点读 / 写省略 scope 身份；
- 没有 fork 复制 ephemeral 状态；
- 没有 JSONL sidecar 被当作 Session 文件；
- 不存在每 scope 序号计数器；
- 存储中不存在 operation 状态 / 孤儿推断。

## 13. 退出条件 {#13-exit-condition}

Step 1 在以下情况实现完成：

- scope/地址/写入类型拒绝混合 scope 事务，运行时校验拒绝一笔事务中的两个 ephemeral ID；
- ID 通过最近退役全局序号边界可复用，没有历史 ID 登记；
- Memory、JSONL 和 SQLite 共享一个全局序号空间并通过共同一致性；
- SQLite 退役与终端状态原子删除精确 scoped 行；
- JSONL 只把 ephemeral value/list 写入 sidecar，只在主日志记录退役，按全局顺序重放所有文件，保留高水位，并在没有 operation 推断的情况下删除已退役 sidecar；
- list tag 和有界 `stopAtTag` 在各 backend 上同样工作；
- 当前工具 / assistant 载荷和事件格式不变；
- 每一条终端路径退役一次，而 close/fault 保留活跃 scope 恢复；
- fork 以及 repository 列举 / 删除正确处理 sidecar；
- 聚焦测试、`npm run check` 和 `./test.sh` 通过；
- 最终评审没有阻塞项；
- 完整 diff 和结果已呈现给用户，实现已停下等待批准。

只有在明确批准之后才可以提交并推送 Step 1。Step 2 只在那次推送被确认之后开始。
