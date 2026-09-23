---
title: 2026-09-21 打开 Pi Trace dashboard
type: session
status: active
created: 2026-09-21
updated: 2026-09-21
tags:
  - project-wiki
  - session
---

# 2026-09-21 打开 Pi Trace dashboard

## 用户要做什么

打开「插件 dashboard」。

## 达成了什么

- 结论: 本仓库语境下，这句话默认指 **pi-trace-extension 的跨会话 dashboard**，不是 Herdr 观察面，也不是 Pi Squad `05-herdr-observability` 里尚未实现的 Go dashboard。
- 已执行: `python3 ~/.pi/agent/npm/node_modules/pi-trace-extension/extensions/trace/trace_to_html.py --dashboard`，写出 10 个 session；随后 `open ~/.pi/agent/traces/index.html`。
- 下次在 Pi 会话里也可以直接 `/trace all`。

## 写回了哪些 wiki 页

- [[sources/pi-trace-extension|Pi Trace Extension]]
- [[sources/source-register|来源登记]]、来源/会话/总索引、[[log|Wiki 日志]]
- [[learning/怎么学写插件|怎么学写插件]] 补了第三方样本与 dashboard 打开方式

## 未决

- 无。若用户其实要的是 Herdr pane 或 Squad 观察面，再另开会话，不要覆盖本默认。

## 相关页面

- 来源: [[sources/pi-trace-extension|Pi Trace Extension]]
- 概念: [[concepts/extension|Extension]]、[[concepts/session|Session]]
- 学习: [[learning/怎么学写插件|怎么学写插件]]
