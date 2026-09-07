---
title: 原始证据层
type: process
status: active
created: 2026-09-07
updated: 2026-09-07
tags:
  - project-wiki
  - raw
---

# 原始证据层

`raw/` 在本仓库里主要是**登记和说明**，不是把上游源码再复制一份。不可改写的证据在这些地方：

| 位置 | 是什么 | 谁维护 |
|------|--------|--------|
| `pi-dev/` 等 | 现有 GitHub 仓，overlay 里是 submodule | `./scripts/sync-submodules.sh`；不要改里面的文件当 overlay 作品 |
| `docs-zh/` | 上游文档/注释的中文镜像，路径与 `pi-dev/` 对齐 | overlay 仓库；用 `scripts/sync-zh.py` 对照哈希 |
| 本目录后续子路径 | 会话摘录、外部文章导出等 | ingest 时登记，不要改已登记原文 |

Wiki 编译层在 `docs/`。规则层在根目录 `AGENTS.md`。
