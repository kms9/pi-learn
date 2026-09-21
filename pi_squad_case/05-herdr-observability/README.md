---
title: 阶段 05｜位置与可观测性：在 Herdr 中看清并进入目标 Agent
status: draft
type: process
requirements: confirmed
implementation_status: not_implemented
acceptance_status: not_run
updated: 2026-09-21
---

# 阶段 05｜位置与可观测性：在 Herdr 中看清并进入目标 Agent

## 1. 最终目标与本阶段验证点

最终目标：用户通过 Pi 对话调用在线 Agent 或小队，能够观察每次消息、调用和协作结果；Agent 身份、通信和任务不依赖 Herdr，进程仍由用户管理。

本阶段只验证**“用户看得见谁在哪个终端、正在做哪项任务、卡在哪里，并能准确进入该 Pi”**。先提供不依赖 Herdr 的 Go 观察视图，再增加可拔除的 Herdr location adapter。任何观察状态都不能反向覆盖任务真相。

用户里程碑：终端表格查看所有 Agent 与任务 → 将部分 Agent 由用户手动运行在 Herdr pane 中 → 自动关联位置 → 移动/改名后刷新 → 按 agent_id 聚焦对应 pane → 断开 adapter 后小队仍能工作。

## 2. 需求及非目标

| 要求 | 说明 |
|---|---|
| Go 终端视图 | `squad observe --tui`；无 Web 服务、无浏览器、无新的 TS 前端。 |
| 混合运行 | 普通终端 Pi 与 Herdr Pi 出现在同一 Directory；不在 Herdr 的 location 为 null。 |
| 身份不变 | Herdr session/workspace/tab/pane 全是属性，绝不重生成 agent_id。 |
| 可定位 | 聚焦前复核位置绑定，只对已确认目标执行 focus。 |
| 可解释 | 分开显示在线状态、Pi 活动、task 状态、验收状态、Herdr 位置新鲜度。 |
| 可拔除 | 禁用 adapter 后前阶段全部功能仍可运行；不走 pane.send_text 传任务。 |

不自动启动 Agent、不创建/分配 pane、不把外部 Pi 自动搬入 Herdr、不重写 Pi TUI、不从屏幕抓文本判定完成。没有任何自动恢复/迁移执行进程的要求。

注意：“停止 Herdr adapter”与“停止 Herdr server”不同。后者可能使其托管的 Pi 退出；本阶段只保证拔除观察适配器不影响协作，不能承诺关闭运行宿主仍不影响进程。

## 3. 数据归属与视图字段

| 数据 | 权威来源 |
|---|---|
| agent_id、在线租约、有效绑定 | Go Directory。 |
| session_id、模型、Pi 活动、输入/settled 事件 | 已认证 TS Pi adapter。 |
| Task/Attempt/依赖/验收/小队结果 | Go Task Store 与 Team Controller。 |
| Herdr session/workspace/tab/pane/terminal、布局和标签 | Herdr 当前 API snapshot。 |
| PID、启动环境变量 | 辅助定位线索；不是单独的身份凭据。 |

建议显示：alias、短 ID、online/activity、current task、task status、acceptance、team、cwd、Herdr session、workspace label/id、tab id、pane id、location_status、last update。详情显示完整 ID、attempt/binding、消息/事件时间线和 artifact refs。token、API key、完整环境变量绝不展示。

```json
{
  "agent_id":"agt_uuid",
  "location":{
    "kind":"herdr","instance_key":"配置端点的本地唯一键",
    "session_name":"dev","workspace_id":"w1","workspace_label":"review",
    "tab_id":"w1:t1","pane_id":"w1:p1","terminal_id":"term_x",
    "observed_at":"RFC3339","observation_epoch":"obs_uuid",
    "status":"verified"
  }
}
```

`instance_key` 用已配置的 socket 端点区分多 Herdr 实例，不声称 Herdr API 自带同名 UUID。跨实例可以同时存在 w1:p1；显示名称不能作为路由键。

## 4. Herdr adapter 的连接与映射

只在本阶段读取 `HERDR_SOCKET_PATH`、`HERDR_SESSION`、`HERDR_WORKSPACE_ID`、`HERDR_TAB_ID`、`HERDR_PANE_ID` 等启动线索；使用显式配置或已注册 Pi 提供的端点线索连接，不扫描全机器 socket。验证端点属于当前用户且不是非预期符号链接。

Go 单独实现 Herdr JSONL codec，调用 `ping`、`session.snapshot`、`pane.get`、`pane.process_info`、`events.subscribe` 和 `pane.focus`。**Herdr API 是 newline-delimited JSON，与本项目 4 字节长度前缀协议不同，不能复用同一个 decoder。** ping 检查版本/能力；不支持则 adapter 报错并降级，核心服务继续工作。

