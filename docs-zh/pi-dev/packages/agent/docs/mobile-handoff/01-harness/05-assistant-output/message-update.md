本文是 `message-update.md` 的中文阅读版；命令、路径、API 名称保持英文。

# `message_update` 写入放大 {#message_update-write-amplification}

> **范围：** harness 本地。依赖 [delta tracking](../01-delta/delta.md) 提供已落地的 Chord `Op`/`WireOp` 词汇，以及 [scoped 存储](../02-scopes/scopes.md) 提供持久化。Chord delta tracking 已落地；scoped 存储与本次 Harness 集成尚未落地。

## 1. 问题 {#1-the-problem}

```ts
{ type: "message_update", runId, message, event, frame? }
```

同一事物的三种表示一起旅行：

- `message` — 完整的 `AssistantMessage`；
- `event` — 一个 `AssistantMessageEvent`，它自身又携带 `partial: AssistantMessage`，
  第二份完整拷贝；
- `frame` — 实际 delta，可选。

每个流式 token 大约是两份完整快照外加一个 delta，因此字节在一次响应中近似二次增长。

reducer 甚至不用 delta：

```ts
case "message_update":
  if (next.operation?.id === event.runId && event.message.role === "assistant") {
    next.operation.streamingMessage = event.message;
  }
```

一次直接赋值。因此在任何线路上，发送该事件都*差于*发送一份快照 — 它运两份，而 `replace` 运一份。

线路适配器已经走完修复的一半：它丢掉 `event`，发送 `message` 加上 `frame`。那是完整快照连同产生它的 delta。

## 2. 紧凑形式已经存在 {#2-the-compact-form-already-exists}

```ts
/**
 * Compact, replayable assistant-message progress. Terminal settlement is
 * intentionally excluded and must be persisted separately.
 */
export type AssistantMessageFrame =
  | { type: "start"; partial: AssistantMessage }
  | { type: "text_start" | "text_delta" | "text_end"; contentIndex: number; ... }
  | { type: "thinking_start" | "thinking_delta" | "thinking_end"; ... }
  | { type: "toolcall_start" | "toolcall_checkpoint" | "toolcall_delta" | "toolcall_end"; ... };
```

`AssistantMessageFrameEncoder` 产生它，`reduceAssistantMessageFrames` 折叠它，`openFrameProgress` 已经用 `appendList` 持久化它。delta 格式已构建、已使用、已持久化。它只是不是 `message_update` 所携带的东西。

## 3. 先例 {#3-precedent}

pi 已经在下一层做到线路即 delta。`PiMessagesEvent` — pi-messages backend 发送的序列化形式 — 没有 `partial`：

```ts
| { type: "text_delta"; contentIndex: number; delta: string }
| { type: "text_end"; contentIndex: number; content: string; contentSignature?: string }
```

然后 `pi-messages.ts` 再水合：它持有本地 `partial`，按事件 mutation 它（`partial.content[i].text += event.delta`），并返回附带 `partial` 的进程内 `AssistantMessageEvent`。

因此约定已经建立。它只是停在 provider 边缘，而没有继续穿过 harness。

## 4. 变更 {#4-the-change}

```ts
| { type: "message_update"; runId: string; entryId: string; frame: AssistantMessageFrame }
```

`message` 和 `event` 被移除；`frame` 不再可选。

爆炸半径很小，因为大多数流式消费者读的不是 `HarnessEvent`。`AgentEvent`（`agent-loop.ts`）和 `AgentSessionEvent`（`agent-session.ts`）是独立的联合类型，碰巧共享这个标签名，并直接从 pi-ai 事件构建自己的 `message_update`。它们不在本次范围。

`HarnessEvent.message_update` 的真实消费者和生产者：

| 位置 | 变更 |
| --- | --- |
| `runtime/drive/response.ts` | 发出必需的语义 frame；停止附带完整快照 |
| `runtime/reducer.ts` | 折叠 frame，而不是赋值 `event.message` |
| lane/facet 状态适配器 | 在 Chord tracker 下运行该 fold，并发出 `Op[]` / 编码后的 `WireOp[]` |
| `experimental/harness-wire-adapter.ts` | 停止把原始 `HarnessEvent` 当作最终复制格式 |
| `harness/telemetry.ts` | 仅名称列表 |
| `protocol/harness.ts` | 复制携带编码后的 `WireOp[]`，而不是原始事件 |

