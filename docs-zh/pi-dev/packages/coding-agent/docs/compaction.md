本文是 `compaction.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 压缩与分支摘要 {#compaction--branch-summarization}

LLM 的上下文窗口有限。当对话变得过长时，Pi 使用压缩来总结较旧的内容，同时保留最近的工作。本页同时介绍自动压缩和分支摘要。

**源文件**（[pi-mono](https://github.com/earendil-works/pi-mono)）：
- [`packages/coding-agent/src/core/compaction/compaction.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts) - 自动压缩逻辑
- [`packages/coding-agent/src/core/compaction/branch-summarization.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts) - 分支摘要
- [`packages/coding-agent/src/core/compaction/utils.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/utils.ts) - 共享工具（文件跟踪、序列化）
- [`packages/coding-agent/src/core/session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts) - 条目类型（`CompactionEntry`、`BranchSummaryEntry`）
- [`packages/coding-agent/src/core/extensions/types.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts) - 扩展事件类型

若要查看项目中的 TypeScript 定义，请检查 `node_modules/@earendil-works/pi-coding-agent/dist/`。

## 概览 {#overview}

Pi 有两种摘要机制：

| 机制 | 触发时机 | 用途 |
|-----------|---------|---------|
| 压缩 | 上下文超过阈值，或 `/compact` | 总结旧消息以释放上下文 |
| 分支摘要 | `/tree` 导航 | 在切换分支时保留上下文 |

两者使用相同的结构化摘要格式，并累计跟踪文件操作。压缩和分支摘要请求使用全新的 routing session ID，并且在 provider 支持的情况下禁用 prompt-cache 写入，因为这些一次性提示不太可能被复用。

## 压缩 {#compaction}

### 何时触发 {#when-it-triggers}

自动压缩在以下情况触发：

```
contextTokens > contextWindow - reserveTokens
```

默认情况下，`reserveTokens` 为 16384 tokens（可在 `~/.pi/agent/settings.json` 或 `<project-dir>/.pi/settings.json` 中配置）。这为 LLM 的响应留出空间。

在多轮 agent 运行期间，Pi 在工具完成且结果已追加之后、开始下一次 assistant 响应之前检查该阈值。如果超过阈值，Pi 会在同一次 agent 运行内压缩，并用摘要和保留的消息继续。当已完成的工具批次结束本次运行、且没有排队消息需要另一次响应时，会跳过这次轮次间检查。Pi 也会在新的用户提示之前以及底层 agent 运行结束之后检查该阈值。

你也可以用 `/compact [instructions]` 手动触发，其中可选的 instructions 用于聚焦摘要。

### 工作方式 {#how-it-works}

1. **查找切分点**：从最新消息向后走，累计 token 估计，直到达到 `keepRecentTokens`（默认 20k，可在 `~/.pi/agent/settings.json` 或 `<project-dir>/.pi/settings.json` 中配置）
2. **提取消息**：收集从上一个保留边界（或会话开始）到切分点的消息
3. **生成摘要**：调用 LLM 以结构化格式进行总结；若存在先前摘要，则将其作为迭代上下文传入
4. **追加条目**：保存带有摘要和 `firstKeptEntryId` 的 `CompactionEntry`
5. **重建上下文**：会话为下一次请求重建上下文，使用摘要 + 从 `firstKeptEntryId` 起的消息

```
压缩前：

  entry:  0     1     2     3      4     5     6      7      8     9
        ┌─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┬─────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│
        └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴─────┘
                └────────┬───────┘ └──────────────┬──────────────┘
               messagesToSummarize            kept messages
                                   ↑
                          firstKeptEntryId (entry 4)

压缩后（追加了新条目）：

  entry:  0     1     2     3      4     5     6      7      8     9     10
        ┌─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┬─────┬─────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│ cmp │
        └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴─────┴─────┘
               └──────────┬──────┘ └──────────────────────┬───────────────────┘
                 不发送给 LLM                    发送给 LLM
                                                         ↑
                                              从 firstKeptEntryId 开始

LLM 看到的内容：

  ┌────────┬─────────┬─────┬─────┬──────┬──────┬─────┬──────┐
  │ system │ summary │ usr │ ass │ tool │ tool │ ass │ tool │
  └────────┴─────────┴─────┴─────┴──────┴──────┴─────┴──────┘
       ↑         ↑      └─────────────────┬────────────────┘
    prompt   来自 cmp          来自 firstKeptEntryId 的消息
```

