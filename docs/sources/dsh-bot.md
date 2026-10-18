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
- 原生 Agent/Session/Tool/Provider 参考：已有 `deepseek-harness/`。

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
