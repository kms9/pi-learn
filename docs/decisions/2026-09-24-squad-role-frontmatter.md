---
title: 2026-09-24 Squad 角色采用 Markdown 与 YAML frontmatter
type: decision
status: active
created: 2026-09-24
updated: 2026-09-24
decision_date: 2026-09-24
tags:
  - project-wiki
  - decision
  - pi-squad
---

# 2026-09-24 Squad 角色采用 Markdown 与 YAML frontmatter

## 决策

> 目录更新：角色现已改为 `.agents/roles/<name>/role.md`，以下早期平铺路径由 [[decisions/2026-09-24-squad-role-directories]] 取代；frontmatter 格式仍有效。

用户明确选择 Claude 风格的 Markdown + YAML frontmatter，取代上一轮纯 YAML 提案。当前讨论仅覆盖本地角色定义、按启动 role id 选择与提示注入；tools/model/skills、智能体历史记录和状态管理暂不纳入。

2026-09-24 用户授权实施；下述 name/description/正文、`.agents/roles` 与环境身份衔接已落地。另上报启动 cwd 与每进程 UUID，见 [[sessions/2026-09-24-squad-frontmatter-runtime-implementation]]。

## 背景

希望从启动 cwd 下 `.agents` 发现角色定义，避免每次指定 JSON 文件路径。综合 Claude/pi-subagents 的文件格式、Multica 的描述与指令分离，以及 OpenClaw 的行为原则与边界写法。

## 证据

- 用户本轮明确选择与范围限定。
- [[sources/agent-role-config-references]]：Claude subagents、pi-subagents、Multica 固定提交文档、OpenClaw SOUL 模板。
- 现有实现：`pi_squad/extension/config.ts`、`pi_squad/extension/index.ts`。

## 影响

建议角色文件最小结构为 `name` + `description` + Markdown 正文；`name` 就是启动选择器 role id，不同时维护 id/name/role 三个同义值。正文在加载器内部映射现有 rolePrompt，文件不再写 role_prompt。

建议正文使用职责、工作方式、边界、交付要求四个普通 Markdown 小节。标题是写作约定，不是解析 schema；加载器整体读取正文，不解析各小节、不补齐空模板。

建议目录 `.agents/roles/*.md`；`PI_SQUAD_ROLE_ID=reviewer` 精确匹配 `name: reviewer`。description 仅供展示、检索，不自动拼入本 Agent 的 system prompt；是否自动路由不在本轮范围。正文追加到 Pi 原 system prompt，沿用当前注入策略，不为模仿别家而替换整个基础提示。

首版建议 name、description、非空正文必填；name 限小写字母、数字和连字符，文件名与 name 一致，重复 name 报错。仅扫描约定目录，避免把 `.agents/skills` 和普通说明文档当作角色。

agent_id、squad_id、Controller URL、Herdr pane 等不放入角色模板，沿用启动侧身份配置供既有注册链路使用。当前只解决 role id 选择正文，不承诺只给一个 role id 就补齐所有注册信息；agent_id/squad_id 必须显式提供，不生成默认值。本次范围收缩不代表删除既有心跳注册功能。

## 复审触发条件

需要跨项目默认身份、同角色多实例的启动简化，或要求工具/模型/技能配置时，再扩展单独契约。历史与状态管理需用户另行纳入范围。

## 相关页面

- 会话：[[sessions/2026-09-24-squad-role-frontmatter]]
- 概念：[[concepts/pi-squad]]
- 前序评估：[[sessions/2026-09-24-squad-agents-yaml-feasibility]]
