本文是 `telemetry.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 调用 Context 与 Telemetry 设计笔记 {#invocation-context-and-telemetry-design-notes}

> **状态：** 设计输入，不是规范契约。Context 原语和必需的尾部 `Context` 参数已在 harness、session、执行能力和 hosted-harness adapter 中落地。本地传播是脚手架，而不是完整 telemetry 语义的证明：大多数 runtime span 和跨进程 trace 传播仍是设计或实现工作。Drive 所有权现在由 harness 拥有，request-ID RPC 取消已实现；二者都不提供分布式 trace 父级。把已接受的最终行为折入 `harness.md`。`telemetry-schema.md` 仍是 span 名称和 attribute 的生成参考。

## 目标 {#goal}

`Session`、`Branch`、`AgentLane` 和 `AgentHarness` 通过必需的尾部 `Context` 参数显式接收调用范围的控制数据。同一接收者可能服务并发本地调用方或 RPC client，因此它不能保留可变或默认的调用方 context。

调用 context 必须在不使用 `AsyncLocalStorage` 的情况下解决两个相关问题：

1. 在并发异步工作中保留正确的 telemetry 父级；
2. 在存在 `AbortSignal` 时携带它，以便 RPC adapter 可以把它映射到请求取消。

这项工作必须复用 `@earendil-works/pi-telemetry`。它不得引入另一套 span 抽象。

## Context 模型 {#context-model}

已实现的公开类型是：

```ts
interface ContextKey<T> {
	readonly token: symbol;
	readonly valueType?: (value: T) => T;
}

