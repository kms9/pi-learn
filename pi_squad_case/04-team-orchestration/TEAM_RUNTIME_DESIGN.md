---
title: 阶段 04｜统一技术设计、冲突裁决与实施顺序
type: process
status: draft
created: 2026-09-25
updated: 2026-09-27
decision_status: consolidated
implementation_status: not_implemented
acceptance_status: not_run
review_baseline: cdae80379685ff5c79621117712ce9f53ddefe1c
baseline_pi_commit: 890f920884f6d21fc7617d236ef9e1cc5d7a0ef8
tags: [pi-squad, phase-04, design, implementation, sources]
---

# 阶段 04｜统一技术设计

唯一需求及89个用例见 [TEAM_RUNTIME_REQUIREMENTS.md](TEAM_RUNTIME_REQUIREMENTS.md)。本文不声明产品已实现；代码片段、API及目录树除明确标为现有源码外，均是待实现契约。

## C. 冲突检查与收口

“冲突”分为硬冲突、未定义语义、交叉阶段边界和文档漂移，不把所有问题都说成代码缺陷。以下依据整合前固定快照的五份文档、阶段03、当前扩展及仓库决策核查。四个既有调度约束不变。下表是本轮实施裁决；FIFO等新默认不是此前用户已经逐项确认的事实。

| ID | 原位置与问题 | 类型 | 本轮统一规则与检查 |
|---|---|---|---|
| C01 | README未列TUI稿；TUI仍proposed；历史PLAN仍含不同模型 | 文档漂移 | 需求+技术设计双文件权威，README仅导航；旧稿从当前目录移除，保留Git历史；P4-A40 |
| C02 | PLAN的.agents/roles、role.json与现有role.md及新.agents/pisquad混用；Team具体文件未固定 | 硬冲突/缺口 | 唯一布局roles/{role.md,agents.md}、teams/{team.json,instructions.md,workflows}；显式迁移，不双轨自动扫描；P4-A01/A04/A06 |
| C03 | DESIGN允许previous runtime offline后重绑；身份规范要求失租不释放 | 硬冲突 | offline只表示不可联系；连续性恢复或显式释放，对账后重绑；TR-A16、P4-A07 |
| C04 | 阶段03等待保留任务归属；P4称yield释放Agent槽，易被解释为可接无关任务 | 硬冲突 | AgentTaskReservation保留，ExecutionLease按segment释放/重取；同一Attempt续接，capacity=1也能跑child；P4-A13 |
| C05 | 一个Run的waiting_role/blocked_on_role_id与“不冻结无关Role”矛盾 | 硬冲突 | Task级blockers[]，Run状态为聚合；只在无可推进分支时展示waiting_role；TR-A24、P4-A10 |
| C06 | lazy acquire + Run级持有可能形成跨Team互等 | 活性缺口 | 统一WaitGraph，识别环→needs_review→用户显式打破，不抢占或自动换人；TR-A26、P4-A14 |
| C07 | @role要求已有Run，但缺创建/选择入口；同Team第二Run未裁决 | 流程缺口 | /squad run明确创建，use-run选择；FIFO单active，队列不拿资源；TR-A33、P4-A08/A09/A34 |
| C08 | “不是roster role就handled报错”与“原生@file fallback”可能互相吞输入 | 解析冲突 | 首token精确分类；显式role才保证handled；同名文件拒绝歧义；@role:与@./消歧；P4-A21/A22 |
| C09 | 普通Pi完全no-op与CMD-A13无Team必须报错 | 适用范围冲突 | 后者仅针对显式启用Squad的Pi；禁用扩展不接管@；P4-A03、CMD-A13 |
| C10 | messaging.ts先将非extension输入置userPending；任务handoff也可能被当manual_interference | 实现/语义冲突 | 一个InputClassifier先分类；只读/关联handoff/普通接管分支隔离；active handoff等安全yield；P4-A29/A30/A39 |
| C11 | @role、模型输出mention、delegate_task、squad_decide容易各自建执行逻辑 | 架构冲突风险 | 人类输入适配，Agent用结构化工具；全部进入一个Task Router；CMD-A04/A10 |
| C12 | 现有ask只许get_message/reply_message，却被建议用于修改代码 | 硬冲突 | Messaging与Formal Task分开；Team ask可有受限Task，实施Task使用正式工具契约；CMD-A09 |
| C13 | 现有单squad_id授权与多Team；agent:secondary/direct可能绕过Primary | 硬冲突 | 显式Team/Run上下文、服务端裁决scope；历史授权不删除；P4-A06/A28 |
| C14 | Dashboard只读、要求Pi内交互、阶段05才有完整TUI三者不清 | 范围缺口 | P4交付Go视图+薄Pi视图；只读数据与显式命令预览分开；P5仅新增Herdr位置/focus；P4-A25—A27/A38 |
| C15 | role按进程缓存、agents.md按Attempt热读、每轮动态Team信息混在一个字符串 | 生命周期缺口 | 稳定Role进程快照、工作规则Attempt快照、Team Run快照、动态briefing按segment；P4-A05/A31 |
| C16 | completed/accepted混用会让review等待自身通过；旧review覆盖新artifact | 完成语义缺口 | 依赖有execution_completed/acceptance_accepted条件；review绑定result/task/artifact版本；TR-A32、P4-A33 |
| C17 | failed/cancelled/TTL就释放，与“Pi可能仍在执行”冲突 | 硬冲突 | 逻辑终止与cleanup完成分开；对账后释放，cancel有子树跟踪；P4-A16/A35/A36 |
| C18 | 老阶段文档四字节framing与当前HTTP+SSE实现并存 | 迁移冲突 | P4沿用HTTP/JSON，SSE只通知；无第二broker，wire版本握手和显式迁移；P4-A02/A06 |
| C19 | 当前消息用agent_end处理收尾，而正式任务要求settled | 复用风险 | 正式任务须result_proposed+真正settled及本地gate，自动重试/压缩不能算完成；P4-A31 |
| C20 | 全局104项漏CMD16；PR#3上下文设计尚未合并；既有部分测试被写成全NOT_RUN | 文档漂移 | P4为33+16+40=89，总索引160；不重置既有结果，不自动合并PR；来源和验证层级明确；P4-A40 |

