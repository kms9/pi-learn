---
title: 阶段 00｜身份与协议：一个 Pi 可被准确识别
status: draft
type: process
requirements: confirmed
implementation_status: not_implemented
acceptance_status: not_run
updated: 2026-09-21
---

# 阶段 00｜身份与协议：一个 Pi 可被准确识别

## 1. 最终目标与本阶段验证点

最终目标：在 macOS、单机同用户环境中，用户手动启动多个 Pi，通过对话发现、联系和调用在线 Agent，进一步调用固定成员小队；任务进入目标既有会话，记录可恢复，故障可识别，续跑由用户决定。Herdr 仅在最后增加位置展示与观察，不参与 Agent 身份或前置通信。

本阶段只验证：**一个用户创建的 Agent 身份，能被一个手动启动的 Pi 持有；改名、`/new`、退出重开都不会产生身份混淆。** 交付一个最小 Go 服务、Go CLI 和必要的 TS Pi 扩展，而不是只交付 JSON 类型定义。

用户里程碑：创建 `reviewer` → 手动启动 Pi → `/squad whoami` 看见身份 → `/new` 后验证身份不变、会话变化 → 退出重开验证运行实例变化。

## 2. 需求边界

| 编号 | 必须满足 |
|---|---|
| ID-R01 | `agent_id` 独立生成并持久化，不由 alias、PID、目录、Pi session 或 Herdr 位置拼接。 |
| ID-R02 | 一个 `agent_id` 同时只允许一个活动运行实例；第二个实例失败，不抢占第一个。 |
| ID-R03 | `runtime_id` 表示一次 Pi 进程运行；`session_id` 表示当前 Pi 会话；重连另有连接代次。 |
| ID-R04 | `/new` 是新建 Pi 会话，不是重启进程；不得自动恢复旧聊天或重新投递旧会话的工作。 |
| ID-R05 | 只接纳主动加载扩展并持有本地配置的 Pi；不扫描、启动、终止或接管其他 Pi。 |
| ID-R06 | 本阶段不发送业务消息、不执行任务、不创建小队、不依赖 Herdr。 |

alias 是可修改、实验空间内唯一的便捷名称；协议中持久引用使用完整 `agent_id`。重复 alias 拒绝，短 ID 仅用于显示，不能凭前缀自动选中目标。

## 3. 身份模型与协议决策

| 字段 | 生成者与寿命 |
|---|---|
| `agent_id` | Go CLI 创建 UUID；存本地 Agent 配置；重开 Pi、`/new`、改名后保持。 |
| `runtime_id` | TS 扩展首次在本 Pi 进程加载时创建 UUID；存进程级 `globalThis[Symbol.for(...)]`，`/reload` 不重新生成；退出重开才变化。 |
| `session_id` | 从 `ctx.sessionManager.getSessionId()` 读取；`/new`、resume、fork 按真实 Pi 值更新。 |
| `binding_epoch` | Go 在运行实例或当前会话绑定变化时递增，持久化；旧消息、任务与回包必须校验它。 |
| `connection_epoch` | Go 在每次握手后发放；旧连接写入一律拒绝。 |
| `daemon_epoch` | Go 服务每次启动变化，区分服务重启前后的在线快照。 |
| `alias/cwd/model/location` | 属性；`location` 在阶段 00—04 为 null，不影响寻址。 |

线上绑定是 `(agent_id, runtime_id, session_id, binding_epoch)`，连接鉴权另校验 `connection_epoch`。PID 只用于诊断，不能证明身份。

**技术栈：Go 实现配置、鉴权、协议、存储和 CLI；TS 只读取 Pi 状态、注册命令/工具、接入事件和发送本地 IPC。** 不直接运行 pi-intercom broker，不引入 Node 服务或 Go 之外的业务控制面。

传输固定为本地 Unix domain socket 上的 **4 字节大端长度 + UTF-8 JSON**；最大单帧 1 MiB、正文默认上限 64 KiB。使用独立协议名 `pi-squad-local`、版本 `1`，不宣称与 Pi RPC、Intercom 或 Herdr wire protocol 兼容。

```json
{
  "protocol": "pi-squad-local", "version": 1,
  "kind": "request", "request_id": "req_uuid",
  "method": "identity.whoami",
  "binding": {"agent_id":"agt_uuid","runtime_id":"run_uuid","session_id":"pi_uuid","binding_epoch":1},
  "payload": {}
}
```

