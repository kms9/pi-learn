---
title: Wiki 日志
type: log
status: active
created: 2026-09-07
updated: 2026-10-04
tags:
  - project-wiki
  - log
---

# Wiki 日志

按时间追加。事件类型：`init`、`ingest`、`query`、`lint`、`sync`、`decision`、`maintenance`、`session`。

## [2026-10-02] maintenance | 全量同步 submodule 到最新上游分支尖点

- 来源: `.gitmodules` 登记的 11 个上游仓库；同步时各自 `main/master` 分支尖点
- 更新: 8 个 gitlink（`pi-dev`、`agent-tools`、`herdr-pi-extensions`、`pi-intercom`、`pi-subagents`、`pi-workflows`、`deepseek-harness`、`paseo`）；新增 `docs/sessions/2026-10-02-submodule-refresh.md`
- 不变: `pi-context`、`pi-trace-extension`、`pigo` 已是上游最新
- 说明: Pi 从 0.86.1 基线跨到 1.0.0 系列 main HEAD `3874b3e`；静态检查显示 Squad 使用的核心 extension API 仍存在，但阶段04真实 Pi 1.0 运行回归未在本次维护中执行，不能据此标为兼容验收通过。


## [2026-09-24] session | SSE 验收未收口

- 来源: 用户要求用真实 Pi 收口第二阶段，并迁移旧凭据测试
- 更新: `pi_squad_case/phase_02_http_messaging/RESULT.md`、`controller/agent/registry_test.go`、`controller/httpapi/server_test.go`
- 说明: 关闭测试 space `wE`，新开 `wF` / `127.0.0.1:18801`。三角色 `mode=sse`，两个 ask 分别回复 41 和 73。传输毫秒数未单独测出。SSE-02—06、offline、/new、幂等仍 NOT_RUN。未改实现。

## [2026-09-24] session | HTTP 消息可见验收未完成

- 来源: 用户授权验收运行实例校验与相互通信
- 更新: `pi_squad_case/phase_02_http_messaging/RESULT.md`、`README.md`
- 说明: 新 space `wE` / `127.0.0.1:18791`。notice、关联回复、在线同 ID 冲突、错误 release 拒绝有可见证据。ask 受限轮、offline、/new、幂等和 fixture 迁移未跑。未改实现，未碰 `wD`。

## [2026-09-24] session | 从项目目录重开 Pi Squad 检查

- 来源: 用户要求开始新一轮测试；上次测试 space 已不在
- 更新: `pi_squad_case/role_dir_check/RESULT.md`、`.agents/roles/scribe/role.md`
- 说明: 新 space `wD`，三个角色 cwd 为仓库根，Dashboard 连 `127.0.0.1:18781`。旧平铺负例在单独临时目录。未关用户 workspace。

## [2026-09-24] decision | 新检查前先关遗留测试 space

- 来源: 用户要求每次新开始检查前关闭之前留下的测试 space
- 更新: `AGENTS.md`、`pi_squad/AGENTS.md`、`pi_squad/USAGE.md`
- 说明: 只关测试 workspace，不关正在写代码或已有服务所在的 space。然后新开测试 space。

## [2026-09-24] decision | Pi Squad 检查从当前项目目录启动

- 来源: 用户要求后续启动放在当前 cwd，以便检查该目录 `.agents/roles`
- 更新: `AGENTS.md`、`pi_squad/AGENTS.md`、`pi_squad/USAGE.md`
- 说明: 正常角色 Pi 不再复制到 `/tmp`。Controller 仍可独立端口和临时库。旧平铺负例单独临时目录并标明预期拒绝。

## [2026-09-24] session | 角色目录与发现链路可见验收

- 来源: 用户要求按新 workspace 规范重测，并分开标注旧平铺负例
- 更新: `docs/sessions/2026-09-24-squad-role-dir-check.md`、`pi_squad_case/role_dir_check/RESULT.md`
- 说明: `wC` / `127.0.0.1:18771` 上目录角色加载、whoami、旁路文件未改写、list_agents 后 get_agent 均 PASS。`wC:p5` 的 flat role 报错是预期拒绝。未改实现，未碰 `wA`。发现通过不是通信通过。

## [2026-09-24] session | Pi Squad 检查必须新开 space

- 来源: 用户要求记住检查开法，并写入可加载规范
- 更新: `AGENTS.md`、`pi_squad/AGENTS.md`、`pi_squad/USAGE.md`、`docs/sessions/2026-09-24-squad-herdr-check.md`
- 说明: 当前 Herdr 会话新开 workspace，至少三个不同角色的 Pi，并打开对应该 Controller 的 Dashboard。不往 serve stdin 输入 `tui`。

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
- 更新: `AGENTS.md`、`raw/README.md`、`docs/index.md`、`docs/log.md`、`docs/templates/`、`docs/sources/`、`docs/overlay/`、`docs/learning/`、`docs/concepts/`、`docs/decisions/`、`docs/questions/`
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

## [2026-09-24] query | Squad cwd 角色 YAML 发现可行性

- 来源: Herdr `w7:p1` Claude 最后回答、现有 Squad 源码与配置验证脚本、pi-subagents 文档、Claude/OpenClaw 官方文档
- 更新: `docs/sessions/2026-09-24-squad-agents-yaml-feasibility.md`、`docs/sources/agent-role-config-references.md`、来源登记、Pi Squad 概念、开放问题、主索引
- 说明: 评估可行；区分角色选择、逻辑身份、在线发现；建议 cwd 专用目录纯 YAML，未实施。未发送 agent 消息、运行测试或修改插件与 submodule。

## [2026-09-24] decision | Squad 采用 Markdown 角色文件并收缩首版范围

- 来源: 用户确认；Claude/pi-subagents 文档、Multica 固定提交 agents.mdx、OpenClaw SOUL 模板
- 更新: `docs/decisions/2026-09-24-squad-role-frontmatter.md`、同名会话页、前序评估、来源摘要/登记、Pi Squad 概念、开放问题及索引
- 说明: 格式确定为 Markdown + YAML frontmatter；不考虑 tools/model/skills、历史和状态。建议 name/description/正文，身份配置留在启动侧；字段与迁移规则尚未实施。未改插件代码。

## [2026-09-24] maintenance | 实现 Squad Markdown 角色与运行元数据

