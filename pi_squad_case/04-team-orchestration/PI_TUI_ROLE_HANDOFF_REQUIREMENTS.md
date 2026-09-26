---
title: Pi Squad TUI 指令扩展与 @Role 任务交接需求
type: process
status: draft
created: 2026-09-26
updated: 2026-09-26
implementation_status: not_implemented
acceptance_status: not_run
decision_status: proposed
baseline_pi_commit: 890f920884f6d21fc7617d236ef9e1cc5d7a0ef8
tags: [pi-squad, team-runtime, tui, extension, role-routing, handoff]
---

# Pi Squad TUI 指令扩展与 @Role 任务交接需求

> 本文是阶段 04 Team Runtime 的配套交互需求。  
> 调度事实、资源唯一性、Role Primary、RoleActionOwnership、ExecutionLease、waiting_role 等规则仍以 `TEAM_RUNTIME_REQUIREMENTS.md` 与 `TEAM_RUNTIME_DESIGN.md` 为准。  
> 若本文与上述两个权威文档冲突，以其为准。

## 1. 目标

Pi Squad 需要在 Pi TUI 中提供接近 Multica `@mention` 的成员调用体验，使用户或当前 Agent 可以明确选择 Team 中的目标 Role，并把一段工作从当前上下文交接给目标 Pi Runtime。

目标体验：

```text
@reviewer 检查当前实现的并发控制，并给出审查结论
```

用户输入 `@` 后，TUI 自动展示当前 Team roster 中可引用的 Role，例如：

```text
@reviewer     primary=reviewer-01   available
@backend      primary=backend-01    working_here
@researcher   primary=researcher-01 busy_other_team
```

选择 `@reviewer` 后，用户继续输入任务并提交。Pi Squad Extension 将该输入识别为一次明确的 Team handoff，而不是把整段文本继续交给当前 Pi 让模型再次判断“是否需要调用 reviewer”。

本阶段同时提供显式命令：

```text
/pisquad-use
```

该命令通过 TUI Picker 选择 Role，不要求用户再次手工输入 role_id。V1 中它作为 `@role` 的辅助入口，最终复用同一套路由和任务提交逻辑。

## 2. 当前约束与设计结论

阶段 04 当前 V1 已确认：

```text
Multi-Team
  + Single Leader per Team
  + Single Primary per Role
  + Single Action Team per Role
  + Single Attempt per Agent
```

因此本文中的 `@role` 不是“从所有同 Role 在线 Agent 中任选一个”的快捷语法。

Team scope 下必须使用：

```text
role_id
  -> RolePrimaryBinding
  -> primary_agent_id
  -> RoleActionOwnership
  -> ExecutionLease / TaskAttempt
```

必须满足：

1. Secondary Agent 不能因为被用户输入、命令或模型显式点名而绕过 Team Scheduler。
2. `@role` 不做 Role 多实例负载均衡。
3. Primary offline 时不自动选择 Secondary。
4. Role 被其它 Team/SquadRun 占用时必须遵循 `ROLE_BUSY -> waiting_role`。
5. 一个 Primary Agent 同时最多一个正式 Active Attempt。
6. 所有正式执行最终进入统一 Task DAG / Task Router，不能建立第二套“mention execution engine”。

## 3. Pi 当前能力基线

pi-learn 当前 `pi-dev` submodule 固定到：

```text
earendil-works/pi
890f920884f6d21fc7617d236ef9e1cc5d7a0ef8
```

当前 Pi Extension API 已提供实现本需求所需的关键能力。

### 3.1 TUI 自动补全

Pi Extension 可以在 `session_start` 中通过：

```ts
ctx.ui.addAutocompleteProvider(...)
```

叠加自定义 autocomplete，而不需要重写整个 TUI。

Pi 源码中的：

```text
packages/coding-agent/examples/extensions/github-issue-autocomplete.ts
```

已经验证了这种模式：Extension 可以识别特定前缀、生成动态候选，并在没有命中时回退给当前 autocomplete provider。

因此 Pi Squad 可以用相同机制实现 `@role` 候选。

### 3.2 输入拦截与转换

