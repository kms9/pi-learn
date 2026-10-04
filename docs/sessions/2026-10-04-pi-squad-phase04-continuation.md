---
title: 2026-10-04 Pi Squad 阶段 04 继续实施与验收
type: session
status: active
created: 2026-10-04
updated: 2026-10-04
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-10-04 Pi Squad 阶段 04 继续实施与验收

## 用户要做什么

对照 `openspec/changes/archive/2026-10-04-pi-squad-team-orchestration` 找出未完成范围，继续开发并真实验收阶段 04。

## 达成了什么

当前 **71/71任务、89/89 PASS**（4a71、4b18），阶段04已完成。实际Pi1.0.1/TUI，不将其它宿主或全局160计划推导为通过。具体修复、范围、失败重测和安全收尾见 [开发记录](../../pi_squad_case/04-team-orchestration/IMPLEMENTATION.md) 和本地ignored逐项矩阵。

本轮直接完成，无协作 Agent；五种 Role 是 Pi Squad 产品自身运行。独立 Pi 1.0.1 TUI 与当前源码，未改上游、全局 Pi、用户服务，不运行单元测试。SQLite FULL 用隔离库引擎配额触发，未填满用户磁盘。

## 写回了哪些 wiki 页

- 本页、会话索引、主 index 与 log；可用配置及行为同步 `pi_squad/USAGE.md`。

## 未决

阶段04原规格无剩余项；Pi1.0.1兼容扩展矩阵仍保留未跑provider/独立native binary等分支，见 [[questions/open-questions|开放问题]]。Pi提示的新1.0.2没有在本轮运行，不扩大版本支持。

## 相关页面

- [[sessions/2026-10-04-pi-squad-pi-1.0.1-implementation|Pi 1.0.1 兼容实施]]
- [[concepts/pi-squad|Pi Squad]]
- [OpenSpec 任务](../../openspec/changes/archive/2026-10-04-pi-squad-team-orchestration/tasks.md)

## 2026-10-04 自动重试、压缩与长 Role 收口

P4-A31 已 PASS，任务10.1完成：当前63/71任务、62 PASS / 24 PARTIAL / 3 NOT_RUN。真实503后原生retry、400后原生overflow compaction（from_extension=false）、threshold压缩、长55188字节Role及后置section framing都有末位payload hash/身份/tools证据。每次retry保持同一个Attempt/segment，早期agent_end仍idle=false，最终settled才完成。

活动手动压缩复测进一步发现poll会取消原生摘要。修复在native manual compaction期间不重复abort维护摘要，成功/失败事件清理维护状态；保留正式gate与停止证明。最终原生摘要从59132 tokens成功压缩，正式Task仍manual_compaction中断并released，无自动续跑。原终端SIGSTOP后的输入协议夹具失败与真实poll-abort失败分别保存，未混作同一产品失败。长Role原文件已按原bytes恢复，测试Auditor显式release后恢复同一个session，旧runtime历史保留。

三层真实user_bash在leaf settled确认前介入，leaf interrupted/manual_interference，两层祖先needs_review，旧settled不推进。仍继续原89项的剩余子断言，不宣称阶段完成。

## 2026-10-04 提交前恢复门修复

真实SIGKILL发生在Task已受理、dispatch intent尚未提交的事务窗口。r32重启后未等待授权便自动创建Attempt并注入，保存为`crash-before-intent-unauthorized-replay-failure.json`。r33启动对账补齐accepted且无Attempt的standalone Task：标needs_review、controller_restart blocker与task_recovery_hold审计，不新建许可/输入。相同物理窗口复测后目标已在线及超过TTL仍无Attempt；操作者显式rebind后仅一个Attempt/一次input完成。USAGE同步恢复入口；Go生产/集成构建、TS、严格OpenSpec校验和diff检查通过。

首个提交后物理窗口也完成：actual intent提交后、adapter receipt前SIGKILL真实测试Pi和Controller，重启及TTL后仍隔离，无自动replay；错误runtime停止声明拒绝，精确human_attestation后release，再恢复同SID并显式retry完成，只新增一个Attempt、一次input。不是自动停止证明。before_final_gate窗口同样完成，其他逐窗口继续运行。

本轮矩阵当前64 PASS / 22 PARTIAL / 3 NOT_RUN，OpenSpec63/71。全部失败和夹具准备错误保留，阶段仍未完成。

## 2026-10-04 逐窗物理崩溃完成

