---
title: 2026-09-21 如何把仓库更新到最新
type: session
status: active
created: 2026-09-21
updated: 2026-09-21
tags:
  - project-wiki
  - session
---

# 2026-09-21 如何把仓库更新到最新

## 用户要做什么

弄清当前 overlay 仓库怎样更新到最新版本。

## 达成了什么

- 结论: 更新对象是 **submodule 远程分支尖**，再把新 SHA **commit 进 overlay gitlink**。命令是 `./scripts/sync-submodules.sh`，然后 `python3 scripts/sync-zh.py`。
- Overlay 本身跟 `origin/main`。`pi-dev/` 等工作区不是 fork，不要在里面改文件。
- 问的是流程，本次没有执行 `sync-submodules.sh`。当时 overlay 工作区已有未提交的 wiki 改动（session 概念页），同步前应先分开处理。

## 写回了哪些 wiki 页

- [[overlay/仓库结构|仓库结构]] 补了「更新到最新」步骤
- [[overlay/_index|Overlay 索引]]、[[index|知识库索引]]、[[log|Wiki 日志]]

## 未决

- 无。是否现在就跑同步、以及要不要把新 gitlink push 到 overlay remote，由用户决定。

## 相关页面

- 决策: [[decisions/2026-09-07-github-clones-as-submodules]]
- Overlay: [[overlay/仓库结构|仓库结构]]
- 根目录 `README.md`、`scripts/sync-submodules.sh`、`.gitmodules`
