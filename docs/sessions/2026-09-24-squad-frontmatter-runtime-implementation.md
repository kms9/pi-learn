---
title: 2026-09-24 实现 Squad Markdown 角色与运行元数据
type: session
status: active
created: 2026-09-24
updated: 2026-09-24
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-09-24 实现 Squad Markdown 角色与运行元数据

## 用户要做什么

按已确定的 Markdown + YAML frontmatter 优化 Extension，同步 Controller 数据结构，新增当前 cwd 和每次运行 UUID 上报。

## 达成了什么

- `.agents/roles/*.md` 只接受 name/description，正文整体作为角色提示；PI_SQUAD_ROLE_ID 精确选择，Registry role 对应 name。
- agent_id/squad_id 仍必须由 PI_SQUAD_AGENT_ID / PI_SQUAD_ID 提供；description 上报 role_description，正文不上传。
- 新增 cwd（首次加载时 process.cwd()）与 runtime_id（crypto.randomUUID v4）。进程级缓存使 /new 和扩展 reload 保留 UUID、cwd、角色与身份；重启生成新 UUID。runtime_session_id 仍来自 Pi。
- 移除 JSON 角色入口；非空 PI_SQUAD_CONFIG 给明确迁移错误。无选择器安静停用。
- package.json/lock 显式声明 yaml 2.9.1 并提供包入口，新增 reviewer/backend 角色示例。
- Controller 注册/查询/SQLite 增加三个可空字段，事务式自动加列保留旧数据，验证绝对 cwd/UUID v4；CLI 自动返回字段，TUI 选中行展示。
- 保留现有主键、upsert 与心跳契约，不扩展历史、状态管理、模型/工具/技能。

## 验证

- `npm test --prefix pi_squad`：6 项通过，覆盖解析、错误、cwd 作用域、注册映射和跨进程 UUID。
- Controller `go test ./...`：全部通过，包括旧表迁移、重开持久化、重注册更新、字段校验和旧请求兼容。
- `verify-config-pi.mjs`：真实 Pi RPC 通过；两个角色注册与注入、裸 Pi 停用、cwd/UUID/简介、正文仅一次且不含 description、修改文件后 /new 和扩展 reload 保持启动快照；Pi session id 真实变化。最终验证用专用本地 provider，不发送模型 HTTP 请求。
- `smoke.sh`：隔离修复后通过，含超时离线与 Controller 重启持久化。
- 首次真实 Pi 断言失败是 macOS /var 到 /private/var 的物理路径差异；测试已 realpath 归一化。

## 验证期间的影响

原有 smoke 默认连接 127.0.0.1:18741，未验证自己的 Controller 是否成功启动，首次运行误连已运行服务并写入 backend/reviewer 测试注册字段。已向用户说明；无原记录快照，未猜测性还原。修复为独立端口、临时数据库、直接编译运行并管理子进程、端口占用拒绝与进程存活检查，隔离重跑通过。现有 Pi 用正确配置重新注册才能恢复其位置字段。

## 写回了哪些 wiki 页

- 本页、Pi Squad 概念、格式决策、开放问题、主索引及日志；使用说明和阶段需求/设计/验收/结果同步更新。

## 未决

- 本次配置与元数据验收不替代 P0 全部 Mandatory Cases；旧阶段未执行项仍保留。

## 相关页面

- 决策：[[decisions/2026-09-24-squad-role-frontmatter]]
- 概念：[[concepts/pi-squad]]
- 使用：`pi_squad/USAGE.md`
- 验收：`pi_squad_case/phase_00_identity/RESULT.md`
