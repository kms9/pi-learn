---
title: 2026-09-27 Squad 恢复、Leader 输入、授权与验收
type: decision
status: active
created: 2026-09-27
updated: 2026-09-27
decision_date: 2026-09-27
tags:
  - project-wiki
  - decision
---

# 2026-09-27 Squad 恢复、Leader 输入、授权与验收

## 决策

用户逐项确认以下四项：

- 旧进程无法回报时，允许操作者显式确认该执行及子进程已停止，附原因或证据并留审计。声明绑定精确 Attempt/旧 runtime/revision；不代表 Controller 自动验证，也不回滚已有副作用。
- 活动 Run 的 Leader 普通文字作为当前 Run 的补充指示，在安全边界应用；不新建 Run、不直接 steer。显式接管及实际会话变更继续按中断处理。
- 管理边界是 Project 管理员，可管理各 Team；独立 operator 凭据与 runtime 凭据分离。模型只能按任务授权工作，不能自行恢复、换人或取消别队。
- 业务 Task 按不可变的声明策略验收：有确定性 checker 用 checker，否则独立 reviewer；standalone 无 reviewer 时由用户显式验收。子任务默认可由父当前 accepted 结果按精确版本覆盖，也可声明单独审查；review 控制任务不递归找 reviewer。

## 背景

只依赖失联 Pi 自报会使恢复永远等待；统一把 Leader 输入当 Worker 干扰不符合协调体验；把用户与模型混用 runtime token 会越权；父子和 review 递归验收会造成完成 Gate 自锁。

## 证据

- 本轮四次用户选择，记录见 [[sessions/2026-09-27-pi-squad-phase04-cursor-review]]。
- [统一需求](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md) TR-02、TR-11、TR-15、TR-17；[设计 D12](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_DESIGN.md#d12)。

## 影响

增加显式 reconcile/resume/accept/reject 等命令契约、LeaderStep 与 run_guidance、独立凭据和 acceptance_policy。安全清理仍需精确证据；重启、TTL、用户文字都不构成自动重跑授权。单 Primary、Run 整体占用 roster 和 4a/4b 分段保持既有决定。

## 复审触发条件

引入远程或多用户控制面、恶意同 OS 用户隔离、多 Primary、自动恢复，或更改默认验收策略时重新评估。当前为规划契约，实际能力须实现与验收后写入 USAGE。

## 相关页面

- [[sessions/2026-09-27-pi-squad-phase04-cursor-review]]
- [[decisions/2026-09-27-squad-phase04-activation-and-split]]
