---
title: 开放问题
type: question-log
status: active
created: 2026-09-07
updated: 2026-10-18
tags:
  - project-wiki
  - questions
---

# 开放问题

| ID | 问题 | 状态 | 备注 |
|----|------|------|------|
| Q1 | overlay 的 GitHub 远程仓库名、公开还是私有 | open | 本地已有首笔 commit，未加 origin |
| Q2 | `docs-zh` 里尚未翻译的上游文档（`sync-zh.py` 列出约 17 篇）要不要补 | open | 含 `pi-dev/README.md`、`coding-agent/README.md` 等 |
| Q3 | `pi-dev` 以后是否改成 git submodule | closed | 2026-09-07 已把现有 GitHub clone 全部收成 submodule |
| Q4 | 用户自己的新插件代码放哪（本仓子目录 / 另开仓 / `~/.pi/agent/extensions`） | open | 未指定前不要写进 `pi-dev/` |
| Q5 | Pi coding-agent 默认路径何时切到 `AgentHarness` | open | 2026-09-07 对照：默认仍是 `Agent`/`agentLoop`；`AgentHarness` 在 `packages/agent` 与 `coding-agent/src/experimental/`。Mario X 帖称新 harness 未进 coding-agent 默认产品。 |
| Q6 | `herdr_session_id` 是否要求 Herdr `--env` 旁路，还是长期允许空 | open | P0 允许空；pane 默认不注入 `HERDR_SESSION`。见 [[decisions/2026-09-23-p0-identity-fields]]。 |
| Q7 | 2026-09-21 UDS/`squad` 规划是否废弃 | open | 与 2026-09-23 HTTP P0 并存；当前实现只跟 Notion P0。未删 `00-identity-protocol`。 |
| Q8 | 旧 Pi 失租但进程尚在时，新 runtime 是否可取得相同 agent_id？ | closed | 2026-09-21 评审中曾称 Q6。用户决定占用优先：拒绝新实例，直到确认旧实例退出或显式释放。见 [[decisions/2026-09-21-squad-ownership-and-suspect]]。 |
| Q9 | suspect 时是否拒绝新的 send/ask/invoke？ | closed | 2026-09-21 评审中曾称 Q7。用户决定拒绝并报不可联系；恢复 online 后由调用者重试，不自动排队/补发。见 [[decisions/2026-09-21-squad-ownership-and-suspect]]。 |
| Q10 | Squad 角色源格式如何选择？ | closed | 用户已选择 Markdown + YAML frontmatter；暂不考虑 tools/model/skills、历史与状态。见 [[decisions/2026-09-24-squad-role-frontmatter]]。 |
| Q11 | Squad 新角色入口如何衔接启动身份、迁移旧 JSON？ | closed | 已落地：name/description/正文，agent_id/squad_id 必须由环境提供；非空 PI_SQUAD_CONFIG 明确报迁移错误。见 [[sessions/2026-09-24-squad-frontmatter-runtime-implementation]]。 |
| Q12 | HTTP P2 如何衔接旧 ownership 决策、runtime 绑定校验及离线消息语义？ | open | 当前 UUID 只是属性；建议拒绝旧实例、离线留失败记录且不自动补投，需在 HTTP P2 合同中明确。见 [[sessions/2026-09-24-squad-messaging-readiness]]。 |

