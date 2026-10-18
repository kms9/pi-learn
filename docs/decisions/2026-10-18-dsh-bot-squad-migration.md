---
title: 2026-10-18 DS Bot 产品化入口与 Squad 策略迁移决策
type: decision
status: active
created: 2026-10-18
updated: 2026-10-18
decision_date: 2026-10-18
tags: [dsh-bot, pi-squad, migration]
---

# DS Bot 产品化入口与 Squad 策略迁移

## 已确认方向

用户明确现有 Pi Squad 的 TUI/多进程方式成为对外演示障碍，第一目标改为**让真实用户/非开发同事尽快使用完整的长期 Bot、多模型、群聊、记忆、人机接力产品**，再在同一界面演示和客观验证 Squad 的 DAG、独立审核、任务验收、角色调度与恢复机制带来的价值。

采用 **DS Bot Web + DSH Agent/Session Runtime + 复用 Go Controller + 新增 DSH Adapter**。自由协作保留 DS Bot 的原生消息和普通 Handoff；受控模式由 Go Controller 唯一持有 Task/Run/Attempt/Acceptance，不把普通 `state.works` 当作任务状态真源。

## 关键边界

1. 受控 Run 冻结 Team/Role/Workflow/模型与策略；`@Bot`、`group_relay`、`message_bot`、`post_to_group`、定时及自动恢复不能绕过正式派发。
2. Main Bot / Group Admin / Run Leader 分权；逻辑 Bot 与 DSH Session/Runtime 分离。
3. 候选结果、实际 settled、业务验收 accepted、资源释放 released 是不同事实。
4. 模型在 DS Bot 中可按 Bot 配置；严格实验冻结路由与记忆，不允许默认 fallback 破坏对照。
5. 延续用户 2026-10-04 决策：**取消业务 Task 固定 120 秒硬截止，不换为可配置业务硬截止**；必要下游明确结束后才能完成。通信 Lease/故障隔离仍保留。
6. 新分支 `dsh_squad_dev` 基于 `pi_squad_dev@f1bb9f47baf92fb99626d8d20504c2787a0e3ac6`；`dsh-bot/` 以真正 submodule 固定 `e13bc3419d2695a509520d850a07e63f05c34e07`。本轮仅引入上游源码和迁移方案，没有完成 Adapter 或运行验收。

## 风险与复审

DSH 固定版本的 Agent Hooks、工具 Guard、群聊接管、真实收尾、Session part 与自动恢复需要 M1 探针验证。不满足原 Squad 安全语义时必须缩小受控模式，不能通过 Prompt 假设绕过。

## 参考

- [迁移实施方案](../../dsh_squad_case/MIGRATION_PLAN.md)
- [迁移验收](../../dsh_squad_case/ACCEPTANCE.md)
- [Pi Squad Stage04](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md)
- [业务任务明确完成决策](2026-10-04-squad-explicit-completion-and-context.md)
- [DS Bot 来源](../sources/dsh-bot.md)
