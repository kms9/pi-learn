---
title: DSH Squad：迁移验收与协作策略对照实验
type: process
status: active
created: 2026-10-18
updated: 2026-10-20
tags: [dsh-bot, acceptance, evaluation]
---

# DSH Squad：迁移验收规范

> T 阶段（2026-10-20 起）在最终代码上实测，结果见文末[「T 阶段结果」](#t-阶段结果2026-10-20)。原 Pi Stage04 的 Pi 1.0.1/TUI 89/89 PASS 只可作为测试判据参考，**不能继承为 DSH 通过结果**。

## 证据与状态

实际测试必须记录 `case_id、run_id、task_id、attempt_id、segment_id、bot_id、role_id、group_id、dsh_version、dsbot_sha、controller_sha、adapter_sha、provider/model/effort、config_hash、tool_set、artifact_hash、event_timeline、token_usage、human_actions、result、evidence_ref`。敏感凭据和原始私人会话不直接提交。

状态只有 `NOT_RUN / PASS / FAIL / PARTIAL / BLOCKED`。PASS 必须附真实运行证据；FAIL 保留原记录，复测新增 Run ID，不能覆盖。PARTIAL、BLOCKED、NOT_RUN 不计通过。

## M0：非开发用户自由协作体验

| ID | 场景 | 通过要求 |
|---|---|---|
| DSH-M0-01 | 用户只打开 Web 使用四 Bot 群聊 | 不需要 Pi/Herdr/Go 命令行 |
| DSH-M0-02 | Bot 配置的模型路由（2026-10-19 D7 改为单模型：DeepSeek `deepseek-flash`，thinking、effort high；不再要求两家 Provider） | 实际模型路由与配置一致，冻结后不静默回退 |
| DSH-M0-03 | `@Bot` / 普通 Handoff / 长期记忆 | 交互和回传正常，无正式 Squad Task |
| DSH-M0-04 | 页面刷新、宿主重启、不同试用者 | Session 历史正常且不存在跨用户数据暴露 |

## M1：受控输入与执行证据

| ID | 场景 | 通过要求 |
|---|---|---|
| DSH-M1-01 | 正式 Task 受理→输入→工具→结果 | 有精确 Session/Attempt/Fence 与真实收尾证据 |
| DSH-M1-02 | 同 request_id 重复、HTTP 重连、重复 Event | 不产生重复 Task/Attempt 或模型执行 |
| DSH-M1-03 | `@Bot` / `message_bot` / `post_to_group` 绕行 | 未经 Controller 许可不能执行模型工作 |
| DSH-M1-04 | 定时、原生 Session Prompt、恢复重投 | 不绕过受控 Gate |
| DSH-M1-05 | 入队前后网络断开、Host 重启 | 不确定执行保持隔离，不自动重放 |
| DSH-M1-06 | result_proposed 但工具未收尾 | 不显示完成/已验收、不释放资源 |
| DSH-M1-07 | Session 切段、旧 Epoch / 迟到事件 | 不可污染新 Binding 或 Attempt |
| DSH-M1-08 | nested run_code、任意 shell、未授权 MCP/路径 | 实际工具被代码拒绝并有证据 |
| DSH-M1-09 | 模型不可用或 Effort 改变 | 严格实验不静默 fallback |
| DSH-M1-10 | 用户取消、再次恢复 | 取消不是停止证明；对账后按权限明确恢复 |

## M2：真实 DAG 与验收

| ID | 场景 | 通过要求 |
|---|---|---|
| DSH-M2-01 | 并行无依赖步骤与有依赖步骤 | 按容量执行，未就绪不派发 |
| DSH-M2-02 | Builder Artifact → Reviewer | 审查具体 result/artifact 版本，作者与审查 Bot 不同 |
| DSH-M2-03 | Reject → Rework → Re-review | 新节点与新版本，保留拒绝历史 |
| DSH-M2-04 | 用旧卡通过新 Artifact | 版本冲突被拒绝 |
| DSH-M2-05 | 模型说“已完成”而缺结果/settled | Acceptance Gate 拒绝 |
| DSH-M2-06 | 必要 child 未结束，父尝试完成 | 不允许产生提前成功 |
| DSH-M2-07 | 生成 HTML/JS 课件预览 | 隔离主站 Session、Cookie 和控制接口 |

## M3：Web 与策略收益

| ID | 场景 | 通过要求 |
|---|---|---|
| DSH-M3-01 | Web/SSE 断线与旧 Snapshot | 再取权威投影，不错误显示 PASS |
| DSH-M3-02 | 回答问题 / 批准工具 / 验收成果 | 分别操作、有授权与精确 expected_revision |
| DSH-M3-03 | Free 与 Managed 同任务对照 | 模型、工具、记忆、输入和结果可追溯 |
| DSH-M3-04 | 包含 compaction/memory/vision 辅助调用 | 用量计入总成本，价格估算标注口径 |

## M4：跨 Team 与恢复

| ID | 场景 | 通过要求 |
|---|---|---|
| DSH-M4-01 | Team A/B 共享 Reviewer，C 独立 | B 原子 FIFO 等待，C 并行，A 释放后 B 准入 |
| DSH-M4-02 | capacity=1 Child/yield | 原 Attempt 安全暂停与续接 |
| DSH-M4-03 | Host/Controller 崩溃、迟到结果、角色换人 | 旧绑定隔离、未知工作人工对账 |

## 对照方法

建议五组：S 强单 Agent；A DS Bot Free；B Managed Task DAG；C B+Independent Review/Acceptance；D C+高级资源调度（M4）。

固定每组任务、模型/effort、数据、工具权限、独立工作目录及初始个人/团队 Memory。不要使后一组继承前一组的学习成果。长记忆的真实用户体验另做产品可用性评估。

主要记录端到端成功率、错误完成率、Reviewer 缺陷检出及误报、返工、总 Token/辅助模型成本、等待和耗时、人类干预及故障安全恢复。**演示成功不能替代实验统计，故障注入通过不能推导自然任务质量提升。**

## T 阶段结果（2026-10-20）

**被测版本**：分支 `feat/dsh-t`（基于 `c6e7a17`）；DSH `0.2.1-rc.2`；ds-bot `e13bc34` + `dsh_squad/patches/ds-bot/0001-squad-seam.patch`；协议 `squad/3`。真实模型只用 DeepSeek `deepseek-official/deepseek-flash`，thinking 开、effort `high`（D7），key 只从运行环境读取。

**怎么测**：mock 部分在最终代码上重跑全部自动化，P0/P1 阶段的结果没有继承；真实模型部分用 `probes/real-t.mjs`。证据（事件时间线、会话日志、截图、回归输出）留在测试机的 `probes/.run/` 和临时目录，不入库；下表写出覆盖每条判据的脚本和检查项，可用同一脚本复现。重点是产品能力能否端到端跑通。

**mock 全量回归**（2026-10-20，同一份代码）：Go 测试全过；`dsh_squad/scripts/check.sh`；`drive-m0` 12/12、`drive-m1` 7/7、`drive-p1` 14/14、`drive-m2` 13/13、`drive-m3` 18/18、`drive-m4` 13/13、`ui-check` 9/9、`ui-p1`…`ui-p6`（17/16/22/9/20/27）、`drive-accept` 全过。

| ID | 结果 | 方式 | 依据（脚本 / 检查） | 说明 |
|---|---|---|---|---|
| DSH-M0-01 | NOT_RUN | 试用 | — | 需要非开发用户实际试用（D6）。部署是一条命令 `dsh-squad up`，之后全部在网页里完成，但没有真人试用记录，不判 PASS。 |
| DSH-M0-02 | 见真实模型 | 真实 | `real-t.mjs route` | mock 下无意义，按真实模型判。 |
| DSH-M0-03 | PASS（mock） | mock | `drive-m0`「three members answered」「team memory entry」；`drive-accept` M0-03「@Researcher」 | 真实模型另测，见下。 |
| DSH-M0-04 | PASS | mock | `drive-m0`「Bots and group kept」「memory kept」；`drive-accept` M0-04（A 项目的登录打不开 B 项目；群和会话、历史在重启后都在） | 「不同试用者」按 D4 是不同项目目录、各自登录；同一项目内没有多用户权限。 |
| DSH-M1-01 | PASS | mock | `drive-m1` M1-formal | 收据链 adapter_received→injection_requested→input_observed→result_proposed→settled。 |
| DSH-M1-02 | PASS | mock + Go | `drive-m1` M1-duplicate；Controller 幂等与 CAS 测试；adapter 持久化 outbox 同 request_id 重发 | |
| DSH-M1-03 | PASS | mock | `drive-p1` N1、N2、N3；`drive-m1` M1-held | 扣留的输入交给 Controller，不进模型。 |
| DSH-M1-04 | PASS | mock | `drive-p1` N4（定时）、N3（原生 Prompt）、N11（重启不续跑、不重放） | |
| DSH-M1-05 | PASS | mock + Go | `drive-m1` M1-restart；`drive-p1` N11；`drive-m4` M4-03（Controller 崩溃）；`ui-p6` 断线重连；`TestHostRestartInterruptsTheAttempt` | 不确定的执行进入人工对账，不自动重放。 |
| DSH-M1-06 | PASS | mock | `drive-m1` M1-no-result | |
| DSH-M1-07 | PASS | mock + Go | `drive-p1` N8（fence）、N10（切段）；Controller `session_changed` 测试 | |
| DSH-M1-08 | PASS | mock + 真实 | `drive-m1` M1-guard；`real-t.mjs route`「a managed Bot asked to run a shell」 | 本轮修复：受控任务里 `read`/`glob`/`grep` 原先能读项目外任意路径（真实模型读到了 `/etc/hostname`），现在只能访问项目目录和 DS Bot 工作区。Q35（外层插件绕过）的负例仍未做。 |
| DSH-M1-09 | PASS | mock | `drive-p1` N12（模型下架不回退）；`drive-accept` M1-09（思考档位被改后，正式任务在请求前被拒） | 本轮修复：原先冻结路由只含模型，不含 effort。 |
| DSH-M1-10 | PASS | mock + Go | `drive-accept` M1-10；`TestCancelFreesTheBotOnlyWhenTheHostConfirmsTheStop` | 本轮修复：取消后宿主原来不停下 Bot、也无法证明已停止，只能人工对账；现在宿主停下这一轮，并以 settled 证明已停止后才释放 Bot。 |
| DSH-M2-01 | PASS（mock） | mock | `drive-m2`；`ui-p6`（30 个并行步骤、容量 4） | 真实模型另测。 |
| DSH-M2-02 | PASS（mock） | mock | `drive-m2` DSH-M2-02 | 真实模型另测。 |
| DSH-M2-03 | PASS（mock） | mock | `drive-m2` DSH-M2-03；`ui-p4` | 真实模型另测。 |
| DSH-M2-04 | PASS | mock + Go | `drive-accept` M2-04（经页面宿主路由：旧版本号的卡、别的结果哈希的卡都被拒，且不留验收记录）；`TestAcceptanceBindsTheExactResultVersion`；`ui-p3` | |
| DSH-M2-05 | PASS | mock | `drive-m1` M1-no-result；`TestNoBusinessDeadline`、最终检查 `NO_RESULTS` | |
| DSH-M2-06 | PASS | Go + mock | `TestParentCannotFinishWithOpenChild`；`drive-m4` M4-02 | 「父任务在子任务回传前提交」由 Controller 测试直接驱动；端到端只走了正常顺序。 |
| DSH-M2-07 | PASS | mock 浏览器 | `ui-check`「preview cannot read cookies」「another host name」 | 真实模型生成的课件另测。 |
| DSH-M3-01 | PASS | mock + Go | `drive-m3`「fresh snapshot」；`ui-p6`「connection dropped / back」；`TestSSELatencySamplesAndDisconnectReconcile` | |
| DSH-M3-02 | PASS | mock 浏览器 + API | `drive-m3`（旧版本补充说明被拒、已消失的审批不能回答）；`ui-p3`（批准工具、人工验收、补充指导）；`drive-accept` M2-04 | |
| DSH-M3-03 | 见真实模型 | 真实 | `dsh_squad/experiments/run.mjs` | |
| DSH-M3-04 | 见真实模型 | 真实 | `dsh_squad/experiments/run.mjs` | |
| DSH-M4-01 | PASS（mock） | mock | `drive-m4` DSH-M4-01；`ui-p5` | 真实模型另测。 |
| DSH-M4-02 | PASS（mock） | mock | `drive-m4` DSH-M4-02 | 真实模型另测。 |
| DSH-M4-03 | PASS | mock + Go | `drive-m4` DSH-M4-03；`TestControllerCrashRecovery` | |

本轮 mock 回归还发现并修复：Leader 在决定时 Run 被别人改动（如有人点了验收）会被拒且这一步没有结果、Run 被挂起，现在 adapter 重读 Run 后再提交一次；任务工具与循环同时补发回执造成请求冲突（Q47 收尾时修）。测试机多次整机挂起（事件日志 6～22 分钟空白、随后租约过期）造成的失败都已核对日志并单独重跑通过。

### 真实模型（deepseek-flash，effort high）

证据来源：DSH 会话日志里每次模型请求的 `request/header`（provider、model、reasoningEffort）和助手消息；Controller 快照；DS Bot 用量账本（先读 `usage` 视图再读账本）。

| ID | 结果 | 依据 | 说明 |
|---|---|---|---|
| DSH-M0-02 | PASS | `real-t.mjs route` | 预置四个 Bot 与绑定小队时新建的 Bot 都是 `deepseek-flash`、effort `high`；9 次模型请求全部是 `deepseek-official/deepseek-flash`、`high`。冻结后不静默回退由 M1-09 覆盖。本轮修复：绑定小队时新建的 Bot 原来不继承项目已配置的模型和档位。 |
| DSH-M0-03 | PASS | `real-t.mjs route` | 群里一句话四位成员都回了；`@Researcher` 由 Researcher 在群里回答；`@Chief` 问谁负责审核，Chief 按团队记忆答「Reviewer」；全程没有正式 Squad Task。 |
| DSH-M1-08 | PASS | `real-t.mjs route` | 让受控 Bot 用 bash/run_code 跑 `ls /`、读 `/etc/hostname`：6 次工具调用被拒（bash 不在合同里；读项目外路径被拒），结果里没有任何主机信息，任务照常提交完成。 |

**数学课件（`real-t.mjs math`，在浏览器里从 Squad 页面操作）**：Run `run-500486538b16…`，24 个任务（含 12 次 Leader 决定），128 次模型调用，全部 `deepseek-flash`。

| ID | 结果 | 说明 |
|---|---|---|
| DSH-M2-01 | PASS | 从开始面板启动，任务树从 Leader 长出；「制作」等「梳理」验收通过后才派发；Run 完成。 |
| DSH-M2-02 | PASS | 课件是 Controller 内容寻址的 `lesson.html`（24 KB）；审核由 `math-reviewer` 完成，作者是 `math-builder`，审核引用返工的精确版本。 |
| DSH-M2-03 | PASS | 首版被独立审核退回，Leader 派返工成为新节点（旧版灰、标「已被返工替代」），返工版复审通过；退回记录保留。 |
| DSH-M2-07 | PASS | 在页面上预览真实生成的课件：另一个主机名（`localhost`），iframe 内读 `document.cookie` 抛 `SecurityError`。 |
| UI 关键流程 | PASS | 空小队打开即是开始面板；任务树生长；完成后成果文件可预览；浅色、深色截图；无页面错误。 |

真实模型下的行为与修复：Leader 看到「检查」是基于首版做的，自己补派了对新版的检查，最终关卡也拦下了基于旧版本的那次检查（`STALE_INPUT`）。第一轮里 Leader 对这次旧检查派了 `rework`，Controller 收下了计划，却在验收时拒绝（原检查从未被退回），任务卡住、Run 挂起。已修（`54aa6a1`）：Leader 对「基于旧版本」的任务派返工等同于「用新版本重做」，对仍是最新且已通过的任务派返工在计划时就拒绝。修复后第二轮 Run 完成，且没有人工介入。另有两轮被测试机挂起打断（事件日志 98 秒、7.6 分钟空白后租约过期），已重跑。

（多小队、对照实验：进行中。）
