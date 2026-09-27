---
title: 2026-09-27 阶段 04 OpenSpec 提案
type: session
status: active
created: 2026-09-27
updated: 2026-09-27
tags:
  - project-wiki
  - session
  - pi-squad
  - openspec
---

# 2026-09-27 阶段 04 OpenSpec 提案

## 用户要做什么

使用 openspec-propose 将 `pi_squad_case/04-team-orchestration` 转为完整规划产物。

## 达成了什么

- 创建本地 change `pi-squad-team-orchestration`，使用配置的 spec-driven schema；未选外部 store。
- [提案](../../openspec/changes/pi-squad-team-orchestration/proposal.md)、[设计](../../openspec/changes/pi-squad-team-orchestration/design.md)、[任务](../../openspec/changes/pi-squad-team-orchestration/tasks.md) 和六份 capability specs 将 TR-01—18 与 89 个原用例转为 OpenSpec 契约；任务按 M0—M9、4a 71 / 4b 18 分段，含 INV-01—15 映射和每项验证方式。
- 读取当前实现及附近配置/SSE 测试，确认固定端口、旧目录、整段 prompt、独立 input hook 和 Registry 跨事务失效等改动落点。沿用本批用户裁决，不改变整体 roster 占用、显式取消释放、故障恢复门与阶段 03 并入。
- 本轮仅规划及 wiki 写回；未修改插件代码、运行配置或 submodule，未启动 Pi、迁移数据库或派发验收，未将 89 项记为已通过。

## 写回了哪些 wiki 页

- 本会话页、主索引和日志；长期决策继续引用原决策页，不创建重复裁决。

## 未决

- 实际安装 Pi 的能力与版本尚未运行探针，按 M0 doctor 验证；能力不足须阻止正式调用。
- 所有实施任务未执行；需用户另行发起 apply。

## 相关页面

- 决策: [[decisions/2026-09-27-squad-phase04-activation-and-split]]
- 前序评估: [[sessions/2026-09-27-pi-squad-phase04-code-gap]]
- [权威需求及验收](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md)