- 来源: 用户实施授权与 cwd/UUID 要求、现有 Pi 生命周期 API、YAML 官方 API 文档
- 更新: `.agents/roles/`、`pi_squad/extension/`、Controller 模型/存储/校验/TUI、包清单/依赖、`USAGE.md`、P0 验证和阶段文档、wiki 会话/概念/决策/开放问题/索引
- 说明: TS 6 项、Go 全套、真实 Pi RPC（含 new/reload）及隔离 Controller smoke 通过。UUID 为每进程 runtime_id，保留 Pi runtime_session_id。原 smoke 首次误连已有 18741 服务并写入 backend/reviewer，已告知用户并修复测试隔离；未猜测性还原。未修改上游 submodule、未部署或重启用户进程。

## [2026-09-24] query | 评估是否进入相互通信验证

- 来源: 当前实现、P0 验收记录、Notion P1/P2 契约与旧身份/消息决策
- 更新: `docs/sessions/2026-09-24-squad-messaging-readiness.md`、索引、开放问题
- 说明: 建议下一轮先补 P0/P1 真实 Pi 验收，再做 HTTP 纯文本往返。识别 UUID 尚未参与持有者校验、旧消息合同与 HTTP 路线差异；本轮未发送消息、实施通信或运行新测试。

## [2026-09-24] maintenance | 开发 get_agent 并准备移交 Claude Code 验收

- 来源: 用户明确开发/验收分工；已有 Controller 查询接口、Pi 工具与截断 API
- 更新: `pi_squad/extension/index.ts`、`controller-client.ts`、`USAGE.md`、阶段入口、wiki 会话/概念/索引
- 说明: 完成角色发现到精确 agent_id 查询；只做开发静态检查，未自行执行验收。消息发送与持有者校验不在本轮实现；验收移交指定 Herdr w7:p1。

## [2026-09-24] session | 已向指定 Claude Code 发送发现能力验收交接

- 来源: 用户授权的 Herdr 验收分工；herdr agent prompt w7:p1 返回 agent_prompted
- 更新: 本日志；交接内容见 `docs/sessions/2026-09-24-squad-get-agent-development.md`
- 说明: 已提交验收任务，明确仅修改测试/报告、隔离端口/数据库、保留其他人的改动。开发者只执行 node --check 与 git diff --check，均通过；未声称验收完成。

## [2026-09-24] maintenance | Controller 心跳日志降噪与 Dashboard 入口提示

- 来源: 用户反馈；Herdr w7:p3 只读进程与终端快照
- 更新: `pi_squad/controller/httpapi/server.go`、`cli/serve.go`、USAGE/Controller README、会话与索引
- 说明: 确认当前是 18751 的 serve 进程而非 tui，移除成功心跳日志并提示独立面板入口。未改变现有服务/pane，运行验收由指定 Claude Code 负责。

## [2026-09-24] maintenance | 将角色配置改为每角色独立目录

- 来源: 用户要求为后续动态信息预留同目录空间
- 更新: `.agents/roles/<name>/role.md`、Extension 加载器/whoami、配置测试与原验证 fixture、USAGE、阶段契约、wiki 决策/会话/概念/索引
- 说明: 只读取 role.md，其它内容不参与注入；旧布局明确报迁移提示。本助手仅开发与静态检查，验收继续交指定 Claude Code，未重启现有服务或 Pi。

- 验收交接补充: 原 w7:p1 经 Herdr 确认为 wB:p1（同一 terminal），已提交角色目录迁移验收任务，尚未声称通过。

## [2026-09-24] query | 发现验收后复核通信开发条件

- 来源: Claude wB:p1 最新回答、`pi_squad_case/role_dir_check/RESULT.md`（wD / 18781）、Extension 与 Controller 源码
- 更新: `docs/sessions/2026-09-24-squad-messaging-readiness.md`（主索引已有入口）
- 说明: 三角色加载注册及角色发现到精确查询已有可见证据，可以开始通信开发；消息接口仍缺失，实例持有者校验需与通信一起补齐。不宣称完整 P0/P1 或通信已验收，未启动新测试或改运行服务。

## [2026-09-24] maintenance | 运行实例校验与 HTTP 纯文本通信

- 来源: 用户要求先补 UUID 校验再开发通信，验收交 Claude；已有身份占用决策与 Pi Extension API 译文
- 更新: Controller ownership/revocation/message HTTP/SQLite、Extension 心跳/消息适配、USAGE、HTTP 通信验收清单、会话与索引
- 说明: 实现 notice/ask/reply、精确绑定和凭据校验，显式释放撤销旧 UUID。开发者只做 Go 编译与 TypeScript 类型/语法静态检查；真实 Pi 验收未执行，交指定 Claude。旧协议 fixture 需适配，不沿用旧 PASS。

- 交接: 已通过 herdr agent prompt 向 wB:p1 的 Claude 提交 UUID/HTTP 通信检查清单；确认工作状态后由其独立验收，尚无本轮验收结论。

## [2026-09-24] query | HTTP 第二阶段仍为部分验收

- 来源: Claude wB:p1 最新回答与 `pi_squad_case/phase_02_http_messaging/RESULT.md`
- 更新: `docs/sessions/2026-09-24-squad-http-messaging.md`（主索引已有入口）
- 说明: notice/关联回复已打通；ask、忙时排队、实例/会话故障边界、去重及旧测试迁移未完成。保持 partial，不以没有发现缺陷等同阶段完成。

## [2026-09-24] query | 评估 Intercom 对第二阶段的借鉴价值

- 来源: pi-intercom 固定 HEAD `199279ae861bf53ce014809fb2a03337538ae13e` 的消息/回复/生命周期源码与部分测试，当前 HTTP 通信实现及 partial 报告
- 更新: Intercom 来源摘要/登记、评估会话、主索引
- 说明: 优先借鉴关联上下文、迟到回调隔离、分层收据、幂等和边界测试；保持异步 ask、忙时排队、离线不补投。不改插件实现或上游，不启动测试，不将上游测试存在视为本项目通过。

## [2026-09-24] maintenance | SSE 下发与 Intercom 边界验收准备

- 来源: 用户要求优化下发并借鉴 Intercom 用例；WHATWG SSE 标准、当前 HTTP 实现
- 更新: Controller SSE/订阅唤醒、Extension fetch 流与收件调度、绑定/解析测试、USAGE、SSE/FLOW 验收清单、来源/会话/索引
- 说明: 保留异步 ask、忙时排队、显式回复/重试。仅开发静态检查，运行验收仍交 Claude；实际延迟及故障窗口未宣称通过。

