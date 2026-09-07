本文是 `rpc.md` 的中文阅读版；命令、路径、API 名称保持英文。

# Facet 服务 RPC {#facet-service-rpc}

Chord 拥有与应用无关的服务语义以及可插拔的严格 JSON 连接边界。Pi 拥有此处描述的具体线信封、路由、附着状态和错误 adapter。当前实现把 `JsonValue` 当作静态契约，并把对不受支持值的运行时拒绝推迟给具体 serializer。

> **状态：** 实验性 facet-service RPC 语义的设计规范。

## 角色 {#role}

`provide()`/`use()` 和 `provideMany().spawn()`/`observe()` 是 facet 系统隐藏的 RPC。Facet 共享 TypeScript 服务契约，而传输承载服务/成员标识符、严格 JSON 值、请求/订阅关联、带 key 的 generation，以及绑定控制消息。Host 构造类型化的本地实现或 facade；TypeScript 类型和任意对象从不越过线路。独立加载的进程可能暂时运行不同的源 generation，因此它们的服务契约必须在受支持的 skew 窗口内保持前向兼容；版本协商仍被推迟。

```text
session/server facet: provide() / provideMany().spawn()
                    ↕ hidden service RPC
presentation/session facet: use() / observe()
```

服务系统是扩展边界。呈现 facet 接收语义服务和复制状态；它们从不接收原始 Harness、Session、tool registry、hook registry、credential store 或 storage handle。

## 非目标 {#non-goals}

不要序列化 `Context`、`AbortSignal`、telemetry 对象、callback、tool、hook、函数或任意对象图。不要让核心 Harness 或 Session 实现感知传输机制。不要让断开执行持久化或服务拥有的取消。不要为已经约束为 JSON 的值构建按方法的 codec。

## 服务契约与类型化 facade {#service-contracts-and-typed-facades}

服务 token 是共享的 TypeScript 契约和稳定服务 ID。它不是生成的描述符，也不创建 provider。Token 默认可远程发布；进程本地 token 声明 `{ local: true }`。`provide()` 向 host 图添加一个单例实现。`provideMany()` 在 facet setup 期间注册一个多实例服务所有者，并返回一个 `ServiceSpawner`，其后续 `spawn()` 调用发布实例。Host 自动发布每一个非 local 的 provision。一个 token 在一个 host 服务图中只有一种模式：混合单例和 keyed 使用是错误。

Provider 把每一个暴露的实现成员分类为方法或 Chord 创建的 `ReplicatedState`，并在订阅 snapshot 中发布该成员表。消费者通过普通属性访问获得成员名——例如，JavaScript `Proxy` 对 `models.state` 收到 `"state"`，对 `models.refresh(context)` 收到 `"refresh"`。访问的槽位在 facade 绑定时对照 provider 宣布的 kind 校验。

本地和远程 `use()` 都返回一个稳定、惰性的类型化 facade，由该 token 的消费者共享。在同步 facet setup 期间 facade 是断开的，因此 setup 可以捕获它，但不能调用方法、读取状态或注册成员订阅。装配之后，本地 facade 通过直接的进程本地实现槽位解析，远程 facade 通过 host 的已连接服务绑定。重新加载提供方 facet 会暂时把同一个 facade 标记为不可用，然后交换其目标；RPC 单例清除就绪状态，并在其现有订阅上安装一份完整的替换 snapshot，以便被捕获的方法和成员 facade 指向替换物。当没有 provider 绑定时，调用方法失败，状态保持未 hydration；不会仅仅因为调用经过 proxy 就把调用排队。

远程方法返回 promise，除已声明的 `Context` 外接受并返回严格 JSON；`void` 是没有 result 字段的成功响应。不支持私有返回引用。Client 在传输之前移除 context，接收 host 构造一份新的本地 context。契约位置由 host 控制且必须一致；示例使用一个必需的尾部 `Context`。业务上的缺席是 JSON `null` 或 options 对象，从不传输 `undefined`。

使用静态断言和运行时校验。静态检查约束远程方法和 replicated-state 成员；运行时边界拒绝不受支持的成员以及非 JSON 的参数、结果和状态值。TypeScript 提供类型化 facade，但不认证对等方，也不创建运行时 metadata。

`{ local: true }` 只移除远程发布及其线契约限制。除此之外，local 与非 local provision 使用同一份依赖账本、激活顺序、稳定单例槽位、keyed-instance generation、observer 取消、disposal 以及 provider-facet reload。本地单例槽位和本地 keyed registry 直接持有任意对象契约；非 local provision 另外把其实现安装到远程 provider。

