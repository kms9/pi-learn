---
title: 2026-10-19 DS Bot + Squad 开发决策 D1–D12
type: decision
status: active
created: 2026-10-19
updated: 2026-10-19
decision_date: 2026-10-19
tags:
  - dsh-bot
  - pi-squad
  - decision
---

# 2026-10-19 DS Bot + Squad 开发决策 D1–D12

## 决策

用户对开发规划的 12 个决策点拍板，全文和对工作包的影响见 `docs/dsh-squad-dev-plan-2026-10-18.md` 的「决策记录」节。要点：

- **D1**：以 DS Bot 为主要验证对象；Go Controller 全部迁到 `dsh_squad/controller`，不与 `pi_squad` 共用；`pi_squad` 不再维护。
- **D2**：补丁只做 seam；界面做成独立的 DSH 客户端插件；暂不提上游 PR；不维护 fork。
- **D3**：新协议 `squad/3`。
- **D4**：一个项目目录 = 一个 DS Bot 宿主 + 一个 Controller，每人自己部署；做一键启动配对，不做多租户。
- **D5**：最终版界面（依赖图、Artifact 预览、Review/恢复卡、三类按钮、实验报告页），做在 DS Bot 界面里。
- **D6**：非开发用户能完整使用 Squad（设定 Team/Workflow/Role、启动、看进度、多 Team）；试用放在功能完成之后。
- **D7**：开发期全 mock；最后只用 DeepSeek `deepseek-flash`（thinking、effort high）做真实测试；验收按单模型调整。
- **D8**：Artifact 存在 Controller 的 hash 目录。
- **D9**：钉死 DSH 0.2.1-rc.2、DS Bot `e13bc34`；定期评估，无破坏性更新不升级。
- **D10**：每个里程碑末跑现有 mock 自动化回归。
- **D11**：数学知识点课件案例。
- **D12**：正式 Run 的 Memory 快照只读；对照实验每组全新 Team。

## 背景

规划草案列出 12 个待定点（Q38），用户 2026-10-19 统一答复，并要求直接从 M1 开始开发。

## 证据

- 来源: 用户 2026-10-19 的答复；`docs/dsh-squad-dev-plan-2026-10-18.md`。

## 影响

- 工作量从约 93 人日调为约 105 人日（最终版界面、规则配置界面、里程碑回归增加）。
- 执行顺序改为 M1 → M0 → M2 → M3 → M4 → T。
- `dsh_squad_case/ACCEPTANCE.md` 的 DSH-M0-02 改为单模型；`MIGRATION_PLAN.md` 的 M0 部署和多 Provider 描述按 D4、D7 注明。
- Q33（上游 PR）暂缓；Q38 关闭。

## 复审触发条件

上游 DSH/DS Bot 出现必须跟进的更新；用户恢复对 `pi_squad` 的需求；真实测试需要第二家 Provider。

## 相关页面

- 规划: `docs/dsh-squad-dev-plan-2026-10-18.md`
- 前序决策: [[decisions/2026-10-18-dsh-p1-seam-as-patch|seam 以补丁形式实现]]
