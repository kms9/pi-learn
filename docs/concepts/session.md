---
title: Session
type: concept
status: active
created: 2026-09-10
updated: 2026-09-10
tags:
  - project-wiki
  - concept
---

# Session

TUI 里「这一段对话」对应的产品概念是 **session**，不是 `conversation`。官方文档第一句就把对话存成 session：*Pi saves conversations as sessions*。`conversation` 只出现在说明文字里，没有独立类型。

## 是什么

一次交互式对话 = 一个 session：

- 磁盘上是一份 JSONL：`~/.pi/agent/sessions/--<cwd>--/<timestamp>_<uuid>.jsonl`
- 文件头 `type: "session"` 带 `id`（sessionId）
- 交互 TUI 同一时刻只挂一份活的运行时：`AgentSession`
- `/new`、`/resume`、`/fork`、`/clone`、`pi -c`、`pi -r` 操作的都是这份单位

TUI 页脚的 session name、`/session` 显示的 file / id / 消息数 / token / 费用，指的都是当前 session。

它不是线性聊天气泡串。JSONL 里每条 entry 有 `id` / `parentId`，是一棵树。TUI 消息区画的是 **当前活动叶子** 从根到叶的那条路径。`/tree` 在同一文件里换叶子，不另开文件。

## 和一轮输入的边界

用户说「完成一次对话」时，Pi 里其实有三层，别混：

| 用户感觉 | Pi 名字 | 结束信号 | 说明 |
|----------|---------|----------|------|
| 整段聊天、可 resume | **session** | `/new` `/resume` `/fork` 或退出时的 `session_shutdown` | 文件还在；shutdown 拆的是运行时 |
| 敲一次 Enter、等 agent 干完 | **agent run** | `agent_settled` | `prompt()` 一次；中间可有 retry / compact / follow-up |
| 一次 LLM 回复 + 它调的工具 | **turn** | `turn_end` | 一次 agent run 里工具循环会有多轮 turn |

扩展生命周期（`docs-zh/.../extensions.md` 事件图）：

```
session_start
  └─ 用户发一条提示
       ├─ input → before_agent_start → agent_start
       │    └─ turn_start → …工具… → turn_end   （可重复）
       └─ agent_end → agent_settled
  └─ 用户再发一条提示（还在同一 session）
session_shutdown   （/new /resume /fork /reload /quit）
```

所以：关 TUI 或 `/new` 才换 session；一条用户消息走完只是一次 agent run。

## 运行时三件套

默认产品路径（不是 experimental `AgentHarness`）：

| 名字 | 职责 |
|------|------|
| `AgentSession` | TUI/SDK/RPC 拿到的活会话：包 `Agent`、`SessionManager`、Extension runner |
| `SessionManager` | 把对话当 append-only 树写 JSONL；`leafId` 是当前位置；`buildSessionContext()` 投影给模型 |
| `Agent` + `agentLoop` | 吃当前路径上的 `AgentMessage[]`，跑 turn |

`pi --no-session` 仍有 `AgentSession`，只是 `SessionManager` 不落盘。

## 不是什么

- 不是本 wiki 的 `docs/sessions/`。那边是本仓库沟通记录，文件名碰巧也叫 session。
- 不是 **turn** / **agent run**。一轮输入 ≠ 一段对话。
- 不是 **branch**。branch 是 session 树里的一条路径；`/tree` 换路径，`/fork` `/clone` 才复制成新 session 文件。
- 不是 **message / entry**。那是树上的节点。
- 不是 Chord 的 session worker / protocol 的 `{ serverId, sessionId, attachmentId }`。那是分进程 facet 和远程路由，默认写插件不要按那个教。
- 不是 DSH 的 `SessionEvent` log。两边都叫 session，存储模型不同；对照见 [[learning/harness对照讲解|Harness 对照讲解]]。

## 写插件时碰到它

- 会话范围资源：`session_start` 开，`session_shutdown` 关
- 从磁盘重建状态：`ctx.sessionManager.getBranch()` 扫当前路径
- 持久化自定义数据：`pi.appendEntry()` / custom message 的 `details`
- `/new` `/resume` `/fork` 会拆旧 runtime 再 `session_start`；内存单例不要假设跨 session 还在

## 证据

- `pi-dev/packages/coding-agent/docs/sessions.md` 与 `docs-zh/.../sessions.md`
- `pi-dev/packages/coding-agent/docs/session-format.md`（JSONL v3、entry 树）
- `pi-dev/packages/coding-agent/docs/usage.md`（TUI 四块：header / messages / editor / footer）
- `docs-zh/pi-dev/packages/coding-agent/docs/extensions.md` 生命周期图
- `docs-zh/pi-dev/packages/coding-agent/docs/extensions-impl.md`（`/new` `/resume` `/fork` 换会话）
- `pi-dev/packages/coding-agent/src/core/agent-session.ts`（`AgentSession`、`turn_end` 注释）
- `pi-dev/packages/coding-agent/src/core/session-manager.ts`（类注释：conversation sessions as append-only trees）
- `docs-zh/pi-dev/packages/agent/README.md`（`prompt()` 的 turn 事件序）

## 相关页面

- 概念: [[harness|Harness]]、[[extension|Extension]]
- 学习: [[learning/怎么学写插件|怎么学写插件]]、[[learning/harness对照讲解|Harness 对照讲解]]
- 来源: [[sources/pi-agent-core|Pi agent core]]
- 会话: [[sessions/2026-09-10-pi-session-conversation|2026-09-10 澄清 UI 对话 = session]]