interface Context {
	readonly abortSignal: AbortSignal | undefined;
	readonly telemetryContext: TelemetryContext;
	value<T>(key: ContextKey<T>): T | undefined;
	toString(): string;
}
```

`valueType` 是仅类型标记。运行时查找使用 key 的 symbol token。`createContextKey<T>(description)` 创建并冻结一个带唯一 token 的 key。

Context 是不可变的。派生创建一层父链接、写时复制的层。Helper 参数把值放在前面，把父 context 放在最后：

```ts
const requestContext = withAbortSignal(requestSignal, parentContext);
const spanContext = withTelemetryContext(span, requestContext);
const tenantContext = withContextValue(tenantKey, tenantId, spanContext);
```

已实现行为是：

- `BACKGROUND_CONTEXT` 和 `TODO_CONTEXT` 是不同的空根，其 `abortSignal` 为 `undefined`；
- `telemetryContext` 始终可用，当尚未安装 telemetry 值时回退到 `NOOP_TELEMETRY_CONTEXT`；
- `withAbortSignal(signal, context)` 在父级没有 signal 时保留所提供的 signal，否则用 `AbortSignal.any()` 把它与父 signal 组合；
- `withCancel(context)` 返回一个可独立取消的子 context 和一个 `cancel(reason?)` 函数；父级取消仍会到达子级；
- 类型化值使用 symbol 身份和不可变写时复制层，同一 key 的较新值遮蔽其父值；
- 内置 abort-signal 和 telemetry key 是私有的；调用方使用具名属性，而不是按 key 检索那些值；
- `toString()` 是诊断性的，记录根以及每一层 key 描述。

Context 值是横切的请求 metadata，不是业务依赖。合适的类型化值包括 request ID、已认证主体、tenant ID 和诊断 metadata。Storage、model、tool、持久化状态和业务 payload 不属于 context。Context、signal、telemetry 对象和 backend 原生 span 对象永远不是持久化数据。

## 接收者所有权 {#receiver-ownership}

共享接收者保留身份和持久化/进程状态，而不是调用 context：

```text
AgentHarness receiver  ── no caller context
AgentLane receiver     ── no caller context
Session receiver       ── no caller context
Branch receiver        ── no caller context
```

每一次调用提供自己的 context。这防止并发调用方互相覆盖对方的 telemetry 父级或取消 signal。

代表一次进行中调用的进程本地对象可以保留其派生 context。例子是活动 drive 任务或事件订阅。这不同于在共享 harness 或 session 接收者上存储默认 context。

`AgentHarnessOptions.telemetryContext` 已被移除。Harness 级默认无法表示两个具有不同父级的并发调用方。

## 现有类型化 telemetry 仍是权威 {#existing-typed-telemetry-remains-authoritative}

该设计保留：

- `TelemetryContext` 和 `TelemetrySpan`；
- callback 拥有的 span 生命周期；
- `AI_TELEMETRY_SCHEMA` 和 `HARNESS_TELEMETRY_SCHEMA`；
- 类型化 span 名称、start attribute、completion attribute 和 event；
- `startAiSpan()`、`startHarnessSpan()` 和 `createTypedSpanStarter()`；
- adapter 一致性行为。

`startAiSpan()` 和 `startHarnessSpan()` 通过给其 callback 同时提供类型化 span 和派生调用 context 来打包 span 派生：

```ts
return startHarnessSpan(
	"pi.harness.run",
	attributes,
	async (span, runContext) => {
		return runDrive(runContext);
	},
	context,
);
```

这些 helper 委托给 `context.telemetryContext.startSpan()`，并用 `withTelemetryContext(span, context)` 把 callback 拥有的 span 安装到子 context 中。下层工作必须接收该子 context，而不是父调用 context。

不要改变 context 来安装活动 span。不要使用进程全局或接收者全局的当前 span。

## 并发父级 {#concurrent-parentage}

显式传播支持并发兄弟调用：

```ts
await parent.telemetryContext.startSpan({ name: "caller" }, async (callerSpan) => {
	const callerContext = withTelemetryContext(callerSpan, parent);
	await Promise.all([
		laneA.drive(optionsA, callerContext),
		laneB.drive(optionsB, callerContext),
	]);
});
```

每一次调用派生自己的子 context。嵌套工作接收属于该调用的子级。正确父级不依赖 promise 调度或环境状态。

测试必须有意交叉并发分支，以便接收者级 context 的意外存在可见。顺序 parent/child 测试是不够的。

## Callback、hook 与事件 {#callbacks-hooks-and-events}

作为 operation 一部分调用的 host 本地 callback 在其声明的尾部位置接收当前调用 context：

```ts
handler(event, context);
tool.execute(toolCallId, params, onUpdate, toolContext, invocation, context);
mutation(mutator, context);
```

当前传播通过 callback 保留 context，并给 `before_tool` 和 `after_tool` handler 一份从 `pi.harness.hook` 派生的子 context。把该 span 行为扩展到每一种 hook 类型仍是工作；没有安装 hook span 的 handler 当前直接接收 operation context。

在 harness 进程内，事件保留导致每个事件的 context，缓冲的事件 watcher 存储 `{ event, context }` 而不是只有 `event`。从该事件 context 启动 `pi.harness.event_handler` 并把其子 context 传给每个 listener 仍是工作。事件注册本身是 host 本地配置，没有 operation 父级。

Session mutation callback 和 commit 接收同一份显式调用 context。从提交调用启动 `pi.session.write` 并把它的子 context 传过存储 commit 仍是工作。

## Drive 执行与 joiner {#drive-execution-and-joiners}

若干调用方可能对同一持久化 operation 调用 `drive()`。仲裁决定哪个调用安装进程本地执行，哪些调用加入它。这是核心 runtime 关注点，不是 RPC 关注点；并发本地调用方有同样的问题。

一次活动执行有一个 telemetry 父级。当另一个调用方加入时，它不能被重新指定父级。

```text
installer caller
└─ drive.execute
   └─ provider/tool work

joiner caller
└─ drive.join
```

Joiner span 描述该调用方的等待。它至少携带 lane name、持久化 operation ID 和进程本地 execution ID。它以诸如 `settled`、`caller_cancelled`、`execution_stopped` 或 `harness_closed` 的结果结束。

Joiner 不得覆盖活动执行 context。用 operation/execution attribute 关联两个 span。Telemetry span link 会更好地建模这种关系，但当前 telemetry 契约没有 link。加入 link 是可选的 telemetry-package 设计问题，不是发明多个父级的理由。

分布式 trace 允许执行 span 活过 installer RPC span。一旦子级已启动，父 span 和子 span 可以重叠，或以任一顺序结算。

## 调用取消与持久化取消 {#invocation-cancellation-versus-durable-cancellation}

被中止的调用 signal 是进程本地控制。它并不意味着请求了持久化取消。

```text
context.abortSignal is present and aborts
→ stop only that caller's observation; an installed lane-owned Drive continues
→ do not write cancel_requested
→ preserve the same durable operation state
```

两个空根都暴露的未定义 `abortSignal` 表示该调用没有取消 signal。

只有 `requestAbort()`/`abort()` 写入持久化 `cancel_requested`，并允许持久化 aborted settlement。

Runtime 必须跟踪停止原因，而不是把每一个被中止的 provider response 解释为持久化取消：

```ts
type ExecutionStopCause =
	| "no_drive_waiters"
	| "invocation_cancelled"
	| "harness_closed"
	| "durable_cancel_requested";
