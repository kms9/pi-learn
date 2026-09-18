# pi-learn

`pi-learn` 是一个围绕 **Pi、Agent Harness、Agent Runtime 与 Multi-Agent Engineering** 的源码学习、架构分析和实验仓库。

它不是某个上游项目的 fork，而是一个长期维护的 **source-first learning / architecture overlay**：

- 用 Git submodule 固定和跟踪关键上游源码；
- 用 `docs/` 把源码阅读、设计结论、会话研究和架构决策沉淀成可复用 Wiki；
- 用 `docs-zh/` 保留 Pi 上游文档的中文阅读层；
- 围绕真实源码持续研究 Agent Runtime、Harness、RPC、Session、Extension、Subagent、Agent Team、Herdr TUI 与跨 Harness 协同。

> 当前核心问题已经从“如何写一个 Pi Extension”扩展为：**Agent 怎么跑、多个 Agent 怎么协作、不同 Harness 怎么统一接入，以及这些 Agent 如何被观察、控制和持续优化。**

## 当前关注重点

### 1. Pi Runtime / Harness

重点研究 Pi 自身的运行时边界：

- `packages/agent` 中的 agent loop / Agent / AgentHarness；
- `packages/coding-agent` 中的 Session、RPC、TUI、Extension、工具与权限；
- RPC 模式与交互式 TUI 模式的差异；
- Session 持久化、上下文组装、压缩、恢复与分支；
- Extension 如何向 Harness 注入工具、事件、UI 与系统提示词。

### 2. Multi-Harness 统一接入

重点比较不同 Coding Agent Harness 如何被统一到同一个上层控制面：

- Pi RPC；
- Codex / Claude / OpenCode 等 native harness；
- ACP；
- Paseo 的 `AgentClient / AgentSession / AgentStreamEvent / Provider` 适配层；
- DeepSeek Harness 的独立 Harness 设计。

当前重点结论：**Role ≠ Harness ≠ TUI**。上层应该面向统一的 Agent Runtime Endpoint，而不是把 Team Member 写死成某一种 CLI 子进程。

### 3. Multi-Agent / Agent Teams

持续研究多个 Agent 如何形成稳定、可治理的协作系统：

- role / profile 注入；
- task store / task dependency；
- mailbox / inter-agent message；
- subagent 与 team member 的区别；
- fresh / branch session；
- shared workspace / worktree；
- Team Member Runtime Adapter；
- 多 Runtime 成员在同一 Team 中协作。

相关分析：[`Paseo-Pi-Agent-Teams-Herdr 多 Harness 协同架构`](docs/learning/Paseo-Pi-Agent-Teams-Herdr多Harness协同架构.md)。

### 4. Herdr 与多 TUI 展示

关注“执行层”和“展示层”解耦：

- Pi / Codex / Claude / Grok 等 Agent 各自保留原生 TUI；
- Herdr 负责 workspace / tab / pane / agent 生命周期管理；
- 内部 Task、Mailbox、Message、Canonical Event 保持统一；
- 同一个 Agent Team 可以由不同 Harness、不同 TUI 的成员组成。

目标不是“让 Herdr 管一堆 Pi”，而是让 **Agent Teams 管一组 Runtime，Herdr 负责呈现这些 Runtime 的交互形态**。

### 5. Context / Trace / Workflow / Extension

通过 Pi 生态中的小型项目继续拆解 Agent 工程能力：

- Context 管理；
- Trace / trajectory；
- Subagents；
- Agent 间通信；
- 动态 Workflow；
- Extension / Tool 设计模式；
- Worktree 与外部执行环境协作。

## 源码项目导航

下面的项目都可以从本仓库直接进入本地 submodule，也可以点击跳转到对应上游 GitHub 仓库。

