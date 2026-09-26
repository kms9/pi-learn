---
title: pi_case 知识库索引
type: index
status: active
created: 2026-09-07
updated: 2026-09-27
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

- [[concepts/squad-role-instance-lease|Squad 角色复用、当前 Team 与任务租约]] - 双 Team 共用 reviewer 的通俗解释

- [[concepts/_index|概念索引]]
- [[concepts/extension|Extension]] - 本仓库默认的「插件」
- [[concepts/pi-package|Pi package]] - 用 `pi install` 分发的包
- [[concepts/chord-plugin|Chord plugin / facet]] - 实验性分进程插件
- [[concepts/harness|Harness]] - agent − model；Pi 产品 / AgentHarness / DSH 三套用法
- [[concepts/session|Session]] - TUI 上的一次对话；JSONL 树 + 活的 `AgentSession`
- [[concepts/pi-squad|Pi Squad]] - Herdr + 薄 Extension + Go Controller 的本地协作验证；配置与启动见 `pi_squad/USAGE.md`

## 决策

- [[decisions/2026-09-25-squad-team-runtime-scope|2026-09-25 Squad 专属目录与启动身份]]

- [[decisions/2026-09-24-squad-role-directories|2026-09-24 一角色一目录]]

- [[decisions/2026-09-24-squad-role-frontmatter|2026-09-24 Squad 角色格式与首版范围]]

- [[decisions/2026-09-21-squad-ownership-and-suspect|2026-09-21 身份占用优先与 suspect 拒绝投递]]
- [[decisions/2026-09-21-squad-user-intervention|2026-09-21 任务补充继续、用户介入向上反馈未完成]]
- [[decisions/_index|决策索引]]
- [[decisions/2026-09-07-overlay-not-fork|2026-09-07 overlay 而不是 fork 上游]]
- [[decisions/2026-09-07-translations-live-in-docs-zh|2026-09-07 译文放在 docs-zh 并还原 pi-dev]]
- [[decisions/2026-09-07-github-clones-as-submodules|2026-09-07 现有 GitHub 仓改为 submodule]]
- [[decisions/2026-09-24-controller-go-stack|2026-09-24 Controller 使用 Go 1.27 与 Gin 栈]]
- [[decisions/2026-09-23-p0-identity-fields|2026-09-23 P0 身份字段与 HTTP Registry]]

## 会话

- [[sessions/2026-09-27-pi-squad-phase04-consolidation|2026-09-27 阶段 04 冲突审查、实施顺序与文档统一]]

- [[sessions/2026-09-25-squad-role-lease-explanation|2026-09-25 澄清角色实例与执行租约]]

- [[sessions/2026-09-25-squad-team-runtime-design|2026-09-25 Team Runtime 评估与需求技术文档]]

- [[sessions/2026-09-24-squad-sse-delivery|2026-09-24 SSE 下发与边界验收]]

- [[sessions/2026-09-24-squad-intercom-assessment|2026-09-24 Pi Intercom 借鉴评估]]

- [[sessions/2026-09-24-squad-http-messaging|2026-09-24 运行实例校验与 HTTP 消息开发]]

- [[sessions/2026-09-24-squad-role-dir-check|2026-09-24 角色目录与发现链路可见验收]]
- [[sessions/2026-09-24-squad-herdr-check|2026-09-24 Pi Squad 检查必须新开 space]]
- [[sessions/2026-09-24-squad-role-directories|2026-09-24 角色目录迁移]]

- [[sessions/2026-09-24-controller-heartbeat-dashboard|2026-09-24 心跳日志与 Dashboard 分工]]

- [[sessions/2026-09-24-squad-get-agent-development|2026-09-24 get_agent 开发与验收交接]]

- [[sessions/2026-09-24-squad-messaging-readiness|2026-09-24 通信验证就绪评估与最小下一步]]

- [[sessions/2026-09-24-squad-frontmatter-runtime-implementation|2026-09-24 实现 Markdown 角色、cwd 与运行 UUID]]

