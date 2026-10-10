## Purpose

定义 Pi Squad 的项目边界、显式身份激活、配置快照和协议迁移行为，使用户能验证连接的控制器与项目一致，并在升级及故障时保留历史数据和授权证据。

## ADDED Requirements

### Requirement: TR-01 Project、目录与激活

系统 SHALL 满足以下行为契约。

唯一目标布局：

```text
<project-root>/
├── AGENTS.md                         # Pi 原生项目规则，不由 Squad 生成/覆盖
└── .agents/pisquad/
    ├── roles/<role_id>/
    │   ├── role.md                   # 必需；Markdown + name/description frontmatter
    │   └── agents.md                 # 必需，可为空；小写，Role 工作规则
    ├── teams/<team_id>/
    │   ├── team.json                 # 必需；schema_version=1
    │   ├── instructions.md           # 必需，可为空
    │   └── workflows/<workflow_id>.json # 可选；只 materialize 为 Task DAG
    └── .runtime/                     # 不入 Git
        ├── controller.lock
        ├── controller.json
        ├── state.sqlite
        └── artifacts/
```

从启动 cwd 向上查找最近 `.agents/pisquad`，对 Project 做 canonicalization；嵌套项目选择最近根。读取配置文件遵守固定 schema/路径，不把目录内其它文件自动变成 prompt。拒绝重复标识、非法 frontmatter、越界引用和大小写伪装；macOS 不区分大小写文件系统也必须核查实际目录项，不能把 `AGENTS.md` 当作 Role `agents.md`。

同 Project 一个 Controller，以真实进程锁防双写；动态绑定 `127.0.0.1:0`，原子发布 controller.json。客户端验证 project/protocol/controller identity，不回退到另一 Project 或旧固定默认端口。Controller 停止、旧文件、端口复用不能伪装可用。

未选择 Squad 身份的 Pi 保持 no-op，不增加拦截和模型工具。显式选择身份但服务不可用时给一次明确错误，不吞掉普通 Pi 能力。系统 SHALL 提供显式迁移，并使 USAGE 与实际可用功能一致。

#### Scenario: P4-A01 两 Project、嵌套根、同一路径别名启动/发现

- **WHEN** 两 Project、嵌套根、同一路径别名启动/发现
- **THEN** 系统 SHALL 满足：canonical 身份唯一，最近根正确，不跨 Project
- **AND** 验收记录保留 F/E/D 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A02 动态端口、过期 controller.json、错误 project/protocol、端口被复用

- **WHEN** 动态端口、过期 controller.json、错误 project/protocol、端口被复用
- **THEN** 系统 SHALL 满足：无固定端口回落，不连接错误 Controller
- **AND** 验收记录保留 F/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A03 不选身份、选身份但服务不可用分别启动

- **WHEN** 不选身份、选身份但服务不可用分别启动
- **THEN** 系统 SHALL 满足：前者完全 no-op，后者明确不可用，无重复告警/模型工作
- **AND** 验收记录保留 U/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A04 缺文件、重复 Role/Team、非法 JSON/YAML、目录ID不符、agents.md 大小写、workflow环

- **WHEN** 缺文件、重复 Role/Team、非法 JSON/YAML、目录ID不符、agents.md 大小写、workflow环
- **THEN** 系统 SHALL 满足：loader 精确报错，拒绝部分配置激活，旁路文件不读写
- **AND** 系统 SHALL 满足：补查acceptance_policy模式/引用、direct授权名单和正整数Project容量校验。
- **AND** 验收记录保留 F/D 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

### Requirement: TR-09 Team / Workflow 配置

系统 SHALL 满足以下行为契约。

team.json 固定 schema_version、team_id、config_version、leader.agent_ref、members[{role_ref,responsibility}]、instructions_file、policy（含 acceptance_policy），可选 default_workflow。目录名与 ID 一致，引用必须存在。同版本内容 hash 改变应提示版本冲突，而不是覆盖旧 Run 快照。

V1 policy 显式记录 FIFO single-active、Project/Team 执行容量、最大委派深度、任务数量、重试预算及允许工具/路径上限。实验默认深度 3、每 Run 最多 20 个 Task、每 Task 最多 3 个 Attempt；重试预算不是自动重执行许可。

