---
title: Herdr + Pi Extension 多智能体协作验证方案｜需求、技术方案、验收标准与 Cases
type: source
status: active
created: 2026-09-24
updated: 2026-09-24
source_url: https://app.notion.com/p/kms9/Herdr-Pi-Extension-Cases-3e4df99ce2a3817d99f5f5c68cba60f9
tags:
  - project-wiki
  - source
  - pi-squad
---

# Herdr + Pi Extension 多智能体协作验证方案｜需求、技术方案、验收标准与 Cases

同步自 Notion 公开页，抓取日期 2026-09-24。原文块 450 个，未改写条款。

> 🎯 **当前决策**：第一阶段继续采用 **Herdr + Pi Extension（Pi 扩展）**。Herdr 负责 Space（空间）、Pane（窗格）与 Pi Runtime（Pi 运行时）生命周期；Pi 扩展使用 TypeScript，只负责把协作能力暴露给 Pi；外部 Controller（控制器）及状态服务使用 Go。**暂不引入 ACP（智能体客户端协议）和通用 Agent Session（智能体会话）抽象**，等本地协作协议验证成立后再上移。

## 1. 文档目的

这不是完整产品 PRD，而是一份**阶段化验证规范**。目标是让其他模型严格按照统一的需求、技术方案、验收标准与 Case（验证用例）逐阶段实现和验证。

当前要证明：

1. 多个长期运行的 Pi Runtime 能否拥有稳定、可寻址的 Agent Identity（智能体身份）。
2. 一个 Pi Agent 能否发现另一个在线 Agent。
3. Agent A 能否向 Agent B 发送消息并获得响应。
4. Agent A 能否把 Task（任务）委派给 Agent B，并复用 B 当前已有 Pi 会话。
5. Agent 离线、执行中断后，任务状态能否保留，并由用户显式恢复。
6. Agent B 能否继续委派 Agent C，形成受控递归委派。
7. 委派是否可以从自然语言消息升级成有边界、有证据、有验收的 Task Contract（任务契约）。

> **验证边界**：当前不证明“多智能体一定优于单智能体”，也不验证自动任务分解、自动选 Agent、自动组队。当前只验证多智能体协作基础协议是否可行、稳定、可追踪。

## 2. 固定技术路线

| 组件 | 技术栈 | 职责 |
| --- | --- | --- |
| Herdr | 现有运行环境 | 管理 Session / Space / Pane，持有 Pi 进程生命周期 |
| Pi Extension（Pi 扩展） | TypeScript | Agent 与 Go Controller 之间的薄适配层，暴露发现、消息、委派、任务查询工具 |
| Go Controller（Go 控制器） | Go | 智能体注册、在线状态、消息路由、任务存储、小队与角色、故障与恢复状态 |
| 持久化 | SQLite | 保存 Agent / Message / Task 等最小状态 |

### 2.1 Herdr 职责

- 管理 Herdr Session / Space / Pane（会话 / 空间 / 窗格）。
- 持有并运行 Pi 进程。
- 用户负责启动、关闭和重新启动离线 Agent。
- 当前阶段不让 Go Controller 自动创建或恢复 Pi Runtime。

### 2.2 Pi Extension 职责

只负责：

- 启动时向 Go Controller 注册当前 Agent。
- 定期上报 Heartbeat（心跳）。
- 向 Pi 暴露 Agent Discovery（智能体发现）、Message（消息）、Delegation（委派）、Task Query（任务查询）等工具。
- 将来自控制器的消息 / 任务注入当前已经存在的 Pi 会话。

禁止：

- 在扩展内部实现完整 Task Store（任务存储）。
- 在扩展内部实现复杂任务状态机。
- 在扩展内部自己维护小队事实。
- 自动创建新的 Pi Runtime。

Pi Extension 最终定位：

> **Pi Runtime ↔ Go Control Plane（Go 控制面）的薄适配层。**

### 2.3 Go Controller 职责

第一阶段作为单进程本地服务即可，负责：

