---
title: Wiki 日志
type: log
status: active
created: 2026-09-07
updated: 2026-09-21
tags:
  - project-wiki
  - log
---

# Wiki 日志

按时间追加。事件类型：`init`、`ingest`、`query`、`lint`、`sync`、`decision`、`maintenance`、`session`。

## [2026-09-21] query | 如何把仓库更新到最新

- 来源: 用户问当前仓库怎样更新到最新版本
- 更新: `docs/overlay/仓库结构.md`、`docs/sessions/2026-09-21-how-to-update-repo.md`、索引
- 说明: 最新 = submodule 登记分支尖 + overlay 钉死 gitlink。命令 `./scripts/sync-submodules.sh`，再 `python3 scripts/sync-zh.py`。本次只写流程，未跑同步。

## [2026-09-18] ingest | 加入 Pigo Go Runtime 对照源码

- 来源: `smallnest/pigo`
- 更新: `.gitmodules`、`pigo/` gitlink、`README.md`、`docs/sources/pigo.md`、来源登记与索引
- 说明: 将 Pigo 作为 Pi 的 Go 语言重实现纳入 Raw / Evidence 层，固定到 `891d1f372cefa92b5f5a104db20521238ba5a9fe`；后续用于对照 Agent loop、Session、stream-json、权限边界、Skills/Plugins 以及 Go 侧 Runtime / Harness 接入设计。

## [2026-09-16] maintenance | 更新 README 项目定位与源码导航

- 来源: 当前 `.gitmodules`、既有 Wiki 结构与近期 Paseo / Pi Agent Teams / Herdr 研究
- 更新: `README.md`
- 说明: 将仓库定位从单纯的 Pi 中文维护层扩展为以 Pi 为核心的 Agent Harness / Runtime / Multi-Agent 源码学习与架构验证仓库；增加当前关注重点、推荐阅读路径，以及所有已跟踪 submodule 和 Herdr / pi-agent-teams 的可点击上游源码链接。

## [2026-09-16] session | Paseo、Pi Agent Teams 与 Herdr 多 Harness 协同

- 来源: `getpaseo/paseo`、`tmustier/pi-agent-teams`、`herdrdev/herdr`、`herdr-pi-extensions/packages/pi-herdr/`
- 更新: `docs/learning/Paseo-Pi-Agent-Teams-Herdr多Harness协同架构.md`、`docs/sources/paseo.md`、`docs/sessions/2026-09-16-paseo-agent-teams-herdr.md`、相关索引；新增 `paseo/` submodule 与 `.gitmodules` 登记
- 说明: 明确 Role ≠ Harness ≠ TUI；把 `TeammateRpc = Pi RPC process` 视为当前耦合点，后续目标为 `TeamMemberEndpoint + RoleProfile + CanonicalAgentEvent + Herdr presentation binding`。Paseo gitlink 固定到 `425157595038614a44e2cbf9c393f2e263270b95`。

## [2026-09-12] maintenance | 同步第三方 submodule 到上游最新分支头

- 来源: `.gitmodules` 中登记的上游仓库与跟踪分支
- 更新: `pi-dev`、`herdr-pi-extensions`、`pi-context`、`pi-subagents`、`pi-workflows`、`deepseek-harness` 的 gitlink SHA
- 说明: `agent-tools`、`pi-intercom`、`pi-trace-extension` 已处于对应上游分支最新提交，本次不变。此次仅更新只读 Raw 层的 submodule 引用，不修改上游源码内容。

## [2026-09-10] query | TUI 一次对话是 session

- 来源: 用户问 pi-dev 里 UI 对话对应 session 还是别的概念
- 更新: `docs/concepts/session.md`、`docs/sessions/2026-09-10-pi-session-conversation.md`、索引与来源交叉链接
- 说明: 产品对话单位是 session（JSONL 树 + `AgentSession`）。一轮输入是 agent run / turn。`conversation` 不是类型。

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
- 说明: 把已发生的仓库决策和学习目标编译进 wiki，并记入后续维护入口。
