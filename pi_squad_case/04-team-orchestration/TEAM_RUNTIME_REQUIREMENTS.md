---
title: 阶段 04｜Team Runtime、Pi 交互与验收统一需求
type: process
status: draft
created: 2026-09-25
updated: 2026-09-27
scope_status: confirmed
decision_status: consolidated
implementation_status: not_implemented
acceptance_status: not_run
review_baseline: cdae80379685ff5c79621117712ce9f53ddefe1c
tags: [pi-squad, phase-04, requirements, acceptance]
---

# 阶段 04｜统一需求与验收

## 0. 权威、范围与变更说明

本文是阶段 04 唯一规范性需求及验收清单；[技术设计](TEAM_RUNTIME_DESIGN.md)规定实现契约、冲突处理依据、实施顺序和功能参考来源。README 只作导航，不复制规则。

本次整合基于 `pi_squad_dev@cdae80379685ff5c79621117712ce9f53ddefe1c` 的五份文件：README、TEAM_RUNTIME_REQUIREMENTS、TEAM_RUNTIME_DESIGN、PI_TUI_ROLE_HANDOFF_REQUIREMENTS、已废弃 TEAM_RUNTIME_PLAN。旧 TUI 稿的功能范围正式纳入本阶段；旧 PLAN 只提取不冲突的背景，不恢复已废弃规则。原稿可在该固定 commit 的同名路径查阅。

**已确认不变的约束**：多 Team；同 Team 单 Leader；同 Role 单 Primary；同 Role 单 Action Team/Run；同 Agent 单正式 Attempt；在线目标、既有会话、用户管理 Pi 进程、显式故障恢复；TS 仅做 Pi Extension，其余控制面使用 Go。

**本轮补全的实施默认值**：同 Team 单 active Run 加 FIFO；任务级 blockers；父任务 affinity 与模型执行额度分开；显式 Run 创建/选择；歧义 mention 拒绝与显式消歧；统一命令入口及 Dashboard 只读交互。这些是本轮在用户授权审查、补全及合并下选定的 V1 实施规则，不冒称为此前逐项批准的决定或上游现成能力。逐项理由见技术设计 C01—C20。

本次只提交文档，不声明实现或真实 Pi 验收完成。现有发现/消息代码和已有部分验收记录不被重置；P4 新能力及下列 **89 个计划用例均为 NOT_RUN**。

### 0.1 范围

本阶段必须同时交付：Team 调度；正式 Agent 调用和父子续接；Pi `@role`、Picker、命令及补全；Team/Role/Agent/Run/Task 状态展示；目录/配置/上下文；DAG、审查返工、最终 Gate；故障恢复、迁移及证据。

不交付：自动启动/重启 Pi，Primary 自动 failover，Role 多容量或负载均衡，Team 抢占，Task 级 Role ownership 释放，远程/多用户控制面，第二套任务引擎，Web 前端，ACP 接入实现，Herdr 实时 location/focus。最后一项仍属于阶段 05；阶段 04 Dashboard 不得推迟到阶段 05。

### 0.2 术语与不变量

| 对象 | 含义与唯一性 |
|---|---|
| Project | canonical project_root；一个有效 Controller |
| TeamDefinition | Leader、Role roster、instructions、policy 的配置，不是执行实例 |
| TeamLeaderBinding | Project + team_id 唯一有效 Leader Runtime |
| RolePrimaryBinding | Project + role_id 到稳定 primary_agent_id；失联不解除 |
| Secondary | 同 Role 额外 Pi，standalone 可用，但不可被 Team 调度 |
| SquadRun | 一次 Team 请求；配置快照、DAG、结果及生命周期 |
| RoleActionOwnership | Project + role_id 唯一 owner=(team_id,run_id)，按 Run 保持 |
| Task / Attempt | 逻辑任务及一次正式执行；重试产生新 Attempt，正常续接不冒充重试 |
| AgentTaskReservation | Attempt 的会话/Agent 逻辑归属，等待子任务时仍保留 |
| ExecutionLease / segment | 一次实际模型执行片段的许可；yield 并确认 settled 后可释放执行额度 |
| WriteReservation | 声明写资源的互斥，不是同用户任意进程的文件沙箱 |
| Result / Acceptance | 执行结果及业务验收，二者独立 |

Role ownership、Agent 逻辑归属、模型执行额度、写资源不可混为一个 lock。API 中使用 `run_id`，与旧稿 `squad_run_id` 同义；wire format 只输出 `run_id`，迁移层显式转换。

## 1. 功能需求

<a id="tr-01"></a>
### TR-01 Project、目录与激活

唯一目标布局：

```text
<project-root>/
├── AGENTS.md                         # Pi 原生项目规则，不由 Squad 生成/覆盖
└── .agents/pisquad/
    ├── roles/<role_id>/
    │   ├── role.md                   # 必需；Markdown + name/description frontmatter
    │   └── agents.md                 # 必需，可为空；小写，Role 工作规则
    ├── teams/<team_id>/
    │   ├── team.json                 # 必需；schema_version=1
    │   ├── instructions.md           # 必需，可为空
    │   └── workflows/<workflow_id>.json # 可选；只 materialize 为 Task DAG
    └── .runtime/                     # 不入 Git
        ├── controller.lock
        ├── controller.json
        ├── state.sqlite
        └── artifacts/
```

从启动 cwd 向上查找最近 `.agents/pisquad`，对 Project 做 canonicalization；嵌套项目选择最近根。读取配置文件遵守固定 schema/路径，不把目录内其它文件自动变成 prompt。拒绝重复标识、非法 frontmatter、越界引用和大小写伪装；macOS 不区分大小写文件系统也必须核查实际目录项，不能把 `AGENTS.md` 当作 Role `agents.md`。

同 Project 一个 Controller，以真实进程锁防双写；动态绑定 `127.0.0.1:0`，原子发布 controller.json。客户端验证 project/protocol/controller identity，不回退到另一 Project 或旧固定默认端口。Controller 停止、旧文件、端口复用不能伪装可用。

