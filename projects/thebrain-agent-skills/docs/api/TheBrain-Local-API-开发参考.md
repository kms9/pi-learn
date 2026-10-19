# TheBrain Local API · CLI 与 Skill 开发参考（OpenAPI v2）

> **权威输入**：用户提供的 `docs.json`，OpenAPI 3.0.1 / TheBrain Local API 1.0。
> **口径**：标记「规范确认」的是 docs.json 明示内容；标记「设计建议」的是本项目拟定约定；标记「待实机验证」的是规范未能保证的运行时行为。
> **接口状态**：已完成静态解析，尚未连接到用户本地桌面程序执行请求。

## 1. 接口规模与覆盖面

- **48** 条不同路径，**58** 个 HTTP 操作，**11** 个模块，**29** 个组件数据模型。
- App Control 仅本地 API 提供；客户端可读取当前 Brain/Thought、当前用户和多个标签页的状态，并可打开/关闭 Brain 或激活 Thought。
- 除几个静态资源路径外，业务 API 使用 `/api/*` 路径。规范未定义 `servers`，建议通过配置确定主机和端口。

### 模块统计

| 模块 | 操作数 | CLI 规划 |
|---|---:|---|
| App | 4 | `thebrain app` |
| Attachments | 6 | `thebrain attachment` |
| BrainAccess | 3 | `thebrain access (默认关闭写权限)` |
| Brains | 6 | `thebrain brain` |
| FileDownload | 10 | `thebrain asset` |
| Links | 6 | `thebrain link` |
| Notes | 5 | `thebrain note` |
| NotesImages | 1 | `thebrain asset` |
| Search | 3 | `thebrain search` |
| Thoughts | 13 | `thebrain thought / graph` |
| Users | 1 | `thebrain user` |

## 2. 认证、连接及基本请求（规范确认）

- API Key 在 TheBrain 桌面应用 **Settings > User > Local API Key** 获取。
- 安全定义为 HTTP **Bearer**：`Authorization: Bearer <apiKey>`。
- 文档给出的地址示例为 `http://localhost:11522/api/`。将 `http://localhost:11522` 作为可配置 Origin，具体请求使用规范内的完整 `/api/...` 路径，避免重复拼接 `/api/api`。
- `GET /api/app/state` 返回 `currentBrainId`、`currentBrainName`、`activeThoughtId`、`activeThoughtName`、`isLoggedIn`、`userId` 和 `tabs[]`。App Control 要求 key 匹配当前登录的用户（否则返回 403）。
- 全局定义 Bearer 安全规则；`GET /api/notes-images/{brainId}/{token}/{filename}` 文字说明使用**有有效期的 token、无需 Authorization**；但全局安全声明仍是 Bearer，应单独验证此例外，不要盲目强制注入鉴权。

```bash
export THEBRAIN_BASE_URL='http://localhost:11522'
export THEBRAIN_API_KEY='<从桌面应用中获取，不要写进 git 仓库>'
curl -fsS "$THEBRAIN_BASE_URL/api/app/state" \
  -H "Authorization: Bearer $THEBRAIN_API_KEY" \
  -H "Accept: application/json"
```

**设计建议**：密钥只经环境变量或系统密钥链读取；日志脱敏；默认只允许环回地址连接，不向公网开放本地 API；进程失败时返回结构化错误信息。

## 3. 关键数据模型（规范确认）

