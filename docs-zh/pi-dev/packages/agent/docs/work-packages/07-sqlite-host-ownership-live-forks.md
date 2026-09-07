本文是 `07-sqlite-host-ownership-live-forks.md` 的中文阅读版；命令、路径、API 名称保持英文。

# WP07 — SQLite 宿主所有权与活动源 forks {#wp07--sqlite-host-ownership-and-live-source-forks}

**状态：已实现。**

交付的 backend 没有 writer lease 或替换所有权原语。它提供不创建文件的读写/只读打开、排队的同仓库 snapshots、针对活动外部源的独立只读 WAL snapshots、规范物理身份、路径安全的 IDs、仓库局部删除预留，以及全部结算后的 close。测试覆盖 per-file 和 shared-container 两种布局，包括一次 writer commit 在 read snapshot 边界之后、该 reader 关闭之前完成。

本包让 `packages/session-backends/sqlite-node` 对齐产品所有权模型：server 拥有 Session 记录和 worker 生命周期，并且在任一时刻恰好一个宿主指派的进程拥有可写 Session 权威。通常该进程是 Session worker。Server 可以临时拥有新创建或 fork 出的目的地，但在把其元数据交给 worker 之前会关闭该 Session。

Storage 不实现 writer 所有权。移除 SQLite writer lease；不要修复或替换它。

服务端 fork 有意不同于第二个 writer：它可以并发打开一个由 live worker 拥有的源，只做一次一致的只读 snapshot，同时 worker 继续 commit。Shared SQLite containers 仍受支持。

## 0. 必读 {#0-mandatory-reading}

编辑前完整阅读：

1. `packages/agent/docs/plugins.md` 的 ownership、replacement 和 removal 各节。
2. `packages/server/README.md` 以及相关的 Session routing/removal 源码和测试。
3. `packages/agent/docs/harness.md` §§0.6、1.4–1.7、2.7–2.8、4.3 以及 Part 9。
4. `packages/agent/docs/post-wp05-roadmap.md`。
5. 已完成的 WP06 §7 以及 repository/fork 符合性。
6. `packages/session-backends/sqlite-node/src` 下的每一个源文件。
7. `packages/session-backends/sqlite-node` 下的每一个测试和基准。
8. `packages/session-backends/sqlite-node/README.md` 和 `CHANGELOG.md`。

不要把 `dist/` 下的过时文件当作实现输入。已完成的 WP01/WP06 文档是历史；不要改写它们以掩盖更早的 lease 实现。

## 1. 固定架构 {#1-fixed-architecture}

### 1.1 可写权威属于宿主 {#11-writable-authority-belongs-to-the-host}

恰好一个宿主指派的进程拥有可写 Session。Session worker 是正常所有者。Worker 替换在新 worker 打开 Session 之前关闭旧所有者。Server 管理围绕该所有权转移序列化创建、forking、removal 以及 attachment 生命周期。

Memory、JSONL 和 SQLite 不检测第二个进程为写入打开同一 Session。绕过 server/worker 生命周期是受信任宿主缺陷，不是要修复的存储竞态。仓库仍然拒绝它在一个进程中拥有的重复可写 handles。

不要添加 storage lease、文件系统锁、fencing token、heartbeat、基于超时的接管、删除 tombstone、隔离协议或通用锁管理器。

### 1.2 只读 fork 访问可以与 worker 重叠 {#12-read-only-fork-access-may-overlap-the-worker}

Server 拥有仓库管理，并且可以在其 Session worker 继续写入源时 fork 该源。该 fork 的源侧：

- 打开精确的源 container 而不创建它；
- 是只读的；
- 使用一次延迟的 `BEGIN` 事务；
- 在该事务中读取版本门控的 Session 行、标量值以及选定的 entries/branch index；
- 从不升级为写入或声称可写权威；
- 在 `COMMIT`/`ROLLBACK` 之后关闭。

SQLite WAL 允许在读事务保持打开时后续 worker commits。Fork 看到每一次源 commit 完全在其 snapshot 边界之前或完全之后，从不混合。

### 1.3 同仓库 fork 顺序仍然不同 {#13-same-repository-fork-ordering-remains-distinct}