- 交接: 已通过 herdr 向 wB:p1 Claude 提交本轮完整 SSE/FLOW 与旧未完成项验收，状态已为 working；开发侧最终编译/类型检查通过。实际测试及延迟结果待其产出。

## [2026-09-24] session | 验收结果回传到派发者 pane

- 来源: 用户要求检查 Claude 结果并配置主动回传；Herdr 当前 pane w4:p2、Claude wB:p1、SSE RESULT.md
- 更新: 根 AGENTS.md、pi_squad/AGENTS.md、阶段 HANDOFF.md、SSE 会话页（主索引已有入口）
- 说明: 每次交接动态附 pane/terminal/handoff_id，完成后主动提交验收结果，核对身份且不阻塞等待。当前 SSE ask/reply 已有证据，阶段仍 partial。

## [2026-09-24] session | 已收到 Claude 的 SSE 验收回传

- 来源: acceptance_result，handoff_id=squad-sse-review-20260924-01
- 更新: `pi_squad_case/phase_02_http_messaging/HANDOFF.md` 的 receiver_status=received、receiver_conclusion=partial
- 说明: 确认回传已被开发者读取，不覆盖发送方 submitted 含义。保持阶段 partial；MSG-08 只有正文不执行及正常回复证据，不视作完整工具限制通过。未循环回执或启动新测试。

## [2026-09-24] session | 继续补齐 SSE 第二阶段验收

- 来源: 用户收到 partial 回传后授权继续
- 更新: HTTP 通信阶段 HANDOFF.md；旧交接归档保留
- 说明: 新 handoff_id=squad-sse-review-20260924-02，动态核对回传 pane w4:p2 与 terminal；Claude 补边界测试，开发者修实现，阶段未宣称通过。

## [2026-09-24] session | 第二轮部分结果后继续补测试夹具

- 来源: acceptance_result squad-sse-review-20260924-02 与 wG RESULT.md
- 更新: 阶段 HANDOFF.md receiver_status=received_partial，追加继续要求
- 说明: 协议校验、幂等及P0 smoke已有证据；缺harness不是外部阻塞，继续补busy/工具拦截/SSE恢复。MSG-06整行PASS不能代替尚缺的超时/满队列子项。

## [2026-09-24] session | 收到 SSE harness 与恢复补测

- 来源: squad-sse-review-20260924-02 followup 和 RESULT.md
- 更新: 阶段 HANDOFF.md
- 说明: busy/deferred/工具拦截、SSE协议、过期/满队列及真实/new和同DB重启有新增证据；继续补慢读、静默、404及逐项核对其余恢复子项。915.125µs仅为一次send返回后观察SSE事件的时长，不是commit到received延迟或性能保证。

## [2026-09-24] session | SSE 第三次补测与收口边界

- 来源: squad-sse-review-20260924-02 followup、合并RESULT与events_test源码
- 更新: 阶段 HANDOFF.md
- 说明: 接受确定性阻塞writer作为写deadline分支证据，需另证发送不被阻塞；不强求TCP缓冲区压满。继续补替换连接cleanup与真实Pi消息恢复，协议微秒样本不等同Pi端到端延迟。

## [2026-09-24] maintenance | 合并 Controller 断线期间的重复警告

- 来源: 用户重复报告 terminated/fetch failed；heartbeat与inbox/SSE提示源码，18811只读health正常
- 更新: connection-notices及测试、heartbeat成功回调、index/messaging提示、USAGE、SSE会话页
- 说明: 同次网络故障只提示一次，失败通道恢复后通知一次；协议身份错误不掩盖。类型/语法/diff检查通过，真实重启回归交Claude，未自行重启用户进程。

## [2026-09-25] session | Team Runtime 评估与需求技术文档

- 来源: 用户五项补充；本仓 HEAD `23caab1105f71e3cb0ff67671eb63a9c7f85160a`；Multica 固定 SHA `1c908ea52c19f193d301ca9460fc1d7d100a1b3d` 官方源码
- 更新: `pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md`、`TEAM_RUNTIME_DESIGN.md`、原方案/阶段入口；来源、决策、概念、会话、开放问题与索引
- 说明: 分开共享模板/成员关系/执行上下文；统一 .agents/pisquad、启动 mode、agents.md 快照、任务与审查租约及消息授权迁移。旧稿标历史；仅文档与静态一致性检查，未改实现、未迁移配置、未启动或派发运行验收。

## [2026-09-25] query | 解释共享角色实例与任务租约

- 来源: 用户追问；Team Runtime 需求与技术提案
- 更新: `docs/concepts/squad-role-instance-lease.md`、解释会话、主索引
- 说明: 用双 Team 共用 reviewer 说明模板/实例/当前任务的区别；说明正常自动释放与失租状态不明隔离的差异、续约由 Extension 承担。仅概念澄清，不改实现或将提案记为已确认。

## [2026-09-27] session | 阶段 04 冲突审查与统一需求技术文档

- 来源: 用户授权全面检查、补全、合并并推送；基线 `cdae80379685ff5c79621117712ce9f53ddefe1c` 的五文件、阶段03、现有扩展及固定Pi关键API。
- 更新: `pi_squad_case/04-team-orchestration/` 两份权威文档和导航README；全局验收与索引；`docs/sessions/2026-09-27-pi-squad-phase04-consolidation.md`、`docs/index.md`。
- 说明: 记录20处冲突/歧义及处理，保留49项用例并补40项，P4共89项、总索引160项；实施按M0—M8。明确FIFO、Task级blockers、affinity/segment分离、显式Run和输入分类等本轮默认。仅文档审查与整合，未实现或运行P4；不重置既有结果，不改submodule，不自动合并PR #3。

## [2026-09-27] query | 阶段 04 需求对照当前代码评估

