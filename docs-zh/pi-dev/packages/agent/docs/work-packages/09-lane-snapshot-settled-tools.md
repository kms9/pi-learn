本文是 `09-lane-snapshot-settled-tools.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 工作包 09 — LaneSnapshot 已结算但未放置的 tools {#work-package-09--lanesnapshot-settled-but-unplaced-tools}

## 状态与基线 {#status-and-baseline}

- 仓库：`earendil-works/pi`
- 交接文档创建时的分支：`dev`
- 基线 commit：`d14d6b22327d545d6a253f932165b63e48d7f9c8`
- 用户报告在本交接文档之前 worktree 立即干净。
- 本文档在对话压缩之后作为实现交接开始，现在记录已实现的设计。它本身不是规范性 harness 规范；`packages/agent/docs/harness.md` 仍具有规范性。

## 目标 {#goal}

让每一个已开始或已结算但未放置的 tool call 都在 `LaneSnapshot.operation.runningTools` 中可见，直到其不可变 `toolResult` entry 被放入 transcript。

预期投影是：

```text
planned         → not yet represented in runningTools
effect_pending  → runningTools(status: "running")
outcome_ready   → runningTools(status: "settled")
completed       → transcript toolResult entry
```

对每一个成为展示活跃之后的调用，`runningTools` 和已放置的 transcript entries 不得有缺口或重叠。放置是源前缀 flush，而不是全 tools 屏障。在其自己的 `entry_added` 上从 `runningTools` 移除一次调用，从不在 `turn_end` 上。

## 原始缺陷 {#original-bug}

一次调用在真实 effect 完成和源顺序 tree 放置之间消失：

1. `packages/agent/src/harness/runtime/reducer.ts`：`tool_end` 把该调用从 `runningTools` 中 splice 出去。
2. `packages/agent/src/harness/runtime/lane.ts`：`captureLaneSnapshot()`，`case "tools"`，只投影 `effect_pending` 调用并跳过 `outcome_ready` 调用。
3. 最终结果已经在 `pendingEntry(resultEntryId)` 处持久，但新的/重连的 snapshot 无法显示它。
4. 它只在 `entry_added` 放置不可变 `toolResult` entry 之后重新出现。

对于并行批次 `[A, B, C]`，如果 B 在 A 仍 pending 时结算，B 可以保持 `outcome_ready` 直到 A 就绪。如果 A 已经放置，B 可以放置而不等待 C。因此在 `turn_end` 清空一切是错误的：早放置的结果会暂时同时存在于 `transcript` 和 `runningTools` 中。

## 已确认的当前架构 {#confirmed-current-architecture}

Mini **不** 复制结构化对象 deltas。

- `packages/coding-agent/src/experimental/mini/worker/lane-service.ts` 发送一份初始完整 snapshot，然后转发单个 `HarnessEvent` 对象。
- `packages/coding-agent/src/experimental/mini/tui/session.ts` 通过 `reduceLaneSnapshot()` 折叠那些事件。
- Reconnect/rebase 再获取一份完整 snapshot。
- `tool_update` 当前携带完整替换的进度结果，而不是嵌套 diff。

`packages/agent/src/harness/runtime/drive/tools.ts` 中已实现的持久 tool 流：

```text
prepare
→ before_tool
→ intent commit (effect_pending + effective args), then tool_start
→ execute/update/checkpoint
→ after_tool
→ finalize
→ publishToolOutcome staging commit (pendingEntry + outcome_ready), then tool_end
→ materializeReady prefix placement
→ entry_added
```

全部真实、立即合成、cancellation 和 recovery outcomes 都汇聚通过 `publishToolOutcome()`。

`Lane.settleOperation()` 支持绑定到 commit 的事件。它 commit、发布进程局部状态、构造事件批次，公开操作 await 投递。在并行执行中，`materializeReady()` 只在 outcome-completion promise resolve 之后调度。因此，`tool_end` 在暂存之后、放置之前投递。

## 已同意的事件契约变更 {#agreed-event-contract-change}

**不要** 添加 `tool_result_ready` 或 `tool_outcome_ready`。

相反，把 harness `tool_start`/`tool_end` 重新定义为 tool-call 处理/结果生命周期事件，而不是仅真实外部 effect 生命周期事件。

### 全新执行的调用 {#fresh-executed-call}

```text
intent commit
→ tool_start
→ tool_update*
→ execute/finalize
→ TX[pendingEntry + outcome_ready + cleanup]
→ tool_end
→ source-ordered placement
→ entry_added
```

### 全新合成调用 {#fresh-synthetic-call}

```text
TX[pendingEntry + outcome_ready]
→ tool_start
→ tool_end
→ source-ordered placement
→ entry_added
```

暂存事务的 post-commit 事件批次包含 `tool_start` 后接 `tool_end`，因此 watcher 不能在没有权威暂存状态的情况下观察到任一生命周期事件。

全新合成调用包括：

- 未知 tool；
- 参数准备或校验失败；
- `before_tool` 拒绝或无效替换参数；
- 真正的 assistant `length`/截断调用处理；
- 仍为 `planned` 时，或在 intent 之后、effect 接纳之前的 cancellation。

### Recovery {#recovery}

历史生命周期事件不被回放。

- 被恢复的 `effect_pending` 调用已经由初始 snapshot 表示。
- 安全回放从 checkpoint-clear commit 发出带 recovery 标签的 `tool_start`，并从稍后的 outcome-staging commit 发出 `tool_end`。
- 不安全 interruption 合成可以发出带 recovery 标签的 `tool_end` 而不新发出 `tool_start`；初始 snapshot 提供了 running 行。
- 已经作为 `outcome_ready` 恢复的调用在初始 snapshot 中显示为 settled，并且在放置之前不需要被回放的 end 事件。

### `tool_end` 的含义 {#meaning-of-tool_end}

本次变更之后，`tool_end` 表示：

> 完整最终 tool 结果已持久暂存，并且该调用是 `outcome_ready`。

它成为从 running 到 settled 的权威 reducer 转移。它必须在暂存 commit **之后** 发出，而不是之前。

实际执行结果与合成结果之间的旧区分，是通过省略生命周期事件来编码的。仓库内没有 runtime 消费者要求该区分。如果希望保留它，讨论添加显式字段，例如 `execution: "executed" | "synthetic"`；该字段讨论过但 **未同意**，因此不要静默添加。

## LaneSnapshot 类型 {#lanesnapshot-type}

把 `packages/agent/src/harness/agent-harness.ts` 中的 `LaneSnapshot.operation.runningTools` 改为用一个 `result` 字段同时表示进度和最终输出。不要在 snapshot 中保留单独的 `partialResult` 字段。

优先使用可区分联合，使无效组合不可表示：

```ts
type SnapshotTool =
  | {
      status: "running";
      toolCallId: string;
      toolName: string;
      args: unknown;
      result?: AgentToolResult<unknown>; // latest complete progress snapshot
    }
  | {
      status: "settled";
      toolCallId: string;
      toolName: string;
      args: unknown;
      result: AgentToolResult<unknown>;  // complete finalized result
      isError: boolean;
    };
