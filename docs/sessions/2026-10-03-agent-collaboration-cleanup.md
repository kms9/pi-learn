---
title: 2026-10-03 清理旧 Agent 协作要求
type: session
status: active
created: 2026-10-03
updated: 2026-10-03
tags:
  - project-wiki
  - session
---

# 2026-10-03 清理旧 Agent 协作要求

## 用户要做什么

检查 AGENTS.md、skills、rules 和记忆，去掉需要 Codex / Grok 协助的旧要求。

## 达成了什么

- 根目录 `AGENTS.md` 移除 Herdr 验收交接与主动回传的常驻授权；明确默认由当前会话执行，仅在用户本次明确要求时委派。
- `pi_squad/AGENTS.md` 移除固定 `callback_agent_kind: codex`、Claude pane 分工与主动回传协议，保留真实 Pi 多角色验收要求。
- 两份旧 `HANDOFF.md` 加历史记录提示，停止沿用旧 Agent 分工、地址和发送授权，保留原始证据。
- 检查了仓库 `.agents/skills`、`.claude`、`.cursor`，全局 `.agents/skills`、`.codex/skills`、`.claude/skills`，以及 Codex 的 `AGENTS.md`、`rules/default.rules`、`config.toml`、`memories/MEMORY.md`、`memory_summary.md` 和 Claude 的本仓库 memory。未发现要求 Codex / Grok 必须协助的其他生效规则；skills 中的命令示例保留。
- 全局 `multi_agent = true` 是能力开关，本次未关闭。当前会话提供 Grok Agent 工具本身也不构成调用要求，本次没有调用其他 Agent。
- 历史 Grok/Codex 评审记录、模型配置、submodule 与现有业务改动保留。旧会话中的人员分工不能覆盖本次协作边界。

## 清理后验证

用户明确本轮测试对象为协作规则清理，确认不会自动找 Codex / Grok 协助。

- 五项静态检查 PASS：根目录旧验收回传协议已删除、插件旧回传协议已删除、本次明确授权边界存在、阶段 02 与阶段 04 HANDOFF 均标为历史记录。
- 仓库 OpenSpec skills 的 delegation 命中主要指调用其它 skill/command；未发现自动调用 Grok 或指定 Codex 协助的要求。
- 全局 `paseo-committee` 的通用适用条件包含卡住或困难规划，会在被调用时创建其他 Agent；在本仓库仍须遵循根规则中的本次明确授权条件，不能仅因困难自动启用。advisor/handoff 的说明要求用户表达相应意图。
- 当前会话行为核对：未调用 collaboration/Paseo/Herdr 的 Agent 创建、prompt 或交接接口；未调用 Codex / Grok 协助，也未向历史 callback pane 发送消息。
- 读取了 Pi Squad 测试入口后收到用户选择，停止实际功能测试准备；未启动 Controller、Dashboard 或 Pi 测试进程。
- `git diff --check` 通过。本次验证覆盖文件规则与当前会话行为；没有启动新的独立 Codex 会话，因此不把它记为新会话加载测试。

## 写回了哪些 wiki 页

- 本页、`docs/index.md`、`docs/log.md`。

## 未决

- 无；本次范围为协作指令清理，不卸载通用工具或删除历史会话。

## 相关页面

- [仓库规则](../../AGENTS.md)
- [插件检查规则](../../pi_squad/AGENTS.md)
- [阶段 02 历史交接](../../pi_squad_case/phase_02_http_messaging/HANDOFF.md)
- [阶段 04 历史交接](../../pi_squad_case/04-team-orchestration/HANDOFF.md)
