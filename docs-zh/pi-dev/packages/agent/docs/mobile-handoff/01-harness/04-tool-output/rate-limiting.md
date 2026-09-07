本文是 `rate-limiting.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 有界输出发布 {#bounded-output-publication}

**状态：** 共享的自适应 publisher 及其 `ExecutionEnv` 用法已实现。通用 `ToolOutput` 集成仍是设计工作。

依赖于已落地的 Chord delta tracking、源端有界执行输出，以及用于持久化批次的 scoped 存储。

## 1. 不变量 {#1-invariant}

> 持久化记录、模型所见，以及 UI 所展示的，是同一份有界视图。

spill 文件不是第二份视图。它是执行环境内的一个文件，模型通过普通文件工具到达它。

每一个不受控的生产者边界都需要两个独立的界限：

- **状态大小：** 最新保留文本有 cap；
- **发布：** 编码字节与事件数量都要被节奏控制。

delta 编码是互补的。它压缩一次已发布的变更；它不给状态封顶，也不决定何时发布。

## 2. 边界 {#2-boundaries}

```text
remote process
  -> optional ExecutionEnv publisher
  -> worker ToolOutput publisher
  -> events + durability + replication
```

只有在真正昂贵的边界之前才需要一个 publisher 实例：

- 物理上远程的执行环境在传输前限制输出；
- `ToolOutput` 限制自定义工具以及下游事件 / 存储流量；
- 共置环境可以在进程内喂入其有界更新，而不再经过一次序列化传输；
- 自定义工具可以绕过 `ExecutionEnv`，但不能绕过 `ToolOutput`。

控制算法是共享的。载荷词汇不同：Shell 使用 replace/append/slide/metadata；`ToolOutput` 使用 Chord 操作。

## 3. 为什么单靠大小或节奏不够 {#3-why-size-or-cadence-alone-is-insufficient}

固定的 50 KB 快照对单次事件是安全的，但随时间并不安全。在 100 ms 下它允许每秒十份完整快照，大约 500 KB/s 外加信封。

单靠字节预算也会允许过多的微小事件和持久化事务。最小间隔约束次数；编码大小债务约束带宽。

原始交接错误地把 `intervalMs = 100` 当成 100 次发出/秒。它是十次发出/秒。固定间隔仍然非自适应：它拖延小涓流，同时以同样频率允许完整窗口。

## 4. 已落地的自适应算法 {#4-landed-adaptive-algorithm}

`packages/agent/src/harness/utils/adaptive-publisher.ts` 实现：

```ts
nextDelayMs = max(globalMinEmitInterval, encodedUpdateBytes * 1000 / globalTargetBytesPerSecond);
```

当前 harness 全局策略：

```ts
minEmitInterval = 100 ms;
targetBytesPerSecond = 100 KB/s;
```

行为：

1. 空闲后的第一个脏状态立即发布。
2. 下一个截止时间之前的写入折叠进最新状态。
3. 一个尾随 timer 在截止时间之后发布被暂扣的状态。
4. 完成与正确性边界强制一次有界发布。
5. publisher 在交付给消费者之前提交其 baseline，防止消费者应用后抛出时出现重复 delta。

这是带 cap 大小突发的摊销 token bucket。前导或强制的终端更新可能在短间隔内超过目标，但持续编码字节会收敛到目标，持续事件数除显式强制的正确性写入外不能超过最小间隔下限。

## 5. 场景轨迹 {#5-scenario-traces}

假设 50 KB cap、100 KB/s 目标，以及 100 ms 下限。

### cap 以下，完成 {#below-cap-completes}

初始状态立即发布。小 append 发布不快于下限，最终脏状态被强制发出。总编码文本大约等于产生的文本。

### cap 以下，涓流 {#below-cap-trickling}

间隔超过 100 ms 到达的写入立即发布，因为前一个截止时间已经过去。更快的写入折叠成每个下限间隔一次 append。

### 越过 cap，全力 {#above-cap-full-force}

保留状态从不超过 50 KB。完整窗口翻新编码为有界替换。大约 50 KB 的更新买到大约 500 ms 的静默，因此无论原始生产者吞吐如何，大约每秒两次更新、100 KB。

对 shell 执行，完整流在反压下进入源端本地 spill，而不是走输出更新通道。

### 越过 cap，涓流 {#above-cap-trickling}

一次小的 tail 移动编码为 truncate 加 append（Chord）或 `slide`（Shell）。其编码大小很小，因此 100 ms 下限占主导，输出保持响应。为每次微小滑动重发完整的 50 KB 快照会既更慢也更大。

### 突发然后静默 {#burst-then-silence}

前导状态立即发出。被暂扣的写入折叠，一个尾随 timer 发布最新残留。没有轮询 timer。

### 一次巨大写入 {#huge-single-write}

生产者可能已经分配了其输入，但边界只保留并发布配置的 cap。Shell spill 保留完整源流。任意自定义工具的图像和结构化 details 仍需要单独限制。

## 6. 强制写入 {#6-forced-writes}

这些会绕过节奏一次，同时仍受状态大小约束：

- 命令 / 工具完成；
- 错误或中止；
- 原子提交的 memo 与 output checkpoint；
- 显式的 recovery base / rebase。

终端 flush 在 `tool_end` 之前取消尾随 timer，防止已结算调用出现迟到的更新。

## 7. `ToolOutput` 应用 {#7-tooloutput-application}

sink 将为每次调用拥有一个 Chord tracker 和 encoder。发布被阻塞时 mutation 仍保持本地；flush 时的 dirty tracking 意味着被暂扣的写入会折叠，而不为每次写入保留一个 op。

一次 sink flush 喂入实时事件和当前模型可见状态。持久化批次使用同一次逻辑 flush，编码为每条流的 `WireOp[]`。周期性 `rebase()` 限制恢复重放；memo 正确性 flush 在与 memo 同一事务中写入打了标签的 base batch。

持久化节奏属于 sink，不属于 Shell 或 bash。bash 现有的两秒 checkpoint 请求仅作为过渡兼容机制保留，直到 sink 迁移完成。

## 8. 剩余决定 {#8-remaining-decisions}

- 图像的显式字节 / 数量拒绝策略。
- 结构化 details 的界限；任意 JSON 无法有意义地做 tail 窗口化。
- 普通持久化写入最初是搭乘每一次实时 sink 发布，还是使用更慢的、测过的节奏。memo 和终端正确性 flush 不是可选项。
- 在对真实远程传输和存储做 profile 之后的精确全局生产数值。
