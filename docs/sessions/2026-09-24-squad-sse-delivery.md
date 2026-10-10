---
title: 2026-09-24 SSE 唤醒与 Intercom 边界验收
type: session
status: active
created: 2026-09-24
updated: 2026-09-24
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-09-24 SSE 唤醒与 Intercom 边界验收

## 用户要做什么

减少 Controller 下发到 runtime 的等待，评估 SSE/长连接并落实优化；保留异步 ask、忙时排队、显式回复和重试，重点借鉴 Intercom 测试完成验收。

## 达成了什么

采用现有 HTTP 命令接口 + 单向 SSE inbox 唤醒。SSE 本身运行在 HTTP 上；当前需求无需为了单向下发改用 WebSocket 双向帧协议，也无需换 UDS broker。与长轮询相比，不必每次收到通知后重新建立请求；与直接流送消息正文相比，本次方案可继续复用既有 SQLite inbox、receipt、幂等和绑定校验。

新增 GET /messages/events：Authorization 请求头携带私有凭据，URL 仅含身份/UUID/session。服务端验证绑定，事务提交后通知目标；每 agent 一个订阅，容量 1 合并通知，不阻塞发送；10 秒保活，5 秒写超时，身份释放/会话切换关闭旧订阅。

Pi fetch 读取事件流：收到 inbox 立即补查，连接初始也补查，轮询进行中收到事件要再查一遍；正常 15 秒定期补查，断线回退 1 秒并退避重连，握手 5 秒和无数据 35 秒超时。/new/reload/shutdown 关闭旧代连接和计时器。SSE 不续心跳，不改变离线消息失败状态，不自动重发 send/reply。没有事件游标重放：持久 inbox 是事实来源，SSE 只是可合并的唤醒提示。

ask 仍立即返回 message_id；busy 队列等待，agent_end 后主动检查；显式 message_id 回复和 request_id 重试规则不变。新增 /squad-transport 诊断 mode/唤醒次数/重连/最后补查，不包含凭据。

新增绑定/通知与 SSE 解析测试源码；仅编译和类型检查，真实运行交给 Claude。针对 Intercom 用例追加 SSE-01—06 与 FLOW-01—03，覆盖分片、重复事件、迟到回调、重连、两发送者、busy 与回复归属。原阶段 partial 不因此变成通过。

## 写回了哪些 wiki 页

本页、主索引、来源登记、SSE 标准摘要、日志；使用说明和 phase_02_http_messaging 验收清单同步更新。

## 未决

- 端到端 commit→received 延迟未实测，不能承诺毫秒数。
- 自动 ask、故障窗口与旧测试迁移仍需 Claude 逐项收口；缺证据保留 NOT_RUN/PARTIAL。
- SSE 收到提示不代表消息收件、模型已执行或回复已送达。Controller 重启恢复依赖原数据库，删除数据库不在恢复承诺内。

## 相关页面

- [[sources/sse-standard]]
- [[sessions/2026-09-24-squad-intercom-assessment]]
- [[sessions/2026-09-24-squad-http-messaging]]
- [验收清单](../../pi_squad_case/phase_02_http_messaging/README.md)

## Claude 本轮结果与回传约定

Claude 报告 wF / 18801 的两条真实 ask 分别关联回复 41、73；Go agent/httpapi 与 TS inbox-stream/config 共 10 项扩展测试通过。SSE 传输延迟未独立测量，busy、重连、离线、会话切换与幂等边界仍有 NOT_RUN，阶段保持 partial。来源：`pi_squad_case/phase_02_http_messaging/RESULT.md`。

用户要求以后交接传入开发者当前 pane ID，Claude 检查完成后主动回传。已在根 AGENTS.md 和 pi_squad/AGENTS.md 持久化规则，本轮 HANDOFF.md 记录 callback pane w4:p2、terminal term_65c321016b8f18；未来每次动态读取，不能把本轮地址写成永久目标。回传附 handoff_id 和报告路径，核对终端身份，不阻塞等待，不循环回执。此为 Herdr 协作约定，不改变 Pi Squad 角色或 SSE 协议。

## 测试中断线警告重复

用户反馈 terminated、inbox fetch failed、heartbeat fetch failed 同时出现。源码确认三条通道独立提示，心跳每次失败都弹窗；读测得18811的health正常，但不推断所有Pi已经恢复。增加共享connection-notices，将网络中断按一次故障合并，逐通道成功后提示恢复；身份/协议错误仍单独可见。原始错误保留于 /squad-transport 的 connection.failures。开发静态检查通过，新增两项通知状态测试交Claude执行，未自行重载运行Pi。
