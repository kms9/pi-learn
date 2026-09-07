本文是 `plugins.md` 的中文阅读版；命令、路径、API 名称保持英文。

# Coding-Agent 应用 Host 与 Facet {#coding-agent-application-hosts-and-facets}

应用中立的 facet、service 与复制状态运行时由
`@earendil-works/chord` 提供。本文规定 Pi 如何把该运行时与 Pi 拥有的
service 契约、进程角色、路由以及生命周期策略组合在一起。

> **状态：** 实验性 facet 与 service 架构的设计规范。

本文假定你已经理解 `AgentHarness`、`AgentLane`、`Session`、`Branch`、`SessionRepo` 以及 invocation `Context`。Service 传输语义见 `rpc.md`，telemetry 模型见 `telemetry.md`。

## 鸟瞰 {#birds-eye-view}

Coding agent 在若干进程中独立组装。三层：

1. **Facet kernel** 拥有感知 service 的生命周期机制：同步 setup、依赖组装、本地与已连接 service 绑定、激活、作用域资源所有权、setup 失败清理、reload，以及逆序处置。它知道 service 与远程 service 源，但不知道 Harness、tools、TUI 组件或 coding-agent 策略。
2. **Application host** 拥有一个具体运行时，并贡献提供其具体 service 的运行时 facet。**Session host** 通常运行在专用 session worker 中，并拥有 session 权威——真正的 Harness。**Presentation host**（今天是 TUI，以后是 web）拥有用户界面。**Server host** 拥有服务器范围的权威：session 记录（`SessionRepo`）、session-worker 管理、认证、attachment，以及 presentation 与 session worker 之间的路由。
3. **Extension** 可以分发包含 **facet** 的、彼此独立的 host 特定 bundle。没有聚合 extension 对象被加载进所有进程。每个 host 只加载为该进程构建的 facet，并且那些 facet 只能使用该 host 图中可用的 service。

初始拓扑有一台 server，没有 server 到 server 的链接：

```text
server
├─ TUI A
├─ web B
├─ session worker S0
└─ session worker S1
```

Presentation 与 session worker 各自连接到 server。没有直接的 presentation→session-worker 连接；server 把 service 调用路由到所选 worker。Server 只列出并管理自己的 session。多 server 路由与 server 层级不在范围内。

一个 session worker 通常拥有一个 session，并且每个 session facet 都为该 session 实例化。一个 server facet 在每个 server 进程中实例化一次，并在连接到它的每个 session 与 presentation 之间共享。因此 server facet 应当稀少，并限于固有的服务器范围关注点。按 session 的功能状态属于 session facet；专用 worker 提供首选的生命周期、崩溃与状态隔离。未来的共置可以在不改变 facet 能访问哪些对象的情况下保留同一逻辑 service 图。

**Host** 与 **client** 是每个连接上的角色，不是固定的进程种类。Server 托管 presentation 与 session-worker 连接。Session worker 提供其提供的 session service，并可以通过同一 RPC 绑定机制消费 server 提供的 service。下文的 “Client” 始终命名连接角色，从不命名一种 extension。

## 为什么是这个形状 {#why-this-shape}

- **权威留在该在的地方。** Provider 凭据、tool 执行以及按 session 的 extension 数据只存在于 session worker；session 记录与 worker 控制只存在于 server。除了经过刻意契约，没有任何东西到达 presentation。
- **一个功能保持连贯。** Question extension 的 tool、dialog 与 renderer 围绕一个 JSON 契约打在一个包里，但每个 facet 都是 host 原生代码。
- **新表面只是 presentation 工作。** Question dialog 或 session picker 的 web facet 对着现有 token 注册；session 与 server 代码不变。
- **Server 状态保持服务器范围。** Server facet 由所有 session 与 client 共享，因此功能仅在其权威对该 server 固有地全局时才使用一个。
- **一套 facet 机制。** 内置项、运行时能力与 extension 在每个 host 中使用相同的 facet 环境。
- **可以分块测试。** Facet 对着提供 service 的 fixture 测试，契约对着 loopback 测试，路由的 TUI → server → session-worker 路径对着真实传输测试——彼此独立。

## 一个功能，若干独立加载的 facet {#one-feature-several-independently-loaded-facets}

刻意没有 `CodingAgentPlugin` 运行时接口。Server、Session worker、TUI 以及未来的 web host 在不同进程中执行不同 bundle，因此它们不能共享一个包含所有 host facet 的已加载对象。

进程内单元是一个 facet：

```ts
interface Facet {
	readonly id: string;
	setup(env: FacetEnvironment): void;
}
```

每个进程加载适合该进程的有序 `Facet[]`。Setup 是同步声明；异步初始化属于 `onActivate()`。一个功能可以由共享契约 bundle 加上零个或多个分别解析的 server、Session、TUI 或 web bundle 组成。把它们连起来的是共享 service ID 与线契约，而不是聚合 JavaScript 对象或 `definePlugin()` 包装器。

包把共享线契约与 host 依赖分开：

```text
question-extension/
  contract.ts       JSON DTOs and service tokens
  session.ts        dialog-service authority and tool contribution; imports agent/session code
  tui.ts            terminal dialog and renderer; imports TUI code
  web.ts            optional browser dialog and renderer
  package exports   unresolved mapping from host kind to independently loadable bundles
```

浏览器构建从不 import `session.ts`；session 进程从不 import TUI 或 DOM 代码。

Question extension 是本文的端到端示例：

```text
model calls the question tool                                  (session facet)
→ session facet adds one invocation-keyed dialog service        (session authority)
→ every connected TUI/web facet observes the service instance   (keyed service)
→ the first accepted answer settles it for everyone
→ session facet returns the durable tool result
→ closing the instance closes every presentation's dialog
```

没有 presentation 连接时，question 保持 pending。稍后连接的 TUI 或 web facet 获得同一个 pending question。

