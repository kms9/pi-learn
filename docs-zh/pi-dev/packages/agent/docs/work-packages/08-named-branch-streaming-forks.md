本文是 `08-named-branch-streaming-forks.md` 的中文阅读版；命令、路径、API 名称保持英文。

# WP08 — 具名 Branch 与 tree forks，带流式复制 {#wp08--named-branch-and-tree-forks-with-streaming-copies}

**状态：进行中 — 正在实现 Slice A。**

本包替换 fork 契约：`ForkOptions` 获得强制 scope 和强制具名源 branch，branch forks 校验完整已配置源 AgentLane 以及祖先成员资格，tree forks 复制完整不可变 tree 加上当前 application values/lists，并且全部三个 backends 用有界内存流式复制替换物化的源 snapshot 数组。JSONL fork 从不修复或变更其源。一个封闭的核心分类器拥有每一个命名空间的 fork 处置。

WP07 是硬依赖并原样保留：不创建数据库模式、规范 `(containerPath, sessionId)` 身份、针对外部/live-worker 源的独立只读 WAL reader、仓库局部删除预留，以及全部结算后的 close。本包只取代路线图中的 “SQLite fork cost” 性能项。

## 0. 必读 {#0-mandatory-reading}

编辑前完整阅读：

1. `packages/agent/docs/harness.md` §§0.6、1.3–1.7、2.3、2.7–2.9、Part 9（invariants 3–5、13、16；ledger 完整性）。
2. `packages/agent/docs/values.md`，尤其是 “Forks and rewrites” 以及 backend 各节。
3. `packages/agent/docs/post-wp05-roadmap.md`（SQLite fork cost、仓库生命周期上下文）。
4. 已完成的 WP06 §7 和 WP07（历史；不要编辑它们）。
5. `packages/agent/src/harness/session/fork.ts`、`types.ts`（`ForkOptions`、`SessionRepo`）、`values.ts`、`in-memory-storage-state.ts`、`memory.ts`、`session/index.ts`。
6. `packages/agent/src/harness/session/jsonl/repo.ts`、`jsonl/storage.ts`、`jsonl/codec.ts`、`jsonl/legacy-v3.ts`、`jsonl/types.ts`。
7. `packages/session-backends/sqlite-node/src/sqlite/repo.ts`、`storage.ts`、`session/values.ts`、`session/entries.ts`、`session/branch-entries.ts`、`types.ts`。
8. `packages/agent/src/harness/session/testing/conformance/session-repo.ts` 以及 §5 中点名的每一个测试。
9. `packages/agent/src/harness/session/testing/benchmark/session-repo.ts` 以及两个 `session-repo.bench.ts` 文件。

不要把 `dist/` 输出当作实现输入。WP00–WP07 文档和已发版 changelog 各节在本包中不可变。

## 1. 固定架构 {#1-fixed-architecture}

### 1.1 公开契约 {#11-public-contract}

```ts
export type ForkOptions =
	| { scope: "branch"; branch: string; entryId?: string; position?: "before" | "at"; id?: string }
	| { scope: "tree"; id?: string };
```

`scope` 是必需的。`branch` 对 branch scope 是必需的。没有默认 scope、没有隐式 `main`、没有兼容别名。

**Branch scope** 要求完整已配置的源 AgentLane：`pi.branch.tip/{branch}`、`pi.lane.config/{branch}` 和 `pi.lane.state/{branch}` 必须全部存在。缺失 tip 拒绝（`unknown branch`）；仅数据的 Branch（有 tip 而无 config/state）拒绝；部分 config/state 对，或存在 `laneConfig`/`laneState` 却没有 `branchTip`，是损坏并拒绝。提供 `entryId` 时，它必须是该 Branch 当前 tip 祖先上的一条 entry（含端点）；tree 中其他位置的 entry 拒绝。省略 `entryId` 表示当前 tip。`position` 默认为 `"at"`；`"before"` 选择目标的 parent，并可能产生 `null` 目的地 tip（在根 entry 之前，或 `null` 源 tip 且没有 `entryId`）——合法。目的地恰好包含一个同名 Branch、选定 tip、被复制的 `LaneConfiguration`，以及全新空闲 lane 状态 `{ currentOperationId: null, lastOperationId: null, inbox: [] }`。目的地中不存在任何其他 Branch 或 lane。