已经在同一仓库中打开的源使用其活动的 `SqliteStorage.snapshot()` 路径。该 snapshot 排在源 `commitQueue` 上，保留 WP06 的已接纳 commit 顺序接缝以及现有符合性用例。

不要用独立连接替换这条路径。相反，把活动 storage 查找绑定到精确物理身份加上 Session ID，这样另一个 container 的元数据不能意外选中它。

### 1.4 目的地所有权不重叠 {#14-destination-ownership-does-not-overlap}

`SessionRepo.create()` 和 `fork()` 继续返回一个打开的 Session。Server 可以临时拥有该新目的地，捕获其元数据，并在启动 worker 之前关闭它。这是有效的所有权转移，不是把 `SessionRepo` 重设计成仅记录 API 的理由。

## 2. 当前源码中的问题 {#2-problems-in-current-source}

### 2.1 SQLite 复制了宿主所有权 {#21-sqlite-duplicates-host-ownership}

当前源码包含：

- `writer_lease` schema 状态；
- claim、renew 和 release helpers；
- create/open/fork 中的 lease claims；
- `SqliteOpenSession` 中的空闲续约 timer 和 lease-loss 路径；
- `SqliteStorage` 中的 pre-commit 续约回调；
- 基于 lease 的删除检查。

这是第二套不完整的所有权系统。其 pre-commit 续约与随后的数据事务不是原子的，但正确修复是删除所有权机制，而不是事务局部 fencing。

### 2.2 非创建访问可以创建文件 {#22-non-creation-access-can-create-files}

数据库工厂只暴露 `open(path)`，它会创建缺失的 SQLite 文件。元数据打开、listing 探测、删除以及 fork-source 读取不得把已移除路径变成空数据库。

Fork-source 读取还会配置 `PRAGMA journal_mode = WAL`，这是面向写入的设置步骤，不得在只读连接上运行。

### 2.3 Delete 不预留其本地临界区 {#23-delete-does-not-reserve-its-local-critical-section}

`delete()` 检查 `pendingIds` 但不预留该 ID。同仓库的 create/open/fork 目的地可以在异步破坏性工作进行时进入。宿主生命周期拥有跨进程顺序；仓库仍必须序列化自己的本地操作。

### 2.4 物理身份、路径和 close 需要纠正 {#24-physical-identity-paths-and-close-need-correction}

