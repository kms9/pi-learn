---
title: P0 Cases
type: process
status: active
created: 2026-09-23
updated: 2026-09-23
tags:
  - pi-squad
  - phase-00
---

# P0 Cases

## Mandatory（方案原文）

### CASE-P0-01｜三个 Agent 注册

输入：启动 backend、reviewer、tester（理想为三个 `pi -e`；Controller smoke 用 curl 注册两个）。

步骤：Controller 已监听；每个身份带 `PI_SQUAD_*` 启动扩展或 `POST /agents/register`。

期望：`GET /agents` 返回三者（或 smoke 的两者）均 `online`；若注入了 Herdr env，`space_id` / `pane_id` 与 env 一致。

### CASE-P0-02｜离线识别

输入：关闭 reviewer Pi，或停止其心跳。

期望：超过心跳阈值后 reviewer=`offline`；backend（及其他）仍 `online`。

### CASE-P0-03｜同身份重新上线

输入：再次用 `PI_SQUAD_AGENT_ID=reviewer` 启动，或再次 register。

期望：仍是 `agent_id=reviewer`，列表不出现 `reviewer-2`。

### CASE-P0-04｜Controller 重启

输入：保留 SQLite，杀掉并重启 Controller。

期望：逻辑 Agent 行仍在；无新心跳则 `offline`；Pi 或 curl 再心跳后 `online`。

## 补充（P0-prep / 第一刀）

### CASE-P0-S1｜Controller HTTP smoke

`./pi_squad_case/phase_00_identity/smoke.sh`

覆盖 01–04 的协议面（两个 Agent，无 Pi）。

### CASE-P0-S2｜两个 `pi -e` 进程

见 [README.md](README.md) 第 3 节。需要本机 `pi`。杀其中一个进程，超时后 list 变化。

## 非本阶段

不要在本目录验收 `send_message`、`delegate_task`、自动 spawn、或 pane 名当 `agent_id`。
