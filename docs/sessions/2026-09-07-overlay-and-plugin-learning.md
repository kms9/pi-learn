---
title: 2026-09-07 overlay、译文迁移与插件学习
type: session
status: active
created: 2026-09-07
updated: 2026-09-07
tags:
  - project-wiki
  - session
---

# 2026-09-07 overlay、译文迁移与插件学习

## 用户要做什么

对照 Pi 源码和现成插件，学习如何开发 Pi 插件；中文资料不挡上游更新；后续沟通按 LLM Wiki 记入 `docs/`。

## 达成了什么

- 翻译了 `coding-agent` / `agent` 等文档，后迁到 `docs-zh/`，`pi-dev` 已还原干净。
- overlay git 已 init（`main`），`scripts/sync-zh.py` 可对照哈希。
- 根目录 `AGENTS.md`：默认学 Extension，不改上游。
- `docs/` 按 LLM Wiki 初始化；本会话写回 wiki。

## 写回了哪些 wiki 页

- [[overlay/仓库结构]]
- [[learning/怎么学写插件]]
- [[concepts/extension]]、[[concepts/pi-package]]、[[concepts/chord-plugin]]
- [[decisions/2026-09-07-overlay-not-fork]]、[[decisions/2026-09-07-translations-live-in-docs-zh]]
- [[sources/llm-wiki-pattern]]、[[sources/source-register]]
- [[questions/open-questions]]

## 未决

见 [[questions/open-questions]]。
