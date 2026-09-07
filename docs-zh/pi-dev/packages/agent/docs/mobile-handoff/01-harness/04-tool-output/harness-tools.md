本文是 `harness-tools.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 工具输出与 Progress {#tool-output-and-progress}

> **范围：** harness 本地。这里的任何内容都不依赖 facet 系统、RPC 或任何展示层。依赖 [delta tracking](../01-delta/delta.md)（已落地的 Chord op 词汇与 tracker）、[执行环境](../03-execenv/execenv.md)（截断发生之处），以及 [scoped 存储](../02-scopes/scopes.md)（持久化）。

## 1. 问题 {#1-the-problem}

三个故障，一个原因。

**工具各自实现自己的截断。** `bash.ts` 拥有滚动缓冲、`truncateTail`、spill 文件、更新节流和 checkpoint 间隔。`read.ts` 有自己的截断。每一个未来产生批量输出的工具都会以不同方式重做这件事。

**Progress 是一个整值。** `onUpdate(partialResult)` 每次更新交出完整的 `AgentToolResult`，`tool_update` 携带那份完整结果，`openToolProgress` 用 `setValue` 持久化它。

**曾经以为 `details: unknown` 迫使如此** — 你无法 append 到形状未知的值。这个前提现在是错的。结构 tracker（`delta.md`）在不知道类型的情况下对 JSON 记录 ops，因此 details 完全不需要特殊处理。

## 2. `ToolOutput` {#2-tooloutput}

harness 为每次调用构造一个 sink 并把它传给 `execute`。**工具什么也不返回**；sink 持有结果。

```ts
interface ToolOutput<TDetails extends JsonValue> {
  /** Append to the text block. */
  write(text: string): void;
  /** Append an image block. Images are never windowed. */
  image(image: ImageContent): void;
  /** Replace the retained text wholesale. Chord still recovers a verified `t` + `a` slide when possible. */
  replace(text: string): void;
  /** Apply source-owned truncation totals and spill metadata without resending text. */
  capture(metadata: ShellOutputMetadata): void;

  /** The tool's own details object. Mutate it directly. */
  readonly details: TDetails;

