---
title: 开放问题
type: question-log
status: active
created: 2026-09-07
updated: 2026-09-25
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
| Q8 | 旧 Pi 失租但进程尚在时，新 runtime 是否可取得相同 agent_id？ | closed | 2026-09-21 评审中曾称 Q6。用户决定占用优先：拒绝新实例，直到确认旧实例退出或显式释放。见 [[decisions/2026-09-21-squad-ownership-and-suspect]]。 |
| Q9 | suspect 时是否拒绝新的 send/ask/invoke？ | closed | 2026-09-21 评审中曾称 Q7。用户决定拒绝并报不可联系；恢复 online 后由调用者重试，不自动排队/补发。见 [[decisions/2026-09-21-squad-ownership-and-suspect]]。 |
| Q10 | Squad 角色源格式如何选择？ | closed | 用户已选择 Markdown + YAML frontmatter；暂不考虑 tools/model/skills、历史与状态。见 [[decisions/2026-09-24-squad-role-frontmatter]]。 |
| Q11 | Squad 新角色入口如何衔接启动身份、迁移旧 JSON？ | closed | 已落地：name/description/正文，agent_id/squad_id 必须由环境提供；非空 PI_SQUAD_CONFIG 明确报迁移错误。见 [[sessions/2026-09-24-squad-frontmatter-runtime-implementation]]。 |
| Q12 | HTTP P2 如何衔接旧 ownership 决策、runtime 绑定校验及离线消息语义？ | open | 当前 UUID 只是属性；建议拒绝旧实例、离线留失败记录且不自动补投，需在 HTTP P2 合同中明确。见 [[sessions/2026-09-24-squad-messaging-readiness]]。 |

| Q13 | Role 的 agents.md 何时生效？ | open | 2026-09-25 技术稿建议 attempt 开始读取并固定 hash，执行中不变；用户未逐项确认此刷新策略。见 [[sessions/2026-09-25-squad-team-runtime-design]]。 |
| Q14 | Leader 是否复用普通 Role、是否运行中切换 Team？ | open | 首版提案固定 mode=leader 与 team_id，只加载 Team 配置；未来组合 leader.role_ref / 跨 Team 切换另议，不能冒称 Multica 也是启动固定身份。 |
| Q15 | 任务/质量锁的参数与受管 session 迁移怎么定？ | open | 将“质量”解释为质量审查；建议 TTL 30s/续约10s、项目8槽/2活跃Team，失租隔离；session 用 Pi --session-dir 定位 .runtime 下并验证，不自动搬旧 JSONL。参数与校验实施待确认。 |
