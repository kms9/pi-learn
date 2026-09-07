本文是 `post-wp05-roadmap.md` 的中文阅读版；命令、路径、API 名称保持英文。

# WP05 之后的路线图审计 {#post-wp05-roadmap-audit}

**审计基线：** `5507d76ee`（`dev`，2026-08-27）。

**状态：** 规划清单，不是行为契约。凡与当前产品边界一致之处，[`harness.md`](harness.zh.md) 仍是规范。下文列出的矛盾必须显式解决；本文不会悄悄选择其中一方。

## 范围与方法 {#scope-and-method}

本审计覆盖持久化 AgentHarness 及其直接耦合的 Session backend 与呈现路径：

- `packages/agent/src/harness`、`packages/agent/src/search` 及其测试/文档；
- `packages/session-backends/sqlite-node`；
- 当前 `packages/protocol`、`packages/client` 和 `packages/server` 呈现路径；
- `packages/coding-agent/src/experimental` 及其承载该路径的聚焦测试；
- `packages/telemetry`、`packages/ai` 和 `packages/agent` 中的 telemetry 管道。

清单对照了当前源码、测试、package README、完整 `harness.md`、已完成的 WP00–WP07 状态、可执行的 WP08 交接、显式 stub/TODO/skip，以及已交付的 package 边界。当当前源码和已完成的 WP05 契约已经取代历史交接时，不把历史交接当作 backlog。

## 执行结论 {#executive-result}

WP05 已完成到 M10。其剩余 assistant-output 工作由 [mobile assistant-output 交接](mobile-handoff/01-harness/05-assistant-output/message-update.zh.md) 及其编号前置条件拥有。当前 Harness 执行图没有未完成的 runtime 路径：`watchSession()` 是唯一的 `SliceNotImplemented` Harness 方法。

这**并不**意味着周围的持久化系统已经完成。剩余审计发现是：

1. 规范的 JSONL snapshot-compaction 行为尚无实现；
2. 一个所需的 Harness 方法 stub（`watchSession`）；
3. 故意删除原始 `RemoteSession`，与之后规范的 WP06/`harness.md` 文本冲突；
4. 一份公开 search 类型骨架，与更新的 search 设计冲突，且没有实现；
5. 完整 telemetry 词汇中，唯一的生产 span 是 tool-hook span；
6. 更小的 repository、client-watch、query-bound、文档和端到端测试缺口。

WP07 在审计基线之后完成了 SQLite host 所有权对齐和 live-source fork 支持；其历史交接是 [`work-packages/07-sqlite-host-ownership-live-forks.md`](work-packages/07-sqlite-host-ownership-live-forks.zh.md)。WP08 现在拥有独立的具名 branch、tree-state 和有界内存 fork 再设计；其可执行交接是 [`work-packages/08-named-branch-streaming-forks.md`](work-packages/08-named-branch-streaming-forks.zh.md)。

## 所需缺失功能与契约矛盾 {#required-missing-functionality-and-contract-contradictions}

### R12 — Session 范围的 Harness watch {#r12--session-wide-harness-watch}

**证据**

- `AgentHarness.watchSession(context)` 在 `src/harness/agent-harness.ts` 中是公开的。
- `Harness.watchSession()` 在 `src/harness/runtime/harness.ts` 中抛出 `SliceNotImplemented("watchSession")`。
- `SessionSnapshot` 当前只包含 `{ lanes: LaneInfo[]; faulted: boolean }`。
- Lane watch、事件缓冲、delivery-tail barrier 和 `resnapshot()` 已存在于 `src/harness/events.ts` 和 `src/harness/runtime/lane.ts`。

**剩余边界**

为动态 lane 清单和 fault 状态定义一个连贯的 capture 与 fold。决定有意保持很小的 `SessionSnapshot` 是继续保持很小，还是获得 session metadata/stats/全局配置。然后实现 snapshot-before-events、lane 创建、resnapshot、listener 重入、close/fault 行为，以及若承诺仅事件复制则实现 session reducer。

**依赖**

独立于 mobile assistant-output 交接和 SQLite 内部。它应先于建立在其上的带版本 Transcript 服务或远程 session 范围观察。

### JSONL snapshot compaction {#jsonl-snapshot-compaction}

