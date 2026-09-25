---
title: Pi Squad Team Runtime 技术设计
type: process
status: draft
created: 2026-09-25
updated: 2026-09-25
implementation_status: not_implemented
acceptance_status: not_run
baseline_commit: b8da2f23a191d206d03ec306a597cbdd17a9a724
tags: [pi-squad, team-runtime, design]
---

# Pi Squad Team Runtime 技术设计

需求编号见 TEAM_RUNTIME_REQUIREMENTS.md。本文件定义第四阶段最新调度模型，替代此前“普通 Team member 固定 agent_ref、仅靠 agent execution lease 解决跨 Team 共享”的方案。

## 1. 调度资源层次

V1 统一为：

    Team
      -> role_id
      -> RolePrimaryBinding
      -> primary_agent_id
      -> TaskAttempt

并同时维护：

    TeamLeaderBinding
    RoleActionOwnership
    ExecutionLease
    WriteReservation

四层资源分别解决：

| 资源 | key | 作用 |
|---|---|---|
| TeamLeaderBinding | project_root + team_id | 同 Team 只能有一个 Leader Runtime |
| RolePrimaryBinding | project_root + role_id | 同 Role 只有一个 Team-schedulable Primary Agent |
| RoleActionOwnership | project_root + role_id | 同 Role 同时只服务一个 Team / SquadRun |
| ExecutionLease | project_root + agent_id | 同 Agent 同时只执行一个正式 Attempt |
| WriteReservation | normalized path | 防止受管 Task 并发写同一资源 |

RolePrimaryBinding 和 RoleActionOwnership 是 V1 新增的复杂度控制，不能用 ExecutionLease 代替。

## 2. Leader 注册与单实例

建议新增持久 TeamLeaderBinding：

    team_id
    leader_agent_id
    runtime_id
    runtime_session_id
    binding_epoch
    status
    last_seen

注册流程：

    BEGIN IMMEDIATE
      load TeamDefinition
      validate requested agent_id == team.leader.agent_ref
      read TeamLeaderBinding(team_id)

      if binding has another live runtime:
          return TEAM_LEADER_ALREADY_ACTIVE

      if same agent_id/same runtime changes session:
          update session only

      if previous runtime confirmed offline or explicitly released:
          binding_epoch += 1
          bind new runtime
    COMMIT

第二个重复 Leader 的 Extension 收到冲突后：

1. 显示现有 Leader 摘要。
2. 不开放 Leader tools。
3. 停止 heartbeat / registration retry。
4. 退出该 Leader 模式。

不同 team_id 使用不同 TeamLeaderBinding，可同时在线。

旧 runtime 的所有写接口都带 binding_epoch；epoch 不匹配拒绝。

## 3. Role Primary 注册

建议新增 RolePrimaryBinding：

    role_id PRIMARY KEY
    primary_agent_id
    binding_epoch
    state
    updated_at

Role Agent 注册不因为 Primary 已存在而失败。

流程：

    register role agent
      |
      +-- RolePrimaryBinding 不存在
      |      -> CAS create primary_agent_id = this agent_id
      |      -> role_binding = primary
      |      -> team_schedulable = true
      |
      +-- primary_agent_id == this agent_id
      |      -> primary 重启 / session 更新
      |      -> team_schedulable = true
      |
      +-- primary_agent_id != this agent_id
             -> role_binding = secondary
             -> team_schedulable = false
             -> 正常注册

Primary 绑定稳定 agent_id，不绑定 runtime_id。

V1 不实现自动 failover。Primary offline：

    RolePrimaryBinding 保留
    role_state = primary_offline

Secondary online 不改变它。

显式 promote/release 必须先校验：

- Primary 无 Active Attempt。
- 该 Role 无未解决 quarantined execution。
- 该 Role 若有 Action ownership，需要先结束/恢复对应 Run，不能直接换人偷渡。
- 更新 binding_epoch，旧 Primary 后续 Team 写入被拒绝。

## 4. Team 配置解析

普通成员从固定 agent_ref 改为 role_ref：

    {
      "team_id": "coding-team",
      "leader": { "agent_ref": "coding-lead" },
      "members": [
        { "role_ref": "backend", "responsibility": "实现" },
        { "role_ref": "reviewer", "responsibility": "独立审查" }
      ]
    }

Leader 仍固定 agent_ref，因为它是 Team 身份。

普通成员运行时解析：

    team role_ref
      -> RolePrimaryBinding
      -> primary_agent_id
      -> current runtime/session

TeamDefinition 不保存 Secondary，也不在多个实例之间做 picker。

同一 Team role_ref 唯一。多个 Team 可以引用相同 role_ref。

## 5. RoleActionOwnership

建议新增表：

    role_action_ownership
      role_id PRIMARY KEY
      team_id
      squad_run_id
      primary_agent_id
      acquired_at
      state
      revision

Primary key / unique key 体现：同一 project role_id 同时只能一条 active ownership。

### 5.1 Lazy acquire

不在 SquadRun 创建时锁全部 roster。

