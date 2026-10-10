---
title: 2026-10-02 Submodule 全量更新记录
type: session
status: active
created: 2026-10-02
updated: 2026-10-02
tags:
  - maintenance
  - submodule
  - pi
  - pi-squad
---

# 2026-10-02 Submodule 全量更新记录

本轮将 `pi_squad_dev` 作为 overlay 基线，把 `.gitmodules` 登记的全部 11 个 submodule 对齐到各自跟踪分支的上游尖点，并记录版本、变更和对 Pi Squad 的影响。

同步规则仍保持：**上游源码只读；pi-learn 只更新 gitlink，不在 submodule 内制造本地补丁。**

## 结果摘要

- 基线分支：`pi_squad_dev`
- 同步前 overlay commit：`c5633156385522881ead93f6ea1d482e8d1c3a82`
- 组件总数：11
- 需要更新：8
- 已经最新、gitlink 不变：3（`pi-context`、`pi-trace-extension`、`pigo`）
- Pi 本体：从 0.86.1 时代的 `890f920` 跨到 **1.0.0 系列 main HEAD `3874b3e`**
- 本轮只完成源码引用同步和静态兼容检查；**没有把 Pi Squad 阶段 04 的 Pi 1.0 运行回归标为已通过。**

## 版本矩阵

| 组件 | 跟踪分支 | 同步前 | 同步后 / 当前版本 | 提交差 |
|---|---|---|---|---:|
| `pi-dev` | `main` | 0.86.1 · `890f920` | **1.0.0 + main · `3874b3e`** | +220 |
| `agent-tools` | `main` | 0.1.0 · `4b1b977` | 0.1.0 · `894ceca` | +1 |
| `herdr-pi-extensions` | `main` | repo 无统一版本；minimal-footer 0.1.12 · `35bbe0f` | repo 无统一版本；minimal-footer 0.1.13 / anthropic-image-cap 0.1.0 · `373a8cf` | +3 |
| `pi-context` | `main` | 2.2.0 · `3479721` | **2.2.0 · `3479721`（已最新）** | 0 |
| `pi-intercom` | `main` | 0.13.0 · `199279a` | **0.16.0 · `924917f`** | +33 |
| `pi-subagents` | `main` | 0.70.0 · `678f842` | **0.74.0 + main 未发布修复 · `69a830c`** | +151 |
| `pi-trace-extension` | `main` | 0.1.16 · `5441bcc` | **0.1.16 · `5441bcc`（已最新）** | 0 |
| `pi-workflows` | `main` | 0.17.4 · `63a8b74` | **0.17.6 · `7937df1`** | +16 |
| `deepseek-harness` | `master` | 0.1.6-alpha.2 · `ddefc45` | **0.2.0-rc.2 · `639ed01`** | +2411 |
| `paseo` | `main` | 0.9.0-beta.2 · `d636abd` | **0.11.0-beta.3 · `6c98576`** | +199 |
| `pigo` | `master` | `891d1f3` | **`891d1f3`（已最新）** | 0 |

> “当前版本”优先采用项目自己的 package/release 版本；没有统一 release 版本的仓库以 git SHA 为准。部分仓库的 main HEAD 已包含版本号之后的未发布修复，因此同时保留 SHA。

## 组件更新内容

### 1. pi-dev

**0.86.1 → 1.0.0 + main HEAD，220 commits。**

这次是本轮最重要的升级。

Pi Agent Core 1.0.0 的 breaking change 是：旧的实验性 Harness 能力从 `@earendil-works/pi-agent-core` 移除，包括 `AgentHarness`、session/session storage、durable runtime、pico3、harness tools、compaction、skills、prompt template、telemetry/search 辅助面，以及 `./node`、`./harness/*`、`./experimental/pico3` 子路径。耐久 session 方向转到 `@earendil-works/pi-durable`。Agent Core 本身收缩为 Agent、agent loop、proxy stream 及类型。

Coding Agent 1.0.0 主要增加/调整：

- TUI 默认 fullscreen；需要传统终端滚屏时使用 `tuiMode: "regular"` / `--tui-mode regular`。
- codemode 提示显著瘦身，并补充更可恢复的脚本错误；支持 `models.generateImages()`。
- MCP 成为内建 extension 体系的一部分，补充 OAuth 元数据、issuer 校验、per-server credential、provider token 等机制。
- extension tool API 增强：tool exposure、namespace、output schema、`prepareLoadout()`、`ctx.executeTool()` 等。
- 加入 virtual model、provider stream event；RPC 的 prompt / steer / follow_up 增加输入 disposition 与 streaming 行为。
- session context 进一步 canonical 化；`before_agent_start` 的 system prompt/tool 变更可以作为 transcript-backed 变化跨 resume / branch navigation 保留。
- `agent_before_settle` 成为最终可行动边界，`agent_settled` 是最终通知边界；RPC 增加 queue clearing 等能力。
- 1.0.0 后 main 又包含 OAuth 登录 URL copy、依赖安全 pin，以及最新的 provider “Selected model is at capacity” 自动重试修复。

