---
title: pi_case 知识库索引
type: index
status: active
created: 2026-09-07
updated: 2026-09-21
tags:
  - project-wiki
  - index
---

# pi_case 知识库索引

这是本仓库的 LLM Wiki 入口。回答仓库问题、记录沟通、学习写 Pi 插件，都从这里开始，而不是每次重翻 `pi-dev/`。

三层：

- 原始证据：git submodule（`pi-dev/` 等）、`docs-zh/`，说明见 [[../raw/README|原始证据层]]
- 编译知识：本目录 `docs/`
- 维护规则：根目录 `AGENTS.md`

## Overlay 与仓库

- [[overlay/_index|Overlay 索引]]
- [[overlay/仓库结构|仓库结构]] - overlay、docs-zh、submodule；含「更新到最新」步骤

## 学习写插件

- [[learning/_index|学习索引]]
- [[learning/怎么学写插件|怎么学写插件]] - 阅读顺序、试跑方式、写插件时的硬约束
- [[learning/harness对照讲解|Harness 对照讲解]] - Pi coding-agent 与 DeepSeek Harness 的独立讲解稿
- [[learning/harness对照-pi与dsh|Pi 与 DeepSeek Harness 对照]] - 同上的条目提纲
- [[learning/Paseo-Pi-Agent-Teams-Herdr多Harness协同架构|Paseo、Pi Agent Teams 与 Herdr：多 Harness 协同架构]] - 异构 runtime、角色注入、统一消息与 Herdr TUI 分层

## 概念

- [[concepts/_index|概念索引]]
- [[concepts/extension|Extension]] - 本仓库默认的「插件」
- [[concepts/pi-package|Pi package]] - 用 `pi install` 分发的包
- [[concepts/chord-plugin|Chord plugin / facet]] - 实验性分进程插件
- [[concepts/harness|Harness]] - agent − model；Pi 产品 / AgentHarness / DSH 三套用法
- [[concepts/session|Session]] - TUI 上的一次对话；JSONL 树 + 活的 `AgentSession`

## 决策

- [[decisions/_index|决策索引]]
- [[decisions/2026-09-07-overlay-not-fork|2026-09-07 overlay 而不是 fork 上游]]
- [[decisions/2026-09-07-translations-live-in-docs-zh|2026-09-07 译文放在 docs-zh 并还原 pi-dev]]
- [[decisions/2026-09-07-github-clones-as-submodules|2026-09-07 现有 GitHub 仓改为 submodule]]

## 会话

- [[sessions/_index|会话索引]]
- [[sessions/2026-09-21-pi-squad-plan|2026-09-21 Pi Squad 本地实验需求确认与六阶段规划]]
- [[sessions/2026-09-21-how-to-update-repo|2026-09-21 如何把仓库更新到最新]]
- [[sessions/2026-09-16-paseo-agent-teams-herdr|2026-09-16 Paseo、Agent Teams 与 Herdr 多 Harness 协同]]
- [[sessions/2026-09-10-pi-session-conversation|2026-09-10 澄清 UI 对话 = session]]
- [[sessions/2026-09-07-overlay-and-plugin-learning|2026-09-07 overlay、译文迁移与插件学习]] - 本轮沟通编译
- [[sessions/2026-09-07-harness-pi-vs-dsh|2026-09-07 对照 Pi 与 DeepSeek 的 harness 实现]]

## 来源

- [[sources/_index|来源索引]]
- [[sources/source-register|来源登记]]
- [[sources/llm-wiki-pattern|LLM Wiki 模式]]
- [[sources/pi-agent-core|Pi agent core 与 coding-agent]]
- [[sources/deepseek-harness|DeepSeek Harness]]
- [[sources/paseo|Paseo]]
- [[sources/pigo|Pigo]]
- [[sources/agent-harness-x-discourse|agent harness 的 X 讨论]]

## 开放问题

- [[questions/open-questions|开放问题]]

## 日志

- [[log|Wiki 日志]] - 按时间追加；`grep "^## \[" docs/log.md | tail -5`

## Pi Squad 本地实验（pi_squad_dev 分支）

- [六阶段需求、技术实施与用户验收总索引](../pi_squad_case/README.md) - Go 控制面＋必要 TS Pi 扩展；仅在线 Agent；75 个计划用例，当前未实现/未执行。
- [固定源码与文件/函数参考](../pi_squad_case/SOURCES.md)
- [统一验收记录与恢复规范](../pi_squad_case/ACCEPTANCE.md)