Pi Extension 可以监听：

```ts
pi.on("input", ...)
```

输入处理结果支持：

```text
continue
transform
handled
```

所以当用户明确提交：

```text
@reviewer <task>
```

Extension 可以直接处理这次 handoff，并返回 `handled`，避免当前 Agent 再进行一次 LLM 路由判断。

### 3.3 Slash Command

Pi Extension 支持：

```ts
pi.registerCommand(...)
```

以及 `ctx.ui.select(...)`、`ctx.ui.setEditorText(...)`。

因此 `/pisquad-use` 可以直接打开 Role Picker，选择后把 `@role ` 写入当前编辑器，不需要“先执行命令、再手工输入 role1”。

### 3.4 Model-callable Tool

Pi Extension 支持：

```ts
pi.registerTool(...)
```

因此 Agent -> Agent 的自动调用仍应使用结构化 Tool / Team Runtime 协议，而不是解析 Assistant 最终生成文本中的 `@role`。

### 3.5 Skill

Pi Skill 是 progressive disclosure 的能力/指令包：

1. 启动时只把 Skill name / description 暴露给模型。
2. 需要时再读取完整 `SKILL.md`。
3. 用户可以用 `/skill:<name>` 强制加载。

Skill 适合描述“如何完成某类工作”，不适合作为 Agent Directory、Role 路由、Runtime IPC 或调度锁。

结论：

> Skill 不是 Pi Squad 的调用协议。调用者不需要先加载某个 Skill，再附加 role_id 才能调用目标 Agent。

目标 Agent 收到 TaskContract 后，可以按照自己的 Role、AGENTS.md 与 Skill 机制决定加载哪些 Skill。

## 4. 三层调用模型

Pi Squad 必须把“选中谁”“表达交接”“真正执行”拆开。

```text
TUI / User
  |
  | @reviewer task
  v
Pi Squad Extension
  |
  | parse + resolve
  v
Team Runtime / Controller
  |
  | RolePrimaryBinding
  | RoleActionOwnership
  | Task / Attempt
  v
Target Pi Runtime
```

三层职责：

| 层 | 责任 |
|---|---|
| TUI UX | 输入 `@role`、autocomplete、`/pisquad-use` Picker |
| Extension Routing Adapter | 识别显式 handoff、解析当前 Team/Run、提交结构化请求 |
| Controller / Team Runtime | 最终调度裁决、Task materialize、ownership/lease/capacity/fencing |

UI 语法不能成为底层协议。

## 5. `@role` V1 语义

### 5.1 基本格式

V1 推荐固定使用“行首 handoff”：

```text
@<role_id> <task>
```

例如：

```text
@reviewer review 当前 messaging.ts 的并发状态
```

采用行首语义的原因：

1. 减少与 Pi 原生 `@file` 引用冲突。
2. 清晰表达“整条输入是交接”，而不是普通消息里偶然出现 Role 名。
3. 第一版避免一个输入同时触发多个目标产生 fan-out 语义。

后续可以扩展正文内 mention 或多 mention，但不属于 V1。

### 5.2 Role 而不是任意 Agent

Team 普通成员当前以 `role_ref` 配置，因此 V1 的主语法是：

```text
@reviewer
@backend
@researcher
```

而不是：

```text
@reviewer-01
@reviewer-02
```

提交时 Controller 重新解析：

```text
role_ref
  -> RolePrimaryBinding
  -> primary_agent_id
```

这样可以保证：

- 不暴露 Secondary 为可调度 capacity。
- Primary 重启后稳定 role 路由仍然成立。
- 不把 TUI 与某个临时 runtime_id/session_id 绑定。

V1 不提供通过 `@agent_id` 绕过 Role Primary 的 Team 调度入口。

### 5.3 Team / Run Context

阶段 04 中，`@role` 的正式执行语义是 Team-scoped handoff。

调用必须能解析到有效的：

```text
team_id
squad_run_id
source agent / task context
target role_id
```

如果当前 Pi 没有有效 Team/Run 上下文，则不得偷偷创建一个不受当前 P4 规则管理的“隐式 Team Run”。