- 来源: `pi_squad_case/04-team-orchestration/` 三份文档；`pi_squad/` 现有扩展与 Controller 源码；`pi-dev@890f920` 的 `extensions/types.ts`、`system-prompt.ts`
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-code-gap.md`、`docs/questions/open-questions.md`（Q16、Q17）、`docs/index.md`
- 说明: 代码仅覆盖 P0 身份与 P2 消息；阶段 03 Task/Attempt 未实现却是 P4 前提。列出可复用机制、必须改动点、规则文件冲突与 hold-and-wait 设计风险；建议重定阶段 03 基线并拆分 P4。仅评估，未改实现、未运行验收。

## [2026-09-27] decision | 阶段 04 激活占用、阶段 03 并入与分段

- 来源: 用户对差距评估的答复；AskQuestion 选择“激活时原子占用 roster”“释放 active = 显式取消 Run”
- 更新: `pi_squad_case/04-team-orchestration/` 三份文档；`03-agent-invocation/README.md`（仅删除冲突点）；`05-herdr-observability/README.md`；`pi_squad_case/README.md`、`ACCEPTANCE.md`；`pi_squad/AGENTS.md`、`pi_squad/controller/AGENTS.md`、根 `AGENTS.md`；`docs/decisions/2026-09-27-squad-phase04-activation-and-split.md`、决策索引、概念页、开放问题 Q13—Q17、会话页、主索引
- 说明: 以当前批次需求为准。Role 在 Team 激活时整体占用、queued Run 不持资源，跨 Team 互占环结构上不出现；阶段 03 能力由 4a 交付，INV 判据并入映射用例；89 项分 4a 71 / 4b 18，D10 改为 M0—M6 / M7—M9。静态检查通过（ID、JSON、分段与里程碑覆盖）；未改代码、未运行验收。

## [2026-09-27] session | 阶段 04 OpenSpec 提案

- 来源: 用户调用 openspec-propose；阶段 04 当前需求/设计、阶段 03 INV 判据、现有 pi_squad 实现与测试、2026-09-27 用户裁决
- 更新: `openspec/changes/pi-squad-team-orchestration/`；`docs/sessions/2026-09-27-pi-squad-phase04-openspec-proposal.md`、`docs/index.md`
- 说明: proposal、六份 specs（18 条需求/89 场景）、design、按 M0—M9 编排的 tasks；保持 4a 71 / 4b 18 与 INV 映射。仅规划，未改代码/配置或执行真实验收；所有实施任务未勾选。
- 校验: `openspec validate pi-squad-team-orchestration --strict`、OpenSpec 4/4 产物状态、18/89 唯一性与 71/18 分段、INV 映射、本地链接及 `git diff --check` 通过；60 项实施任务均未执行。

## [2026-09-27] session | 阶段 04 Cursor 协商与用户裁决写回

- 来源: 用户 openspec-explore / herdr 指令；w6:p1 Cursor 三轮只读审查（handoff_id=squad-p4-explore-20260927-01）；四项用户明确选择；固定 Pi 源码 890f920。
- 更新: 阶段 04 权威需求/设计/README；OpenSpec proposal、六份 specs、design、tasks；`docs/sessions/2026-09-27-pi-squad-phase04-cursor-review.md`、`docs/decisions/2026-09-27-squad-recovery-guidance-acceptance.md`、索引、Q18—Q21。
- 说明: 补恢复出口、LeaderStep/guidance、operator 授权、planned/rebind、容量澄清、acceptance 覆盖与原生输入 hooks；四类待裁决已关闭。仅规划，未修改实现/USAGE/上游，未运行真实验收。
- 校验: openspec strict validate 通过；4/4 规划产物齐备；6 specs / 18 requirements / 89 唯一主场景、JSON 示例和 git diff --check 通过；71 项实施任务全未勾选，4a 71 / 4b 18 验收编号分段保留。规划校验不代表运行验收 PASS。

## [2026-09-27] session | 阶段 04 开始实施

- 来源: 用户 openspec-apply-change 指令及“先全部开发、后整体集成测试，不做单元测试”的明确要求。
- 更新: OpenSpec tasks 执行顺序；`pi_squad/` 开发代码及实际入口 USAGE；整体集成索引；实施会话页和主索引。
- 说明: 实施进行中，编译/类型检查不等于验收；未启动真实测试、未修改上游、未将未完成任务勾选。

## [2026-09-27] session | 阶段 04 开发收口，开始整体集成

- 来源: 用户 openspec-apply-change 授权与先开发后整体集成、禁用单元测试要求。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`、`pi_squad/USAGE.md`、`pi_squad/protocol/`。
- 说明: v2 控制面与 Pi 适配开发已接通，生产/集成构建和 TS 检查通过；运行验收尚未开始，89 项不记 PASS。记录 native bash/selector/UI 与 snapshot 边界事实，后续用真实 Pi 核对。

## [2026-09-27] session | 阶段 04 首轮整体集成与修复

- 来源: 用户要求先开发后整体集成；Herdr 真实 Pi 与独立验收现场。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`
- 说明: 记录真实数字工作流、结果引用固定、产物变更失效、严格 JSON 字段名修复和 CLI 配置负例；全量验收进行中，未运行单元测试。

## [2026-09-27] session | 阶段 04 返工链与恢复边界复测

- 来源: Herdr 独立真实 Pi 验收报告；隔离 HTTP/SQLite 与生产构建实际请求。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`、集成 evidence。
- 说明: 真实错误结果返工链已完成；修复 LeaderStep retry 与过期 complete intent，模拟复测容量1澄清续接、验收覆盖与生产故障入口隔离；区分模拟与真实证据，89 项仍在验收，不运行单元测试。

## [2026-09-27] session | 阶段 04 身份退出、Presence 与旧回调修复

- 来源: 独立真实 Pi 的同ID重复Leader失败/复测、native/UI观察；隔离HTTP/SQLite故障窗口。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`、`pi_squad/USAGE.md`、协议说明、Controller边界证据索引。
- 说明: 重复Leader被拒后恢复普通工具与输入已真实复测；补suspect与独立lease状态、精确请求源binding、串行旧回调隔离；提交前回滚和提交后错误响应幂等性已有HTTP证据。89项继续验收，不把模拟/子项当完整PASS；未运行单元测试。

## [2026-09-27] session | Squad 会话基线与发现边界集成

- 来源: r15 真实Pi新会话回归、隔离Controller的Go/TS客户端HTTP检查、P4-A03启动代码核对。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`、`pi_squad/USAGE.md`、阶段04集成证据。
- 说明: /new保留完整注册能力，正常统计Run完成释放；错误Project/协议/epoch和真实端口复用拒绝。首次未注册的连接失败恢复普通Pi修复待真实负例复测。阶段未全量通过，未运行单元测试。

## [2026-09-27] session | Squad 配置、迁移与结果重放补证

