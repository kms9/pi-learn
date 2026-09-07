本文是 `01-bound-values-lists.md` 的中文阅读版；命令、路径、API 名称保持英文。

# WP01 — 绑定值与列表 {#wp01--bound-values-and-lists}

## 状态 {#status}

已完成。`harness.md` 具有规范性。[`values.md`](../values.md) 提供详细的 address、backend 以及符合性设计。

## 目标 {#goal}

用绑定的 `Value<T>` 和 `ValueList<T>` 地址，替换保留下来的 register/custom-state 存储表面，覆盖 Session、Memory、JSONL、SQLite、instrumentation、测试以及公开的应用访问。在 runtime 执行消费者之前停止。

## 本包已固定的决策 {#decisions-fixed-for-this-package}

1. **Core 与 application 命名空间。** 每一个 core 地址都使用文档中精确的 `pi.*` 命名空间。应用通过相同的公开 `value()` / `list()` 构造器使用自己的非保留命名空间。`fact.custom` 及其 API 被删除，而不是重命名为内置 custom 命名空间。
2. **Forks。** 通用 fork 只复制明确处理过的 core 地址：Branch tip/lane 配置加上全新的 lane 状态、session 名称，以及目标被复制的 labels。它们不复制任何 `pi.op.*`、`pi.pending.*`、list、ledger 或任意 application 地址。后续的应用功能在依赖被复制的应用状态之前，必须先添加针对该地址的 fork 策略。
3. **受信任的 kind 纪律。** 把同一个 `(namespace, key)` 既当 value 又当 list 使用，是受信任编程缺陷。Backend 不添加跨 kind 碰撞检查、trigger、registry 或 catalog。
4. **Operation 名称。** 为不可变接纳元数据保留源码中的 `OperationMeta`，为进程局部的 `{ meta: OperationMeta, state: OperationState }` 投影保留 `Operation`。`operationMeta(id)` 绑定 `Value<OperationMeta>`；复合体从不作为单个 value 持久化。
5. **查询排序与边界。** `scanValues()` 返回按 key 升序的结果。`readList()` 只限制一个查询页，从不限制列表总长度或字节数：拒绝非正或非安全的 limit，默认 1,000，并把更大的值钳制到 10,000。
6. **没有 WIP 兼容。** 就地替换未完成的 format-4 存储 schema。JSONL 仍为 format 4/storage version 1，但只接受新的 value/list 记录。SQLite 保持 `SQLITE_STORAGE_VERSION = 1`，就地编辑 `001_initial.sql`，把 `registers` 重命名为 `scalar_values`，并添加 `list_values`。WP01 之前的 format-4 JSONL 和 SQLite 文件不受支持。不添加 migration runner 或遗留 decoder。
7. **仅通用基础设施。** WP01 定义每一个内置 value/list 构造器，包括未来的 assistant/tool 地址，但不实现它们的 runtime 消费者。

## 公开与存储契约 {#public-and-storage-contract}

添加 `packages/agent/src/harness/session/values.ts`，包含：

- 不变的 `Value<T>` 和 `ValueList<T>` 地址类型；
- 通用的 `value<T>(namespace, key?)` 和 `list<T>(namespace, key?)` 构造器；
- 仅做 namespace/key 校验：非空 namespace，且没有 `\u0000` 分量；
- `StoredValue<T>`、`ListElement<T>`、`ListCursor` 以及 `ListReadOptions`；
- 使用 `NoInfer<T>` 的类型化 `setValue`、`deleteValue`、`appendList` 以及 `deleteList` 写辅助函数；
- `values.md` 中每一个精确的内置构造器以及五个 scan-prefix 构造器。

在各处替换旧 API：

```ts
getRegister(namespace, key)       -> getValue(address)
listRegisters(namespace, prefix) -> scanValues(prefixAddress)
register set/delete writes        -> typed value helpers
```

存储以及历史的 Session reader、mutator、tree-view 和 repository 表面暴露相同的绑定地址读取：

```ts
getValue<T>(address: Value<T>): Promise<StoredValue<T> | undefined>;
scanValues<T>(prefix: Value<T>): Promise<StoredValue<T>[]>;
readList<T>(address: ValueList<T>, options?: ListReadOptions): Promise<ListElement<T>[]>;
```

历史的 tree-view 和 Session 表面另外暴露一次 commit 的直接写入：

