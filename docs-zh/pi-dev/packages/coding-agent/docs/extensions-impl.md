# pi 扩展实现导读

本文说明 **pi 扩展在源码里如何实现**，把概念映射到文件。它不是 API 手册。

- 写扩展、事件语义、`pi.*` / `ctx.*` 细节：见 [extensions.zh.md](./extensions.zh.md)（英文原稿 [extensions.md](./extensions.md)）。
- 可运行示例目录：见 [examples/extensions/README.zh.md](../examples/extensions/README.zh.md)。

核心实现集中在 `src/core/extensions/`，由 `AgentSession` 和 `ResourceLoader` 接到会话生命周期上。

---

## 1. 源码地图

| 文件 | 职责 |
|------|------|
| `src/core/extensions/types.ts` | 类型真源：`ExtensionFactory`、`ExtensionAPI`、`ExtensionContext`、事件与结果 |
| `src/core/extensions/index.ts` | 对外再导出（SDK / `@earendil-works/pi-coding-agent`） |
| `src/core/extensions/loader.ts` | 发现、jiti 加载、factory 调用、runtime 桩、`commit`/`discard` |
| `src/core/extensions/runner.ts` | `bindCore`、构造 `ctx`、通用 `emit` 与专用 `emitXxx` |
| `src/core/extensions/wrapper.ts` | 把 `RegisteredTool` 包成 `AgentTool`，注入 `ExtensionContext` |
| `src/core/tools/tool-definition-wrapper.ts` | `wrapToolDefinition`：execute 时补上 `ctx` |
| `src/core/resource-loader.ts` | 生产路径：包管理器解析、信任两阶段加载、inline factory |
| `src/core/project-trust.ts` | 启动时调用 `emitProjectTrustEvent` |
| `src/core/agent-session.ts` | 创建 `ExtensionRunner`、`bindCore`、tool hooks、会话事件接线 |
| `src/core/agent-session-runtime.ts` | `/new` `/resume` `/fork` 时发 `session_shutdown` 并换会话 |

读代码建议顺序：`types.ts` 里的五个核心类型 → `loader.ts` → `runner.ts` → `wrapper.ts` → `agent-session.ts` 的 `_buildRuntime` / `bindExtensions` / `_installAgentToolHooks`。

---

## 2. 一个扩展是什么

扩展是 **default export 的 factory**：

```ts
export type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>;
```

factory 在加载时被调用一次（可 async）。它用 `pi.on` / `pi.registerTool` 等往一个 `Extension` 对象上登记；之后运行时由 `ExtensionRunner` 按事件名查找 handler。

加载完成后的 `Extension`（`types.ts`）是登记表，不是 class 实例：

- `handlers: Map<string, HandlerFn[]>` — `pi.on(event, ...)`
- `tools` / `commands` / `flags` / `shortcuts`
- `messageRenderers` / `entryRenderers` / `markdownTransformer`
- `path` / `resolvedPath` / `sourceInfo`

多个扩展共享同一个 `ExtensionRuntime`。factory 里的 `pi` 是 per-extension 的 `ExtensionAPI`，注册写自己的 `Extension`，action（`sendMessage`、`setModel` 等）委托给共享 runtime。

---

## 3. 发现与加载（loader.ts）

### 3.1 两条入口

**公开 API** `discoverAndLoadExtensions(configuredPaths, cwd, agentDir)`：

1. 项目本地：`cwd/${CONFIG_DIR_NAME}/extensions/`（通常是 `.pi/extensions/`）
2. 全局：`agentDir/extensions/`（通常是 `~/.pi/agent/extensions/`）
3. 调用方显式传入的路径（CLI `-e` 一类）

目录规则在 `discoverExtensionsInDir` / `resolveExtensionEntries`：

1. 直接的 `*.ts` / `*.js`
2. 子目录的 `index.ts` / `index.js`
3. 子目录 `package.json` 的 `pi.extensions` 字段

只向下看一层。复杂包必须用 manifest。