| 模型 | 核心字段 | 对业务的意义 |
|---|---|---|
| `ThoughtDto` | `id`, `brainId`, `name`, `label`, `aliases`, `typeId`, `kind`, `acType`, 时间戳、颜色 | 一个知识节点的元信息，不等于完整笔记 |
| `ThoughtGraphDto` | `activeThought`, `parents[]`, `children[]`, `jumps[]`, `siblings[]`, `tags[]`, `type`, `links[]`, `attachments[]` | 获取一个 Thought 的**直接**关系及附件；不提供 `depth` 参数 |
| `ThoughtCreateModel` | `name`, `kind`, `label`, `aliases`, `typeId`, `sourceThoughtId`, `relation`, `acType` | 可在创建时直接关联源节点；不指定源节点即创建 Orphan |
| `LinkCreateModel` | `thoughtIdA`, `thoughtIdB`, `relation`, `name` | 追加节点连接；具体 `relation` 数值/方向须与实机验证 |
| `NotesDto` | `brainId`, `sourceId`, `sourceType`, `modificationDateTime`, `markdown`, `html`, `text` | Note API 返回对象，并非直接返回 Markdown 字符串 |
| `NotesUpdateModel` | `markdown` | 更新或追加 Markdown；需要上层避免重复写入 |
| `AttachmentDto` | `id`, `sourceId`, `sourceType`, `type`, `name`, `location`, `dataLength` 等 | URL/文件附件检索与去重 |
| `SearchResultDto` | `sourceThought`, `sourceLink`, `searchResultType`, `brainId`, `brainName`, `attachmentId` | 搜索结果需根据结果类型区分实体；不是纯 Thought 列表 |
| `ModificationLogDto` | `sourceId`, `sourceType`, `modType`, `oldValue`, `newValue`, `creationDateTime` 等 | 知识库增量审计、变更来源核查 |
| `BrainDto` | `id`, `name`, `homeThoughtId` | Brain 身份和入口节点 |

### 枚举与语义（来自接口说明）

- Thought `kind`：`1 Normal`、`2 Type`、`3 Event`、`4 Tag`、`5 System`。
- Thought `acType`：`0 Public`、`1 Private`（特定于 Thought 描述；不要与 BrainAccess 的 `AccessType` 0–4 混用）。
- 创建 Thought 时的 `relation`：`1 Child`、`2 Parent`、`3 Jump`、`4 Sibling`。
- URL/路径查重的附件 `type`：`2 ExternalFile`、`3 ExternalUrl`（默认）、`8 ExternalDirectory`。
- 别名 `aliases`：保存时去首尾空格、不区分大小写去重、过滤与主名称相同项，上限 100；更新须一次性替换完整列表（或删除整个列表），不支持 `/aliases/0`；首次使用别名会提升 Brain 的跨设备最低版本要求为 **TheBrain 15.0.621**。
- `ModificationType`、`SearchResultType`、`AttachmentType` 的完整数值枚举在原始 OpenAPI 中提供，但并非所有数值都有文字语义；不要自己推断未描述的值。

## 4. 关键操作的请求契约（规范确认）

### 4.1 创建知识节点并建立直接关系

`POST /api/thoughts/{brainId}`，`Content-Type: application/json`；请求体引用 `ThoughtCreateModel`：

```json
{
  "name": "Agent Runtime",
  "kind": 1,
  "sourceThoughtId": "<实际存在的父 Thought UUID>",
  "relation": 1,
  "label": "知识节点"
}
```

返回 `CreateThoughtResponseModel`，字段为 `id`（字符串）。省略 `sourceThoughtId` 时创建 Orphan Thought。

### 4.2 创建链接

`POST /api/links/{brainId}` 使用 `LinkCreateModel`：

```json
{
  "thoughtIdA": "<Thought A UUID>",
  "thoughtIdB": "<Thought B UUID>",
  "relation": 3,
  "name": "关联"
}
```

> **待实机验证**：上面 `relation:3` 用于示意。创建 Thought 的四种关系数值有文字说明，但 `LinkCreateModel.relation` 的允许范围、方向细节未在该模型中单独注明；不能据此假设两个接口完全同义。

### 4.3 读取图谱

- `GET /api/thoughts/{brainId}/{thoughtId}/graph?includeSiblings=true`。
- `includeSiblings` 默认 `false`；返回 `ThoughtGraphDto`。
- **没有原生递归深度参数**。若 CLI 提供 `--depth 2`，须在 CLI 中多次调用并限制节点数、超时和循环访问。

### 4.4 阅读、追加和替换笔记