```

用户明确同意该可区分联合。

`tool_update.partialResult` 在事件 API 中可以仍命名为 `partialResult`；reducer 把它赋给 snapshot 行的统一 `result` 字段。

当前 mini 传输发送语义事件，而不是结构化 deltas，因此即使它等于最新 update，`tool_end` 仍携带完整最终结果。统一 snapshot 字段仍然是正确的状态模型。

## 精确 reducer 行为 {#exact-reducer-behavior}

文件：`packages/agent/src/harness/runtime/reducer.ts`

### `tool_start` {#tool_start}

- 用 `matchingOperation(snapshot, event.runId)` 解析 operation。
- 按 `toolCallId` upsert；不要盲目 push。
- 设置 `status: "running"`、`toolName`、`args`。
- 如果替换现有行，清除陈旧的仅 settled 字段。
- 不保留陈旧最终结果。新开始/回放的调用可以接收后续 `tool_update` 值。

需要 upsert，因为 watch 可能在缓冲的 `tool_start` 事件投递之前捕获持久 `effect_pending` 状态。

### `tool_update` {#tool_update}

- 使用 `matchingOperation(snapshot, event.runId)`，而不是直接使用 `snapshot.operation`。
- 找到匹配行。
- 对 running 行，用 `event.partialResult` 替换 `result`。
- 忽略错误 operation 或缺失行。

### `tool_end` {#tool_end}

- 用 `matchingOperation(snapshot, event.runId)` 解析。
- 按批次局部 `toolCallId` 找到现有行；同一时间只有一个 tool 批次是展示活跃的。
- 用 `status: "settled"` 替换它，保留其参数，并使用 `event.result` 和 `event.isError`。
- 这自然移除旧 `result` 的临时解释；没有单独的 `partialResult` 要删除。
- 最终结果在放置之前保持显示。

`tool_end` 不携带参数，并且不能创建行。全新合成的 `tool_start` 和 `tool_end` 在暂存 commit 之后一起发出，消除旧的捕获/事件缺口。不安全 recovery 依赖初始 snapshot 的 running 行。

### `entry_added` {#entry_added}

如果 `event.entry` 是 role 为 `toolResult` 的消息，从 `snapshot.operation?.runningTools` 移除匹配的批次局部 `toolCallId`，然后应用 transcript 更新。Harness 事件是序列化的、受信任的、恰好发出一次，并且不被历史回放，因此既不需要重复 entry 处理，也不需要跨批次身份。

不要在 `turn_end` 上清除 tool 行。

## 精确权威捕获行为 {#exact-authoritative-capture-behavior}

文件：`packages/agent/src/harness/runtime/lane.ts`，`captureLaneSnapshot()`，`case "tools"`。

Assistant entry 已经加载一次。对每一个批次调用：

### `planned` {#planned}

跳过。它尚未成为展示活跃。

### `completed` {#completed}

跳过。其 `toolResult` entry 必须已经在被捕获的 transcript 中。

### `effect_pending` {#effect_pending}

- 校验 `assistant.message.content[sourceIndex]` 是匹配的 `toolCall` 块。
- 读取 `operationToolArgs(operationId, turnId, sourceIndex)`；它对 effect-pending 调用是必需的。
- 读取可选的 `pendingToolOutput(operationId, resultEntryId)`。
- 投影：

```ts
{
  status: "running",
  toolCallId: block.id,
  toolName: block.name,
  args: persistedArgs,
  ...(checkpoint === undefined ? {} : { result: checkpoint })
}
```

### `outcome_ready` {#outcome_ready}

- 校验源 tool-call 块。
- 读取 `pendingEntry(call.resultEntryId)`。
- 要求一份 role 为 `toolResult` 的消息 payload。
- 对照源块校验暂存的 `toolCallId` 和 `toolName`。
- 存在时读取 `operationToolArgs(...)`。
- 使用 `persistedArgs ?? block.arguments`。立即合成调用可能从未写入 `operationToolArgs`，并且这种缺失只对 outcome-ready 投影合法。
- 按需从暂存的 `ToolResultMessage` 和持久调用终止标志重建规范 `AgentToolResult`。
- 投影 `status: "settled"`、`result` 和 `isError`。

事件和捕获表示必须把最终结果规范化得相同，这样通过 `tool_end` 折叠等于稍后的权威 snapshot。注意可选的 `details`、`usage`、`addedToolNames` 和 `terminate`；不要依赖偶然的对象属性存在差异。

`outcome_ready` 缺失或不匹配的暂存结果是展示损坏，必须使 snapshot 捕获失败。

## Runtime 事件生产变更 {#runtime-event-production-changes}

主文件：`packages/agent/src/harness/runtime/drive/tools.ts`

相关 helpers：`packages/agent/src/harness/execution/tools.ts` 和 `packages/agent/src/harness/runtime/drive/tool-placement.ts`。

### 内部 outcome 形态 {#internal-outcome-shape}

当前：

```ts
type ToolOutcome = { message: ToolResultMessage<unknown>; terminate: boolean };
```

扩展/重构它，使 post-commit 事件生产拥有完整规范最终结果和 `isError`，而没有有损重建。它必须保留足够数据用于：

- 暂存的 `ToolResultMessage`；
- `tool_end.result`；
- `tool_end.isError`；
- cancellation 规范化之后持久/有效的 `terminate`。

合成 helpers 当前直接返回 `ToolResultMessage`。谨慎重构，使合成 outcomes 也携带规范结果数据。不要在 transcript 中发明 `details`：现有未知/无效合成结果有意省略消息 details。

### 绑定到 commit 的 `tool_start` {#commit-bound-tool_start}

对全新执行，`publishToolIntent()` 把 `tool_start` 附加到持久化有效参数并把调用改为 `effect_pending` 的 commit。公开操作在接纳 `executeToolCall()` 之前 await 投递，从而保留 `tool_start → tool_update*`，而不要求每一个 update 回调都 await 投递。

对从不写入 effect intent 的全新合成调用，`publishToolOutcome()` 在 outcome-staging commit 的事件批次中把 `tool_start` 附加在 `tool_end` 之前。它报告源块参数。

对安全 recovery，checkpoint-clear commit 使用已持久有效参数发出带 recovery 标签的 `tool_start`。不要为已经恢复的不安全 `effect_pending` 调用发出全新 start；其初始 snapshot 是基线。

### Post-commit `tool_end` {#post-commit-tool_end}

从 `performToolInvocation()` 移除当前暂存前的 `tool_end` 发出。

`publishToolOutcome()` 把 `tool_end` 附加到同一暂存 command 的 `events` 回调。事件携带：

- `runId`、`turnId`、`toolCallId`、`toolName`；
- 规范最终 `result`；
- `isError`；
- cancellation 规范化后的持久 `terminate`；
- 适用时的 `recovery: true`。

参数属于 `tool_start`，不在 `tool_end` 上重复。事件数据描述实际已 commit 的状态，尤其是 cancellation 强制 `terminate: false`。

因为 `Lane.command()` await 保留的事件投递，并且 `runParallel()` 从 outcome-completion promise 调度物化，所需顺序是：

```text
staging commit
→ tool_end delivery
→ source-ready message lifecycle
→ placement commit
→ entry_added
```

### 要审计的调用点 {#call-sites-to-audit}

每一个 `publishToolOutcome()` 调用都必须正确提供源 tool call 和 recovery 上下文：

- `startToolInvocation()` 中的立即 outcome；
- intent 之后、执行之前的 cancellation；
- 正常 `performToolInvocation()` 完成；
- 安全回放完成；
- 不安全 recovery interruption；
- 对 `planned` 的顺序 cancellation；
- 对 `effect_pending` 的顺序 cancellation。

还要审计 `performToolInvocation()` 内部的同步 `AbortRequested` 路径：带持久 intent 的调用即使 effect 接纳立即失败，也必须仍有一致的 start/end 展示。

## Mini 与其他展示消费者 {#mini-and-other-presentation-consumers}

### Mini {#mini}

文件：`packages/coding-agent/src/experimental/mini/tui/view.ts`，`MiniTui.apply()`。

对每一个 `runningTools` 行：

```text
status running:
  markExecutionStarted()
  if result exists: updateResult({...result, isError:false}, true)

