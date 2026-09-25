---
title: 阶段 04｜组成小队：对话驱动分工、交接、审查与返工
status: draft
type: process
requirements: confirmed
implementation_status: not_implemented
acceptance_status: not_run
updated: 2026-09-21
---

# 阶段 04｜组成小队：对话驱动分工、交接、审查与返工

> 2026-09-25 Team Runtime 修订：先读 [需求文档](TEAM_RUNTIME_REQUIREMENTS.md)、[技术文档](TEAM_RUNTIME_DESIGN.md) 与 [上下文拼装设计](CONTEXT_ASSEMBLY_DESIGN.md)。新稿规定 `.agents/pisquad`、启动身份、多 Team 上下文及执行租约；本页仍保留编排验收场景，旧路径/命令示例须在实施时同步，不能当作已可运行命令。

## 1. 最终目标与本阶段验证点

最终目标：用户在 Pi 中既能调用在线独立 Agent，也能调用由已有在线 Agent 组成的小队；成员可受控互调，共享必要任务材料。Go 保留任务和协作记录，TS 适配既有 Pi 会话，进程全由用户管理；Herdr 不参与编排。

本阶段验证**“一个对小队的请求，可以完成分工、依赖推进、成员协助、审查返工和最终汇总”**。小队是对 agent_id 的引用，不是批量启动 Pi 的配置。编排复用阶段 03 的同一个 Task Router，不建立第二条投递通道。

用户里程碑：预配置固定小队 → 手动启动成员 → 在 operator 对话调用小队 → 看见分工和任务关系 → 审查不通过时有界返工 → 收到可追溯的最终结果。

## 2. 需求、角色与明确不做的事

支持固定成员、版本化小队配置、Leader 动态分工、受控并行/串行、成员互调、依赖检查、结果汇总、审查与最多 2 次返工。组内预设权限允许自动响应和执行，不逐次弹确认；仍不绕过目标 Pi 工具或项目权限。

不做自动选购/启动/重启 Agent、自动增减成员、临时创建角色、远程执行、自动 worktree 或代码合并。缺成员时明确 blocked，用户手动启动后显式 resume；不能自动换一个同名或“看起来相似”的 Agent。

区分三个字段：`orchestration_role=leader/member`；`profile=planner/worker/reviewer` 是职责说明；`runtime_kind=pi` 是运行时。一个属性不能代替另一个。

## 3. 小队与单次运行模型

```yaml
team_id: team_uuid
name: stats-team
config_version: 1
leader_agent_id: agt_planner
members:
  - agent_id: agt_planner
    orchestration_role: leader
    profile: planner
  - agent_id: agt_worker
    orchestration_role: member
    profile: worker
  - agent_id: agt_reviewer
    orchestration_role: member
    profile: reviewer
policy:
  allow_peer_invoke: true
  max_parallel_tasks: 2
  max_delegate_depth: 3
  max_total_tasks: 20
  max_leader_turns: 30
  max_rework_rounds: 2
  require_review: true
```

示例 alias 在创建时解析为真实 agent_id，不能把示例字符串直接当生产 ID。role instructions 来自用户预配置，并在 Pi `before_agent_start` 的有效 prompt 中追加；不在每项任务中清空/替换目标历史。配置更新仅影响新 run，活动 run 固定 roster/config_version；需要在活动 Pi 生效的配置更改由用户 `/reload`，不暗中切换 session。

`SquadRun` 保存 goal、调用者、配置快照、context_revision、任务 DAG、责任树、Leader 决策记录、审查结果和最终 artifact refs。一个 SquadRun 不是一个 Pi session；多个 run 可以使用同一个成员，但通过执行槽串行占用它。

## 4. Leader 决策与 Go 控制面的分工

Leader 使用结构化工具 `squad_decide`，动作 `dispatch/wait/complete/fail/no_action`。不能仅解析聊天文本里的 @name 就宣布成功派发。

