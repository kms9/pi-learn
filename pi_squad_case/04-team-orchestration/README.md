---
title: 阶段 04｜组成小队：对话驱动分工、交接、审查与返工
status: draft
type: process
requirements: confirmed
implementation_status: not_implemented
acceptance_status: not_run
updated: 2026-09-25
---

# 阶段 04｜组成小队：对话驱动分工、交接、审查与返工

## 0. 当前权威调度规则与文档优先级

2026-09-25 已确认第四阶段 V1 调度边界，后续实现、评审和验收均以以下规则为准：

1. **一个 Team 一个 Leader**：同一 `team_id` 同时只允许一个有效 Leader Runtime；重复启动返回 `TEAM_LEADER_ALREADY_ACTIVE` 并退出第二个 Leader 模式。
2. **一个 Role 一个 Primary**：同一 `role_id` 只有第一个成功取得调度身份的稳定 `agent_id` 作为 Team-schedulable Primary；后续同 Role 实例为 Secondary，可正常独立工作但不参与 Team 调度。
3. **一个 Role 一个 Action Team / SquadRun**：多个 Team 可同时运行，但共享 Role 同时只能被一个 SquadRun 占有；冲突 Team 进入 `waiting_role`，等待 `role_available` 后由 Leader 重新评估。
4. **一个 Agent 一个 Active Attempt**：Role ownership 不能代替实际执行租约；Primary Agent 同时最多执行一个正式 Attempt。
5. **普通 Team member 按 `role_ref` 配置**：Controller 运行时解析 `role_ref -> RolePrimaryBinding -> primary_agent_id`；Secondary 不作为候选。
6. **Primary 不自动故障转移**：Primary offline 时 Role 不可调度，不自动提升 Secondary；切换必须显式 release/promote 并完成旧执行对账。

文档优先级：

- `TEAM_RUNTIME_REQUIREMENTS.md`：当前规范性需求。
- `TEAM_RUNTIME_DESIGN.md`：当前技术实现契约。
- 本 `README.md`：阶段目标与验收摘要。
- `TEAM_RUNTIME_PLAN.md`：仅历史方案，`status: superseded`，不得作为新实施依据。


> 2026-09-25 调度模型修订：第四阶段采用 Multi-Team + Single Leader per Team + Single Primary per Role + Single Action Team per Role。详细契约见 TEAM_RUNTIME_REQUIREMENTS.md 与 TEAM_RUNTIME_DESIGN.md。本页只保留阶段目标、主流程和验收门。

## 1. 本阶段目标

用户可以在同一个 Project 中手动启动多个 Team Leader 和多个 Role Pi。多个 Team 可以同时存在、同时运行；但调度必须满足四个 V1 唯一性约束：

1. 每个 team_id 同时只有一个有效 Leader Runtime。
2. 每个 role_id 同时只有一个可被 Team 调度的 Primary Agent。
3. 每个 role_id 同时只归属于一个 Action Team / SquadRun。
4. 每个 agent_id 同时只执行一个正式 Attempt。

第二个同 Team Leader 启动时，Controller 必须返回 TEAM_LEADER_ALREADY_ACTIVE，Extension 通知用户并退出该 Leader 模式。

同 Role 的第二、第三个 Pi 可以正常启动、正常手工对话和独立工作，但标记为 secondary / team_schedulable=false，不进入 Team Scheduler，也不能被 Team peer invoke 绕过。

## 2. 核心运行模型

配置层允许多个 Team 同时引用同一个 role_id，例如 reviewer。

运行时由 Controller 维护：

    Role reviewer
      primary_agent = reviewer-1
      action_team = coding-team
      action_run = srun-001

此时：

- coding-team 可以继续给 reviewer 派发当前 Run 内的 review / rework。
- research-team 若请求 reviewer，返回 ROLE_BUSY，并进入 waiting_role。
- reviewer-2 即使在线也不会代替 reviewer-1 接 Team 任务。
- 不冲突的 Role 仍可被其它 Team 并行使用。

Action Team 是 role_id 维度的运行所有权，不是整个 Project 的唯一 Active Team。

## 3. Primary Role 规则

第一次成功占用某 role_id 调度身份的稳定 agent_id 成为该 Role 的 Primary：

    reviewer -> reviewer-1

绑定落在 agent_id，而不是 runtime_id。Primary 重启时可以用新的 runtime_id 重新绑定同一 agent_id；/new 只更新 session，不创建新的 Primary。

Primary offline 时 V1 不自动把 secondary 提升为 Primary。Role 显示 primary_offline / unavailable，由用户显式 release 或 promote 后切换，避免旧 Pi 仍执行时发生双写。

## 4. Action Team 规则

RoleActionOwnership 采用 lazy acquire + run scoped release：

- Team 不在 SquadRun 创建时一次性锁住全部 roster。
- Leader 第一次真正 dispatch 某 role_id 时，Controller 原子尝试获取该 Role。
- 获取成功后，该 role_id 的 Action Team 固定为当前 Team，Action Run 固定为当前 SquadRun。
- 即使该 Role 暂时没有 Active Task，只要 SquadRun 仍需要保持该 Role 的协作连续性，所有权不释放。
- SquadRun completed / failed / cancelled 且执行状态已确认后释放。
- 其它 Team 对该 Role 的请求进入 waiting_role，而不是失败整个 Run。

这样避免一个共享 Pi Session 在 Team A、Team B 之间按 Task 频繁切换上下文。

## 5. Leader 决策与等待

Leader 使用结构化 squad_decide，不解析自由文本宣布派发成功。

