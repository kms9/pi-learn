# Pi Squad：Project runtime v2

阶段 04 的实现已接入本文件所列入口，目前已进入**整体集成验收，尚未全量通过**。编译通过不代表真实执行或恢复场景通过；运行结果以 [阶段 04](../pi_squad_case/04-team-orchestration/README.md) 和 [89 项集成索引](../pi_squad_case/04-team-orchestration/integration/README.md) 为准。本轮不新增、也不运行单元测试，本轮按全部开发后统一整体集成的顺序执行。

## 安装与构建

```bash
npm ci --prefix pi_squad
(cd pi_squad/controller && go build -o bin/controller ./cmd/controller)
```

Pi 提供 `@earendil-works/pi-coding-agent`、`@earendil-works/pi-ai`、`typebox`；包安装自己的 `yaml` 依赖。可 `pi install /绝对路径/pi_squad`，或安装 `extension/index.ts`，二选一，避免重复加载。隔离检查用 `pi --no-extensions -e /绝对路径/pi_squad/extension/index.ts`。

实现依据本机 Pi 0.87.1 的 API，依赖 native sections、`before_provider_request`、`agent_settled`、原生会话事件、`user_bash`、UI prompt 事件及 autocomplete wrapper。缺少声明能力时停止正式执行，不降级成普通消息调用。

## Project 与配置

从启动 cwd 向上寻找最近 `.agents/pisquad`，以 canonical 路径为 Project 身份。不同子目录共享同一 Project；嵌套 Project 是独立边界。配置路径检查准确大小写、UTF-8、64 KiB 上限、未知/重复字段、引用、版本和目录边界。

```text
.agents/pisquad/
├── roles/
│   ├── counter/{role.md,agents.md}
│   ├── summer/{role.md,agents.md}
│   └── reviewer/{role.md,agents.md}
├── teams/stats-team/
│   ├── team.json
│   ├── instructions.md
│   └── workflows/stats.json
└── .runtime/                 # 私有运行状态，不提交 Git
```

`role.md` 必须有且仅有 `name`、`description` 两个 YAML frontmatter 字段，正文非空。ID 使用 `[a-z][a-z0-9-]*`，目录名等于 name。`agents.md` 必须存在，允许为空。角色目录的其它文件不作为提示加载。

```markdown
---
name: counter
description: 独立统计数据条数。
---
读取任务指定的数据，提交可核对的结构化结果。
```

Role 正文在 Pi 进程启动时固定；`/new`、`/reload` 不偷偷换角色。`agents.md` 在新 Attempt 读取并固定，同 Attempt 的 continuation 不刷新。Team 的 instructions、policy 和 Workflow 在 Run 创建时固定；同 config_version 改内容会被拒绝，变更须增加版本。

完整 Team/Workflow 样例见 [team.json](../pi_squad_case/04-team-orchestration/integration/fixtures/team.json)、[stats.json](../pi_squad_case/04-team-orchestration/integration/fixtures/stats.json)。Team 必须声明：

- `schema_version: 1`、`team_id`、正整数 `config_version`。
- `leader.agent_ref`：稳定 Leader Agent ID；`members`：不重复的 `role_ref` 与非空 `responsibility`。
- `instructions_file: "instructions.md"`，可选 `default_workflow`。
- `policy.run_admission: "fifo_single_active"`，正整数 `max_parallel_tasks`、`max_delegate_depth`、`max_total_tasks`、`max_attempts_per_task`。
- `allowed_tools`、`writable_roots` 必须显式数组。受管工具为 `read/grep/find/ls/write/edit`；只读任务去掉写工具；write/edit 必须有任务 `write_set` 且位于配置允许的根下。正式任务不放行 bash 或未受管的第三方工具。
- `acceptance_policy`：Team 的 `mode` 为 `checker/review`，`child_policy` 为 `inherit_parent/separate`。checker 需要 `checker_ref`（当前内置 `numbers-count/numbers-sum/numbers-stats`）；review 需要 roster 内独立 `reviewer_ref`；standalone 默认 human，由操作者显式验收。review Task 不递归找 reviewer。

Workflow 的 `steps` 包含 `id/role_ref/kind/goal/depends_on`，可附 `refs/expected_output/acceptance/write_set/rework_of`。依赖条件为 `execution_completed/acceptance_accepted/review_rejected`；环和预算超限拒绝。`expected_output` 使用实现的严格 JSON schema 子集（type、properties、required、items、enum、additionalProperties、minimum/maximum、minItems/maxItems），未知关键词拒绝。`acceptance` 是给 checker/reviewer 的验收说明，不得覆写冻结的权限或 policy。

