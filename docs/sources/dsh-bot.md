---
title: DS Bot（DeepSeek-Bot）源码与迁移扩展点
type: source
status: active
created: 2026-10-18
updated: 2026-10-18
tags: [dsh-bot, source, multi-agent]
---

# DS Bot 源码参考

- 上游：<https://github.com/Fei2411/DeepSeek-Bot>，`main@e13bc3419d2695a509520d850a07e63f05c34e07`。
- 本仓 git submodule：`dsh-bot/`；真实插件包在 `dsh-bot/ds-bot/`。
- 原生 Agent/Session/Tool/Provider 参考：已有 `deepseek-harness/`，2026-10-18 固定为 `dsh-v0.2.1-rc.2`。
- 2026-10-18 实测：`main@e13bc34` 声明 DSH 0.2.0-rc.2，但在 0.2.1-rc.2 上单元测试 635/635 通过；本仓库在 `probes/versions.lock.json` 中覆盖。上游 `chore/dsh-0.2.1-rc.2@5c6e116` 做同样的升级，未合入。
- P0 探针证据：`probes/scenarios/`，结论见 `docs/dsh-squad-p0-probe-report-2026-10-18.md`。DS Bot 不对外提供服务（没有 `ctx.provide`），外部插件只能读 `DSH_HOME/bot/state.json` 来推断 Bot↔Session，新 Session 第一步会有归属空窗。

| 源码（相对 dsh-bot/ds-bot/） | 主要功能和迁移关注点 |
|---|---|
| `index.js` | Cordis 插件装配 |
| `src/host/roster.js`、`agents.js` | Bot 身份、独立 Session |
| `src/host/groups.js` | Group Session、原生群轮次、`@Bot`、合成 `group_relay` |
| `src/host/tools.js`、`delivery.js`、`turns.js` | 普通 Handoff、`steer/followup`、事件及回复 |
| `src/host/handoffs.js` | 普通派活 `parent/open/results` 树；**非正式 Task Contract/Acceptance** |
| `src/host/models.js` | 每 Bot 独立模型/Effort、不可用模型 fallback |
| `src/host/prompt.js`、`memory.js` | 角色提示、个人与团队长期记忆 |
| `src/host/parts.js`、`resume.js` | 切段/压缩、重启自动续跑；受控运行需专门恢复门 |
| `src/host/channel.js` | Web 通信与 Host API |
| `src/client/index.js`、`details-drawer.js` | DS Bot 侧边栏和交互 UI Slots |
| `src/host/usage.js` | Token 分类，不等于已有 Task 级精确成本 |

重点：普通群聊和正式 Run 必须统一执行来源，不得由 `group_relay`、普通 Handoff、定时/自动恢复绕开 Controller；Bot 的私聊和不同群组 Session 不同；严格实验冻结模型、上下文和 Memory。

参考：[迁移方案](../../dsh_squad_case/MIGRATION_PLAN.md)、[DSH Agent](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md)、[DSH Tools](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/README.md)、[DSH Agent Teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/agent-team/README.md)、[DSH 多模型](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.zh.md)。