建议返回明确错误，例如：

```text
NO_ACTIVE_TEAM_CONTEXT
```

Standalone Agent 的跨 Agent 调用若后续需要，应由阶段 03 Invocation 或单独 Direct Run 语义定义，不能在本文里隐式混入。

## 6. TUI Autocomplete

### 6.1 数据来源

Autocomplete 不应调用 `list_agents` 后自行猜哪个 Agent 可执行。

应该读取当前 Team roster 的 Role projection，例如：

```text
team_id
role_id
primary_agent_id
role_state
action_team_id
action_run_id
team_schedulable
```

候选来自当前 TeamDefinition 的 role_ref 集合。

Secondary 不作为独立候选显示。

### 6.2 候选展示

推荐：

```text
@reviewer
  reviewer-01 · available

@backend
  backend-01 · working_here

@researcher
  researcher-01 · busy_other_team · research-team/srun-02
```

至少显示：

- role_id
- primary_agent_id
- role state

可以显示 busy/offline/quarantined，但 UI 展示不能取代 Controller 最终原子校验。

### 6.3 与 Pi 原生 `@file` 的兼容

Pi 已使用 `@...` 进行文件路径补全。

Pi Squad autocomplete 必须是 wrapper，而不是完全替换原 provider。

规则：

1. 输入位置满足 Pi Squad handoff token 规则。
2. 当前 Team roster 中存在匹配 role_id 时，返回 Role 候选。
3. 没有 Role 候选时调用原 provider，让 Pi 原生 `@file` 正常工作。

概念逻辑：

```ts
if (isSquadMentionPosition(input)) {
  const roles = matchCurrentTeamRoles(prefix)
  if (roles.length > 0) return roleSuggestions(roles)
}

return current.getSuggestions(...)
```

禁止因为加载 Pi Squad Extension 导致普通 `@README.md`、`@src/foo.ts` 文件引用失效。

## 7. 输入提交处理

用户提交：

```text
@reviewer 检查当前实现
```

Extension 使用 `pi.on("input")` 处理。

推荐流程：

```text
InputEvent
  |
  +-> 不是 interactive / 不符合 handoff 语法
  |      -> continue
  |
  +-> 解析 role_id + task
         |
         +-> role 不在当前 roster
         |      -> handled + UI error
         |
         +-> 没有 active Team/Run context
         |      -> handled + UI error
         |
         +-> submit structured handoff
                |
                +-> accepted / queued / waiting_role
                |      -> handled + status
                |
                +-> rejected
                       -> handled + error
```

显式 handoff 一旦被 Pi Squad 识别，就不能在提交失败后把原文本 fallback 给当前 LLM，否则会把“本来要交给 reviewer 的任务”误变成当前 Agent 自己执行。

## 8. `/pisquad-use` 命令

### 8.1 V1 定位

`/pisquad-use` 是 `@role` 的显式 Picker / 可发现性入口，不是唯一调用方式。

执行：

```text
/pisquad-use
```

TUI 显示：

```text
Select Pi Squad role

> reviewer    reviewer-01    available
  backend     backend-01     working_here
  researcher researcher-01  busy_other_team
```

用户选中 reviewer 后：

```text
editor = "@reviewer "
```

之后由用户继续填写任务，提交时仍走同一个 `@role` handler。

### 8.2 不要求再次手工输入 Role

禁止设计为：

```text
/pisquad-use
Role: [用户再输入 reviewer]
```

因为 Pi Extension 已能通过 `ctx.ui.select` 完成确定目标选择。

### 8.3 V1 不实现 Persistent Target Mode

V1 不建议把：

```text
/pisquad-use reviewer
```

定义为“后续所有普通输入都自动路由给 reviewer”。

原因：

- 容易忘记当前 target。
- 会改变普通 Pi 输入语义。
- 与 Team Run/Role ownership 生命周期容易产生隐式状态。
- /new、Run 结束、Role ownership 变化都需要复杂恢复。

V1 只做一次性选择并填充 `@role`。Persistent target mode 后续单独设计。

## 9. Human -> Agent 与 Agent -> Agent 必须分开