- `GET /api/notes/{brainId}/{thoughtId}`：读取 Markdown，返回 `NotesDto.markdown`。
- `POST /api/notes/{brainId}/{thoughtId}/update`：创建或**替换**笔记内容。
- `POST /api/notes/{brainId}/{thoughtId}/append`：向已有笔记追加内容。
- 两个写入端点都使用对象 `{"markdown":"..."}`，文档列明支持 `application/json`。
- **设计建议**：`update` 之前读取旧 Markdown 并显示差异；`append` 的 HTTP 重试不是天然幂等，采用操作标记或回读去重。

### 4.5 搜索与查重

- `GET /api/thoughts/{brainId}?nameExact=...`：按名称**精确匹配返回首个** Thought，并不保证唯一。
- `GET /api/search/{brainId}?queryText=...&maxResults=30&onlySearchThoughtNames=false`：Brain 内搜索。
- `GET /api/search/accessible` / `public`：跨可访问 / 公共 Brain 搜索。
- **新内容最多需要 15 秒建立搜索索引**。写入后立即校验应基于返回 `id` 调用详情和图谱 API，而不应仅靠搜索结果判断是否成功。
- `GET /api/attachments/{brainId}/by-location?location=...&type=3`：URL 附件的匹配忽略 `http`/`https` 与尾 `/`，其余部分（含大小写）必须相同。

### 4.6 其他接口的特例

- `POST /api/brains` 使用 `multipart/form-data` 的必填 `brainName`；OpenAPI 将成功响应标为 `BrainDto[]`，但这与单个创建动作不太相称：需要实机验证真实返回。
- `POST /api/attachments/{brainId}/{thoughtId}/file` 用 multipart/form-data；OpenAPI 将文件表单字段展开为 `ContentType/Headers/Length/Name/FileName` 等 `IFormFile` 元数据形态，**未准确表达二进制文件字段**；不能仅靠这些字段生成可靠文件上传客户端。
- `PATCH /api/thoughts/...`、`PATCH /api/links/...` 标注为 **JSON Patch**，同时暴露 `...JsonPatchDocument` 对象类型，其中 `operations` 被标记 `readOnly`。实际接受标准 RFC 6902 数组还是对象封装，需要用无害修改在测试 Brain 验证。
- `GET /api/brains/{brainId}/modifications` 要求传 `maxLogs`（默认值 100），可附带 RFC 3339 日期区间；`GET /api/thoughts/.../modifications` 要求传 `maxLogs` 和 `includeRelatedLogs`（默认 true）。
- 多个静态下载类接口没有声明成功响应的媒体类型和 schema；读取二进制时自行以响应头和实测数据决定处理。
- 未声明限流、批量事务、原生学习掌握度、复习排程等能力，不应在客户端中当作服务端保证。

## 5. 端点清单（58 个）

以下按源规范逐项抽取；完整参数、请求/响应 schema 引用另见伴随的 `TheBrain-Local-API-endpoints.json` 和原始 `docs.json`。

### App（4）

| 方法 | 路径 | 操作/简介 |
|---|---|---|
| `GET` | `/api/app/state` | getAppState |
| `POST` | `/api/app/brain/{brainId}/open` | openBrain |
| `POST` | `/api/app/brain/{brainId}/close` | closeBrainTab |
| `POST` | `/api/app/brain/{brainId}/thought/{thoughtId}/activate` | activateThought |

### Attachments（6）

| 方法 | 路径 | 操作/简介 |
|---|---|---|
| `GET` | `/api/attachments/{brainId}/{attachmentId}/metadata` | Returns details about the attachment |
| `GET` | `/api/attachments/{brainId}/by-location` | Finds attachments in the brain whose location matches the provided value. Works for external URLs, external files, and external directo |
| `GET` | `/api/attachments/{brainId}/{attachmentId}/file-content` | Returns the binary data for the attachment |
| `DELETE` | `/api/attachments/{brainId}/{attachmentId}` | Deletes an attachment |
| `POST` | `/api/attachments/{brainId}/{thoughtId}/file` | Adds a new file attachment to a thought |
| `POST` | `/api/attachments/{brainId}/{thoughtId}/url` | Adds a new URL attachment to a thought |

