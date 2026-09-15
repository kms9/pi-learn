---
title: Paseo、Pi Agent Teams 与 Herdr：多 Harness 协同架构
status: active
type: process
created: 2026-09-16
updated: 2026-09-16
tags:
  - project-wiki
  - learning
  - harness
  - multi-agent
  - paseo
  - herdr
---

# Paseo、Pi Agent Teams 与 Herdr：多 Harness 协同架构

本文整理 2026-09-16 围绕以下四个问题的源码分析，并给出面向 `pi-learn` 的实现结论：

1. Paseo 中如何接管其他 harness？
2. `pi-agent-teams` 中如何给其他 agent 注入角色配置？
3. 是否可以基于 Pi，把其他 harness 作为 Agent Teams 成员，并注入角色配置？
4. 如何让不同角色通过 Herdr 展示不同 TUI，但内部任务、消息和协作流程保持一致？

## 结论先行

最重要的建模结论是：

> **Role ≠ Harness ≠ TUI。**

不要继续把 `pi-agent-teams` 的 Team Member 等同于一个 Pi RPC 子进程。更合适的目标是把 Team Member 抽象为统一的 `Agent Runtime Endpoint`；Pi、Codex、Claude、DeepSeek Harness、ACP Agent 都只是不同 runtime 实现。角色配置单独建模，Herdr 只负责终端与交互展示。

```text
Agent Teams
Task / Mailbox / Team
        │
        ▼
TeamMemberEndpoint
prompt / steer / events / abort
        │
   ┌────┼─────────┐
   ▼    ▼         ▼
 Pi RPC ACP   Native Harness
   │    │         │
   └────┴────┬────┘
             ▼
        Herdr / TUI
```

源码核对版本：

- Paseo：`getpaseo/paseo` `425157595038614a44e2cbf9c393f2e263270b95`
- pi-agent-teams：`tmustier/pi-agent-teams` `2c1776d2a68104aaadc1c622d8a704684c7c35d6`
- Herdr：`herdrdev/herdr` `fc548768db4771fcc68590f56713a20afa53850a`

Paseo 已作为本仓库 `paseo/` submodule 固定到上述 SHA。

---

## 问题一：Paseo 中如何接管其他 harness？

### 1.1 它不是侵入 harness，而是做 Runtime Adapter

Paseo 的核心做法不是修改 Claude Code、Codex、Pi 等 harness 内部实现，而是在 daemon 内建立统一的 provider/runtime 适配层。

关键入口：

- `paseo/packages/server/src/server/agent/provider-registry.ts`
- `paseo/packages/server/src/server/agent/agent-sdk-types.ts`

`provider-registry.ts` 当前注册多种实现，例如：

```text
ClaudeAgentClient
CodexAppServerAgentClient
OpenCodeAgentClient
PiRpcAgentClient
OmpAgentClient
GenericACPAgentClient
CursorACPAgentClient
KimiACPAgentClient
...
```

因此 Paseo 的结构可以抽象成：

```text
Claude Code ─ Claude Adapter ─┐
Codex       ─ Codex Adapter  ─┤
Pi          ─ Pi RPC Adapter ─┤→ AgentClient / AgentSession
OpenCode    ─ OpenCode Adapter─┤
ACP Agent   ─ ACP Adapter     ─┘
```

### 1.2 Paseo 统一了三个边界

#### A. 进程 / runtime 生命周期

Pi 的实现集中在：

- `paseo/packages/server/src/server/agent/providers/pi/cli-runtime.ts`
- `paseo/packages/server/src/server/agent/providers/pi/runtime.ts`

`PiCliRuntime.startSession()` 最终启动：

```text
pi --mode rpc ...
```

并用 JSONL RPC 管理：

```text
prompt
steer
abort
get_state
get_messages
set_model
set_thinking_level
close
```

#### B. Session 接口

Paseo 上层不直接依赖某个 CLI，而依赖统一接口：

```ts
interface AgentClient {
  createSession(...): Promise<AgentSession>
}

interface AgentSession {
  run(...)
  startTurn(...)
  subscribe(...)
  streamHistory(...)
}
```

这使“启动的是 Pi 还是 Codex”变成 adapter 内部问题。

#### C. 统一事件模型

各 provider 最终被映射为 Paseo 的统一事件，例如：

```text
turn_started
turn_completed
turn_failed
assistant_message
reasoning
tool_call
permission_requested
permission_resolved
```

这才是 Paseo 能同时管理多个 harness 的核心。

### 1.3 system prompt 也由 Adapter 映射

Paseo 的 `AgentSessionConfig.systemPrompt` 是 provider-agnostic 的。上层只表达“这个 session 应得到什么系统/开发指令”，provider 自己决定如何注入。

