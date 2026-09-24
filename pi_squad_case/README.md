---
title: Pi Squad 本地实验｜需求、技术方案与用户验收总索引
status: draft
type: index
requirements: confirmed
implementation_status: not_implemented
acceptance_status: not_run
updated: 2026-09-21
---

# Pi Squad 本地实验

**交付范围：六阶段需求与技术实施文档、源码证据索引、统一验收规范。不是已实现的软件。** 文中 `squad` CLI、`/squad` 命令、模型工具、测试工具和拟建源文件均为实施合同，必须实现后才能执行；所有 85 个验收用例（原75项＋2026-09-21评审新增10项）当前均为 **NOT RUN**。

仓库：`kms9/pi-learn`；实验分支：`pi_squad_dev`；实验根目录：`pi_squad_case/`。分支基于 `main` 的 `2ee5bd7995d1504f73aa5955181f3b9fa5289b8e` 创建。上游 submodule 不修改、不自动升级。

> **2026-09-23 实施轨道**：Notion P0–P7（Herdr + 薄 Extension + HTTP Go Controller）的第一刀在 [`phase_00_identity/`](phase_00_identity/README.md) 与共享模块 [`../pi_squad/`](../pi_squad/README.md)。下面第 2 节的 `00-*`～`05-*` 仍是 2026-09-21 UDS / `squad` CLI 规划稿，**尚未按那份合同实现**，不要和 P0 HTTP Registry 混跑。

## 1. 最终目标和已确认边界

用户手动启动多个 Pi；在任一已授权 Pi 中通过对话发现、联系和调用其他在线 Agent，或者调用固定成员的小队。目标 Agent 沿用自己的既有会话；消息、任务、结果及小队记录可追溯，故障可识别，由用户明确决定续跑。最后可选接入 Herdr，只增强终端位置与观察。

| 决策 | 本轮固定边界 |
|---|---|
| 环境 | macOS 优先，单机、同一操作系统用户；Linux 仅保持设计可移植，Windows 不列本轮验收。 |
| 技术栈 | Go 实现控制面、Directory、Messaging、Invocation、Team、存储、CLI、观察和 Herdr adapter；TS 只做必要的 Pi extension。 |
| 身份 | 长期 `agent_id`；alias、cwd、PID、Pi session、Herdr 位置都是独立属性；一个身份只允许一个持有人；失租/断线/daemon重启不释放占用，正常认证退出或用户显式release后才能换持有人。 |
| 进程 | 只调用在线 Agent；离线明确提示，由用户手动启动后重试。所有阶段都不自动 spawn、restart、adopt 或管理 Pi。 |
| 会话 | 正式任务默认进入目标现有会话。`/new` 创建新会话，不重启 Pi 进程，不自动继承旧任务。 |
| 恢复 | 保存记录、标识未知/中断，用户显式关联结果或重试；不承诺任意故障后自动续跑。 |
| 授权 | 固定成员在预设范围内自动协作，不逐次确认；权限外拒绝，不能绕过 Pi 原有工具/项目权限。 |
| Herdr | 00—04 完全没有依赖；05 的位置适配可拔除；不能用 pane 位置当身份或完成证据。 |
| 交付形态 | 每阶段一个目录、一份合并 PRD＋技术方案＋用户验收文档；不拆成互相脱节的产品稿和工程稿。 |

“单机协作”不是一个抵抗同 UID 恶意进程的安全沙箱。控制面负责协议授权、执行归属和声明资源约束，不夸大文件系统隔离能力。

## 2. 六份独立文档与实际用户里程碑

阶段编号只用于阅读顺序；完成标准是下面的用户闭环，不是完成一个抽象模块名。

