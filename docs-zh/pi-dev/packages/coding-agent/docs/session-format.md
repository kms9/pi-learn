本文是 `session-format.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 会话文件格式 {#session-file-format}

会话以 JSONL（JSON Lines）文件存储。每行是一个带有 `type` 字段的 JSON 对象。会话条目通过 `id`/`parentId` 字段形成树结构，从而可以在原文件内分支，而无需创建新文件。

## 文件位置 {#file-location}

```
~/.pi/agent/sessions/--<path>--/<timestamp>_<uuid>.jsonl
```

其中 `<path>` 是将 `/` 替换为 `-` 后的工作目录。

## 删除会话 {#deleting-sessions}

可以通过删除 `~/.pi/agent/sessions/` 下对应的 `.jsonl` 文件来移除会话。

Pi 也支持在 `/resume` 中交互式删除会话（选中一个会话后按 `Ctrl+D`，然后确认）。在可用时，pi 会使用 `trash` CLI，以避免永久删除。

## 会话版本 {#session-version}

会话在文件头中有一个 version 字段：

- **Version 1**：线性条目序列（旧版，加载时自动迁移）
- **Version 2**：带 `id`/`parentId` 链接的树结构
- **Version 3**：将 `hookMessage` role 重命名为 `custom`（扩展统一）

现有会话在加载时会自动迁移到当前版本（v3）。

## 源文件 {#source-files}

GitHub 源码（[pi-mono](https://github.com/earendil-works/pi-mono)）：
- [`packages/coding-agent/src/core/session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts) - 会话条目类型与 SessionManager
- [`packages/coding-agent/src/core/messages.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/messages.ts) - 扩展消息类型（BashExecutionMessage、CustomMessage 等）
- [`packages/ai/src/types.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/types.ts) - 基础消息类型（UserMessage、AssistantMessage、ToolResultMessage）
- [`packages/agent/src/types.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/agent/src/types.ts) - AgentMessage 联合类型

若要在项目中查看 TypeScript 定义，请检查 `node_modules/@earendil-works/pi-coding-agent/dist/` 和 `node_modules/@earendil-works/pi-ai/dist/`。

## 消息类型 {#message-types}

会话条目包含 `AgentMessage` 对象。理解这些类型对于解析会话和编写扩展至关重要。

### 内容块 {#content-blocks}

消息包含类型化内容块数组：

```typescript
interface TextContent {
  type: "text";
  text: string;
}

interface ImageContent {
  type: "image";
  data: string;      // base64 编码
  mimeType: string;  // 例如 "image/jpeg"、"image/png"
}

interface ThinkingContent {
  type: "thinking";
  thinking: string;
}

interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, any>;
}
```

### 基础消息类型（来自 pi-ai） {#base-message-types-from-pi-ai}

```typescript
interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;  // Unix 毫秒
}

interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: string;
  provider: string;
  model: string;
  usage: Usage;
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  timestamp: number;
}

interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: any;      // 工具特定元数据
  usage?: Usage;      // 该工具执行的嵌套 LLM 工作
  isError: boolean;
  timestamp: number;
}

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}
```

导出的 pi-ai `StopReason` 类型还包含 `"pending"`，但该值仅保留给流式事件中的部分消息。终端的 `done`/`error` 消息会在 pi 持久化 assistant 消息之前将其替换为完成原因，因此 `"pending"` 不应出现在会话 JSONL 中。

### 扩展消息类型（来自 pi-coding-agent） {#extended-message-types-from-pi-coding-agent}

```typescript
interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  excludeFromContext?: boolean;  // `!!` 前缀命令为 true
  timestamp: number;
}

interface CustomMessage {
  role: "custom";
  customType: string;            // 扩展标识符
  content: string | (TextContent | ImageContent)[];
  display: boolean;              // 在 TUI 中显示
  details?: any;                 // 扩展特定元数据
  timestamp: number;
}

interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId: string;                // 从其分支的条目
  timestamp: number;
}

interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp: number;
}
```

### AgentMessage 联合类型 {#agentmessage-union}

```typescript
type AgentMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | BashExecutionMessage
  | CustomMessage
  | BranchSummaryMessage
  | CompactionSummaryMessage;
