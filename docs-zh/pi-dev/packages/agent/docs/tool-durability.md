本文是 `tool-durability.md` 的中文阅读版；命令、路径、API 名称保持英文。

# Tool 持久化 — 实现交接 {#tool-durability--implementation-handoff}

本文规定持久 tool-call 生命周期，以及当前 tool API 上最小的 harness 特定进度 checkpoint 扩展。它并不另外敲定 harness 原生公共 tool 接口；该接口必须提供这里所需的能力，同时不暴露原始 session 存储。

设计有两项彼此独立的补充：

1. 在外部 effect 结算与按源顺序放入对话之间，增加一个持久 `outcome_ready` 状态；
2. 为完整、有界的 `onUpdate` 快照提供可选的持久替换 checkpoint。

## 问题 {#problem}

并行 tool effect 按完成顺序结束，而 tool-result entry 必须按 assistant 源顺序进入对话。

没有中间持久状态时：

```text
calls: A, B, C
B finishes
C finishes
A is still running
process crashes
```

B 和 C 只存在于进程内存中，因为 A 阻止了按源顺序放置。恢复把它们当作未解决，并可能重放或中断已经完成的 effect。

解决方案分离两种顺序：

1. **outcome 持久化：** 实际完成顺序；
2. **entry 物化：** assistant 源顺序。

完整的最终结果立即在 `pi.pending.entry` 中变得持久；该 call 变为 `outcome_ready`；当每个更早的源位置都完成或 ready 时，才稍后放置。

## 目标 {#goals}

1. 在完整最终 outcome 已经持久之后，永远不再次运行该 tool。
2. 持久保留乱序并行 outcome，同时不违反 transcript 顺序。
3. 保留现有的整 tool `replay: "safe" | "never"` 契约。
4. 为 Flue 风格的 `step.do` 支持 invocation 作用域的持久 memoization。
5. 保留 tool 选择的有界进度 checkpoint，用于重连与不安全中断恢复。
6. 在 outcome 结算、取消或外部终结之后围栏迟到的 tool 写入。
7. 保持最终树 entry 规范、完整、有界（独立于进度快照）且不可变。

## 非目标 {#non-goals}

- 任意外部 effect 的恰好一次。
- 每个 `step.do` 调用的嵌套持久状态机。
- 从进度输出推断 tool 完成。
- 把部分输出当作规范最终结果。
- 向 tool 提供原始 `Session`、`SessionMutator` 或绑定存储地址访问。
- 在本文中敲定公共 harness 原生 tool 类型。

## 持久身份 {#durable-identities}

每个 call 已经在执行前预留其 result entry ID。把它用作稳定的公共 invocation 身份：

```text
invocationId = resultEntryId
```

它在 session 内唯一，在安全 replay 后仍然存活，并且不同于 provider 的批次本地 `toolCallId`——后者可能被后续 assistant 消息重用。

周围的 operation 状态继续提供：

- `operationId`；
- `turnId`/generation step ID；
- `sourceIndex`；
- assistant entry ID；
- 捕获的配置与执行模式。

## 存储 {#storage}

### 既有绑定 value {#existing-bound-values}

```ts
operationToolArgs(operationId, turnId, sourceIndex)
// 生效的已校验参数，在 effect 接纳之前持久化。

pendingEntry(resultEntryId)
// 完整最终 ToolResultMessage，在 outcome_ready 等待放置期间。
```

### Invocation memo {#invocation-memos}

在 `session/values.ts` 中定义 operation 拥有的地址构造器：

```ts
export const operationToolMemo = (
  operationId: string,
  invocationId: string,
  memoName: string,
) => value<JsonValue>(
  "pi.op.tool_memo",
  `${operationId}:${invocationId}:${memoName}`,
);
```

`memoName` 必须非空且不含 `:`。名字可以使用点或斜杠做应用本地分组。`setMemo(name, undefined)` 删除精确绑定 value。

`scanValues(operationToolMemoPrefix(operationId))` 允许防御性 operation 清理。`scanValues(operationToolMemoPrefix(operationId, invocationId))` 允许在一个 outcome 变为 ready 时做原子 invocation 清理。核心清理使用这些所有者定义的前缀构造器，而不是重复原始保留 namespace/key 文法。

### 部分 tool 输出 {#partial-tool-output}

