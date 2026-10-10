---
title: 2026-09-23 P0 身份字段与 HTTP Registry
type: decision
status: active
created: 2026-09-23
updated: 2026-09-23
decision_date: 2026-09-23
tags:
  - project-wiki
  - decision
  - pi-squad
---

# 2026-09-23 P0 身份字段与 HTTP Registry

## 决策

P0 按 2026-09-23 Notion 方案落地，而不是 2026-09-21 UDS/`squad` 规划稿。

1. 控制面是单进程 **HTTP + SQLite**，默认 `http://127.0.0.1:18741`。
2. `agent_id` / `role` / `squad_id` **必须**由 `PI_SQUAD_*` env 注入；Herdr/Pi 没有这些一等字段。
3. `space_id` ← `HERDR_WORKSPACE_ID`（文档别名）。`pane_id` ← `HERDR_PANE_ID`。
4. `herdr_session_id` 与 `runtime_session_id` 允许空；后者只来自 `getSessionId()`，禁止伪造。
5. 共享代码放 `pi_squad/`，阶段文档放 `pi_squad_case/phase_00_identity/`。不自动 spawn，不依赖 teams/intercom。

## 背景

评估写明完整 P0 字段无法从 Herdr 原生读出；若坚持「全部字段必须原生可得」会假 BLOCKED。旧 `00-identity-protocol` 另设计了 UUID `agent_id` 与 UDS 帧，与本次附件方案不一致。一次只做 P0，避免提前建消息/任务平台。

## 证据

- [[sources/herdr-pi-extension-plan]]
- `docs-zh/pi-dev/packages/coding-agent/docs/extensions.md`：`session_start` / `getSessionId()`
- `docs-zh/pi-dev/packages/coding-agent/docs/session-format.md`：`getSessionId()` 为会话 UUID

## 影响

- 实施与验收以 `phase_00_identity` 为准。
- Registry `role` 不替代 system prompt；CASE「返回你的角色」若只靠模型胡答，不能据此判协议 FAIL。

## 复审触发条件

- 进入 P1 前必须先有 P0 Mandatory（含真实 Pi）PASS
- 若改回 UDS 或把 `agent_id` 改成 Controller 颁发 UUID

## 相关页面

- 概念: [[concepts/pi-squad]]
- 会话: [[sessions/2026-09-23-p0-identity]]