status settled:
  do not call markExecutionStarted()
  updateResult({...result, isError}, false)
```

最终结果在等待放置时保持可见。在 `entry_added` 之后，transcript 同步提供不可变 `ToolResultMessage`，并且该行不再位于 `runningTools` 中。

### 其他共享消费者 {#other-shared-consumer}

在下列位置应用等价处理：

- `packages/coding-agent/src/experimental/client-tui-chat.ts`

编辑前阅读 `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`，以确认 `updateResult(result, isPartial)` 语义。

## 测试 {#tests}

### Reducer 测试 {#reducer-tests}

文件：`packages/agent/test/harness/runtime/reducer.test.ts`

添加一个并行批次事件折叠测试，调用 0、1、2：

1. 把三者都建立为 running。
2. 调用 2 在调用 0 之前结算。
3. 调用 0 结算并放置，同时调用 1 仍在运行。
4. 调用 1 结算。
5. 放置按源顺序 flush 调用 1 和 2。
6. 在每一次结算和放置事件之后，断言每一个展示活跃调用恰好出现在下列之一中：
   - `operation.runningTools`；或
   - transcript `toolResult` entries。
7. 断言调用 2 在被更早调用阻塞时仍以 `status:"settled"` 及其最终结果存在。
8. 断言每一次 `entry_added` 只移除其匹配的活跃行。

添加聚焦覆盖：

- 来自陈旧/错误 `runId` 的 `tool_update` 不变更当前 operation；
- `tool_start` upsert 而不是复制从持久 intent 捕获的行；
- `tool_end` 结算现有批次局部行。

### Capture/watch 测试 {#capturewatch-tests}

文件：`packages/agent/test/harness/runtime/watch.test.ts`

构造一份包含下列内容的持久 tools 状态：

- `planned`（省略）；
- 带 checkpoint 的 `effect_pending`（`status:"running"`，checkpoint 作为 `result` 暴露）；
- 不带 checkpoint 的 `effect_pending`；
- 带已持久有效参数的真实 `outcome_ready`；
- 没有 `operationToolArgs` 的合成 `outcome_ready`，回退到源块参数；
- 在可行处仅由 transcript entry 表示的 completed 调用。

断言暂存的 settled 内容、`isError`、参数，以及没有重复。添加缺失/不匹配 `pendingEntry` 损坏断言。

### Runtime tool 测试 {#runtime-tool-tests}

文件：`packages/agent/test/harness/runtime/drive-tools.test.ts`

更新/添加顺序断言，证明：

- 真实：`intent commit < tool_start < tool_update* < staging commit < tool_end < entry_added`；
- 立即合成：`staging commit < tool_start < tool_end < entry_added`，没有 tool effect 也没有 `after_tool`；
- planned cancellation 获得一致的 start/end；
- 不安全 recovery 使用初始 snapshot 加上带 recovery 标签的 end，而不回放 effects；
- B 可以发出 post-commit end 并在 A 阻塞放置时保持 settled；
- 源顺序放置保持不变；
- 暂存之后的崩溃不能回放该调用。

基线规范性测试/文档要求 `tool_end` 在暂存之前；实现有意反转那些期望。

### 类型/事件目录测试 {#typeevent-catalog-tests}

审计：

- `packages/agent/test/harness/types.test.ts`
- `packages/agent/src/harness/telemetry.ts`

不添加新事件名。`tool_end` 省略参数，并且其语义改变。

### Mini 回归 {#mini-regression}

单元测试之后，运行先前使用的真实 mini abort smoke 测试：

- 恰好执行 `sleep 20`；
- 大约两秒后发送 Escape；
- 断言出现 `Command aborted` 和经过时间；
- 断言原始 ANSI 包含 `toolErrorBg`（`48;2;60;40;40`）；
- 验证持久 session 包含 `isError:true` 的 tool 结果以及 operation 状态 `aborted`。

还要练习一个后到 tool 先完成的并行批次，并验证其最终结果在按序放置之前保持可见。

## 文档变更 {#documentation-changes}

编辑前完整阅读这两份文档：

- `packages/agent/docs/harness.md`（规范性）
- `packages/agent/docs/tool-durability.md`

实现更新要求下列内容的基线陈述：

- 暂存前的 `tool_end`；
- 只针对真实 effects 的 `tool_start`/`tool_end`；
- 合成 outcomes 不发出生命周期；
- `outcome_ready` 从 `runningTools` 中省略；
- snapshot 字段 `partialResult`。

基线中已知的重要位置：

- `harness.md` §3.8 大约第 784–796 行；
- `harness.md` §5.4 `LaneSnapshot` 大约第 1101–1134 行；
- `harness.md` §5.5 事件大约第 1140–1158 行；
- `harness.md` tool phases 大约第 1214–1224 行；
- `harness.md` 符合性要求大约第 1386–1400 行；
- `tool-durability.md` 终结大约第 255–280 行；
- `tool-durability.md` snapshots/events 大约第 568–584 行；
- `tool-durability.md` 测试要求大约第 671–679 行。

修订后的文档必须说明：

- `tool_end` 是最终结果的暂存后持久证据；
- 全新合成 outcomes 接收 start/end 生命周期；
- recovery 事件不被历史回放；
- `outcome_ready` 在放置之前保持投影为 settled；
- `entry_added` 把 settled 展示移入 transcript；
- 统一 snapshot `result` 在 running 时是临时的，在 settled 时是最终的。

除非另行要求，不要修改单独的 `response.ts`/`tool-placement.ts` recovery `turn_end` 不一致。

## 压缩后要完整重读的文件 {#files-to-reread-completely-after-compaction}

核心/规范：

1. `packages/agent/docs/harness.md`
2. `packages/agent/docs/tool-durability.md`
3. `packages/agent/src/harness/agent-harness.ts`
4. `packages/agent/src/harness/runtime/reducer.ts`
5. `packages/agent/src/harness/runtime/lane.ts`
6. `packages/agent/src/harness/runtime/drive/tools.ts`
7. `packages/agent/src/harness/runtime/drive/tool-placement.ts`
8. `packages/agent/src/harness/execution/tools.ts`
9. `packages/agent/src/harness/runtime/types.ts`
10. `packages/agent/src/harness/session/types.ts`
11. `packages/agent/src/harness/events.ts`
12. `packages/agent/src/harness/telemetry.ts`

测试：

13. `packages/agent/test/harness/runtime/reducer.test.ts`
14. `packages/agent/test/harness/runtime/watch.test.ts`
15. `packages/agent/test/harness/runtime/drive-tools.test.ts`
16. `packages/agent/test/harness/types.test.ts`
17. 那些文件导入的相关测试 helpers。

Mini/展示：

18. `packages/coding-agent/src/experimental/mini/tui/session.ts`
19. `packages/coding-agent/src/experimental/mini/worker/lane-service.ts`
20. `packages/coding-agent/src/experimental/mini/shared/protocol.ts`
21. `packages/coding-agent/src/experimental/mini/tui/view.ts`
22. `packages/coding-agent/src/experimental/client-tui-chat.ts`
23. `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`

编辑前运行 `git status --short` 并检查当前 diffs，因为其他 Pi sessions 可能共享该 worktree。

## 验证命令 {#validation-commands}

从仓库根目录，变更之后：

```bash
cd packages/agent
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/harness/runtime/reducer.test.ts
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/harness/runtime/watch.test.ts
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/harness/runtime/drive-tools.test.ts
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/harness/types.test.ts
cd "$(git rev-parse --show-toplevel)"
npm run check
```

除非被要求，不要运行 `npm test`、完整 Vitest 套件或 `npm run build`。

如果使用委托评审，仓库策略要求：

```text
--provider anthropic --model claude-fable-5
```

保持扩展启用。

## 非目标 {#non-goals}

- 没有面向 mini 的通用结构化 delta 传输。
- 没有优化以避免最终结果在 `tool_end` 中过一次线、又在 `entry_added` 中过一次。
- 不改变源前缀放置语义。
- 不在 `turn_end` 上清除。
- 不改变 tool effect 回放/持久规则。
- 不改变 `after_tool`：它仍只在其现有 cancellation 契约下对实际全新/安全回放的 effects 运行。
- 不处理 `response.ts` 与 `tool-placement.ts` 之间单独的 recovery `turn_end` 不一致。
- 除非用户明确要求，没有向后兼容层。
- 除非用户要求，不要 commit。
