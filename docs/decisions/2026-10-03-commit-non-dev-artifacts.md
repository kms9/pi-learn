---
title: 2026-10-03 提交前先询问非开发材料
type: decision
status: active
created: 2026-10-03
updated: 2026-10-03
decision_date: 2026-10-03
tags:
  - project-wiki
  - decision
---

# 2026-10-03 提交前先询问非开发材料

## 决策

用 AI 提交时，若本次会带上开发不需要的代码或文档，先列出路径和大致体积并询问用户。用户明确同意前，不暂存、不提交。运行日志和验收证据属于这类材料。

## 背景

`efb5e09` 曾把 `pi_squad_case/04-team-orchestration/integration/` 整目录提交进 `pi_squad_dev`，其中验收证据约 166MB。该提交已替换为 `931ace2`，目录改由 `.gitignore` 忽略。需要一条持久规则，避免同类材料再次被自动纳入。

## 证据

- 根目录 `AGENTS.md` 的「提交前核对」
- `.gitignore` 中的 `pi_squad_case/04-team-orchestration/integration`

## 影响

- 源码、规格、使用说明，以及构建或文档明确依赖的小夹具，仍可直接提交。
- 拿不准时询问，不用 `git add -A` 或 `git add .` 把上述材料一并加入。

## 复审触发条件

- 某类证据或日志被确定为必须入库的产品材料

## 相关页面

- 会话: [[sessions/2026-10-03-commit-non-dev-artifacts]]