## 从旧目录迁移

不会自动加载或移动 `.agents/roles`。在旧项目根运行已构建的二进制：

```bash
/绝对路径/controller migrate --dry-run --source-db /绝对路径/旧库.sqlite
/绝对路径/controller migrate --dry-run=false \
  --source-db /绝对路径/旧库.sqlite --mapping /绝对路径/mapping.json \
  --confirm-old-writer-stopped
```

无旧库时省略 `--source-db`。mapping 是完整 `TeamSnapshot` JSON 数组，每项包含 `config`、`instructions`、`workflows`；`[]` 明确表示仅 standalone，不推断 roster。执行前须已停止旧写入者。迁移先检查冲突、复制到 staging、严格加载、做 SQLite 一致备份并核验，再原子发布新目录；保留旧角色原件和旧库，不覆盖已有 Project。备份及 manifest 位于新 `.runtime`。

## 启动与发现

在 Project cwd 的独立终端启动 Controller：

```bash
/绝对路径/controller serve --max-parallel-tasks 4
```

默认 loopback 动态端口 `127.0.0.1:0`，持有唯一 Project 进程锁；数据库默认 `.runtime/state.sqlite`。原子写出的 `.runtime/controller.json` 包含 Project、协议、Controller ID/epoch、实际 endpoint。客户端读取并核对 health，不回退固定端口。已握手的 snapshot/SSE 读取也携带 Controller 身份；端口被另一 Controller 复用时拒绝旧身份读取，观察端须重新发现。显式 `--url` 仍须通过 Project/协议/epoch 握手。

配置优先级为 flag > `PI_SQUAD_*` 环境 > `--config` 文件 > 默认：

| 字段/flag | 默认 | 含义 |
|---|---|---|
| `--project-root` | cwd 向上发现 | 发现起点 |
| `--listen` | `127.0.0.1:0` | 服务监听 |
| `--db` | Project `.runtime/state.sqlite` | 显式覆盖仅用于隔离验收，仍持 Project 锁 |
| `--max-parallel-tasks` | 2 | Project 执行 segment 容量，必须为正整数；配置文件/环境值中的小数拒绝，不截断 |
| `--heartbeat-timeout` | 15s | 超时标 suspect，2 倍超时标 offline；均不释放身份/资源 |
| `--lease-ttl` | 30s | 执行许可期限，失租即隔离，不自动释放 |
| `--url` / `PI_SQUAD_CONTROLLER_URL` | discovery | 客户端显式地址 |

需要模型发起 standalone root 时，在 Controller 配置文件显式授权：

```yaml
direct:
  allowed_callers: [operator-agent]
  allowed_targets: [reviewer-agent]
  allowed_tools: [read, grep, find, ls]
```

caller/target 默认空；operator 显式命令可以创建只读 standalone Task。子任务继承作用域、预算与工具上限。standalone 每 root 最多 20 个 child（不含 root，包含所有层级后代）、深度最多 3、每 Task 最多 3 个 Attempt；Team 的 max_total_tasks 计整个 Run 的业务 Task。Project 私有 operator 凭据在 `.runtime/operator.token`（0600）；只由显式管理命令读取，不交给模型。停服后下次 `serve --rotate-operator-token` 轮换并留审计。

分别从 Project cwd 启动已有 Pi：

```bash
PI_SQUAD_MODE=leader PI_SQUAD_AGENT_ID=stats-lead PI_SQUAD_TEAM_ID=stats-team pi
PI_SQUAD_MODE=role PI_SQUAD_AGENT_ID=counter-primary PI_SQUAD_ROLE_ID=counter pi
PI_SQUAD_MODE=role PI_SQUAD_AGENT_ID=summer-primary PI_SQUAD_ROLE_ID=summer pi
PI_SQUAD_MODE=role PI_SQUAD_AGENT_ID=reviewer-primary PI_SQUAD_ROLE_ID=reviewer pi
```

未设置 `PI_SQUAD_MODE` 时 no-op，不加工具或 gate。每个角色首个成功绑定的 Agent 为 Primary；其它为 Secondary，可独立工作，不自动晋升。离线不释放身份。系统不代用户启动 Pi、清历史、切会话或执行 `/new`。

