---
title: Pi Squad → DS Bot：迁移实施与技术方案
type: process
status: draft
created: 2026-10-18
updated: 2026-10-18
tags: [dsh-bot, migration, implementation, multi-agent]
---

# Pi Squad → DS Bot：迁移实施方案

> **状态：设计与规划，非实现/验收报告。** 实施基线 `pi_squad_dev@f1bb9f47baf92fb99626d8d20504c2787a0e3ac6`，DS Bot 子模块固定 `e13bc3419d2695a509520d850a07e63f05c34e07`。

## 0. 产品目标与方案决策

原 Pi Squad 对外演示依赖多个 Pi TUI/进程，造成使用门槛。新产品首先使真实非技术用户直接使用 DS Bot 长期 Bot、群聊、多模型、记忆与人机接力，再以同一产品中的受控执行演示和验证明确 Task Contract、依赖 DAG、独立 Review/Acceptance、版本化返工及恢复治理的价值。

**架构：DS Bot Web（交互） + DSH Agent（运行） + Go Squad Controller（唯一正式任务权威） + DSH Adapter（精确执行桥接）。**

不重写完整 UI，不整体弃用 Go Scheduler，不迁移 Pi 正在运行的 Attempt 和 Session，不把普通 `message_bot` 的交接树当成正式 Task DAG。不在首个版本同时支持 Pi/Codex/Claude Code 多 Runtime；不同 Bot 用不同模型由 DSH Provider 复用。

## 1. 用户流程与 Free / Managed

**Free（已有）**：原生 Bot/群聊/`@Bot`/`message_bot`/长期记忆/模型；正常日常沟通与协作。

**Managed（待实现）**：用户在群聊选择工作目标、Team/Role、Workflow 和交付条件 → 固定 Run/模型/策略快照 → Go Controller 受理与派发 Task → DSH Adapter 在指定 Bot 的 Group Session 实际运行 → 候选结果及不可变 Artifact → 独立 Review → 拒绝时 Rework/Re-review → Final Acceptance Gate → 界面交付及证据。

Group 可以设默认模式，但 Run 开始后固定策略和参与角色，不在执行中无审计切换。首版一个受控 Group 对应一个 Team；一个 Role 映射一个 Bot；同 Team 一个 active Run。M4 再开放 Primary/Secondary、跨 Team 共享 Role 与递归正式委派。

用户普通消息需要分类为通知、Run Guidance、Task Amendment、Clarification，不可不经控制面直接更新受控任务。

## 2. 事实来源和运行数据

| 所属层 | 数据及控制权 |
|---|---|
| DS Bot / DSH | 长期 Bot、私聊与群组各自的 Session、普通 Handoff、Memory、模型选择、原生 Inbox/Tool/Event |
| Go Controller | Team/Run/Task/Attempt/segment、Role Ownership、DAG、Admission、Lease、Artifact、Review、Acceptance、Recovery、Event/Outbox |
| DSH Adapter | 可信 `bot_id / role_id / group_id / runtime_id / session_id / task_id / attempt_id / segment_id / binding_epoch / fence` 映射及实际生命周期证据 |
| 浏览器 | 只读权威投影与受权用户操作，不另造业务状态机 |

Main Bot、群管理员与正式 Run Leader 不自动共享管理权限。正式运行需冻结模型 Provider/Model/Effort 与可用工具和上下文 hash，防止模型因不可用而静默回退。DS Bot 的 Memory 日常可持续使用；受控 A/B 对照冻结初始个人/团队 Memory 及 `recall` 读取视图，避免跨组污染。

## 3. Pi Squad 18 项能力迁移矩阵

