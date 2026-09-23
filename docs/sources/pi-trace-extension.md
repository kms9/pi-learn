---
title: Pi Trace Extension
type: source
status: active
created: 2026-09-21
updated: 2026-09-21
source_path: pi-trace-extension/
tags:
  - project-wiki
  - source-summary
  - extension
  - trace
---

# Pi Trace Extension

## 来源

- 本地路径: `pi-trace-extension/`
- 外部 URL: `https://github.com/npxcnency-ux/pi-trace-extension`
- Overlay gitlink SHA: `5441bcca041e3b3a203aee91c68e8ea809e6aa27`
- 跟踪分支: `main`
- Ingest 日期: 2026-09-21

## 摘要

`pi-trace-extension` 是一个 Pi coding-agent Extension：订阅 session 生命周期事件，把对话视角的 `session.jsonl` 重组成执行视角的本地 trace（`events.jsonl` + 单文件 `trace.html`）。跨会话入口是 **dashboard**，产物为 `~/.pi/agent/traces/index.html`。数据只留本机，不做多人协作 dashboard。

本仓用户说「插件 dashboard」时，默认指这个跨会话索引，而不是 Herdr pane 或 Pi Squad 观察面。

## 关键事实

- 会话内命令：`/trace` 渲染当前 session；`/trace all` 生成并打开跨会话 dashboard。
- CLI 兼容：`python3 <install>/extensions/trace/trace_to_html.py --dashboard`，输出 `~/.pi/agent/traces/index.html`。
- 文档里的安装路径写成 `~/.pi/agent/npm/pi-trace-extension/`。本机实测 `pi install npm:pi-trace-extension` 落在 `~/.pi/agent/npm/node_modules/pi-trace-extension/`。打开 dashboard 用实测路径。
- Overlay 里的 `pi-trace-extension/` 是只读 submodule，不要改里面的文件当 overlay 作品。
- 本机 2026-09-21 跑 `--dashboard` 写出 10 个 session 的 `index.html`，并用 `open` 打开。

## 相关页面

- 概念: [[concepts/extension|Extension]]、[[concepts/session|Session]]
- 学习: [[learning/怎么学写插件|怎么学写插件]]
- 会话: [[sessions/2026-09-21-open-trace-dashboard|2026-09-21 打开 Pi Trace dashboard]]

## 证据备注

- 用法与产物：`pi-trace-extension/README.zh.md` 的「用法」与「跨会话 dashboard」段
- `/trace all` 规格：`pi-trace-extension/docs/specs/2026-07-13-dashboard-slash-command.md`
- 本机脚本：`~/.pi/agent/npm/node_modules/pi-trace-extension/extensions/trace/trace_to_html.py`
