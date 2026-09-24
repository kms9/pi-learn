---
title: Pi Squad Team Runtime 需求文档
type: process
status: draft
created: 2026-09-25
updated: 2026-09-25
implementation_status: not_implemented
acceptance_status: not_run
tags: [pi-squad, team-runtime, requirements]
---

# Pi Squad Team Runtime 需求文档

本文将 [原方案](TEAM_RUNTIME_PLAN.md) 与 2026-09-25 用户的五项补充合并为下一阶段需求。技术契约见 [技术文档](TEAM_RUNTIME_DESIGN.md)。本文的新目录、参数、接口均待实现；当前可用行为仍以 [USAGE](../../pi_squad/USAGE.md) 为准。

## 1. 评估结论

原方案的 Project Scope、Role/Agent/Team 分层、统一 Task Router、Leader 动态简报和 Acceptance Gate 可以保留，不能直接按原文实施：

| 问题 | 评估与修订 |
|---|---|
| 原第 2、3、6、8、16、21、25 节使用 `.agents/roles`、`.agents/teams`、`.agents/.runtime` | 全部归入 `.agents/pisquad/`；仅 `.agents` 存在不能证明是 Squad 项目。 |
| 原基线称 Messaging 未落地、支持 `PI_SQUAD_CONFIG` | 已过时。当前已有 HTTP/SSE 通信，旧 JSON 配置被拒绝；复用现有通信，不重建它。实际验收结论仍看各阶段报告。 |
| `role.json + prompt.md` 示例 | 与现有 Markdown frontmatter 决策冲突，继续使用 `roles/<id>/role.md`。 |
| “一个 Role / Agent 同时属于多个 Team” | 拆成模板复用、成员关系、当前执行上下文三个概念；成员关系不意味着同时执行。 |
| 原第 10 节将 Leader 启动绑定视为临时方案 | 按本次需求，首版明确以启动身份区分 Leader / Role；进程内动态换 Team 或换身份不在本版。 |
| 只写 Agent capacity=1 和短事务 | 必须补原子获取、续约、实例绑定、旧结果拒绝、失租隔离与显式恢复。 |
| 原第 24 节建议在 Messaging 前改模型 | Messaging 已存在且按 squad_id 授权；迁移必须包含通信授权和旧数据兼容，不能只删数据库字段。 |

结论：有条件可行。先补命名空间、启动契约与成员/授权模型，再实现任务租约和 Team 编排。目录隔离能避免本项目的配置与状态文件撞名，但不能保证外部 Claude Code 不改相同业务文件。

## 2. 术语与边界

| 术语 | 定义 |
|---|---|
| RoleDefinition | 可复用的职责模板，来源 `role.md`；不是运行中的 Pi。 |
| Role working instructions | 同角色目录的 `agents.md`，可较频繁更新的工作约定；不是队列、锁或任务历史。 |
| AgentInstance | 已注册的 Pi 运行实例，用 agent_id、runtime_id、runtime_session_id 精确定位。 |
| TeamDefinition | 独立的 Leader、成员引用、成员职责、团队说明和策略配置。 |
| TeamMembership | Agent 与 Team 的多对多拓扑；不占执行槽，不自动授权任意操作。 |
| SquadRun | 一次 Team 请求及其 DAG、快照、结果；本文不另造 TeamRun 实体。 |
| Task / Attempt | 正式执行单位及一次执行尝试；执行、质量审查、返工、Leader 决策轮均受统一调度约束。 |
| ExecutionLease | Controller 授予某一 attempt 的执行租约；不是 controller.lock，也不是 Agent 身份占用。 |

继续沿用：用户手动启动 Pi，Controller 不 spawn/restart；仅向当前在线绑定投递；不自动重放状态不明的副作用任务；保留 DAG、责任树、最多 2 次返工和文件写租约。只读 Dashboard 不负责调度。

## 3. 需求