| ID | 能力 | 优先级 | 迁移方式 |
|---|---|---|---|
| TR-01 | Project/身份/激活 | M1 | 保留 Project 语义；DSH Host/Session 的真实 Binding |
| TR-02 | Leader/LeaderStep | M2 | 结构化决策、已授权的 Run Leader 与最终 Gate |
| TR-03 | Primary/Secondary | M4 | 首版唯一 Role→Bot；M4 显式换人/Primary |
| TR-04 | Run/Role 原子占用与 FIFO | M2/M4 | 单 Team Run 先行；M4 跨 Team 原子准入 |
| TR-05 | 阻塞/等待/WaitGraph | M2/M4 | 先 DAG Blocker 与事件唤醒，后完整资源等待图 |
| TR-06 | Capacity/Lease/WriteSet | M1/M4 | 正式输入/工具 Gate 与容量；后续完整文件互斥 |
| TR-07 | 正式调用 vs 普通消息 | **M1** | notice、受管 ask、execute 不混淆，`exchangeId` 不代替 Task ID |
| TR-08 | Role/Team/Task 上下文 | **M1** | DSH Agent-scoped Prompt 与当前 Task 快照 |
| TR-09 | Team/Workflow 配置 | **M2** | 复用 `role.md`、`agents.md`、`team.json`、`instructions.md`、Workflow JSON；新增 Bot 映射 |
| TR-10 | Dashboard/投影 | M2/M3 | Go projection → DS Bot Web Run/DAG/Review |
| TR-11 | DAG/Review/Rework/Acceptance | **M2** | 独立审查精确版本，Final Acceptance Gate |
| TR-12 | Mention/Picker | M1/M3 | Free 原生；Managed 将 `@Bot` 转为正式任务意图 |
| TR-13 | Pi TUI 命令 | 不迁移 | 用 DS Bot 按钮/卡片/专属 Tool 取代 |
| TR-14 | Child/yield/continuation | M4 | 先拒绝必要 Child 未完成时的父终结 |
| TR-15 | 故障/恢复 | M1/M4 | 未知执行隔离/显式核实；完整 rebind/retry 后续 |
| TR-16 | CAS/事务/幂等/SSE | **M1** | 保留 Go Store、Outbox、Snapshot；新宿主协议独立 |
| TR-17 | 权限/工具边界 | **M1** | 模型与 Operator 分权、真实 Tool Guard |
| TR-18 | Doctor/证据 | M0/M1 | DSH 专属版本、Capability/Runtime Probe；旧 Pi PASS 不继承 |

**必须服从后续已确认决策：** 2026-10-04 已决定取消业务 Task 固定 120 秒硬截止，且不是改成可配置的业务硬截止；必要 child 的明确回传与安全收尾是完成前提。旧代码仍有待调整的超时逻辑。通信失联、执行 Lease、工具超时和故障核实为单独问题。[依据](../docs/decisions/2026-10-04-squad-explicit-completion-and-context.md)。

## 4. 代码复用与重写边界

| 代码 | 处理建议 |
|---|---|
| `pi_squad/controller/task/{model,store}.go` | 保留任务、执行尝试、状态版本、事务与事件；补 DSH Host Binding |
| `controller/scheduler/{service,runs,tasks,dispatch,waitgraph}.go` | 保留调度/准入/依赖/容量语义，解耦 Pi 身份假设 |
| `controller/scheduler/{acceptance,reviews,references,invalidation}.go` | 保留版本化结果/独立审核/拒绝返工/最终 Gate |
| `controller/scheduler/{recovery,operations,continuation}.go` | 保留未知执行不重放与安全恢复，适配 DSH 证据 |
| `controller/project/{config,doctor}.go` | Role/Team/Workflow 校验保留，换 DSH Profile 能力探针 |
| `controller/httpapi/`、`projection/` | 保留安全认证/幂等/Revision/投影；新增 DS Bot 管理入口 |
| Pi `extension/{invocation,execution-gate,context-assembly}.ts` | 仅移植行为语义；新的 DSH Hook/Tool/Session Adapter |
| Pi `extension/{squad-commands,dashboard}.ts` | 不搬 TUI；复用 DS Bot Web 用户入口 |

