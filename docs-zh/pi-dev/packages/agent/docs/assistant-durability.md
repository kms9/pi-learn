本文是 `assistant-durability.md` 的中文阅读版；命令、路径、API 名称保持英文。

# Assistant 部分持久化 — 实现交接 {#assistant-partial-durability--implementation-handoff}

本文规定普通 assistant 生成与 deferred-response 轮询的持久化部分 assistant 消息。它建立在以下基础上：

- `values.md` 中的绑定类型化 value/list 地址；
- `@earendil-works/pi-ai` 中的 `AssistantMessageFrame`、`AssistantMessageFrameEncoder` 和 `reduceAssistantMessageFrames()`；
- `harness.md` 中的 assistant intent/effect/settlement 状态机。

该设计持久化紧凑、可回放的 stream frame，但不把它们当作 operation-state 的权威，也不在每次更新时存储不断增长的完整部分消息。

## 目标 {#goals}

1. 进程丢失后重建最近已提交的部分 assistant 消息。
2. 保留 provider stream 顺序，同时避免反复全量快照写入放大。
3. 避免存储提交对 provider 造成背压。
4. 复用 pi-ai 的规范 frame 转换与归约语义。
5. 保持当前公开 assistant 事件顺序。
6. 保持 operation 的 `effect_pending` 状态作为恢复的权威。
7. 在正常或合成 response settlement 时原子删除所有部分 frame。

## 非目标 {#non-goals}

- 从 frame 推断 provider 完成。
- 将终态 `done`/`error` 事件与 response settlement 分开持久化。
- 恰好一次（exactly-once）的 provider 请求。
- 公开的 frame cursor 或 frame 持久化事件。
- 通用批处理、定时器、合并或 flush API。
- 持久化结构性 summary-generation stream。
- 持久化任意 provider SDK 事件或反复的完整 `partial` 快照。

## 存储 {#storage}

`session/values.ts` 中的内置地址构造器：

```ts
export const pendingAssistantFrames = (
  operationId: string,
  responseEntryId: string,
) => list<AssistantMessageFrame>(
  "pi.pending.assistant_frame",
  `${operationId}:${responseEntryId}`,
);
```

过程为普通生成或 deferred poll 绑定一个精确地址：

```ts
const frames = pendingAssistantFrames(operationId, responseEntryId);
```

`responseEntryId` 已在 assistant/deferred 的 `effect_pending` 状态中预留。operation state 中不存储 frame 计数、cursor 或 list 身份；后续 list 操作只接收 `frames`——绝不再用别的 key。

每个 list 元素是一个 `AssistantMessageFrame`。存储事务的全局 write sequence 为 frame 排序。该 list 是辅助的：

- 缺失是合法的；
- 它不证明请求已被受理、完成、成功或失败；
- 它从不选择重启点；
- 基础 restore 不读取它。

## Frame 契约 {#frame-contract}

每个 provider stream 创建一个 pi-ai encoder，并按顺序喂入每一个事件：

```ts
const encoder = new AssistantMessageFrameEncoder();
const frame = encoder.encode(event);
```

`partial` 是 provider 共享的实时「迄今为止的 response」辅助对象，不是事件时刻的快照。encoder 维护每个未关闭 block 的计数器，并裁掉已被推进后的 block-start 快照覆盖的 text/thinking delta 前缀。它只临时缓冲同步一个已经推进的 tool call 所需的原始 JSON 前缀，然后发出一个 checkpoint 并恢复紧凑 delta。它从不在每个事件上克隆不断增长的完整消息。

- `start` 产生一个内容为空的 metadata frame；
- 非终态事件产生零个或一个 frame；
- 已被覆盖的排队 delta 不产生 frame；
- 终态 `done` 和 `error` 不产生 frame，因为最终 response settlement 是分开的；
- `start` 之前的 setup `error` 是合法的，且不产生 frame；
- text/thinking/tool 的 end frame 包含已完成 block 的权威值；
- 已完成的 tool-call 参数仍不针对 tool schema 做校验。