这有意让仅数据 Branches 的 branch forks——包括其 main 缺少可重建 model/thinking 历史的遗留 v3 imports——不可用。Tree scope 对这些源仍然可用。

**Tree scope** 复制：每一条不可变 entry，包括从每一个当前 Branch tip 都不可达的 entries；每一个 Branch tip 原样；每一个已配置 lane 的 config 加上同名下的全新空闲 lane 状态；仅数据 Branches（有 tip，无 config/state）作为仅数据 Branches。部分 config/state 对，或没有 `branchTip` 的 `laneConfig`/`laneState`，在两种 scopes 中都是损坏：tree scope **拒绝**它，而不是丢弃它。

**两种 scopes**：复制 `pi.session.name`；只为被复制的 entries 复制 `pi.entry.label` 值；排除 usage ledger、`pi.result`、全部 `pi.op.*`、全部 `pi.pending.*`（entries、tool checkpoints、assistant frames），以及任何打开 operation 状态的痕迹。目的地 usage totals 从零开始；目的地 `messageCount` 等于被复制的 message entries 数量，恰好如当前符合性已经证明。目的地元数据记录 `parentSessionId = source.id`。被复制的 entries、values 和 list 元素保留其原始 `seq`；目的地 `nextSeq` 高水位是源的，因此没有序列被重用。被变换的内置项保持一致 seqs：被重写的 `branchTip` 和每一个全新空闲 `laneState` 重用源当前对应 value 行的 seq，而被复制的 config、name、labels、application values 以及 list 元素保留它们自己的——目的地写入在不变的高水位下保持原始 seq 顺序。

**Application values/lists（保留的 `pi`/`pi.*` 命名空间之外）**：tree scope 复制每一个当前标量值和每一个存活 list 元素及其原始 seqs；branch scope 一个都不复制。把 `seq <= tipSeq` 截断当作“历史重建”是禁止的——它可证明不是重建：

```text
Scalar: TX[seq 10: set my-app.state = v1] · TX[seq 12: insert e1] ·
        TX[seq 50: set my-app.state = v2]     (v2 describes work after e1)
Branch fork at e1, cutoff seq <= 12: only v2 exists (v1 was replaced, no
history is retained); 50 > 12 excludes it → state absent, though the app
demonstrably had state v1 at the fork point. The cutoff cannot recover v1.

List:   append seq 5 · append seq 20 · deleteList seq 40 · append seq 60
Cutoff seq <= 30: elements 5 and 20 no longer exist (whole-list delete
destroyed them); only 60 survives and is excluded → empty list, though the
list held {5, 20} at seq-30 time.
```

任何截断都过滤 *幸存者*，静默地把回退意图与删除后的现实混在一起。因此 branch scope 不复制任何应用拥有的内容，匹配其全新空闲 lane 状态和零 ledger；应用拥有自己的再派生。

### 1.2 一个封闭的 fork 分类器 {#12-one-closed-fork-classifier}

全部命名空间 fork 知识住在紧挨 `session/values.ts` 和 `session/fork.ts` 的一个核心模块中（例如 `session/fork-policy.ts`）。它是封闭 switch，不是 registry、plugin 策略或 DSL：

- `pi.op.*`、`pi.pending.*`、`pi.result` → 排除，两种 scopes。
- `pi.session.name` → 复制。
- `pi.entry.label` → 当且仅当被键控的 entry 被复制时复制。
- `pi.branch.tip`、`pi.lane.config`、`pi.lane.state` → 结构化 lane 动作；scope 特定规则（branch 只保留具名 lane 并重写其 tip；lane 状态总是替换为全新空闲状态；tree 保留全部）住在被全部 backends 消费的一个共享 driver 中。
- 精确命名空间 `pi` 以及任何其他 `pi.*` 命名空间 → fork **失败**，但仅当 fork 时存在当前存活状态（当前标量行或存活 list 元素）。后来被替换或删除的历史写入在每一个 backend 的当前状态中都已缺席，不得单独使 JSONL fork 失败——行为在 backend 间等价。引入新的内置命名空间而不声明其 fork 语义必须打破 fork 测试，而不是静默复制或丢弃状态。
- 既不是 `pi` 也不是 `pi.*` → application：tree 上复制，branch 上排除。唯一的内置 list 命名空间（`pi.pending.assistant_frame`）排除；application lists 遵循 application 规则。

