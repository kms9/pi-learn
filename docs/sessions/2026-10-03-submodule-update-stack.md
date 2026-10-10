---
title: 2026-10-03 submodule 更新用现有 shell
type: session
status: active
created: 2026-10-03
updated: 2026-10-03
tags:
  - project-wiki
  - session
---

# 2026-10-03 submodule 更新用现有 shell

## 用户要做什么

把 `pi-dev` 升到最新，并评估一个可把全部外部 submodule 更新到最新版本的脚本，比较 TypeScript 与 Go。

## 达成了什么

- 结论: 继续用 `scripts/sync-submodules.sh`。枚举来源是 `.gitmodules`，由 `git submodule update --remote` 完成，不遍历目录，也不新增 TypeScript 或 Go。
- `pi-dev` 工作区已从 `890f92088` 快进到 `4c6fb7cfe`（`origin/main`，coding-agent 版本字段 `1.0.1`）。overlay 的 gitlink 尚未提交。

## 写回了哪些 wiki 页

- `docs/index.md`
- `docs/log.md`

## 未决

- 是否把 `pi-dev` 的新 gitlink 钉进 `pi_squad_dev`
- 是否顺带把其余 submodule 也拉到登记分支尖

## 相关页面

- 决策:
- 概念:
- 学习: [[overlay/仓库结构]]