```

## 条目基类 {#entry-base}

所有条目（除 `SessionHeader` 外）都扩展 `SessionEntryBase`：

```typescript
interface SessionEntryBase {
  type: string;
  id: string;           // 8 位十六进制 ID
  parentId: string | null;  // 父条目 ID（第一条为 null）
  timestamp: string;    // ISO 时间戳
}
```

## 条目类型 {#entry-types}

### SessionHeader {#sessionheader}

文件的第一行。仅元数据，不参与树结构（没有 `id`/`parentId`）。

```json
{"type":"session","version":3,"id":"uuid","timestamp":"2024-12-03T14:00:00.000Z","cwd":"/path/to/project"}
```

对于有父会话的会话（通过 `/fork`、`/clone` 或 `newSession({ parentSession })` 创建）：

```json
{"type":"session","version":3,"id":"uuid","timestamp":"2024-12-03T14:00:00.000Z","cwd":"/path/to/project","parentSession":"/path/to/original/session.jsonl"}
```

### SessionMessageEntry {#sessionmessageentry}

对话中的一条消息。`message` 字段包含一个 `AgentMessage`。

```json
{"type":"message","id":"a1b2c3d4","parentId":"prev1234","timestamp":"2024-12-03T14:00:01.000Z","message":{"role":"user","content":"Hello"}}
{"type":"message","id":"b2c3d4e5","parentId":"a1b2c3d4","timestamp":"2024-12-03T14:00:02.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi!"}],"provider":"anthropic","model":"claude-sonnet-4-5","usage":{...},"stopReason":"stop"}}
{"type":"message","id":"c3d4e5f6","parentId":"b2c3d4e5","timestamp":"2024-12-03T14:00:03.000Z","message":{"role":"toolResult","toolCallId":"call_123","toolName":"bash","content":[{"type":"text","text":"output"}],"isError":false}}
```

### ModelChangeEntry {#modelchangeentry}

用户在会话中途切换模型时发出。

```json
{"type":"model_change","id":"d4e5f6g7","parentId":"c3d4e5f6","timestamp":"2024-12-03T14:05:00.000Z","provider":"openai","modelId":"gpt-4o"}
```

### ThinkingLevelChangeEntry {#thinkinglevelchangeentry}

用户更改 thinking/reasoning 级别时发出。

```json
{"type":"thinking_level_change","id":"e5f6g7h8","parentId":"d4e5f6g7","timestamp":"2024-12-03T14:06:00.000Z","thinkingLevel":"high"}
```

### CompactionEntry {#compactionentry}

在压缩上下文时创建。存储更早消息的摘要。

```json
{"type":"compaction","id":"f6g7h8i9","parentId":"e5f6g7h8","timestamp":"2024-12-03T14:10:00.000Z","summary":"User discussed X, Y, Z...","firstKeptEntryId":"c3d4e5f6","tokensBefore":50000}
```

较新的 harness 生成压缩会把压缩后保留的上下文直接嵌入条目，而不是使用 `firstKeptEntryId`：

```json
{"type":"compaction","id":"f6g7h8i9","parentId":"e5f6g7h8","timestamp":"2024-12-03T14:10:00.000Z","summary":"User discussed X, Y, Z...","tokensBefore":50000,"retainedTail":[{"role":"user","content":"latest request"},{"role":"assistant","content":[{"type":"text","text":"latest reply"}],"provider":"anthropic","model":"claude-sonnet-4-5","usage":{...},"stopReason":"stop"}]}
```

可选字段：
- `usage`：生成摘要时的 LLM 用量；计入会话 token 与费用总计
- `retainedTail`：压缩后保留的物化 `AgentMessage[]`。该字段仅因与旧会话向后兼容才是可选的。较新的 harness 生成压缩会包含它，以便我们可以从这个检查点重建上下文，而无需遍历压缩条目之前的更早条目。
- `details`：实现特定数据（例如默认的 `{ readFiles: string[], modifiedFiles: string[] }`，或扩展的自定义数据）
- `fromHook`：由扩展生成时为 `true`，由 pi 生成时为 `false`/`undefined`（旧字段名）
- `firstKeptEntryId`：用于兼容旧条目格式。

### BranchSummaryEntry {#branchsummaryentry}

通过 `/tree` 切换分支、并用 LLM 生成离开分支直到共同祖先的摘要时创建。捕获被放弃路径中的上下文。

```json
{"type":"branch_summary","id":"g7h8i9j0","parentId":"a1b2c3d4","timestamp":"2024-12-03T14:15:00.000Z","fromId":"f6g7h8i9","summary":"Branch explored approach A..."}
```

可选字段：
- `usage`：生成摘要时的 LLM 用量；计入会话 token 与费用总计
- `details`：文件跟踪数据（默认 `{ readFiles: string[], modifiedFiles: string[] }`，或扩展的自定义数据）
- `fromHook`：由扩展生成时为 `true`，由 pi 生成时为 `false`/`undefined`（旧字段名）

### CustomEntry {#customentry}

扩展状态持久化。不参与 LLM 上下文。

```json
{"type":"custom","id":"h8i9j0k1","parentId":"g7h8i9j0","timestamp":"2024-12-03T14:20:00.000Z","customType":"my-extension","data":{"count":42}}
```

使用 `customType` 在重新加载时识别你的扩展条目。交互模式可以通过 `pi.registerEntryRenderer(customType, renderer)` 渲染自定义条目，但它们仍然不参与 LLM 上下文。

### CustomMessageEntry {#custommessageentry}

由扩展注入、且会参与 LLM 上下文的消息。

```json
{"type":"custom_message","id":"i9j0k1l2","parentId":"h8i9j0k1","timestamp":"2024-12-03T14:25:00.000Z","customType":"my-extension","content":"Injected context...","display":true}
```

字段：
- `content`：字符串或 `(TextContent | ImageContent)[]`（与 UserMessage 相同）
- `display`：`true` = 在 TUI 中以独特样式显示，`false` = 隐藏
- `details`：可选的扩展特定元数据（不会发送给 LLM）

### LabelEntry {#labelentry}

用户在条目上定义的书签/标记。

```json
{"type":"label","id":"j0k1l2m3","parentId":"i9j0k1l2","timestamp":"2024-12-03T14:30:00.000Z","targetId":"a1b2c3d4","label":"checkpoint-1"}
```

将 `label` 设为 `undefined` 可清除标签。

### SessionInfoEntry {#sessioninfoentry}

会话元数据（例如用户定义的显示名称）。通过 `/name`、`--name` / `-n`，或扩展中的 `pi.setSessionName()` 设置。

```json
{"type":"session_info","id":"k1l2m3n4","parentId":"j0k1l2m3","timestamp":"2024-12-03T14:35:00.000Z","name":"Refactor auth module"}
```

设置后，会话名称会在会话选择器（`/resume`）中显示，而不是第一条消息。

## 树结构 {#tree-structure}

条目形成一棵树：
- 第一条条目的 `parentId: null`
- 之后每条条目通过 `parentId` 指向其父条目
- 分支会从更早的条目创建新的子节点
- “leaf” 是树中的当前位置

```
[user msg] ─── [assistant] ─── [user msg] ─── [assistant] ─┬─ [user msg] ← current leaf
                                                            │
                                                            └─ [branch_summary] ─── [user msg] ← alternate branch