另一个终端运行只读 Go Dashboard：

```bash
/绝对路径/controller tui
```

Tab 切视图、`/` 筛选、方向键选择/滚动、Enter 详情、`r` 重新发现并刷新、`q` 仅退出观察者。可查看 Team/Role/Agent/Run/Task/Attempt、lease、wait、事件、evidence；epoch/revision/age 和 stale 分开显示。

## Pi 会话入口

| 命令 | 行为 |
|---|---|
| `/squad help`、`whoami`、`agents`、`roles`、`teams` | help 显示各入口参数、管理预览、旧别名及凭据轮换说明；其余为只读身份/投影 |
| `/squad run <team> <goal>` | 显式创建 Run 并选中 |
| `/squad use-run <run>` | 显式选 Run，活动 Worker 不能换作用域 |
| `/squad status [run]`、`task <task>` | 查询，不启动模型 |
| `/squad call role:<id> -- <goal>` | 当前选定 Run 内 handoff |
| `/squad call agent:<id> -- <goal>` | standalone，只读；不能绕过活动 Primary ownership |
| `/squad call role:<id> --write <path> --parent current -- <goal>` | 显式关联 child intent；活动父须 yield 后 child 才派发 |
| `/squad ask role:<id> <question>` | 受管问答 Task；目标只读/回复当前问题 |
| `/squad send agent:<id> <text>` | passive notice，不启动模型 |
| `/squad inbox`、`transport`、`request <request_id> [--runtime]` | 收件、连接诊断、查询未知提交结果 |
| `/squad dashboard` | Pi 原生只读 Dashboard；`p` 预览精确 CAS 管理动作后显式提交 |
| `/pisquad-use` | 选 Role 填草稿，不提交；取消保留草稿 |

保留 alias `/squad-whoami`、`/squad-inbox`、`/squad-transport`。参数补全来自带版本及观察时间的缓存；presence 随时间变化时刷新展示，同 revision 的旧响应不能覆盖较新的观察结果；提交仍由 Controller 重新裁决。

行首 `@Role`、call/ask 的 Role 参数补全与 `/pisquad-use` 共用当前 Run 的角色投影，包含 Primary、presence/activity、owner 和 revision；不把 Project 内其它 Role 当作当前 Team 成员。Picker 无同名文件歧义时填 `@Role`，有同名文件时填 `@role:Role`；取消或打开期间草稿发生变化时不覆盖编辑器。补全正常与失败回退路径均隔离旧 Run/session generation 的迟到响应。角色变更和 Run 终结仍在提交时由 Controller 检查。`role release/promote`、`leader release` 参数补全使用查询快照中的明确身份。

Pi Dashboard 断线后会以只读方式重新校验 discovery 并刷新快照；旧连接响应和较低 revision 不覆盖新状态，恢复观察不会恢复执行。活动 Team/Task 的 Pi 显式 call/ask 同样受来源 scope 约束，不能借 operator 凭据绕到 standalone；独立 operator CLI 不附带虚构 Pi 来源。

行首 `@role:counter 统计数据` 或无文件歧义的 `@counter 统计数据` 路由当前 Run；`@./file`、`@src/file` 保留 Pi 文件语义。空任务、多目标、图片/附件拒绝；正文/email/代码块里的 @ 不路由。已识别 handoff 失败不落成本地模型任务，错误保留请求 ID；结果不明先查询，不盲目重提。

活动 Leader 的普通输入保存为当前 Run guidance，安全 settled 后进入下一协调轮。活动 Worker 普通输入、显式 takeover、实际 session/branch 更换、用户 `!bash`、实际中止正式 segment 的 manual compaction 中断当前执行并传播至等待祖先；已 suspended 且无活动 segment 时的纯上下文压缩保留快照。只读操作、selector 取消和自动 compaction 不构成接管。原生切换等待当前回合停止时，扩展延后成功收尾确认，让实际 session shutdown 先持久化中断，避免旧结果在切换过程中抢先完成。

首次启动在发起注册前发现 Controller 不可用或握手不匹配时，给出一次错误并退回普通 Pi 工具与对话；修复连接后 `/reload` 重新尝试。已有绑定、未完成执行或注册请求结果不明时仍保留隔离，不据此自动退出。

远端对账释放 suspended Attempt 后，adapter 在下一次轮询核对旧 reservation；本地 idle 且无 pending 时清除旧引用，后续派发无需依赖 reload。本地仍忙时保留正式执行门，等待结束，不因旧 reservation 已释放而中断新的普通用户轮次。

