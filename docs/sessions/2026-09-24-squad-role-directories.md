---
title: 2026-09-24 将角色配置迁入独立目录
type: session
status: active
created: 2026-09-24
updated: 2026-09-24
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-09-24 将角色配置迁入独立目录

## 用户要做什么

立即修改当前角色布局，使每个角色有独立目录、目录内包含角色设定 Markdown，并为后续动态信息预留位置。

## 达成了什么

- 改为 `.agents/roles/<name>/role.md`，迁移本仓两个示例。
- 加载器只读取固定入口，不扫描同目录其它内容；增加 roleDir 与 whoami.role_dir，保留目录名匹配、普通文件、大小与 YAML 校验。
- 更新使用说明、当前阶段契约及已有配置验证 fixture，补充同目录动态文件不会进入提示、旧布局和缺入口错误用例。
- 仅执行语法与 diff 静态检查，验收继续由用户指定的 Herdr w7:p1 Claude Code 负责；未执行测试套件或重启现有 Pi。

## 写回了哪些 wiki 页

- 本页、决策页、Pi Squad 概念、前序格式决策、主索引/决策索引、日志。

## 未决

- 等待独立验收。动态信息的格式/读写/实例隔离留到实际实现时定义。

## 相关页面

- 决策：[[decisions/2026-09-24-squad-role-directories]]
- 概念：[[concepts/pi-squad]]
- 使用：`pi_squad/USAGE.md`

验收交接：Herdr 查得原 w7:p1 已迁为 wB:p1，同一 terminal_id；已向 wB:p1 的 Claude Code 提交目录布局验收，并说明其 get_agent_acceptance fixture 由其自行更新。尚未收到验收结果。
