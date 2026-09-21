---
title: Harness
type: concept
status: active
created: 2026-09-07
updated: 2026-09-10
tags:
  - project-wiki
  - concept
---

# Harness

本仓库里「harness」有三层意思，不要混用。完整独立讲解见 [[learning/harness对照讲解|Harness 对照讲解]]。

## 是什么

行业里最稳的等式是：**agent harness ≈ AI agent − model**。模型只产生文本；把它变成能读文件、跑命令、记会话、可中断恢复的 agent，剩下那一层软件叫 harness。

常见组成：

- **loop**：prompt → 模型 → 工具 → 把结果写回上下文 → 再调模型，直到停
- **tools / permissions / sandbox**：模型能碰到什么、谁批准、隔离到哪
- **session / memory**：会话日志、压缩、分支、工作记忆
- **hooks / plugins**：在请求、工具、轮次边界拦截或加能力
- **host / UI / SDK**：TUI、Web、RPC，把人的输入送进 loop

黄仁勋的说法是：LLM 是脑，harness 是套在外面的「外骨骼 / 身体」，负责取知识、工作记忆、用工具、协作。X 上的讨论见 [[sources/agent-harness-x-discourse|agent harness 的 X 讨论]]。

## 本仓库两套实现怎么用这个词

| 说话人 | 指什么 | 代码落点 |
|--------|--------|----------|
| Pi 产品文案 | 整个终端 coding agent 产品 | `pi-dev/packages/coding-agent/`：自称为 *minimal terminal coding harness* |
| Pi 实现规范 | 可崩溃恢复的会话运行时 | `pi-dev/packages/agent/` 的 `AgentHarness`：`accept` / `drive` / `requestAbort` / `inspectExecution` |
| DeepSeek Harness | 整个产品就是 harness | `deepseek-harness/`：Cordis 插件树；loop 只是其中一个可替换插件 |

对照 **coding-agent 目录** 和 **deepseek-harness 仓库** 时，缺的那一层是 Pi 的 `packages/agent`。coding-agent 的默认交互路径仍走进程内 `Agent` + `agentLoop`，不是新的耐久 `AgentHarness`。

## 不是什么

- 不是模型本身，也不是某一个工具函数
- 不是测试框架里的 test harness（`coding-agent/test/test-harness.ts` 是测试夹具，同名不同义）
- 不是 [[concepts/extension|Extension]]：Extension 是往 Pi harness 上挂能力的模块
- 不是 DSH 的某一个 seam：DSH 把 filesystem / shell / LLM 拆成可替换 seam，harness 是这些 seam 组成的整棵插件树

## 和 loop / graph 的边界

X 上常见三分法（见来源页）：

- **loop**：迭代、重试、预算、停止条件
- **graph**：显式节点、分支、checkpoint、交接
- **harness**：暴露面——工具、权限、记忆、沙箱、eval、trace、人

两边源码里，loop 都是 harness 的心脏，但不是全部。Pi 的 `agentLoop` 和 DSH 的 `ReactLoopAgent` 都是「调模型、跑工具、再调」；会话、压缩、扩展、UI 围在外面。

## 证据

- `pi-dev/packages/coding-agent/docs/index.md`、`README.md` Philosophy
- `pi-dev/packages/agent/docs/harness.md`（`AgentHarness` 规范）
- `pi-dev/packages/agent/src/agent-loop.ts`、`src/harness/runtime/harness.ts`
- `deepseek-harness/README.md`、`docs/architecture.md`、`docs/glossary.md`
- `deepseek-harness/packages/core/agent-loop/src/agent.ts`

## 相关页面

- 学习: [[learning/harness对照讲解|Harness 对照讲解]]、[[learning/harness对照-pi与dsh|条目提纲]]
- 概念: [[extension|Extension]]、[[session|Session]]
- 来源: [[sources/agent-harness-x-discourse|X 讨论]]、[[sources/pi-agent-core|Pi agent core]]、[[sources/deepseek-harness|DeepSeek Harness]]
---
