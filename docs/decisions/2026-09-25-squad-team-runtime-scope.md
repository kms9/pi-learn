---
title: 2026-09-25 Squad 专属目录与启动身份
type: decision
status: active
created: 2026-09-25
updated: 2026-09-25
decision_date: 2026-09-25
tags: [project-wiki, decision, pi-squad]
---

# 2026-09-25 Squad 专属目录与启动身份

## 决策

用户明确要求的目标：配置和运行状态集中到 `.agents/pisquad`；按启动参数/环境区分 Team Leader 与普通 Role；Controller 展示该身份；执行及质量审查前尝试获取 Controller 任务锁；每角色有独立、可更新的 `agents.md`，与稳定 `role.md` 分开。

目录采用用户第 4 条明确的复数 `roles` / `teams`。任务锁采用租约、规则在 attempt 边界热读、Leader 首版只加载 Team 的具体机制是技术提案，不视为用户已逐项批准。

## 背景

避免与同时使用的其它 Agent 产品配置/运行文件混用，并明确跨 Team 共享实例的当前上下文。

## 证据

- 2026-09-25 用户五项补充。
- [[sources/multica-team-runtime]]
- [需求文档](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md)
- [技术设计](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_DESIGN.md)

## 影响

未来实施将替换旧 `.agents/roles` 加载位置，但保留一角色一目录和 Markdown frontmatter 的既有选择。当前代码尚未迁移，旧使用说明仍描述实际行为；不得将规划当作已可用功能。多 Team 改造须连同消息授权迁移。

## 复审触发条件

需要一个运行实例动态切换 Leader/Role、强制跨 Team 历史隔离、自动选择成员，或使用远程/多用户 Controller 时重审。

## 相关页面

- 会话：[[sessions/2026-09-25-squad-team-runtime-design]]
- 概念：[[concepts/pi-squad]]
- 旧目录决策：[[decisions/2026-09-24-squad-role-directories]]（现有实现背景，目标路径由本条更新）。