  /** Accumulates. A subagent making several model calls adds to it. */
  usage(usage: Usage): void;
  /** Replaces. */
  addTools(names: string[]): void;
  /** Replaces — a tool that decides to terminate and then recovers can say so. */
  terminate(value: boolean): void;
}
```

```ts
execute(
  toolCallId: string,
  params: Static<TParameters>,
  signal: AbortSignal,
  out: ToolOutput<TDetails>,
  context: Context,
): Promise<void>;
```

`execute` 返回 `void`。工具产生的一切都流经 sink — 包括 `usage` 和 `addTools`，它们不能是 settle 时的返回值，因为被重放的工具必须能从持久化状态 seed（§7.4）。

**失败是抛出的错误。** 当 `execute` reject 时，harness 设置 `isError`。工具可以抛任何东西，包括它并未编写的库的错误。

**`terminate` 与执行如何结束正交**，因此失败的工具可以要求循环停下：

```ts
try { await thing(); } catch (error) { out.terminate(true); throw error; }
```

这补上当前实现的一个缺口：`executeToolCall` 的 catch 硬编码 `isError: true` 且没有 terminate，而 `immediateError` 的 terminate 参数只被 `applyBeforeToolDecision` 在 hook 阻断时传入 `true`。

### 2.1 details 只是一个对象 {#21-details-are-just-an-object}

```ts
async execute(id, params, signal, out, context) {
  out.details.total = 42;
  out.details.passed += 1;
  out.details.failures.push({ name, message });
  out.details.current = undefined;          // -> delete
}
```

完全细粒度的 ops 会自然产生，已对照原型验证：

```jsonc
["#",0,["details","passed"]]
["s",0,1]
["p",["details","failures"],0,0,[{…}]]
["d",["details","current"]]
```

没有 recipe，没有 mutation map，没有 `tool_start` 上的 `initialDetails`，没有 Immer，也没有任何消费者运行工具代码。`TDetails` 仍是工具自己导出的类型，以便渲染器把 `call.details` 转成它 — 它的全部用途就在于此。

对 `packages/agent/src/harness/tools/` 的普查发现**今天没有任何工具增量 mutation details**；只有 `bash.ts` 在流中途写入它们，并且整份重建，因为容器反正会被整份替换。本设计去掉了那个原因，如果没人接手也没有成本。

**注意：** details 现在无界。在循环里向 `failures` push 的工具会无限增长，而且与文本不同，没有 cap。已交付的东西没有这样做；当 details 还是只替换的值时，这扇门是关着的，现在开了。

### 2.2 部分输出在失败后仍存活 {#22-partial-output-survives-failure}

今天 `executeToolCall` 捕获并返回 `createErrorToolResult(message)`，仅从错误字符串构建一份全新结果 — 已经流式发出 8 KB 然后抛出的工具只报告错误。

有了 sink，已经写入的就是结果。harness 把错误文本作为 content 追加，并保留其余部分。错误文本是模型可见内容，不是展示：模型需要读到调用为何失败。

`abortedMessage` 和 `interruptedMessage` 应与此保持一致；今天它们通过 `syntheticMessage` 构建替换结果，因此被取消的长时间命令也会丢失其部分输出。

## 3. Content {#3-content}

content 恰好是**一个文本块，后跟零个或多个图像块**。工具不能在图像之间交错文本 — 图像前后写入的文本落在同一块。这是故意的：截断永远只触及字符串，而图像从来不是部分的任何东西。

图像**从不窗口化**。对 base64 载荷做字节或行 cap 没有意义，`truncateTail` 操作的是文本。`maxBytes` / `maxLines` 只管辖文本。

### 3.1 保留模式 {#31-retention-mode}

在工具定义上声明：

```ts
output?: {
  retain?: "head" | "tail";   // default "tail"
  maxBytes?: number;
  maxLines?: number;
}
```

**`head`** — 追加直到 cap，然后停止。永远不移除任何东西。适合从一开始就有意义的输出：文件读取、列表、grep。

**`tail`** — 滚动窗口。适合有趣部分在末尾的任何东西：构建、测试运行。

不提供 head+tail。`truncate.ts` 导出 `truncateHead` 和 `truncateTail`；两者都不组合它们，也不会新增组合。

### 3.2 工具不截断 — exec env 截断 {#32-the-tool-does-not-truncate--the-exec-env-does}

对于起源于执行环境的输出，封顶、合并和 spill 发生在**源头**。见 [`execenv.md`](../03-execenv/execenv.md)。工具把它的 `ShellOutputLimits` 传入 `env.exec`，并把得到的更新导入 sink。

这不是便利。在 sandbox host 上读 1 GB 文件绝不能把 1 GB 运到 agent 机器再在那里封顶，spill 文件必须落在模型自己的 `read` 和 `grep` 运行的地方。

对于起源于 agent 机器的输出（subagent、进程内工作），`ToolOutput` 在本地应用同样的逻辑。同一份代码，不同位置。

注意这推翻了更早的决定：sink 里没有 spill，临时文件路径是工具特定的。改变它的是 exec-env 论据 — 跨机器边界的模型可达性。

## 4. 工具输出状态 {#4-tool-output-state}

`tool_update` 携带针对该次调用的 `ToolOutputState` 的 `Op[]`（`delta.md` §6）：

```ts
interface ToolOutputState {
  content: (TextContent | ImageContent)[];
  details: JsonValue;
  usage?: Usage;
  addedTools?: string[];
  terminate: boolean;
  truncation: ShellOutputTruncation;   // totals over everything ever written, without duplicate text
}
```

用 ops 而不是带类型的变体联合，决定性原因只有一个：**只有 ops 能在 harness 不知道 `TDetails` 的情况下给出 details 粒度。** 带类型的联合会需要按工具的 recipe，而这正是 §2.1 删掉的机制。

文本仍然得到 delta 处理，因为 sink 在 mutation *之前*应用 cap，因此滚动窗口在 `content[0].text` 上产生 `truncate` + `append`，而不是整值 set。

intern 后的 ops 在每一种负载上也测得**小于带类型的 frame 词汇**，在 details 上小 10 倍，因为 frame 重复 `toolCallId`，而 intern 后的 op 携带一个整数。见 `delta.md` §4.1。

没有 `drop` 事件。sink 知道它驱逐了什么，并把它表达为 `truncate`；消费者不需要单独信号，也不派生任何东西。

## 5. Harness 事件 {#5-harness-events}

```ts
| { type: "tool_start";
    runId; turnId; toolCallId; toolName;
    args: unknown }