关联流程：从已注册 Pi 的绑定/PID/启动 pane 线索找到候选；用当前 snapshot 和 process_info 核对；保存当前 terminal_id 与位置。只有唯一匹配才 verified。多个 Pi 继承同一个 pane 环境、pane 已被替换或 PID/terminal 不匹配时，显示 ambiguous/unverified，禁止自动 focus。

启动环境变量不能被当作永远实时的布局信息。pane 移动或改名后重新查当前 snapshot；能够通过已验证 terminal_id 等信息重新确认才更新位置，无法确认就标 stale，不猜测。

## 5. 订阅、刷新与观察视图

Herdr `events.subscribe` 使用已核对的事件类型，如 workspace.renamed、tab.moved、pane.moved、pane.updated、pane.closed、layout.updated。事件首先作为“快照已失效”的通知，不假定存在未核实的全局 replay cursor 或原子 subscribe-and-snapshot。

启动先建立订阅并缓冲通知，再拉 snapshot；期间有通知则再次刷新。事件合并窗口 200ms；正常变更目标 2 秒内可见。连接中断显示 location stale，重连后重新订阅和全量拉取；另每 15 秒低频 snapshot 校验，覆盖丢失通知。上述数值是实验目标，可在配置与验收中记录。

Go TUI 订阅本项目自己的单调 event_seq；发生 gap 则重取核心 snapshot。渲染层只读，不阻塞控制面写入；列表分页/截断、大正文按需展开。键盘选择 Agent、查看详情、Enter 请求 focus、q 退出观察；退出必须恢复终端状态。观察程序崩溃不能让任务服务崩溃。

focus 是显式用户动作：按 agent_id 查询最新绑定，再解析当前 verified location，核对 terminal/pane 后发 pane.focus；不使用旧列表缓存直接跳转。非 Herdr Agent 返回“当前不在 Herdr，可在原终端继续”，不创建 pane。

## 6. 实施文件与顺序（待实现）

| 文件 | 逻辑 |
|---|---|
| `cmd/squad/main.go` | 继承前阶段，新增 observe、focus、herdr attach/status/detach。 |
| `pkg/observe/{snapshot,stream}.go` | 合并只读投影、核心 event_seq、gap recovery；保留数据源。 |
| `pkg/observe/tui.go` | Go 终端视图、筛选、详情、focus 入口、退出恢复。 |
| `pkg/herdr/{client,codec}.go` | Herdr JSONL、request id、版本/能力、超时；与内部协议隔离。 |
| `pkg/herdr/{binding,watch}.go` | 映射验证、事件触发 snapshot、重连、stale/ambiguous。 |
| `extension/{index,location-hints}.ts` | 只补本 Pi 的启动环境/PID线索；不在 TS 中写 Herdr 控制面。 |
| `tests/` | 两端协议隔离、多实例、ID 复用、错误 focus、丢事件、adapter 拔除回归。 |

先完成纯 Go 非 Herdr dashboard；再增加只读位置映射；验证刷新/重连；最后增加显式 focus。不要把 pane 自动创建或 Pi 启动塞入本阶段。

## 7. 用户主流程

阶段 04 已通过。构建 `./05-herdr-observability/cmd/squad`，实验状态目录 `$HOME/.psq/05`；扩展路径为 `05-herdr-observability/extension/index.ts`。全部 squad 接口待实现。

先在普通终端运行四个 Pi 和 stats-team，执行 `squad observe --tui`，验证不安装 Herdr 也能查看任务。然后由用户停止其中 reviewer；手动打开 Herdr，在选定 pane 中用同一 reviewer 配置重新启动 Pi。这会产生新 runtime_id；agent_id 不变。要延续原聊天，由用户明确选择 Pi resume；系统不能自行恢复。

在那个 Herdr pane 的 shell 中查看实际 `HERDR_SOCKET_PATH`，以该值显式连接：

```bash
squad herdr attach --socket '<实际socket路径>' --name dev
squad herdr status
squad observe --tui
squad focus reviewer
```

用户通过 Herdr 自身 UI 移动 pane、修改 workspace label，再观察表格。最后执行 `squad herdr detach --name dev`，在 operator 再调用 reviewer 或 stats-team，确认仅位置能力消失，通信和任务仍正常。

## 8. 用户验收矩阵