```json
{
  "squad_run_id":"srun_uuid", "expected_revision":3,
  "action":"dispatch",
  "tasks":[
    {"key":"sum","target_agent_id":"agt_worker","goal":"计算 sum","depends_on":[]},
    {"key":"count","target_agent_id":"agt_reviewer","goal":"计算 count","depends_on":[]},
    {"key":"report","target_agent_id":"agt_worker","goal":"组合报告","depends_on":["sum","count"]},
    {"key":"review","target_agent_id":"agt_reviewer","goal":"独立核对报告","depends_on":["report"]}
  ]
}
```

Go 校验成员身份、配置版本、目标在线、能力和授权、task key 唯一、依赖存在、无环、并行/深度/数量预算、write_set 冲突。只有通过校验的决策才能进入 Task Router。无效计划返回结构化错误，至多自动请求 2 次修正；仍失败则显式失败，不无限对话。

Leader 每次决策后结束当前轮，不阻塞等成员。成员结果/问题产生可去重的触发事件，Go 在 Leader 的执行槽可用时，把最新事实组装为下一次 leader_step。单个 leader_step 正常 settled，只代表一次协调轮结束，**不代表 SquadRun 完成**。

`squad_decide(complete)` 必须通过 Go 最终门：所有必需任务均正常完成、结果验收通过、规定的 reviewer 已出结论、没有未解决失败或待核实状态。缺任何一项都拒绝 complete。

## 5. 上下文、互调与共享文件

每次 Leader 输入包含 goal、roster、当前版本、任务状态摘要、上次决策以来的新结果/阻塞及验收条件；每个成员只得到自己的 Task Contract、必要上游结果、明确引用、约束。Go 保存可追溯的 context_revision，不复制所有成员聊天窗口。

上游 artifact 使用路径、大小、sha256 和所属 task/attempt 绑定。输出报告默认放独立任务目录，避免同名覆盖。共享的是引用和确认后的结果，不是共享一个可随意修改的 session JSONL。

成员通过 `agent_invoke` 调用组内其他在线成员时，Go 校验 roster/policy，继承 root、parent、预算和权限上限。调用产生真实子任务，不能靠一句“已经问过 reviewer”绕过记录。任务依赖 DAG 与责任树分别保存：谁委派的，不等于谁依赖的。

对声明的 write_set 采用 Go 事务式文件写租约：同一规范化路径的两个写任务不能同时运行，后一个显示 blocked_file_conflict。只控制本系统声明的任务，不是文件系统 sandbox；人或外部工具仍可改文件，因此结果验收必须再次校验文件摘要。初版不实现自动合并。

## 6. 状态与失败处理

```text
created → planning → running/waiting_members → reviewing → completed
                              ↘ reworking ↗
任意非终态 → blocked / needs_review / failed / cancelled
```

用户介入成员任务：继承阶段03的 `interrupted/manual_interference`，立即向Leader及等待该任务的节点反馈“原任务未完成，用户已介入”。run转为 `needs_review/manual_interference`，停止受影响依赖的自动推进；与该任务无依赖的已运行成员不被此反馈自动abort，但run不能宣告成功。不得把用户介入当普通审查不通过而自动进入返工、重试或替换成员；后续由用户明确决定。关联当前任务的正式补充不按接管处理，仍需记录修订与结果归属。

成员离线：不再给该绑定投递，run 标 blocked/member_offline；手动上线不会立刻恢复整个计划，用户执行 `team run resume` 才推进未执行节点。执行中丢失状态继承阶段 03 needs_review，不自动重执行有副作用的任务。

reviewer 拒绝必须提供结构化发现、证据引用、待修改项；Leader 派返工任务，旧结果保留。超过 2 次返工或其他预算即 failed/needs_human，不无限循环。routine progress 不反复唤醒 Leader；合并触发、记录 no_action，避免消息风暴。

Go 服务重启保留配置、DAG、结果、context revision；所有未完成 run 先暂停对账。用户显式恢复后才继续调度。任务级取消与小队级取消分别记录；发出取消不虚报所有 Pi 已停止。

## 7. 实施目录与实际增量（待实现）