在重复压缩时，被总结的区间从上一次压缩的保留边界（`firstKeptEntryId`）开始，而不是从压缩条目本身开始；如果在路径中找不到该保留条目，则回退到上一次压缩之后的条目。这样会把先前压缩中幸存下来的消息也纳入下一次摘要。Pi 还会在写入新的 `CompactionEntry` 之前，根据重建后的会话上下文重新计算 `tokensBefore`，因此 token 计数反映的是实际被替换的压缩前上下文。

### 拆分 turn {#split-turns}

一个 “turn” 从用户消息开始，并包含直到下一条用户消息之前的所有 assistant 响应和工具调用。通常，压缩会在 turn 边界处切分。

当单个 turn 超过 `keepRecentTokens` 时，切分点会落在 turn 中间的一条 assistant 消息上。这就是 “拆分 turn”：

```
拆分 turn（一个巨大的 turn 超出预算）：

  entry:  0     1     2      3     4      5      6     7      8
        ┌─────┬─────┬─────┬──────┬─────┬──────┬──────┬─────┬──────┐
        │ hdr │ usr │ ass │ tool │ ass │ tool │ tool │ ass │ tool │
        └─────┴─────┴─────┴──────┴─────┴──────┴──────┴─────┴──────┘
                ↑                                     ↑
         turnStartIndex = 1                  firstKeptEntryId = 7
                │                                     │
                └──── turnPrefixMessages (1-6) ───────┘
                                                      └── kept (7-8)

  isSplitTurn = true
  messagesToSummarize = []  （之前没有完整 turn）
  turnPrefixMessages = [usr, ass, tool, ass, tool, tool]
```

对于拆分 turn，Pi 会生成两份摘要并合并它们：
1. **历史摘要**：先前上下文（如果有）
2. **Turn 前缀摘要**：拆分 turn 的前半部分

### 切分点规则 {#cut-point-rules}

有效切分点是：
- 用户消息
- Assistant 消息
- BashExecution 消息
- 自定义消息（custom_message、branch_summary）

永远不要在工具结果处切分（它们必须与其工具调用放在一起）。

### CompactionEntry 结构 {#compactionentry-structure}

定义于 [`session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts)：

```typescript
interface CompactionEntry<T = unknown> {
  type: "compaction";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  usage?: Usage;       // 生成该摘要的 LLM usage
  fromHook?: boolean;  // 若由扩展提供则为 true（遗留字段名）
  details?: T;         // 实现特定的数据
}

// 默认压缩将此用于 details（来自 compaction.ts）：
interface CompactionDetails {
  readFiles: string[];
  modifiedFiles: string[];
}
```

扩展可以在 `details` 中存储任何可 JSON 序列化的数据。默认压缩跟踪文件操作，但自定义扩展实现可以使用自己的结构。生成的摘要和扩展提供的摘要在可用时会存储其 LLM `usage`，以便会话总计包含摘要工作。

实现参见 [`prepareCompaction()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts) 和 [`compact()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts)。对于直接的编程式摘要，`generateSummary()` 返回摘要文本，`generateSummaryWithUsage()` 返回 `{ text, usage }`。

## 分支摘要 {#branch-summarization}

### 何时触发 {#when-it-triggers-1}

当你使用 `/tree` 导航到不同分支时，Pi 会提议对你将要离开的工作进行摘要。这会把离开分支的上下文注入到新分支中。

### 工作方式 {#how-it-works-1}

1. **查找共同祖先**：旧位置与新位置共享的最深节点
2. **收集条目**：从旧叶子走回共同祖先
3. **按预算准备**：按 token 预算包含消息（最新优先）
4. **生成摘要**：以结构化格式调用 LLM
5. **追加条目**：在导航点保存 `BranchSummaryEntry`

```
导航前的树：

         ┌─ B ─ C ─ D （旧叶子，即将被放弃）
    A ───┤
         └─ E ─ F （目标）

共同祖先：A
要摘要的条目：B、C、D

带摘要导航之后：

         ┌─ B ─ C ─ D
    A ───┤
         └─ E ─ F ─ [B,C,D 的摘要] （新叶子）
```

### 累计文件跟踪 {#cumulative-file-tracking}

压缩和分支摘要都会累计跟踪文件。生成摘要时，pi 从以下位置提取文件操作：
- 正在被摘要的消息中的工具调用
- 先前的压缩或分支摘要 `details`（如果有）

这意味着文件跟踪会跨多次压缩或嵌套分支摘要累计，保留已读和已修改文件的完整历史。

### BranchSummaryEntry 结构 {#branchsummaryentry-structure}

定义于 [`session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts)：