**证据**

`harness.md` §1.7 规范性地规定了 temp-file-and-rename snapshot compaction、保留的 sequence 高水位/list cursor、打开时的阈值检查，以及终端/结果删除之后的回收。`JsonlStorage` 实现了原子创建、torn-tail 修复、legacy-v3 rewrite、append 和 fork snapshot，但不存在当前状态 snapshot rewrite 或死字节记账。

**后果**

被取代的 `pi.op.state`、已删除的 pending payload、已删除的 tool checkpoint 以及已删除的 assistant-frame list 会无限期地作为物理字节保留。通用 compaction 与 [mobile assistant-output 交接](mobile-handoff/01-harness/05-assistant-output/message-update.zh.md) 是互补的。Compaction 事后回收已死亡的 session 范围写入历史；该交接把 pending assistant/tool 输出移入 ephemeral scope，使其永远不会成为 main-log 历史，并用 Chord op batch 替换全量/逐 frame 复制。

**依赖**

assistant-output 交接不依赖 J1：scoped storage 是 pending 输出的预期生命周期机制，而 J1 仍是被取代的 session 范围状态的回收机制。分别度量二者，以免效果被混为一谈。

### Remote Session 契约矛盾 — 需要决策 {#remote-session-contract-contradiction--decision-required}

**当前产品边界**

提交 `f8a6e670d` 故意删除了 `RemoteSession`、其原始 Session RPC 协议以及 server mutation-scope manager，代之以 attachment-fenced、经路由的语义服务。当前 protocol/server README 明确声明真实 `Session` 和 `AgentHarness` 对象仍是进程本地的。已交付路径支持 Session 发现/创建/附着、main-lane prompt/watch，以及允许列表内的 plugin-service 调用；它不通过 RPC 暴露 `Session`、`SessionMutation`、values/lists、branches 或 storage。

**冲突契约**

在该删除之后写的 WP06 要求「当前无 key 的 RemoteSession mutation transport」，在所需测试和停止条件中包含远程 begin/read/commit/publication/end，并禁止移除它。`harness.md` §§2.8 和 9.1 同样声明本地与远程实现保留该生命周期。在审计基线处，不存在这样的实现、协议 schema、client facade、server 持有的 scope、worker adapter 或一致性测试。

**所需决策**

在安排实现之前选择其一：

1. **进程本地 Session 仍是有意设计：** 从规范的当前状态文档中移除虚假的 RemoteSession 要求，同时保留语义服务 RPC；或
2. **RemoteSession 是必需的：** 委托一个专门 package，覆盖 mutation begin/read/commit/end、断开/超时清理、publication-before-end、values/lists/branches/entries/stats、协议校验、client/server/worker adapter，以及远程一致性。

不要把当前 lane-watch 兼容 RPC 或 plugin-service RPC 算作 RemoteSession。不要原样恢复被删除的 507 行 facade：它早于无 key 的 Session/Branch 契约，并大量依赖非类型化解码。

### Telemetry 契约超出实现 {#telemetry-contract-exceeds-implementation}

**证据**

`src/harness/telemetry.ts` 和生成的 `docs/telemetry-schema.md` 声明了 `pi.ai.request`、operation、checkpoint、turn、step、tool、hook、sleep、event-handler 和 session-write span。生产源码只启动 `pi.harness.hook`，且仅针对已注册的 `before_tool`/`after_tool` handler。AI 选项传播 `telemetryContext`，但没有任何 provider 路径启动 `pi.ai.request`。Server 请求入口有取消，但没有 trace carrier 或 client/server RPC span。`TODO_CONTEXT` 仍留在 transport/worker 生命周期和事件投递边界。

**剩余边界**

把它当作独立 package：

1. 本地 Harness/Session/AI 仪器与 runtime 测试；
2. RPC trace-carrier/client/server 传播；
3. 可选的、由应用选择的 exporter/adapter。

首先对账每一个已声明 span 是否仍被需要。若保留，就实现它；若不需要，移除不受支持的公开 schema 表面并修正 `harness.md`。不要把 telemetry 与已经拥有独立 request-ID 信号的 Context/RPC 取消混在一起。

### S3 — Search {#s3--search}