未选择 Squad 身份的 Pi 保持 no-op，不增加拦截和模型工具。显式选择身份但服务不可用时给一次明确错误，不吞掉普通 Pi 能力。源码、旧使用说明和真实配置本轮不迁移；实现时提供显式迁移并同步 USAGE。

来源：技术设计 S0、S1、S8。检查：P4-A01—A07。

<a id="tr-02"></a>
### TR-02 Leader 身份

`mode=leader` 必须指定稳定 agent_id 和 team_id，且匹配 team.json 的 leader.agent_ref；一个进程只绑定一个 Team，不在进程内切成别队 Leader。同 Team 第二个有效 Leader 返回 `TEAM_LEADER_ALREADY_ACTIVE`，退出第二个 Leader 模式但不终止普通 Pi。

`/new` 不创建第二个 Leader。Runtime 重启保留稳定 Agent identity，但仅凭同 agent_id 或 offline 不允许接管：需要合法连续性证明，或用户确认旧执行并显式释放。旧 Runtime、旧 session、旧 epoch 的写入拒绝。Leader 默认只协调，实施工具必须在代码层限制，不只依赖 prompt。

来源：S0、S2、S8。检查：TR-A01/A02/A16、P4-A07/A32。

<a id="tr-03"></a>
### TR-03 Role Primary / Secondary

首个成功原子绑定的稳定 agent_id 成为唯一 Primary，不按终端打开时间或客户端时钟裁决。其它同 Role Agent 正常注册为 Secondary，`team_schedulable=false`，可以普通手工对话和 standalone 工作。

Team execute/review/rework/ask/peer invoke/mention 均不能选 Secondary，包括显式 agent_id 和伪造 direct scope。Primary offline/suspect 时不可调度，不自动提升 Secondary。显式 promote/release 必须对账旧执行、解除该 Role 的 Run ownership，确认无 suspended/active/quarantined Attempt 后再变更 binding epoch。

Primary 资格与当前在线状态分开保存。新 Runtime 不能凭同 ID 抢占旧 Runtime；释放某次执行额度不等于释放 Primary。

来源：S0；这是 Pi Squad 自有约束，不是 Multica 标准。检查：TR-A03—A06/A20、CMD-A05/A06、P4-A07/A28/A35。

<a id="tr-04"></a>
### TR-04 Role ownership 与 Run admission

允许多个 Team 同时运行、共享 RoleDefinition。普通成员只配置 role_ref，由 Controller 解析当前 Primary；同 Team 不重复 role_ref。

Role ownership 仅在首次实际派发的 admission 成功时 lazy acquire，不在创建 Run 时预锁 roster。第一次获取 ownership 与该次 Attempt 所需许可在同一事务中完成；任一检查失败不留下新获取的半资源。同 Run 已有 ownership 在排队、review/rework、暂时 idle 时保留。

其它 Run 请求已占 Role，生成可追踪的 waiting Task/请求并返回 `ROLE_BUSY`，不创建目标 Attempt、不拿目标 lease/write reservation。返回 role、Primary、owner team/run、revision。只在 Run 终止且相关执行已安全对账后释放 ownership；`failed/cancelled` 标签或 TTL 本身不构成释放证明。

**同 Team 默认 FIFO、一个 active Run**。后续请求形成 queued Run，固定请求时配置快照，不持有 Role/Agent/write 资源。前一 Run 安全收尾后才准入下一 Run；needs_review、quarantined 或仍在停止的前一 Run 不被跳过。取消尚未准入的 Run 不影响活动 Run。多 Team 并行不受此规则取消。

来源：S0、S2；FIFO 和组合 admission 为本轮实施默认。检查：TR-A07—A12/A33、P4-A08/A11/A34。

<a id="tr-05"></a>
### TR-05 部分等待、唤醒与等待环

持久化每个 Task 的 blocker 集合，而不是一个全 Run 的 blocked_on_role_id。Run 分开保存 lifecycle phase、blockers[]、可执行/运行任务数；`waiting_role` 是所有当前可推进路径均在等 Role 时的展示/聚合状态，不是暂停整个 Run 的总开关。一个分支等待不阻止其它就绪分支；取消或改版 Task 只删除其自身有效 blocker。

Leader briefing 提供 available/working_here/busy_other_team/offline/quarantined 及 owner 信息，但不是锁。提交时 Controller 再次 CAS。角色释放与可重放 event/outbox 在同一事务提交；等待登记与事件订阅不存在丢唤醒窗口。重复、迟到事件不能重复派发。Leader 无进展时结束协调轮，不用模型轮询；Controller 自身的 heartbeat、对账或有界投影刷新不属于模型忙等。

统一 WaitGraph 覆盖 Task 依赖、Role owner、Agent affinity 和写锁。跨 Team 出现 A 持有 backend 等 reviewer、B 相反时，记录环及资源链，标 needs_review，停止会扩大环的派发；不自动抢占。用户显式终止/恢复一方且对账后，正常事件唤醒其它方。等待时长可见；V1 不承诺严格公平或有限等待时间。

来源：S0、S3；组合等待图为本项目设计。检查：TR-A09/A11/A12/A24—A26、P4-A10/A12/A14/A36。

<a id="tr-06"></a>
### TR-06 执行许可、容量与写资源

实际执行前原子检查 Task revision/依赖、Run active、Team 授权、Primary、ownership、当前 runtime/session、AgentTaskReservation、执行额度、Project/Team capacity、write_set。

同 Agent 最多一个非终态正式 Attempt（包括 suspended），同 Pi 最多一个模型执行片段；不得以 team_id+agent_id 创建多个槽。Controller admission 后 TS 在输入注入前再检查最新 idle、pending、generation 和本地 gate；最后检查与调用输入 API 之间不得插入新的异步等待。竞争失败留队列，不 steer/abort 手工工作。

