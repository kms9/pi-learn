---
title: 2026-09-24 收敛 Squad 角色文件内容
type: session
status: active
created: 2026-09-24
updated: 2026-09-24
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-09-24 收敛 Squad 角色文件内容

## 用户要做什么

确定使用 Markdown + YAML frontmatter，综合几家角色定义的优点；暂不考虑 tools/model/skills、智能体历史和状态。

## 达成了什么

格式与范围记入 [[decisions/2026-09-24-squad-role-frontmatter]]。建议只保留 name、description 和正文，角色定义中不混入实例身份配置。

| 来源 | 本次吸收 |
|---|---|
| Claude Code | name 作为角色选择键，description 简介，Markdown 正文写指令 |
| pi-subagents | 一个角色一个文件，项目内维护，正文承载 system prompt |
| Multica | description 与 instructions 分工；指令覆盖职责、工作风格、边界、交付要求 |
| OpenClaw | 正文明确行为原则、沟通风格和边界；本轮不引入连续记忆和多文件人格结构 |

建议 `.agents/roles/reviewer.md`：

```markdown
---
name: reviewer
description: 审查代码变更，定位正确性、并发和回归风险。
---

# 职责
你是项目的代码审查者，负责找出有证据、可复现、值得修复的问题。

# 工作方式
- 先阅读项目约定和变更，再检查相关调用链与测试。
- 优先检查正确性、边界条件、并发和兼容性。
- 区分已确认的问题与尚待验证的推测。

# 边界
- 默认只审查；修改代码前先确认任务要求包含修复。
- 不因个人偏好要求无关重构。
- 证据不足时说明缺口，不编造结果。

# 交付要求
- 每项问题给出严重程度、文件位置、触发条件和影响。
- 给出最小修复建议与验证方法。
- 没有发现问题时明确说明，并列出未验证的部分。
```

小节标题仅用于人类编辑，不是必须被程序识别的字段。“默认只审查”是行为指导，本轮不实现工具权限限制。每次任务内容由会话输入提供，不写死在角色文件。

加载建议：启动 cwd → 扫描 `.agents/roles/*.md` → `PI_SQUAD_ROLE_ID` 匹配 name → 校验并缓存正文 → 每轮通过既有钩子追加。保留原 Pi system prompt；不把全部 frontmatter 序列化后注入。推荐必填 name/description/正文，未知字段明确提示，重复 name 不静默覆盖。

## 写回了哪些 wiki 页

- 本页、决策页、前序评估、来源摘要、来源登记、Pi Squad 概念、开放问题、索引和日志。

## 未决

- name/description 最小 schema 与 `.agents/roles` 子目录是建议，尚未实施。
- 启动时如何补齐既有 Registry 所需 agent_id/squad_id，及旧 JSON 入口迁移策略，仍待实施时定稿；不扩展为历史/状态管理设计。

## 相关页面

- 决策：[[decisions/2026-09-24-squad-role-frontmatter]]
- 概念：[[concepts/pi-squad]]
- 来源：[[sources/agent-role-config-references]]