### TR-01 专属命名空间与项目发现

- 声明配置放 `.agents/pisquad/roles/<role_id>/` 和 `.agents/pisquad/teams/<team_id>/`。用户第 1 条的单数 role/team 按第 4 条明确路径统一为复数，不同时支持两套拼写。
- Squad 自有 Controller 锁、服务发现、数据库、运行快照、session 关联、日志及租约状态均位于 `.agents/pisquad/.runtime/`。
- Squad 管理的 Pi 启动约定将原生 session 存储指向该运行目录；普通未启用 Squad 的 Pi 不迁移。不能靠 Extension 加载后复制 JSONL 冒充修改 session 存储。
- 从 cwd 向上查找最近的 `.agents/pisquad`，真实路径的父项目作为 project_root；不因 `.agents/roles` 或 Claude 配置存在而激活。
- 配置可进 Git，`.runtime/` 不进 Git；不读写 Claude Code 的 Team/session 配置，不自动搬迁或删除未知文件。
- 每项目最多一个 Controller，多个项目动态分配 loopback 端口，连接时校验项目、Controller 实例和协议。

### TR-02 启动即确定身份和配置入口

- `mode=role`：必须给 role_id，加载对应 `role.md` 与 `agents.md`；不要求 team_id，不加载全部 Team 配置。
- `mode=leader`：必须给 team_id，加载对应 `team.json` 与 `instructions.md`；普通 role_id 不可同时传入，不根据提示词含有 leader 自动提升身份。
- Leader 的共同工作协议由 Extension/Controller 管理，团队具体协调规则写在 Team instructions 中。首版不依赖另一个普通 Role 文件才能启动 Leader。
- 支持环境变量及对应启动参数，显式参数优先；组合错误、未知 ID、配置错误明确拒绝 Squad 激活，不悄悄切换为另一角色。
- 一个 Leader 进程绑定一个 Team，可以串行处理该 Team 的多个 Run。普通 Role 实例可以加入多个 Team。
- 没选 Squad 身份时完全不激活；已显式选择身份却没有合法 Controller 时清楚显示不可用，不注册、不执行 Squad 任务。

### TR-03 多 Team 与“我当前属于哪个 Team”

**普通 Role 执行 Team 任务时必须知道当前 team_id，但不必知道全部 Team 配置。**

- 同一个 reviewer Role 可以用于多个 Pi 实例；同一个 reviewer Agent 可以被两个 Team 引用，Registry 仍只有一个实例记录。
- 空闲普通 Role 没有唯一 current_team_id；可查询 membership 列表。不能选列表第一个 Team 作为默认执行上下文。
- 每次正式 Team Task 带 team_id、squad_run_id、task_id、attempt_id、职责和必要约束，Controller 验证其成员资格及授权。
- 同一个实例同一时间最多执行一个模型工作单元；Team A 完成并释放后，才执行 Team B。结果按 task/attempt 归属，不按“最近联系的 Team”归属。
- 独立 Agent 任务允许 team_id 为空，由显式 direct 授权控制。
- 共享现有 Pi session 会保留历史，清除当前注入块不等于擦除历史。需要上下文隔离时用户启动两个不同 agent_id 的 Pi，共用 RoleDefinition，各自存储 session。

### TR-04 执行或质量审查前获取任务租约

将用户“执行任务/质量之前”按“执行与质量审查均需获取”解释；此解释及工程参数见开放问题。

- 必须由 Controller 在实际执行前原子授予租约；模型不能靠承诺“已拿锁”执行。
- 同时检查 Task 可领取性、依赖、授权、实例在线/空闲、Agent 槽、Team 配额、项目总配额和 write_set。
- 配额不足留在队列并显示具体原因，不持有半套资源等待其它资源。
- 审查不享有绕过并发的特权；Leader 的规划/决策轮也占 Agent 和项目/Team 执行配额。Leader 等待成员时释放执行槽。
- 区分“同时执行的工作单元数量”与“同时活跃的 Team 数量”，分别配置；纯等待不占执行容量。
- 正常完成/失败释放资源；取消申请、断线、失租不代表 Pi 已停。旧执行状态未知时隔离槽位，确认停止或人工对账后才允许复用。
- Controller 重启后对账，旧 lease 不直接继续执行；禁止因锁超时自动重跑可能有副作用的任务。