**证据**

`src/search/index.ts` 导出一个公开 `SessionSearchService` 骨架，带 `sync()`、`notify()` 和返回数组的 `searchEntries()`。`harness.md` §2.8 则规定一个独立服务、分开的 catch-up/notify 工具、感知 generation 的 cursor，以及可选的 `AsyncIterable` entry search。没有 factory、sync 工具、cursor store、投影或源 SQLite FTS 实现。在审计基线处，SQLite README 宣传了不存在的 `createSqliteSessionSearch()` 行为；本审计修正了该 README，而不是把缺席的 API 当作已实现。

**剩余边界**

在实现之前，替换或对账草案公开接口，并决定 metadata 过滤（`cwd`）、候选限制或被索引的 metadata。在有序 `limit` 之后做后过滤是不健全的。然后实现独立 catch-up 和单独的 SQLite FTS5 投影；不要添加 repository search 方法。

### R11 — Schema 迁移，按激活门控 {#r11--schema-migrations-activation-gated}

当前不需要 format-4 迁移。Memory 只支持当前版本；JSONL 和 SQLite 拒绝不受支持的存储版本；SQLite 只运行幂等的 `001_initial.sql`。一旦 format 4 稳定之后出现第一次不兼容的持久化存储版本/地址/状态变更，R11 立即成为必需。它不是 mobile assistant-output 交接或当前 WIP format 替换的前置工作。

激活时，它必须在独占所有权下提供有序的打开时事务迁移、版本特定的 JSONL 解码外加迁移后 compaction，以及对每一个可达的打开 operation 叶子和存活 value/list 的全量映射。

## 正确性与数据安全债务 {#correctness-and-data-safety-debt}

### SQLite host 所有权与 live-source fork — 已由 WP07 完成 {#sqlite-host-ownership-and-live-source-forks--completed-by-wp07}

权威产品规则在 `plugins.md`：恰好一个由 host 指派的进程拥有可写 Session 权威；通常是 Session worker，而 server 可以在关闭并移交之前临时拥有新创建或 fork 出的目的地。存储 backend 不实现 writer 所有权。Server 在破坏性 repository 管理之前关闭 worker。

SQLite 现在遵循该规则：writer-lease schema/模块、claim、续约定时器、lease-loss 路径和 pre-commit callback 都已消失，没有替换的 lock 或所有权原语。Create/open/fork/delete 保留 repository 本地 ID 预留。Metadata 打开和删除使用真正的 no-create 读写模式；列举和外部 fork 源使用 no-create 只读连接。

同一 repository 的 fork 保留源 `commitQueue` 排序接缝。一个在别处拥有的源（包括存活 worker）通过一次独立的只读 deferred WAL 事务，从其精确规范容器读取。聚焦的 per-file 和 shared-container 测试在 reader 建立 snapshot 之后、关闭之前提交一次完整的更晚源事务：第一次 fork 完全排除该事务，更晚的 fork 完全包含它。

WP07 还完成了规范 `(containerPath, sessionId)` 活动身份、安全的显式 ID 文件名、自定义 `databasePath` 父目录创建、Session 范围的共享删除、WAL/SHM 清理，以及 all-settled 的 SQLite repository close。可写 open/delete 拒绝外来 metadata；外来 fork 源只从其精确路径读取。相等 `createdAt` 的 list 排序仍没有确定性 tie-break，仍是后续保持行为的清理。

### Repository close 所有权未指定 {#repository-close-ownership-is-unspecified}

`JsonlSessionRepo.close()` 包含唯一仍活动的 Agent 源 TODO，并且不关闭打开的 Session handle。Memory 仍使用快速失败的 `Promise.all`；SQLite 现在对当前打开的 handle 执行 backend 本地 all-settled 清理，但已经受理的 create/open/fork 仍可能在 repository close 捕获该集合之后注册 handle。`SessionRepo` 本身未声明 `close()` 方法，共享一致性也不定义 repository-to-handle 所有权或已受理 repository 操作的排空。在一个 repository 生命周期 package 中解决所有权和共同清理；在未决定共同契约之前，不要再给单个 backend 打补丁。

### 断开后的 Client watch 陈旧 {#client-watch-staleness-after-disconnect}

