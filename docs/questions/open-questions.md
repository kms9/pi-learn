---
title: 开放问题
type: question-log
status: active
created: 2026-09-07
updated: 2026-09-23
tags:
  - project-wiki
  - questions
---

# 开放问题

| ID | 问题 | 状态 | 备注 |
|----|------|------|------|
| Q1 | overlay 的 GitHub 远程仓库名、公开还是私有 | open | 本地已有首笔 commit，未加 origin |
| Q2 | `docs-zh` 里尚未翻译的上游文档（`sync-zh.py` 列出约 17 篇）要不要补 | open | 含 `pi-dev/README.md`、`coding-agent/README.md` 等 |
| Q3 | `pi-dev` 以后是否改成 git submodule | closed | 2026-09-07 已把现有 GitHub clone 全部收成 submodule |
| Q4 | 用户自己的新插件代码放哪（本仓子目录 / 另开仓 / `~/.pi/agent/extensions`） | open | 未指定前不要写进 `pi-dev/` |
| Q5 | Pi coding-agent 默认路径何时切到 `AgentHarness` | open | 2026-09-07 对照：默认仍是 `Agent`/`agentLoop`；`AgentHarness` 在 `packages/agent` 与 `coding-agent/src/experimental/`。Mario X 帖称新 harness 未进 coding-agent 默认产品。 |
| Q6 | `herdr_session_id` 是否要求 Herdr `--env` 旁路，还是长期允许空 | open | P0 允许空；pane 默认不注入 `HERDR_SESSION`。见 [[decisions/2026-09-23-p0-identity-fields]]。 |
| Q7 | 2026-09-21 UDS/`squad` 规划是否废弃 | open | 与 2026-09-23 HTTP P0 并存；当前实现只跟 Notion P0。未删 `00-identity-protocol`。 |
