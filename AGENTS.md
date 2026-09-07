# AGENTS.md

本仓库有两件事：用 LLM Wiki 积累「如何写 Pi 插件」的知识；对照源码和现成插件真正去写。

`docs/` 是编译后的 wiki。`docs-zh/` 是上游中文镜像。`pi-dev/` 等现有 GitHub 仓是 **submodule**（见 `.gitmodules`），不要在里面改文件当 overlay 作品。

## 语言

维护层用中文。YAML 键、路径、命令、URL、API 名、`type`/`status`/`tags` 保持英文枚举。

## 三层

1. **Raw**：git submodule（`pi-dev/` 等）、`docs-zh/` 译文、`raw/` 说明。只读，不改已登记原文。
2. **Wiki**：`docs/`。ingest、问答写回、lint 时更新。
3. **Schema**：本文件。

## 会话启动

1. 读本文件。
2. 读 `docs/index.md`。
3. 读 `docs/log.md` 最近几条。
4. 用 `rg` 找相关 wiki 页，再打开 `docs-zh/` 或 `pi-dev/`。
5. 只有 wiki 缺证据、用户要求核对原文、或明确 ingest 时，才读 raw。

## 沟通必须写回 wiki

实质性对话结束后（决策、概念澄清、学习路径变化、新来源、未决问题），**不要只留在聊天里**，按主题写入对应目录：

| 内容 | 目录 |
|------|------|
| 本次沟通摘要 | `docs/sessions/YYYY-MM-DD-短标题.md` |
| 概念（Extension / package / facet 等） | `docs/concepts/` |
| 怎么学、怎么写 | `docs/learning/` |
| 仓库/overlay 结构 | `docs/overlay/` |
| 已拍板的选择 | `docs/decisions/YYYY-MM-DD-….md` |
| 新资料 | `docs/sources/` + `source-register.md` |
| 未决 | `docs/questions/open-questions.md` |

然后更新 `docs/index.md`（或分类 `_index.md`），向 `docs/log.md` 追加一条。新持久页用 `docs/templates/` 里对应模板。

聊天里的一次性调试输出不必写回。可复用的结论必须写回。

## Ingest

1. 确认来源路径或 URL。
2. 更新 `docs/sources/source-register.md`。
3. 在 `docs/sources/` 写或改摘要页。
4. 抽出事实、决策、风险、开放问题，更新相关概念/学习/overlay 页。
5. 更新 `docs/index.md`。
6. 追加 `docs/log.md`。

## Query

1. 从 `docs/index.md` 开始。
2. 打开最少相关 wiki 页。
3. 缺证据再搜 `docs-zh/` 或 `pi-dev/`。
4. 回答里引用本地路径。
5. 可长期复用的综合结论写回 wiki，并记 log（事件类型 `query` 或 `session`）。

## Lint

检查：无来源断言、孤立页、`docs-zh` 哈希过期、未关闭却已回答的问题、一词多名。每次 lint 记 `docs/log.md`。需要时跑 `python3 scripts/sync-zh.py`。

## 元数据

```yaml
---
title: 页面标题
type: concept
status: active
created: 2026-09-07
updated: 2026-09-07
tags:
  - project-wiki
---
```

`type`：`index`、`concept`、`source`、`session`、`decision`、`question-log`、`process`、`module`、`log`

`status`：`active`、`draft`、`superseded`、`archived`、`needs-review`

## 链接与命名

- wiki 内部用 `[[concepts/extension|Extension]]`
- 源码和译文用普通 Markdown 路径或反引号
- 新页必须能从 `docs/index.md` 或分类 `_index.md` 进入
- 目录名小写 ASCII；页面名可读，可用中文
- 会话和决策：`YYYY-MM-DD-` 前缀

## 日志形状

```markdown
## [YYYY-MM-DD] session | 简短标题

- 来源: …
- 更新: `docs/…`
- 说明: …
```

事件类型：`init`、`ingest`、`query`、`lint`、`sync`、`decision`、`maintenance`、`session`。

## 本仓库主题：学写 Pi 插件

默认工作对象是 **coding-agent Extension**：`export default function (pi: ExtensionAPI)`。用户说「插件」先按这个理解，除非他们明确说 Chord facet / `PI_EXPERIMENTAL`。

**不要改 `pi-dev/`。** 译文只动 `docs-zh/`。新插件不要写进上游 examples。

| 名称 | 是什么 | wiki |
|------|--------|------|
| Extension | 运行时模块 | [[docs/concepts/extension]] |
| Pi package | `pi install` 分发单位 | [[docs/concepts/pi-package]] |
| Chord plugin | 实验性分进程 facet | [[docs/concepts/chord-plugin]] |
| Harness | agent − model 那一层运行时 | [[docs/concepts/harness]]；完整对照 [[docs/learning/harness对照讲解]] |

学习路径、运行时、写作约束见 [[docs/learning/怎么学写插件]]。证据在 `docs-zh/pi-dev/packages/coding-agent/docs/extensions.md` 与 `extensions-impl.md`。

帮用户写插件时：问清拦截 / 工具 / 命令 / UI / 打包；从官方 examples 抄结构；`StringEnum`；状态放 `details`；改文件走 `withFileMutationQueue()`；输出截断；`/reload` 用自动发现目录。

## Overlay 维护

```bash
./scripts/sync-submodules.sh
python3 scripts/sync-zh.py
python3 scripts/sync-zh.py --accept <source> --record-head
```

细节见 [[docs/overlay/仓库结构]]。同步 submodule 会改 overlay 里的 gitlink SHA；要钉死新上游版本时再 commit 这些路径。

## 编辑边界

- 不要改、commit、force-push `pi-dev/` 或其它上游 clone。
- 不要把 `*.zh.md` 写回 `pi-dev`。
- 不要编造日期、HEAD、API 行为。未知标 `unknown`。
- 不要掩盖歧义，记入 `docs/questions/open-questions.md`。
- 不要引入 RAG、向量库、wiki 搜索服务，除非用户批准且现有 index 不够用。
- 不要整份粘贴 `extensions.md`。