| 本地路径 | 上游项目 | 在 pi-learn 中的主要研究用途 |
|---|---|---|
| [`pi-dev/`](./pi-dev/) | [`earendil-works/pi`](https://github.com/earendil-works/pi) | Pi 核心源码；Agent、coding-agent、RPC、Session、TUI、Extension、Harness |
| [`pigo/`](./pigo/) | [`smallnest/pigo`](https://github.com/smallnest/pigo) | Go 语言重实现 Pi；对照 Agent loop、Session、stream-json、权限、Skills/Plugins 与 Runtime 接口 |
| [`paseo/`](./paseo/) | [`getpaseo/paseo`](https://github.com/getpaseo/paseo) | 多 Harness Provider Adapter、统一 AgentClient / Session / Event、ACP 与 native harness 接入 |
| [`deepseek-harness/`](./deepseek-harness/) | [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) | 独立 Agent Harness 架构，与 Pi 的 loop / plugin / runtime 边界对照 |
| [`herdr-pi-extensions/`](./herdr-pi-extensions/) | [`ogulcancelik/pi-extensions`](https://github.com/ogulcancelik/pi-extensions) | Pi Extension 实战、Herdr 集成、worktree、handoff、goal 等模式 |
| [`pi-context/`](./pi-context/) | [`ttttmr/pi-context`](https://github.com/ttttmr/pi-context) | Pi 上下文管理与 Context Extension 设计 |
| [`pi-intercom/`](./pi-intercom/) | [`nicobailon/pi-intercom`](https://github.com/nicobailon/pi-intercom) | Agent 间通信、消息传递与多 Agent 协作参考 |
| [`pi-subagents/`](./pi-subagents/) | [`nicobailon/pi-subagents`](https://github.com/nicobailon/pi-subagents) | Pi Subagent 调用、递归委派与子 Agent 生命周期 |
| [`pi-workflows/`](./pi-workflows/) | [`osolmaz/pi-workflows`](https://github.com/osolmaz/pi-workflows) | 动态 Workflow / 编排实现参考 |
| [`pi-trace-extension/`](./pi-trace-extension/) | [`npxcnency-ux/pi-trace-extension`](https://github.com/npxcnency-ux/pi-trace-extension) | Trace、trajectory、Agent 行为观测 |
| [`agent-tools/`](./agent-tools/) | [`artmsilva/agent-tools`](https://github.com/artmsilva/agent-tools) | Agent Tool / Extension 实现参考 |

### 重点外部参考

下面两个项目当前不是本仓库 submodule，但与近期 Multi-Agent / TUI 研究直接相关：

- [`herdrdev/herdr`](https://github.com/herdrdev/herdr) — 多 Agent terminal workspace、pane、agent lifecycle 与 TUI 管理；
- [`tmustier/pi-agent-teams`](https://github.com/tmustier/pi-agent-teams) — Pi Agent Teams、Task Store、Mailbox、Teammate RPC、interactive worker 参考实现。

## 推荐阅读路径

### 想理解 Pi 是怎么跑起来的

1. [`pi-dev/packages/agent`](./pi-dev/packages/agent)
2. [`pi-dev/packages/coding-agent`](./pi-dev/packages/coding-agent)
3. [`pigo/internal/runtime/loop.go`](./pigo/internal/runtime/loop.go)
4. [`docs/learning/harness对照讲解.md`](docs/learning/harness对照讲解.md)

### 想理解多个 Harness 怎么被统一管理

1. [`paseo/packages/server/src/server/agent`](./paseo/packages/server/src/server/agent)
2. [`docs/sources/paseo.md`](docs/sources/paseo.md)
3. [`docs/learning/Paseo-Pi-Agent-Teams-Herdr多Harness协同架构.md`](docs/learning/Paseo-Pi-Agent-Teams-Herdr多Harness协同架构.md)

### 想理解 Multi-Agent / Agent Team

1. [`pi-subagents/`](./pi-subagents/)
2. [`pi-intercom/`](./pi-intercom/)
3. [`pi-workflows/`](./pi-workflows/)
4. [`tmustier/pi-agent-teams`](https://github.com/tmustier/pi-agent-teams)
5. [`herdrdev/herdr`](https://github.com/herdrdev/herdr)

### 想学习如何写 Pi Extension

1. `docs-zh/pi-dev/packages/coding-agent/docs/extensions.md`
2. `docs-zh/pi-dev/packages/coding-agent/docs/extensions-impl.md`
3. [`docs/learning/怎么学写插件.md`](docs/learning/怎么学写插件.md)
4. [`herdr-pi-extensions/`](./herdr-pi-extensions/)

## 仓库结构

```text
pi-learn/
├── docs/                  # 编译后的知识层：概念、学习、来源、决策、会话
├── docs-zh/               # Pi 上游文档中文阅读层
├── raw/                   # Raw 层说明
├── scripts/               # submodule / 中文文档同步工具
├── pi-dev/                # earendil-works/pi
├── pigo/                  # smallnest/pigo，Go 语言 Pi 重实现
├── paseo/                 # getpaseo/paseo
├── deepseek-harness/      # deepseek-ai/deepseek-harness
├── herdr-pi-extensions/   # ogulcancelik/pi-extensions
├── pi-context/
├── pi-intercom/
├── pi-subagents/
├── pi-workflows/
├── pi-trace-extension/
└── agent-tools/
```

Wiki 总入口：[`docs/index.md`](docs/index.md)。维护规范：[`AGENTS.md`](AGENTS.md)。

## 克隆与更新

完整克隆：

```bash
git clone --recurse-submodules https://github.com/kms9/pi-learn.git
cd pi-learn
```

已经克隆但没有拉 submodule：

```bash
git submodule update --init --recursive
```

同步 `.gitmodules` 中配置的上游分支：

```bash
./scripts/sync-submodules.sh
```

同步 Pi 中文文档状态：

```bash
python3 scripts/sync-zh.py
```

## 维护原则

- 上游 submodule 是 **Raw / Evidence 层**，默认只读；
- 不直接修改 `pi-dev/`、`paseo/`、`deepseek-harness/` 等上游源码并提交到本仓库；
- 可复用的源码结论沉淀到 `docs/`；
- Pi 中文镜像只维护在 `docs-zh/`；
- 新的源码研究优先回答“源码在哪里、实际怎么实现、抽象边界在哪里”，再给架构判断；
- submodule 的 commit SHA 由本仓库 gitlink 固定，保证后续分析可以回溯到具体源码版本。

## 当前方向一句话

> **以 Pi 为主要实验 Runtime，以 Paseo 学习多 Harness 统一抽象，以 Agent Teams / Intercom / Subagents 研究多 Agent 协作，以 Herdr 研究多 Runtime 的交互与可视化，最终形成一套可解释、可扩展、可观测的 Agent Engineering 实践体系。**
