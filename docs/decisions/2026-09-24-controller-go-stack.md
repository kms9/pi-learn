---
title: 2026-09-24 Controller 使用 Go 1.27 与 Gin 栈
type: decision
status: active
created: 2026-09-24
updated: 2026-09-24
decision_date: 2026-09-24
tags:
  - project-wiki
  - decision
  - pi-squad
---

# 2026-09-24 Controller 使用 Go 1.27 与 Gin 栈

## 决策

`pi_squad/controller` 使用 Go `1.27.0`。HTTP 用 Gin `v1.12.0`，客户端用 Resty `v2`，配置用 Viper，命令用 Cobra，只读 TUI 用 Charm Bubble Tea v1（`bubbletea` `v1.3.10`、`bubbles` `v1.0.0`、`lipgloss` `v1.1.0`）。这些库只留在 controller。Pi Extension 仍是 TypeScript。

`serve` 是唯一写 SQLite 的命令。`agents` 和 `tui` 通过 Resty 访问已运行的 HTTP API。旧的 `-listen` / `-db` / `-heartbeat-timeout` 启动方式保持可用。

## 背景

用户确认技术栈后，要求写入 `pi_squad/controller/AGENTS.md`，并按该栈重构现有 controller 流程。TUI 对齐 herdr-dashboard 正在使用的 Charm v1，不使用 `charm.land/.../v2`。

## 证据

- `pi_squad/controller/AGENTS.md`
- `pi_squad/controller/go.mod`
- `pi_squad_case/phase_00_identity/smoke.sh` 在重构后 PASS

## 影响

- 新增可用命令要同步 `pi_squad/USAGE.md`。
- HTTP 路径和 JSON 字段仍是 Extension 契约。

## 复审触发条件

- 升级上述库，或把 Charm v2 引入 controller
- 把这些库用到 Extension

## 相关页面

- 概念: [[concepts/pi-squad]]
- 使用: `pi_squad/USAGE.md`
