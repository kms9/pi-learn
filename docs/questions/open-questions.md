---
title: 开放问题
type: question-log
status: active
created: 2026-09-07
updated: 2026-10-04
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

| Q13 | Role 的 agents.md 何时生效？ | closed | 以阶段 04 统一需求 TR-08 为准：每个新 Attempt 读取并固定快照，continuation 不热换。见 [[decisions/2026-09-27-squad-phase04-activation-and-split]]。 |
| Q14 | Leader 是否复用普通 Role、是否运行中切换 Team？ | closed | 以 TR-02 为准：启动固定 `mode=leader` + `team_id`，一个进程只绑定一个 Team，不在进程内切换。见 [[decisions/2026-09-27-squad-phase04-activation-and-split]]。 |
| Q15 | 任务/质量锁的参数与受管 session 迁移怎么定？ | superseded | 阶段 04 统一需求改为沿用目标既有会话（不另建受管 session 目录）；容量写在 team.json policy；Role 在 Team 激活时整体占用。ExecutionLease 的具体 TTL/续约值未在需求中规定，实施 M2 时记录实际值，不沿用旧稿 30s/8 槽。见 [[decisions/2026-09-27-squad-phase04-activation-and-split]]。 |
| Q16 | 阶段 03 未实现，P4 的 M2/M3 是否吸收 INV-01—15？ | closed | 用户确认：阶段 03 能力由 4a 交付，阶段 03 文档只删除冲突点，INV 判据并入需求 2.6 映射用例。见 [[decisions/2026-09-27-squad-phase04-activation-and-split]]。 |
| Q17 | P4 是否拆为单 Team 与多 Team 两段；跨 Team Role ownership 检测死锁还是预防？ | closed | 用户确认：拆为 4a（71 项）/4b（18 项）；Team 激活时原子占用 roster 全部 Role，任一被占则整体排队，结构上预防跨 Team 互占。见 [[decisions/2026-09-27-squad-phase04-activation-and-split]]。 |
| Q18 | 失联进程无停止回报时如何解除隔离？ | closed | 用户确认：允许显式人工停止声明并保留精确绑定/原因/证据审计。见 [[decisions/2026-09-27-squad-recovery-guidance-acceptance]]。 |
| Q19 | Leader 活动 Run 期间普通输入是什么语义？ | closed | 用户确认：作为 run_guidance，在安全边界应用。见 [[decisions/2026-09-27-squad-recovery-guidance-acceptance]]。 |
| Q20 | Project 管理操作由谁授权？ | closed | 用户确认：Project 管理员与独立 operator 凭据；runtime 模型凭据不可管理。见 [[decisions/2026-09-27-squad-recovery-guidance-acceptance]]。 |
| Q21 | Task 默认由谁验收，父子/review 如何避免自锁？ | closed | 用户确认：声明 checker 或独立 reviewer；standalone 无 reviewer 人工验收；版本化父覆盖、控制节点不递归。见 [[decisions/2026-09-27-squad-recovery-guidance-acceptance]]。 |
| Q22 | Pi Squad 在 Pi 1.0.1 的真实兼容回归是否通过？ | open | P0 和选定 P1 已实施；独立 1.0.1 三角色与 schema 2 核心事件真实就绪，兼容场景 14 PASS / 5 PARTIAL。阶段04原规格随后独立完成89/89，未据此补齐额外兼容分支，全局 Pi 仍 1.0.0。见 [[sessions/2026-10-04-pi-squad-pi-1.0.1-implementation]]。 |
| Q23 | 受管 Squad 正式支持 RPC 模式，还是只支持 TUI？ | closed | 用户明确选择 TUI-only；已在注册前拒绝 RPC/JSON/print，普通 Pi 可继续使用；真实 RPC get_state 正常且没有 Squad 注册。见 [[decisions/2026-10-04-squad-pi-1.0.1-tui-scope]]。 |
| Q24 | Pi 1.0.1 兼容表的剩余运行分支何时补齐？ | open | 阶段04现已补验真实compact/bash/fork/tree与代表性护栏；其余嵌套/exposure逐变体、隔离纯pending回调和非OpenAI chat provider增量仍未全部实跑，独立native binary未验收。具体覆盖见阶段 04 compatibility/README.md；当前不推导这些分支 PASS。 |
