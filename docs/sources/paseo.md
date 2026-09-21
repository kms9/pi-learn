---
title: Paseo
type: source
status: active
created: 2026-09-16
updated: 2026-09-16
tags:
  - project-wiki
  - sources
  - paseo
  - harness
---

# Paseo

上游：`https://github.com/getpaseo/paseo`

本仓位置：`paseo/`

Ingest / gitlink SHA：`425157595038614a44e2cbf9c393f2e263270b95`

## 为什么收录

Paseo 是本仓研究“一个上层系统如何统一接管多个 coding-agent harness/runtime”的重要参考。它没有要求 Claude Code、Codex、Pi、OpenCode 等实现共享同一内部代码，而是在 server/daemon 层为不同 provider 建立统一 adapter。

本次最关注的不是 Paseo 前端，而是：

```text
Provider Registry
AgentClient
AgentSession
AgentStreamEvent
Runtime Adapter
Provider-agnostic Session Config
```

## 关键源码

- `paseo/packages/server/src/server/agent/provider-registry.ts`
- `paseo/packages/server/src/server/agent/agent-sdk-types.ts`
- `paseo/packages/server/src/server/agent/providers/pi/agent.ts`
- `paseo/packages/server/src/server/agent/providers/pi/cli-runtime.ts`
- `paseo/packages/server/src/server/agent/providers/pi/runtime.ts`
- `paseo/packages/server/src/server/agent/providers/generic-acp-agent.ts`
- `paseo/packages/server/src/server/agent/system-prompt.ts`

## 本次抽出的可复用结论

1. 上层通过 `AgentClient / AgentSession` 统一 harness，而不是直接依赖某个 CLI。
2. 各 provider 的进程协议、session、事件和 system prompt 注入在 adapter 内解决。
3. Pi 通过 RPC + extension 适配；ACP agent 可以通过 Generic ACP adapter 统一接入。
4. 这种边界适合借给 `pi-agent-teams`：把当前写死的 `TeammateRpc = Pi RPC process` 升级为通用 `TeamMemberEndpoint`。

完整分析见 [[../learning/Paseo-Pi-Agent-Teams-Herdr多Harness协同架构|Paseo、Pi Agent Teams 与 Herdr：多 Harness 协同架构]]。
