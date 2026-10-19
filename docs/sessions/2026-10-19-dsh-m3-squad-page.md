---
title: 2026-10-19 DS Bot + Squad M3：Squad 页面与对照实验
type: session
status: active
created: 2026-10-19
updated: 2026-10-19
tags:
  - dsh-bot
  - pi-squad
---

# 2026-10-19 DS Bot + Squad M3：Squad 页面与对照实验

## 做了什么（分支 `feat/dsh-m3`）

- **Controller**：`GET/POST /v2/config`（operator）列出并编辑 `.agents/dshsquad` 下可编辑的文件；先在副本里加载整份配置，通过才写；过期哈希拒绝；改小队的说明或流程自动升 `config_version`。验收方式 `on_completion`（对照实验 B 组）。
- **seam v4**：受控成员的工具审批（`approvals`、`answerApproval`）。
- **Adapter 宿主路由 `ui/*`**（M3-1）：`view`、`events`、`start-run`（没绑定先绑定）、`operate`（固定清单）、`accept`、`approve`（核对 attempt 版本）、`bind-team`、`config`、`config-save`、`reports`。operator 凭据只留在宿主上；预览链接用 `localhost`，和 DS Bot 的 `127.0.0.1` 分开主机名。最近一次连接 Controller 的失败按绑定报给页面。D12：受控任务里只能 `recall`。
- **客户端插件 `dsh_squad/client`**（M3-2、M3-4）：React，构建到 `adapter/client.js`，作为 adapter 包的浏览器一半。左下角「小队」按钮；页面三个标签：运行、小队与规则、实验报告；绑定的群有状态条。投影逻辑、依赖图布局、卡片推导、配置表单都是纯函数并有测试。
- **对照实验**（M3-3）：`dsh_squad/experiments/run.mjs`，S/A/B/C 每组每次一个新的项目目录，单模型，用 DS Bot 用量账本计成本（含辅助调用），报告 `dsh-squad-experiment/1`。
- **测试**：`probes/drive-m3.mjs`（宿主路由层 18 项）、`probes/ui-check.mjs`（无头 Chrome，puppeteer-core 不进仓库）。

## 在真实浏览器里发现并修掉的问题

- 浏览器里点「开始」后什么都没发生：手改了流程文件但没升小队版本，Controller 以 `CONFIG_VERSION_CONFLICT` 拒绝所有成员注册，页面又看不到原因。修复：配置保存自动升版本；页面横幅显示每个成员连不上的原因。
- overlay 插槽被挂载两次，控制台会画两遍：只让第一个挂载的实例渲染。
- 审核任务显示 Controller 给审核者的原始指令；状态标签竖排；Leader 步骤挤满任务表；Esc 直接关掉整个页面：都已改。

## 验证（开发期回归，不是验收）

`drive-m3` 18/18、`ui-check` 9/9（从表单开始的 Run 完成；预览来自 `localhost`，`document.cookie` 抛 `SecurityError`）、`drive-m2` 12/12、`drive-m0` 12/12、`drive-p1` 14/14、`drive-m1` 7/7、`check.sh` 通过；mock 对照实验 S/A/B/C 全部跑通（数字不代表真实效果）。ACCEPTANCE 仍为 NOT_RUN。

## 未决

Q41（返工后下游仍指向旧版本）、Q42（预览隔离，浏览器验证已做，正式验收在 T）、Q43（记忆冻结不完整）。
