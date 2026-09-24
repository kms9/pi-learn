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

当前实现只到 **P0** 加上按 Markdown 角色文件注入提示及启动 cwd/runtime_id 上报：注册、心跳、在线状态、`role_prompt`。代码在 `pi_squad/controller` 与 `pi_squad/extension`。配置和启动见 `pi_squad/USAGE.md`。

## 不是什么

- 不是 [[pi-package|Pi package]] 分发格式
- 不是 pi-agent-teams 的 lead/worker 文件 mailbox
- 不是 pi-intercom 按 Pi session 寻址的 broker
- 不是 2026-09-21 `pi_squad_case/00-identity-protocol` 规划的 UDS / `squad` CLI（那份尚未实施）
- Registry 的 `role` 不是 `before_agent_start` 人格注入。人格文本来自 `.agents/roles/<name>/role.md` 正文，内部映射为 rolePrompt。

## 角色提示何时生效

启动配置缓存在 process 的 Symbol 属性上，首次 Extension 初始化读一次；`/new` 和扩展 reload 不重读，不在每个 turn 重读文件。修改角色文件需重启 Pi。

交给模型的方式不是写入 session。`before_agent_start` 在每次用户提交提示、agent 循环开始前触发一次；返回的 `systemPrompt` 只投影到这一轮 agent run 的请求头，不进 transcript。同一轮里工具调用之后的后续 LLM 请求复用这次投影。run 结束即丢弃，下一句用户消息再套同一段内存中的角色正文。

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

## 角色文件与运行实例

已实现 `.agents/roles/*/role.md` 的 name/description/正文格式。`PI_SQUAD_ROLE_ID` 选择 name，上报为 role；agent_id/squad_id 继续由启动环境提供。description 上报 role_description，正文不进 Registry。

cwd 为首次加载时 process.cwd()，runtime_id 为每进程 UUID v4；/new/reload 不变，重启变化。runtime_session_id 仍来自 Pi，会随新会话变化。Controller 自动为旧表增加三个可空字段；现有逻辑身份主键、心跳规则不变。

不扩展 tools/model/skills、历史或新状态管理。用法见 `pi_squad/USAGE.md`，验证见 [[sessions/2026-09-24-squad-frontmatter-runtime-implementation]]。

## Agent 发现

已实现 list_agents 按 role/squad_id/status 筛选、get_agent 按 agent_id 精确查询。查询返回当前 Registry 快照，不发送消息、不锁定运行实例。2026-09-24 用户指定 Claude Code（Herdr w7:p1）负责验收，当前助手负责开发，详见 [[sessions/2026-09-24-squad-get-agent-development]]。

角色目录采用 `.agents/roles/<name>/role.md`。目录内其它文件为后续扩展预留，当前不加载、不自动写入。`/squad-whoami` 可查看 role_dir，见 [[decisions/2026-09-24-squad-role-directories]]。

## 2026-09-24 HTTP 通信切片

当前新增 UUID/私有凭据校验、显式释放撤销及 notice/ask/reply；同 ID 不再跨进程覆盖。开发完成待 Claude 验收，旧文的“尚无消息”和 upsert 描述仅适用于前序版本。使用以 `pi_squad/USAGE.md` 为准，开发记录见 [[sessions/2026-09-24-squad-http-messaging]]。
