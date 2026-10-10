## Purpose

定义任务上下文、工具权限、结果版本和独立业务验收，确保角色文本不能提升权限，执行结束不冒充验收通过，审查和最终完成始终针对当前任务与产物版本。

## ADDED Requirements

### Requirement: TR-08 Role 与上下文装配

系统 SHALL 满足以下行为契约。

`role.md` 保留 name/description frontmatter 和正文格式；稳定 Role 正文按进程读取，修改后显式重启生效。`agents.md` 每个新 Attempt 读取并固定快照；同 Attempt 的 continuation 不偷偷热换规则。Team instructions/config 在 Run 创建时固定，新的 Run 才采用新版本。

逻辑上下文分为：Pi 原生项目规则；Squad 协议；Role；Role working rules；当前 Team 的必要 instructions；Leader roster/Run briefing；当前 TaskContract。不得生成合并版 AGENTS.md 或把 Team 动态事实写回 Role 文件。Leader 获得完整当前 Team briefing，Worker 只拿完成当前任务所需的有界信息。

TaskContract 包含 role、resolved Primary、team/run/task/attempt、segment、任务种类、goal、源/父/root、依赖和不可变 refs、expected_output/acceptance、tool constraints、write_set、相关 config/content hashes。Caller 材料视为任务数据，不提升为权限指令。调用不要求预先加载某个 Squad Skill；目标 Pi 可自行按需加载 Skills。

使用 Pi 原生可组合 prompt sections；每次 continuation 重建当前动态块，结束后清除。既有聊天历史可能保留，不声称跨 Team 历史隔离。最终 provider payload 的有效块/摘要及工具集合需有脱敏证据；whoami 或组装器自己打印的字符串不能单独证明最终请求。后续扩展改写、自动重试、压缩及超长上下文必须测试。

#### Scenario: TR-A30 核对实际模型请求的 Role/Team/Run/Task/Attempt 和 hashes

- **WHEN** 核对实际模型请求的 Role/Team/Run/Task/Attempt 和 hashes
- **THEN** 系统 SHALL 满足：动态块不串任务
- **AND** 验收记录保留 U/E/R 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A05 运行/排队时改 Role/agents.md/Team instructions，随后 continuation及新Run

- **WHEN** 运行/排队时改 Role/agents.md/Team instructions，随后 continuation及新Run
- **THEN** 系统 SHALL 满足：快照边界正确、hash可追溯，不静默热换当前Attempt
- **AND** 验收记录保留 U/E/R 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A31 模型自动重试、压缩、后置扩展改prompt、很长Role块

- **WHEN** 模型自动重试、压缩、后置扩展改prompt、很长Role块
- **THEN** 系统 SHALL 满足：agent_end不冒充settled；最终payload/工具集合有证据，未截断冒充完整
- **AND** 系统 SHALL 满足：手动compact实际abort须manual_compaction且不自动续跑，自动threshold/overflow保持原Attempt；无活动segment的维护不造任务。
- **AND** 验收记录保留 U/E/R 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

### Requirement: TR-11 DAG、结果、审查与最终 Gate

系统 SHALL 满足以下行为契约。

Leader 使用结构化 `squad_decide`（dispatch/wait/complete），Controller 复核版本、依赖、预算和授权；模型不能自行修改 owner、租约或完成状态。自由文本“已交接/已完成”没有执行效力。

执行完成需同 Attempt/segment/binding 的 result_proposed、无错误/中断的 settled、idle/no pending 及结果 schema/refs 校验。`agent_end` 可能发生于自动重试/压缩前，不能单独代表 settled。完成和 acceptance 分开。

依赖边必须声明条件：普通业务后继默认 `acceptance_accepted`；review 消费已正常完成但尚未验收的候选结果，使用 `execution_completed`；rework 消费审查拒绝记录。否则“先验收才允许审查”会自锁。中断/失败绝不满足任何成功依赖。

独立 review Task 审查具体 result revision + artifact hashes。reviewer 的稳定 agent_id SHALL 与被审产物的执行 Agent 不同，换 session/runtime 不构成独立审查；Workflow 校验拒绝 review 与被审步骤使用相同 role_ref，实际派发仍复核 resolved Agent 与结果版本。拒绝后创建可追踪的新 rework/re-review 节点，不能把 DAG 改成环或覆盖失败历史。产物或任务要求变化使旧审查失效；重新检查当前版本。

