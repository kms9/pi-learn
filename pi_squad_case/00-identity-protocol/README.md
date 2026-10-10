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
| ID-R02 | 一个 `agent_id` 同时只允许一个身份持有人；失租、断线、服务重启不释放占用。第二个 runtime 失败，直到原实例正常认证退出或用户显式释放。 |
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
| `binding_epoch` | Go 在实际会话变化、失租后重新握手、服务重启后重新绑定、释放时递增并持久化；纯连接更换且租约仍有效时不增加。 |
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

Extension factory 只注册声明；后台 IPC 在 `session_start` 建立并在 shutdown 对称清理。TS 订阅 `session_start`、`session_shutdown`、`session_before_switch`、`session_before_fork`、`agent_start`、`agent_settled`。所有异步回调携带本地 generation；旧 generation 回调不写新会话。`session_shutdown` 可能由 new/reload/resume/fork 引起，不能一概当作进程退出。后续阶段统一复用此约束。`session_before_switch/fork` 可被取消，只准备而不提交换绑；实际 `session_start` 读取真实 session_id 再提交。取消不得永久暂停当前会话。

## 5. 实施路径与文件布局（待实现）

根目录使用一个 Go module 和一套 TS 依赖锁，六阶段各有入口，后阶段复用前阶段的 `pkg/`，不复制整份系统。根 module 建议 `github.com/kms9/pi-learn/pi_squad_case`。

| 文件路径（相对本阶段） | 应实现的逻辑 |
|---|---|
| `cmd/squad/main.go` | `init`、`agent init`、`agent rename`、operator-only `agent release`、`daemon serve`、`doctor`、`identity show`、`lab protocol-check`。 |
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
| ID-06 `/reload` | 在隔离实验项目的 `.pi/extensions/` 自动发现入口执行 `/reload`，不同时用 `-e` 双载。 | runtime_id 和 session_id 不变；租约有效时 binding_epoch 不变，失租重绑则递增；允许 connection_epoch 变化；无重复定时器、命令或注册记录。 |
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


## 10. 2026-09-21 评审补充合同

用户已裁决：旧 Pi 失租但仍存在时，继续拒绝新 runtime，待用户确认旧 Pi 退出或显式释放。完整协商及实施顺序见 [三方评审](../../docs/sessions/2026-09-21-pi-squad-00-01-review.md)。本节细化前文，不代表功能已实现。

- 将持久身份占用 `ownership` 与在线 `lease` 分离。00 就实现最小租约与重连，01 复用 2/6/10 秒阈值。socket EOF 立即显示 offline，但未知断线不释放占用；daemon 重启清在线租约、保留所有者与撤销记录。
- 同 runtime 重连需 join token 与进程级连续性 secret；secret 只放 `globalThis`，Go 仅持久化校验摘要，不记录原值。新连接原子替换 connection_epoch，废除旧连接；服务重启或失租后重绑增加 binding_epoch。不同 runtime 不得因超时自动占位。
- 正常认证 quit 可以释放；quit 未能提交、异常退出或状态未知时，由用户确认后执行拟实现 `squad agent release <完整agent_id> --expected-runtime <runtime_id> --expected-binding-epoch <n>`。仅 operator token 可用，不给模型注册该工具。事务 CAS 防释放错误持有人；成功后递增 binding_epoch、撤销旧连接及该 runtime 的接入资格并记审计。释放与连续性摘要撤销在同一事务提交。旧 runtime 迟到重连返回 `BINDING_REVOKED`，不能自动夺回身份。释放不 kill Pi，也不证明其本地工作已经停止。
- 同进程 reload 短断 IPC 时立即更新可联系状态，但保留身份占用；逻辑租约仍有效且连续性验证通过时保留 binding_epoch；重绑宽限最晚到最后有效心跳后10秒，不因reload/new重新起算。实际 session_id 变化则递增；失租或 daemon 重启后重新握手同样递增。
- 改名保留原普通配置文件路径。SQLite 是 alias 真源，文件是可修复投影；临时文件+rename 不等于与数据库跨资源原子提交。doctor 修复 alias 不一致，不替换 agent_id/token，不使用符号链接。
- hello 区分 agent/operator 角色并在认证后绑定权限。幂等结果键含 principal、method、request_id；同 ID 不同 payload 明确冲突。持久写与结果在同一事务提交。实现 framing 的读写超时、半帧截止时间、连接与队列上限。
- `/reload` 验收遵循根 AGENTS.md：使用隔离实验项目 `.pi/extensions/` 的单一入口；该流程不用 `--no-extensions`，也不同时 `-e` 加载同一入口。隔离实验配置并核对加载清单，避免第二套通信扩展，不修改全局 Pi 安装。前文 `--no-extensions -e` 保留为快速试跑路径。具体隔离启动命令在实现时验证后补齐，不冒充已运行。

