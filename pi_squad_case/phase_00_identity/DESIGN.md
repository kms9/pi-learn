---
title: P0 技术方案
type: process
status: active
created: 2026-09-23
updated: 2026-09-23
tags:
  - pi-squad
  - phase-00
---

# P0 技术方案

## 组件

```text
用户手动启动 Pi A / Pi B
        │  pi -e pi_squad/extension/index.ts
        ▼
  TypeScript Extension（薄适配）
  session_start → POST /agents/register
  setInterval  → POST /agents/heartbeat
  list_agents  → GET  /agents
        │  HTTP 127.0.0.1
        ▼
  Go Controller（单进程）
  agent/model.go + registry.go + service.go
        │
        ▼
  SQLite agents 表
```

Herdr 只提供可选 pane env；Controller **不**调用 Herdr CLI。

## 目录

| 路径 | 内容 |
|------|------|
| `pi_squad/controller/agent/model.go` | Agent 字段与请求类型 |
| `pi_squad/controller/agent/registry.go` | SQLite upsert / 读时计算 status |
| `pi_squad/controller/agent/service.go` | 校验与默认 `runtime_type=pi` |
| `pi_squad/controller/httpapi/server.go` | HTTP 路由 |
| `pi_squad/controller/cmd/controller/main.go` | 监听、库路径、超时 |
| `pi_squad/extension/controller-client.ts` | fetch 客户端 |
| `pi_squad/extension/registration.ts` | env 与 payload |
| `pi_squad/extension/heartbeat.ts` | 可 stop 的 interval |
| `pi_squad/extension/index.ts` | Extension 工厂 |

## HTTP

默认 `http://127.0.0.1:18741`。

### `POST /agents/register`

按 `agent_id` upsert。必填：`agent_id`、`role`、`squad_id`。可选：`runtime_type`（默认 `pi`）、`herdr_session_id`、`space_id`、`pane_id`、`runtime_session_id`。成功后 `status=online`，`last_seen=now`。

### `POST /agents/heartbeat`

必填 `agent_id`。可选刷新 `runtime_session_id`。未知 id → 404。

### `GET /agents`

返回 `{ "agents": [ ... ] }`。查询参数：`agent_id`、`role`、`squad_id`、`status`。

### `GET /agents/{id}`

单个记录。404 if missing。

`last_seen` 为 RFC3339 UTC。`status` **不持久化为权威值**：`now - last_seen > heartbeat-timeout` 则为 `offline`。重启后没有新心跳的行会显示 offline。

## Extension 生命周期

1. 工厂读取 env；缺三件套则警告并跳过注册，仍暴露 `list_agents`。
2. `session_start`：停掉旧 timer（generation++），读 `getSessionId()`（失败则空），`register`，再 `setInterval` 心跳。
3. `session_shutdown`：同样停 timer。`/new` 走 shutdown → 新实例 `session_start`，`agent_id` 不变。
4. `list_agents` 只打 Controller，不扫 Herdr pane。

心跳 interval 默认 5s（`PI_SQUAD_HEARTBEAT_INTERVAL_MS`）；Controller 超时默认 15s（`-heartbeat-timeout` / `PI_SQUAD_HEARTBEAT_TIMEOUT`）。smoke 用 2s 超时。

## 明确不做的接口

扩展与 Controller 均无 `send_message`、`poll_messages`、`delegate_task`、`resume_task`。无 mailbox 目录协议。
