---
title: 2026-09-25 Team Runtime 评估与需求技术文档
type: session
status: active
created: 2026-09-25
updated: 2026-09-25
tags: [project-wiki, session, pi-squad]
---

# 2026-09-25 Team Runtime 评估与需求技术文档

## 用户要做什么

评估 TEAM_RUNTIME_PLAN.md，结合命名空间、多 Team 当前上下文、任务锁、启动身份及角色 agents.md 五项补充，输出需求文档和技术文档。

## 达成了什么

- 原方案大方向可保留，但基线、角色格式、目录、Leader 启动约束和消息授权迁移需要修正。
- 交付 [需求文档](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md) 与 [技术文档](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_DESIGN.md)，原稿标为历史规划并链接新稿。
- 核查 Multica 固定 SHA：多对多 membership 与 task-scoped Team 分开，当前现代协议明确 Leader task 身份；本项目首版固定启动 mode 是有意不同的选择。
- 共享 Role 是模板复用；共享 Agent 需全局串行任务槽与显式 team_id，不能承诺清除历史。租约过期不自动释放未知执行；文件写 reservation 保持隔离直至对账。
- 专属 agents.md 与项目 AGENTS.md 分工；建议按 attempt 固定快照，下一项任务加载更新，团队任务细节不自动写回共享角色规则。
- 仅文档工作，没有迁移实际目录、改插件、重启服务、派发验收或声称运行通过。

## 写回了哪些 wiki 页

- [[sources/multica-team-runtime]]、[[sources/source-register]]
- [[decisions/2026-09-25-squad-team-runtime-scope]]
- [[concepts/pi-squad]]、[[questions/open-questions]]、[[index]]、[[log]]

## 未决

agents.md 生效策略、Leader 是否未来复用普通 Role、租约默认值和 session 路径校验见 Q13–Q15。文档已给首版建议，不把它们伪装为用户已确认。

## 相关页面

- 决策：[[decisions/2026-09-25-squad-team-runtime-scope]]
- 概念：[[concepts/pi-squad]]
- 来源：[[sources/multica-team-runtime]]
