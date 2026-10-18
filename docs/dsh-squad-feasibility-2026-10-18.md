---
title: DS Bot 引入 Pi Squad 方案的可行性评估
type: process
status: superseded
created: 2026-10-18
updated: 2026-10-18
tags:
  - dsh-bot
  - pi-squad
  - feasibility
---

# DS Bot 引入 Pi Squad 方案的可行性评估（2026-10-18）

> **2026-10-18 更新**：P0 探针已实测。本文中被证实、被推翻和新发现的部分，见 [P0 实测复评](dsh-squad-p0-probe-report-2026-10-18.md)。本文保留为读代码阶段的原始判断。

> 只读评估，没有改代码，没有提交。依据：`dsh_squad_case/{MIGRATION_PLAN,ACCEPTANCE,README}.md`、根 `README.md`、`docs/decisions/2026-10-18-dsh-bot-squad-migration.md`、`docs/sources/dsh-bot.md`、`pi_squad/{AGENTS,USAGE}.md`、`pi_squad/protocol/README.md`、`pi_squad/controller/**`、`pi_squad/extension/**`；DS Bot 源码 `Fei2411/DeepSeek-Bot@e13bc34`（从 `.git/modules/dsh-bot` 只读导出，工作区子模块目录未 checkout）；DSH 源码 `deepseek-harness@687f282e86`（`dsh-v0.2.1-rc.2`，当前子模块检出的版本）。
> 所有结论都来自静态阅读，**没有做过运行探针**。文中写「已有」的 Hook，指源码和 README 里能看到；要在固定版本上真正跑过才算确认。

## 1. 结论

**有条件可行。**

- **可以直接复用的**：Go Controller（约 1.1 万行非测试 Go：task/scheduler/projection/httpapi）的 Task/Attempt/DAG/Review/Acceptance/Recovery 语义本身不依赖宿主。Binding（`agent_id/runtime_id/session_id/binding_epoch`）也能套到「一个 Bot 的一个 Group Session」上。
- **DSH 提供的 Hook 基本够用**：Pi 扩展依赖的输入门、工具门、上下文注入、结束和取消信号，DSH 里都有对应机制（`agent/pre-step` reject/enter、`ctx.tools.guard` 单调拒绝、`system-prompt/assemble`、`agent/turn-stopping`、`whenIdle()`、`agent.cancel`、durable inbox）。DS Bot 自己也已经大量使用这些 Hook。
- **前提条件**：
  1. DS Bot 不对外暴露任何服务（`index.js` 只有内部 `rt`，没有 `ctx.provide`），Squad 拿不到 roster、groupOwners、deliver 这些内部状态。**必须先有一条接缝**：上游 PR 或最小 Fork。
  2. DSH 版本必须先对齐并固定（见风险 H1），然后在这个版本上用真实探针确认「真正结束」（settled）和取消的语义。
  3. 首版受控模式要缩小范围：一个 Team、一个 Role 对应一个 Bot、只用 standard preset（不用 PTC）、拒绝不受控的 shell/MCP。

做不到这三条，就只能做「DS Bot Free + Controller 只读看板」。这种形态不应该对外称为 Squad 受控模式。

## 2. 两边架构对照与映射

### 2.1 形态

| 维度 | Pi Squad（现状） | DS Bot（上游） |
|---|---|---|
| 宿主 | Pi 1.1.0 TUI，一个进程 = 一个角色 runtime | DSH Web/Desktop，一个 Node 进程里有 N 个 Bot × 多个 Session |
| 插件形态 | `export default function (pi: ExtensionAPI)`，约 5.3k 行 TS | Cordis 插件 `apply(ctx)`，`inject` 了 llm/tools/systemPrompt/sessionController/sessions 等服务，host 约 1.1 万行 JS |
| 身份 | `.agents/pisquad/roles/<role>/role.md` 加环境变量，Controller register 后得到 credential/binding | `state.json` 里的 roster，每个 Bot 有私聊 Session 和每个群各自的 Session，满了切新 part |
| 协作 | 正式 Task（CreateTask/handoff/children），受管 ask，被动 message | `message_bot` 交接树（`handoffs.js` 的 `works` 树）、`post_to_group`、群聊合成 `group_relay`、定时任务 |
| 状态真源 | Go + SQLite，CAS、Outbox、事件 seq、SSE | 单个 JSON 文件 `bot/state.json` 和 `inflight.json`，以及 DSH Session 日志 |
| 恢复 | 状态不明的执行进入隔离，人工对账，不自动重放 | `resume.js` 重启后**自动续跑**中断的回合，`parts.js` 上下文满了自动切段或压缩 |
| UI | TUI Dashboard（Bubble Tea） | Web 侧边栏、群聊、详情抽屉，`api/bot` 通道 |
| 模型 | Pi provider | 每个 Bot 单独选模型和 Effort；默认模型不可用时 DSH 会回退到目录第一项（让步总账 C9） |