持久恢复值是 tool 选择的最新完整有界进度快照。那是全部当前状态，因此使用一个绑定 value 地址：

```ts
export const pendingToolOutput = (
  operationId: string,
  invocationId: string,
) => value<AgentToolResult<unknown>>(
  "pi.pending.tool_output",
  `${operationId}:${invocationId}`,
);
```

这是辅助观察数据。它从不证明 effect 成功或完成。存储的 value 与实时 `partialResult` 具有完全相同的 content/details/usage 形状；恢复不需要 tool 特定的进度编解码器。

Tool 拥有快照定界、checkpoint 节奏以及重复抑制。Harness 拥有同步入队、promise 跟踪、invocation 围栏以及清理。第一版 API 没有通用字节上限，也不截断或重新解释类型化 tool 数据；进程内 tool 被信任遵守有界快照契约。没有 tool 可见的 `flush()` 方法，也没有进度更新的持久 list。

崩溃可能丢失比最新已提交 checkpoint 更新的实时更新。JSONL 物理增长与所请求的不同 checkpoint 的大小和频率成正比，直到压缩；Memory 与 SQLite 只保留一个当前 value。按每两秒 50 KiB 计，JSONL 未压缩最坏情况大约是每十分钟持续变化输出 15 MiB。

## Tool 更新 API {#tool-update-api}

保留现有的全快照更新回调，并添加 harness 特定选项：

```ts
export interface AgentHarnessToolUpdateOptions {
  /** 请求替换该 invocation 的持久恢复 checkpoint。 */
  checkpoint?: true;
}

export type AgentHarnessToolUpdateCallback<TDetails> = (
  partialResult: AgentToolResult<TDetails>,
  options?: AgentHarnessToolUpdateOptions,
) => void;
```

`AgentHarnessTool` 使用这个回调，而不是遗留的 `AgentToolUpdateCallback`。即使没有实时 listener，harness 也始终提供它，因为 tool 可能通过它请求持久化。遗留 `AgentTool` 与旧 agent loop 保持不变，因为它们无法兑现持久 checkpoint。

每次回调调用仍是立即的实时更新。回调是同步的并返回 `void`；`checkpoint: true` 额外请求持久化该完整快照。它不是持久化确认。内部，harness 保留最新的 `events.emit(tool_update)` promise，以便现有 listener 投递在 `after_tool` 之前完成；tool 不 await 也不接收该 promise。

每次 `checkpoint:true` 调用在 Session mutation line 上同步入队一次标量替换，把普通 harness-fault observer 挂到该 promise，并替换进程本地的 `latestCheckpointWrite` 引用。写入本身既不丢弃也不合并，替换引用也从不会让更早的 rejection 无人观察：

- Session mutation FIFO 保留请求顺序；
- 每次 mutation 验证同一 call 仍为 `effect_pending`；
- 最新 promise 完成蕴含每个更早 checkpoint 写入完成；
- tool promise 结算停止接受更新，并在 `after_tool` 之前等待该最新 promise；
- 失败的 checkpoint 提交按普通存储 fault 规则使 harness 进入 fault。

请求 checkpoint 快于存储能力的 tool 会在内存中排队工作。在受信任 tool 契约下，节奏是 tool 的责任。内置 bash 策略在普通使用中约束该队列。

当重复抑制重要时，tool 应与其上次请求的 checkpoint 比较。存储不会在每次 checkpoint 时读取并深度比较当前标量。

### Bash 策略 {#bash-policy}

内置 bash tool 保持当前 100 ms 实时更新节奏。它最多每两秒请求一次 checkpoint，并且仅当完整有界快照与上次请求的 checkpoint 不同时：

```ts
const BASH_UPDATE_THROTTLE_MS = 100;
const BASH_CHECKPOINT_INTERVAL_MS = 2_000;
```

当前 `ShellCaptureProgress` 已经提供有界快照：最后 2,000 行或 50 KiB，加上截断元数据与 overflow 文件路径。最初的空更新仅实时。输出量从不加快 checkpoint 频率。短 tool 可以在不写任何 checkpoint 的情况下结算，因为它改为提交完整最终结果。

## Tool-call 状态 {#tool-call-state}

用 `outcome_ready` 扩展 call union：