- Agent Registry（智能体注册表）
- Agent Online Status（在线状态）
- Role / Squad（角色 / 小队）
- Message Router（消息路由）
- Task Store（任务存储）
- Task / Handoff Trace（任务 / 交接追踪）
- Failure / Resume State（失败 / 恢复状态）

当前不引入 Redis、PostgreSQL、NATS、Kafka 等额外基础设施。

## 3. 固定实验约束

- 环境：macOS 优先，单机、同一用户。
- Runtime：第一轮只使用 Pi。
- Agent 只使用当前在线实例；离线时返回明确错误，不自动启动。
- 正式任务默认进入目标 Agent 的**已有会话**。
- 如需清理目标 Agent 上下文，由用户在目标 Pi 中手动执行 /new。
- 同一实验小队中的 Agent，在预设权限范围内可以自动响应消息和执行委派任务，不要求逐次人工确认。
- 当前恢复要求只做到：**记录可恢复、故障可识别、用户显式续跑**。
- 代码实验基于 pi-learn 的 pi_squad_dev 分支。
- 实验目录统一放在 pi_squad_case 下，每个阶段独立目录。
- 每个阶段必须独立保留需求、实现、测试、验收和证据，不能只提交代码。

## 4. 当前明确不做

- ACP（智能体客户端协议）
- 通用 Agent Session（智能体会话）抽象
- Codex / Claude Code 等第二 Runtime
- 自动任务分解
- 自动 Agent 选择
- 自动组 Squad（小队）
- 自动启动离线 Agent
- 自动故障迁移
- 跨机器 / 远程节点
- 动态权限系统
- 自动经验学习
- 完整 Web 控制台

P0～P7 验证通过后，再评估上层 Agent Session + ACP Adapter（ACP 适配器）架构。

## 5. 其他模型执行协议

> ⚠️ **强制规则**：一次只执行一个阶段。上一阶段未达到 PASS，不得提前实现下一阶段能力。允许修复当前阶段问题，但不得以“顺便”方式提前建设后续平台能力。

每个阶段开始前必须：

1. 阅读本总文档与当前阶段要求。
2. 检查上一阶段验收结论；P0 无前置阶段。
3. 检查当前分支必须为 pi_squad_dev。
4. 当前阶段实现只能位于对应的 pi_squad_case/phase_xx_* 或明确共享的基础模块中。
5. 不修改与本阶段无关的已有验证 Case。

每个阶段结束必须输出：

- 阶段名称
- 结论：PASS / FAIL / BLOCKED
- 实现内容
- 关键代码变更与文件路径
- 实际执行命令
- 每一个 Case 的 PASS / FAIL 结果
- Controller 日志、Pi 日志、数据库记录等证据
- 发现的问题
- 明确列出未实现能力
- 是否允许进入下一阶段：YES / NO

判定规则：

- **PASS**：所有 Mandatory Case（强制用例）均通过，验收标准全部满足。
- **FAIL**：实现已完成，但至少一个强制 Case 不通过。
- **BLOCKED**：因为外部依赖、Pi / Herdr 机制缺失等原因无法继续。
- 只有 PASS 才允许进入下一阶段。

---

## 6. P0｜身份、注册与在线状态

### 6.1 验证目标

证明：

> **Agent Identity（智能体身份）可以脱离某一个 Pi 进程生命周期存在，并且 Go Controller 能稳定知道某个 Agent 当前是否在线。**

### 6.2 需求

Pi 启动并加载扩展后自动注册以下信息：

- agent_id
- role
- squad_id
- runtime_type = pi
- herdr_session_id
- space_id
- pane_id
- runtime_session_id（当前拿不到时允许为空）
- status
- last_seen

必须支持：

- 注册
- 重复注册 / 更新
- Heartbeat（心跳）
- 超时标记 offline
- 同一 agent_id 重新启动后恢复同一逻辑身份

### 6.3 技术方案

TypeScript：

- registration.ts
- heartbeat.ts
- controller-client.ts

Go：

