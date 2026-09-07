本文是 `bash-worked-example.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 完整示例：`bash` 端到端 {#worked-example-bash-end-to-end}

一个工具穿过每一层。`execute` 被简化了 — 超时校验、取消和退出码分支被省略。输出路径上的一切都展示出来。

层次：exec env → `ToolOutput` sink → harness 事件 → 持久化存储 → lane 状态 → facet → 线路 → 消费者。

---

## 1. 工具 {#1-the-tool}

```ts
// packages/agent/src/harness/tools/bash.ts
export interface BashToolDetails { spillPath?: string; truncation?: ShellOutputTruncation }

export function createBashTool(): AgentHarnessTool<ExecutionToolContext, typeof bashSchema, BashToolDetails> {
  return {
    name: "bash",
    parameters: bashSchema,
    output: { retain: "tail", maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES },

    async execute(_id, { command, timeout }, signal, out, context) {
      const env = context.env;
      let view: ShellOutputView | undefined;

      const result = getOrThrow(await env.exec(command, {
        cwd: env.cwd,
        inheritEnv: true,
        timeout,
        capture: { limits: this.output, spill: true },
        onUpdate: (u) => {
          view = applyShellOutputUpdate(view, u);
          if (u.kind === "append") out.write(u.text);
          else out.replace(view.text);
          out.details.truncation = view.truncation;
          if (view.spillPath) out.details.spillPath = view.spillPath;
        },
      }, context));

      if (result.spillPath) out.details.spillPath = result.spillPath;
      if (result.truncation.truncated) out.write(`\n\n[${describe(result.truncation)}]`);
      if (result.exitCode) throw new Error(`Command exited with code ${result.exitCode}`);
    },
  };
}
```

今天的实现里消失的东西：滚动的 `tailOutput` 缓冲、`truncateTail`、`ensureFullOutputFile`、`createTempFile`、`BASH_UPDATE_THROTTLE_MS`、`BASH_CHECKPOINT_INTERVAL_MS`、`updateDirty`、`lastCheckpoint`、`scheduleOutputUpdate`、`emitOutputUpdate`、`clearUpdateTimer`。大约 40 行工具本地机制，被每个工具都能得到的 capture 策略取代。

`execute` 返回 `void`。`details` 是一个字段，设置一次 — 并且注意工具不再计算 `truncation`，因为 env 拥有窗口，工具不再知道丢掉了什么。

## 2. exec env 在源头封顶 {#2-the-exec-env-caps-at-the-source}

`env.exec` 在字节起源处应用 `ShellOutputLimits`。对 sandbox host 来说，这意味着 `cat 1gb.txt` 永远不会把 1 GB 运到 agent 机器，而 spill 落在模型自己的 `read` 和 `grep` 运行的地方。见 [`execenv.md`](../03-execenv/execenv.md)。

初始状态是一次有界的 `replace`。增长发出 `append`；移动的 tail 发出 `slide { drop, text }`；完整翻新回退到一次有界的 `replace`；metadata 移动总计和 spill path，而不重发文本。自适应 publisher 让小 slide 保持响应，并按编码大小间隔 cap 大小的翻新。

## 3. sink {#3-the-sink}

`ToolOutput` 把它们折叠进 `ToolOutputState`：

```ts
{
  content: [{ type: "text", text: "…the retained window…" }],
  details: { spillPath: "/tmp/pi-session-x/bash-8f2.log" },
  usage: undefined,
  addedTools: undefined,
  terminate: false,
  truncation: { truncated: true, truncatedBy: "bytes", totalLines: 8123, totalBytes: 262144 },
}
```

`out.write(text)` 追加到 `content[0].text`；当 env 发送 `snapshot` 时，`out.replace(text)` 赋整份保留视图，因为 append 无法表达驱逐。tracker（`delta.md`）无论哪种方式都记录意图：append 是 `a`，整份赋值的窗口滑动经已验证的 overlap 检测变成 `t` + `a`。

## 4. Ops {#4-ops}

约 20 次 flush 的 256 KB 构建，50 KB 窗口：

第一批是 base batch — 以 `r` 开头，携带初始状态。之后的一切都是 delta。重复的 content path 在第二次使用时被 intern，随后其上的连续 op 完全省略 id：

```jsonc
[["r",{"content":[{"type":"text","text":""}],"details":{},"terminate":false,"truncation":{…}}]]

[["a",["content",0,"text"],"make: Entering directory …\n"]]
[["#",0,["content",0,"text"]],["a",0,"cc -c src/a.c …\n"]]
[["a",0,"cc -c src/b.c …\n"]]
…
[["s",["details","spillPath"],"/tmp/pi-session-x/bash-8f2.log"]]
…
[["t",0,4096],["a","cc -c src/z.c\n"],["s",["truncation","totalBytes"],262144]]
```

details 是一个 `s`，出现在二十次 flush 中的一次。`t` + `a` 对是窗口滑动。当前 tracker 通过已验证的 overlap 恢复它；生产重新测量表明通用路径已经可忽略，因此不增加显式 append/truncate 生产者 API（[决定](../01-delta/append-decision.md)）。

## 5. Harness 事件 {#5-harness-events}

```ts
{ type: "tool_start",  toolCallId: "call_7", toolName: "bash",
  args: { command: "make -j8" } }