C04还影响写资源：父任务持有写锁时调用写同文件child会自锁。V1直接拒绝这种child admission，不把文件交接隐含在yield中。C08不采用模糊命中：补全可以模糊搜索，执行目标必须精确解析。

<a id="d01"></a>
## D01. 架构与代码组织

```text
Human command / @role / Pi dashboard
                 |                Agent structured tools
                 +------------------------+
                                          v
                              TypeScript Pi Adapter
                         parse / context / local work gate
                                          |
                                    HTTP / JSON
                                          v
Go Controller: Identity -> Run/Task Router -> Scheduler -> SQLite + Outbox
                   |              |              |
                   +------ shared Projection -----+
                                  |
                       Go TUI / Pi native view
```

Go继续使用当前 `pi_squad/controller/AGENTS.md` 规定的 Go 1.27.0、Gin、Resty v2、Viper、Cobra、Charm v1和modernc SQLite。本轮不升级依赖。服务端是唯一数据库写者；观察客户端不打开数据库。不能将控制面框架搬入TS，不修改任何上游submodule。

```text
pi_squad/
├── controller/
│   ├── cmd/controller/             # 沿用唯一二进制入口
│   ├── cli/                        # serve、doctor、agents、team/run/task/role命令、tui
│   ├── agent/                      # 保留Registry/ownership，不在HTTP handler写业务
│   ├── project/                    # discovery、lock、migration、config snapshot
│   ├── task/                       # Task、Attempt、Result、依赖和验收
│   ├── scheduler/                  # primary、role ownership、leases、wait graph
│   ├── recovery/                   # fencing、cancel、reconcile、retry
│   ├── projection/                 # Team/Role/Agent/Run/Task统一读模型
│   └── httpapi/                    # 薄适配；事务在服务层
└── extension/
    ├── index.ts                    # 只装配
    ├── team-roster.ts              # 同一projection缓存/失效
    ├── mention-autocomplete.ts     # wrapper、原provider fallback
    ├── handoff-input.ts            # InputClassifier、显式handoff
    ├── squad-commands.ts           # root命令、Picker、兼容alias
    ├── invocation.ts               # HTTP正式任务client和回调
    ├── execution-gate.ts           # Pi工作片段、工具限制、settled
    ├── context-assembly.ts         # 可组合sections、快照、动态块
    ├── dashboard.ts                # 薄Pi原生只读交互
    └── messaging.ts                # 保留消息语义，接入统一work gate
```

职责边界为MUST；允许进一步拆内部文件，不要求空壳文件充数。独立Go TUI保持主控制面视图；Pi view仅复用同一读模型和原生UI，不把Go TUI嵌进Pi、不开Web、不重新实现完整编辑器。来源：S0/S1/S8。

<a id="d02"></a>
## D02. 配置、发现与迁移契约

### D02.1 Role文件

`role.md` 必填frontmatter仅name、description，目录名等于name；正文非空，UTF-8，单文件上限沿用64KiB。ID为小写ASCII字母起始，其后字母/数字/连字符，不能包含路径分隔符、点或空格。`agents.md`为普通Markdown，可为空；它不是Pi原生AGENTS.md，不被另一个通用发现器自动加载。

```markdown
---
name: reviewer
description: 独立审查当前任务产物和并发行为。
---
# 职责
依据任务契约和证据审查，不代替实施者宣告成功。
```

role.md按进程固定；agents.md按新Attempt固定。续接继续使用原Attempt内容与hash，而不是读磁盘新值。所有定义只读；任务、收据、位置、Primary身份不写回Role目录。

### D02.2 Team与Workflow

team.json示例（实验配置；字段和默认值为本项目契约）：

```json
{
  "schema_version": 1,
  "team_id": "stats-team",
  "config_version": 1,
  "leader": {"agent_ref": "stats-lead"},
  "members": [
    {"role_ref": "counter", "responsibility": "计算count"},
    {"role_ref": "summer", "responsibility": "计算sum"},
    {"role_ref": "reviewer", "responsibility": "独立验收"}
  ],
  "instructions_file": "instructions.md",
  "default_workflow": "stats",
  "policy": {
    "run_admission": "fifo_single_active",
    "max_parallel_tasks": 2,
    "max_delegate_depth": 3,
    "max_total_tasks": 20,
    "max_attempts_per_task": 3,
    "allowed_tools": ["read", "grep", "find", "ls"],
    "writable_roots": []
  }
}
```

除default_workflow外以上字段必填；instructions_file固定为同目录instructions.md。members非空、role_ref唯一并存在；leader不是普通成员的隐式替身。未知schema字段拒绝，避免拼写错后默默丢约束。ID/version校验、引用realpath、完整配置hash完成后一次发布ConfigSnapshot，不部分激活。相同config_version不同内容报CONFIG_VERSION_CONFLICT；新Run引用新快照，老Run保留旧内容。用户需要写入时在预设允许范围中配置write/edit，并为每个Task显式声明write_set；不因@文本推断开放bash。

workflows/stats.json最小结构：

```json
{
  "schema_version": 1,
  "workflow_id": "stats",
  "steps": [
    {"id": "count", "role_ref": "counter", "kind": "execute", "goal": "读取numbers.txt计算count", "depends_on": []},
    {"id": "sum", "role_ref": "summer", "kind": "execute", "goal": "读取numbers.txt计算sum", "depends_on": []},
    {"id": "review", "role_ref": "reviewer", "kind": "review", "goal": "检查count和sum", "depends_on": [
      {"step": "count", "condition": "execution_completed"},
      {"step": "sum", "condition": "execution_completed"}
    ]}
  ]
}
```

steps ID唯一、role在roster中，边目标必须存在；拓扑排序拒环。refs、expected_output、acceptance、write_set可按Task schema补充；模板中的源结果引用由Controller解析成不可变ResultRef，不直接把字符串当文件内容。Workflow不自行执行。review节点可以消费pending acceptance的已完成候选，避免验收循环依赖。

### D02.3 启动和Project发现

目标启动环境：`PI_SQUAD_MODE=leader|role`、`PI_SQUAD_AGENT_ID`；leader另需`PI_SQUAD_TEAM_ID`，role另需`PI_SQUAD_ROLE_ID`。mode在进程生命期固定；不凭cwd名称推断身份。未选择身份完全no-op。旧PI_SQUAD_ID为迁移输入，不作为P4唯一授权。