### TR-05 Role 的专属 agents.md

- 规范文件名为小写 `agents.md`，由 Squad 显式加载，不依赖 Pi 自动向下发现。拒绝同时出现 `agents.md`/`AGENTS.md` 的歧义配置，大小写不敏感文件系统也需校验目录条目。
- `role.md` 保持 name、description、稳定职责正文；`agents.md` 保存当前工作约定、经验、验证要求，允许普通 Markdown，空文件合法。
- 迁移时给每个角色补空文件；目标格式要求文件存在，缺失或不可读时不接新任务。每次任务开始读取内容并记录 hash，整个 attempt（包括多个模型轮）固定此快照；下一项任务采用新内容。
- 普通手工输入按一轮快照加载；`role.md` 仍在进程启动读取，更改需重启，首版不暗示 `/reload` 会替换现有进程缓存。
- 项目/祖先通用 `AGENTS.md` 保留其正常作用。角色文件补充细节，不越过用户指令、项目约束或工具权限；冲突明确暴露。
- 同一个 role_id 的 `agents.md` 被该角色全部实例共享。Team 专用规则放 Team instructions，当前任务事实放 TaskContract；不能自动写回角色文件造成跨 Team 污染。
- 用户可编辑；Agent 只有在任务授权且声明该文件 write_set 时才可修改，遵守现有文件写队列和租约。角色文件不是模型自动持久记忆入口。

### TR-06 Team 配置与 Controller 展示

- 按 team_id 精确选择目录，配置包含独立 ID、显示名、版本、Leader agent_ref、成员 agent_ref/role_ref、职责描述、指令与策略。
- 一个 Team 一个 Leader，Leader 自动计入 roster；显示名不能用作路由 ID。首版成员固定引用实际 agent_id，缺成员 blocked，不根据相同 role 自动换人。
- Dashboard/查询区分 `mode=leader/role`、角色 ID、Leader 绑定 Team、所有成员关系、当前执行 Team/Run/Task、在线状态、占用/排队原因和规则版本。
- Team View 可以重复引用同一 Agent，但不能把它显示成两个独立空闲槽。

### TR-07 保留编排与质量门

Workflow 只生成已有 Task DAG；不建立独立执行引擎。Leader 通过结构化决定派发、等待、完成，不能直接运行普通实施工具。审查是独立 Task，使用自己的租约，引用待审 artifact 的 hash；规定需要独立 reviewer 时不能由产出者自审。最终 complete 由 Controller 检查依赖、审查、返工、未决状态与结果版本。

## 4. Multica 参考结论

核对固定提交 `1c908ea52c19f193d301ca9460fc1d7d100a1b3d`，详细证据与字段映射见技术文档及 [来源摘要](../../docs/sources/multica-team-runtime.md)。

Multica 的成员表允许同一成员属于多个 Squad，任务携带 squad_id，Leader briefing 在领取时组装；现代协议明确传递本次任务的 Leader 身份。这支持“多成员关系＋明确当前任务上下文”。其 Team 是服务端数据，不是 `.agents/pisquad/teams/<id>` 的本地目录规范；本文目录、team.json 和启动模式是 Pi Squad 的设计，不冒称上游标准。

与 Multica 不同，首版 Pi Squad 固定 Leader 启动身份，用结构化工具而非评论 @mention 派发，固定在线 Pi 串行执行，不照搬其进程启动、数据库或恢复策略。

## 5. 验收矩阵（全部待执行）

