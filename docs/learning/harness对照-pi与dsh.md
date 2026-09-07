---
title: Pi 与 DeepSeek Harness 对照
type: process
status: active
created: 2026-09-07
updated: 2026-09-07
tags:
  - project-wiki
  - learning
  - harness
---

# Pi 与 DeepSeek Harness 对照

条目提纲。完整独立讲解（含 X 引文、术语表、崩溃对照）见 [[harness对照讲解|Harness 对照讲解]]。

对照对象不是两个同名函数，而是两套「把模型变成 coding agent」的产品实现。定义见 [[concepts/harness|Harness]]。ingest 时 submodule SHA：`pi-dev` `92d8e2d17d4f357788381c49ce2cdb3f4ed1f21c`，`deepseek-harness` `d347e703908d0406b7a7ef80e3a0e594d86b2215`。

## 先对齐包边界

用户常说「对比 `pi-dev/packages/coding-agent` 和 `deepseek-harness`」。后者是整个 harness 产品；前者只是 Pi 的 CLI / TUI / 工具 / Extension 宿主。Pi 的 loop 和耐久运行时在 `packages/agent`。

```text
Pi 产品（自称 minimal terminal coding harness）
  packages/ai            LLM 适配（@earendil-works/pi-ai）
  packages/agent         agentLoop + Agent + 新的 AgentHarness
  packages/tui           终端组件
  packages/coding-agent  默认产品：会话、内置工具、Extension、TUI/SDK/RPC

DeepSeek Harness（整个仓库就是 harness）
  vendor/cordis          插件运行时
  packages/core          session / system-prompt / tools / agent / agent-loop
  packages/llm           ctx.llm 缝，含 dsh-llm-pi-ai（依赖 pi-ai）
  packages/*             shell、fs、sandbox、subagent、web UI、MCP…
  packages/bundle        web / headless / sdk / acp 组合
```

交叉点：DSH 的 `@deepseek-ai/dsh-llm-pi-ai` 把 `@earendil-works/pi-ai` 当成多供应商适配器。DSH 借 Pi 的模型目录，不借 Pi 的 loop。

## 两边各自把 harness 定义成什么

Pi `coding-agent` 文档第一句：*Pi is a minimal terminal coding harness.* 哲学是核心极小，MCP / sub-agent / plan mode / todo / 权限弹窗 / 后台 bash 都不进核心，留给 [[concepts/extension|Extension]] 或 Pi package。Mario 的公开表述：模型只要 `read` / `write` / `edit` / `bash`。

Pi `packages/agent/docs/harness.md` 把 **AgentHarness** 定义成耐久运行时：会话由 entry 树、values/lists、Branch/AgentLane、usage ledger 组成。harness 用四个原语驱动 lane：

- `accept`：耐久地创建一个 operation（run / compaction / navigation）
- `drive`：推进一个已接受的 operation
- `requestAbort`：耐久地请求取消
- `inspectExecution`：原子地报告当前 / 最近一次终止执行

它明确 **不管调度**：不建 alarm、不扫废弃 session；宿主决定何时再 `drive`。崩溃策略是 intent → 不确定的外部效果 → settlement；`replay: "never"` 的工具（如删文件）死后不重跑。

DSH `README.md`：*open-source agent harness*，**everything-is-a-plugin**，Cordis 上下文上挂服务、类型化事件、可逆 effect。`docs/architecture.md`：模型适配、工具登记表、会话日志、**agent loop 本身**都是插件，都可以从配置替换。`dsh-agent-loop` README：它是 harness 唯一的具体 loop；「调模型、跑工具、再调」以外的事都该听事件的插件做。

## Loop：形状相近，切分不同

### Pi 默认路径（coding-agent 现在还在用）

`packages/agent/src/agent-loop.ts` 的 `runLoop`：

1. `agent_start`
2. 内层：`turn_start` → 注入 steering → `streamAssistantResponse` → 执行 tool calls → `turn_end`
3. `shouldStopAfterTurn` 可在压缩前停
4. 否则再 poll steering；没有 tool 也没有 steering 时，poll follow-up；有则当下一轮 pending
5. `agent_end`

`Agent`（`packages/agent/src/agent.ts`）是有状态封装：消息数组、`prompt()`、事件订阅。coding-agent 的 `AgentSession`（约 3500 行）把它和 JSONL `SessionManager`、压缩、bash、Extension runner 焊在一起。这是 **进程内消息数组 + 边跑边写 JSONL**，不是 `AgentHarness` 那套 operation 状态机。

### Pi 实验路径（AgentHarness）

`coding-agent/src/experimental/`（session worker、`mini/`）才 `AgentHarness.create(...)`。`mini/README.md`：TUI 不持有 agent 状态；每个 session 一个 worker；worker 挂了由替换进程从上次 recovery state 续跑。Mario 在 X 上说过：新 harness 还在 `packages/agent`，**coding-agent 默认产品没用上**。

### DSH 默认路径

`packages/core/agent-loop/src/agent.ts` 的 `ReactLoopAgent`：

- **turn**：排空已接纳输入，直到模型和工具停或策略介入；写 `turn/start` … `turn/end`
- **step**：一次模型请求 + 它引起的工具执行；写 `step/start` … `step/end`
- inbox：`followup` = next-turn 并唤醒；`steer` = next-step 并唤醒；`inject` = next-step 不唤醒
- 每步：`agent/pre-step` waterfall → 组装 prompt/工具 schema → `agent/request` → `llm/stream` → 工具管道 → 事实 append 回 log
- 模型可见历史是 `session.deriveMessages()`，**不另存一份 Message[]**

