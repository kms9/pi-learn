---
title: Pi Squad
type: concept
status: active
created: 2026-09-23
updated: 2026-09-24
tags:
  - project-wiki
  - concept
  - pi-squad
---

# Pi Squad

## 是什么

本仓库里「Pi Squad」指 **Herdr + 薄 Pi Extension + Go Controller** 的本地多智能体协作验证，不是一个已完成的产品平台。逻辑身份是 `agent_id`；Pi 进程、`runtime_session_id`、Herdr Space/Pane 都是属性。

当前实现只到 **P0** 加上按配置文件注入角色提示：注册、心跳、在线状态、`role_prompt`。代码在 `pi_squad/controller` 与 `pi_squad/extension`。配置和启动见 `pi_squad/USAGE.md`。

## 不是什么

- 不是 [[pi-package|Pi package]] 分发格式
- 不是 pi-agent-teams 的 lead/worker 文件 mailbox
- 不是 pi-intercom 按 Pi session 寻址的 broker
- 不是 2026-09-21 `pi_squad_case/00-identity-protocol` 规划的 UDS / `squad` CLI（那份尚未实施）
- Registry 的 `role` 不是 `before_agent_start` 人格注入。人格文本是配置文件里的 `role_prompt`。

## 角色提示何时生效

配置在 Extension 工厂里读一次，跟 Pi 进程走，不跟 session 重读，也不在每个 turn 重读文件。`/new` 不换角色。

交给模型的方式不是写入 session。`before_agent_start` 在每次用户提交提示、agent 循环开始前触发一次；返回的 `systemPrompt` 只投影到这一轮 agent run 的请求头，不进 transcript。同一轮里工具调用之后的后续 LLM 请求复用这次投影。run 结束即丢弃，下一句用户消息再套同一段内存中的 `role_prompt`。

因此不是「按 session 注入一次并留在历史里」，也不是「每次 HTTP 调用都重新读配置」。是进程固定配置，按用户回合边界重新套上。

对照：`pi-agent-teams` 的 `PI_TEAMS_SYSTEM_PROMPT_FILE` 与 `before_agent_start` 同构。Paseo 把 session 级 `systemPrompt` 落到同一个钩子。`pi-subagents` 在子进程启动时用 `systemPrompt` / `appendSystemPrompt`，那是基础提示，不是这个钩子。Pi 例子 `pirate.ts` 是按回合改提示；`claude-rules.ts` 是 `session_start` 读规则、`before_agent_start` 套上。

## 证据

- 方案与评估摘要：[[sources/herdr-pi-extension-plan]]
- 字段约定：[[decisions/2026-09-23-p0-identity-fields]]
- 阶段文档：`pi_squad_case/phase_00_identity/`
- Extension API：`docs-zh/pi-dev/packages/coding-agent/docs/extensions.md`

## 相关页面

- 使用: `pi_squad/USAGE.md`
- 学习: [[learning/怎么学写插件]]
- 概念: [[concepts/extension]]、[[concepts/session]]
- 会话: [[sessions/2026-09-23-p0-identity]]
