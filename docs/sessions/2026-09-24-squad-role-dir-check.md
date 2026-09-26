---
title: 2026-09-24 角色目录与发现链路可见验收
type: session
status: active
created: 2026-09-24
updated: 2026-09-24
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-09-24 角色目录与发现链路可见验收

## 用户要做什么

按检查规范重做 Pi Squad 测试：新 workspace，直接看 pane，验证角色目录加载和 list_agents / get_agent。旧平铺文件的报错要标成预期负例。

## 达成了什么

在 Herdr workspace `squad-check`（`wC`）用独立端口 `127.0.0.1:18771` 和临时库跑通。没有改插件或 Controller，没有碰 `wA`。

正常两个 Pi 加载 `.agents/roles/<role>/role.md` 并注册。whoami 的 role_dir、config_path、cwd、runtime_id 与启动目录一致，两个 runtime_id 不同。role.md 旁的 notes.md、JSON、runtime 子目录没有进入 role_prompt，mtime 未变。两边都按角色 list_agents，再用返回的 agent_id get_agent。

`wC:p5`（标签 `NEG flat-role`）是预期拒绝：旧平铺 `reviewer.md` 报迁移错误且未注册。这不是正常角色加载失败。没有消息工具，本次不把发现通过写成通信通过。

## 写回了哪些 wiki 页

- 本页、主索引、日志。
- 验收记录：`pi_squad_case/role_dir_check/RESULT.md`。

## 相关页面

- 规范：`pi_squad/AGENTS.md`
- 前序：[[sessions/2026-09-24-squad-role-directories]]