- 来源: r16实际doctor CLI、已迁移Project的HTTP/SQLite集成、独立验收RESULT。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`、阶段04 `integration/CODEX-BOUNDARIES.md` 及新证据、OpenSpec tasks。
- 说明: 修复小数容量被截断；补direct名单/目录ID/sidecar、迁移离线行与23组混协议拒绝、amend安全续接和结果重放。独立验收将P4-A04/A06/A20收口PASS；无单元测试，仍未全量通过。

## [2026-09-27] session | 原生切换收尾与递归预算边界

- 来源: 本机 Pi 生命周期源码、真实 `/new` 失败、隔离 Controller HTTP/SQLite 集成。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`
- 说明: 保留 /new 未通过证据并调整收尾顺序；r17 修正 standalone 20 child 计数，补循环/深度/重试预算边界；没有单元测试。

## [2026-09-27] session | 重申先开发后整体集成

- 来源: 用户再次确认不进行单元测试。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`
- 说明: 停止扩展零散HTTP夹具，集中现有多Pi整体流程，实际阻塞取证后修复复测；保留已有证据。


## [2026-09-27] session | 阶段 04 再次 apply 开发缺口修复

- 来源: 用户重新调用 openspec-apply-change，重申先开发、后整体集成、无单元测试。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`、`pi_squad/USAGE.md`。
- 说明: 统一 Role UI 投影与草稿保护，修复旧快照返回、discovery 乱序及 Pi operator direct scope 绕行。仅 Go 编译和 TS 类型检查；保留验收未完成状态，当前旧测试 workspace/Agent 不可沿用。

## [2026-09-27] session | 开发优先，最终由 Codex 直接验收

- 来源: 用户重申先完成 spec 开发再统一检查，并取消 Claude 验收。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`、交接记录、`pi_squad/USAGE.md`。
- 说明: 关闭刚启动且无 Run 的测试现场；补全失败回退增加旧上下文隔离，类型检查通过。没有运行单元测试，没有新增验收 PASS。

## [2026-09-27] session | 补齐未绑定 Role 投影与观察身份

- 来源: 阶段04 TR-10、P4-A02/A26 与当前源码核对。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`、`pi_squad/USAGE.md`。
- 说明: 完善无Primary角色/ownership展示、同revision观察时间排序、TUI选择清理及GET/SSE身份校验；只执行编译和类型检查，未进行运行验收。

## [2026-09-27] session | 补齐会话异步回调隔离

- 来源: P4-A39/TR-A29 与 Invocation 生命周期源码核对。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`、`pi_squad/USAGE.md`。
- 说明: 补 poll/serial/ACK 旧上下文隔离与停止证明二次检查；只做类型和差异检查，运行验收留待全部开发完成后。

## [2026-09-27] session | 取消树与恢复审计开发补齐

- 来源: Task/Run cancel、planned rebind、恢复审计与当前源码对照。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`、USAGE、协议说明。
- 说明: 修复取消树旧revision覆盖和child取消上行传播，收紧rebind边界，补旧新binding审计和释放幂等；仅编译通过，不标验收PASS。

## [2026-09-27] session | 父验收覆盖与返工 Gate 开发补齐

- 来源: TR-11/P4-A33 当前规格和acceptance/finalGate源码核对。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`、USAGE。
- 说明: 父覆盖校验完成状态和修订、同事务失效通知，返工替代链重新校验，checker固定实际读取字节；编译通过，运行验收未执行。

## [2026-09-27] session | 命令和多行交接开发补齐

- 来源: TR-12/TR-13及输入错误无副作用要求。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`、USAGE。
- 说明: 补多行mention、显式role错误、文件fallback、严格选项与命令异步上下文检查；仅类型检查，仍待统一验收。

## [2026-09-27] session | 工具队列权限隔离与开发收口表

- 来源: TR-06/TR-17/P4-A39与实际受管工具实现。
- 更新: 实施会话页、阶段IMPLEMENTATION/README、USAGE。
- 说明: 固定每次工具调用的执行上下文，防旧队列操作借用新权限；18条需求映射用于继续开发核对，不替代运行验收。

## [2026-09-27] session | 中断幂等与SSE快照对账

- 来源: TR-16协议/幂等和P4-A26观察要求。
- 更新: 实施会话、开发收口表、USAGE和协议schema/README。
- 说明: 补中断事务幂等、SSE重连resnapshot和Controller身份隔离；编译/类型检查通过，未进行运行验收。

## [2026-09-27] session | 管理预览与能力检查开发补齐

- 来源: TR-10/TR-13/TR-18 与当前代码核对。
- 更新: 实施会话、IMPLEMENTATION、USAGE、Dashboard/命令/能力检查。
- 说明: 补 release 预览、旧上下文拒绝和注册前能力检查；仅编译和类型检查通过，统一验收尚未启动。

## [2026-09-27] session | 核心能力探针证据关联

- 来源: TR-18/P4-A39 与 ReadProbe 当前实现。
- 更新: 实施会话、IMPLEMENTATION、USAGE、integration README、probe代码。
- 说明: 核心能力观察改为有序同执行身份链，防跨轮聚合误判；仅编译和类型检查，验收仍未启动。

## [2026-09-27] session | 命令参数与操作矩阵开发补齐

- 来源: TR-13/P4-A38 与 Pi/Go 命令、HTTP 操作契约。
- 更新: 实施会话、IMPLEMENTATION、USAGE、命令与 Service 操作名称校验。
- 说明: 错误参数在请求前拒绝、正文与选项区分、异步返回隔离；编译通过，统一验收尚未启动。

## [2026-09-27] session | 调度主链与事务内状态开发核对

- 来源: runs/dispatch/execution/continuation/cleanup源码与TR-04—06、TR-14—16。
- 更新: 实施会话、IMPLEMENTATION路径记录、USAGE、调度与probe。
- 说明: 重读事务内Task避免覆盖失效，补失败上行，纠正probe数字segment；只编译，运行验收尚未启动。

## [2026-09-27] session | Task准入与Leader Gate开发核对

- 来源: TR-07/TR-11/TR-14/TR-17与HTTP、Task、Leader、review源码。
- 更新: 实施会话、IMPLEMENTATION、USAGE、协议说明及准入/Gate代码。
- 说明: 补scope冲突、refs/依赖准入及版本有效性，review失败上行；Go编译通过，无运行验收。

## [2026-09-27] session | 配置工具与native生命周期开发核对