写任务先声明规范化 write_set；文件别名、目录包含关系和同一文件的多种路径不能绕过互斥。只在 Project 自己的可写树内受管写入，排除嵌套其它 Project、配置及 runtime 控制文件。任意 shell 副作用不能靠路径声明得到强隔离保证；V1 验收写任务使用可检查路径的 write/edit 工具，未能约束的 shell 写入应拒绝。

来源：S0、S1、S2、S3、S7。检查：TR-A14/A31、P4-A11/A13/A14/A37。

<a id="tr-07"></a>
### TR-07 消息、正式调用与 scope

notice、状态查询、读取既有结果只记录/展示，不启动目标模型，也不占 Role。新模型工作的 Team ask、execute、review、rework、peer invoke、用户 handoff 必须走相同 Role Gate 和本地 work gate。

正式 handoff 不映射为现有 `send_message(kind=ask)`。Team ask 可产生 kind=ask 的受管 Task 并关联消息，仍保留受限回答工具；执行 Task 则使用其正式工具契约。已有 message_id、receipt、reply 与 task_id、attempt_id 不相互替代。

Direct invocation 继承阶段 03，通过显式 agent target 和独立授权调用真正 standalone Agent；它不隐式新建 Team Run。携带活动 Team/Task 上下文的调用者不能靠 `scope=direct` 或 `agent:<secondary>` 逃逸；scope 由认证源和执行上下文裁决。已被 Team Run 持有的 Primary 不接无关 direct 模型工作。非 Team、无冲突的 standalone 使用仍有效。

来源：S0、S4、S8。检查：TR-A13、CMD-A09/A10、P4-A28。

<a id="tr-08"></a>
### TR-08 Role 与上下文装配

`role.md` 保留 name/description frontmatter 和正文格式；稳定 Role 正文按进程读取，修改后显式重启生效。`agents.md` 每个新 Attempt 读取并固定快照；同 Attempt 的 continuation 不偷偷热换规则。Team instructions/config 在 Run 创建时固定，新的 Run 才采用新版本。

逻辑上下文分为：Pi 原生项目规则；Squad 协议；Role；Role working rules；当前 Team 的必要 instructions；Leader roster/Run briefing；当前 TaskContract。不得生成合并版 AGENTS.md 或把 Team 动态事实写回 Role 文件。Leader 获得完整当前 Team briefing，Worker 只拿完成当前任务所需的有界信息。

TaskContract 包含 role、resolved Primary、team/run/task/attempt、segment、任务种类、goal、源/父/root、依赖和不可变 refs、expected_output/acceptance、tool constraints、write_set、相关 config/content hashes。Caller 材料视为任务数据，不提升为权限指令。调用不要求预先加载某个 Squad Skill；目标 Pi 可自行按需加载 Skills。

使用 Pi 原生可组合 prompt sections；每次 continuation 重建当前动态块，结束后清除。既有聊天历史可能保留，不声称跨 Team 历史隔离。最终 provider payload 的有效块/摘要及工具集合需有脱敏证据；whoami 或组装器自己打印的字符串不能单独证明最终请求。后续扩展改写、自动重试、压缩及超长上下文必须测试。

来源：S0、S1、S9。检查：TR-A30/A33、CMD-A12、P4-A05/A31/A39。

<a id="tr-09"></a>
### TR-09 Team / Workflow 配置

team.json 固定 schema_version、team_id、config_version、leader.agent_ref、members[{role_ref,responsibility}]、instructions_file、policy，可选 default_workflow。目录名与 ID 一致，引用必须存在。同版本内容 hash 改变应提示版本冲突，而不是覆盖旧 Run 快照。

V1 policy 显式记录 FIFO single-active、Project/Team 执行容量、最大委派深度、任务数量、重试预算及允许工具/路径上限。实验默认深度 3、每 Run 最多 20 个 Task、每 Task 最多 3 个 Attempt；重试预算不是自动重执行许可。

Workflow 文件只表达步骤、目标 role_ref、种类、依赖和结果引用，校验后一次 materialize 到同一 Task Store。Leader 动态计划也写入同一 DAG，不另启 Workflow Engine。完整 JSON 示例和 schema 必填项见技术设计 D02。

来源：S0、S2、S3、S8。检查：TR-A21/A23/A28/A33、P4-A04/A05/A17。

<a id="tr-10"></a>
### TR-10 Dashboard 与状态投影

本阶段实现独立 Go TUI，以及 Pi 内 `/squad dashboard` 的薄原生交互视图。二者复用 Controller 投影，不各建一套状态机；不新建 Web 服务或替换 Pi TUI。

| 视图 | 必须展示 |
|---|---|
| Team / Run | Team、Leader/runtime/session/epoch、活动及排队 Run、phase、各 Role/Primary/owner、所有 blocker、下一步动作 |
| Role | Primary、在线/活动、binding epoch、Secondary 列表、team_schedulable、owner team/run、ownership revision、隔离原因 |
| Agent | ID/Role、Primary/Secondary/Leader、runtime/session、activity、当前 Task/Attempt/segment、逻辑 affinity 与执行 lease |
| Task / Detail | DAG/root/parent/依赖、Task 状态、结果版本、review/rework、acceptance、事件时间线、错误及可操作原因 |

Presence、Activity、身份资格、Role ownership、Run/Task state、Acceptance 分字段。`idle != completed != accepted`；free 不自动意味着在线可执行；Secondary 标 standalone，不能统计为 Team 额外容量。

支持筛选、选择、详情、刷新、按 Run 定位任务；显示 snapshot revision、数据年龄、stale/断线。观察退出不停止 Controller/Pi。只读视图不触发模型轮、不算人工接管。

Dashboard 保持只读投影。恢复/取消/promote/release 入口只生成或展示明确 Controller 命令预览，用户显式提交后走操作接口和审计，不能直接改数据库或乐观显示成功。Herdr location/focus 不作为 P4 完成条件。

来源：S0、S1、S6、S8。检查：TR-A17、P4-A25—A27/A38。

<a id="tr-11"></a>
### TR-11 DAG、结果、审查与最终 Gate