Controller从显式project_root或cwd发现最近根，对根做realpath。进程锁是单实例依据，PID及controller.json仅作发现/诊断。监听成功后写临时文件再rename：

```json
{
  "schema_version": 1,
  "protocol_version": "pi-squad/2",
  "controller_id": "ctl-example",
  "controller_epoch": 1,
  "project_root": "/absolute/canonical/project",
  "endpoint": "http://127.0.0.1:49371",
  "pid": 12345
}
```

`pi-squad/2`表示本次Team/Run授权及绑定语义的wire升级；与“V1调度策略”“schema_version=1”不是一个版本维度。客户端验证health中的project/protocol/controller，不能仅HTTP200即接受；未知协议fail closed。显式URL override也必须做同样验证。

迁移先dry-run输出旧路径/新路径、未能唯一映射的Role和旧squad成员；需要人工决策的映射拒绝自动猜测。正式迁移停止旧写者，备份SQLite及WAL一致性快照，验证schema和数据，原子切换发现信息。失败保留旧库可回退。旧messages、owners、撤销记录及授权快照保留；不把历史online直接恢复为online。新协议不与旧调度客户端混跑。不要在本轮文档提交中提前移动真实配置。

来源：S0/S7/S8。

<a id="d03"></a>
## D03. 数据模型与持久不变量

所有key均位于Project scope。JSON/API用run_id；数据库字段名可沿用旧名，但边界只做一次显式映射。

| 实体 | 核心字段/约束 |
|---|---|
| AgentInstance | agent_id、mode、role_id、runtime_id、session_id、binding_epoch、connection_epoch、presence、activity |
| TeamLeaderBinding | team_id唯一；leader_agent_id、runtime/session、epoch、ownership状态；offline不删 |
| RolePrimaryBinding | role_id唯一；primary_agent_id、binding_epoch、资格状态 |
| ConfigSnapshot | kind/id/version/hash/content，创建后不可变 |
| TeamRun | run_id、team_id、source binding、config snapshot、queue_seq、admitted、phase、revision、cleanup_state |
| TeamRoleMembership | team_id+config_version+role_id唯一，职责；无普通worker agent_ref |
| Task | task_id、run_id、role_id、kind、goal_revision、state、parent/root、expected_target、write_set、revision |
| TaskDependency | parent/child或前后继、condition、revision；责任树与执行依赖图分别保存 |
| TaskAttempt | attempt_id、task_id、attempt_no、retry_of、immutable context、state、result_revision |
| AgentTaskReservation | agent_id唯一非终态归属；attempt_id；yield时保留 |
| ExecutionLease | lease_id、attempt_id、segment_id、agent/runtime/session、controller/primary/binding epochs、fencing_token、expires_at |
| RoleActionOwnership | role_id唯一owner；team/run/Primary、revision、acquired_at；Run级持有 |
| WriteReservation | canonical资源/包含关系、attempt/lease关联、state、fencing；历史另存 |
| WaitEdge | waiting task/attempt、resource、owner、reason、since、相关revision；多条集合 |
| Result / Review | immutable result revision、artifact refs/hashes、goal revision、reviewer/attempt、decision |
| IdempotencyRecord | project+source+operation+request_id唯一；payload_hash、实体引用 |
| Event / Outbox | project event_seq、event_id、type、server_time、entity/revision、delivery cursor |
| RecoveryAction | 操作者、动作、旧/新绑定、evidence refs、result；不覆盖原失败 |

必须由事务/唯一索引及服务层共同保证：一个Team有效Leader；一个Role有效Primary/owner；一个Agent非终态Attempt；同Pi无两个实际segment；同Team最多一个admitted且未安全cleanup的Run。不能把team_id加到Agent资源key绕过全Project互斥。

ExecutionLease不证明任意外部进程已停止；fencing只约束受控API/tool gate。Role ownership在lease丢失时保持隔离，直到有证据清理。SQLite更新、event与outbox同事务提交；读取投影用一致snapshot/revision，不靠最终拼接多次查询凑一张“同版本”表。

来源：S0/S2/S3/S7/S8；上述组合模型为Pi Squad设计。

<a id="d04"></a>
## D04. Run、Task admission与事务边界

### D04.1 创建Run

认证调用者→校验Team、当前Leader在线、权限和配置版本→以request_id去重→创建带快照Run。Team已有admitted Run则queued_run；否则原子admit并持久化leader_step通知。queued Run不拿Role/Agent/write资源。Leader离线的新请求直接拒绝，不挂“上线自动开始”的隐式队列。

从控制面恢复queued Run不是故障自动重跑：正常前Run安全结束时按queue_seq推进；经历Controller故障的队列先保持recovery hold，经显式确认恢复调度。取消queued Run只改其请求/队列状态。

### D04.2 接受handoff与真正执行分离

1. 接受层验证source、Run/Task revisions、roster、Primary资格及目标在线状态，保存Task、冻结expected Primary/runtime/session/epoch，返回task_id。
2. 资源busy时Task处于queued/blocked，记录所有blockers，不产生Attempt；Role被其它Run占用时返回ROLE_BUSY及waiting_role信息。
3. 真正派发时再次原子检查。示意，不是可直接运行的SQL：

```text
BEGIN IMMEDIATE
  validate idempotency/source/run/task revision and dependency conditions
  validate run admitted, not recovery-held, not cancelling
  resolve Primary; compare expected target snapshot
  validate Role owner is absent or this exact team/run
  validate Agent has no conflicting affinity/quarantine
  validate target online/current binding
  validate execution capacity and canonical write_set
  CAS task queued/ready -> dispatching
  acquire first RoleActionOwnership when absent
  create Attempt + AgentTaskReservation + segment lease + write reservations
  persist dispatch_intent and outbox event
COMMIT
then notify adapter
```

同Run已有ownership不会因另一Task排队被释放；首次获取则与本次全部许可共成败。SQLite busy/IO/disk-full应明确rollback，禁止先发Pi再保存结果。持续模型执行不持数据库事务。

目标在排队期间/new或promote：不能自动把已接受Task换到新session/Primary；进入binding_changed/needs_review，显式retry/rebind。补全到提交之间的变化则由提交时校验决定，UI不会替代CAS。

### D04.3 Pi二次gate

