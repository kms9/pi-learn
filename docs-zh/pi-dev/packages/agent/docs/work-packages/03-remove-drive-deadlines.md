本文是 `03-remove-drive-deadlines.md` 的中文阅读版；命令、路径、API 名称保持英文。

# WP03 — 移除 drive deadlines {#wp03--remove-drive-deadlines}

## 状态 {#status}

已完成。`DriveOptions.deadline` 以及 `DriveOutcome` 的 `yielded` 分支已从公开类型、现行文档、后续包要求、不变量、竞态和测试中移除。过时的 `runtime2.md` 已删除。聚焦测试、`npm run check` 和 `./test.sh` 通过。

WP02 在 `beac75ecc` 完成。保留无关的并发源码工作，尤其是当前 `packages/agent/src/harness/runtime2/lane.ts` 的变更、JSONL/fork 工作、plugins、RPC 以及 experimental 目录。

## 问题 {#problem}

`DriveOptions.deadline` 以及对应的 `DriveOutcome { kind: "yielded" }` 并不提供正确性边界。

Deadline 只在开始另一次 transition 或 effect 之前检查。一个已被接纳的 provider/tool/hook 可以越过它继续运行，而宿主仍可能终止进程：

```text
check deadline
→ admit provider or tool
→ host limit expires while the effect is running
→ process dies with durable effect_pending
```

未知结果的恢复仍然是强制的。因此 deadline 并不能防止进程丢失、约束已接纳的工作、让 effects 恰好一次，或简化恢复。Flue 风格的 tool memoization 依赖稳定的 invocation ids 和持久 memos，而不是 drive deadlines。

Deadline 处理反而把挂钟策略加进了持久核心：

- 一个与持久状态无关的 `yielded` 公开 outcome；
- 在 hooks/effects/transitions 之前的安全边界检查；
- deadline 对 retry-timer 的仲裁；
- deadline 对 effect-admission 的竞态；
- 为 yields 准备的便利循环和 event-bracket 行为。

宿主已经拥有调度和终止。进程丢失是受控的崩溃边界，从持久 operation 状态恢复。

## 决策 {#decision}

彻底移除 drive deadlines：

```ts
interface DriveOptions {
  operationId: string;
  waitForRetry?: boolean;
  pollDeferred?: boolean;
}

type DriveOutcome =
  | { kind: "settled"; operationId: string; outcome: TerminalOperationOutcome }
  | { kind: "waiting"; operationId: string; reason: "retry"; notBefore: number }
  | { kind: "waiting"; operationId: string; reason: "deferred"; deferred: DeferredHandle }
  | { kind: "action_required"; operationId: string; action: ActionInfo };
```

WP03 中没有废弃别名、被忽略的 `deadline` 字段、兼容重载、替代时间戳选项，或替换用的 pause 标志。

下一个 drive 包使用直接持久 transitions。确定性测试门控 commits，并控制 hooks、providers、tools 和 timers，而不添加生产执行屏障。

## 宿主行为 {#host-behavior}

宿主拥有执行预算：

```text
invoke drive
→ terminal or durable waiting result: schedule normally
→ planned shutdown: stop routing/releasing work and close session processes
→ forced termination: replacement attaches and recovers durable open operations
```

按 session 一个进程的宿主可以在退出前停止路由工作并关闭，并把进程终止当作针对不合作的 providers、tools、hooks、storage 或 event listeners 的硬栅栏。这项操作策略不要求 `DriveOptions` 中有挂钟字段。

WP03 不添加 `stopAfterCheckpoint`、`pause`、`quiesce` 或进程内崩溃模拟。这些想法仍在直接持久 drive 设计之外。进程内的进程丢失模拟不是公开的核心原语：旧 continuation 需要 fencing，而进程隔离才是可靠机制。

## 工作 {#work}

### 公开类型 {#public-types}

在 `packages/agent/src/harness/agent-harness.ts` 中：

- 删除 `DriveOptions.deadline`；
- 删除 `DriveOutcome` 的 `yielded` 分支；
- 原样保留 expected-id fencing、retry waiting、deferred waiting 以及 manual action 分支。

当前不存在 runtime2 drive 实现，因此本包不添加执行行为或 owner。

### 规范性文档 {#normative-documentation}

完整更新 `packages/agent/docs/harness.md`：

