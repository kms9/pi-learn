---
title: Pi Squad Team Runtime 后续需求与架构规划
status: superseded
type: process
branch: pi_squad_dev
baseline_commit: 800cbf596e19697dc50d35da16d09bbd19c46899
updated: 2026-09-25
---

# Pi Squad Team Runtime 后续需求与架构规划

> 2026-09-25：本文保留为历史方案。当前修订目标见 [需求文档](TEAM_RUNTIME_REQUIREMENTS.md) 与 [技术文档](TEAM_RUNTIME_DESIGN.md)，其中包含本方案评估、五项补充与 Multica 固定源码证据。本文的旧目录、基线、Leader 策略和实施顺序不再作为新实施依据；不代表新方案已实现。

## 1. 文档目的

本文整理当前 pi_squad_dev 分支在 Role 注入、Agent 注册和 Controller 基础能力之后，对“类似 Multica 的小队能力”的下一阶段需求，并给出可行性判断、架构调整建议和推荐实施顺序。

本文不是替代现有 04-team-orchestration/README.md 的阶段验收合同，而是补充其前置基础设施和数据模型决策。后续实施时，04 阶段仍以 Task / SquadRun / DAG / Acceptance Gate 为执行主线。

当前基线：

- Pi Extension 已支持 PI_SQUAD_CONFIG、role_prompt 注入、Agent 注册、heartbeat、list_agents。
- Go Controller 已切换到 Gin + SQLite，并提供 register / heartbeat / list / get Agent。
- role_prompt 在 Pi 进程启动时读取一次，在每次 before_agent_start 时追加到当前轮 system prompt。
- Messaging、Invocation、Team Runtime 尚未真正落地。
- 当前 Agent 模型将 squad_id 直接放在 Agent 记录中，且注册时必填。
- 现有 04-team-orchestration 设计已经包含 SquadRun、Task DAG、Leader、Task Router、max_parallel_tasks、Acceptance Gate 等概念。

本次新增需求的核心不是重新设计一套 Team 系统，而是解决以下五个问题：

1. Controller 如何限定在当前项目目录。
2. Pi Extension 如何自动发现并决定是否启用 Squad 能力。
3. Role、Agent、Team 的关系如何支持多个 Team。
4. Leader 应该获得什么上下文，以及如何只负责编排而不直接执行。
5. Workflow 和多个 Team 并发时，如何统一进入现有 Task Router 与执行槽模型。

---

# 2. 规范化需求列表

| ID | 需求 | 目标 |
|---|---|---|
| R1 | Project Scoped Controller | 每个项目目录独立启动 Controller，不依赖全局唯一 Controller |
| R2 | Controller Discovery | Pi Extension 从当前项目根目录发现 Controller 连接信息 |
| R3 | Conditional Activation | 未发现有效 Controller 时 Squad Extension 完全 no-op |
| R4 | Role / Team 配置分离 | .agents/roles 定义角色，.agents/teams 定义小队 |
| R5 | Team 多对多成员关系 | 同一个 Role 或 Agent 可以同时属于多个 Team |
| R6 | Team Leader Runtime | Leader 负责规划、派发、等待、验收，不默认执行 Worker 工作 |
| R7 | Team-aware Control Plane | Controller/TUI 展示 Team、成员、在线状态、Run 和 Task |
| R8 | Context Scope | 每个 Runtime 只加载完成当前职责需要的上下文 |
| R9 | Team Workflow / DAG | Team 支持顺序、并行、依赖、审查等编排规则 |
| R10 | Cross-Team Concurrency | 多个 Team 同时运行时由 Controller 统一管理 Team/Agent 并发 |

建议把 R1-R3 视为 P0.5 基础设施，把 R4-R8 视为 Team Runtime，把 R9-R10 视为 Orchestration。

---

# 3. 关键架构结论

## 3.1 cwd scope 应升级为 Project Root Scope

需求原意是：只有在当前目录先启动 Controller，当前目录中的 Pi 才获得 Squad 能力。

方向正确，但不能严格绑定 process.cwd()。

例如：

~~~
project/
├── .agents/
└── backend/
    └── service/
~~~

Controller 从 project 启动，而 Pi 从 project/backend/service 启动时，如果只检查当前 cwd，就会错误认为 Controller 不存在。

因此定义：

> project_root = 从当前 cwd 向父目录查找最近的 .agents 目录，其父目录即当前 Pi Squad Project Root。