TS收到dispatch，验证完整绑定与generation，检查本地affinity、当前ask/正式segment、isIdle和pending；准备好输入后，最后检查与调用Pi输入API之间无异步间隙。失败返回deferred/binding_error，不能steer抢占。dispatch_intent、adapter_received、input_observed分开保存。received不等于执行开始。

同一个dispatch/segment重复到达只返回已有状态；若已记录injection_requested而无法证明是否注入，进入outcome_unknown，不自动再次sendUserMessage/sendMessage。request_id解决逻辑去重，不把它宣传成物理exactly-once。

来源：S0/S1/S5/S7/S8。

<a id="d05"></a>
## D05. 状态机、等待与续接

### D05.1 状态维度

| 层 | 值或含义 |
|---|---|
| Presence | online/suspect/offline；服务端心跳依据 |
| Activity | unknown/idle/working/blocked；真实Pi事件及prompt depth |
| Binding | leader/primary/secondary，team_schedulable资格 |
| Role | free/owned/primary_offline/quarantined，加owner独立字段 |
| Run | queued_run/planning/running/reviewing/reworking/needs_review/completed/failed/cancelled；另有blockers及cleanup |
| Task | queued/dispatching/running/waiting_dependency/result_proposed/completed/interrupted/failed/cancelled/needs_review |
| Attempt | admitted/running/suspended/result_proposed/settled/interrupted/failed/cancelled/needs_review |
| Acceptance | pending/accepted/rejected，绑定被验结果版本 |
| Cleanup | pending/reconciling/released；不能被Run的逻辑terminal替代 |
| Projection | current/stale，epoch/revision/observed_at |

waiting_role为Task blocker及Run聚合显示：没有活动segment、没有可就绪派发的分支且全部有效进展受Role阻挡时显示；同时运行的分支保持running并附blocked_count。free+offline必须显示不可执行，不能把一个字符串作为所有事实。

### D05.2 事件唤醒

在接受wait的同一事务中读取owner revision、保存WaitEdge；释放Role时写ownership revision、event和outbox。消费事件时根据最新Task/Run revision重新评估，不直接执行旧调度命令。事务后发布SSE可失败，持久事件仍可补读。

Leader在一次decision中尽量提交全部独立就绪分支；记录等待后settle当前leader_step。只有有效状态变化、用户操作或正常就绪事件触发下一步。对相同state revision去重，避免零进展循环；Controller可做有界维护扫描，不额外烧模型轮。

### D05.3 父任务yield

parent运行中创建child intent及依赖→parent调用yield→收到真正settled且无工具/pending→标suspended并释放当前segment的执行额度。保留AgentTaskReservation、Role ownership及父Task的写资源。child在不同Role/Agent执行，容量统计只计实际活动segment及必要隔离额度，不将suspended父任务永远计为执行容量。

child成功且边条件满足后创建parent continuation事件。恢复前再次检查同Attempt绑定、Run未恢复冻结、write/context快照及capacity，然后分配新segment/lease/fencing token。它不是新的Attempt，不允许顺便领取无关任务。

child需要父已持有的写资源时，V1在child接受前拒绝RESOURCE_DEPENDENCY_CONFLICT；需要真正文件交接应另定义显式的释放、版本与责任转移协议，不能本轮隐式加入。澄清问题可以response-only continuation返回，但工具限定为读取该问题/关联回复，不作为反向执行祖先的通道。

### D05.4 WaitGraph与失败传播

WaitGraph节点包括Task/Attempt与资源，边记录等待者→资源/owner及父→child依赖。注册新依赖/等待边时做环检测；同责任链self/ancestor直接拒绝。Role互等或跨执行额度/写锁的环均必须可视化，不仅检查Task拓扑。

child失败、取消、人工介入、session_changed在同事务更新依赖和通知祖先；上层转needs_review/dependency_interrupted，不满足成功边。通知可在源Pi忙/离线时持久保存，不能承诺其立即发言。正常无故障完成自动续接，故障后的迟到事件必须经过恢复门。

来源：S0/S1/S3/S4/S8。

<a id="d06"></a>
## D06. 上下文、工具与结果

### D06.1 装配域

| 域 | 来源 | 更新边界 |
|---|---|---|
| project_context | Pi原生项目/祖先AGENTS.md | Pi原生加载；记录有效hash，不由Squad重写 |
| pi_squad_protocol | 本项目控制协议 | 扩展版本 |
| pi_squad_role | role.md正文 | 进程快照 |
| pi_squad_role_working | agents.md | 新Attempt快照 |
| pi_squad_team | Team instructions/必要policy | Run快照 |
| pi_squad_roster | 当前Team的Role projection | Leader segment |
| pi_squad_run | DAG、结果、blockers、revision | 当前segment |
| TaskContract | 当前正式任务及不可变refs | Attempt；amend通过显式revision |

固定Pi源码的BeforeAgentStartEvent提供可变systemPromptOptions。优先向sections添加/替换带稳定标识的本扩展片段，不return完整systemPrompt覆盖所有域。sections的确切TypeScript结构以固定源码和编译探针核验；不凭本文伪代码发明API。动态块每次重新计算，不向同一system prompt无限追加。

before_provider_request用于最终payload脱敏核对；只采集允许的内容域/hash/ID和工具集合，不记录密钥、headers或全部环境变量。对长字符串的截断必须标记，不能用“找不到末尾Role”推断未注入，也不能用组装器输出证明之后扩展未修改。需要完整断言时在隔离测试构建中做hash/结构检查。

Skill只给目标Pi提供按需能力，不是Directory/Router/锁。无需调用方先加载/skill:pi-squad。队伍文案和角色描述不能改变工具权限，工具集合取本地可用、用户批准、Team和Task限制的交集。

### D06.2 TaskContract与完成

建议wire结构：

```json
{
  "schema_version": 1,
  "team_id": "stats-team",
  "run_id": "run-example",
  "task_id": "task-example",
  "attempt_id": "attempt-example",
  "segment_id": "segment-example",
  "target_role_id": "reviewer",
  "primary_agent_id": "reviewer-1",
  "goal_revision": 1,
  "goal": "审查统计结果",
  "kind": "review",
  "root_task_id": "task-root",
  "parent_task_id": null,
  "dependencies": [],
  "refs": [],
  "expected_output": {"type": "object"},
  "constraints": {"read_only": true, "allowed_tools": ["read"], "write_set": []},
  "context_hashes": {"role": "sha256:example", "working": "sha256:example", "team": "sha256:example"}
}
```