同一 Team 的重复 Leader 进程注册被拒后退出 Squad Leader 模式，恢复普通 Pi 工具与对话；原 Leader 不变。`/squad whoami` 的 `disabled_reason/active_tools` 可核对退出状态；解决身份冲突后重新启动或 reload 才重新尝试注册。

## 取消、恢复与验收

管理命令使用独立 operator 凭据和当前 revision。cancel/recover/retry/rebind/accept/reject/resume/reconcile、role 和 leader 操作支持 `--preview`，仅展示不写入；amend 后为完整补充正文，不解析预览选项。

```text
/squad cancel run:<id> --note <reason>
/squad cancel task:<id> --note <reason>
/squad amend task:<id> <补充要求>
/squad takeover
/squad reconcile attempt:<id> --confirm-stopped --expected-runtime <UUID> --note <停止及子进程证据>
/squad recover task:<id> --attach-evidence attempt:<id> --note <reason>
/squad recover task:<id> --attach-evidence evidence:<seq> --note <reason>
/squad retry task:<id> --rebind-current --note <reason>
/squad rebind task:<id> --rebind-current --note <reason>
/squad resume run:<id> --rebind-current --note <reason>
/squad accept task:<id> --note <验收依据>
/squad reject task:<id> --note <拒绝依据>
/squad role release <role> --note <reason>
/squad role promote <role> <secondary-agent> --note <reason>
/squad leader release <team> --note <reason>
```

`reconcile` 是人工停止声明，不能把超时当自动证明。recover 只挂接已有证据，不执行模型。retry 创建带 retry_of 的新 Attempt，保留历史且受重试预算约束。rebind 仅用于从未有 Attempt 的 Task。resume 仍检查所有隔离和未完成 cleanup；不自动替换 Leader。role release 不解除 Run ownership、不自动提升 Secondary。human accept/reject 仅适用于固定 human policy，不能改写 checker/reviewer 策略。

Run 准入原子取得整个 roster；相交 Run 按 queue_seq FIFO，不相交可并行。Run 终止且所有执行 cleanup 后整体释放。Task result_proposed 不是 completed，completed 不是 accepted；结果必须经过 settled/no pending、schema/refs/产物校验，再按固定 policy 验收。

显式取消的过期 Task 不再单独阻挡最终 Gate；仍被当前任务依赖或引用时，必须先修订相关任务。取消不会绕过执行停止证明，任何未释放的旧 Attempt 仍阻止 Run 完成。Leader 的 complete 提议还需等待自身 settled；期间 guidance 等变更推进 Run revision 后，必须重新提议。

CLI 等价入口：

```bash
controller snapshot
controller agents list
controller agents get <agent>
controller run <team> '<goal>' --request-id <key> [--workflow <id>]
controller task role:<role> '<goal>' --run <run> [--write <path>] [--preview]
controller task agent:<agent> '<goal>' --request-id <key>
controller operate task <id> retry --expected-revision <n> --rebind-current --note '<reason>' --preview
controller agents release <agent> --expected-runtime-id <UUID> --expected-revision <binding_epoch> --note '<reason>'
```

`operate` 的 kind 为 run/task/attempt/role/leader/agent，参数有 `--request-id/--expected-runtime/--agent-id/--note/--evidence/--result-hash/--confirm-stopped/--rebind-current`；移除 `--preview` 才提交。runtime release 撤销 UUID，不等于终止进程。

## 模型工具、收据与观察

`agent_invoke.target` 使用裸 ID：Team child 填 role_id，standalone 填已授权 agent_id；`role:`/`agent:` 是 CLI/Pi 命令语法，不是该工具参数。

Worker 工具：`agent_invoke`、`agent_task_get`、`agent_task_complete`、`agent_task_yield`、`agent_clarify`。response-only 仅 `agent_task_get/agent_clarification_answer`。Leader 空闲时 `squad_run_create`；协调轮 `squad_run_get/squad_decide/agent_task_get`。模型无法调用恢复/换人/跨 Team 管理接口。 `squad_run_get` 从一次新 snapshot 同时返回 Run revision、任务状态/结果/acceptance、依赖和 blocker；顶层 `revision` 用于 `squad_decide` CAS，`snapshot_revision` 仅用于观察排序。不要仅刷新 revision 后沿用旧 briefing 的任务状态。