对 Pi，Paseo 会动态创建 extension，并在 `before_agent_start` 中追加系统提示：

```ts
pi.on("before_agent_start", async (event) => ({
  systemPrompt: event.systemPrompt + "\n\n" + injectedSystemPrompt,
}));
```

相关位置：

- `paseo/packages/server/src/server/agent/providers/pi/agent.ts`
- `paseo/packages/server/src/server/agent/system-prompt.ts`

### 1.4 对我们最值得借鉴的不是 Paseo UI，而是 Adapter Contract

我们不需要把 Paseo 整体嵌入 `pi-agent-teams`。真正值得复用的是：

```text
AgentClient
AgentSession
AgentStreamEvent
Provider Registry
Provider-agnostic Session Config
```

即：**把 harness 差异收敛在 runtime adapter 层。**

---

## 问题二：pi-agent-teams 如何给其他 agent 注入角色配置？

### 2.1 当前其实没有完整的 Role Profile

`pi-agent-teams` 的 `TeamMember` 只有：

```ts
role: "lead" | "worker"
```

对应源码：

- `extensions/teams/team-config.ts`

这里的 `role` 只是编排角色，不是业务角色。它不能表达：

```text
architect
reviewer
researcher
tester
frontend-engineer
```

### 2.2 当前 Worker 得到的配置主要有四类

#### A. Team 身份

Leader 通过环境变量注入：

```text
PI_TEAMS_TEAM_ID
PI_TEAMS_TASK_LIST_ID
PI_TEAMS_AGENT_NAME
PI_TEAMS_LEAD_NAME
PI_TEAMS_STYLE
PI_TEAMS_AUTO_CLAIM
PI_TEAMS_PLAN_REQUIRED
```

Worker 通过这些变量知道自己属于哪个 team、叫什么、任务列表在哪里。

#### B. 很薄的一层角色 prompt

Leader 当前启动子进程时会拼接：

```text
You are teammate '<name>'.
You collaborate with the team lead.
Prefer working from the shared task list.
```

并通过：

```text
--append-system-prompt
```

传给 Pi。

因此当前所谓角色更接近“成员身份”，还不是完整 persona/profile。

#### C. 模型与 Thinking

`SpawnTeammateOptions` 当前支持：

```text
name
mode
workspaceMode
planRequired
model
thinking
```

源码：

- `extensions/teams/spawn-types.ts`
- `extensions/teams/leader-spawn-command.ts`

#### D. Tool 与 Extension

Leader 会继承部分 Pi 内建工具，并显式加载 teams extension：

```text
--tools ...
--no-extensions
-e <teams-extension>
```

### 2.3 当前缺失的真正角色配置

现在还没有一等公民形式的：

```text
profileId
rolePrompt
runtime
harness
tools policy
extensions policy
ui mode
permission policy
```

所以如果要实现异构 Agent Team，角色层需要单独补出来。

---

## 问题三：能否基于 Pi，把其他 harness 作为 Agent Teams 成员？

## 可以，但需要重构 Team Member 的 runtime 抽象

当前最大限制在：

- `extensions/teams/teammate-rpc.ts`

`TeammateRpc.start()` 直接写死：

```ts
spawn("pi", ["--mode", "rpc", ...opts.args], ...)
```

也就是说当前结构实际上是：

```text
Team Member
   =
TeammateRpc
   =
Pi RPC process
```

这不是通用的 Agent Team runtime model。

### 3.1 建议增加统一 TeamMemberEndpoint

目标接口可以是：

```ts
interface TeamMemberEndpoint {
  readonly id: string
  readonly runtimeKind: string

  start(config: RuntimeConfig): Promise<void>

  prompt(message: string): Promise<void>
  steer(message: string): Promise<void>
  followUp(message: string): Promise<void>

  abort(): Promise<void>
  stop(): Promise<void>

  getState(): Promise<MemberState>

  subscribe(
    fn: (event: CanonicalAgentEvent) => void
  ): Unsubscribe
}
```

对应实现：

```text
TeamMemberEndpoint
  ├── PiRpcEndpoint
  ├── ACPAgentEndpoint
  ├── CodexEndpoint
  ├── ClaudeEndpoint
  ├── DeepSeekHarnessEndpoint
  └── PaseoProviderEndpoint（可选）
```

现有 `TeammateRpc` 不删除其能力，而是重命名/收敛为 `PiRpcEndpoint`。

### 3.2 Role 不应该等于 Harness

不要设计成：

```text
reviewer = codex
researcher = pi
```

应该拆成：

```text
Role Profile
    ↓ selects/configures
Runtime / Harness
```

例如：

```yaml
id: reviewer
instructions: |
  你负责代码审查。
  重点检查并发安全、边界条件、回归风险和测试覆盖。
runtime:
  kind: codex
model: gpt-5.6-codex
thinking: high
tools:
  - read
  - grep
  - bash
ui:
  mode: interactive
```