```ts
setValue<T>(address: Value<T>, next: NoInfer<T>): Promise<void>;
deleteValue<T>(address: Value<T>): Promise<void>;
appendList<T>(address: ValueList<T>, element: NoInfer<T>): Promise<void>;
deleteList<T>(address: ValueList<T>): Promise<void>;
```

`SessionMutator` 保留一个显式的 `commit(writes)`，不获得直接 committing 方法。每个 write 数组把辅助函数构造的 value/list 写入与 entries 和 usage 组合在一起。

把 `getName` / `setName` 和 `getLabel` / `setLabel` 保留为 `sessionName` 和 `entryLabel(id)` 上的包装。删除 `getCustomFact` / `setCustomFact`。把公开的被动元数据事件从 `fact_update` 重命名为 `harness.md` 已经规定的 `value_update` 形态；它只覆盖 session-name 和 entry-label 包装，不覆盖任意应用写入。

## 文件 {#files}

### 添加 {#add}

- `packages/agent/src/harness/session/values.ts`
- `packages/agent/test/harness/values.test.ts`
- `packages/session-backends/sqlite-node/src/sqlite/session/values.ts`

### 删除或重命名 {#delete-or-rename}

- 把标量行为移到 `values.ts` 之后，删除 `packages/session-backends/sqlite-node/src/sqlite/session/registers.ts`；
- 从 `packages/agent/src/harness/session/types.ts` 移除所有 register/global-map/custom-fact 声明。

### Agent 源码 {#agent-source}

- `packages/agent/src/harness/agent-harness.ts`
- `packages/agent/src/harness/session/types.ts`
- `packages/agent/src/harness/session/commit.ts`
- `packages/agent/src/harness/session/storage-state.ts`
- `packages/agent/src/harness/session/memory.ts`
- `packages/agent/src/harness/session/session.ts`
- `packages/agent/src/harness/session/fork.ts`
- `packages/agent/src/harness/session/index.ts`
- `packages/agent/src/harness/session/jsonl/storage.ts`
- `packages/agent/src/harness/session/jsonl/repo.ts`
- `packages/agent/src/harness/session/testing/storage-decorator.ts`
- `packages/agent/src/harness/session/testing/instrumented-storage.ts`
- `packages/agent/src/harness/session/testing/types.ts`
- `packages/agent/src/harness/session/testing/conformance/storage.ts`
- `packages/agent/src/harness/session/testing/conformance/session-repo.ts`
- `packages/agent/src/harness/session/testing/benchmark/storage.ts`
- `packages/agent/src/harness/session/testing/benchmark/session-repo.ts`
- `packages/agent/src/harness/session/testing/index.ts`
- `packages/agent/src/harness/runtime2/restore.ts`
- `packages/agent/src/harness/runtime2/harness.ts`
- `packages/agent/src/harness/runtime2/lane.ts`
- `packages/agent/src/harness/telemetry.ts`
- `packages/agent/src/index.ts` 和 `packages/agent/src/node.ts` 仅在需要验证新的公开导出时修改；不要添加第二条导出路径。

### Agent 测试与生成文档 {#agent-tests-and-generated-documentation}

- `packages/agent/test/harness/memory-storage.test.ts`
- `packages/agent/test/harness/memory-conformance.test.ts`
- `packages/agent/test/harness/memory-session-repo.test.ts`
- `packages/agent/test/harness/jsonl-storage.test.ts`
- `packages/agent/test/harness/jsonl-storage-conformance.test.ts`
- `packages/agent/test/harness/jsonl-session-repo.test.ts`
- `packages/agent/test/harness/jsonl-session-repo-conformance.test.ts`
- `packages/agent/test/harness/storage-backed-session.test.ts`
- `packages/agent/test/harness/session-tree.test.ts`
- `packages/agent/test/harness/session-create-lane.test.ts`
- `packages/agent/test/harness/instrumented-storage.test.ts`
- `packages/agent/test/harness/types.test.ts`
- `packages/agent/test/harness/telemetry.test.ts`
- `packages/agent/test/harness/runtime2/harness.test.ts`
- `packages/agent/test/harness/runtime2/lane.test.ts`
- `packages/agent/test/harness/runtime2/restore.test.ts`
- 重新生成的 `packages/agent/docs/telemetry-schema.md`

