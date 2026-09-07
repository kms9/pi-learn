---
title: 2026-09-07 译文放在 docs-zh 并还原 pi-dev
type: decision
status: active
created: 2026-09-07
updated: 2026-09-07
decision_date: 2026-09-07
tags:
  - project-wiki
  - decision
---

# 2026-09-07 译文放在 docs-zh 并还原 pi-dev

## 决策

1. `*.zh.md` 迁到 `docs-zh/pi-dev/...`，改回与上游同名。
2. 改过中文注释的源码副本同样镜像到 `docs-zh/`。
3. `pi-dev` `git checkout` 还原，工作区干净。

## 背景

译文曾写在上游树里（79 个未跟踪 `.zh.md` + 8 个已跟踪文件注释被改）。

## 影响

读中文走 `docs-zh/`；跑代码、跟上游走 `pi-dev/`。`kind: annotated-source` 不能当编译输入。
