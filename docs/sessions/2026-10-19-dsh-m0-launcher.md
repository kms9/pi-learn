---
title: 2026-10-19 DS Bot + Squad M0：按项目目录一键启动与预置团队
type: session
status: active
created: 2026-10-19
updated: 2026-10-19
tags:
  - dsh-bot
  - pi-squad
---

# 2026-10-19 DS Bot + Squad M0：按项目目录一键启动与预置团队

## 做了什么

- 分支 `feat/dsh-m0`（基于 `feat/dsh-m1` 的 `ce20c12`）。
- **M0-1/M0-2**：`dsh_squad/deploy/dsh-squad up|down|status|provision <项目>`。第一次 `up` 安装钉住的 DSH、打补丁的 ds-bot、编译 Controller 到 `dsh_squad/.build/`；每个项目的数据在 `<项目>/.dsh-squad/`（DSH home、Controller 数据库、日志、pid）。Controller 的锁、discovery、operator 凭据按其契约留在 `.agents/dshsquad/.runtime/`。项目没有 `.agents/dshsquad/` 时写入默认小队（`deploy/template/`）。`--mock` 用脚本化 mock；否则从环境变量读 `DEEPSEEK_API_KEY`，不落盘。
- **M0-3**：`deploy/provision.mjs` 经 DS Bot 的 `/api/bot` 建 Chief（Main Bot 改名）、Researcher、Builder、Reviewer，全部 `deepseek-flash`、effort high（D7），建群「小队群」并加一条团队记忆；可重复执行，Bot id 写入 `.dsh-squad/team.json`。
- Free 模式下 Adapter 已连上 Controller，但不接管任何会话。
- `probes/drive-m0.mjs`：新项目一键启动、provision 两次、群聊三名成员各自应答、`down`/`up` 后 Bot/群/记忆保留、Adapter 重新找到 Controller。

## 验证（开发期回归，不是验收）

`drive-m0` 12/12、`drive-p1` 14/14、`drive-m1` 7/7，`check.sh` 通过。DSH-M0-01～04 仍为 NOT_RUN（需要真实模型和非开发用户试用，D6/D7）。

## 过程中发现

- DS Bot `state` 接口里的 Bot 列表和 `bot/state.json` 的形状不同；`efforts` 返回对象数组（`{id, name}`）。
- 有一次提交推送的命令报「分类器无结论」，但实际上已经推送；本地再次提交得到同一棵树的重复提交，已对齐到远端（`4f67e6d`），没有丢失内容。

## 未决

无新增。`--mock` 每次 `up` 需重复带上（不记忆模式），属已知行为，写在 USAGE。