- agent/model.go
- agent/registry.go
- agent/service.go
- 注册 / 心跳 / 查询接口

建议最小 Agent 字段：

- ID
- Role
- SquadID
- HerdrSessionID
- SpaceID
- PaneID
- RuntimeType
- RuntimeSessionID
- Status
- LastSeen

### 6.4 验收标准

- 同时启动 3 个 Pi，可看到 3 个不同 Agent。
- agent_id 唯一且稳定。
- 停止某一个 Pi 后，在预设心跳窗口后变为 offline。
- 重新启动同一角色 Pi 后，仍使用原 agent_id，状态恢复 online。
- Controller 重启后，Agent 身份记录仍可恢复；在线状态通过新心跳重新校准。

### 6.5 Mandatory Cases

**CASE-P0-01｜三个 Agent 注册**

启动 backend、reviewer、tester。

期望：Controller 查询返回三者均 online，Space / Pane 映射正确。

**CASE-P0-02｜离线识别**

关闭 reviewer Pi。

期望：超过心跳阈值后 reviewer 变为 offline；其他 Agent 不受影响。

**CASE-P0-03｜同身份重新上线**

重新启动 reviewer。

期望：仍是 agent_id=reviewer，不创建 reviewer-2。

**CASE-P0-04｜Controller 重启**

保留 SQLite，重启 Controller。

期望：逻辑 Agent 记录仍存在；Pi 重新心跳后在线状态恢复。

### 6.6 必须提交证据

- Controller Agent List 输出
- offline → online 状态变化日志
- SQLite 中 Agent 记录
- 三个 Herdr Space 与 Agent ID 对应关系

### 6.7 Exit Gate（退出门）

全部 P0 Mandatory Cases 通过，才允许进入 P1。

---

## 7. P1｜Agent Discovery（智能体发现）

### 7.1 验证目标

证明：

> Pi A 不需要直接扫描 Herdr，而可以通过 Controller 的 Agent Registry 找到其他在线 Agent。

### 7.2 需求

Pi Extension 增加：

- list_agents
- get_agent

支持按 agent_id、role、squad_id、status 查询。

### 7.3 技术方案

调用链：

Pi A → Pi Extension → Go Controller → Agent Registry → 返回 Agent 列表。

Herdr 只作为部署事实来源，不允许 Pi A 自己解析 Pane 列表猜测 Agent 身份。

### 7.4 验收标准

- Pi A 能列出同一 Squad 的其他在线 Agent。
- 能正确看到 Agent Role（角色）和在线状态。
- offline Agent 可以被查询到，但必须明确标记 offline。
- 不允许把 Herdr Pane 名称直接等同于 Agent ID，映射必须由 Registry 提供。

### 7.5 Mandatory Cases

**CASE-P1-01｜列出在线 Agent**

Pi A 调用 list_agents。

期望：返回 reviewer、tester 等在线 Agent。

**CASE-P1-02｜按角色发现**

查询 role=reviewer。

期望：返回 reviewer Agent。

**CASE-P1-03｜发现离线 Agent**

关闭 reviewer 后再次查询。

期望：仍可查询逻辑 Agent，但 status=offline。

### 7.6 Exit Gate

P1 全部通过后进入 P2。

---

## 8. P2｜Direct Message（直接消息）

### 8.1 验证目标

证明：

> Agent A 可以通过统一控制层把一条消息可靠地发送给 Agent B，并获得 B 的回复。

### 8.2 需求

Pi Extension：

- send_message
- list_messages 或 poll_messages
- reply_message

Go Controller：

- Message Store（消息存储）
- sender / receiver
- message_id
- correlation_id（关联标识）
- delivery_status（投递状态）

第一版允许目标扩展轮询 Controller，不要求事件总线。

### 8.3 验收标准

- 消息有唯一 message_id。
- A → B 消息至少一次可达，重复拉取不能产生重复业务处理。
- B 回复能关联回原消息。
- B offline 时 Controller 不丢消息，并明确返回无法即时执行。
- 消息不能因为 Pi UI 切换或 Herdr Pane 切换而丢失。