### 9.1 Human -> Agent

TUI 用户输入：

```text
@reviewer ...
```

由 Extension input handler 直接处理。

这是用户侧 UX。

### 9.2 Agent -> Agent

不能要求 Leader / Worker 模型输出普通文本：

```text
@reviewer ...
```

然后期待 TUI input handler 再触发。

Assistant 输出不是用户 input routing 协议。

Agent -> Agent 必须使用结构化的 Team Runtime Tool / decision：

- Leader：继续使用阶段 04 定义的 `squad_decide` / structured dispatch。
- 普通 Member：使用阶段 04 定义的 async peer invoke。
- review/rework：继续 materialize 为对应 Task。

此前讨论中暂称的 `delegate_task` 可以作为概念名或未来 Tool 名，但不得成为与 `squad_decide`、Task DAG、Task Router 并列的第二套执行引擎。

统一要求：

```text
@role UX
squad_decide
peer invoke
review/rework
      |
      v
same Task materialization / Task Router
      |
      v
RolePrimaryBinding
RoleActionOwnership
ExecutionLease
```

## 10. 不能复用当前 `send_message(kind=ask)` 完成正式 Handoff

当前 `pi_squad/extension/messaging.ts` 中：

```text
send_message
reply_message
get_message
read_inbox
```

属于阶段 02 Messaging。

当前 inbound `ask` 触发模型时，会限制当前 turn 只允许：

```text
get_message
reply_message
```

其它工具调用会被 block。

因此：

```text
@backend 实现这个 API
```

绝不能简单映射成：

```text
send_message(kind="ask")
```

否则目标 backend Pi 无法正常使用 read/edit/write/bash 等实施工具。

必须区分：

```text
Messaging
  - notice
  - ask
  - reply

Formal Invocation / Task
  - execute
  - review
  - rework
  - peer invoke
```

`@role` 的“任务交接”语义属于后者。

## 11. Role Gate 必须覆盖 `@role`

`@role` 是新的入口，不是新的权限。

提交 handoff 时 Controller 必须执行与其它 Team formal invocation 相同的校验。

至少包括：

1. role_id 属于当前 Team roster。
2. RolePrimaryBinding 存在。
3. Primary team_schedulable=true。
4. Primary 当前 runtime/session 可用。
5. RoleActionOwnership：
   - free -> 当前 Run lazy acquire；
   - working_here -> 允许继续；
   - busy_other_team -> ROLE_BUSY / waiting_role；
   - quarantined -> ROLE_QUARANTINED。
6. Agent 无其它 Active Attempt，或当前请求进入队列。
7. Task / Run revision 仍有效。
8. Team/Project capacity 满足。
9. write_set 等资源约束满足。

### 11.1 ROLE_BUSY

如果用户在 Team B 输入：

```text
@reviewer review xxx
```

而 reviewer 当前由 Team A / Run A 持有：

```text
ROLE_BUSY
  role_id=reviewer
  action_team_id=team-a
  action_run_id=run-a
```

必须遵循当前 P4 规则：

- Team B Run 进入或保持 waiting_role。
- 不调用 Secondary。
- 不新建 reviewer Attempt。
- 不让用户侧命令绕过 Controller CAS。

### 11.2 Primary Offline

如果 Primary offline、Secondary online：

```text
@reviewer ...
```

不得路由给 Secondary。

返回：

```text
ROLE_PRIMARY_OFFLINE
```

直到用户显式完成 promote/release 和旧执行对账。

## 12. Worker 发起 peer handoff

如果当前 Worker 在一个正式 TaskAttempt 中需要另一个 Role：

```text
backend task
   |
   +-> peer invoke reviewer
```

必须复用阶段 04 已确认的父子续接模型：

1. 创建 child Task / dependency。
2. 父 Task 进入 yield / waiting_dependency。
3. 当前模型轮结束，不长期阻塞 backend Agent execution slot。
4. reviewer child Task 按 RolePrimaryBinding + RoleActionOwnership 执行。
5. child result 到达后恢复正确 parent continuation。
6. 拒绝 self/ancestor invocation 和 Task dependency cycle。