```

只有 `durable_cancel_requested` 可以规范化并提交持久化 aborted 结果。当持久化控制仍为 `running` 时，调用/断开 abort 不得产生 assistant `stopReason: "aborted"` settlement；那条路径会违反持久化状态机。

Drive 所有权被解决为 **harness 拥有**：一旦安装，执行活过调用方取消/断开，直到持久化 settlement 或等待、显式持久化取消、close、fault 或进程丢失。Joiner signal 只控制它们自己的观察。不得用 `AbortSignal.any()` 把无关 joiner 的 signal 组合起来并直接附着到共享执行。一个被取消的 joiner 不能取消每一个其他调用方。

## RPC trace 传播 {#rpc-trace-propagation}

Client 和 server span 可以属于一条分布式 trace：

```text
caller
└─ rpc.client
   └─ rpc.server
      └─ harness/session operation
```

Client 不序列化 `TelemetryContext`。它从 `rpc.client` span 注入一份 backend 中立的 trace carrier。Server 把该 carrier 提取到一份新的本地 `TelemetryContext`，并从它启动 `rpc.server`。

需要一个面向传输的 adapter 边界：

```ts
interface TelemetryPropagation {
	inject(context: TelemetryContext): JsonValue | undefined;
	extract(carrier: JsonValue | undefined): TelemetryContext;
}
```

生产实现可以使用 W3C `traceparent`/`tracestate`。当前 telemetry package 没有 carrier 注入/提取 API，因此已接受的设计必须决定该 adapter 属于 telemetry package、RPC 基础设施还是 backend 集成 package。它仍必须复用现有 `TelemetryContext` span 契约。

RPC 取消和 telemetry 传播是独立的控制平面通道：

- trace metadata 重建 telemetry 父级；
- request ID 加上 cancel/disconnect 消息控制 server 请求 signal；
- 任一通道都不出现在序列化方法参数中。

## 接口迁移脚手架 {#interface-migration-scaffolding}

接收者方法现在使用必需的尾部 `Context`。具体实现、调用、callback adapter 和对象字面量 façade 已被迁移，而不是只依赖接口可赋值性。

`TODO_CONTEXT` 仍是临时迁移标记，不是语义根。当前用法聚集在尚不能重建调用方 context 的未解决 transport 和 worker 边界，尤其是 Pi 协议请求入口和 worker RPC 入口。`BACKGROUND_CONTEXT` 表示有意在没有调用方的情况下开始。

继续单独清点 `TODO_CONTEXT`。只有当边界能够构造请求本地取消 context 和 telemetry 父级时，才替换每一个 transport 边界用法；换成 `BACKGROUND_CONTEXT` 会掩盖未完成的传播。编译仍不能证明 telemetry 或取消正确性。

## 后续交接所需测试 {#required-tests-for-the-later-handoff}

当前测试覆盖不可变类型化值分层与遮蔽、不同的空根、父/子 abort 组合、兄弟取消隔离，以及 tool-hook 子父级。剩余交接覆盖包括：

- 在一个共享接收者上交叉的并发 telemetry 分支；
- 每一种 hook 类型、tool、事件 handler 和 session 写入接收预期的子 context；
- 缓冲事件在延迟投递下保留其发出 context；
- 没有接收者级 telemetry 默认；
- 预先已中止的调用不启动外部 effect；
- 在 lane 拥有执行下的 installer 与 joiner 取消隔离；
- 调用 abort 使已安装 Drive 和持久化状态保持不变；
- 持久化 abort 提交持久化 aborted 结果；
- close 和断开不伪装成持久化取消；
- client → server trace 重建；
- 事件投递重建源 trace metadata；
- 缺失/畸形 trace carrier 降级为 no-op/root telemetry，而不影响业务行为。

## 已解决的迁移决策 {#resolved-migration-decisions}

- 接收者方法使用一个必需的尾部 `Context`。
- 共享 Harness、AgentLane、Session 和 Branch 接收者不保留默认调用 context。
- `Context`、`AbortSignal` 和 `TelemetryContext` 对象从不跨越 RPC 边界序列化。

## Telemetry 交接之前的开放决策 {#open-decisions-before-the-telemetry-handoff}

- joiner 是否需要 telemetry link；
- trace-carrier adapter 的所有权与形状；
- 哪些 context 值（若有）可以跨越 RPC 边界；
- RPC 调用和 drive join 等待的精确 span 名称/结果 attribute。