不要再定义第二套 harness frame codec 或 reducer。持久化直接存储导出的 pi-ai 值；hydration 调用 `reduceAssistantMessageFrames()`。

Provider 事件的 block 可以交错。编码与归约依赖 `contentIndex`，从不依赖 block 连续性。text 与普通 thinking block 在发布 `*_start` 时必须为空，之后只通过匹配的 delta 追加直到 end；被 redact 的 thinking 可以在 start 时就是完整的，并且不发出 delta。流式 tool call 以空参数开始，并通过 delta 发出完整的原始 JSON；若 provider 一开始就带完整参数，必须在事件边界发出一个能解析到该快照的累积 delta 前缀，然后再发后续参数 delta。

## 新 stream 的调度 {#fresh-stream-scheduling}

最简单的调度是刻意为之的：每个转换得到的 frame 一次 list-append 事务，在 provider 循环中入队，且不等待存储。

对每个 `start` 或 update 事件：

```text
encode the event against the per-stream frame encoder
→ when a frame is returned, synchronously enqueue invocation-fenced appendList(frames, frame)
→ attach the ordinary harness-fault observer to the returned promise
→ replace process-local latestFrameWrite promise reference
→ emit and await the existing message_start/message_update event
→ consume the next provider event
```

每个返回的 frame 都同步调用 `appendList()`，因此所有 frame mutation 按 provider 事件顺序进入 Session line。过程不等待每一次写入。每个 promise 立即被观察以便传播故障，然后再用最新引用替换前一个。被覆盖的排队事件不分配持久化 frame，也不写入。encoder 状态与未关闭 block 数量加上活动 tool-call JSON stream 中尚未同步的前缀成正比；它不保留第二份完整 assistant 消息。模型输出上限把排队的 frame 字节限制在有界输出加上 frame/事务开销之内。

事件一侧保留现有行为：`AssistantStreamObserver.start/update` 对每个事件 await `events.emit()`。没有单独的 latest event-delivery promise，因为当 provider 循环前进时，没有任何 assistant 事件投递仍未完成。

当 provider stream 结算时：

```text
stop frame admission
→ await latestFrameWrite when present
→ run after_response
→ emit message_end
→ classify and commit final response settlement
```

Session mutation line 是 FIFO，因此 `latestFrameWrite` 完成意味着此前每一次 append 都已完成。没有 promise 数组、定时器、batcher、active/waiting 状态、coalescer，也没有公开/内部 flush 方法。

失败的 frame append 会在 `after_response` 开始之前使 harness 故障。完整的最终 response 仍只存在于进程本地，存储故障之后不会提交。

## 正常 settlement {#normal-settlement}

凡是使用了 frame list 的 assistant response settlement，都在同一事务中删除该精确 list，同时写入不可变 response entry、usage、tip 和下一个 operation state：

```text
TX[
  insert response entry R,
  insert usage U,
  setValue(branchTip(lane), R),
  deleteList(frames),
  setValue(operationState(operationId), classified next state)
]
```

这适用于：

- 成功的 assistant response；
- provider `error`/`aborted` response；
- 合法的 deferred response；
- deferred poll response。

`after_response` 可以在 settlement 之前变换最终 response。Frame 保留对 provider-stream 的观察，而不可变 entry 仍是 hook 之后的规范结果。

最终 frame append 之后、settlement 之前崩溃，仍会 restore 到 `effect_pending`；frame 不会把一份看起来完整的草稿变成已结算的 response。

## 未知结果的 generation 恢复 {#unknown-outcome-generation-recovery}

被遗弃的 assistant generation `effect_pending` 没有存活的 provider stream。激活时：

