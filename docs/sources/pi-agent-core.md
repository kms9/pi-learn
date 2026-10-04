---
title: Pi agent core 与 coding-agent
type: source
status: active
created: 2026-09-07
updated: 2026-10-03
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

下列原始摘要和关键事实描述 2026-09-07 的 ingest 快照。Pi 1.0.1 的更新核对见本页末节；尤其不要沿用旧快照的「无 MCP」来描述现行产品。

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

## 2026-10-03 更新核对：Pi 1.0.1

- 固定本地 HEAD：`4c6fb7cfe8c538a668726f6f8b3554098c39faee`。`packages/coding-agent/package.json` 为 `1.0.1`；父提交 `a7229ddc2` 是 Release v1.0.1。官方 [release](https://github.com/earendil-works/pi/releases/tag/v1.0.1) 已存在。本机实际全局 CLI 为 1.0.0，不能把源码更新当安装更新。
- 0.87：SessionManager projection 成为请求历史依据，新增 context_edit、context_with_system 和 actionable agent_before_settle/turn_end；agent_settled handler 中发起的新运行延后到所有 handlers 完成。
- 0.99：MCP、codemode、tool-search 成为内置 Extension；`--no-extensions` 也禁用它们。新增 exposure、namespace、annotations、outputSchema/structuredContent、prepareLoadout、ctx.executeTool 及 nested `parentToolCallId`。active 是模型声明集合，不等同全部 callable；nested 调用仍走 tool_call/tool_result。
- 1.0：TUI 默认 fullscreen，regular 仍可选。1.0.1 新增 registerToolRenderer；Anthropic 可将后续工具声明/重定义编码为 inline tool_addition/tool_removal，顶层 payload.tools 不一定代表当前有效集合。
- getCurrentTools/getCurrentSystemMessage 从 pi-ai 的规范 transcript 提取当前状态；不能直接套用到任意 provider HTTP payload。SessionManager 原始历史与有效模型上下文应区分。
- 现行 coding-agent 仍提供进程内 ExtensionAPI 和 AgentSession。`packages/durable/README.md` 的 Harness/Conversation/Submission/Task 是另一套 experimental API，不能把其自动 resume 与 Squad 的显式恢复协议视为同一保证。
- 本轮核对 `src/core/extensions/{types,runner,wrapper}.ts`、`agent-session.ts`、`ai/src/api/anthropic-messages.ts`、`ai/src/utils/transcript.ts` 及 Durable README；未运行上游测试或 Squad 三角色真实验收。`docs-zh` 本轮未同步，API 结论依据固定英文源码。

应用评估见 [[sessions/2026-10-03-pi-squad-pi-1.0.1-assessment|Pi Squad 适配 Pi 1.0.1]]。
---
