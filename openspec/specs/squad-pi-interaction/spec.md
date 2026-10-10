# squad-pi-interaction Specification

## Purpose

定义 Pi 中的团队命令、角色交接、补全和上下文选择行为，使用户能通过明确输入创建与跟踪正式任务，同时保留原生文件输入、草稿和普通手工对话的正确语义。

## Requirements

### Requirement: TR-12 Pi mention、Picker 与输入分类

系统 SHALL 满足以下行为契约。

主交互为行首单目标 `@<role_id> <task>`。`/pisquad-use` 使用当前 Team Role projection 打开 Picker，选择后填入 `@role `，保留已有任务草稿，不自动提交、不建立 persistent target mode；取消 Picker 不改草稿。

只读 Team roster Role projection 生成候选，至少展示 Role、Primary、availability/owner；Secondary 不作为可执行候选。autocomplete 是原 provider 的 wrapper，原 `@README.md`、`@src/foo.ts` 保留。缓存带 Project/Run/config/generation/revision；旧异步结果不得覆盖新 Run，提交时重新校验。

精确定义解析：仅用户 interactive 输入的首个 token 可路由；正文、引用块、代码、邮件及 Assistant 文本不触发执行。连续多个执行目标前缀拒绝 `MULTI_TARGET_NOT_SUPPORTED`，不得部分派发。Role 与真实同名文件冲突时拒绝猜测，显示 `TARGET_AMBIGUOUS`；显式 `@role:reviewer` 或 `/squad call role:reviewer ...` 选择 Role，`@./reviewer` 选择文件。无匹配 Role 的普通文件 token 交回 Pi；显式 role target 错误则 handled，不落到当前 LLM。

已启用扩展但无有效 Team/Run 的显式 handoff 返回 `NO_ACTIVE_TEAM_CONTEXT`；未启用 Squad 的普通 Pi 仍按 TR-01 no-op。拒绝、服务断线或提交结果不明后都不能把已识别 handoff 当普通本地任务执行。保留文本/显式 refs；V1 不支持的图片/附件在提交前明确拒绝，不能静默丢弃。

Squad 的已注册命令 handler、普通 input 和原生会话/user_bash 生命周期 SHALL 汇入同一操作分类，不能假定所有用户操作经过 input hook。内部任务注入 SHALL 保持 source=extension 且 expandPromptTemplates=false，TaskContract 的 / 前缀只是数据，不是可执行命令。

只有角色和目标文本时使用明确的只读默认 TaskContract；写入需通过命令参数或任务表单声明 write_set，并受预设权限上限约束。自然语言“修改文件”不是自动提高工具权限的依据。


活动 Worker Attempt（含 suspended）中的关联交接 SHALL 使用 `/squad call role:<id> --parent current -- <goal>`，由服务端核对当前 source task/attempt/revision。plain `@role` 或未指定 parent 的 call 在此情形返回 ACTIVE_TASK_SCOPE_CONFLICT 并 handled，提示显式关联，不创建 Run 级独立 Task，不误判为 takeover。无活动 Attempt 时原 Run handoff 语义不变；模型使用结构化 invoke。

#### Scenario: CMD-A01 当前 Run 输入 @

- **WHEN** 当前 Run 输入 @
- **THEN** 系统 SHALL 满足：出现 roster Role/Primary/state，不列 Secondary capacity
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: CMD-A02 输入 @README.md 和 @src/foo.ts

- **WHEN** 输入 @README.md 和 @src/foo.ts
- **THEN** 系统 SHALL 满足：无 Role 冲突时原文件补全保留
- **AND** 验收记录保留 U 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: CMD-A03 /pisquad-use 选择 reviewer

- **WHEN** /pisquad-use 选择 reviewer
- **THEN** 系统 SHALL 满足：编辑器填 @reviewer，不再手输 Role，与 mention 共用 handler
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: CMD-A04 显式 handoff