响应保留 `request_id`，成功返回 `result`，失败返回 `error.code/message/retryable`。请求身份取自已认证连接，不能相信 payload 自报的 `from`。`hello` 协商版本及能力；不支持的版本/能力明确失败，不降级为终端注入。

## 4. 存储、安全与生命周期

实验状态放在 `SQUAD_HOME`，推荐短路径 `$HOME/.psq/00`；socket 为 `$SQUAD_HOME/s.sock`，doctor 拒绝超过平台可用长度的路径。目录权限 0700，socket、SQLite、token、配置权限 0600；拒绝符号链接替换关键文件。

Go 独占写 SQLite，使用事务；模型调用或 socket 写入不放在长事务内。起步表为 `agents`、`runtime_bindings`、`audit_events`、`request_results`；配置生成用临时文件＋原子 rename。数据库及 token 不提交 Git。Go SQLite driver、Go/Node 版本在首次实现时写入锁文件和验收记录，不在文档中冒充已经安装或通过兼容测试。

`agent init` 创建每个 Agent 的本地 join token，CLI 使用独立 operator token；Go 只接受 token 对应的 Agent。此措施防配置串线，不是同用户恶意进程的安全隔离；不声称有文件系统 sandbox。

服务必须取得实验空间的独占锁，第二个服务拒绝启动，不能先 unlink 一个可能仍在使用的 socket。客户端可自动重连服务，但**重连不等于自动执行任何工作，更不等于启动 Pi**。

TS 订阅 `session_start`、`session_shutdown`、`session_before_switch`、`session_before_fork`、`agent_start`、`agent_settled`。所有异步回调携带本地 generation；旧 generation 回调不写新会话。`session_shutdown` 可能由 new/reload/resume/fork 引起，不能一概当作进程退出。后续阶段统一复用此约束。

## 5. 实施路径与文件布局（待实现）

根目录使用一个 Go module 和一套 TS 依赖锁，六阶段各有入口，后阶段复用前阶段的 `pkg/`，不复制整份系统。根 module 建议 `github.com/kms9/pi-learn/pi_squad_case`。

| 文件路径（相对本阶段） | 应实现的逻辑 |
|---|---|
| `cmd/squad/main.go` | `init`、`agent init`、`agent rename`、`daemon serve`、`doctor`、`identity show`、`lab protocol-check`。 |
| `pkg/protocol/{frame,envelope,errors}.go` | `ReadFrame/WriteFrame`、严格长度/UTF-8/版本校验、统一错误码。 |
| `pkg/identity/{profile,binding}.go` | 创建身份、唯一 alias、单活动实例、绑定代次、重连 fencing。 |
| `pkg/store/{sqlite,migrations}.go` | 事务、审计记录、幂等请求结果；记录 schema_version。 |
| `pkg/daemon/server.go` | UDS listener、握手、认证、连接清理；不出现 Pi spawn/kill。 |
| `extension/{index,identity,transport}.ts` | `createPiAdapter()`、进程级 runtime_id、命令、Pi 生命周期、IPC 客户端。 |
| `tests/` | Go frame/identity 测试，TS 生命周期测试，Go↔TS golden fixtures。 |

实施顺序：先完成 profile CLI 和服务独占锁；再完成 Go↔TS framing 与错误响应；接入单 Pi `whoami`；最后做 `/new`、reload、重复身份、服务重启和异常帧。每一步都运行对应用户验收，未通过不接入多 Agent 发现。

## 6. 用户操作流程（实现后执行，不是现有命令）

先完成本阶段代码及根 `go.mod/package.json`；下列 `squad` 和 `/squad` 均为拟实现接口。本轮只交付设计文档。

```bash
# 在 pi_squad_case 根目录
export CASE="$PWD"
export SQUAD_HOME="$HOME/.psq/00"
mkdir -p .local/bin
npm ci
go build -o .local/bin/squad ./00-identity-protocol/cmd/squad
export PATH="$CASE/.local/bin:$PATH"
squad init
squad agent init --alias reviewer
squad doctor
squad daemon serve       # 保持该终端打开；Ctrl+C 只停止控制面
```

在另一个终端设置同样的 `CASE/SQUAD_HOME`，由用户亲自运行：

```bash
SQUAD_AGENT_CONFIG="$SQUAD_HOME/agents/reviewer.json" \
  pi --no-extensions -e "$CASE/00-identity-protocol/extension/index.ts"
```

Pi 内输入 `/squad whoami`，记录完整 `agent_id/runtime_id/session_id/binding_epoch`；输入 `/new`，再次执行；然后退出 Pi，使用同一配置重新启动，再次核对。不要修改全局 Pi 安装、自动同步 submodule 或加载第二套通信扩展。