Driver 暴露流式形态——接受一次已 commit 的 value/list 写入（或当前行），发出零次或多次目的地写入，`finish()` 发出全新空闲 lane 状态和被重写的 branch tip——只持有有界状态（lane 名称、目的地 tip）。Entry 复制成员资格是 backend 提供的谓词，以便每个 backend 使用自己的索引。`createForkSnapshot`、`forkSnapshotWrites`、`ForkSourceSnapshot`、`ForkDestinationSnapshot` 以及 `entriesComplete` 逃生口被删除。

### 1.3 有界内存 backend 过程 {#13-bounded-memory-backend-procedures}

Fork 期间的辅助内存必须无论源大小都保持有界。不可避免的例外是 Memory 的目的地状态，以及返回的打开目的地 Session（打开后的 JSONL 目的地状态）。源复制路径不得调用返回数组的完整读取：没有 `snapshotEntriesAndValues()`、`captureForkSource()`、`readAllScalarValueRows()`、`readAllEntryRows()`、整文件 `readTextFile`，或对无界行集的 SQLite `.all()`。

**Memory。** 在源 `commitQueue` 边界，通过分类器/driver 对源 maps 迭代一次，直接构建目的地 `InMemoryStorageState`。Branch scope 从 branch tip 沿 `parentId` 走向根，计算祖先 id 集合并验证 `entryId` 成员资格；恰好复制该集合。没有中间 snapshot 数组；`MemoryStorage.fromSnapshot` 和 `captureForkSource` 被移除。

**JSONL。** 源通过只读路径读取，该路径捕获固定文件前缀——打开读 handle，在捕获时记录当前长度，并且只读取该前缀——并且从不写源：没有 torn-tail 截断/重写、没有 v3 规范化持久化、没有源旁边的 `.tmp`。捕获前缀内被撕开或不完整的末行在内存中丢弃。源 `nextSeq` 高水位派生为 `max(header.nextSeq when present, highest complete captured write seq + 1)`——普通 headers 不在每一次 append 时重写，被撕开的不完整最终写入从不推进它。

- *两种 scopes* 用一次临时磁盘索引对捕获前缀做两遍（在成功和失败时都在 `finally` 中删除）。Pass 1 流式处理每一行，并把 value/list 写入折叠进索引：对每个标量地址，当前存活 `set` 的 seq（尾随 `delete` 之后缺席）；对每个 list 地址，存活元素 seqs 的集合（整表 delete 清空它）；再加上 branch scope 需要祖先处的 entry `id → parentId`（parents 总是先于 children）。该折叠应用回放所做的相同当前状态语义，而没有整份状态 RAM。
- Pass 2 按顺序再次流式处理前缀，并且仅当索引证明它当前且分类器选择它时发出写入：选定集合中的 entry 写入；其 seq 等于该地址索引当前行 seq 的标量 `set`；其元素 seq 在幸存者集合中的 list `append`。Deletes、被取代的 sets 以及死去的 application value/list 历史从不作为目的地状态发出——目的地文件只包含当前选定行，已经按原始 seq 顺序，因为源行是 seq 有序的。
- 被变换的内置项就地发出：当 pass 2 到达被保留 branch 的源当前 `branchTip` 行的 seq 时，它在同一 seq 下发出（可能被重写的）tip；当它到达被保留已配置 lane 的当前 `laneState` 行的 seq 时，它在同一 seq 下发出全新空闲 lane 状态。不存在尾部 appends，因此回放保持 seq 单调，高水位不被触碰。
- *Branch scope* 在 pass 2 之前通过磁盘索引从 tip→root 走，把祖先集合物化到磁盘并验证 `entryId` 成员资格；labels 只为成员 entries 发出。
- 目的地暂存在临时文件中并原子重命名（现有 `publishFileAtomically`）；失败时移除临时文件和索引。遗留 v3 按源状态拆分。Fork 一个 **打开的** 遗留 v3 `JsonlStorage` **以清晰错误拒绝**，直到一次正常非空 commit 升级并持久化其规范化 format-4 ids：v3 规范化铸造非确定性 UUIDv7 尾，因此独立磁盘再解析无法复现打开 Session 暴露的 ids 或校验调用方 `entryId`；fork 不得自己变更/升级源。一个 **已关闭的** 遗留 v3 源使用有界固定前缀磁盘解析器/规范化器，并且从不触碰文件：tree forks 成功；当 import 重建完整已配置 lane 时，branch forks 可以使用省略的 `entryId`（默认规范化 tip），而来自更早打开的任何调用方提供的进程局部 id 跨再解析不稳定并正常拒绝；仅数据重建的 lane 像各处一样拒绝。普通可写 `JsonlStorage.open` 可以保留内存中规范化，但驻留状态从不是 fork 源。
- **没有驻留状态路径**：打开的同仓库 JSONL 源在源 `commitQueue` 上入队一个短边界回调，其唯一工作是捕获固定只读文件 handle 前缀（打开 handle，记录长度），然后释放队列；fork 在该前缀上运行相同的两遍磁盘过程，同时后续源 appends 继续。已 commit 的写入在应用到驻留状态之前就已在文件中持久，因此前缀在边界处是权威的，并且文件顺序在没有驻留 Map 排序歧义的情况下保留 seq 顺序。