```ts
type ToolCall =
  | {
      status: "planned";
      sourceIndex: number;
      resultEntryId: string;
    }
  | {
      status: "effect_pending";
      sourceIndex: number;
      resultEntryId: string;
      replay: "never" | "safe";
    }
  | {
      status: "outcome_ready";
      sourceIndex: number;
      resultEntryId: string;
      terminate: boolean;
    }
  | {
      status: "completed";
      sourceIndex: number;
      resultEntryId: string;
      terminate: boolean;
    };
```

`outcome_ready` 意味着：

- 执行、错误规范化与 `after_tool` 已经完成，或者 harness 已经构造了最终合成结果；
- 完整最终 `ToolResultMessage` 存在于 `pendingEntry(resultEntryId)`；
- invocation memo 与部分输出存储已经消失；
- tool 不得再次执行；
- 不可变结果 entry 可能还不存在，因为更早的 call 尚未物化。

精确 union 以后可以携带少量结算元数据，但不得复制已最终结果 payload。

## 状态转换 {#state-transitions}

```text
planned
  ├─ real effect cleared       → effect_pending
  └─ immediate/synthetic       → outcome_ready

effect_pending
  ├─ live effect settles       → outcome_ready
  ├─ safe orphan replay settles→ outcome_ready
  └─ unsafe orphan synthesis   → outcome_ready

outcome_ready
  └─ source position eligible  → completed
```

实现可以把 `outcome_ready → completed` 融合进最终化立即可放置的头 call 的同一事务，但语义检查与测试仍必须覆盖乱序 call 的持久 `outcome_ready`。优先先实现显式的两事务形式。

## 全新执行 {#fresh-execution}

### 放行与 intent {#clearance-and-intent}

不变的 effect 三明治：

```text
planned
→ prepare arguments, run before_tool, validate replacements
→ TX[
     set pi.op.tool_args,
     set call = effect_pending(replay)
   ]
→ post-commit tool_start
→ admit tool execution
```

Invocation 作用域能力仅对该持久 `effect_pending` call 激活。

### 部分输出 {#partial-output}

每次 `onUpdate(partialResult, options)` 通过现有事件/快照路径发布实时更新。当 `options.checkpoint === true` 时，harness 额外请求一次标量替换：

```text
TX[
  setValue(pendingToolOutput(operationId, invocationId), partialResult)
]
```

该 mutation 验证同一 operation、turn、源位置与 invocation 仍为 `effect_pending`。它不重写 `pi.op.state`。结算之后的迟到 checkpoint 返回且不提交。

Tool 必须 checkpoint 有界完整快照，而不是不断增长的无界 value。Bash 使用它已经实时发送的同一有界 `ShellCaptureProgress` 快照。客户端可以渲染并在本地保留比持久 checkpoint 更新的实时更新，但那些更新明确是进程本地的。

### 最终化到 `outcome_ready` {#finalization-to-outcome_ready}

当 tool promise 结算时：

1. 同步停止接受更新并过期 invocation 能力；
2. 等待最新跟踪的 `tool_update` 投递与最新 checkpoint 写入 promise；每一个都蕴含其前序队列完成；
3. 当这是真实的全新或安全 replay 结果、且取消并未阻止 hook 时，运行 `after_tool`；
4. 构造完整最终 `ToolResultMessage`；
5. 把结果提交为 `outcome_ready`；
6. 从已提交的暂存转换发出并等待 `tool_end`。

`setMemo()` 返回 promise，tool 必须 await 它；`step.do` 始终如此。未 await 的返回前 mutation 仍会在暂存之前入队，并由暂存删除。能力过期后开始的调用会拒绝。不存在单独的 invocation 写入 drain。

事务：

```text
TX[
  setValue(
    pendingEntry(resultEntryId),
    { type: "message", payload: finalizedToolResultMessage },
  ),
  deleteValue(pendingToolOutput(operationId, invocationId)),
  deleteValue(memo.address) for every memo returned before commit by
    scanValues(operationToolMemoPrefix(operationId, invocationId)),
  setValue(operationState(operationId), call = outcome_ready(terminate))
]
```

该事务是线性化点，之后 invocation 永远不能 replay。因此其后提交的 `tool_end` 是最终 outcome 已就绪的持久证据；它不再是提交前的 effect 观察。

暂存消息包含最终的：

- 文本/图像内容；
- provider tool-call ID 与 tool 名；
- details；
- `isError`；
- usage 快照（若已报告）；
- 添加的 tool 名；
- timestamp。