派发前 Leader briefing 会看到 roster 的统一状态：

- available
- working_here
- busy_other_team
- offline
- quarantined

Leader 可以提前发现 busy_other_team，但 Controller 在真正 dispatch 时仍必须再次 CAS 校验，避免并发竞态。

ROLE_BUSY 返回至少包含：

    role_id
    primary_agent_id
    action_team_id
    action_run_id

当前 Run 转为 waiting_role，Leader 向用户说明“该角色正在其它 Team 工作，等待释放”，然后结束当前协调轮，不轮询、不占 Leader 模型循环。

Role 释放时 Controller 产生 role_available 事件，唤醒等待该 Role 的 Team Leader 重新评估。

## 6. Team 配置

V1 的普通成员按 role_ref 配置，不把 Team 固定到某个 worker agent_ref：

    team: coding-team
    leader: coding-lead
    members:
      - role_ref: backend
      - role_ref: reviewer

Controller 在运行时解析：

    role_ref
      -> RolePrimaryBinding
      -> primary_agent_id

Leader 仍是 Team 独有稳定身份，team 配置保留 leader.agent_ref。

因此 Team 决定“需要什么 Role”，Controller 决定“当前哪个 Primary Agent 代表这个 Role 接受 Team 调度”。

## 7. Task DAG 与并发

Workflow 仍只生成统一 Task DAG，不新建第二套 Workflow Engine。

同一 Team 内可以并行使用不同 Role：

    backend task  ||  frontend task
                -> reviewer task

不同 Team 也可以同时运行，只要 Role 不冲突：

    coding-team   -> backend
    research-team -> researcher

如果都需要 reviewer，则只有 RoleActionOwnership 的持有方继续，另一个 Team waiting_role。

ExecutionLease、Agent Slot 与 WriteReservation 仍保留，因为 Role 独占不能替代一次 Attempt 的实例绑定、故障 fencing 和文件写冲突控制。

## 8. Messaging 与 peer invoke

凡是会触发该 Role 新模型工作轮的 Team 行为都必须经过 Role Primary + Action Team 校验，包括：

- formal Task
- review / rework
- team ask
- peer invoke

纯 notice、状态查询、读取既有结果不获取 Role Action Ownership。

Secondary Role 实例不能通过 ask 或 peer invoke 被 Team 间接调度。

## 9. Dashboard

Dashboard 至少提供三个视角。

### Team View

展示 team_id、Leader、Leader Runtime、Run 状态、每个 role 的 Primary、Action Team 和等待原因。

### Role View

展示：

    role_id
    primary_agent_id
    primary online/offline
    secondary instances
    action_team_id
    action_run_id
    role state

Role state 至少包括 free、owned、primary_offline、quarantined。

### Agent View

展示 agent_id、role_id、primary/secondary、team_schedulable、runtime/session、当前 Task/Attempt。

同一个 Role 的 secondary 必须明确显示 standalone，不能看起来像额外 Team capacity。

## 10. 状态机

SquadRun 增加 waiting_role：

    created
      -> planning
      -> running
      -> waiting_role
      -> running
      -> reviewing
      -> reworking
      -> completed

任意非终态仍可进入 blocked / needs_review / failed / cancelled。

waiting_role 不占目标 Role 的 ExecutionLease，不让 Leader 忙等；Role 释放事件触发重新调度。

## 11. 验收重点

阶段 04 新增以下必须验收的调度场景：

- TEAM-LEADER-01：同一个 Team 的第二个 Leader 启动被拒绝并退出；不同 Team Leader 可同时在线。
- ROLE-PRIMARY-01：第一个 reviewer agent 成为 Primary；后续 reviewer 实例为 secondary，正常手工使用但不可 Team 调度。
- ROLE-PRIMARY-02：Primary offline 不自动切换到 secondary；显式 promote/release 才改变绑定。
- ROLE-ACTION-01：Team A 获取 reviewer 后，Team B 对 reviewer 的派发进入 waiting_role。
- ROLE-ACTION-02：Team B 的其它不冲突 Role 仍可继续工作，不因 reviewer 忙而冻结整个 Team。
- ROLE-ACTION-03：Team A 的 Run 结束并安全释放 reviewer 后，Controller 唤醒 Team B Leader。
- ROLE-ACTION-04：Leader briefing 的 busy_other_team 与 dispatch 时 Controller 最终校验一致，竞态不能形成双占用。
- ROLE-ACTION-05：Team ask / peer invoke 不能绕过 RoleActionOwnership。
- AGENT-LEASE-01：Primary Agent 同时最多一个正式 Attempt；迟到旧 Attempt 不能推进新 Run。
- DASHBOARD-01：能直接看出 Team Leader 单实例、Role Primary/Secondary、Action Team、waiting_role 和当前 Attempt。

原有 DAG、review/rework、Acceptance Gate、write_set、人工介入与 Controller 重启验收继续保留。

## 12. 阶段退出门槛

第四阶段完成必须证明：

- 多个 Team Leader 可并存，但同 Team Leader 不重复。
- RoleDefinition 可被多个 Team 配置复用。
- 每个 Role 只有一个 Team-schedulable Primary。
- 同一 Role 同时只服务一个 Action Team / SquadRun。
- 不冲突 Role 可以跨 Team 并行。
- Role 冲突通过 waiting_role 和事件唤醒解决，而不是模型轮询。
- Task DAG、审查、返工、最终 Gate 仍由同一 Controller / Task Router 管理。
- Secondary Role Pi 的普通使用不受 Team Scheduler 限制。