最终 complete 在事务中验证：当前必要任务/结果/依赖、required review、无有效 blocker、无未处理故障、无活动或未知执行，且审查版本一致。终结、资源释放和通知必须满足安全条件。取消的过期 Task blocker 不应永久阻挡已修订的 DAG。


**用户确认（2026-09-27）**：业务 Task 按不可变 `acceptance_policy` 验收：预先声明且可用的确定性 checker 优先，否则由独立 reviewer；standalone 无 checker/reviewer 时由 Project 操作者显式验收。只满足结果 schema 不等于业务通过，执行 Agent 不得自行将业务结果置 accepted。Team 须在 policy 中声明 reviewer Role 或 checker，缺少可解析策略时拒绝接受业务 Task，并显示 ACCEPTANCE_POLICY_MISSING；普通 `@role` 继承 Run 的已固定策略，不临时猜审查者。

policy SHALL 固定 mode（checker/review/human/parent）、checker_ref 或 reviewer_ref（按模式）、child_policy（inherit_parent/separate）及需验收的业务结果集合；运行时先将自动选择解析为具体模式并记录版本。checker 只能引用预先注册的确定性检查器，不能由模型上传任意 shell 命令。Controller 在 checker 验证、独立 review 正常完成或用户 `/squad accept task:<id>` / `reject task:<id>` 明确提交后，依据精确 goal/result/artifact revision 记录 Acceptance。拒绝须保留原因和证据，旧修订验收不能覆盖新产物。

子业务结果默认可由父结果的最终验收覆盖，policy 可要求 separate review。覆盖 SHALL 记录 `covered_by` 父结果版本及被消费的 child result/artifact hashes；只有父结果当前 accepted、引用匹配且无未处理故障时才满足该 child 的验收义务。父被拒绝、产物/需求/child 版本变化时覆盖立即失效。它不要求 child 先 accepted 才恢复父执行。review Task 的正常结构化结论就是对候选结果的验收证据；review、leader_step 和 response-only 控制片段不再递归要求另一个 reviewer，但仍必须符合执行完成、错误、绑定及 cleanup 条件。最终 Gate 按 policy 中的必要业务集合和版本覆盖判断，不能对全部控制节点机械套用 acceptance_accepted。

#### Scenario: TR-A18 同 Run review/rework

- **WHEN** 同 Run review/rework
- **THEN** 系统 SHALL 满足：复用 ownership，仍独立 lease 和最终 Gate
- **AND** 验收记录保留 U/E/R 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A22 提供确定性错误结果

- **WHEN** 提供确定性错误结果
- **THEN** 系统 SHALL 满足：review 拒绝，返工、复审通过，失败历史保留
- **AND** 验收记录保留 U/E/R 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A23 未完成依赖/review/隔离/blocker 时 complete

- **WHEN** 未完成依赖/review/隔离/blocker 时 complete
- **THEN** 系统 SHALL 满足：Controller 拒绝
- **AND** 验收记录保留 E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: TR-A32 review 后改变候选产物

- **WHEN** review 后改变候选产物
- **THEN** 系统 SHALL 满足：旧 review 失效，当前版本需重审
- **AND** 系统 SHALL 满足：补查同稳定Agent换session仍不能自审，父验收覆盖随child或goal版本变化失效。
- **AND** 验收记录保留 U/E/R 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A17 stale DAG/Task revision、并发dispatch/complete/amend

- **WHEN** stale DAG/Task revision、并发dispatch/complete/amend
- **THEN** 系统 SHALL 满足：CAS拒绝旧修订，幂等不重复创建；更新与完成有单一顺序
- **AND** 系统 SHALL 满足：补查amend受理与应用revision、safe segment续接以及完成竞争；pending amend时旧结果不满足新要求。
- **AND** 验收记录保留 F/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A33 review候选pending、reject后rework、修改产物/要求后complete