**SQLite。** 通过有界内存临时磁盘 SQLite **暂存数据库** 的基于迭代器的行传输，对 per-file 和 shared-container 布局统一使用。源 reader 从不直接流入目的地事务——WAL reader 和一个 writer 可以共存，但在 shared-container 模式下目的地 writer 会持有 container 的唯一写锁，并在捕获仍在流式传输时阻塞边界后的源 writer；暂存到另一个文件移除该耦合。使用 prepared-statement 迭代（`iterate`/逐步），从不使用源大小的 `.all()` snapshot 数组：

- *外部/已关闭/live-worker 源：* WP07 路径——在精确规范路径上 `openReadOnly`，一次延迟读事务，在其中校验 session 行和 storage version。
- *同仓库打开源：* **先** 打开独立只读连接，然后在源 Storage `commitQueue` 上入队一个短边界回调，其唯一工作是 `BEGIN` 并在释放队列之前建立独立 reader 的 snapshot（发出一次平凡读取）。不要在源 writer 连接上开始读事务然后释放其队列，也不要在复制期间持有队列。
- *暂存：* 在源 reader 保持打开时，把选定 entries 按 `ORDER BY seq` 以及分类器选定的当前标量/list 行（匹配分类器的 SQL 级命名空间预过滤——枚举的内置命名空间加上排除精确 `pi` 和 `pi.%` 的 application 谓词——每一行仍通过分类器）以有界批次流入临时暂存数据库。Branch scope 通过 `branch_entries` 段链枚举直到选定 entry 的祖先，并通过该索引回答 `entryId` 和 label 成员资格，而不是内存中的 id 集合。后续源 commits 使用原始 writer 连接，并且可以在暂存流式传输时完成，**两种** 布局都如此，因为暂存写入指向另一个文件。
- *发布：* 关闭/commit 源读事务，然后把暂存流入一次目的地 `BEGIN IMMEDIATE` 事务——entries 按 seq 顺序增量维护目的地 branch index 和 `message_count`，然后是 values/list 元素——并在成功和失败时都在 `finally` 中删除暂存数据库。目的地 `next_seq` 是源的。Shared-container 目的地只写入新 session 的行。

### 1.4 保留的 WP07 行为 {#14-preserved-wp07-behavior}

跨 create/open/fork/delete 的目的地 id 预留、不创建打开、外来元数据拒绝、per-file 和 shared-container 布局、WAL commit-boundary 完整性（一次源 commit 完整在一个 fork 之内或完整在其外），以及全部结算后的仓库 close 保持不变。