以后同一个 `reviewer` 可以从 Codex 切到 Claude，而不改 Team 协议。

### 3.3 Team Member 建议拆成三个正交维度

```text
Team Member
  ├── orchestrationRole
  │     lead / worker
  ├── profile
  │     reviewer / researcher / coder / tester
  └── runtime
        pi / codex / claude / acp / deepseek
```

这比把 `role`、`runtime`、`agent kind` 混在一个字段里稳定得多。

---

## 问题四：如何让不同角色通过 Herdr 展示不同 TUI，但内部流程/消息保持一致？

## 可行，前提是彻底分离“协作协议”和“展示协议”

建议拆成四层：

```text
┌──────────────────────────────────┐
│ L1 Team Orchestration            │
│ TaskStore / Dependency / Mailbox │
└────────────────┬─────────────────┘
                 │ Team Message
┌────────────────▼─────────────────┐
│ L2 Role / Profile                │
│ prompt / tools / model / policy  │
└────────────────┬─────────────────┘
                 │
┌────────────────▼─────────────────┐
│ L3 Runtime Adapter               │
│ Pi RPC / ACP / Codex / Claude    │
└────────────────┬─────────────────┘
                 │
┌────────────────▼─────────────────┐
│ L4 Presentation                  │
│ Herdr Pane / Native TUI / Viewer │
└──────────────────────────────────┘
```

因此：

```text
任务怎么分配
Agent 怎么通信
Task 怎么完成
结果怎么回传
```

不应该依赖：

```text
这个 Agent 显示 Pi TUI
还是 Codex TUI
还是 Claude TUI
```

### 4.1 Herdr 很适合作为 L4

Herdr 自身已经分离：

```text
Layout
Pane
Agent
```

相关源码：

- `herdrdev/herdr/src/cli/pane.rs`
- `herdrdev/herdr/src/cli/agent.rs`
- `herdrdev/herdr/src/detect/mod.rs`

当前 Herdr 能识别 Pi、Claude、Codex、Gemini、Cursor、OpenCode、Kimi、Grok、Qwen 等多种 Agent，并统一为 lifecycle state：

```text
idle
working
blocked
unknown
```

本仓库已经存在的 Herdr 扩展：

- `herdr-pi-extensions/packages/pi-herdr/README.md`
- `herdr-pi-extensions/packages/pi-herdr/index.ts`

提供了结构化：

```text
herdr_layout
herdr_pane
herdr_agent
```

### 4.2 可以得到这样的展示

```text
Herdr Tab: Team Alpha

┌────────────────┬────────────────┐
│ architect      │ reviewer       │
│ Pi TUI         │ Codex TUI      │
├────────────────┼────────────────┤
│ researcher     │ tester         │
│ Claude TUI     │ DeepSeek TUI   │
└────────────────┴────────────────┘
```

内部仍然统一使用：

```text
TaskStore
Mailbox
TeamMessage
CanonicalAgentEvent
```

### 4.3 一个必须避免的实现错误

不要试图让**同一个进程的同一组 stdio**同时承担：

```text
Pi RPC stdin/stdout
```

和：

```text
Interactive TUI PTY
```

当前 `TeammateRpc` 是 headless RPC 子进程：

```text
pi --mode rpc
stdio = pipe
```

Herdr 的原生交互展示则是 PTY + interactive agent。

这是两种不同宿主模型，不能简单理解成“把 RPC 子进程搬进 pane 就有 TUI”。

---

## 两种 UI 绑定模式

### 模式 A：Interactive TUI 本身就是 Runtime

```text
Herdr Pane
   ↓
Pi / Codex / Claude TUI
   ↓
Team worker integration
   ↓
shared TaskStore / Mailbox
```

`pi-agent-teams/scripts/start-tmux-team.sh` 已经证明过同类模式：leader 和 interactive worker 可以使用不同终端窗口，同时仍共享 filesystem task list + mailbox。

把 tmux 换成 Herdr 后，这条路线最适合先做验证。

### 模式 B：Headless Runtime + Observer TUI

```text
Codex App Server / Pi RPC / ACP
              │
        Canonical Event
              ▼
         Team Event Bus
          ├────── Agent Teams
          └────── Herdr Observer Pane
```

Herdr Pane 中运行的不是第二份 agent，而是统一 viewer，例如：

```text
reviewer · Codex
WORKING
> reading server/session.go
> running go test ./...
Last message: ...
```

这种方式更适合 SDK、app-server、ACP 这类 headless harness。

### 推荐：A + B 同时支持

```ts
interface MemberUIBinding {
  mode: "headless" | "interactive" | "observer"
  herdrPaneId?: string
  agentKind?: string
}
```