### SQLite backend {#sqlite-backend}

- `packages/session-backends/sqlite-node/src/sqlite/migrations/001_initial.sql`
- `packages/session-backends/sqlite-node/src/sqlite/repo.ts`
- `packages/session-backends/sqlite-node/src/sqlite/session.ts`
- `packages/session-backends/sqlite-node/src/sqlite/storage.ts`
- 如重命名模块需要，则改 `packages/session-backends/sqlite-node/src/sqlite/index.ts`
- `packages/session-backends/sqlite-node/test/storage.test.ts`
- `packages/session-backends/sqlite-node/test/storage-conformance.test.ts`
- `packages/session-backends/sqlite-node/test/repo.test.ts`
- `packages/session-backends/sqlite-node/test/adapter.test.ts`
- `packages/session-backends/sqlite-node/test/sql.test.ts`

### Coding-agent 消费者 {#coding-agent-consumer}

- `packages/coding-agent/test/experimental-session-support.ts`
- 验证 `packages/coding-agent/test/experimental-remote-runtime.test.ts`
- 验证 `packages/coding-agent/test/experimental-server-replacement.test.ts`

如果最终的旧 API grep 识别出另一处保留下来的源码/测试调用点，它属于 WP01；不要为了避免碰它而添加兼容垫片。

## 工作顺序 {#work-in-order}

1. **加入地址词汇。** 实现 `values.ts`，通过现有的 session/root 路径导出，并加入聚焦的编译期/运行期地址测试。在迁移调用方之前，包含精确的内置 namespace/key/kind 测试以及 prefix-constructor 测试。
2. **一次性切开共享 API。** 在 `types.ts`/`commit.ts` 中替换 register 类型和写入；把 `StorageState` 拆成当前标量值与存活的 list 元素；实现 Memory 的读/写、有序 prefix 扫描、分页 list 读取、事务校验/应用、snapshots 以及直接 Session 方法。移除 custom-fact API，并迁移 name/label 包装。
3. **迁移 JSONL 以及通用 fork/snapshot 代码。** 只编码 `kind:"value"` 和 `kind:"list"`；回放 set/delete/append/delete；保留事务行的 torn-tail 原子性；把存活的 list 元素连同原始 `seq` 按全局序列顺序合并序列化；保留序列高水位。这只是扩展现有 snapshot 序列化——不要添加新的 compaction 触发或 precise-rewrite 功能。Fork 复制决策第 2 项中固定的 core 集合，像今天一样在被复制的 entries 之后为目的地标量值重新编号序列，并且不复制 lists。
4. **迁移 instrumentation、符合性与基准。** Storage decorator 暴露全部三种读取；instrumented storage 按精确顺序记录被擦除的 value/list 写入，且不含内容 telemetry。在 backend 特定断言之前扩展共享符合性。
5. **迁移 runtime2 shell 调用点。** 用内置构造器/辅助函数替换 lane/harness 的原始写入。`restore.ts` 使用 `scanValues(branchTipInventoryPrefix())` 加上精确的 `getValue` 查找，并且不调用 `readList()`。不要添加接纳、drive、hydration 或 cleanup 行为。
6. **替换 SQLite WIP schema 与 adapter。** 就地编辑 `001_initial.sql`，在 `session/values.ts` 中实现标量操作以及带索引的 list append/delete/paging，把每一次写入都留在现有的 `BEGIN IMMEDIATE` writer-lease 事务内，更新两条 fork snapshot 路径，并保留当前 `dev` 上的全部 entry/usage/branch/lease 行为。
7. **迁移公开事件、测试以及 coding-agent helper。** 移除旧的类型断言和原始命名空间。把 `fact_update` 改为 `value_update`。两个 remote prompt 测试继续因现有 WP00 原因被 skip；WP01 不得改变 runtime 执行。
8. **更新 telemetry 与文档。** 把 `pi.session.write` 的 item kinds 从 `register` 改为 `value` 和 `list`，重新生成 `telemetry-schema.md`，运行旧 API 扫荡，并记录任何因 branch 策略而推迟的 changelog 要求。除非它成为 pull-request 分支或用户要求，否则不要在 `gramps` 上编辑 changelog。

## Backend 要求 {#backend-requirements}

### Memory {#memory}