### 1.5 Coding-agent 状态（仅记录） {#15-coding-agent-status-record-only}

`/fork`、`/clone` 和 `--fork` 完全运行在遗留 `SessionManager`（`createBranchedSession`、`forkFrom`）上，此处不迁移。当 coding-agent 采用 `SessionRepo` 时的未来映射：`/fork` → `{ scope: "branch", branch: "main", entryId, position: "before" }`；`/clone` → `{ scope: "branch", branch: "main" }`；`--fork` → `{ scope: "tree" }`。

## 2. 当前源码中的问题 {#2-problems-in-current-source}

- `ForkOptions` 把 `scope` 默认为 `"branch"`，并硬编码源/目的地 `main`（`fork.ts`，两个 backend branch readers）。
- 没有祖先成员资格检查：`selectForkContents` 从 tree 中任意提供的 `entryId` 沿 parents 走，并把结果标记为 `main`。
- 每一个 backend 都物化完整源：`snapshotEntriesAndValues()`（Memory/JSONL）、`readAllScalarValueRows` + `readAllEntryRows`/`scanBranchEntries` 数组（SQLite），全部漏斗进内存中的 `createForkSnapshot`。
- `createForkSnapshot` 用全新 seqs 给被复制的标量值重新编号，并把 `nextSeq` 计算为 `max entry seq + 1`，丢失原始 value seqs。
- 对已关闭源的 JSONL fork 使用 `JsonlStorage.open()`，它会在 torn tail 时重写源文件——fork 今天可以变更其源。
- Lists 从不被复制；application values 被排除且没有声明的 tree 策略（`values.md` 明确推迟它）。
- 命名空间 fork 知识在 `fork.ts`、`values.md` 散文以及符合性断言之间重复；没有任何东西强制新的 `pi.*` 命名空间声明 fork 语义。
- `entriesComplete?: false` 只存在于让 SQLite branch snapshots 跳过其他 branches 的 tip 校验。

## 3. 必需结果 {#3-required-result}

1. `ForkOptions` 和校验恰好如 §1.1；全部拒绝路径不创建目的地文件、数据库行或已预留但泄漏的 ids。
2. §1.2 的封闭分类器/driver，从 core 导出并由全部三个 backends 消费；未知保留命名空间（精确 `pi` 或未声明的 `pi.*`）仅当存在当前存活状态时使 fork 失败，在每一个 backend 上相同。
3. 全部三个 backends 上 §1.3 的流式过程；从 `session/index.ts` 和 sqlite-node import 表面移除 `createForkSnapshot`/`captureForkSource`/`snapshot()` fork 管道及其导出。
4. Seq 保留（包括被重写 tips 和全新空闲 lane 状态重用的 seqs）以及每一个 backend 上的源 `nextSeq` 高水位（JSONL 按 §1.3 派生）；相同源在 backends 间有相同的逻辑目的地状态（符合性）。
5. JSONL 源不变异，包括 torn-tail 源和遗留 v3 源。
6. 文档：`harness.md` §2.7（以及 §1.7 与 fork 相关的句子）、`values.md` “Forks and rewrites” 以及 backend snapshot 提及、`post-wp05-roadmap.md`（退役 SQLite fork-cost 项，添加/指向本包）、`packages/session-backends/sqlite-node/README.md` 的 fork 段落、若数据集措辞变化则还有 `packages/agent/benchmark/session/README.md`。历史 WP 文档和已发版 changelogs 不触碰。Format/storage versions 不变；没有 migration。

## 4. 实现切片 {#4-implementation-slices}

### Slice A — 契约与分类器（core，Memory 参考） {#slice-a--contract-and-classifier-core-memory-reference}

文件：`session/types.ts`、新的 `session/fork-policy.ts`、`session/fork.ts`（重写或删除）、`session/values.ts`（仅在需要新 helpers 时）、`session/index.ts`、`session/memory.ts`、`session/in-memory-storage-state.ts`、符合性 `testing/conformance/session-repo.ts`、`test/harness/memory-conformance.test.ts`、`test/harness/memory-session-repo.test.ts`。