Workflow 文件只表达步骤、目标 role_ref、种类、依赖和结果引用，校验后一次 materialize 到同一 Task Store。Leader 动态计划也写入同一 DAG，不另启 Workflow Engine。配置 SHALL 满足 schema_version=1：Team 除 default_workflow 外上述字段必填，instructions_file 固定为 instructions.md；members 非空且 role_ref 唯一存在；未知字段拒绝。Workflow 包含 schema_version、workflow_id、steps；每步含唯一 id、roster 内 role_ref、kind、goal、depends_on，依赖包含 step 与 condition。


Workflow materialize SHALL 在同一 Task Store 创建 `planned` 节点及 revision；planned 尚非可执行 accepted Task，仍计入业务 Task 数量预算和最终 Gate。依赖就绪且 Run active、非 recovery hold 时，Controller 自动尝试 planned→accepted/queued，检查目标在线并冻结完整 Primary/runtime/session/epoch；目标离线则保留 planned 并记录 blocker，不丢弃整个 Workflow。用户 handoff/peer invoke 的即时接受仍要求目标在线。已 accepted 的 Task 不因 /new 自动改变目标。尚未产生过任何 Attempt 的 Task 可通过显式 `/squad rebind task:<id> --rebind-current` 对账后更新快照/revision并审计，不生成 Attempt；一旦有过 Attempt 则只能走 retry 路径。

#### Scenario: TR-A21 Workflow 与动态计划的真实执行

- **WHEN** Leader 通过 Workflow 或结构化计划提交两个独立计算分支及依赖其结果的 review
- **THEN** 系统 SHALL 让两成员真实执行且运行区间重叠，按结果依赖推进独立 review 与最终 Gate，不能模拟团队讨论
- **AND** 验收记录保留 U/E/R 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

### Requirement: TR-16 一致性、幂等、事件和迁移

系统 SHALL 满足以下行为契约。

请求具有稳定 request_id、payload hash、认证 source 和 project scope。同键同内容重放返回原实体和当前状态；同键异内容拒绝。Task 创建、状态修改、revision CAS、资源变化及 outbox 在短事务提交；网络通知和 LLM 不在事务内。持久化失败不得返回已接受，更不得先向 Pi 注入。

注入前后的不确定窗口单独建模：请求已持久化、adapter received、input observed、result proposed、settled 都不是同一确认。发生 injection outcome_unknown 时不自动重发有副作用输入；文档不承诺物理执行 exactly-once。

控制面沿用现有 HTTP/JSON + SSE invalidation。SSE 不是任务存储；断档、乱序、慢消费者和 Controller epoch 改变必须重取 snapshot。历史四字节 framing/额外 broker 不进入 P4。迁移后旧路径的 register、heartbeat、message send/reply/receipt、release 等所有写入口也 SHALL 要求有效 pi-squad/2 握手/授权；旧客户端使用 URL override 不得绕过版本门，旧只读查询兼容面可保留。迁移不得删除旧 squad_id/messages/授权历史；旧配置显式转换，旧 scope 快照保留，新旧调度协议禁止混跑。schema 升级先备份，失败可回滚，运行数据不自动清空。

#### Scenario: P4-A06 旧目录/旧消息DB迁移、失败回滚、混协议接入

- **WHEN** 旧目录/旧消息DB迁移、失败回滚、混协议接入
- **THEN** 系统 SHALL 满足：原数据和授权历史保留，有备份；混跑拒绝；不导入伪在线
- **AND** 验收记录保留 F/E/D 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A19 SQLite写失败/磁盘满/事务回滚

- **WHEN** SQLite写失败/磁盘满/事务回滚
- **THEN** 系统 SHALL 满足：不返回已接受、不向Pi注入；失败和清理状态可解释
- **AND** 验收记录保留 F/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

#### Scenario: P4-A20 丢失HTTP响应后同键重试、同键换内容、重复结果提交

- **WHEN** 丢失HTTP响应后同键重试、同键换内容、重复结果提交
- **THEN** 系统 SHALL 满足：返回同一实体；异内容拒绝；结果/Task仅一份有效版本
- **AND** 验收记录保留 F/E 证据（U=真实 Pi，E=控制面，R=独立产物，F=故障/竞争，D=静态检查）。

