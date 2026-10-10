---
title: 2026-10-04 Squad 明确完成回传与 Leader 上下文方向
type: decision
status: active
created: 2026-10-04
updated: 2026-10-04
decision_date: 2026-10-04
tags:
  - project-wiki
  - decision
  - pi-squad
---

# 2026-10-04 Squad 明确完成回传与 Leader 上下文方向

## 决策

用户阅读 Cursor 审核结论后补充以下方向：

- 取消上层业务 Task 的固定 120 秒执行截止，不改为更长或可配置的硬时间限制。任务依据明确的结束回传推进；派出的必要子任务未明确回传时，上层不能完成。
- 成功需要当前版本结果与真实执行结束证明；失败、取消、中断也须明确记录和向上回传，不能视为成功。业务验收仍按固定 policy 单独判断。
- 内置数字 checker 本来用于测试；当前三个 checker 的范围符合用途，本轮不以通用 checker 扩展作为优化目标。
- Leader 使用固定文件保存当前必要上下文，并采用简报/压缩方式减少完整历史输入。具体文件路径、长度预算和历史过滤策略仍属实施设计，不能写为已落地。
- Controller/插件 AGENTS、ACCEPTANCE 和 TR-13 的历史文档漂移后续统一更新。

## 背景

`wN:p1` 的 Cursor 指出固定 deadline、父不 yield 后提前完成、Leader 历史累积与 500ms 全表调度等问题。用户要求先理解 yield 与 tick，再明确修改范围。

## 证据

- 本次用户六条补充，以及 herdr skill 对 `wN:p1` 的只读结论读取；当前 pane 为 Cursor/idle。
- [原审核](../sessions/2026-10-04-pi-squad-phase04-code-review.md)、[机制澄清](../concepts/squad-completion-yield-scheduling.md)。
- 当前源码仍有 120 秒 deadline 与缺失的父完成依赖检查；本轮没有改产品源码或启动运行验收。

## 影响

后续修改需同时覆盖 Task deadline 创建/受理/重试及 Tick 到期中断，完成提议与 settled 的依赖检查，child/父续接与 Run Gate，以及 Leader 简报和 Pi 请求上下文。不能只删除 120 秒而仍允许父提前完成。

任务时长不设硬限制与通信失联防护是不同问题。心跳与可续期 execution lease 不代表业务完成或自动重试授权；是否改动其隔离语义需单独设计，本次没有确认删除 lease。

## 复审触发条件

允许 fire-and-forget 子任务、改变父子验收覆盖、增加硬业务截止或自动未知执行重放时重新评估。文件快照与消息裁剪也须保持当前 binding/epoch/revision 和有效 prompt/tools 证据。

## 相关页面

- 会话: [[sessions/2026-10-04-squad-review-clarification]]
- 概念: [[concepts/squad-completion-yield-scheduling]]
- 前序: [[decisions/2026-09-27-squad-recovery-guidance-acceptance]]