`terminate` 仍是编排状态，因为它控制批次继续，并在放置时复制到不可变 entry 的 `terminate` 字段。暂存的 `addedToolNames` 直到该结果在 transcript 中物化才影响活动 tool 集合。

## 按源顺序物化 {#source-ordered-materialization}

任一 call 变为 `outcome_ready` 之后，从第一个未完成的源位置开始，找到连续的 ready 前缀。

示例：

```text
[completed, outcome_ready, outcome_ready, effect_pending]
             └──────── ready prefix ────────┘
```

在放置事务之前，按源顺序发出并等待每个最终结果的 `message_start` 与 `message_end`。在可行时一次事务物化该前缀，然后按相同源顺序发出 `entry_added` 与已报告的 usage 事件：

```text
TX[
  insert result entry i from pendingEntry(i),
  deleteValue(pendingEntry(i)),
  insert tool usage row i if reported,

  insert result entry i+1 with parent = result i,
  deleteValue(pendingEntry(i+1)),
  insert tool usage row i+1 if reported,

  setValue(branchTip(lane), newest result),
  setValue(operationState(operationId),
           calls i..i+1 = completed and, when complete, next checkpoint)
]
```

每个插入的 entry 使用其已经预留的 `resultEntryId`。写入在事务内部按源顺序构造 parent 链。

Tool 报告的 usage 在放置之前一直持久存在于暂存消息中。初始实现把它的 ledger 行与 entry 物化原子写入，匹配当前 entry/usage 顺序，并避免引用尚未存在的 entry 的 ledger 行。不需要 usage ID 预留，因为失败的放置事务既不写入行也不写入 completed 状态。

当最后一个 call 物化时，同一事务调用 `scanValues(operationToolArgsPrefix(operationId, turnId))` 并删除每个返回的地址，然后转换到正确的 checkpoint：

- 每个结果都 terminate → `may_finish`，不需要最终 assistant；
- 否则 → `need_assistant(false)`。

## 并行执行 {#parallel-execution}

Outcome 暂存遵循实际完成顺序。Entry 物化遵循源顺序。

```text
A, B, C start
B finishes → B outcome_ready
C finishes → C outcome_ready
A finishes → A outcome_ready
             materialize A, B, C
```

B 和 C 暂存之后崩溃：

```text
A effect_pending
B outcome_ready
C outcome_ready
```

恢复只对 A 应用未知 outcome 策略。B 和 C 不需要 tool 注册或 hook 执行就能成为 entry。

持久不变量从“已完成 call 构成按源顺序的前缀”变为：

- 已完成 call 构成按源顺序的前缀；
- 在该前缀之后，并行 call 可以是任意混合的 `planned`、`effect_pending` 或 `outcome_ready`；
- 只有按源顺序物化才会扩展已完成前缀。

顺序执行在已完成前缀之后最多构造一个非 planned call。已提交的 call 状态在恢复时被信任；拥有过程在创建与消费转换时强制该形状，而不是通过宽泛的恢复审计。

## 带部分输出的不安全恢复 {#unsafe-recovery-with-partial-output}

对 `replay: "never"` 的孤立 `effect_pending`：

1. 存在时读取 `pendingToolOutput(operationId, invocationId)`；
2. 保留其有界内容与可序列化 details；
3. 追加强制的人类可读中断标记；
4. 构造 harness 拥有的、`isError: true` 的 `ToolResultMessage`；
5. 把它提交为 `outcome_ready` 并清理 invocation 状态。

标记必须说明输出是部分的，且外部 outcome 未知。`isError: true` 描述交付给模型的结果；它不断言外部 effect 失败。

最终文本后缀示例：

```text
[Tool execution was interrupted. The preceding output is the latest durable progress snapshot; newer live output may be missing, and the external outcome is unknown.]
```

规则：

- 不为该合成结果运行 `after_tool`；
- 存在时保留 checkpoint `usage`，但忽略 checkpoint `addedToolNames` 与 `terminate`，因为进度从没有最终结果权威；
- 设置 `terminate: false` 且不添加 tool；
- 缺失 checkpoint value 也合法，并且只产生中断结果；
- 从不从部分输出中看似成功的一行推断完成；
- 部分输出与 invocation memo 的清理与暂存合成结果原子进行。

## 安全恢复 {#safe-recovery}

