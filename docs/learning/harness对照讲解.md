---
title: Harness 对照讲解：Pi coding-agent 与 DeepSeek Harness
type: process
status: active
created: 2026-09-07
updated: 2026-09-07
tags:
  - project-wiki
  - learning
  - harness
---

# Harness 对照讲解：Pi coding-agent 与 DeepSeek Harness

独立讲解稿。读这一份即可；短定义见 [[concepts/harness|Harness]]，证据摘要见文末来源。

对照的不是两个同名函数，而是两套「把模型变成 coding agent」的产品实现。ingest 时 submodule：`pi-dev` `92d8e2d17d4f357788381c49ce2cdb3f4ed1f21c`，`deepseek-harness` `d347e703908d0406b7a7ef80e3a0e594d86b2215`。

## 1. Harness 是什么

**Harness ≈ agent − model。** 模型只吐文本；给它上下文、工具、权限、会话、停止条件和崩溃恢复的那一层软件才叫 harness。

常见组成：

- **loop**：prompt → 模型 → 工具 → 把结果写回上下文 → 再调模型，直到停
- **tools / permissions / sandbox**：模型能碰到什么、谁批准、隔离到哪
- **session / memory**：会话日志、压缩、分支、工作记忆
- **hooks / plugins**：在请求、工具、轮次边界拦截或加能力
- **host / UI / SDK**：TUI、Web、RPC，把人的输入送进 loop

Harness 不是模型本身，不是某一个工具函数，也不是测试夹具（`coding-agent/test/test-harness.ts` 同名不同义）。Pi 的 [[concepts/extension|Extension]] 是往 harness 上挂能力的模块，不是 harness 本身。

## 2. X 上怎么讲这个词

检索日期 2026-09-07。帖会删改；下面只保留当时能核对的句子。