1. 从当前类型化状态构造 `frames = pendingAssistantFrames(operationId, responseEntryId)`，并从该精确地址读取有界分页；
2. 用 `reduceAssistantMessageFrames()` 归约 frame 值；
3. 在已经预留的 response ID 下构造一份 harness 拥有的合成 assistant response；
4. 当 frame 存在时，保留重建出的部分内容以及安全的消息身份 metadata；
5. 设置 `stopReason: "error"`、零 usage，以及明确的中断/未知结果 `errorMessage`/诊断；
6. 原子提交合成 response、零 usage 行、frame-list 删除、tip，以及普通的 retry/failure 状态。

所需警告含义：

```text
The provider request was interrupted. The preceding content is the latest
committed partial response; newer live output may be missing, and the external
request outcome is unknown.
```

若没有任何 start frame 提交，harness 用捕获到的 model/API 身份构造同一份内容为空的合成 error。

合成 response 遵循普通 assistant error 分类：

- 仍有尝试次数 → 插入该 error response，并进入普通 retry-wait/下一次尝试路径；
- 达到上限 → 在同一 settlement 事务中插入它并使 operation 终端失败。

Error response 仍是持久化的 transcript 历史，但按现有投影规则会从后续 provider context 中省略。被中断的 error response 内的部分 tool call 永不执行。

恢复不运行 `after_response`：没有可信的完整 provider 结果可供变换。

## 取消 {#cancellation}

一条仍存活、被取消的 provider stream 通过其普通最终 `aborted` response 结算。所有已接受的 frame 先被等待，然后正常 settlement 删除该 list。

对于 restore 后被取消的 assistant/deferred `effect_pending`，取消对账会：

- 归约可用 frame；
- 构造一份合成 `aborted` response，保留已提交的部分内容；
- 使用零 usage 和现有预留 ID；
- 原子插入该 response 并删除 frame list；
- 不启动 provider 请求，也不运行 response hook。

即使归约后的内容看起来完整，取消仍赢得分类。

## Deferred 轮询 {#deferred-polling}

返回 `AssistantMessageEventStream` 的 deferred poll 使用同一个 `pendingAssistantFrames(operationId, responseEntryId)` 地址构造器。

- 正常的 pending/ready/error settlement 删除该 poll 的 frame list；
- restore 后的取消从 frame 合成一份 aborted response；
- 没有 permit 的未知 restore poll 保持 suspended，并可在 snapshot 中暴露其持久化部分内容；
- 当 poll permit 用新的预留 response/usage ID 替换未知 poll 时，该 intent 事务删除被遗弃的旧 frame-list 地址；
- 替换后的 poll 在其新的 response ID 下启动一份新 list。

Frame 从不改变 poll-number 规则。

## 结构性生成的范围 {#structural-generation-scope}

结构性 summary-generation stream 仍只存在于进程本地。它们不发出公开的 assistant-message 生命周期，并且可能在一次结构性发布之前跨越多个嵌套的 provider 请求。现有的 attempt 级 retry 与 usage 恢复仍是权威。

本切片不要把它们的中间文本存到 `pendingAssistantFrames(...)` 地址。若结构性部分诊断成为需求，应增加一个单独、显式划定范围的消费者，而不是悄悄复用 transcript-assistant 语义。

## Snapshot 与重连 {#snapshots-and-reconnect}

`LaneSnapshot.streamingMessage` 表示最近观察到的部分 assistant 消息，并不证明当前附着着一条 provider stream。

优先级：

1. 当拥有存活 stream 时，最新的进程本地部分内容；
2. 否则，对 assistant/deferred `effect_pending`，从已提交 frame 分页归约得到的值；
3. 否则缺席。

因此，restore 后的 lane 可以是 `suspended` 且 `streamingMessage` 非 undefined。该字段仍在 `transcript` 之外；只有 `entry_added` 才会把完整 response 移入 transcript 历史并清除部分内容。

Snapshot hydration 从受信任的类型化 operation state 构造精确绑定的 frame 地址，并强制执行 assistant 消费者的总 frame/page 预算。它不扫描任意 list，也不做宽泛的语义 restore 审计。

