---
title: Agent 角色配置参考
type: source
status: active
created: 2026-09-24
updated: 2026-09-24
source_path: https://code.claude.com/docs/en/agent-teams
tags:
  - project-wiki
  - source-summary
---

# Agent 角色配置参考

## 来源

- Multica 固定提交文档：https://github.com/multica-ai/multica/blob/b866dacd1cc5932d88863b5634826d8efb9260c6/apps/docs/content/docs/agents.mdx （通过 raw URL 读取核验）
- OpenClaw SOUL 模板：https://docs.openclaw.ai/reference/templates/SOUL

- Claude Agent Teams：https://code.claude.com/docs/en/agent-teams （Architecture、Use subagent definitions for teammates）
- Claude subagents：https://code.claude.com/docs/en/sub-agents （Write subagent files）
- OpenClaw：https://docs.openclaw.ai/concepts/multi-agent ；https://docs.openclaw.ai/gateway/configuration-examples
- 本地：`pi-subagents/docs/agents.md`。
- 补充调研：Herdr `w7:p1` Claude 最后回答，只读采集于 2026-09-24；非上游权威证据。
- 来源日期：网页持续更新，发布日 unknown；读取日期 2026-09-24。

## 摘要

可复用角色定义与活跃团队运行状态是不同层。借鉴字段职责与加载机制，不声称各项目共用 `.agents` 或纯 YAML 标准。

## 关键事实

- Claude 自定义角色是 Markdown + YAML frontmatter，项目目录 `.claude/agents/`。Teams 可以复用 subagent 定义；实际应用字段存在显示模式差异，不能假定任意字段自动生效。
- Claude Teams 在用户目录维护自动生成的 config.json，包含成员/session/pane 等运行信息，不应手写为角色源文件。
- OpenClaw 主配置用 JSON5，agent 配置指向独立 workspace 和状态目录，人格规则可存在 AGENTS.md/SOUL.md 等文件。
- pi-subagents 文档采用 Markdown + YAML frontmatter；标准项目路径 `.pi/agents/**/*.md`，亦支持 legacy `.agents/**/*.md`。本项目借鉴其文件格式，但发现目录和覆盖规则单独约定。
- 本轮补充核验 Multica 固定提交 `b866dacd1cc5932d88863b5634826d8efb9260c6` 的 `apps/docs/content/docs/agents.mdx`：description 只用于展示、不进入执行 prompt；instructions 定义职责、工作风格、边界和交付要求，每次 run 使用。其余服务端实现细节仍只转述 CC 调研。
- OpenClaw SOUL 模板包含 Core Truths、Boundaries、Vibe，可借鉴为角色正文的行为原则、边界与沟通风格；本轮不吸收 Continuity。

## 相关页面

- 概念：[[concepts/pi-squad]]
- 会话：[[sessions/2026-09-24-squad-agents-yaml-feasibility]]

## 证据备注

本轮只评估角色选择和提示注入，没有验证或实现完整上游 Teams 协作能力。