`message_end` 继续携带已结算的消息，因为 frame 故意排除终端结算。那是每条消息一次，不是每个 token 一次。

## 5. 需要一个增量 applier {#5-an-incremental-applier-is-needed}

`reduceAssistantMessageFrames` 是对 `Iterable` 的整流通量 fold。reducer 需要一个步进函数：

```ts
export function applyAssistantMessageFrame(
  state: AssistantFrameState,
  frame: AssistantMessageFrame,
): void;
```

对普通对象做普通 mutation。**没有 `Draft`，没有 Immer。** 更早的草案主张用会 mutation draft 的签名，以便组合进 `produce` recipe；那个动机已经消失（[delta.md §8](../01-delta/delta.md#8-what-this-removes-from-the-codebase)）。步进函数仍然需要 — 整流通量版本变成对它的循环 — 只是出于更简单的原因：reducer 一次折叠一个 frame。

### 5.1 pi-ai frame 留在 pi-ai 边界；Chord op 穿过复制边界 {#51-pi-ai-frames-stay-at-the-pi-ai-boundary-chord-ops-cross-replication-boundaries}

`AssistantMessageFrame` 是 pi-ai 的语义 delta 词汇（`text_delta`、`text_end`，…）。[Delta tracking §6](../01-delta/delta.md#6-there-is-no-frame-type) 不定义第二种 frame 包装：进程内复制携带 `Op[]`，线路适配器携带编码后的 `WireOp[]`。pi-ai frame 停在 fold；Chord op 穿过复制边界。

`AssistantMessageFrame` 是 pi-ai 自己的 delta 词汇，并留下来。改变的是它不再是持久化单元或复制单元。

harness 通过普通 mutation 把 frame 折叠进 `LaneView`。在 Chord tracker 下这会产生：

```json
["a",["operation","streamingMessage","content",0,"text"],"Let me "]
```

实测中，intern 后的 op 在这个负载上**小于 frame** — 200 个 delta 为 13.6 KB 对 21.5 KB 原始 — 因为 frame 自身携带三个键，而 intern 后的 op 携带一个整数。因此把 frame 放到线路上的体积论据已经死了。

frame 保留的是语义：`text_end` 在一个原子单元里携带权威内容外加签名，而 ops 会需要两个，且对它们关系的契约更弱。这就是为什么它们仍是*输入*词汇，并在任何东西穿过边界之前被折叠。

### 5.2 reducer 状态必须活在被 reduce 的值里 {#52-reducer-state-must-live-in-the-reduced-value}

文本和 thinking 纯折叠：`block.text += frame.delta`，而 `*_end` 用权威内容外加签名覆盖。`ReducerBlockState` 中的 `ended` 标志只用于校验，可以丢掉。

工具调用不行。`toolcall_delta` 做 `state.json += frame.delta`，累积一段**永远不会存到消息上的原始 JSON 字符串** — block 持有的是 `arguments`，即解析后的值。你无法从快照恢复累加器，也无法把 delta append 到已解析对象上。

因此累加器必须成为被折叠值的一部分 — 例如 `LaneView` 上的 `operation.frameState[contentIndex].json` — 让 `AssistantMessage` 保持干净。一般地：

> **被复制的 reducer 的状态必须是被复制值的一部分。** 任何放在旁边的东西，都会在未运行生产者 fold 的消费者上分叉。

推论是 `arguments` 本身**不应**被复制。它由 `json` 派生，而每次解析的对象都是新引用，因此两者都存会运两份同一信息。按需派生。

这之所以安全，正因为 `parseStreamingJson` 是**全函数** — 四个回退，最后是 `{}`，它不能抛 — 所以副本无条件派生，没有错误路径，也没有协商协议。没有需要表示的解析失败状态，也没有 block 需要错误槽位。

### 5.3 解析成本 {#53-parse-cost}

对不断增长的字符串每个 delta 调用一次 `parseStreamingJson` 是每条消息二次的。既然 `arguments` 现在是派生而不是复制，这个成本落在读取它的人身上，而不是每个消费者。展示可以在语义 checkpoint 和 `toolcall_end` 刷新派生的 arguments，而不是每个 delta 都解析；该策略与 encoder 当前发出 checkpoint 的原因（§6）是分开的。

## 6. `toolcall_checkpoint` 是干什么的 {#6-what-toolcall_checkpoint-is-for}

`EncoderBlockState` 携带 `caughtUp` 和 `catchupJson`，因为排队的 provider 事件的共享 `partial` 可能已经领先于该事件的 delta。checkpoint 把语义 frame 流赶上 block 开始时可见的权威工具调用 arguments；它目前不是通用的迟到订阅者协议。

frame 折叠进被跟踪状态之后，Chord 根替换（`r`）是复制和持久化恢复的重同步点。`toolcall_checkpoint` 仍是该 fold 的语义输入，而不是承担传输责任。

## 7. pending 输出的写入量 {#7-write-volume-for-pending-output}

`openFrameProgress` 调用 `appendList(pendingAssistantFrames(...))`，因此每个 frame 都是一行。一次长响应是数千次写入。

**该地址被重命名为 `pendingAssistantOutput`**，并变成 `list<WireOp[]>`，与 `pendingToolOutput` 一致（[tool-output 交接 §7.2](../04-tool-output/harness-tools.md#72-renaming)），它不再是 frame 列表。progress sink 在追加每个持久化 `WireOp[]` 批次之前，用每个响应一个有状态 encoder 编码被跟踪的 `Op[]`；显式 `rebase()` 调用为恢复产生有界的根替换批次。该 list 活在 **ephemeral scope** 中，因此在 settle 时被 unlink，而不是留在主日志中（[scoped 存储](../02-scopes/scopes.md)）。

重要性质是这个 list **不是历史**：`deleteList` 在 settle 时于 `response.ts`、`deferred.ts` 和 `terminal.ts` 中运行。它的存在是为了让响应中途崩溃能恢复部分 assistant 消息。已结算消息另行持久化。

这意味着按 frame 持久化几乎买不到什么，写入速率可以直接拿来交易：

- **用有界、不重置的窗口合并。** 第一个 pending frame 打开窗口；后续 frame 加入它*而不*延长截止时间，因此持续流式响应不能无限推迟第一次写入 — 那是朴素 debounce 的失败模式。活跃写入期间被接纳的 frame 构成下一批。
- **在 flush 时拼接。** 同一 `contentIndex` 上的一串 `text_delta` frame 折叠成一个带有拼接文本的 frame。fold 结果相同，因此对我们的目的是无损的。

然后一次崩溃最多丢失一个窗口的在途流式内容。

### 7.1 与 DeepSeek Harness 的对比 {#71-contrast-with-deepseek-harness}

DSH 做不了这笔交易。它的 `assistant/chunk` 事件是规范日志条目，因此按 token 持久化是强制的，它攻击的是大小：

- 同样有界、不重置的 write-behind 窗口；
- **打包行** — 连续 chunk delta 的行程存储为 `text-chunks` / `reasoning-chunks` / `tool-call-chunks`，无损，在真实会话上大约小 60%，读取无条件，因此布局从不依赖写入开关；
- 默认带校验和的 zstd frame，并从被撕裂的最后一帧恢复。

它们的打包必须重建精确的事件边界、序号和时间戳，因为 `seq = log.length`，且校验要求连续的逻辑日志。我们不需要，因为 frame 在 settle 时被丢弃 — 因此普通拼接对我们可用，打包机制不需要。

## 8. 对临时监听者的后果 {#8-consequence-for-ad-hoc-listeners}

`HarnessEvent.message_update` 不再自描述。中途挂上的监听者看到的是针对它并不持有的 partial 的 delta。

任何正确的监听者已经有 base，因为 `watch()` 在一个 `readLane` 临界区内安装订阅并捕获快照，缓冲直到 `start()`。但直接调用 `on("message_update")`、没有 watch 的监听者不再可行 — 在提交之前值得知道。