| { type: "tool_update";
    runId; turnId; toolCallId;
    ops: Op[] }                       // a base batch begins with `r`

| { type: "tool_end";
    runId; turnId; toolCallId;
    isError: boolean }
```

**`tool_start` 只携带身份。** 更早的草案加过 `caps` 和 `initial`；两者都是冗余的，已经去掉。第一批永远是 base batch（`delta.md` §6），因此初始状态走更新通道到达 — 携带两次意味着建立 base 的两种方式，它们可能不一致。而 `caps` 已经在状态内部：`ToolOutputState.truncation` 携带 `maxBytes` 和 `maxLines`，这正是渲染器要说「50 KB 限制」所需的。草案自己也承认消费者「不再必须」以相同方式 fold，因为生产者的 ops 编码了驱逐 — 那是 `caps` 还要旅行的最后一个理由，它不成立。

`tool_update` 携带 ops。base batch 与 delta 走同一通道，因为替换本身就是一个 op（`delta.md` §2） — 没有第二种形状。`message_update` 有相同形状（`message-update.md` §5.1）；消费者用一条代码路径折叠工具输出和 assistant 输出。

**`tool_end` 不携带 content、details、usage、terminate。** 每一个字节都已经发出。再发一遍会在没有任何新事情发生的时刻复制每一张 base64 图像。

> **fold 就是结果。** 消费者折叠过的任何东西都不会再被重发来确认。

这消解了更早关于 settle 时截断与运行中 fold 不一致的开放问题。没有单独的 settle 时截断：sink 的窗口*就是*截断。工具想在末尾加上的任何东西 — bash 的 `[Showing lines 8000-8123 of 8123]` 页脚 — 是 `out.write(footer)`，再一次 append。

harness 仍在进程内为模型组装 `AgentToolResult`，`createToolResultMessage` 仍把已结算的 `ToolResultMessage` 连同 `content`、`details`、`usage`、`addedToolNames`、`isError` 写入 transcript。两者都不是线路事件。

## 6. Lane reduction {#6-lane-reduction}

```ts
export function reduceLaneSnapshot(view: LaneView, event: HarnessEvent): void;
```

对普通对象做普通 mutation。没有 `Draft`，没有 `produce`，没有 Immer，也**没有 `Rebase` 返回值** — 无法应用事件的 fold 让状态保持原样，host 发送一次 `replace`。（更早的草案有 `void | Rebase`；在 Immer 下那会抛，没有 Immer 则没有东西可返回。注意 `reducer.ts:4` 当前定义 `LaneSnapshotReduction = LaneSnapshot | { rebase: true }`，因此这是对现有代码的真实变更，驱动它的事件是 `navigation_end`。）

除了视图，事件是唯一输入。没有注册表，没有 `resolve`，没有工具代码 — 因此在崩溃与恢复之间被改写的工具不能让一份已持久化的流变得不可读。

当 harness 被 facet 包装时，同一次 mutation 在 `delta.md` 的 tracker 下运行，ops 自然产生。harness 本身不知道这一点。

## 7. 持久化 {#7-durability}

### 7.1 今天存在什么 {#71-what-exists-today}

`pendingToolOutput(operationId, invocationId)` 是 `value<AgentToolResult<unknown>>`，并且 — 重要的是 — `progress.write(partial)` **只**在 `options?.checkpoint === true` 时触发（`drive/tools.ts:325`）。不是每次更新。bash 每 2 秒 checkpoint，并用 `JSON.stringify` 去重；其他每个工具从不 checkpoint。

它也**不是 progress 缓冲**。它是中断 checkpoint。恢复时，若工具不是 replay-safe，`readCheckpoint` 把它变成给模型的真实 `ToolResultMessage`：`[...checkpoint.content, INTERRUPTION_MARKER]` 加上 `details` 和 `usage`。

注意误导了更早草案的含义：因为 checkpoint 必须*是*当前状态，它被读成需要 `value` 语义。并不需要。它需要是*可派生的*，而从最后一个 base batch 折叠编码批次就能派生它 — 这正是给 base batch 打标签的意义（§7.3）。`checkpoint: true` 请求一次持久化写入，不是一次替换。

`pendingAssistantFrames` 是 `list<AssistantMessageFrame>`，每个 frame 追加，settle 时在 `response.ts:345`、`deferred.ts:157`、`terminal.ts:47` 上 `deleteList`。

注意 `operationCleanupWrites`（`terminal.ts:26`）做四次 `scanValues` 调用，以枚举 settle 时要删除的东西。在 scopes 下，覆盖 `operationToolMemoPrefix` 和 `pendingToolOutputPrefix` 的两次被单次 `retireScope(operationId)` 取代。

### 7.2 重命名 {#72-renaming}

`pendingAssistantFrames` → **`pendingAssistantOutput`**，与 `pendingToolOutput` 对齐。frame 不再是持久化单元；两个地址现在都持有以 ops 或快照写入的被跟踪状态。

### 7.3 写什么，以及何时写 {#73-what-to-write-and-when}

两个地址都是 **ephemeral-scoped**（[scopes.md](../02-scopes/scopes.md)），因此它们活在 settle 时退役的 sidecar 里，而不是永远留在主日志中。

两个独立收益，按重要性排序：

- **编码。** ops 代替整值，外加地址 intern：单个文件从 93.89 MB 到 5.32 MB，原子性不变。先做这个。
- **Scopes。** pending 状态完全离开主日志：存活部分从 5.32 MB 到 0.06 MB。

**两者都是 `list<WireOp[]>`**，不是 value。sink 为每条持久化值流拥有一对有状态的 Chord encoder/decoder。每次 flush 追加一个编码批次，第一个 op 为 `r` 的逻辑批次在存储记录上打 `"base"` 标签。
恢复用 `stopAtTag: "base"` 向后读并向前应用
（[delta.md §9](../01-delta/delta.md#9-durable-form)，[scopes.md §11](../02-scopes/scopes.md#11-list-tags-and-stop-conditions)）。

一次 flush 的写入：

```ts
const ops = out.flush();
if (ops.length === 0) return;
const wire = enc.encode(ops);
writes: [appendList(address, wire, isBase(ops) ? "base" : undefined)];
```

`isBase` 来自 Chord。它检查根替换 op `r`；普通嵌套 set 使用 `s`。分类放在词汇旁边，因此比较只写一次。

已落地的 tracker 无条件发出结构 op。没有序列化大小比较或自适应替换启发式。生产者用 `rebase()` 显式请求 base batch；输出 sink 的 cap 约束那次替换，而周期性 rebase 约束恢复工作。生产重新测量否决了文本专用的 append/truncate API：通用路径本地测得每次 50 KB 滚动窗口 flush 为 2.43–2.46 µs，低于周围成本。保持普通的被跟踪字符串 mutation；见[决定记录](../01-delta/append-decision.md)。

**Checkpointing 没有被删除。** `BASH_CHECKPOINT_INTERVAL_MS` 仅作为过渡兼容机制保留。通用 sink 拥有持久化频率，因为 Shell 无法为存储写入定价，也无法强制 memo/output 原子性。强制的 memo、终端和 recovery-base 写入绕过普通节奏，同时仍受 cap 约束。

### 7.4 重放必须 seed，而不是丢弃 {#74-replay-must-seed-not-discard}

`clearReplayCheckpoint` 当前在重新执行 replay-safe 工具之前写入 `deleteValue(pendingToolOutput(...))`（`drive/tools.ts:257`）。**这是一个 bug。**

replay-safe 意味着工具被重新执行，但 memo 的存在正是为了让它*不要*重做已经做过的工作 — 而跳过的工作不会发出任何内容。今天，任何被 memo 化的工作的输出都会丢失。

修复：从持久化状态 seed 一个新的 `ToolOutput`，然后重新执行。工具 append 到一个已经持有崩溃前产物的 sink。

这也是为什么任何东西都不能只在 settle 时出现。`usage` 和 `addTools` 必须在 seed 后存活，因此它们像其他一切一样流经 sink。

### 7.5 memo 不变量 {#75-the-memo-invariant}

> 工具的 memo 写入与其 output checkpoint 必须在同一事务中提交。

否则工具做了工作、设置了 memo、在下一次 checkpoint 之前崩溃，重放时跳过工作，而被 seed 的输出没有它的记录。

**今天这不成立。** `setMemo`（`drive/tools.ts:112`）和 `openProgress`（`runtime/progress.ts:44`）是两次分开的 `lane.command` 调用，因此是两笔事务。让它成立意味着把 checkpoint 绑进 memo 的提交：

```ts
setMemo(name, value) {
  validateMemoName(name);
  if (!active) return Promise.reject(ended());
  return lane.command<void>((state) => {
    if (!ownsEffect(state)) return { kind: "reject", error: ended() };
    const memo = operationToolMemo(drive.operationId, call.resultEntryId, name);
    return {
      kind: "commit",
      writes: [
        value === undefined ? deleteValue(memo) : setValue(memo, value),
        setValue(pendingToolOutput(drive.operationId, call.resultEntryId), out.snapshot()),
      ],
      next: state,
      materialize: () => undefined,
    };
  }, drive.context);
}
```

两个地址都是 **ephemeral-scoped**，因此这是单文件事务，并在静态上被执行为一笔（[scopes.md §3 和 §6](../02-scopes/scopes.md)）。`operationToolMemo` 正是为此放进那个 scope。Session 线上的顺序不够 — 两次文件写入不是原子的。周期性 checkpoint 保持原样 — 尽力而为，服务于中断路径；这里在正确性要求时强制一次。

不变量成立是因为工具做 X，把 X 的输出写入 sink，*然后*调用 `setMemo("did X")` — 因此提交时 sink 的状态已经包含 X 的输出。

**单靠顺序不行**，以防这看起来诱人：

- 先 memo，后 checkpoint → 中间崩溃 → 重放跳过 X，被 seed 的输出缺少它 → 静默丢失；
- 先 checkpoint，后 memo → 中间崩溃 → 重放重做 X 并再次 append → 重复输出。

重复是较差失败里不那么糟的那个，因此有序写入是可容忍的回退，但两者都不正确。

**成本：** `setMemo` 现在写入一份完整的有 cap 输出状态，而不是一个小值。memo 很少 — 每次调用一把 — 因此这由 `memo 数量 × cap` 界定，而不是由输出体积界定。

### 7.6 `openProgress` 有写入顺序竞态 {#76-openprogress-has-a-write-ordering-race}

`commitWrite(item)` 在调用 `write()` 时捕获 `item`，写入是 fire-and-forget，只跟踪 `latest`。因此在 T1 捕获的 checkpoint 可能在 T2 的 memo 捆绑 checkpoint *之后*提交，用较旧状态覆盖较新状态 — 恰好重新引入 §7.5 所防止的丢失。

修复：在 command planner 内部解析 sink 的状态，而不是在调用时。

```ts
commitWrite: () => setValue(address, out.snapshot())   // evaluated under the Session line
```

`lane.command` 在 Session 线上串行，因此 checkpoint 写入在构造上变成单调的。这一般地消除了竞态，而不仅针对 memo。

### 7.7 持久化路径上没有任何东西运行工具代码 {#77-nothing-on-the-durable-path-runs-tool-code}

ops 由没有领域知识的六动词 applier 解释，因此在崩溃与恢复之间被改写的工具不能让一份已持久化的流变得不可读。

> **持久化路径只使用 harness 拥有的 reducer。**

这也排除了持久化 *facet* ops。harness 没有 facet 状态，facet 来来去去，恢复中的 harness 必须在没有 facet 的情况下重建其工作值。

## 8. 开放问题 {#8-open-questions}

- **tracker 的属性测试**（`delta.md` §3.3）。这里的一切都建立在生产者与副本一致之上；目前没有任何东西证明它们一致。
- 合并窗口：按 tick，还是字节 / 时间阈值。
- 图像数量是否需要界限。图像不窗口化，因此循环 push 它们的工具会让 `content` 无限增长。当前当作工具 bug。
- details 是否出于同样原因需要界限（§2.1）。
- `retain: "head"` 在封顶后是否应继续发出仅计数器的更新，以便渲染器报告压制了多少。[`execenv.md`](../03-execenv/execenv.md) 对源于 exec 的输出给出了答案；agent 侧输出需要同样的答案。
- 失败的工具*是否应该*能够 terminate，或者当前的无能是否是故意的 — 有一个合理论据是模型应收到错误并做决定。
- **派生值。** 从累积 JSON 解析出的 `arguments` 不应被复制；按需派生。安全是因为 `parseStreamingJson` 是全函数 — 四个回退，最后是 `{}`，它不能抛 — 因此副本派生时没有错误路径，也没有协商协议。推广为：被复制状态中没有派生字段。
