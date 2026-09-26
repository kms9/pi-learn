---
title: Pi Squad 身份占用与 suspect 投递规则
type: decision
status: active
created: 2026-09-21
updated: 2026-09-21
decision_date: 2026-09-21
tags:
  - project-wiki
  - decision
  - pi-squad
---

# Pi Squad 身份占用与 suspect 投递规则

## 决策

- 身份占用优先：旧 Pi 失租但可能仍在时拒绝新 runtime；直到正常认证退出，或用户确认后显式释放身份。
- suspect 时拒绝新的消息/任务并明确报不可联系；恢复 online 后由调用者重试，不自动排队、重试或补发。

## 背景

00 的单身份互斥与 01 的 2/6/10 秒租约需要分别定义。租约失效无法证明 Pi 进程退出，更无法证明本地副作用停止；产品不自动管理 Pi 进程。

## 证据

用户本轮两次明确选择：

> 先拒绝新 Pi，待我确认旧 Pi 退出或显式释放身份

> 暂停并明确报不可联系；恢复 online 后由调用者重试（推荐）

协商：Codex、用户指定 Herdr Grok `w3:p1`、Cursor `w6:p1`，详见会话页。

## 影响

- ownership 持久化，与 lease/presence 分开；断线、offline、daemon 重启不释放所有权。
- 增加 operator-only CAS release，校验完整身份、expected runtime/binding_epoch；撤销旧runtime和连续性摘要。释放不是kill，不承诺物理进程唯一。
- 原持有人凭进程secret、服务端持久校验摘要重连；失租/服务重启后重绑增加binding_epoch。
- 后续send/ask/invoke对suspect返回AGENT_SUSPECT、retryable=true；00/01尚未开放这些能力，仍返回CAPABILITY_UNAVAILABLE。
- 异常退出未提交释放时，需要用户显式release；不能通过PID猜身份或自动抢占。

## 复审触发条件

用户要求自动故障转移、进程管理、跨机器或副作用严格隔离时重新设计，不能静默改为租约过期接管。

## 相关页面

- [[sessions/2026-09-21-pi-squad-00-01-review|三方评审与实施顺序]]
- [00身份](../../pi_squad_case/00-identity-protocol/README.md)
- [01发现](../../pi_squad_case/01-agent-discovery/README.md)

实现澄清（后续Codex/Grok协商）：正常认证quit与显式release使用同一撤销原语，提交后旧runtime不得因ACK丢失重新占回。该澄清沿用本次决定，不是新增用户授权；详见会话页再次协商记录。
