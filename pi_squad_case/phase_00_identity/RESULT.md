---
title: P0 执行结果
type: process
status: draft
created: 2026-09-23
updated: 2026-09-23
tags:
  - pi-squad
  - phase-00
---

# P0 执行结果

- 阶段：P0｜身份、注册与在线状态
- 结论：**BLOCKED**（Pi 进程 Mandatory Cases 未在本环境执行）
- 是否允许进入 P1：**NO**
- 代码：`pi_squad_dev` @ `1838b67` 及后续 smoke 修复提交
- 环境：`go1.22.2`、`node v22.14.0`；`which pi` 为空

Controller HTTP 路径已实现。`go test ./...` 与 `./pi_squad_case/phase_00_identity/smoke.sh` 通过。完整 CASE-P0-01..04 需要本机 `pi`（及可选 Herdr），本环境没有 `pi`，故阶段不能记 PASS。

## 实现内容

- `pi_squad/controller`：SQLite upsert 注册、心跳、列表、按 id 查询、读时 offline
- `pi_squad/extension`：`session_start` 注册、interval 心跳、`list_agents`
- `pi_squad_case/phase_00_identity/`：本阶段文档与 smoke

## 实际执行命令

```bash
cd pi_squad/controller && go test ./...
# ok github.com/kms9/pi-learn/pi_squad/controller/httpapi  0.292s

./pi_squad_case/phase_00_identity/smoke.sh
# P0 controller smoke PASS
```

## Case 结果

| Case | 结果 | 说明 |
|------|------|------|
| CASE-P0-S1 Controller HTTP smoke | **PASS** | 两 Agent 同时 online；停 reviewer 心跳后仅 reviewer offline；同 SQLite 重启后身份仍在；再 register `reviewer` 不产生第二行 |
| CASE-P0-01 三个 Pi 注册 | NOT RUN | 无 `pi` |
| CASE-P0-02 离线识别（Pi） | NOT RUN | 无 `pi`；S1 覆盖协议面 |
| CASE-P0-03 同身份上线（Pi） | NOT RUN | 无 `pi`；S1 覆盖协议面 |
| CASE-P0-04 Controller 重启（Pi 再心跳） | NOT RUN | S1 用 curl 重启校验身份行 |
| CASE-P0-S2 两个 `pi -e` | NOT RUN | 无 `pi` |

## S1 证据摘要（2026-09-23）

注册后 list（截断）：

```json
{"agents":[
  {"agent_id":"backend","status":"online","space_id":"ws-smoke","pane_id":"pane-backend"},
  {"agent_id":"reviewer","status":"online","space_id":"ws-smoke","pane_id":"pane-reviewer"}
]}
```

只给 backend 续心跳约 2.4s 后：

```json
{"agents":[
  {"agent_id":"backend","status":"online"},
  {"agent_id":"reviewer","status":"offline"}
]}
```

停 Controller 再起、同一 `pi_squad.sqlite`：两行仍在。再次 `POST /agents/register` `agent_id=reviewer` 后 `GET /agents` 仍为 2 行，reviewer 回到 online。

SQLite 与 Controller 日志在 smoke 的 `$TMPDIR/pi_squad_p0_smoke_*`（不入库）。

## 未实现能力（不得假装已有）

- `send_message` / `list_messages` / `reply_message`
- `delegate_task` / `get_task` / `complete_task` / `fail_task` / `resume_task`
- 扩展侧 `get_agent` 工具（HTTP `GET /agents/{id}` 已有）
- 自动启动 Pi 或 Herdr
- 入站 `sendUserMessage` 注入
- UDS / `squad` CLI（旧 `00-identity-protocol` 规划未实施）

## 发现的问题

- `herdr_session_id` 默认无法从 pane env 读取（Herdr 不注入 `HERDR_SESSION`）；已按评估允许为空。
- 旧目录 `pi_squad_case/00-*` 仍是 2026-09-21 UDS 规划，与本 P0 HTTP 实现并存，避免误跑 `squad daemon`。
- 第一版 smoke 在等待超时窗口内没有持续心跳 backend，两侧都变 offline；已改为循环心跳 backend。