{ type: "tool_update", toolCallId: "call_7", ops: [ … ] }

{ type: "tool_end",    toolCallId: "call_7", isError: false }
```

`tool_start` 只有身份 — 没有 `caps`，没有 `initial`。第一批是 base batch，因此初始状态走更新通道到达，而 caps 已经作为 `truncation.maxBytes` / `maxLines` 在其中。

`tool_end` 不携带 content，也不携带 details。每一个字节都已经发出；再发一遍会复制任何图像。

## 6. 持久化存储 {#6-durable-storage}

`pendingToolOutput(operationId, "call_7")`，**ephemeral-scoped** 到该 operation，因此它活在 `<session>.op_….jsonl` 里，并在 settle 时退役，而不是永远留在主日志中。退役是主日志里的一条 `retireScope` 记录，因此它与 settle 写入原子提交；unlink 是重放该记录的后果，而不是事务的一部分（[scopes.md §5](../02-scopes/scopes.md)）。

一个 `list<WireOp[]>`，每次 flush 追加一个编码批次，base batch 打上 `"base"` 标签，以便恢复用 `stopAtTag` 向后读并停在那里（[scopes.md §11](../02-scopes/scopes.md#11-list-tags-and-stop-conditions)）。tracker 发出结构 op；生产者定期调用 `rebase()` 以写入有 cap 的根替换，并限制恢复重放。持久化间隔是 sink 策略。Shell capture 只控制源状态和传输发布；memo、终端和 recovery-base flush 由 `ToolOutput` 强制。

恢复从该状态 seed 一个新的 `ToolOutput` — 它**不会**删除它，而这正是今天 `clearReplayCheckpoint` 的做法，是一个 bug（`harness-tools.md` §7.4）。如果 bash 把「spill 到 /tmp/…」memo 化后崩溃，丢弃该状态的重放会创建第二个 spill 文件并丢失第一个。

memo 写入与这次 checkpoint 在同一事务中提交。两者都是 ephemeral-scoped，因此都落在同一个 sidecar — 并且类型系统拒绝混合 scope 的提交，所以这不能静默回归。

## 7. Lane 状态与 facet {#7-lane-state-and-the-facet}

```ts
export function reduceLaneSnapshot(view: LaneView, event: HarnessEvent): void {
  switch (event.type) {
    case "tool_start":
      view.operation.tools.push({ id: event.toolCallId, name: event.toolName,
                                  args: event.args, output: undefined });
      return;
    case "tool_update": {
      const tool = view.operation.tools.find((t) => t.id === event.toolCallId);
      if (tool === undefined) return;                  // host will send a base batch
      tool.output = apply(tool.output, event.ops);
      return;
    }
    case "tool_end": {
      const i = view.operation.tools.findIndex(t => t.id === event.toolCallId);
      if (i >= 0) view.operation.tools.splice(i, 1);
      return;
    }
  }
}
```

普通 mutation，没有 Immer，没有返回值。对视图从未见过的工具的事件什么也不做；host 发送一次 `replace`。

lane facet 在 tracker 下运行同一个函数，因此 facet 自己的 ops 相对**它的**形状产生 — 那不必是 `LaneView`，通常也不是。facet 从不写 op。

## 8. 线路与消费者 {#8-wire-and-consumer}

```jsonc
{ "seq": 0, "ops": [["r",{"transcript":[],"operation":null}]] }
{ "seq": 1, "ops": [ … ] }
```

一种形状：一批 ops。第一批是 base batch — 以 `r` 开头 — 之后的一切都是 delta。缺口、重连、provider 重载，或一次无法全部应用的 fold，都走同一条路径：发送一次新的 `replace`。

消费者是 `apply` — 六个动词，没有领域知识，没有库，没有工具代码，作用在它拥有的普通可变对象上。

## 9. 这次运行的成本 {#9-what-this-run-costs}

256 KB 输出，约 20 次 flush，50 KB 窗口：

| | 今天 | 本设计 |
|---|---|---|
| 持久化写入 | 每次 checkpoint 完整的 `AgentToolResult` | 结构 op 加上显式的周期性有 cap 的 base batch |
| 持久化位置 | 主日志，永久 | sidecar，settle 时 unlink |
| 每次 flush 的线路 | 整份快照 | 一次 `truncate` + 一次 `append` |
| details 写入 | 每次 flush 整份重建 | 一次 `set`，一次 |
| 截断逻辑 | 在 `bash.ts` | 在 exec env，所有工具共享 |
| spill 位置 | `/tmp`，由 OS 清理 | exec env，会话范围 |

details 这一行值得多停留。bash 的 details 本身没有任何变化 — 它们一直很小。变化的是它们不再搭乘一个每次更新都被整份替换的容器，这就是为什么目前没有任何工具费心去增量 mutation 它们。