Leader 使用结构化 `squad_decide`（dispatch/wait/complete），Controller 复核版本、依赖、预算和授权；模型不能自行修改 owner、租约或完成状态。自由文本“已交接/已完成”没有执行效力。

执行完成需同 Attempt/segment/binding 的 result_proposed、无错误/中断的 settled、idle/no pending 及结果 schema/refs 校验。`agent_end` 可能发生于自动重试/压缩前，不能单独代表 settled。完成和 acceptance 分开。

依赖边必须声明条件：普通业务后继默认 `acceptance_accepted`；review 消费已正常完成但尚未验收的候选结果，使用 `execution_completed`；rework 消费审查拒绝记录。否则“先验收才允许审查”会自锁。中断/失败绝不满足任何成功依赖。

独立 review Task 审查具体 result revision + artifact hashes。拒绝后创建可追踪的新 rework/re-review 节点，不能把 DAG 改成环或覆盖失败历史。产物或任务要求变化使旧审查失效；重新检查当前版本。

最终 complete 在事务中验证：当前必要任务/结果/依赖、required review、无有效 blocker、无未处理故障、无活动或未知执行，且审查版本一致。终结、资源释放和通知必须满足安全条件。取消的过期 Task blocker 不应永久阻挡已修订的 DAG。

来源：S0、S1、S2、S3、S8。检查：TR-A18/A21—A23/A28/A32、P4-A17/A31—A33。

<a id="tr-12"></a>
### TR-12 Pi mention、Picker 与输入分类

主交互为行首单目标 `@<role_id> <task>`。`/pisquad-use` 使用当前 Team Role projection 打开 Picker，选择后填入 `@role `，保留已有任务草稿，不自动提交、不建立 persistent target mode；取消 Picker 不改草稿。

只读 Team roster Role projection 生成候选，至少展示 Role、Primary、availability/owner；Secondary 不作为可执行候选。autocomplete 是原 provider 的 wrapper，原 `@README.md`、`@src/foo.ts` 保留。缓存带 Project/Run/config/generation/revision；旧异步结果不得覆盖新 Run，提交时重新校验。

精确定义解析：仅用户 interactive 输入的首个 token 可路由；正文、引用块、代码、邮件及 Assistant 文本不触发执行。连续多个执行目标前缀拒绝 `MULTI_TARGET_NOT_SUPPORTED`，不得部分派发。Role 与真实同名文件冲突时拒绝猜测，显示 `TARGET_AMBIGUOUS`；显式 `@role:reviewer` 或 `/squad call role:reviewer ...` 选择 Role，`@./reviewer` 选择文件。无匹配 Role 的普通文件 token 交回 Pi；显式 role target 错误则 handled，不落到当前 LLM。

已启用扩展但无有效 Team/Run 的显式 handoff 返回 `NO_ACTIVE_TEAM_CONTEXT`；未启用 Squad 的普通 Pi 仍按 TR-01 no-op。拒绝、服务断线或提交结果不明后都不能把已识别 handoff 当普通本地任务执行。保留文本/显式 refs；V1 不支持的图片/附件在提交前明确拒绝，不能静默丢弃。

只有角色和目标文本时使用明确的只读默认 TaskContract；写入需通过命令参数或任务表单声明 write_set，并受预设权限上限约束。自然语言“修改文件”不是自动提高工具权限的依据。

来源：S0、S1。检查：CMD-A01—A04/A13—A15、P4-A21—A24/A29/A30。

<a id="tr-13"></a>
### TR-13 命令、Run 创建与上下文绑定

以下为**目标接口，尚未实现**。统一 root command 为 `/squad`；现有 `/squad-whoami`、`/squad-inbox`、`/squad-transport` 保留兼容 alias，`/pisquad-use` 保留为 Picker 入口。参数使用 Pi registerCommand 的补全能力，候选来自同一 Controller projection，不能靠模型猜 ID。

| 命令 | 语义 |
|---|---|
| `/squad help`、`whoami`、`agents`、`roles`、`teams` | 发现能力、身份、列表；无模型副作用 |
| `/squad run <team_id> <goal>` | 显式创建 Run，返回 run_id 与 active/queued；不 spawn Leader |
| `/squad use-run <run_id>` | 选择观察及 handoff 上下文；不改变 Leader 身份、权限或 Role ownership |
| `/pisquad-use` | 选 Role、填编辑器；无隐式 Run 创建 |
| `/squad call role:<id> [--write <path>] -- <goal>` | 当前 Run 正式 handoff；与 @role 同一路由 |
| `/squad call agent:<id> -- <goal>` | 仅合格 standalone direct 调用，受 TR-07 限制 |
| `/squad ask role:<id> <question>`、`send <target> <text>` | 前者受管受限问答，后者仅 notice |
| `/squad status [run_id]`、`task <task_id>`、`dashboard [view]` | 状态、详情、Pi 原生观察交互 |
| `/squad cancel task:<id>`、`cancel run:<id>` | 显式取消，返回 cancel_requested 及实际停止状态 |
| `/squad amend <task_id> <text>`、`takeover` | 关联补充和手动接管是不同操作 |
| `/squad recover <task_id> --attach-evidence <ref>` | 关联已发生的可核实结果，不执行 |
| `/squad retry <task_id> --rebind-current` | 明示旧/新绑定和风险，用户提交后产生新 Attempt |
| `/squad role release <role_id>`、`role promote <role_id> <agent_id>` | 显式管理，必须先通过执行对账和 epoch CAS |
| `/squad inbox`、`transport` | 兼容现有只读消息/传输诊断 |

创建请求要求目标 Team 合法、Leader 在线及调用授权有效；Leader 离线直接拒绝，不留下待其上线自动执行的新请求。Leader 绑定 active Run；operator 可显式选 Run，不能由其全部成员关系推断当前 Run。Worker 的正式命令使用 Controller 赋予的当前 Attempt/Run，上下文冲突则拒绝；不能用 use-run 把正在执行的任务换队。

普通自然语言在 Leader 空闲且没有 active Run 时，可以通过明确的 create-run Tool 创建请求；活动 Run 中必须关联该 Run，不能既当新 Run 又当补充。创建 Run 与给已有 Run handoff 是两种独立请求及幂等键。

