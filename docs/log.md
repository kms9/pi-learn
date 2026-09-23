---
title: Wiki 日志
type: log
status: active
created: 2026-09-07
updated: 2026-09-24
tags:
  - project-wiki
  - log
---

# Wiki 日志

按时间追加。事件类型：`init`、`ingest`、`query`、`lint`、`sync`、`decision`、`maintenance`、`session`。

## [2026-09-24] decision | Controller 限定 Go 1.27 与 Gin 栈

- 来源: 用户确认 Gin、Resty、Viper、Cobra、herdr-dashboard 的 Bubble Tea v1，并要求重构 controller
- 更新: `pi_squad/controller/AGENTS.md`、`pi_squad/controller/`、`docs/decisions/2026-09-24-controller-go-stack.md`、`pi_squad/USAGE.md`
- 说明: 库只用于 controller。`serve` 写库；`agents` 与 `tui` 用 Resty 只读。旧启动参数仍可用。smoke PASS。

## [2026-09-24] query | 角色提示按进程加载、按用户回合套用

- 来源: 用户问当前配置是按 session 注入还是按每次 LLM turn 注入，以及参考项目
- 更新: `docs/concepts/pi-squad.md`、`pi_squad/USAGE.md`
- 说明: `PI_SQUAD_CONFIG` 在 Extension 工厂读一次。`before_agent_start` 返回的 `systemPrompt` 不进 transcript，只覆盖该次用户回合的 agent run。

## [2026-09-24] session | Pi Squad 配置与启动说明

- 来源: 用户要求整理插件的配置、启动文档，并在后续功能落地时继续更新
- 更新: `pi_squad/USAGE.md`、`AGENTS.md`、`docs/concepts/pi-squad.md`、本页、会话索引
- 说明: 使用说明只保留一份。给 `pi_squad/` 增加已可用功能时，同一次改动更新 `USAGE.md`。

## [2026-09-23] session | P0 身份注册与 HTTP Registry

- 来源: Notion P0–P7 方案与源码对照评估（会话附件）
- 更新: `pi_squad/`、`pi_squad_case/phase_00_identity/`、`docs/concepts/pi-squad.md`、`docs/decisions/2026-09-23-p0-identity-fields.md`、`docs/sources/herdr-pi-extension-plan.md`、`docs/sessions/2026-09-23-p0-identity.md`、索引
- 说明: 落地 register/heartbeat/list；不实现 P1+ 消息与任务。Pi 三进程 Case 在本环境 NOT RUN。

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

## [2026-09-21] session | Pi Squad 六阶段实验规划

- 来源: 用户确认的单机、在线Agent、既有会话、显式恢复、Go优先边界；Pi/Intercom/Subagents/Agent Teams/Multica/Herdr固定源码。
- 更新: 新分支 `pi_squad_dev` 的 `pi_squad_case/` 六阶段文档、总索引、源码清单、验收模板；`docs/sessions/2026-09-21-pi-squad-plan.md`、`docs/index.md`。
- 说明: 共75个计划验收用例，明确用户操作和通过/失败标准；本次没有实现功能代码或执行运行验收，全部为NOT_RUN；不修改上游submodule，不自动启动Agent。

## [2026-09-21] session | Pi Squad 00/01 三方评审与故障规则裁决

- 来源: 用户指定的 Herdr Grok `w3:p1`、Cursor `w6:p1` 与 Codex 评审；用户两项明确裁决；固定 Pi 源码。
- 更新: `docs/sessions/2026-09-21-pi-squad-00-01-review.md`、`docs/decisions/2026-09-21-squad-ownership-and-suspect.md`、开放问题及索引；阶段00/01 README、总方案与验收规范。
- 说明: 三方同意最终实施合同；失租不释放身份占用，用户显式release采用CAS并撤销旧runtime；suspect拒绝新投递，由调用者恢复后重试。澄清快照、watch、reload和跨daemon重连。增加10项补充验收，共85项，全部NOT_RUN；本轮未实现代码，未修改上游submodule。

