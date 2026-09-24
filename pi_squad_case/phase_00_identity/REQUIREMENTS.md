---
title: P0 需求
type: process
status: active
created: 2026-09-23
updated: 2026-09-24
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
5. agent_id/squad_id 由启动 env 注入，role 来自选中的 Markdown 角色 name。
6. 新版 Extension 上报 cwd、每进程唯一的 runtime_id（UUID v4）、role_description；不上传角色正文。

## 字段来源（写死）

| 字段 | 可得性 | 来源 |
|------|--------|------|
| `agent_id` | 实验注入 | `PI_SQUAD_AGENT_ID` |
| `role` | 角色文件 | `PI_SQUAD_ROLE_ID` 选择 `.agents/roles/<name>/role.md`，取 name |
| `role_description` | 角色文件 | frontmatter description，只作展示 |
| `cwd` | 进程 | 首次加载时 process.cwd()，同时作为角色发现根目录 |
| `runtime_id` | 进程 | 首次加载时 crypto.randomUUID()，/new 与扩展 reload 不变，重启变化 |
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
- 工具/模型/技能配置与历史管理（角色正文按回合追加已落地，仍与 Registry 分层）
- ACP / 通用 Agent Session / 多 Runtime