### 8.4 Mandatory Cases

**CASE-P2-01｜A 给 B 发消息并收到回复**

内容：请返回你当前角色和一句状态说明。

期望：A 收到 reviewer 的明确回复。

**CASE-P2-02｜目标 Agent 离线**

关闭 reviewer 后发送消息。

期望：Controller 保存消息，但返回 reviewer offline；不自动启动 reviewer。

**CASE-P2-03｜重复轮询**

B 多次 poll 同一个队列。

期望：已经确认处理的消息不重复注入 Pi。

### 8.5 Exit Gate

P2 全部通过后进入 P3。

---

## 9. P3｜Task Delegation（任务委派）

### 9.1 验证目标

证明：

> Agent A 可以把一个有独立生命周期的 Task 委派给 Agent B，B 完成后结果回到 Task，而不是只停留在“聊天消息”。

### 9.2 最小 Task 模型

字段：

- ID
- ParentID
- FromAgent
- ToAgent
- Goal
- Status
- Result
- CreatedAt
- UpdatedAt

第一版状态只允许：

- created（已创建）
- assigned（已分派）
- running（执行中）
- completed（已完成）
- failed（失败）

### 9.3 Pi Extension 工具

- delegate_task
- get_task
- list_tasks
- complete_task
- fail_task

### 9.4 验收标准

- 每个 Task 有唯一 task_id。
- A 能看到 Task 从 created → assigned → running → completed。
- B 的结果必须写回 Task。
- A 可以仅凭 task_id 查询结果。
- 目标 Agent offline 时 Task 不进入 running。
- 第一版不需要自动重试。

### 9.5 Mandatory Cases

**CASE-P3-01｜正常任务委派**

A 委派 reviewer：读取指定测试文件，返回测试职责摘要，不修改文件。

期望：Task 完成，结果可由 A 查询。

**CASE-P3-02｜目标离线时委派**

reviewer offline。

期望：返回明确离线错误；Task 不进入 running。

**CASE-P3-03｜任务失败**

B 主动调用 fail_task。

期望：A 查询得到 failed + 原因。

### 9.6 Exit Gate

P3 全部通过后进入 P4。

---

## 10. P4｜已有 Pi 会话复用

### 10.1 验证目标

证明：

> 委派目标不是“启动一个新的 Pi”，而是进入目标 Agent 当前已经存在的 Pi Runtime 与已有会话。

### 10.2 关键身份边界

即使当前不实现通用 Agent Session，也必须区分：

- agent_id = 逻辑智能体身份
- runtime_session_id = 当前 Pi 会话身份
- Herdr Space / Pane = 当前运行位置
- process = 当前 Pi 进程

这些不能混为一个 ID。

### 10.3 验收标准

- 连续委派两个任务给 reviewer，不创建第二个 reviewer Runtime。
- 第二个任务能利用第一个任务已经写入 reviewer 当前会话的上下文。
- 用户在 reviewer 中手动 /new 后，agent_id=reviewer 不变。
- /new 后如能获得 Pi 会话标识，runtime_session_id 应变化；如当前无法可靠获取，必须记录能力缺口，不能伪造。
- Go Controller 不负责自动执行 /new。

### 10.4 Mandatory Cases

**CASE-P4-01｜连续任务复用上下文**

任务 1：让 reviewer 记住实验字符串 context-marker-42。  

任务 2：不再次提供字符串，询问之前的 marker。

期望：B 能回答 context-marker-42，证明复用当前会话。

**CASE-P4-02｜手动 /new 后逻辑身份不变**

手工在 reviewer 执行 /new。

期望：Controller 中 agent_id 仍为 reviewer；后续任务进入新会话。

**CASE-P4-03｜无重复 Runtime**

连续 5 次委派。

期望：Herdr 中 reviewer 仍然只有既有目标 Pi Runtime，没有因委派新增进程。

### 10.5 Exit Gate

P4 全部通过后进入 P5。

---