后续各节中的 models service 说明 service 与复制状态；[server 一节](#the-server-directory-management-and-routing) 覆盖服务器范围 service 与 session 路由；[question 一节](#session-owned-deferred-interactions-the-question-extension) 把完整往返做具体。

## 加载并连接 host {#loading-and-connecting-hosts}

Loader 抽象有意小于 extension manifest：

```ts
interface LoadedFacets {
	readonly facets: readonly Facet[];
	dispose(): Promise<void>;
}

interface FacetLoader {
	load(): Promise<LoadedFacets>;
}
```

每个 host 收到一个或多个静态、组合或由 extension 支持的 loader。Loader 拥有一个已加载模块世代的资源；facet host 拥有活动 facet 环境。初始启动加载 facet、组装 service 图、激活它，并且仅在 host 退役之后才处置已加载世代。

Extension resolver 可以添加身份、排序、版本选择、包隔离以及进程特定源解析。其输出仍是每个进程独立的 `FacetLoader` 输入，而不是一个跨进程 extension 对象。

传输 setup 之后，host 把已加载 facet、提供具体本地 service 的运行时 facet，以及任何 host 选择的远程 service 源交给 kernel。Kernel 按 loader 顺序运行每个 `setup()`，校验完整 service 图，绑定依赖，然后先激活 provider 再激活 consumer。Setup 失败与正常关闭按反向依赖顺序处置资源。

同一时刻恰好一个进程拥有 Session 的权威。Worker 替换必须在新进程打开同一持久 Session 之前关闭旧所有者。每个 presentation 与 Session worker 对其 server 使用一条多路复用连接；facet 从不打开私有 socket，也不处理请求 ID、取消帧、路由命名空间或重连缓冲。

范围外：任意未声明对象远程化、序列化函数/类/`Map`/`Set`、远程 hook 或 tool 执行、离线 presentation 写入或自动 mutation replay、通用远程 `AgentHarness`，以及序列化 UI 树。

## Service 连接 host facet {#services-connect-host-facets}

Facet 通过 **service** 跨进程通信。一种 token 类型给 service 契约其身份：

```ts
function defineService<T>(id: string, options?: { local?: boolean }): Service<T>;
```

声明住在共享契约模块中，并且不创建任何东西。Service 默认可远程发布；进程本地 token 声明 `{ local: true }`。`provide(service, implementation)` 向 host service 图添加一个 singleton。`provideMany(service)` 在 facet setup 期间注册多实例 service 的所有权，并返回一个 `ServiceSpawner`，其稍后的 `spawn(key, implementation)` 调用发布实例。Host 把它的每个非本地 provision 发布过进程边界。Consumer 用 `use(service)` 或 `observe(service, handler)` 选择相同模式。在一个 facet 世代内，token 必须保持一种模式：把 `provide`/`use` 与 `provideMany`/`observe` 混用是组装或协议错误。

```ts
interface ServiceSpawner<T> {
	spawn(key: string, implementation: T): () => void;
}
```

TypeScript 类型不能产生运行时成员元数据。尽管如此，facet 作者不声明并行成员描述符。当暴露的 `provide()` 实现或 `ServiceSpawner.spawn()` 实例到达远程 service 边界时，运行时把函数分类为远程方法，并识别 Chord 创建的 `ReplicatedState` 值。它拒绝不支持的成员，并通过传输宣布得到的成员表。进程本地 service 可以使用任意对象契约。

Singleton 上的 `use()` 同步返回稳定的惰性代理，即使远程 provider 尚未附加。成员访问在使用时创建本地方法或状态槽；附加对照 provider 宣布的 kind 校验那些槽。不匹配是组装或协议错误。该运行时机制由 host 实现一次，而不是在每个 service 声明中重复。

### 依赖声明与组装 {#dependency-declaration-and-assembly}

Facet setup 期间发出的 service API 调用就是依赖声明。Kernel 不反射被擦除的 TypeScript 接口，facet 作者也不维护并行的 `requires` 与 `provides` 列表。`Service<T>` 在运行时保留其稳定 ID，API 调用提供模式。`use()` 与 `observe()` 最初返回与源无关的断开 handle。所有 setup 完成后，host 把未解析需求对照 provider 生成的连接目录匹配，并把每个 token 绑定到其本地 provision 或恰好一个连接。

Host 记录私有的世代作用域账本：

```text
env.provide(Models, implementation)
→ @pi/providers-builtin:session provides pi.models/singleton

env.use(Models)
→ @pi/model-selection:tui requires pi.models/singleton

env.provideMany(QuestionDialogs)
→ @pi/question:session provides pi.question-dialog/keyed

env.observe(QuestionDialogs, handler)
→ @pi/question:tui requires pi.question-dialog/keyed
```

一个 token 的第一次 `provide()`、`provideMany()`、`use()` 或 `observe()` 必须发生在 facet setup 期间。Commands、hooks、事件处理器与激活回调使用 setup 期间获得的 handle；它们不能稍后引入未声明的 service 依赖。动态实例使用 setup 拥有的 `ServiceSpawner`，因此 spawn 与关闭实例不改变图。

每个 facet 都注册之后，host 从其非本地 provision 生成出向目录，从其远程 service 源获得目录，把需求解析到本地或已连接 provision，拒绝缺失 provider、重复 offer 或 singleton 所有者、singleton/keyed 不匹配、非法依赖环以及非法远程 service 实现，然后记录 consumer 到 provider 边以供生命周期排序。`use()` 与 `observe()` 声明硬需求；可选依赖需要未来不同的获取 API，而不是从调用失败推断。账本与得到的图是私有 kernel 机制，不是面向 facet 的计划或第二种声明格式。

只有通过 `env.use()` 或 `env.observe()` 获得的依赖属于这个生命周期图。Import 另一个 extension 的实时实现会绕过所有权，并且不受支持。模块 loader 单独拥有普通源 import 图。因此 reload 既需要已加载源所有权，也需要生成的 service 图；见 [Reloading facets](#reloading-facets)。

Models service——model picker 与 thinking-level 控制背后的权威——演练方法、复制状态与多个 consumer。

### 共享契约 {#shared-contract}

```ts
export interface ModelRef {
	provider: string;
	modelId: string;
}

export interface ModelsState {
	catalog: { revision: number; availableModels: Array<ModelRef & { name: string; reasoning: boolean }> };
	configuration: { model: ModelRef | null; thinkingLevel: "off" | "low" | "high" };
	refresh:
		| { status: "idle" | "refreshing" | "done" }
		| { status: "warning"; errors: Record<string, string> };
}

export interface Models {
	readonly state: ReplicatedState<ModelsState>;
	cycleThinking(context: Context): Promise<void>;
	refresh(context: Context): Promise<void>;
	select(model: ModelRef, context: Context): Promise<void>;
}

export const Models = defineService<Models>("pi.models");
```

远程契约中传输的一切都是严格 JSON：参数、结果与复制状态。业务层缺失使用 JSON `null`，从不使用 `undefined`。未 hydrate 的 `ReplicatedState.value === undefined` 是本地控制面就绪，不是被传输的状态值。`Context` 是声明位置中的控制面数据；代理剥掉它，它从不被序列化。

### Session facet {#session-facet}

下面的片段使用 facet 形状，但压缩应用细节。

```ts
export const providersBuiltinSessionFacet = defineFacet({
	id: "@pi/providers-builtin",

	setup(env) {
		const providers = new ProviderRegistry(); // 进程本地，非 JSON
		const state = env.replicatedState<ModelsState>(initialModelsState());

		env.provide(Models, {
			state,

			async cycleThinking(context) {
				const { catalog, configuration } = state.value;
				if (configuration.model === null) return;
				const spec = findSpec(catalog, configuration.model);
				if (spec === undefined || !spec.reasoning) return;
				state.set(
					{
						...state.value,
						configuration: {
							...configuration,
							thinkingLevel: nextThinkingLevel(configuration.thinkingLevel),
						},
					},
					context,
				);
			},

			async select(model, context) {
				const spec = findSpec(state.value.catalog, model);
				if (spec === undefined) throw new Error(`Unknown model: ${model.provider}/${model.modelId}`);
				const thinkingLevel = spec.reasoning ? state.value.configuration.thinkingLevel : "off";
				state.set({ ...state.value, configuration: { model, thinkingLevel } }, context);
			},

			async refresh(context) {
				state.set({ ...state.value, refresh: { status: "refreshing" } }, context);
				const errors = await providers.refresh(context.abortSignal);
				state.set({ ...state.value, catalog: providers.snapshot(), refresh: toRefreshStatus(errors) }, context);
			},
		});

		env.onActivate(() => providers.rebuild());
	},
});
```

### TUI facet {#tui-facet}

这展示通用 command-service 模式。

```ts
export const modelSelectionTuiFacet = defineFacet({
	id: "@pi/model-selection",

	setup(env) {
		const models = env.use(Models);
		const tui = env.use(Tui);

		tui.commands.register("models.select", async (context) => {
			const current = models.state.value;
			if (current === undefined) return;
			const selected = await tui.select(
				"Models",
				current.catalog.availableModels.map((model) => ({
					label: model.name,
					value: { provider: model.provider, modelId: model.modelId },
				})),
				{ signal: context.abortSignal },
			);
			if (selected !== undefined) await models.select(selected, context);
		});
		tui.commands.register("models.cycle-thinking", (context) => models.cycleThinking(context));
		env.own(models.state.subscribe((next) => renderModelSelector(next)));
	},
});
```

TUI facet 没有凭据、registry 或 refresh 逻辑：它用契约的方法签名调用类型化惰性代理，并在 hydration 之后渲染复制状态。Web facet 会通过其 web facet 环境做同样的事。

### Service 语义 {#service-semantics}

一个 service 有**一个所有者与许多消费者**。在 singleton 模式中，`providersBuiltinSessionFacet` 提供 `Models`，两个 model-selection 命令消费它。在多实例模式中，一个所有者可以 spawn 实例 `A` 与 `B`，每个 observer 都看到相同的两个实例。

`use()` 按本地性表现不同：

- **Local：** `use()` 返回由直接进程本地实现槽支持的稳定惰性代理。在同步 setup 期间它是断开的；组装之后它绑定到本地实现，而不要求 provider 先于 consumer 的 setup 顺序。Reload 解绑并重新绑定同一槽。
- **Remote：** 跨连接时，`use()` 返回同一种稳定惰性代理。断开时发出的调用在被调用时失败；状态在 hydrate 之前没有值。同一进程中同一 token 的并发消费者共享一个代理、一个状态副本与一个远程订阅。

多实例 service 使用 `provideMany()` 与 `observe()`。在其 setup 拥有的 `ServiceSpawner` 调用 `spawn()` 之前，service 是空的；观察它从不创建实例。`spawner.spawn(key, implementation)` 返回幂等 close 函数，并且 key 必须在该 service 的活动实例中唯一。本地 observer 使用直接进程本地实例 registry；非本地 provision 额外通过 RPC 发布同一实例。`observe(service, handler)` 对账当前实例，然后是有序的添加、替换与移除。Handler 收到与 `use()` 相同的 `T` 代理形状；实例 key 仍是 provider 侧寻址细节。实例的初始状态成员 hydrate 之后，host 用全新 `Context` 启动一个 handler 任务。Facet 生命周期拥有该观察。关闭实例会 abort 其任务 context、拒绝新调用，并让已经接纳的调用返回。来自实例 context 的取消是正常任务清理；其它 handler 失败遵循 host 失败策略。重用已关闭 key 会创建新的 host 拥有世代，因此陈旧代理不能寻址替换。

添加的实例成员具有结构身份 `(service, key, generation, member)`。因此其 `ReplicatedState` 成员不需要独立 ID。实例目录是控制面元数据，不是包含代理的、facet 可见的 `ReplicatedState`。切换 session 会在 hydrate 所选 session 的当前实例之前 abort 所有被观察的实例任务。

每个 facet 使用相同的无限定 `env.use()` 与 `env.observe()` 操作。Presentation host 把它的本地 service 与已连接 server 以及所选 Session 的 service 组合，然后在内部路由每个 token。Provider facet 从同一 host 图解析 service。传输绑定与路由仍是 host 基础设施，而不是 facet API。

## 每种 facet 授予什么 {#what-each-facet-kind-grants}

这是设计中最重要的边界。

**Session facet 跑在真东西旁边。** 它们在拥有具体 `AgentHarness`、`AgentLane`、`Session` 与 Branches 的进程中执行，并收到由那些实例支持的直接、进程本地、作用域能力——不是 RPC 代理。调用保留真实方法签名、`Context` 传播、`Result` 类型以及对象身份。Session facet 从不 RPC 回自己的进程。

```ts
interface ScopedSessionData {
	readonly metadata: SessionMetadata;
	getValue<T>(address: Value<T>, context: Context): Promise<StoredValue<T> | undefined>;
	setValue<T>(address: Value<T>, value: T, context: Context): Promise<void>;
}

interface AgentFacetScope {
	readonly identity: SessionIdentity;
	readonly session: ScopedSessionData;
	readonly hooks: ScopedHooks;
	lane(name: string, context: Context): Promise<AgentLaneFacetView>;
}

const Agent = defineService<AgentFacetScope>("pi.local.agent", { local: true });
const Providers = defineService<ProviderContributionRegistry>("pi.local.providers", { local: true });
const Tools = defineService<ToolContributionRegistry>("pi.local.tools", { local: true });
```

“Local” 与 “unrestricted” 是分开的决定。Scope 为生命周期与组合收窄权威——通过它注册的 hook 与事件订阅由 facet 自动拥有，并随它处置。`AgentLaneFacetView` 把 Branch 方法直接与 agent 操作并排暴露。`ScopedSessionData` 暴露用途有界的持久操作。Host 保留不受限的具体实例，并保留：`AgentHarness.close()` 与 `Session.close()`；原始 `Session.mutate()`、`beginMutation()` 与 `SessionMutator`（除非一个被窄信任的持久化扩展显式拥有它们）；`idGenerator` 与 backend/storage 对象；Branch 创建；`setTools()` 这类整 registry setter；无作用域 hook/事件注册；传输暴露与远程引用注册。这是组合与生命周期边界，不是安全沙箱：session facet 是权威进程中的受信任代码。未来的 extension 策略可以显式授予更宽的本地能力，但内置项不应收到隐式绕过。

**Presentation facet 不持有这些。** TUI 或 web facet 从不收到原始 Harness、Session、tree、tool registry、hooks 或凭据。它使用 host 本地 presentation service，加上 Session 或 server facet 刻意暴露的语义 service 与复制状态。

```ts
interface FacetEnvironment extends FacetLifecycle {
	use<T>(service: Service<T>): T;
	observe<T>(
		service: Service<T>,
		handler: (service: T, context: Context) => void | Promise<void>,
	): void;
	provide<T>(service: Service<T>, implementation: T): void;
	provideMany<T>(service: Service<T>): ServiceSpawner<T>;
	replicatedState<T>(initial: T): MutableReplicatedState<T>;
}

type AttachmentState = { status: "detached" } | { status: "attaching" | "attached" | "degraded"; sessionId: string };

interface SelectItem<T> {
	label: string;
	description?: string;
	value: T;
}

interface TuiModal {
	select<T>(title: string, items: SelectItem<T>[]): Promise<T | undefined>;
	input(title: string): Promise<string | undefined>;
	close(): void;
}

interface TuiHost {
	readonly attachment: ReplicatedState<AttachmentState>;
	readonly commands: CommandContributions;
	readonly toolRenderers: ToolRendererContributions;
	acquireModal(signal: AbortSignal): Promise<TuiModal>;
	select<T>(title: string, items: SelectItem<T>[], options: { signal: AbortSignal }): Promise<T | undefined>;
}

const Tui = defineService<TuiHost>("pi.local.tui", { local: true });
```

第一个实现的 presentation hookpoint 比这个最终 `TuiHost` 更窄：一个进程本地 `SlashCommands` registry。内置 presentation facet 与 plugin presentation facet 获取同一 registry，并在激活期间添加命令元数据与回调。返回的 cleanup 移除该贡献，因此 facet reload 与 unload 更新自动补全与分发，而不重建 TUI。命令回调收到窄的选择、状态与 prompt 提交操作，而不是原始 renderer 或 editor。

每个 plugin host facet 是独立的 loader 入口。示例 `/hello` presentation facet 有一个默认 facet export；未来的包构建把该 facet 发成一个预打包文件。同一 plugin 的 Session、server、web 以及其它 presentation facet 是由共享 service ID 连接的分开 bundle 入口，而不是一个聚合运行时 plugin 对象。

`acquireModal()` 在一个 presentation 拥有的队列中等待，并在多步交互中持有 modal 槽。其 signal 移除排队请求或解散活动请求，并且 `close()` 是幂等的。`select()` 是一步 acquire/select/close 便利。两者直接返回所选值，因此功能代码从不从显示标签恢复身份。

TUI 把它的全部 facet 加载进一个世代。其 host 把 `env.use(SessionDirectory)` 路由到已连接 server，把 `env.use(Models)` 路由到所选 Session。分离时，Session 调用以 `session_not_attached` 失败，复制状态没有值。连接与 attachment 健康是 host 本地 service，因为它们描述 presentation 控制状态。未来的 web host 类似地为路由、视图与 DOM dialog 绑定本地 service。其 server 与 Session facet 仍使用无限定 service 操作。

`AgentController` 是覆盖 worker 拥有的主 `AgentLane` 的 presentation 安全命令门面。它把 prompt、queue、abort、resume、compaction 与 navigation 操作暴露为 JSON 安全结果。Session 运行时直接从 lane 构造它；它不把原始 Harness 或 lane 发布为本地 facet service。

运行时形式是：

```ts
export function createAgentControllerRuntimeFacet(lane: AgentLane) {
	return defineFacet({
		id: "@pi/agent-controller-runtime",
		setup(env) {
			env.provide(AgentController, createAgentController(lane));
		},
	});
}
```

其 TUI facet 通过 `env.use()` 消费 `AgentController`，方式与 model picker 消费 `Models` 完全相同。它不揭示 controller 背后的 Harness 对象；没有给任意 plugin 的通用远程 Harness。`rpc.md` 仍可以为其它受信任集成（IDE 桥、编排器）定义通用 Harness 代理——刻意、分开的暴露，不是 plugin 边界。

## 本地 service 与窄远程门面 {#local-services-and-narrow-remote-facades}

不是每个依赖都应当可远程到达。**Local service** 是用 `{ local: true }` 声明、并限制在其提供进程中的 token。它可以使用同步方法，并持有函数、类、原生对象、凭据、文件系统 handle 或其它非 JSON 值。远程 `use()` 不能解析它，本地 service 也从不可远程发现。本地与非本地 provision 共享依赖排序、稳定 handle、keyed 世代、激活、处置以及 provider-facet reload；非本地 service 只额外添加校验、复制与 RPC 发布。敏感状态的模式是本地完整 service 加上窄远程门面：

```ts
const Credentials = defineService<CredentialStore>("credentials", { local: true }); // get/set provider secrets

interface Accounts {
	readonly state: ReplicatedState<{ providers: Array<{ provider: string; configured: boolean }> }>;
	remove(provider: string, context: Context): Promise<void>;
}
const Accounts = defineService<Accounts>("pi.accounts");
```

Auth extension 的 Session facet 直接使用 `Credentials`；presentation 看到 provider ID 与 `configured` 布尔——从不看到秘密。如果某些设置不得远程可写，用同样方式拆分；不要依赖 presentation 侧约定。

## 复制状态：`ReplicatedState` {#replicated-state-replicatedstate}

`Models.state` 是 `ReplicatedState<ModelsState>`：**权威最新值复制**——不是事件历史、持久存储、CRDT 或多写机制。

```ts
interface ReplicatedState<T> {
	/** 借用的不可变值，或直到 hydration 之前为 `undefined`。不要 mutation 或保留它。 */
	readonly value: T | undefined;
	/** Listener 值是借用的，不得被 mutation 或保留。 */
	subscribe(listener: (value: T, context: Context) => void): () => void;
}

interface MutableReplicatedState<T> extends ReplicatedState<T> {
	/** 提供侧状态始终已初始化。 */
	readonly value: T;
	/** 把 JSON 值转移给状态；调用者随后不得 mutation 它。 */
	set(value: T, context: Context): void;
}
```

所需行为：

1. 提供 host 拥有一个已初始化的权威值；远程消费者调用方法，而不是写入副本。
2. 冷远程副本没有值。其 `.value` 是 `undefined`，并且 `subscribe()` 注册 listener 而不调用它。这个 `undefined` 是本地就绪状态，从不跨线。
3. **Hydration** 在更新流动之前原子安装完整快照。Hydration 之前订阅合法，并且与快照并发发出的更新被缓冲，因此 listener 观察到快照然后更新，没有缺口。
4. 一旦 hydrate，`.value` 可同步读取，并且 `subscribe()` 立即报告当前值，然后是未来更新。快照 hydration 使用以订阅为父的全新投递 context；后续更新从源 trace 元数据重建全新投递 context。
5. 状态值是借用的不可变 JSON。状态运行时不对读取、写入、快照或 listener 投递做防御性克隆。调用者把所有权转移给 `set()`，并且不得 mutation 或保留 `.value` 返回的值或传给 listener 的值；需要所有权时显式复制。进程与传输序列化可能自然产生分离值，但调用者不得依赖对象身份或分离。
6. 断开、provider 撤回与路由切换清除就绪，因此 `.value` 变为 `undefined`。重连或 singleton 替换在现有成员门面中安装完整全新快照，然后再流动后续更新。想要陈旧显示数据的 presentation 必须把它与连接或 attachment 健康分开保留。
7. `set(value, context)` 把它的 context 传给本地源 listener，并发布源 trace 元数据。远程投递重建全新本地 `Context`；它从不保留源 context 对象。

消费者在重连之后必须恢复的任何东西都作为复制状态暴露，或通过远程方法拉取。复制状态是最新值复制，本身不是持久 session 存储；提供 facet 必须在 worker 重启之后重建其权威值。

宁可要若干粗粒度独立 cell，也不要一个巨型值或通用 patch 语言，这样 catalogue refresh 就不会重传无关配置。Transcript 流式传输这类高频数据需要未来的快照加增量设计，而不是超载 `ReplicatedState`。修订元数据、缺口恢复、未变值抑制以及按需订阅属于该未来协议，不属于单个 facet 作者。

## 贡献 registry：许多贡献者，一个结果 {#contribution-registries-many-contributors-one-result}

Service 适合一个所有者、许多消费者。Provider 与 tool 把它反过来：**许多 extension 贡献到一个 host 拥有的结果**。可变全局 registry 会使组合依赖顺序，并且无法移除。贡献 registry 改为在全新 draft 上按序 replay 贡献：

```text
fresh ProviderDraft
→ built-in provider contribution        (@pi/providers-builtin)
→ remote catalogue contribution         (@pi/providers-catalog)
→ models.json transformation            (@pi/providers-models-json)
→ authentication/availability marking   (@pi/auth)
→ validated ProviderState
```

移除 extension 会移除其贡献并重建；没有任何东西运行逆 mutation。Tool 遵循同一模型，包括 wrapping：

```ts
sessionContext.tools.add((draft) => {
	draft.set("review_add", reviewAddTool);
	draft.wrap("bash", (next) => async (invocation) => {
		await authorize(invocation);
		return next(invocation);
	});
});
```

有序 wrapper 确定地组合——`telemetry(permission(sandbox(coreBash)))`——并且如果 permission extension 消失，重建得到 `telemetry(sandbox(coreBash))`。只有 host 最终化 draft 并把完整 registry 应用到 Harness；facet 从不调用 `setTools()`。贡献配置重建后的行为；hook 拦截实时操作——分开的机制。

## 给 facet 作者的 Context、取消与 telemetry {#context-cancellation-and-telemetry-for-facet-authors}

每个远程方法在其声明位置收到全新本地 `Context`。代理从 JSON 参数剥掉调用者的 context，并把 `context.abortSignal` 映射为对该一次请求的取消。接收端点构造请求本地 abort signal；它从不反序列化发送者的 `Context` 或任意类型化值。共享 service 对象不得保留调用者的 context。

Model refresh 展示完整的作者可见表面：

```ts
const controller = new AbortController();
await uiTelemetry.startSpan({ name: "ui.models.refresh" }, async (span) => {
	const context = withAbortSignal(controller.signal, withTelemetryContext(span, BACKGROUND_CONTEXT));
	await models.refresh(context);
});
```

RPC telemetry 与应用 span 组合为：

```text
ui.models.refresh
└─ rpc.client models.refresh
   └─ rpc.server models.refresh
      └─ plugin.models.refresh
```

`controller.abort()` 只取消那一次请求：server 重建的 `context.abortSignal` abort，并且不影响其它调用者。

三个取消域绝不能模糊：

1. **Invocation 取消** abort 一次远程调用或等待——上面的 `controller.abort()`。
2. **Service 拥有的取消** 是显式方法，例如 `job.cancel()`，它停止 service 拥有的任务。
3. **持久 Harness 取消**——`requestAbort()`/`abort()`——写入持久 `cancel_requested` 并驱动持久结算。

传输断开只对活动请求执行第一种，并关闭该 client 的订阅。它不得静默取消 service 拥有的工作，也不得写入持久取消。意图活过其发起请求的工作必须刻意分离进带有自己 controller 与 telemetry 根的 service 拥有任务。

## Service 拥有的 job {#service-owned-jobs}

私有返回引用在初始 service 契约之外。对可发现的实时实例优先使用 `provideMany()`。仅在具体功能确立其所有权与收集需求之后，才添加调用者私有引用。

一种可能的长时 job 契约是：

```ts
interface IndexJob {
	readonly progress: ReplicatedState<IndexProgress>;
	wait(context: Context): Promise<IndexProgress>; // aborting this context cancels only this wait
	cancel(context: Context): Promise<void>;        // cancels the job itself, for everyone
}
```

返回 `IndexJob` 的 `IndexService.start(root, context)` 校验 root，创建自己的 `AbortController` 与分离的 telemetry 根，并返回该 job。该 job 作为只对该调用者已知的私有 **远程对象引用**（`rpc.md`）跨线。如果每个已附加 presentation 都必须发现一个 job，则在 setup 期间用 `provideMany()` 注册多实例 service 并改为 spawn 一个实例。发现是区别：返回引用被显式传递；spawn 的实例出现在 `observe()` hydration 中。两者都使取消域具体化，并且两者都需要显式生命周期清理。

## Server：目录、管理与路由 {#the-server-directory-management-and-routing}

Server host 做两件事。它**拥有服务器范围 service**——列出、创建、删除并附加到 session——并且它在已附加 presentation 与它所管理的 session worker 之间**路由 session 流量**。路由是 facet 代码不实现的 host 基础设施。

Server facet 由连接到该 server 的每个 session 与 presentation 共享。它应当只用于固有的服务器范围功能。按 session 的功能数据属于 session facet。

### Server host service {#server-host-services}

```ts
interface FleetFacetScope {
	readonly managed: ManagedSessionsView;  // sessions managed by this server
	readonly attachments: AttachmentsView;  // bind/unbind a client's selected session
}

const Fleet = defineService<FleetFacetScope>("pi.local.fleet", { local: true });
```

原始 `SessionRepo`、存储 handle、不受限的进程杀死权威、路由图以及路由机制留在 server 应用：

```ts
interface ManagedSessionRecord {
	sessionId: string;
	title: string;
	workspaceId: string;
	ownerId: string;
	cwd: string; // ownerId and cwd never leave the server
}

type ManagedSessionChange = { type: "created" | "changed" | "deleted"; record: ManagedSessionRecord };

interface ManagedSessionsView {
	snapshot(): ManagedSessionRecord[];
	onChanged(listener: (change: ManagedSessionChange, context: Context) => void): () => void;
	create(options: { title: string; workspaceId: string }, context: Context): Promise<ManagedSessionRecord>;
	remove(sessionId: string, context: Context): Promise<void>;
}
```

### 共享契约 {#shared-contract-1}

目录是读；管理 mutation 并选择。两者都是 presentation 安全的：`ownerId` 与 `cwd` 从摘要中剥掉。

```ts
export interface SessionRecordSummary {
	sessionId: string;
	title: string;
}

export interface SessionDirectory {
	readonly state: ReplicatedState<{ revision: number; sessions: SessionRecordSummary[] }>;
}

export const SessionDirectory = defineService<SessionDirectory>("pi.session-directory");

export interface SessionManagement {
	create(options: { title: string }, context: Context): Promise<SessionRecordSummary>;
	remove(sessionId: string, context: Context): Promise<void>;
	attach(sessionId: string, context: Context): Promise<void>;
	detach(context: Context): Promise<void>;
}

export const SessionManagement = defineService<SessionManagement>("pi.session-management");
```

### Server facet {#server-facet}

```ts
// server.ts
export const sessionDirectoryServerFacet = defineFacet({
	id: "@pi/session-directory",
	setup(env) {
		const { managed, attachments } = env.use(Fleet);
		const state = env.replicatedState({ revision: 0, sessions: [] as SessionRecordSummary[] });

		function publish(_change: ManagedSessionChange, context: Context) {
			state.set({ revision: state.value.revision + 1, sessions: managed.snapshot().map(toSummary) }, context);
		}

		env.own(managed.onChanged(publish));
		env.onActivate(() =>
			state.set({ revision: 1, sessions: managed.snapshot().map(toSummary) }, BACKGROUND_CONTEXT),
		);

		env.provide(SessionDirectory, { state });
		env.provide(SessionManagement, {
			async create(options, context) {
				const client = requireClientIdentity(context);
				return toSummary(
					await managed.create({ title: options.title, workspaceId: client.workspaceId }, context),
				);
			},
			async remove(sessionId, context) {
				authorizeTarget(requireClientIdentity(context), managed.snapshot(), sessionId);
				await managed.remove(sessionId, context);
			},
			async attach(sessionId, context) {
				const client = requireClientIdentity(context);
				authorizeTarget(client, managed.snapshot(), sessionId);
				await attachments.bind(client.clientId, sessionId, context);
			},
			async detach(context) {
				await attachments.unbind(requireClientIdentity(context).clientId, context);
			},
		});
	},
});

function authorizeTarget(client: ClientIdentity, records: ManagedSessionRecord[], sessionId: string) {
	const record = records.find((candidate) => candidate.sessionId === sessionId);
	if (record === undefined || record.workspaceId !== client.workspaceId) {
		throw new RemoteServiceError("not_authorized", `Not accessible: ${sessionId}`);
	}
}

function toSummary({ sessionId, title }: ManagedSessionRecord): SessionRecordSummary {
	return { sessionId, title };
}
```

每次调用都对着传输策略在 server 本地安装的 client 身份授权，从不对着普通参数中提供的身份。

### TUI facet：picker {#tui-facet-the-picker}

```ts
// tui.ts
export const sessionPickerTuiFacet = defineFacet({
	id: "@pi/session-picker",
	setup(env) {
		const directory = env.use(SessionDirectory);
		const management = env.use(SessionManagement);
		const tui = env.use(Tui);

		tui.commands.register("sessions.switch", async (context) => {
			const current = directory.state.value;
			const attachment = tui.attachment.value;
			if (current === undefined || attachment === undefined) return;
			const selected = await tui.select(
				"Sessions",
				current.sessions.map((session) => ({
					label: pickerLabel(session, attachment),
					value: session.sessionId,
				})),
				{ signal: context.abortSignal },
			);
			if (selected !== undefined) await management.attach(selected, context);
		});

		env.own(directory.state.subscribe((next) => renderSessionList(next)));
	},
});
```

TUI facet 消费由那一台已连接 server 提供的 service。这个 plugin 没有 session facet，因为 session 不拥有发现或 attachment。

### 附加与切换 {#attaching-and-switching}

`attach(sessionId)` 为这次 presentation 连接选择 session：

1. server 为它管理的某个 session 授权该 client；
2. 它关闭该 client 先前的 session 作用域请求、订阅以及被观察的实例任务；
3. 它把 presentation host 的 Session service 绑定到所选 Session worker；
4. Session worker 从完整全新快照 hydrate singleton 状态与当前 keyed 实例；attachment 状态变为 `attached`。

Session service handle 在切换之间稳定：Session facet 的 `env.use(Models)` 一次返回的代理继续对着新 Session 工作，并且 `env.observe(QuestionDialogs, ...)` 对账新 Session 的实例。属于已关闭订阅或请求的帧被丢弃。

### 被路由的 session 调用 {#routed-session-call}

```text
TUI A (selected session S1): rpc.client agent-controller.prompt
server: authorize client for S1; route to session worker S1 with authenticated client identity
S1: rpc.server agent-controller.prompt — fresh local Context, validated JSON args → lane.prompt(...)
response returns S1 → server → TUI A
```

Abort TUI 请求会通过 server 把取消发送到 S1，abort session 侧请求 controller。`Context` 与 trace 元数据在 service 端点重建。

### 路由是 host 基础设施 {#routing-is-host-infrastructure}

Server 以契约无关的方式路由 session 流量。它解析协议信封——帧 kind、请求 ID、service ID、可选实例 key/generation 以及所选 session——但不解析 service 业务 payload。校验发生在 service 端点，因此 server 可以在不加载该 session facet 的情况下路由 Session service。

Server 用其已认证 client 身份盖章被路由的调用。Session worker 按 presentation 路由键控连接拥有的请求，防止请求 ID 碰撞与跨 client 取消。没有 server facet 参与路由或重新提供 session service。

## Session 拥有的延迟交互：question extension {#session-owned-deferred-interactions-the-question-extension}

某些 session 侧工作必须向用户征求决定。现有 `examples/extensions/question.ts` 展示该体验：模型调用 `question` tool，用户选择一个选项或输入答案，tool 返回该答案以及紧凑渲染。

Question 不是路由到一个合格 presentation 的反向 RPC。Session 添加一个按 invocation ID 键控的临时 dialog service。每个已连接 TUI 或 web presentation 观察该实例，稍后连接的 presentation 通过实例 hydration 发现它，并且在没有用户连接时实例仍保持打开。

### 共享契约 {#shared-contracts}

```ts
const QuestionParamsSchema = Type.Object({
	question: Type.String(),
	options: Type.Array(
		Type.Object({
			label: Type.String(),
			description: Type.Union([Type.String(), Type.Null()]),
		}),
	),
});
type QuestionRequest = Static<typeof QuestionParamsSchema>;

type QuestionResponse =
	| { outcome: "selected"; index: number }
	| { outcome: "custom"; answer: string }
	| { outcome: "cancelled" };

interface QuestionDetails {
	question: string;
	options: string[];
	answer: string | null;
	wasCustom: boolean;
}

interface QuestionDialogs {
	readonly request: ReplicatedState<QuestionRequest>;
	submitAnswer(response: QuestionResponse, context: Context): Promise<void>;
}

const QuestionDialogs = defineService<QuestionDialogs>("pi.question-dialog");
```

`QuestionDialogs` 只声明契约。每个 invocation 显式添加一个 keyed 实例。其 `request` 状态由 service、invocation key、隐藏 generation 以及成员名寻址。

Tool-result helper 仍是 session 本地的：

```ts
function questionResult(request: QuestionRequest, answer: string | null, wasCustom: boolean, text: string) {
	return {
		content: [{ type: "text", text }],
		details: { question: request.question, options: request.options.map((o) => o.label), answer, wasCustom },
	} satisfies AgentToolResult<QuestionDetails>;
}
```

### Session facet：添加一个 dialog service {#session-facet-add-one-dialog-service}

`memoOnce(name, candidate)` 是原子 invocation-memo 操作。它保留第一个值，把该持久赢家返回给每个调用者，并通过拒绝其 promise 而不是同步抛出来报告所有失败。`awaitAbortable()` 是普通共享取消工具。

```ts
// session.ts
export const questionSessionFacet = defineFacet({
	id: "@pi/question",
	setup(env) {
		const dialogs = env.provideMany(QuestionDialogs);
		const tools = env.use(Tools);

		tools.add((draft) => {
			draft.set("question", {
				label: "Question",
				description: "Ask users a question and wait for an answer.",
				executionMode: "sequential",
				replay: "safe",
				parameters: QuestionParamsSchema,

				async execute(_toolCallId, params, _onUpdate, _toolContext, invocation, context) {
					if (params.options.length === 0) {
						return questionResult(params, null, false, "No options provided");
					}

					const memoName = "pi.question.answer";
					let response = (await invocation.getMemo(memoName)) as QuestionResponse | undefined;

					if (response === undefined) {
						const completion = Promise.withResolvers<QuestionResponse>();
						const request = env.replicatedState<QuestionRequest>(params);
						const close = dialogs.spawn(invocation.invocationId, {
							request,
							async submitAnswer(candidate, _answerContext) {
								if (candidate.outcome === "selected" && params.options[candidate.index] === undefined) {
									throw new Error("Question response selected an invalid option");
								}
								const committed = invocation.memoOnce(memoName, candidate);
								completion.resolve(committed);
								await committed;
							},
						});

						try {
							response = await awaitAbortable(completion.promise, context.abortSignal);
						} finally {
							close();
						}
					}

					if (response.outcome === "cancelled") {
						return questionResult(params, null, false, "User cancelled the question");
					}
					if (response.outcome === "custom") {
						return questionResult(params, response.answer, true, `User wrote: ${response.answer}`);
					}
					const selected = params.options[response.index];
					if (selected === undefined) throw new Error("Question response selected an invalid option");
					return questionResult(params, selected.label, false, `User selected: ${response.index + 1}. ${selected.label}`);
				},
			});
		});
	},
});
```

`dialogs.spawn()` 在 `execute()` 等待之前安装实例。返回的 close 函数是单一的正常、取消与错误清理路径。并发提交调用 `memoOnce()`，其原子先写者规则防止覆盖并返回同一持久赢家。`completion.resolve(committed)` 使本地等待跟随该持久操作：成功恢复 tool，失败则拒绝它并运行同一清理，而不是让它挂起。每次 service 调用也 await 自己的 `committed` promise，因此它不能在持久化之前报告成功，也不能留下被忽略的 rejection。通过已关闭实例或旧世代的调用作为陈旧 service 调用失败。

### TUI 与 web facet：观察每个 dialog 实例 {#tui-and-web-facets-observe-every-dialog-instance}

```ts
// tui.ts
type QuestionChoice =
	| { outcome: "selected"; index: number }
	| { outcome: "custom" };

export const questionTuiFacet = defineFacet({
	id: "@pi/question",
	setup(env) {
		const tui = env.use(Tui);
		env.observe(QuestionDialogs, async (dialog, context) => {
			const request = dialog.request.value;
			if (request === undefined) throw new Error("Question dialog was observed before hydration");

			const modal = await tui.acquireModal(context.abortSignal);
			try {
				const choice = await modal.select<QuestionChoice>(
					request.question,
					[
						...request.options.map((option, index) => ({
							label: option.label,
							...(option.description === null ? {} : { description: option.description }),
							value: { outcome: "selected" as const, index },
						})),
						{ label: "Write a custom answer", value: { outcome: "custom" as const } },
					],
				);

				let response: QuestionResponse;
				if (choice === undefined) {
					response = { outcome: "cancelled" };
				} else if (choice.outcome === "selected") {
					response = choice;
				} else {
					const answer = await modal.input(request.question);
					response = answer === undefined ? { outcome: "cancelled" } : { outcome: "custom", answer };
				}

				await dialog.submitAnswer(response, context);
			} finally {
				modal.close();
			}
		});

		tui.toolRenderers.add<QuestionDetails>("question", questionRenderer);
	},
});
```

`observe()` 为每个打开实例运行一个可 abort 任务，包括 hydration 快照中已存在的实例。因此三次并发 tool invocation 产生三个按其 invocation ID 键控的任务。TUI modal 队列一次显示它们一个；web host 可以渲染全部三个。关闭一个实例只 abort 每个 presentation 中它的任务。

没有已连接 presentation 时，添加的实例与未解决 tool 仍由 Session 拥有。Web facet 观察同一 service；无头 client 可以忽略它。类似功能——权限、OAuth 或 editor 请求——可以在所有 presentation 都需要发现临时实例时添加自己的 service 实例。秘密仍需要窄方法与 presentation 安全状态。

### 持久化与 worker 替换 {#durability-and-worker-replacement}

Service 实例是实时进程状态；invocation memo 是 replay 收据。Harness 已经持久化安全 tool 的生效参数、稳定 invocation ID、`effect_pending` 状态以及 memo。`memoOnce()` 同步进入 invocation 的 Session mutation line 上的一次原子读或写，并验证同一 operation、turn、源位置与 invocation 仍拥有该 effect。它返回已有值，或提交并返回候选。

如果 worker 在答案提交之前死亡，旧实例与 promise 消失。安全 replay 读不到答案，并用新世代添加同一逻辑 key。如果它在提交之后死亡，replay 读取答案并返回，而不添加实例。Client 不能在 worker 缺席时作答；通过旧世代的调用失败，而不是按裸 ID 定位 invocation。

Memo 具有既有 invocation 生命周期。把 tool 结果暂存为 `outcome_ready` 会原子删除它；取消与外部终结使用同一清理。Question 请求不被复制进另一个 memo，因为 Harness 已经持久化生效 tool 参数。源 reload 使用同一持久 worker 重建路径。

## 生命周期与处置 {#lifecycle-and-disposal}

Facet 环境拥有 service provision、`provideMany()` 实例、观察，以及通过 `own()` 显式注册的资源。Facet 必须自己注册状态订阅、watcher、timer、subprocess、overlay 以及其它外部资源。Host 在 provider 之前停用 consumer，并按反向注册顺序运行每个 facet 拥有的 cleanup。

已经接纳的入站 RPC 调用可以在其提供 facet 停用时继续。撤回 provider 会拒绝新调用。需要更强围栏的代码需要显式生命周期拥有的 controller。

## 重新加载 facet {#reloading-facets}

Reload 意味着替换已加载 facet 源。它不是覆盖持久 Session 状态或外部 effect 的事务。

### 保形 provider 替换 {#shape-preserving-provider-replacement}

`FacetHost.reload()` 仅在每个替换声明与活动 facet 完全相同的 service 需求、provision 以及 singleton/keyed 模式时，按 `Facet.id` 替换 facet。被测试的序列是：

```text
load replacement facets
→ run setup and validate the unchanged service shape
→ withdraw replaced singleton provisions
→ deactivate old facets in reverse dependency order
→ activate replacements in dependency order
→ rebind local implementation slots
→ publish complete RPC singleton replacement snapshots
→ dispose the retired LoadedFacets generation
```

Loader 处置刻意在 `FacetHost.reload()` 之外：加载模块的协调者拥有该模块。它必须仅在旧活动 facet 退役之后才处置旧 `LoadedFacets`，并且如果 setup 或校验失败则处置失败的候选世代。

Singleton 门面属于其消费者，而不是 provider 世代。现有本地代理与捕获的本地方法分发到替换实现。现有 RPC 代理、捕获方法与复制状态门面保留身份。替换期间它们不可用：调用失败而不是排队，并且状态在完整替换快照到达之前变为未 hydrate。

Reload 在旧 facet 停用开始之后没有回滚保证。失败的替换使受影响 service 不可用或降级。已经接纳的调用不会被自动 replay 或取消；调用者必须通过权威状态或稳定 operation ID 对账不确定的持久 outcome。

### 形状变化与进程替换 {#shape-changes-and-process-replacement}

改变需求、provision、模式、facet 成员或进程权威是结构性的。它需要新组装的图或普通进程重启；`FacetHost.reload()` 有意拒绝它。

Reload 协调者住在它替换的 facet 图之外，并遵循这些规则：

1. Reload 控制留在被替换的 facet 图之外。
2. 它选择期望的源世代，然后独立加载受影响的 server、Session 与 presentation bundle。没有聚合跨进程 extension 对象。
3. 保形 facet 使用现有 host reload 原语。结构变化在切换之前构建并校验候选图。Session 权威变化在打开替换之前停止旧 worker 并释放 Session 所有权。
4. Host 可以在不同时间收敛，因此共享 service 契约与持久记录必须容忍临时源世代偏斜。
5. 失败被报告，而不假装回滚已提交 Session 记录、文件系统写入、subprocess effect，或已经切换的 host。

`ReplicatedState` 是投影而不是存储。替换 provider 从持久 Session 记录、配置或另一拥有源重建权威状态，并发布完整快照。必须在 worker 重启后存活的 keyed 实例同样需要持久应用记录，并以全新实时世代返回。Provider 本地传输序号与 keyed 世代可以在重新绑定之后重启，并且从不是全局单调。

恰好一个 worker 可以拥有打开的 Session。因此 worker 替换有路由缺口：

```text
old worker stops and releases Session ownership
→ selected Session remains logically selected but unavailable
→ replacement worker opens the Session and reconstructs services
→ server creates a fresh attachment binding
→ presentations hydrate fresh singleton and keyed snapshots
```

Reload 从不盲目重试被中断的 mutation。请求可能在其响应丢失之前已经提交。持久可恢复性属于 Harness 与应用契约，不属于 facet cleanup。

## 连接丢失、错误与安全 {#connection-loss-errors-and-security}

从 facet 作者视角看的断开行为：

- **Presentation 断开。** 其 server abort 该 client 的活动请求，并关闭其被观察的实例任务以及其它 session 路由资源。Session 拥有的工作按应用策略继续。已添加的 question dialog 仍由 Session 拥有；断开的 presentation 丢失其代理，任何进行中的 `submitAnswer()` 调用失败。
- **Session worker 断开或崩溃。** 其 server 使被路由的进行中调用失败，并关闭该 worker 被观察的实例任务。已附加 presentation 在 server 连接仍健康时看到 `attachment.status === "degraded"`，因此目录仍可用，用户可以附加到别处。
- **进程丢失其 server 连接。** 其已连接 server 与 Session service 变为不可用。Session worker 同时丢失 server service 与所有已附加 presentation；无人值守 Session 策略决定它是否退出。
- 重连与重新附加始终从全新权威快照 hydrate；先前的 keyed 代理与 attachment 绑定帧无效。**从不在不确定断开之后盲目 replay mutation**——被 replay 的 `select()` 无害，被 replay 的 `prompt()` 则不然。重连、hydrate 并对账，或围绕带显式查找语义的稳定 operation ID 设计该操作。

错误作为带稳定协议与 service 码的 JSON 信封 `{ code, message }` 跨线。意外异常变为 `internal_error`，不暴露堆栈。认证与应用错误使用已注册的稳定码。

边界规则：

- 可远程发布的 service ID 来自受信任的已加载 service token；远程边界只接受实现函数与带品牌的复制状态成员，实例世代由 host 拥有，并且 `{ local: true }` service 从不可远程发现；
- 业务参数、结果与状态作为 JSON 校验；协议信封不能被伪造为普通值；
- Client 不能选择 context 位置、实例世代、所选 Session 路由字段，或除自己请求以外的取消目标；并且
- 凭据、prompt、completion、tool 参数/结果以及文件系统内容除非显式契约允许，否则不暴露。

## Host 组合 {#host-composition}

Facet kernel 感知 service 但对应用中立。完整产品应为 server 权威、每个 Session worker 以及每个 presentation 提供独立加载的 facet 集。共享契约包含 service token 与 JSON 安全 DTO；它们不意味着提供与消费 facet 共享一个 bundle。

## 开放决定 {#open-decisions}

在 extension 层成为规范之前：

- `Extension` 标识什么，以及它如何把版本映射到独立打包的 host facet；
- manifest/源选择格式、排序规则、包导出约定、信任策略以及跨进程版本偏斜；
- 结构图替换如何保留 host 控制并报告部分收敛；
- 具体的作用域 server、Session、TUI 以及未来 web 能力；
- 目录状态是按已认证 client 投影，还是全局 presentation 安全；
- 认证、授权、协议版本协商以及预期应用错误注册；
- 可选 service 依赖、多 Session presentation、复制状态流控以及缺口恢复；
- 在 keyed service 覆盖具体功能之后是否仍需要私有返回引用；以及
- facet kernel、service RPC、coding-agent host 集成与 extension 契约之间的包边界。

## 所需测试 {#required-tests}

测试矩阵覆盖：

- 由 setup 派生的 provision 与需求、迟到访问守卫、缺失与重复 provider、模式校验、环、激活顺序以及反向处置；
- 本地与已连接 singleton 调用、由 token 驱动的发布、严格 JSON 值、keyed 实例 hydration、世代围栏、取消以及所选 Session 路由；
- 冷状态、快照/更新竞态、缓冲、更新顺序、断开清理以及完整替换快照；以及
- 静态/组合 loader，加上保形 provider reload 之间稳定的本地与 RPC singleton handle。

它还覆盖 extension 发现与隔离的进程特定 bundle 加载；结构图重新组装与 reload 协调；带保留逻辑选择与全新 attachment 围栏的 worker 交接；作用域 host 能力与贡献 registry 重建；已认证路由与 telemetry 传播；keyed provider 替换与激活失败；以及下面的 question 与协作 review 示例。

## 协作 diff review：持久共享侧栏 {#collaborative-diff-review-a-durable-shared-sidebar}

Diff review 从 presentation 开始，而不是从 tool invocation。用户请求审查当前工作树 diff；session 快照它并打开一个共享 review。每个已附加 TUI 与 web presentation 渲染相同的 patch 与评论，任何授权用户都可以添加评论，或把整个 review 作为一次 prompt 提交。

这使用两种 service 模式：

```text
DiffReviewManager                         singleton service
  createReview()
    → persist immutable patch
    → add DiffReviews[reviewId]

DiffReviews[reviewId]                    keyed service
  document                               immutable patch state
  activity                               durable comments + status state
  addComment()                           commit, then publish
  submit()                               freeze, enqueue one prompt, close
```

Keyed 实例是实时、反应式投影。Extension 拥有的记录是持久权威。Pending 评论不是弱持久化：每个已确认评论在 worker 重启后存活，但记录在其 prompt 被持久接受之后删除。

### 共享远程契约 {#shared-remote-contract}

```ts
interface DiffCommentInput {
	commentId: string; // 在不确定重试之间稳定
	path: string;
	side: "old" | "new";
	line: number;
	body: string;
}

interface DiffComment extends DiffCommentInput {
	author: { userId: string; displayName: string };
	createdAt: string;
}

interface DiffReviewDocument {
	reviewId: string;
	patch: string;
}

interface DiffReviewActivity {
	revision: number;
	comments: DiffComment[];
	status: "open" | "submitting";
}

interface DiffReviewManager {
	createReview(context: Context): Promise<void>;
}

interface DiffReviews {
	readonly document: ReplicatedState<DiffReviewDocument>;
	readonly activity: ReplicatedState<DiffReviewActivity>;
	addComment(input: DiffCommentInput, context: Context): Promise<void>;
	submit(context: Context): Promise<void>;
}

const DiffReviewManager = defineService<DiffReviewManager>("pi.diff-review-manager");
const DiffReviews = defineService<DiffReviews>("pi.diff-review");
```

Client 从不提供 patch、作者或 review ID。Session 计算有界不可变 patch，创建 ID，并从 `Context` 中的已认证身份派生每位作者。`commentId` 只是幂等 key；它不授予权威。

### 窄本地持久化能力 {#narrow-local-durability-capabilities}

与 question 不同，这次交互没有 invocation memo。Session facet 使用三种进程本地能力：快照工作树的 diff 源、序列化记录 mutation 的 review store，以及带幂等 `enqueueOnce()` 的 prompt 队列。一条持久 review 记录包含不可变 patch、带修订的评论、状态，以及可选冻结的 `{ submissionId, prompt }`。这些本地能力是普通 `{ local: true }` service；其 repository API 不是 extension 共享契约的一部分。

`DiffReviewRecords` 按 review 序列化 mutation。`addComment()` 对着存储的 patch 校验锚点，盖上已认证作者，对 `commentId` 去重，提交，然后返回新修订。`freezeForSubmission()` 原子排除后续评论，并存储稳定 submission ID 加上包含不可变 patch 与该精确评论快照的 prompt。如果提交已经冻结，它返回同一记录。`PromptQueue.enqueueOnce()` 仅在该逻辑 prompt 被持久接受之后返回；重试其 submission ID 不能入队第二次 prompt。

### 为什么记录 mutation 需要临界区 {#why-record-mutations-need-a-critical-region}

`DiffReviewRecords` 建立在 facet 的作用域 Session 数据上（`values.md`）：extension 拥有 namespace 中的类型化持久 value。每次存储调用是原子的，但应用的读-改-写循环跨越多次调用，因此跨越多次 await。并发 service 调用可以在它们之间交错。

没有序列化时的具体失败——两个用户同时按提交：

```text
submit A: getValue(record)          → status "open"
submit B: getValue(record)          → status "open"
submit A: setValue(frozen, subm-A)
submit B: setValue(frozen, subm-B)  → overwrites A's freeze
→ enqueueOnce(subm-A) and enqueueOnce(subm-B) both run: two prompts for one review
```

每次 `setValue()` 都是原子的；*循环* 不是。`addComment()` 在检查状态与替换记录之间存在同一窗口。

在单一权威 worker 模型中，最简单的修复是按 review 的 **临界区**：一个 FIFO、不可重入的异步 mutex，其 `run(signal, fn)` 一次接纳一个 pending 函数。每个读取并 mutation 既有 review 的操作——包括 `addComment()`、`freezeForSubmission()` 与 `complete()`——对该 review ID 使用同一区域：

```ts
async freezeForSubmission(reviewId, context) {
	return regionFor(reviewId).run(context.abortSignal, async () => {
		const stored = await session.getValue(reviewRecord(reviewId), context);
		if (stored === undefined) throw new RemoteServiceError("review_not_found", `Unknown review: ${reviewId}`);

		const current = stored.value;
		if (current.status === "submission_pending") return current; // 幂等重试

		const submissionId = newSubmissionId();
		const frozen = {
			...current,
			revision: current.revision + 1,
			status: "submission_pending",
			submission: {
				submissionId,
				prompt: renderReviewPrompt(current.patch, current.comments),
			},
		};
		await session.setValue(reviewRecord(reviewId), frozen, context);
		return frozen;
	});
}
```

`revision` 由应用拥有，并且按 review 单调。该区域使 `current.revision + 1` 无歧义；session 全局存储 `seq` 仍是存储排序元数据，并且不被投影进记录。因此 `publish()` 可以直接比较返回的记录修订。

排队时被 abort 的调用者从 FIFO 移除，并在不调用 `fn` 的情况下拒绝。一旦接纳，区域在 `finally` 中释放；取消与存储失败可能拒绝该操作，而每次单独存储转换仍保持原子。有状态校验留在区域内，但用户交互与无关 I/O 留在外面。Repository 方法不得调用获取同一不可重入区域的另一方法，并且在已完成 review 没有所有者或等待者之后可以丢弃区域条目。

需求是每个 review 一条可线性化的读-改-写路径，而不是特别是 mutex。存储 compare-and-swap 操作或序列化 mutation 的 repository 能力可以替换进程本地区域。持久结算幂等（`memoOnce()`、`enqueueOnce()`）解决记录转换之后的崩溃与重试行为；它不替换转换本身的序列化。

### Session facet {#session-facet-1}

Session facet 遵循简短重建算法：

```text
activation
→ list pending review records
→ add one DiffReviews instance per record
→ publish document and activity state
→ resume any frozen submission through enqueueOnce()

createReview()
→ snapshot the diff
→ create the durable record
→ add its DiffReviews instance

submit()
→ atomically freeze comments and submission ID
→ publish "submitting"
→ enqueueOnce(submission ID, prompt)
→ delete the completed record and close the instance
```

每次 mutation 在 `publish()` 之前提交。并发评论与提交调用由记录 repository 排序：先提交的评论在冻结 prompt 中；冻结之后到达的评论收到 `review_closed`。`complete()` 只删除匹配的冻结记录，并且 `close()` 是幂等的。

启动扫描从持久记录重建每个打开的 keyed 实例。`submission_pending` 记录通过 `enqueueOnce()` 恢复投递，然后关闭。因此 prompt 接受之前的崩溃会重试 prompt，而接受之后、清理之前的崩溃观察到同一 submission ID 并且只完成清理。

### TUI 与 web facet {#tui-and-web-facets}

Extension 拥有其 TUI 与浏览器 widget。TUI 与 web facet 都 `observe(DiffReviews, ...)`。每个 observer 从已 hydrate 文档打开原生面板，订阅 activity，把评论与提交动作转发到 service，并在实例 context abort 时关闭面板。TUI 还注册一个调用 `DiffReviewManager.createReview()` 的命令；web 表面可以把同一操作暴露为按钮。

`observe()` 仅在两个状态成员都 hydrate 之后开始。面板一次收到不可变文档，并且订阅 `activity` 立即渲染当前评论，而不在每次编辑时重传 patch。迟到 client 看到同一 pending review。Activity 更新在 `nextAction()` 等待时继续。每个侧栏动作携带全新的、由 presentation 创建的 `Context`；寿命更长的观察 context 只控制面板寿命。当提交关闭 keyed 实例时，每个面板的观察 context abort，其 `finally` 块处置订阅与 widget。

提交的 prompt 在一次请求中包含不可变 patch 与全部冻结评论。缩写：

```text
Review this patch and address all comments:

<stored immutable patch>

- src/parser.ts, new line 42 — Armin: Preserve the original error cause.
- src/ui.ts, new line 18 — Jane: Keep this state visible after reconnect.
```

评论作者给侧栏基本的多人在场。当前查看者花名册或光标会是分开的实时状态，并且不会写入 review 记录。

这是共享 review，不是通用房间原语。Keyed service 提供发现与反应式寿命；记录 repository 提供临时持久化；prompt 队列提供进入 session 的幂等交接。

## 推迟：基于增量的复制状态 {#deferred-delta-based-replicated-state}

> **推迟：** `DeltaState` 不是初始 facet-service 或 RPC 契约的一部分。仅在具体功能证明全值 `ReplicatedState` 更新太昂贵、并且同一模式出现在不止一个功能中之后，才添加它。

真实的复制缺口仍然存在。某些权威值很大、频繁变化，并且必须支持迟到加入者。`ReplicatedState` 正确 hydrate 并重连，但每次更新都发送完整值。

画布是一个可能的例子：加入需要完整文档，而拖动形状理想上应只发送该操作。以今天的原语，facet 必须接受完整 `ReplicatedState` 更新，或把高频投影保持为进程本地。具体功能应在添加另一个远程原语之前确立快照、增量、缺口恢复与流控需求。

### 可能的未来原语 {#possible-future-primitive}

如果重复实现证明抽取合理，未来的 `DeltaState<S, D>` 可以保留 `ReplicatedState` 的同步值与快照 hydration，同时在 hydration 之后投递类型化增量。Provider 将只暴露 `apply(delta, context)` 与 `replace(value, context)`；共享纯 reducer 将更新消费者副本。

共享 reducer 是纯的且确定的。`apply()` 同步归约 provider 的值并发布一个增量；`replace()` 发布新的权威快照。业务快照与增量不含传输修订。Host 在 provider 绑定内盖修订号，缓冲与 hydration 竞态的更新，只应用连续帧，并在缺口或重连之后请求全新快照。

支持这一点需要显式 RPC 成员 kind。提供对象携带 `DeltaState` 定义 ID；provider 在成员元数据中宣布该 ID；消费 host 在本地应用增量之前解析同一导入定义。该契约仅与该注册和 hydration 协议一起被采用。

`DeltaState` 将只解决实时复制。它不提供持久存储、mutation 序列化、多写合并、离线编辑或自动 mutation replay。持久画布仍将序列化自己的 mutation，在发布之前持久化已接纳增量，并与 append 协调日志压缩。持久日志游标仍是应用/存储元数据，并且独立于 host 的传输修订。