## 依赖账本 {#dependency-ledger}

类型擦除不隐藏服务身份：每个服务 token 在运行时保留其稳定 ID。Facet 环境由 host 以不可伪造的所有者身份创建，其 setup 时服务方法追加到 generation 范围的账本：

- `provide()` 记录一次单例 provision；
- `provideMany()` 记录一次 keyed provision；
- `use()` 记录一次单例需求；以及
- `observe()` 记录一次 keyed 需求。

Facet 总是调用未限定的 `env.use()` 或 `env.observe()`；路由不编码在调用中。这些操作在 setup 期间返回与源无关的断开 handle。Setup 之后，每个连接返回其 provider 生成的服务目录，host 把每一个需求绑定到其本地 provision 或恰好一个已连接 provider。方法提供模式，token 提供 ID。因此 host 不需要对被擦除的 `T` 做反射，也不需要手写并行依赖列表。

第一次获取或 provision 只允许在 facet setup 期间。之后的 command、hook 和激活 callback 使用 setup 时获取的单例 facade、observer 注册或 `ServiceSpawner` 能力。特别地，动态实例通过 `provideMany()` 返回的能力 spawn；迟到的 spawn 不能引入先前未声明的 provision。

Setup 之后，每个 host 私自把记录的需求对账到本地 provision 和连接目录，以拒绝缺失 provider、重复远程供给和模式不匹配，并派生生命周期边。一个尚无存活附着的 selected-Session 连接可以暂时把未解析需求当作不可用接受；附着对照 worker 生成的目录校验它们，并缓存该目录供后续分离 generation 使用。连接绑定由 generation 拥有，且只包含被选中的需求，因此失败或退役的 generation 释放其订阅而不 dispose 底层传输连接。这个内部服务图不同于模块加载器的源 import 图；它不是 facet 编写或 facet 可见的计划。

## 绑定与身份 {#bindings-and-identity}

呈现 host 在一个图中组合来自其已连接 server 和所选 Session 的服务。它的所有 facet 使用同一个未限定环境 API。Session 服务调用从不接受客户端选择的持久化 `sessionId`；server 授权并把呈现所选的 Session 绑定路由到其 worker。

### Server 控制平面 {#server-control-plane}

Session 列举与管理是普通 server 单例服务，不是通用远程 `Session` 方法。`SessionDirectory` 把呈现安全的 session 摘要作为 replicated state 暴露。`SessionManagement` 暴露 `create`、`remove`、`attach` 和 `detach` 方法。TUI 或 web facet 通过其环境消费二者：

```ts
const directory = env.use(SessionDirectory);
const management = env.use(SessionManagement);
```

Server 把一个服务 provider 绑定到每个呈现连接。它从本地已认证的连接身份派生 workspace 和 client 权威，而不是从摘要字段或方法参数。它可以按 client 投影 directory 状态；无论哪种方式，摘要从不暴露 server 私有字段，例如 owner ID 或工作目录。

`management.attach(sessionId, context)` 改变呈现 host 中所选 Session 服务。Server 关闭该呈现先前的 Session 范围请求、订阅和 observer 任务，把呈现的 Session 服务绑定到 worker，然后 hydration 它们的单例状态和 keyed-instance 目录。Server 对照连接身份授权所选 Session。附着状态是报告此次选择及其健康状况的 host 控制状态；它不是 directory 服务。`detach()` 执行同样的清理，但不做替换。

Host 需要该路由的一份私有、host 拥有的绑定 incarnation。它在呈现附着、分离、切换 session 或替换失败 worker 时改变。其表示有意保持未指定。该绑定防止旧所选 session 的延迟 frame 被应用到新 session；它不是 facet 可见的服务值，也不是授权的替代品。

Replicated-state 源具有结构身份：

```text
(provider binding, service ID, optional instance key + generation, member name)
```

没有单独可发现的 state ID。加入的 instance key 是应用级逻辑 key。当一个已关闭的 key 被复用时，其 host 拥有的 generation 会改变，因此陈旧 proxy 不能调用替换物。`requestId` 标识一次传输调用，用于响应和取消。Harness/tool `invocationId` 可能是有用的 instance key——如 question 示例——但它不替换存活地址中的服务、绑定或 generation 部分。

## 调用、context 与路由 {#calls-context-and-routing}

