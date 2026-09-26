---
title: 2026-09-24 整理 Pi Squad 配置与启动说明
type: session
status: active
created: 2026-09-24
updated: 2026-09-24
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-09-24 整理 Pi Squad 配置与启动说明

## 用户要做什么

把 Pi Squad 插件的配置和启动收成一份说明。以后功能开发完成时，继续更新这份说明，补上对应的配置和使用方式。

## 达成了什么

- 结论: 使用说明固定为 `pi_squad/USAGE.md`。扩展 README 和阶段 README 不再各写一套启动命令。
- 维护规则写在该文件开头，并记入 `AGENTS.md`：给 `pi_squad/` 增加已经能用的功能时，同一次改动更新配置字段、启动命令和会话内用法。未落地的能力不写进去。
- 当前文档覆盖 Controller 启动、`PI_SQUAD_CONFIG`、只注册的环境变量、`/squad-whoami` 和 `list_agents`。

## 写回了哪些 wiki 页

- [[concepts/pi-squad]]
- 本页；`docs/index.md`、会话索引、`docs/log.md`

## 未决

- 无

## 相关页面

- 概念: [[concepts/pi-squad]]
- 使用: `pi_squad/USAGE.md`