### 2.2 能力映射（Pi Hook → DSH/DS Bot 落点）

| Pi Squad 机制（源码） | Pi Hook | DSH / DS Bot 对应 | 置信度 |
|---|---|---|---|
| 输入门 / 受控注入（`execution-gate.ts` `canInject`） | `input`、`before_agent_start` | `agent/pre-step` 可以 `reject` 或替换 messages（`packages/core/agent/README.md`「Step admission」）；DS Bot `parts.js:845` 用 `prepend: true` 先接管 | 高（有文档 + 有人在用） |
| 工具门（`checkTool`、`NESTED_CONTROL_CALL_DENIED`） | `tool_call` | `ctx.tools.guard`（单调拒绝，排在 `tools/pre-execute` 之后），以及 `tools/pre-execute` 的 allow/deny/ask；DS Bot `tools.js:581` 已在用 | 高；PTC 子调用要另外遍历（C1） |
| 上下文组装（`context-assembly.ts` 的 role/team/task 段） | `context_with_system`、`before_provider_request` | `ctx.systemPrompt.section`（DS Bot `prompt.js:66`）、`system-prompt/assemble`（`parts.js:907`）、Agent-scoped composition、`agent.inject()` | 高 |
| 结束证据（`agent_before_settle` / `agent_settled`） | 上面两个 | `agent/turn-stopping`、`agent/status`、`whenIdle()`（等整个 agent 静止）、`tools/result` | 中：要确认 whenIdle 覆盖 pending tool、后台 job、审批等待 |
| 取消 | abort | `agent.cancel(cause,{keepInbox})`；**没有只中止单个 step 的取消**（README Known Limitations） | 中 |
| 切换、压缩前的保护 | `session_before_compact/switch/fork/tree` | DS Bot 自己的 `parts.js` 切段（`switches`、`freshParts`）；DSH compaction | 低：切段由 DS Bot 内部控制，Squad 拿不到前置拦截点 |
| 身份注册 / Binding | session_start 加 register | `agent/created`，以 `sessionId` 为键；Bot 与 Session 的映射在 DS Bot `rt`（`groupOwners`、`chatOf`）里 | 中：要通过接缝拿到 |
| 正式消息 vs 普通消息（TR-07） | `messaging.ts` | DS Bot `deliver({source:{kind:'ds-bot',role,exchangeId,work}})`；`source` 可以加 Squad 字段做来源判定 | 中 |
| Dashboard | TUI | DS Bot client 侧边栏和 details-drawer 插槽，或者独立 Web 面板 | 中：DSH 插槽有限制（C7、C8） |

### 2.3 Controller 侧需要改的点

- `project/doctor.go:17` 把 `HostProfile = "pi-coding-agent/1.1.0"` 写死了，`installation.go`/`probe.go` 会核对 Pi 包名。需要抽一层 Host Profile（`dsh/<ver>+ds-bot/<sha>`）。
- 协议头 `X-Pi-Squad-*` 和 `pi-squad/2` 可以先原样复用，在 Adapter 里映射；后面再决定要不要升到 `squad/3`。
- Pi 是「一个进程一个 credential」，DS Bot 是「一个进程多个 runtime」。Adapter 要为每个受控 (Bot, Group Session) 单独 register 一个 runtime，分别拿 credential，不能让多个 Binding 共用一个 token。

## 3. 可行性依据