- [@soasme](https://x.com/soasme/status/2094712547014533444)：`agent harness ≈ ai agent − model`
- [Context Studios](https://x.com/_contextstudios/status/2096971501308403852)：模型不会行动，只会返回文本；loop、tools、memory、guardrails 全在模型外，那一层叫 agent harness
- [@SeanMorrison](https://x.com/SeanMorrison/status/2095008554868674625)：model = brain，harness = 经 API 连上去的 body；连上并循环才是 agent
- 黄仁勋 G20（[@karlmehta 转述](https://x.com/karlmehta/status/2096959239399026699)）：*What made AI useful is putting an exoskeleton around the LLM. That exoskeleton is what is called an agent harness.* 负责取知识、工作记忆、用工具、协作。Computex 2026 另把计算模式拆成 **model / harness / tools / runtime**：模型是脑，harness 是身体
- [loop vs graph vs harness](https://x.com/beamnxw/status/2081044232479928709)、[@0xwhrrari](https://x.com/0xwhrrari/status/2084636205732209143)：loop 管迭代和停止；graph 管拓扑；harness 管暴露面（工具、权限、记忆、沙箱、eval、trace、人）。失败时先判断是哪一层，不要三个词混用
- [@akshay_pachaar](https://x.com/akshay_pachaar/status/2045510648474530263)：模型故意做薄；memory / skills / protocols 绕 harness 转，中间是 sandbox、observability、compression、approval、sub-agent

针对 Pi：

- [@0xSero](https://x.com/0xSero/status/2048156544034799675)：`packages/agent` 是读过的最好、最小、缓存命中最高的 agent loop
- [@doodlestein](https://x.com/doodlestein/status/2024526138102435934)：Pi 是类似 Claude Code / Codex 的极简可扩展 harness，也是 OpenClaw 的核心
- [@voidflx](https://x.com/voidflx/status/2096613261676601527)：loop + context + tools + 扩展，其余自己来
- Mario [@badlogicgames](https://x.com/badlogicgames/status/2087180071752585416)：新 harness 在 agent 包和若干新包里，**coding-agent 默认产品没用上**

DeepSeek Harness 在 2026-09 的时间线上和 Pi / OpenCode / OpenClaw 并列出现。营销 star 数未核，不当事实。

完整摘录：[[sources/agent-harness-x-discourse|agent harness 的 X 讨论]]。

## 3. 对照前先对齐包边界

常说「对比 `pi-dev/packages/coding-agent` 和 `deepseek-harness`」。后者是完整产品；前者只是 Pi 的 CLI / TUI / 内置工具 / Extension 宿主。Pi 真正的 loop 和耐久运行时在 `packages/agent`。

```text
Pi（产品自称 minimal terminal coding harness）
  packages/ai            LLM（@earendil-works/pi-ai）
  packages/agent         agentLoop + Agent + 新的 AgentHarness
  packages/tui           终端组件
  packages/coding-agent  默认产品：会话、工具、Extension、TUI/SDK/RPC

DeepSeek Harness（仓库名就是 harness）
  vendor/cordis          插件运行时
  packages/core          session / system-prompt / tools / agent / agent-loop
  packages/llm           ctx.llm 缝，含 dsh-llm-pi-ai（依赖 pi-ai）
  packages/*             shell、fs、sandbox、subagent、Web、MCP…
  packages/bundle        web / headless / sdk / acp 组合
```

交叉点：DSH 的 `@deepseek-ai/dsh-llm-pi-ai` 把 `@earendil-works/pi-ai` 当成多供应商适配器。DSH 借 Pi 的**模型目录**，不借 Pi 的 loop。

Pi 内部还要把三个「harness」分开：

| 说法 | 指什么 | 现在谁在用 |
|------|--------|------------|
| 产品文案 | 整个终端 coding agent | `coding-agent` README / docs |
| `AgentHarness` | 可崩溃恢复的会话运行时 | `packages/agent`；coding-agent 只在 `src/experimental/` |
| 默认交互路径 | 进程内 `Agent` + `agentLoop` | `coding-agent/src/core/agent-session.ts` |

## 4. 两边各自怎么定义 harness

### Pi 产品：最小终端 coding harness

`pi-dev/packages/coding-agent/docs/index.md` 第一句：*Pi is a minimal terminal coding harness.*

哲学（`README.md` Philosophy，Mario 公开表述）：核心极小。不内置 MCP、sub-agent、plan mode、todo、权限弹窗、后台 bash。模型只要 `read` / `write` / `edit` / `bash`，其余用 Extension 或 Pi package。安全模型见 `coding-agent/docs/security.md`：无内置 sandbox；project trust 只管加载项目扩展/设置，不管模型让工具干什么。隔离靠容器。

### Pi 实现规范：AgentHarness

`pi-dev/packages/agent/docs/harness.md` 把 **AgentHarness** 定义成耐久运行时。会话由四部分组成：不可变 entry 树、bound values/lists、Branch / AgentLane、append-only usage ledger。

harness 用四个原语驱动 lane：

- `accept`：耐久地创建一个 operation（run / compaction / navigation）
- `drive`：推进一个已接受的 operation
- `requestAbort`：耐久地请求取消
- `inspectExecution`：原子地报告当前 / 最近一次终止执行

它明确**不管调度**：不建 alarm、不扫废弃 session；宿主决定何时再 `drive`。崩溃策略是 intent → 不确定的外部效果 → settlement；`replay: "never"` 的工具（如删文件）死后不重跑。实现入口：`packages/agent/src/harness/runtime/harness.ts` 的 `createAgentHarness`。

规范第 0.9 节列出未实现切片。不要把规范里的每个原语都当成 coding-agent 已接线行为。

### DeepSeek：整个产品就是 harness

`deepseek-harness/README.md`：*open-source agent harness*，**everything-is-a-plugin**。Cordis 上下文上挂服务、类型化事件、可逆 effect。developer preview，会破兼容。

`docs/architecture.md`：模型适配、工具登记表、会话日志、**agent loop 本身**都是插件，都可以从配置替换。profile = bundle 栈 + `cordis.patch.yml`。`dsh-agent-loop` README：它是 harness 里唯一的具体 loop；「调模型、跑工具、再调」以外的事都该听事件的插件做。插件依赖 `dsh-agent`，不依赖 loop 包，所以 loop 可换。

`docs/glossary.md` 把 turn / step / round、per-agent scope、seam（Service Definition + Provider + Consumer）写成规范术语。system-prompt 默认 opener：*You are an AI agent powered by DeepSeek Harness.*

## 5. Loop：形状很像，切分不同

两边心脏都是「模型 → 工具 → 再模型」。名字不要按字面对齐。

### Pi 默认路径（coding-agent 现在还在用）

`packages/agent/src/agent-loop.ts` 的 `runLoop`（约 800 行）：

1. `agent_start`
2. 内层：`turn_start` → 注入 steering → `streamAssistantResponse` → 执行 tool calls → `turn_end`
3. `shouldStopAfterTurn` 可在压缩前停
4. 否则再 poll steering；没有 tool 也没有 steering 时，poll follow-up；有则当下一轮 pending
5. `agent_end`

`Agent`（`packages/agent/src/agent.ts`，约 590 行）是有状态封装：消息数组、`prompt()`、事件订阅。`convertToLlm` 只在 LLM 边界把 `AgentMessage[]` 滤成模型消息。

coding-agent 的 `src/core/agent-session.ts`（约 3500 行）把它和 JSONL `SessionManager`、压缩、bash、Extension runner 焊在一起。这是**进程内消息数组 + 边跑边写 JSONL**，不是 `AgentHarness` 那套 operation 状态机。SDK 路径同样 `new Agent(...)`（`src/core/sdk.ts`）。

### Pi 实验路径（AgentHarness）

`coding-agent/src/experimental/`（session worker、`mini/`）才 `AgentHarness.create(...)`。`mini/README.md`：TUI 不持有 agent 状态；每个 session 一个 worker；worker 挂了由替换进程从上次 recovery state 续跑。

### DSH 默认路径

`packages/core/agent-loop/src/agent.ts` 的 `ReactLoopAgent`（约 590 行）：

- **turn**：排空已接纳输入，直到模型和工具停或策略介入；写 `turn/start` … `turn/end`
- **step**：一次模型请求 + 它引起的工具执行；写 `step/start` … `step/end`
- inbox：`followup` = next-turn 并唤醒；`steer` = next-step 并唤醒；`inject` = next-step 不唤醒
- 每步：`agent/pre-step` waterfall → 组装 prompt / 工具 schema → `agent/request` → `llm/stream` → 工具管道 → 事实 append 回 log
- 模型可见历史是 `session.deriveMessages()`，**不另存一份 Message[]**

复杂度在 session / tools / 事件包，不在这一份驱动文件里膨胀。生命周期图：`docs/agent-lifecycle.md`。

### 术语对照

| 概念 | Pi `agentLoop` | DSH `ReactLoopAgent` |
|------|----------------|----------------------|
| 一次模型调用 + 其工具 | `turn_start` / `turn_end` | **step** |
| 从用户输入排到「本会停了」 | 一次 `agentLoop`（含 follow-up 外环） | **turn** |
| 插入下一轮模型调用前 | `getSteeringMessages` | `steer` / `inject`（next-step） |
| 本会停了再追加 | `getFollowUpMessages` | `followup`（next-turn） |
| 停循环 | `shouldStopAfterTurn` | `agent/turn-stopping` + 策略插件 |

名字反着：**Pi 的 turn ≈ DSH 的 step**。Pi 的一次 `agentLoop` 才接近 DSH 的 turn。Steering / follow-up 和 DSH 的 next-step / next-turn 是同一类机制。

## 6. 会话真源

Pi coding-agent：`~/.pi/agent/sessions/...jsonl`，entry 带 `id` / `parentId` 成树（v3）。权威是消息 / 自定义 entry 的树；压缩改的是送给模型的上下文，不是擦存储。见 `coding-agent/docs/session-format.md`。

Pi AgentHarness：三个 store——append-only entries、可替换 values/lists、append-only usage ledger。operation 状态每次整份覆盖；重启读 `pi.op.state` 接着跑，不重放 journal。

DSH：append-only `SessionEvent` log。口号 **Model-visible means logged**：能进模型请求的东西必须能从 log 重建。`assistant/message` 带完整 compact stream；失败 / 取消进 `assistant/attempt`。进程在 settlement 前死掉，没有耐久 attempt stream。持久化是另一条 seam（JSONL 等订阅 `session/event`）。见 `packages/core/session/README.md`。

## 7. 工具与「核心该有多大」

Pi `createAllToolDefinitions`（`coding-agent/src/core/tools/index.ts`）：`read`、`bash`、`powershell`、`edit`、`write`、`grep`、`find`、`ls`。默认 coding set 经常是前四个。无内置 MCP、subagent、todo、plan、后台 job。

DSH `docs/tool-catalog.md` 把工具做成独立插件：`bash` / `pwsh`、`read`/`write`/`edit`、`glob`/`grep`、`todo_write`、`subagent`、`job_*`、`web_search`/`web_fetch`、`lsp`、`skill`、`workflow`、`ralph`、`goal_*`、`schedule_*`、`terminal_*`、`ask_user_question`、`exit_plan_mode`、实验性 agent teams。执行管道（`docs/tool-execution-pipeline.md`）：`tools/pre-execute` → guards → `tools/execute` → `tools/post-execute` → `tools/result`。有 sandbox / approval seam，但 `SAFETY.md` 写明不能当唯一安全边界。

同一套「读改跑」在 Pi 是核心默认；在 DSH 是 `ctx.fs` / `ctx.shell` 上的 consumer 插件，换 provider（本地 / sandbox / 远程）不必改工具 schema。

## 8. 扩展模型

Pi：一份 `export default function (pi: ExtensionAPI)`。进程内跑，和 pi 同权限。事件是产品生命周期（`session_start`、`tool_call`、compaction…），不是通用服务总线。热重载走自动发现目录 + `/reload`。证据：`coding-agent/docs/extensions.md`，例子在 `coding-agent/examples/extensions/`。

DSH：Cordis 插件 `apply(ctx)`，声明 `inject` 服务。扩展点是事件和 seam，不是一张 ExtensionAPI。loop 可换；卸载插件会 unwind 它登记的 effect。组合靠 profile / bundle / `cordis.patch.yml`。动态 Cordis 工具集是 opt-in，能让模型在运行时定义包。见 `docs/cookbook/extension-cookbook.md`。

写 Pi 插件时：抄官方 examples，不要假设有 DSH 那种 `ctx.tools` waterfall 或可替换 loop。学习路径：[[怎么学写插件|怎么学写插件]]。

## 9. 崩溃与所有权

| | Pi 默认 AgentSession | Pi AgentHarness | DSH |
|--|---------------------|-----------------|-----|
| 跑到一半进程死 | JSONL 已 append 的 entry 还在；loop 本身不续跑未完成的 tool | 读 operation 全量状态；按 `replay` 重跑或合成 interrupted result | 已 commit 的 session event 可 resume；未 settlement 的 assistant stream 丢失 |
| 谁调度 | 调用 `agent.prompt()` 的进程 | 宿主反复 `drive` | Cordis fiber + inbox wake |
| 并行会话 | 多进程 / 多文件 | 同 session 多 lane 共享 entry 树 | 多 `Agent` / 多 session；subagent 另开 session |

## 10. 一句话差异

Pi 把 harness 做成**小核心 + 你来扩展**；DeepSeek 把 harness 做成**没有特权核心的插件树，连 loop 都可以换**。两边 loop 都是「模型 → 工具 → 再模型」，但 Pi 默认仍是进程内消息数组，DSH 默认是事件溯源的 session log。Pi 正在把耐久 `AgentHarness` 做成第二套运行时，还没接到 coding-agent 默认路径上。

对照 DSH 的用处是看清边界，不是把 DSH 的 `ctx.agents` / seam / turn-step 词汇写进 Pi Extension。本仓库默认工作对象仍是 coding-agent Extension。

未决：coding-agent 默认路径何时切到 `AgentHarness`（[[questions/open-questions|Q5]]）。

## 证据路径

Pi：

- `pi-dev/packages/coding-agent/docs/index.md`、`README.md` Philosophy、`docs/security.md`、`docs/session-format.md`、`docs/extensions.md`
- `pi-dev/packages/coding-agent/src/core/agent-session.ts`、`src/core/tools/index.ts`、`src/experimental/mini/README.md`
- `pi-dev/packages/agent/docs/harness.md`
- `pi-dev/packages/agent/src/agent-loop.ts`、`src/agent.ts`、`src/harness/runtime/harness.ts`

DSH：

- `deepseek-harness/README.md`、`SAFETY.md`
- `deepseek-harness/docs/architecture.md`、`docs/glossary.md`、`docs/agent-lifecycle.md`、`docs/tool-catalog.md`、`docs/tool-execution-pipeline.md`
- `deepseek-harness/packages/core/agent-loop/src/agent.ts`、`packages/core/session/README.md`、`packages/llm/llm-pi-ai/README.md`

## 相关页面

- 短定义: [[concepts/harness|Harness]]
- 条目提纲: [[harness对照-pi与dsh|Pi 与 DeepSeek Harness 对照]]
- 会话: [[sessions/2026-09-07-harness-pi-vs-dsh|2026-09-07 对照会话]]
- 来源: [[sources/pi-agent-core|Pi agent core]]、[[sources/deepseek-harness|DeepSeek Harness]]、[[sources/agent-harness-x-discourse|X 讨论]]
- 学习: [[怎么学写插件|怎么学写插件]]
---
