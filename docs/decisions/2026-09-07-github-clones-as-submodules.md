---
title: 2026-09-07 现有 GitHub 仓改为 submodule
type: decision
status: active
created: 2026-09-07
updated: 2026-09-07
decision_date: 2026-09-07
tags:
  - project-wiki
  - decision
---

# 2026-09-07 现有 GitHub 仓改为 submodule

## 决策

把已经 clone 在 overlay 旁边的 GitHub 仓库收成 git submodule，继续用各自 origin 同步。Overlay 只钉 SHA，不 vendor 源码。

当前模块（见 `.gitmodules`）：`pi-dev`、`agent-tools`、`herdr-pi-extensions`、`pi-context`、`pi-intercom`、`pi-subagents`、`pi-trace-extension`、`pi-workflows`、`deepseek-harness`。

## 背景

这些目录原先在 `.gitignore` 里，无法在 GitHub 上声明「用哪一版上游」。Submodule 可以同步，又不必 fork。

## 影响

- 协作者：`git clone --recurse-submodules`
- 更新：`./scripts/sync-submodules.sh`，再视情况 commit gitlink
- 仍不要在 submodule 工作区里改文件当 overlay 作品

## 复审触发条件

某个仓不再需要、或改成稀疏 checkout / subtree。
