---
title: Pi Squad Team Runtime 需求文档
type: process
status: draft
created: 2026-09-25
updated: 2026-09-25
implementation_status: not_implemented
acceptance_status: not_run
decision_status: confirmed
tags: [pi-squad, team-runtime, requirements]
---

# Pi Squad Team Runtime 需求文档

> **Decision status: confirmed（2026-09-25）**  
> 当前 V1 调度决策已经确认：Team Leader 单实例、Role Primary 单实例、Role Action Team/SquadRun 单占用、Agent Attempt 单执行。后续若与 `TEAM_RUNTIME_PLAN.md` 历史方案冲突，以本文和 `TEAM_RUNTIME_DESIGN.md` 为准。


本文定义第四阶段 Team Runtime 的当前 V1 需求。原 TEAM_RUNTIME_PLAN.md 作为历史方案参考；本文件和 TEAM_RUNTIME_DESIGN.md 是当前实施依据。本文描述的新能力均待实现。

## 1. V1 调度结论

V1 允许同一 Project 配置并启动多个 Team，但主动限制调度拓扑，避免同时引入自动选 Agent、Role 多容量、跨 Team 抢占和自动故障转移。

四个核心唯一性约束：

| 资源 | V1 约束 |
|---|---|
| team_id | 同时最多一个有效 Leader Runtime |
| role_id | 同时最多一个 Team-schedulable Primary Agent |
| role_id | 同时最多一个 Action Team / SquadRun |
| agent_id | 同时最多一个正式 Active Attempt |

文件写入另外受 WriteReservation 控制。

因此 V1 是：

    Multi-Team
      + Single Leader per Team
      + Single Primary per Role
      + Single Action Team per Role
      + Single Attempt per Agent

不是全 Project 单 Active Team，也不是同 Role 多 Agent 自动负载均衡。

## 2. 术语

| 术语 | 定义 |
|---|---|
| RoleDefinition | 可复用职责模板，来源 roles/<role_id>/role.md |
| Role working instructions | 同 Role 的 agents.md 工作规则 |
| AgentInstance | 一个已注册 Pi 的稳定 agent_id 与当前 runtime/session |
| RolePrimaryBinding | role_id 到唯一可参与 Team Scheduler 的 primary_agent_id 绑定 |
| Secondary Agent | 同 role_id 的额外 AgentInstance；可正常独立使用，但 team_schedulable=false |
| TeamDefinition | 一个 Team 的 Leader、role roster、instructions、policy |
| SquadRun | 一次 Team 请求及其 DAG、上下文和结果 |
| RoleActionOwnership | 某 role_id 当前由哪个 team_id / squad_run_id 独占使用 |
| Action Team | 当前持有某 role_id 的 Team |
| ExecutionLease | 某 Primary Agent 对某 Task Attempt 的实际执行许可 |
| WriteReservation | 对声明文件路径的写入互斥 |

RolePrimaryBinding 回答“这个 Role 由哪个 Pi 代表参加 Team 调度”；RoleActionOwnership 回答“这个 Role 当前为哪个 Team/Run 工作”。两者不能合并。

## 3. 需求

### TR-01 Project Scoped Controller

- 声明配置统一位于 .agents/pisquad/roles 和 .agents/pisquad/teams。
- 运行状态统一位于 .agents/pisquad/.runtime。
- 从 cwd 向上找到最近的 .agents/pisquad 作为 Project Scope。
- 一个 Project 同时最多一个 Controller。
- Controller 使用 loopback 动态端口并发布 controller.json。
- 未发现合法 Controller 时未选择 Squad 身份的 Pi 完全 no-op；显式选择 Squad 身份则显示不可用。
- Controller 不自动 spawn / restart Pi。

### TR-02 Team Leader 单实例

- mode=leader 必须显式指定 team_id 与稳定 agent_id。
- 一个 Leader 进程只绑定一个 Team；进程生命周期内不动态换 Team。
- 同一 team_id 同时只允许一个有效 Leader Runtime。
- 第二个相同 Team Leader 注册时，Controller 返回 TEAM_LEADER_ALREADY_ACTIVE，包含现有 agent/runtime/session/last_seen 摘要；Extension 通知用户并退出 Leader 模式。
- 不同 Team 的 Leader 可以同时在线、同时处理各自 Run。
- /new 只更新同一 Runtime 的 session，不算重复 Leader。
- 同一稳定 Leader agent_id 退出后重启可重新绑定新 runtime_id；旧 runtime 的迟到写入受 epoch/fencing 拒绝。

### TR-03 Role Primary 单实例

- mode=role 必须显式指定 role_id 与稳定 agent_id。
- 同一 Project 的每个 role_id 同时只有一个 Team-schedulable Primary Agent。
- 第一个成功原子占用 role_id 调度身份的稳定 agent_id 成为 Primary。
- 同 role_id 后续启动的 AgentInstance 仍正常注册、正常手工对话、正常独立工作，但标记 secondary、team_schedulable=false。
- Secondary 不进入 Team roster 的可执行候选，不接受 scope=team Task、review、rework、team ask 或 peer invoke。
- Primary 绑定到 agent_id，不绑定单次 runtime_id；Primary 重启不因此失去身份。
- Primary offline 时 Role 变为 primary_offline / unavailable，不自动提升 Secondary。
- V1 只允许用户显式 release Primary 或 promote 某 Secondary；切换前必须确认旧执行状态，避免双执行。
- Team Scheduler 不在多个同 Role Agent 中做负载均衡。

