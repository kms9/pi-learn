---
title: 2026-09-24 Squad 一角色一目录
type: decision
status: active
created: 2026-09-24
updated: 2026-09-24
decision_date: 2026-09-24
tags:
  - project-wiki
  - decision
  - pi-squad
---

# 2026-09-24 Squad 一角色一目录

## 决策

用户要求现在就将独立 Markdown 文件改成每角色独立目录，为后续同目录动态信息预留空间。实现目录为 `.agents/roles/<name>/role.md`，取代原 `.agents/roles/<name>.md` 平铺布局。

## 背景

角色设定仍用 Markdown + YAML frontmatter，但角色目录应作为一组相关文件的容器，而非只能存一份提示文件。

## 证据

- 用户本轮明确要求。
- `pi_squad/extension/config.ts`、`index.ts`、`.agents/roles/`。

## 影响

- name/description/正文格式不变；目录名必须匹配 name，入口固定为 role.md。
- 只枚举 roles 的直接子目录、读取各目录 role.md；角色目录中的其它 Markdown、JSON 和子目录不解析、不注入、不修改。
- 新增本地 roleDir 字段，whoami 输出 role_dir；Controller 数据结构无需变化。
- 本仓 reviewer/backend 示例移入对应目录；旧平铺 Markdown 给出迁移提示，不静默兼容，不自动搬动其它项目文件。
- 配置仍是进程启动快照，重启 Pi 后生效。
- 当前不实现动态信息存储。多个实例共用角色目录，未来如持久化实例信息需按 runtime_id 区分，避免相互覆盖。

## 复审触发条件

开始实现动态信息时，再明确哪些数据按角色共享、哪些按实例隔离、读写时机与持久化责任；本轮不预先引入历史或状态管理。

## 相关页面

- 会话：[[sessions/2026-09-24-squad-role-directories]]
- 前序：[[decisions/2026-09-24-squad-role-frontmatter]]
- 概念：[[concepts/pi-squad]]
