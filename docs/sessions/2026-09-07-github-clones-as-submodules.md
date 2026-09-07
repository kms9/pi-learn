---
title: 2026-09-07 现有 GitHub 仓改为 submodule
type: session
status: active
created: 2026-09-07
updated: 2026-09-07
tags:
  - project-wiki
  - session
---

# 2026-09-07 现有 GitHub 仓改为 submodule

## 用户要做什么

把当前已有的 GitHub 仓库当作 submodule 加载，方便后续同步。

## 达成了什么

- 9 个本地 clone 转为 submodule（`absorbgitdirs`，未重新 clone）
- `.gitignore` 不再忽略这些路径
- `./scripts/sync-submodules.sh` 用于 `--remote` 更新
- Q3 关闭

## 写回了哪些 wiki 页

- [[decisions/2026-09-07-github-clones-as-submodules]]
- [[overlay/仓库结构]]
- [[questions/open-questions]]