- 在变更 entries、values、lists、usage 或 stats 之前，先准备并校验完整事务；
- 当前标量替换只存储最新值和 set 的 `seq`；
- list append 不读取 list，并存储每个全局写入 `seq`；
- list delete 删除整个精确 key；
- snapshots 包含当前标量值和存活的 list 元素。

### JSONL {#jsonl}

- 保持 format 4/storage version 1，没有遗留 register decode；
- 一个单写对象或多写数组仍然是一条原子行；
- 回放产生与 Memory 相同的逻辑状态；
- 被撕开的末行不暴露部分事务；
- snapshot 序列化保留存活 list 元素的序列以及下一个序列高水位。

### SQLite {#sqlite}

使用：

```sql
CREATE TABLE scalar_values (
  namespace TEXT NOT NULL,
  key       TEXT NOT NULL,
  seq       INTEGER NOT NULL,
  value     TEXT NOT NULL,
  PRIMARY KEY (namespace, key)
) WITHOUT ROWID;

CREATE TABLE list_values (
  namespace TEXT NOT NULL,
  key       TEXT NOT NULL,
  seq       INTEGER NOT NULL,
  value     TEXT NOT NULL,
  PRIMARY KEY (namespace, key, seq)
) WITHOUT ROWID;
```

升序和降序 list 查询使用带排他序列谓词和 `LIMIT` 的主键。添加 `EXPLAIN QUERY PLAN` 断言，证明没有 table scan 或临时排序 b-tree。不要更改 storage version、添加 migrations，或削弱当前的 lease/fence/fork 行为。

## 必需覆盖 {#required-coverage}

### 地址与类型测试 {#address-and-type-tests}

- 不变的地址类型化以及推断出的标量/list 结果类型；
- `NoInfer` 拒绝不兼容的 set/append 值；
- 标量辅助函数拒绝 list 地址，list 辅助函数拒绝标量地址；
- 独立构造的相等地址解析到同一位置；
- 空 key 可用；空 namespace 和 `\u0000` 分量被拒绝；
- 精确的内置 namespaces/key 语法以及恰好五个 prefix 构造器；
- 应用范围和动态非保留地址不需要第二次 operation-time key；
- 没有 registry、catalog、特权构造器、全局 value map 或运行时 `pi.*` 门控。

### 共享标量/list 符合性 {#shared-scalarlist-conformance}

- 标量 set/get/delete/delete-absent/recreate 以及最新 set 的 `seq`；
- 以 namespace 为范围、按 key 升序的 prefix 扫描；
- 追加一个和多个元素，包括在同一事务中多次 append；
- 被无关写入隔开的 append 仍保持每列表顺序和全局元素序列；
- 升序/降序排他 cursors；
- 默认、显式、无效以及被钳制的查询页 limit；
- 缺失的 list、整表 delete、delete-absent 以及 delete-then-append；
- 原子的 entry + usage + value + list 事务；
- 任一兄弟写入无效时回滚；
- append 时不读取 list；
- close 拒绝后续读取，同时已接纳的 commits 继续排空。

不要添加 value/list 碰撞测试：跨 kind 误用有意是不受强制的受信任编程缺陷。

### Backend 与 repository 测试 {#backend-and-repository-tests}

- Memory/JSONL/SQLite 的 pages 和 cursors 相同；
- JSONL 单写/多写回放、torn-tail 行为，以及保留序列的 snapshot 输出；
- SQLite 查询计划以及 writer-lease 事务行为；
- branch/tree forks 复制 session 名称、符合条件的 labels，以及 lane 配置/Branch tip 加上全新 lane 状态；
- forks 排除 operation/pending values、全部 lists、application 地址、last results、queues 以及 ledger 行；
- repository 的 parent 元数据、entry IDs、stats、branch indexes、v3 normalization、UUIDv7/follower IDs，以及当前 SQLite lease/fork 场景保持不变；
- runtime2 restore 通过那一个 prefix 构造器枚举 lanes，并且不读取 list。

## 推迟的消费者 {#deferred-consumers}

下列 `values.md` 要求明确不是 WP01 覆盖范围：

- assistant frame 转换、append 调度、settlement、recovery、cancellation、snapshot hydration 以及字节增长测试（R2/R3/R6/R12）；
- invocation `getMemo` / `setMemo`、tool-output checkpoint 写入、outcome cleanup 以及 prefix 驱动的 operation cleanup（R4/R6）；
- 除了证明基础 restore 不读取 list 之外的任何消费时 list hydration；
- runtime 接纳、driving、provider/tool 效果，或 operation-state 重设计。