## 11. P5｜离线、失败与显式恢复

### 11.1 验证目标

证明：

> Runtime 故障不会让 Agent / Task 事实消失；系统能够识别中断，并在用户手工恢复 Runtime 后显式继续。

### 11.2 需求

状态模型增加：

- interrupted（已中断）

第一版不做自动恢复和自动迁移。

### 11.3 验收标准

- 执行中的 Agent 掉线能够被识别。
- running Task 不能永久卡在 running。
- Task 的原目标、委派方、执行方、历史状态仍存在。
- Agent 重新启动后使用相同 agent_id。
- 只有显式 resume_task 才继续执行。
- 不允许 Controller 在后台自动启动 Pi。

### 11.4 Mandatory Cases

**CASE-P5-01｜执行中杀掉 reviewer**

Task 进入 running 后关闭 reviewer。

期望：reviewer offline；Task interrupted。

**CASE-P5-02｜重新启动但不自动续跑**

重新启动 reviewer。

期望：Agent online，但 Task 仍 interrupted。

**CASE-P5-03｜显式恢复**

调用 resume_task。

期望：原 Task 继续并最终 completed 或 failed，不创建新的逻辑 Task。

### 11.5 Exit Gate

P5 全部通过后进入 P6。

---

## 12. P6｜递归委派

### 12.1 验证目标

证明：

> 被委派的 Agent B 也可以使用同一套 Pi Extension 能力继续委派 Agent C，形成可追踪的 Parent / Child Task（父子任务）。

### 12.2 需求

- 支持 parent_id
- 支持最大递归深度 max_depth
- 第一版建议 max_depth = 3
- Child Task 的结果由其直接 Parent Agent 消费
- 不允许无限递归

### 12.3 示例

Task T1：backend 负责实现  

→ Task T2：backend 委派 reviewer 做评审  

→ Task T3：reviewer 委派 tester 做验证

### 12.4 验收标准