示例hash是占位值，不是有效测试数据。Server派生owner/attempt/binding，不信任模型自报身份。refs必须包含规范化路径或受管artifact ID、长度、内容hash及版本；外部变化不悄悄改变已验结果。

agent_task_complete只提出结果；服务端验证schema/归属/引用后记result_proposed，待匹配segment的settled和无pending证据再记执行completed。missing result为RESULT_MISSING；中断、错误、工具未结束不能当成功。自动压缩/重试仍在原受管执行中，不新增逻辑Attempt或提前释放。

review记录reviewer真实身份、审查的goal/result/artifact版本、证据与结论。review结果accepted不等于所有Run自动通过，最终Gate再次验证当前DAG。rework新建节点及明确supersedes关系，旧结果和拒绝保留。并发amend/result/complete按expected_revision CAS排序，过期结果只能进入历史，不能满足新要求。

来源：S0/S1/S3/S8/S9。

<a id="d07"></a>
## D07. Pi输入、命令和用户交互

### D07.1 一个InputClassifier

当前messaging.ts对所有非extension输入设置userPending，不能直接在它后面再挂一个互不知情的handoff hook。先整合成共享分类服务：

```text
input
  -> disabled? continue without Squad side effects
  -> source is not user interactive? do not parse textual mention
  -> registered read-only command/picker/dashboard? query only
  -> explicit related amend/handoff? persist intent with source Attempt/revision
  -> explicit role handoff with valid Run? submit once, handled
  -> ordinary input during formal Attempt? interrupt + upward failure; continue user control
  -> ordinary Pi input? continue
```

属于本扩展的所有命令和tool client复用这个操作分类，不让同一用户动作既创建child又中断parent。不能依赖另一个第三方扩展永远在某个hook顺序；支持的扩展组合要做compatibility probe。生成输入用不可伪造的内部source关联，不以正文写了task_id就视为授权。

### D07.2 Mention grammar

只解析首行首token的精确目标（允许前导空白）；保留后续任务文本和显式refs。@role:ID总是显式Role，@./path总是文件，plain @ID只有唯一Role且无同名文件歧义才是handoff。Role不在当前roster则ROLE_NOT_IN_TEAM；没有Run则NO_ACTIVE_TEAM_CONTEXT；EMPTY_HANDOFF_TASK等输入错误均不创建Task。

相邻多个目标前缀拒绝；正文提及另一个Role不自动fan-out。代码块/引用/email不路由。附件若不支持，提交前明确UNSUPPORTED_HANDOFF_ATTACHMENT。被识别的handoff提交失败或结果未知不得continue给本地LLM；保留草稿/请求ID，用户可查原请求。

Picker只选择Role，不选择Primary实例。默认填@role，遇到文件冲突填显式@role:ID或提示用call role:ID。保留已有正文；Escape取消保持原稿。没有当前Run时提示创建/选择Run，不自动创建。

### D07.3 Autocomplete和缓存

session_start通过addAutocompleteProvider包装当前provider；getSuggestions读取当前Run role projection缓存，回退调用原provider。正确透传applyCompletion、file completion和AbortSignal。缓存key=(project,team,run,config_hash,generation)，值带revision和observed_at；输入变化/切Run/new/reload撤销旧请求，旧结果不得提交。

从role列表展示Primary、状态和owner；snapshot不授予执行权。候选不可用时可展示原因，实际提交仍由Controller决定。role list与registerCommand.getArgumentCompletions共享数据源。输入解析及补全不调用LLM。

### D07.4 Dashboard与操作

Pi `/squad dashboard`用原生select/custom组件做只读Team/Role/Agent/Task视图；Go TUI用同一ProjectionClient。查看和退出不产生Task，也不置manual_interference。嵌套UI prompt的blocked与底层working/idle分别跟踪，prompt结束后重采样，不恢复陈旧状态。

管理操作按钮显示准确命令、目标ID/当前revision和风险；可把命令放回编辑器或复制到CLI，实际执行必须为显式提交。确认界面不是修改权限；Controller再次校验，拒绝则仍显示真实状态。Dashboard不能直接打开SQLite，不在客户端伪造Primary/owner/accepted。

来源：S0/S1/S8。

<a id="d08"></a>
## D08. API与工具的唯一服务路径

保留health/现有查询兼容面；新调度写接口置于协议v2。下列URL为实施契约，可通过统一路由版本调整，但不能改变语义或并存另一套Task引擎。

| 操作 | HTTP语义 | 入口 |
|---|---|---|
| discovery/doctor | GET /health，读取并核对discovery文件 | CLI/Extension |
| projection | GET /v2/snapshot；GET /v2/teams/{id}/roles；GET /v2/events?after=seq | Dashboard/autocomplete |
| Run create/select/read | POST /v2/runs；GET /v2/runs/{id}；选择只存UI上下文 | /squad run、use-run、squad_run_create |
| human handoff | POST /v2/runs/{id}/handoffs | @role、/squad call role |
| Leader decision | POST /v2/runs/{id}/decisions | squad_decide |
| peer invocation | POST /v2/tasks/{id}/children | agent_invoke的team分支 |
| direct invocation | POST /v2/tasks/direct | /squad call agent、agent_invoke的合格direct分支 |
| yield / result | POST /v2/attempts/{id}/yield、/result | agent_task_yield、agent_task_complete |
| lifecycle evidence | POST /v2/attempts/{id}/events | 已认证TS adapter，不给任意模型伪造 |
| task read / amend | GET /v2/tasks/{id}；POST /v2/tasks/{id}/amend | task/get/amend |
| cancel / recover / retry | POST /v2/tasks/{id}/cancel、/recover、/retry；Run cancel独立端点 | 显式用户命令 |
| Primary release/promote | POST /v2/roles/{id}/release、/promote | 显式用户管理 |
| messaging | 保留消息ID及receipt；team模型工作适配到统一work gate | send/ask/inbox及原工具 |

所有写操作带request_id、expected_revision（适用时）及当前source binding；身份由服务端验证，不让模型填owner。handoff至少包含run、target_role、instruction、source task context、明确write_set/约束；接收可返回accepted/queued/waiting_role/rejected及实体ID。队列接受后target snapshot改变进入恢复，不透明换人。

