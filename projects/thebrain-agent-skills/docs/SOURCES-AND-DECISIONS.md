# 来源、事实等级与决定记录

更新：2026-10-18。

## 第一手来源

1. [TheBrain Tutorials](https://www.thebrain.com/support/tutorials)：Thoughts/Links、Notes/Attachments、搜索与导航、Tags/Types/Link Types、AI、导入导出等操作方法。
2. [TheBrain Big Thinkers](https://www.thebrain.com/big-thinkers)：Jerry Michalski、Mark Trexler、David Allen、James Burke 等实际使用案例的官方入口。
3. [TheBrain Support](https://www.thebrain.com/support)：用户指南、论坛及更多资料入口。
4. `docs/api/docs.json`：用户从 TheBrain Local API 界面导出的 **OpenAPI 3.0.1**，本项目 Local API 1.0 规范真源。规范例子展示 `http://localhost:11522/api/`，但接口 path 自带 `/api/`。
5. `docs/api/TheBrain-Local-API-endpoints.json`：由原规范确定性抽取的 48 paths / 58 HTTP operations / 11 groups / 29 schemas。
6. `docs/api/TheBrain-Local-API-开发参考.md`：静态契约、数据模型、例子、风险和验收建议。

## 证据状态

| 断言 | 状态 | 依据 |
| --- | --- | --- |
| HTTP Bearer local API key | 规范确认 | `docs.json` Security / API Info |
| App Control 仅本地端 | 规范确认 | `docs.json` Info |
| ThoughtCreateModel 支持关联源 Thought | 规范确认 | `docs.json` |
| ThoughtGraphDto 包含关系、附件和链接 | 规范确认 | `docs.json` |
| 创建 Thought 的 relation 1/2/3/4 映射 | 规范文字确认，方向需实机复核 | `docs.json` 描述 |
| Search 可能存在索引延迟 | 规范描述，精确延迟需实机复核 | `docs.json` |
| JSON Patch 接受的确切请求体 | **待实机验证** | Schema 与请求媒体类型存在解释空间 |
| 上传 multipart 字段名/边界 | **待实机验证** | 规范及服务端实测前不做假定 |
| 创建 Brain 的 JSON 响应形态 | **待实机验证** | 可能与直觉预期不同 |
| LinkCreateModel relation / direction 语义 | **待实机验证** | 不等同 ThoughtCreateModel |
| 当前 CLI 与真实 TheBrain 成功连通 | **未验证** | 需用户 Mac 本地执行并保存脱敏证据 |

## 已确定设计决定

- D1：Go 实现 `brainctl`；标准库优先，不引入框架作为 CLI P0 前置。
- D2：两个 Skill 独立：`thebrain-knowledge` 和 `thebrain-learning`，共用一个 CLI。
- D3：所有操作明确 Brain ID；不因 UI 当前激活 Brain 就执行危险写入。
- D4：写入默认 dry-run、需 commit/approve；修改使用快照或 diff，且只在隔离 Brain 测试。
- D5：TheBrain 是事实内容源；答题历史、熟练度、复习调度计划放外部 SQLite（后续）。
- D6：先只读联通与端点验证，再写入闭环，最后把 CLI 封装为 Skill。
- D7：目前 GitHub 仓库是 `kms9/pi-learn` 内隔离目录/分支；独立仓库 `kms9/thebrain-agent-skills` 尚不存在，未来可迁移。

## 不可混淆的三种完成状态

- **静态通过**：文档解析、lint、Go 单测通过。
- **本地 API 通过**：用户机器 TheBrain Desktop 实际响应，记录版本/状态码/回读证据。
- **产品验收通过**：真实研究/学习场景能达成目标且可恢复、有质量与成本证据。

每项 Issue/PR 必须标注完成级别，禁止以模拟单测冒充产品通过。