对存储与当前声明都是 `replay: "safe"` 的孤立 `effect_pending`：

1. 保留 invocation memo；
2. 原子删除 `pendingToolOutput(operationId, invocationId)`；
3. 按需发出/重置进程本地进度观察；
4. 用持久参数与相同 `invocationId` 重新运行 tool；
5. 已完成的 `step.do` 调用返回其 memoized 值；
6. 新的部分输出重建干净的进度流；
7. 最终化遵循普通 `outcome_ready` 路径。

删除旧进度可防止 replay 代码再次发出进度时出现重复块。在 delete 之后、replay 接纳之前崩溃仍保持 `effect_pending`；下一次恢复重复同一安全过程。

如果当前 tool 声明缺失或不再安全，使用不安全中断恢复，而不是挂起。

## Invocation memo {#invocation-memos-1}

Harness 原生 tool call 收到一个专门构建的 invocation 能力，概念上等价于：

```ts
interface AgentHarnessToolInvocation {
  readonly invocationId: string;
  readonly operationId: string;
  readonly turnId: string;

  getMemo(key: string): Promise<JsonValue | undefined>;
  setMemo(key: string, value: JsonValue | undefined): Promise<void>;
}
```

每次操作：

1. 校验 memo 名并检查进程本地能力过期；
2. 在返回其 promise 之前，在 Session mutation line 上同步入队工作；
3. 当该 job 执行时，验证 operation、turn、源位置与 invocation 仍是同一 `effect_pending` call；
4. 只构造并读取或写入 `operationToolMemo(operationId, invocationId, name)`；
5. 在能力过期或持久所有权丢失之后拒绝。

持久检查对授权的外部终结很重要。在普通执行中，tool 返回之前发起的 memo mutation 按 FIFO 排在 outcome 暂存之前；之后发起的会失败过期能力检查。

迟到的僵尸回调既不能在 `outcome_ready` 之后重建 memo，也不能写入后续 operation。

Memo 是立即的持久 replay 状态，不是应用可见的结算状态。它们在 call 仍为 `effect_pending` 时在 close/crash 后存活，并在任何真实或合成 outcome 变为 ready 时删除。

终端清理防御性地扫描并删除 operation 拥有的族：

```ts
scanValues(operationToolMemoPrefix(operationId))
scanValues(pendingToolOutputPrefix(operationId))
```

以及其它 operation 拥有的地址。每个返回的 `StoredValue` 为其 `deleteValue` 提供精确绑定地址；后续 operation 收不到原始 key。

## Flue 风格 `step.do` {#flue-style-stepdo}

在 invocation memo 上构建 `step.do`；它不需要自己的 harness 状态 union：

```ts
interface ToolSteps {
  do<T extends JsonValue>(
    name: string,
    effect: () => T | Promise<T>,
  ): Promise<T>;
}
```

算法：

```text
validate deterministic unique name
→ getMemo("step/" + name)
→ present: return stored value
→ absent: run effect
→ setMemo("step/" + name, value)
→ await durability
→ return value
```

崩溃行为：

```text
before/during effect                    → effect may run on replay
effect returned, memo not committed     → effect may run on replay
memo committed                          → replay returns memo
step A memoized, step B interrupted      → rerun tool; A skips, B runs
```

这是恰好一次记录、至少一次执行。它不使任意外部 effect 恰好一次。当外部 API 支持时，应用可以从 `(invocationId, stepName)` 派生稳定的外部幂等 key。

错误不被 memoize。抛出的 effect 要么贡献到当前 tool 结果，要么在安全的整 tool 恢复之后再次运行。

本切片不要添加逐步的 `replay: "never"`。正确支持它需要嵌套的 `planned → effect_pending → completed` 状态以及显式未知 outcome 策略。整 tool replay 策略对已经讨论过的 Flue 用例已经足够。

在一次实时执行中，两次调用同一 step 名是不变量错误。名字在安全 replay 之间必须是确定的。

## 应用持久状态 {#application-persistent-state}

Flue 风格的应用状态与 invocation memo 不同。

Invocation memo：

```text
step completed → memo becomes visible immediately
```

应用状态：

```text
tool stages state change
→ crash before outcome_ready: state must not appear committed
→ outcome_ready: state and finalized result become visible together
```

不要通过在执行期间直接调用 `Session.setValue()` 来实现应用状态。

两个有效的实现阶段：

