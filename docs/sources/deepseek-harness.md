---
title: DeepSeek Harness 源码与文档
type: source
status: active
created: 2026-09-07
updated: 2026-09-07
source_path: deepseek-harness
tags:
  - project-wiki
  - source-summary
---

# DeepSeek Harness 源码与文档

## 来源

- 本地路径: `deepseek-harness/`
- 外部: https://github.com/deepseek-ai/deepseek-harness
- 来源日期: ingest 时 HEAD `d347e703908d0406b7a7ef80e3a0e594d86b2215`
- Ingest 日期: 2026-09-07

## 摘要

DeepSeek 把整个产品命名为 harness：Cordis 插件树，没有不可替换的特权核心。spine 是 session log、system-prompt、tools、Agent 句柄、默认 agent-loop。LLM 缝上有一份适配器直接包 `@earendil-works/pi-ai`。

## 关键事实

- `README.md`：*open-source agent harness*；everything-is-a-plugin；developer preview，会破兼容。
- `docs/architecture.md`：profile = bundle 栈 + patch；`dsh-base` 是 web/headless/sdk/acp 的共享层。turn/step 流程和事件域（session 耐久 / agent 直播 / capability 缝）写在这里。
- `docs/glossary.md`：turn / step / round 分层；scope 是 per-agent 注册单位；seam = Service Definition + Provider + Consumer。
- `packages/core/agent-loop`：唯一具体 loop；插件依赖 `dsh-agent` 不依赖 loop 包，所以 loop 可换。`src/agent.ts` 的 `ReactLoopAgent` 实现 inbox、turn、step、pre-step waterfall。
- `packages/core/session`：append-only `SessionEvent`；`deriveMessages()` 投影模型历史；model-visible 必须能从 log 重建。
- `packages/core/system-prompt`：默认 opener *You are an AI agent powered by DeepSeek Harness.*
- `docs/tool-catalog.md`、`docs/tool-execution-pipeline.md`：工具是插件；执行管道与 loop 解耦。
- `packages/llm/llm-pi-ai`：依赖 `@earendil-works/pi-ai` `^0.84.2`，挂在 `dsh-base` 与 CLI。
- `docs/cookbook/extension-cookbook.md`：工具、hook、UI 都是 `apply(ctx)` 插件，不是 Pi 的 `ExtensionAPI`。
- `SAFETY.md`：实验软件；sandbox/approval 降低风险但不保证隔离。

## 相关页面

- 概念: [[concepts/harness|Harness]]
- 学习: [[learning/harness对照讲解|Harness 对照讲解]]
- Overlay: [[overlay/仓库结构|仓库结构]]

## 证据备注

文档大量 generated（tool-catalog、event 图）。Cordis 论文 https://arxiv.org/abs/2608.25512 本次未读正文。营销 star 数未核。
---