```typescript
interface BranchSummaryEntry<T = unknown> {
  type: "branch_summary";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  fromId: string;      // 我们从中导航而来的条目
  usage?: Usage;       // 生成该摘要的 LLM usage
  fromHook?: boolean;  // 若由扩展提供则为 true（遗留字段名）
  details?: T;         // 实现特定的数据
}

// 默认分支摘要将此用于 details（来自 branch-summarization.ts）：
interface BranchSummaryDetails {
  readFiles: string[];
  modifiedFiles: string[];
}
```

与压缩相同，扩展可以在 `details` 中存储自定义数据。

实现参见 [`collectEntriesForBranchSummary()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts)、[`prepareBranchEntries()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts) 和 [`generateBranchSummary()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts)。

## 摘要格式 {#summary-format}

压缩和分支摘要使用相同的结构化格式：

```markdown
## Goal
[用户想要完成的事情]

## Constraints & Preferences
- [用户提到的要求]

## Progress
### Done
- [x] [已完成的任务]

### In Progress
- [ ] [当前工作]

### Blocked
- [问题（如有）]

## Key Decisions
- **[决策]**：[理由]

## Next Steps
1. [接下来应该发生什么]

## Critical Context
- [继续所需的数据]

<read-files>
path/to/file1.ts
path/to/file2.ts
</read-files>

<modified-files>
path/to/changed.ts
</modified-files>
```

### 消息序列化 {#message-serialization}

在摘要之前，消息通过 [`serializeConversation()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/utils.ts) 序列化为文本：

```
[User]: What they said
[Assistant thinking]: Internal reasoning
[Assistant]: Response text
[Assistant tool calls]: read(path="foo.ts"); edit(path="bar.ts", ...)
[Tool result]: Output from tool
```

这可以防止模型把它当作需要继续的对话。

序列化期间，工具结果会被截断到 2000 个字符。超出该限制的内容会替换为标记，说明截断了多少字符。这使摘要请求保持在合理的 token 预算内，因为工具结果（尤其来自 `read` 和 `bash`）通常是上下文体积的最大贡献者。

## 通过扩展自定义摘要 {#custom-summarization-via-extensions}