### BrainAccess（3）

| 方法 | 路径 | 操作/简介 |
|---|---|---|
| `GET` | `/api/brain-access/{brainId}` | Returns details about the brain accessors for the specified brain |
| `POST` | `/api/brain-access/{brainId}` | Sets the brain access level for the specified user |
| `DELETE` | `/api/brain-access/{brainId}` | Removes a user's access to the specified brain |

### Brains（6）

| 方法 | 路径 | 操作/简介 |
|---|---|---|
| `GET` | `/api/brains/{id}` | Returns details about one of the active user's brains |
| `DELETE` | `/api/brains/{id}` | Deletes a brain |
| `GET` | `/api/brains` | Returns a list of brains for the active user |
| `POST` | `/api/brains` | Creates a brain |
| `GET` | `/api/brains/{brainId}/statistics` | Gets statistics about the specified brain |
| `GET` | `/api/brains/{brainId}/modifications` | Gets a list of modification logs for the specified brain within a specified date and time range |

### FileDownload（10）

| 方法 | 路径 | 操作/简介 |
|---|---|---|
| `GET` | `/theme-wallpaper/{themeHash}` | 资源下载 |
| `GET` | `/file-display/{tempId}` | 资源下载 |
| `GET` | `/file-download/{tempId}` | 资源下载 |
| `GET` | `/brain-thumb/{brainId}/{userId}/{dummyImageId}` | 资源下载 |
| `GET` | `/favicon/{filename}` | 资源下载 |
| `GET` | `/stock-icons/{category}/{iconId}` | 资源下载 |
| `GET` | `/custom-icons/{category}/{iconId}` | 资源下载 |
| `GET` | `/custom-icons-root/{iconId}` | 资源下载 |
| `GET` | `/notes-image-request/{brainId}/{filename}` | 资源下载 |
| `GET` | `/image-request/{tempId}/{size}` | 资源下载 |

### Links（6）

| 方法 | 路径 | 操作/简介 |
|---|---|---|
| `GET` | `/api/links/{brainId}/{linkId}` | Returns details about the link |
| `DELETE` | `/api/links/{brainId}/{linkId}` | Deletes a link |
| `PATCH` | `/api/links/{brainId}/{linkId}` | Updates a link using JSON Patch |
| `GET` | `/api/links/{brainId}/{thoughtIdA}/{thoughtIdB}` | Gets the link between two thoughts |
| `GET` | `/api/links/{brainId}/{linkId}/attachments` | Returns a list of attachments for the link |
| `POST` | `/api/links/{brainId}` | Creates a link |

### Notes（5）

| 方法 | 路径 | 操作/简介 |
|---|---|---|
| `GET` | `/api/notes/{brainId}/{thoughtId}` | Returns the contents of a thought's note as Markdown |
| `GET` | `/api/notes/{brainId}/{thoughtId}/html` | Returns the contents of a thought's note as HTML |
| `GET` | `/api/notes/{brainId}/{thoughtId}/text` | Returns the contents of a thought's note as raw text |
| `POST` | `/api/notes/{brainId}/{thoughtId}/update` | Create or update a thought's note |
| `POST` | `/api/notes/{brainId}/{thoughtId}/append` | Append to a thought's note |

### NotesImages（1）

| 方法 | 路径 | 操作/简介 |
|---|---|---|
| `GET` | `/api/notes-images/{brainId}/{token}/{filename}` | This method does not require authorization and instead uses a token that expires to validate that this is a valid request. |

### Search（3）

| 方法 | 路径 | 操作/简介 |
|---|---|---|
| `GET` | `/api/search/{brainId}` | Returns search results from a brain |
| `GET` | `/api/search/public` | Returns search results from all public brains |
| `GET` | `/api/search/accessible` | Returns search results from all brains with user access |