## 7. 用户验收标准

| 用例 | 用户操作 | 通过标准；失败判据 |
|---|---|---|
| ID-01 单 Pi 身份 | 按上面创建 reviewer 并执行 whoami。 | Pi 和 `squad identity show reviewer` 的完整 ID 相同；缺字段或 PID 充当 ID 为失败。 |
| ID-02 `/new` | 记录身份后执行 `/new` 再 whoami。 | agent_id、runtime_id 不变；session_id 变化，binding_epoch 增加；不得退出 Pi 进程。 |
| ID-03 退出重开 | 退出 Pi，重新运行同一启动命令。 | agent_id 不变、runtime_id 变化；session_id 按新建/手动 resume 的真实结果显示，不强制假定。 |
| ID-04 重复实例 | reviewer 在线时在第三个终端使用同一配置启动。 | 第二个收到 `AGENT_ALREADY_ONLINE`，第一个仍可 whoami；不抢占或 kill 任一 Pi。 |
| ID-05 改名 | CLI 执行 `squad agent rename reviewer auditor`。 | agent_id 不变；配置原文件路径仍有效，内容及显示 alias 更新；与已有 alias 冲突时拒绝。 |
| ID-06 `/reload` | Pi 执行 `/reload`。 | runtime_id 和 session_id 不变，允许 connection_epoch 变化；无重复定时器、命令或注册记录。 |
| ID-07 服务重启 | Ctrl+C 停 Go，观察 Pi，再手动开同一服务。 | Pi 不退出；先显示 disconnected，再重连；身份记录保留，不增加 Pi 进程。 |
| ID-08 非兼容/异常帧 | `squad lab protocol-check --cases version,oversize,partial,utf8,duplicate-id`。 | 输出逐项 PASS；异常连接关闭，服务可继续接收正常 whoami；不得 OOM/崩溃。 |
| ID-09 独占与权限 | 保持服务在线，再运行第二份；运行 doctor。 | 第二服务拒绝，不破坏首个 socket；权限检查通过；token 不进入输出或审计导出。 |

数字门槛是本实验的验收目标，不是上游性能承诺。正常本地 whoami 在 2 秒内返回；版本/长度等错误 2 秒内可见。异常帧测试属于模拟客户端检查，不能替代 ID-01—07 的真实 Pi 操作。

## 8. 源码参考与明确差异

固定版本见 [总源码索引](../SOURCES.md)。以下是已读源码，不是待猜测的路径。

| 来源 | 文件与符号 | 借鉴／不照搬 |
|---|---|---|
| Pi `890f920…` | `packages/coding-agent/src/core/extensions/types.ts`：`ExtensionContext`、`SessionStartEvent`、`SessionShutdownEvent`、`ExtensionAPI`。 | 获取真实 session、处理生命周期；`ctx.abort()` 是 context 方法，不能照搬 bridge 中的强制类型转换。 |
| Pi 同版 | `packages/coding-agent/package.json`：0.86.1、Node `>=22.19.0`；`src/cli/args.ts`：`--no-extensions/-e`。 | 固定测试目标；不假定用户全局 `pi` 已是该版本。 |
| Intercom `199279a…` | `broker/framing.ts`：`writeMessage/createMessageReader`。 | 参考长度前缀、分片重组、上限；Go 重写，协议名另定。 |
| Intercom 同版 | `broker/protocol.ts`：`isSessionRegistration/isMessage`；`broker/client.ts`：`IntercomClient`。 | 校验及存活探测；我们的长期 agent_id 不直接等同 Intercom session ID。 |
| Subagents `678f842…` | `src/runs/shared/herdr-pi-protocol.ts`：`HerdrPiFrameDecoder`。 | 对照校验思路；其 wire 是 JSONL，不与本实验 framing 混用；不引入 Herdr/SSH。 |

## 9. 退出门槛、证据与回退

ID-01—09 全部通过，保存终端记录、前后身份 JSON、doctor 输出、依赖版本和本次代码 SHA，填写 [验收记录模板](../ACCEPTANCE.md)。本次状态为 **NOT RUN**。只完成静态类型检查不能宣告阶段通过。

回退：退出实验 Pi、停止实验 Go 服务，恢复到上一个已通过的 Git commit；保留并备份当前 `SQUAD_HOME`，换新空目录复测。不要删除全局 `~/.pi`、用户项目或上游 submodule。下一阶段复用协议与身份，不重新设计 ID。