在原 ID-01—09 之外增加下列补充用例（均 NOT_RUN），纳入本阶段退出门槛：

| 用例 | 必须验证 |
|---|---|
| ID-X01 取消会话切换 | 取消 new/resume/fork 后绑定、activity 仍属原会话，无永久暂停；成功切换才更新。 |
| ID-X02 断线与长 reload | 租约内重连只换 connection_epoch；超出租约后同持有人重绑增加 binding_epoch；只有一组监听/定时器。 |
| ID-X03 显式释放 | 暂停 A，B 仍拒绝；operator release 后 B 重试成功；A 恢复被拒绝，不能夺回身份。 |
| ID-X04 释放竞态与重启 | 旧 expected runtime/epoch 的 release 拒绝；daemon 重启保留所有者/撤销记录，旧连接不能写入。 |
| ID-X05 改名中断 | 数据库提交、配置更新中断后可修复 alias；原路径有效，ID/token 不变。 |
| ID-X06 hello 与幂等 | 角色越权拒绝；重复请求返回一致结果，同 ID 异 payload 报冲突；半帧超时不会拖垮服务。 |


## 11. Grok 再评审：重连排序与释放重放（2026-09-21）

下面细化实现合同，不改变用户的占用优先裁决；不能把随机 connection_epoch 当作握手顺序。

- 同 Pi 进程只有一个 `globalThis` 连接管理器。每次尝试捕获 generation 并递增 `connect_seq`；旧 generation 不得再发起握手或重试。客户端同一时刻最多一个 in-flight hello，关闭旧 socket 后才开始新尝试。
- Go 按 `(agent_id, runtime_id)` 持久化已接受的最大 connect_seq。认证与撤销检查通过后，在事务中只接受 `incoming_seq > stored_seq`，将 stored_seq 设为 incoming_seq，再原子替换连接；并列或迟到返回 `STALE_CONNECT`。不能在 incoming_seq 上另加一次1。网络中仍可能有旧hello，单飞不能替代服务器校验。
- hello 成功响应丢失后，原持有人下一次尝试使用更大seq并重新取得连接；不能把旧回包安装为当前连接。connection_epoch仍用UUID做相等校验。connect_seq跨daemon重启保留，原进程计数跨reload保留；计数/凭据丢失不得猜测恢复或绕过占用。
- 旧 connection 的 close/error/timeout清理也必须比较当前 daemon/connection/binding，不能把新连接标offline或清掉新租约。每个身份的握手、换绑和释放必须串行提交；单靠前置检查后异步写库不足以防竞态。
- 认证 quit 和 operator release 使用同一事务CAS撤销原语。quit 绑定预期 runtime_id/binding_epoch，并检查当前 daemon/connection；提交后该runtime终态撤销。adapter进入quit时先禁自动重连；即便响应丢失，也不得自动占回。operator release仍保留人工确认路径。
- 未命中的有效释放请求：CAS、释放、撤销连续性摘要、结果和审计同事务提交。已认证且仍有权限的operator重放相同request_id与payload只返回原结果，不再执行释放；异payload明确报冲突。已撤销runtime的迟到quit/hello直接拒绝，不为返回历史结果重新开放握手；operator可查询审计确认结果。原“重复请求返回一致结果”以前提认证仍有效为限，不能绕过撤销。

补充到现有用例的必测子场景，仍为 NOT_RUN，不增加85项总数：

- ID-X02：两个hello逆序到达、重复seq、成功ACK丢失后重试、旧socket延迟close；新连接始终唯一，名单不因旧清理抖动。
- ID-X04：A的quit提交且ACK丢失，B取得身份后A重放quit；B不得被释放。跨daemon重启重复此流程。
- ID-X06：有效operator释放重放命中只读结果；被撤销runtime不能利用幂等缓存绕过认证；同request_id异payload拒绝。