### Thoughts（13）

| 方法 | 路径 | 操作/简介 |
|---|---|---|
| `GET` | `/api/thoughts/{brainId}/{thoughtId}` | Returns details about the thought |
| `PATCH` | `/api/thoughts/{brainId}/{thoughtId}` | Updates a thought using JSON Patch |
| `DELETE` | `/api/thoughts/{brainId}/{thoughtId}` | Deletes the specified thought |
| `GET` | `/api/thoughts/{brainId}/{thoughtId}/graph` | Returns the thought and its attachments, links, and related thoughts |
| `GET` | `/api/thoughts/{brainId}/{thoughtId}/attachments` | Returns a list of attachments for the thought |
| `GET` | `/api/thoughts/{brainId}` | Returns the first thought matching the name exactly |
| `POST` | `/api/thoughts/{brainId}` | Creates a thought |
| `POST` | `/api/thoughts/{brainId}/{thoughtId}/pin` | Pins the specified thought |
| `DELETE` | `/api/thoughts/{brainId}/{thoughtId}/pin` | Un-pins the specified thought |
| `GET` | `/api/thoughts/{brainId}/pins` | Gets a list of all pinned thoughts in a brain |
| `GET` | `/api/thoughts/{brainId}/{thoughtId}/modifications` | Gets a list of modification logs for the specified thought |
| `GET` | `/api/thoughts/{brainId}/types` | Gets a list of all Types in a specified brain |
| `GET` | `/api/thoughts/{brainId}/tags` | Gets a list of all Tags in a specified brain |

### Users（1）

| 方法 | 路径 | 操作/简介 |
|---|---|---|
| `GET` | `/api/users/organization` | Returns details about the active user's TeamBrain Organization members |

## 6. CLI 命令模型（设计建议，还不是已实现命令）

| 命令组 | 预期命令（示例） | 使用 API |
|---|---|---|
| 连接/上下文 | `thebrain doctor`; `thebrain app state` | App State；检测 Key 和本地服务 |
| Brain | `thebrain brain list`; `thebrain brain stats` | Brains |
| Thought | `thebrain thought get/find/create/update` | Thoughts；Search |
| 关联 | `thebrain thought graph`; `thebrain link create/delete` | Thought Graph；Links |
| 内容 | `thebrain note get/append/update` | Notes |
| 资料 | `thebrain attachment find-url/add-url/add-file` | Attachments |
| 导航 | `thebrain app activate` | App Control |
| 记录 | `thebrain history brain/thought` | Modifications |

**建议实现约束**：
- 所有读写均显示 `brainId`，默认可来自 App State，但写操作前必须在输出中明确目标 Brain。
- 输出同时支持 `--json`（Agent 默认）与便于人阅读的文本；命令只将机器数据输出到 stdout，进度和诊断输出到 stderr。
- 提供 `--dry-run`（复合工作流的变更预演）和高风险写操作确认；不对 DELETE 做静默执行。
- 对创建/更新节点采用“读前校验—执行—按 ID 回读”；对并发/超时使用有界重试，写请求重试前先查结果，避免重复。
- 优先手工封装两个 Skill 所需的少量稳定端点；若采用 OpenAPI 代码生成，须先处理 JSON Patch 与文件上传的 schema 不一致问题。

## 7. 两个 Skill 的流程设计（设计建议）

### Skill A：TheBrain 知识创建与维护

1. **Capture**：抽取输入的核心概念、来源 URL、学习目的及候选父节点。
2. **Find**：先按 exact-name、别名/关键词和 URL 附件查询；读取候选节点详情与一跳图谱，避免仅凭同名判断重复。
3. **Decide**：选择 `create / enrich-existing / add-link / no-op`，记录判断依据与风险。
4. **Plan**：拟定 Thought 类型、Parent/Child/Jump 的语义关系、Markdown 内容、引用及附件。
5. **Apply**：使用 createThought、createLink、notes update/append、addUrlAttachment 等组合 API。
6. **Verify**：按 ID 回读 Thought、Graph、Note；校验链接指向与引用，必要时读取 Modification Logs。
7. **Report**：返回 `brainId/thoughtId/linkId`、变更摘要、未完成或需要人工确认的事项。