- `openStorages` 只按 Session ID 键控，因此另一物理路径上的同一 ID 可能选中错误的活动源。
- `create()` 创建 `options.directory`，而不是显式 `databasePath` 的父目录。
- Per-session 文件名直接插入任意调用方 IDs；`/`、`\`、`..`、`%` 以及平台分隔符不得逃出 `directory`。
- `repo.close()` 使用 fail-fast 的 `Promise.all`，因此可能在每一个打开的 Session 都尝试排空并关闭之前返回。

确定性 list 排序、bind-variable 限制、branch-copy 成本、fork 标量过滤、prepared statements 以及 VACUUM 策略仍然分开。

## 3. 必需结果 {#3-required-result}

### 3.1 移除存储层 writer 所有权 {#31-remove-storage-layer-writer-ownership}

删除全部运行时 lease 行为：

- 删除 `src/sqlite/session/writer-lease.ts`；
- 从 WIP `001_initial.sql` 移除 `writer_lease`；
- 从 `deleteSessionRows()` 移除 lease 删除；
- 从 `SqliteSessionRepo` 移除 claim/renew/release 代码；
- 从 `SqliteStorage` 移除 `beforeCommit`；
- 从 `SqliteOpenSession` 移除续约/释放选项、timer 以及 `leaseError`；
- 移除特定于 lease 的测试，并用宿主权威和 live-fork 覆盖替换它们。

保留：

- Storage 的 `commitQueue`；
- 每次 commit 一次 `BEGIN IMMEDIATE` 事务；
- 事务内 `next_seq` 分配；
- entry/usage 唯一性以及 parent triggers；
- Session mutation 接纳和 close 排空；
- 进程局部重复打开拒绝。

Format 4 仍是 WIP。从新 schema 就地移除该表；包含未使用 `writer_lease` 表的旧文件仍可读，该表和陈旧行被永远忽略。WP07 之后的代码不删除它们，因为这样做不服务任何运行时行为。WP07 之前的二进制不能打开没有该表的新 WP07 之后数据库；这个 WIP 格式不要求向后兼容。不添加 migration、兼容路径或 storage-version bump。

### 3.2 添加显式数据库打开模式 {#32-add-explicit-database-open-modes}

用窄操作扩展 `SqliteDatabaseFactory`：

- `open(path)` — 有意创建或 create-if-missing；
- `openExisting(path)` — 文件不存在则失败的读写打开；
- `openReadOnly(path)` — 文件不存在则失败的只读打开。

Node adapter 对只读访问使用 `DatabaseSync(path, { readOnly: true })`。为 `openExisting` 实现并测试真正的不创建读写模式；不要依赖 `access()` 后再接一个能创建的 open。

拆分连接设置：

- 可写连接建立 WAL 模式和 `busy_timeout`；
- 只读连接只设置只读安全选项，例如 `busy_timeout`，并且从不尝试更改 journal mode。

对元数据打开、listing 探测、删除以及 fork-source 读取使用不创建模式。

### 3.3 保留两条 fork-source 路径 {#33-preserve-both-fork-source-paths}

**源在本仓库中打开：** 保留 `SqliteStorage.snapshot()`，并把它排在先前已接纳 commits 之后。把仅 ID 的活动 map 键替换为规范 `(containerPath, sessionId)` 身份，并对 publish、lookup 和 removal 使用同一 helper。

**源不在本仓库中打开：** 这包括已关闭的源，以及当前由另一进程中的 worker 拥有的源。通过 `openReadOnly` 打开精确源，然后在一次延迟读事务中捕获它。在该事务内校验 Session 行和 storage version。不要查询目的地预留、声称源所有权，或阻塞 worker 的后续 commits。

目的地在源捕获之后仍是正常的可写 create/fork 事务。在 shared-container 模式下，源 worker 和目的地事务可能使用同一文件；SQLite 序列化目的地写入，同时保留 Session 行隔离。

### 3.4 让删除在本地互斥 {#34-make-deletion-locally-exclusive}

宿主必须在调用 `repo.delete()` 之前关闭 Session worker。对 live Session 的直接跨进程删除不受支持。

在一个 `SqliteSessionRepo` 内，删除必须从进入到完成预留 Session ID，并在 `finally` 中释放它：

- 已经打开或已预留的 Session 拒绝删除；
- 删除运行期间，对该 ID 的 create/open/fork 目的地被拒绝；
- shared-container 删除在一个连接上的一次 `BEGIN IMMEDIATE` 事务中只移除目标 Session 的行；
- per-file 删除在不创建的 open/存在性检查之后移除数据库及其 WAL/SHM sidecar；
- 缺失的 Session 拒绝且不创建文件。

不要添加 lease 检查、tombstone、隔离重命名或陈旧删除者协议。跨进程移除顺序是 server 的责任。

### 3.5 把元数据绑定到物理身份并使路径安全 {#35-bind-metadata-to-physical-identity-and-make-paths-safe}

- 规范身份是 `(canonical container path, sessionId)`。
- 在 per-file 模式下，元数据必须标识其持久 ID 对应的仓库亲和编码路径。
- 在 shared-container 模式下，元数据必须标识配置的规范 container 和 Session ID。
- 外来或不匹配路径不得别名到本地活动源。在聚焦测试和 SQLite README 中钉死外来源元数据是被拒绝，还是只从其精确路径读取；不要按 ID 静默替换为本地 storage。
- 配置了 `databasePath` 时创建 `dirname(databasePath)`。
- 把任意显式 IDs 编码进安全的 per-session 文件名，而不改变持久 ID。该编码必须防止路径逃逸，并在 metadata/list/open/fork 中往返。
- 同一 shared container 中两个不同的 Session IDs 仍可独立寻址。

### 3.6 排空所有仓库拥有的 closes {#36-drain-all-repository-owned-closes}

`SqliteSessionRepo.close(context)` 必须：

1. 一次性封闭仓库接纳；
2. 对每一个当前打开的 Session 启动 close；
3. 等待每一次 close 结算；
4. 全部成功时 resolve；
5. 否则只在全部清理尝试之后 reject，返回那一个错误或包含全部失败的 `AggregateError`；
6. 在重复 close 时返回同一 promise。

这是 backend 局部资源清理。本包不要改变共享 `SessionRepo` 接口或 JSONL 生命周期。

## 4. 实现切片 {#4-implementation-slices}

### Slice A — 移除 writer leases {#slice-a--remove-writer-leases}

文件：

- 删除 `src/sqlite/session/writer-lease.ts`；
- `src/sqlite/migrations/001_initial.sql`；
- `src/sqlite/session/session-row.ts`；
- `src/sqlite/storage.ts`；
- `src/sqlite/session.ts`；
- `src/sqlite/repo.ts`；
- 聚焦 lease 的仓库测试。

任务：

1. 移除 schema/runtime lease 状态和 timer 行为。
2. 保留 commit 序列化、一次写入事务、mutation 排空，以及进程局部重复打开行为。
3. 证明普通 commits 现在使用一次写入事务，而不是续约加写入。

### Slice B — 不创建打开与删除预留 {#slice-b--no-create-opens-and-deletion-reservation}

文件：

- `src/index.ts`；
- `src/sqlite/types.ts`；
- `src/sqlite/repo.ts`；
- 聚焦 adapter/repository 测试。

任务：

1. 添加具有经测试不创建行为的 `openExisting` 和 `openReadOnly`。
2. 分离可写和只读连接配置。
3. 为完整临界区在本地预留删除。
4. 在一次事务中删除一个 shared-container Session；保留无关 Sessions。

### Slice C — 活动源只读 forks 与身份 {#slice-c--live-source-read-only-forks-and-identity}

文件：

- `src/sqlite/repo.ts`；
- repository/conformance 测试。

任务：

1. 按规范 container 加上 Session ID 键控活动 storage；保持同仓库队列顺序。
2. 对非打开/live-worker 源使用一次独立只读延迟事务。
3. 在 snapshot 内校验源元数据/版本。
4. 保留 shared-container 目的地行为。

### Slice D — 路径与 close 排空 {#slice-d--paths-and-close-draining}

文件：

- `src/sqlite/repo.ts`；
- 聚焦 repository/conformance 测试。

任务：

1. 创建实际自定义 container 父目录。
2. 安全编码任意 IDs。
3. 拒绝或精确处理外来元数据，而不做活动源别名。
4. 让仓库 close 全部结算且错误完整。

### Slice E — 文档 {#slice-e--documentation}

文件：

- `packages/agent/docs/harness.md`；
- `packages/agent/docs/post-wp05-roadmap.md`；
- `packages/agent/docs/values.md`；
- `packages/session-backends/sqlite-node/README.md`；
- changelog 仅在正常分支规则下。

记录宿主拥有的可写权威、两条 fork-source 路径、不创建打开、本地删除预留，以及没有存储层所有权。

## 5. 必需测试 {#5-required-tests}

使用真实独立的 `node:sqlite` 连接。仅测试包装可以暴露确定性事务边界；生产代码没有 sleeps 或竞态标志。

### Lease 移除 {#lease-removal}

- 新 schema 没有 `writer_lease` 表；
- create/open/fork/commit/close 不执行 lease 读取或写入，也不启动续约 timer；
- 同仓库重复可写打开仍通过进程局部预留拒绝；
- 普通 commit 仍是一次 `BEGIN IMMEDIATE` 事务。

### Live fork 源 {#live-fork-source}

对 per-file 和 shared-container 两种布局：

- 一个 server 仓库 fork 一个由代表其 worker 的独立仓库/连接保持打开的源；
- 源捕获使用不同的只读连接，并且不声称可写所有权；
- 在 snapshot 边界之前完成的源 commit 完整出现在 fork 中；
- 在读 snapshot 建立之后的 commit 可以在 reader 关闭之前完成，并且完整缺席于该 fork；
- 没有任何 fork 包含一条没有同一次 commit 的 Branch tip/value/stats 变更的 entry；
- 更晚的 fork 包含更晚的 commit；
- 同仓库已接纳 commit 的 fork 符合性保持不变。

### 删除 {#deletion}

- 打开/已预留 Session 在先 → 同仓库 delete 拒绝；
- delete 预留在先 → 同仓库对该 ID 的 create/open/fork 目的地拒绝；
- 共享删除只移除目标行；
- per-file 删除移除 database/WAL/SHM 文件；
- 缺失路径的 open/list/fork/delete 不创建空数据库；
- 测试陈述宿主前置条件：worker close 先于删除；不承诺跨进程绕过安全。

### 身份与路径 {#identity-and-paths}

- 两个物理路径上的同一 Session ID 不能交叉选中活动源 storage；
- 同一 shared container 中两个 Session IDs 保持独立；
- 其父目录不存在时 `databasePath` 成功；
- 包含 `../`、`/`、`\`、`%`、点和 Unicode 的显式 IDs 留在 `directory` 内，并保留元数据 ID；
- create/list/open/fork 返回的元数据命名实际 container。

### Close {#close}

- 一次 Session close 失败不阻止每一个其他 Session 的清理尝试；
- 多次失败在全部结算后报告；
- 重复仓库 close 返回同一 promise；
- 每一个成功关闭的 Session 释放其连接。

### 回归 {#regression}

- 现有 storage 和 repository 符合性在语义上保持不变；
- fork 目的地预留以及同仓库源顺序保持完好；
- fork snapshots 像以前一样精确排除 operation/pending/result/usage/application 状态；
- shared-container 的 create/list/open/fork/delete 仍受支持；
- 每一次写入事务仍使用 `BEGIN IMMEDIATE`；
- 不出现 migration、storage-version bump、兼容层或替换所有权原语。

## 6. 验证与评审 {#6-validation-and-review}

每一个代码切片之后：

```bash
npm run check
```

用仓库 Vitest 二进制从 `packages/session-backends/sqlite-node` 运行每一个被修改的聚焦测试。最终验证：

```bash
./test.sh
```

评审检查点：

1. Slice A 之后的 Fable：验证没有存储所有权机制残留，且 close 排空完好。
2. Slice C 之后的 Fable：验证同仓库顺序和 live-worker 只读重叠都成立。
3. 对源码、测试、文档和排除项的最终 Fable 评审。

委托评审使用 provider `anthropic` 和 model `claude-fable-5`。

## 7. 排除项 {#7-exclusions}

不要包含：

- 任何 storage lease、lock、fence、heartbeat、takeover、tombstone 或 quarantine；
- 仅记录的 `SessionRepo` 重设计或兼容 facade；
- server/router/worker-manager 重设计；把任何与 backend 无关的生命周期竞态单独记录；
- SQLite branch-segment 重设计或未压缩分叉优化；
- fork 标量过滤/索引；
- `getEntries` bind-limit 分块或通用 query-limit 规范化；
- statement caches 或 stats 聚合优化；
- catalog 重设计、异步数据库替换或 VACUUM 策略；
- search/FTS；
- R11 migration 机制或 storage-version bump；
- [mobile assistant-output 交接](../mobile-handoff/01-harness/05-assistant-output/message-update.md) 变更或 JSONL compaction；
- 仓库范围的 `SessionRepo.close()` 契约变更；
- 移除 shared-container 支持；
- 事务 DSL、调度器、通用锁管理器或兼容层。

如果实现需要被排除的项，停下来修订交接文档，而不是静默扩张。

## 8. 退出条件 {#8-exit-condition}

当下列条件满足时 WP07 完成：

- SQLite 不含活动的或 schema 定义的 writer lease，并且不实现替换所有权机制；
- 宿主所有权是文档中的单 writer 权威；
- 同仓库活动源 forks 保留其排队 commit 边界；
- live worker 拥有的源通过独立只读 snapshot fork，同时后续 WAL commits 继续；
- 删除预留其同仓库临界区，并假定 worker-first 的宿主移除；
- 非创建路径不能创建空数据库；
- 活动源身份包含物理 container 加上 Session ID；
- 显式 IDs 不能逃出目录，并且自定义数据库父目录被创建；
- 仓库 close 等待每一次清理尝试；
- shared-container 模式仍被完整覆盖；
- 聚焦测试、`npm run check` 和 `./test.sh` 通过；
- 最终 Fable 评审报告没有阻塞项。
