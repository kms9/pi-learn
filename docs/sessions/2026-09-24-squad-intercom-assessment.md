---
title: 2026-09-24 Pi Squad 应借鉴 Intercom 的能力与流程
type: session
status: active
created: 2026-09-24
updated: 2026-09-24
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-09-24 Pi Squad 应借鉴 Intercom 的能力与流程

## 用户要做什么

基于第二阶段 partial 进度，评估 pi-intercom 哪些能力和流程值得参考。

## 达成了什么

建议保留 Go HTTP Controller + SQLite 与薄 Pi Extension；参考消息语义、关联和边界测试，而非替换架构或先扩展第三阶段。下面是评估建议，尚未实施，也不改变现有验收结果。

| 优先级 | 参考点 | Squad 当前基础 | 建议吸收 |
|---|---|---|---|
| P0 | ReplyTracker / reply edge | 显式 message_id、双方绑定与 activeAsk 已有 | 把待答问题集合、当前执行问题、已答状态独立建模；支持 pending 查询，失败回复保持可诊断，禁止多个问题串答。保留显式 ID，不采用 send 隐式猜回复 |
| P0 | getLiveContext + generation 生命周期 | receiver generation、心跳 stop、/new 比较更新已有 | 统一检查轮询、回执、回复与清理回调的 generation/实际 Pi session；特别测同 session 的 reload 迟到回调和用户输入竞态，不能仅依赖 activeAsk/userPending 布尔值的 happy path |
| P0 | 收据与 outcomeKnown | 单 status、created/expires 已有 | 分开传输和问答状态；增加阶段时间、原因码与结果是否确定。replied 应表示回复已经产生，不暗示发问方已收到；injection_requested 不暗示模型已处理 |
| P0 | 服务端指纹 + 接收方去重 | request_key 指纹与普通消息 session marker 已有 | 补丢响应重试、同 key 改内容、重复收件/确认测试；进程 deliveries 增加容量/保留期或按已结束会话清理。不照搬短期内存缓存代替 SQLite |
| P0 | 精确 ID + endpointEpoch 与错误码 | UUID/token/session 已有 | 验证目标从发现到发送期间变更时明确拒绝；考虑需要时补绑定代次防止同 session 重绑旧操作。使用稳定 code/retryable/outcome_known，避免全靠 409 字符串判断；不自动改投新实例 |
| P1 | 回复提示、pending 和内联消息 UI | notice UI notify、/squad-inbox 已有 | 显示来源 role/agent_id、消息 ID、关联问题、收到/待答状态；提示准确 reply_message 参数。Dashboard 汇总消息状态，详细事件另看，避免再次被日志淹没 |

建议学习流程：精确解析目标并固定绑定 → Controller 落库返回 ID → 接收方去重/收件回执 → notice 只展示、ask 空闲入队处理 → 显式原消息回复 → 发问方收到关联答案。逐阶段记录证据与失败，而不是把一个 send 工具成功视作全流程完成。

### 不直接采用

- Intercom 阻塞式 ask 和单 reply waiter：我们保留异步 ID，避免占住模型工具调用等待其它 Agent。互等检测思路可在以后允许递归问答时参考；当前入站 ask 工具限制已经禁止继续发问。
- busy 时 steer：我们保留忙时排队和本机用户输入优先，不把“未 abort”当作“没改变当前工作”。
- 普通 send 自动唤醒、send 自动推断唯一 pending ask 的回复：我们 notice 不唤醒、reply 必须显式关联。
- 离线邮箱按名称/cwd 重连补投、endpoint rebound 自动重解析：与旧 UUID/旧会话不接管、显式重试的现有决定冲突。
- IPC framing、broker 自动拉起、Herdr 自动开项目 pane：不为借鉴消息机制改动现有 HTTP/手动启动路径。
- supervisor/任务编排、附件、extension bus 状态同步、tools/model/skills：暂不扩展本阶段。cancel/supersede 可以后续单独设计，不能把超时或用户介入误称为已撤销底层执行。

### 用它帮助第二阶段收口

1. 先跑真实 ask/reply、两个发问者同时询问同一接收方、busy 后继续、用户介入，验证当前执行上下文和关联不会串。
2. 对照上游边界用例补 UUID/session/reload、丢响应去重、离线和 Controller 重启；其中未测项直接对应本项目 MSG-03—08 与 ID-02—04。
3. 在失败复现支持下补代码；随后再优化 pending 查询、状态时间线与内联展示。不要因本次学习先扩大功能来替代验收。

## 写回了哪些 wiki 页

本页、Intercom 来源摘要/登记、主索引、日志。

## 未决

以上为源码对照评估，不是新的测试通过证据。Intercom injected 收据发于 void sendMessage 前，本项目仍应称 injection_requested。当前状态字段将投递与问答混在一起，后续可拆分，但本轮未改协议或实现。

## 相关页面

- [[sources/pi-intercom]]
- [[sessions/2026-09-24-squad-http-messaging]]
- [当前验收](../../pi_squad_case/phase_02_http_messaging/RESULT.md)
