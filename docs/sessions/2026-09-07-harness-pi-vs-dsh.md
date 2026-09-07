---
title: 2026-09-07 对照 Pi 与 DeepSeek 的 harness 实现
type: session
status: active
created: 2026-09-07
updated: 2026-09-07
tags:
  - project-wiki
  - session
---

# 2026-09-07 对照 Pi 与 DeepSeek 的 harness 实现

## 用户要做什么

对照 `pi-dev/packages/coding-agent` 和 `deepseek-harness` 的 harness 实现，讲清 harness 定义，并检索 X 上的解释。

## 达成了什么

- 结论: harness ≈ agent − model。Pi 的产品文案、`AgentHarness` 规范、DSH 整仓三套用法不要混。coding-agent 默认仍走 `Agent`/`agentLoop`；DSH 的 loop 是可替换插件。两边 loop 形状相近，但 Pi 的 turn ≈ DSH 的 step。
- 检索了 X（Jensen、loop/graph/harness 三分、Pi 口碑、Mario 对 v2 的范围、DSH 时间线）并写回来源页。

## 写回了哪些 wiki 页

- [[concepts/harness|Harness]]
- [[learning/harness对照讲解|Harness 对照讲解]]（独立讲解稿）
- [[learning/harness对照-pi与dsh|对照提纲]]
- [[sources/agent-harness-x-discourse|X 讨论]]
- [[sources/pi-agent-core|Pi agent core]]
- [[sources/deepseek-harness|DeepSeek Harness]]

## 未决

- [[questions/open-questions|Q5]]：coding-agent 默认路径何时切到 `AgentHarness`

## 相关页面

- 概念: [[concepts/harness|Harness]]
- 学习: [[learning/harness对照讲解|Harness 对照讲解]]、[[learning/怎么学写插件|怎么学写插件]]
- 来源: 上列 sources
---