1. 替换 `ForkOptions`；实现校验和分类器/driver。
2. 把 Memory fork 重写为在 commit-queue 边界直接构造目的地。
3. 为新契约重写共享 fork 符合性（§5）并在 Memory 上通过。

### Slice B — JSONL 流式 {#slice-b--jsonl-streaming}

文件：`session/jsonl/storage.ts`、`session/jsonl/repo.ts`、`session/jsonl/types.ts`、如需要则在 `FileSystem` 能力中的流式 reader 支持（`harness/types.ts`、`harness/env/*`）、`test/harness/jsonl-session-repo.test.ts`、`jsonl-session-repo-conformance.test.ts`、`jsonl-storage.test.ts`、`jsonl-v3-migration.test.ts`。

1. 只读固定前缀源捕获，内存中丢弃 torn-tail；对打开源在源 `commitQueue` 边界做相同捕获；任何 fork 路径都不写源。
2. 两种 scopes 的两遍磁盘当前状态折叠与发出；通过磁盘索引的 branch 祖先成员资格；就地变换的内置项；原子目的地发布。
3. 打开 v3 的 fork 拒绝以及已关闭 v3 的磁盘解析器/规范化器路径；按 §5 更新 v3 fork 测试。

### Slice C — SQLite 流式 {#slice-c--sqlite-streaming}

文件：`sqlite/repo.ts`、`sqlite/storage.ts`、`sqlite/session/values.ts`、`sqlite/session/entries.ts`、`sqlite/session/branch-entries.ts`、`sqlite/types.ts`、`test/repo.test.ts`、`test/repo-conformance.test.ts`。

1. 用独立 reader 加边界回调设计以及向临时暂存数据库的迭代器传输替换 `SqliteStorage.snapshot()`/数组 snapshot helpers，然后用 `finally` 清理做暂存到目的地的发布。
2. 通过 branch index 的 branch 祖先/成员资格/labels；匹配分类器的 SQL 预过滤。
3. 保留 WP07 身份、预留、不创建和 close 覆盖；两种布局。

### Slice D — 基准与文档 {#slice-d--benchmarks-and-documentation}

文件：`testing/benchmark/session-repo.ts`、两个 `session-repo.bench.ts` 文件、`benchmark/session/README.md`、`harness.md`、`values.md`、`post-wp05-roadmap.md`、sqlite-node `README.md`、changelogs 仅在正常分支规则下。

更新 fork option 字面量，添加大源 fork 基准（tree 和 branch），并落地 §3.6 文档集。

## 5. 必需测试 {#5-required-tests}

### 契约与校验 {#contract-and-validation}

- branch scope 拒绝：未知 branch 名称；仅数据 Branch（只有 tip）；部分 config/state 对（损坏）；不在具名 Branch 的 tip 祖先上的 `entryId`（出现在 tree 其他位置）；未知 `entryId`；带 `null` tip 的 `entryId`。每一次拒绝都不留下目的地产物并释放其预留 id。
- branch scope 接受：省略的 `entryId`（tip）、显式 tip、祖先中段 entry、在中段 entry 和根 entry 处的 `position: "before"`（`null` 目的地 tip）、没有 `entryId` 的 `null` 源 tip。
- 目的地形态：恰好一个 Branch，同名，被复制的 config，全新空闲 lane 状态，没有其他 lane 值，设置了 `parentSessionId`。
- tree scope：不可达 entries 被复制；每一个 tip 被复制；已配置 lanes 获得 config 加上全新空闲状态；仅数据 Branches 保持仅数据；部分对失败。
- 两种 scopes：session 名称被复制；labels 只针对被复制的 entries（branch fork 排除非祖先 entries 的 labels）；`pi.result`、`pi.op.*`、`pi.pending.*`（pending entries、tool checkpoints、assistant frame lists）以及 usage 行缺席；精确 stats 期望——复制 N 条 message entries 的 fork 报告 `getStats()` = `{ messageCount: N, usage: all-zero }`，匹配当前符合性；ledger 完整性不变量（“fork 的 ledger 从零开始”）保留。

### Application values 与 lists {#application-values-and-lists}

