本文是 `00-runtime1-removal.md` 的中文阅读版；命令、路径、API 名称保持英文。

# WP00 — 移除 Runtime1 {#wp00--runtime1-removal}

## 状态 {#status}

已完成。无 tag。Runtime2 是唯一的公开实现。在其执行路径尚未完成时不要发版。

## 目标 {#goal}

让 runtime2 成为唯一的公开 harness 实现，删除 runtime1 及其过时测试，然后停止，不要再往 runtime2 添加行为。

## 前置条件 {#prerequisites}

- 已批准的 acceptance/hook 重设计以及 durability 交接文档，已写入 `harness.md`、`values.md`、`assistant-durability.md` 和 `tool-durability.md`。
- 现有测试是证据，不是权威。

## 工作顺序 {#work-in-order}

1. **对齐契约。** 把已批准的 acceptance/hook 重设计并入 `harness.md`，包括持久的 `starting`、无 hook 的原子接纳、driver 拥有的 `before_run`、`before_drive`、请求局部的 system-prompt 变换、受信任的 restore，以及移除 process-origin 激活语义。审计 §§0.4、1.2、3.1–3.6、4.1–4.2、4.5、5.1–5.2、5.5–5.6 以及 Parts 8–9；删除每一处过时的 `BeforeResumePrepared`、`before_resume`、`resumeData`、`systemPromptOverride`、stable-ID 路由、reservation，以及 `fresh | continue | resume` 激活引用。一旦 `harness.md` 和所链接的交接文档成为现行契约的所有者，就删除过时的 runtime 规划文档。
2. **删除前先收割。** 检查 `agent-harness-runtime.test.ts`、`agent-harness-r2/r3/r4.test.ts` 以及旧的 `restore.test.ts`。把独特场景保留到详细的 future rows 或一份临时分类清单中；明确丢弃旧的 reservation、`before_resume`、`resumeData`、持久化 hook prompt override、语义 restore 审计，以及 `outcome_ready` 之前的 tool-crash 行为。
3. **移除仅属于 runtime1 的公开成员。** 删除 `before_resume`、`BeforeResumePrepared`、`resumeData`、`systemPromptOverride` 以及 stable hook-ID 路由。加入已批准的 `before_drive` 和 `transform_context` 形态。更新 telemetry schema 源并重新生成其文档。此处不要实现 `starting` 或接纳行为。
4. **切换工厂。** 添加 `packages/agent/src/harness/runtime2/index.ts`，让 `agent-harness.ts` 指向它，并加入一条构造选择回归测试。验证 experimental coding-agent worker 仍能创建 harness、订阅事件并关闭它。
5. **删除** 下列 runtime1 源码和测试。
6. **在 `main` 或 pull-request 分支上更新 `[Unreleased]`**，记录公开的破坏性移除以及暂时不完整的工厂。仓库策略禁止在 `dev` 上改 changelog，因此 WP00 在此记录但不执行该面向发版的步骤。
7. 运行保留下来的测试和检查。修复每一处失败；不要恢复兼容垫片。

## 删除 {#delete}

```text
packages/agent/src/harness/runtime/**
packages/agent/src/harness/restore.ts
packages/agent/test/harness/agent-harness-runtime.test.ts
packages/agent/test/harness/agent-harness-r2.test.ts
packages/agent/test/harness/agent-harness-r3.test.ts
packages/agent/test/harness/agent-harness-r4.test.ts
packages/agent/test/harness/restore.test.ts
packages/agent/test/harness/scratch/r1.ts
packages/agent/test/harness/scratch/r2.ts
packages/agent/test/harness/scratch/r3.ts
packages/agent/test/harness/scratch/r4.ts
```

## 保留 {#retain}

- 全部 `test/harness/runtime2/**` 测试；
- Session、Branch、storage、repository、backend-conformance 以及 instrumentation 测试；
- execution assistant/tool/primitives 测试；
- config、hooks、events、telemetry、compaction 以及 branch-summary 的代码/测试；
- `types.test.ts`，按缩减后的公开契约更新；
- `packages/agent/src/agent-loop.ts` 保持不变。

不要把过时的 runtime1 套件参数化到 runtime2 上，也不要保留 runtime1 smoke 套件。

## 验收 {#acceptance}

- 没有任何源码 import 引用 `harness/runtime/*`。
- 公开的 `AgentHarness.create()` 选择 runtime2。
- Runtime2 的创建、事件、inspection、close 以及 fault 测试通过。
- 这些 coding-agent 测试通过：
  - `experimental-remote-runtime.test.ts`
  - `experimental-session-worker-manager.test.ts`（被移除的 `experimental-session-worker.test.ts` 的上游替代）
  - `experimental-session-worker-lifecycle.test.ts`
- 每一个被修改的测试都能单独通过。
- Agent 与根 TypeScript 通过。
- `git diff --check` 和 `npm run check` 通过。

## 产出 {#outcome}

- 已接受的 hook/drive 契约在 `harness.md` 中具有规范性；过时的 acceptance/resume 契约不复存在。
- Runtime1 源码、validating restore、过时套件以及 R1–R4 scratch 场景已删除。
- `AgentHarness.create()` 通过 `runtime2/index.ts` 解析；一条构造选择回归测试证明这一点。
- 场景收割把缺失的 tool-close、identity-preflight、recovery-ordering、turn-bracket 以及 telemetry 用例补进了 future rows。
- 上游在本交接文档起草之后新增了两个真实的 remote prompt 测试。它们仍然存在，但因 runtime2 执行路径有意不完整而以 R2 重新启用要求被 skip。Worker 的创建、attachment、lifecycle、operation correlation 以及 close 覆盖通过。

## 非目标 {#non-goals}

- 不实现 bound-value/list。
- 不实现 `starting` 或原子接纳。
- 不实现 drive owner、provider、retry、deferred 或 tool 执行。
- 不做 runtime1 对等性工作、兼容层、archaeology tag 或发版。

## 停止条件 {#stop-condition}

一旦 runtime1 已不存在、runtime2 是公开工厂、保留覆盖为绿、且全部检查通过，即停止。报告删除情况和收割到的场景；不要开始下一个工作包。