例如：

```text
Pi CLI           → interactive
Claude CLI       → interactive
Codex app-server → observer
Generic ACP      → observer
```

---

## 建议的目标代码结构

```text
pi-agent-teams/
├── orchestration/
│   ├── task-store
│   ├── mailbox
│   └── team
├── roles/
│   └── role-profile
├── runtime/
│   ├── endpoint.ts
│   ├── pi-rpc.ts
│   ├── acp.ts
│   ├── codex.ts
│   └── external.ts
├── events/
│   └── canonical-event.ts
└── presentation/
    └── herdr-binding.ts
```

对应现有文件的第一轮改造：

| 当前文件 | 建议修改 |
|---|---|
| `teammate-rpc.ts` | 抽象 `TeamMemberEndpoint`，当前实现下沉为 `PiRpcEndpoint` |
| `spawn-types.ts` | 增加 `profileId`、`runtime`、`ui` |
| `leader-spawn-command.ts` | 增加 `--profile`、`--runtime`、`--ui` |
| `leader.ts` | 去掉直接 `new TeammateRpc + spawn pi`，改用 RuntimeFactory |
| `team-config.ts` | 保留 `lead/worker`，增加 `profileId/runtime/uiBinding` |
| `worker.ts` | 保留 Team Mailbox 协议，不假设 Worker 一定是 Pi |
| 新增 `role-profile.ts` | 角色 prompt、tool、model、policy 配置 |
| 新增 `runtime/*` | 各 harness adapter |
| 新增 `events.ts` | 统一 canonical event |
| 新增 `herdr-binding.ts` | Team Member 与 Herdr Pane 绑定 |

---

## 实施顺序

### 第一步：只抽象，不改变行为

把现有：

```text
TeammateRpc
```

改造成：

```text
TeamMemberEndpoint
└── PiRpcEndpoint
```

保证现有 Agent Teams 行为不变。

### 第二步：加入 RoleProfile

让 profile 独立描述：

```text
instructions
model
thinking
tools
permission policy
runtime preference
ui preference
```

### 第三步：验证 Herdr Interactive Worker

先支持：

```text
PiRpcEndpoint
HerdrInteractiveEndpoint
```

验证二者能否共同使用同一套 TaskStore / Mailbox / TeamConfig。

### 第四步：接入 ACP

增加：

```text
AcpEndpoint
```

优先吸收 Paseo `GenericACPAgentClient` 的 provider adapter 思路。

### 第五步：接原生特殊 Harness

再逐个支持：

```text
Codex App Server
DeepSeek Harness
Claude SDK / CLI
```

---

## 最终判断

这几个问题不是“怎么让 Pi 启动另一个 CLI”的局部问题，而是 Agent Teams 的 runtime 边界需要升级。

比较合适的目标定义是：

> **Agent Teams 管理角色、任务和协作；Runtime Adapter 管理不同 harness；Herdr 管理可视化终端与交互。**

这样我们后续可以让一个团队中同时存在 Pi、Codex、Claude、DeepSeek Harness 等成员，但 Team 的任务协议、消息协议、状态模型和验收逻辑仍保持一致。

这也更接近我们后续 DARS 的分层：

```text
Control / Orchestration Plane
            ↓
Runtime Adapter Plane
            ↓
Execution Runtime / Harness
            ↓
Presentation / Herdr
```

## 源码入口

### Paseo（本仓 `paseo/`）

- `paseo/packages/server/src/server/agent/provider-registry.ts`
- `paseo/packages/server/src/server/agent/agent-sdk-types.ts`
- `paseo/packages/server/src/server/agent/providers/pi/agent.ts`
- `paseo/packages/server/src/server/agent/providers/pi/cli-runtime.ts`
- `paseo/packages/server/src/server/agent/providers/pi/runtime.ts`
- `paseo/packages/server/src/server/agent/providers/generic-acp-agent.ts`
- `paseo/packages/server/src/server/agent/system-prompt.ts`

### pi-agent-teams

仓库：`https://github.com/tmustier/pi-agent-teams`

重点文件：

- `extensions/teams/teammate-rpc.ts`
- `extensions/teams/leader.ts`
- `extensions/teams/spawn-types.ts`
- `extensions/teams/leader-spawn-command.ts`
- `extensions/teams/team-config.ts`
- `extensions/teams/worker.ts`
- `scripts/start-tmux-team.sh`

### Herdr

仓库：`https://github.com/herdrdev/herdr`

重点文件：

- `src/cli/agent.rs`
- `src/cli/pane.rs`
- `src/detect/mod.rs`

### pi-herdr

本仓：

- `herdr-pi-extensions/packages/pi-herdr/README.md`
- `herdr-pi-extensions/packages/pi-herdr/index.ts`
