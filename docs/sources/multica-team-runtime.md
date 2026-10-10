---
title: Multica Team Runtime 源码参考
type: source
status: active
created: 2026-09-25
updated: 2026-09-25
source_path: https://github.com/multica-ai/multica/tree/1c908ea52c19f193d301ca9460fc1d7d100a1b3d
tags: [project-wiki, source-summary, pi-squad]
---

# Multica Team Runtime 源码参考

## 来源

- 外部仓库：https://github.com/multica-ai/multica
- 本轮 `git ls-remote HEAD`：`1c908ea52c19f193d301ca9460fc1d7d100a1b3d`，随后固定该 SHA 读取官方原始文件。
- 来源发布日期：unknown；Ingest 日期：2026-09-25。
- 未加入 submodule，没有修改上游；临时下载只用于核查。以下固定链接是持久证据。

## 摘要

Squad 是协作关系；某次任务在哪个 Squad 中、是否以 Leader 身份执行，则是运行上下文。不能用 Agent 的所有成员关系反推当前 Team，也不能从用户可写的 prompt 标题判断其权限。

## 关键事实

- [成员表](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/migrations/084_squad.up.sql)：成员唯一键包含 squad_id，同一成员可参与多个 Squad。
- [任务的 squad_id](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/migrations/127_task_squad_id.up.sql)：Leader task 明确记录当前 Squad，避免一个 Agent 领导多个 Squad 时反查歧义。
- [Leader 身份](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/internal/daemon/prompt.go)：`taskIsSquadLeader` 使用协议字段，有旧服务器兼容逻辑；现代协议不从可写 prompt 识别角色。
- [Briefing](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/internal/handler/squad_briefing.go)：动态组合协调协议、成员名册和 Team instructions。
- [配置 handler](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/internal/handler/squad.go)：服务端管理 Leader 与成员，非本地目录配置；Leader 自动入成员表。
- [领取服务](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/internal/service/task.go)：`claimTask` 在事务内锁 Agent，核验 runtime 与并发限制后领取。

## 相关页面

- 概念：[[concepts/pi-squad]]
- 会话：[[sessions/2026-09-25-squad-team-runtime-design]]
- [本项目技术设计](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_DESIGN.md)

## 证据备注

源码静态核对，不代表运行验收。`.agents/pisquad/teams/<id>/team.json`、固定启动 mode、Agent 容量 1、SQLite 租约恢复均为 Pi Squad 方案，不是 Multica 既有标准。未证明 Multica 提供跨 Team session 历史隔离；不要从成员多对多推导此结论。
