---
title: 阶段 04｜Team Runtime 与 Pi 交互
status: draft
type: index
scope_status: confirmed
implementation_status: implemented_pending_acceptance
acceptance_status: partial
updated: 2026-09-27
---

# 阶段 04｜Team Runtime 与 Pi 交互

本阶段同时交付 **Team 调度、正式任务协作、Pi 调用命令与 Dashboard 交互**，并吸收尚未实现的阶段 03 调用能力。本页只作导航；配置、状态和验收不在这里另立一套规则。

## 唯一实施依据

| 文档 | 内容 |
|---|---|
| [统一需求与验收](TEAM_RUNTIME_REQUIREMENTS.md) | TR-01—TR-18；目录、身份、激活与 Role 占用、调度、调用、上下文、质量门、恢复、命令和 Dashboard；89 个计划验收用例、4a/4b 分段与阶段 03 映射 |
| [技术设计与实施顺序](TEAM_RUNTIME_DESIGN.md) | C01—C22 冲突与歧义处理；架构、schema、事务、状态机、Pi 适配、4a（M0—M6）/4b（M7—M9）增量及逐功能固定源码来源 |
| [全局验收规范](../ACCEPTANCE.md) | 真实 Pi、控制面和产物证据，失败复测、版本记录、恢复与安全清理 |

需求决定“必须达成什么”；技术设计决定“按什么契约实现”。当前目录下的需求与其它文档冲突时，以本目录为准。

## 2026-09-27 用户确认

- Team 激活（Run 准入）时原子占用 roster 全部 Role；任一被他队占用则整个 Run 排队、不占任何 Role。激活期间这些 Role 不接受其它 Team 的模型工作，因此跨 Team 不会形成 Role 互占环。
- “释放 active 状态”即显式 `/squad cancel run:<id>`，安全收尾后整体释放 Role。由此带来的串行吞吐是既定设计。
- 阶段 03 能力由本阶段 4a 交付，不单独实施；`03-agent-invocation` 只删除了冲突点，INV-01—15 判据并入需求 2.6 的映射用例。
- 验收拆为 4a 单 Team 可用闭环与 4b 多 Team 与加固，各有退出门。

## 阅读与实施入口

先读需求第 0 节的边界和术语，再读技术设计冲突表 C01—C22，随后按技术设计 D10 实施。

- **4a**：契约与能力检查 → Project/身份/迁移 → 单 Task 真实闭环（含 direct invocation）→ 恢复与输入隔离 → 单 Team Leader/DAG/审查/续接 → Pi 调用命令 → Go TUI。
- **4b**：跨 Team 准入与唤醒 → Pi 内 dashboard 与命令预览、观察端断线处理 → 最终 payload 证据与全量收口。

只读 UI 和 parser 可在契约固定后并行开发；不能先用 Messaging ask 或另一个插件模拟正式 Task，再补调度。阶段 04 的命令和 Dashboard 必须本阶段验收；阶段 05 只增加 Herdr location/focus，不能作为 P4 基础功能的延期理由。

## 验收索引

- TR-A01—TR-A33：33 个 Team Runtime 用例。
- CMD-A01—CMD-A16：16 个 Pi TUI / Handoff 用例。
- P4-A01—P4-A40：40 个一致性、目录、输入、恢复与交互检查。

合计 **89 项**，其中 4a 71 项、4b 18 项，清单见需求 2.5。这些是计划用例，当前均为 **NOT_RUN**。既有身份/HTTP 消息切片的已记录结果继续保留，不能自动视作新协议已通过。

## 文档合并记录

本目录以 `pi_squad_dev@cdae80379685ff5c79621117712ce9f53ddefe1c` 为基线，将原五份文件合并为本页及两份权威文档。原文完整保留在 [合并前固定目录](https://github.com/kms9/pi-learn/tree/cdae80379685ff5c79621117712ce9f53ddefe1c/pi_squad_case/04-team-orchestration)，逐文件去向见技术设计 H 节。2026-09-27 按用户确认补充了 Role 整体占用、阶段 03 并入与 4a/4b 分段。

2026-09-27 经 Codex / Cursor 三轮协商及四项用户裁决补充恢复、LeaderStep、授权、验收及原生命令边界；见 [评估记录](../../docs/sessions/2026-09-27-pi-squad-phase04-cursor-review.md) 和设计 D12。主场景仍为 89 项（4a 71 / 4b 18），新增子断言均未执行。

开发核对入口：[18 条需求实现对应与收口表](IMPLEMENTATION.md)。该表不替代验收结果；先完成开发，再统一检查。

本轮代码开发已收口，待 Codex 统一验收；构建与源码清单见 [development-build.json](development-build.json)，开发核对见 [IMPLEMENTATION.md](IMPLEMENTATION.md)。既有场景结果保留，本状态不表示阶段通过。
