---
title: 阶段 01｜相互发现：多个在线 Pi 看见同一份名单
status: draft
type: process
requirements: confirmed
implementation_status: not_implemented
acceptance_status: not_run
updated: 2026-09-21
---

# 阶段 01｜相互发现：多个在线 Pi 看见同一份名单

## 1. 最终目标与本阶段验证点

最终目标：用户手动启动多个 Pi，通过对话调用在线独立 Agent 或固定成员小队；保持目标既有会话，故障后由用户明确续跑，Herdr 可选。

本阶段验证其中的**“还有谁、是谁、能否联系、当前在做什么”**。继承阶段 00 的稳定身份和会话绑定，增加 Go Agent Directory。不是扫描机器上全部 Pi，也不是发现“有哪些 Agent 配置模板”。

用户里程碑：三个普通终端启动 operator、worker、reviewer → 任意 Pi 查询都看到同一名单 → 关闭 reviewer 后准确显示离线 → 手动重开后恢复同一身份。全过程无需 Herdr。

## 2. 需求与列表内容

用户命令为 `/squad agents`；模型工具为 `agent_directory`，支持 `list/get`。二者调用同一个 Go 查询服务；工具返回结构化结果，TUI 表格只是视图。

| 字段 | 用户含义 |
|---|---|
| `agent_id / alias / self` | 谁，是否是当前会话；完整 ID 可展开/复制。 |
| `online_state` | `online / suspect / offline`，来自连接和心跳，不来自模型自述。 |
| `activity` | `idle / working / blocked / unknown`，来自 Pi 事件；不代表任务完成或成功。 |
| `runtime_id / session_id / binding_epoch` | 这次进程及当前会话，便于定位 `/new` 后的状态。 |
| `cwd / runtime_kind / model` | 项目、运行时和模型；未知写 unknown，不猜测。 |
| `capabilities` | 本扩展已启用的协议能力，不把人写的角色标签当作技术能力。 |
| `last_seen_at / directory_revision` | 最近可验证时间与名单快照版本。 |

默认查询同一 `SQUAD_HOME` 中的在线 Agent，可加 `--all` 看已注册的离线身份。不同工作目录可以发现彼此，但不能隐含授权跨项目执行。尚未加载扩展的 Pi 不出现；离线配置不会伪装为在线。

本阶段只开放 `identity/discovery` 能力。调用 messaging/invocation/team 接口返回 `CAPABILITY_UNAVAILABLE`，不接受半实现调用。不安装 Herdr、Intercom broker、远程组件或自动 Pi launcher。

## 3. Go Directory 设计

连接注册成功后，每个 TS adapter 每 2 秒发送 heartbeat；Go 根据自己收到心跳的时间计算租约，不能信任客户端时间。实验默认 6 秒未收到进入 suspect，10 秒未收到进入 offline；正常 socket close 尽快标记 offline。macOS 休眠、进程暂停、断网模拟后，恢复时必须重新校验连接与租约。

`online` 仅代表受认证连接存活；`working` 等活动状态单独维护。Pi `agent_start` 更新 working；`agent_settled` 且 idle、无 pending 时更新 idle；`ui_prompt_start/end` 能提供明确 blocked 状态。没有足够证据时保留 unknown，不靠屏幕文字猜状态。

每次可见变更生成单调递增 `directory_revision`。客户端可订阅变更，丢失更新或重连后重新拉完整 snapshot。**同一 revision 下名单必须一致；不要求正在变化时不同时间的两次查询字节相同。** 心跳无可见变化时不需要制造大量 revision。

注册/更新必须校验 agent token、runtime_id、binding_epoch、connection_epoch。旧连接迟到的 heartbeat、旧会话 callback 都不能覆盖新绑定。旧实例失去租约后要停止接受工作；新实例注册前必须获得新代次，不能只依赖 PID 存活检查。

Go 单一注册表是在线真相源；SQLite 保存身份、最后可见状态及审计，服务重启时先把原在线记录变为 unknown/offline，收到真实重连才能恢复在线，不从数据库直接“复活在线”。

## 4. 实施路径（待实现）

| 本阶段文件 | 逻辑与依赖 |
|---|---|
| `cmd/squad/main.go` | 组合阶段 00，新增 `agents list/get/watch`；保留所有旧命令。 |
| `pkg/directory/service.go` | `Register/Heartbeat/Disconnect/Snapshot/Watch`；唯一活动绑定和 revision。 |
| `pkg/directory/lease.go` | 服务端时钟、过期扫描、fencing、休眠恢复；可注入 fake clock 做测试。 |
| `pkg/directory/query.go` | alias 精确解析、完整 ID 查询、在线/全部及 cwd 筛选；不按目录猜目标。 |
| `extension/index.ts` | 复用 00 adapter，启用 discovery。 |
| `extension/{presence,directory-tool}.ts` | Pi 事件映射、心跳、`/squad agents`、`agent_directory`；保留 whoami。 |
| `tests/` | 多连接、旧代次更新、服务重启、snapshot/watch 一致性；真实 Pi 用户用例。 |

按三个可验证增量实施：先让 CLI 列出三个在线端点；再把同一列表接进 Pi 命令和模型工具；最后测试离线、重连、状态变化和旧连接覆盖。不要先开发 Fleet TUI。

## 5. 用户实验准备与主流程

阶段 00 已通过。以下是本阶段实现后的目标命令，不是本次已存在的程序。每个阶段使用自己的状态目录，便于重跑。

```bash
cd /你的路径/pi-learn/pi_squad_case
export CASE="$PWD" SQUAD_HOME="$HOME/.psq/01"
mkdir -p .local/bin
go build -o .local/bin/squad ./01-agent-discovery/cmd/squad
export PATH="$CASE/.local/bin:$PATH"
squad init
squad agent init --alias operator
squad agent init --alias worker
squad agent init --alias reviewer
squad daemon serve
```