| 用例 | 用户操作 | 通过标准 |
|---|---|---|
| OBS-01 无 Herdr | 不连接 Herdr，启动 dashboard 并运行一个小队任务。 | 可看名单、task、依赖、结果；无 Herdr 错误阻塞业务。 |
| OBS-02 混合位置 | 部分 Pi 在普通终端，reviewer 在 Herdr。 | 只给唯一验证成功的 Pi 展示 location；其他 Agent 不误绑定。 |
| OBS-03 主动聚焦 | 选择 reviewer 后 Enter 或 CLI focus。 | 精确聚焦当前对应 pane；不发送任务文本、不新建 pane/Agent。 |
| OBS-04 移动/改名 | 用 Herdr UI 移动 pane、修改 workspace label。 | 2 秒内更新或明确 stale；agent_id 不变，任务归属不变。 |
| OBS-05 同名实例 | 连接两个 Herdr 实例，各自可能有 w1:p1。 | 按 instance_key 区分，focus 不串实例。 |
| OBS-06 位置被复用 | reviewer 退出，原 pane 运行另一个进程，再尝试 focus 旧绑定。 | 拒绝过期映射，不能因为 pane 名相同就把新进程当 reviewer。 |
| OBS-07 订阅断开 | 中断 adapter 连接再恢复。 | location 显示 stale；重连 snapshot 修复；核心在线与任务不被 stale 覆盖。 |
| OBS-08 完成依据 | 让 Herdr 显示 idle，但任务验收尚未通过。 | dashboard 仍显示 acceptance pending/rejected，不自行改 completed/accepted。 |
| OBS-09 拔除 adapter | 执行 detach，保留 Herdr 托管的 Pi。 | Discovery/Messaging/Invocation/Team 用例仍通过；只失去 verified location/focus。 |
| OBS-10 退出观察 | q 退出或终止 dashboard。 | 终端恢复；Go 控制面、Pi 和任务继续；观察进程不是执行所有者。 |
| OBS-11 不支持版本 | `squad lab observe-check --case incompatible-herdr`。 | adapter 明确失败并降级；不退回终端键盘注入。 |
| OBS-12 宿主退出区别 | 在安全实验中由用户真正停止 Herdr server。 | 若 Pi 随宿主退出，Directory 按真实连接标 offline；不谎称仅位置断开。 |
| OBS-13 错误映射/事件丢失 | `squad lab observe-check --cases ambiguous,reused-pane,event-gap`。 | ambiguous 拒绝 focus；gap 重新 snapshot；无误关联。 |

用屏幕录像/前后 JSON 证明跳转和刷新，用 task timeline 证明状态来源。仅有漂亮表格不代表通过。显示时延从后端实际变更事件或快照开始计，不包含用户慢速操作。

## 9. 源码参考与协议边界

固定 Herdr SHA `5a649142233631f8407b4099da0e8e78dfef8574`；完整来源见 [SOURCES](../SOURCES.md)。

| 已读文件 | 实际参考逻辑 |
|---|---|
| `src/api/client.rs`：`ApiClient/ConnectionTarget/request_value/status`。 | 明确本地 session/socket 端点与 newline-delimited JSON。Go 重写，不用 Rust 库运行控制面。 |
| `src/api/schema.rs`：`Request/Method`。 | ping、session.snapshot、pane.get/process_info/focus、events.subscribe 的方法名。 |
| `src/api/schema/session.rs`：`SessionSnapshot`。 | workspaces、tabs、panes、layouts、agents；没有据此假设全局事件 cursor。 |
| `src/api/schema/events.rs`：`EventsSubscribeParams/Subscription`。 | 已存在的事件枚举及参数，不杜撰全量事件订阅通配符。 |
| `src/integration/env.rs`：`HERDR_*_ID_ENV_VAR/apply_pane_base_env`。 | 环境变量与 socket 线索；当前布局仍以 API 为准。 |
| Pi `packages/coding-agent/src/core/extensions/types.ts`。 | Pi runtime/session/settled 的权威来源，不由 Herdr 状态替代。 |

无需引入 pi-herdr 扩展作为强依赖；它可以作为后续扩展阅读材料，但本阶段直接使用已核对的 Herdr API。不开启 machine/SSH/远程 forward，不绑定 Herdr Workspace 作为 team_id 或权限边界。

## 10. 退出门槛与完整回归

OBS-01—13 全部通过；分别在 adapter 开启和关闭时执行前阶段关键真实 Pi 用例。保存版本、两套协议的测试结果、位置变更、拒绝误跳转和关闭 adapter 后的小队结果。当前 **NOT RUN**，记录见 [ACCEPTANCE](../ACCEPTANCE.md)。

至此验证的是：独立身份 → 在线发现 → 定向消息 → 正式调用 → 小队协作 → 可选位置与观察。后续是否管理进程、远程节点或其他 Runtime，应另立需求，不从本实验自动扩张。
