---
title: 2026-10-04 读取 Cursor 审核并澄清 Squad 优化方向
type: session
status: active
created: 2026-10-04
updated: 2026-10-04
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-10-04 读取 Cursor 审核并澄清 Squad 优化方向

## 用户要做什么

读取 Herdr wN:p1 的 Cursor 结论，结合六条补充解释父任务 yield、Leader 历史增长与 500ms Tick，记录后续优化方向。

## 达成了什么

- 结论: 使用用户指定 herdr skill；HERDR_ENV=1，当前 CLI group 语法核对后只读 agent get/read。wN:p1 为 Cursor/idle，完整结论与既有审核页一致。未向 Cursor 发消息、委派工作或改动其 pane。
- 用户明确取消业务 Task 固定截止，改以任务及必要派发子任务的明确回传为完成依据；数字 checker 保留测试用途，Leader 改用固定当前上下文和简报，其他历史文档漂移后续统一更新。
- 已区分 result_proposed、真实 settled、completed 与 acceptance；现有回传链已存在，父完成缺少对尚未完成 child 的强制检查。
- 详细说明 invoke→yield/settled→child 执行回传→父 continuation→父完成；澄清 child 的 parent_yield 条件及误提前完成漏洞。正常流程卡住与现有 deadline 转 needs_review 分开描述。
- 源码确认 500ms Tick 推进准入、review、response-only、续接、LeaderStep 和队列；模型没有每 500ms 调用。优化建议为事件唤醒和活动状态查询，保留有界失联/文件证据维护，不把所有时间机制混为业务超时。
- Leader 已有单项预览，但全 Run 任务行、指导与历史仍累积。固定文件还需配合请求消息裁剪/压缩；长历史/压缩增加墙钟耗时，当前 deadline 不暂停，从而出现审核所说的时间冲突。
- 本轮写入决策与概念，未改插件实现或当前 USAGE 的实际能力表述，未启动新的运行验收。方案中的文件路径、过滤预算、事件调度与 completion guard 均不是已实现功能。

## 写回了哪些 wiki 页

- 页面: [[decisions/2026-10-04-squad-explicit-completion-and-context]]、[[concepts/squad-completion-yield-scheduling]]、本页、docs/index.md、会话索引、问题与日志。

## 未决

- Q25 的业务截止方向已回答，标 closed 但注明实施未完成。
- Q26 具体提前完成错误/自动处理策略，以及 Leader 文件格式、长度/历史裁剪与事件调度的实施设计仍待确定。

## 相关页面

- 审核: [[sessions/2026-10-04-pi-squad-phase04-code-review]]
- 概念: [[concepts/squad-completion-yield-scheduling]]
- 决策: [[decisions/2026-10-04-squad-explicit-completion-and-context]]
