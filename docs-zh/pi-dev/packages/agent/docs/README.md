本文是 `README.md` 的中文阅读版；命令、路径、API 名称保持英文。

# Agent 文档中文阅读索引 {#agent-docs}

本索引是 `packages/agent/docs/` 的中文阅读入口。英文原文保持不变；对应阅读版为同路径的 `*.zh.md`。命令、路径、API 名称保持英文。部分 `*.zh.md` 由并行工作创建。

## 顶层文档 {#top-level-docs}

- [AgentHarness — 实现规范](harness.zh.md)（`harness.md`）
- [类型化 value 与 list](values.zh.md)（`values.md`）
- [Coding-Agent 应用 Host 与 Facet](plugins.zh.md)（`plugins.md`）
- [Assistant 部分持久化 — 实现交接](assistant-durability.zh.md)（`assistant-durability.md`）
- [Tool 持久化 — 实现交接](tool-durability.zh.md)（`tool-durability.md`）
- [现有 AgentHarness runtime 简化](runtime-simplification.zh.md)（`runtime-simplification.md`）
- [WP05 之后的路线图审计](post-wp05-roadmap.zh.md)（`post-wp05-roadmap.md`）
- [Facet 服务 RPC](rpc.zh.md)（`rpc.md`）
- [调用 Context 与 Telemetry 设计笔记](telemetry.zh.md)（`telemetry.md`）
- [Pi Agent Telemetry Schemas](telemetry-schema.zh.md)（`telemetry-schema.md`）

## work-packages/ {#work-packages}

按编号阅读。`00`–`07` 已完成；`08` 进行中；`09` 为后续切片。

- [WP00 — 移除 Runtime1](work-packages/00-runtime1-removal.zh.md)（`00-runtime1-removal.md`）
- [WP01 — 绑定值与列表](work-packages/01-bound-values-lists.zh.md)（`01-bound-values-lists.md`）
- [WP02 — 原子接纳与一致的 lane 观察](work-packages/02-atomic-run-acceptance.zh.md)（`02-atomic-run-acceptance.md`）
- [WP03 — 移除 drive deadlines](work-packages/03-remove-drive-deadlines.zh.md)（`03-remove-drive-deadlines.md`）
- [WP04 — Mutation 发布与事件投递](work-packages/04-mutation-publication.zh.md)（`04-mutation-publication.md`）
- [WP05 — 直接持久化 drive](work-packages/05-direct-durable-drive.zh.md)（`05-direct-durable-drive.md`）
- [WP06 — Session、Branch、Lane 分离](work-packages/06-session-branch-lane-separation.zh.md)（`06-session-branch-lane-separation.md`）
- [WP07 — SQLite 宿主所有权与活动源 forks](work-packages/07-sqlite-host-ownership-live-forks.zh.md)（`07-sqlite-host-ownership-live-forks.md`）
- [WP08 — 具名 Branch 与 tree forks，带流式复制](work-packages/08-named-branch-streaming-forks.zh.md)（`08-named-branch-streaming-forks.md`）
- [工作包 09 — LaneSnapshot 已结算但未放置的 tools](work-packages/09-lane-snapshot-settled-tools.zh.md)（`09-lane-snapshot-settled-tools.md`）

## mobile-handoff/ {#mobile-handoff}

按编号顺序工作。总览与关键文档：

- [pi — 设计交接](mobile-handoff/README.zh.md)（`mobile-handoff/README.md`）

### 01-harness/ {#01-harness}

- [Delta Tracking 与 Op 词汇](mobile-handoff/01-harness/01-delta/delta.zh.md)（`delta.md`，已在 Chord 落地）
- [决定：不提供显式文本 append/truncate API](mobile-handoff/01-harness/01-delta/append-decision.zh.md)（`append-decision.md`）
- [01-delta：已知缺陷与实测发现](mobile-handoff/01-harness/01-delta/FINDINGS.zh.md)（`FINDINGS.md`，历史证据）
- [Session 存储：Scopes](mobile-handoff/01-harness/02-scopes/scopes.zh.md)（`scopes.md`）
- [Scoped storage Step 1 — 可执行实现交接](mobile-handoff/01-harness/02-scopes/implementation-handoff.zh.md)（`implementation-handoff.md`）
- [ExecutionEnv：有界 shell 输出](mobile-handoff/01-harness/03-execenv/execenv.zh.md)（`execenv.md`）
- [工具输出与 Progress](mobile-handoff/01-harness/04-tool-output/harness-tools.zh.md)（`harness-tools.md`）
- [完整示例：`bash` 端到端](mobile-handoff/01-harness/04-tool-output/bash-worked-example.zh.md)（`bash-worked-example.md`）
- [有界输出发布](mobile-handoff/01-harness/04-tool-output/rate-limiting.zh.md)（`rate-limiting.md`）
- [`message_update` 写入放大](mobile-handoff/01-harness/05-assistant-output/message-update.zh.md)（`message-update.md`）

### 02-plugins/ {#02-plugins}

- [插件与 Facet 架构](mobile-handoff/02-plugins/01-facets/facets.zh.md)（`facets.md`）
- [Facet 沙箱 — isolated-vm](mobile-handoff/02-plugins/02-sandbox/README.zh.md)（`02-sandbox/README.md`）
