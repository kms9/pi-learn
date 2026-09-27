---
title: 2026-09-27 阶段 04 需求对照当前代码的差距评估
type: session
status: active
created: 2026-09-27
updated: 2026-09-27
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-09-27 阶段 04 需求对照当前代码的差距评估

## 用户要做什么

结合 `pi_squad/` 现有代码，评估 `pi_squad_case/04-team-orchestration/` 的需求。

## 达成了什么

- 结论: 需求内部一致性高，但与代码之间的差距是「一个未实现的阶段 03 + 整个阶段 04」。现有代码只覆盖 P0 身份与 P2 HTTP 消息（P2 结果 PARTIAL），没有任何 Task/Attempt/Run/Team 代码。
- 结论: 阶段 04 在多处以阶段 03 为前提（TR-07、TR-14、S8），而 `03-agent-invocation/README.md` 仍为 not_implemented，且路径（`cmd/squad`、`pkg/invocation`、`$HOME/.psq/03`、`squad policy allow`）与当前 `pi_squad/controller` 结构不符。M2/M3 实际等于阶段 03 的内容，但 89 项未包含 INV-01—15，存在双重验收或漏验风险。
- 结论: 可复用的现有机制——`config.ts` 的 frontmatter 解析；Registry 的 runtime_token/revoked_runtimes/previous_session 连续性（TR-02/03 的基础）；消息的 request_key+fingerprint 幂等（IdempotencyRecord 的模板）；receipt 的 injection_requested/deferred 状态（dispatch_intent 的模板）；`messaging.ts` 的 generation 防护、userPending、ask 工具门（InputClassifier/execution-gate 的起点）；SSE watcher（invalidation）。
- 结论: 必须改而非扩展的点——固定端口 `18741` 与硬编码默认 URL（`extension/index.ts`）违反 TR-01「不回退旧固定端口」；`before_agent_start` 返回整段 systemPrompt，需改为 `systemPromptOptions.sections`（固定 Pi 源码 `system-prompt.ts` 已有 `sections: Record<string,string>`，名字须匹配 `^[a-z][a-z0-9_-]*$`）；`agent_end` 收尾需改为 `agent_settled`（API 存在）；Registry `Upsert` 中 `invalidatePending` 在事务外，不满足 TR-16 同事务 outbox；迁移只有 additive ALTER，没有 schema_version/备份；单 `squad_id` 与跨 squad 拒绝需改为 Team/Run scope；角色目录只看 cwd 的 `.agents/roles`，需改为向上查找 `.agents/pisquad` 并增加 agents.md / team.json；`ROLE_NAME` 允许数字开头，D02.1 要求字母开头。
- 结论: 规则文件会与新布局冲突，实施 M1 时必须同步改：`pi_squad/controller/AGENTS.md` 的默认 listen/db 与 HTTP 契约清单；`pi_squad/AGENTS.md` 及根 `AGENTS.md` 里的 `.agents/roles/<role_id>/role.md` 验收开法；`USAGE.md` 的启动变量（`PI_SQUAD_ROLE_ID`/`PI_SQUAD_ID` → `PI_SQUAD_MODE`/`AGENT_ID`/`TEAM_ID`）。
- 结论: 设计风险——Role ownership 按 Run 持有且 lazy acquire 是典型 hold-and-wait，跨 Team 共享 Role 时死锁概率不低；文档选择检测（WaitGraph）而非预防，实现和验收成本都高。可考虑的替代：Run 准入时按 roster 声明并按固定顺序获取，或把跨 Team 并行推迟到拆分后的 4b。另外 FIFO 单活动 Run + 单 Primary + Run 级 ownership 叠加后吞吐很低，属于有意取舍但应明示。
- 结论: 验收风险——89 项全 PASS 才能退出、无优先级分层；大量 F 类用例需要测试构建故障注入点，当前 Go/TS 均无该设施；第二轮实验需要至少 6 个 Pi（两 Leader + 共享 reviewer Primary + Secondary + 各自 worker）。
- 结论: 建议——先把阶段 03 重定基线到当前目录结构，明确「M2/M3 吸收 INV-01—15」或「阶段 03 先独立通过」；把 P4 拆为单 Team（M0—M4、M6、M7 的单 Team 部分）与多 Team/WaitGraph/迁移回滚两段；89 项标注必过与扩展；Pi 内 `/squad dashboard` 可后置，先保 Go TUI。

## 用户裁决与落地（同日续）

- 当前批次需求为准；阶段 03 不再修改，只删除冲突点，能力由 4a 交付。
- 用户原以为“active team”已能防互等；核对后 TR-04 原文为 lazy acquire。用户选择“激活时原子占用 roster 全部 Role”，并确认“释放 active”= 显式取消 Run。串行吞吐是既定设计。
- 采纳分段：4a 单 Team 可用闭环 71 项，4b 多 Team 与加固 18 项；技术设计 D10 改为 M0—M6（4a）与 M7—M9（4b）。
- 已改：阶段 04 需求（0.3、TR-03/04/05/07/10/13/17、用例改写、2.4—2.6）与设计（C05/C06/C21/C22、D03、D04、D05、D09、D10）；阶段 03 仅删除；阶段 05、全局 README/ACCEPTANCE、`pi_squad/AGENTS.md`、`pi_squad/controller/AGENTS.md`、根 `AGENTS.md`、概念页。静态检查：ID 完整、JSON 可解析、分段与里程碑覆盖一致。未改代码、未运行验收。
- 决策见 [[decisions/2026-09-27-squad-phase04-activation-and-split]]；Q13—Q17 已关闭或标 superseded。

## 写回了哪些 wiki 页

- 页面: 本页；`docs/questions/open-questions.md`（Q16、Q17，并在 Q13—Q15 标注与 P4 统一文档的漂移）；`docs/index.md`；`docs/log.md`

## 未决

- 问题: ExecutionLease 的 TTL/续约值需求未规定，M2 实施时记录实际值（Q15 已标 superseded）。

## 相关页面

- 决策: [[decisions/2026-09-25-squad-team-runtime-scope]]
- 会话: [[sessions/2026-09-27-pi-squad-phase04-consolidation]]
- 需求: `pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md`、`TEAM_RUNTIME_DESIGN.md`；`pi_squad_case/03-agent-invocation/README.md`