### TR-04 多 Team 与 Role Action Team

- 多个 Team 可以同时存在、同时运行。
- TeamDefinition 的普通成员以 role_ref 表达；运行时由 Controller 解析 role_ref -> RolePrimaryBinding -> primary_agent_id。
- 一个 role_id 可以出现在多个 Team 的配置中，但任一时刻只能有一个 RoleActionOwnership。
- RoleActionOwnership 采用 lazy acquire：只有 Leader 第一次真正 dispatch 该 Role 时才申请，不在 Run 创建时预占全部 roster。
- Action ownership 采用 run scoped release。获取成功后 role_id 的 action_team_id 与 action_run_id 固定到当前 SquadRun，直到 Run 终止且执行状态安全确认。
- 同一 Run 内该 Role 暂时 idle 时不释放，避免 Primary 的 Pi Session 在多个 Team 上下文之间按 Task 来回切换。
- 其它 Team 对已被占用 Role 的请求返回 ROLE_BUSY，并进入 waiting_role，不失败整个 SquadRun。
- ROLE_BUSY 至少返回 role_id、primary_agent_id、action_team_id、action_run_id。
- Role 释放时 Controller 发布 role_available，重新唤醒等待该 Role 的 Team Leader。
- 不冲突的 Role 可以被其它 Team 正常并行调度。

### TR-05 Leader 对 Role 状态的发现与最终裁决

Leader briefing 对本 Team roster 的 Role 状态统一为：

- available
- working_here
- busy_other_team
- offline
- quarantined

Leader 可以根据 briefing 提前避免无效派发，但 briefing 不是锁。Controller 在 dispatch/acquire 时必须再次进行原子校验，解决两个 Leader 同时看到 free 的竞态。

遇到 busy_other_team：

- 当前 Run 标 waiting_role，并记录 blocked_on_role_id。
- Leader 只通知一次当前等待原因并结束本轮。
- Leader 不轮询 Role，不持续占模型执行槽。
- role_available 事件到达后才重新形成 leader_step。

### TR-06 Task ExecutionLease

RoleActionOwnership 不替代 Task ExecutionLease。

实际执行前 Controller 仍需原子检查：

- Task 可领取性和依赖
- Team/Run 授权
- role_id 的 Action Team 是否为当前 Run
- target agent 是否为该 Role 当前 Primary
- Primary runtime/session 在线且空闲
- agent_id 无其它 Active Attempt
- Project / Team task capacity
- write_set 无冲突

成功后创建 TaskAttempt、ExecutionLease 和必要 ResourceReservation。执行中续约、旧结果 fencing、失租隔离、Controller 重启对账继续沿用。

一个 agent_id 同时最多一个正式 Attempt。

### TR-07 Team ask / peer invoke 不得绕过 Role 调度

会触发目标 Role 新模型轮的 Team 行为都受 RolePrimaryBinding 和 RoleActionOwnership 约束：

- execute
- review
- rework
- team ask
- peer invoke

notice、status query、read existing result 不获取 Role Action Ownership。

Secondary 即使在线也不能通过 ask 或 peer invoke 被 Team 间接调用。

### TR-08 Role 配置与 agents.md

- RoleDefinition 使用 roles/<role_id>/role.md。
- 同目录 agents.md 保存较频繁变化的工作规则。
- Primary 和 Secondary 可以共享同一 RoleDefinition；Primary 身份不写进 role.md。
- agents.md 的变更以 Attempt 快照为边界；进行中的 Attempt 固定 hash。
- Team 专属规则写 Team instructions，当前执行事实写 TaskContract，不能自动回写 Role 文件形成跨 Team 污染。
- 项目/祖先 AGENTS.md 继续按 Pi 原生规则生效，Role 配置不能提升工具权限。

### TR-09 Team 配置

Team 配置示例语义：

    team_id: coding-team
    leader.agent_ref: coding-lead
    members:
      - role_ref: backend
        responsibility: 实现
      - role_ref: reviewer
        responsibility: 独立审查

要求：

- leader.agent_ref 为 Team 专属稳定身份。
- 普通 member V1 只需要 role_ref，不固定 worker agent_ref。
- 同一 Team 不重复 role_ref。
- Controller 校验 role_ref 存在，并在运行时解析 Primary。
- config_version 与内容 hash 固定到 SquadRun。
- V1 不支持按 role_ref 自动创建/启动 Pi，也不自动选择 Secondary。

### TR-10 Dashboard 与控制面

Dashboard 至少展示：

Team View：
- team_id
- leader agent/runtime/session
- Leader 是否单实例有效
- SquadRun 状态
- roster 中各 role 的 Primary、Action Team、Role 状态和等待原因

