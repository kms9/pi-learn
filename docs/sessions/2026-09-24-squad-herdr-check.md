---
title: 2026-09-24 Pi Squad 检查必须新开 space
type: session
status: active
created: 2026-09-24
updated: 2026-09-24
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-09-24 Pi Squad 检查必须新开 space

## 用户要做什么

记住插件检查的开法，放到会被加载的规范里。

## 达成了什么

上次可见检查是在 Herdr 里直接看进程，不是靠脚本。用户随后把 Controller、Pi 和 Dashboard 挪进独立 workspace，并把验收用的 Claude pane 留在外面。固定下来的规则：

1. 当前 Herdr 会话里新开 workspace。
2. 至少启动三个不同角色的 Pi，每个角色一个终端。三个节点指角色，不是 Controller、单个 Pi 和 Dashboard。
3. 打开对应该 Controller 的 Dashboard，`tui --url` 单独一个终端，不往 serve 里输入。

写在根 `AGENTS.md` 和 `pi_squad/AGENTS.md`。不改生产代码，不碰已经在跑的 `wA` 服务。

## 写回了哪些 wiki 页

- 本页、主索引、日志。

## 相关页面

- 规范：`pi_squad/AGENTS.md`
- 用法：`pi_squad/USAGE.md`