选 Run 不授予新权限。`/new`、Run 终结、绑定变化清除过期 UI context；对旧 Run 的恢复须显式操作。接受任务时记录目标 expected Primary/runtime/session/epoch，之后排队遇到绑定改变不能自动搬到新会话。

来源：S0、S1、S8；具体命令集和 FIFO 为本轮收口。检查：P4-A08/A09/A20/A23/A24/A28/A34/A38。

<a id="tr-14"></a>
### TR-14 父子调用、yield 与用户介入

Agent-to-Agent 必须通过 structured Tool：Leader 使用 squad_decide，Member 使用 async peer invoke；Assistant 文本 @role 不执行。child Task 保存 root/parent/depth、同 Run、Caller 绑定和继承约束。拒绝调用自己/祖先、DAG 环、资源等待环及超预算。

父 Task 使用 yield 声明依赖，结束模型轮并确认 settled 后释放**执行额度**；AgentTaskReservation、Role ownership、尚有效的 WriteReservation 保留，不能在共享 Session 插入无关正式任务。child 完成后仅恢复该父 Attempt 的新 segment，重新取得 lease/capacity，并使用原 Attempt 快照。父子 write_set 冲突必须在接受 child 前拒绝；V1 不通过静默释放父写锁实现文件交接。

同 root 的澄清问题可作为父 Attempt 的 response-only continuation，使用同一逻辑归属、受限工具及新的执行 lease，不产生第二项正式任务。正常新 child 不能反向执行祖先。

用户操作先由统一 InputClassifier 分类。只读命令/Picker/dashboard 不中断任务。明确关联的 amend 或 peer handoff 记录 source task/attempt/revision，不算普通接管；活动模型中先保存 child intent，等待安全边界及父 yield 才派发，不自动 steer 或抢占。父已终结则拒绝 intent。没有关联的普通输入和 takeover 立即将原 Attempt 标 `interrupted/manual_interference`，向直接调用方和所有等待祖先持久传播“未完成，用户已介入”。未知物理执行状态仍隔离，不能因逻辑中断就放行新任务。

来源：S0、S1、S4、S8。检查：TR-A27/A28、CMD-A10/A11、P4-A13—A16/A29/A30。

<a id="tr-15"></a>
### TR-15 故障、会话变化与恢复

`/new` 始终由用户决定：空闲时身份不变，执行中则原 Attempt interrupted/session_changed，旧队列不跨 session 自动执行，旧回调不污染新会话。扩展 reload 更新 generation、清除旧订阅及回调，不能靠重新加载重放未知输入。

Controller 重启、失租、超时、Runtime 失联时记录 reconciliation/needs_review/quarantined/outcome_unknown，禁止自动重派或仅因 TTL 释放副作用资源。只读对账可自动，新的模型输入必须等显式恢复授权。正常无故障的 child 完成/Role 释放可以事件续接；经历故障的 Run 即使后来收到事件也不能绕过恢复门。

cancel 是请求而非停止证明；取消排队任务不 abort 目标其它工作。取消 Run/父任务时持久阻止新的后继，追踪所有子任务及实际执行，确认全部相关资源可安全释放后才关闭 cleanup。晚到结果保留为历史证据，不能自动复活失败、取消或旧 epoch 的执行。

release/promote/recover/retry 分开：recover 不执行，retry 新 Attempt；角色换人不是重试；Primary offline 不是 release。用户手动恢复需保存证据摘要、实际副作用处理方式及操作审计，不声称自动回滚文件。

来源：S0、S1、S5、S8。检查：TR-A05/A06/A15/A16/A19/A29、P4-A07/A15/A16/A18/A35/A36。

<a id="tr-16"></a>
### TR-16 一致性、幂等、事件和迁移

请求具有稳定 request_id、payload hash、认证 source 和 project scope。同键同内容重放返回原实体和当前状态；同键异内容拒绝。Task 创建、状态修改、revision CAS、资源变化及 outbox 在短事务提交；网络通知和 LLM 不在事务内。持久化失败不得返回已接受，更不得先向 Pi 注入。

注入前后的不确定窗口单独建模：请求已持久化、adapter received、input observed、result proposed、settled 都不是同一确认。发生 injection outcome_unknown 时不自动重发有副作用输入；文档不承诺物理执行 exactly-once。

控制面沿用现有 HTTP/JSON + SSE invalidation。SSE 不是任务存储；断档、乱序、慢消费者和 Controller epoch 改变必须重取 snapshot。历史四字节 framing/额外 broker 不进入 P4。迁移不得删除旧 squad_id/messages/授权历史；旧配置显式转换，旧 scope 快照保留，新旧调度协议禁止混跑。schema 升级先备份，失败可回滚，运行数据不自动清空。

来源：S0、S4、S5、S7、S8。检查：TR-A12/A16/A19/A25、CMD-A15/A16、P4-A06/A11/A12/A17—A20/A26。

<a id="tr-17"></a>
### TR-17 权限、输出和异常说明

预授权的小队自动协作，不为每个普通 Task 增加确认弹窗；但显式恢复/换人/重试按用户操作入口执行。Role、Team、调用方、目标 runtime 的允许工具/路径取交集，Markdown 不能提升权限。Leader 不拥有普通实施权限。read_only 必须由 tool gate 实施，不能只写进 prompt。

UI/API 错误至少分为输入错误、身份/版本错误、可等待资源错误、故障待恢复、业务拒绝。保留既有 TEAM_LEADER_ALREADY_ACTIVE、ROLE_NOT_PRIMARY、ROLE_NOT_SCHEDULABLE、ROLE_PRIMARY_OFFLINE、ROLE_BUSY、ROLE_QUARANTINED、AGENT_BUSY、CAPACITY_UNAVAILABLE、WRITE_CONFLICT。增加 NO_ACTIVE_TEAM_CONTEXT、ROLE_NOT_IN_TEAM、EMPTY_HANDOFF_TASK、MULTI_TARGET_NOT_SUPPORTED、INVALID_HANDOFF_SYNTAX、TARGET_AMBIGUOUS、REVISION_CONFLICT、REQUEST_ID_CONFLICT、ACTIVE_TASK_SCOPE_CONFLICT、RESOURCE_DEPENDENCY_CONFLICT、UNSUPPORTED_HANDOFF_ATTACHMENT、CAPABILITY_UNAVAILABLE。

