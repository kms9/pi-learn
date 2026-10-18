---
title: 2026-10-18 seam 以补丁形式实现，Gate 由 ds-bot 自己的链调用
type: decision
status: active
created: 2026-10-18
updated: 2026-10-18
decision_date: 2026-10-18
tags:
  - project-wiki
  - decision
  - dsh-bot
---

# 2026-10-18 seam 以补丁形式实现，Gate 由 ds-bot 自己的链调用

## 决策

1. ds-bot 的改动放在本仓库的 `dsh_squad/patches/ds-bot/*.patch`，构建时从子模块导出代码再打补丁（`dsh_squad/scripts/prepare-ds-bot.sh`）。不改子模块，不维护 fork 分支。
2. Squad Gate 是一个独立插件，经 `dsBotSeam` 服务接入。受控会话的每一步都由 ds-bot 自己最外层的 pre-step 先交给 Gate；Gate 不再单独注册 pre-step 监听去和别的插件争顺序。
3. 不挂 Gate 时，补丁后的 ds-bot 与上游行为一致。
4. 只有带当前 fence 的 `source.kind='squad'` 输入才能开启 attempt。`allowResume`、`allowSelfStart` 默认关闭。
5. 结束判定必须同时满足：实时结束、持久日志确认、工具调用配对、没有待处理的审批。`whenIdle` 和 `turn-stopping` 不作为依据。

## 背景

P0 报告确认：归属空窗（H2）、pre-step 顺序不可控（H7）、自动重放（H5）、静默回退。AGENTS.md 要求不改上游 clone。

## 证据

- 来源：`probes/scenarios-p1/` 负例 14/14；ds-bot 单测 638/638；Gate 单测 18/18。
- ds-bot 源码自己注明 reload 会改变 pre-step 监听的顺序（`src/host/time-context.js`）。

## 影响

- 每次升级 DS Bot 都要重新打补丁并跑测试。
- 长期应按上游流程提 seam 设计 PR（`docs/plans/`），被接受后删掉补丁。

## 复审触发条件

- 上游接受或拒绝 seam PR。
- 补丁在新的 DS Bot 版本上打不上。
- DSH 提供带优先级的 pre-step 或其他原生 gate。

## 相关页面

- 会话：[[sessions/2026-10-18-dsh-p1-seam|P1 seam 原型]]
- 决策：[[decisions/2026-10-18-dsh-p0-version-pin|P0 版本统一]]