任务4.7和P4-A18完成，`physical-crash-windows-summary.json`索引9个实际SIGKILL窗口及同SID恢复：intent提交前、提交后receipt前、最后注入gate、input的ACK前/后、result提交前/后、Pi settled未确认、Controller settled确认后。无结果窗口仅显式retry/rebind后输入；已有candidate显式recover无新模型请求；已确认完成在重启后保持completed/released。停止声明记录human_attestation，旧目标/epoch/历史保留，未宣称自动证明。

P4-A10新增F/E子断言完整复测：隔离r33、合成adapter（不是Pi/model）10/10匹配；同Task双blocker、第三分支运行、amend刷新自身wait不清peer、cancel只删自己的revision wait、分别释放写owner和affinity、最后派发。根fixture缺agents.md、Team human policy及observer project mismatch属于准备错误，均保留；最终资源全部released。主现场真实Pi与合成控制面有各自Controller/Dashboard。

当前OpenSpec64/71，89项为66 PASS /20 PARTIAL /3 NOT_RUN。剩余7个实施任务是7.3/7.5/7.6/10.2/10.3/10.4/10.5，仍含多Team第三轮故障、投影/交互竞争与全量子断言；不能标阶段完成。

## 2026-10-04 阶段 04 全量收口

OpenSpec **71/71** 任务完成，原 **89/89 PASS**：4a **71/71**、4b **18/18**。当前会话直接完成开发与独立运行核对，未委派协作 Agent；产品自身运行了 counter、summer、reviewer、auditor、researcher，以及三个 Team Leader 和 Reviewer Secondary。全局160仍是计划总数，其它阶段不据此判通过。

实际环境为独立npm **Pi1.0.1/TUI**、Node24.16.0、Go1.27.0、TS7.0.2、local-grok/grok-4.7；主控制面r29→r35/epoch18，最终配置错误和生产故障隔离使用r36。全局Pi1.0.0、用户服务和上游源码未修改。验收期间Pi提示有1.0.2更新，本轮没有切换宿主，结论仅覆盖实际1.0.1；RPC/JSON/print继续明确拒绝正式激活。

本次修复：canonical acceptance HTTP入口；原生手动压缩的及时fence及维护期间不重复abort；真实SQLite FULL的503分类；Controller重启前已受理但无Attempt的standalone恢复hold；管理CAS失败的持久拒绝审计；被占Role的Secondary及跨Team调用不再绕过ROLE_BUSY；缺acceptance mode先显示ACCEPTANCE_POLICY_MISSING。可用行为同步USAGE。

三轮真实实验完成：单Team两个计算Role并行得3/60、独立review与错误50返工；共享Reviewer时B整体排队、C不相交运行、A收尾唤醒；第三轮三层树取消与离线Reviewer、queued取消、Controller重启、Leader显式release/rebind、其它Team候选recover、旧回调不能推进。九个真实SIGKILL窗口分别留证；人工精确停止声明保留human_attestation，不冒称程序验证或自动回滚。

交互补验：原生Picker已有草稿取消/填稿、快速切Run与旧补全隔离；真实代理duplicate/gap/旧epoch/slow snapshot/断连恢复；native Dashboard cancel/promote/recover预览竞争CAS失败不改业务revision且留审计。Worker观察不中断、plain@拒绝、相关parent intent受理后才yield，普通输入接管；Leader普通guidance与takeover分开。普通“完成了”不构成结果。

验收策略补验：实际review接受pending候选；等长产物变化撤销旧review/acceptance，旧goal恢复拒绝，显式retry后以goal2新结果revision25独立重审并完成Gate；同稳定Agent实际/new换SID仍SELF_REVIEW。真实standalone父子及独立人工验收，F/E补checker错真值、人工作废、精确parent覆盖随child/goal变化撤销、不递归审review、无策略无业务Task。合成adapter仅作实际HTTP/SQLite的F/E，不冒充模型结果。

安全收尾：10个实际Pi原生退出并精确runtime release；两个Controller、proxy及Go观察退出，discovery删除，SQLite备份；两库execution_leases、role_ownership、agent_reservations、write_reservations、wait_edges均0，所有Run/Attempt cleanup released；本次wZ关闭，用户其它workspace保留。数字源恢复9字节原值；自己的故障开关清除，历史/极小clone artifact和证据保持ignored便于阅读。

逐项矩阵、U/E/R/F/D来源、INV01—15、89/160静态核对及失败/重测在本地ignored `integration/cases.json`、`integration/RESULT.md`、`integration/evidence/r29-20261004/`。其中临时helper输出全局变量误指旧报告，损坏的capacity-write-outbox-r33-retest.json不用于最终证明，重新运行r35并留完整4/4证据。多个夹具准备错误、暂停过久超时和真实产品失败均保留；不把它们合并成通过。未新增或运行单元测试，未提交、未archive。