| 阶段文档 | 验证最终目标的哪一环 | 用户实际完成的闭环 | 用例 |
|---|---|---|---:|
| [00 身份与协议](00-identity-protocol/README.md) | 我是谁，是否准确绑定当前 Pi | 创建 reviewer → whoami → `/new` → 退出重开 → 身份不混淆 | 15 |
| [01 相互发现](01-agent-discovery/README.md) | 还有谁、是否在线 | 三个普通终端互见 → 退出一端显示离线 → 手动重开恢复身份 | 16 |
| [02 相互通信](02-agent-messaging/README.md) | 指定收件人、对应问答 | 发唯一通知 → 正确收件箱 → 提问 → 自动关联回答 | 12 |
| [03 相互调用](03-agent-invocation/README.md) | 正式委派、结果、失败及恢复 | 对话派统计任务 → 既有会话执行 → 校验结果 → 取消/故障不假成功 | 15 |
| [04 组成小队](04-team-orchestration/README.md) | 分工、依赖、互调、审查 | 调用 stats-team → 并行统计 → 汇合报告 → 审查与有界返工 | 14 |
| [05 位置与观察](05-herdr-observability/README.md) | 人看清状态并进入准确终端 | 非 Herdr 观察 → 可选映射/focus → 移动刷新 → 拔除仍能协作 | 13 |

辅助文档：[源码证据](SOURCES.md)、[版本锁定清单](sources.lock.json)、[用户验收与证据模板](ACCEPTANCE.md)。

## 3. 架构与单一职责

```text
用户手动运行 Pi A / Pi B / Pi C
             │
       必要 TS Pi Extension
       命令、工具、事件、当前会话注入
             │  本机认证 UDS
             ▼
          Go 控制面
Identity → Directory → Messaging → Invocation → Team
             │
       Go 独占写本地 SQLite
       状态、幂等、事件、结果、验收
             │
       Go CLI / Go 观察视图
             └── 可选 Go Herdr adapter（仅阶段 05）
```

Go 不是 Pi 的启动器或进程父级。Pi adapter 自主连接已经由用户启动的 Go 服务；服务未启动时 extension 显示 disconnected，用户的 Pi 仍可独立使用。允许自动恢复 IPC 连接，禁止据此自动重投未知任务。

只有一份 Go Directory 和一条 Task Router。小队和单独调用都走同一个 Invocation；不同时运行 pi-intercom broker、pi-subagents 自动子进程调度或另一套 Agent Teams mailbox 来完成本实验。参考它们的源码语义，在 Go 侧实现本项目明确的合同。

通知、提问、正式任务必须区分。模型侧 ask/invoke 快速返回 ID；等待依赖由状态机和安全续接实现，不能用长期阻塞的工具 Promise 占住 Agent。`agent_end`、Herdr idle、输出里写“完成”均不等于任务完成，更不等于业务验收通过。

## 4. 目录组织与实现接力

```text
pi_squad_case/
├── README.md / SOURCES.md / sources.lock.json / ACCEPTANCE.md
├── 00-identity-protocol/README.md
├── 01-agent-discovery/README.md
├── 02-agent-messaging/README.md
├── 03-agent-invocation/README.md
├── 04-team-orchestration/README.md
└── 05-herdr-observability/README.md
```

首次实现阶段 00 时新增根 `go.mod/go.sum`、`package.json/package-lock.json/tsconfig.json`。后续每阶段新增自己的 `cmd/squad`、`pkg`、`extension`、`tests` 和必要 fixtures。根只有一个 Go module、一套 TS 依赖锁；高阶段组合低阶段导出的函数，不复制低阶段实现，不直接 import 带自注册副作用的 extension 入口。

最高阶段入口只注册一次 `/squad`、一次生命周期监听和对应工具；由一个命令 dispatcher 启用当前阶段能力。新增阶段不得导致重复定时器、重复 Agent 注册、重复工具或消息投递。

每个阶段独立状态目录 `$HOME/.psq/00` 到 `$HOME/.psq/05`；切换阶段不直接用旧数据库冒充已迁移成功。需要保留旧记录时，先备份并执行带版本的 migration；原文件只读保留。源码共享不等于实验状态共享。

构建默认候选：Go 标准库 `net/encoding/json/database/sql`，本地 SQLite driver 可采用 `modernc.org/sqlite`（纯 Go 路线）；具体版本在第一次实现时选定并锁定到 go.sum。Pi 参考源码 package 为 0.86.1、Node 要求 `>=22.19.0`，见 SOURCES；这不是对用户本机版本的检测结果。doctor 必须记录实装版本、所需事件/API 是否可用；不满足就阻塞验收，不静默兼容。

## 5. 通用实验入口（功能实施后）

现阶段可以先获取并阅读文档：

```bash
git fetch origin
git switch pi_squad_dev
cd pi_squad_case
```

