本文是 `execenv.md` 的中文阅读版；命令、路径、API 名称保持英文。

# ExecutionEnv：有界 shell 输出 {#executionenv-bounded-shell-output}

**状态：** 已在生产源码中实现。本文档旁边的原型文件是历史证据；生产代码位于：

- `packages/agent/src/harness/utils/adaptive-publisher.ts`
- `packages/agent/src/harness/utils/output-capture.ts`
- `packages/agent/src/harness/env/nodejs.ts`
- `packages/agent/src/harness/tools/bash.ts`

同一 publisher 的通用 `ToolOutput` 用法仍在 `04-tool-output`。

## 1. 问题 {#1-problem}

旧的 `Shell.exec()` 在 `NodeExecutionEnv` 内累积完整字符串：

```ts
stdout += chunk;
stderr += chunk;
```

bash 只在这些字符串已经建好之后才截断。因此 `cat 1gb.txt` 会在 worker 里物化一整个 GB，任何工具级边界都帮不上忙。

spill 也属于字节起源之处。若执行在远端，worker 上的 spill 对模型的 `read` 和 `grep` 工具不可达，而在传输之后再创建它，会先把完整的 GB 送过连接。

## 2. 边界 {#2-boundary}

`ExecutionEnv` 现在拥有：

- 有界的 head 或 tail 视图；
- 完整的字节与行总计；
- 视图首次越过限制后的惰性、源端本地 spill；
- 带有界写流反压的持久源端本地 spill；
- 对最新有界状态的自适应发布；
- 结算前一次强制的最终发布。

它不返回、也不保留分开的 `stdout` 和 `stderr` 值。两根管道喂入一个按到达顺序的、模型可见的文本视图，与 bash 和 `ToolOutput` 一致；若要在 tail 驱逐时保留流样式，需要分段的保留状态，而 Harness 并不暴露它。文本从更新中折叠而来，`ShellExecResult` 只包含退出码以及 truncation/spill 元数据。

bash 只拥有命令语义及其模型可见的页脚。它旧的滚动缓冲、spill 创建、100 ms 节流，以及完整输出累积都已去掉。现有的两秒持久化 checkpoint 请求暂时保留，直到 `ToolOutput` 拥有持久化节奏。

## 3. 契约 {#3-contract}

```ts
interface ShellOutputLimits {
  maxBytes: number;
  maxLines: number;
  retain?: "head" | "tail";
}

interface ShellOutputCaptureOptions {
  limits: ShellOutputLimits;
  spill?: boolean;
}

type ShellOutputTruncation = Omit<TruncationResult, "content">;

interface ShellOutputMetadata {
  truncation: ShellOutputTruncation;
  spillPath?: string;
  lastLineBytes?: number;
}

interface ShellOutputView extends ShellOutputMetadata {
  text: string;
}

type ShellOutputUpdate =
  | { kind: "replace"; output: ShellOutputView }
  | { kind: "append"; text: string; metadata: ShellOutputMetadata }
  | { kind: "slide"; drop: number; text: string; metadata: ShellOutputMetadata }
  | { kind: "metadata"; metadata: ShellOutputMetadata };

interface ShellExecResult extends ShellOutputMetadata {
  exitCode: number;
}
```

`drop` 计的是 JavaScript 字符串码元，与 `slice()` 一致。更新是有序的。消费者用 `applyShellOutputUpdate()` 应用它们。

完整替换用于建立初始状态，或在不存在已验证 overlap 时恢复。append 只携带增长的后缀。slide 丢掉前缀并追加新后缀。metadata 更新移动总计或 spill path，而不重发文本。

兼容辅助函数 `executeShellWithCapture()` 仍然返回一个有界的最终视图。它的 `onChunk` 回调只接收初始、append 和 slide 文本；metadata 以及窗口整体翻新后的替换不会被误标为新字节。

## 4. 自适应发布 {#4-adaptive-publication}

`AdaptivePublisher` 只保留最新的脏状态。进程的中间写入永远不会变成一串输出更新队列。

策略是 harness 全局的，而不是按工具：

```ts
minIntervalMs = 100;
targetBytesPerSecond = 100 * 1024;
nextDelayMs = max(minIntervalMs, encodedUpdateBytes * 1000 / targetBytesPerSecond);
```

