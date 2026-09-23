---
title: P0｜身份、注册与在线状态
type: process
status: active
created: 2026-09-23
updated: 2026-09-23
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

覆盖：两个 Agent 注册 → 列表均为 online → 停一侧心跳后超时 offline → 重启 Controller 身份仍在 → 同 `agent_id` 再注册不产生 `reviewer-2`。

### 3. 两个 Pi 进程（本机已安装 `pi` 时）

另开两个终端，**不要**自动 spawn：

```bash
# 终端 A
export PI_SQUAD_CONTROLLER_URL=http://127.0.0.1:18741
export PI_SQUAD_AGENT_ID=backend PI_SQUAD_ROLE=backend PI_SQUAD_ID=alpha
pi --no-extensions -e "$PWD/pi_squad/extension/index.ts"

# 终端 B
export PI_SQUAD_CONTROLLER_URL=http://127.0.0.1:18741
export PI_SQUAD_AGENT_ID=reviewer PI_SQUAD_ROLE=reviewer PI_SQUAD_ID=alpha
pi --no-extensions -e "$PWD/pi_squad/extension/index.ts"
```

第三个终端：

```bash
curl -s http://127.0.0.1:18741/agents | python3 -m json.tool
```

应看到两个 `status=online`。停掉 reviewer 的 Pi，等待超过 `-heartbeat-timeout` 后再 `GET /agents`：reviewer 为 `offline`，backend 仍 `online`。

可选 Herdr 对照（用户手工建 pane，**禁止** Controller 调 `herdr agent start`）：

```bash
# 在已有 pane 上由用户启动
HERDR_WORKSPACE_ID=... HERDR_PANE_ID=... \
PI_SQUAD_AGENT_ID=tester PI_SQUAD_ROLE=tester PI_SQUAD_ID=alpha \
pi --no-extensions -e "$PWD/pi_squad/extension/index.ts"
```

`space_id` 存的是 `HERDR_WORKSPACE_ID`。`herdr_session_id` 默认空；只有显式注入 `PI_SQUAD_HERDR_SESSION_ID` / `HERDR_SESSION_NAME` / `HERDR_SESSION` 才上报。

## 本阶段未做

- P1 的 `get_agent` 工具（Controller 已有 `GET /agents/{id}`，扩展未注册该工具）
- P2+ `send_message` / poll / reply
- P3+ `delegate_task` 与任务状态机
- 自动启动或恢复 Pi / Herdr
- ACP、通用 Agent Session、第二 Runtime