accepted/queued/waiting/rejected 必须附 request/task/run/role/Primary 和下一步原因；开始执行后补 attempt/segment。敏感凭据不进日志、Dashboard、artifact 或结果导出。

来源：S0、S1、S8。检查：CMD-A04—A16、P4-A19—A24/A27—A33/A39。

<a id="tr-18"></a>
### TR-18 实现边界、能力检查与证据

扩展模块至少分离 team-roster、mention-autocomplete、handoff-input、squad-commands、invocation、execution-gate、context-assembly；index.ts 只装配。Go 在现有 controller 中分离 project/config、identity、task、scheduler、recovery、projection，不另建 daemon/Task Store。具体目录见技术设计 D01；模块可以内部细分，但不能把调度转移到 TS。

启动 doctor 核对实际 Pi/Node/Go、固定源码版本、关键 hook/API、协议及权限。缺能力时明确阻止对应正式调用，不用屏幕文本、模拟按键、消息 ask 或新进程补洞。实现每一个可用增量时同步 pi_squad/USAGE.md；本次文档不提前修改其“已可用”声明。

真实验收遵守当前 pi_squad/AGENTS.md：新建专用测试 workspace、至少三个不同 Role Pi、Controller/Dashboard 分终端、从项目 cwd 启动、动态记录验收回传位置。Herdr 可作为人工测试终端宿主，但 P4 不连接 Herdr API 作为业务路由/状态依据，仍须证明无 location adapter 可完成业务；旧“完全不连接 Herdr”的实验文字按此区分宿主与业务适配器。不能把正常试验移到临时目录伪造当前项目加载；破坏性目录负例单独隔离。

来源：S0、S1、S6、S8。检查：P4-A24/A25/A38—A40。

## 2. 验收组织和退出门

89 项 = TR-A01—A33（33）+ CMD-A01—A16（16）+ P4-A01—A40（40）。保留原 ID 便于追踪；原 TR-A08 的全 Run waiting 简写按 TR-05 的部分等待定义判定，TR-A27/CMD-A11 的“释放槽”按 TR-14 区分执行额度和 affinity。CMD-A13 的 standalone 前提为显式启用 Squad，而非完全 no-op 的普通 Pi。

每项记录前置配置/版本、具体终端操作、输入、预期、实际、事件 seq、实体 IDs、证据与 PASS/FAIL/BLOCKED/NOT_RUN。下列表的“操作”是必测场景，不是已经执行。详细模板沿用 [全局验收规范](../ACCEPTANCE.md)。

证据代号：**U** 真实 Pi 输入、工具及终端观察；**E** Controller 事件/实体/租约快照；**R** 结果、artifact hash、确定性检查器；**F** 受控并发/故障注入；**D** 文档/schema/源码静态检查。所有正常主闭环必须包含真实 Pi，F 不替代 U。

### 2.1 原 Team Runtime 用例（33）

| ID | 操作与必须满足的判据 | 证据 |
|---|---|---|
| TR-A01 | 同时启动同 Team 两 Leader；第二个拒绝并退出 Leader 模式，第一个及普通 Pi 不受影响 | U/E |
| TR-A02 | 启动两个不同 Team Leader；可同时调度不冲突 Role | U/E |
| TR-A03 | 启第一个 reviewer；成为唯一 Primary | U/E |
| TR-A04 | 再启同 Role；成为 Secondary，正常对话但不被 Team 选择 | U/E |
| TR-A05 | Primary offline、Secondary online；明确不可调度，无自动提升 | U/E |
| TR-A06 | 显式 promote；先对账并解除旧占用，再更新 epoch，旧写入失效 | U/E/F |
| TR-A07 | A 首次实际 dispatch；lazy acquire 绑定 A/Run A，不预锁无关 Role | U/E |
| TR-A08 | B 请求 A 持有的 reviewer；记录该 Task 等待和 owner，不创建 Attempt或半资源 | U/E |
| TR-A09 | B 等 reviewer 时派 researcher；无关分支仍执行 | U/E |
| TR-A10 | A reviewer Task 完成但 Run 未结束；B 不能插入 | U/E |
| TR-A11 | A Run 安全收尾；release 和事件持久，B Leader 重评估后推进 | U/E |
| TR-A12 | 两 Leader 基于同 free snapshot 同时 acquire；只有一个成功 | F/E |
| TR-A13 | 用 ask/peer invoke 请求被占 Role；同样受 Gate，不能选 Secondary | U/E |
| TR-A14 | 同 Primary 两正式任务；一个 Attempt/执行片段，其余排队，Pi 无重入 | U/E/F |
| TR-A15 | 空闲 Primary /new；agent/Primary/ownership 不变，session 更新 | U/E |
| TR-A16 | 同身份重启；按连续性或显式 release 重绑，旧 runtime/epoch 写入拒绝 | U/E/F |
| TR-A17 | 检查 Team/Role/Agent 视图；Leader、Primary/Secondary、owner、blockers、Attempt 可解释 | U/E |
| TR-A18 | 同 Run review/rework；复用 ownership，仍独立 lease 和最终 Gate | U/E/R |
| TR-A19 | 失租/Controller 重启；执行状态待核实，不自动重派或按 TTL 释放资源 | U/E/F |
| TR-A20 | Secondary 普通独立工作；不受 Team 禁用，但不形成 Team capacity | U/E |
| TR-A21 | 两成员真实并行、结果依赖、独立 review、最终 Gate，不能模拟团队讨论 | U/E/R |
| TR-A22 | 提供确定性错误结果；review 拒绝，返工、复审通过，失败历史保留 | U/E/R |
| TR-A23 | 未完成依赖/review/隔离/blocker 时 complete；Controller 拒绝 | E/F |
| TR-A24 | 两 Task 等不同 Role，第三分支就绪；第三执行，释放一个 Role 不清另一个 blocker | U/E |
| TR-A25 | 重复、迟到 role_available；不重复派发，多个候选仍原子竞争 | E/F |
| TR-A26 | A/B 互占 Role 形成等待环；可见完整环及 needs_review，显式恢复后可继续 | U/E/F |
| TR-A27 | 父 invoke child 后 yield；释放执行额度而保留 affinity，结果只续接正确父任务 | U/E |
| TR-A28 | self/ancestor/dependency cycle；拒绝且不遗留无法完成的 Attempt | E/F |
| TR-A29 | 执行中 /new；旧 Attempt interrupted，旧任务不入新会话，晚结果不推进 | U/E/F |
| TR-A30 | 核对实际模型请求的 Role/Team/Run/Task/Attempt 和 hashes；动态块不串任务 | U/E/R |
| TR-A31 | 同 Agent串行、不同文件并行、相同写资源互斥；分别观察 lease/write reservation | U/E/F |
| TR-A32 | review 后改变候选产物；旧 review 失效，当前版本需重审 | U/E/R |
| TR-A33 | 同 Team 第二个 Run；FIFO queued，不覆盖旧 Run或持有其资源，安全收尾后准入 | U/E |