一次调用携带足够的控制平面信息，以选择 provider 绑定、服务、可选 keyed instance 和成员，外加 request ID、JSON 参数和 trace carrier。Server 可以解析那些控制平面字段以路由 Session 调用，但它不解析 facet 业务 payload，也不加载 facet 契约。服务端点校验成员和值，创建请求本地 abort controller 和 `Context`，安装已认证身份，并调用本地实现。

Client 把 `context.abortSignal` 映射为对该一次请求的取消。断开取消该连接的活动调用并关闭其订阅。二者都不取消服务拥有的工作，也不写入持久化 Harness 取消。按 client 的请求关联到达 worker，因此不同呈现的 request ID 不能碰撞。

## 复制状态与 keyed 实例 {#replicated-state-and-keyed-instances}

`ReplicatedState` 是权威的最新值复制，不是事件历史、持久化存储、CRDT 或多 writer 状态。冷 replica 的 `value === undefined`；hydration 之前订阅会记录 listener 但不调用它。Hydration 在投递后续 update 之前原子安装一份完整 snapshot，因此没有 snapshot/update 缺口。一旦 hydration，`value` 是同步的，订阅先报告当前值，再跟随后续 update。第一次 snapshot callback 使用一份新的 hydration context；已经 hydration 的 replica 使用一份新的本地投递 context，而不是保留原始写入 context。状态值是借用的不可变 JSON，不做防御性克隆；调用方不得改变或保留它们。

远程 hydration 使用一份以订阅为父的新投递 context，而 update 从源 trace metadata 重建新的投递 context。断开、provider 撤回、替换和路由切换清除就绪状态。重连或替换在后续 update 之前安装一份完整 snapshot。传输缓冲与 hydration 竞态的 update，并检查它们的 sequence。确认、流控和缺口恢复仍是分开的协议机制。

`observe()` 是 keyed-instance 发现，不是包含 proxy 的 `ReplicatedState`。它对账一份完整的初始目录与有序的添加、替换和移除。每个实例的初始状态成员在其 observer 任务开始之前 hydration。关闭一个实例拒绝新调用，只中止该实例的 observer 任务，并允许已受理调用结算。Session facet 的 `env.observe()` 注册在该 facet generation 关闭时中止旧任务；替换 generation 对账新目录。

## 私有返回引用 {#private-returned-references}

私有返回引用在初始服务契约之外。对可发现的存活实例优先使用 keyed 服务。若具体功能需要调用方私有的远程身份，其引用必须显式传递，而不是由 `observe()` 发现，并限定于接收方和 provider 绑定。

本设计不包含通用 Harness 投影。原始 Harness、Session、lane、tool、hook 和 storage 对象仍是本地权威。若未来集成需要远程 callback 或通用对象能力，它需要单独的显式协议和策略；它不是服务 RPC 的扩展。

## Context、取消与 telemetry {#context-cancellation-and-telemetry}

每个远程方法接收一份新的本地 `Context`；发送方的对象、signal、telemetry 实现和任意类型化值从不越过线路。Client 把该调用的 abort signal 映射到该请求，并注入 trace carrier。端点构造请求本地 abort signal 和 telemetry 父级。取消经 server 转发到 Session worker，并按 client 加 request ID 隔离。

Span 关系是：

```text
caller
└─ rpc.client
   └─ rpc.server
      └─ service implementation
```

三个取消域保持分开：中止一次 RPC 调用；显式取消服务拥有的工作，例如 `job.cancel()`；以及持久化 Harness 取消，例如 `requestAbort()`。传输取消和断开只执行第一种。活过一次调用的工作必须分离到带自己的 controller 和 telemetry root 的服务拥有任务中。

## 安全与生命周期 {#security-and-lifecycle}

只有已加载且未标记 local 的服务 token 可以在远程边界注册。只有拥有该实例的 `ServiceSpawner` 可以 spawn 实例。标记 `{ local: true }` 的服务永远不能被远程发现。本地服务可以使用不受限的对象契约。远程 provider 校验成员 kind，而具体 serializer 强制 JSON 业务值。Client 不能把控制信封伪造成普通值、选择 instance generation、在服务调用中选择不同的 Session 路由，或取消另一个 client 的请求。

Server 认证连接、授权附着，并在服务 `Context` 中重建 client 身份。普通业务参数从不携带权威。凭证、prompt、completion、tool 数据、文件系统内容和其他敏感值需要显式的呈现安全契约。