### 2. agent-tools

**0.1.0 · `4b1b977` → 0.1.0 · `894ceca`，1 commit。**

本次只有一个聚焦修复：`job-poller` 防止 stale poller turn 继续触发，补了对应测试。版本号未变，但 gitlink 需要前进。

### 3. herdr-pi-extensions

**`35bbe0f` → `373a8cf`，3 commits。**

- 新增 `pi-anthropic-image-cap` 0.1.0：对 Anthropic 请求中的旧图片做裁剪，行为向 Claude Code 靠拢。
- `pi-minimal-footer` 升到 0.1.13。
- Usage endpoint 请求改用 Claude Code 风格 user-agent。
- footer 相关修订和新 extension 都纳入新的仓库尖点。

### 4. pi-context

**2.2.0 · `3479721`，无更新。**

当前 `pi_squad_dev` 已经锁在上游 `main` 最新提交，不改 gitlink。

### 5. pi-intercom

**0.13.0 → 0.16.0，33 commits。**

对我们多 Agent / Herdr 方向直接相关：

- 0.14：新增 CLI `list/send/ask`；支持 `busyDelivery: "human-first"`；增加固定 session identity 事件；list 展示 Herdr workspace/tab/pane；修复 compaction 期间消息丢失。
- 0.15：支持通过 Herdr saved machines + SSH 使用 `name@machine` / UUID 跨机器单向发送；远端 broker 仍保持 local-only，并明确跨机器 provenance。
- 0.16：增加 `/handover <target> [next task]`、handover picker 与 Alt+M 快捷交接；支持跨机器 handover；修复 Windows broker 与 Herdr project pane 启动问题。

这说明 Intercom 已从“本机 session 消息”继续向“显式身份 + CLI + 跨 Herdr 机器 + 上下文交接”演进，和 Pi Squad 后续 Messaging / Invocation 的参考价值进一步提高。

### 6. pi-subagents

**0.70.0 → 0.74.0 + main 未发布修复，151 commits。**

0.74.0 的主要变化：

- **Breaking：** workflow script 改为回复中的 ```js workflow``` 代码块 + `workflow: true`，移除 `workflowScript` / `workflowScriptPath`。
- 新增 `disabledFeatures`，可以裁掉不用的 subagent tool 能力，显著缩小 tool schema。
- 对不支持 mid-conversation tool add 的模型改进 tool activation，避免重新处理整个上下文。
- 内建 MCP / codemode 与 subagent 选择进一步打通。
- 子 Agent 遵循父 session 的 project trust。
- `/reload`、resume、project switch 不再直接杀掉后台 workflow，恢复时可复用已完成 child。

main 在 0.74.0 之后还包含：

- **Pi 1.0 兼容修复：** background subagent 不再假设 `@earendil-works/pi-agent-core/node` 存在。
- virtual model child 注册/验证修复。
- host 可要求 child extensions 对所有 runner 都是强制条件，启动失败时 fail closed。
- Claude Code adapter 支持按 child 指定 model / thinking level。
- Windows npm 安装的 Claude/Codex/Cursor CLI 可安全作为 external runner 启动。
- async run history、原子保存 builtin agent override 等可靠性修复。

### 7. pi-trace-extension

**0.1.16 · `5441bcc`，无更新。**

当前 gitlink 已是上游 `main` 尖点。

### 8. pi-workflows

**0.17.4 → 0.17.6，16 commits。**

- 0.17.5：强化 sleep/wake recovery。Workflow server 在机器休眠后可恢复 lease；takeover 增加 serving probe + epoch fencing；socket/lock 竞争恢复更稳；客户端在启动窗口内做有界重拉起。
- 0.17.6：修复某些 transport 把结构化 tool 参数传成 JSON 文本时造成 runner 已创建后崩溃的问题；只对 `{` / `[` 开头的可解析结构值做转换，普通字符串保持原样。

对于我们当前的 durable execution / recovery 对照，这两版都值得继续参考。

### 9. deepseek-harness

**0.1.6-alpha.2 → 0.2.0-rc.2，2411 commits。**

这是一次非常大的 developer-preview 跨版本更新。

当前 0.2.0-rc.2 重点包括：

- macOS / Windows Desktop 可管理并安装 `dsh` 命令与插件，不要求单独装 Node/pnpm。
- 插件管理、模型选择、桌面/文件体验持续重构。
- 修复 plan review、PowerShell completion/exit-code、图形启动时 login-shell 环境等。
- 模型目录兼容层前进，并加入实验性的异步问答模式。
- 0.2 系列还整合了 terminal/sidebar、headless session、后台任务、automation/plugin 等能力。

