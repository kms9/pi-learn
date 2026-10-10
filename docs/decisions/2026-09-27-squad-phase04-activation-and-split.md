---
title: 2026-09-27 阶段 04 激活占用、阶段 03 并入与 4a/4b 分段
type: decision
status: active
created: 2026-09-27
updated: 2026-09-27
decision_date: 2026-09-27
tags:
  - project-wiki
  - decision
  - pi-squad
---

# 2026-09-27 阶段 04 激活占用、阶段 03 并入与 4a/4b 分段

## 决策

1. **以当前批次需求为准**：`pi_squad_case/04-team-orchestration/` 的需求与技术设计是唯一依据，其它文档冲突处按它修改。
2. **激活即整体占用**：Team Run 准入时原子占用 roster 全部 Role；任一被他队占用则整个 Run 排队、不占任何 Role。激活期间这些 Role 不接受其它 Team 的模型工作。
3. **释放 active 状态 = 显式取消 Run**：`/squad cancel run:<id>`，对账安全后整体释放 Role；不提供保留 Run、单独释放 Role 的暂停操作。
4. **串行吞吐是既定设计**：FIFO 单活动 Run、单 Primary、激活整体占用叠加后的低并发不作为缺陷处理。
5. **阶段 03 并入**：阶段 03 能力由阶段 04 的 4a 交付，不单独实施；`03-agent-invocation/README.md` 不再修改，只删除与阶段 04 冲突的点；INV-01—15 判据并入映射用例。
6. **分段验收**：4a 单 Team 可用闭环（71 项），4b 多 Team 与加固（18 项），各自有退出门。

## 背景

差距评估发现：阶段 03 未实现却是阶段 04 的前提；原 lazy acquire 加 Run 级持有是 hold-and-wait，跨 Team 可能互等；89 项全过才能退出，缺少优先级。用户确认了自己心中“激活团队”的语义，并采纳分段与并入建议。

## 证据

- 来源: 2026-09-27 用户答复与选择（占用时机选“激活时原子占用 roster”，释放选“显式取消 Run”）。
- [[sessions/2026-09-27-pi-squad-phase04-code-gap]]
- [统一需求](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md) TR-04、TR-05、0.3、2.5、2.6
- [技术设计](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_DESIGN.md) C06、C21、C22、D04.1、D10

## 影响

- 跨 Team Role 互占环在结构上不出现；WaitGraph 只需处理 Task 依赖、父子调用、affinity 与写资源。
- 跨 Team 排队按 Project 级 queue_seq：roster 不相交可越过，相交的先来先准入（本轮实施默认，非用户逐项确认）。
- 本 Run 暂未使用的 roster Role 也被锁住，这是接受的代价。
- 同步修改：阶段 03（仅删除）、阶段 05、全局 README/ACCEPTANCE、`pi_squad/AGENTS.md`、`pi_squad/controller/AGENTS.md`、根 `AGENTS.md`、概念页。

## 复审触发条件

需要 Role 多容量、Team 抢占、Run 内按需释放 Role，或跨 Team 吞吐成为实际瓶颈时重审。

## 相关页面

- 会话: [[sessions/2026-09-27-pi-squad-phase04-code-gap]]
- 概念: [[concepts/squad-role-instance-lease]]
- 前序决策: [[decisions/2026-09-25-squad-team-runtime-scope]]