| 文件 | 实施逻辑 |
|---|---|
| `cmd/squad/main.go` | 继承已有功能；team create/get/run/status/resume/cancel。 |
| `pkg/team/{config,roster}.go` | team/profile/config_version，固定 agent_id 引用。 |
| `pkg/team/{router,controller}.go` | agent: 与 team: 目标路由，SquadRun 状态机，复用 invocation。 |
| `pkg/team/{decision,dag}.go` | 决策 schema、CAS revision、依赖校验、无环、预算、幂等推进。 |
| `pkg/team/{context,acceptance}.go` | roster brief、增量事实、审查 gate、返工记录。 |
| `pkg/team/writelease.go` | 声明文件写租约；和 task 状态一起事务更新。 |
| `extension/{index,team-tools,role-context}.ts` | 对话调用、squad_decide、角色/当前任务提示；不承担 DAG 调度。 |
| `fixtures/` | stats-team 配置、数字文件、故意错误报告、期望审查结果。 |
| `tests/` | 计划验证、重复触发、预算、缺成员、重启、人工验收流程。 |

增量顺序：固定 roster＋单成员任务；Leader 结构化派发；两个独立任务并行再汇合；审查/返工；成员互调及故障恢复。每次先完成该增量的真实用户闭环再扩大自动化。

## 8. 用户主流程

阶段 03 已通过。状态目录 `$HOME/.psq/04`，构建 `./04-team-orchestration/cmd/squad`，使用 `04-team-orchestration/extension/index.ts`。用户手动启动 operator、planner、worker、reviewer 四个 Pi；operator 是发起入口，planner 是独立在线 Leader，避免自调用占用同一个循环。

先在配置终端用 `mkdir -p "$SQUAD_HOME/workspace"` 和 `printf '10\n20\n30\n' > "$SQUAD_HOME/workspace/numbers.txt"` 创建输入；四个 Pi 都从这个测试目录启动。报告输出在该目录的 `artifacts/<run-id>/` 下。为避免手工误改，故意错误报告另存 `wrong-report.json`，不能覆盖成功报告的原始验收证据。

在 Go CLI 创建小队（全部命令待实现）：

```bash
squad team create --name stats-team --leader planner --members worker,reviewer
squad team get stats-team --json
squad policy allow --from operator --to team:stats-team --actions invoke
```

`team create` 保存上述可见的默认预算和组内委派策略；用户用 `team get` 审核固定 agent_id。只有这组显式加入的小队成员获得组内调用许可，operator→team 由上面的 policy 单独授权。读取数字的任务采用只读工具上限；写报告任务仅允许声明 write_set 内的原生写工具，本轮测试不开放任意 bash 写入。

用户在 operator 说：

```text
调用 stats-team：对 numbers.txt 的三行数据并行统计 sum 和 count，
组合 report.json，再让 reviewer 独立核对。
我需要最终文件、核对结论，以及每一步由哪个 Agent 完成。
```

观察 `/squad team <run-id>`、`squad team run status <run-id> --tree`；进入对应 Pi 看见真实工作。预期 sum=60、count=3，report 依赖两项统计，review 依赖 report。模型可以提出不同合理拆分，但必须满足这次用户明确提出的并行统计和最终独立复核条件。

第二轮使用故意 sum=999 的报告，要求小队审查并修正；应出现可追溯的拒绝→返工→复核，而不是直接覆盖失败记录。

## 9. 用户验收矩阵

