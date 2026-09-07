---
title: agent harness 的 X 讨论
type: source
status: active
created: 2026-09-07
updated: 2026-09-07
source_path: x.com
tags:
  - project-wiki
  - source-summary
---

# agent harness 的 X 讨论

## 来源

- 本地路径: 无（检索 2026-09-07）
- 外部: X 关键词 / 语义检索 `agent harness`、`from:badlogicgames harness`、`deepseek harness`
- 来源日期: 2026-02 至 2026-09
- Ingest 日期: 2026-09-07

## 摘要

公开讨论把 harness 说成「模型外面那一层」，不是 loop 的别名。Pi 被当成最小、可教的 coding harness；DeepSeek 开源的是整棵插件 runtime。黄仁勋把同一层叫 LLM 的外骨骼。

## 关键事实

- **等式**：@soasme（[2094712547014533444](https://x.com/soasme/status/2094712547014533444)）：`agent harness ≈ ai agent − model`。Context Studios（[2096971501308403852](https://x.com/_contextstudios/status/2096971501308403852)）：模型只返回文本；loop、tools、memory、guardrails 在模型外，那一层叫 agent harness。
- **脑 / 身体**：@SeanMorrison（[2095008554868674625](https://x.com/SeanMorrison/status/2095008554868674625)）：model = brain，harness = API 连上去的 body；连上并循环才是 agent。黄仁勋 G20（@karlmehta 转述 [2096959239399026699](https://x.com/karlmehta/status/2096959239399026699)；Computex 2026 另有「model / harness / tools / runtime」）：*What made AI useful is putting an exoskeleton around the LLM. That exoskeleton is what is called an agent harness.*
- **loop ≠ graph ≠ harness**：@beamnxw（[2081044232479928709](https://x.com/beamnxw/status/2081044232479928709)）、@0xwhrrari（[2084636205732209143](https://x.com/0xwhrrari/status/2084636205732209143)）。Harness 管暴露（tools、permissions、memory、sandboxes、evals、traces、humans）；loop 管迭代与停止；graph 管拓扑。失败时先判断是哪一层。
- **外置智能**：@akshay_pachaar（[2045510648474530263](https://x.com/akshay_pachaar/status/2045510648474530263)）：模型故意做薄；memory / skills / protocols 绕 harness 转，中间是 sandbox、observability、compression、approval、sub-agent。
- **Pi 被怎么指**：@0xSero（[2048156544034799675](https://x.com/0xSero/status/2048156544034799675)）称 `packages/agent` 为读过的最好、最小、缓存命中最高的 agent loop。@doodlestein（[2024526138102435934](https://x.com/doodlestein/status/2024526138102435934)）：Pi 是类似 Claude Code / Codex 的极简可扩展 harness，也是 OpenClaw 的核心。@voidflx（[2096613261676601527](https://x.com/voidflx/status/2096613261676601527)）：loop + context + tools + 扩展，其余自己来。
- **Mario**：Pi 文档和 README 自称 *minimal terminal coding harness*。X 上谈 compaction 隐瞒、harness v2、internal multiplayer；[2087180071752585416](https://x.com/badlogicgames/status/2087180071752585416) 明确新 harness 在 agent 包和若干新包里，**coding-agent 默认没用**。
- **DeepSeek Harness**：2026-09 时间线上同时出现开源 runtime、插件生态、和 Pi / OpenCode / OpenClaw 并列的宿主面板。营销帖（95k stars 等）未核，不写入断言。

## 相关页面

- 概念: [[concepts/harness|Harness]]
- 学习: [[learning/harness对照讲解|Harness 对照讲解]]
- 会话: [[sessions/2026-09-07-harness-pi-vs-dsh|本次会话]]

## 证据备注

X 帖会删改。黄仁勋原话以 G20 / Computex 公开讲话为准，不靠转述图。`julin.ai` 与 `contextstudios.ai` 本次抓取被 SSRF 拦住，只保留 X 上已出现的句子。
---
