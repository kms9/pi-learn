---
title: 2026-10-04 Pi Squad 阶段 04 代码审核与评估
type: session
status: active
created: 2026-10-04
updated: 2026-10-04
tags:
  - project-wiki
  - session
  - pi-squad
  - phase-04
---

# 2026-10-04 Pi Squad 阶段 04 代码审核与评估

## 用户要做什么

对照 `pi_squad_case/` 的需求（以阶段 04 `TEAM_RUNTIME_REQUIREMENTS.md` 为准）审核 `pi_squad/` 当前实现，给出评估。

## 达成了什么

审核基于 `pi_squad_dev@c0214d5`，只读，没有修改产品代码。

### 构建与测试

- `go build ./...`、`go build -tags pisquad_integration ./...`、`go vet ./...` 通过；按 `/tmp/pi-squad-compat-typecheck.json` 跑 `tsc` 通过。
- `go test ./...`：`client.TestListAndGet` 失败（测试仍用非 UUID v4 的 runtime_id，生产校验已收紧）。
- 阶段 04 核心包 `scheduler`、`task`、`project`、`projection` 没有任何 Go 测试。
- `npm test`：3 个测试文件无法加载，`extension/inbox-stream.ts` 使用 Node 去类型模式不支持的构造函数参数属性；Pi 运行时加载器不受影响。
- 89/89 PASS 的逐项矩阵、`integration/RESULT.md` 和 372M 证据都在 git ignore 的 `integration/` 下；仓库内只有 `IMPLEMENTATION.md` 等文字声明，克隆后无法复核。

### 结构与覆盖

需求 TR-01—TR-18 在代码中都有对应入口，模块划分符合 TR-18（扩展 team-roster / handoff-input / squad-commands / invocation / execution-gate / context-assembly 分离，Go 侧 project / task / scheduler / projection 分包）。做得扎实的部分：

- Run 准入在单事务内整体占用 roster（`scheduler/runs.go` `admitRuns`），queued Run 不持资源，跨 Team 相交者按 `queue_seq` 先来先准入。
- 注入链分段确认：`dispatch_intent → adapter_received → injection_requested → input_observed → result_proposed → settled`，epoch / segment / fencing / binding 全部 CAS；未知注入只隔离不重放（`scheduler/execution.go`）。
- Controller 重启把未释放 Run 标 `recovery_hold`、未释放 Attempt 标 `needs_review`，已受理未派发的 standalone Task 也拦住（`scheduler/service.go` `New`）。
- 幂等表按 source + operation + request_id + payload hash；被拒的管理操作单独写审计。
- 正式执行期间工具 gate 拒绝 bash、`.agents/`、`.git`、`AGENTS.md`、嵌套 Project 和 write_set 外写入（`extension/execution-gate.ts`）。

### 主要问题（按影响排序）

1. **固定 120 秒截止会中止真实任务。** `baseTask` 与派发受理处把 `deadline_at` 写死为受理后 120 秒，没有配置项；续接、yield 等待、排队期间都不延长（`scheduler/runs.go`、`scheduler/dispatch.go`）。`expire()` 到期即 `interruptAgent`，扩展轮询看到 interrupted 后调用 `ctx.abort()`（`extension/invocation.ts` `poll`）。结果是：执行超过 2 分钟的正式任务、等待子任务超过 2 分钟的父任务、在同 Agent 队列里排队超过 2 分钟的任务都会被中断并把 Run 置 `recovery_hold`。本地 `integration/RESULT.md` 记录了多次 Leader 长上下文与父子链因 `deadline` 失败、改小夹具后才通过。需求把 120 秒定为“观察预算，不是 SLA”，实现却把它变成了硬执行上限。
2. **父任务可以不 yield 直接完成，子任务永久卡住。** `agent_invoke` 给父任务追加 `execution_completed` 依赖，但 `result_proposed` / `settled` 不检查未完成的子依赖（`scheduler/execution.go`）。父完成后其 Attempt 不再是 `suspended`，子任务每轮都得到 `parent_yield` blocker；standalone 中成为孤儿并占用目标 32 项队列，Team 中最终 Gate 永远 `GATE_NOT_READY`，只能人工 cancel。“调用后 yield”只写在 prompt（`extension/context-assembly.ts`）。
3. **空闲的 Squad Pi 模型可读 operator 凭据。** Pi 内的用户管理命令直接读取 `.runtime/operator.token`（`extension/project.ts` `readOperatorToken`）。无正式任务时 gate 只拦带 `path`/`file_path` 参数的工具，bash 不受限，模型可以 `cat` 该文件后以 operator 身份调用 accept / cancel / promote。需求排除了“同 OS 用户的任意恶意进程”，但 TR-17 要求模型凭据不能用于管理、受管工具拒绝凭据文件，这条路径与其意图冲突。
4. **checker 注册表只有验收夹具。** 生产代码里只注册 `numbers-count/sum/stats`（`scheduler/acceptance.go` `check`），`acceptance_policy.mode=checker` 对真实项目不可用，实际只能走 review 或 human。
5. **Leader 会话持续膨胀。** 每次任务完成都生成新的 LeaderStep，把完整 TaskContract JSON 与 briefing 注入同一个 Leader 会话；验收中出现 88% 上下文和 11 万 token 自动压缩，叠加第 1 条就会触发 deadline。
6. **调度每 500ms 全表扫描。** `Tick` 在一个写事务内多次 `readTasks` 全表反序列化，`cancelTask` 递归时每层再读全表；任务历史从不归档，长期使用后会拖慢并长时间持有 SQLite 写锁。
7. **文档漂移。** `pi_squad/controller/AGENTS.md` 仍保留旧默认值表（18741 端口、`pi_squad.sqlite`）与“阶段 04 目标变更（未实现）”；`pi_squad/AGENTS.md` 仍按 `.agents/roles` 与 `PI_SQUAD_CONTROLLER_URL` 描述检查；`pi_squad_case/ACCEPTANCE.md` 写 89 项 NOT_RUN；需求 TR-13 仍写“以下为目标接口，尚未实现”。

次要：operator 请求附带的 `X-Pi-Squad-Binding` 不与已注册实例核对，审计里的 `user_command@pi` 来源可被本地 CLI 伪造（`httpapi/team.go` `principal`）；`agent_task_get` 可读任意 Task。

### 评估

功能覆盖完整，正确性设计（事务、fencing、恢复门、幂等）是这个实现最强的部分，“89/89 PASS”在小夹具与 TUI 1.0.1 范围内可信。但第 1、2 条使它还不适合日常真实任务：任何超过 2 分钟的工作都会被中断，模型漏掉一次 yield 就会让 Run 卡死。阶段 04 的“通过”应理解为协议与恢复语义在受控夹具上成立，不等于可用于实际开发流程。

## 写回了哪些 wiki 页

- 页面: 本页；[[questions/open-questions|开放问题]] Q25、Q26；[[sessions/_index|会话索引]]；`docs/index.md`；`docs/log.md`。

## 未决

- 问题: Q25 正式任务截止时间是否改为可配置并在续接/排队时重算；Q26 父任务存在未完成子依赖时，是拒绝结果还是取消孤儿子任务。

## 相关页面

- 前序: [[sessions/2026-10-04-pi-squad-phase04-continuation|2026-10-04 阶段 04 继续实施与验收]]
- 需求: `pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md`
- 使用说明: `pi_squad/USAGE.md`
