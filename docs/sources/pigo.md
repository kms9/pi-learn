---
title: Pigo
type: source
status: active
created: 2026-09-18
updated: 2026-09-18
tags:
  - project-wiki
  - sources
  - pigo
  - pi
  - golang
  - agent-runtime
---

# Pigo

上游：`https://github.com/smallnest/pigo`

本仓位置：`pigo/`

Ingest / gitlink SHA：`891d1f372cefa92b5f5a104db20521238ba5a9fe`

跟踪分支：`master`

## 为什么收录

Pigo 是用 Go 重实现的 Pi AI Agent。对 `pi-learn` 来说，它最有价值的地方不是“另一个 CLI Agent”，而是提供了一份与 Pi 目标相近、但语言和工程组织完全不同的实现，可以作为 **Pi Runtime / Harness 的 Go 侧对照组**。

当前优先研究：

- Agent loop 如何收敛工具调用与 follow-up message；
- Session 的保存、恢复、继续运行；
- `stream-json` 事件输出如何供上层 daemon / server 消费；
- system prompt 如何叠加环境、`AGENTS.md` 与额外提示；
- 工具 allow / deny 与项目 trust 边界；
- Skills、Plugins、Hooks、package management；
- headless 模式与交互式 REPL 如何共用同一运行时；
- Go 实现能否为我们后续的 Runtime Adapter / Control Plane 提供更直接的工程参考。

## 上游当前能力摘要

根据上游 README，Pigo 当前同时提供无头脚本模式和交互式 REPL，并支持：

- 文件读写、编辑、代码检索、Shell 与网页抓取；
- 多 Provider；
- Session resume / continue；
- `stream-json`；
- 自动上下文压缩；
- 项目信任与工具级准入；
- Skills、Plugins、Hooks 与包管理。

其 README 将核心 Agent 执行描述为位于 `internal/runtime/loop.go` 的两层循环：内层负责模型流式响应、tool call 执行与回填，外层在当前 turn 收敛后继续消费 follow-up messages。

## 第一批重点源码

- `pigo/internal/runtime/loop.go`
- `pigo/cmd/pigo/`
- `pigo/internal/` 下与 session、provider、tools、plugins、skills、prompt/context 相关实现
- `pigo/docs/` 与 `pigo/book/` 中的架构说明

## 与 pi-learn 其它来源的关系

- `pi-dev/`：主对照对象，研究 Pi 官方/主实现的 Agent、coding-agent、RPC、Session、Extension。
- `pigo/`：Go 重实现对照，重点观察“同一类 Agent 能力换一种语言和模块边界如何实现”。
- `paseo/`：上层多 Harness 适配参考，重点是统一 AgentClient / Session / Event。
- `deepseek-harness/`：独立 Harness 架构对照。

后续分析 Pigo 时，优先按“**能力是否与 Pi 等价 → 源码边界在哪里 → Go 实现与 TypeScript/Pi 的差异 → 哪些可以吸收到我们的 Runtime / Herdr / DARS 设计**”这一顺序推进。