重连不回放历史 `message_start` 或 `message_update` 事件。Snapshot 携带持久化的部分内容。恢复稍后为它实际结算的 response 发出带 recovery 标记的普通合成消息生命周期。

## 事件 {#events}

已启动的 generation 保留如下实时事件顺序：

```text
message_start
→ message_update*                 each listener delivery awaited by provider loop
→ await latest frame write
→ after_response
→ message_end
→ atomic response settlement + frame-list delete
→ entry_added
→ usage
```

请求 setup 失败可能在 `start` 之前产生 `error`；该路径不发出 `message_start` 或 frame，并经过 `after_response`、`message_end` 和普通 error settlement。成功的 `done` 以及 `start` 之前的 update 是协议缺陷。

Frame 提交只发出普通存储 telemetry。没有公开的 frame 事件，也不声称某次 `message_update` 已经持久化。`entry_added` 仍是最终 assistant entry 已提交的唯一证明。

崩溃可能发生在一次实时 update 事件之后、其异步入队的 frame append 提交之前。重连随后展示最近已提交的 frame 前缀，它可能比最后一次实时事件更旧。

## Close、fault 与外部终结 {#close-fault-and-external-finalization}

Close 是受控崩溃：

- 不写入合成 response；
- 已经入队的 frame 提交是普通已受理的 session 工作，可能在 close barrier 下完成；
- 进程丢失可能丢弃尚未提交的 mutation；
- 重新打开在不变的 `effect_pending` 状态下 restore 最近已提交的 frame 前缀。

Frame 提交的存储失败会使 harness 故障。该进程中不会再提交后续 response settlement。

经授权的外部终结在其终端事务中删除 operation 拥有的 frame-list 地址。每一次 append mutation 都在 Session line 上校验当前 operation/response 所有权：

- 先 append → 外部终端清理删除该 list；
- 先终结 → 过期 append 被拒绝且不重建状态。

## 终端清理、fork 与迁移 {#terminal-cleanup-forks-and-migrations}

正常/合成 response settlement 本应已经删除其精确 frame 地址。当状态是 assistant/deferred `effect_pending` 时，operation 终端事务也会防御性地构造并删除当前 operation 拥有的 frame 地址。

Idle fork 从不复制 `pi.pending.assistant_frame` 地址族中的 list。精确 rewrite 与迁移会分页读取 frame list，并在保留它们时维持元素序列。

改变 `AssistantMessageFrame` 形状的迁移必须映射每一个存活元素，或显式删除整个 list，并让 `effect_pending` 恢复没有部分内容。它绝不能从遗留 frame 推断完成。

JSONL 在 snapshot compaction 之前保留已删除的 frame 字节。逻辑删除是立即的。

## 竞态 {#races}

| 竞态 | 要求结果 |
|---|---|
| frame append vs 下一个 frame | 同步 lane 入队保留 provider 事件顺序 |
| frame append vs stream settlement | settlement 等待最新 promise；所有已接受的 append 先完成 |
| 实时 update 事件 vs frame 提交 | 任一方都可能先完成；事件是观察，重连只使用已提交 frame |
| append vs 外部终结 | 先 append 会被清理删除；先终结会 fence 住该 append |
| 带排队写入的进程丢失 | 只 restore 已提交前缀 |
| 最终 frame vs response settlement | frame 先提交；settlement 原子删除 list 并插入最终 entry |
| 激活 vs snapshot | 两者归约同一已提交序列前缀；激活随后可能结算并清除它 |
| 未知 generation vs retry | 合成部分 error 在后续尝试开始之前，以旧的预留 ID 提交 |
| 未知 deferred poll vs 替换 | 旧 list 随新的替换 intent 删除；新 response ID 得到新 list |

## 不变量 {#invariants}