WP01 仍然导出 `pendingAssistantFrames`、`operationToolMemo`、`pendingToolOutput` 以及每一个 cleanup prefix，以便后续包不必重设计存储。

## 移除检查 {#removal-checks}

这些在保留下来的源码/测试中必须零匹配，排除不可变的已发版 changelog 历史和归档散文：

```bash
rg -n 'getRegister\(|listRegisters\(|RegisterValues|RegisterNamespace|RegisterSetWrite|\bRegister<' \
  packages/agent packages/session-backends/sqlite-node packages/coding-agent \
  --glob '!**/dist/**' --glob '!**/CHANGELOG.md' --glob '!**/docs/**'

rg -n 'kind: "register"|getCustomFact\(|setCustomFact\(|fact\.(name|label|custom)|fact_update' \
  packages/agent packages/session-backends/sqlite-node packages/coding-agent \
  --glob '!**/dist/**' --glob '!**/CHANGELOG.md' --glob '!**/docs/**'

rg -n '"(branch\.tip|lane\.(config|state|lastResult)|op\.(meta|state|tool_args|preparation)|pending\.entry)"' \
  packages/agent packages/session-backends/sqlite-node packages/coding-agent \
  --glob '!**/dist/**' --glob '!**/CHANGELOG.md' --glob '!**/docs/**'

rg -n '\bregisters\b' packages/agent/src/harness/session packages/session-backends/sqlite-node/src \
  --glob '*.ts' --glob '*.sql'

rg -n '"register"' \
  packages/agent/src/harness/telemetry.ts \
  packages/agent/test/harness/telemetry.test.ts \
  packages/agent/docs/telemetry-schema.md
```

不要把无关的 model/provider/hook registration 术语当成存储 API 残留。

## 验证 {#validation}

直接运行每一个新建或修改的测试文件，迭代直到变绿。至少：

```bash
# From packages/agent
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run \
  test/harness/values.test.ts \
  test/harness/memory-storage.test.ts \
  test/harness/memory-conformance.test.ts \
  test/harness/memory-session-repo.test.ts \
  test/harness/jsonl-storage.test.ts \
  test/harness/jsonl-storage-conformance.test.ts \
  test/harness/jsonl-session-repo.test.ts \
  test/harness/jsonl-session-repo-conformance.test.ts \
  test/harness/storage-backed-session.test.ts \
  test/harness/session-tree.test.ts \
  test/harness/session-create-lane.test.ts \
  test/harness/instrumented-storage.test.ts \
  test/harness/types.test.ts \
  test/harness/telemetry.test.ts \
  test/harness/runtime2/harness.test.ts \
  test/harness/runtime2/lane.test.ts \
  test/harness/runtime2/restore.test.ts

# From packages/session-backends/sqlite-node
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run \
  test/adapter.test.ts \
  test/repo.test.ts \
  test/sql.test.ts \
  test/storage.test.ts \
  test/storage-conformance.test.ts

# From packages/coding-agent
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run \
  test/experimental-remote-runtime.test.ts \
  test/experimental-server-replacement.test.ts
```

然后从仓库根目录运行：

```bash
cd packages/agent && npm run check:telemetry-docs
cd "$(git rev-parse --show-toplevel)"
node_modules/.bin/tsgo --noEmit -p packages/agent/tsconfig.build.json
node_modules/.bin/tsgo --noEmit
git diff --check
npm run check
./test.sh
```

永远不要运行不受限制的 Vitest、`npm test`、付费 provider 测试或 `npm run build`。

## 停止条件 {#stop-condition}

当每一个保留下来的 backend 和 Session 表面都使用绑定 values/lists；所有 core 地址都使用精确的 `pi.*` 语法；任意 application 地址可用但通用 forks 排除它们；旧的 register/fact/custom-state API 和物理名称已不存在；基础 restore 不执行 list 读取；上述 schema/兼容决策已实现；聚焦测试、符合性、TypeScript、telemetry-doc、diff 以及仓库检查都通过时停止。报告最终 schema 和 fork 行为。不要开始 runtime 接纳、assistant/tool 消费者，或任何后续工作包。