Facet 环境拥有注册、加入的服务实例、观察，以及通过 `own()` 显式注册的资源。连接绑定拥有其传输订阅和活动请求 controller。已经受理的入站调用不附着到提供方 facet 生命周期：provider 撤回拒绝新调用，但已受理方法可以在旧 facet 停用时继续。Provider 自己的 Session 工作保持存活，除非其生命周期策略停止它。

## 测试 {#tests}

面向 facet 的语义在 loopback 和分帧传输上测试：

- setup 时依赖账本所有权、拒绝迟到获取、本地和远程 `use()`、keyed-provider 所有权、单例/keyed 模式校验、token 驱动的 RPC 发布、惰性成员访问、跨 provider-facet 替换保持稳定的本地和 RPC 单例 facade，以及 `{ local: true }` 服务保持远程不可达；
- 严格 JSON 边界、方法 context 重建，以及不序列化 context 值的请求取消隔离；
- server/Session facet 隔离、所选 Session 切换、陈旧 frame 拒绝，以及 worker 侧按 client 的请求关联；
- 冷的和已 hydration 的 `ReplicatedState`、无 snapshot/update 竞态缺口、新的投递 context，以及断开、重连和 provider 替换时的清除/再 hydration；
- 实例目录 hydration、有序对账、observer 任务之前的状态 hydration、基于 generation 的陈旧拒绝，以及关闭或切换时的任务清理。

额外测试覆盖已认证附着与身份、telemetry 传播、流控和缺口恢复，以及 question 与 shared-review 应用模式。若加入私有引用，它们需要单独的生命周期和隔离覆盖。

## 开放的协议机制 {#open-protocol-mechanics}

精确的服务调用、取消、订阅、snapshot/update、keyed-instance、不可用和替换 frame 定义在 `packages/protocol/src/protocol.ts`。Provider 与 namespace 层拥有成员分类、惰性 facade、缓冲和定序。

仍然开放的是确认、流控、sequence-gap 恢复、若加入引用则引用收集、协议版本协商，以及未来多 pane 呈现如何表示多于一个所选 Session。单例 provider 替换必须继续在现有订阅上安装一份完整替换 snapshot，以便方法和状态成员槽位保留身份。

## 示例：directory 与所选 session {#example-directory-and-selected-session}

Directory 和管理服务是普通 server 服务。它们的契约只携带呈现安全的值：

```ts
interface SessionSummary {
	serverId: string;
	sessionId: string;
	createdAt: string;
}

interface SessionDirectory {
	readonly state: ReplicatedState<{ revision: number; sessions: SessionSummary[] }>;
}

interface SessionManagement {
	create(options: { id?: string }, context: Context): Promise<SessionSummary>;
	remove(sessionId: string, context: Context): Promise<void>;
	attach(sessionId: string, context: Context): Promise<void>;
	detach(context: Context): Promise<void>;
}

const SessionDirectory = defineService<SessionDirectory>("pi.session-directory");
const SessionManagement = defineService<SessionManagement>("pi.session-management");
```

Server facet 从已认证 `Context` 派生 client，授权所请求的 Session，并执行绑定转换：

```ts
serverContext.provide(SessionDirectory, { state: directoryState });
serverContext.provide(SessionManagement, {
	async attach(sessionId, context) {
		const client = requireClientIdentity(context);
		authorizeSession(client, sessionId);
		await attachments.bind(client.clientId, sessionId, context);
	},
	async detach(context) {
		await attachments.unbind(requireClientIdentity(context).clientId, context);
	},
});
```

呈现 facet 渲染并选择 Session：

```ts
setup(env) {
	const directory = env.use(SessionDirectory);
	const management = env.use(SessionManagement);
	const tui = env.use(Tui);

	tui.commands.register("sessions.switch", async (operation) => {
		const snapshot = directory.state.value;
		if (snapshot === undefined) return;
		const sessionId = await tui.select(
			"Sessions",
			snapshot.sessions.map((session) => ({ label: session.sessionId, value: session.sessionId })),
			{ signal: operation.abortSignal },
		);
		if (sessionId !== undefined) await management.attach(sessionId, operation);
	});
}
```

同一呈现中的另一个 facet 通过同一 API 获取 Session 服务：

```ts
setup(env) {
	const models = env.use(Models);
	// After attach() settles, `models` addresses the selected worker.
}
```

呈现从不使用所选 `sessionId` 路由 `models`；其 host 路由每个服务 token，传输保留所选 Session 绑定。Server 在 hydration 新绑定之前关闭先前 Session 绑定的资源。