**准则**：避免无限创建重复节点；优先维护概念节点而不是建立深层文件夹树；关联有具体语义才建立；同一知识点尽量复用已有 Thought。

### Skill B：基于 TheBrain 的学习与理解

1. **Locate**：确定学习目标并检索目标 Thought。
2. **Context**：读取一跳图谱、笔记与参考附件，按需扩展到有上限的二跳。
3. **Teach**：解释核心概念、前置知识、相似/对比概念，明确内容来自哪条笔记或链接。
4. **Recall**：引导学习者主动回忆、解释或应用；对表现进行评估而非仅展示总结。
5. **Track**：在独立的学习状态库（如本地 SQLite）记录复习计划、结果、掌握度、下一次复习时间。**原生 API 并未提供这些字段**。
6. **Feedback**：仅将值得长期保留的新理解、错误概念或学习摘要回写 TheBrain；原始答题流水留在学习状态库，防止笔记污染。

### 数据边界

- **TheBrain 是知识与语义关联的事实源**：Thought/Link/Note/Attachment。
- **学习服务是学习进程的事实源**：学习者、会话、卡片、复习计划、答题与掌握程度。
- **CLI 是本地受控工具层**：屏蔽认证与 DTO、确保参数校验、查询/写入执行及结果归一化。
- **两个 Skill 是策略层**：协调一组 CLI 命令，实施知识维护准则和教学策略，不直接拼接未经审查的 HTTP 请求。

## 8. 风险清单与实机验收

| 优先级 | 检查项 | 通过条件 |
|---|---|---|
| P0 | 本地服务和 Bearer 认证 | 未认证不通过，正确 Key 可获取 App State，确认 Brain/Thought 及 tabs 字段 |
| P0 | 实例化测试 Brain | 能创建隔离 Brain，确认 `createBrain` 返回的实际 JSON 形状 |
| P0 | Thought 创建 + 直接关系 | 用已存在 sourceThoughtId 创建子节点；回读 Graph 有预期的 parent/child |
| P0 | Note get/update/append | 测试 Markdown 字段、追加行为和更新是否覆盖原文 |
| P0 | JSON Patch | 用可恢复的 `label` 字段测试合法 payload 的真实形状 |
| P0 | 重复写入风险 | 断线后重试不会默默制造重复 Thought、Link、Note 片段 |
| P1 | 搜索索引延迟 | 立即通过 ID 可回读，随后搜索能找到新节点；搜索最长可能延迟 15 秒 |
| P1 | URL 附件去重与上传 | URL `by-location` 行为符合规范；查明上传表单真正的文件字段名 |
| P1 | App Control UI | 在可见客户端中激活 Thought，确认切换 Brain/Thought 的影响 |
| P1 | 多层图谱探索 | 组合多次 graph 调用，限制 BFS 深度/节点总数，去重环路 |
| P2 | 变更日志与兼容性 | 确认日志字段；升级和跨设备同步支持 `aliases` 的最低版本要求 |
| P2 | 权限/危险操作 | access 变更、删除 Brain/Thought/Link 必须显式授权，且仅在隔离测试库验收 |

## 9. 当前状态与下一步

- **已完成**：完整规范的离线解析、58 操作清单、29 模型字段索引、认证与核心业务模型核对。
- **尚未完成**：CLI 程序实现、两套 Skill 的 SKILL.md 与脚本、连接到用户机器的运行测试。
- **可开始**：以此规范作为本地 Go CLI（或其他语言）的开发输入；建议先完成 P0 读/写闭环，再构建两个 Skill。
- **输入不应丢失**：保存原始 `docs.json`，避免以二次整理的摘要替代规范源文件。
