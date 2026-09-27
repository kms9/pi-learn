---
title: 2026-09-27 阶段 04 Codex / Cursor 需求协商
type: session
status: active
created: 2026-09-27
updated: 2026-09-27
tags:
  - project-wiki
  - session
---

# 2026-09-27 阶段 04 Codex / Cursor 需求协商

## 用户要做什么

使用 openspec-explore 评估阶段 04，与 Herdr w6:p1 的 Cursor 协商；共识更新需求与 OpenSpec，分歧交用户裁决。仅规划，不实现插件。

## 达成了什么

三轮协商完成；技术处置达成一致，四类产品边界均由用户明确选择。补充权威需求、设计 D12、六份 OpenSpec spec、proposal/design/tasks。保留 18 条需求、89 个主场景和 4a 71 / 4b 18 分段；新增断言归入既有场景，实施任务仍未执行。

### 用户裁决

1. 允许人工确认执行及子进程已停止，必须显式命令、原因或证据、精确旧绑定和审计；不冒充自动检测。
2. 活动 Run 的 Leader 普通文字作为 run_guidance，安全边界应用；显式 takeover 和实际会话切换仍按中断处理。
3. Project 管理员可跨 Team 管理，使用独立 operator 凭据；模型 runtime 凭据不得访问管理端点。
4. 按预先声明的策略使用确定性 checker 或独立 reviewer；standalone 无 reviewer 时人工验收；child 可由父结果覆盖，review 控制节点不递归审查。

具体决定见 [[decisions/2026-09-27-squad-recovery-guidance-acceptance]]。容量、命令/API 名、队列上限、direct allowlist 等为协商采用的设计默认，不冒充用户逐项裁决或已实现能力。

### 发现与处置

首轮回传摘要称 18 项；可逐项追踪的原报告为 F01—F17，后续新增 N1、N2。以编号而非摘要总数为准。

| 编号 | 问题 | 处置 |
|---|---|---|
| F01 | dead runtime 下 release/promote/cancel 闭环 | operator confirm-stopped 人工审计证据，撤销许可后安全对账 |
| F02 | Leader step、gate、输入语义缺失 | leader_step 共用 TaskStore/lease/capacity；complete intent 待 settled；普通文字为 guidance |
| F03 | recovery hold/needs_review/身份缺出口 | 显式 resume、reconcile、Leader release；预算耗尽不暗中覆盖 |
| F04 | 写操作授权主体不清 | 四类 origin，独立 operator 与 runtime credential，管理端点拒绝模型 token |
| F05 | 4a 用例依赖 M7 release/outbox | 通用原子准入、等待登记、释放唤醒前移 M1/M4 |
| F06 | direct ROLE_BUSY 排期过晚 | M2 交付，P4-A28 增子断言 |
| F07 | capacity=1 澄清死锁 | child yield/settled → 父 response-only → child 新 segment |
| F08 | DAG 等待节点过早冻结绑定 | planned → accepted 有条件转换；never-attempt 可显式 rebind，曾执行只能 retry |
| F09 | 准入未重查 Leader | 真正准入重查在线和绑定，失败保留 queue_seq/blocker |
| F10 | standalone scope/预算/验收不完整 | root/child 均 null Team/Run，继承授权预算，默认人工验收兜底 |
| F11 | related handoff 语法不清 | 显式 --parent current；活动/挂起父的无关联调用拒绝 |
| F12 | WaitGraph 检测后的结果不确定 | 新边原子拒绝；晚发现隔离最新等待节点并显示完整环 |
| F13 | role release 与 ownership 混淆 | 仅解除 Primary binding，保留 tombstone；显式 promote 重建 |
| F14 | reviewer 独立性未定义 | 不同稳定 Agent 身份；换 session 不算独立，同 Role 自审拒绝 |
| F15 | 转换遗漏队列/时间/模块/阶段约束 | 补回 32 队列、deadline、2 秒/120 秒实验目标和里程碑追踪 |
| F16 | 场景 WHEN 预设结果 | 修正 TR-A09、TR-A31、CMD-A12 的触发与结果分离 |
| F17 | v1 写路径与失租宽限不清 | 所有写走 v2 校验；presence 与 lease 分开，失租不因 grace 复活 |
| N1 | 原生命令和 bash 绕过 input/command | session_before_*、实际 session/tree 变化与 user_bash 接入；手动 compact 先 abort，显式恢复 |
| N2 | 父子和 review acceptance 自锁 | 父续接边 execution_completed；最终 Gate 按业务策略集合，版本化父覆盖，控制节点不递归验收 |

另补 amend 的 accepted/applied revision 与完成竞争、Project 全局容量计 Leader/response-only、多 Team 夹具显式 capacity≥4。保留已接受 Task 的冻结语义，不自动迁移会话，不以 TTL 当停止证明。

### 协商与证据

- handoff_id: `squad-p4-explore-20260927-01`
- callback_pane_id: `w4:p2`；callback_terminal_id: `term_65c321016b8f18`
- reviewer: Cursor，`w6:p1` / `term_65b1f4f57e3345`
- report_path: `docs/sessions/2026-09-27-pi-squad-phase04-cursor-review.md`
- Round 1：只读独立审查；Round 2：接受主要处置，附 planned/rebind、capacity 夹具条件，新增 N1/N2；Round 3：接受修订，补 manual_compaction 上行失败、所有非终态 session_changed、hold 期间禁止 planned 自动接受。
- Round 3 主动回传因调用方问题对话框返回 agent_blocked；对方未替用户答题、未重复发送。发起方通过 `herdr agent read w6:p1 --source recent-unwrapped` 收到完整结果（received_by_read）。
- 固定源码 `pi-dev@890f920884f6d21fc7617d236ef9e1cc5d7a0ef8`：`packages/coding-agent/src/core/agent-session.ts`（command/input 顺序、sendUserMessage、compact 先 abort），`src/modes/interactive/interactive-mode.ts`（原生命令和 bash 分支），`src/core/extensions/types.ts`（生命周期事件）。只读核对，不改上游。
- [权威需求](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md)、[权威设计 D12](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_DESIGN.md#d12)、[OpenSpec 任务](../../openspec/changes/pi-squad-team-orchestration/tasks.md)。

## 写回了哪些 wiki 页

- 本页、上述决策页、主索引、决策索引、开放问题 Q18—Q21 与日志。

## 未决

本轮需要用户裁决的四类问题均已关闭。Pi API 实际兼容性、故障窗口和凭据隔离效果仍须 M0 及后续实现验收取证；阶段用例保持 NOT_RUN。未实现代码，未运行真实 Pi 验收。

## 相关页面

- [[sessions/2026-09-27-pi-squad-phase04-openspec-proposal]]
- [[decisions/2026-09-27-squad-phase04-activation-and-split]]

## 静态校验

`openspec validate pi-squad-team-orchestration --strict` 通过，规划状态 4/4；6 specs、18 requirements、89 主场景均唯一且与权威矩阵一致；JSON 示例可解析，`git diff --check` 通过。71 项实施任务全部未勾选。所有真实阶段验收仍为 NOT_RUN。