- **WHEN** 显式 handoff
- **THEN** 系统 SHALL 满足：输入 handled，当前 LLM 不自己执行，成功或拒绝均可追踪
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: CMD-A13 显式启用 Squad 的 standalone Pi 无 Run 时提交 role handoff

- **WHEN** 显式启用 Squad 的 standalone Pi 无 Run 时提交 role handoff
- **THEN** 系统 SHALL 满足：报无上下文，不隐式创建 Run或回落 LLM
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: CMD-A14 连续 @reviewer @backend 执行前缀

- **WHEN** 连续 @reviewer @backend 执行前缀
- **THEN** 系统 SHALL 满足：拒绝多目标，无部分 Task
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: CMD-A15 补全后当前 Run 终结且 Role 被另一 Run 准入占用

- **WHEN** 补全后当前 Run 终结且 Role 被另一 Run 准入占用
- **THEN** 系统 SHALL 满足：提交时重新裁决（Run 失效或 ROLE_BUSY），不信旧缓存
- **AND** 验收记录保留 U/E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A21 Role与真实文件同名、未知显式role、@./path、@role:role

- **WHEN** Role与真实文件同名、未知显式role、@./path、@role:role
- **THEN** 系统 SHALL 满足：歧义明确拒绝，可显式消歧；文件不误派发，已识别handoff不落LLM
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A22 代码块/正文/email/多行任务/仅Role/图片附件

- **WHEN** 代码块/正文/email/多行任务/仅Role/图片附件
- **THEN** 系统 SHALL 满足：仅合法首token路由；空任务拒绝；附件不静默丢失；无部分派发
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A23 Picker取消、已有草稿、快速切Run、旧autocomplete慢响应

- **WHEN** Picker取消、已有草稿、快速切Run、旧autocomplete慢响应
- **THEN** 系统 SHALL 满足：草稿保留，未提交不派任务；旧generation不覆盖新选择
- **AND** 验收记录保留 U/E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

### Requirement: TR-13 命令、Run 创建与上下文绑定

系统 SHALL 满足以下行为契约。

系统 SHALL 提供以下接口。统一 root command 为 `/squad`；现有 `/squad-whoami`、`/squad-inbox`、`/squad-transport` 保留兼容 alias，`/pisquad-use` 保留为 Picker 入口。参数使用 Pi registerCommand 的补全能力，候选来自同一 Controller projection，不能靠模型猜 ID。

| 命令 | 语义 |
|---|---|
| `/squad help`、`whoami`、`agents`、`roles`、`teams` | 发现能力、身份、列表；无模型副作用 |
| `/squad run <team_id> <goal>` | 显式创建 Run，返回 run_id 与 active/queued；queued 附 waiting_roles 或前序 Run；不 spawn Leader |
| `/squad use-run <run_id>` | 选择观察及 handoff 上下文，可选 queued Run；不改变 Leader 身份、权限或 Role ownership |
| `/pisquad-use` | 选 Role、填编辑器；无隐式 Run 创建 |
| `/squad call role:<id> [--write <path>] -- <goal>` | 当前 Run 正式 handoff；与 @role 同一路由 |
| `/squad call agent:<id> -- <goal>` | 仅合格 standalone direct 调用，受 TR-07 限制 |
| `/squad ask role:<id> <question>`、`send <target> <text>` | 前者受管受限问答，后者仅 notice |
| `/squad status [run_id]`、`task <task_id>`、`dashboard [view]` | 状态、详情、Pi 原生观察交互 |
| `/squad cancel task:<id>`、`cancel run:<id>` | 显式取消，返回 cancel_requested 及实际停止状态；取消 active Run 即释放 active 状态，安全收尾后整体释放 Role |
| `/squad amend <task_id> <text>`、`takeover` | 关联补充和手动接管是不同操作 |
| `/squad recover <task_id> --attach-evidence <ref>` | 关联已发生的可核实结果，不执行 |
| `/squad retry <task_id> --rebind-current` | 明示旧/新绑定和风险，用户提交后产生新 Attempt |
| `/squad role release <role_id>`、`role promote <role_id> <agent_id>` | 显式管理，必须先通过执行对账和 epoch CAS |
| `/squad rebind task:<id> --rebind-current` | 仅从未有 Attempt 的 accepted Task 显式换绑定；曾执行任务用 retry |
| `/squad accept task:<id>`、`reject task:<id>` | operator 对固定结果版本显式验收，附 revision 和证据；执行者不能自验 |
| `/squad resume run:<id>` | 显式对账后解除对应 Run 的 recovery hold，不重放未知输入 |
| `/squad reconcile attempt:<id> --confirm-stopped --note <原因> [--evidence <ref>]` | 用户停止声明及审计，处理旧进程无法回报的 cleanup |
| `/squad leader release <team_id> --expected-runtime <id>` | 对账后撤销 Leader binding，保留历史 |
| `/squad inbox`、`transport` | 兼容现有只读消息/传输诊断 |