`Client` 在断开时清除其活动 watch-listener map，但现有 `LaneWatch` 对象保留本地 `ready`/`started` 状态和旧 watch ID。重连/重新附着之后，它们可能调用 `start()` 或 `resnapshot()` 并在远端失败，而不是确定性地作为陈旧对象拒绝，这与 `packages/client/README.md` 相反。服务订阅对象有兄弟问题：其 listener 被清除，存活对象变成静默死亡。用 connection/attachment incarnation fencing 和聚焦重连测试同时修复二者。这独立于 R12：当前 client 方法是兼容的 main-lane watch。

### Query 边界与 SQLite bind 限制 {#query-bounds-and-sqlite-bind-limits}

- SQLite `getEntries(ids)` 为每个请求的 ID 发出一个占位符，可能超过引擎的变量限制。
- Entry、usage 和 branch 限制使用临时的 `Math.max(0, limit)` 行为。Memory 和 SQLite 在 `NaN`、无穷、分数和极值上分叉；与 list 读取不同，没有共享的规范化契约。

在 agent 一致性中定义跨 backend 的 query-limit 语义，然后分块 SQLite ID 查找。这是存储契约加固 package，不是 WP07 的一部分。

### Harness 契约与一致性收口 {#harness-contract-and-conformance-closure}

- 公开 `OperationStatus` 包含 `"running"`，但 lane 检查、snapshot 和 `reduceLaneSnapshot` 当前只产生 `"open"` 或 `"aborting"`。定义并实现其生产者，或移除该死变体。
- 重写前的 abort 契约在 resolve 取消 promise 并向存活 gate 发信号之前绑定/发布 `operation_abort`。当前 `Lane.command()` 在构造并绑定事件 batch 之前物化结果——resolve/发信号——尽管它仍在释放 Session mutation line 之前绑定接收者。决定是改变实现，还是保留/记录当前无交错顺序；加入显式顺序测试。
- 生产 gate-close 契约只允许 `HarnessClosed | HarnessFault`，但私有源原语接受任意 `Error`，隔离测试使用该更宽类型。收窄源声明和 fixture，或显式保留该私有放宽。
- `harness.md` 第 9 部分是所需一致性矩阵。现有聚焦测试广泛覆盖该图，包括全部 13 个叶子上的取消对账，但没有经过审计的一一对应证明：每一个 close/reopen 叶子情况和每一行竞态都有两种确定性顺序。审计该矩阵，只补缺失用例，而不是声称一揽子完成。

把该 package 与 telemetry、RemoteSession 和 mobile assistant-output 交接分开；它是本地契约/测试收口。

### 被禁用的真实 worker 持久化回归 {#disabled-real-worker-persistence-regression}

`packages/coding-agent/test/experimental-remote-runtime.test.ts` 仍跳过 “completes and persists a prompt through the worker-owned Harness”，附带过时说明 “Re-enable with runtime no-tool execution。” 无 tool 执行现在已经存在。重新启用，或用确定性 faux-provider 的真实 worker 持久化测试替换它；不要使用真实付费 provider。

## 性能债务 {#performance-debt}

### Mobile assistant-output 交接 — 持久化与复制放大 {#mobile-assistant-output-handoff--durable-and-replication-amplification}

仓库外用户提供的激励性 mini Session 是 303,920 字节，跨越 569 个物理行。这些外部测量是证据，不是可复现的已入库 fixture：

- 477 次 assistant-frame append，合计约 118,418 序列化写入字节；
- 12 次 frame-list 删除；提到 frame 命名空间的物理行合计 148,214 字节；
- 约 51,568 字节被取代的 `pi.op.state` 写入，以及 26,192 字节的一次结构性准备，说明为何通用 JSONL compaction 与 frame 特定有界是不同的。

权威设计是 [mobile assistant-output 交接](mobile-handoff/01-harness/05-assistant-output/message-update.zh.md)，遵循 [`mobile-handoff/README.md`](mobile-handoff/README.zh.md) 中编号的 `01-harness` 前置条件。Chord delta tracking 已落地；scoped storage、tool-output 集成和 assistant-output 集成尚未落地。