| 用例 | 用户操作 | 通过标准 |
|---|---|---|
| TEAM-01 固定成员 | 创建并查询 stats-team。 | leader/member 均引用真实 agent_id；不启动任何 Pi；重命名 alias 不破坏引用。 |
| TEAM-02 对话调用小队 | 执行上面自然语言请求。 | 有 squad_run_id、实际 squad 工具、Leader 决策、成员 task_id，不只是主 Agent 自己回答。 |
| TEAM-03 并行再汇合 | 观察 sum/count/report/review。 | 独立统计可并行；report 在两结果可用后开始，review 在报告后开始；事件链能证明。 |
| TEAM-04 不同调用入口 | 分别调用 `agent:reviewer` 和 `team:stats-team`。 | 前者是独立任务，后者有 SquadRun；不会把小队名误当一个 runtime。 |
| TEAM-05 组内互调 | worker 在正式任务中请 reviewer 协助。 | 新子任务带同一 root/parent，使用既有 reviewer，会受深度和执行槽限制。 |
| TEAM-06 越界 | 计划里引用非 roster Agent 或扩大权限。 | POLICY_DENIED/PLAN_INVALID；不投递，也不凭提示词放行。 |
| TEAM-07 审查返工 | 提供故意 sum=999 的报告。 | reviewer 拒绝并给证据；返工后 sum=60；旧拒绝记录保留，不能先完成再补审查。 |
| TEAM-08 预算停止 | 配置每轮均拒绝，超过返工上限。 | 明确 failed/needs_human，无无限互调或消息风暴。 |
| TEAM-09 缺成员 | 退出 worker 后调用/推进小队。 | run blocked，显示“worker 离线”；手动启动后仍需显式 resume，无自动替换或拉起。 |
| TEAM-10 文件冲突 | 两任务声明同时写同一个 report.json。 | 只允许一项持有写租约，另一项 blocked_file_conflict；不承诺自动合并。 |
| TEAM-11 假完成 | Leader 在 review 未完成时调用 complete。 | Go 拒绝，run 保持未完成；模型不能绕过最终 gate。 |
| TEAM-12 重复触发 | `squad lab team-check --case duplicate-result`。 | 一个结果最多产生一次有效推进；重复决策被 revision/幂等键约束。 |
| TEAM-13 中途故障与用户介入 | 分别测试运行中重启Go，以及Leader等待成员时用户接管成员任务。 | 重启保留DAG/结果/版本、先needs_review；用户介入立即反馈未完成并停止受影响依赖推进，不自动返工/重派，旧结果不能使run成功；恢复由用户明确决定。 |
| TEAM-14 无逐次确认 | 一次性配置组内允许策略后执行正常流程。 | 控制面不逐次弹审批；Pi 自身仍需的原有权限提示不被绕过。 |

阶段验收不仅看最终报告：必须保存计划、执行时间区间、依赖释放、review/rework 和结果归属。并行是“运行区间存在重叠”，不要求模型调用恰好同时开始。所有预算值是本实验配置目标。

## 10. 源码参考：借思想，不搬整个平台

版本及链接见 [SOURCES](../SOURCES.md)。

| 已读源码 | 对应逻辑与差异 |
|---|---|
| Multica `server/internal/handler/squad_briefing.go`：`squadOperatingProtocolFor/buildSquadLeaderBriefing/buildSquadRoster`。 | roster＋instructions＋协调协议、派发后结束轮次、事件重评估、状态所有权。它用 mention/issue；我们使用结构化工具和本地 Task Router，不假装原样复刻。 |
| Multica 同文件：`squadOperatingProtocolHardRules`。 | 提醒不要 assignment 和 mention 对同工作重复触发；本实验保证小队与独立调用共用一条派发管道。 |
| Pi Agent Teams `extensions/teams/task-store.ts`：`TeamTask/blockedBy/isTaskBlocked/updateTask/claimTask`。 | owner、依赖、锁和任务列表；Go 使用事务式领取，补完整失败与验收模型。 |
| Pi `packages/coding-agent/src/core/extensions/types.ts`：`BeforeAgentStartEvent/AgentSettledEvent/registerTool`。 | 角色注入与协调轮次边界；TS 不实现调度器。 |
| Subagents `src/extension/herdr-pi-bridge.ts`：supervisor-request/reply 与 activeRequestId。 | 有关联的成员升级/结果反馈；本实验调用在线长期 Agent，不复用远程子进程生命周期。 |

本阶段不依赖 Multica 的服务部署、数据库、在线站点或 Herdr，也不默认现有 Agent Teams 已提供我们所需全部语义。

## 11. 退出门槛与回退

TEAM-01—14 全部通过，且单独调用 Agent 仍可用；阶段 00—03 的身份/通信/调用用例无回归。记录模板见 [ACCEPTANCE](../ACCEPTANCE.md)，当前 **NOT RUN**。

回退前核实成员仍在执行的任务；停控制面不等于停 Pi。保留 run/context/结果，再使用新实验状态目录回测。此阶段结束已经达成不依赖 Herdr 的小队闭环；下一阶段只增加视图和位置适配。
