# Pi Squad 使用与实现说明

本文件对应当前 **Project runtime v2 / `pi-squad/2`** 实现，是配置、启动、会话命令和模型工具的统一说明。功能总览与源码导航见 [README.md](README.md)。

正式激活范围为 **Pi 1.1.0、TUI 模式**，profile 为 `pi-coding-agent/1.1.0`。其他 Pi 版本（包括 1.0.1）以及 RPC/JSON/print 在注册前拒绝 Squad 激活，退回普通 Pi；已有未收尾执行仍保持隔离。阶段 04 于 2026-10-04 在 Pi 1.0.1/TUI 记录 89/89 项通过；1.1.0 的新版本验收单独记录在 [升级验收入口](../pi_squad_case/04-team-orchestration/compatibility/pi-1.1.0/README.md)，完整范围见 [阶段文档](../pi_squad_case/04-team-orchestration/README.md)；额外兼容分支见 [兼容说明](../pi_squad_case/04-team-orchestration/compatibility/README.md)。

## 阅读导航

- [安装与构建](#安装与构建)
- [配置一个三角色 Project](#配置一个三角色-project)
- [启动与创建 Run](#启动与创建-run)
- [配置参考](#配置参考)
- [Pi 会话命令](#pi-会话命令)
- [模型工具与协作流程](#模型工具与协作流程)
- [执行许可、结果与验收](#执行许可结果与验收)
- [取消、对账与恢复](#取消对账与恢复)
- [观察、诊断与请求证据](#观察诊断与请求证据)
- [从旧目录迁移](#从旧目录迁移)
- [当前限制与排错](#当前限制与排错)

## 安装与构建

npm 版 Pi 要求 Node >=22.19.0；Controller 使用 Go 1.27.0。以下构建命令在本仓库根目录运行：

```bash
npm ci --prefix pi_squad
(cd pi_squad/controller && go build -o bin/controller ./cmd/controller)
```

Pi 提供 `@earendil-works/pi-coding-agent`、`@earendil-works/pi-ai` 和 `typebox`；Pi Squad 自己安装 `yaml`。包入口由 [package.json](package.json) 的 `pi.extensions` 指向 `extension/index.ts`。

如需独立安装已支持的 Pi，使用固定版本：

```bash
npm install --prefix /绝对路径/pi-1.1.0 @earendil-works/pi-coding-agent@1.1.0
/绝对路径/pi-1.1.0/node_modules/.bin/pi --version
```

输出应为 `1.1.0`。官方 managed 安装的默认 `pi` 启动器也可使用，doctor 会解析当前 release 的实际入口，并核对启动器、入口和包版本；报告中的 `pi_launcher` 与 `pi_executable` 分别表示两者。无效安装或版本切换期间身份不一致会明确拒绝；也可显式选择具体 release 的 `node_modules/.bin/pi`。`pi-dev` 的源码版本不能替代实际运行版本。后文的 `pi` 均指这个已核对的可执行文件。

选择一种加载方式：

| 方式 | 命令 |
|---|---|
| 本地 package 安装 | `pi install /绝对路径/pi_case/pi_squad`，随后正常启动 `pi` |
| 每次显式加载 | `pi --no-extensions -e /绝对路径/pi_case/pi_squad/extension/index.ts` |

同一进程只加载一次 Squad 入口。显式加载方式适合独立检查；它关闭自动发现的其他扩展。不要只用文件工具的 `--tools` 白名单启动正式 Squad，它会排除控制工具并使派发停止。

## 配置一个三角色 Project

Project 是启动 cwd 向上最近含 `.agents/pisquad/` 的目录，使用 canonical 路径标识。同一 Project 的子目录共享 Controller；嵌套 Project 独立。下面是可自行创建的最小示例，不依赖 `integration/` 验收夹具。

```text
你的项目/
├── numbers.txt
└── .agents/pisquad/
    ├── roles/
    │   ├── counter/
    │   │   ├── role.md
    │   │   └── agents.md
    │   ├── summer/
    │   │   ├── role.md
    │   │   └── agents.md
    │   └── reviewer/
    │       ├── role.md
    │       └── agents.md
    ├── teams/stats-team/
    │   ├── team.json
    │   ├── instructions.md
    │   └── workflows/stats.json
    └── .runtime/                 # Controller 生成，不提交 Git
```

已有 Project 使用自己的配置；以下三角色启动示例对应此处的 Team。若现有 Team 的 `members` 更多，应启动它的全部成员 Primary。

### Role 与工作规则

每个 `role.md` 必须仅包含 `name`、`description` 两个 YAML frontmatter 字段，正文非空。ID 格式为 `[a-z][a-z0-9-]*`；目录名与 `name` 相同。示例 `roles/counter/role.md`：

```markdown
---
name: counter
description: 独立统计数据条数。
---
读取任务指定的数据，提交可核对的结构化计数结果。不要修改文件。
```

另两个 Role 使用同一格式：

| name | description | 正文 |
|---|---|---|
| `summer` | 独立计算数据总和。 | 读取任务指定的数据，提交可核对的结构化求和结果。不要修改文件。 |
| `reviewer` | 独立核对候选结果。 | 依据候选 Task 的实际目标和精确版本引用独立审查；读取原始数据，不修改候选或文件。 |

每个角色还必须有 `agents.md`，允许为空。可写入“结果使用结构化 value；文件证据使用 read 返回的 artifact；调用 child 后 yield，续接后再完成”。其它角色目录文件不会作为提示自动加载。

`numbers.txt` 的内容为：

```text
10
20
30
```

### Team

保存为 `.agents/pisquad/teams/stats-team/team.json`：

```json
{
  "schema_version": 1,
  "team_id": "stats-team",
  "config_version": 1,
  "leader": { "agent_ref": "stats-lead" },
  "members": [
    { "role_ref": "counter", "responsibility": "统计条数" },
    { "role_ref": "summer", "responsibility": "计算总和" },
    { "role_ref": "reviewer", "responsibility": "独立验收" }
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
    "writable_roots": [],
    "acceptance_policy": {
      "mode": "review",
      "reviewer_ref": "reviewer",
      "child_policy": "inherit_parent"
    }
  }
}
```

同目录的 `instructions.md` 写入：

```text
数据来自 Project 根的 numbers.txt。count 和 sum 必须来自实际读取。
reviewer 独立核对 count=3、sum=60；审查使用候选 Task 的当前结果引用。
Leader 只协调、处理拒绝与返工；全部业务结果验收后才提议完成 Run。
```

### Workflow

保存为 `.agents/pisquad/teams/stats-team/workflows/stats.json`：

```json
{
  "schema_version": 1,
  "workflow_id": "stats",
  "steps": [
    {
      "id": "count",
      "role_ref": "counter",
      "kind": "execute",
      "goal": "读取 numbers.txt，提交 value={count:实际条数} 及 read 返回的 artifact。",
      "depends_on": []
    },
    {
      "id": "sum",
      "role_ref": "summer",
      "kind": "execute",
      "goal": "读取 numbers.txt，提交 value={sum:实际总和} 及 read 返回的 artifact。",
      "depends_on": []
    },
    {
      "id": "review",
      "role_ref": "reviewer",
      "kind": "review",
      "goal": "独立读取 numbers.txt，核对 count、sum 候选结果。提交 decision、reason 和包含精确版本/hash 的 candidates。",
      "depends_on": [
        { "step": "count", "condition": "execution_completed" },
        { "step": "sum", "condition": "execution_completed" }
      ]
    }
  ]
}
```

正式运行前可以检查配置，不启动模型：

```bash
/绝对路径/pi_case/pi_squad/controller/bin/controller doctor \
  --project-root /绝对路径/你的项目 \
  --pi-binary /绝对路径/pi-1.1.0/node_modules/.bin/pi
```

Controller 尚未启动时 `discovery_error` 是预期结果；没有真实 probe 时 `formal_execution_ready=false`。配置加载成功和宿主版本匹配仍不代表正式执行已验收。

## 启动与创建 Run

所有终端都从工作 Project 的 cwd 启动；构建后的二进制和 Extension 可位于另一个目录。

Controller 单独一个终端：

```bash
/绝对路径/pi_case/pi_squad/controller/bin/controller serve --max-parallel-tasks 4
```

Leader 和三个不同 Role 分别各开一个 Pi 终端。以下假设已通过 `pi install` 安装 package；若选择显式加载，在每行 `pi` 后追加前文的 `--no-extensions -e ...`：

```bash
PI_SQUAD_MODE=leader PI_SQUAD_AGENT_ID=stats-lead PI_SQUAD_TEAM_ID=stats-team pi
PI_SQUAD_MODE=role PI_SQUAD_AGENT_ID=counter-primary PI_SQUAD_ROLE_ID=counter pi
PI_SQUAD_MODE=role PI_SQUAD_AGENT_ID=summer-primary PI_SQUAD_ROLE_ID=summer pi
PI_SQUAD_MODE=role PI_SQUAD_AGENT_ID=reviewer-primary PI_SQUAD_ROLE_ID=reviewer pi
```

每个 Pi 用 `/squad whoami` 检查 Project、mode、Agent/Role/Team、binding 和 host。Leader 的 Agent ID 必须与 `leader.agent_ref` 一致。模型、provider 和登录使用 Pi 自身配置。

另一个终端打开 Go Dashboard：

```bash
/绝对路径/pi_case/pi_squad/controller/bin/controller tui
```

在 Leader Pi 创建示例 Run：

```text
/squad run stats-team 统计 numbers.txt 的条数与总和，并独立验收
/squad status
/squad dashboard
```

`run` 使用 Team 的 `default_workflow` 并选中返回的 Run ID；Pi 命令没有 `--workflow` 选项。需要指定其他 Workflow 时，使用 `controller run <team> '<goal>' --workflow <id>` 或空闲 Leader 的 `squad_run_create` 工具，再用 `/squad use-run <run_id>` 选中。

同一个 Role 首个成功绑定的 Agent 为 Primary；后续 Agent 为 Secondary，不自动晋升，也不增加 Team 的执行容量。Controller 不启动 Pi、不清历史、不自动 `/new`。退出 Go Dashboard 的 `q` 只关闭观察者。

## 配置参考

### 启动身份与 Controller 发现

| Pi 环境变量 | 含义 |
|---|---|
| `PI_SQUAD_MODE` | `leader` 或 `role`；未设置时 Extension no-op，不添加 Squad 工具与 gate |
| `PI_SQUAD_AGENT_ID` | 稳定的小写 Agent ID，重新启动仍使用同一逻辑 ID |
| `PI_SQUAD_TEAM_ID` | Leader 必填，对应 Team 目录 ID |
| `PI_SQUAD_ROLE_ID` | Role 必填，对应 Role 目录 ID |
| `PI_SQUAD_CONTROLLER_URL` | 可选显式地址；仍必须与 Project discovery 的身份握手匹配 |

Controller 默认监听 `127.0.0.1:0` 并持有唯一 Project 进程锁，数据库为 `.agents/pisquad/.runtime/state.sqlite`。原子写出的 `.runtime/controller.json` 包含实际 endpoint、Project、协议、Controller ID/epoch；客户端核对 `/health` 后连接，不回退固定端口。显式 URL 也不能跨 Project 或跳过该校验。

Controller 配置优先级：显式 flag > `PI_SQUAD_*` 环境变量 > `--config` 文件 > 默认值。不指定 `--config` 时不搜索文件。

| flag / 配置键 | 环境变量 | 默认值 / 用途 |
|---|---|---|
| `--project-root` / `project-root` | `PI_SQUAD_PROJECT_ROOT` | cwd 向上发现的起点 |
| `--listen` / `listen` | `PI_SQUAD_LISTEN` | `127.0.0.1:0`，服务监听 |
| `--db` / `db` | `PI_SQUAD_DB` | Project `.runtime/state.sqlite`；显式覆盖用于隔离验收，仍持 Project 锁 |
| `--max-parallel-tasks` / `max-parallel-tasks` | `PI_SQUAD_MAX_PARALLEL_TASKS` | `2`，Project 同时执行的 segment 上限，必须正整数 |
| `--heartbeat-timeout` / `heartbeat-timeout` | `PI_SQUAD_HEARTBEAT_TIMEOUT` | `15s`，超时 suspect、两倍超时 offline；均不释放资源 |
| `--lease-ttl` / `lease-ttl` | `PI_SQUAD_LEASE_TTL` | `30s`，执行许可期限；过期隔离，不视为停止证明 |
| `--url` / `url` | `PI_SQUAD_CONTROLLER_URL` | discovery，供 CLI/Go TUI 使用 |
| `--config` | — | 可选 YAML/JSON 配置路径 |
| `serve --rotate-operator-token` | — | 停服后下次启动显式轮换 operator 凭据并审计 |

需要模型创建 standalone root 时，Controller 配置文件须显式授权 caller 与 target：

```yaml
direct:
  allowed_callers: [operator-agent]
  allowed_targets: [reviewer-agent]
  allowed_tools: [read, grep, find, ls]
```

caller/target 默认空，工具默认 `read/grep/find/ls`。显式 operator 命令可创建只读 standalone；模型调用仍受 direct 授权约束。

### Team 与 Workflow 规则

- 配置检查 UTF-8、64 KiB 单文件上限、精确大小写、未知/重复字段、ID 引用、目录和版本。损坏的 Project 标记、越界 symlink 或权限错误会报错，不向上回退另一个 Project。
- Role 正文在进程启动时固定，修改后需重启 Pi；`/new`、`/reload` 不更换身份。`agents.md` 在新 Attempt 固定，同 Attempt continuation 不刷新。Team instructions/policy/Workflow 在 Run 创建时固定；改内容须增加 `config_version`。
- `members` 的 `role_ref` 不重复，`responsibility` 非空。`allowed_tools` 与 `writable_roots` 必须显式数组。Team 数量预算计整个 Run 的业务 Task，Attempt 和委派深度另受各自预算约束。
- Team 必须声明可解析的 `acceptance_policy.mode`，当前为 `review` 或 `checker`。缺失时报告 `ACCEPTANCE_POLICY_MISSING`，不创建业务 Run/Task。
- `review` 需要 roster 内的独立 `reviewer_ref`；`checker` 需要内置 `checker_ref`。`child_policy` 为 `inherit_parent` 或 `separate`；standalone 默认 human。review 控制 Task 不递归申请 reviewer。
- Workflow 的 step 必填 `id/role_ref/kind/goal/depends_on`；kind 为 `execute/review/rework/ask`。可选 `refs/expected_output/acceptance/write_set/rework_of`。依赖条件为 `execution_completed/acceptance_accepted/review_rejected`；环、重复依赖和预算超限拒绝。
- `expected_output` 支持严格 JSON schema 子集：`type/properties/required/items/enum/additionalProperties/minimum/maximum/minItems/maxItems`，未知关键词拒绝。`acceptance` 是验收说明，不能覆写冻结的权限或 policy。

需要写文件时，Team 的 `allowed_tools` 加入 `write/edit`，`writable_roots` 明确允许的 Project 相对根，并给具体 Task 声明 `write_set`。仅在 Team 开启工具不会自动给予任意路径写权限。

standalone root 最多 20 个 child（包含所有层级后代，不含 root）、深度最多 3、每 Task 最多 3 个 Attempt；工具只读。子任务继承父 scope、预算与工具上限。

## Pi 会话命令

除 `/pisquad-use` 与旧别名外，下列入口均以 `/squad` 开头。`/squad help` 显示当前实现的语法。

### 查询、创建与交接

| 命令 | 行为 |
|---|---|
| `help`、`whoami` | 帮助；身份、host、disabled_reason、active_tools 和 tool_contracts |
| `agents`、`roles`、`teams` | Project snapshot 查询，不启动模型 |
| `run <team_id> <goal>` | 显式创建并选中 Run |
| `use-run <run_id>` | 显式选择非终态 Run；当前有正式 Attempt 时拒绝切换 |
| `status [run_id]`、`task <task_id>` | snapshot 或指定 Run/Task 查询 |
| `call role:<id> -- <goal>` | 当前 Run 内 handoff |
| `call agent:<id> -- <goal>` | 只读 standalone；活动来源 scope 与目标 Role ownership 仍检查 |
| `call role:<id> --write <path> --parent current -- <goal>` | 当前正式任务的 child intent，父 yield 后才能派发 |
| `ask role:<id> -- <question>`、`ask agent:<id> -- <question>` | 受管 ask Task；目标仅取得当前问题的查询/回复工具 |
| `send agent:<id> <text>` | passive notice，不启动模型 |
| `inbox`、`transport` | 收件；连接与本地 execution_gate 诊断 |
| `request <request_id> [--runtime]` | 查询 operator 或当前 runtime 的提交结果 |
| `dashboard` | Pi 原生观察面板；角色/Leader 管理须进入预览并显式提交 |
| `/pisquad-use` | 选当前 Run Role 填草稿，不提交；取消保留草稿 |

保留 `/squad-whoami`、`/squad-inbox`、`/squad-transport` 三个别名，参数校验与对应子命令一致。只读命令拒绝多余参数；带引号的参数必须闭合。call/ask 可不带 `--` 直接写正文；有选项时选项必须在 `--` 前，未知、重复或缺值选项拒绝。Pi call 的 `--write` 只接受一个路径；CLI 的 `--write` 可重复。

行首 `@role:counter 统计数据` 或无文件歧义的 `@counter 统计数据` 路由当前 Run，Role 与正文之间也可换行。`@./file`、`@src/file` 保留 Pi 文件语义；同名文件用 `@role:<id>` 消歧。正文/email/代码块中的 @ 不路由。空任务、多目标、图片/附件拒绝；已识别 handoff 失败不会回落为本地模型任务。

补全与 Picker 使用当前 Run roster，显示 Primary、presence/activity、owner 和观察版本。Picker 打开期间草稿变化时不覆盖编辑器。快照只是观察，提交仍由 Controller 检查当前 scope、ownership 和 revision。

### 用户输入与人工介入

活动 Leader 的普通输入持久化为 Run guidance，安全 settled 后进入下一协调轮。活动 Worker 的普通输入、`/squad takeover`、实际 session/branch 更换、用户 `!bash`，以及确实中止正式 segment 的 manual compaction，会中断执行并向等待祖先传播。

只读查询、Dashboard、selector 取消和自动 compaction 不构成接管。已 suspended 且无活动 segment 时的纯上下文压缩保留快照；“Nothing to compact”不会污染下一 continuation。原生切换或手动压缩已发起 abort 后，扩展仍等待真实 idle 且无 pending 的停止证明，不把旧结果抢先判为完成。

## 模型工具与协作流程

工具由扩展注册，实际可用集合随片段变化；模型不能调用 operator 恢复、换人或跨 Team 管理接口。

| 场景 | 工具 / 用法 |
|---|---|
| 普通 Worker 执行 | 配置允许的文件工具，以及 `agent_invoke/agent_task_get/agent_task_complete/agent_task_yield/agent_clarify` |
| clarification 的 response-only | 仅 `agent_task_get/agent_clarification_answer` |
| 正式 ask | 仅 `get_message/reply_message`，message_id 必须是当前 ask Task ID |
| 空闲 Leader | `squad_run_create` 创建自己的 Team Run，`agent_task_get` 查询 |
| Leader 协调轮 | `squad_run_get/agent_task_get/squad_decide`；decision 为 `dispatch/wait/complete` |
| 普通 Role 的身份与通信 | `list_agents/get_agent/read_inbox/get_message/send_message/reply_message`，仍按来源与目标权限检查 |

`agent_invoke.target` 使用裸 ID：Team child 填 `role_id`，standalone 填已授权 `agent_id`；`role:`/`agent:` 前缀仅用于命令。invoke 异步返回 Task ID，不等待模型结果。正常父子流程为：创建 child → `agent_task_yield` 结束当前片段 → Controller 等真实 settled 并运行 child → 同 Attempt 的新 segment 续接父 → 查询结果并完成父。

子任务需要澄清时调用 `agent_clarify({question})` 并结束片段；父仅在 response-only 片段通过 `agent_clarification_answer({answer})` 回答，不能借此继续业务工作。

Worker 用 `agent_task_complete` 提议结构化 `value`，可带 `artifacts` 与精确 `refs`。review 的 value 必须包含 `decision`（`accepted/rejected`）、非空 `reason` 和 `candidates` 数组；每个 candidate 带 `task_id/result_revision/hash`，并是该 review 的 `execution_completed` 依赖。候选和 reviewer 必须独立，换会话不能规避同 Agent 自审检查。

Leader 决策前通过 `squad_run_get` 读取一次新 snapshot 中的 Run revision、任务状态/结果/验收和 blocker。顶层 `revision` 用于 `squad_decide.expected_revision`；`snapshot_revision` 仅用于观察排序。不能刷新 revision 后继续用旧 briefing 作决定。`complete` 是意图，仍须 Leader 自身 settled 和最终 Gate 通过；期间 guidance 等推进版本后需重新提议。

状态修改工具为 `model-only`、`sequential`，拒绝嵌套控制调用。成功的 completion/yield/clarify/answer/decision 与正式 ask reply 返回 `terminate: true`；错误、invoke、Run create、notice 与被动 reply 不终止。混合工具批次仍按 Pi 的“全部最终结果均 terminate”规则结束，Controller 不以该标记代替真实 settled。

`send_message(kind=notice)` 与普通 reply 只展示消息；`kind=ask` 创建统一 Task/Attempt，当前有任务时应改用当前 scope 的 `agent_invoke`。消息发送固定精确 runtime/session 和 request_id，不猜联系人；离线失败记录不自动补投，绑定变化使旧待处理消息失效。

## 执行许可、结果与验收

Controller 是唯一 SQLite 写入者；Extension 通过派发许可执行当前片段。Run 准入原子占用整个 roster；同 Team FIFO 单活跃，相交 Team 整体排队且不占部分 Role，不相交 Team 可在 Project 容量内并行。Run 终止且 cleanup 完成后整体释放。

Project 和 Team 的 max_parallel_tasks 同时约束执行；LeaderStep 和 clarification 片段也使用同一容量，每个 Agent 串行执行。yield 释放执行容量供 child 使用，不释放父的会话 affinity 与写 reservation。

活动 Run 占用的 Role，其 Primary 与 Secondary 都拒绝外部 standalone、ask、peer invoke 与 direct，返回 `ROLE_BUSY` 及占用 Team/Run。Secondary 不可绕过 ownership。整体排队 Run 可保存自己 roster 的 handoff，但准入前不产生 Attempt。

正式许可要求完整 binding/session、Controller epoch、Attempt、segment、fencing token 匹配，且 lease 有效。只有 running/result_proposed、未 released 的片段可执行工具；suspended 保留 affinity 与写 reservation，释放执行容量，但没有工具执行许可。适配器每秒检查，许可剩余少于 20 秒时续约；默认 TTL=30s 时通常约 10 秒续约，迟到心跳不能复活过期 lease。

受管文件工具为 `read/grep/find/ls/write/edit`，沿用 Pi 原生输出截断；Squad 查询/控制工具也截断展示，结构状态保留在 details。正式工具不能访问 Project 控制目录、根 `AGENTS.md`、`.git` 或嵌套 Project。write/edit 使用 Pi 原生文件 mutation queue，在真正操作前再次检查发起时的 Attempt/segment/binding/generation、允许根和 write_set；已开始的文件系统操作不承诺回滚。

read 返回实际读取字节的 `{path,sha256,length}` artifact，可以直接放入 completion 的 artifacts；无需 shell 计算 hash。提交和验收时再次核对长度与 hash，文件变化会使证据失效。Task refs 的 revision/hash 必须成对，重复引用拒绝；未固定版本的请求引用只能使用 revision=0、空 hash 和 length=0，由派发固定。

结果状态依次区分 **result_proposed → completed → acceptance accepted/rejected**。completed 需要匹配的成功收尾、idle/no pending、schema、refs 与产物校验；不能据此宣称业务验收。父验收覆盖仅对当前版本且无 blocker 的 completed 父子成立；amend、retry、cancel、interrupt 或引用变化会撤销过期覆盖。返工链也须当前替代结果有效并通过验收。

当前 Team checker 只有 `numbers-count/numbers-sum/numbers-stats`，核对实际文件字节、hash/长度与 count/sum，拒绝非有限数和合计溢出。一般项目用 review；standalone human 由操作者显式 accept/reject。

## 取消、对账与恢复

管理命令读取本地 `.runtime/operator.token`（0600），使用当前 revision 做 CAS；模型工具没有该管理授权。除 amend 外，以下 Pi 管理命令支持 `--preview`，只显示请求不提交；去掉该选项才正式提交。amend 后全部内容都是正文，正文中的 `--preview` 不会取消提交。

| Pi 命令对象 | 支持的操作 |
|---|---|
| Run | cancel、resume |
| Task | cancel、amend、recover、retry、rebind、accept、reject |
| Attempt | reconcile |
| Role | release、promote |
| Team Leader | release |

```text
/squad cancel run:<id> --note <reason> --preview
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
/squad role release <role_id> --note <reason>
/squad role promote <role_id> <secondary_agent_id> --note <reason>
/squad leader release <team_id> --note <reason>
```

### 选择恢复动作

| 所见状态 / 意图 | 操作与边界 |
|---|---|
| 请求超时或提交结果不明 | 用原 request_id 查询事实；不要重新创建或盲目重放注入 |
| 旧 Attempt 的执行是否停止不明 | 先核对原 runtime 与相关子进程；`reconcile` 人工确认停止，超时/offline/lease 过期不算证明 |
| 已保存候选结果，想保留这次执行 | cleanup 完成后 `recover` 挂接本 Task 的 `attempt:<id>` 或 `evidence:<seq>`，不运行模型；不接受任意文件路径作为该引用 |
| 需要重新执行，已有 Attempt | `retry --rebind-current` 新建带 retry_of 的 Attempt，保留历史并检查预算 |
| 已 accepted、有冻结目标、无任何 Attempt 的非终态 Task | `rebind --rebind-current` 显式授权当前绑定；planned 或已有 Attempt 的任务不能用它绕过调度/恢复 |
| Run 的恢复 hold 已处理 | 所有未确认执行和未解决 Task 清理后 `resume`；终态 Run 不能恢复 |
| 需要更换 Leader | 先显式 release 原 Leader，注册当前 Leader；resume 还须 `--expected-runtime <旧UUID> --rebind-current` 承认旧绑定变化 |
| human-policy completed 结果待验收 | 核对当前结果后 accept/reject；不能覆盖固定 checker/reviewer policy |

Controller 重启后，未释放的执行保持隔离；已受理但尚无 Attempt 的 standalone Task 也进入 needs_review，目标上线不自动派发。Role release 不解除 Run ownership，也不自动提升 Secondary。runtime release 只撤销 UUID，不终止进程。

取消 child 会向等待祖先传播 cancel_requested。取消不等于停止，旧 Attempt cleanup 未释放仍阻止 Run 完成。未被依赖或引用的已取消过期 Task 不单独阻挡最终 Gate；仍被引用时先修订依赖。迟到 poll、注入 ACK 或收尾回调不能推进新会话/片段。

### CLI 与 HTTP 管理

以下 `controller` 指构建后的绝对路径，在 Project cwd 使用：

```bash
controller snapshot
controller agents list
controller agents get counter-primary
controller run stats-team '统计 numbers.txt' --request-id <key> --workflow stats
controller task role:counter '统计条数' --run <run_id> --preview
controller task agent:reviewer-primary '只读核对文件' --request-id <key>
controller task role:summer '计算总和' --parent <task_id> --expected-revision <n> --preview
controller operate task <id> retry --expected-revision <n> --rebind-current --note '重新执行原因' --preview
controller agents release <agent_id> --expected-runtime-id <UUID> --expected-revision <binding_epoch> --note '释放原因' --preview
```

`task` 支持 `--request-id/--run/--parent/--expected-revision/--kind/--write/--preview`；`--write` 可重复，关联 parent 必须给其 revision。`operate <kind> <id> <operation>` 的 kind 为 run/task/attempt/role/leader/agent，必须给 `--expected-revision`，其他参数按操作使用 `--request-id/--expected-runtime/--agent-id/--note/--evidence/--result-hash/--confirm-stopped/--rebind-current/--preview`。CLI 验收须明确当前 `--result-hash`；Pi 命令从当前结果读取该值。

CLI 的 Run 操作还支持 `guidance --note '<补充指导>'`，Agent 操作支持 release；Pi 活动 Leader 的普通输入已经走 guidance，不提供同名 `/squad guidance` 子命令。

HTTP human acceptance 可使用 `POST /v2/tasks/{id}/acceptance`，包含 `request_id/expected_revision/decision/result_hash/note` 和可选 evidence，decision 为 accepted/rejected。与 `/accept`、`/reject` 共用鉴权、CAS、幂等与审计；请求结构由 `controller schema` 导出，详见 [HTTP 契约](protocol/README.md)。

管理 CAS 或业务校验拒绝仍记录 request_id、目标、原因与错误码，不推进业务 revision。`/squad request <id>` 可见 rejected；`--runtime` 不能读取 operator 审计。operator 请求和 runtime 请求按各自认证来源查询。

## 观察、诊断与请求证据

Pi 1.1.0 的 `agent_settled.aborted=true` 按取消处理，优先于缓存的 completed outcome。运行 probe 的成功生命周期必须包含明确的 `aborted=false`，旧 profile 或缺少取消标记的报告不能证明当前宿主就绪。

### Dashboard 与连接

Go `controller tui` 是只读观察者。Tab 切视图、`/` 筛选、方向键选择/滚动、Enter 详情、`r` 重新发现并刷新、`q` 退出。Pi `/squad dashboard` 也支持 j/k、Escape 与 Backspace，使用 Pi 原生按键解析；roles 视图的 `p` 可预览 promote/release，leaders 视图可预览 release，输入原因后仍须选择“显式提交”。预览后本地会话或 Controller 变化则重新预览；服务端仍做精确 CAS。

面板显示 Team/Role/Agent/Run/Task/Attempt、lease/wait/blocker/evidence，以及 epoch/revision/age/stale。Team 详情汇总当前 Leader、Primary/Secondary/owner、活跃与排队 Run；Run 的 current_roster 是当前观察，原 leader/config_snapshot 是冻结快照。next_step 是说明，不代替操作权限。未注册 Primary 的 Role 显示 unassigned，也可能仍有 ownership。

SSE `/v2/events` 是可丢失的投影失效提示；断线、gap、epoch/Controller 变化后重新发现并读取 snapshot，再继续观察。旧响应与较低 revision 不能覆盖新状态。恢复观察不恢复执行、不自动重发写请求。`/squad transport` 显示脱敏的 gate frozen/generation/Attempt/segment/cleanup_state，可区分连接故障与执行对账。

### doctor 与真实 probe

```bash
controller doctor --pi-binary /绝对路径/pi-1.1.0/node_modules/.bin/pi
controller doctor --pi-binary /绝对路径/pi-1.1.0/node_modules/.bin/pi --probe-file <脱敏报告路径>
controller schema
```

doctor 不启动模型。不指定 `--pi-binary` 时检查 PATH 上的 pi；报告包含实际版本、profile、入口路径/hash、可选声明诊断和 CLI 配置的 configured_timing。服务实际 timing 来自在线 snapshot；suspect_at/offline_at 与 lease_expires_at 分开显示。来源 commit 缺失显示 unknown。

没有真实 probe 时 `formal_execution_ready=false`。声明文件缺失不单独判不支持；schema 1 只作旧版诊断。schema 2 核对报告的版本/profile/TUI/所选安装入口与 hash，再检查同一有序核心事件链。静态声明、历史文本里的 Task ID、单独 terminate 标记都不构成执行证据。

需要采集时，兼容 probe **最后加载**，关闭自动发现以固定顺序：

```bash
PI_SQUAD_MODE=role PI_SQUAD_AGENT_ID=counter-primary PI_SQUAD_ROLE_ID=counter \
  /绝对路径/pi-1.1.0/node_modules/.bin/pi --no-extensions \
  -e /绝对路径/pi_case/pi_squad/extension/index.ts \
  -e /绝对路径/pi_case/pi_squad_case/04-team-orchestration/compatibility/pi-probe.ts
```

完成真实正式任务后在 TUI 执行 `/squad-probe-save`，报告位于当前 Project `.agents/pisquad/.runtime/integration-probes/<session_id>.json`。生产 hook 标为 squad_hook，末位 observer 标为 last_observer；加载顺序与报告一起核对。生产入口不加载故障注入实现。

核心判断要求：extension input → 当前任务 sections/tools → 匹配的 canonical 上下文 → 同 request_seq 的末位有效 provider system/tools → completed agent_before_settle → idle 且无 pending 的 agent_settled。Task/Attempt/segment、role/working/config/section hash 与工具集合须一致。ordered_core_lifecycles 保留首尾 seq 供复核；未知请求格式或缺失当前 section 不会判就绪。

报告只保存结构、版本、ID、hash、工具名称与事件顺序，不保存原始 prompt/request/headers 或凭据。就绪证明仅针对已观察到的宿主核心链，不替代业务验收或所有 provider 场景验收。

## 从旧目录迁移

不会自动加载或移动 `.agents/roles/`。在旧 Project 根显式运行：

```bash
controller migrate --dry-run --source-db /绝对路径/旧库.sqlite
controller migrate --dry-run=false \
  --source-db /绝对路径/旧库.sqlite --mapping /绝对路径/mapping.json \
  --confirm-old-writer-stopped
```

无旧库时省略 `--source-db`。mapping 是完整 TeamSnapshot JSON 数组，每项包含 config/instructions/workflows；`[]` 明确表示仅 standalone，不推断 roster。执行前停止旧写入者。迁移检查冲突、复制 staging、严格加载、做 SQLite 一致备份并核验，再原子发布；保留旧角色和旧库，不覆盖已有 Project。备份与 manifest 位于新 `.runtime/`。

## 当前限制与排错

当前实现适用于可在固定预算内完成的短任务。下面是实际边界，不是已开放的配置选项：

- **120 秒硬截止**：planned 节点在 accepted 时冻结 deadline_at；未受理节点不因等依赖或 Run 准入消耗预算。已受理后的队列、执行、yield/续接共用该截止，当前不可配置；超时会中断，不证明执行已停止。
- **child 必须 yield**：创建未完成 child 后直接完成父可能留下 parent_yield blocker。按正常 invoke→yield→continuation 流程工作；出现孤儿任务须显式取消和对账。
- **验收器范围**：内置 checker 只支持数字 count/sum/stats，一般项目配置 review；未提供自定义 checker 注册入口。
- **本地权限边界**：正式片段受 gate 限制；空闲 Role 使用普通 Pi 工具时 shell 不属于该 gate 的文件访问隔离。不要把 operator token 的“未进入提示/事件”理解为同 OS 用户或任意 shell 无法读取它。
- **历史与长期运行**：不会自动隔离或清空 Pi 历史，也没有任务历史归档入口；长 Leader 会话和长期积累的数据需要操作者关注。Herdr pane 自动定位与进程代启动未在此版本提供。

| 现象 / 错误 | 处理 |
|---|---|
| 没有 Squad 命令 | 核对加载入口、PI_SQUAD_MODE 和 Project/Role 配置；未设 mode 是 no-op |
| SQUAD_HOST_UNSUPPORTED / SQUAD_MODE_UNSUPPORTED | 使用实际 Pi 1.1.0 TUI；用 whoami.host 或 doctor 核对，源码版本不能代替 |
| 首次发现/握手失败 | 注册前失败会恢复普通 Pi；修复连接后 reload。绑定已存在或注册结果不明时仍保持隔离，先查事实 |
| 重复 Leader 注册 | 被拒进程恢复普通 Pi，whoami 显示 disabled_reason/active_tools；解决身份冲突后重启或 reload |
| ROLE_BUSY / waiting_roles | 看实际占用 Team/Run；释放方式为取消占用 Run 并等待 cleanup，offline 不释放 ownership |
| TASK_TOOL_UNAVAILABLE / exposure 或 active 集合不符 | 核对完整注册工具及 whoami.tool_contracts；移除排除 Squad 工具的白名单，缺能力不强行注入 |
| RESULT_VERSION_CONFLICT / artifact 变化 | 查询当前结果、引用与文件；更新任务或返工，不对旧版本强行验收 |
| EXECUTION_UNCONFIRMED / needs_review | 核对旧 Attempt 的停止/副作用，选择 reconcile 后 recover/retry；不要靠 reload 重派 |
| STORAGE_UNAVAILABLE（HTTP 503） | 修复 SQLite 空间、I/O、只读等问题，用原 request_id 查提交事实，再由操作者显式同键重试；失败响应不代表已接受 |

首次激活的能力拒绝、已绑定执行的隔离、恢复操作与版本化验收是不同状态；遇到错误先查看 whoami、transport、Task/Attempt 和 request_id，不用“重新启动”替代对账。

实现位置见 [README 源码导航](README.md#实现导航)，协议字段见 [protocol/README.md](protocol/README.md)，需求与验收仍以 [阶段 04](../pi_squad_case/04-team-orchestration/README.md) 为准。