Controller、Role、Team、Runtime State 均绑定 project_root，而不是绑定某个临时 shell cwd。

---

## 3.2 .agents 同时承担声明配置入口，但运行状态必须单独隔离

推荐目录：

~~~
project/
└── .agents/
    ├── roles/
    │   ├── reviewer/
    │   │   ├── role.json
    │   │   └── prompt.md
    │   ├── backend/
    │   └── researcher/
    │
    ├── teams/
    │   ├── coding-team/
    │   │   ├── team.json
    │   │   ├── instructions.md
    │   │   └── workflows/
    │   │       └── default.json
    │   └── research-team/
    │
    └── .runtime/
        ├── controller.lock
        ├── controller.json
        └── state.sqlite
~~~

职责：

| 目录 | 含义 | 是否进入 Git |
|---|---|---|
| .agents/roles | RoleDefinition / 人格、职责、能力 | 是 |
| .agents/teams | TeamDefinition / 成员拓扑、Team Policy | 是 |
| .agents/teams/*/workflows | WorkflowDefinition / 顺序和依赖 | 是 |
| .agents/.runtime | 当前机器的 Controller 与运行状态 | 否 |

建议加入：

~~~
.agents/.runtime/
~~~

到 gitignore。

核心原则：

> 配置状态和运行状态分离。

---

# 4. Project Scoped Controller

## 4.1 Controller 启动

Controller 必须从一个 project_root 启动，并持有：

- project_root
- controller_id
- protocol_version
- endpoint
- pid
- started_at
- SQLite state path

同一个 project_root 同一时刻只允许一个有效 Controller。

## 4.2 controller.lock

controller.lock 只承担单实例协调职责，不承担完整服务发现职责。

目标：

- 避免同一个 project_root 启动两个 Controller。
- Controller 异常退出后能够识别 stale lock。
- lock 不作为 Pi Extension 的唯一可信连接信息。

## 4.3 controller.json

Controller 启动成功后写入：

~~~
.agents/.runtime/controller.json
~~~

建议结构：

~~~json
{
  "schema_version": 1,
  "protocol_version": "pi-squad/1",
  "controller_id": "ctl_xxx",
  "project_root": "/Users/logo/work/foo",
  "pid": 38172,
  "endpoint": "http://127.0.0.1:49371",
  "started_at": "2026-09-24T22:00:00+08:00"
}
~~~

Pi Extension 不再依赖固定默认地址判断 Controller 是否存在，而是读取当前 project_root 的 controller.json。

---

# 5. Controller 端口策略

当前 Controller 默认使用 127.0.0.1:18741。

当多个项目同时运行时：

~~~
project-A -> controller-A
project-B -> controller-B
project-C -> controller-C
~~~

固定端口会发生冲突。

推荐：

~~~
listen 127.0.0.1:0
~~~

由 OS 分配可用端口，再把最终 endpoint 写入 controller.json。

当前阶段不优先切 Unix Domain Socket，原因是现有 TS controller-client 已使用 fetch + HTTP，继续使用 localhost 动态端口的改动最小。

未来如需增强本地 IPC 隔离，可以把 Unix Socket 作为 transport v2，而不改变 project discovery 和 Controller Protocol。

---

# 6. Pi Extension Conditional Activation

Extension 加载后建议执行以下状态机：

~~~
Pi Extension Loaded
        |
        v
findProjectRoot(cwd)
        |
        v
.agents exists?
   | No -> Disabled
   v
.runtime/controller.json exists?
   | No -> Disabled
   v
read endpoint/controller_id/project_root
        |
        v
GET /health
        |
        v
project/protocol validation
   | Fail -> Disabled
   v
Squad Extension Activated
        |
        +-> register
        +-> heartbeat
        +-> agent tools
        +-> team tools
~~~

没有合法 Controller 时：

- 不注册 Agent。
- 不启动 heartbeat。
- 不注册 Squad/Team 相关工具。
- 不上报任何状态。
- 对正常 Pi 使用保持透明。

可增加 PI_SQUAD_DEBUG=1，仅用于调试 why-disabled 信息。

这比当前“全局加载 Extension，然后缺配置时显示 warning”更符合后续日常使用预期。

---

# 7. 当前数据模型存在的结构性冲突

当前 Agent 结构：

~~~
Agent
├── agent_id
├── role
└── squad_id
~~~

SQLite agents 表同样包含 squad_id，且注册时是必填。

它表达的是：

~~~
Agent -> belongs to ONE Squad
~~~

但新需求明确要求：

- 一个 Role 可以被多个 Team 使用。
- 一个运行中的 AgentInstance 也可能成为多个 Team 的成员。
- Team A 和 Team B 可以共享 reviewer。
- Controller 必须独立展示 Agent Runtime Truth 和 Team Topology。

因此 squad_id 不应继续作为 Agent 的单值归属字段。

这是进入 Team Runtime 前必须完成的结构调整。

---

# 8. Role、Agent、Team 三层模型

## 8.1 RoleDefinition

RoleDefinition 表示：

> 这个 Agent 是什么角色。

来源：

~~~
.agents/roles/<role>/
~~~

建议字段：

- role_id
- name
- description
- role_prompt
- capabilities
- tool_policy
- metadata

Role 是模板，不代表当前一定有 Pi 在线。

## 8.2 AgentInstance

AgentInstance 表示：

> 当前实际运行并注册到 Controller 的一个 Pi Runtime。

建议字段：

- agent_id
- role_id
- runtime_type
- runtime_id
- runtime_session_id
- online_state
- activity
- project_root
- optional Herdr location

AgentInstance 不再拥有单值 squad_id。

## 8.3 TeamDefinition

TeamDefinition 表示：

> 哪些 Role / Agent 组成一个协作结构，以及 Leader 和 Team Policy 是什么。

来源：

~~~
.agents/teams/<team>/
~~~

建议字段：

- team_id
- version
- name
- leader
- members
- instructions
- policy
- default_workflow

## 8.4 TeamMembership

TeamMembership 表示多对多关系：

~~~
AgentInstance / RoleDefinition
          ^
          |
          | M:N
          v
     TeamDefinition
~~~

因此同一个 reviewer 可以同时属于：

~~~
coding-team
research-team
release-team
~~~

TeamMembership 是 topology，不是 runtime session 的复制。

---

# 9. “共享 Role”与“共享 AgentInstance”必须区分

这是后续并发与上下文设计的关键。

## 9.1 共享 RoleDefinition

推荐默认支持。

例如：

~~~
role: reviewer
   | 
   +-> coding-team
   +-> research-team
~~~

不同 Team 可以复用同一份 reviewer RoleDefinition。

## 9.2 共享 AgentInstance

初期实验可以支持，但必须明确风险。

例如：

~~~
agent_id: reviewer-01
      |
      +-> coding-team
      +-> research-team
~~~

如果正式任务继续进入目标 Pi 的既有 session，那么：

~~~
coding-team task
        |
        v
reviewer-01 Pi Session
        |
        v
research-team task
~~~

会共享历史上下文。

因此：

1. 同一个 AgentInstance 同时只能执行一项正式任务。
2. Team Context 必须按 Task / Run 动态注入，不能永久修改 Role。
3. 对需要强上下文隔离的场景，应启动两个 AgentInstance，共享 RoleDefinition：

~~~
reviewer role
   ├── reviewer-coding
   └── reviewer-research
~~~

结论：

> 默认共享 Role；是否共享 Runtime 是单独的运行策略。

---

# 10. Team Leader Runtime

## 10.1 第一阶段可支持 Team 绑定启动

为了快速验证，可以允许：

~~~
PI_SQUAD_TEAM=coding-team pi
~~~

或等价本地配置，使该 Pi 在当前实验中作为 coding-team Leader。

但这只是 Phase 1 bootstrap。

## 10.2 最终应升级为 Run Scoped Team Context

长期模型不应把一个 Pi 进程永久绑定到一个 Team。

推荐：

~~~
Agent
  |
  v
receive TeamRun
  |
  v
TeamRun.team_id = coding-team
  |
  v
inject current Team Leader Context
~~~

这样同一个 planner Agent 未来才能先后协调不同 Team。

Team Context 是当前 SquadRun 的运行上下文，不是 Agent 永久人格。

---

# 11. Leader 上下文分层

Leader 每个有效 Turn 的上下文建议拆成：

~~~
Base Pi System Prompt
        +
Role Prompt
        +
Team Leader Protocol
        +
Current Team Instructions
        +
Current Team Roster
        +
Current SquadRun State
~~~

其中：

## Static

- Role Prompt
- Leader Operating Protocol

## Dynamic

- current team_id / config_version
- roster
- member online/activity status
- current Task DAG
- completed results
- blocked tasks
- current review/rework state
- budgets / constraints
- context_revision

当前 role_prompt 可以继续使用 before_agent_start 的机制。

Team Briefing 必须每个 Leader Turn 动态生成，因为成员在线状态、Task 状态和 Run 状态持续变化。

---

# 12. Context Scope 原则

不应该让每个 Pi 自动知道全部 Team 配置。

推荐：

| Runtime | 默认上下文 |
|---|---|
| Worker | Role + 当前 TaskContract + 必要上游结果 |
| Reviewer | Role + Review TaskContract + 被审查 Artifact |
| Team Leader | Role + 当前 Team + Roster + 当前 SquadRun |
| Operator | 可用 Team 摘要；详细信息按需通过工具读取 |
| Controller | 全部 Role / Agent / Team / Run / Task 状态 |

原则：

> Controller 知道全部事实，Runtime 只得到当前职责需要的上下文。

这既减少 token，也减少 Team 之间的上下文污染。

---

# 13. Leader“不执行 Worker 工作”的实现

不能只依赖 Prompt。

建议同时使用两层约束：

## Prompt Constraint

Leader Operating Protocol 明确：

- 分析任务。
- 创建/调整计划。
- 派发任务。
- 等待结果。
- 处理 blocked/review/rework。
- 完成最终验收。
- 默认不直接实施 Worker Task。

## Tool Policy

Leader 默认允许：

- read / search
- list_agents
- get_team
- task_status
- delegate_task / agent_invoke
- squad_decide
- squad_complete

限制：

- 直接 claim 普通 Worker Task
- edit/write 类型的任务实施工具
- 未经过 Task Router 的成员调用
- 绕过 Acceptance Gate 宣告完成

也就是说：

> Leader 可以读和判断，但正式执行仍必须形成 Task。

---

# 14. Team 配置建议

示例：

~~~json
{
  "team_id": "idiom-chain",
  "version": 1,
  "leader": {
    "agent_ref": "chain-leader",
    "role_ref": "orchestrator"
  },
  "members": [
    {
      "member_id": "player-a",
      "role_ref": "idiom-player",
      "agent_ref": "player-a"
    },
    {
      "member_id": "player-b",
      "role_ref": "idiom-player",
      "agent_ref": "player-b"
    },
    {
      "member_id": "reviewer",
      "role_ref": "reviewer",
      "agent_ref": "reviewer"
    }
  ],
  "policy": {
    "leader_can_execute": false,
    "max_parallel_tasks": 2,
    "max_delegate_depth": 3,
    "max_total_tasks": 20
  }
}
~~~

role_ref 与 agent_ref 不应混为一个字段。

这为后续一个 Role 多 Runtime、动态选择在线 Agent 等能力保留空间。

---

# 15. Controller / TUI Team View

控制面建议展示三层：

~~~
Project
|
├── Agents
|   ├── planner
|   ├── reviewer
|   └── worker
|
├── Teams
|   ├── coding-team
|   |   ├── Leader planner
|   |   ├── backend
|   |   └── reviewer
|   |
|   └── research-team
|       ├── Leader researcher
|       └── reviewer
|
└── Runs
    ├── run-001 coding-team
    └── run-002 research-team
~~~

同一个 reviewer 可以在多个 Team View 中出现，但 Agent Registry 只保存一条 reviewer-01 Runtime 记录。

核心定义：

> Agent Registry = Runtime Truth  
> TeamMembership = Collaboration Topology  
> SquadRun / Task Store = Execution Truth

---

# 16. Workflow 与 Team 必须分开

Team 表示：

> 谁和谁一起工作。

Workflow 表示：

> 这些成员按照什么依赖关系工作。

例如：

~~~
.agents/teams/idiom-chain/
├── team.json
├── instructions.md
└── workflows/
    └── default.json
~~~

workflow 示例：

~~~json
{
  "steps": [
    {
      "id": "turn-1",
      "target": "player-a"
    },
    {
      "id": "turn-2",
      "target": "player-b",
      "depends_on": ["turn-1"]
    },
    {
      "id": "turn-3",
      "target": "player-c",
      "depends_on": ["turn-2"]
    }
  ]
}
~~~

Workflow 不应该发展成第二套执行协议。

统一模型：

~~~
WorkflowDefinition
       |
       v
compile / materialize
       |
       v
Task DAG
       |
       v
Existing Task Router
~~~

Task 仍然是唯一一等执行单位。

---

# 17. 成语接龙作为 Team Orchestration 验证 Case

成语接龙适合作为第一个可观察的小队编排实验，因为它天然形成线性依赖：

~~~
T1(player-a)
      |
      v
T2(player-b)
      |
      v
T3(player-c)
      |
      v
T4(player-a)
~~~

建议验证：

1. Leader 创建或加载流程。
2. T2 在 T1 完成之前不能被调度。
3. 每个成员实际在自己的既有 Pi Runtime 执行。
4. 每轮结果进入下一 Task Contract。
5. 非法成语或不满足首尾约束时进入 review/rework。
6. 完整事件链可以从 Controller 查询。

该 Case 只验证顺序、结果传递、成员复用和状态推进，不应在第一版加入复杂文件修改。

---

# 18. 多 Team 并发模型

并发需要至少三层限制：

~~~
Controller Global Capacity
        |
        v
Team Capacity
        |
        v
Agent Capacity
~~~

示例：

~~~
controller.max_active_tasks = 8

coding-team.max_parallel_tasks = 3
research-team.max_parallel_tasks = 2

reviewer-01.capacity = 1
backend-01.capacity = 1
~~~

## 18.1 Agent Capacity 是全局约束

如果：

~~~
coding-team
    └── reviewer-01

research-team
    └── reviewer-01
~~~

两个 Team 同时需要 reviewer 时：

~~~
Task A -> reviewer-01 -> RUNNING
Task B -> reviewer-01 -> QUEUED
~~~

不能按 team_id + agent_id 创建两个独立槽，否则同一个 Pi Session 会被两个正式任务并发驱动。

执行槽的资源键应是：

~~~
agent_id
~~~

而不是：

~~~
team_id + agent_id
~~~

---

# 19. 调度事务边界

Controller 是 Agent/Team 并发仲裁的权威来源。

领取任务建议使用短事务：

~~~
BEGIN

validate:
- agent online
- agent capacity
- team capacity
- dependencies completed
- task still claimable

claim execution slot
task queued -> running

COMMIT
~~~

事务提交后再进行网络通知和模型执行。

不要在 Agent 实际执行期间持有 SQLite transaction。

当前 Registry 使用单连接 SQLite 对本地验证有利，但 Team Runtime 应继续保持：

> 状态变更短事务；Agent/网络/LLM 生命周期不进入数据库长事务。

---

# 20. 对当前 04-team-orchestration 的影响

现有 04 设计中的以下部分应保留：

- SquadRun
- Task Contract
- Task DAG
- Responsibility Tree
- Leader squad_decide
- Task Router
- Acceptance Gate
- max_parallel_tasks
- max_delegate_depth
- max_total_tasks
- review / rework
- Agent execution slot
- blocked / resume / needs_review
- write_set / write lease

本次新增内容主要补充它之前缺失的四层：

1. Project Runtime Discovery
2. RoleDefinition
3. TeamDefinition / TeamMembership
4. WorkflowDefinition

因此推荐关系：

~~~
Project Runtime
      |
      v
Role / Agent Directory
      |
      v
Team Topology
      |
      v
Workflow / Leader Plan
      |
      v
Task DAG
      |
      v
Task Router
      |
      v
Agent Execution Slots
~~~

---

# 21. 推荐实施阶段

## P0.5 Project Runtime

目标：让 Squad Extension 只在当前项目 Controller 存在时激活。

实施：

- findProjectRoot
- .agents/.runtime
- controller.lock
- controller.json
- random localhost port
- health / protocol / project validation
- Extension conditional activation

验收：

- 两个项目同时启动 Controller，端口互不冲突。
- Project A Pi 不能注册到 Project B。
- 未启动 Controller 时普通 Pi 无 Squad 行为。
- Controller 停止后新启动 Pi 不启用 Squad。

## P1 Team / Role Data Model

目标：移除 Agent.squad_id 单归属。

实施：

- RoleDefinition
- AgentInstance.role_id
- TeamDefinition
- TeamMembership M:N
- config loader
- Team list/get view

验收：

- 一个 reviewer Role 可加入两个 Team。
- 一个 reviewer AgentInstance 可同时出现在两个 Team roster。
- Agent Registry 仍只有一条运行记录。

## P2 Discovery / Messaging

继续原阶段 01/02，实现 Directory 和消息协议。

不为 Team 再建立第二条通信通道。

## P3 Invocation

实现：

- Task Store
- agent_invoke
- Agent execution slot
- queue
- result / failure / acceptance

Team 的所有成员执行以后必须复用这一层。

## P4 Team Runtime

实现：

- TeamRun
- Leader
- dynamic roster briefing
- squad_decide
- dispatch/wait/complete
- review/rework
- Team Capacity

## P4.5 Workflow

实现：

- WorkflowDefinition
- workflow -> Task DAG
- serial / parallel / depends_on
- 成语接龙验证 Case

## P5 Observability / Herdr

在不改变前面协议的前提下增加：

- Team / Run / Task TUI
- Herdr location adapter
- pane mapping
- focus / observability

---

# 22. 可行性评估

| 需求 | 可行性 | 决策 |
|---|---|---|
| Project 级 Controller | 高 | 实施，使用 Project Root Scope |
| lock/state 文件发现 Controller | 高 | 使用 lock + controller.json |
| 动态端口 | 高 | 使用 127.0.0.1:0，结果写 discovery file |
| .agents/teams | 高 | 作为 TeamDefinition 声明源 |
| Leader 只做协调 | 高 | Prompt + Tool Policy 双层实现 |
| Role 属于多个 Team | 高 | 必须先去除 Agent.squad_id 单归属 |
| 同一 Agent 属于多个 Team | 有条件可行 | 允许，但全局 capacity=1 且注意 session context 污染 |
| Pi 获得全部 Team 配置 | 不推荐 | Controller 全知，Pi 只加载 Current Team / Task |
| 成语接龙流程 | 高 | 直接编译/表达为 Task DAG |
| 多 Team 并发 | 高 | Controller + Team Capacity + Global Agent Slot |
| Team 直接实现另一套 Workflow Engine | 不推荐 | Workflow 必须落到统一 Task DAG / Router |

---

# 23. 最终架构原则

后续实现统一遵守以下原则：

## 23.1 Role 是人格与能力模板

回答：

> Who am I?

## 23.2 AgentInstance 是当前 Runtime

回答：

> Which Pi process/session is currently available?

## 23.3 Team 是协作拓扑

回答：

> Who works with whom?

## 23.4 Workflow 是协作结构

回答：

> In what order / dependency should work happen?

## 23.5 Task 是唯一执行单位

回答：

> What concrete work is being executed?

## 23.6 Controller 是状态和并发真相

负责：

- Agent Directory
- Team Topology
- Task State
- SquadRun State
- Scheduling
- Capacity
- Acceptance

## 23.7 Pi Extension 是 Runtime Adapter

负责：

- discovery
- register/heartbeat
- role/team/task context injection
- controller tools
- Pi lifecycle adaptation

不负责：

- 全局 DAG
- Team 全局状态
- 跨 Agent 并发仲裁
- 独立的第二套 Task Store

---

# 24. 推荐当前立即执行的两项改动

在 Messaging / Invocation / Team Orchestration 大规模编码之前，优先完成：

1. P0.5 Project Scoped Controller。
2. Agent / Role / Team 多对多数据模型重构。

原因：

- Project Scope 决定 Controller discovery 和多个项目并存方式。
- M:N TeamMembership 决定后续 Team、Leader、Roster、并发模型。
- 当前 Agent.squad_id 越晚移除，后续 Messaging、Invocation、Task Store 中需要迁移的字段越多。
- 完成这两个地基后，现有 04-team-orchestration 中的 SquadRun、Task DAG、Task Router 可以直接继续实现，不需要再推翻。

---

# 25. 目标架构总图

~~~
                 .agents
          /         |          \
       roles       teams      workflows
          \         |          /
           \        |         /
             Go Controller
          /       |        \
   Directory   Scheduler   Task Store
       |          |           |
       |      SquadRun/DAG     |
       |          |           |
       +----------+-----------+
                  |
          Pi Squad Extension
                  |
        +---------+---------+
        |         |         |
      Leader    Worker   Reviewer
~~~

最终模型可以概括为：

> Role 是能力/人格模板；Team 是协作拓扑；Workflow 是协作规则；Task 是唯一执行单位；Controller 是状态和并发真相；Pi Extension 是 Runtime Adapter。

这应作为 pi_squad_dev 后续 Team Runtime 实施的主架构方向。
