---
title: 2026-10-22 Squad × DS Bot v0.2.0：评估与 O1–O7 优化
type: session
status: active
created: 2026-10-22
updated: 2026-10-22
tags:
  - dsh-bot
  - pi-squad
  - decision
---

# 2026-10-22 Squad × DS Bot v0.2.0：评估与 O1–O7 优化

分支 `feat/dsh-v02`（基于 `feat/dsh-t`）。评估与决策在 `docs/dsh-squad-v0.2-assessment-2026-10-21.md`；逐阶段记录见 `docs/log.md` 2026-10-21～22 各条。全程没有提交 key：每次提交前做了 `sk-` 模式和精确值扫描，均为 0。

## 结论

DS Bot v0.2.0 的原生能力里，Squad 继续自己做的是正式任务的派发、结束判定、验收和恢复；会话、群、工作区、模型路由、凭据交给 DS Bot。用户对 P1–P6 全部按推荐拍板（评估文档「决策记录」）。O1–O7 全部完成，暂缓项见下。

| 阶段 | 内容 | 提交 |
|---|---|---|
| 评估 | a/b/c 三类对照、Go Controller 一节、O1–O7 计划、P1–P6 | `a44c40f` |
| O1 | 记忆复盘不处理受控会话（seam、`memory_review_gate`）；Bot 发言不算指导；暂停宽限 | `c0cd9c1` |
| O3/O4 | 心跳带路由档位和工作目录；无变化的心跳不写事件 | `12767b6` |
| O2（P1 = A） | Run 进行中拦下改受控 Bot 的模型/档位 | `f679c34` |
| O5（P2 = C） | 小队群里发提醒，链接打开 Squad 页面对应节点；P4 文档 | `ced5d5f` |
| O6（P3 = B） | 不带 key 也能启动，在 DS Bot 页面填 key，存 DSH 凭据库 | `3eb52ba` |
| O7（P5 = A，P6 = B） | 正式任务只读写进校验；宿主证明已停止时自动对账、不自动重试 | `b0fbdd8` |

## O7 要点

- 只读（P5）：`write`/`edit`、非空 `writable_roots`、工作流步骤 `write_set`、建任务（直接与子任务）的 `write_set` 都以 `READ_ONLY` 拒绝。
- 自动对账（P6）：
  - 租约过期后，宿主恢复并上报同一 segment、fence 的 idle `settled`，执行释放，原因 `host_reconciled`。
  - 宿主重启后，adapter 在 `host_restart` 中断之后上报 `/stopped` 停止证据，执行释放。
  - 两条路径都不自动重试；点「重试」时不再要求确认已停止。`outcome_unknown`（宿主没重启）和宿主一直不回来时仍要人确认。
- Q49 关闭。

## 验证

每个阶段：Go 测试、adapter/client 单测、`check.sh`、mock 全量回归（drive-m0/m1/m2/m3/m4、ui-check、ui-p1…p6、ui-o5、drive-accept、drive-p1）。O7 一轮里：

- ui-p3 的一项按旧行为（重启后要确认已停止）失败，改为检查「宿主自己证明已停止、没有自动重试、重试不要确认」后单独重跑 24/24。
- drive-p1 的准备步骤一次「Builder 没有群会话」，单独重跑 14/14。
- 其余一次通过；drive-m1 M1-restart 新检查确认真实的重启路径执行被释放。

O6 用真实模型（deepseek-flash、high）验证过页面填 key，详见 log。

## 暂缓

- 调度只读未结束的 Run 和任务（O4）：现在规模没有收益。
- 扣留消息改读群日志、头像按 DS Bot 角色形象画（O3 可选项）。
- P2 的 B（在聊天里直接处理），以后再做。