实现必须加入确定性 repository fixture 和测量脚本，复现或替换这些数字，然后度量 Memory 逻辑元素、SQLite 行/页/WAL、JSONL 峰值 sidecar/main-log 字节，以及 reopen/replay 时间。该交接必须保留未知结果恢复、invocation fencing、非阻塞 provider streaming 和 settlement 退役，同时消除逐 frame 持久化写入和二次的 `message_update` 复制。数值预算属于其实现交接/测试，不属于一份竞争的独立设计。

### SQLite branch 分叉 {#sqlite-branch-divergence}

`createDivergentBranchForEntry()` 复制最新 compaction 之后的每一行；没有 compaction 时复制从 root 到 parent。因此，从很长且未 compaction 的 transcript 第一次分叉是 O(history) 写入。这暴露了 `harness.md` §2.6 的内部矛盾：其开头的有界前缀承诺与它自己的基于 compaction 的复制算法冲突，而实现遵循后者。同时改变规范和段表示，使分叉可以在 parent 边界引用一个覆盖段。保留 shared-container 支持，并加入大型未 compaction 分叉外加链健全性测试/基准。

### Fork 契约与物化 — WP08 可执行 {#fork-contract-and-materialization--wp08-actionable}

所有当前 backend 都物化源大小的 fork snapshot。Branch scope 默认 `main`，没有具名 Branch 祖先校验；tree scope 省略应用 values/lists；JSONL 关闭源的 fork replay 可能修复其源。WP08 用所需的具名 branch 或 tree scope、一个封闭的内置状态策略、tree fork 的完整当前应用状态，以及 backend 特定的有界内存复制过程替换该契约。它保留 WP07 的 host 所有权、物理身份、同一 repository 排序，以及独立的 live-source WAL 边界。

### SQLite catalog、statement、stats 与回收 {#sqlite-catalog-statements-stats-and-reclamation}

- 默认每个 session 的 `list()` 同步地串行打开/配置每一个 SQLite 文件，并静默跳过失败。共享容器或外部 catalog 是可扩展部署选择；有界异步调度并不能让 `DatabaseSync` 变成非阻塞。
- 大多数热查询每次调用都 prepare 一条新 statement。度量之后再狭窄地缓存所拥有的 statement。
- 每一行 usage 都解析并重写完整的聚合 JSON usage payload。
- Shared-container 行删除不回收页。单独定义维护/VACUUM 策略；永远不要随便把 `VACUUM` 加到普通删除中。

这些是可度量的优化/运维 package，不是正确性修复。

### Pending-payload 放大与 mutation-line 并行 {#pending-payload-amplification-and-mutation-line-parallelism}

排队 payload 故意写入 `pendingEntry → immutable entry`；在改变它之前度量病态 payload。带 key 的 Session mutation line 仍是可选的，需要 profiling 外加一次新的可变所有权审计。二者都不是当前正确性工作。

## 保持行为的清理与文档修复 {#behavior-preserving-cleanup-and-documentation-repair}

本审计已完成：

- 重写了 SQLite README 中不存在的 `SqliteSessionRepository`/search API、错误的 `await using` 和 `appendMessage` 示例、FTS trigger/rebuild 声明，以及「一个共享连接」声明；
- 对账了 `harness.md` 的默认单文件 SQLite 措辞与受支持的可选共享容器；
- 对账了 `harness.md` 第 8 部分与本审计，并修正了 `telemetry.md` 中过时的 drive 所有权/RPC 取消状态；
- 修正了 coding-agent settings 文档：安装 telemetry 配置也控制所选 provider 的归属 header。

剩余清理：

