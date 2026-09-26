# Pi Squad 共享模块（P0）

第一阶段验证的共享实现。阶段文档在 [`../pi_squad_case/phase_00_identity/`](../pi_squad_case/phase_00_identity/README.md)。

| 路径 | 职责 |
|------|------|
| [`USAGE.md`](USAGE.md) | 配置与启动。功能落地后同步改这份，不要另写一套用法 |
| [`controller/`](controller/) | 单进程 Go HTTP 控制面：注册、心跳、列表；SQLite 持久化 |
| [`extension/`](extension/) | 薄 Pi Extension：`session_start` 注册、定时心跳、`list_agents`、按配置追加角色提示 |

本目录**不**实现 P1+ 的 `send_message` / `delegate_task` / 任务状态机，也**不**依赖 pi-agent-teams 或 pi-intercom。