```

## 上下文构建 {#context-building}

`buildContextEntries()` 从当前 leaf 走到 root，在遵守压缩的同时生成活动条目列表：

1. 收集路径上的所有条目
2. 如果路径上有 `CompactionEntry`：
   - 首先包含压缩条目
   - 如果存在 `retainedTail`，它作为自包含检查点，压缩之后的条目会被包含
   - 否则包含从 `firstKeptEntryId` 到压缩条目的条目
   - 然后包含压缩之后的条目
3. 在所选范围内保留非消息条目，以便交互模式可以渲染它们

`buildSessionContext()` 基于该条目列表，生成发送给 LLM 的消息列表：

1. 从完整路径提取当前模型和 thinking 级别设置
2. 将所选条目转换为消息：
   - `message` -> 存储的 `AgentMessage`
   - `compaction` -> `compactionSummary`，若存在则加上 `retainedTail`
   - `branch_summary` -> `branchSummary`
   - `custom_message` -> `CustomMessage`
   - `custom` -> 无上下文消息

这使较新的压缩像自包含检查点一样工作。`retainedTail` 仅因兼容旧会话才是可选的，那些旧会话只存储 `firstKeptEntryId`，但仍需能正确加载。

## 解析示例 {#parsing-example}

```typescript
import { readFileSync } from "fs";

const lines = readFileSync("session.jsonl", "utf8").trim().split("\n");

