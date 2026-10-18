# pi-learn — DS Bot + Squad 多智能体协作实验

> **当前研发主线：DS Bot 提供完整多助手 Web 交互，DSH 负责 Agent 执行，现有 Go Squad Controller 提供正式任务治理。**
>
> **截至 2026-10-18：迁移规划与源码引入阶段。** DS Bot 上游已有长期 Bot、群聊、多模型、记忆等能力；本项目的 DSH Adapter、Managed 模式与策略实验尚未实现或验收。

## 一、项目目标

之前的 [Pi Squad](pi_squad/README.md) 基于 Pi Extension + Go Controller 实现 Team、Role、Task/Attempt、依赖 DAG、执行许可、审查、验收和恢复，但多个 TUI 和进程增加了非开发人员体验及演示的门槛。

本分支 `dsh_squad_dev` 首先解决**完整产品体验**：真实用户打开 DS Bot Web，即可使用不同模型的长期 Bot、多人群聊、`@Bot` 交接、记忆与人工参与；然后在同一界面通过真实执行规则与证据，对比 Pi Squad 治理策略的价值。

**三个目标：**

1. **产品化交互**：用户不需要学习 Pi、Herdr、Go CLI 或多个终端。
2. **正式协作可治理**：任务目标、责任、依赖、实际执行、产物版本、独立 Review、返工和最终 Acceptance 均可解释。
3. **编排收益可评测**：固定任务、模型、工具、初始工作区和记忆，比较强单 Agent、自由协作、DAG、DAG+Review 的成功率、质量、时间与总成本。

保留 `pi_squad_dev` 原有验证历史，不将 Pi 的 PASS 自动迁移为 DSH 的 PASS。

## 二、两种用户协作模式

| 模式 | 用户体验 | 运行与决策 |
|---|---|---|
| **Free 自由协作（DS Bot 原有）** | Bot 私聊、群聊、`@Bot`、普通 Handoff、模型和记忆 | DS Bot / DSH 原生 |
| **Managed 受控协作（本项目待实现）** | 从群聊启动正式 Run，查看任务 DAG、等待、审核、返工、交付与证据 | Go Controller 是 Task/Run/Acceptance 唯一权威；DSH Adapter 调用真实 Agent |

Managed Run 创建时固定 Team、Role、Workflow、模型、工具及策略版本；在执行中不能悄悄切换到自由协作。原生群聊的 `group_relay`、`message_bot`、`@Bot`、定时与自动恢复不能绕过受控 Task Gate。

## 三、架构

```text
非开发用户
    │
DS Bot Web / Desktop
    ├─ 已有：长期 Bot / 群聊 / 模型 / Memory / Handoff
    └─ 待开发：Run / Task / DAG / Artifact / Review / Recovery / Report
           │
      ┌────┴────────────────────┐
      │                         │
 Free 原生运行              Managed 受控运行
      │                         │
      ▼                         ▼
 DSH Agent               Go Squad Controller
                          ├─ Team / Role / Run
                          ├─ Task Contract / DAG
                          ├─ Admission / Lease / CAS
                          ├─ Artifact / Review / Acceptance
                          └─ Recovery / Events / Projection
                                  │
                            DSH Adapter
                            ├─ Bot/Group Session/Attempt Binding
                            ├─ Prompt/Model/Tool Gate
                            ├─ Input 与真实 Tool/Step 证据
                            └─ Cancel / Settle / Reconcile
                                  │
                             DSH Agent / Session
                                  │
                             多 Provider / 模型
```

**数据权威边界：** DS Bot/DSH 保存 Bot、普通聊天、记忆和原生 Session；Go Controller 保存正式 Run/Task/Attempt、资源与 Acceptance；Web 只显示权威投影并执行已授权操作。不能让 DS Bot 的普通 Handoff 工作树同时成为第二个正式 Task Store。

不同 Bot 可以使用不同模型，但严格实验需要冻结实际 Provider、Model、Thinking Effort 与请求证据，禁止因模型不可用而静默回退。使用 Claude/GPT 模型不等于直接启动 Claude Code/Codex Agent Runtime；首个受控 Runtime 仅采用 DSH。

## 四、目前有什么，什么还没做？

| 位置 | 状态 | 内容 |
|---|---|---|
| [`pi_squad/`](pi_squad/) | **已实现 Pi 版** | Go Controller + Pi Extension；历史 Stage04 在 Pi 1.0.1/TUI 记录 89/89 项通过；Pi 1.1.0 另行验收 |
| [`deepseek-harness/`](deepseek-harness/) | **已有 submodule** | DSH 上游源码，兼容性和实际执行 Hook 仍待验证 |
| [`dsh-bot/`](dsh-bot/) | **新引入 submodule** | [Fei2411/DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot)，实际插件包在 `dsh-bot/ds-bot/` |
| [`dsh_squad_case/`](dsh_squad_case/) | **新迁移文档** | M0～M4 实施方案、功能映射和验收规范 |
| `dsh_squad/adapter/` | **计划中** | DSH 执行适配层；本次未创建可运行实现 |
| Managed Web / 评估报告 | **计划中** | Run、DAG、审核、恢复和实验对照 |

**需继承的既有决策：** 取消业务 Task 原有固定 **120 秒硬截止**，不把它改成可配置业务硬截止；任务推进以必要子任务明确回传为依据。通信 lease、故障隔离和工具级超时仍独立存在。当前旧代码尚未完成全部相应改动。[决策记录](docs/decisions/2026-10-04-squad-explicit-completion-and-context.md)。

