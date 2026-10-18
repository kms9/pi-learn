---
title: 2026-10-18 P0 版本统一：DSH 0.2.1-rc.2 + DS Bot main
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

# 2026-10-18 P0 版本统一：DSH 0.2.1-rc.2 + DS Bot main

## 决策

- `deepseek-harness` gitlink 固定为 `687f282e8625c6b8d11ff58211a90524be2e4317`（`dsh-v0.2.1-rc.2`）。
- `dsh-bot` gitlink 保持 `e13bc3419d2695a509520d850a07e63f05c34e07`（上游默认分支 `main`）。
- DS Bot 声明的 DSH 是 0.2.0-rc.2。不改上游文件，而是在 `probes/versions.lock.json` 里覆盖为 0.2.1-rc.2。
- P0 的运行时用 npm `@deepseek-ai/dsh@0.2.1-rc.2`，和子模块是同一个 tag。

## 背景

读代码评估发现三处版本不一致：主仓钉 0.1.6-alpha.2；子模块检出 0.2.1-rc.2；DS Bot 要求 0.2.0-rc.2。用户要求升级到各自上游最新并统一。

## 证据

- 来源：`git ls-remote`，2026-10-18。DSH master HEAD 等于 `dsh-v0.2.1-rc.2`；npm `next` 为 0.2.1-rc.2，`latest` 为 0.2.0-rc.2。DS Bot main 是 `e13bc34`，`v0.1.7` = `939a663`，是 main 的祖先；上游分支 `chore/dsh-0.2.1-rc.2@5c6e116` 做同样的升级，尚未合入。
- DS Bot main 在 0.2.1-rc.2 上 `npm test` 635/635 通过，`npm run lint` 无错误。

## 影响

- 不选 `dev` 或 `chore/dsh-0.2.1-rc.2`：它们是未发布的分支。等 DS Bot 发布内置 0.2.1 的 tag 后再改 gitlink。
- 源码 checkout 要完整 monorepo 构建（`pnpm build`）才能直接运行。P0 不依赖它；构建留到需要读改 DSH 内部时再做。

## 复审触发条件

- DS Bot 发布声明 DSH ≥0.2.1 的 release 或 tag。
- DSH 发布 0.2.1 正式版。
- M1 需要在 DSH 源码层面调试。

## 相关页面

- 会话：[[sessions/2026-10-18-dsh-p0-probe|P0 版本统一与探针实测]]
- 决策：[[decisions/2026-10-18-dsh-bot-squad-migration|DS Bot 产品化入口与 Squad 迁移]]