squad_decide支持dispatch/wait/complete；dispatch先验证整个decision结构、预算和DAG，语法无效不部分创建任务。结构合法的不同分支允许各自queued/blocked，返回每个action的结果。decision id + run revision去重。complete需走同一AcceptanceService，而非Leader专用捷径。

正常消息notice/状态读取不创建模型工作。Team ask建立受管kind=ask Task，限制当前关联消息的get/reply；只用于澄清，不借它执行Worker工具。Direct消息/调用的scope不能靠任意请求字段从Team逃逸。

来源：S0/S1/S2/S4/S8；URL和统一服务接口为本项目设计。

<a id="d09"></a>
## D09. 故障恢复、取消与安全释放

故障窗口必须分层：

| 窗口 | 处理 |
|---|---|
| 事务未提交 | 未接受；无Pi输入 |
| 已提交但没有注入证据 | 保留dispatch intent；只在能证明未注入且仍符合显式恢复授权时继续 |
| 注入后ACK未知 | outcome_unknown；不能盲目重注入 |
| 已propose但未settled | 不completed，继续收集证据/隔离 |
| settled与结果均可核实但反馈丢失 | 关联同Attempt结果，幂等返回，不新执行 |
| Controller epoch变更 | 旧lease失效，新输入暂停；只读reconcile，用户明确恢复 |
| /new/普通接管 | 原Attempt逻辑中断且上行失败；物理工作未停则隔离 |

取消父Task/Run先写cancel_requested并关闭新派发，在Task树中枚举子任务；对活动segment发精确绑定abort，等待终止证据。无法确认时保持needs_review和资源。Queued Task取消不向目标发abort。Run可有逻辑cancelled，但cleanup_state仍pending，不能用它放行同队下一Run。

recover --attach-evidence核实旧结果，不改变失败历史；retry --rebind-current产生新Attempt、retry_of和新target snapshot；promote改变Role代表，不是Task重试。所有操作保存操作者、原因和证据hash。任意操作遇到过期revision拒绝，必须重新读状态。

无故障release自动产生role_available；故障状态需要恢复门。等待图检测到死锁不自动抢占，也不“解锁后再问用户”。父写资源在suspended保留，若用户决定放弃父任务，须走终止/对账再释放。

写资源保证仅覆盖本Controller受管任务；不保证同用户其它终端/进程不会修改同文件。跨Project共享写目录、外链和难以约束的shell写入不属于V1可自动安全调度范围，不能在报告中声称隔离。

来源：S0/S1/S5/S7/S8。

<a id="d10"></a>
## D10. 实施顺序：每一步都有可检查出口

不能先做可见@转发、再补正式Task；不能先扩多Team、再补故障fencing。以下均为阶段04内部增量，不把Pi命令或Dashboard挪到后续阶段。

| 增量 | 实施内容与主要位置 | 必须交付的证据/出口 |
|---|---|---|
| M0 契约与兼容探针 | 配置schema、protocol v2、Pi API probe、命令分类、89项索引；只读迁移dry-run | P4-A04/A06/A24/A39/A40的静态部分；接口/版本未知不能开始有副作用派发 |
| M1 Project与身份 | project discovery/lock、Leader/Primary注册、持久ownership、角色/Team projection | TR-A01—A06/A20、P4-A01—A03/A07；先有只读CLI和基础Dashboard，不把它算完整TR-A17 |
| M2 单Task真实闭环 | 最小Run创建、Role admission、Task/Attempt/lease、TS本地gate、上下文、结果/settled、幂等 | 一个真实Pi任务的U/E/R闭环；TR-A14/A30、CMD-A09、P4-A11/A19/A20/A31/A32；不是消息ask模拟 |
| M3 先补恢复和输入隔离 | cancel/new/reload、用户介入、result fencing、write reservation、reconcile | TR-A15/A16/A19/A29/A31、P4-A15/A16/A18/A29/A35/A37；未知结果不自动重跑 |
| M4 Run与Leader/DAG | FIFO admission、squad_decide、Workflow materialize、typed dependency、并行、review/rework、Gate | TR-A18/A21—A23/A32/A33、P4-A08/A09/A17/A33/A34；强制一次review拒绝及返工 |
| M5 资源竞争与续接 | 多Team Role ownership、Task blockers、outbox唤醒、parent yield/segments、统一WaitGraph | TR-A07—A13/A24—A28、P4-A10/A12—A14/A36；capacity=1 child、cross-Team deadlock可解释 |
| M6 Pi完整调用UX | @role/parser、/pisquad-use、root命令/补全、Run上下文、统一InputClassifier | CMD-A01—A16、P4-A21—A24/A28—A30/A39；直接触发正式Router，无第二执行路径 |
| M7 Dashboard完整交互 | Go TUI+Pi薄视图、分层状态、详情/过滤/事件、命令预览、stale/gap | TR-A17、P4-A25—A27/A38；同revision投影一致，退出观察不停止执行 |
| M8 全量收口 | 三轮真实实验、全部故障窗口、迁移演练、USAGE更新、独立验收与报告 | 全89项PASS及前序关键回归；保留失败复测链，不用文档/编译通过替代运行证据 |

M0后可并行开发纯parser/补全/只读视图与Go存储，但正式handoff启用必须等待M2/M3。每个增量提交实现、测试、USAGE和结果记录；前置未通过时后续用例标BLOCKED，不用临时另一个插件补齐。

## D11. 检查方法与负例重点

自动层：schema/ID/配置测试，SQLite事务rollback与竞争测试，fake clock/故障点，事件乱序/gap，TS input/generation/tool gate harness；Go并发竞争测试应包含race检测。真实层：至少三个不同Role Pi、两个Team Leader（多Team场景），观察输入、工具、状态及独立产物。

必须显式布置的故障点：Task持久化前后、ownership获取中途、dispatch commit后通知前、Pi最后gate检查/注入前、注入后ACK前、result后settled前、release事件消费前、Controller重启、/new/reload并发。故障点仅测试构建启用，不给模型开放任意控制面破坏工具。

数字fixture独立检查count=3/sum=60，错误候选sum=50必须触发返工。并发由不同Agent运行区间重叠证明，单Agent片段不得重叠。父suspended期间的无关任务阻挡和child运行必须分别记录，不将“模型空闲”等同“Agent可给别人用”。

