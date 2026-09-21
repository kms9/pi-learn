---
title: Pi agent core 与 coding-agent
type: source
status: active
created: 2026-09-07
updated: 2026-09-10
source_path: pi-dev/packages/agent
tags:
  - project-wiki
  - source-summary
---

# Pi agent core 与 coding-agent

## 来源

- 本地路径: `pi-dev/packages/agent/`、`pi-dev/packages/coding-agent/`
- 外部: https://github.com/earendil-works/pi （submodule）
- 来源日期: ingest 时 HEAD `92d8e2d17d4f357788381c49ce2cdb3f4ed1f21c`
- Ingest 日期: 2026-09-07

## 摘要

Pi 把「最小 coding harness」做成四个包。真正的 loop 在 `packages/agent`；`coding-agent` 是宿主。同一 agent 包里并存两套运行时：进程内 `Agent`/`agentLoop`（默认产品），和耐久 `AgentHarness`（规范长文 + experimental worker）。

## 关键事实

- `coding-agent/docs/index.md`：*Pi is a minimal terminal coding harness.*
- `coding-agent/docs/development.md` 结构：`ai` = provider，`agent` = loop 与消息类型，`tui` = 组件，`coding-agent` = CLI 与交互。
- `agent/src/agent-loop.ts`（803 行）：`runLoop` 内层 turn = 流式助手 + 工具；外层吃 follow-up。`convertToLlm` 只在 LLM 边界把 `AgentMessage[]` 滤成模型消息。
- `agent/src/agent.ts`（592 行）：有状态 `Agent`，`prompt()` 驱动 loop。
- `agent/docs/harness.md`：AgentHarness 规范。系统模型 = entry 树 + values/lists + Branch/AgentLane + usage ledger。四原语 `accept` / `drive` / `requestAbort` / `inspectExecution`。非目标包括 exactly-once 外部效果、接回 provider stream、工作调度。
- `agent/src/harness/runtime/harness.ts`：`Harness` 管 lanes，自己不是 lane。`createAgentHarness` 只 restore，不自动开 provider/tool 效果。
- coding-agent 默认：`src/core/agent-session.ts` 包 `Agent`；`src/core/sdk.ts` 有 `new Agent(...)`。`AgentHarness.create` 只在 `src/experimental/`。
- 内置工具：`src/core/tools/index.ts` 的 `createAllToolDefinitions`。
- 会话：JSONL 树，`docs/session-format.md` v3。
- Extension：`docs/extensions.md`；进程内 `ExtensionAPI`。
- 哲学：`README.md` Philosophy — 无 MCP / sub-agents / permission popups / plan mode / todos / background bash。
- 安全：`docs/security.md` — 无内置 sandbox；project trust 不是执行沙箱。

## 相关页面

- 概念: [[concepts/harness|Harness]]、[[concepts/extension|Extension]]、[[concepts/session|Session]]
- 学习: [[learning/harness对照讲解|Harness 对照讲解]]、[[learning/怎么学写插件|怎么学写插件]]

## 证据备注

`harness.md` 第 0.9 节列出未实现切片（search、部分 telemetry、JSONL snapshot compaction 等）。不要把规范里的每个原语都当成 coding-agent 已接线行为。
---