- **Harness 拥有的 DTO 边界：** 持久化 Harness 仍从 `src/types.ts` 导入遗留 agent-loop DTO：`AgentMessage`、`AgentToolResult`、`AgentToolCall`、`AgentTool`、`QueueMode` 和 `ThinkingLevel`。稍后一次性切到独立的 `HarnessMessage`、`CustomHarnessMessages`、`HarnessToolResult`、`HarnessToolCall`、`HarnessQueueMode` 和 `HarnessThinkingLevel` 定义；把 `AgentHarnessTool` 保留为可执行 Harness 配置类型。一起更新 Harness 内部、根导出、declaration-merging 测试、文档和实验性 coding-agent 消费者。不要把新的 message/tool DTO 别名回遗留类型，因为那会保留这项工作本要移除的耦合。
- 保留 shared-container 支持；不要顺便移除它。
- 移除或使用未使用的 `insertEntryRow()` 和 `insertUsageLedgerRow()`。
- 只在正确性测试钉住两条路径之后，再合并重复的 SQLite branch payload/structure 扫描管道。
- 在随意改 schema 之前，决定未使用的 `sessions.metadata` 和未度量的 index 是否有未来所有者；不要随便改 schema。
- 只有在保留 telemetry 表面时，才合并 `startAiSpan()`/`startHarnessSpan()` 实现。
- 在历史持久化文档仍被读作实现队列之处，将其标记为已交付。WP00–WP07、`runtime-simplification.md`、`values.md` 的旧消费者延期，以及外部终结设计，都不是活动 runtime backlog。

## 可选或延期的产品能力 {#optional-or-deferred-product-capabilities}

这些不是持久化 Harness 的阻塞项：

- 在其 API 决策之后的独立 S3 search；
- Accounts 移除和带版本 Transcript 生产；
- 实验性本地 server 的已认证 workspace/client 授权；
- 私有返回引用、服务流控、多 pane 呈现、plugin kernel/reload 完成，以及 version-skew 协商；
- 管理性精确 rewrite 工具；
- 分区 Postgres backend/retention 策略；
- 通用远程 Harness/对象能力；
- 在具体 snapshot 压力证明其合理性之前的 DeltaState 或 delta 复制；
- 生产 telemetry exporter；
- 在不兼容的稳定 format 变更激活 R11 之前的 schema 迁移。

## 建议依赖顺序 {#recommended-dependency-order}

顺序首先按数据安全，然后按依赖。独立轨道只有在不编辑同一契约时才可并行推进。

1. **Harness 契约/一致性收口。** 解决 `OperationStatus.running`、abort 信号/事件绑定顺序、gate-close 类型，以及第 9 部分覆盖矩阵。
2. **Remote Session 决策（仅决策）。** 尽早解决虚假规范边界。若进程本地胜出，修复文档。若原始 RemoteSession 胜出，稍后创建专门的 protocol/client/server/worker package；不要把它折进 telemetry 或 R12。
3. **Client watch/订阅陈旧** 和 **repository 生命周期契约。** 小型独立正确性 package；在扩展 server/worker 生命周期语义之前完成它们。生命周期 package 还必须处理 Memory 的快速失败 repository close。
4. **[Mobile Harness 交接](mobile-handoff/README.zh.md)。** 遵循其编号前置条件，经过 scoped storage、tool output 和 assistant output；保留所有恢复边界，并落地确定性放大测量。
5. **JSONL snapshot compaction。** 实现已经规范的物理回收路径，以及剩余 session 范围历史的度量。
6. **R12 session 范围 watch。** 在构建带版本 Transcript/session 范围远程观察之前，完成唯一的 Harness 方法 stub。
7. **Telemetry（若保留）：** 对账 schema，然后本地仪器，然后 RPC 传播，然后可选 exporter。RPC 传播跟随 Remote Session/产品边界决策。
8. **WP08 — 具名 branch 与流式 fork。** 实现可执行交接，不重开 WP07 所有权或生命周期决策。
9. **SQLite branch/query 性能加固。** 与已完成的 WP07 所有权对齐和 WP08 fork 语义分开；需要基准。
10. **S3 search。** 解决其 API/filter/cursor 决策，然后实现 catch-up 和独立 FTS 投影。
11. **R11 迁移。** 恰好在第一次不兼容的稳定持久化 schema 变更之前激活，不要更早。

## 路线图准确性的停止条件 {#stop-conditions-for-roadmap-accuracy}

当下列任一事实变化时，必须更新本清单：

- `watchSession` 不再是唯一的 Harness `SliceNotImplemented` 方法；
- 原始 RemoteSession 被重新委托，或从规范契约中移除；
- JSONL snapshot compaction 落地；
- telemetry schema 被实现或移除；
- S3 的公开 API 被对账；
- 一次持久化 format 变更激活 R11；
- WP08 落地或其 fork 契约改变；
- host-authority 契约改变。
