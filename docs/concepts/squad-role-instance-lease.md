---
title: Squad Role Primary、Action Team 与任务租约
type: concept
status: active
created: 2026-09-25
updated: 2026-09-27
tags: [project-wiki, concept, pi-squad]
---

# Squad Role Primary、Action Team 与任务租约

## 是什么

第四阶段 V1 把“Role 配置复用”和“谁能被 Team 调度”明确拆开。

RoleDefinition 是岗位模板，例如 reviewer。可以启动多个 reviewer Pi，但一个 Project 中只有一个 reviewer Agent 是 Team Scheduler 的 Primary。

例如：

    reviewer-1 = Primary, schedulable
    reviewer-2 = Secondary, standalone
    reviewer-3 = Secondary, standalone

Secondary 可以正常手工对话、使用工具和完成独立工作，只是不接受 Team 的 execute、review、team ask 或 peer invoke。

Primary 绑定稳定 agent_id，不绑定单次 runtime。Primary 暂时 offline 时不会自动把 Secondary 提升，避免旧进程仍执行导致双写；切换需要显式 release / promote。

## Action Team

多个 Team 可以同时引用 reviewer，但 reviewer 同时只能服务一个 SquadRun。

2026-09-27 用户确认：Team 激活（Run 准入）时，一次性占用该 Team roster 中的全部 Role。任一 Role 已被其它 Run 占用，就一个也不占，整个 Run 排队。

例如 coding-team 的 roster 是 backend + reviewer，research-team 的 roster 是 researcher + reviewer：

    coding-team   active, owns backend + reviewer
    research-team queued, waiting_roles = [reviewer], owns nothing

RoleActionOwnership 保存：

    role_id = reviewer
    action_team_id = coding-team
    action_run_id = run-a

ownership 属于 team/run，不绑定具体 Primary；换 Primary 不改变 ownership。

research-team 排队期间不会先占 researcher，所以不存在“各占一半、互相等待”的环。roster 与 coding-team 不相交的 Team 可以同时 active。

Action ownership 是 Run scoped。即使 reviewer 的某一个 Task 已完成，只要 coding-team 的该 SquadRun 未安全结束，就不释放给其它 Team。Run 安全结束（或用户显式 `/squad cancel run` 并对账完成）后整体释放并触发 role_available，排队 Run 按请求顺序重新准入。

## 为什么还要 ExecutionLease

RoleActionOwnership 只解决“哪个 Team 当前拥有这个 Role”。

ExecutionLease 解决“Primary Agent 当前是否可以执行这一个 Attempt”。

所以顺序是：

    Team
      -> role_id
      -> Action Team ownership
      -> Primary Agent
      -> ExecutionLease
      -> TaskAttempt

Agent 在线心跳、Role Primary、Action ownership 和 Task lease 是不同状态，不能互相替代。

## Leader

一个 Team 同时只有一个有效 Leader Runtime。

同 Team 第二个 Leader 启动时：

    TEAM_LEADER_ALREADY_ACTIVE

通知用户后退出 Leader 模式。

不同 Team 的 Leader 可以同时运行。

Leader briefing 只包含本 Run 已占用的 Role，展示各自 Primary 与 idle / working / offline / quarantined 状态。

两个 roster 相交的 Run 同时准入时，由 Controller 在一个事务里裁决，只有一个成功占用，另一个整体排队。

## 不是什么

- Primary 不是“唯一允许启动的 Role Pi”；Secondary 完全可以正常使用。
- Secondary 不是热备自动接管者；V1 不自动 failover。
- Action Team 不是全 Project 唯一 Active Team；roster 不相交的 Team 可以同时 active。
- Role ownership 不是 Task lease；Run 中 Role 暂时 idle 也可以继续被当前 Action Team 持有。
- Task lease 过期不等于 Pi 已停止；状态不明时仍需 quarantine / 对账。
- Role ID 不是 Agent ID；Team 普通成员通过 role_ref 找 Primary，不固定 worker agent_ref。

## 一句话

V1 的调度边界是：

    一个 Team -> 一个 Leader
    一个 Role -> 一个 Primary Agent
    一个 Role -> 同时一个 Action Team / SquadRun
    一个 Agent -> 同时一个正式 Attempt

这套限制用于先验证稳定的 Team 协作闭环；Role 多容量、自动 Secondary 选举和自动故障转移以后再增加。

## 证据

- 需求：../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md
- 技术设计：../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_DESIGN.md
- 阶段合同：../../pi_squad_case/04-team-orchestration/README.md

## 相关页面

- 概念：[[concepts/pi-squad]]
- 来源：[[sources/multica-team-runtime]]
- 会话：[[sessions/2026-09-25-squad-role-lease-explanation]]