1. **Hook 都有**：Pi Squad 的四个关键门（输入、工具、上下文、结束）在 DSH 0.2.1 文档里都有公开 API，DS Bot 在生产代码里用过其中大部分（`agent/pre-step`、`tools.guard`、`llm/stream` 拦截、`approval/request`、`agent/created`、`session/event`、`inbox.remove`、`cancel`）。
2. **Controller 不依赖 Pi**：scheduler/task/projection 的语义是宿主中立的。耦合点集中在 doctor/installation/probe 和 extension 侧。
3. **数据模型对得上**：DS Bot 的「Bot = 长期身份；每个群单独一个 Session」正好对应 Controller 的 `agent_id` + `session_id` + `binding_epoch`；part 切换可以当成新的 session/epoch。
4. **许可证兼容**：DS Bot 是 Apache-2.0（含 NOTICE），DSH 是 MIT，都允许 Fork 和组合分发。
5. **DS Bot 自己就在往「可靠、可核验」方向走**（愿景第 2 条「结果可以验证」，让步总账 C11 的等待可视化），和 Squad 的治理目标一致，有机会推上游接缝。

## 4. 风险清单

### 高

| ID | 风险 | 依据 | 缓解 |
|---|---|---|---|
| H1 | **DSH 版本三处不一致**：superproject gitlink 钉的是 `ddefc45`（dsh 0.1.6-alpha.2）；子模块实际检出 `687f282e86`（0.2.1-rc.2，比 gitlink 新 4336 个提交）；DS Bot README 和 `dev/harness` 要求 0.2.0-rc.2；`parts.js` 注释又提到 0.2.1 的行为 | `git ls-tree HEAD deepseek-harness`、`git submodule status`、`ds-bot/dev/harness/package.json` | M0 第一件事：以 DS Bot 声明的 DSH 为准，三处统一并写进 doctor |
| H2 | **DS Bot 没有对外接缝**：没有 `ctx.provide`，roster、groupOwners、deliver、parts 切换都在私有 `rt` 上；旁挂插件只能靠 Session ID 和磁盘上的 `state.json` 猜映射 | `ds-bot/index.js`；`grep ctx.provide` 结果为空 | 最小 Fork 加一个 `ds-bot.squad` 服务，同时向上游提「受控会话 seam」的设计 PR |
| H3 | **普通入口会绕过 Gate**：`group_relay` 是在 `llm/stream` 里合成出来的；`message_bot`、`post_to_group`、定时任务、`resume.js` 自动续跑、`retryWrittenCall` 都会往 Session 注入输入并唤醒模型 | `groups.js:845`、`turns.js` retry、`resume.js` | 在 `agent/pre-step` 加 prepend 门：受控 Session 只接受带有效 Squad 派发标记的输入，其余全部 reject 或转成只展示的通知 |
| H4 | **「真正结束」证据不全**：`cancel` 默认清空 inbox，没有只中止单步的取消；`whenIdle` 是否覆盖后台 job、审批等待、PTC 子程序都没验证；模型流卡死没有看门狗（C11） | DSH agent README Known Limitations；让步总账 C11 | M1 探针逐项验证；验证不过的路径统一判 `outcome_unknown`，进入隔离，不自动重放 |
| H5 | **原生恢复和切段与 Squad 的「不重放」原则冲突**：DS Bot 重启后会自动续跑，上下文满了会切到新 part 并带着 input 继续 | `resume.js`、`parts.js:845–870` | 受控 Session 关闭自动续跑；切段视为 epoch 变化，先对账再重新绑定 |

### 中

| ID | 风险 | 依据 | 缓解 |
|---|---|---|---|
| M1 | **上游维护节奏和流程**：上游迭代快（v0.1.4 之后 244 个提交）；PR 要进 `dev`，已定设计的改动要维护者同意；规则禁止给 DSH 打补丁 | `dsh-bot/AGENTS.md` | Fork 只动接缝那一层（目标 <300 行），每周 rebase 到上游 tag；Squad 逻辑放在独立插件里 |
| M2 | **模型能力差异**：DeepSeek 等模型有时把 tool call 写成文本（DS Bot 专门做了 `writesToolCall` 重试）；不同 Provider 结构化输出的稳定性不同；默认模型回退会污染对照实验（C9） | `turns.js` WRITTEN_CALL；让步总账 C9 | Squad 结果只走结构化工具，并做 schema 校验；Run 冻结 provider/model/effort，不可用就直接失败，不回退；文本里的「完成」不算数 |
| M3 | **PTC preset**：PTC 下模型只能调 `run_code`，真正的工具在子调用里；单次程序运行最长约 10 分钟 | 让步总账 C1、C13 | 受控 Session 强制用 standard preset；检测到 PTC 就拒绝激活 |
| M4 | **协议兼容**：`pi-squad/2` 的请求头、`HostProfile`、doctor 都和 Pi 绑定；新旧数据不能混跑 | `protocol/README.md`、`project/doctor.go` | 新增 Host Profile 抽象；DSH 用独立的 DB 和数据域，不迁移 Pi 运行中的 Attempt |
| M5 | **两份状态真源**：DS Bot 的 `state.json`（works、exchanges）和 Controller 的 SQLite 都在记任务状态 | `handoffs.js`、`store.js` | Managed 模式下 `works` 只做展示镜像，权威状态以 Controller 为准，界面上明确标注 |
| M6 | **安全边界**：Controller 凭据、浏览器 Cookie 鉴权（`channel.js` 的 `/api` 路由）、课件 HTML 预览三者要隔离 | MIGRATION_PLAN §6；`channel.js:346` | Controller credential 只留在 host 进程；预览用 sandbox iframe 并配独立 origin |
| M7 | **UI 依赖 DSH 私有 DOM**：插槽有限制，其他插件的 CSS 可能覆盖样式 | 让步总账 C7、C8 | 首版 Squad 面板做成独立路由页或 drawer 插槽，不改原有 DOM |