## 五、开发路线与退出条件

| 阶段 | 主要交付 | 退出门 |
|---|---|---|
| **M0 产品基线** | 固定兼容 DSH/DS Bot；预置 Chief/Researcher/Builder/Reviewer 的多模型群聊、记忆和普通交接 | 非开发用户只打开 Web 即能完成自由协作示例 |
| **M1 DSH Adapter** | 正式 Task、精确 Session 绑定、输入/工具 Gate、真正执行/停止证据、异常隔离 | 真实执行和重复派发/绕过/取消/重启负例全部有证据 |
| **M2 单 Team 交付** | Task Contract、DAG、Artifact、独立 Review、Rework、Acceptance Gate | 真实课件任务的正常交付和拒绝返工两条链成功 |
| **M3 Web 与对照实验** | 启动任务卡、任务与审核进度、人工介入、恢复及实验报告 | 同平台可复核自由/受控协作结果、完整成本与失败 |
| **M4 高级治理** | Primary/Secondary、多 Team 原子占用/FIFO、WaitGraph、子任务 yield 与完整恢复 | 共享 Role、capacity=1、故障窗口专项验收 |

M0 优先消除演示阻力。M1 是受控模式 M2 的硬前置。M4 不阻塞首个产品演示。

## 六、文档入口（后续开发从这里开始）

- **[迁移实施主方案](dsh_squad_case/MIGRATION_PLAN.md)**：TR-01～TR-18 迁移、源码边界、Adapter、安全及 M0～M4 工作。
- **[验收与策略对照](dsh_squad_case/ACCEPTANCE.md)**：分阶段用例、退出条件、质量/成本指标与实验隔离。
- [阶段导航](dsh_squad_case/README.md)。
- [架构决策](docs/decisions/2026-10-18-dsh-bot-squad-migration.md)。
- [DS Bot 源码导航](docs/sources/dsh-bot.md)。
- [Pi Squad README](pi_squad/README.md) / [使用说明](pi_squad/USAGE.md) / [Stage04 需求](pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md)。
- [研究 Wiki 总入口](docs/index.md)。

## 七、源码与目录

```text
pi-learn/
├── README.md                     # 本分支主要说明
├── .gitmodules
├── dsh_squad_case/               # 迁移主方案、验收设计、阶段导航
├── dsh-bot/                      # Fei2411/DeepSeek-Bot submodule
│   └── ds-bot/                   # 上游实际 DSH 插件
├── deepseek-harness/             # 已有 DSH submodule
├── pi_squad/                     # 现有 Go Controller + Pi Extension
├── pi_squad_case/                # Pi Squad 历史阶段/验收
├── pi-dev/                       # Pi 运行时与开发扩展
├── paseo/                        # 多 Harness/Adapter 对照
├── pigo/                         # Go 版 Pi 对照
├── herdr-pi-extensions/
├── pi-context/
├── pi-intercom/
├── pi-subagents/
├── pi-workflows/
├── pi-trace-extension/
├── agent-tools/
├── docs/                         # Wiki：决策、研究、源码、会话
├── docs-zh/                      # Pi 中文阅读层
└── scripts/                      # 子模块维护脚本
```

`dsh_squad_dev` 源自 `pi_squad_dev@f1bb9f47baf92fb99626d8d20504c2787a0e3ac6`；`dsh-bot` 的 gitlink 固定到 `e13bc3419d2695a509520d850a07e63f05c34e07`，`main` 仅是跟踪配置。上游子模块为**只读证据**；需要修改其代码时，采用独立 Fork 或可审核扩展点，不直接改子模块工作区。

## 八、获取项目

```bash
git clone -b dsh_squad_dev https://github.com/kms9/pi-learn.git
cd pi-learn
git submodule sync --recursive
git submodule update --init --recursive dsh-bot deepseek-harness
git -C dsh-bot rev-parse HEAD
git submodule status dsh-bot deepseek-harness
```

已有 clone 切换本分支：

```bash
git fetch origin dsh_squad_dev
git switch dsh_squad_dev
git submodule sync --recursive
git submodule update --init dsh-bot
```

`submodule update --init` 检出本仓固定版本；`--remote` 会尝试更新到上游分支，需要独立兼容验证和新的 gitlink 提交。克隆并不代表 DSH Host、模型凭据或 DS Bot Web 已经部署。

## 九、工作约束

- 正式任务调度只有 Go Controller 一个权威源；DS Bot 的自由消息不可直接冒充 Task 完成。
- 受控 Session 的输入、工具、Session part、自动恢复、模型变更必须经实际 Adapter 规则和真实事件验证，不能仅靠 Prompt。
- 明确区分 `result_proposed`、`settled`、`accepted`、`released`；发生 `outcome_unknown` 不自动重投副作用任务。
- 生成 HTML/JS 课件需隔离预览，操作员凭据不进入网页、模型、日志及 Artifact。
- 首版不把单个 DSH Home 直接作为多租户 SaaS；试用者应有独立认证、目录和数据边界。
- 所有迁移用例从 NOT_RUN 开始，失败结果不覆盖，旧 Pi 89/89 PASS 不自动继承。
- 评价多 Agent 策略时控制任务、模型、工具、环境与初始记忆，统计 Leader/Reviewer 及辅助模型全部调用；不虚构对照收益。

项目维护要求：[AGENTS.md](AGENTS.md)；Wiki 总入口：[docs/index.md](docs/index.md)。