该仓库仍明确属于 developer preview，兼容性 breaking change 仍是预期行为，因此这里只做源码跟踪，不把它当稳定协议依赖。

### 10. paseo

**0.9.0-beta.2 → 0.11.0-beta.3，199 commits。**

主要变化：

- 新增 Muse Code、Antigravity 等 provider；OMP 增加 mid-turn steering、Fast/Auto thinking、MCP schedule/Hub 支持。
- 新增 Usage 体系，可从 Codex CLI、OpenCode、Pi、OMP、Claude Code/keychain 等发现订阅登录与额度窗口。
- Plugin SDK 增强 sidebar/header/footer screen、provider command/env override，以及 `activeTurnBehavior`。
- 修复 Pi 0.99 MCP server 接入、pi-subagents 运行中 transcript/分组完成状态等。
- 0.11.0-beta.3 将 Usage source plugin API 从 `identify()` 调整为 `discover()` + `fetch()`，并强化登录失效/拒绝时的状态展示。

对我们“上层多 Harness 控制面 / Agent 生命周期 / provider adapter”的研究，Paseo 仍是高价值参考。

### 11. pigo

**`891d1f3`，无更新。**

上游 `master` 没有新的 commit；继续作为 Go Runtime / Agent loop 对照基线。

## 对 Pi Squad 阶段 04 的影响

### 已确认的静态结论

1. 当前 Pi Squad extension 关键路径继续使用 `@earendil-works/pi-coding-agent` 的 `ExtensionAPI`、`ExtensionContext`、`truncateHead`，以及 `@earendil-works/pi-ai` 的 `StringEnum`；Pi 1.0 的 Coding Agent extension 公共面仍保留这些能力。
2. 当前 Squad 依赖的 `before_agent_start`、`session_start`、`session_shutdown`、`ui_prompt_start/end`、`agent_before_settle`、`agent_settled` 等生命周期事件仍在 Pi 1.0。
3. 当前抽查的 Squad extension 关键文件没有直接依赖这次被 1.0 删除的 `pi-agent-core/node` / `harness/*` 子路径。
4. `pi-subagents` 最新 main 已专门补了 Pi 1.0 对 `pi-agent-core/node` 移除的兼容修复，因此同步 subagents 和 Pi 本体必须一起做，不能只升 Pi。

### 需要重新回归的点

1. **生命周期时序：** 阶段 04 大量依赖 `agent_before_settle` / `agent_settled`、session 切换、compaction 和 input injection，Pi 1.0 的 canonical session / boundary 行为变化较大，必须跑真实 Pi 回归。
2. **System Prompt 组装：** 当前 Squad 在 `before_agent_start` 里修改 `event.systemPromptOptions.sections`。Pi 1.0 仍支持该机制，但变更现在具有 transcript-backed 语义，要检查 resume、branch、/new、/reload 的旧上下文隔离。
3. **TUI：** 1.0 默认 fullscreen。依赖 Herdr pane 滚屏取证的验收，如果需要旧式 scrollback，应显式使用 `--tui-mode regular`。
4. **`--no-extensions`：** Pi 1.0 中它也会禁用 built-in extensions。现有验收命令 `pi --no-extensions -e pi_squad/extension/index.ts` 会得到“仅显式 Squad extension + 无 built-in extension”的环境；这是一个需要在验收报告中明确的环境差异。
5. **Harness 文档：** 旧 Wiki 中把 `pi-agent-core` 的 AgentHarness / durable session 当当前实现的材料需要重新标注；1.0 后耐久方向应转看 `pi-durable`。

**结论：本提交完成“源码基线升级”，不等同于“阶段 04 已兼容 Pi 1.0”。后者应作为下一轮真实 Pi 集成验收。**

## 更新后的 gitlink

```text
pi-dev                 3874b3e98983c70fa05fa193b675d42cfcb8b9f8
agent-tools             894ceca4a156465983b96c5b86440525f93b2aa9
herdr-pi-extensions     373a8cf735e66792dae8b096bc62f8d5cf7693a8
pi-context              34797213820e4f005160fa6148fe6a9e27400219
pi-intercom             924917f189f5cf5f55ec8bc5be21ded99d252200
pi-subagents            69a830c0057c0703a9082f95f2c692b217d33c4c
pi-trace-extension      5441bcca041e3b3a203aee91c68e8ea809e6aa27
pi-workflows            7937df1a6b4f12bfce2e7ada2842d5556dd95f72
deepseek-harness        639ed015397290b3745d163aafe02ffee4aa3f84
paseo                   6c985769beb689aa2b95c4a5955a3383d2c015a9
pigo                    891d1f372cefa92b5f5a104db20521238ba5a9fe
```

## 拉取该基线

```bash
git switch pi_squad_dev
git pull
git submodule sync --recursive
git submodule update --init --recursive
```

这样本地 submodule 工作树才会落到本次 overlay 锁定的 commit。
