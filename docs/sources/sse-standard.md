---
title: WHATWG SSE 标准与本地应用边界
type: source
status: active
created: 2026-09-24
updated: 2026-09-24
source_path: https://html.spec.whatwg.org/multipage/server-sent-events.html
tags:
  - project-wiki
  - source-summary
---

# WHATWG SSE 标准与本地应用边界

## 来源

- 官方 URL：https://html.spec.whatwg.org/multipage/server-sent-events.html
- 本次读取：2026-09-24；页面显示最后更新 2026-09-22。

## 摘要与关键事实

SSE 通过 HTTP 提供服务端到客户端事件流，媒体类型 text/event-stream，UTF-8 编码；event/data 字段与空行组成事件，支持注释保活。浏览器 EventSource 有重连和 Last-Event-ID 机制。

Pi Squad 不是浏览器 EventSource 客户端：使用 Node fetch 加 Authorization 请求头消费同样格式，显式管理重连/退出。当前只发送可合并的 inbox 提示，不提供持久 SSE 事件日志、event id 或 Last-Event-ID 重放；重连重新查询 SQLite inbox。此行为属于本项目应用设计，不能声称 SSE 标准自动保证消息处理一次或可靠业务投递。

## 相关页面

- [[sessions/2026-09-24-squad-sse-delivery]]

## 证据备注

标准 9.2.1、9.2.3、9.2.5、9.2.6、9.2.7；工程实现以 `pi_squad/controller/httpapi/events.go`、`pi_squad/extension/inbox-stream.ts` 为准。