- 从 non-goals/orientation 中移除安全 yield 调度语言；
- 只移除 §3.6、§5.6 的 `before_drive` 行以及 invariant 22 中 cancellation/deadline 前置措辞的 deadline 那一半；cancellation 前置条件保留；
- 从 drive-pass 伪代码中移除 deadline 检查和 yielded 返回；
- 从 pass joining、retry waiting、便利组合、recovery 以及公开方法散文中移除 deadline 策略；
- 从 `DriveOptions` 移除 `deadline`，从 `DriveOutcome` 移除 `yielded`；
- 移除特定于 deadline 的 event/turn 要求；
- 从 `before_drive` hook 时机中移除 deadline 语言；
- 从 future work rows 中移除 deadline/yield 要求；
- 用明确的无挂钟策略不变量替换 invariant 25，同时保留“已被接纳的 effect 正常结算，或在任务丢失后被恢复”这条规则；
- 从 race catalog 中移除 deadline 竞态；
- 更新 drive-pass 术语表。

不要改动通用 RPC timeout/deadline 文档或无关的 process/model-catalog timeouts。那些是 invocation/transport 策略，不是 `AgentLane.drive`。

删除过时的 `packages/agent/docs/runtime2.md`；`harness.md` 加上所链接的交接文档，就是现行工作所需的唯一实现计划和历史。

在其交接文档和 Part 8 中把 WP02 标为完成。把 WP03 加为具体的清理包。把原先的 R2/R3 drive rows 保留为历史 future candidates，去掉 deadline/yield 要求，直到经过评审的 direct-drive 交接文档替换它们。

### 删除 {#delete}

- `packages/agent/docs/runtime2.md`

### 类型测试 {#type-tests}

扩展 `packages/agent/test/harness/types.test.ts`：

- 断言 `keyof DriveOptions` 恰好是 `"operationId" | "waitForRetry" | "pollDeferred"`；
- 断言 `DriveOutcome["kind"]` 排除 `"yielded"`；
- 加入 `@ts-expect-error` 覆盖，证明调用方不能提供 `deadline`；
- 保留现有的 drive/result 签名。

编辑后运行该聚焦类型测试。

### 下游兼容 {#downstream-compatibility}

搜索 protocol、server、coding-agent、examples 以及测试中对 `DriveOutcome` 的结构镜像或穷尽 switch。只更新因这次公开移除而被迫的编译期/类型兼容。Coding-agent experimental worker/remote-runtime 行为与测试超出范围。

当前 protocol harness schemas 暴露 prompt/run/watch DTO，而不是 `DriveOptions` 或 `DriveOutcome`；除非最终搜索证明否则，预期不需要改 protocol。

## 非目标 {#non-goals}

WP03 不实现或重设计：

- `drive`、`resume`、prompt 便利方法、operation ownership 或 latest-result 查找；
- 手动 actions 或自动 barrier 释放；
- provider/tool 执行、recovery、retry timers、deferred polling、abort 或终端结算；
- checkpoint pause/quiesce；
- close 接纳变更；
- worker/RPC cancellation 或 experimental remote prompting；
- storage/schema/migration 行为。

## 必需检查 {#required-checks}

```bash
# No drive deadline/yield contract remains in active harness docs or source.
rg -n 'deadline|yield' \
  packages/agent/src/harness \
  packages/agent/test/harness \
  packages/agent/docs/harness.md \
  packages/agent/docs/work-packages

cd packages/agent
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run \
  test/harness/types.test.ts

cd "$(git rev-parse --show-toplevel)"
git diff --check
npm run check
./test.sh
```

移除 grep 仍可能匹配本交接文档中的历史问题说明。每一处剩余匹配都必须审查；任何现行 API、规范性行为、未来验收标准或测试期望都不得保留被移除的契约。

## 评审 {#review}

实现前：

1. Fable 对照完整文档/源码评审本交接文档。
2. 按用户明确要求，`openai-codex/gpt-5.6-sol` 以 thinking level high 评审。
3. 解决全部发现并重复，直到没有发现。

实现后，对最终文档/类型 diff 重复这两次评审。

## 停止条件 {#stop-condition}

当下列条件满足时停止：

- `DriveOptions` 没有挂钟预算；
- `DriveOutcome` 没有 `yielded` 分支；
- 现行规范性文档不含 deadline/yield 行为；
- 未来 drive rows 不含隐藏的 deadline 要求；
- 类型测试证明移除；
- 无关的 timeout/deadline API 未被触碰；
- 聚焦测试、`npm run check` 和 `./test.sh` 通过；
- 最终 Fable 和 Codex 评审没有发现。

不要在本包中开始直接持久 drive 的实现。