- [[sessions/2026-09-24-squad-role-frontmatter|2026-09-24 Squad 角色文件内容建议]]

- [[sessions/2026-09-24-squad-agents-yaml-feasibility|2026-09-24 Squad 本地角色 YAML 发现可行性]] - 评估草案，未实施

- [[sessions/2026-09-24-local-extension-and-trace|2026-09-24 本地 Squad 安装与注入追踪]]

- [[sessions/2026-09-24-pi-squad-usage|2026-09-24 整理 Pi Squad 配置与启动说明]]
- [[sessions/2026-09-21-pi-squad-user-journey|2026-09-21 从用户历程审阅 Pi Squad 需求]] - 含“插话后待核实”的范围与示例
- [[sessions/2026-09-21-pi-squad-00-01-review|2026-09-21 Pi Squad 身份与发现三方评审]] - 含与指定 Grok 再次协商：握手排序、释放重放、活动状态时序
- [[sessions/2026-09-21-open-trace-dashboard|2026-09-21 打开 Pi Trace dashboard]]
- [[sessions/_index|会话索引]]
- [[sessions/2026-09-21-pi-squad-plan|2026-09-21 Pi Squad 本地实验需求确认与六阶段规划]]
- [[sessions/2026-09-23-p0-identity|2026-09-23 实现 P0 身份注册切片]]
- [[sessions/2026-09-21-how-to-update-repo|2026-09-21 如何把仓库更新到最新]]
- [[sessions/2026-09-16-paseo-agent-teams-herdr|2026-09-16 Paseo、Agent Teams 与 Herdr 多 Harness 协同]]
- [[sessions/2026-09-10-pi-session-conversation|2026-09-10 澄清 UI 对话 = session]]
- [[sessions/2026-09-07-overlay-and-plugin-learning|2026-09-07 overlay、译文迁移与插件学习]] - 本轮沟通编译
- [[sessions/2026-09-07-harness-pi-vs-dsh|2026-09-07 对照 Pi 与 DeepSeek 的 harness 实现]]

## 来源

- [[sources/multica-team-runtime|Multica Team Runtime 固定源码参考]]

- [[sources/sse-standard|SSE 标准与应用边界]]

- [[sources/pi-intercom|Pi Intercom 消息流程源码参考]]

- [[sources/agent-role-config-references|Agent 角色配置参考]]

- [[sources/_index|来源索引]]
- [[sources/source-register|来源登记]]
- [[sources/llm-wiki-pattern|LLM Wiki 模式]]
- [[sources/pi-agent-core|Pi agent core 与 coding-agent]]
- [[sources/deepseek-harness|DeepSeek Harness]]
- [[sources/paseo|Paseo]]
- [[sources/pigo|Pigo]]
- [[sources/herdr-pi-extension-plan|Herdr + Pi Extension 验证方案]]
- [[sources/herdr-pi-extension-cases|Herdr + Pi Extension Cases]] - Notion 验证规范全文
- [[sources/pi-trace-extension|Pi Trace Extension]]
- [[sources/agent-harness-x-discourse|agent harness 的 X 讨论]]

## 开放问题

- [[questions/open-questions|开放问题]]

## 日志

- [[log|Wiki 日志]] - 按时间追加；`grep "^## \[" docs/log.md | tail -5`

## Pi Squad 本地实验（pi_squad_dev 分支）

- [六阶段需求、技术实施与用户验收总索引](../pi_squad_case/README.md) - Go 控制面＋必要 TS Pi 扩展；仅在线 Agent；当前登记 160 个计划用例，测试结果以各阶段实际记录为准。
- [固定源码与文件/函数参考](../pi_squad_case/SOURCES.md)
- [统一验收记录与恢复规范](../pi_squad_case/ACCEPTANCE.md)

- [阶段 04 统一需求与 89 项验收](../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md) / [技术设计、冲突裁决、实施顺序与来源](../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_DESIGN.md) - 2026-09-27 合并；新能力待实现，89 项 NOT_RUN；既有切片结果不被重置。
