---
title: 2026-10-18 DS Bot 迁移方案与分支 README 更新
type: session
status: active
created: 2026-10-18
updated: 2026-10-18
tags: [dsh-bot, migration, session]
---

# DS Bot 迁移方案与分支主入口

## 用户要求

将 Pi Squad → DS Bot 的实施方案同步到 `kms9/pi-learn`；以真正 submodule 引入 `Fei2411/DeepSeek-Bot`，并让 `dsh_squad_dev` 分支的根 `README.md` 成为后续开发主要说明。

## 本次仓库范围

- 新分支 `dsh_squad_dev` 基于 `pi_squad_dev@f1bb9f47baf92fb99626d8d20504c2787a0e3ac6`，独立保留原有 Pi 实验。
- 添加 `.gitmodules` 和 `dsh-bot/` gitlink，固定 DS Bot `e13bc3419d2695a509520d850a07e63f05c34e07`。
- 新增 `dsh_squad_case/{README,MIGRATION_PLAN,ACCEPTANCE}.md`、决策及源码导航，更新根 README、Wiki 索引和来源登记。
- 文档落实 Free/Managed 两模式、Go Controller 权威、DSH Adapter、18 项迁移矩阵、M0～M4 与真实证据门槛。

## 状态

本轮仅仓库文档与上游参考引入。DSH Adapter、受控群聊、模型联调和新运行验收 **尚未实施**；不能沿用 Pi 旧 89 PASS。业务 Task 无固定硬截止的已确认决策被保留。

参见 [[decisions/2026-10-18-dsh-bot-squad-migration]]、[实施方案](../../dsh_squad_case/MIGRATION_PLAN.md)、[验收](../../dsh_squad_case/ACCEPTANCE.md)。