- 来源: TR-01/TR-06/TR-15/TR-17及native compaction具体契约。
- 更新: 实施会话、IMPLEMENTATION核对项、USAGE和gate/discovery。
- 说明: 补状态许可、路径失败及损坏Project标记处理；两种Go构建和TS通过，源码核对第1/3项完成，未开始验收。

## [2026-09-27] session | 开发收口与统一验收准备

- 来源: 命令/协议/文档最终核对及生产、故障版构建。
- 更新: IMPLEMENTATION、development-build.json、阶段README、实施会话、schema/USAGE。
- 说明: 四项源码开发核对完成，正确pisquad_integration构建通过；状态为待Codex统一运行验收，任务和用例未据此标通过。

## [2026-09-27] session | Codex统一验收首轮数字流程

- 来源: wM真实Pi pane、r20控制面事件和独立文件检查。
- 更新: integration/evidence/r20、cases、RESULT、实施会话。
- 说明: TR-A21复测PASS，r2失败保留；整体PARTIAL，继续其余场景，不运行单元测试。

## [2026-09-27] session | r20真实返工复审验收

- 来源: wM Pi pane、r20事件232—384及状态快照。
- 更新: cases/RESULT/evidence和实施会话。
- 说明: TR-A18/TR-A22 PASS，保留错结果与返工链，P4-A33其它子项待验。

## [2026-09-27] session | r20单额度父子续接证据

- 来源: wM真实Pi、epoch2事件与独立Dashboard。
- 更新: capacity1-yield证据、cases/RESULT、实施会话。
- 说明: 原Attempt segment2续接和parent覆盖通过；三项主ID仍PARTIAL，澄清等子项待验。

## [2026-09-27] session | r20澄清失败与竞争隔离证据

- 来源: wM真实auto-compaction、冻结deadline和affinity快照。
- 更新: clarify-failed证据、cases/RESULT及实施会话。
- 说明: 无关任务保持排队；澄清闭环因截止时间未完成，保存失败，显式取消，待新Run复测。

## [2026-09-27] session | 再次确认先开发后统一验收

