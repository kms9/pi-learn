# squad-observability-validation Specification

## Purpose

定义团队执行状态的统一观察和阶段交付证据，支持独立终端面板与 Pi 内只读视图，并以能力检查、真实执行和分段验收区分规划、实现及已经验证的功能。

## Requirements

### Requirement: TR-10 Dashboard 与状态投影

系统 SHALL 满足以下行为契约。

本阶段实现独立 Go TUI（4a），以及 Pi 内 `/squad dashboard` 的薄原生交互视图和命令预览（4b）。二者复用 Controller 投影，不各建一套状态机；不新建 Web 服务或替换 Pi TUI。

| 视图 | 必须展示 |
|---|---|
| Team / Run | Team、Leader/runtime/session/epoch、active 及排队 Run、phase、排队 Run 的 waiting_roles/前序 Run、各 Role/Primary/owner、所有 blocker、下一步动作 |
| Role | Primary、在线/活动、binding epoch、Secondary 列表、team_schedulable、owner team/run、ownership revision、隔离原因 |
| Agent | ID/Role、Primary/Secondary/Leader、runtime/session、activity、当前 Task/Attempt/segment、逻辑 affinity 与执行 lease |
| Task / Detail | DAG/root/parent/依赖、Task 状态、结果版本、review/rework、acceptance、事件时间线、错误及可操作原因 |

Presence、Activity、身份资格、Role ownership、Run/Task state、Acceptance 分字段。`idle != completed != accepted`；free 不自动意味着在线可执行；Secondary 标 standalone，不能统计为 Team 额外容量。

支持筛选、选择、详情、刷新、按 Run 定位任务；显示 snapshot revision、数据年龄、stale/断线。观察退出不停止 Controller/Pi。只读视图不触发模型轮、不算人工接管。

Dashboard 保持只读投影。恢复/取消/promote/release 入口只生成或展示明确 Controller 命令预览，用户显式提交后走操作接口和审计，不能直接改数据库或乐观显示成功。Herdr location/focus 不作为 P4 完成条件。

#### Scenario: TR-A17 检查 Team/Role/Agent 视图

- **WHEN** 检查 Team/Role/Agent 视图
- **THEN** 系统 SHALL 满足：Leader、Primary/Secondary、owner、blockers、Attempt 可解释
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A25 Pi dashboard与Go TUI同时查看同一revision并筛选/详情

- **WHEN** Pi dashboard与Go TUI同时查看同一revision并筛选/详情
- **THEN** 系统 SHALL 满足：同projection一致；无模型轮、无人工中断，无Herdr adapter亦可用
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A26 Dashboard乱序/断线/slow consumer/Controller重启

- **WHEN** Dashboard乱序/断线/slow consumer/Controller重启
- **THEN** 系统 SHALL 满足：显示stale/data age，重取snapshot，不假在线或假accepted
- **AND** 验收记录保留 U/E/F 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A27 Dashboard预览cancel/promote/recover命令并使目标revision变化

- **WHEN** Dashboard预览cancel/promote/recover命令并使目标revision变化
- **THEN** 系统 SHALL 满足：预览不写库；显式提交重新校验，有审计，不乐观假成功
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A38 退出Pi观察overlay/Go TUI，兼容CLI调用并触发错误参数

- **WHEN** 退出Pi观察overlay/Go TUI，兼容CLI调用并触发错误参数
- **THEN** 系统 SHALL 满足：只退出观察，Controller/Pi继续；错误无Task副作用
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

### Requirement: TR-18 实现边界、能力检查与证据

系统 SHALL 满足以下行为契约。

系统 SHALL 在启动 doctor 中核对实际 Pi/Node/Go、固定源码版本、关键 hook/API、协议及权限；能力缺失时返回 CAPABILITY_UNAVAILABLE 并阻止对应正式调用，不得用屏幕文本、模拟按键、消息 ask 或新进程替代。未选择身份保持 no-op；重复 reload 不增加订阅、工具或补全实例，旧 generation/session 回调不得影响新会话。

系统 SHALL 在每个可用增量更新 pi_squad/USAGE.md，使用真实 Pi 输入/工具、Controller 事件/实体及独立产物证明主流程。故障模拟不得代替正常主流程。验收 SHALL 使用新测试 workspace、至少三个不同 Role 的 Pi、独立 Controller 与 Dashboard 终端、当前项目 cwd；多 Team 场景还须包含两个 Leader、共享 Primary 和 Secondary，并覆盖不相交第三 Team。Herdr 仅作测试终端宿主，不得成为业务路由/状态来源。

阶段 4a SHALL 满足原清单的 71 项、数字夹具第一轮（10/20/30，count=3、sum=60；错误 sum=50 触发返工）、单 Team 故障窗口、前序关键回归及 P4-A40 静态部分。4b SHALL 保持 4a 无回归，并完成另 18 项、多 Team 第二轮、剩余故障窗口及全量收口。BLOCKED/NOT_RUN 不得视作通过，保留失败复测链、版本、输入、事件 seq、实体 ID 和产物 hash；INV-01—15 判据并入已有映射用例，不新增计数。


原阶段 03 实验观察目标 SHALL 保留为控制面接受/拒绝 2 秒内可见、模型结果等待预算 120 秒；记录计时和超时层级，不能将实验目标宣传为产品 SLA 或自动释放依据。正常试验从当前项目 cwd 加载配置，不能复制正常角色到临时目录代替；破坏性负例单独隔离。4a 已包含通用原子准入、ROLE_BUSY、释放与 outbox 同事务及基础有界重扫；4b 加固多 Team 公平竞争/gap/观察交互，而不延后这些安全不变量。P4-A29 在 4a 检查 status/Go 只读观察不中断，Pi dashboard 路径由 4b P4-A25 补验；保留 71/18 分段。

#### Scenario: P4-A39 固定Pi API probe、重复reload、旧session callback、缺hook版本

- **WHEN** 固定Pi API probe、重复reload、旧session callback、缺hook版本
- **THEN** 系统 SHALL 满足：能力不符fail closed；无重复provider/工具/订阅，无旧回调污染
- **AND** 系统 SHALL 满足：补查native selector取消不中断、真实分支变化更新generation、user_bash介入、任务注入/前缀不执行命令。
- **AND** 验收记录保留 F/U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A40 静态检查目录/schema/链接/ID/总数/来源；跑数字夹具三轮主流程

- **WHEN** 静态检查目录/schema/链接/ID/总数/来源；跑数字夹具三轮主流程
- **THEN** 系统 SHALL 满足：89项索引完整，来源区分借鉴/自设计；只有真实证据才能将对应项标PASS
- **AND** 验收记录保留 D/U/E/R 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

