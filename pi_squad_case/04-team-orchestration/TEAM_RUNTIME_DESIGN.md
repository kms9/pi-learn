---
title: Pi Squad Team Runtime 技术设计
type: process
status: draft
created: 2026-09-25
updated: 2026-09-25
implementation_status: not_implemented
acceptance_status: not_run
baseline_commit: 23caab1105f71e3cb0ff67671eb63a9c7f85160a
tags: [pi-squad, team-runtime, design]
---

# Pi Squad Team Runtime 技术设计

需求及验收编号见 [需求文档](TEAM_RUNTIME_REQUIREMENTS.md)。以下 schema、接口和参数是拟实施契约，不是已发布 API。基线为本轮读取的本仓 HEAD；没有启动 Pi、修改实现或执行运行验收。

## 1. 当前实现与改造边界

| 当前证据 | 已有行为 | 改造点 |
|---|---|---|
| `pi_squad/extension/config.ts` | cwd 下 `.agents/roles/<id>/role.md`；name/description frontmatter；拒绝旧 JSON 配置 | 专属目录、向上发现、按 ID 精确加载、Leader 模式、agents.md |
| `extension/runtime.ts`、`index.ts` | 进程缓存 setup/UUID/token，before_agent_start 追加 role prompt | 身份缓存保留，动态规则改为 attempt 快照，区分 Leader/Role 注入 |
| `controller/agent/model.go`、`registry.go` | 单值 squad_id、实例凭据、session 绑定 | mode、role_id、leader_team_id、成员关系与执行状态分离 |
| `controller/agent/messaging.go` | 同 squad 校验；绑定双方 UUID/session | 将授权改成明确的 Team/Run 或 direct scope，不能简单删除比较 |
| `extension/messaging.ts`、Controller HTTP/SSE | inbox 持久化、SSE 唤醒、ask 工具约束 | 复用传输；任务不能伪装成 ask；增加同一 Pi 工作槽协调 |
| [阶段 04](README.md) | 规划中的 DAG、Leader 决策、review/rework、write lease | 保留语义；旧 UDS/独立 cmd/squad 布局不照搬到当前 HTTP 代码 |

Go 仍使用现有 Gin、SQLite、Cobra/Viper、Resty、Bubble Tea 分层，遵守 [Controller AGENTS](../../pi_squad/controller/AGENTS.md)。不引入 Redis 或新工作流服务。

## 2. Multica 的事实与本项目选择

上游核对日期 2026-09-25，固定 SHA `1c908ea52c19f193d301ca9460fc1d7d100a1b3d`。以下 URL 均固定版本；只读核查，没有运行上游。

