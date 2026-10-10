---
title: 2026-09-24 Controller 心跳日志与 Dashboard 分工
type: session
status: active
created: 2026-09-24
updated: 2026-09-24
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-09-24 Controller 心跳日志与 Dashboard 分工

## 用户要做什么

排查 Herdr w7:p3 只显示心跳日志、看不到 Dashboard 的问题并优化。

## 达成了什么

- Herdr 只读检查：w7:p3 前台是 `go run ./cmd/controller --listen 127.0.0.1:18751 --db /tmp/pi_squad_livecheck.sqlite --heartbeat-timeout 15s`，没有 tui 子命令。该 pane 高度仅 10 行，近期输出为 backend/reviewer 每 5 秒的心跳日志。
- 根因有两层：serve 与 tui 本来就是独立进程；成功心跳逐条 log.Printf 导致服务终端刷屏。不是 TUI 被心跳渲染覆盖。
- 开发修改：移除成功心跳日志，保留处理与响应；serve 启动日志提示独立 Dashboard 客户端命令。USAGE/Controller README 补充连接实际端口的用法。
- 即时查看方式：另一终端执行 `go run ./cmd/controller tui --url http://127.0.0.1:18751`。若要 w7:p3 专门展示 Dashboard，后续启动布局应将服务后台运行、日志写文件，pane 前台只运行 tui。
- 本轮未重启、终止或移走用户现有服务，未新建 pane；运行中的旧二进制仍会打印心跳，新代码在重启后生效。
- 沿用用户分工：本助手只开发/静态检查，未执行运行验收。验收交给指定 Claude Code。

## 写回了哪些 wiki 页

- 本页、主索引、日志；使用说明同步更新。

## 未决

- 当前运行进程尚未切换新代码；把现有服务搬至后台需单独实施，不能把代码修改描述成已改变终端运行布局。

## 相关页面

- 概念：[[concepts/pi-squad]]
- 证据：`pi_squad/controller/httpapi/server.go`、`cli/serve.go`、`cli/tui.go`。
