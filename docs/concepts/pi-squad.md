---
title: Pi Squad
type: concept
status: active
created: 2026-09-23
updated: 2026-09-23
tags:
  - project-wiki
  - concept
  - pi-squad
---

# Pi Squad

## 是什么

本仓库里「Pi Squad」指 **Herdr + 薄 Pi Extension + Go Controller** 的本地多智能体协作验证，不是一个已完成的产品平台。逻辑身份是 `agent_id`；Pi 进程、`runtime_session_id`、Herdr Space/Pane 都是属性。

当前实现只到 **P0**：注册、心跳、在线状态。代码在 `pi_squad/controller` 与 `pi_squad/extension`。

## 不是什么

- 不是 [[pi-package|Pi package]] 分发格式
- 不是 pi-agent-teams 的 lead/worker 文件 mailbox
- 不是 pi-intercom 按 Pi session 寻址的 broker
- 不是 2026-09-21 `pi_squad_case/00-identity-protocol` 规划的 UDS / `squad` CLI（那份尚未实施）
- Registry 的 `role` 不是 `before_agent_start` 人格注入

## 证据

- 方案与评估摘要：[[sources/herdr-pi-extension-plan]]
- 字段约定：[[decisions/2026-09-23-p0-identity-fields]]
- 阶段文档：`pi_squad_case/phase_00_identity/`
- Extension API：`docs-zh/pi-dev/packages/coding-agent/docs/extensions.md`

## 相关页面

- 学习: [[learning/怎么学写插件]]
- 概念: [[concepts/extension]]、[[concepts/session]]
- 会话: [[sessions/2026-09-23-p0-identity]]