`agent-loop` 约 589 行驱动类；复杂度在事件、session、tools 包，不在这一份文件里膨胀。

### 术语对照（不要按名字对齐）

| 概念 | Pi `agentLoop` | DSH `ReactLoopAgent` |
|------|----------------|----------------------|
| 一次模型调用 + 其工具 | `turn_start` / `turn_end` | **step** |
| 从用户输入排到「本会停了」 | 一次 `agentLoop`（含 follow-up 外环） | **turn** |
| 插入下一轮模型调用前 | `getSteeringMessages` | `steer` / `inject`（next-step） |
| 本会停了再追加 | `getFollowUpMessages` | `followup`（next-turn） |
| 停循环 | `shouldStopAfterTurn` | `agent/turn-stopping` + 策略插件 |

名字反着：Pi 的 turn ≈ DSH 的 step。

## 会话真源

Pi coding-agent：`~/.pi/agent/sessions/...jsonl`，entry 带 `id` / `parentId` 成树（v3）。权威是消息/自定义 entry 的树；压缩改的是送给模型的上下文，不是擦存储。见 `coding-agent/docs/session-format.md`。

Pi AgentHarness：三个 store——append-only entries、可替换 values/lists、append-only usage ledger。operation 状态每次整份覆盖；重启读 `pi.op.state` 接着跑，不重放 journal。

DSH：append-only `SessionEvent` log。**Model-visible means logged.** 投影出模型历史、UI、telemetry。`assistant/message` 带完整 compact stream；失败/取消进 `assistant/attempt`。进程在 settlement 前死掉，没有耐久 attempt stream。持久化是另一条 seam（JSONL 等订阅 `session/event`）。

## 工具与「核心该有多大」

Pi `createAllToolDefinitions`：`read`、`bash`、`powershell`、`edit`、`write`、`grep`、`find`、`ls`。默认 coding set 经常是前四个。无内置 MCP、subagent、todo、plan、后台 job。安全模型：无内置 sandbox；project trust 只管加载项目扩展/设置，不管模型让工具干什么。隔离靠容器，见 `coding-agent/docs/security.md`。

DSH `docs/tool-catalog.md` 把工具做成独立插件：`bash` / `pwsh`、`read`/`write`/`edit`、`glob`/`grep`、`todo_write`、`subagent`、`job_*`、`web_search`/`web_fetch`、`lsp`、`skill`、`workflow`、`ralph`、`goal_*`、`schedule_*`、`terminal_*`、`ask_user_question`、`exit_plan_mode`、实验性 agent teams。工具走 `tools/pre-execute` → guards → `tools/execute` → `tools/post-execute` → `tools/result`。有 sandbox / approval seam，但 `SAFETY.md` 写明不能当唯一安全边界。

同一套「读改跑」在 Pi 是核心默认；在 DSH 是 `ctx.fs` / `ctx.shell` 上的 consumer 插件，换 provider（本地 / sandbox / 远程）不必改工具 schema。

## 扩展模型

Pi：一份 `export default function (pi: ExtensionAPI)`。进程内跑，和 pi 同权限。事件是产品生命周期（`session_start`、`tool_call`、compaction…），不是通用服务总线。热重载走自动发现目录 + `/reload`。

DSH：Cordis 插件 `apply(ctx)`，声明 `inject` 服务。扩展点是事件和 seam，不是一张 ExtensionAPI。loop 可换；卸载插件会 unwind 它登记的 effect。组合靠 profile / bundle / `cordis.patch.yml`。动态 Cordis 工具集是 opt-in，能让模型在运行时定义包。

写 Pi 插件时：抄 `coding-agent/examples/extensions/`，不要假设有 DSH 那种 `ctx.tools` waterfall 或可替换 loop。

## 崩溃与所有权

| | Pi 默认 AgentSession | Pi AgentHarness | DSH |
|--|---------------------|-----------------|-----|
| 跑到一半进程死 | JSONL 已 append 的 entry 还在；loop 本身不续跑未完成的 tool | 读 operation 全量状态；按 `replay` 重跑或合成 interrupted result | 已 commit 的 session event 可 resume；未 settlement 的 assistant stream 丢失 |
| 谁调度 | 调用 `agent.prompt()` 的进程 | 宿主反复 `drive` | Cordis fiber + inbox wake |
| 并行会话 | 多进程 / 多文件 | 同 session 多 lane 共享 entry 树 | 多 `Agent` / 多 session；subagent 另开 session |

## 和写 Pi 插件的关系

默认工作对象仍是 coding-agent Extension。对照 DSH 的用处是看清 harness 边界：Pi 把「产品该多胖」压到扩展里；DSH 把「产品的每一块」做成插件，包括 loop。不要把 DSH 的 `ctx.agents` / seam / turn-step 词汇写进 Pi Extension。

## 相关页面

- 概念: [[concepts/harness|Harness]]、[[concepts/extension|Extension]]
- 独立讲解: [[harness对照讲解|Harness 对照讲解]]
- 学习: [[怎么学写插件|怎么学写插件]]
- 来源: [[sources/pi-agent-core|Pi agent core]]、[[sources/deepseek-harness|DeepSeek Harness]]、[[sources/agent-harness-x-discourse|X 讨论]]
---