- tree fork 复制每一个非 `pi.*` 标量和每一个存活 list 元素及其原始 seqs；源的 list cursors 在目的地中分页相同；源中被删除再追加的 list 只复现幸存者。
- branch fork 不复制任何 application values/lists（把 §1.1 的标量和 list 轨迹钉为回归用例：fork 点之后的覆盖以及被删除摧毁的元素在任何实现下都不得重新浮现）。
- 未知保留命名空间（精确 `pi` 或未声明的 `pi.*` 标量或存活 list 元素）中的当前存活状态使每一个 backend 上的 fork 失败；同一命名空间在 fork 之前 **先 set 再 deleted** 不使任何 backend 失败——包括 JSONL，那里死去的历史仍作为物理行存在，磁盘折叠必须把它分类为缺席。通过原始已 commit 写入构造这两种情况。

### 序列保留 {#sequence-preservation}

- 被复制的 entries、values 和 list 元素保持源 seqs；被重写的 branch tips 和全新空闲 lane 状态占据源当前对应行的 seqs；目的地 `nextSeq` 等于源高水位，并且每一次 fork 后的第一次 commit 在每一个 backend 上都分配在它之上（JSONL header `nextSeq`，SQLite `next_seq`）。
- JSONL 把高水位派生为 `max(header.nextSeq when present, highest complete captured write seq + 1)`；被撕开的不完整最终写入不推进它。

### 有界内存与源不变异 {#bounded-memory-and-source-non-mutation}

- 被仪器化的源 readers（测试 decorators/spies）断言 fork 路径从不调用 `snapshotEntriesAndValues`、`captureForkSource`、`readAllScalarValueRows`、`readAllEntryRows`、整文件 `readTextFile`，或 entries/values/lists 上源大小的 `.all()` 数组——有界迭代器步骤和暂存数据库操作被允许；确定性大 fixtures（扩展现有基准数据集生成器）在数千条 entry 的源上练习 tree 和 branch forks。
- SQLite 暂存数据库在成功和失败时都被移除；失败的 fork 既不留下暂存文件也不留下目的地行。
- JSONL：对已关闭 torn-tail 源的 fork 成功，目的地完整排除被撕开的事务，并且源文件字节不变（前后字节比较）；对遗留 v3 源的 fork 让源文件不变；源旁边不出现 `.tmp`；临时祖先索引文件在成功和失败时都被移除。
- JSONL 固定前缀捕获：捕获之后完成的源 append 完整缺席于该 fork。
- JSONL 目的地内容：目的地文件只包含当前选定标量行和存活 list 元素，按原始 seq 顺序——没有 delete 记录、被取代的 sets 或死去的 application 历史；被重写的 tip 和全新空闲 lane 状态位于源当前行的 seqs。
- 遗留 v3：fork 一个 **打开的** v3 源以清晰的升级前错误拒绝；在一次正常非空 commit 把它升级到 format 4 之后，fork 成功并保留已持久化的 ids；一个 **已关闭的** v3 tree fork 通过磁盘解析器成功（仪器化：fork 路径上没有整份状态内存规范化）并让源字节相同；省略 `entryId` 的已关闭 v3 branch fork 在重建完整已配置 lane 时成功，来自更早打开的调用方提供 id 拒绝，仅数据重建的 main 拒绝。

### 协调与顺序 {#coordination-and-ordering}

- Memory 打开源 forks 保持队列边界符合性用例：在 fork 之前接纳的 commit 完整出现；在其后接纳的不出现。
- JSONL 打开源 forks 在 `commitQueue` 边界捕获固定前缀：在边界之前接纳的 commit 完整出现；边界捕获之后完成的源 append 在 fork 仍在流式传输时继续，并且完整缺席于该 fork。
- SQLite 同仓库：独立 reader 先打开，源 `commitQueue` 上的边界回调建立其 snapshot 并释放队列，随后在 writer 连接上的源 commit **在 reader 仍在流入暂存时完成**，并且完整缺席于该 fork；更晚的 fork 完整包含它。在 **两种** per-file 和 shared-container 布局中断言这一点（在 shared containers 中可满足，因为暂存写入指向另一个文件），加上不变的 WP07 live 外部 worker 用例。
- 目的地预留竞态（同一 id 上 create vs fork，两种顺序）不变。