- 来源: 用户本轮执行顺序与验收负责人要求。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`、`docs/index.md`。
- 说明: 全部需求开发收口后由 Codex 统一验收；开发期保留构建和类型检查，既有证据不重置。

## [2026-09-27] session | r20澄清续接与审查夹具修正

- 来源: wM真实Pi、Controller事件、最终payload探针。
- 更新: P4-A13记录、RESULT、实施会话、Team/reviewer夹具。
- 说明: 双容量1澄清竞争复测通过；Run因夹具错误拒绝保留失败并取消，版本15完整Gate待验。

## [2026-09-27] session | 澄清复测保留角色冲突与Leader重复输出

- 来源: clarify3/4真实Attempt上下文、pane与事件。
- 更新: RESULT、cases、实施会话及role.md夹具。
- 说明: 新Team/agents.md已生效但role.md仍冲突，已修正；随后Leader重复输出未settled，Run取消释放，完整Gate未通过。

## [2026-09-27] session | 多Team准入证据与Run查询修复

- 来源: wM真实Pi、epoch3事件/SQLite outbox、r21工具调用。
- 更新: USAGE、cases/RESULT、r20/r21证据与实施会话。
- 说明: 五项主ID复测通过；保留B stale-state wait失败，补齐Run查询任务图，显式guidance恢复不冒充自动推进，新Run复测中。

## [2026-09-27] session | r21新Run查询修复运行通过

- 来源: share Leader真实工具调用及fresh-run事件。
- 更新: r21证据、RESULT、实施会话。
- 说明: 无追加guidance完成释放，源码hash一致；仍未完成全89项，不运行单元测试。

## [2026-09-27] session | 父子调用与Pi界面验收推进

- 来源: wM真实Pi、r22/r23 snapshot/events/pane和独立产物。
- 更新: USAGE、tasks 5.5、cases/RESULT、阶段README、实施会话与index。
- 说明: 补齐standalone/reviewer child；明确工具target裸ID，修正Picker短写；35主ID通过，保留夹具错误及旧结果，剩余边界不冒称通过。

## [2026-09-27] session | 写入并行与独立阻塞验收证据

- 来源: wM真实Pi、r23完整事件与独立文件hash。
- 更新: cases、RESULT、实施会话与write-cases证据。
- 说明: TR-A24通过，另三项保持PARTIAL；越界探针文件核对未变后清理，整体尚未通过。

## [2026-09-27] session | 受管写入与reservation验收通过

- 来源: 真实Pi工具payload、SQLite运行中租约/预留、控制面事件及越界sentinel。
- 更新: cases、RESULT、OpenSpec任务4.6、实施会话和index。
- 说明: CMD-A09/TR-A31/P4-A37通过；Leader压缩后正常释放，39/89主ID通过，未扩大为整体验收完成。

## [2026-09-27] session | 命令帮助与别名一致性修复

- 来源: wM:pC真实帮助/补全/alias输出与控制面快照。
- 更新: squad-commands、USAGE、r24证据、cases、实施记录。
- 说明: 参数说明补齐，旧alias参数校验统一，P4-A24通过；40/89通过，其余未冒称完成。

## [2026-09-27] session | Dashboard同版本对照与退出验收

- 来源: wM:pC/wM:p2同revision视图、进程状态及CLI。
- 更新: r24证据、cases、OpenSpec9.1、实施会话与index。
- 说明: P4-A25/P4-A38通过，42/89主ID通过；Controller和Pi继续存活，无单元测试。

## [2026-09-27] session | Primary等待队列上限与串行验收

- 来源: wM:p3真实Pi、wM:p7可见CLI、32个排队Task与完整事件。
- 更新: TR-A14证据、cases、RESULT、实施会话和index。
- 说明: 第33项QUEUE_FULL且无半记录；取消31项后保留任务串行接续，最终资源为空，43/89通过。

## [2026-09-27] session | FIFO与queued handoff验收及原生按键修复

- 来源: wM真实Pi/CLI、完整准入释放事件与Dashboard方向键操作。
- 更新: cases、RESULT、r24/r25证据、dashboard、USAGE、实施会话。
- 说明: TR-A33/CMD-A07通过；修复方向键编码并复测，45/89主ID通过，仍有未完成子项。

## [2026-09-27] session | Primary离线路由验收

- 来源: wM:p6真实进程暂停/恢复、pC路由错误及控制面。
- 更新: CMD-A06证据、cases、RESULT、实施会话和index。
- 说明: 离线Primary明确拒绝，不改投在线Secondary；恢复同一绑定，46/89通过。澄清逻辑roster占用与在线Task接受的区别。

## [2026-09-27] session | 同Run再次派发与Leader结构化调用

- 来源: share Leader及reviewer真实Pi、用户handoff、native JSONL和控制面事件。
- 更新: CMD-A08/A10/A12、OpenSpec6.4、RESULT、r25证据、实施会话及index。
- 说明: 文字mention无派发，structured decision创建任务；同Primary串行，未读Squad Skill也能路由，49/89通过。

## [2026-09-27] session | 准入与首次派发事务回滚证据

- 来源: 真实Controller集成故障点、SQLite前后快照、wM Pi与operator pane。
- 更新: P4-A11/P4-A19证据、cases、RESULT及实施会话。
- 说明: 部分角色写后失败全回滚，派发失败保留既有ownership；故障均reset、Run取消释放，其余窗口不冒称通过。

## [2026-09-27] session | 两Run并发整体准入通过

- 来源: 两HTTP请求重叠计时、真实Leader pane、SQLite角色占用与释放准入事件。
- 更新: TR-A12证据、cases、RESULT、实施会话和index。
- 说明: 只有一个完整占用，另一Run无部分占用；释放后仅准入一次，两Run已安全收尾，50/89通过。

## [2026-09-27] session | 实际请求动态块隔离验收

- 来源: reviewer两Team六次实际provider请求、Controller上下文与native会话。
- 更新: pi-probe、TR-A30/TR-A16、证据限制说明、cases、RESULT及实施会话。
- 说明: 动态块隔离通过；保留Pi进程缺失和sum夹具验收失败，显式恢复同session并安全收尾，51/89通过。

## [2026-09-27] session | 进程与Run及Attempt快照边界通过

- 来源: counter父子续接、排队Task及新Run的11次实际provider请求。
- 更新: P4-A05证据、cases、OpenSpec3.5、RESULT、实施会话与index。
- 说明: Role按进程、工作规则按Attempt、Team指令按Run固定，临时内容已恢复，52/89通过。

## [2026-09-27] session | 重申先开发后统一检查

- 来源: 用户本轮执行顺序与验收负责人指示。
- 更新: `docs/sessions/2026-09-27-pi-squad-phase04-implementation.md`、`docs/index.md`。
- 说明: 全部需求开发完成后由 Codex 直接统一验收；本轮未运行验收，不改变既有结果。

## [2026-09-27] session | 配置版本冲突拒绝证据补齐

- 来源: wM可见operator执行、Controller HTTP409及SQLite前后对照。
- 更新: r25证据、cases、RESULT、OpenSpec2.1、实施会话与index。
- 说明: 同版本异内容拒绝且无业务副作用，配置恢复；13/71任务完成，整体验收未完成。

## [2026-09-27] session | standalone委派环与任务预算子项

- 来源: wM真实counter、operator终端断言与控制面快照。
- 更新: TR-A28进展证据、cases、RESULT、实施会话与index。
- 说明: 保存收尾CAS冲突及原始响应未落盘限制；父子均取消、资源释放，仅记PARTIAL。

## [2026-09-27] session | 父写资源冲突验收通过

- 来源: wM真实frontend、Team HTTP拒绝原始响应、SQLite资源及收尾快照。
- 更新: P4-A14/TR-A28证据、cases、RESULT、实施会话与index。
- 说明: 子任务不能申请父目录或其中的文件，拒绝不释放父写资源；Run安全取消释放，53/89通过。

## [2026-09-27] session | 四层委派边界与三次Attempt预算

- 来源: wM四Role真实父子链、Secondary显式retry、原始拒绝响应及资源快照。
- 更新: depth-boundary夹具/config27、TR-A28证据、cases、RESULT、实施会话与index。
- 说明: Team祖先/深度拒绝后原链正常完成；standalone第四Attempt拒绝并可取消释放。TR-A28仍部分完成。

## [2026-09-27] session | 委派环与预算TR-A28通过

- 来源: Team/standalone真实Pi链、逐条拒绝响应、重试与取消资源证据。
- 更新: TR-A28矩阵、cases、RESULT、实施会话与index。
- 说明: 覆盖两scope的环/深度/任务及Attempt预算；保留文本循环和收尾脚本旧失败，54/89通过。

## [2026-09-27] session | planned与rebind及旧草稿验收通过

- 来源: wM真实/new、planned依赖/hold快照、rebind审计与草稿提交。
- 更新: config30/夹具、P4-A09证据、cases、RESULT、OpenSpec4.9、实施会话与index。
- 说明: P4-A09通过、14/71任务完成；Run恢复后四步验收并释放，55/89通过。

## [2026-09-27] session | queued Leader离线与重绑FIFO通过

- 来源: wM真实Leader/new与暂停恢复、队列快照、显式resume审计、完整事件。
- 更新: P4-A08证据、cases、RESULT、OpenSpec6.1、实施会话与index。
- 说明: 离线/旧绑定不占Role，显式恢复保留queue_seq，不被后续相交Run越过；56/89通过、15/71任务完成。

## [2026-09-27] session | 补齐共享投影并通过状态视图验收

- 来源: r26真实Controller、Go/Pi视图、API快照及资源收尾。
- 更新: projection/Go列表、USAGE、r26构建与TR-A17证据、cases、OpenSpec2.8/7.1、wiki。
- 说明: Team运行汇总及Secondary standalone标识补齐；保留暂停超deadline故障，57/89通过、17/71任务完成。

## [2026-10-03] maintenance | 清理旧 Agent 协作要求

- 来源: 用户本轮指示；仓库规则、skills、全局规则与相关记忆核对。
- 更新: `AGENTS.md`、`pi_squad/AGENTS.md`、两份历史 `HANDOFF.md`、`docs/sessions/2026-10-03-agent-collaboration-cleanup.md`、`docs/index.md`。
- 说明: 移除旧 Codex/Claude 验收回传协议，明确协作须由用户本次要求；Grok 历史评审和工具能力保留，不自动调用。

## [2026-10-03] query | 验证协作规则清理

- 来源: 用户选择验证不会自动找 Codex / Grok；五项静态检查、skills 触发条件及本轮实际工具调用。
- 更新: `docs/sessions/2026-10-03-agent-collaboration-cleanup.md`。
- 说明: 静态检查通过，本轮无 Agent 委派或旧 pane 回传；通用 committee 能力受本次授权边界约束。未运行 Pi Squad 功能测试或独立新会话加载测试。

## [2026-10-03] maintenance | 阶段 04 集成目录不入库

- 来源: 用户要求把上次提交里的 `pi_squad_case/04-team-orchestration/integration/` 排除，以减小仓库体积。
- 更新: `.gitignore`。本地目录保留，不再跟踪。
- 说明: 该目录约 166MB，几乎全是 `evidence/`。整体集成索引、夹具和证据留在工作区，不进入 git。

## [2026-10-03] decision | 提交前先询问非开发材料

- 来源: 用户要求在 `AGENTS.md` 中提示：日志、验收证据及其他开发不需要的代码或文档，用 AI 提交时先问。
- 更新: `AGENTS.md`、`docs/decisions/2026-10-03-commit-non-dev-artifacts.md`、`docs/sessions/2026-10-03-commit-non-dev-artifacts.md`、`docs/index.md`。
- 说明: 这类材料默认不纳入。列出路径和体积，用户明确同意后才暂存。

## [2026-10-03] session | submodule 更新继续用 shell

- 来源: 用户要求升级 `pi-dev`，并评估用 TypeScript 或 Go 写全量 submodule 更新脚本。
- 更新: `pi-dev` 工作区 `890f92088` → `4c6fb7cfe`；`docs/sessions/2026-10-03-submodule-update-stack.md`、`docs/index.md`。
- 说明: 批量更新已由 `scripts/sync-submodules.sh` 覆盖。清单以 `.gitmodules` 为准。gitlink 尚未提交，其余 submodule 未动。

## [2026-10-03] query | Pi Squad 适配 Pi 1.0.1 的源码评估

- 来源: 用户要求分析新版适配；`pi-dev@4c6fb7cfe`、coding-agent 1.0.1 changelog/API/运行时、Squad 当前生产入口与 OpenSpec 设计；实际 `pi --version` 为 1.0.0。
- 更新: `docs/sessions/2026-10-03-pi-squad-pi-1.0.1-assessment.md`、`docs/index.md`、会话索引、`docs/sources/pi-agent-core.md`、来源登记、`docs/concepts/pi-squad.md`、开放问题。
- 说明: 保留 Extension + Go Controller；提出 model-only/nested gate、RPC 分类、terminate/串行收尾、有效 prompt/tools 证据、安装能力探针与 fullscreen 回归。未实施建议、升级实际 CLI 或启动真实功能验收；没有把静态接口存在判为兼容 PASS。

## [2026-10-04] session | Pi Squad 的 Pi 1.0.1 规划与实施

- 来源: 用户要求 OpenSpec 后实施 P0 与选定 P1、TUI-only 答复及模型服务修复；独立 Pi 1.0.1 的 Herdr 三角色、Controller、Dashboard、父子链和受控负例。
- 更新: `openspec/changes/pi-squad-pi-1-0-1-compatibility/`、`pi_squad/extension/`、Controller doctor/probe、USAGE、阶段 04 compatibility 入口；`docs/sessions/2026-10-04-pi-squad-pi-1.0.1-implementation.md`、TUI 决策、概念、问题与 index。
- 说明: 宿主/工具护栏、可靠收尾、当前请求证据和能力诊断已实施；类型检查、构建与严格 OpenSpec 校验通过，真实 schema 2 核心就绪。兼容 14 PASS / 5 PARTIAL，未改变原 89 项全量未通过的事实；失败和运行证据保留 ignored，测试 space 清理，全局 Pi 1.0.0 及用户服务未修改，未委派 Agent 或运行单元测试。

## [2026-10-04] session | 阶段 04 继续实施与真实复测

- 来源: OpenSpec原71任务、89项矩阵；wZ的真实Pi 1.0.1五Role/三Leader、Controller/Dashboard、HTTP与SQLite。
- 更新: `pi_squad/`、USAGE、阶段04开发记录与ignored逐项证据、`docs/sessions/2026-10-04-pi-squad-phase04-continuation.md`、index。
- 说明: 修复acceptance入口、manual compact续接污染与SQLite写满错误；62/71任务、61/89 PASS。并行数字、共享reviewer返工/唤醒及capacity=1澄清通过；其余真实边界继续验收，阶段未完成。保留失败链，不委派Agent、不运行单元测试、未提交。

## [2026-10-04] session | 原生压缩收口与提交前恢复门修复

- 来源: wZ真实Pi自动retry/overflow/threshold、55KB Role、native三层fork/bash/失败、reload；r32→r33物理Controller/adapter崩溃。
- 更新: Invocation手动压缩维护保护、Controller启动恢复门、USAGE、OpenSpec10.1、阶段矩阵及实施记录、wiki继续实施页。
- 说明: 64/89 PASS、63/71任务。修复已受理但无Attempt的standalone Task重启自动注入漏洞；物理同窗复测先保持needs_review，显式rebind后才输入。提交后逐窗口仍继续，阶段未完成，未委派Agent、未运行单元测试、未提交。

## [2026-10-04] session | 阶段 04 全量开发与验收完成

- 来源: 原OpenSpec71任务/89用例及新增子断言；实际Pi1.0.1 TUI、Grok4.7、r29—r36控制面、HTTP/SQLite和原生交互。
- 更新: OpenSpec tasks、USAGE、Controller/Extension、阶段04需求/设计/README/开发与验收记录、全局160导航、wiki会话/concept/questions/index。
- 说明: 71/71任务、4a71/71、4b18/18 PASS；三轮数字/多Team及九个物理窗、精确版本化验收/草稿/传输/权限补验。保留真实失败和准备错误，F/E不冒充模型；两库五种资源全0、Pi/runtime和服务退出、仅本次wZ关闭。未委派Agent、未运行单元测试、未提交或archive。额外provider/native binary/Pi1.0.2不在结论内。

## [2026-10-04] maintenance | 同步并归档两个 OpenSpec change

- 来源: 用户要求先同步再归档当前两个 change。
- 更新: `openspec/specs/` 七份主 spec；归档到 `openspec/changes/archive/2026-10-04-pi-squad-team-orchestration` 与 `openspec/changes/archive/2026-10-04-pi-squad-pi-1-0-1-compatibility`。
- 说明: 工件与任务均已完成。delta 均为新增需求，主 spec 原先为空。`openspec validate --specs` 7 passed。活跃 change 已清空。未提交。
