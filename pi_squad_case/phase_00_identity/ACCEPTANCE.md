---
title: P0 验收标准
type: process
status: active
created: 2026-09-23
updated: 2026-09-24
tags:
  - pi-squad
  - phase-00
---

# P0 验收标准

判定沿用总方案：全部 Mandatory Case PASS 才允许进 P1。本环境若没有 `pi` 二进制，Pi 侧 Case 记 `NOT_RUN` / `BLOCKED`，**不得**用 Controller curl 冒充 Pi Case PASS。

## 客观标准

| ID | 标准 |
|----|------|
| A1 | 同时存在 2（理想 3）个不同 `agent_id`，查询均为 `online`。 |
| A2 | `agent_id` 由调用方指定且稳定；重复注册更新字段，不新增行。 |
| A3 | 停止一侧心跳后，超过配置超时，该 Agent `offline`；其他 Agent 不受影响。 |
| A4 | 同一 `agent_id` 再注册 / 再心跳后回到 `online`，列表中仍只有一行。 |
| A5 | 保留同一 SQLite 文件重启 Controller：身份行仍在；超时后为 `offline`，新心跳后为 `online`。 |
| A6 | 未提供的 `herdr_session_id` / `runtime_session_id` 为空，实现不得填随机 UUID。 |
| A7 | `space_id` 若出现，来自 `HERDR_WORKSPACE_ID`（或测试显式写入），不是 pane 名。 |

## 本轮角色文件与运行元数据补充验收

- Markdown frontmatter 的 name 选择正确；正文注入且每轮仅一次，description 不进入本 Agent 系统提示。
- 无选择器不注册；非法/重复配置拒绝；旧 JSON 入口给迁移错误。
- Controller 的注册/查询/持久化包含 cwd、runtime_id、role_description；旧库可自动迁移。
- 不同 Pi 进程 runtime_id 不同，/new 和扩展 reload 保持 UUID 与启动配置；runtime_session_id 仍取真实 Pi 会话。
- 验证脚本使用独立端口与临时数据库；本地测试 provider 不发送模型 HTTP 请求。

## 证据要求

- Controller `GET /agents` 输出
- offline → online 变化（日志或两次 list）
- SQLite 中 Agent 行（或重启后 list）
- 若走 Herdr：workspace / pane 与 `agent_id` 对照（用户手工）

## 退出门

Pi 三 Agent Mandatory Cases 未跑完 → 阶段结论不能是 PASS，不能进 P1 实现。