文档静态检查应核对：TR-A01—A33、CMD-A01—A16、P4-A01—A40各一次；需求和设计相互链接；源码固定SHA和引用类型；JSON示例可解析；README无第二套规则；全局数量=160。可用如下计划检查命令，不能未执行就记PASS：

```bash
git diff --check
python3 - <<'PY'
import json, pathlib, re
base = pathlib.Path('pi_squad_case/04-team-orchestration')
req = (base / 'TEAM_RUNTIME_REQUIREMENTS.md').read_text()
expected = {**{'TR-A':33}, **{'CMD-A':16}, **{'P4-A':40}}
for prefix, total in expected.items():
    ids = re.findall(r'^\| (' + re.escape(prefix) + r'\d{2}) \|', req, re.M)
    wanted = [f'{prefix}{i:02}' for i in range(1, total+1)]
    assert ids == wanted, (prefix, ids)
for path in base.glob('*.md'):
    text = path.read_text()
    for block in re.findall(r'```json\n(.*?)\n```', text, re.S):
        json.loads(block)
assert len(list(base.glob('*.md'))) == 3
print('document checks passed; NOT runtime acceptance')
PY
```

本次文档审查未启动Pi、未使用Herdr派发验收、未执行故障注入。阶段状态继续not_implemented/not_run。真实验收执行人按当前pi_squad/AGENTS.md建立独立测试workspace并回传；回传位置临时获取，不硬编码用户pane。

<a id="sources"></a>
## S. 功能参考来源与使用边界

### S0 本项目当前基线（本轮已核对）

