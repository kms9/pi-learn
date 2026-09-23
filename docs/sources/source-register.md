---
title: 来源登记
type: source
status: active
created: 2026-09-07
updated: 2026-09-23
tags:
  - project-wiki
  - sources
---

# 来源登记

| 来源 | 类型 | 位置 | Ingest 日期 | 摘要页 | 说明 |
|---|---|---|---|---|---|
| Karpathy LLM Wiki gist | 网络参考 | https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f | 2026-09-07 | [[llm-wiki-pattern\|LLM Wiki 模式]] | raw / wiki / schema 三层；ingest、query、lint；index 与 log。 |
| 用户已落地的 LLM Wiki 规范 | 本地仓库 | `/Users/logo/self_repo/video_case/fx_coding_case/project_wiki/AGENTS.md` | 2026-09-07 | [[llm-wiki-pattern\|LLM Wiki 模式]] | 中文优先、YAML、wikilink、会话写回、log 形状。本仓库按它实例化，不照搬飞书分类。 |
| earendil-works/pi | git submodule | `pi-dev/` | 2026-09-07 | [[overlay/仓库结构\|仓库结构]] | 上游真源。SHA 钉在 overlay gitlink；分支见 `.gitmodules`。不要改工作区文件。 |
| docs-zh 中文镜像 | overlay | `docs-zh/` | 2026-09-07 | [[overlay/仓库结构\|仓库结构]] | 从 pi-dev 迁出的译文与中文注释副本。 |
| coding-agent 扩展示例 | 上游目录 | `pi-dev/packages/coding-agent/examples/extensions/` | 2026-09-07 | [[learning/怎么学写插件\|怎么学写插件]] | 官方可运行 Extension 样本。 |
| herdr-pi-extensions | git clone | `herdr-pi-extensions/` | 2026-09-07 | [[learning/怎么学写插件\|怎么学写插件]] | 第三方插件样本，不是官方 API。 |
| agent-tools | git clone | `agent-tools/` | 2026-09-07 | [[learning/怎么学写插件\|怎么学写插件]] | 第三方插件/工具样本。 |
| Pi agent core / coding-agent | git submodule | `pi-dev/packages/agent/`、`pi-dev/packages/coding-agent/` | 2026-09-07 | [[pi-agent-core\|Pi agent core]] | HEAD `92d8e2d17d4f357788381c49ce2cdb3f4ed1f21c`。产品自称 harness；耐久 `AgentHarness` 在 agent 包。 |
| DeepSeek Harness | git submodule | `deepseek-harness/` | 2026-09-07 | [[deepseek-harness\|DeepSeek Harness]] | HEAD `d347e703908d0406b7a7ef80e3a0e594d86b2215`。整仓即 harness；LLM 缝含 pi-ai 适配器。 |
| Paseo | git submodule | `paseo/` | 2026-09-16 | [[paseo\|Paseo]] | HEAD `425157595038614a44e2cbf9c393f2e263270b95`。重点参考 provider registry、AgentClient/AgentSession、Pi RPC 与 Generic ACP adapter。 |
| Pigo | git submodule | `pigo/` | 2026-09-18 | [[pigo\|Pigo]] | HEAD `891d1f372cefa92b5f5a104db20521238ba5a9fe`。Go 语言重实现 Pi；重点对照 Agent loop、Session、stream-json、权限、Skills/Plugins 与 Go Runtime 结构。 |
| Herdr + Pi Extension 验证方案 | 会话附件 | Notion plan + 源码评估 | 2026-09-23 | [[herdr-pi-extension-plan\|Herdr + Pi Extension 验证方案]] | P0–P7 本地协作协议；第一刀仅 P0 HTTP Registry。全文未检入，摘要见 wiki。 |
| X 上 agent harness 讨论 | 网络检索 | X posts 2026-02–09 | 2026-09-07 | [[agent-harness-x-discourse\|X 讨论]] | Jensen 外骨骼、loop/graph/harness 三分、Pi 口碑、Mario 对 v2 范围。 |