TUI `@role` 若从一个正在执行正式 Task 的 Worker 发起，其底层语义也不能绕开上述 parent/child dependency。

## 13. Skill 与 Role 的边界

禁止以下调用链作为核心机制：

```text
@reviewer
  -> load pi-squad skill
  -> skill 查 Agent
  -> skill 教模型调用 Agent
```

也禁止把正式调用要求定义成：

```text
/skill:pi-squad reviewer ...
```

正确关系：

```text
Caller
  |
  | @reviewer / structured invoke
  v
Controller resolves reviewer Primary
  |
  v
Target Reviewer Pi
  |
  +-> Role prompt
  +-> project/role AGENTS.md
  +-> TaskContract
  +-> target Pi 自己按需加载 Skills
```

Skill 可以作为 Role 能力描述的一部分，未来用于帮助 Leader 判断“哪个 Role 更适合”，但 Skill 不决定 Runtime 身份，不持有 Role ownership，不执行 IPC。

## 14. TUI 与底层协议解耦

Autocomplete 是 TUI 体验，不是 Pi Squad Protocol。

必须允许未来其它入口直接提交结构化 handoff：

```text
TUI @role
Web mention chip
RPC
ACP
Herdr
Controller API
```

它们最终使用同一结构，例如概念上：

```json
{
  "team_id": "coding-team",
  "squad_run_id": "srun-001",
  "target_role_id": "reviewer",
  "instruction": "检查当前实现的并发控制",
  "source": "human_tui"
}
```

TUI autocomplete 是否存在，不能影响 Controller 的调度正确性。

对于 RPC/Web，优先使用结构化 target，不要求模拟 TUI autocomplete。

## 15. 推荐 Extension 模块拆分

不要求一次完成，但建议避免把所有逻辑继续堆进 `index.ts`。

推荐：

```text
pi_squad/extension/
├── index.ts
├── team-roster.ts
├── mention-autocomplete.ts
├── handoff-input.ts
├── squad-commands.ts
├── invocation.ts
└── messaging.ts
```

职责：

### mention-autocomplete.ts

- 安装 `ctx.ui.addAutocompleteProvider`
- 识别 handoff token
- 查询/缓存当前 Team Role projection
- fallback 原 Pi provider

### handoff-input.ts

- `pi.on("input")`
- parse leading `@role`
- validate Team/Run context
- submit structured handoff
- handled / UI result

### squad-commands.ts

- 注册 `/pisquad-use`
- Role Picker
- 把 `@role ` 写回 editor

### invocation.ts

- Controller formal invocation client
- 不与 messaging ask 混用
- 处理 ROLE_BUSY / offline / quarantined / capacity 等结构化结果

## 16. Controller API 需求

当前 `list_agents` 面向 Agent Directory，不能直接作为 Team role routing 的唯一 API，因为它会列出 Primary、Secondary、离线记录等全部 Agent。

阶段 04 应提供 Role/Team projection，例如概念接口：

```text
GET /teams/{team_id}/roles
GET /teams/{team_id}/roles/{role_id}
POST /runs/{run_id}/handoffs
```

具体 URL 可在实现阶段调整，但语义必须满足：

### Role projection

返回：

```text
role_id
responsibility
primary_agent_id
primary online/activity
role_state
action_team_id
action_run_id
team_schedulable
```

### Handoff submit

输入：

```text
team_id
run_id
source identity/task context
target_role_id
instruction
idempotency/request id
```

Controller 负责 materialize Task、获取/校验 Role ownership，并返回：

```text
accepted
queued
waiting_role
rejected
```

Extension 不自行修改 ownership。

## 17. 状态与反馈

提交 `@role` 后，TUI 至少显示结构化结果，不允许只显示“已发送”。

例如：

```text
Pi Squad: delegated to reviewer
role=reviewer
primary=reviewer-01
task=task-123
state=queued
```

或：

```text
Pi Squad: reviewer is busy in another team
role=reviewer
team=research-team
run=srun-22
current run -> waiting_role
```

或：