空闲后的第一个脏状态立即发出。截止时间之前收到的写入折叠进最新的有界状态。一个尾随 timer 保证最终会发布。终结会绕过截止时间一次，仍受保留 cap 约束。

publisher 在调用消费者之前提交它的 baseline。若消费者应用了一次更新然后抛出，终结不能把同一 delta 发两次。命令以 `callback_error` 失败。

### 负载行为 {#workload-behavior}

| 负载 | 结果 |
| --- | --- |
| 在 cap 以下完成 | 立即的初始状态、小 append、强制的最终状态 |
| cap 以下的涓流 | 孤立写入立即发出；持续写入间隔最多 100 ms |
| 越过 cap 后的全力输出 | 完整翻新是按编码大小间隔的 cap 大小替换 |
| 越过 cap 后的涓流 | 小的已验证 `slide` 更新仍保持响应；完整窗口不会重发 |
| 突发然后静默 | 一次前导更新和一次尾随更新 |
| 错误、超时或中止 | 在错误结算前强制发出最新有界状态 |

在 50 KB cap 和 100 KB/s 目标下，重复的完整翻新会落在大约每秒两次更新。越过 cap 后的小 slide 仍使用 100 ms 下限。

速率边界是摊销的。空闲后立即更新和强制的终端更新各自可能造成一次 cap 有界的突发。

## 5. Capture 与 spill {#5-capture-and-spill}

当 `OutputCapture` 的已解码、感知行的工作缓冲超过 cap 的四倍时，会把它裁回 cap 的两倍。tail 模式丢掉旧文本；head 模式保留原始前缀。这摊销了 UTF-8 裁剪，而不是对每个进程 chunk 都重扫保留窗口。

spill 创建是惰性的。越过限制之前，源端最多保留创建完整归档所需的有界前缀。越过时它：

1. 暂停 stdout 和 stderr，同时在执行环境内创建文件；
2. 打开一条持久 append 流，带有 8 MB 有界高水位；
3. 按到达顺序写入保留的原始前缀以及随后的原始 chunk；
4. 在 writer 接受数据时立即恢复；
5. 仅当 `write()` 报告反压时再次暂停，然后在 `drain` 上恢复。

这既避免了无界 promise 链，也避免了每个进程 chunk 一次异步 open/append 周期。spill 创建或流写入失败会杀掉子进程并使执行失败，而不是发布有损的成功。

spill path 在可用时作为 metadata 强制发布。spill 写入在最终输出 flush 之前被等待完成。

Node 流对 spill 吞吐和精确归档字节保持原始。`OutputCapture` 使用一个流式 `TextDecoder`，因此读取边界不能切开一个码点；无效的显示控制字符只从有界快照中移除，而不是扫描完整原始流。行总计会计入最后一行未终止的行，即使一行超过工作缓冲，`lastLineBytes` 仍然精确。

## 6. 远程执行 {#6-remote-execution}

当 worker 与执行环境共置时，更新在进程内，这个 publisher 主要约束 capture 工作。`ToolOutput` 仍是下游事件 / 持久化限制器。

当执行环境与其 worker 物理上远程时，同样的有界更新穿过那条传输。全力输出不能传送完整流：中间写入在源端折叠，完整流留在源端本地 spill。

每一个真正昂贵的边界都有自己的 publisher 实例。共置部署可以绕过传输序列化；绕过 `ExecutionEnv` 的自定义工具仍会经过未来的 `ToolOutput` publisher。

## 7. 剩余工作 {#7-remaining-work}

- 把通用自定义工具的组合、文本保留、事件发布和持久化节奏移入 `ToolOutput`。
- 在那条下游边界用 Chord 操作替换整份 `AgentToolResult` progress。
- 让 memo 与 output checkpoint 持久化成为一笔原子事务。
- 从持久化输出 seed 重放，而不是删除它。
- 把 spill 放到环境拥有的会话目录中，并在会话寿命加上崩溃保留下限之后清扫它们。
- 为图像和结构化 details 决定显式限制；文本已有界，那些值还没有。
- 定义原始二进制输出行为。当前 shell 输出仍是有损 UTF-8 文本。
