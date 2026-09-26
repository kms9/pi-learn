---
title: P0｜身份、注册与在线状态
type: process
status: active
created: 2026-09-23
updated: 2026-09-24
tags:
  - pi-squad
  - phase-00
---

# P0｜身份、注册与在线状态

本目录是 **Herdr + 薄 Pi Extension + Go Controller** 验证方案的第一刀（P0-prep + P0）。共享代码在仓库根下的 [`pi_squad/`](../../pi_squad/README.md)，不写进 `pi-dev/`，不依赖 pi-agent-teams / pi-intercom。

| 文档 | 用途 |
|------|------|
| [REQUIREMENTS.md](REQUIREMENTS.md) | 本阶段解决 / 不解决什么 |
| [DESIGN.md](DESIGN.md) | 字段、HTTP API、调用链、env |
| [ACCEPTANCE.md](ACCEPTANCE.md) | 可客观判断的验收标准 |
| [CASES.md](CASES.md) | Mandatory Case 步骤 |
| [RESULT.md](RESULT.md) | 真实执行结果（代码不能替代） |

与 `pi_squad_case/00-identity-protocol/` **不是同一条实施合同**：那份是 2026-09-21 的 UDS / `squad` CLI 规划稿，本阶段按 2026-09-23 Notion P0 方案实现 HTTP Registry。

## 本地怎么跑

### 1. 启动 Controller

```bash
cd pi_squad/controller
go run ./cmd/controller \
  -listen 127.0.0.1:18741 \
  -db /tmp/pi_squad.sqlite \
  -heartbeat-timeout 15s
```

### 2. Controller-only smoke（不需要 `pi`）

```bash
chmod +x pi_squad_case/phase_00_identity/smoke.sh
./pi_squad_case/phase_00_identity/smoke.sh
```

脚本编译并直接管理独立 Controller 子进程，使用临时数据库和独立空闲端口，不继承现有服务地址。

覆盖：两个 Agent 注册 → 列表均为 online → 停一侧心跳后超时 offline → 重启 Controller 身份仍在 → 同 `agent_id` 再注册不产生 `reviewer-2`。

### 3. 启动 Pi

配置文件和交互式启动命令在 [`../../pi_squad/USAGE.md`](../../pi_squad/USAGE.md)。本阶段不自动 spawn。

期望：两个不同配置的 Pi 在 `GET /agents` 里都是 `online`。停掉其中一个，等待超过 `-heartbeat-timeout` 后，只有它变为 `offline`。

可选 Herdr 对照也由用户在已有 pane 上按该文档启动。Controller **禁止**调用 `herdr agent start`。`space_id` 存的是 `HERDR_WORKSPACE_ID`。`herdr_session_id` 默认空。

### 4. 配置加载核对

```bash
node pi_squad_case/phase_00_identity/verify-config-pi.mjs
```

脚本自起临时 Controller 和三个 `pi --mode rpc`。通过条件见 [`../../pi_squad/USAGE.md`](../../pi_squad/USAGE.md) 的「自动核对」。

## 本阶段未做

- P2+ `send_message` / poll / reply
- P3+ `delegate_task` 与任务状态机
- 自动启动或恢复 Pi / Herdr
- ACP、通用 Agent Session、第二 Runtime

## 发现能力后续开发

2026-09-24 Extension 已加入 `get_agent`，配合 `list_agents` 完成按角色发现、按 agent_id 精确查询。用户指定 Herdr `w7:p1` 的 Claude Code 负责后续验收，开发完成不等于验收通过。用法见 `pi_squad/USAGE.md`。
