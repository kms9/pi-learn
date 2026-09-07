---
title: Wiki 日志
type: log
status: active
created: 2026-09-07
updated: 2026-09-07
tags:
  - project-wiki
  - log
---

# Wiki 日志

按时间追加。事件类型：`init`、`ingest`、`query`、`lint`、`sync`、`decision`、`maintenance`、`session`。

## [2026-09-07] session | 把 harness 对照收成独立讲解稿

- 来源: 用户要求把对照讲解记录到一份独立文档
- 更新: `docs/learning/harness对照讲解.md`；索引与 [[sessions/2026-09-07-harness-pi-vs-dsh]] 指向它
- 说明: 聊天里的完整讲解（定义、X 引文、包边界、loop/会话/工具/扩展、崩溃对照）收在一份可从头读到尾的文档。

## [2026-09-07] session | 对照 Pi 与 DeepSeek 的 harness 实现

- 来源: `pi-dev/packages/agent`、`pi-dev/packages/coding-agent`、`deepseek-harness/`、X 检索
- 更新: `docs/concepts/harness.md`、`docs/learning/harness对照-pi与dsh.md`、`docs/sources/pi-agent-core.md`、`docs/sources/deepseek-harness.md`、`docs/sources/agent-harness-x-discourse.md`、`docs/sessions/2026-09-07-harness-pi-vs-dsh.md`、`docs/questions/open-questions.md`
- 说明: harness ≈ agent − model。Pi 产品文案、耐久 AgentHarness、DSH 整仓三套用法分开；coding-agent 默认仍走进程内 Agent loop。

## [2026-09-07] decision | 现有 GitHub 仓改为 submodule

- 来源: 用户要求用已有 GitHub 仓做 submodule 并后续同步
- 更新: `.gitmodules`、`.gitignore`、`scripts/sync-submodules.sh`、`README.md`、`AGENTS.md`、`docs/overlay/仓库结构.md`、`docs/decisions/2026-09-07-github-clones-as-submodules.md`、`docs/sessions/2026-09-07-github-clones-as-submodules.md`、`docs/questions/open-questions.md`
- 说明: 本地 clone 未重下；git 目录迁到 overlay 的 `.git/modules/`。同步用 `./scripts/sync-submodules.sh`。

## [2026-09-07] init | 按 LLM Wiki 规范初始化 docs/

- 来源: Karpathy LLM Wiki gist、`project_wiki/AGENTS.md`、本仓库既有 overlay 与对话
- 更新: `AGENTS.md`、`raw/README.md`、`docs/index.md`、`docs/log.md`、`docs/templates/`、`docs/sources/`、`docs/overlay/`、`docs/learning/`、`docs/concepts/`、`docs/decisions/`、`docs/sessions/`、`docs/questions/`
- 说明: `docs/` 成为编译知识层。后续沟通默认写回对应目录，不把可复用结论只留在聊天里。

## [2026-09-07] session | overlay、译文迁移与插件学习

- 来源: 本仓库会话（翻译 pi 文档、迁出 docs-zh、还原 pi-dev、初始化 overlay git、编写 AGENTS.md）
- 更新: `docs/sessions/2026-09-07-overlay-and-plugin-learning.md` 及上述决策/概念/学习页
- 说明: 把已发生的仓库决策和学习目标编译进 wiki。