Role View：
- role_id
- primary_agent_id
- primary 在线状态
- secondary agent 列表
- team_schedulable
- action_team_id / action_run_id
- free / owned / primary_offline / quarantined

Agent View：
- agent_id
- role_id
- primary / secondary
- runtime/session
- team_schedulable
- current Team/Run/Task/Attempt

Secondary 必须明确显示 standalone，不能被用户误解为额外 Team capacity。

### TR-11 Workflow、审查与最终 Gate

- Workflow 只 materialize 为现有 Task DAG，不建立第二套执行引擎。
- Leader 通过结构化 decision 派发、等待、完成；不直接运行普通实施工具。
- 审查是独立 Task，同样需要对应 Role 的 Action ownership 和 Primary Agent ExecutionLease。
- required review 未通过、waiting_role 未解除、quarantined 未处理、依赖未完成时 complete 必须拒绝。
- review/rework 可以在同一 SquadRun 内继续使用已经持有的 RoleActionOwnership。

## 4. Multica 参考与本项目收缩

Multica 支持一个 Workspace 多个 Squad，每个 Squad 一个 leader_id，成员可以加入多个 Squad；其成员 role 是 roster 描述，并不是全局可锁 RoleDefinition。Multica 也不自动因为 Squad 提升并发。

Pi Squad V1 借鉴其“一个 Squad 一个 Leader、Leader 获取 roster/instructions、Task 明确携带 Squad 上下文”的思路，但额外增加两项复杂度控制：

1. role_id 只有一个 Team-schedulable Primary Agent。
2. role_id 同时只有一个 Action Team / SquadRun。

这两项是本项目约束，不冒称为 Multica 行为。

## 5. 验收矩阵

| ID | 场景 | 通过标准 |
|---|---|---|
| TR-A01 | 同 Project 启两个 coding-team Leader | 第二个返回 TEAM_LEADER_ALREADY_ACTIVE，通知后退出；第一个继续正常 |
| TR-A02 | 同时启动 coding-team 与 research-team Leader | 两个都在线，可并行处理不冲突 Role |
| TR-A03 | 第一个 reviewer Role 启动 | 成为 Primary，team_schedulable=true |
| TR-A04 | 第二个 reviewer Role 启动 | 正常注册为 Secondary；手工对话正常；Team Scheduler 不选择它 |
| TR-A05 | Primary reviewer offline，Secondary online | Role 显示 primary_offline；不自动提升，不自动接 Team 任务 |
| TR-A06 | 显式 promote Secondary | 旧 Primary 安全释放后新 Primary 生效；binding epoch 更新 |
| TR-A07 | Team A 首次 dispatch reviewer | lazy acquire 成功，Action Team=A、Action Run=A1 |
| TR-A08 | Team B 同时 dispatch reviewer | 返回 ROLE_BUSY，Run B=waiting_role；不创建 reviewer Attempt |
| TR-A09 | Team B 同时 dispatch researcher | researcher 不冲突，可继续运行 |
| TR-A10 | Team A reviewer Task 完成但 Run 未结束 | reviewer 仍归 Team A，不被 Team B 插队 |
| TR-A11 | Team A Run 安全结束 | reviewer ownership 释放并产生 role_available；Team B Leader 被重新唤醒 |
| TR-A12 | 两 Leader 同时看到 reviewer free 后竞争 | Controller CAS 只允许一个 Team 获取 ownership |
| TR-A13 | Team B 用 ask/peer invoke 绕过 reviewer busy | 同样返回 ROLE_BUSY，不触发 Secondary |
| TR-A14 | 同一 Primary 同时收到两个本 Team Task | 一个 Active Attempt，另一个排队 |
| TR-A15 | Primary /new | session 更新，不变更 Primary identity 或 Action Team |
| TR-A16 | Primary 重启 | 同 agent_id 可重绑定新 runtime；旧 runtime 迟到写被拒绝 |
| TR-A17 | Dashboard | 能从 Team/Role/Agent 三个视图解释 Leader、Primary、Action Team、waiting_role |
| TR-A18 | review/rework | 复用同一 Run 的 Role ownership，Acceptance Gate 保持有效 |
| TR-A19 | 失租/Controller 重启 | Role/Agent/write 资源进入可解释隔离，不因 Secondary 在线自动恢复 |
| TR-A20 | 独立 Pi 使用 | Secondary 正常独立使用，不受 Team Scheduler 禁止 |

原有项目发现、配置快照、文件写冲突、人工介入、DAG、幂等、迟到结果验收继续执行。

## 6. 实施顺序

1. Project discovery 与 Leader 单实例绑定。
2. RolePrimaryBinding：Primary / Secondary 注册和 Dashboard。
3. Team roster 改为 role_ref，Controller 解析 Primary。
4. RoleActionOwnership：lazy acquire、waiting_role、role_available 唤醒。
5. ExecutionLease 与 Role ownership 原子组合校验。
6. Team ask / peer invoke 接入同一 Role Gate。
7. DAG、review/rework、Acceptance Gate 全链路验收。
8. 最后再考虑 Role capacity > 1、自动 Secondary promotion 或更复杂的跨 Team 调度；这些不属于 V1。