## [2026-09-21] session | 与 Grok 再审 Pi Squad 并发与重放边界

- 来源: 用户要求再次协商；Herdr Grok `w3:p1` 的 `GROK_FOLLOWUP_R1` 与 `GROK_FOLLOWUP_FINAL`。
- 更新: `docs/sessions/2026-09-21-pi-squad-00-01-review.md`、既有决策页、索引、阶段00第11节/01第10节。
- 说明: Codex与Grok同意单飞+持久connect_seq、旧close/timeout隔离、quit统一CAS撤销与安全幂等、prompt_depth及activity即时发布。无新增用户裁决；M0/M1合同可进入实现。扩充原用例子场景，总数85不变，全部NOT_RUN；未实现代码或修改上游。

## [2026-09-21] session | 按用户历程讲解 Pi Squad 产品需求

- 来源: 用户要求从使用过程检查需求；六阶段方案及既有故障处理决定。
- 更新: `docs/sessions/2026-09-21-pi-squad-user-journey.md`、总索引与会话索引。
- 说明: 串联准备、发现、通知/问答/委派、用户接管、固定小队、异常恢复与观察；显式区分Pi-only范围、00/01首版和后续能力。等待用户反馈，未新增需求决策、未实现代码。

## [2026-09-21] query | 澄清正式任务执行中插话与待核实

- 来源: 用户追问；阶段03既有会话并发与用户操作合同。
- 更新: `docs/sessions/2026-09-21-pi-squad-user-journey.md`、索引。
- 说明: 插话指向执行正式任务的目标Pi注入普通输入；待核实阻止自动归属成功，不代表已停止执行。说明补充任务与改变任务尚未区分的体验代价；任务关联补充入口仅为建议，未修改需求合同。

## [2026-09-21] session | 打开 Pi Trace dashboard

- 来源: 用户要求打开插件 dashboard；`pi-trace-extension` 用法与本机 `trace_to_html.py --dashboard`。
- 更新: `docs/sessions/2026-09-21-open-trace-dashboard.md`、`docs/sources/pi-trace-extension.md`、来源索引与登记。
- 说明: 默认指 pi-trace 跨会话 dashboard，不是 Herdr 或 Pi Squad 观察面。未改 submodule。

## [2026-09-24] ingest | 同步 Herdr + Pi Extension Cases

- 来源: https://app.notion.com/p/kms9/Herdr-Pi-Extension-Cases-3e4df99ce2a3817d99f5f5c68cba60f9
- 更新: `docs/sources/herdr-pi-extension-cases.md`、既有摘要页、来源登记与索引
- 说明: 公开页全文 450 个块落入 wiki，未改写条款。空间里另一篇多智能体研究页不在本页内容树中，未并入。

## [2026-09-21] decision | 区分任务补充与接管，介入直接向上反馈未完成

- 来源: 用户接受补充/接管分离，并明确要求监听或等待中的上层获得未完成与用户介入反馈。
- 更新: `docs/decisions/2026-09-21-squad-user-intervention.md`、用户历程、索引、阶段03/04。
- 说明: 补充关联任务版本继续；接管/未关联普通输入使原attempt interrupted/manual_interference，持久通知父节点并结束等成功状态，禁止旧结果冒充完成或自动重派。明确反馈不代表底层Pi停止；细化INV-09/TEAM-13，总85项不变、全部NOT_RUN。

## [2026-09-24] query | 本地 Squad 安装与注入追踪

- 来源: 本地 Pi 包文档、Squad/Trace 源码、上游 Trace README；本机 `pi --version` 与 `pi list`
- 更新: `pi_squad/USAGE.md`、`docs/sessions/2026-09-24-local-extension-and-trace.md`、`docs/index.md`
- 说明: 明确本地入口安装、日常与隔离启动、Trace 请求观察及截断边界。仅写文档，未安装插件、修改全局配置或调用模型。