扩展可以拦截并自定义压缩和分支摘要。事件类型定义参见 [`extensions/types.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts)。

### session_before_compact {#session_before_compact}

在自动压缩或 `/compact` 之前触发。可以取消或提供自定义摘要。参见类型文件中的 `SessionBeforeCompactEvent` 和 `CompactionPreparation`。

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, reason, willRetry, signal } = event;

  // preparation.messagesToSummarize - 要摘要的消息
  // preparation.turnPrefixMessages - 拆分 turn 的前缀（若 isSplitTurn）
  // preparation.previousSummary - 先前的压缩摘要
  // preparation.fileOps - 提取出的文件操作
  // preparation.tokensBefore - 压缩前的上下文 tokens
  // preparation.firstKeptEntryId - 保留消息的起始位置
  // preparation.settings - 压缩设置

  // branchEntries - 当前分支上的全部条目（用于自定义状态）
  // reason - "manual"（/compact）、"threshold" 或 "overflow"
  // willRetry - 中止的 turn 是否在压缩后重试（overflow 恢复）
  // signal - AbortSignal（传给 LLM 调用）

  // 取消：
  return { cancel: true };

  // 自定义摘要：
  return {
    compaction: {
      summary: "Your summary...",
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      // usage: summaryResponse.usage, // 可选；计入会话总计
      details: { /* 自定义数据 */ },
    }
  };
});
```

#### 将消息转换为文本 {#converting-messages-to-text}

若要用你自己的模型生成摘要，使用 `serializeConversation` 将消息转换为文本：

```typescript
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

pi.on("session_before_compact", async (event, ctx) => {
  const { preparation } = event;
  
  // 将 AgentMessage[] 转换为 Message[]，再序列化为文本
  const conversationText = serializeConversation(
    convertToLlm(preparation.messagesToSummarize)
  );
  // 返回：
  // [User]: message text
  // [Assistant thinking]: thinking content
  // [Assistant]: response text
  // [Assistant tool calls]: read(path="..."); bash(command="...")
  // [Tool result]: output text

  // 现在发送给你的模型做摘要
  const { summary, usage } = await myModel.summarize(conversationText);
  
  return {
    compaction: {
      summary,
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      usage,
    }
  };
});
```

完整示例参见 [custom-compaction.ts](../examples/extensions/custom-compaction.ts)，它使用了不同的模型。

### session_compact_failed {#session_compact_failed}

在手动或自动压缩失败或被中止时触发。这对于需要将 `session_before_compact` 尝试与最终结果配对的遥测扩展很有用。

```typescript
pi.on("session_compact_failed", async (event, ctx) => {
  const { reason, errorMessage, aborted, willRetry, fromExtension } = event;
  // reason - "manual"（/compact）、"threshold" 或 "overflow"
  // errorMessage - 非中止失败时存在
  // aborted - 对取消/中止的压缩为 true
  // willRetry - 中止的 turn 是否本应在压缩后重试
  // fromExtension - 是否正在使用扩展提供的压缩内容
});
```

### session_before_tree {#session_before_tree}

在 `/tree` 导航之前触发。无论用户是否选择摘要都会触发。可以取消导航或提供自定义摘要。

```typescript
pi.on("session_before_tree", async (event, ctx) => {
  const { preparation, signal } = event;

  // preparation.targetId - 我们要导航到的位置
  // preparation.oldLeafId - 当前位置（即将被放弃）
  // preparation.commonAncestorId - 共享祖先
  // preparation.entriesToSummarize - 将被摘要的条目
  // preparation.userWantsSummary - 用户是否选择摘要

  // 完全取消导航：
  return { cancel: true };

  // 提供自定义摘要（仅在 userWantsSummary 为 true 时使用）：
  if (preparation.userWantsSummary) {
    return {
      summary: {
        summary: "Your summary...",
        // usage: summaryResponse.usage, // 可选；计入会话总计
        details: { /* 自定义数据 */ },
      }
    };
  }
});
```

参见类型文件中的 `SessionBeforeTreeEvent` 和 `TreePreparation`。

## 设置 {#settings}

在 `~/.pi/agent/settings.json` 或 `<project-dir>/.pi/settings.json` 中配置压缩：

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

| 设置 | 默认值 | 说明 |
|---------|---------|-------------|
| `enabled` | `true` | 启用自动压缩 |
| `reserveTokens` | `16384` | 为 LLM 响应预留的 tokens |
| `keepRecentTokens` | `20000` | 要保留（不摘要）的最近 tokens |

使用 `"enabled": false` 禁用自动压缩。你仍然可以用 `/compact` 手动压缩。
