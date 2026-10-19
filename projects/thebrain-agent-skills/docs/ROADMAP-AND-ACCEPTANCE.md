# 里程碑与验收标准

> 截至 2026-10-18：理论资料与 API 规范已完成，**Mac 实机连接/写闭环/Skill 实测均未通过**。在 Issue 中使用 `not-started` / `in-progress` / `pass-mock` / `pass-local` / `blocked` 区分状态。

## M0：项目基线与接口资料（完成：文档层）

范围：仓库结构；官方来源；OpenAPI 源文件 `docs.json`；58 接口索引；Go CLI 最小代码；两个 Skill 草案；风险。

验收：完整原始 JSON 可解析，48 paths / 58 operations / 11 groups / 29 schemas；README 有入口；敏感 Key 不入库；规划与验收文档清晰区分“规范已知”和“真实运行未证实”。

## M1：Mac 本地联通与只读闭环（未通过实机）

任务：
1. 在 Mac 启动 TheBrain；从 Settings > User 获取 Local API Key。
2. `brainctl doctor`：GET app/state + GET brains，200/401/403 等错误可解释。
3. `brainctl brain list`、`thought get`、`thought graph`、`note get`、`search`。
4. 确认 API Origin 为 `http://127.0.0.1:11522` 或本机文档显示的地址。
5. 正确处理 Graph 的 parents/children/jumps/siblings/tags/links/attachments。
6. 记录本机版本、日志（脱敏）和最小复现。

退出门：真实 TheBrain 连续三次 read 操作成功，身份一致；错误密钥有明确失败；没有任何修改原库的动作。仅 mock 单测不算 M1 完成。

## M2：测试 Brain 安全写入闭环（未开始）

任务顺序：
1. 在独立 Brain 内创建 3-5 个 Thought；核实 `POST /api/brains` 响应格式。
2. 验证 `ThoughtCreateModel` 的 `sourceThoughtId + relation=1/2/3/4` 行为，用 Graph 双向核对。
3. Note update 与 append 的覆盖、换行、重试语义；保存修改前快照。
4. LinkCreateModel 的 relation/direction 及重复链接处理。
5. JSON Patch 的 Content-Type、payload array/object；上传附件的 multipart 字段。
6. 模拟中途断线、重复请求、重复搜索延迟、权限错误。
7. 仅在隔离 Brain 内测试删除/危险操作；主项目不默认开放。

退出门：单节点创建→连接→写 Note→再次读取形成可重复证据链；每项写入均有差异预览、显式 apply、读回验证与回滚/补偿策略；没有污染生产 Brain。

## M3：thebrain-knowledge Skill 可用性（未开始）

任务：
- 实现 capture → extract → dedupe → propose → preview → apply → verify；
- 使用 Project/Question/Concept/Evidence/Decision 模型组织真实问题；
- 从现有知识中补链接、发现孤立/重复/过期对象；
- 保留来源、信心与人工拒绝记录；
- 不改变已标记 verified 的判断而不留审计。

场景：新增一篇关于 Agent 协同的研究材料，复用已有 Task Contract / DAG / Acceptance Gate Thought，创建有依据的 Jump，而不是复制 3 份文章。

退出门：至少 3 次完整任务，经人工验收没有意外重复/破坏；失败后可恢复，变更 diff 与实际 Graph 一致。

## M4：thebrain-learning Skill 教学闭环（未开始）

任务：
- 学习目标 → 先验知识诊断 → 检索知识与出处 → 分层讲解 → 主动回忆 → 答案质量评价 → 错误归因 → 后续计划；
- P0 以会话数据验证，随后引入 SQLite 学习状态表，禁止误写知识事实层；
- 测试概念迁移问题、相似概念辨析、来源冲突和证据不足的拒答/标记。

场景：用户提出“我到底懂没懂 Task Contract 和 Dependency DAG 的区别”，Skill 基于 TheBrain 提供材料，生成迁移题，核验回答，并只更新个人学习进度。

退出门：至少 3 个知识点闭环；评估基于用户真实回答，能够指出未掌握之处与下轮练习；在知识缺口时不编造证据。

## M5：持续质量与长期维护（后置）

- 结构健康度、孤立节点、来源覆盖、复习完成率；
- SQLite schema 与版本迁移、备份和恢复；
- LLM 质量评测、成本与时延追踪；多 Agent 接入按权限隔离；
- 再评估是否需要 MCP 或远程 Agent Bridge，不作为 M1/M2 前置依赖。

## 当前任务分工

| 项 | 交付方 | 判断依据 |
| --- | --- | --- |
| Docs/API/Skill 规则与只读 CLI | GitHub 分支（本次提供） | 代码/文档存在，mock 单测可复跑 |
| Desktop 启动、获取 Local API Key | 用户 Mac | 本机配置/密钥不对外传递 |
| 连通性与真实响应 | 用户本机运行 CLI | 脱敏 M1 证据 |
| 写入测试 | 后续 CLI 实现 + 用户 Mac | M2 测试 Brain 实际回读 |
| Skill 业务测试 | Agent + 用户验收 | M3/M4 业务输出和用户回答 |

## P0–P2 风险登记

- P0：认证与桌面用户身份不匹配，CLI Origin 拼错双重 `/api`。
- P0：错误写入真实 Brain 或误重复创建。
- P0：JSON Patch 真实 payload 与规范模型歧义。
- P1：搜索索引延迟、创建关系方向误判、Notes append 非幂等。
- P1：多 Brain、跳转链接、重复 Concept 的去重错误。
- P2：附件 multipart、NotesImage 临时 token、aliases 跨设备版本（TheBrain >=15.0.621）、分享权限与删除接口。