### 2.2 原 TUI / Handoff 用例（16）

| ID | 操作与必须满足的判据 | 证据 |
|---|---|---|
| CMD-A01 | 当前 Run 输入 @；出现 roster Role/Primary/state，不列 Secondary capacity | U/E |
| CMD-A02 | 输入 @README.md 和 @src/foo.ts；无 Role 冲突时原文件补全保留 | U |
| CMD-A03 | /pisquad-use 选择 reviewer；编辑器填 @reviewer，不再手输 Role，与 mention 共用 handler | U/E |
| CMD-A04 | 显式 handoff；输入 handled，当前 LLM 不自己执行，成功或拒绝均可追踪 | U/E |
| CMD-A05 | Primary/Secondary 都在线；@role 只解析 Primary | U/E |
| CMD-A06 | Primary offline；错误明确，不投给 Secondary | U/E |
| CMD-A07 | 跨 Team Role busy；该 Task 等待，不创建目标 Attempt或绕过 Gate | U/E |
| CMD-A08 | working_here 再派发；复用 ownership，但仍遵守 Agent/capacity | U/E |
| CMD-A09 | 用已声明 write_set 的正式 backend Task 修改 fixture；不以 Messaging ask 代替，工具权限正确 | U/E/R |
| CMD-A10 | Leader 真正调用成员；使用 structured decision，文本 mention 不执行 | U/E |
| CMD-A11 | Worker 调 reviewer child；父 yield、安全续接，无阻塞 Promise 或第二项正式工作 | U/E |
| CMD-A12 | 未加载 Squad Skill 仍可路由；目标可按需使用自己的 Skill | U/E |
| CMD-A13 | 显式启用 Squad 的 standalone Pi 无 Run 时提交 role handoff；报无上下文，不隐式创建 Run或回落 LLM | U/E |
| CMD-A14 | 连续 @reviewer @backend 执行前缀；拒绝多目标，无部分 Task | U/E |
| CMD-A15 | 补全后 Role 被另一 Run 获取；提交时重新裁决 busy，不信旧缓存 | U/E/F |
| CMD-A16 | 关联 source input、request、team/run/role/Primary、Task、执行后的Attempt、revision和事件 | U/E/R |

### 2.3 本轮关键补充用例（40）

