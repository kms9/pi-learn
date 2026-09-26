---
title: Pi Intercom 消息流程源码参考
type: source
status: active
created: 2026-09-24
updated: 2026-09-24
source_path: pi-intercom/
tags:
  - project-wiki
  - source-summary
  - pi-squad
---

# Pi Intercom 消息流程源码参考

## 来源

- 本地路径：`pi-intercom/`，只读 submodule。
- 固定 HEAD：`199279ae861bf53ce014809fb2a03337538ae13e`，本次 git rev-parse 核实，与 `pi_squad_case/SOURCES.md` 一致。
- 外部 URL：https://github.com/nicobailon/pi-intercom/tree/199279ae861bf53ce014809fb2a03337538ae13e
- 来源日期：unknown；本次读取日期：2026-09-24。未检索最新上游、未更新 gitlink、未执行其测试。

## 摘要

本机 Pi 会话间定向通信。Extension 对接本地 IPC broker；有发现、send/ask/reply/pending、内联 UI、消息收据、显式取消/替换及有限离线邮箱。适合作为 Pi Squad 第二阶段的消息关联和生命周期参考，不能将其路由/调度默认行为直接替换当前 HTTP 契约。

## 关键事实

- `reply-tracker.ts`：pendingAsks、pendingTurnContexts、currentTurnContext 分离；显式 replyTo、当前触发消息和单个未回复 ask 可解析回复目标；歧义失败；markReplied/dismiss/prune 清理。名称和前缀便利寻址不等于 Squad 的实例认证。
- `index.ts:610` 起：入站去重按 sender ID + message ID，含保留期和容量上限；重复 ID 可再次确认而不再次注入。latestOutboundReceipts 提供最后已知状态。
- `index.ts:673` waitForReply：单个客户端 waiter，ask 等 Promise 返回答案，超时错误带 message ID 和最后投递状态，并明确超时不是撤销。
- `index.ts:733` getLiveContext：disposed/shutdown/generation/session 联合检查；`session_shutdown` 清理订阅、连接、计时器、waiter 和 reply tracker。
- `index.ts:1177` sendIncomingMessage：注入附来源、时间与回复提示。injected 收据在调用 Pi sendMessage 前发出，因此不能当作模型已消费或完成证明。
- `index.ts:1207` handleIncomingMessage：先去重、回执和匹配已有 reply waiter，再走新消息注入；交互式 busy 使用 steer，idle 根据 inboundTrigger 决定启动模型；不等价于 Squad 的忙时留队列。
- `broker/broker.ts:625` 起：精确目标 ID + endpointEpoch，重绑不匹配明确报错；reply edge 校验双方，拒绝伪造 replyTo；阻塞 ask 有互相等待检测。
- `broker/broker.ts:1035` 起：结构化 code/retryable/outcomeKnown；消息内容指纹校验 ID 重用，缓存原投递结果。允许客户端针对 endpoint rebound 重新解析一次，不符合 Squad 目前显式重发原则。
- README 与 `types.ts`：send/reply 对部分断开的具名会话可进入 broker 内存邮箱；非持久 SQLite 邮箱；取消已注入消息只能请求取消，不能声称撤回执行；retryOf/supersedes 显式关联新旧消息。
- `intercom.integration.test.ts`：包含 endpoint epoch、重复 ID 改正文、旧连接、错误回复、shutdown 迟到回调、busy steering、不重复注入、超时、互相 ask 等用例。存在测试不代表本次已运行或证明没有缺陷。

## 相关页面

- [[sessions/2026-09-24-squad-intercom-assessment]]
- [[concepts/pi-squad]]
- 固定来源清单：`pi_squad_case/SOURCES.md`。

## 证据备注

本次重点读取 README、reply-tracker 全文，以及 index/broker 的上述消息相关函数和选定集成用例；没有审计全仓。Extension bus 状态文件、supervisor、附件和自动开 pane 不属于当前采用范围。
