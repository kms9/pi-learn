---
title: 2026-09-07 overlay 而不是 fork 上游
type: decision
status: active
created: 2026-09-07
updated: 2026-09-07
decision_date: 2026-09-07
tags:
  - project-wiki
  - decision
---

# 2026-09-07 overlay 而不是 fork 上游

## 决策

GitHub 上维护独立 overlay 仓库。只提交 `docs/`、`docs-zh/`、`scripts/`、`AGENTS.md`、`README.md`。`pi-dev` 保持可 `git pull` 的上游 clone，不推进本仓。

## 背景

把中文文件和注释写进 `pi-dev` 会挡 `git pull`。整仓 170M，fork pi 没有必要。

## 证据

- 根目录 `README.md`
- `docs-zh/manifest.json` 的 `upstream.head`

## 复审触发条件

需要钉死上游并让协作者一次 clone 齐源码时，可改 submodule；在那之前保持 gitignore。