建议未来独立创建 `dsh_squad/adapter/`、`dsh_squad/protocol/`、`dsh_squad/client/`、`dsh_squad/fixtures/`。新宿主中立协议可设计为 `squad/3`，但**不是已经存在或已验收的接口**；新旧运行状态/数据表须受控迁移，不能混跑。

## 5. 受控派发和执行安全门（最关键）

DS Bot 的 `groups.js` 会合成 `group_relay` 工具调用，对成员 Group Session 发送消息；`message_bot`、`post_to_group`、定时及 `resume.js` 也可能进入模型。仅添加 `squad_start` 或系统提示词**不足以阻止双重调度或越过权限**。

必须实现可信 Host 的 Free/Managed 分流：Managed 中所有正式工作都经过 Controller admission → DSH Adapter 的 Input Gate/Tool Gate，并绑定精确 Group Session、Bot/Role、Attempt、Epoch、Fence。消息仅用于状态展示时不能再唤醒模型；未经批准的普通 `@Bot` 调用不得绕过任务准入。

**正式执行证据链：**

`Task durable → dispatch intent / lease → 精确 Session + 模型 + 工具校验 → Inbox accepted → 真正 step/tool observed → result_proposed → quiescent settled（工具及 pending 已收尾） → Review / Acceptance → safe cleanup`。

- Inbox 接收 ≠ 已开始执行；模型自然语言“完成” ≠ 真实 Task End。
- `result_proposed`、`settled`、`accepted`、`released` 必须分离。
- `turn/end` 或 `whenIdle` 单项不可代替业务验收；外部副作用停止与取消消息也不同。
- 不确定是否执行的 `outcome_unknown` 不自动重投，旧 Session/Epoch 的迟到结果不能污染新绑定。
- 拟研究 DSH `agent/pre-step`、Agent-scoped context、`ctx.tools.guard`、Tools Event、Session Log；必须在固定版本真实 probe，不由 master 文档推出“已实现”。
- 首版拒绝无法受控的 shell、未约束 MCP 写入和其他不可证明副作用操作。

**原生切段/恢复冲突：** DS Bot `parts.js` 自动压缩、`resume.js` 重启续跑不能绕过 Controller 的恢复 Gate。Free 保持原生；Managed 活动 Attempt 若进入不确定切段/重启，先隔离和对账，首版不承诺无缝跨 Session part 续跑。

## 6. Review、Artifact 和用户交互

- 产物记录不可变 `artifact_id / goal_revision / result_revision / content_hash`；独立 Reviewer 审核精确版本，换 Session/Model 不算不同稳定 Bot。
- Review 等待候选的 `execution_completed`，普通下游按 `acceptance_accepted`；拒绝新增 Rework/Re-review 节点，保留旧版本和拒绝原因。
- UI 分开问题回答、工具授权和成果验收三类按钮；操作绑定准确对象/expected_revision，过期结果拒绝。
- 生成 HTML/JS 课件必须隔离预览，不能读取 DS Bot Cookie、操作员凭据或控制文件。
- 用户可看任务目标、负责人、依赖、等待、产物、审核意见、返工、实际成本与可重复对照结论。

## 7. 分阶段实施任务及退出门

### M0：完整 DS Bot 产品基线

- 选定真正兼容的 DSH/DS Bot 发布版本，固化 SHA/lockfile。
- 创建 Chief、Researcher、Builder、Reviewer 四长期 Bot，至少两个不同 Provider/模型、一个群聊和 Memory。
- 验证普通 Handoff、`@Bot`、Web 访问与会话持久化，用户无需进入终端。
- 默认每位试用者独立 Host/数据域；不能将 DS Bot 单实例假定为完成了多租户授权。
- **退出门**：真实非开发用户完成自由协作任务及可用性反馈，不宣称 Squad 能力迁移完成。

### M1：DSH Adapter（M2 硬前置）