| ID | 场景 | 通过标准 |
|---|---|---|
| TR-A01 | 项目同时有 Claude 配置、旧 roles 和新 pisquad | 只按新目录加载；不写其它产品目录；仅旧目录时提示迁移。 |
| TR-A02 | 子目录启动、嵌套 Squad 项目、两项目 Controller | 选择最近合法项目；端口独立；跨项目发现拒绝。 |
| TR-A03 | 同项目双启动/陈旧 discovery | 文件锁确保唯一；PID 重用不导致误删锁；health 身份不符拒绝。 |
| TR-A04 | Role/Leader 环境或参数启动 | 各加载唯一对应目录；混合选择器/未知 ID 拒绝；Dashboard 正确区分。 |
| TR-A05 | 裸 Pi / 缺 Controller / Controller 断线 | 裸 Pi no-op；显式选择显示不可用；断线暂停，不回退另一服务。 |
| TR-A06 | 两 Team 共享 reviewer 实例 | 两 roster 一条 Registry；每次任务正确 team_id；第二项排队，无并发注入。 |
| TR-A07 | 两实例共享 reviewer 模板 | agent_id、session、执行槽独立；role 配置可复用。 |
| TR-A08 | 执行与审查争抢容量 | 均须租约；项目/Team/Agent/活跃 Team 上限同时满足；无部分持锁。 |
| TR-A09 | 重复 acquire、投递丢失、迟到结果 | 幂等取得相同 attempt；重复通知不重复执行；旧 epoch/attempt 结果拒绝。 |
| TR-A10 | 失租、取消、重启但旧 Pi 尚忙 | needs_review/quarantined，不自动释放复用或重跑；人工对账可追溯。 |
| TR-A11 | 修改 agents.md | 运行中 attempt 保持旧 hash；下一项使用新 hash；缺失/大小写冲突明确报错。 |
| TR-A12 | agents.md 和通用 AGENTS.md 冲突 | 不覆盖全局规则；文件不能改变注册身份/提升工具权限。 |
| TR-A13 | Leader 声称完成或尝试直接写文件 | 权限层阻止实施；缺审查或存在不明结果时 complete 被拒绝。 |
| TR-A14 | 两 Team 消息授权与 session 变化 | 明确 team_id/关联任务；不能借任一共同 Team 越权；旧绑定不能接新任务。 |
| TR-A15 | 用户输入/ask 与任务竞争、成员互调 | 同一 Pi 无双执行；中断向 Leader 报未完成；等待子任务不持槽死锁。 |
| TR-A16 | 所有运行文件位置 | DB/WAL/SHM、发现、锁、快照、日志及受管 session 均在 .runtime；配置不被运行数据覆盖。 |
| TR-A17 | 配置修改与队列公平 | 活跃 run 固定 config；新 run 用新版本；被忙 Agent 阻塞的队首不堵塞其它可执行任务。 |

运行验收按 `pi_squad/AGENTS.md`：新测试 workspace，至少三个不同 Role Pi、另启 Leader 和对应 Dashboard；所有 Pi cwd 为项目目录，使用隔离 Controller。两 Team 用例启动两个不同 Team Leader。本文编写不代表运行验收。

## 6. 实施顺序与未决

1. 命名空间、启动选择器、project discovery、受管 session 目录及配置解析。
2. Registry / TeamMembership / 消息授权一起迁移，Controller 展示新身份。
3. Invocation 的执行租约与恢复协议，再加审查和 Leader 决策轮。
4. 固定 roster Team Runtime、DAG、验收门；最后增加 Workflow 与成语接龙演示。

首版建议值、agents.md 自动生效边界、活跃 Team 计数口径属于本文工程提案，尚非用户逐项确认。未决统一记录在 [开放问题](../../docs/questions/open-questions.md)，不阻碍本轮文档交付。实现新能力时同步 USAGE 和原阶段验收合同；本轮不修改已可用命令说明。
