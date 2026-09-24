---
title: 2026-09-25 澄清角色实例与执行租约
type: session
status: active
created: 2026-09-25
updated: 2026-09-25
tags: [project-wiki, session, pi-squad]
---

# 2026-09-25 澄清角色实例与执行租约

## 用户要做什么

详细理解共享角色模板/实例、当前 Team 上下文，以及原子获取、续约、实例绑定、旧结果拒绝、失租隔离和显式恢复。

## 达成了什么

以两个 Team 共用 reviewer 为例，区分配置复用与运行实例复用；以 Controller 断线但 Pi 仍运行为例，解释失租不等于停止。明确续约由 Extension 处理，正常结束自动释放，故障状态不明才需要对账。审查同样占 Pi 执行容量，适用统一租约。

## 写回了哪些 wiki 页

- [[concepts/squad-role-instance-lease]]
- 主索引、日志。

## 未决

未调整工程提案和既有开放问题；用户询问解释，不表示已确认所有租约参数或恢复细节。

## 相关页面

- 概念：[[concepts/pi-squad]]、[[concepts/squad-role-instance-lease]]
- 先前会话：[[sessions/2026-09-25-squad-team-runtime-design]]
