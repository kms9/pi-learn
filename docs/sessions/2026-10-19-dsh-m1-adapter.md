---
title: 2026-10-19 DS Bot + Squad M1：Controller 迁移与 DSH Adapter
type: session
status: active
created: 2026-10-19
updated: 2026-10-19
tags:
  - dsh-bot
  - pi-squad
---

# 2026-10-19 DS Bot + Squad M1：Controller 迁移与 DSH Adapter

## 做了什么

- 用户拍板 D1–D12（[[decisions/2026-10-19-dsh-squad-dev-decisions|决策页]]），写进规划；从 `feat/dsh-dev-plan` 切 `feat/dsh-m1` 开发 M1。
- **M1-1**：`pi_squad/controller` 复制到 `dsh_squad/controller`，新 module 路径，只保留宿主 profile `dsh/0.2.1-rc.2+ds-bot/e13bc34`，项目目录 `.agents/dshsquad/`，环境变量前缀 `DSH_SQUAD_`。
- **M1-2**：协议 `squad/3`（`dsh_squad/protocol/`）：`X-Squad-*` 头；每个受控（Bot, 位置）带 `host` 绑定注册为一个 runtime；能力名 `input_gate/settle_judge/route_freeze/context_sections`；扣留输入接口；中断原因加 `host_restart`、`outcome_unknown`。
- **M1-3/4/5/7/8**：`dsh_squad/gate` 改名为 `dsh_squad/adapter`：注册、心跳、拉取派发、用 Controller 的 fencing token 准入、按顺序上报回执链、renew、settled 或中断（持久 outbox）；任务工具 `squad_task/submit_result/yield/delegate/clarify`；正式任务内只放行合同里的工具；`# Squad task` 提示段及其 hash；切段重新注册；宿主重启上报 `host_restart`。seam 补丁升到 v2（`defineTool`、`bots`）。
- **M1-6**：删除业务 120 秒截止；父任务有未结束的 child 时 `result_proposed` 返回 `CHILDREN_PENDING`。
- 测试设施：`probes/squad-mock.mjs`（脚本化 Squad 回合）、`probes/drive-m1.mjs`（真 Controller + Adapter 端到端）、`dsh_squad/scripts/check.sh`。

## 验证（只是开发期回归，不是验收）

- `check.sh`：Controller 编译/vet/单测通过（scheduler 新增 6 个流程测试），Adapter 25/25，ds-bot 638/638。
- `drive-p1`（测试替身模式）14/14；`drive-m1` 7/7：正式任务全链路、重复 request_id、bash 被拒、缺结果进 `needs_review`、扣留输入进 Controller、宿主重启 `host_restart` 且 0 次重放。

## 过程中发现

- DSH 把系统提示也放进 `messages`，mock 要在消息里找 `# Squad task`。
- `needs_review` 的 attempt 会占住 Bot，直到 operator `reconcile`（Q40）。
- 回归驱动要 `export` 环境变量：用例里会重启宿主，没导出的变量会丢（第一次基线 N12 因此失败）。

## 未决

Q35（外层插件绕过负例）、Q36（扣留输入的分类，M2-2）、Q39（切段端到端）、Q40（恢复操作的界面）。