```text
Pi Squad: reviewer primary is offline
primary=reviewer-01
secondary instances are not auto-promoted
```

因为“mention 已解析”不等于“目标模型已完成”。

## 18. V1 错误语义

除阶段 04 已定义错误码外，本交互层可以补充：

| code | 含义 |
|---|---|
| NO_ACTIVE_TEAM_CONTEXT | 当前 Pi 没有可用于 Team handoff 的有效 Team/Run |
| ROLE_NOT_IN_TEAM | `@role` 不属于当前 Team roster |
| EMPTY_HANDOFF_TASK | 只输入了 `@role`，没有实际任务 |
| MULTI_TARGET_NOT_SUPPORTED | V1 一条输入出现多个可执行 Role mention |
| INVALID_HANDOFF_SYNTAX | handoff 语法无法确定解析 |

调度层继续使用：

- ROLE_NOT_PRIMARY
- ROLE_NOT_SCHEDULABLE
- ROLE_PRIMARY_OFFLINE
- ROLE_BUSY
- ROLE_QUARANTINED
- AGENT_BUSY
- CAPACITY_UNAVAILABLE
- WRITE_CONFLICT

UI 层不得把这些错误吞掉后 fallback 到本地 LLM。

## 19. V1 非目标

本阶段不实现：

1. 一个输入同时 `@reviewer @backend` 自动 fan-out 多 Task。
2. 在 Team scope 直接 `@agent_id` 绕过 role_ref / Primary。
3. Role capacity > 1 后的自动 Agent picker。
4. Primary offline 自动选择 Secondary。
5. `/pisquad-use` persistent target mode。
6. 解析 Assistant 普通文本中的 `@role` 自动执行。
7. 用 Skill 作为 Agent Invocation 协议。
8. 用现有 `send_message(kind=ask)` 执行正式 Worker Task。
9. TUI autocomplete 作为 RPC/ACP/Web 的底层协议。
10. 自动 spawn 不在线的 Role Pi。

## 20. 验收用例

### CMD-A01 Role autocomplete

前提：

- coding-team roster 有 backend/reviewer。
- 当前 Pi 处于 coding-team 有效上下文。

输入：

```text
@
```

通过标准：

- 出现 backend/reviewer Role 候选。
- 显示各自 Primary 和 Role state。
- Secondary 不作为额外可执行候选。

### CMD-A02 Pi 原生 @file 不回归

当前 Team 不存在 role `README.md`。

输入：

```text
@README.md
```

通过标准：

- Pi Squad provider fallback。
- Pi 原生文件补全继续工作。

### CMD-A03 /pisquad-use Picker

执行：

```text
/pisquad-use
```

选择 reviewer。

通过标准：

- 不要求再次手输 reviewer。
- editor 自动得到 `@reviewer `。
- 最终提交与直接输入 `@reviewer ...` 走同一 handler。

### CMD-A04 显式 handoff 不进入当前 LLM

输入：

```text
@reviewer 检查当前实现
```

通过标准：

- Pi input event 被 Pi Squad 标记 handled。
- 当前 Agent 不把这条内容当普通用户请求执行。
- Controller 创建/排队对应正式 Task，或返回明确 waiting/rejection。

### CMD-A05 只解析 Primary

存在：

```text
reviewer-01 primary online
reviewer-02 secondary online
```

输入 `@reviewer ...`。

通过标准：

- target 解析为 reviewer-01。
- reviewer-02 不因为更空闲而被选择。

### CMD-A06 Primary offline

reviewer-01 offline，reviewer-02 secondary online。

通过标准：

- 返回 ROLE_PRIMARY_OFFLINE。
- 不自动把任务送给 reviewer-02。

### CMD-A07 Role busy

Team A 已持有 reviewer，Team B 输入：

```text
@reviewer ...
```

通过标准：

- Controller 返回 ROLE_BUSY。
- Team B Run 进入/保持 waiting_role。
- 不创建 reviewer Attempt。
- 不触发 Secondary。

### CMD-A08 working_here

当前 Run 已持有 reviewer。

再次 `@reviewer ...`。

通过标准：

