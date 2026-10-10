# Pi Squad

Pi Squad 是本地多角色 Pi 协作插件，由 **Pi coding-agent Extension + Go Controller** 组成。每个 Pi 使用固定的 Leader 或 Role 身份；Controller 负责 Team/Run 调度、正式任务、执行许可、结果验收和恢复。用户自行启动 Pi，插件通过 HTTP/JSON 与 SSE 协作。

配置、安装和操作的完整入口是 [USAGE.md](USAGE.md)。

## 当前状态

当前实现为 **Project runtime v2**，协议为 `pi-squad/2`，配置位于项目的 `.agents/pisquad/`。本地 Pi package 版本为 `0.1.0`，`private: true`，通过本地路径安装或加载。

正式激活仅支持 **Pi 1.1.0 的 TUI 模式**，profile 为 `pi-coding-agent/1.1.0`。其他 Pi 版本以及 RPC/JSON/print 模式在注册前拒绝激活 Squad；未设置启动身份时保持普通 Pi。实际运行版本以所选 `pi --version` 为准。

2026-10-09 已切换正式激活 profile 到 1.1.0，支持官方 managed 安装诊断与取消标记；[1.1.0 验收](../pi_squad_case/04-team-orchestration/compatibility/pi-1.1.0/README.md)正在进行。

截至 2026-10-04，阶段 04 已记录 **89/89 项通过**（4a 71 项、4b 18 项），对应 OpenSpec 已同步并归档。该结论来自 Pi 1.0.1/TUI、`local-grok/grok-4.7` 的真实集成场景；额外 provider、独立 native binary 等兼容分支仍有未覆盖项，见 [阶段 04](../pi_squad_case/04-team-orchestration/README.md) 和 [Pi 兼容覆盖范围](../pi_squad_case/04-team-orchestration/compatibility/README.md)。

## 已实现的能力

| 能力 | 当前行为 |
|---|---|
| Project 与身份 | 向上发现最近 Project；稳定 Agent ID、进程 runtime、会话 binding 分离；Role 的 Primary/Secondary 与 Team Leader 显式管理 |
| Team 编排 | Run 原子占用整个 roster；同 Team 单活跃 Run，相交 Team FIFO 排队；不相交 Team 可并行 |
| 正式任务 | Task/Attempt/segment 状态机；Workflow DAG、异步 child invocation、yield 续接、受限 clarification 与受管 ask |
| 结果验收 | 区分执行完成与业务验收；结构化结果、精确版本 refs、文件 artifact 校验；review、内置数字 checker、standalone human acceptance |
| 执行控制 | Leader 专用协调工具，Worker 受管文件工具；按绑定、epoch、segment、fence 和 lease 检查权限；成功收尾等待真实 settled |
| 显式恢复 | cancel/amend/reconcile/recover/retry/rebind/resume；未知注入保持隔离，重启后由操作者对账和授权 |
| Pi 操作 | `/squad` 命令、行首 `@Role` handoff、`/pisquad-use` 草稿选择、Pi Dashboard 与管理预览 |
| 消息与观察 | passive notice/reply、身份查询、只读 Go Dashboard、snapshot/SSE 重连与刷新 |
| 能力诊断 | `controller doctor/schema`、实际宿主身份检查、脱敏的当前请求与有序事件探针 |

## 开始使用

1. 准备 Pi 1.1.0、Node >=22.19.0 和 Go 1.27.0，安装依赖并构建 Controller。
2. 在工作项目创建 `.agents/pisquad/roles/` 与 `teams/` 配置。
3. 在该项目 cwd 分别启动 Controller、Team Leader、各成员 Role 的 Pi，以及独立 Dashboard。
4. 使用 `/squad whoami` 核对身份，通过 `/squad run <team_id> <goal>` 创建 Run，使用 `/squad status` 和 Dashboard 观察。

[USAGE.md](USAGE.md) 提供完整三角色示例、所有配置字段、启动命令和恢复步骤。Controller 不代用户启动 Pi，不自动清理历史或切换会话；正式任务中的 bash 与未受管工具尚未开放。

## 当前使用限制

- 正式 Task 在受理后有固定 **120 秒硬截止**，排队、执行和子任务等待共用该预算，目前没有配置项。长任务需要先拆分；超时进入中断与恢复流程。
- Worker 创建 child 后应调用 `agent_task_yield`，等待续接再完成父任务；当前实现不能安全处理“存在未完成 child 但父直接完成”，可能留下阻塞任务。
- Team 的 checker 目前仅有 `numbers-count/numbers-sum/numbers-stats`；一般项目使用独立 reviewer。standalone 默认由操作者验收。
- 工具 gate 约束正式片段；空闲 Role Pi 仍可使用普通 Pi 工具和 shell。同 OS 用户进程能够访问本地凭据，不能把当前插件视为进程级安全沙箱。

这些边界及日常处理方式见 [USAGE.md](USAGE.md)。

## 实现导航

| 路径 | 职责 |
|---|---|
| [extension/index.ts](extension/index.ts)、[team-extension.ts](extension/team-extension.ts) | Pi package 入口与模块装配 |
| [extension/invocation.ts](extension/invocation.ts)、[execution-gate.ts](extension/execution-gate.ts) | 宿主生命周期、注册、派发、输入隔离、工具许可与收尾 |
| [extension/squad-commands.ts](extension/squad-commands.ts)、[task-tools.ts](extension/task-tools.ts) | 用户命令、模型 Task/Leader 工具 |
| [extension/dashboard.ts](extension/dashboard.ts)、[team-roster.ts](extension/team-roster.ts) | Pi 原生 Dashboard、角色补全与 Picker |
| [controller/project/](controller/project/) | Project 发现、严格配置、运行锁、迁移与能力诊断 |
| [controller/task/](controller/task/)、[scheduler/](controller/scheduler/) | 持久状态、容量、准入、依赖、验收和恢复 |
| [controller/httpapi/](controller/httpapi/)、[projection/](controller/projection/)、[cli/](controller/cli/) | HTTP 适配、权威投影、操作命令和 Go TUI |
| [protocol/README.md](protocol/README.md)、[protocol-v2.schema.json](protocol/protocol-v2.schema.json) | HTTP 契约及 `controller schema` 导出的结构 |

## 规格与验收

- [阶段 04 需求与验收](../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md)
- [技术设计](../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_DESIGN.md)与[实现对应表](../pi_squad_case/04-team-orchestration/IMPLEMENTATION.md)
- [当前 OpenSpec 主规格](../openspec/specs/)与[阶段 04 归档](../openspec/changes/archive/2026-10-04-pi-squad-team-orchestration/)

阶段验收仍以 `pi_squad_case/` 为准。`integration/` 的运行夹具与大量证据在本工作区保留，但被 Git 忽略；新克隆可按 USAGE 的完整示例配置插件，不依赖该目录。
