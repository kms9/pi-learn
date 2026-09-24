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
