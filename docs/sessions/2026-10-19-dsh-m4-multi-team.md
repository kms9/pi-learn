---
title: 2026-10-19 DS Bot + Squad M4：多小队协同与完整恢复
type: session
status: active
created: 2026-10-19
updated: 2026-10-19
tags:
  - dsh-bot
  - pi-squad
---

# 2026-10-19 DS Bot + Squad M4：多小队协同与完整恢复

## 做了什么（分支 `feat/dsh-m4`）

- **M4-1 共用角色**：角色 runtime 注册时可带所属小队（`team_id`）；同一个 Bot 在两个小队的群里是同一角色的两个 runtime。Run 被接纳时，该小队的 runtime 成为角色负责人（binding epoch 加 1、记入 `binding_history`、事件 `primary_switched`）；旧负责人还有执行时不换。原子 FIFO 排队沿用 Controller 原有逻辑。Adapter：`bind-team` 给角色带小队；任何 `BINDING_CHANGED` 都会在下一个 tick 重新注册。
- **M4-2 子任务与续接**：Adapter 接受同一 attempt 的更高 segment（新 fence、清空回执与判定状态、告诉 Bot 子任务已回传）；所有请求 id 带 segment；`squad_task` 显示依赖任务的结果。
- **M4-3 完整恢复**：页面恢复卡：确认已停止、采用迟到的结果（Controller 已把隔离后到达的结果存为证据）、重试（补上 Controller 要求的 `rebind_current`）、无执行时重新安排、换成同角色其他在线 runtime（页面允许 `role:promote`）。Controller 崩溃路径有 Go 测试。
- **M4-4 端到端**：`dsh_squad/cases/m4`（A、B 共用 reviewer，C 独立且 capacity=1），`probes/drive-m4.mjs` 13 项。
- 页面：等待别的小队角色的 Run 显示为「排队中」及原因，而不是「需要你回答」。

## 回归中发现并修掉的问题

- **事件竞态**：循环里的租约续期和工具提交读到同一个 attempt 版本，结果被 `REVISION_CONFLICT` 拒绝，子任务没交结果，父任务卡住。现在同一 attempt 的事件串行发送；版本冲突时重读并在同一 segment/fence 下重发一次。
- **回执滞后**：子任务委派发生在第一步，而 `input_observed` 要到下一个 tick 才发，Controller 以「不在运行」拒绝。现在任务工具先补发回执。
- **心跳与其他工作绑在一个 tick**：现在心跳独立循环，tick 超过 15 秒会记录卡在哪里。

## 测试环境的说明

本轮几次失败（drive-m4 两次、全量回归里的 drive-m1 一次）都对应日志里 4～13 分钟的空白：测试机整机被挂起，租约（30 秒）和心跳（15 秒）在挂起期间过期，Controller 按设计隔离执行。没有挂起的重跑全部通过。真实部署里这类长时间停顿同样会让执行进入人工对账，这是预期行为。

另外，推送 `feat/dsh-m4` 时远端已有一个与本地内容完全相同（同一棵树）、提交说明不同的提交 `01cce3c`，不是本会话创建的；本地已对齐到远端，没有内容差异。

## 验证（开发期回归，不是验收）

`drive-m4` 13/13、`drive-m3` 18/18、`ui-check` 9/9、`drive-m2` 12/12、`drive-m0` 12/12、`drive-p1` 14/14、`drive-m1` 7/7、`check.sh` 通过。ACCEPTANCE 28 项仍为 NOT_RUN。

## 未决

Q41、Q43、Q44（一个 Leader 身份只能带一个小队）、Q45（对照实验 D 组未接）。