**生产路径**不直接扫目录，而是 `ResourceLoader` + `PackageManager.resolve()`：settings 里启用的包、CLI 临时路径、SDK inline factory。`loadExtensionsCached` 复用同一套 jiti 加载。

### 3.2 jiti 与 virtualModules

`loadExtensionModule` 用 [jiti](https://github.com/unjs/jiti) 加载 TS/JS，`moduleCache: false`。按运行时选解析策略：

| 运行时 | 策略 |
|--------|------|
| Bun 二进制 / Node SEA / bundled Node | `virtualModules: VIRTUAL_MODULES`（静态 import 打进二进制的包） |
| 源码 TypeScript | `virtualModules` + `tsconfigPaths: true` |
| 未打包的 Node dist | `alias: getAliases()` 指到各包 dist |

`VIRTUAL_MODULES` 把 `typebox`、`@earendil-works/pi-*`（以及旧 scope `@mariozechner/pi-*`）注入扩展。`pi-ai` 根路径解析到 **compat** 入口，旧全局 API 仍能跑。

扩展 factory 按路径缓存；cwd 变了或 `clearExtensionCache()` 会整表失效。`ResourceLoader.reload()` 在已加载过时会清缓存。

### 3.3 创建 API：commit / discard

`initializeExtension` 流程：

1. `createExtension` — 空 Map
2. `createExtensionAPI(extension, runtime, cwd, eventBus)` — 得到 `{ api, commit, discard }`
3. `await factory(api)`
4. 成功 `commit()`；抛错 `discard()` 再 rethrow

加载期 `state` 为 `"loading"`：

- `pi.on` / `registerTool` / `registerCommand` 等立刻写入 `extension`
- flag 默认值进 `pendingFlagValues`，不立刻写 `runtime.flagValues`
- `registerProvider` 经 `applyRuntimeChange` 排队，等 commit 或 bind 后再生效
- `pi.events.on` 的退订函数记入 `loadingUnsubscribers`

`commit()`：把 pending flag / runtime 变更刷进共享 runtime，`state = "active"`。  
`discard()`：`state = "failed"`，退订加载期 event-bus 订阅。之后再碰这个 `pi` 会抛错。

因此：factory 失败不会留下半套 provider 注册或 event-bus 监听；成功之前 runtime 侧的副作用是可回滚的。

---

## 4. Runtime 桩，然后 bindCore

### 4.1 createExtensionRuntime（loader.ts）

加载时还没有 `AgentSession`，action 不能真跑。`createExtensionRuntime()` 给出：

- 大多数 action：调用即抛 `Extension runtime not initialized...`
- `refreshTools`：空函数（`registerTool` 加载期合法，刷新要等 bind 之后）
- `registerProvider` / `registerNativeProvider`：推进 `pending*Registrations`
- `unregisterProvider`：只从队列里删
- `invalidate(message)`：标记 stale，退订 tracked event-bus
- `assertActive()`：stale 则抛 `staleMessage`

`LoadExtensionsResult.runtime` 就是这份对象，所有扩展的 `pi` 都指向它。

### 4.2 ExtensionRunner.bindCore（runner.ts）

`AgentSession._buildRuntime` 创建 `ExtensionRunner(extensions, runtime, ...)`，立刻 `_bindExtensionCore` → `runner.bindCore(actions, contextActions, providerActions)`：

1. **复制 `ExtensionActions` 进 runtime**：`sendMessage`、`setActiveTools`、`setModel` 等变成会话实现。此后 `pi.sendMessage()` 不再抛桩错误。
2. **保存 `ExtensionContextActions` 到 runner 字段**：`getModel`、`isIdle`、`compact`、`shutdown` 等，供 `createContext()` 使用。
3. **flush 排队的 provider 注册**到 `ModelRegistry` / `modelRuntime`。出错走 `emitError`，不中断 bind。
4. **替换 runtime 的 register/unregister**：bind 之后立即生效，不必 `/reload`。

命令侧方法（`newSession`、`fork`、`reload`）不在 `bindCore`，而在 `bindCommandContext`，由 `AgentSession.bindExtensions` 在 UI/mode 就绪后绑上。

`createContext()` 用 **getter**，每次读 `ctx.model` / `ctx.ui` 都走当前 runner 状态。`createCommandContext()` 用属性描述符复制这些 getter，避免 object spread 把旧值冻进对象、绕过 stale 检查。

会话替换或 reload 会 `runner.invalidate()` + `runtime.invalidate()`。之后再用捕获的 `pi` / `ctx` 会抛错。`newSession` / `fork` / `switchSession` 的后续工作应放进 `withSession`，用回调里的新 `ctx`。

---

## 5. 事件分发（runner.ts）

扩展不向总线订阅生命周期事件。`pi.on("tool_call", h)` 把 `h` 推进 `extension.handlers.get("tool_call")`。Runner 在宿主到达某生命周期点时，按 **扩展加载顺序**、每个扩展内 **注册顺序** 调用。

### 5.1 通用 emit

`emit(event)` 覆盖没有专用方法的事件（`session_start`、`agent_end`、`session_before_*` 等）。

- 为每次 emit 建一个 `createContext()`
- handler 抛错 → `emitError`，继续下一个
- `session_before_switch` / `_fork` / `_compact` / `_tree`：若结果带 `cancel: true`，立刻返回，后面的 handler 不再跑

### 5.2 专用 emitXxx

这些事件有返回值或链式变换，不能走通用 `emit`（`RunnerEmitEvent` 把它们 Exclude 掉了）：

| 方法 | 行为 |
|------|------|
| `emitToolCall` | 任一 handler 返回 `{ block: true }` 立即返回 |
| `emitToolResult` | 链式覆盖 `content` / `details` / `isError` / `usage` |
| `emitUserBash` | 第一个有返回值的 handler 胜出 |
| `emitContext` | 链式替换 `messages`（`structuredClone` 起步） |
| `emitBeforeProviderRequest` | 链式替换 payload |
| `emitBeforeProviderHeaders` | **就地**改 `headers`，忽略返回值 |
| `emitBeforeAgentStart` | 收集注入的 custom message；`systemPrompt` 链式替换；该事件里 `ctx.getSystemPrompt()` 反映当前链 |
| `emitMessageEnd` | 链式替换 finalized message，role 必须不变 |
| `emitResourcesDiscover` | 汇总 `skillPaths` / `promptPaths` / `themePaths`，带上 `extensionPath` |
| `emitInput` | `transform` 串联文本/图片；`handled` 短路 |
| `emitProjectTrustEvent` | 模块级函数，不经 runner；第一个 `trusted: "yes"\|"no"` 胜出，`"undecided"` 继续 |

`project_trust` 发生在 runner bind 之前，所以走独立函数，迭代 `LoadExtensionsResult.extensions`，`ctx` 是精简的 `ProjectTrustContext`。

### 5.3 UI prompt 包装

`setUIContext` 把 `select` / `confirm` / `input` / `editor` / `custom` 包进 `withUIPrompt`，在外层对话框开始/结束时异步 `emit` `ui_prompt_start` / `ui_prompt_end`。无 UI 时用 `noOpUIContext`。

---

## 6. 工具包装与 AgentSession hooks

职责拆开：

**执行期 context** — `wrapper.ts`：

```ts
wrapToolDefinition(definition, () => runner.createContext())
```

扩展工具的 `execute(..., ctx)` 拿到和事件 handler 同一套 `ExtensionContext`。内置工具在 `_refreshToolRegistry` 里同样 `wrapRegisteredTools`，以便覆盖/渲染路径也能拿到 `ctx`。

包装器还有一层：若 `execute` 期间 `getActiveTools()` 变长（动态 `registerTool`），把新名字并进 `result.addedToolNames`。

**拦截 tool_call / tool_result** — **不在 wrapper**。`AgentSession._installAgentToolHooks` 装在 agent-core 上：

- `agent.beforeToolCall` → `runner.emitToolCall`（可 block；改参就地改 `event.input`）
- `agent.afterToolCall` → `runner.emitToolResult`，再 `normalizeToolResultImages`

hooks 每次读 `this._extensionRunner`，reload 换 runner 不必重装 hook。

动态 `pi.registerTool()` 调 `runtime.refreshTools()` → `_refreshToolRegistry()`，当前会话立刻可见，不必 `/reload`。

---

## 7. 宿主如何接线

### 7.1 信任两阶段（ResourceLoader + project-trust.ts）

项目本地扩展可能改 settings / 跑代码，必须先信任：

1. `loadProjectTrustExtensions()`：`setProjectTrusted(false)` 再加载 → **只有用户/全局 + CLI**，没有项目本地
2. `resolveProjectTrusted({ extensionsResult })` → `emitProjectTrustEvent`
3. 有 yes/no 则采用（`remember: true` 写入 `trust.json`）；否则看已存决策 / `defaultProjectTrust`
4. `loadFinalExtensionSet`：同一 `runtime` 上加载剩余路径（含项目本地），inline factory 复用

### 7.2 会话启动（AgentSession）

`_buildRuntime`：

1. 从 `ResourceLoader.getExtensions()` 取 `extensions` + `runtime`
2. `new ExtensionRunner(...)`
3. `_bindExtensionCore` → `bindCore`
4. `_refreshToolRegistry` 包装工具

之后 mode 调用 `bindExtensions`：

1. `setUIContext` / `bindCommandContext` / error listener
2. `emit(session_start)`（reason 默认 `"startup"`，reload 为 `"reload"`）
3. `emitResourcesDiscover` → `ResourceLoader.extendResources` 合并 skill/prompt/theme，重建 system prompt

### 7.3 一次用户输入

`AgentSession` 提交 prompt 时（简化）：

1. 以 `/` 开头：先尝试扩展命令（流式中也可跑；命令自己用 `pi.sendMessage` 跟 LLM 说话）
2. `emitInput` — 可 `transform` 或 `handled`
3. skill / prompt template 展开
4. `emitBeforeAgentStart` — 可注入 custom message、改本回合 system prompt
5. agent 循环：`turn_start` → `context` → `before_provider_headers` / `_request` → 流式消息事件 → 若有 tool：`tool_execution_*` + `tool_call` / `tool_result` → `turn_end`
6. `agent_end`，全部结算后 `agent_settled`

`/new` `/resume` `/fork`：`session_before_*`（可 cancel）→ `session_shutdown` → 拆旧 runtime → 新会话 `session_start` + `resources_discover`。

`ctx.reload()`：`session_shutdown` → `invalidate` 旧 runner → 重新加载资源 → `_buildRuntime` → `session_start` reason `"reload"` → `resources_discover` reason `"reload"`。

退出：`session_shutdown`。

---

## 8. 生命周期（实现视角）

```
启动
  ├─ loadProjectTrustExtensions（用户/全局/CLI）
  ├─ project_trust          ← emitProjectTrustEvent，尚无完整 runner
  ├─ 加载项目本地扩展（同一 runtime）
  ├─ bindCore + 包装工具
  ├─ session_start { reason: "startup" }
  └─ resources_discover { reason: "startup" }

用户输入
  ├─ 扩展命令？（/foo）
  ├─ input
  ├─ before_agent_start
  └─ agent 循环（context / provider / tool_call / tool_result / ...）

会话替换或 reload
  ├─ session_before_*（可 cancel）
  ├─ session_shutdown
  ├─ invalidate 旧 ctx
  ├─ session_start { reason: "new" | "resume" | "fork" | "reload" }
  └─ resources_discover

退出
  └─ session_shutdown
```

对应 API 文档里的事件图；上图只标实现分界：信任在 bind 前，资源发现在 `session_start` 之后，工具拦截在 agent-core hooks。

---

## 9. 五个核心类型

不要把它们当成同一个 `ctx`。

| 类型 | 谁拿到 | 干什么 | 何时存在 |
|------|--------|--------|----------|
| **ExtensionAPI**（`pi`） | factory | 登记事件/工具/命令；action 委托 runtime | 加载时创建，commit 后一直可用，直到 invalidate |
| **ExtensionContext**（`ctx`） | 事件 handler、工具 `execute`、快捷键 | UI、会话只读、`abort`/`compact`/`shutdown` | `createContext()` 每次 emit/execute 新建；getter 是活的 |
| **ExtensionCommandContext** | `registerCommand` 的 handler | 上述 + `newSession`/`fork`/`switchSession`/`reload`/`waitForIdle` | `createCommandContext()`；会话控制只在用户命令里安全 |
| **ExtensionRuntime** | loader 创建，runner bind | 共享 action 实现、flag 值、pending provider、stale 标记 | 一次加载一个；会话替换会 invalidate |
| **Extension** | loader 的产物 | 该扩展的登记表 | factory 返回后填满 |

相关但次要：

- `ExtensionActions` / `ExtensionContextActions` / `ExtensionCommandContextActions`：宿主注入 runner 的函数表
- `ReplacedSessionContext`：`withSession` 回调里的新会话 command ctx，另有 `sendMessage` / `sendUserMessage`
- `RegisteredTool`：`ToolDefinition` + `SourceInfo`
- `LoadExtensionsResult`：`extensions` + `errors` + 共享 `runtime`

`ExtensionAPI` 能登记、能发消息，但 **没有** `ctx.ui` 或 `ctx.sessionManager`。UI 与会话状态只在 handler/工具拿到的 `ExtensionContext` 上。factory 里不要启动后台资源：factory 可能在从不进入会话的调用里跑（例如 `--list-models`）。后台工作放到 `session_start`，在 `session_shutdown` 里对称关掉。

---

## 10. 冲突、快捷键、命令名

Runner 聚合登记项时：

- **工具**：同名第一次注册获胜（`getAllRegisteredTools`）
- **Flag**：同名第一次获胜；CLI 值写在 `runtime.flagValues`
- **快捷键**：与 `keybindings.json` 的保留 id（`app.interrupt`、`app.exit` 等）冲突则跳过；非保留冲突发 warning，后注册覆盖。见 `RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS`
- **命令**：重名变成 `name:2` 这类 `invocationName`（`resolveRegisteredCommands`）

`ResourceLoader.addExtensionConflictDiagnostics` 把冲突记进 `LoadExtensionsResult.errors`，扩展仍保持加载。

---

## 11. 建议阅读切片

按问题选入口，避免整份 `types.ts` 一页页扫：

1. **factory 如何变成登记表** — `loader.ts`：`loadExtensionModule` → `initializeExtension` → `createExtensionAPI`
2. **为什么加载期不能 `pi.sendMessage`** — `createExtensionRuntime` 的桩；对照 `runner.bindCore` 覆盖哪些字段
3. **事件怎么到 handler** — `runner.emit*`；`agent-session.ts` 里搜 `emitToolCall`、`emitInput`、`emitBeforeAgentStart`
4. **工具如何拿到 ctx** — `wrapper.ts` + `tool-definition-wrapper.ts`；拦截看 `_installAgentToolHooks`
5. **信任为何看不见项目扩展** — `resource-loader.ts` 的 `loadProjectTrustExtensions` / `loadFinalExtensionSet`，以及 `project-trust.ts`
6. **reload 为何让旧 ctx 作废** — `AgentSession.reload`：`emitSessionShutdownEvent` → `invalidate` → `_buildRuntime`

API 形状与事件字段仍以 [extensions.zh.md](./extensions.zh.md) 为准。对照行为时看 [examples/extensions/README.zh.md](../examples/extensions/README.zh.md)，例如 `permission-gate.ts`（`tool_call`）、`dynamic-tools.ts`（加载后再 `registerTool`）、`reload-runtime.ts`（安全 reload）。