### Backend 等价 {#backend-equivalence}

- 一个共享符合性源（entries、不可达 entries、多个 lanes、仅数据 Branch、labels、带 deletes 的 app scalars/lists、带 pending/frame/checkpoint 状态的打开 operation、usage 行）对两种 scopes 在 Memory、JSONL 和 SQLite 上 fork 到相同的逻辑目的地状态。

## 6. 验证与评审 {#6-validation-and-review}

每一个切片之后：`npm run check`，然后用仓库 Vitest 二进制从所属包运行被修改的聚焦测试；最终评审前 `./test.sh`。Grep 守卫：在历史文档和本交接文档之外不再有 `createForkSnapshot|captureForkSource|ForkSourceSnapshot|entriesComplete`；没有任何 **生产 fork 源路径** 把 `"main"` 当作字面量引用（本文档以及 §1.5 中记录的 coding-agent 映射有意提到 main）。

评审检查点（委托评审使用 provider `anthropic`，model `claude-fable-5`）：

1. Slice A 之后：契约、分类器封闭、符合性形态。
2. Slice C 之后：同仓库顺序、reader 独立性、有界内存证据。
3. 对源码、测试、文档和排除项的最终评审。

## 7. 排除项 {#7-exclusions}

不要包含：

- 兼容别名、默认 scope 或隐式 `main`；
- 任何 `seq <= tip` 截断或其他历史状态重建；
- fork-policy registry、plugin hook 或 DSL；按地址的 application 选择加入；
- 在任何选项下复制 usage 行、`pi.result` 或任何打开 operation 状态；
- coding-agent `/fork`、`/clone`、`--fork` 或 RPC 迁移；
- storage-version bumps、migrations 或格式变更（formats 保持 WIP 就地）；
- J1 snapshot compaction（流式 reader 可以做成可共享，仅此而已）；
- SQLite branch-segment 重设计或未压缩分叉修复；
- 超出 `ForkOptions` 的 `SessionRepo` 接口变更（仓库 `close()` 属于生命周期包）；
- precise-rewrite 工具；search；对 WP00–WP07 文档或已发版 changelog 各节的编辑。

如果实现需要被排除的项，停下来修订交接文档。

## 8. 退出条件 {#8-exit-condition}

当下列条件满足时 WP08 完成：

- `ForkOptions` 恰好是 §1.1 的 union 以及所述校验，在全部三个 backends 上；
- branch forks 要求完整已配置源 AgentLane 并强制祖先成员资格；tree forks 复制完整不可变 tree、每一个 tip、已配置和仅数据 Branches；
- tree forks 携带全部当前 application values 和存活 list 元素及其原始 seqs；branch forks 一个都不携带；
- 一个封闭核心分类器拥有每一个命名空间处置；未知保留命名空间（精确 `pi` 或未声明的 `pi.*`）恰好在存在当前存活状态时使 forks 失败，在全部 backends 上等价；
- 全部受支持的 fork 路径——包括已关闭的遗留 v3 源——按 §1.3 流式且辅助内存有界，由大 fixtures 上的仪器化 reader 测试证明；fork 一个打开的遗留 v3 源明确不受支持（清晰拒绝），直到一次普通 commit 升级它，而不是用内存例外处理；
- JSONL forks 从不变更其源，包括 torn-tail 和遗留 v3 源，并且 JSONL 目的地只包含按原始 seq 顺序的当前选定行；
- SQLite forks 通过临时磁盘数据库暂存（源 reader 打开时 → 暂存，reader 关闭后暂存 → 一次目的地 `BEGIN IMMEDIATE`，暂存在 `finally` 中删除），带独立 reader 边界设计和并发后续 writer commits，在两种布局中得到证明，并保留全部 WP07 行为；
- 被复制的 seqs 和 `nextSeq` 高水位被保留，backends 产生相同的逻辑目的地；
- 共享符合性、聚焦 backend 测试、基准、`npm run check` 和 `./test.sh` 通过；
- 规范性文档和路线图反映新契约，历史文档不触碰；
- 最终 Fable 评审报告没有阻塞项。