| Q13 | Role 的 agents.md 何时生效？ | closed | 以阶段 04 统一需求 TR-08 为准：每个新 Attempt 读取并固定快照，continuation 不热换。见 [[decisions/2026-09-27-squad-phase04-activation-and-split]]。 |
| Q14 | Leader 是否复用普通 Role、是否运行中切换 Team？ | closed | 以 TR-02 为准：启动固定 `mode=leader` + `team_id`，一个进程只绑定一个 Team，不在进程内切换。见 [[decisions/2026-09-27-squad-phase04-activation-and-split]]。 |
| Q15 | 任务/质量锁的参数与受管 session 迁移怎么定？ | superseded | 阶段 04 统一需求改为沿用目标既有会话（不另建受管 session 目录）；容量写在 team.json policy；Role 在 Team 激活时整体占用。ExecutionLease 的具体 TTL/续约值未在需求中规定，实施 M2 时记录实际值，不沿用旧稿 30s/8 槽。见 [[decisions/2026-09-27-squad-phase04-activation-and-split]]。 |
| Q16 | 阶段 03 未实现，P4 的 M2/M3 是否吸收 INV-01—15？ | closed | 用户确认：阶段 03 能力由 4a 交付，阶段 03 文档只删除冲突点，INV 判据并入需求 2.6 映射用例。见 [[decisions/2026-09-27-squad-phase04-activation-and-split]]。 |
| Q17 | P4 是否拆为单 Team 与多 Team 两段；跨 Team Role ownership 检测死锁还是预防？ | closed | 用户确认：拆为 4a（71 项）/4b（18 项）；Team 激活时原子占用 roster 全部 Role，任一被占则整体排队，结构上预防跨 Team 互占。见 [[decisions/2026-09-27-squad-phase04-activation-and-split]]。 |
| Q18 | 失联进程无停止回报时如何解除隔离？ | closed | 用户确认：允许显式人工停止声明并保留精确绑定/原因/证据审计。见 [[decisions/2026-09-27-squad-recovery-guidance-acceptance]]。 |
| Q19 | Leader 活动 Run 期间普通输入是什么语义？ | closed | 用户确认：作为 run_guidance，在安全边界应用。见 [[decisions/2026-09-27-squad-recovery-guidance-acceptance]]。 |
| Q20 | Project 管理操作由谁授权？ | closed | 用户确认：Project 管理员与独立 operator 凭据；runtime 模型凭据不可管理。见 [[decisions/2026-09-27-squad-recovery-guidance-acceptance]]。 |
| Q21 | Task 默认由谁验收，父子/review 如何避免自锁？ | closed | 用户确认：声明 checker 或独立 reviewer；standalone 无 reviewer 人工验收；版本化父覆盖、控制节点不递归。见 [[decisions/2026-09-27-squad-recovery-guidance-acceptance]]。 |
| Q22 | Pi Squad 在 Pi 1.0.1 的真实兼容回归是否通过？ | open | P0 和选定 P1 已实施；独立 1.0.1 三角色与 schema 2 核心事件真实就绪，兼容场景 14 PASS / 5 PARTIAL。阶段04原规格随后独立完成89/89，未据此补齐额外兼容分支，全局 Pi 仍 1.0.0。见 [[sessions/2026-10-04-pi-squad-pi-1.0.1-implementation]]。 |
| Q23 | 受管 Squad 正式支持 RPC 模式，还是只支持 TUI？ | closed | 用户明确选择 TUI-only；已在注册前拒绝 RPC/JSON/print，普通 Pi 可继续使用；真实 RPC get_state 正常且没有 Squad 注册。见 [[decisions/2026-10-04-squad-pi-1.0.1-tui-scope]]。 |
| Q24 | Pi 1.0.1 兼容表的剩余运行分支何时补齐？ | open | 阶段04现已补验真实compact/bash/fork/tree与代表性护栏；其余嵌套/exposure逐变体、隔离纯pending回调和非OpenAI chat provider增量仍未全部实跑，独立native binary未验收。具体覆盖见阶段 04 compatibility/README.md；当前不推导这些分支 PASS。 |
| Q25 | 正式任务截止时间是否可配置，续接、yield 等待和排队时是否重算？ | closed | 2026-10-04 用户决定取消业务 Task 固定时间截止，以上层及必要子任务的明确结束回传为准，不改为可配置硬截止。代码尚未实施；可续通信 lease 与业务时限分开。见 [[decisions/2026-10-04-squad-explicit-completion-and-context]]。 |
| Q26 | 父任务仍有未完成子依赖时提交结果，应拒绝结果还是取消孤儿子任务？ | open | 用户已明确必要子任务未回传时上层不得完成；建议未完成依赖拒绝 completion，并提示先 yield。具体错误/自动处理策略仍待实施设计。当前 parent_yield 无法正常解除，既有 deadline 可能转 needs_review。见 [[concepts/squad-completion-yield-scheduling]]。 |
| Q27 | Pi Squad 升级到 Pi 1.1.0 的兼容调整与真实验收是否完成？ | open | 2026-10-09 默认 CLI 已为 1.1.0，产品仍限定 1.0.1/TUI。静态差异、实际公共声明类型检查、Go 构建和只读 doctor 已完成；建议先同步 profile、消费 settled.aborted、处理 managed launcher 与 runtime entry 身份，再采集新 probe、跑新版本真实三角色及阶段 04 矩阵。尚未改产品或启动模型验收，旧 PASS 不覆盖 1.1.0。见 [[sessions/2026-10-09-pi-squad-pi-1.1.0-assessment]]。 |
| Q28 | 固定 DSH 版本能否通过公开 Hooks 证明 Task 输入、nested 工具、真正 settled 和旧 Session/epoch 隔离？ | open | 2026-10-18 P0（DSH 0.2.1-rc.2，只观察）：输入和工具可以——全部唤醒经过 inbox/pre-step，工具经过 pre-execute/execute/result。settled 不能只靠 Hook：`whenIdle` 在关机时也会 resolve；被取消的回合没有 turn-stopping；`interrupted` 只在重新打开时写进持久日志，不实时发出。nested（PTC）和 epoch 隔离未测。见 `docs/dsh-squad-p0-probe-report-2026-10-18.md`。 |
| Q29 | 如何接管 Managed Group 的 `group_relay`、普通消息/定时/自动恢复，不破坏 Free？ | closed | 2026-10-18 P1 原型：seam 补丁让 ds-bot 自己的 pre-step 先交给 Gate，12 类唤醒统一判定；resume.js 动手前先问 Gate。未受控的 Bot 照常工作（N2）。见 [[decisions/2026-10-18-dsh-p1-seam-as-patch]]。 |
| Q30 | 非开发用户的 DS Bot Web、Memory、Secrets 和目录如何隔离？ | open | 首版建议每用户独立环境，不把单个 DSH Home 直接当多租户 SaaS。 |
| Q31 | 记忆整理等辅助模型调用（P0 中约占调用数的 35%，多数不带 `purpose`）如何计入 Task 成本？ | open | 建议 Adapter 按 session 和是否有活跃回合区分；请 ds-bot 给记忆整理加 purpose 标签。 |
| Q32 | 回合内（mid-turn）切段、PTC 嵌套调用、默认模型回退，在受控 Session 下的行为是什么？ | closed | 2026-10-18 真实模型实测：①回合内切段 → `turn/end blocked`，新 part 由 handoff 自启并重做已完成的步骤；②嵌套调用在 tools/pre-execute 可见，`rootCallId` 指向 run_code；③模型下架后 Session 被静默切到默认模型，Bot 配置不变、没有通知。见 `docs/dsh-squad-p0-probe-report-2026-10-18.md` §3A。 |
| Q33 | ds-bot 归属 seam 走上游 PR 还是本仓库最小 Fork 补丁？ | deferred | P1 先在本仓库用补丁实现（`dsh_squad/patches/ds-bot/`，+152/−9），没有 fork。2026-10-19 D2：暂不向上游提 PR，先完成自己的验证。 |
| Q34 | Squad Gate 如何保证在 `agent/pre-step` 中的位置，不被 ds-bot 或其他插件先 reject 或先放行？ | closed | P1：Gate 由 ds-bot 自己最外层的 pre-step 调用，与 Gate 插件的加载顺序无关；外层另有单调 tool guard 和 step 审计兜底（尚未实际触发，见 Q35）。 |
| Q35 | 有外部插件在 ds-bot 链之外放行步骤时，tool guard 和 step 审计能否真正拦住？ | open | P1 负例里没有触发过。M1 起 tool guard 还按合同限制工具（drive-m1 M1-guard：bash 被拒），但「外层插件直接 enter」的负例仍未做。 |
| Q36 | 被 Gate 扣留的输入交给 Controller 后，如何分类、重新投递或丢弃？ | open | 2026-10-19 M1：Adapter 持久化扣留的输入并上报 `POST /v2/agents/held-inputs`，Controller 存为 `pending`（快照 `held_inputs`）。分类与处理（Run Guidance、Clarification、新 Task、丢弃）仍在 M2-2。 |
| Q37 | `rewake`（拒绝后重新唤醒）依赖的 DSH 行为能否保持到正式版？ | open | 「拒绝会结束 driver 循环」「followup 会唤醒 driver」都是 0.2.1-rc.2 的实测行为；升级时重新验证，或请求 DSH 提供原生的「拒绝但保留 inbox」。 |
| Q38 | M0→M4 开发规划中的 12 个决策点（Controller 放哪、补丁还是插件、协议版本、多租户、界面范围、M0 试用时间、真实 key 时间、Artifact 存储、版本升级、中间回归、业务案例、Memory 冻结） | closed | 2026-10-19 用户拍板，见 `docs/decisions/2026-10-19-dsh-squad-dev-decisions.md` 与规划「决策记录」节。 |
| Q39 | DS Bot 切段（新 part 会话）发生在正式 attempt 中时，重新注册与 epoch+1 的路径是否在真实宿主上按设计工作？ | open | M1 已实现：Adapter 发现绑定会话变化就带 `previous_session_id` 重新注册，Controller 以 `session_changed` 中断旧 attempt。端到端还没有负例（drive-m1 未覆盖），留给 T 阶段或 M4-3。 |
| Q40 | `needs_review`（如缺结果、宿主重启）的 attempt 会一直占住该 Bot，直到 operator `reconcile`；非开发用户在界面上怎么完成这一步？ | open | Controller 设计如此（不自动释放未知执行）。界面上的恢复卡在 M3-2/M4-3。 |
| Q41 | 依赖某个任务的下游任务，在该任务被退回、返工后，仍指向旧版本（Controller 不把依赖和 refs 转到返工任务）。数学案例的「检查」只能依赖「制作」的 `execution_completed`，检查的是首版。 | open | 2026-10-19 M2 发现。选项：Controller 在返工通过时改写下游依赖；或由 Leader 为返工后的版本补派检查。M4 或 T 前决定。 |
| Q42 | Artifact 预览与 DS Bot 同主机不同端口：Cookie 按主机共享。现在靠 CSP `sandbox`（不透明源，读不到 Cookie）和 `default-src 'none'`（不能发请求）隔离。M3 的界面 iframe 是否还要换成不同主机名（如 `localhost` 对 `127.0.0.1`）？ | open | 2026-10-19 M2-6；浏览器自动化验证放在 T 阶段（DSH-M2-07）。 |
| Q43 | D12「正式 Run 开始时 Memory 快照只读」只做到受控会话在任务里不能 `remember`/`forget`。同一时间 Free 模式的会话（如在私聊里的 Chief）仍可改团队记忆，正式 Run 后续步骤会读到新内容；也没有在 Run 开始时记录记忆的哈希。 | open | 2026-10-19 M3。若对照实验需要严格冻结：Run 开始时复制记忆为只读快照并让受控会话读快照，或实验期间锁定团队记忆写入。 |
| Q44 | 一个 Leader 身份只能带一个小队（`leader.agent_ref` 唯一）。非开发用户可能希望同一个 Chief 带多个小队。 | open | 2026-10-19 M4：现在每个小队一个 Leader Bot（如「Lead A」）。若要共用，需要 Leader 也像角色一样按小队分 runtime。 |
| Q45 | 对照实验的 D 组（C + 高级资源调度）还没有接进 `experiments/run.mjs`。 | open | 规划把 D 放在 M4 之后；需要先定 D 组的具体配置（如多小队共用角色、capacity=1），再加。 |
| Q46 | Squad 界面规划（任务树版）的六个决定 | closed | 2026-10-19 用户全部按建议拍板，见 `docs/dsh-squad-ui-plan-2026-10-19.md`「决策记录」。 |