1. Flue 把状态保持在外部，并原子地存储应用状态加上按 `invocationId` 键控的完整结果 memo。
2. 后续 harness API 接受暂存的应用 value 写入，并在 `outcome_ready` 事务中提升它们。

仅当 Flue 的 `usePersistentState` 移入 harness 拥有的 session value 时，才需要第二种选项。其公共类型与冲突语义仍是 harness 原生 tool 讨论的开放设计项。

## 取消 {#cancellation}

取消对账从不 replay 已恢复的 tool。

- `planned` call 收到合成的 aborted 结果并变为 `outcome_ready`；
- 已开始的实时 call 可以在已取消 control 下最终化其真实本地结果，然后以 `terminate: false` 变为 `outcome_ready`；
- 已恢复的 `effect_pending` call 使用中断合成结果，可选包含部分输出，无论安全 replay 声明如何；
- 既有 `outcome_ready` call 被保留并按源顺序物化；
- invocation memo 与部分输出随每个暂存的取消 outcome 一起删除；
- 在已恢复的合成对账期间不开始 `before_tool` 或 `after_tool`。

Aborted 终端事务仅在每个 call outcome 都已物化、且已接受的 deferred write 已按既有取消规则排空之后运行。

## Close 与外部终结 {#close-and-external-finalization}

Close 仍是受控崩溃：

- 已经在接纳屏障下入队的 memo/checkpoint mutation 可以完成；
- 比最新已提交、由 tool 请求的 checkpoint 更新的实时输出可能丢失；
- 不写入合成 outcome 或取消标记；
- 持久状态停留在 `effect_pending` 或 `outcome_ready`。

外部终结在其终端事务中删除 operation 拥有的参数、invocation memo、部分输出、暂存的 pending outcome 以及其它 pending entry。稍后试图暂存 outcome 的实时任务会失败所有权围栏，并通过 `OperationEnded` 停止。

## 恢复与消费时读取 {#restore-and-consumption-time-reads}

基础恢复从所需所有者 value 构造受信任的 lane/operation 投影。它不 hydrate 或语义审计 tool 参数、invocation memo、进度 checkpoint、暂存 outcome、已完成 entry、已完成前缀形状，或捕获的执行模式关系。

对当前类型化状态负责的过程只执行其精确的消费时读取：

### `planned` {#planned}

放行不需要辅助恢复读取。它在 effect 接纳之前准备 call 并写入参数。

### `effect_pending` {#effect_pending}

激活读取 `operationToolArgs(operationId, turnId, sourceIndex)`，并可选读取 `pendingToolOutput(operationId, invocationId)`。缺失所需参数在消费时是不变量缺陷。Invocation memo 只通过作用域能力读取。安全 replay、不安全中断与快照不使用宽泛前缀扫描。

### `outcome_ready` {#outcome_ready}

物化读取 `pendingEntry(resultEntryId)`。当物化消费它时，其缺失或错误的受信任消息关系是不变量缺陷。不需要 tool 身份或 effect 恢复。

### `completed` {#completed}

普通分发不执行恢复时 entry 审计。Context/tree 读取稍后通过其正常类型化路径消费不可变 entry。

每次实时 mutation 仍在 Session line 上验证当前 operation、turn、源位置、invocation 与状态。那些检查围栏并发结算、取消与外部终结；它们不是历史恢复校验。终端前缀清理仍是防御性的，并且不使孤立扫描成为恢复的一部分。

## 快照与重连 {#snapshots-and-reconnect}

重连客户端可能看到：

- 断开前比最新持久 checkpoint 更新的实时进程本地进度；
- 进程替换之后，只有最新已提交的有界 checkpoint；
- 在按源顺序物化之前，`outcome_ready` call 作为 `runningTools` 中的已结算行；
- transcript 中的已完成 call。

`LaneSnapshot.operation.runningTools` 是判别 union。Effect-pending tool 有 `status: "running"`，以及可选的 `result`，其中包含最新完整进度快照，重开后回退到持久 checkpoint。Outcome-ready call 有 `status: "settled"`、其所需的完整最终 `result` 以及 `isError`；它留在那里，直到其不可变结果 entry 的 `entry_added` 移除该行，并把相同呈现放入 transcript。Planned 与 completed call 被省略。

## 事件与 hook {#events-and-hooks}