- 不重新竞争其它 Team。
- 复用当前 Run 的 RoleActionOwnership。
- 新 Task 仍受 Agent single Attempt / capacity 限制。

### CMD-A09 不使用 Messaging ask 执行 Worker Task

输入：

```text
@backend 修改 foo.go
```

通过标准：

- 不生成 `send_message(kind=ask)` 作为正式执行。
- backend 正式 Task 允许按 TaskContract 使用被授权的实施工具。

### CMD-A10 Agent -> Agent 使用结构化路径

Leader 模型决定调用 reviewer。

通过标准：

- 使用 `squad_decide` / structured dispatch，不依赖 Assistant 文本 mention。
- 最终与 TUI handoff 汇入同一 Task Router / Role Gate。

### CMD-A11 Worker peer invoke

backend Task 需要 reviewer 子任务。

通过标准：

- 创建 child dependency。
- parent yield / waiting_dependency。
- 不长期阻塞 backend execution slot。
- child 完成后恢复正确 continuation。

### CMD-A12 Skill 非路由前置条件

调用 reviewer。

通过标准：

- Caller 不需要加载 `/skill:pi-squad`。
- Controller 不读取 Skill 来决定 Primary identity。
- Reviewer Runtime 可在实际任务中自行按需加载 review Skill。

### CMD-A13 无 Team context

Standalone Pi 输入：

```text
@reviewer ...
```

通过标准：

- 返回 NO_ACTIVE_TEAM_CONTEXT。
- 不隐式创建未定义的 SquadRun。
- 不 fallback 给当前 LLM。

### CMD-A14 多目标

输入：

```text
@reviewer @backend 同时处理
```

通过标准：

- V1 返回 MULTI_TARGET_NOT_SUPPORTED。
- 不发生部分派发。

### CMD-A15 提交时重新裁决

Autocomplete 时 reviewer 显示 available，但提交前被其它 Team 获取。

通过标准：

- Controller 最终 CAS 返回 ROLE_BUSY。
- Extension 不因为旧 autocomplete snapshot 直接执行。

### CMD-A16 证据链

任意成功 handoff 至少可以关联：

```text
source input / command
team_id
run_id
target role_id
resolved primary_agent_id
task_id
attempt_id（开始执行后）
ownership revision
controller event
```

模型自述“已交接”不能替代 Controller/Task 证据。

## 21. 推荐实施顺序

1. **Team role projection API**：先让 Extension 能读取当前 Team 的 role/Primary/state。
2. **Autocomplete**：实现 `@role` 候选并保证 `@file` fallback。
3. **/pisquad-use**：使用同一个 role projection 构建 Picker。
4. **Input parser**：实现 leading `@role <task>`，先只解析与校验。
5. **Formal handoff API**：接入阶段 04 Task materialization / Task Router。
6. **Role Gate**：验证 Primary/Ownership/waiting_role/ExecutionLease 全部生效。
7. **Agent structured invoke**：Leader squad_decide、Worker peer invoke 与 human handoff 汇流。
8. **Acceptance tests**：执行 CMD-A01—A16，再进入更复杂的多 Team UX。

## 22. 最终原则

本需求最终遵循四条原则。

### 22.1 `@role` 是 UX，不是协议

用户看见：

```text
@reviewer
```

系统真正处理：

```text
team/run + role_id + TaskContract
```

### 22.2 Role 是调度入口，Primary Agent 是运行实例

```text
@reviewer
  -> reviewer Role
  -> RolePrimaryBinding
  -> reviewer-01
```

不能直接选择 Secondary 绕过 Scheduler。

### 22.3 Skill 是目标 Agent 的能力，不是路由器

Caller 指定 Role/Task；Target Runtime 自己加载完成任务所需 Skill。

### 22.4 所有调用汇入同一个 Task Runtime

```text
Human @role
/pisquad-use
Leader squad_decide
Worker peer invoke
review/rework
      |
      v
Task DAG / Task Router
      |
      v
RolePrimaryBinding
RoleActionOwnership
ExecutionLease
      |
      v
Target Pi Runtime
```

Pi Squad 不为 TUI mention 单独创建第二套执行模型。
