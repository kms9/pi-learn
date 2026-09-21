---
title: 2026-09-16 Paseo、Agent Teams 与 Herdr 多 Harness 协同
type: session
status: active
created: 2026-09-16
updated: 2026-09-16
tags:
  - project-wiki
  - session
  - multi-agent
  - paseo
  - herdr
---

# 2026-09-16 Paseo、Agent Teams 与 Herdr 多 Harness 协同

## 问题

1. Paseo 如何接管其他 harness？
2. pi-agent-teams 如何向成员注入角色配置？
3. 能否让其他 harness 成为 Agent Teams 成员？
4. 能否通过 Herdr 展示不同原生 TUI，同时保持统一内部流程与消息？

## 本次结论

- Paseo 的关键机制是 provider/runtime adapter，不是侵入 harness。
- pi-agent-teams 当前 `TeammateRpc` 写死 `pi --mode rpc`，Team Member 与 Pi RPC process 耦合。
- 当前 `role: lead|worker` 是编排身份，不是 reviewer/researcher 等 Role Profile。
- 后续应拆出 `TeamMemberEndpoint + RoleProfile + CanonicalAgentEvent + MemberUIBinding`。
- Role、Harness、TUI 必须分开建模。
- Herdr 适合做 Presentation/PTY 层；interactive runtime 与 headless runtime + observer 两种模式都应支持。

完整分析：[[../learning/Paseo-Pi-Agent-Teams-Herdr多Harness协同架构|Paseo、Pi Agent Teams 与 Herdr：多 Harness 协同架构]]。

## 仓库变化

- 新增 Paseo submodule：`paseo/`
- 新增来源页：[[../sources/paseo|Paseo]]
- Paseo gitlink：`425157595038614a44e2cbf9c393f2e263270b95`
