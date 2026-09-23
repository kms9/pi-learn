---
title: P0 需求
type: process
status: active
created: 2026-09-23
updated: 2026-09-23
tags:
  - pi-squad
  - phase-00
---

# P0 需求

## 要证明什么

> Agent Identity 可以脱离某一个 Pi 进程生命周期存在，并且 Go Controller 能稳定知道某个 Agent 当前是否在线。

## 必须

1. Pi 加载扩展后自动注册：`agent_id`、`role`、`squad_id`、`runtime_type=pi`、可选 Herdr 映射、可选 `runtime_session_id`、`status`、`last_seen`。
2. 支持注册、按 `agent_id` 重复注册 / 更新、Heartbeat、超时标记 `offline`。
3. 同一 `agent_id` 重新启动后恢复同一逻辑身份，不创建 `reviewer-2`。
4. Controller 重启后 SQLite 中的身份行仍在；在线状态靠新心跳校准（超时未心跳则为 `offline`）。
5. 身份三件套由实验 env 注入，不从 Herdr/Pi 一等 API「读出」。

## 字段来源（写死）

| 字段 | 可得性 | 来源 |
|------|--------|------|
| `agent_id` | 实验注入 | `PI_SQUAD_AGENT_ID` |
| `role` | 实验注入 | `PI_SQUAD_ROLE`（Registry 标签，不是 role prompt） |
| `squad_id` | 实验注入 | `PI_SQUAD_ID` |
| `runtime_type` | 常量 | `"pi"` |
| `herdr_session_id` | 默认无 | 显式 env 才填；允许空 |
| `space_id` | Herdr 别名 | `HERDR_WORKSPACE_ID` |
| `pane_id` | Herdr | `HERDR_PANE_ID` |
| `runtime_session_id` | Pi 内可选 | `sessionManager.getSessionId()`；拿不到则空，**禁止伪造** |
| `status` / `last_seen` | Controller | 注册 + 心跳 |

## 不解决

- 消息、委派、任务、递归、契约验收（P2–P7）
- 自动 spawn / 恢复 Pi 或 Herdr
- 用 Pane 名或 `herdr agent list` 当逻辑 Agent ID
- 把 pi-agent-teams / pi-intercom 当控制面
- 人格 / system prompt 注入（与 Registry `role` 分层，不阻塞 P0）
- ACP / 通用 Agent Session / 多 Runtime
