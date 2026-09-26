---
title: 阶段 04｜Team Runtime 与 Pi 交互
status: draft
type: index
scope_status: confirmed
implementation_status: not_implemented
acceptance_status: not_run
updated: 2026-09-27
---

# 阶段 04｜Team Runtime 与 Pi 交互

本阶段同时交付 **Team 调度、正式任务协作、Pi 调用命令与 Dashboard 交互**。本页只作导航；配置、状态和验收不在这里另立一套规则。

## 唯一实施依据

| 文档 | 内容 |
|---|---|
| [统一需求与验收](TEAM_RUNTIME_REQUIREMENTS.md) | TR-01—TR-18；目录、身份、调度、调用、上下文、质量门、恢复、命令和 Dashboard；89 个计划验收用例 |
| [技术设计与实施顺序](TEAM_RUNTIME_DESIGN.md) | C01—C20 冲突与歧义处理；架构、schema、事务、状态机、Pi 适配、M0—M8 增量及逐功能固定源码来源 |
| [全局验收规范](../ACCEPTANCE.md) | 真实 Pi、控制面和产物证据，失败复测、版本记录、恢复与安全清理 |

需求决定“必须达成什么”；技术设计决定“按什么契约实现”。本轮补全的实施默认值与此前已确认的四个调度约束分开标注，不冒称为上游现成能力或此前逐项批准的决定。

## 阅读与实施入口

先读需求第 0 节的边界和术语，再读技术设计冲突表 C01—C20，随后按技术设计 D10 的 M0—M8 实施。核心顺序是：契约与能力检查 → Project/身份 → 单 Task 真实闭环 → 恢复与输入隔离 → Leader/DAG/质量门 → 多 Team 与父子续接 → 完整 Pi 命令 → 完整 Dashboard → 全量验收。

只读 UI 和 parser 可在契约固定后并行开发；不能先用 Messaging ask 或另一个插件模拟正式 Task，再补调度。阶段 04 的命令和 Dashboard 必须本阶段验收；阶段 05 只增加 Herdr location/focus，不能作为 P4 基础功能的延期理由。

## 验收索引

- TR-A01—TR-A33：33 个 Team Runtime 用例。
- CMD-A01—CMD-A16：16 个 Pi TUI / Handoff 用例。
- P4-A01—P4-A40：40 个本轮补充的一致性、目录、输入、恢复与交互检查。

合计 **89 项**。这些是计划用例，当前均为 **NOT_RUN**。P4 新能力仍未实现；既有身份/HTTP 消息切片的已记录结果继续保留，不被本次文档合并重置，也不能自动视作新协议已通过。

## 文档合并记录

本次以 `pi_squad_dev@cdae80379685ff5c79621117712ce9f53ddefe1c` 为基线，将原五份文件合并为本页及两份权威文档。`PI_TUI_ROLE_HANDOFF_REQUIREMENTS.md` 已并入统一需求和技术设计；`TEAM_RUNTIME_PLAN.md` 原本已 superseded，不再留在当前目录造成实施歧义。

原文完整保留在 [合并前固定目录](https://github.com/kms9/pi-learn/tree/cdae80379685ff5c79621117712ce9f53ddefe1c/pi_squad_case/04-team-orchestration)。逐文件去向见技术设计 H 节。此次仅修改文档，不修改上游 submodule、功能源码、真实配置或已运行服务，也不自动合并其他 PR。