保留 `list_agents/get_agent/read_inbox/get_message/send_message/reply_message`。notice/reply 仅记录展示；ask 使用统一 Task/Attempt/容量执行，reply_message 的结果要等对应 settled 才发布。普通发送需目标精确 runtime/session 及 request_id；不猜最近联系人。离线消息保留失败记录且不自动补投，身份变化使旧待处理消息失效。

持久收据依次为 dispatch_intent、adapter_received、injection_requested、input_observed、result_proposed、settled。void 输入 API 不是执行成功证明；不明注入不自动重放。SSE `/v2/events` 是可丢失的持久事件唤醒提示，客户端重新读取权威投影；断线轮询补查，不自动重发写请求。

模型材料不能读取/改写 Project 控制目录、根 AGENTS.md、.git 或跨嵌套 Project；正式 read 返回实际读取字节的 artifact path/hash/length，模型可直接把该引用放入结果，不需要开放 shell 来计算 hash；产物后来变化则提交/验收失败。实际 write/edit 通过 Pi 文件 mutation queue 并在操作时重新核对 permit/path。runtime/operator token 不进入 Task、提示、whoami 或事件。

## 诊断与验收证据

```bash
controller doctor
controller doctor --probe-file <真实Pi保存的脱敏报告>
controller schema
```

doctor 不启动模型；声明能力检查与真实运行观察分开。没有 probe 时 `formal_execution_ready=false`。带 probe 只说明观察到了核心 hooks，不能替代完整场景验收。协议说明见 [protocol/README.md](protocol/README.md)。

集成构建、故障窗口、fake clock、最后加载的 payload 观察扩展见 [集成说明](../pi_squad_case/04-team-orchestration/integration/README.md)。生产入口不加载故障实现。报告仅存结构、版本、ID、hash、工具集合、事件顺序，不存凭据或完整 provider payload。

### 截止时间与恢复诊断

planned 节点尚未进入 Agent 队列，`deadline_at` 在 planned→accepted 时冻结为受理后 120 秒；未受理节点不因等待前置依赖或 Run 准入消耗这一预算。已受理队列、运行及续接仍遵守冻结的截止时间，超时进入显式恢复流程，不等于执行已停止。

`/squad transport` 同时显示脱敏的本地 execution_gate（frozen、generation、Attempt/segment、cleanup_state），用于区分通信失败和等待执行对账；消息恢复会清除旧错误状态。

`doctor.configured_timing` 显示本次 CLI 配置的心跳/lease 参数；在线 snapshot 的 `timing` 为服务实际配置。Agent 投影的 `suspect_at/offline_at` 与 Attempt 的 `lease_expires_at` 分开显示。适配器每秒检查，许可剩余少于 20 秒时申请续约；默认 TTL=30s 时通常约每 10 秒续约，迟到心跳不复活过期 lease。

runtime 请求绑定到发起时的完整 binding（含 session/epoch），旧会话回调不能借同一进程凭据变成新会话请求。升级到要求源 binding 的 Controller 前，应在安全空闲窗口 reload Pi 扩展；正式状态不明时仍先走恢复/对账，不能靠重载重派。

Role 投影包含配置中尚未注册 Primary 的角色，以及仍有绑定或 ownership 历史的角色。`primary_agent_id` 为空显示 unassigned，不等于没有 Run ownership；发现角色不会预先创建 Primary 绑定。Go/Pi Dashboard 的 Team 列表显示 Team ID，Controller epoch 改变时清除旧选择。

旧会话或旧 generation 的 poll、消息回执、排队生命周期事件和注入 ACK 回调不会继续更新新会话。adapter 上报停止前会重新核对原会话/segment、idle 与无 pending；迟到响应不作为新任务的停止证明。

取消 child 会向等待祖先持久传播 `cancel_requested`，不会把取消当成功；取消只清该 Task 自身的 wait。重复收尾不重复发出 Role 释放事件。`rebind` 仅接受已有冻结目标、从未产生 Attempt 的非终态 accepted Task，planned 节点仍由依赖就绪流程受理；否则返回 `INVALID_REBIND_STATE`。rebind/retry 与 Run resume 的审计保留完整旧、新 binding。

父验收覆盖要求父子均为当前版本的 completed、无 blocker，且父 acceptance 匹配当前 goal/result；中断、补充、重试或取消使覆盖失效时同事务记录事件。最终 Gate 校验整条返工替代链，历史 `superseded_by` 不免除已失效替代结果的验收义务。内置数字 checker 核对实际读取字节的 hash/长度，并拒绝 NaN、Infinity 和合计溢出。