创建请求要求目标 Team 合法、Leader 在线及调用授权有效；Leader 离线直接拒绝，不留下待其上线自动执行的新请求。Leader 绑定 active Run；operator 可显式选 Run，不能由其全部成员关系推断当前 Run。对 queued Run 的 handoff 记录为等待 Run 准入的 Task，不创建 Attempt，准入后按正常派发规则执行。Worker 的正式命令使用 Controller 赋予的当前 Attempt/Run，上下文冲突则拒绝；不能用 use-run 把正在执行的任务换队。

普通自然语言在 Leader 空闲且没有 active Run 时，可以通过明确的 create-run Tool 创建请求；活动 Run 中必须关联该 Run，不能既当新 Run 又当补充。创建 Run 与给已有 Run handoff 是两种独立请求及幂等键。

选 Run 不授予新权限。`/new`、Run 终结、绑定变化清除过期 UI context；对旧 Run 的恢复须显式操作。接受任务时记录目标 expected Primary/runtime/session/epoch，之后排队遇到绑定改变不能自动搬到新会话。

#### Scenario: CMD-A07 当前 Run 因 roster 与他队 active Run 相交而 queued 时 @role

- **WHEN** 当前 Run 因 roster 与他队 active Run 相交而 queued 时 @role
- **THEN** 系统 SHALL 满足：Task 记为等待 Run 准入，不创建目标 Attempt 或绕过 Gate
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: CMD-A08 working_here 再派发

- **WHEN** working_here 再派发
- **THEN** 系统 SHALL 满足：复用 ownership，但仍遵守 Agent/capacity
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: CMD-A16 执行正式 handoff 并查询关联记录

- **WHEN** 执行正式 handoff 并查询关联记录
- **THEN** 系统 SHALL 满足：关联 source input、request、team/run/role/Primary、Task、执行后的Attempt、revision和事件
- **AND** 验收记录保留 U/E/R 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A09 use-run后终结Run或/new，再提交旧草稿

- **WHEN** use-run后终结Run或/new，再提交旧草稿
- **THEN** 系统 SHALL 满足：上下文失效可见，提交拒绝，不换队/复活旧Run
- **AND** 系统 SHALL 满足：补查planned依赖就绪时才accept并冻结binding，hold不转换；accepted且从未有Attempt者显式rebind不建Attempt。
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A24 help、root命令补全、角色/Run补全、三个旧alias

- **WHEN** help、root命令补全、角色/Run补全、三个旧alias
- **THEN** 系统 SHALL 满足：入口一致、参数明确、命令存在性与USAGE对应，不伪装未实现命令
- **AND** 系统 SHALL 满足：补查resume/reconcile/rebind/leader release/accept/reject及operator凭据操作说明。
- **AND** 验收记录保留 U/D 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