Leader 第一次 dispatch 某 role_id：

    BEGIN IMMEDIATE
      validate run active
      validate role is in run roster
      resolve current Primary
      validate Primary schedulable and online enough for admission
      read RoleActionOwnership(role_id)

      if none:
          insert ownership(team_id, squad_run_id, primary_agent_id)
          success

      if same team_id + same squad_run_id:
          success / idempotent

      if owned by another run:
          return ROLE_BUSY
    COMMIT

ROLE_BUSY 返回：

    role_id
    primary_agent_id
    action_team_id
    action_run_id
    ownership_revision

### 5.2 Run scoped ownership

RoleActionOwnership 不跟随单 Task 完成释放。

例如 Team A：

    reviewer review-1 done
    backend rework running
    reviewer temporarily idle

reviewer 仍属于 Team A 的 SquadRun。Team B 不能在中间插入 reviewer Task。

安全释放条件：

- SquadRun completed / failed；或
- cancel 已确认相关 Role 的所有 execution 停止；或
- 用户显式 recovery 决定释放，且 quarantined side effects 已对账。

只看到当前没有 Active Attempt 不足以释放 ownership。

## 6. waiting_role 与事件唤醒

SquadRun 增加 waiting_role 信息：

    status = waiting_role
    blocked_on_role_id = reviewer
    blocked_by_team_id = coding-team
    blocked_by_run_id = srun-a

Leader 遇到 ROLE_BUSY 后：

- 记录一次结构化 waiting decision。
- 向用户说明等待原因。
- 当前 leader_step settled。
- 不轮询 Controller。
- 不持有目标 Role 的任何半资源。

RoleActionOwnership 释放后：

    emit role_available(role_id, revision)
      -> find waiting runs
      -> mark candidate ready
      -> enqueue leader_step for each affected Team

多个等待 Team 被同时唤醒也没有问题；真正 acquire 时仍由 CAS 决定下一个 Action Team。

V1 不要求复杂优先级算法。可以按 waiting_since + team_id 稳定排序，后续再升级公平策略。

## 7. Leader briefing

Leader 每轮得到当前 Team roster 的 Role 级状态，而不是所有同 Role Agent：

    reviewer
      primary_agent_id: reviewer-1
      state: busy_other_team
      action_team_id: coding-team
      action_run_id: srun-a

状态定义：

| 状态 | 含义 |
|---|---|
| available | Primary 存在且 Role 未被其它 Run 占用 |
| working_here | Role ownership 属于当前 SquadRun |
| busy_other_team | Role ownership 属于其它 Team/Run |
| offline | Primary 不可用，且无可安全执行 runtime |
| quarantined | Role 或 Primary 存在故障未对账 |

Secondary 不进入 Leader roster。

Leader briefing 是提示信息；dispatch 路径必须再次调用 Controller 原子校验，不能仅信 briefing。

## 8. ExecutionLease 与 Role ownership 的组合

实际创建 Attempt 时，Controller 要保证 Role ownership 和 Agent execution 同时正确。

建议事务顺序：

    BEGIN IMMEDIATE
      validate task revision / dependencies
      validate team/run active
      validate task.role_id belongs to run roster
      validate RoleActionOwnership.role_id belongs to this team/run
      resolve RolePrimaryBinding
      validate task target == primary_agent_id
      validate primary runtime/session binding
      validate no active/quarantined Agent reservation
      validate project/team task capacity
      validate write_set
      CAS task queued -> leased
      create TaskAttempt
      create ExecutionLease
      create Agent reservation
      create WriteReservation
    COMMIT

注意：

- RoleActionOwnership 可以早于具体 Attempt 获得并跨多个 Task 保留。
- ExecutionLease 只覆盖一个 Attempt。
- Agent key 仍是 project_root + agent_id。
- Role key 是 project_root + role_id。
- Team ID 不能加到 Agent key 或 Role key 中绕过互斥。

失租、迟到结果、Controller epoch、fencing token 与原设计一致。Role ownership 在状态不明时不能仅因为 lease TTL 到期而释放。

## 9. Team ask 与 peer invoke

消息分为两类。

不触发目标模型的新信息：

- notice
- status
- read existing result

不申请 Action ownership。

会触发目标模型工作轮：

- team ask
- peer invoke
- execute
- review
- rework

都必须走：

    role_ref
      -> Primary
      -> Action ownership
      -> Agent work gate

Secondary 对 team scope 的这类请求返回 ROLE_NOT_SCHEDULABLE 或在路由前就永远不被选中。

这样不能用 ask 绕过 ROLE_BUSY。

## 10. Context 注入

Role Primary 执行 Team Task 时，TaskContract 至少包含：

    role_id
    primary_agent_id
    team_id
    squad_run_id
    task_id
    attempt_id
    task kind
    goal
    dependencies / refs
    acceptance
    tool constraints
    write_set
    role rules hash

Action Team 不永久写入 role.md / agents.md。

上一个 Attempt 的动态 Task 块结束后清除；Pi 历史聊天仍可能保留，因此 V1 通过 Run-scoped Role ownership 避免一个 Primary 在两个 Team 之间高频交错，而不是声称提供历史隔离。