for (const line of lines) {
  const entry = JSON.parse(line);

  switch (entry.type) {
    case "session":
      console.log(`Session v${entry.version ?? 1}: ${entry.id}`);
      break;
    case "message":
      console.log(`[${entry.id}] ${entry.message.role}: ${JSON.stringify(entry.message.content)}`);
      break;
    case "compaction":
      console.log(`[${entry.id}] Compaction: ${entry.tokensBefore} tokens summarized`);
      break;
    case "branch_summary":
      console.log(`[${entry.id}] Branch from ${entry.fromId}`);
      break;
    case "custom":
      console.log(`[${entry.id}] Custom (${entry.customType}): ${JSON.stringify(entry.data)}`);
      break;
    case "custom_message":
      console.log(`[${entry.id}] Extension message (${entry.customType}): ${entry.content}`);
      break;
    case "label":
      console.log(`[${entry.id}] Label "${entry.label}" on ${entry.targetId}`);
      break;
    case "model_change":
      console.log(`[${entry.id}] Model: ${entry.provider}/${entry.modelId}`);
      break;
    case "thinking_level_change":
      console.log(`[${entry.id}] Thinking: ${entry.thinkingLevel}`);
      break;
  }
}
```

## SessionManager API {#sessionmanager-api}

以编程方式处理会话的关键方法。

### 静态创建方法 {#static-creation-methods}
- `SessionManager.create(cwd, sessionDir?)` - 新会话
- `SessionManager.open(path, sessionDir?)` - 打开已有会话文件
- `SessionManager.continueRecent(cwd, sessionDir?)` - 继续最近会话或创建新会话
- `SessionManager.inMemory(cwd?)` - 不持久化到文件
- `SessionManager.forkFrom(sourcePath, targetCwd, sessionDir?)` - 从另一个项目 fork 会话

### 静态列出方法 {#static-listing-methods}
- `SessionManager.list(cwd, sessionDir?, onProgress?)` - 列出某个目录的会话
- `SessionManager.listAll(onProgress?)` - 列出所有项目中的全部会话

### 实例方法 - 会话管理 {#instance-methods---session-management}
- `newSession(options?)` - 开始新会话（options：`{ parentSession?: string }`）
- `setSessionFile(path)` - 切换到另一个会话文件
- `createBranchedSession(leafId)` - 将分支提取到新的会话文件

### 实例方法 - 追加（均返回条目 ID） {#instance-methods---appending-all-return-entry-id}
- `appendMessage(message)` - 添加消息
- `appendThinkingLevelChange(level)` - 记录 thinking 变更
- `appendModelChange(provider, modelId)` - 记录模型变更
- `appendCompaction(summary, firstKeptEntryId, tokensBefore, details?, fromHook?)` - 添加压缩
- `appendCustomEntry(customType, data?)` - 扩展状态（不进入上下文）
- `appendSessionInfo(name)` - 设置会话显示名称
- `appendCustomMessageEntry(customType, content, display, details?)` - 扩展消息（进入上下文）
- `appendLabelChange(targetId, label)` - 设置/清除标签

### 实例方法 - 树导航 {#instance-methods---tree-navigation}
- `getLeafId()` - 当前位置
- `getLeafEntry()` - 获取当前 leaf 条目
- `getEntry(id)` - 按 ID 获取条目
- `getBranch(fromId?)` - 从条目走到 root
- `getTree()` - 获取完整树结构
- `getChildren(parentId)` - 获取直接子节点
- `getLabel(id)` - 获取条目的标签
- `branch(entryId)` - 将 leaf 移到更早的条目
- `resetLeaf()` - 将 leaf 重置为 null（任何条目之前）
- `branchWithSummary(entryId, summary, details?, fromHook?)` - 带上下文摘要的分支

### 实例方法 - 上下文与信息 {#instance-methods---context--info}
- `buildContextEntries()` - 获取已应用压缩的活动分支条目
- `buildSessionContext()` - 获取发送给 LLM 的 messages、thinkingLevel 和 model
- `getEntries()` - 所有条目（不含 header）
- `getHeader()` - 会话头元数据
- `getSessionName()` - 从最新 `session_info` 条目获取显示名称
- `getCwd()` - 工作目录
- `getSessionDir()` - 会话存储目录
- `getSessionId()` - 会话 UUID
- `getSessionFile()` - 会话文件路径（内存会话为 undefined）
- `isPersisted()` - 会话是否已保存到磁盘