- 定义 Bot / Role / Group Session / Task / Attempt 精确 Binding。
- Go Controller 受理一个真实正式 Task，并由 DSH Adapter 注入、保护工具、报告真实执行和状态。
- 覆盖所有受控入口：`@Bot`、`message_bot`、`post_to_group`、定时、HTTP 直投、原生恢复。
- 真实验证嵌套 `run_code`、模型配置冻结、取消、重启、旧 Session、迟到事件和 `outcome_unknown`。
- **退出门**：正式 Task 正例和权限/重复/故障负例全部有来源清晰的运行证据。不能证明真实结束则停止推广受控模式。

### M2：单 Team 真实交付

- 导入 Team/Workflow/Role，创建并冻结 Run。
- DAG 按依赖和容量执行，Worker 提交不可变 Artifact。
- 独立 Reviewer 审核当前版本，拒绝产生 Rework/re-review，Final Gate 检查所有必要状态和安全收尾。
- 业务案例：数学知识点研究→交互课件实现→程序格式/功能检查→教学审核→返工复审→交付。
- **退出门**：真实成果正向、拒绝返工、旧审核失效、未完成依赖阻断都得到证据。

### M3：用户界面及客观实验

- 在 DS Bot 增加启动 Run、Task/DAG 进展、Artifact 预览、Review/Recovery 卡、实验对照报告。
- 前端只消费 Controller 权威 Snapshot/Events；SSE gap 重新取快照。
- 比较单 Agent、DS Bot Free、Squad DAG、DAG+Review，在同任务/模型/工具/初始 Memory 下独立运行。
- 指标涵盖完整成功率、错误完成、缺陷检出/误报、重工、端到端时间、等待、全部模型费用、人工介入、恢复成功。
- **退出门**：非技术用户可从 Web 完成审核/返工；数据可复核，不以成功截图虚构因果收益。

### M4：高级协同治理

- Primary/Secondary、跨 Team Role 原子占用、FIFO、WaitGraph 资源环、Child/yield/same Attempt continuation。
- 显式 cancel/reconcile/retry/rebind/resume、Host 与 Controller 崩溃、晚到结果审计。
- **退出门**：共享 reviewer 的交叉 Team 与独立 Team 并行、capacity=1、故障窗口专项验收通过。

## 8. 风险与审查

1. DSH 固定运行版本是否具有足够的 input/tool/settle/cancel 原生 Hook 证据，M1 必须真实检验。
2. DS Bot 群聊和恢复若缺适配 seam，先增加**最小可审核 Fork**，不通过 CSS/DOM 劫持执行层。
3. Browser/Host/Go Controller 之间的身份令牌与 operator 需严格隔离；不把本地同 OS 用户控制假设冒充公网安全。
4. Provider 默认回退与 Memory 变化会污染对照，Managed Run 需明确冻结快照并拒绝静默改动。
5. UI 状态与底层业务结果分离，未通过 Acceptance 不得显示成功。
6. Pi 的 89 项 PASS、DS Bot 演示成功不能替代 DSH 新适配器的运行验收。

## 9. 固定源码参考

- [Pi Squad Stage04 需求](../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md)、[实施映射](../pi_squad_case/04-team-orchestration/IMPLEMENTATION.md)
- `pi_squad/controller/{task,scheduler,project,httpapi,projection}`、`pi_squad/extension/{invocation,execution-gate,context-assembly}.ts`
- `dsh-bot/ds-bot/index.js`、`src/host/{groups,roster,tools,delivery,turns,handoffs,prompt,models,memory,parts,resume,channel}.js`、`src/client/index.js`
- [DSH Agent](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md)、[DSH Tools](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/README.md)、[DSH Agent Teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/agent-team/README.md)、[DSH 多模型](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.zh.md)
- [迁移验收规范](ACCEPTANCE.md)。

引用的上游 master 文档是 API 线索，不能替代固定兼容版本真实探针。