另开三个终端，设置同样的 CASE/SQUAD_HOME，各自替换配置名后手动运行：

```bash
SQUAD_AGENT_CONFIG="$SQUAD_HOME/agents/operator.json" \
  pi --no-extensions -e "$CASE/01-agent-discovery/extension/index.ts"
```

三个 Pi 分别输入 `/squad agents`。在 operator 中自然语言提问：“列出当前已经注册且在线的其他 Agent，告诉我它们的 ID、目录和状态，不要发消息。”必须看到真实 `agent_directory` 工具调用，不能把模型凭空回答当作通过。

第四个终端运行 `squad agents watch`，关闭 reviewer，观察 offline，再手动重开 reviewer。最后在 reviewer 执行 `/new`，从 operator 查看其新会话属性。

## 6. 用户验收

| 用例 | 用户操作 | 必须看到的结果 |
|---|---|---|
| DISC-01 三端互见 | 三个 Pi 查询 `/squad agents`，CLI `agents list --json`。 | 同一 revision 含三个唯一 agent_id，self 标记各不相同；没有额外进程被纳入。 |
| DISC-02 对话发现 | 在 operator 提出上面自然语言问题。 | 工具轨迹包含 `agent_directory`，结果里的 ID 与 CLI 完整 ID 对应；不执行 send/invoke。 |
| DISC-03 不同目录 | worker 在另一个测试目录启动。 | operator 能发现 worker，cwd 是真实目录；不会按 cwd 自动分小队或屏蔽身份。 |
| DISC-04 未注册 Pi | 再启动一个不加载实验扩展的普通 Pi。 | 名单不增加；该 Pi 不被接管、重命名或注入。 |
| DISC-05 正常退出 | 在 reviewer 手动退出 Pi。 | 2 秒内从在线列表移除；`--all` 保留同一身份并显示 offline。 |
| DISC-06 暂停/异常退出 | 先用 `agents get reviewer` 获取并人工核对 PID；仅暂停或终止该实验 Pi。 | 暂停后 6 秒 suspect、10 秒 offline（容差 2 秒）；恢复后重新校验，不长期假在线。不得用宽泛 pkill。 |
| DISC-07 手动重开 | reviewer 离线后手动重开同一配置。 | 5 秒内上线，agent_id 不变，runtime_id 更新；审计中不存在自动 spawn。 |
| DISC-08 活动状态 | 在 worker 触发实际模型工作，观察 watch；等待真正结束。 | working 与 idle 有事件证据；若出现 UI 等待则 blocked；不把 idle 当作 completed。 |
| DISC-09 `/new` | reviewer 输入 `/new`，operator 查询它。 | agent_id/runtime_id 不变，session_id 和 binding_epoch 更新；名单无重复身份。 |
| DISC-10 Go 重启 | 手动停止/重开服务，三个 Pi 保持。 | 重连后名单恢复，期间显示离线/unknown；没有假在线，也没有新 Pi 进程。 |
| DISC-11 旧连接/重复 ID | `squad lab directory-check --cases stale-heartbeat,duplicate-runtime,watch-gap`。 | 拒绝旧代次、拒绝并发冒领；watch gap 触发 snapshot 重取。 |
| DISC-12 尚未开放能力 | 尝试 `squad message send ...`。 | 明确 `CAPABILITY_UNAVAILABLE` 或命令尚未支持；不产生消息或隐式任务。 |

DISC-06 的时间门槛从最后一次有效心跳计算，不从用户看到界面的时间猜测。控制面超时与模型生成耗时分开记录。模拟客户端只覆盖 DISC-11，不替代真实三 Pi 测试。

## 7. 源码参考与迁移要点

完整 SHA、链接见 [SOURCES](../SOURCES.md)。

| 固定源码 | 借鉴逻辑 | 本实验处理 |
|---|---|---|
| Intercom `broker/broker.ts`：`IntercomBroker`、`ConnectedSession`、`scopedSessionKey`、`sessions`。 | 中央注册表、作用域、连接和显示元数据分离。 | Go 重写；本轮一个实验空间，不绑定 Herdr Workspace。 |
| Intercom `broker/client.ts`：`IntercomClient.isConnected/startLivenessHeartbeat/runLivenessProbe`。 | 主动请求探测，不能只检查 socket.writable。 | Go 定义租约；TS 只负责心跳/重连；测试阈值不照搬上游默认值。 |
| Pi `packages/coding-agent/src/core/extensions/types.ts`：`AgentStartEvent/AgentSettledEvent/UIPromptStartEvent/SessionStartEvent`。 | 可用的运行时事件与 session 原因。 | 根据证据分离 online_state/activity。 |
| Intercom `broker/protocol.ts`：`isSessionInfo/isSessionRegistration`。 | 元数据校验。 | model、cwd、PID 只作展示，不能代替鉴权。 |

本阶段不是“先部署 pi-intercom，再另建一份名单”：只有一份 Go Directory，避免两个 broker 或两套 ID 各自判断在线状态。

## 8. 退出门槛与回退

DISC-01—12 全部通过，阶段 00 用例无回归；保存三个身份快照、watch 记录、异常退出与手动重开的事件时间线。填写 [验收模板](../ACCEPTANCE.md)，标明模型名称、Pi 版本和代码 SHA。当前所有测试 **NOT RUN**。

回退使用本阶段新的 SQUAD_HOME，不删除上一阶段数据；停止实验服务不应影响 Pi 自身。下一阶段复用 Directory，不能把“列表中在线”直接当成“消息已经交付”。