下面的入口是后续实现目标，当前文档提交没有相应程序：

```bash
export CASE="$PWD"
export SQUAD_HOME="$HOME/.psq/01"  # 随阶段替换
mkdir -p .local/bin
npm ci
go build -o .local/bin/squad ./01-agent-discovery/cmd/squad
export PATH="$CASE/.local/bin:$PATH"
squad init
squad agent init --alias operator
squad agent init --alias worker
squad agent init --alias reviewer
squad daemon serve
```

每个 Pi 必须在另外的终端由用户手动启动；设置相同 CASE/SQUAD_HOME，配置指向自己的 alias：

```bash
SQUAD_AGENT_CONFIG="$SQUAD_HOME/agents/operator.json" \
  pi --no-extensions -e "$CASE/01-agent-discovery/extension/index.ts"
```

绝对路径用于避免切换 cwd 后找错 extension。数字实验先准备 workspace，再在各 Pi 终端 `cd "$SQUAD_HOME/workspace"` 启动。小队实验需要 operator、planner、worker、reviewer 四个在线 Pi，不把入口 operator 与 Leader 偷偷视为同一个执行槽。

## 6. 跨阶段公共命令合同

| 接口（拟实现） | 明确行为 |
|---|---|
| `squad init / agent init / agent rename` | 初始化实验空间、身份与配置；不启动 Pi。重复执行要么幂等，要么明确已存在，不覆盖 token/ID。 |
| `squad agent release <agent_id> --expected-runtime <runtime_id> --expected-binding-epoch <n>` | operator-only事务CAS释放身份，撤销旧runtime；不终止Pi、不证明本地副作用停止。 |
| `squad doctor` | 实装版本、依赖、权限、socket、配置、阶段能力检查；不得打印密钥。 |
| `squad policy allow --from X --to Y --actions send,ask,invoke` | 仅 operator CLI 可修改授权；逗号参数按动作集合解析，不给模型注册 policy 写工具。 |
| `squad events list --trace ID` | 按事件序列返回阶段00起的持久审计，可作为控制面/模型归因证据。 |
| `squad lab ...` | 专用模拟客户端检查；输出 case、输入、预期、实际、PASS/FAIL 与事件；未实现则不得输出伪 PASS。 |
| `--json` | 稳定机器可读结果；错误至少有 code、message、retryable、request_id。 |

默认不开放任意跨 Agent send/ask/invoke；由用户一次配置。reply 只准回答指向自己的已登记 ask。组内许可来自用户创建并审核的 roster/policy；不扩散到同机器其他 Agent。显式在线且有权限也仍须验证当前绑定和忙碌状态。

文件检查以实路径及 sha256 为准。只读模型任务通过工具上限/钩子拦截实现，不能只写提示词；写文件实验只许可声明路径。任意 bash、未批准扩展及同用户外部修改不在本轮可控保证内。

## 7. 验收原则

85 个用例是需求覆盖目标，不是已运行报告。每阶段都要完成用户主流程、异常/恢复流程，并回归前阶段核心行为。单元测试、mock transport 或漂亮 TUI 不能替代真实 Pi 操作；代码未实现、依赖不符或模型未配置要标 BLOCKED，不记 PASS。

控制面 2 秒、心跳 2/6/10 秒等是拟定实验门槛；模型 120 秒是单次观察预算，不是 SLA 或已测性能。将传输、adapter、模型、权限、业务正确性分别归因。详细记录、失败复测及安全清理见 [ACCEPTANCE.md](ACCEPTANCE.md)。

最先实施 00 的“一个 Pi 身份闭环”，通过后再做 01 的“三 Pi 互见”。不要提前开发小队 UI、Herdr pane 创建器或跨机器节点服务。

2026-09-21 评审与用户裁决见[三方评审](../docs/sessions/2026-09-21-pi-squad-00-01-review.md)：占用优先；suspect拒绝新投递，online后由调用者重试。新增ID-X01—06、DISC-X01—04，全部NOT_RUN。

## 当前 HTTP 通信开发切片

[UUID 运行实例与纯文本消息验收](phase_02_http_messaging/README.md)：已实现，待 Claude 验收；不等于旧 UDS 阶段 02 全部通过。
