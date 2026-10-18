---
title: DS Bot + Squad 迁移阶段总览
type: index
status: draft
created: 2026-10-18
updated: 2026-10-18
tags: [dsh-bot, squad, migration]
---

# DS Bot + Squad 迁移实施索引

**所有能力迁移均为计划，尚未实现或验收。** 本目录为 `dsh_squad_dev` 的正式实施与验收入口，而不是 DSH 可运行应用目录。

## 文档

- **[MIGRATION_PLAN.md](MIGRATION_PLAN.md)**：架构、TR-01～TR-18 能力映射、代码参考、接口、M0～M4 实施顺序。
- **[ACCEPTANCE.md](ACCEPTANCE.md)**：实际用例、故障负例、退出门和可重复对照实验。
- [迁移决策](../docs/decisions/2026-10-18-dsh-bot-squad-migration.md)。
- [DS Bot 源码](../dsh-bot/)（真实插件位于 `dsh-bot/ds-bot/`）。
- [Pi Squad Stage04 需求](../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md)。

| 阶段 | 目标 | 状态 |
|---|---|---|
| M0 | DS Bot Web 多模型群聊、长期 Bot 与记忆可演示 | NOT_STARTED |
| M1 | DSH Adapter 精确绑定、正式输入、工具保护和真实收尾 | NOT_STARTED |
| M2 | 单 Team Task DAG + 产物 + Review/Rework + Acceptance | NOT_STARTED |
| M3 | Run/任务/审核/恢复 UI 与策略对照 | NOT_STARTED |
| M4 | 多 Team FIFO、共享 Role、Child/yield 与全量故障恢复 | NOT_STARTED |

**源码 pin**：Pi 迁移源 `pi_squad_dev@f1bb9f47baf92fb99626d8d20504c2787a0e3ac6`；DS Bot `Fei2411/DeepSeek-Bot@e13bc3419d2695a509520d850a07e63f05c34e07`；现有 `deepseek-harness/` 不在本次提交改变 gitlink。M1 的真实 DSH Hook 能力探针是 M2 受控模式的前置条件。