固定 [`kms9/pi-learn@cdae80379685ff5c79621117712ce9f53ddefe1c`](https://github.com/kms9/pi-learn/tree/cdae80379685ff5c79621117712ce9f53ddefe1c)。本轮核对了五份阶段04文件、阶段03、目录决策、Controller及Pi检查规范，并复读关键消息输入/gate代码。以下是现有实现或既有规则，不表示P4已经实现。

| 功能 | 固定路径 | 使用方式 |
|---|---|---|
| 已有Role注入/注册/发现 | [extension/index.ts](https://github.com/kms9/pi-learn/blob/cdae80379685ff5c79621117712ce9f53ddefe1c/pi_squad/extension/index.ts)、[config.ts](https://github.com/kms9/pi-learn/blob/cdae80379685ff5c79621117712ce9f53ddefe1c/pi_squad/extension/config.ts) | 迁移现有overlay，不另建一套身份 |
| ask限制、输入冲突、代次隔离 | [messaging.ts](https://github.com/kms9/pi-learn/blob/cdae80379685ff5c79621117712ce9f53ddefe1c/pi_squad/extension/messaging.ts) | 本轮复读installMessaging/poll/input/tool_call；不得把ask当正式Worker任务 |
| HTTP/消息事件 | [httpapi/server.go](https://github.com/kms9/pi-learn/blob/cdae80379685ff5c79621117712ce9f53ddefe1c/pi_squad/controller/httpapi/server.go)、[events.go](https://github.com/kms9/pi-learn/blob/cdae80379685ff5c79621117712ce9f53ddefe1c/pi_squad/controller/httpapi/events.go) | 延用HTTP，扩持久事件和投影；实现前复核完整handler测试 |
| 专属目录与工作规则 | [目录决策](https://github.com/kms9/pi-learn/blob/cdae80379685ff5c79621117712ce9f53ddefe1c/docs/decisions/2026-09-25-squad-team-runtime-scope.md) | .agents/pisquad、role.md与agents.md分离 |

### S1 Pi固定源码（本轮复读关键API）

本仓pi-dev gitlink仍为 `earendil-works/pi@890f920884f6d21fc7617d236ef9e1cc5d7a0ef8`，不使用浮动main宣称兼容。

| 功能 | 文件/符号 | 借鉴与边界 |
|---|---|---|
| autocomplete wrapper | [github-issue-autocomplete.ts](https://github.com/earendil-works/pi/blob/890f920884f6d21fc7617d236ef9e1cc5d7a0ef8/packages/coding-agent/examples/extensions/github-issue-autocomplete.ts)：createIssueAutocompleteProvider | wrapper/fallback、异步取消、applyCompletion；不引入gh作为Squad依赖 |
| Pi原生UI | [types.ts](https://github.com/earendil-works/pi/blob/890f920884f6d21fc7617d236ef9e1cc5d7a0ef8/packages/coding-agent/src/core/extensions/types.ts)：select/custom/setEditorText/addAutocompleteProvider | Picker及薄Dashboard；不重写Pi TUI |
| 生命周期/上下文 | 同types.ts：BeforeAgentStartEvent、BeforeProviderRequestEvent、AgentSettledEvent、UIPromptStart/End | sections组合、最终请求证据、settled与UI activity分层；兼容性仍要实装probe |
| commands/tools/input | 同types.ts：ExtensionAPI、RegisteredCommand、InputEvent | registerCommand/getArgumentCompletions/registerTool及handled输入；模型输出不等于用户input |

### S2 Multica（固定既有源码研究，不是本项目运行依赖）

本项目较新的源码记录为 `multica-ai/multica@1c908ea52c19f193d301ca9460fc1d7d100a1b3d`，来自 [本仓来源页](../../docs/sources/multica-team-runtime.md)。更早SOURCES.md中的b866dac快照仍是历史，不混成同一版本。本轮读取来源记录，以下完整函数应在实现相应模块前再复核，不声称本轮重审全部Multica。

| 功能 | 固定源码 | 采用/不采用 |
|---|---|---|
| Team成员、任务Team上下文 | [084_squad.up.sql](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/migrations/084_squad.up.sql)、[127_task_squad_id.up.sql](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/migrations/127_task_squad_id.up.sql) | 配置关系与执行上下文分离；不照搬成员到多容量Role |
| Leader briefing | [squad_briefing.go](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/internal/handler/squad_briefing.go) | 动态roster/instructions/协作协议 |
| 协议身份 | [daemon/prompt.go](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/internal/daemon/prompt.go)：taskIsSquadLeader | 身份来自协议，不从可写prompt猜 |
| 领取事务 | [service/task.go](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/internal/service/task.go)：claimTask | 事务内核验并发；Pi Squad自加Role ownership和SQLite恢复 |

### S3 Pi Agent Teams

`tmustier/pi-agent-teams@2c1776d2a68104aaadc1c622d8a704684c7c35d6` 的 [extensions/teams/task-store.ts](https://github.com/tmustier/pi-agent-teams/blob/2c1776d2a68104aaadc1c622d8a704684c7c35d6/extensions/teams/task-store.ts)：TeamTask/updateTask/isTaskBlocked/claimTask/completeTask。既有核读记录见 [SOURCES](../SOURCES.md)。借鉴Task owner/依赖/原子更新，不把文件Task Store照搬成另一个数据库，不据此推断其具有本项目跨Team租约或最终Gate。

### S4 Pi Intercom

本仓gitlink `nicobailon/pi-intercom@199279ae861bf53ce014809fb2a03337538ae13e`：[reply-tracker.ts](https://github.com/nicobailon/pi-intercom/blob/199279ae861bf53ce014809fb2a03337538ae13e/reply-tracker.ts)、[broker/protocol.ts](https://github.com/nicobailon/pi-intercom/blob/199279ae861bf53ce014809fb2a03337538ae13e/broker/protocol.ts)、[broker/broker.ts](https://github.com/nicobailon/pi-intercom/blob/199279ae861bf53ce014809fb2a03337538ae13e/broker/broker.ts)。借鉴消息关联、显式收据和作用域校验；不启用其离线任务邮箱，不引入第二broker，不移植阻塞Promise等待。其wire framing与P4的HTTP协议不同。

### S5 Pi Subagents / herdr-pi-bridge

本仓gitlink `nicobailon/pi-subagents@678f842f386334d8444af9265ff85636e3216cef`：[src/extension/herdr-pi-bridge.ts](https://github.com/nicobailon/pi-subagents/blob/678f842f386334d8444af9265ff85636e3216cef/src/extension/herdr-pi-bridge.ts)、[herdr-pi-protocol.ts](https://github.com/nicobailon/pi-subagents/blob/678f842f386334d8444af9265ff85636e3216cef/src/runs/shared/herdr-pi-protocol.ts)。借鉴request/accepted/event/settled关联；既有记录为部分函数核读，不声称全仓审计。不复用machine/SSH/远程placement、自动进程生命周期、manifest或终端键盘派发。

### S6 观察与Herdr边界

沿用 [阶段05需求](../05-herdr-observability/README.md) 的只读投影、数据来源、stale及focus校验原则；P4不实施Herdr adapter。外部参考 `herdrdev/herdr@5a649142233631f8407b4099da0e8e78dfef8574` 的 [src/api/schema/session.rs](https://github.com/herdrdev/herdr/blob/5a649142233631f8407b4099da0e8e78dfef8574/src/api/schema/session.rs) 和 [src/api/schema/events.rs](https://github.com/herdrdev/herdr/blob/5a649142233631f8407b4099da0e8e78dfef8574/src/api/schema/events.rs) 只用于未来location投影，不作为Task完成证据或此次依赖。

### S7 SQLite官方说明（本轮核对）

[Transactions](https://www.sqlite.org/lang_transaction.html) 说明读/写事务和BEGIN IMMEDIATE；[WAL](https://www.sqlite.org/wal.html) 说明读写并发及WAL限制。它们支持短写事务/一致snapshot的实现基础，**不自动提供**本项目的Role锁、DAG、outbox或exactly-once。实现时锁定实际driver/SQLite版本并检查其发布说明；本轮未升级依赖或宣称本机版本安全。

### S8 前序契约与仓库纪律

[阶段03](../03-agent-invocation/README.md) 是Task/Attempt、异步yield、人工介入上行失败、recover/retry分离的来源；[Controller AGENTS](../../pi_squad/controller/AGENTS.md)规定技术栈及唯一数据库写者；[Pi Squad AGENTS](../../pi_squad/AGENTS.md)规定真实终端验收及结果回传；[全局验收规范](../ACCEPTANCE.md)规定证据层级。P4整合明确覆盖的接口/路径差异以统一需求为准，未覆盖的前序安全及身份约束继续有效。

### S9 尚未合并的上下文提案

[PR #3](https://github.com/kms9/pi-learn/pull/3) 在本轮核对时仍open、merged=false，head为 `5829731e60c62e9f268dcec14fe8371956a6beef`。其 [CONTEXT_ASSEMBLY_DESIGN.md](https://github.com/kms9/pi-learn/blob/5829731e60c62e9f268dcec14fe8371956a6beef/pi_squad_case/04-team-orchestration/CONTEXT_ASSEMBLY_DESIGN.md) 是补充设计参考，不是当前五文件基线的一部分。本轮依据当前Pi API和已确认职责分层收纳必要装配原则，**没有自动合并/关闭该PR，也不把其中CTX-01—14另计为已合入/已验收用例**。

### 不属于上游事实的本项目决定

单Primary、单Action Run、FIFO single-active、89项验收、目录schema、命令名、组合资源事务、WaitGraph、affinity/segment分离、恢复门、显式消歧和最终Gate是Pi Squad规则。参考项目只提供局部机制，不是“整体复制即得到生产可靠性”。不为扩大参考列表而引入未核验的DeepSeek/ACP/托管平台实现。

## H. 合并前内容去向

| 原文件 | 当前去向 |
|---|---|
| README.md | 当前README仅保留导航、范围、数量和实施入口 |
| TEAM_RUNTIME_REQUIREMENTS.md | 统一需求TR-01—18及全部用例 |
| TEAM_RUNTIME_DESIGN.md | 本文架构/契约/顺序/来源 |
| PI_TUI_ROLE_HANDOFF_REQUIREMENTS.md | 需求TR-12—14、CMD-A01—16；本文D07/D08 |
| TEAM_RUNTIME_PLAN.md（superseded） | 只吸收不冲突背景；旧目录、动态Leader换Team、固定普通agent_ref、Role多实例策略不恢复 |

移除的原文件在 [合并前固定目录](https://github.com/kms9/pi-learn/tree/cdae80379685ff5c79621117712ce9f53ddefe1c/pi_squad_case/04-team-orchestration) 保留完整历史。禁止之后把旧PLAN或未合并PR直接覆盖本轮统一文件；后续设计变更必须同时更新需求、技术契约、对应测试和实际USAGE。