| 事实与证据 | 对 Pi Squad 的启示 |
|---|---|
| [Squads 文档](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/apps/docs/content/docs/squads.mdx)：一个 Leader，成员可在多个 Squad；职责描述不授予权限 | Team 是成员拓扑，成员职责描述不能替代授权。 |
| [084 migration](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/migrations/084_squad.up.sql)：squad_member 唯一键是 squad_id/member_type/member_id | 同成员跨 Squad 合法；不能以 Agent.squad_id 表达全部关系。 |
| [127 migration](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/migrations/127_task_squad_id.up.sql)：leader task 自带 squad_id，明确避免从 agent 反查多个所属 Squad 的歧义 | Task 必须携带当前 Team ID，不从 membership 或提示文本猜测。 |
| [squad_briefing.go](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/internal/handler/squad_briefing.go)：组装 protocol、roster、instructions | Leader 动态简报按当前 Team 构建，Worker 无需全部团队配置。 |
| [prompt.go / taskIsSquadLeader](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/internal/daemon/prompt.go)：现代协议用 leader_role_resolved/is_leader_task 等字段，Leader 是 per-task 身份；仍有旧服务端兼容分支 | 不靠可编辑 Markdown 推断身份。本项目进一步约束：启动 mode 固定，当前 Task kind 必须匹配它。 |
| [squad.go](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/internal/handler/squad.go)：name、description、leader_id、instructions，成员 member_type/member_id/role，Leader 自动加入成员 | 借鉴字段职责，不声称上游提供本地 team.json。 |
| [task.go / claimTask](https://github.com/multica-ai/multica/blob/1c908ea52c19f193d301ca9460fc1d7d100a1b3d/server/internal/service/task.go)：事务内锁 Agent、校验 runtime、检查 max_concurrent_tasks 后领取 | 采用原子领取思想；Pi 单 session 限制为 1，SQLite 实现，不照搬其 PostgreSQL SQL 或自动回收策略。 |

Multica 的 membership、当前 task 身份、会话连续性是不同维度；这些证据不足以证明其自动提供“跨 Team 历史隔离”。本项目也不作该承诺。

## 3. 目录、发现与 Controller 生命周期

```text
<project_root>/
├── AGENTS.md                         # 通用项目规则，仍由 Pi 正常加载
└── .agents/pisquad/
    ├── config.json                   # 项目容量/协议配置，拟新增
    ├── roles/
    │   └── reviewer/
    │       ├── role.md               # 稳定模板
    │       └── agents.md             # 经常更新的角色工作规则
    ├── teams/
    │   └── coding-team/
    │       ├── team.json
    │       ├── instructions.md
    │       └── workflows/default.json
    └── .runtime/                     # 整体 gitignore
        ├── controller.lock
        ├── controller.json
        ├── state.sqlite              # 含任务租约；同目录 WAL/SHM
        ├── sessions/<agent_id>/       # Pi 原生 session 存储
        ├── snapshots/<sha256>.md      # 实际注入的规则快照
        ├── runs/<squad_run_id>/       # 协作记录、默认报告
        └── logs/
```

业务产物可写授权的项目路径；“所有状态归入 pisquad”不意味着业务代码只能放这里。Task write_set 指向业务文件时依旧按实际路径协调。

发现算法：先 realpath(cwd)，向父级查找最近 `.agents/pisquad`，找到即停止；若该标记损坏，报错，不回退外层项目。校验 ID 为小写字母/数字和连字符；目录/固定入口拒绝 symlink、`..`、绝对路径和越界。project_root 为 `.agents` 的父目录。Controller 从相同规则解析，显式项目参数必须与发现结果一致。

Controller 顺序：

1. 创建 `.runtime`（仅本用户可读写），对固定 `controller.lock` 取得 OS 排他锁并终生持有。锁文件存在本身不代表活跃；不用 PID 是否存在作为唯一依据，不 unlink 正被锁定的文件。
2. 打开本项目 DB，检查 schema 与项目标识；SQLite 不放网络盘，不允许两 Controller 共享库。
3. 监听 `127.0.0.1:0`（可显式指定 loopback 端口）；生成 controller_id 和每次启动不同的 controller_epoch。
4. 临时文件写入后原子 rename 发布 discovery；只在 HTTP 已就绪后发布。
5. 退出时仅清理仍属于自身 epoch 的 discovery，关闭服务/DB，最后释放 OS 锁。崩溃由 OS 释放锁；新实例取得锁后覆盖陈旧 discovery。

建议 discovery 字段：schema_version、protocol_version=`pi-squad/2`、controller_id、controller_epoch、project_root、endpoint、pid、started_at。health 返回相同项目/协议/epoch；Extension 全部匹配才注册。文件不包含 runtime_token。

`PI_SQUAD_CONTROLLER_URL`/Dashboard `--url` 可以显式覆盖发现的连接地址，但不得跳过项目/epoch 校验；不回退全局默认服务。未选 mode 不激活 Squad；显式选择但发现失败给诊断，并保持工具不可执行。工具注册发生在 Extension 初始化期，实施时可先注册再将模型可用工具设为空，成功激活才开放；工具 handler 再次检查，不能只靠工具可见性。

已激活后断线进入 unavailable，停止新执行，恢复只重连本项目并对账，不直接套用“初次未启用”的 no-op。首版 Controller 后启动可由用户重启/重载 Extension 重新发现，不要求后台全盘扫描。

## 4. 启动契约

| 参数（拟新增或适配） | 环境变量 | 规则 |
|---|---|---|
| `--squad-mode` | `PI_SQUAD_MODE` | `role` 或 `leader`；缺省不激活 |
| `--squad-role-id` | `PI_SQUAD_ROLE_ID` | 仅 role 模式必填 |
| `--squad-team-id` | `PI_SQUAD_TEAM_ID` | 仅 leader 模式必填 |
| `--squad-agent-id` | `PI_SQUAD_AGENT_ID` | 两模式均必填；保留长期身份 |
| `--session-dir`（Pi 已有参数） | 不新增 Squad 同名变量 | 启用 Squad 时规范化后须等于本项目 `.runtime/sessions/<agent_id>` |

显式 flag > env；最终配置再校验，leader 下环境遗留的 role_id 也报互斥错误，避免无意套上旧身份。扩展自定义 flags 用 `pi.registerFlag/getFlag`，不是直接改 Pi CLI。旧 `PI_SQUAD_ID` 不自动等同 Team ID，旧 `PI_SQUAD_CONFIG` 继续明确拒绝。

目标启动示例（整套能力待实现）：

```bash
PI_SQUAD_MODE=role PI_SQUAD_ROLE_ID=reviewer PI_SQUAD_AGENT_ID=reviewer-1 \
  pi --session-dir "$PWD/.agents/pisquad/.runtime/sessions/reviewer-1"

PI_SQUAD_MODE=leader PI_SQUAD_TEAM_ID=coding-team PI_SQUAD_AGENT_ID=coding-lead \
  pi --session-dir "$PWD/.agents/pisquad/.runtime/sessions/coding-lead"
```

示例 cwd 为项目根。子目录启动须用解析后的项目绝对路径。原生 `--session-dir` 证据为 `pi-dev/packages/coding-agent/src/cli/args.ts`；Extension 不在初始化后搬移已打开的 session。若不能确认实际 session 目录，则拒绝进入受管 Squad 模式并提示正确启动方式；普通 Pi 使用不受影响。

mode、role_id、leader_team_id 固定于进程生命周期，`/new` 只换 session；`/reload` 不偷偷换身份。Leader 重启换 Team 要显式释放旧身份并重注册，或使用新的 agent_id。禁止复用同一进程缓存中的身份做热切换。

## 5. 配置 Schema 与校验

### 5.1 Role

`roles/reviewer/role.md` 保持现有结构：

```markdown
---
name: reviewer
description: 独立检查结果及证据
---
你负责核对任务契约、结果与可复现证据；不虚报完成。
```

`roles/reviewer/agents.md` 是普通 Markdown，例如：

```markdown
# 当前工作约定
审查报告须列出复现步骤、证据路径与尚未验证的边界。
先确认被审产物的 hash，再形成结论。
```

选定 ID 只加载该目录固定两个文件；Controller 列表扫描可报告其它无效定义，但无关坏角色不阻止合法角色启动。目录名必须等于 name，UTF-8，单文件建议上限 64 KiB。必须检查实际文件条目大小写、普通文件属性；角色正文和规则原文不进公开 Registry，公开路径/hash/版本即可。

### 5.2 Team

`teams/coding-team/team.json` 示例：

```json
{
  "schema_version": 1,
  "team_id": "coding-team",
  "config_version": 1,
  "name": "编码小队",
  "description": "实现、核对与有界返工",
  "leader": { "agent_ref": "coding-lead" },
  "members": [
    { "member_id": "backend", "agent_ref": "backend-1", "role_ref": "backend", "responsibility": "实现业务变更" },
    { "member_id": "review", "agent_ref": "reviewer-1", "role_ref": "reviewer", "responsibility": "独立质量检查" }
  ],
  "instructions_file": "instructions.md",
  "default_workflow": "workflows/default.json",
  "policy": {
    "leader_can_execute": false,
    "allow_peer_invoke": true,
    "max_parallel_tasks": 2,
    "max_parallel_runs": 1,
    "max_delegate_depth": 3,
    "max_total_tasks": 20,
    "max_leader_turns": 30,
    "max_rework_rounds": 2,
    "require_review": true
  }
}
```

- `team_id` 必须等于目录 ID；`name` 仅显示。leader.agent_ref 必须匹配以该 team_id 启动的 Agent，Controller 不能仅相信客户端宣称 leader。
- members 为普通 Role 实例；每条 agent_ref 必填，role_ref 必須与注册角色匹配。相同 agent_ref 不得在同一 Team 重复；Leader 由 loader 加入 roster，无需在 members 重复声明。
- 本版不接受只有 role_ref 的自动选人，也不支持 human member；这是相对 Multica 的范围缩减。
- instructions_file 固定为本目录 `instructions.md`；workflow 可省略；有则必须位于该 Team workflows 内，无 symlink/路径穿越。
- policy 仅接受已支持字段，未知字段报错；计数为正整数（返工可为 0），上限不能突破项目限制；本版 leader_can_execute 只允许 false。
- config_version 单调递增；Controller 计算 team.json＋instructions＋workflow 内容 hash，同版本不同内容拒绝导入，避免静默更改。
- 活跃 Run 固定 Team 配置/roster 快照；注册实例变化不自动更新 Run 中的绑定，缺成员或替换后须显式对账/resume。

字段对照：Multica leader_id → leader.agent_ref；member_id → agent_ref；member role 文本 → responsibility；instructions → instructions.md。role_ref、本地目录、policy、workflow 和 config_version 均是本项目扩展。

项目 `config.json` 拟采用：

```json
{
  "schema_version": 1,
  "scheduler": {
    "max_active_tasks": 8,
    "max_active_teams": 2,
    "lease_ttl_seconds": 30,
    "renew_interval_seconds": 10
  }
}
```

数字为建议默认值，尚未性能验收；Agent 容量固定 1，首版不提供可调 >1。`max_active_teams` 指当前持有执行槽或隔离槽的不同 team_id 数量，不是配置数量或 waiting Run 数量。这样等待不永久占住 Team admission。direct 任务消耗项目/Agent 槽，不计 Team 配额。

## 6. 数据模型与权限迁移

| 实体 | 主键 / 关键字段 |
|---|---|
| AgentIdentity / Instance | agent_id；runtime_id、token_hash、runtime_session_id、mode、role_id nullable、leader_team_id nullable、project_root、online_state、activity |
| RoleDefinition | role_id、description、role_hash、working_instructions_hash |
| TeamDefinition | team_id/config_version/config_hash、leader_agent_id、policy |
| TeamMembership | team_id/config_version/agent_id 唯一；member_id、role_ref、orchestration_role=leader/member、responsibility |
| SquadRun | squad_run_id、team_id/config snapshot、roster snapshot、context_revision、status |
| Task | task_id、squad_run_id nullable、team_id nullable、kind=execute/review/rework/leader_step、target_agent_id、依赖、write_set、状态 |
| TaskAttempt | attempt_id、task_id、runtime/session binding、context hashes、result refs、状态 |
| ExecutionLease | lease_id、attempt_id、controller_epoch、fencing_token、binding、granted_at、expires_at、status |
| ResourceReservation | lease_id、资源键、权重、reserved/active/quarantined 状态；用于统一统计 |

TeamMembership 是配置的实例引用，不把 RoleDefinition 和 AgentInstance 塞在同一多态外键里。角色复用通过 role_ref 表达；Registry 查 membership 可知所有 Team，当前 Team 只能来自 active attempt。身份占用即使离线也保留，执行租约结束不等于 release Agent。

移除 squad_id 的步骤：

1. 备份 DB 到本项目 runtime 下；增加 schema/protocol v2 与新表/字段，保留旧消息的 squad_id 为历史授权快照。
2. 从显式 team 配置建立 membership；旧单值 squad 不能凭空推断 Leader、policy 或 role，需迁移映射。映射缺失时只保留历史，不开放新执行。
3. 注册、查询、heartbeat、SSE、消息/任务所有客户端协同升级；拒绝旧协议写入，不让两种授权模型混跑。
4. `list_agents` 改为 team_id 筛选关联查询；旧 squad_id 参数明确给迁移错误，不含糊复用同名字段。
5. 活跃旧消息先停新发送并排空/终结；状态不明记录保留，不能迁库时补投。历史绑定、request_id 幂等、revoked runtime 记录不能丢。
6. 验证迁移和失败回滚后再移除旧必填约束；不得用删库解决用户历史。

新的消息请求必须声明 `scope=team` 与 team_id，或 `scope=direct`。team scope 校验双方在同一明确 Team 的成员关系及 policy；绑定 Run 时以 Run 快照及权限上限为准。多个共同 Team 不自动任选其一。direct 默认拒绝，只有显式授权对才允许。回复按原消息冻结 scope 和双方绑定，不重新猜测 Team。通知不能构成任务执行授权。

## 7. 上下文拼装与规则更新

> 详细的 Prompt 分层、Pi `AGENTS.md` 保留策略、`systemPromptOptions.sections` 实现方式及 CTX 验收矩阵见 [Context Assembly 设计](CONTEXT_ASSEMBLY_DESIGN.md)。本节保留 Team Runtime 的数据/生命周期契约，具体组装以该文档为准。


```text
Pi 当前基础 system prompt（含正常通用项目规则）
  + Role 稳定正文 + agents.md 快照              [mode=role]
  或 Leader 系统协议 + 当前 Team instructions   [mode=leader]
  + Controller 验证的当前 Task/Run context
```

普通 Role 任务上下文至少包括 team_id（direct 为 null）、squad_run_id、task_id、attempt_id、kind、目标、验收条件、必要上游引用、工具上限、write_set、预算。Leader 额外获取当前 Team roster、在线/活动状态、DAG 摘要、待处理事件及 context_revision。不要注入所有 Team 指令。

租约凭据由 Extension 持有，不让模型填；模型可见 attempt 和关联 ID。用户可编辑提示文件不能覆盖 Controller 的身份、授权与 tool policy。Leader 协议、Team briefing 采用显式字段生成，不从 Markdown 标题推断身份。

规则生命周期：

1. Extension 接到任务准备请求，空闲时读选定角色的 agents.md，计算 hash，校验文件和大小，将快照持久到 `.runtime/snapshots`（敏感目录权限）。
2. acquire 记录此 hash；start 校验 snapshot 已持久、规则版本和当前绑定；实际 before_agent_start 使用同一份字节，不再次读文件。
3. 多轮 attempt 使用相同快照；内容更新只影响下一 attempt，包括新的 review/rework。通过 hash 可追溯每次尝试使用的规则。
4. 手工轮在开始时抓快照；读取失败阻止该 Squad 角色轮并显示原因，不静默沿用旧规则。非 Squad 普通 Pi 不受此限制。
5. role.md/启动身份仍保持进程快照；Team 配置固定于 Run；规则热读不得暗中改变它们。

上一次 Task 的当前上下文块结束后清除，但历史消息仍存在。resume/结果必须显式关联；不能把旧 session 的“已完成”当新 Task 的结果。角色规则优先级不能宣称高于宿主系统/用户/项目约束，工具授权由代码执行。

## 8. 统一执行租约协议

### 8.1 锁的种类

| 种类 | 用途 | 保存位置 |
|---|---|---|
| Controller OS lock | 同项目单服务实例 | `.runtime/controller.lock` |
| Agent identity ownership | 防止不同进程冒领 agent_id | SQLite Registry，显式 release 才撤销 |
| ExecutionLease | attempt 获得执行许可及容量 | SQLite，不能用每 Task 一个锁文件替代 |
| WriteReservation | 声明路径写入互斥 | SQLite，与 execution reservation 同事务 |

Agent resource key 为 project_root＋agent_id，绝不能包含 team_id。文件键为项目真实路径下规范化目标，未存在文件规范化其已存在祖先；检测父子 write_set 重叠。它只约束 Squad 声明写操作，不能阻止外部 Claude 或人修改文件；Acceptance Gate 再核验产物 hash。

### 8.2 拟新增 HTTP 契约

全部写接口绑定 agent_id/runtime_id/runtime_session_id 和现有私有凭据；Controller 校验 epoch，未授权的第三方不能代持目标租约。

| 接口 | 输入/语义 |
|---|---|
| `POST /tasks/leases/acquire` | task_id、expected_task_revision、request_id、规则 hash、当前绑定；目标 Extension 调用 |
| `POST /tasks/leases/start` | lease_id、attempt_id、epoch、fencing_token；实际模型启动前再确认 |
| `POST /tasks/leases/renew` | 相同绑定和 token；仅有效且未过期租约可续 |
| `POST /tasks/attempts/settle` | 绑定、token、结果状态/artifact refs；落结果与释放资源同事务 |
| `POST /tasks/leases/release` | 仅尚未 start 且确认未注入时可主动归还；重复操作幂等 |
| `GET /tasks/:id` | 查询队列、attempt、资源阻塞和恢复状态；不泄露私密凭据 |

成功 acquire 返回 lease_id、attempt_id、epoch、fencing_token、expires_at、完整冻结 TaskContract。容量不足返回可识别的 `capacity_unavailable` 和 blocked_on/retry_after，不改成 running；实现可用 409。401 凭据错误、403 scope 拒绝、409 版本/绑定冲突、410 过期租约。相同调用绑定+request_id+相同 payload 返回同一次结果；相同 key 不同参数 409。成功租约已过期时重复请求只返回旧结果及过期状态，不能悄悄产生新 attempt。

容量失败只幂等记录那次申请结果；下次调度事件用新 request_id 重新申请。网络结果不明则用原 key 查询/重试。未开始的执行通知可以重发，模型开始不承诺 exactly-once。

### 8.3 acquire 的短事务

```text
BEGIN IMMEDIATE
  校验项目/epoch/凭据/runtime/session
  校验 Task revision、kind、Run 配置与授权、依赖已满足
  校验 online、activity、无 Agent reservation 或 quarantine
  校验 global、Team task、active Team、write_set 资源可同时满足
  CAS task queued -> leased
  创建 attempt、递增持久 fencing_token
  一次性创建 lease 和全部 reservations，记录规则 hash/事件/幂等结果
COMMIT
再发通知；网络与模型不放进事务
```

检查并发和插入必须在同一事务；不能先各自 get-lock 再进入 DB。用唯一约束保证一个 Agent 最多一个未释放 reservation，Task 最多一个未终结 attempt。配额从 reserved/active/quarantined 聚合或事务维护计数；不能仅数 status=running 漏掉已授予未启动的任务。

lease 默认 TTL 30 秒，10 秒续约作为初始提案。Controller 时钟判断到期，客户端使用保守本地单调计时停止新工具，不依赖客户端墙上时钟延长许可；实现应测试时钟跳变的失效保护。

### 8.4 从许可到模型的竞态

`leased` 不等于执行成功：Extension 持本地 execution gate，重新核对 Pi 空闲、无手工待输入、无 ask、binding 未变，再 start。提交成功后写 session attempt 标记并请求模型。若用户输入先到，确认尚未注入的租约归还/重新排队；若 start 后是否注入不明，转 needs_review，不能自动重投。

SSE 只唤醒持久任务查询，丢失/重复 SSE 不决定 Task 状态。目标本地 generation 阻止 `/new`、reload 之后的迟到回调启动旧 Task。普通 ask 与正式任务共享 Pi 的本地 gate；ask 如产生模型轮也纳入项目/Agent work-unit reservation（独立通信单位，无需伪装成 DAG Task），团队 ask 还计相应 Team 容量。notice/reply 仅展示不占模型槽。

手工用户轮不受后台任务租约驱动，但将 Agent 标 busy；若介入已有正式 Task，冻结原 attempt 并报告 manual_interference，禁止把用户回答计作任务成功。Dashboard 的项目限额表示受管工作单元限额，不宣称限制用户自己在 Pi 中发起的模型计算。

### 8.5 正常结束、过期与故障

```text
queued -> leased -> running -> completed / failed
             |          |
     确认未开始归还      cancel_requested / lease_lost / disconnect
             v          v
           queued    needs_review + quarantined reservations
```

- settle 校验 active lease、epoch、fencing token、当前实例/session 与结果来源；重复 settle 同内容返回原结果，不重复推进 DAG。
- 租约过期后，旧 token 不能续约、提交成功结果或推进 DAG。Controller 可接受诊断/停止确认进入单独对账记录，不把它当有效结果提交。
- **过期不自动证明执行结束**。冻结 Agent 与 write_set reservation，继续占项目/Team 容量，避免旧 Pi 尚写文件时并发新任务。Extension 丢失续约时尝试 abort，停止后续工具；已经启动的外部命令仍需确认终止。
- cancel_requested 先请求停止，收到同一绑定的停止确认且副作用已核对才释放；无确认转人工处理。身份 release 本身不会杀 Pi，也不能顺带释放文件安全约束。
- Controller 重启产生新 epoch，原 leased/running attempt 全部暂停对账，保留隔离资源；即使 Pi 重新在线也不自动继续。确认未开始可重新排队；可能开始过的由用户决定接纳已核实产物或新建 attempt。
- Fencing token 防止旧客户端改 Controller 状态，但普通文件系统不理解 token；它不是撤销外部写入的魔法。因此不得采用“TTL 到就释放所有锁”的方案。

### 8.6 公平与避免死锁

在 Team 间轮转、Team 内按就绪时间排序；跳过因目标忙而不可执行的任务，显示等待原因，不让队首阻塞其它 Agent。只对在线可执行候选授予，不把离线消息改为自动补投。

Leader 的 leader_step 结束就释放槽，等待期间不持租约。成员互调产生子 Task 后结束当前执行片段进入 waiting_children；确认本轮停止才释放执行/write reservation。子结果回来创建新的 continuation attempt，并重新核验输入/产物 hash。父子任务不得同步阻塞等待且父继续持有子所需槽；依赖环、self invoke 和持锁等待应拒绝。Run admission 与执行槽分开：max_parallel_runs 可限制同队活跃业务请求，但不充当执行锁。

## 9. Leader、审查和 Dashboard

启动 mode 与 orchestration_role 分开保存：mode=leader/role 是进程配置来源；orchestration_role=leader/member 是 roster 位置；task.kind=review 表示此时在质量检查，不能从 role 名称等于 reviewer 推断权限。

Leader 允许读取、结构化 planning/dispatch/wait/status/complete，不允许普通 edit/write/bash 实施。`read/search` 使用只读工具，不能开放任意 shell 作为“搜索”；handler 和 tool_call 拦截都校验，第三方工具默认拒绝，不能只依靠 setActiveTools 或提示词。Controller 校验决策 revision 和预算；外部手工 shell 不在此协议沙箱范围。

审查 Task 通过与 execute 同一租约路径，freeze 被审 artifact refs/hash。审查输出结构化 findings、证据、pass/rework；required review 未通过时 complete 拒绝。最终 Controller 事务检查 Gate 是确定性状态校验，本身不额外获取模型任务租约；若需要 Leader 的质量判断，则对应 leader_step 已先取得许可。

Dashboard 至少展示：

- Agent：agent_id、mode、role_id 或 leader_team_id、membership 列表、runtime/session、在线/忙闲、当前 Team/Run/Task、规则 hash。
- Team：leader、roster、各成员是否绑定/在线、当前配置版本、容量使用与等待原因。
- Task：kind、attempt、lease 到期/隔离、blocked_on、review/rework、结果证据。
- 明确区分 configured/online/eligible/busy/quarantined；相同 Agent 在多个 Team 中显示相同实时槽状态。

## 10. 实施落点与迁移验收

| 增量 | 建议位置 | 覆盖需求/验收 |
|---|---|---|
| 项目发现/配置 | TS `project.ts`、`config.ts`、新 `team-config.ts`；Go `project/`、`config/`、`cli/serve.go` | TR-01/02，A01–05/A16 |
| Identity/Team | Go `agent/` 改模型与迁移；新 `team/`；HTTP/client/TUI | TR-03/06，A04/A06/A07/A14 |
| 注入快照 | TS `role-context.ts`、`runtime.ts`、`index.ts` | TR-05，A11/A12 |
| Invocation/资源仲裁 | 新 Go `task/`、`scheduler/`；HTTP lease handlers；TS `task-runtime.ts` | TR-04，A08–10/A15/A17 |
| Team 编排 | `team/` 下 DAG/decision/acceptance；TS team tools | TR-07，A13 与原 TEAM 用例 |

以上是拟新增模块名；不能以旧稿 `pkg/team`、`cmd/squad` 当作当前已存在结构。

目录迁移必须显式生成清单：仅移动确认属于 Squad 的 `.agents/roles/<id>/role.md` 及相关规则到新目录，补 agents.md；旧团队配置同理。新旧同 ID 并存时报冲突，不覆盖、不混读。运行态停服务后做 DB 备份及映射；原生 session 不默认搬动历史，新启动用新目录，历史读取/迁移需单独指定。同步当前配置 fixture、根/插件 AGENTS 路径、USAGE、Dashboard 默认连接和测试入口。

静态与自动验证：schema/目录越界、启动互斥、配置快照、数据库迁移、并发 acquire 原子性、失租/重启拒绝旧 token、授权 scope、输入竞态及上下文 hash；不以普通 happy-path 单元测试替代这些边界。

运行验收另按需求矩阵及原阶段合同执行：多角色、双 Team、共享 reviewer、两个 Controller 项目隔离、质量审查与人工介入。旧报告 PASS 不代表新协议通过；本轮仅交付文档。

## 11. 待确认的工程取舍

- 动态 agents.md：默认每个 attempt 开始热读，允许用户在下一任务看到修改；如希望只 `/reload` 生效，应在实施前调整该契约。
- 首版 `mode=leader` 不加载普通 Role 模板；后续若需 leader.role_ref 应显式增加组合层，不让两个启动选择器隐式合并。
- 30/10 秒租约、8 个项目工作单元、2 个活跃 Team 是可配置建议，不是可靠性或性能承诺。
- 首版强制受管 Pi session 位于 `.runtime/sessions/<agent_id>`，需实现对实际 SessionManager 路径的校验；不默认替用户搬旧会话。
- 非活跃 Team 的配置编辑、role 规则编辑分别以 Run/Attempt 边界生效；管理员更新语义需在实施命令中保持一致。

这些提案与用户已明确的五项需求分开登记，见 [开放问题](../../docs/questions/open-questions.md)。