- `tool_start` 开始全新 call 的公共处理呈现；它从确立 effect intent 或合成暂存 outcome 的提交发出，并且本身不证明外部 effect 已开始。它对意图 effect 携带生效参数，对立即合成结果携带源参数。
- 实时进度事件与持久进度 checkpoint 不证明完成。
- Harness 在 `after_tool` 之前等待最新 `tool_update` 投递，保留既有 listener 顺序，同时不使 `onUpdate` 变成 async。
- `tool_end` 在其 `outcome_ready` 暂存提交之后、按完成顺序携带完整最终结果。它是持久结算证据，并且不重复 `tool_start` 中的参数。
- 对全新被阻止、非法、截断或 planned 取消的合成 outcome，暂存提交发出 `tool_start` 后跟 `tool_end`；这些路径仍不运行 tool effect 或后 effect hook。Effect intent 之后的取消使用更早的 intent 绑定 start 以及暂存绑定的 end。
- 不安全的已恢复 effect 已经由初始快照表示为 running，并且可能只在中断合成暂存时发出带 recovery 标记的 `tool_end`。
- 消息生命周期与 `entry_added` 发生在暂存结果物化时，而不是它首次变为 `outcome_ready` 时；`entry_added` 只移除该已结算行。
- 被动 listener 不能重入地 mutation invocation 状态。

插装存储测试断言执行路径为 `intent commit → tool_start → tool_update* → outcome staging → tool_end → source-ordered placement`，全新合成结果为 `outcome staging → tool_start → tool_end → source-ordered placement`。历史事件不 replay；安全 replay 的执行从其 checkpoint-clear 提交发出 recovery `tool_start`，并从 outcome 暂存发出 `tool_end`。

## 竞态 {#races}

| 竞态 | 所需结果 |
|---|---|
| checkpoint vs tool 结算 | 每个被接受的 checkpoint 都先入队；结算等待最新 promise，然后暂存删除 checkpoint value；迟到更新被忽略 |
| memo 写入 vs `outcome_ready` | 已 await 或返回前入队的写入先于暂存，然后被删除；返回后的调用拒绝；外部终结首先导致持久所有权检查拒绝 |
| B 的 outcome vs 更早的 A 结算 | B 独立暂存；放置等待 A |
| outcome 暂存之后崩溃 | tool 从不 replay；pending 结果稍后物化 |
| 源前缀放置期间崩溃 | 事务要么不暴露该放置前缀的任何部分，要么暴露全部 |
| 安全 replay vs 旧部分输出 | 旧绑定 checkpoint value 在 replay 发出新进度之前删除 |
| 取消 vs 真实结算 | Session mutation 顺序选择真实的已取消 control 结果或合成对账；最多一个 outcome 暂存 |
| 终端终结 vs 迟到结果 | 终端所有权胜出，或 outcome 先暂存；迟到任务从不重建 operation 数据 |
| 外部终结 vs memo/checkpoint mutation | 先发生的 mutation 被终端清理移除；先发生的终结使 mutation 的持久所有权检查拒绝 |

## 不变量 {#invariants}

1. `invocationId` 等于预留的 result entry ID，并且在安全 replay 之间稳定。
2. 处于 `outcome_ready` 或 `completed` 的 call 从不再次执行。
3. 每个 `outcome_ready` call 恰好有一个完整匹配的 `pi.pending.entry` value。
4. 已完成 call 构成按源顺序的前缀。
5. 只有按源顺序物化才会扩展该前缀。
6. 已完成前缀之后的并行 call 可以混合 planned、effect-pending 与 outcome-ready 状态。
7. Invocation memo 仅在其 call 为 `effect_pending` 时存在。
8. 部分输出是辅助的，从不确立 effect 完成。
9. 不安全合成结果显式说明捕获输出不完整，且外部 outcome 未知。
10. 暂存 outcome 原子删除其 invocation memo 与部分输出。
11. 物化原子插入不可变 entry 并删除其暂存 pending value。
12. 迟到的 invocation 能力不能在 outcome 结算或 operation 丢失之后写入。
13. `step.do` 值仅在其 memo 写入提交之后被 memoize；effect 仍是至少一次。
14. Operation 终端清理不留下 tool args、invocation memo、部分输出或暂存 outcome。

## 所需测试 {#required-tests}

### 状态与恢复 {#state-and-restore}