| ID | 准备与操作 | 必须满足 | 证据 |
|---|---|---|---|
| P4-A01 | 两 Project、嵌套根、同一路径别名启动/发现 | canonical 身份唯一，最近根正确，不跨 Project | F/E/D |
| P4-A02 | 动态端口、过期 controller.json、错误 project/protocol、端口被复用 | 无固定端口回落，不连接错误 Controller | F/E |
| P4-A03 | 不选身份、选身份但服务不可用分别启动 | 前者完全 no-op，后者明确不可用，无重复告警/模型工作 | U/E |
| P4-A04 | 缺文件、重复 Role/Team、非法 JSON/YAML、目录ID不符、agents.md 大小写、workflow环 | loader 精确报错，拒绝部分配置激活，旁路文件不读写 | F/D |
| P4-A05 | 运行/排队时改 Role/agents.md/Team instructions，随后 continuation及新Run | 快照边界正确、hash可追溯，不静默热换当前Attempt | U/E/R |
| P4-A06 | 旧目录/旧消息DB迁移、失败回滚、混协议接入 | 原数据和授权历史保留，有备份；混跑拒绝；不导入伪在线 | F/E/D |
| P4-A07 | 并发注册、Leader失联但未释放、旧Runtime恢复、promote竞争 | offline不等于release；CAS唯一，旧凭据/epoch不能夺回身份 | F/E |
| P4-A08 | 从零使用命令创建Team Run，重复request，再提交同队第二Run | 一个逻辑请求一个Run；第二FIFO；无需隐藏手工改DB | U/E |
| P4-A09 | use-run后终结Run或/new，再提交旧草稿 | 上下文失效可见，提交拒绝，不换队/复活旧Run | U/E |
| P4-A10 | 多blocker并存时取消/改版一个Task | 仅清对应revision的wait，其它分支正确推进 | F/E |
| P4-A11 | 首次acquire时注入capacity/write冲突及事务失败 | 没有新ownership/lease/Attempt半成功；已有本Run ownership不误删 | F/E |
| P4-A12 | 在登记等待/释放/订阅/snapshot间注入竞态和事件gap | 无永久漏唤醒；重复事件去重；epoch/gap触发对账 | F/E |
| P4-A13 | Team capacity=1，父调用另一Role child，同时投无关父Agent任务 | child可执行，父保留affinity；无关任务不能占其会话；父正确续接 | U/E |
| P4-A14 | child请求父持有的相同文件或其它等待环资源 | 明确RESOURCE_DEPENDENCY_CONFLICT/环，不静默释放父写锁 | F/E |
| P4-A15 | 三层嵌套中叶子遭用户普通输入、/new或失败 | 失败沿祖先持久传播，停止成功后继；上层不永久等成功 | U/E/F |
| P4-A16 | 分别取消排队Task、父Task和Run，含离线child | 不abort无关工作；级联停止派发；未确认执行不提前释放 | U/E/F |
| P4-A17 | stale DAG/Task revision、并发dispatch/complete/amend | CAS拒绝旧修订，幂等不重复创建；更新与完成有单一顺序 | F/E |
| P4-A18 | intent提交前后、Pi注入前后、ACK前后、settled后分别崩溃 | 可区分未接受/可核实/未知结果；未知注入不自动重放 | F/E/U |
| P4-A19 | SQLite写失败/磁盘满/事务回滚 | 不返回已接受、不向Pi注入；失败和清理状态可解释 | F/E |
| P4-A20 | 丢失HTTP响应后同键重试、同键换内容、重复结果提交 | 返回同一实体；异内容拒绝；结果/Task仅一份有效版本 | F/E |
| P4-A21 | Role与真实文件同名、未知显式role、@./path、@role:role | 歧义明确拒绝，可显式消歧；文件不误派发，已识别handoff不落LLM | U/E |
| P4-A22 | 代码块/正文/email/多行任务/仅Role/图片附件 | 仅合法首token路由；空任务拒绝；附件不静默丢失；无部分派发 | U/E |
| P4-A23 | Picker取消、已有草稿、快速切Run、旧autocomplete慢响应 | 草稿保留，未提交不派任务；旧generation不覆盖新选择 | U/E/F |
| P4-A24 | help、root命令补全、角色/Run补全、三个旧alias | 入口一致、参数明确、命令存在性与USAGE对应，不伪装未实现命令 | U/D |
| P4-A25 | Pi dashboard与Go TUI同时查看同一revision并筛选/详情 | 同projection一致；无模型轮、无人工中断，无Herdr adapter亦可用 | U/E |
| P4-A26 | Dashboard乱序/断线/slow consumer/Controller重启 | 显示stale/data age，重取snapshot，不假在线或假accepted | U/E/F |
| P4-A27 | Dashboard预览cancel/promote/recover命令并使目标revision变化 | 预览不写库；显式提交重新校验，有审计，不乐观假成功 | U/E |
| P4-A28 | Team成员通过direct/agent:secondary/旧send入口绕过，另测合法standalone | 前者拒绝，后者按独立权限工作；scope不是调用者自报 | U/E/F |
| P4-A29 | 活动Task时查询status/open dashboard，再普通输入 | 查询不打断；普通输入立即记录manual_interference及上行失败 | U/E |
| P4-A30 | 活动Worker用户发关联handoff，分别在父yield前/父完成后 | intent只在安全边界成为child；父终结后拒绝，不误接管或并发注入 | U/E/F |
| P4-A31 | 模型自动重试、压缩、后置扩展改prompt、很长Role块 | agent_end不冒充settled；最终payload/工具集合有证据，未截断冒充完整 | U/E/R |
| P4-A32 | Leader尝试edit/write/直接claim Worker任务或自由文本完成 | 代码拒绝绕行；合法structured decision仍可执行 | U/E |
| P4-A33 | review候选pending、reject后rework、修改产物/要求后complete | review无需先accepted；后继按边条件；旧review及旧result版本不通过Gate | U/E/R |
| P4-A34 | 取消queued Run，再结束前Run；另测前Run cleanup未完成 | 已取消Run不准入；清理未完成不跳到下一Run | U/E |
| P4-A35 | quarantined/suspended时promote/release；仅改TTL或DB显示状态 | 拒绝；只有可核实执行对账和显式命令才推进 | F/E |
| P4-A36 | deadline、长等待、故障后role_available/child结果迟到 | 时间和原因可见；不推断已停、不自动重执行，不绕恢复门 | U/E/F |
| P4-A37 | 相同文件别名、目录包含、符号链接、嵌套其它Project路径 | 受管写入正确互斥或拒绝越界；不声称任意进程沙箱 | F/E |
| P4-A38 | 退出Pi观察overlay/Go TUI，兼容CLI调用并触发错误参数 | 只退出观察，Controller/Pi继续；错误无Task副作用 | U/E |
| P4-A39 | 固定Pi API probe、重复reload、旧session callback、缺hook版本 | 能力不符fail closed；无重复provider/工具/订阅，无旧回调污染 | F/U/E |
| P4-A40 | 静态检查目录/schema/链接/ID/总数/来源；跑数字夹具三轮主流程 | 89项索引完整，来源区分借鉴/自设计；只有真实证据才能将对应项标PASS | D/U/E/R |

### 2.4 三轮主实验

第一轮单 Team：numbers.txt 三行 10、20、30；count=3、sum=60。两个不同计算 Role 真正并行，reviewer独立审查；另提供sum=50错误候选，验证reject→rework→re-review→Gate。通过运行时间区间而非口头说明证明并行。

第二轮多 Team：两Leader、共享reviewer Primary、额外Secondary；A返工期间B等reviewer但自身researcher推进；A安全结束后B醒来。另以控制性夹具制造跨Team等待环及capacity=1父子续接。

第三轮逐故障窗口：每次只改一个因素，覆盖重复请求、离线、/new、用户介入、cancel、Controller重启、迟到结果和注入未知窗口。新结果关联旧失败，不覆盖记录。

### 2.5 退出门槛

所有89项PASS；前序身份、发现、消息与调用关键回归无退化；来源和版本有记录；实际USAGE与已实现接口一致；所有资源可解释地收尾。BLOCKED/NOT_RUN不得写“基本通过”。静态分析通过、文档合并完成及有测试代码，均不等于运行验收通过。