- T2.parent_id = [T1.id](http://T1.id)
- T3.parent_id = [T2.id](http://T2.id)
- 每一级 caller / assignee 可追踪
- T3 结果先返回 T2 的执行 Agent，而不是直接越级替代 T1
- 超过 max_depth 必须拒绝创建 Child Task

### 12.5 Mandatory Cases

**CASE-P6-01｜A → B → C**

backend 委派 reviewer；reviewer 再委派 tester。

期望：形成三层可查询任务关系。

**CASE-P6-02｜结果逐层返回**

tester 完成后 reviewer 消费结果，再完成自己的 Task；backend 最终获得 reviewer 结果。

**CASE-P6-03｜深度上限**

构造超过 max_depth 的委派。

期望：Controller 明确拒绝，不创建新 Task。

### 12.6 Exit Gate

P6 全部通过后进入 P7。

---

## 13. P7｜Task Contract（任务契约）、证据与验收

### 13.1 验证目标

证明：

> 多 Agent 协作可以从“自由聊天 / 简单委派”升级为有范围、有约束、有交付物、有证据、有验收标准的 Work Handoff（工作交接）。

### 13.2 Task Contract 最小结构

需要包含：

- goal（目标）
- scope / allowed_files（范围 / 允许文件）
- constraints（约束）
- required_output（必需输出）
- evidence（证据）
- acceptance_criteria（验收标准）

### 13.3 需求

Task 在 P3 模型上增加：

- contract / scope（任务契约 / 范围）
- artifact（交付物）
- evidence（证据）
- acceptance criteria（验收标准）
- acceptance result（验收结果）

第一版由 Parent Agent 或测试脚本做验收，不做自动 Judge（裁判智能体）。

### 13.4 验收标准

- Worker 只能看到与当前 Contract 相关的目标和边界。
- completed 不再只表示“Agent 自报做完”，必须存在结果与最低证据。
- Parent 可以接受或拒绝 Child 结果。
- 被拒绝时保留原结果与证据，并允许后续显式修订 / 重试。
- 责任关系和 Task Parent 关系可追踪。

### 13.5 Mandatory Cases

**CASE-P7-01｜满足契约**

reviewer 按指定范围检查文件，输出 findings + evidence。

期望：验收 PASS，Task accepted。

**CASE-P7-02｜缺失证据**

Worker 只返回“没问题”，没有 evidence。

期望：Task execution 可以完成，但 Acceptance（验收）必须 FAIL / REJECTED。

**CASE-P7-03｜越界结果**

Contract 只允许指定目录，但结果声称修改了范围外文件。

期望：验收拒绝，并记录越界证据。

### 13.6 Exit Gate

P7 Mandatory Cases 全部通过，第一轮 **Herdr + Pi Extension 多智能体基础协议验证完成**。

---

## 14. 三个实验里程碑

| 里程碑 | 覆盖阶段 | 需要证明的结论 |
| --- | --- | --- |
| M1｜智能体网络 | P0～P2 | 多个长期运行 Pi 可以形成稳定、可寻址、可通信的本地 Agent Network（智能体网络）。 |
| M2｜任务委派网络 | P3～P6 | Agent 可以复用既有会话进行任务委派、故障恢复和受控递归委派。 |
| M3｜受治理交接 | P7 | 协作不只是消息，而可以形成 Task Contract + Evidence + Acceptance（任务契约 + 证据 + 验收）。 |

## 15. 推荐代码目录

pi_squad_case 下建立：

- phase_00_identity
- phase_01_discovery
- phase_02_messaging
- phase_03_delegation
- phase_04_session_reuse
- phase_05_recovery
- phase_06_recursive_delegation
- phase_07_contract_acceptance

共享模块建议：

- pi_squad/extension：TypeScript
- pi_squad/controller：Go

只有当两个及以上阶段明确复用同一逻辑时，才允许从 phase_xx 抽取到共享模块。不要提前抽象。

## 16. 每阶段文档要求

每个 phase_xx 目录至少包含：

- [README.md](http://README.md)
- [REQUIREMENTS.md](http://REQUIREMENTS.md)
- [DESIGN.md](http://DESIGN.md)
- [ACCEPTANCE.md](http://ACCEPTANCE.md)
- [CASES.md](http://CASES.md)
- [RESULT.md](http://RESULT.md)

职责：

- [REQUIREMENTS.md](http://REQUIREMENTS.md)：本阶段要解决什么，不解决什么。
- [DESIGN.md](http://DESIGN.md)：技术方案、数据结构、接口、调用链。
- [ACCEPTANCE.md](http://ACCEPTANCE.md)：可客观判断的验收标准。
- [CASES.md](http://CASES.md)：准备执行的 Case、输入、步骤、期望。
- [RESULT.md](http://RESULT.md)：真实执行结果、证据、失败原因和 PASS / FAIL / BLOCKED。

**代码不能替代 RESULT。**

## 17. 第一轮完成后的架构决策点

只有 P0～P7 基础协议完成后，再开始下一轮架构验证：

当前 Herdr + Pi + 薄 Pi 扩展 + Go 控制器  

→ 抽象 Agent Session（智能体会话）  

→ 增加 Runtime Adapter（运行时适配器）  

→ 验证 ACP（智能体客户端协议）  

→ 再接入 Pi / Codex / Claude 等不同运行时。

下一轮重新回答：

1. Agent Session 是否应该成为 Controller 的一等对象？
2. Herdr 继续持有 Runtime 生命周期时，ACP Adapter 应如何 attach / resume，而不是重复 spawn？
3. Pi Extension 是否可以进一步退化为纯 Control Plane Client（控制面客户端）？
4. Task / Dispatch / Worker 等更完整控制面模型是否需要吸收 Orca 的设计？
5. 多 Runtime 接入后，现有 Agent Registry 与 Task Contract 是否保持不变？

> 📌 **当前阶段的成功标准不是“做出一个多智能体平台”，而是用最小技术栈证明：身份、发现、通信、委派、会话复用、故障恢复、递归委派和契约化交接这些机制是否真实可行。**
