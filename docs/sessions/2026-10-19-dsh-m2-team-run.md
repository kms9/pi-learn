---
title: 2026-10-19 DS Bot + Squad M2：单 Team 在群里跑完整 Run
type: session
status: active
created: 2026-10-19
updated: 2026-10-19
tags:
  - dsh-bot
  - pi-squad
---

# 2026-10-19 DS Bot + Squad M2：单 Team 在群里跑完整 Run

## 做了什么（分支 `feat/dsh-m2`）

- **Artifact（M2-3，D8）**：Controller 内容寻址存储 `<artifact-dir>/sha256/<hex>`，`POST /v2/artifacts` 上传、`GET /v2/artifacts/sha256/:hash` 读回；结果用 `artifact:sha256/<hex>` 引用，原有哈希校验读存储。HTML 以 CSP `sandbox` + `default-src 'none'` 返回（M2-6 服务端部分）。
- **seam v3**：`createBot`、`createRoom`、`ensureGroupSession`（提前打开成员的群会话；新群先补 `seen`，否则 ds-bot 报错）。
- **Team 绑定（M2-1/M2-2）**：Adapter `bind-team`：Leader 和各角色对应 Bot（缺的创建），群「<team> 小队」，每个成员的群会话注册为 runtime（Leader 用 leader 模式）。
- **Run（M2-3/M2-4）**：Leader 步骤的提示里有 Run 状态和用户指导，`squad_decide` 决定 dispatch/wait/complete；审核 `squad_review` 自动引用精确版本；提交可附文件。
- **群消息（M2-2）**：Run 进行中用户对 Team 说的话（直接或群里）被扣留后在 Controller 变成 Run Guidance，同一句只记一次；否则保持 pending。
- **案例（M2-5，D11）**：`dsh_squad/cases/math`：教研员、课件制作、检查员、教学审核；Workflow `lesson`。
- 测试：Controller 新增 Run 全流程、guidance、artifact、人工验收绑定版本（DSH-M2-04）测试；`probes/drive-m2.mjs` 端到端。

## 验证（开发期回归，不是验收）

`drive-m2` 12/12：Run 完成；研究、制作、检查都执行；首版被退回并由返工取代（旧版本保留）；返工复审通过；课件是 Controller Artifact；作者与审核者不同；课件以 sandbox 返回；群消息变成一次 Run Guidance；Leader 步骤全部收尾。另 `drive-m0` 12/12、`drive-p1` 14/14、`drive-m1` 7/7、`check.sh` 通过。

## 过程中发现

- 返工不是自动的：Leader 要为被退回的任务派 `rework`。
- 下游任务不会跟随返工（Q41）。
- DSH 在消息历史里保留旧的系统提示副本，读提示要取最后一份（mock 曾因此读到过期的 Run 状态）。

## 没做 / 未决

D12 的 Memory 只读快照放到 M3-3；M2-6 的界面 iframe 在 M3（Q42）；Q41。
