## Why

Pi Squad 当前只有身份发现和 HTTP/SSE 消息，无法把团队请求变成可恢复、可审查的正式任务。阶段 04 已确认范围与 4a/4b 验收门，需要将其转为可实施的 OpenSpec 契约，避免把消息 ask 当任务、将离线误当释放或遗漏尚未实现的阶段 03 能力。

## What Changes

- **BREAKING**：启用 `.agents/pisquad`、显式 `leader|role` 身份、Project discovery、动态端口和 `pi-squad/2`；显式迁移旧配置与数据库，保留消息和授权历史，禁止新旧调度协议混跑。
- 增加 Team Leader、Role Primary/Secondary、Run FIFO；Run 激活时原子占用整个 roster，安全收尾才整体释放，取消 active Run 是显式释放入口。
- 在唯一 Go Controller 中实现 Task/Attempt、派发事务、执行 lease、写资源、父子 yield/续接、DAG、独立 review/rework 和最终验收 Gate。吸收阶段 03 的 direct invocation 与全部 INV 判据。
- 统一 Pi 输入分类、执行 gate、上下文快照和最终 payload 证据；增加 `/squad`、`@role`、Picker、补全及结构化工具，保留三个旧命令 alias。
- 增加 Go TUI 和 Pi 薄 Dashboard，共用只读投影；恢复、取消和换人通过用户显式提交的受审计接口执行。
- 依次交付 4a（M0—M6，71 项）和 4b（M7—M9，18 项）；总计 89 项，保留原验收 ID 和失败复测链。

## Capabilities

### New Capabilities

- `squad-project-runtime`: Project、配置快照、目录、发现、显式迁移与协议一致性（TR-01/09/16）。
- `squad-team-admission`: Leader、Primary、Run 整体占用、FIFO、跨 Team 准入与等待（TR-02—05）。
- `squad-task-execution`: 正式调用、执行资源、scope、父子续接、取消和恢复（TR-06/07/14/15）。
- `squad-context-acceptance`: 分层上下文、权限、DAG 依赖、结果、审查返工和最终 Gate（TR-08/11/17）。
- `squad-pi-interaction`: mention、Picker、补全、统一命令和输入分类（TR-12/13）。
- `squad-observability-validation`: 共享投影、只读 Dashboard、能力检查与分段验收（TR-10/18）。

### Modified Capabilities

无。当前 `openspec/specs/` 没有已登记能力；上述是现有代码之上的新增规格，不表示身份/消息代码不存在。

## Impact

目标是本仓 `pi_squad/controller/`、`pi_squad/extension/`、项目 `.agents/roles/` 的显式迁移及 `pi_squad/USAGE.md`。沿用 Go 1.27.0、Gin/Resty/Viper/Cobra/Charm v1、SQLite 和薄 TS Extension，不升级依赖、不改 submodule、不启动 Pi 或 Herdr 业务适配器。落实迁移时同步根及插件/controller 的 AGENTS 规则。

权威输入为 [统一需求](../../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md) 和 [技术设计](../../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_DESIGN.md) 当前工作区版本，含 2026-09-27 已确认裁决。本 change 是其 OpenSpec 实施表达；如有差异先修正规划，不以转换之名另改范围。非目标包括自动 spawn/failover、Role 多容量、抢占、远程控制、Web UI、第二任务引擎、Herdr location/focus。

本次只创建规划文档，既有实现与验收结果不改写为新能力已完成。

## Review Update

2026-09-27 与 w6:p1 Cursor 三轮评估后补齐：LeaderStep、Run resume/人工停止声明、planned与显式rebind、原生输入边界、standalone递归、不可变验收策略及operator凭据。用户已确认人工声明留审计、Leader普通输入为run_guidance、Project跨Team管理员使用独立凭据、按声明策略验收。没有扩成自动spawn/故障自动重跑；89个主验收ID及71/18分段保持，新增检查写入原ID子断言。见 [协商记录](../../../docs/sessions/2026-09-27-pi-squad-phase04-cursor-review.md)。
