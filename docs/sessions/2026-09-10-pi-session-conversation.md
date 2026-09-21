---
title: 2026-09-10 澄清 UI 对话对应 session
type: session
status: active
created: 2026-09-10
updated: 2026-09-10
tags:
  - project-wiki
  - session
---

# 2026-09-10 澄清 UI 对话对应 session

## 用户要做什么

对照 `pi-dev`，弄清 TUI 上「一次对话」叫什么：是 session 还是别的。

## 达成了什么

- 结论: UI 上的整段对话是 **session**（一份 JSONL + 一个活的 `AgentSession`）。`conversation` 不是 API。
- 一层输入是 **agent run**（到 `agent_settled`）；其中每次 LLM+工具是 **turn**。session 内部是 `id`/`parentId` 树，TUI 只渲染当前 leaf 路径。
- 不要把本 wiki 的 `docs/sessions/`、Chord session worker、DSH session log 和这个产品 session 混为一谈。

## 写回了哪些 wiki 页

- [[concepts/session|Session]]
- [[concepts/_index|概念索引]]、[[index|知识库索引]]、[[log|Wiki 日志]]
- [[sources/pi-agent-core|Pi agent core]]、[[concepts/harness|Harness]]、[[learning/怎么学写插件|怎么学写插件]] 补了指向

## 未决

- 无新开放问题。experimental `AgentHarness` 的 Session/Branch/Lane 仍见 [[questions/open-questions|Q5]]，本次只讲默认 TUI 路径。

## 相关页面

- 概念: [[concepts/session|Session]]
- 学习: [[learning/怎么学写插件|怎么学写插件]]
- 来源: `pi-dev/packages/coding-agent/docs/sessions.md`、`session-format.md`、`usage.md`；`docs-zh/.../extensions.md`