### 低

| ID | 风险 | 缓解 |
|---|---|---|
| L1 | 许可证义务：Fork DS Bot 要保留 Apache-2.0 LICENSE/NOTICE，并标注改动过的文件；DSH 是 MIT，要保留版权声明；本仓库根目录**没有 LICENSE**，对外分发前要补 | 加 LICENSE 和 THIRD_PARTY_NOTICES |
| L2 | DS Bot 贡献规则不允许 AI 署名、不允许 `Co-authored-by` 写 AI，和本仓库的提交习惯不同 | 往上游提 PR 时按上游规则 |
| L3 | 超长工具结果会被截断（约 12.5k tokens，C12） | Artifact 存 hash 和 id，不把全文内联 |
| L4 | Pi 的 89/89 PASS 被误当成 DSH 的验收结果 | ACCEPTANCE 已经写明不继承，保持即可 |

## 5. 主要难点与解决方案

### 难点 1：怎么把所有入口都关在 Gate 后面（最难）

DS Bot 的协作就是靠「任何来源都能往 Session 注入输入」来工作的。Pi 那边一个进程只有一个输入口，DS Bot 至少有 7 条：用户输入、`message_bot`、`post_to_group`、合成的 `group_relay`、定时任务、`resume` 自动续跑、写成文本的 tool call 重试。

**方案**：
- 在 Squad 插件注册 `agent/pre-step`，`prepend: true`，并保证排在 DS Bot 的 `parts.js` 之前或同级。受控 Session 的每个 step，按 `message.source` 校验 `squad.{attempt_id, segment_id, fence, epoch}`。没有标记的输入：如果是只展示的通知就降级成 `inject`，不唤醒模型；其余一律 reject，并回执给发送方。
- 工具层再加一道 `ctx.tools.guard`：受控 Session 拒绝 `message_bot`、`post_to_group`、`create_bot`、shell、未授权的 MCP，PTC 子调用也要检查。
- 接缝里提供 `isManaged(sessionId)` 和 `onBeforeDeliver/onBeforeResume/onBeforePartSwitch` 回调，让 DS Bot 原生的那几条路径主动询问 Squad。
- 负例（ACCEPTANCE M1-03/04）作为 M1 退出门。

### 难点 2：「真正结束」和恢复语义怎么对齐

Squad 要把 `result_proposed`、`settled`、`accepted`、`released` 分开记录，状态不明的执行不重放。DSH/DS Bot 的默认行为正好相反：重启后自动续跑，上下文满了切段继续，取消时清空 inbox。

**方案**：
- Settled 判定 = `agent/turn-stopping` 观察到回合结束 + `whenIdle()` 返回 + 当前 Attempt 没有未结束的 tool call（`tools/result` 计数归零）+ 没有审批等待。任意一项拿不到，就上报 `outcome_unknown`。
- 受控 Session 关闭 `resume.js` 的自动续跑，改成上报 interruption，由 Controller 决定要人工对账还是重新绑定。
- 切 part 记为 `binding_epoch+1`，旧 epoch 迟到的事件由 Controller 的 fence 拒绝（这部分逻辑已有）。
- 首版不承诺跨 part 无缝续跑。