- **WHEN** review候选pending、reject后rework、修改产物/要求后complete
- **THEN** 系统 SHALL 满足：review无需先accepted；后继按边条件；旧review及旧result版本不通过Gate
- **AND** 系统 SHALL 满足：补查checker/reviewer/human/parent策略、错真值拒绝、父子execution_completed与review不递归验收；无策略不接受业务Task。
- **AND** 验收记录保留 U/E/R 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

### Requirement: TR-17 权限、输出和异常说明

系统 SHALL 满足以下行为契约。

预授权的小队自动协作，不为每个普通 Task 增加确认弹窗；但显式恢复/换人/重试按用户操作入口执行。Role、Team、调用方、目标 runtime 的允许工具/路径取交集，Markdown 不能提升权限。Leader 不拥有普通实施权限。read_only 必须由 tool gate 实施，不能只写进 prompt。

UI/API 错误至少分为输入错误、身份/版本错误、可等待资源错误、故障待恢复、业务拒绝。保留既有 TEAM_LEADER_ALREADY_ACTIVE、ROLE_NOT_PRIMARY、ROLE_NOT_SCHEDULABLE、ROLE_PRIMARY_OFFLINE、ROLE_BUSY、ROLE_QUARANTINED、AGENT_BUSY、CAPACITY_UNAVAILABLE、WRITE_CONFLICT。增加 NO_ACTIVE_TEAM_CONTEXT、ROLE_NOT_IN_TEAM、EMPTY_HANDOFF_TASK、MULTI_TARGET_NOT_SUPPORTED、INVALID_HANDOFF_SYNTAX、TARGET_AMBIGUOUS、REVISION_CONFLICT、REQUEST_ID_CONFLICT、ACTIVE_TASK_SCOPE_CONFLICT、RESOURCE_DEPENDENCY_CONFLICT、UNSUPPORTED_HANDOFF_ATTACHMENT、CAPABILITY_UNAVAILABLE。并入原阶段 03 的 AGENT_OFFLINE、CALL_CYCLE、DEPTH_LIMIT、RESULT_MISSING。

accepted/queued/waiting/rejected 必须附 request/task/run/role/Primary 和下一步原因；开始执行后补 attempt/segment。敏感凭据不进日志、Dashboard、artifact 或结果导出。


**用户确认（2026-09-27）**：本机 Project 操作者作为各 Team 的管理员，管理写操作使用独立 operator 凭据；模型 runtime 凭据不能用于管理。身份分为 `user_command@binding`、`model_tool@attempt`、`adapter_lifecycle@binding`、`local_operator@cli`；origin 由受信适配代码路径与服务端凭据类别验证，不接受模型自报字段提权。operator 是动作主体，不新增 Pi mode。

cancel、recover、retry、rebind、release、promote、resume、人工 reconcile 和人工验收只允许显式用户命令或本地 operator CLI。Project 管理员可跨 Team 管理，但每次都必须展示精确目标、expected_revision/旧绑定并审计；选 Run 不授予管理权。模型只在服务端认证的当前任务 scope 内 decide/invoke/yield/complete/ask，空闲模型发起 root direct 或 create-run 须具备预先声明的独立调用授权，不能把管理权限继承给模型。生命周期证据只允许绑定匹配的 adapter。

operator 凭据 SHALL 保存在 Project `.runtime` 的私有文件中（目录 0700、文件 0600），不进入 discovery、prompt、模型工具参数、日志、artifact、Git 或 Dashboard。受管模型读写工具均须拒绝凭据/控制文件；管理 handler 使用独立客户端路径，CLI 不伪造 Pi runtime binding。令牌轮换/撤销后旧管理令牌失效。这是同用户本机协作控制面，不承诺抵御拥有同 OS 用户权限的任意恶意进程。

#### Scenario: P4-A32 Leader尝试edit/write/直接claim Worker任务或自由文本完成；Worker只说“完成了”不提交结果，或仅触发agent_end

- **WHEN** Leader尝试edit/write/直接claim Worker任务或自由文本完成；Worker只说“完成了”不提交结果，或仅触发agent_end
- **THEN** 系统 SHALL 满足：代码拒绝绕行；合法structured decision仍可执行；Worker不标completed，显示RESULT_MISSING或继续等settled
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

