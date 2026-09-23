---
title: Herdr + Pi Extension 多智能体验证方案
type: source
status: active
created: 2026-09-23
updated: 2026-09-24
source_path: Notion plan + 源码对照评估
tags:
  - project-wiki
  - source-summary
  - pi-squad
---

# Herdr + Pi Extension 多智能体验证方案

## 来源

- 本地全文: [[herdr-pi-extension-cases|Herdr + Pi Extension Cases]]
- 外部 URL: https://app.notion.com/p/kms9/Herdr-Pi-Extension-Cases-3e4df99ce2a3817d99f5f5c68cba60f9
- 来源日期: 2026-09-23
- Ingest 日期: 2026-09-24

## 摘要

分阶段验证本地多智能体基础协议：身份 → 发现 → 消息 → 委派 → 会话复用 → 显式恢复 → 递归 → 契约。技术栈固定为 **Herdr 持进程 + TypeScript 薄 Extension + Go Controller + SQLite**。一次只做一阶段。P0 只证明逻辑 `agent_id` 可脱离单个 Pi 进程存在，且 Controller 能区分 online/offline。

源码评估结论：主路线与 Pi ExtensionAPI / Herdr pane env 对齐；`agent_id`/`role`/`squad_id` 必须实验注入；`space_id` 对齐 `HERDR_WORKSPACE_ID`；`herdr_session_id` 默认空；`runtime_session_id` 能拿则报、不能伪造。不要把 pi-agent-teams / pi-intercom 当控制面。

## 关键事实

- 默认「插件」仍是 coding-agent Extension：`export default function (pi: ExtensionAPI)`。
- P0 共享模块建议：`pi_squad/controller`（Go）、`pi_squad/extension`（TS）；阶段文档在 `pi_squad_case/phase_00_identity/`。
- Registry `role` ≠ role system prompt。
- 第一刀最小切片：HTTP register / heartbeat / list + 两进程注册与超时 offline；不引入 mailbox / teams。

## 相关页面

- 概念: [[concepts/pi-squad|Pi Squad]]
- 决策: [[decisions/2026-09-23-p0-identity-fields]]
- 会话: [[sessions/2026-09-23-p0-identity]]
- 实验: `pi_squad_case/phase_00_identity/`

## 证据备注

- 评估对照：`docs-zh/pi-dev/packages/coding-agent/docs/extensions.md`（`session_start`、`registerTool`、`sessionManager.getSessionId()`）
- Herdr pane env：评估记载 `HERDR_WORKSPACE_ID` / `HERDR_PANE_ID`；`HERDR_SESSION` 不在默认 pane launch env