### 难点 3：Fork 与上游怎么平衡（接缝工程）

DS Bot 规则禁止给 DSH 打补丁，但 DS Bot 自己没有 Squad 需要的接缝；Fork 大了以后跟不上上游。

**方案**：
- 分两层：
  1. `ds-bot` 最小 Fork，只加 `ds-bot.squad` 服务（只读的 roster 和 session 映射，加上 deliver/resume/partSwitch 前置回调和受控标记），目标 <300 行，带单元测试。
  2. 独立的 `dsh_squad/adapter` 插件，作为另一个 Cordis 插件 `inject: ['ds-bot.squad', 'tools', ...]`，承载 Gate、Binding、Controller client。
- 同时按上游流程在 `docs/plans/` 写设计说明，向上游提 PR。接缝合入后 Fork 可以撤掉。
- 版本策略：Fork 只基于上游 release tag，CI 跑上游的 `npm test` 加 Squad 接缝测试。

### 次要难点

- **多 runtime 凭据**：一个 host 进程里有 N 个 Binding，各自 register、各自 heartbeat，Controller 要按 runtime 分别隔离。
- **模型差异**：Squad 的结果和审查只认结构化工具调用，审查用另一个 Bot 加另一家 Provider 做交叉验证；对照实验冻结路由，并把回退当作失败。

## 6. 分阶段落地路线

和 `MIGRATION_PLAN.md` 的 M0–M4 一致，在前面加一个探针阶段：

| 阶段 | 内容 | 退出门 |
|---|---|---|
| **P0 版本与探针（新增，1–2 周）** | 统一 DSH 版本（H1）；写一个只读探针插件，记录 pre-step、tools.guard、turn-stopping、whenIdle、cancel、inbox、part 切换、resume 在真实运行里的事件时序 | 有探针报告，逐项标 PASS/FAIL；FAIL 的项目对应缩小受控范围 |
| M0 | DS Bot Web 四个 Bot、两个 Provider、群聊和 Memory，按现有计划让非开发用户试用 | 按 ACCEPTANCE M0 |
| M1a 接缝 | `ds-bot.squad` 最小 Fork 和上游设计 PR | 上游测试全绿，接缝有单元测试 |
| M1b Adapter | Controller 抽出 Host Profile；Adapter 为每个 Session register；输入门、工具门、settled 上报、关闭受控 Session 的 resume | ACCEPTANCE M1-01..10，负例优先 |
| M2 | 单 Team DAG、Artifact、独立 Review、Rework、Final Gate | ACCEPTANCE M2 |
| M3 | Web 面板，以及 Free 与 Managed 的对照实验 | ACCEPTANCE M3 |
| M4 | 跨 Team、FIFO、Child/yield、全量故障恢复 | ACCEPTANCE M4 |

## 7. 建议第一步

先做 **P0**：把 DSH 版本统一到 DS Bot 声明的版本（0.2.0-rc.2，或经确认的 0.2.1-rc.x），然后写一个**只观察、不拦截**的 DSH 探针插件，和 ds-bot 一起加载。在一个四 Bot 群聊里，分别触发 `@Bot`、`message_bot`、定时任务、宿主重启续跑、part 切换、用户取消，记录以下事件的顺序和 payload：`agent/pre-step`、`tools/pre-execute`、`tools/result`、`agent/turn-stopping`、`agent/status`、`whenIdle`、`agent/inbox/*`。

这份时序报告决定两件事：M1 的 Gate 能否只靠 DSH 公开 Hook 完成；ds-bot 接缝最少要开哪几个回调。在此之前不要动 Controller 代码。

## 8. 未决问题（建议写进 `docs/questions/open-questions.md`）

- DSH 应固定哪个版本？superproject 现在钉的是 0.1.6-alpha.2，DS Bot 要求 0.2.0-rc.2，子模块检出的是 0.2.1-rc.2。
- `whenIdle()` 是否覆盖后台 jobs、审批等待、PTC 子程序？（unknown，需要探针）
- 上游维护者是否愿意接受受控会话的 seam？（unknown）
- `agent/pre-step` 有多个 prepend 监听时，执行顺序有没有保证？（unknown）

> 按仓库约定，本评估还需要写回 wiki（`docs/sessions/`、`docs/questions/`、`docs/index.md`、`docs/log.md`）。本次要求只读、只写本文件，所以写回留待你确认后再做。
