---
title: LLM Wiki 模式
type: source
status: active
created: 2026-09-07
updated: 2026-09-07
tags:
  - project-wiki
  - llm-wiki
  - source-summary
---

# LLM Wiki 模式

## 来源

- 网络: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- 本地规范实例: `project_wiki/AGENTS.md`（用户既有落地）

## 核心思想

Wiki 是 **持久、可复利的中间层**。新来源不是只给下次 RAG 检索，而是 ingest 时读完、编译进页面、改交叉引用、记下矛盾。问答里产生的综合结论要写回 wiki，不要只留在聊天记录。

## 三层在本仓库

1. **Raw**：`pi-dev/`、`docs-zh/`、第三方 clone、`raw/` 说明。LLM 只读，不改原文。
2. **Wiki**：`docs/`。会话可以创建和更新这些页面。
3. **Schema**：根目录 `AGENTS.md`。

## 操作

- **Ingest**：登记来源 → 写摘要页 → 更新概念/学习/决策页 → 更新 [[index|索引]] → 追加 [[log|日志]]
- **Query**：先 [[index|索引]] 再最少 wiki 页；缺证据才读 raw；可复用结论写回
- **Lint**：无来源断言、孤立页、过期哈希、未关闭问题
- **Session file-back**：实质性沟通结束后写 `docs/sessions/`，并改相关页

## 本仓库没有照搬的部分

- 没有飞书文档分类（本主题不是工作台项目资料）
- 没有 RAG / 向量库 / 自定义搜索脚本（index + `rg` 足够）
- `docs-zh/` 是路径镜像译文，不是 wiki 综合页；wiki 只链过去，不复制 80 篇全文