- 每个受信任的 planned/effect-pending/outcome-ready/completed 投影在没有辅助读取的情况下恢复；
- 基础恢复不审计已完成前缀或执行模式关系；
- effect-pending 消费读取精确所需参数与可选有界 checkpoint；
- outcome-ready 消费读取精确暂存结果；
- 缺失所需参数或暂存结果在消费过程失败，而不是基础恢复；
- 暂存之后 invocation memo 与部分输出缺失；
- 快照/激活仅在需要时 hydrate 精确有界 checkpoint value。

### 并行顺序 {#parallel-ordering}

- 当 A 仍 pending 时 B 和 C 暂存；
- 崩溃/重开证明 B 和 C 从不 replay；
- A 恢复后跟一次按源顺序的 A/B/C 放置事务；
- 混合 `[completed, outcome_ready, planned, effect_pending, outcome_ready]` 状态；
- 立即合成 outcome 乱序暂存；
- 全部 terminate 的批次在有序放置之后正确转换。

### Replay 与中断 {#replay-and-interruption}

- 安全 replay 使用持久参数与相同 invocation ID；
- 安全 replay 保留 step memo 但清除旧部分输出；
- 当前声明从 safe 降级到 never 会中断；
- 没有 checkpoint 以及带完整有界 checkpoint 的不安全恢复；
- 合成结果是 error/incomplete/unknown，并且从不运行 `after_tool`；
- 取消从不安全 replay 已恢复的 call。

### Invocation memo 与 `step.do` {#invocation-memos-and-stepdo}

- 带 invocation 地址作用域的 set/get/delete memo；
- 已完成 step 在重开后跳过 effect；
- memo 提交前崩溃会重跑 effect；
- memo 提交后崩溃返回 memo；
- 若干已完成 step 后跟一个被中断的 step；
- 重复的实时 step 名拒绝；
- memo 写入与 outcome 暂存竞态；
- 过期、取消 outcome 暂存以及外部终结之后的能力写入拒绝；
- 终端清理移除崩溃泄漏的 memo。

### 部分输出 {#partial-output-1}

- 普通更新保持仅实时；
- `checkpoint: true` 写入完整有界快照；
- tool 选择的 checkpoint 节奏与重复抑制；
- bash 以 100 ms 发出实时快照，并最多每两秒请求不同 checkpoint；
- 每个被选 checkpoint 入队一次写入，并且在 tool 结算时等待最新 promise 蕴含所有更早写入完成；
- outcome 暂存之后的 checkpoint 不能重建该地址的 value；
- Memory、JSONL 与 SQLite 恢复相同的 checkpoint value；
- JSONL 增长跟随 checkpoint 节奏，而不是原始 bash 输出量；
- 终端压缩按既有死字节策略回收被取代/删除的 checkpoint 快照。

### 原子性与插装 {#atomicity-and-instrumentation}

- 精确 intent、同步更新接纳、异步更新投递、`after_tool`、outcome-ready 暂存、提交后 `tool_end`、按源顺序的消息生命周期以及物化顺序；
- outcome 暂存与 memo/输出清理原子；
- 物化与 pending 删除、usage、tip 以及状态原子；
- 每个边界上的崩溃；
- intent 之前不开始 effect；
- 不从 `outcome_ready` 开始 effect 或 hook；
- 终端事务移除每个 operation 拥有的 tool value。

## 实现地图 {#implementation-map}

预期运行时区域：

- `packages/agent/src/harness/session/types.ts` 中的 operation-state 类型；
- 受信任恢复投影与精确消费时地址读取；
- tool-batch 过程与按源顺序物化；
- 终端清理与取消对账；
- harness 特定更新选项、快照与事件；
- Session mutation line 上的 invocation 作用域能力实现；
- 通过绑定 value/list API 的后端一致性；
- 插装存储事务断言。

`session/values.ts` 中的具体内置地址构造器：

```text
operationToolMemo(operationId, invocationId, name) → value("pi.op.tool_memo", ...)
pendingToolOutput(operationId, invocationId)      → value("pi.pending.tool_output", ...)
pendingEntry(resultEntryId)                       → value("pi.pending.entry", ...)
```

先实现 `outcome_ready` 与 invocation memo，再实现进度 checkpoint。该状态本身就能解决错误的并行 replay；checkpoint 改善重连观察与不安全中断诊断，而不会成为完成权威。
