本文是 `README.md` 的中文阅读版；命令、路径、API 名称保持英文。

# pi — 设计交接 {#pi--design-handoff}

按编号顺序推进。每个单元自成一体、可独立测试；后续单元会消费前面的成果。

```
01-harness/
  01-delta/            op vocabulary, tracker, applier, codec   [LANDED IN CHORD]
  02-scopes/           storage scopes and list tags              [STEP 1 ACTIONABLE]
  03-execenv/          bounded Shell output, capture, spill      [PRODUCTION CODE + TESTS]
  04-tool-output/      the ToolOutput sink                       [SPEC ONLY]
  05-assistant-output/ assistant partials, symmetric with 04     [SPEC ONLY]
02-plugins/
  01-facets/           the facet system                          [SPEC ONLY]
  02-sandbox/          isolated-vm membrane                      [CODE + 412 tests]
```

一切工作以干净检出的 `origin/dev` 为基准。

## 先读这里 {#read-this-first}

**三个单元交付可运行代码。四个是规格说明。** 上表标明了各自状态。不要假定文档描述的东西已经存在。

**`01-delta/FINDINGS.md` 是历史证据，不是实现队列。** 生产代码在 `packages/chord/src/delta/index.ts`：flush 时的 dirty tracking 修复了 D1，生产环境的重新测量关闭了 D2。显式 append/truncate API 已被否决；见 [`01-harness/01-delta/append-decision.md`](01-harness/01-delta/append-decision.md)。交接文档旁边的代码仍是原型与基准测试证据。

**若文档与代码不一致，以代码为准** — 修正文档，并在 commit 中说明。

**先移植测试，再移植实现。** 每组测试的注释说明了它要防止的失败，其中若干失败是静默的：输出错误，却不抛异常。

**用 `node --experimental-strip-types` 做基准测试，切勿经过转译器。** 经 `tsx` 测量本模块会把结果放大 2.6 倍。`FINDINGS.md` D5 还列了五个测量陷阱，每一个都曾得出自信但错误的结论。

## 单元状态 {#unit-status}

| 单元 | 交付物 | 状态 |
| --- | --- | --- |
| **01-delta** | 生产实现与测试在 `packages/chord`；此处为原型证据 | 已落地；D1 已修复，生产重新测量后否决了显式文本 API |
| **02-scopes** | 规格 + [可执行的 Step 1 交接](01-harness/02-scopes/implementation-handoff.md) + `scopes.variance.ts` | Step 1 的 scope / list tag 可执行，尚未实现；JSONL Chord 编码 / 地址 intern 推迟到另行批准的 Step 2 |
| **03-execenv** | 生产实现在 `packages/agent`；此处为原型证据 | 源端有界自适应输出、惰性 spill 反压，以及 bash 迁移已落地；bash 的临时 checkpoint 节奏下一步交给 `ToolOutput` |
| **04-tool-output** | 规格 + 设计笔记 | **尚未构建。** 每一次 op 编码测量都依赖的那一块 |
| **05-assistant-output** | 规格 | 尚未构建。形状与 04 相同；放在 04 之后做 |
| **02-plugins/01-facets** | 规格，约 1800 行 | 尚未构建。§14 已按 sandbox PoC 重写 |
| **02-plugins/02-sandbox** | 可运行 PoC，412 条断言 | `npm install && npm run audit` |

## 建议顺序 {#suggested-order}

1. **`02-scopes` Step 1** — 按 [可执行的实现交接](01-harness/02-scopes/implementation-handoff.md) 推进；在其独立的 Step 2 之前停下来等待批准。
2. **`04-tool-output`** — 把已落地的自适应 publisher 复用到通用工具、Chord 事件 / 持久化批次、终端 flush，以及原子 memo checkpoint。
3. **05**，然后 **02-plugins**。

## `origin/dev` 上的现存 bug，与本设计无关 {#live-bugs-on-origindev-independent-of-this-design}

- `drive/tools.ts:257` — `clearReplayCheckpoint` 在重新执行 replay-safe 工具之前删除了 `pendingToolOutput`。memo 的存在正是为了让重放的工具跳过已完成的工作，而跳过的工作不会再发出任何内容，因此被 memo 化的工作的输出今天会丢失。应从它 seed（见 `harness-tools.md` §7.4）。
- `runtime/progress.ts:44` — `commitWrite(item)` 在调用时捕获值，并以 fire-and-forget 方式写入，因此较旧的 checkpoint 可能在较新的之后落地。
- memo 与 checkpoint 是两笔事务（`drive/tools.ts:112` 对 `progress.ts:44`）。它们必须是一笔（`harness-tools.md` §7.5）。

**预期的测试扰动：** 有九个测试断言旧的清理写入集合，一旦 `retireScope` 取代按地址删除，它们就会失败。那正是即将落地的变更。

## 环境 {#environment}

- 每一个交付的 `.ts` 文件都需要 Node 22+。它们在 `node --experimental-strip-types` 下运行，没有构建步骤，也没有依赖。
- 在 pi 仓库中，测试从包内运行：
  `cd packages/agent && npx vitest run --config vitest.harness.config.ts`。
  根 vitest 配置**不会**为 `@earendil-works/pi-ai` 设置 alias；包级 harness 配置会。
- 从仓库根目录用 `npx tsgo --noEmit` 做类型检查。**基线约有 788 个既有错误**，几乎都在 `packages/ai/test`。只统计：
  `grep "error TS" | grep -E "packages/(agent|session-backends)/src"`。
- `packages/ai` 无法离线构建 — 模型数据在构建时拉取。