1. 标量 assistant/deferred 状态是唯一的重启权威。
2. 一个 effect-pending response ID 恰好构造一个 assistant frame-list 地址。
3. 每个存储元素都是导出的 pi-ai `AssistantMessageFrame`。
4. 终态 `done`/`error` 事件从不作为 frame 存储。
5. Frame 顺序是 provider 事件顺序的子序列；零 frame 的被覆盖事件不扰乱顺序。
6. 在 stream settlement 时等待最新 frame-write promise，意味着所有已接受的 append 都已完成。
7. Frame 从不确立 provider 完成，也不抑制未知结果恢复。
8. 最终或合成 response settlement 原子删除精确的 frame list。
9. Restore 后的部分内容可以出现在 `streamingMessage` 中，但在 settlement 之前绝不进入 `transcript`。
10. 被中断的部分 tool call 从不产生 tool plan，因为合成 response 以 `error`/`aborted` 停止。
11. 本切片中，结构性生成从不写入 `pendingAssistantFrames(...)` list。
12. 终端清理、外部终结和 idle fork 不留下 operation 拥有的 assistant frame list。

## 所需测试 {#required-tests}

### Frame 集成 {#frame-integration}

- 每个 stream 一个 encoder 处理共享的实时 partial 以及同步事件突发，且不产生重复内容；
- 每个事件 append 零个或一个 frame，被覆盖的排队 delta 不 append 任何内容；
- `done`/`error` 不 append 任何内容，包括生成前 error；
- 交错的 content index 保持序列；
- provider 循环不等待单次 frame 写入；
- frame append 在下一个 provider 事件之前同步入队；
- 只保留最新的 promise 引用；
- 等待最新 promise 意味着此前所有写入都已完成；
- 有界输出约束排队 frame 内存；
- 存储失败阻止 `after_response` 并使 harness 故障。

### Settlement 与恢复 {#settlement-and-recovery}

- 每一个普通 response 类别都原子删除 frame list；
- 在每一个 frame/settlement 边界崩溃；
- 无 frame，以及部分 text/thinking/tool-call frame；
- 权威的 end-frame 内容得以保留；
- 被中断的 generation 先提交部分合成 error，然后 retry 或在上限处失败；
- 被中断的部分 tool call 永不执行；
- 恢复使用零 usage 和现有预留 ID；
- 取消在合成 aborted response 中保留已提交的部分内容；
- restore 后的合成 settlement 从不运行 `after_response`。

### Deferred、snapshot 与生命周期 {#deferred-snapshots-and-lifecycle}

- deferred poll 的 frame 持久化与正常清理；
- 无 permit 的未知 poll snapshot；
- 替换 intent 删除被遗弃的 poll frame；
- 实时部分内容优先于持久化归约；
- 重新打开在 suspended 的 effect-pending lane 上暴露归约后的 `streamingMessage`；
- 不回放历史 update 事件；
- 恢复 settlement 在 `entry_added` 时清除部分内容；
- 结构性生成不写入 assistant frame list。

### 存储生命周期 {#storage-lifecycle}

- Memory/JSONL/SQLite 归约出相同的 frame 序列；
- 正常、合成、取消和外部终端转换之后 frame list 缺席；
- idle fork 排除 frame；
- JSONL compaction 移除已删除的 frame 字节；
- 迁移映射或显式丢弃每一个遗留 frame；
- 仪器记录 append/delete 顺序，telemetry 中不含 frame 内容。

## 实现地图 {#implementation-map}

预期的 runtime 区域：

- `session/values.ts` 中的内置 `pendingAssistantFrames(operationId, responseEntryId)` 地址构造器；
- `values.md` 中的绑定类型化 value/list 存储实现；
- assistant 执行 observer 与 generation 过程；
- deferred polling 过程；
- 激活与取消恢复；
- snapshot hydration；
- 终端清理、fork 与迁移；
- 带仪器的 writer 与 backend 一致性测试。

先实现绑定类型化 value/list 地址，然后是 frame 入队/settlement，然后是恢复/snapshot。在实现 runtime assistant 对等行为之前，用这一完整生命周期更新 `harness.md`。