`@role` 与任务正文之间可以直接换行；`@role:` 的非法 ID 会明确拒绝。已识别但不在当前 roster 的角色不会回落本地模型。普通文件引用不因 Run 已结束而变成交接错误。call/ask 的选项须在 `--` 之前，未知、重复和缺值选项拒绝；管理命令同样检查未知选项，避免把拼错的预览参数当正式提交。异步 handoff/use-run 返回后再次检查原会话与 generation。

受管文件工具每次调用固定发起时的 Attempt/segment/binding/generation，仍使用 Pi 原生文件修改队列；排队后在实际文件操作前复核，旧调用不能借用新任务的权限。已开始的文件系统操作不承诺回滚；搜索和模型工具的迟到响应也不会更新新执行上下文。

SSE 重连先重新发现 Controller 并读取 snapshot；失效通知按读批次刷新 snapshot 后再唤醒本地对账，断档不重放旧派发。Controller ID 改变时清缓存，同 epoch 的另一 Controller 也不能接管旧响应。生命周期 interruption 使用 request_id 幂等，同键同内容不重复传播中断。

Dashboard 的 roles 视图可预览 promote/release，leaders 视图可预览 release；输入原因后仍需选择“显式提交”。预览绑定所见 Controller 与本地执行上下文，切换后提交会拒绝，须重新打开预览；目标 revision 仍由服务端 CAS 裁决。能力检查包含 `agent_before_settle`，首次注册前缺能力会停止 Squad 激活并恢复普通工具。

`doctor --probe-file` 的核心能力判断要求同一条有序事件链：extension input → 含 Task/Attempt/segment 的任务 section → 含对应身份且记录 hash/大小的 provider payload → agent_before_settle → idle 且无 pending 的 agent_settled。输出 `ordered_core_lifecycles` 保存首尾 seq 和身份供复核。旧报告缺少这些字段时仍可读取，但不会因此判为就绪；该判断不代表任务成功或场景验收通过。

Pi 管理命令按目标与操作校验：Run 支持 cancel/resume，Task 支持 cancel/amend/recover/retry/rebind/accept/reject，Attempt 支持 reconcile。`--confirm-stopped` 仅用于 reconcile，`--rebind-current` 用于 retry/rebind/resume，evidence 两种拼法只能选一个。amend 后全部参数作为正文，正文中的 `--preview` 不会取消提交。只读命令拒绝多余参数，带引号的参数必须闭合；Go operate 也在连接前拒绝不存在的 kind/operation 组合。

调度中的绑定变化或 Attempt 预算耗尽会进入 needs_review 并通知等待祖先；同事务后续调度读取最新 Task 状态，避免继续使用已失效的排队状态。probe 的 segment_id 与协议一致使用正整数。

Task 请求必须与端点作用域一致：direct 不带 Run/parent，handoff 使用指定 Run，child 继承父 scope。结果 refs 的 revision/hash 必须成对，重复引用和依赖会拒绝；未固定引用的 length 必须为0。调度和Gate只消费当前目标修订且无blocker的结果，review创建遇到自审或预算耗尽会明确进入 needs_review 并向祖先传播。

工具执行许可要求 Attempt 为 running/result_proposed、未释放且租约时间有效；suspended保留affinity不等于仍有执行许可。Project发现遇到损坏标记symlink或权限错误会报错，不向上回退到别的Project。

三个旧别名 `/squad-whoami`、`/squad-inbox`、`/squad-transport` 与对应 `/squad` 子命令使用同一参数校验，多余参数会明确拒绝。

Pi Dashboard 的方向键、Tab、Enter、Escape 和 Backspace 使用 Pi 原生按键解析，兼容终端扩展按键编码；j/k 同样可以选择或滚动详情。

Team 详情在共享 snapshot 中汇总当前 Leader 绑定/在线状态、成员 Primary/Secondary/owner、活跃与排队 Run 数量及其 blocker/waiting_roles。Run 的 `current_roster` 表示观察时的角色状态，原始 `leader` 和 `config_snapshot` 仍是该 Run 固定的快照；`next_step` 只是说明，不能代替操作时的权限与 revision 校验。Agent 的 `standalone_only=true` 明确标识 Secondary，不计为 Team 额外容量。
