---
title: 2026-10-29 实验运行器的卡住检测（从 EXP-02 起启用）
type: decision
status: active
created: 2026-10-29
updated: 2026-10-29
decision_date: 2026-10-29
tags:
  - project-wiki
  - decision
  - dsh-squad
  - experiment
---

# 2026-10-29 实验运行器的卡住检测（从 EXP-02 起启用）

## 决策

运行器（`dsh_squad/experiments/exp/run.mjs`）增加一条卡住检测，**从 EXP-02 起启用**，EXP-01 跑完之前不改运行器：

- 轮询时记录 Run 的阶段和每个任务的状态、验收结论、结果版本。
- 如果 Run 处于 `needs_review`，而且上述内容在 **10 分钟活动时间**（单调时钟，睡眠期间不走）内没有变化，这次尝试按卡住结束。
- 结束记为 `outcome: "stalled"`，同时记为环境中断（`environment_interrupted: true`），不计入结果，由现有的重跑逻辑再跑一次（最多三次尝试，见 `docs/dsh-squad-EXP01-04-实验计划-2026-10-29.md` §6）。
- 卡住的尝试不判题，也不计 `goal_success`。

检测逻辑在 `dsh_squad/experiments/exp/stall.mjs`，单元测试 `stall.test.mjs`（4 项，通过）。

## 背景

2026-10-29 EXP-01 的 P1 第 3 轮重跑卡住了约 1 小时。机器睡眠后，控制器把 `designer` 的执行以 `EXECUTION_QUARANTINE` 隔离（睡眠恢复后 reconcile 造成），任务停在 `needs_review`，没有结果也没有审核任务。控制器要求人工点「重试」（`docs/dsh-squad-dev-plan` 故障时一节），运行器没有这个能力，只能等时限。

运行器已经改成按活动时间计时，所以这次卡住最多浪费 30 分钟活动时间，但每次都要等满。卡住检测把它缩短到 10 分钟，并让它以环境中断的形式重跑。

## 证据

- 控制器状态：`exp01-P1-3` 的 Run 为 `needs_review`，`designer` 为 `needs_review`，无 blocker，`builder` 为 `planned`，依赖 `designer`。
- 事件：`controller_resumed`（`paused_seconds` 38 到 1442），`host_reconciled`，`attempt/stopped`（`why: quarantined`）。
- 运行器记录：该次尝试 `environment_interrupted`，挂起 3823.4 秒，随后自动重跑。

## 不做什么

- 不手改结果：卡住的尝试保留在报告里，标记为排除。
- 不尝试自动点「重试」：那是控制器的人工操作，实验期间约定不人工干预（计划 §6）。
- 不改机器：仍在本机跑，机器睡眠问题另行记录。

## 验证

- 单元测试：`node --test dsh_squad/experiments/exp/stall.test.mjs`，4 项通过。
- 正常路径：mock worktree 里 `exp02` 的 B0 一轮完成。
- 卡住路径：**尚未在真实卡住的 Run 上验证**。第一次真实卡住出现时要确认它被识别、记为 `stalled`、并被重跑。