## 11. Dashboard 数据模型

### 11.1 Team View

至少显示：

    team_id
    leader_agent_id
    leader runtime/session
    leader binding epoch
    current runs
    each role:
      primary agent
      role state
      action team/run
      waiting reason

### 11.2 Role View

至少显示：

    role_id
    primary_agent_id
    primary online state
    primary binding epoch
    secondary agents
    action_team_id
    action_run_id
    ownership revision
    state

### 11.3 Agent View

至少显示：

    agent_id
    role_id
    role_binding = primary / secondary
    team_schedulable
    runtime/session
    activity
    current task/attempt
    quarantined state

同 Role 的 secondary 不展示成额外 scheduler capacity。

## 12. 错误与状态码

建议统一：

| code | 含义 |
|---|---|
| TEAM_LEADER_ALREADY_ACTIVE | 同 Team 已有有效 Leader Runtime |
| ROLE_NOT_PRIMARY | 请求的 Agent 不是该 Role Primary |
| ROLE_NOT_SCHEDULABLE | Secondary 不能接 Team 模型工作 |
| ROLE_PRIMARY_OFFLINE | Primary 存在但当前不可执行 |
| ROLE_BUSY | Role 被其它 Team/Run 占有 |
| ROLE_QUARANTINED | Role 存在未对账执行状态 |
| AGENT_BUSY | Primary Agent 已有 Active Attempt |
| CAPACITY_UNAVAILABLE | 项目/Team task capacity 暂不可用 |
| WRITE_CONFLICT | write_set 冲突 |

ROLE_BUSY 是可等待状态，不应自动变成 SquadRun failed。

## 13. Dashboard 与 Controller 状态变更

Controller 是所有调度事实的权威来源。Leader 不能自己修改：

- primary_agent_id
- team_schedulable
- action_team_id
- ownership release
- ExecutionLease
- WriteReservation

Dashboard 只读展示，后续若增加 promote/release 操作，必须走显式 Controller command，并留下 audit event。

## 14. 数据模型

建议实体：

| 实体 | 关键字段 |
|---|---|
| AgentInstance | agent_id、role_id、mode、runtime/session、online/activity |
| TeamLeaderBinding | team_id、leader_agent_id、runtime/session、binding_epoch |
| RoleDefinition | role_id、role_hash、working_instructions_hash |
| RolePrimaryBinding | role_id、primary_agent_id、binding_epoch、state |
| TeamDefinition | team_id、config_version、config_hash、leader_agent_id |
| TeamRoleMembership | team_id、config_version、role_id、responsibility |
| RoleActionOwnership | role_id、team_id、squad_run_id、primary_agent_id、revision、state |
| SquadRun | run_id、team_id、roster/config snapshot、status、blocked_on_role_id |
| Task | task_id、run_id、role_id、kind、dependencies、write_set、state |
| TaskAttempt | attempt_id、task_id、primary_agent_id、runtime/session、context hashes |
| ExecutionLease | lease_id、attempt_id、controller_epoch、fencing_token、expires_at |
| ResourceReservation | lease_id、resource key、state |

旧 TeamMembership(agent_id) 的 V1 方向改成 TeamRoleMembership(role_id)。Agent 到 Team 的运行关系由 Primary + Action ownership 动态解析，不再把所有普通 Team member 固定到 agent_id。

## 15. 迁移影响

当前旧 squad_id 与已有 messaging 授权不能直接删除。

迁移建议：

1. 增加 RolePrimaryBinding、TeamLeaderBinding、TeamRoleMembership、RoleActionOwnership。
2. 将 Team 普通 member 配置迁移为 role_ref；若旧 member 无法唯一映射 role_id，要求人工确认。
3. 当前 Agent Registry 保留 role_id 与稳定 agent_id；注册后计算 primary/secondary。
4. team scope 消息增加明确 team_id / run context，并通过 role gate 处理会触发模型的 ask。
5. list_agents 继续列全部 Agent，但 Team roster 查询只返回每个 role 的 Primary projection。
6. 旧历史消息保留原授权快照，不把新模型反向套到历史记录。
7. 升级期间拒绝新旧调度协议混跑。

## 16. 实施顺序

第一步：TeamLeaderBinding 和重复 Leader 拒绝。
第二步：RolePrimaryBinding，注册 primary / secondary，并更新 Dashboard。
第三步：Team member 从 agent_ref 改为 role_ref。
第四步：RoleActionOwnership、waiting_role、role_available 事件。
第五步：ExecutionLease acquire 同时校验 ownership + Primary。
第六步：team ask / peer invoke 接入 Role gate。
第七步：review/rework/Acceptance Gate 全链路。
第八步：故障、重启、promote/release、Dashboard 验收。

V1 暂不实现：

- Role capacity > 1
- 自动从 Secondary 选空闲实例
- Primary 自动 failover
- Team 间抢占 Role
- Task 级 Role ownership 释放
- 基于负载的 Agent picker

这些能力以后可以建立在当前数据模型上增加，不应提前进入第四阶段。
