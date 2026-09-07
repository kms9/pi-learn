本文是 `facets.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 插件与 Facet 架构 {#plugin-and-facet-architecture}

> **状态：** 设计规格。在与 `plugins.md` 的 facet/service 模型不一致处，以本文为准。传输分帧见 `rpc.md`。

## 1. 系统形态 {#1-shape-of-the-system}

一个 **插件** 是一个包，最多三个入口，每种宿主一个：

```text
my-plugin/
  contract.ts    service token + JSON DTO         （共享，无宿主 import）
  server.ts      server facet                      （可选）
  worker.ts      session-worker facet              （可选）
  tui.ts         presentation facet                （可选）
```

运行时没有任何东西把这些入口链接起来。它们只共享 `contract.ts` 里的 token。每一个都由 esbuild 打成单个 JavaScript 文件，指向该入口。

一个 **facet** 是进程内的单元：一个带静态 manifest 和一个 construct 函数的对象。一个 **宿主（host）** 是装配 facet 图的进程——server、session worker 或 presentation。

拓扑是一棵连接树：

```text
server
├─ TUI A
├─ web B
├─ session worker S0
└─ session worker S1
```

## 2. Token {#2-tokens}

Token 是 service 契约的身份。它以 phantom 携带 service 类型、稳定 ID、是否具备 RPC 能力，以及——关键地——它的 **mode**。

```ts
type ServiceMode = "singleton" | "keyed" | "peer";

interface Service<T, M extends ServiceMode = ServiceMode> {
  readonly id: string;
  readonly mode: M;
  readonly rpc: boolean;
  readonly __type?: T; // phantom
}

function defineService<T>(
  id: string,
  options?: { rpc?: boolean },
): Service<T, "singleton">;

function defineKeyedService<T>(
  id: string,
  options?: { rpc?: boolean },
): Service<T, "keyed">;

/** 每个已连接 peer 一个实例；每个 peer 只看到自己的那一份。 */
function definePeerService<T>(
  id: string,
  options?: { rpc?: boolean },
): Service<T, "peer">;
```

三种 mode 的差别只在于存在多少实例、以及谁能看见它们：

| mode | 实例 | 消费者声明 | 消费者得到 |
| --- | --- | --- | --- |
| `singleton` | 一个，共享 | `uses` | 该 service |
| `keyed` | 多个，对所有人可见 | `observes` | 每个实例一个 task |
| `peer` | 每个已连接 peer 一个，仅对该 peer 可见 | `uses` | 该 service |

`peer` 是对每客户端状态的回答（§10.2）。它不是第四种机制——宿主按 peer 惰性实例化，并只向该 peer 宣布——但消费者人体工学很重要：从客户端一侧恰好只有一个，所以它写 `uses` 并调用，完全像 singleton。观察 *一组* 实例才是 `observes` 的用途，而每客户端状态不是那种情况。

Mode 活在 token 上，因为它是契约的属性，不是提供者做的选择。这删掉了整整一类装配错误：一个 token 不可能被作为 singleton 提供、又作为 keyed 消费，因为根本没有东西可声明。

Token 默认具备 RPC 能力。`{ rpc: false }` 把 token 限制在其提供进程内；这类 token 从不被宣布，也永远无法远程解析。

## 3. Facet {#3-facets}

```ts
const modelSelectionTui = defineFacet({
  id: "@pi/model-selection:tui",

  uses:     [Models, Tui],
  provides: [],
  observes: [],

  construct(ctx) {
    const models = ctx.use(Models);
    const tui = ctx.use(Tui);

    tui.commands.register("models.select", async (context) => { /* ... */ });

    return [];
  },
});
```

三个声明字段，全部是纯 token 数据，全部可以在不执行任何东西的情况下读取：

- **`uses`** — 本 facet 需要的 singleton token。
- **`provides`** — 本 facet 实现的 token，singleton 或 keyed。
- **`observes`** — 本 facet 观察其实例的 keyed token。

`construct` 只在 kernel 校验完整图、并构造完每一个依赖之后才运行。`ctx.use()` 返回的一切都是 **真正的对象**，绝不是稍后才变得有效的 proxy。不存在 facet 持有不可用之物的阶段。

**`construct` 是同步的。** 它接线对象并返回供给；它不做 I/O。任何异步的东西都通过 `ctx.onActivate` 注册，后者在整张图构造完成之后按依赖顺序运行。`ctx.onDeactivate` 在 disposal 之前按逆序运行。三个阶段，每个只有一件工作：

| 阶段 | 同步？ | 可以调用依赖吗？ | 目的 |
| --- | --- | --- | --- |
| `construct` | 是 | 否 | 接线对象，返回供给 |
| activate | 否 | 是 | I/O、订阅、初始 fetch |
| deactivate | 否 | 是 | disposal 之前的有序关闭 |

保持 `construct` 同步，才让排序保证变得简单：facet 不可能观察到半建成的图，因为在全部存在之前什么都不会跑。

### 3.1 为什么不用副作用来声明 {#31-why-not-declaration-by-side-effect}

`plugins.md` 从同步 `setup()` 期间的 `env.use()` / `env.provide()` 调用推导依赖账本。这避免把 manifest 写两遍，但迫使 `use()` 返回一个断开的惰性 proxy——一个在装配完成之前类型都是谎言的对象。然后每个 facet 作者都得记住一条语言无法强制的规则。

把声明与构造分开，每个 token 多写一次，换来的是：

- 用 **零 facet 代码执行** 做图校验——对第三方插件是决定性的，一套坏的集合应在运行之前被拒绝；
- construct 全程类型诚实；
- 一个十秒内就能读完整个表面的 facet。

重复由类型检查消除（§4），因此不会漂移。

### 3.2 Construct 上下文 {#32-construct-context}

```ts
interface ConstructContext<U, P> {
  /** 已解析的 singleton 依赖。只接受在 `uses` 中声明的 token。 */
  use<S extends U[number]>(token: S): ServiceType<S>;

  /** 在 `provides` 中声明的 keyed token 的 owner 句柄。 */
  owner<S extends KeyedOf<P>>(token: S): ServiceInstances<ServiceType<S>>;

  /** 宿主构建的复制状态；见 §9.2。 */
  state<T>(definition: StateDefinition<T>, initial: T): MutableState<T>;

  /** 整张图构造完成后按依赖顺序运行。 */
  onActivate(fn: (context: Context) => void | Promise<void>): void;
  /** 在 disposal 之前按依赖逆序运行。 */
  onDeactivate(fn: (context: Context) => void | Promise<void>): void;
}

interface ServiceInstances<T> {
  /** 对该 `key` 调用本 facet 的 factory，注册并宣布它。 */
  add(key: string): () => void;
}
```

`ctx.use()` 是带类型的查找，而不是位置元组或具名袋子：没有发明的标签，没有位置匹配，传入未声明的 token 是编译错误。

Owner 句柄通过 `ctx` 到达，而不是被返回，因为它们是 kernel 拥有的机械，在 factory 之前就存在。Construct 接收依赖和它自己的句柄；它返回实现。

## 4. 返回类型与完备性 {#4-return-type-and-completeness}

`construct` 返回一个由两个 helper 构建的条目数组：

```ts
function provide<T>(token: Service<T, "singleton">, impl: T): ProvideEntry<typeof token>;
function provide<T>(token: Service<T, "keyed">, factory: (key: string, scope: InstanceScope) => T): ProvideEntry<typeof token>;
function provide<T>(token: Service<T, "peer">, factory: (principal: Principal, scope: InstanceScope) => T): ProvideEntry<typeof token>;

/** construct 上下文中 `state()` 的实例生命周期等价物。 */
interface InstanceScope {
  state<T>(definition: StateDefinition<T>, initial: T): MutableState<T>;
}

function watch<T>(
  token: Service<T, "keyed">,
  handler: (instance: Instance<T>, context: Context) => void | Promise<void>,
): WatchEntry<typeof token>;

interface Instance<T> {
  readonly key: string;
  readonly service: T;
}
```

返回数组中的 token 并集必须等于 `provides` 加 `observes` 的并集——两个方向的相互可赋值，同时给出 **完备性**（没有遗忘）和 **没有多余**（没有未声明之物）：

```ts
type TokensIn<R extends readonly Entry[]> = R[number]["token"];

type CheckComplete<R extends readonly Entry[], Declared> =
  [TokensIn<R>] extends [Declared]
    ? [Declared] extends [TokensIn<R>]
      ? unknown
      : { __error: "missing implementation for declared token" }
    : { __error: "returned an undeclared token" };

function defineFacet<
  const U extends readonly AnySingleton[],
  const P extends readonly AnyService[],
  const O extends readonly AnyKeyed[],
  const R extends readonly Entry[],
>(facet: {
  id: string;
  uses: U;
  provides: P;
  observes: O;
  construct: (ctx: ConstructContext<U, P>) => R & CheckComplete<R, P[number] | O[number]>;
}): Facet;
```

注意这是 token/value 对的数组，不是对象 map。Token 是对象，而对象不能当键。字符串 ID 键会在 manifest 里的 token 与 construct 里的字符串字面量之间再引入一道缝；unique symbol 无法在 `defineService` 的返回类型中存活，会塌成普通 `symbol` 并把每个键合并。在数组里把 token 与值配对，让每个条目针对它自己的 token 单独带类型，并让完备性可检查。

> **未决：** `CheckComplete` 的错误信息人体工学需要实验。失败指向 construct 的返回类型，这是正确的，但不好看。

### 4.1 完整示例 {#41-worked-example}

```ts
export const questionSession = defineFacet({
  id: "@pi/question:session",

  uses:     [Tools],
  provides: [QuestionDialogs],   // keyed token
  observes: [],

  construct(ctx) {
    const tools = ctx.use(Tools);
    const dialogs = ctx.owner(QuestionDialogs);
    const pending = new Map<string, PendingQuestion>();

    tools.add((draft) => {
      draft.set("question", {
        /* ... */
        async execute(_id, params, _u, _tc, invocation, context) {
          const completion = Promise.withResolvers<QuestionResponse>();
          pending.set(invocation.invocationId, { params, completion });
          const close = dialogs.add(invocation.invocationId);
          try {
            return toResult(await awaitAbortable(completion.promise, context.abortSignal));
          } finally {
            close();
            pending.delete(invocation.invocationId);
          }
        },
      });
    });

    return [
      provide(QuestionDialogs, (key) => {
        const entry = pending.get(key)!;
        return {
          request: entry.state,
          async submitAnswer(candidate, _context) { /* memoOnce, resolve */ },
        };
      }),
    ];
  },
});
```

Factory 收到 key，并闭合在 facet 私有状态上。`dialogs.add()` 触发它。Construct 仍然恰好运行一次。

## 5. 排序与环 {#5-ordering-and-cycles}

`uses` 和 `provides` 是静态的，因此 kernel 在 **运行任何一个之前** 就对 facet 计算拓扑序。每个 facet 都在其全部依赖之后构造。失败——缺失的 provider、重复的 singleton owner、环——对着 manifest 报告，不执行任何 facet 代码。

**Facet 之间的环会被拒绝。** 没有任何排序能满足它们，而对 coding-agent 功能的调研也没有发现真正的构造期环：tools 和 providers 通过 contribution registry 扇入；hooks 是宿主调用你；telemetry 是叶子；wrappers 是有序组合。

看起来循环的情况是晚期的 *调用时* 引用，不是构造依赖。那些得到一个显式、可见的逃生口：

```ts
uses: [Tools, deferred(QuestionDialogs)]
// ctx.use(deferred(X)) 返回 () => X，在装配完成后首次调用时解析
```

Deferral 是 opt-in 且罕见的，因此结的代价是局部且可读的，而不是让每个 facet 都以普遍不可用的 proxy 的形式付账。

### 5.1 同一 facet 内的组合 {#51-same-facet-composition}

一个 facet 的 service 共享模块和闭包作用域。两个互相需要的 service 就是普通 JavaScript：在 construct 里把两者都建出来，手工接上引用，一起返回。共享的私有状态是两者都闭合的变量。Kernel 不介入，也没有 facet 内的图。

如果一个 facet 里的两个 service 对称地互相需要，那通常是一个带两张脸的 service，或者一个私有对象藏在两道 facade 后面。

## 6. 宿主、连接，以及权威的方向 {#6-hosts-connections-and-direction-of-authority}

**宿主只能依赖它所连接到的东西，而连接构成一棵树。** 这一条规则取代任何全局排序，并让跨进程图保持无环，而不必把 server 特判成「本来就在那里的内建」。

每个宿主本地排序。远程供给是 **叶子**——上游进程在宣布之前已经构造好它们，因此按定义已经满足。

具体地：

- **session worker** 连接到 server，因此 worker facet 可以 `use` server token。这是必须的：`spawn_subagent` tool 需要 server 的会话管理。
- **presentation** 连接到 server，因此 TUI facet 可以 `use` server token。
- Presentation 也消费 **session** service——但从它的视角，提供者是负责路由的 server。当一个 session 被 attach 时，server 的 catalogue 只是变大。

没有直接的 presentation↔worker 连接。

### 6.1 Server 从不依赖 worker {#61-the-server-never-depends-on-a-worker}

Server 必须在任何 worker 存在之前构造，因此它不能 `use` worker service。反向流动使用 **reporting registry**：server 提供一个 token，worker 往里面推。

```ts
// contract.ts
export interface SessionStatusReporting {
  report(status: SessionStatus, context: Context): Promise<void>;
}
export const SessionStatusReporting =
  defineService<SessionStatusReporting>("pi.session-status-reporting");

export interface SessionStatusView {
  readonly state: State<Record<string, SessionStatus>>;
}
export const SessionStatusView =
  defineService<SessionStatusView>("pi.session-status");
```

Worker `uses` reporting token 并推送；server 聚合成复制状态；presentation 读取聚合。依赖仍然指向上游，数据向下流。

这免费得到正确的生命周期：聚合立刻存在且为空；worker 出现、注册、消失；崩溃的 worker 是一条条目移除，而 server 已经知道，因为它拥有连接。

## 7. Facet 投递与 generation {#7-facet-delivery-and-generations}

**Presentation 交付时没有任何插件 facet。** 它有宿主 service（`Tui`），别无其他。所有插件 facet 都以构建好的 bundle 经线路到达。

这消解了分离的 presentation 持有未解析需求的问题：分离时没有需求，因为没有 facet。

两代，生命周期不同：

| generation | 来源 | 生命周期 | 例子 |
| --- | --- | --- | --- |
| **connection** | server | 该 server 连接 | session picker |
| **attachment** | session worker | 一次 attachment | question dialog、chat |

切换 session 只拆除并重建 attachment generation。Picker 全程继续运行——它必须如此，因为正是它触发切换。

Attachment generation 对着 connection generation 解析（上游优先，按 §6）。反向被禁止：connection-generation facet 不能依赖 attachment-generation token，因为 attachment 可以消失。

### 7.1 为什么由 worker 选择 presentation facet {#71-why-the-worker-chooses-the-presentation-facets}

插件可以是 **全局的**，也可以活在 session 的 **工作目录** 里。因此 TUI facet 的集合取决于 TUI 从哪里启动——同一个二进制，每个项目能力不同。

因此 worker 知道哪些 TUI bundle 属于它，并在 attach 时经 server 把它们送出去。工作目录不仅仅是 spawn 参数；它是图的输入。

> **安全：** attachment-generation bundle 是从项目目录到达、并在用户的 presentation 进程中执行的第三方代码。目录本地插件的信任策略是一个未决决定，必须在发布之前敲定。

## 8. 启动与握手 {#8-startup-and-handshakes}

### 8.1 Presentation 连接 {#81-presentation-connect}

```text
TUI → server: connect
server → TUI: server RPC 供给的 catalogue + connection-generation bundle
TUI: 装配、校验、构造 connection generation
```

### 8.2 到达一个 session {#82-reaching-a-session}

三条路径，汇聚到一次 attach：

| 调用 | 路径 |
| --- | --- |
| `pi`（裸调用，在某个目录里） | 请 server 为 cwd 创建一个 session |
| `pi --resume` | 启动时调用 picker command |
| `pi --session <id>` | 直接 attach |

`--resume` 不需要特殊机械：picker 是由 server 来源的 picker facet 注册的普通 command，resume 在启动时调用它，而不是等一次按键。两条路同一条代码路径。

Create 携带工作目录，因为 server 需要它来 spawn，worker 需要它来解析本地插件。

### 8.3 Attach {#83-attach}

```text
TUI → server:   attach(sessionId)
server:         授权；拆除上一次 attachment generation；
                把路由绑定到 worker
server → worker: client attached（身份）
worker → server: session RPC 供给的 catalogue + TUI bundle
server → TUI:    catalogue + bundle
TUI:             装配、校验、构造 attachment generation
worker/server:   hydrate 状态值
```

TUI 的 kernel 校验一次，此时 worker 的 catalogue 已经在手。没有临时或降级的解析状态。

### 8.4 Worker 启动 {#84-worker-startup}

```text
worker → server: connect
server → worker: server RPC 供给的 catalogue
worker:          加载全局 + cwd 本地插件；装配；构造
```

Worker 自身对 server token 的依赖在这里解析，在任何 attachment 之前。

## 9. 复制原语 {#9-replication-primitives}

恰好三样东西穿越连接。

### 9.1 Service 调用 {#91-service-calls}

普通 request/response。用于动作（`select`、`submitAnswer`）以及对不变之物的一次性读取（往回滚聊天历史）。什么都不复制。参数和结果是严格 JSON；`Context` 由 proxy 剥掉，在端点处重建。

### 9.2 复制状态 {#92-replicated-state}

一个权威写入者，许多读取者。流携带一个 base op batch，随后是 delta batch；词汇表在 [delta.md](../../01-harness/01-delta/delta.md)。

全值复制是退化配置，生产者在每次更新时显式 replace 或 rebase。它不是单独的原语：Chord 发出根替换 op `r`。

#### 状态是普通 TypeScript {#state-is-plain-typescript}

Facet 从不写 op。Provider 正常地变更它的状态对象；框架的 tracker（`delta.md`）记录意图并发出 op。

```ts
// contract.ts
export const TranscriptState = defineState<TranscriptTail>("pi.transcript.tail");
```

```ts
const tail = scope.state(TranscriptState, initial);

tail.mutate((s) => {
  s.entries.push(entry);            // -> splice
  s.entries[0].text += chunk;       // -> append
  delete s.pending;                 // -> delete
});
```

没有 mutation map，没有 recipe，没有声明的 operation，没有 Immer。也没有 `defineValueState` / `defineReducedState` 的分裂——更早的草稿需要它，因为 reduced state 携带 differ 无法恢复的带类型 delta，而 tracker 能恢复它们。

`mutate` 是同步的，不接受 `Context`。一次 mutation 是纯状态转换：它什么都不调用，不能被取消，也没有调用者身份可查询。权威在决定去 mutate 的那个方法里检查。

#### Op 从不携带 provider 代码 {#ops-never-carry-provider-code}

消费者应用 op。它们从不看见 mutation 名，也从不运行 provider 代码。

这之所以重要，有一个具体原因：消费者运行 provider 代码就必须从 registry 解析定义，使 fold 依赖环境注册——一次 reload 会让同一输入得到不同答案。Op 去掉这一点，并让非 JS 消费者变得简单，因为 applier 就是六个动词。

后果：

- mutation 名不是线路契约的一部分，也不出现在任何 member table 里，因此没有 mutation 名版本偏移；
- 消费者不需要参数的 schema，只需要根 `r` op 里那个值的 schema；
- `x = undefined` 规范化为 `delete`，因为 JSON 没有 `undefined`。

#### 线路协议 {#wire-protocol}

生产者和 applier 使用 `Op[]`；订阅携带编码后的 `WireOp[]`。payload 里没有 frame 类型，也没有 `seq`：SSE binding 盖上 `id:`，那才是传输元数据该在的地方（`delta.md` §6）。

`Op` 及其编码——六个动词、数组路径、元组形式、二次使用的路径 intern——规定在 [delta.md](../../01-harness/01-delta/delta.md) §2 和 §4。这里不再复述。

**替换就是一个 op**，`["r", value]`。没有 frame 判别器。第一个 op 是 `r` 的 batch 是 **base batch**，而 batch zero 永远是一个。这把 `plugins.md` 分开处理的几件事塌到一起：

- 没有独立的线路 hydrate 形状——快照就是第一个 batch；
- 快照缓冲仍然是本地 adapter 细节，而不是第二套线路协议；
- 冷启动、重连、provider reload、session 切换、序列缺口，以及无法 apply 的 fold，都是 **同一条代码路径**：发送一个新的 base batch。

最后这一项就是本设计里任何地方都没有 `Rebase` 类型的原因。

SSE `id:` 由宿主 binding 盖章，每次订阅从零开始，并且连续。消费者看到缺口就丢弃副本并重新订阅。

#### 重新订阅是一个 base batch 加上缓冲的 batch {#resubscription-is-a-base-batch-plus-buffered-batches}

没有跨订阅 resume，也没有 `Last-Event-ID`。重新订阅的方式，就是 harness 已经分发 lane 状态的方式：把当前值快照成 base batch zero，在客户端追赶时缓冲到达的东西，客户端就绪后再把缓冲作为普通 batch 投递。

那就是与 `AgentHarness.watch` 相同的两阶段形状——先 `snapshot` 再 `start`——并且纯属 provider binding 的本地细节，在线路上不可见。消费者看到的是一个 base batch 后跟连续 batch，与冷启动完全一样。

真正的 resume 需要保留 op log，好让客户端请求「seq N 之后的一切」。我们故意不保留：持久形式是每个 *值* 的 batch 列表（[delta.md §9](../../01-harness/01-delta/delta.md#9-durable-form)），随其 scope 退役，而不是每订阅一份历史。缓冲在一次握手期间花费有界内存；op log 会永远花费无界磁盘。

落地的 tracker 发出结构 op，没有序列化尺寸启发式。Provider 替换、重连，以及策略驱动的恢复边界，显式调用 `replace()` / `rebase()`；那些是根 `r` batch 的唯一来源。

#### Harness 不发出 op {#the-harness-does-not-emit-ops}

Harness 发出带类型的 `HarnessEvent`，永远如此。Op 出现在上一层。

Lane facet 在进程内调用 harness，订阅带类型的事件，并用普通 mutation 把它们折进 **它自己的** 状态形状。Tracker 把那变成 op。Facet 从不写 op，也从不思考路径。

这个 fold 无论如何都得存在，因为 **复制形状是 facet 的选择，不是 harness 的**。从 harness 发出 op 并不会去掉 fold；它只会把「事件进状态」换成「op 进状态，类型更差」，并且会让 `LaneSnapshot` 的字段布局成为线路契约。

```ts
// packages/agent/src/harness/runtime/reducer.ts
export function reduceLaneSnapshot(view: LaneView, event: HarnessEvent): void;
```

普通 mutation，没有 Immer，没有返回值。见 `harness-tools.md` §6。

#### 塑造状态以避免写放大 {#shaping-state-to-avoid-write-amplification}

两条规则，都是 tracker 记录意图的后果：

- **把增长的字符串放在稳定路径上** — 每个 content block 一条，每个 tool operation 的 output 一条。然后一条 delta 恰好触及一条路径，这也正是路径 intern 能把它塌成单个整数的原因。
- **复制状态里没有派生字段。** 从原始值重算的解析值在每次 parse 时都是新引用，因此会作为整值 `set` 发出，并重复已经存在的信息。改为按需派生（`message-update.md` §5.2）。

Content block 数组没问题：块出现时一次 `splice`，然后什么都没有。之后变化的是块 *里面* 的字符串。

#### 请求一个状态值 {#requesting-a-state-value}

Provider 在 `construct` 期间请宿主构建状态值。Facet 从不自己构造一个，因为状态值是 binding：宿主拥有它的订阅者表、revision 盖章和 disposal。

```ts
interface State<T> {
  readonly value: T | undefined;                    // 在 base batch zero 之前为 undefined
  subscribe(listener: (value: T) => void): void;   // 什么都不返回（§13）
}

// 在 ConstructContext 和 InstanceScope 上
state<T>(definition: StateDefinition<T>, initial: T): MutableState<T>;
```

Provider 侧：

```ts
export const transcriptSession = defineFacet({
  id: "@pi/transcript:session",
  uses: [Agent],
  provides: [Transcript],
  observes: [],

  construct(ctx) {
    const agent = ctx.use(Agent);
    const tail = ctx.state(TranscriptState, { entries: [] });

    agent.onEntry((entry, context) => {
      tail.append([entry]);
      if (tail.value.entries.length > TAIL_LIMIT) {
        tail.evict(tail.value.entries.at(-TAIL_LIMIT)!.id);
      }
    });

    return [
      provide(Transcript, {
        tail,
        page: (params, context) => archive.read(params.before, params.limit, context),
      }),
    ];
  },
});
```

一次 `mutate()` 调用推进权威值 **并且** 发布产生的 op——一条语句，因此值和线路不可能不一致。`replace()` 发布显式的根 `r` batch，重连、provider reload、resnapshot 以及策略驱动的恢复边界都用它。

消费者侧：

```ts
export const transcriptTui = defineFacet({
  id: "@pi/transcript:tui",
  uses: [Transcript, Tui],
  provides: [],
  observes: [],

  construct(ctx) {
    const transcript = ctx.use(Transcript);
    const tui = ctx.use(Tui);

    transcript.tail.subscribe((tail) => render(tail.entries));   // base batch zero 也从这里到达
    tui.commands.register("transcript.older", async (context) =>
      render(await transcript.page({ before: oldestId(), limit: 100 }, context)),
    );

    return [];
  },
});
```

消费者从不看见 opcode。它收到值，而 base batch zero 作为普通更新投递——因此没有单独的「ready」callback，facet 代码里也没有 hydrate 分支。

#### 完整示例：适配 `AgentHarness.watch` {#worked-adapting-agentharneswatch}

真正的 API 全程异步：

```ts
interface AgentHarness {
  lane(name: string, context: Context): Promise<AgentLane>;
  lanes(context: Context): Promise<LaneInfo[]>;
}
interface AgentLane {
  watch(context: Context): Promise<WatchHandle<LaneSnapshot>>;
}
interface WatchHandle<T> {
  snapshot: T;
  start(listener: EventListener): void;
  resnapshot(context: Context): Promise<T>;
  unsubscribe(): void;
}
```

`watch()` 在单个 `readLane` 临界区内 **既** 安装订阅 **又** 捕获快照，因此两者在同一把锁下取得。在 `start()` 之前到达的事件被缓冲，然后 flush。`resnapshot()` 用 `markBoundary()` callback 做同样的事，重新确立流从何处恢复。那恰好是 base batch zero 需要的保证，因此 adapter 很薄。

`LaneSnapshot` 是每个 lane 一份，因此 `Lane` 是 keyed——每个 lane 一个实例，各自做自己的 `watch()`。Harness 已经按 lane 过滤（`event.type === "usage" || !("lane" in event) || event.lane === this.name`），因此 adapter 不做路由。

因为 `watch()` 是 async，**实例 factory 可以是 async**。Factory resolve 后才宣布实例；`add(key)` 立刻返回它的 closer。

```ts
export const Lane = defineKeyedService<LaneView>("pi.lane");   // key = lane name

export const laneSession = defineFacet({
  id: "@pi/lane:session",
  uses:     [Harness],
  provides: [Lane],
  observes: [],

  construct(ctx) {
    const harness = ctx.use(Harness);
    const lanes = ctx.owner(Lane);

    ctx.onActivate(async (context) => {
      for (const info of await harness.lanes(context)) lanes.add(info.name);
    });

    return [
      provide(Lane, async (laneName, scope, context) => {
        const lane = await harness.lane(laneName, context);
        const handle = await lane.watch(context);          // 阶段 1：snapshot + subscribe
        // Facet 自己的形状，不是 LaneSnapshot。reduceLaneView 是它的代码。
        const state = scope.state(LaneState, toLaneView(handle.snapshot));

        handle.start((event) => {                          // 阶段 2：先缓冲，再 live
          if (event.type === "navigation_end") {
            void handle.resnapshot(context).then((fresh) => state.replace(toLaneView(fresh)));
            return;
          }
          state.mutate((v) => reduceLaneView(v, event));   // 普通 mutation；op 自然掉出来
        });

        return { snapshot: state, setModel: (ref, ctx2) => lane.setModel(ref, ctx2) };
      }),
    ];
  },
});
```

消费者声明 `observes: [Lane]`，每个 lane 得到一个 task，各自有自己的副本。

四件要注意的事。

- **`watch` / `start` 握手不穿越线路。** 它是一个 adapter 的本地细节。远程消费者看到 base batch zero，然后是 op。Mini 的缓冲舞步消失了，因为 harness 已经在两阶段之间缓冲，而 flush 在初始值之后作为普通 mutation 落地。
- **Facet 拥有复制形状。** `LaneView` 是 facet 的，不是 harness 的——因此才有 `toLaneView`。这就是上面那一点：fold 无论如何都存在，所以 harness 自己发 op 得不到任何东西。
- **Rebase 从不到达消费者，也不是一个类型。** `navigation_end` 是 adapter 用 `resnapshot()` 加 `replace()` 回答的普通事件——与正在重连的客户端收到的同一个 base batch。`markBoundary()` 提供顺序。没有 reducer 通过返回值发信号。
- **`HarnessEvent` 不是线路格式。** 今天的 `message_update` 携带完整 message，*以及* 一份持有第二份拷贝的 `AssistantMessageEvent`，*以及* delta，因此把它发出去会比发快照更糟。见 `message-update.md`。它从不在这里发出，因为走的是 op。
- **union 的大部分已经是 lane 状态。** `usage` 折进 `stats.usage`；config 的 `value_update` 折进 `configuration.*`；`message_update` 折进 `operation.streamingMessage`；`tool_start` / `tool_update` 折进 `operation.runningTools`；retries 折进 `operation.retry`。状态值几乎就是 presentation 需要的一切。

三个 **不属于** 其中的，是对 §9.4 的有用检验：

| 事件 | 为什么不是 mutation | 它去哪里 |
| --- | --- | --- |
| `lane_created` | 创建一个 lane，并不改变某一个 | `lanes.add(name)` — 一个新实例 |
| `handler_error` | 诊断；迟到的加入者不需要它 | events 原语 |
| 全局 `value_update` | 不是 lane 作用域 | 拥有该值的那个 service 上的状态 |

注意 `lane_created` 是在 lane 事件流上投递的，因此启动之后发现新 lane 需要 session 级的 watch，而不是上面那些 per-lane watch——这是 §16 里的一个未决问题。

#### 宿主职责 {#host-responsibilities}

下面全部是宿主机械，不是 facet API：

- 在 provider binding 内按 batch 盖 `seq`，因此业务快照和 op 不携带传输元数据；
- 在新订阅上于 delta 之前投递一个根 `r` base batch；
- 在该 base batch 上重置每个订阅者的 encoder 字典；
- 只应用连续 batch，并在缺口、重连或 provider 替换之后请求新的 base batch；
- 值穿越边界时硬化（§14.3）；
- 在 member table 里宣布状态值定义 ID。Mutation 名 **不被** 宣布，因为它们从不旅行——op 是结构的，因此消费者不需要知道一个值是如何产生的。

两条规则来自 provider 和每个副本运行同一个 fold：

> **Reducer 的状态必须是复制值的一部分。** 任何积在旁边的东西——经典情况是一段被增量解析的原始 JSON 字符串——会在任何没有运行生产者 fold 的消费者上分叉。

> **持久路径只使用宿主拥有的 reducer。** 插件解释的数据必须可跳过，因此一条不可读的流只降级那一个值，而不是让包含它的记录失败。

Mutation 名版本偏移不存在：mutation 从不穿越边界，因此添加、重命名或移除一个不是破坏性变更。版本偏移表面 *只是值形状*，由根 `r` batch 的 schema 描述。

宁可要几个粗粒度状态值，也不要一个大值。冷副本的 `value === undefined`；那是本地就绪，从不穿越线路。

### 9.3 事件 {#93-events}

即发即忘的广播。没有历史，没有持久性，断开即丢。用于 presence、光标、进行中的拖拽、瞬时通知。

### 9.4 用哪一个 {#94-which-to-use}

> **迟到的加入者需要它吗？**
> 是 → 复制状态。否 → 事件。

状态：transcript、model catalogue、session status、chat tail、canvas document。
事件：谁在打字、某人的光标在哪、一笔未提交的 stroke。

### 9.5 完整示例：chat，以及 tail/archive 分裂 {#95-worked-chat-and-the-tailarchive-split}

一个 chat room 不是一份状态。它沿同一条线分裂：

- **live tail** — 最近 N 条消息作为一个状态值。第一个 batch 用窗口替换；append 和 eviction 是 op。
- **archive** — 返回一页更旧消息的普通 service 调用。不可变历史，没有活性要求，不复制到任何东西上。

没有 `subscribe` 方法。附着到状态值 *就是* 订阅，并且它产生快照，因此 server 在读取之前就注册读者。这关闭了查询与稍后订阅之间的窗口，也意味着 server 永远不必回答「任意客户端提供的 cursor 之后发生了什么」——那一类由客户端自选时间戳造成的竞态。

Lane transcript 是同一模式：最近的条目在状态值里，更旧的在用户向上滚动时按查询获取。

### 9.6 完整示例：共享 canvas {#96-worked-shared-canvas}

文档状态是一个状态值；stroke 是 op。多写者由 **带确认的乐观 apply** 处理，不是 CRDT：

1. 客户端生成一个 op ID，本地作为未确认应用，然后发送；
2. Server 按先到先得接受，并发布产生的 op；
3. 客户端看到自己的 op ID 返回，并把它提升为已确认。

注意这是 `delta.md` 背后单写者假设被放松的唯一地方，而且是通过在 server 上序列化而不是通过合并来放松的。Op 词汇没有 `test` 动词，恰恰因为没有冲突模型可支持。

进行中的拖拽从不触及文档。它们是事件，按 peer 键控，latest-wins，断开即丢——这正是 events 原语存在的原因。

## 10. Peer、principal 与权威 {#10-peers-principals-and-authority}

### 10.1 上下文上的 principal {#101-principals-on-the-context}

每个 service 方法已经接受一个 `Context`。Proxy 在出去时剥掉它，并 **在端点处重建**，因此 kernel 从已认证连接填入调用者的 principal。它是控制面数据：从不是参数，从不可伪造。

```ts
type Principal =
  | { kind: "local" }                                   // 同一进程，完整权威
  | { kind: "user"; peer: PeerId; userId: string; role: Role }
  | { kind: "process"; peer: PeerId; host: "worker" | "server"; sessionId?: string };

interface Context {
  readonly abortSignal: AbortSignal;
  readonly principal: Principal;
  // ...
}
```

恰好有一个 `Context` 类型，并且 `principal` 总是被填充——本地和跨连接是同一个接口，因此方法体读 `context.principal` 而不必知道它是哪一种。这才是要点：service 不能有一条只在进程内出现的未检查路径。

Peer 不只是人——通过 reporting registry 调用 server 的 worker 也是 peer，而 server facet 常常想区分 *我自己的 worker* 和 *某个 TUI*。进程内调用携带显式的 `local` principal，而不是缺席的一个，因此缺失的检查不能伪装成缺失的 peer。

### 10.2 每 peer 的 service {#102-per-peer-services}

**承载权威的状态属于 `peer` service，而不是 singleton。** Singleton 按定义只有一个值，因此它不能给 owner 和 guest 展示不同的根——差异无处可住。

Provider 把 token 声明为 `peer` 并返回 factory。宿主对每个已连接 peer 调用一次，传入该 peer 的 principal，并且只向该 peer 宣布结果。每个实例从它自己的 `scope` 得到自己的状态值。

消费者在 `uses` 中声明它并调用它。没有 `observes`，没有对账，没有要观察的集合——从客户端一侧恰好存在一个实例，因为恰好只向它宣布过一个。

### 10.3 完整示例：文件浏览 {#103-worked-example-file-browsing}

```ts
// contract.ts
export interface BrowseRoot {
  readonly handle: string;   // 不透明、每 principal、可撤销
  readonly label: string;
}

export interface BrowseView {
  readonly roots: BrowseRoot[];
  readonly note?: string;    // 例如 "Ask the owner for wider access"
}

export const BrowseState = defineState<BrowseView>("pi.browse.view");

export interface FileBrowsing {
  readonly view: State<BrowseView>;
  list(handle: string, path: string, context: Context): Promise<DirEntry[]>;
}

export const FileBrowsing = definePeerService<FileBrowsing>("pi.file-browsing");
```

Server facet：

```ts
export const fileBrowsingServer = defineFacet({
  id: "@pi/file-browsing:server",

  uses:     [Fleet],
  provides: [FileBrowsing],
  observes: [],

  construct(ctx) {
    const fleet = ctx.use(Fleet);

    return [
      provide(FileBrowsing, (principal, scope) => {
        // 每个实例一张表。Handle 在这里铸造，因此一个从未给过某 peer 的
        // handle 不仅仅是被拒绝——对它们而言它根本不存在。
        const table = new Map<string, string>();

        function publish() {
          const roots = rootsForPrincipal(principal, fleet).map((path) => {
            const handle = newHandle();
            table.set(handle, path);
            return { handle, label: labelFor(path) };
          });
          return roots.length > 0
            ? { roots }
            : { roots: [], note: "No browsable locations for this account" };
        }

        const view = scope.state(BrowseState, publish());

        return {
          view,

          async list(handle, path, context) {
            const root = table.get(handle);
            if (root === undefined) throw new ServiceError("forbidden", "unknown root");
            return readDirectory(root, path, context);
          },
        };
      }),
    ];
  },
});

function rootsForPrincipal(principal: Principal, fleet: Fleet): string[] {
  if (principal.kind === "local") return [ROOT];
  if (principal.kind === "user" && principal.role === "owner") return [ROOT, ...fleet.workspaces()];
  if (principal.kind === "user") return fleet.workspacesFor(principal.userId);
  return [];
}
```

TUI facet——注意它完全不包含权限逻辑：

```ts
export const fileBrowsingTui = defineFacet({
  id: "@pi/file-browsing:tui",

  uses:     [FileBrowsing, Tui],
  provides: [],
  observes: [],

  construct(ctx) {
    const browsing = ctx.use(FileBrowsing);
    const tui = ctx.use(Tui);

    tui.commands.register("files.browse", async (context) => {
      const view = browsing.view.value;
      if (view === undefined) return;

      if (view.roots.length === 0) {
        await tui.notify(view.note ?? "Browsing unavailable");
        return;
      }

      const root = await tui.select(
        "Browse",
        view.roots.map((r) => ({ label: r.label, value: r })),
        { signal: context.abortSignal },
      );
      if (root === undefined) return;

      let path = "";
      for (;;) {
        const entries = await browsing.list(root.handle, path, context);
        const chosen = await tui.select(
          root.label,
          entries.map((e) => ({ label: e.name, value: e })),
          { signal: context.abortSignal },
        );
        if (chosen === undefined) return;
        if (!chosen.isDirectory) return void open(root.handle, join(path, chosen.name));
        path = join(path, chosen.name);
      }
    });

    return [];
  },
});
```

Owner 的 `view` 状态同时携带机器根和工作区根；guest 的携带一个或没有。同一 bundle，同一条代码路径，不同的数据。TUI 从不按角色分支，从不把任何东西变灰，也不能构造一个它未被给予的 handle。

### 10.4 服务端校验仍然是强制的 {#104-server-side-validation-is-still-mandatory}

状态支配渲染。它不约束线路：敌对客户端可以用任何参数调用任何方法，包括它从未收到过的。

因此 `list()` 对着实例的表检查它的 handle。宁可要 **不可伪造的 handle 而不是解析过的路径**——表查找从构造上失败，而路径校验会招来 `..`、symlink、规范化和大小写折叠的 bug。撤销是免费的：丢掉条目，未结清的 handle 就停止工作。

当参数不能是 handle 时，方法读 `context.principal` 并决定。规则是权威每次都在 provider 处检查，无论客户端先前被展示过什么。

### 10.5 Peers cell {#105-the-peers-cell}

Presence 是宿主提供的复制状态：

```ts
export const ConnectedPeers =
  defineService<{ readonly state: State<Record<PeerId, Principal>> }>("pi.peers");
```

Server 和 worker facet 读它以枚举谁已 attach。Facet 只在真正的多 peer 功能上需要它——presence roster、「3 viewers」徽章。每 peer 状态 **不** 需要它，因为 `peer` mode 已经为你处理实例化和 teardown。

### 10.6 Keyed 实例 {#106-keyed-instances}

`keyed` 仍然是它一直以来的样子：许多实例，对每个消费者都可见，每个在 `observes` 下产生一个可 abort 的 task。Question dialog 是典型情况——三次并发调用产生三个实例，每个已 attach 的 presentation 都看见全部三个。

实例按 `(service, key, generation, member)` 寻址，因此它的状态值自然是每实例一份。复用一个已关闭的 key 会创建新 generation，因此过期 proxy 无法寻址替换物。

要分清的区别：

- **我想要它们全部吗？** → `keyed` + `observes`。
- **我想要我的那份吗？** → `peer` + `uses`。

## 11. Presentation 表面 {#11-the-presentation-surface}

`Tui` 是普通的 singleton token，在 `uses` 中声明，并通过 `ctx.use` 解析，像任何其他 token 一样。它由 presentation kernel 而不是插件提供，因此坐在本地排序的根上，但 facet 看不出差别。

```ts
interface TuiHost {
  readonly slots: SlotContributions;
  readonly commands: CommandContributions;   // handler 接受 AbortSignal；见 §11.3
  readonly keybindings: KeybindingContributions;
  readonly toolRenderers: ToolRendererContributions;
  notify(message: string): Promise<void>;
  acquireModal(signal: AbortSignal): Promise<TuiModal>;
  select<T>(title: string, items: SelectItem<T>[], options: { signal: AbortSignal }): Promise<T | undefined>;
}

const Tui = defineService<TuiHost>("pi.local.tui", { rpc: false });
```

### 11.1 Slot {#111-slots}

Slot 是宿主 chrome 上 facet 可以填充的具名区域。

```ts
interface SlotContributions {
  /** 独占。对同一 slot 的第二次 claim 是装配错误。 */
  claim<P>(slot: string, factory: (props: P) => Component): void;
  /** 累加。按贡献顺序排列。 */
  add<P>(slot: string, factory: (props: P) => Component): void;
}
```

```ts
ctx.use(Tui).slots.claim("footer", (props) => new FooterComponent(props, models));
```

`claim` 是独占的，重复是 **装配错误，而不是 last-write-wins**——两个插件默默争夺 footer 是必须在校验时浮出的 bug，与缺失的 provider 和重复的 singleton 并列。

Props 是 DTO。Factory 从不收到 `TUI` 或 `Theme` 实例，因此 component 不能通过自己的参数伸回宿主内部。

### 11.2 Mount 由宿主拥有 {#112-mounting-is-host-owned}

Facet 不 mount 也不 unmount。它们贡献一个 factory；宿主实例化它，对着贡献 facet 跟踪 mount，并 **在 disposal 时 unmount 它**——对 claimed slot 恢复内建 chrome，对 additive 的则丢掉该条目。

因此贡献上没有 `dispose?()`，也没有 facet 作者会忘记的 teardown。这与 §13 是同一条规则：注册即所有权。

§7 的 generation 模型自然落下两个后果：

- **Attachment 脱落** — 消费 session service 的 presentation facet 被 dispose，因此它们的 mount 消失，宿主 chrome 渲染进它们的 slot。只有 connection-generation chrome 读取 attachment 状态。
- **Session 切换** — attachment-generation facet 被 dispose，它们的 mount 随之而去；connection-generation mount 存活，因此没有闪烁，也没有丢失的滚动状态。

### 11.3 带进行中工作的贡献 {#113-contributions-with-in-flight-work}

§11.2 覆盖 *移除*：宿主对着贡献 facet 跟踪每个 mount，并在 disposal 时 unmount，因此没有会忘记的 teardown。对任何 disposal 是同步的东西，这已经完整。

它对贡献者被 dispose 时仍可能在 **执行** 的贡献不完整——这是进行中 tool 调用的 presentation 类比（§13.2）。三种情况，其中只有一种是硬的。

**同步 callback 是免费的。** 按键 handler、render 调用、click listener。JavaScript 是单线程的，因此 handler 会在 disposal 能被调度之前跑完——disposal 不能与同步帧交错。注销就是列表移除。不需要更多，而这是表面的大部分：slot、keybinding、tool renderer、theme token。

**Modal 和 picker 已经携带 signal。** `acquireModal(signal)` 和 `select(title, items, { signal })` 接受 `AbortSignal`，因为宿主可能需要解散它们。Disposal 把它 abort，promise reject，facet 的 `await` 解开。机制已经存在；disposal 只需要使用它。

**Async command handler 是硬情况**，它们恰好是换了衣服的 tool 调用：

```ts
ctx.use(Tui).commands.add("deploy", async (args, signal) => {
  await longRunningThing(signal);
});
```

用户运行 `/deploy`，十秒后面 facet 被 dispose，而 handler 仍在 await。因此 `CommandContributions` 是带进行中工作的 registry，并采取与 tool registry 相同的四个阶段：注销、发 signal、与 kernel deadline 竞速，并按结果 settle——这里是解散任何 progress UI 并恢复宿主 chrome，而不是产生一个 `ToolResultMessage`。

对 API 的两个后果：

- **Command handler 收到一个 `AbortSignal`。** 不是可选的。没有它，registry 可以注销但不能发 signal，阶段 2 不可用。
- **宿主渲染 command 进度，而不是 facet。** 如果 facet 自己画进度并在 command 中途被 dispose，那幅画会比画家活得更久。宿主拥有的进度随 mount 一起被移除，这是把 §11.2 规则应用到 §11.2 没有点名的情况。

这条规则推广为：

> 贡献 registry 需要 settle 机械，**当且仅当** 一个贡献可以在 disposal 时处于执行中途。同步贡献永远不能；任何被交给 `AbortSignal` 的永远能。

这使得 signal 成为标记。贡献接受 signal 的 registry 拥有调用跟踪和 deadline；贡献不接受的是普通列表，disposal 就是一次移除。

### 11.4 Reload {#114-reload}

Reload 是 unload 加 load，因此 mount 由同一条路径拆除并重建。跨宿主 reload 是两阶段的，因此永远没有 facet 会在死掉的 provider 上活着：

```text
1. server → 带依赖 facet 的 presentation：dispose，ack
   （provider 仍然 ALIVE，因此进行中的调用对着活着的 peer abort）
2. server → session worker：dispose + reload
3. server → presentation：load
race(acks, 2s)；错过窗口的 presentation 进入 degraded，
那也会 dispose 那些 facet。
```

调用携带 caller generation，provider 丢掉已退役的。因为一次 reload 是对每个已连接 presentation 的往返，它保持由用户发起——决不能接到 file watcher 上。

## 12. 贡献 registry {#12-contribution-registries}

Service 是一个 owner、许多消费者。Provider 和 tool 把它反过来：许多贡献者，一个宿主拥有的结果。Registry 把有序贡献重放到一份新的工作副本上，因此移除是重建而不是反向 mutation。（与 `delta.md` 里的 tracker 无关；这里没有任何东西被复制。）

```text
fresh working copy
→ built-in providers      (@pi/providers-builtin)
→ remote catalogue        (@pi/providers-catalog)
→ models.json transform   (@pi/providers-models-json)
→ auth/availability mark  (@pi/auth)
→ validated state
```

Tool 额外支持有序 wrapping——`telemetry(permission(sandbox(bash)))`——当贡献者消失时确定性地重新组合。只有宿主 finalize draft；facet 从不调用 `setTools()`。

Slot、command、keybinding 和 tool renderer（§11）都是 presentation 宿主上同一形状的实例。

**Registry 按贡献是否可以 in flight 分裂。** 贡献是值的 registry——slot、keybinding、theme token、tool renderer——是列表，disposal 是一次移除（§11.2）。贡献被 *调用并接受 `AbortSignal`* 的 registry——tool、command——拥有调用跟踪、从调用者链式下来的 signal，以及对着 kernel disposal deadline 的 settle（§13.2）。贡献签名里的 signal 是它属于哪一种的标记。

贡献配置重建后的行为；hook 拦截活着的操作。它们仍是分开的机制。

## 13. 生命周期、失败、disposal {#13-lifecycle-failure-disposal}

- 按依赖顺序构造；按逆序 dispose。
- Facet 拥有它的供给、keyed 实例和 observation。所有权是 **隐式的**：facet 收到的每个句柄都是宿主构建的 binding，自己注册 disposer，因此 `subscribe`、`on`、timer 和实例句柄随 facet 一起被释放。没有 `own()`，也没有要记住的东西。这覆盖宿主交出去的句柄；它不覆盖 facet 在未被交给任何东西的情况下就能触及的 ambient authority（§14.3）。
  因此 `subscribe()` 什么都不返回——没有 unsubscribe 句柄可持有或泄漏。
- 已被接纳的入站调用可以在其 provider 停用时完成；撤回拒绝新调用。
- 断开 abort 进行中的请求，并关闭该 peer 的订阅和实例 task。它必须 **不** 执行 service 拥有的或持久的取消。
- 三个取消域保持区分：每次调用、service 拥有的（`job.cancel()`），以及持久 Harness（`requestAbort()`）。
- 在不确定的断开之后，永远不要盲目重放 mutation。重连、hydrate、对账——或者围绕稳定的 operation ID 来设计。
- 错误以带稳定 code 的 `{ code, message }` 穿越；意外异常变成没有 stack 的 `internal_error`。

Reload：当替换物声明相同的 manifest 时，允许按 `Facet.id` 做保形替换。因为 manifest 是静态的，这个检查发生在构造候选者 **之前**——相对靠运行 setup 来校验形状，这是真正的改进。结构性变更需要图重新装配或进程重启。

### 13.1 Teardown，而不是交换 {#131-teardown-not-swapping}

替代方案是每个依赖一个 proxy，在消费者背后交换实现，让它们从不被拆除。它被拒绝，而且先例异常清楚。

**OSGi 两种都提供。** Bundle refresh 计算接到旧 export 上的一切的传递闭包并重启它；Declarative Services 也提供 `ReferencePolicy.DYNAMIC`，消费者在交换期间继续运行。他们自己的指引把 `STATIC` 作为默认，因为 dynamic 要求每个消费者对 service 在调用中途消失保持防御。

**Cordis 是 proxy 模型，人体工学说明了一切。** `ctx.get(name)` 在缺席时返回 `undefined`，指引是 *「处理它们的缺席」*——防御性检查是推荐路径。`inject` 是 *选择进入* teardown：插件进入 waiting，并在 service 回来时重新激活。

**JS HMR 就是本设计再加一件。** 更新沿 import 图向上传播，直到某个模块调用 `import.meta.hot.accept()`；如果没有人 accept，就完整 reload。React Fast Refresh 在 hook 签名变化时退回完整 reload——从不同方向到达同一结论：实现交换能活下来，形状变更不能。

**Erlang 是反例，而且它搬不过来。** 两个模块版本共存，`code_change/3` 在过渡时迁移状态。那能工作，是因为契约是消息而不是类型，因此进程在切换期间可以处理两种形状，也因为隔离意味着没有共享状态需要对账。这里两者都不成立。

三个具体反对，严重性递增：

**契约变更。** JVM HotSwap 只允许方法体；DCEVM 和 JRebel 走得更远，仍然在形状变更上失败。我们比它们任何一个都更有条件，因为 token 的 `protocol` 块携带 TypeBox schema，而 `CheckComplete` 已经做相互可赋值——因此交换 *可以* 以新 provider 的 schema 双向可赋值为门。这是我们真正能回答的那一个反对。

**进行中的注册。** 旧 provider 贡献的 tool 可能正在执行中途。它不能被取消（副作用已经发生）、不能被移交（不同的闭包），也不能被允许 settle 进一个不再包含它的 registry。Proxy 帮不上忙：调用绑定到启动它的那个实现。无论哪种方式都需要 §13.2，而这几乎就是 proxy 赚不到任何东西的原因。

**状态。** 这是没有答案的那一个。Facet 持有从旧 provider 的流派生的副本。交换之后它要么是过期的——默默错误——要么新 provider 发送一个 base batch，而这 *就是* 重新订阅。状态被拆除了；只有 facet 没有。Erlang 用显式迁移 hook 解决这个，那是没有 Erlang 隔离的 Erlang 设计。

**缓存的引用让 proxy 更糟，而不是更好。** Cordis 的守卫活在访问路径上，而不是值上：如果 service 没了，`ctx.foo` 会抛，但你存下来的引用继续工作，并调用进死去插件的闭包。我们的 `ctx.use(Token)` 按设计在 construct 时返回一个值，因此我们有同样的风险——而拆除依赖者才让它安全，因为持有者与 provider 一起死。Proxy 不修复缓存引用；它让它们默默错误，而不是不可能。

> **推迟，而不是采纳。** 如果 teardown 最终被证明太粗，要加的是 HMR 的 `accept()`，而不是 OSGi 的 dynamic 策略：按依赖 opt-in，`uses: [Harness, accepts(Models)]`，意思是 *我的获取可以被重新指向，我不从这个 provider 派生状态，并且我对它没有进行中的注册*。Kernel 只在 schema 检查通过时允许交换，否则默默回退到 teardown。**Teardown 必须仍然是永远能工作的那条路**；一旦 `accepts` 对正确性是承重的，每个消费者就又在写防御代码了。
>
> 在建造它之前，值得先量 teardown 的代价。如果 dispose 一个 presentation facet 就是一次重绘，这套机械什么都买不到。

### 13.2 带进行中工作的 disposal {#132-disposal-with-in-flight-work}

Disposal 移除一次注册。这对 service 足够，对贡献者离开时其贡献仍可能在执行的 registry **不够**。

强迫约束是 settle，不是清理：harness 欠模型它启动过的每一次调用一个 `ToolResultMessage`。「facet 走了」不是一个结果，等着它的操作会挂住。

两套引用系统都解决不了这个。Cordis 的 `_unload` 是带 try/catch、没有 deadline 的 `await Promise.all(disposers)`——一个挂住的 disposer 就挂住 reload。DSH 走得更远，把义务放在 tool 作者身上：异步工作必须 *「观察或转发 `exec.signal`，并且只在到达『静止』之后才 settle」*，registry 之后再检查取消。那是 Cordis 所缺的 settle 概念，但它写在散文里、什么都不强制，因此忽略自己 signal 的 tool 仍然楔住 unload。

**四个阶段，后两个是两套系统都没有的：**

1. **注销。** 贡献立刻离开 registry。同步、便宜，并且阻止问题继续长大。
2. **发 Signal。** Abort 每一个进行中的调用。
3. **与 deadline 竞速。** Kernel 施加，在每一个 disposer 上。
4. **按结果 settle。** 到期时 registry 用 aborted 结果 resolve *它自己的* promise，并放弃贡献者的，附上 catch 并丢掉引用。Harness 看到一次普通的 aborted 调用，它现有的 `abortedMessage` 路径产生结果。没有新的 settle 机械。

阶段 4 让 deadline 安全，而不是带额外步骤的泄漏：**即使贡献没有 settle，调用也会 settle。**

**分层。** Kernel 知道 facet 和贡献，不知道调用，因此它泛化地约束 disposal：每个 disposer 都有 deadline，超时的被记录并丢掉。带进行中工作的 registry 才让那个 deadline 有意义，因为只有它知道一次调用尚未完成。

Signal 由 **registry 拥有，并从 harness signal 链式下来**，永远不是 harness signal 本身——因此注销一个 tool abort 该 tool 的调用，而不取消操作。DSH 关于 *「替换无法分离调用者取消」* 的警告说的正是这个；链必须是单向的。

**调用跟踪属于 registry，不属于贡献者。** Facet 可以跟踪自己未完成的调用并对它们发 signal，但那样一个有 bug 或敌对的 facet 就完全没有边界。每一次调用已经经过 registry，因此它可以持有 signal 和计数而不信任任何人。

**Deadline 实际保证的东西，诚实陈述：** disposal 在有界时间内完成，之后 kernel 不持有引用。**不是** bundle 被收集。如果被放弃的贡献有一个活着的 interval、一个打开的 socket，或一个未完成的子进程，它自己的异步工作仍然引用闭包，compartment 继续活着。我们可以约束我们的保留；我们不能约束 runtime 的。唯一真正的修复是进程隔离，teardown 就是 kill——这就是为什么 Erlang supervisor 终止而不是协商，以及为什么 OSGi `refresh` 会在一个不肯停的 bundle 上挂住。

## 14. 隔离与信任 {#14-isolation-and-trust}

浓缩过；完整处理在 isolation spec 里。记在这里，是因为它约束上面的 API 表面。

### 14.1 威胁模型 {#141-threat-model}

**恶意 server 把一个 facet 运到毫无防备的客户端。**

§7 声明 presentation 交付时没有任何插件 facet，并且它们全部以构建好的 bundle 经线路到达。因此第三方代码按设计在用户进程中执行，而连接到 server 并不是同意运行它的代码。受害者是 *用户*，带着他们的文件系统、他们的凭据、他们的 SSH key——不是运营者。

更早的草稿把范围限定为「粗心的插件作者，不是敌对的」，并把有决心的攻击者明确排除在外。**那是错的**，并且选错了机制。攻击者是敌对的，投递是远程的，目标是工作站。

**可用性不在范围内。** 恶意 server 已经可以拒绝服务、挂起或发送垃圾；把客户端弄崩溃是那件事的子集。必须阻止的是 **磁盘访问和数据外泄**。

这种不对称决定了下面几件事，也是本节比一般沙箱论述更短的原因。

### 14.2 机制：仅字符串 membrane 后面的 V8 isolate {#142-mechanism-a-v8-isolate-behind-a-string-only-membrane}

Facet 代码运行在 `isolated-vm` isolate 里。测得的行为，不是推断——见 sandbox PoC：

```
require / process / fetch     undefined
globals visible               64
Function("return process")()  undefined
spinning guest                interrupted at its timeout, isolate reusable after
```

**被拒绝的东西，以及为什么。**

*SES / `lockdown()`* — 更早的草稿选了这个。它硬化 intrinsic，但把 guest 和 host 留在 **同一个 VM** 里，而这恰恰是 Figma 的 Realms shim 失败的那一类：「把沙箱外的对象与沙箱内的对象搞混……之所以可能，是因为 shim 对内外所有代码使用同一个 JavaScript VM」。Figma 发布了 Realms，两个月内被突破，然后换到不同的 VM。选择 SES 是在重复他们的第一次尝试。

*Node `worker_threads`* — `terminate()` 是真正的 kill（紧循环上 3 ms），但 worker 有完整的 `fs`、`env` 和 `child_process`。Node 的 `--permission` 模型确实在 worker 内适用，但 Node 把它文档成 **「安全带」**，「恶意代码可以绕过」，并且它不按 worker 继承。没有权威的可用性，对这个威胁模型是错误的那一半。

*Deno workers* — `permissions: "none"` 给出真正的每 worker 权威削减，已验证。但 `terminate()` **并不** 停止一个空转的 worker：terminate 之后测得 3 s 墙上时间里 2990 ms CPU。而且这是一次 runtime 切换。

*QuickJS-WASM* — 真正不同的 VM，因此对象混淆不可能，这也是 Figma 实际采用的。因两项测量被拒绝：**慢 8–17×**（300 个 markdown component 重绘 1118 ms vs 108 ms），以及 **没有 `Intl`**，而 `packages/tui` 在每一次宽度计算里都需要它做字素切分。如果原生 addon 不可接受，它仍是后备。

*ShadowRealm* — 同一线程、同一 VM，而且它自己的 explainer 否认自己是「针对安全问题的全谱机制」。对这个目的不是继任者。

**让 `isolated-vm` 安全的是 membrane，而且它是结构性的。**

`isolated-vm` 可以被用得不安全，更早的草稿正因此拒绝它：通过 `derefInto()` 把活句柄交给 guest，或从 host 调用返回一个 `Reference`，会让 guest 沿着该对象的原型链走进 host realm。（草稿还把这个项目称为「maintenance mode」——那已经过时；发版从 2025 年 7 月的 6.0.1 持续到 2026 年 8 月的 7.0.1。）

Membrane 从构造上而不是靠小心把它堵死：

1. `encode()` 是从 host 到 guest 的唯一路径，它是带 replacer 的 `JSON.stringify`。**输出是字符串。** 字符串无法携带引用。
2. Host 可调用对象从不穿越。它们变成 host 侧表里的整数 id。Guest 收到一个 **number**。
3. 到达 guest 的 `Reference` **恰好一个**——唯一的 call-in 入口——并且它的 `deref()` 跨 isolate 抛错。
4. `derefInto()` 用一次，作用在 guest **自己的** global 上。永远不会把 host 对象当作它的参数。

Guest 对 host 的全部视图就是 `{ number, string }`。没有对象图，因此没有可走的东西。已审计：`deref`、`copySync` 和 `getSync` 全部被挡住；`derefInto()` 产生一个惰性标记，不可调用，也不暴露 host global。

**一个 isolate，N 个 context** — 不是每个 facet 一个 isolate。Context 给出分开的 global，一个 context 上的 timeout 让其他的继续跑。它们共享一个 `memoryLimit`，因此一个 facet 的分配炸弹会 dispose 该 isolate 以及其中每一个 context——在这里无所谓，因为可用性不在范围内（§14.1）。成本差别是真的：**每个 context 164 KB vs 每个 isolate 1124 KB**。

必须在邻居面前存活的 facet——作为 facet 运行的宿主 chrome——拿自己的 isolate。那是每 facet 的决定，不是全局的。

**值得知道的限制。**

- **预算不会嵌套。** Timeout 约束一次求值。被 *host* 再进入的 guest 函数——贡献的 callback、component 方法——拿到自己的预算，而不是外层的。要约束 facet 总时间需要单独记账。
- **引用会释放，但是惰性的。** Membrane 用 `WeakRef` 加 `FinalizationRegistry` 按 id intern，这既给出穿越后的 identity，也在收集时释放。Finalization 并不及时，因此 **不要在热路径上创建引用**：在 construct 时注册的 factory 是一个引用直到永远；component 方法每帧返回一个新闭包则是每帧一个。
- **原生 addon。** Prebuild 只覆盖 Node 22 和 24 的 linux-x64/arm64、darwin-arm64 和 win32-x64；其他任何东西都回退到需要 Python 和工具链的源码构建。发布 SEA 构建把这个问题从每个用户的安装挪到 CI。
- **仍然是一个引擎。** 单独的 isolate 是比 SES 强得多的边界，但它不是 Figma 的「不同 VM」主张。这里的保证是 V8 的 isolate 边界加上 membrane 的纪律。

### 14.3 Ambient authority 击败「注册即所有权」 {#143-ambient-authority-defeats-registration-is-ownership}

§13 声明 facet 收到的每个句柄都是宿主构建的 binding，自己注册 disposer，因此没有要记住的东西。那对宿主 *交出去* 的句柄成立。它对 facet **没有** 被交给任何东西就能触及的权威什么都不说：`setInterval`、`process.on`、`document.addEventListener`、一个 WebSocket。

注册即所有权是 API 表面的属性，它只有在表面是排他的时候才完整。当 facet 有另一条路到达外部世界时，disposal 又回到作者纪律——这正是 §13.1 批评 Cordis 的立场（*「不要假设 unload 会自动移除任意第三方 callback」*）。

我们能把它做到多完整 **并不均匀**，假装否则会是错误种类的整齐。

**Session 和 server facet：可关闭，而这论证了 compartment。** 它们今天在带完整 ambient authority 的 Node 里运行——facet 可以 `import` timer、`fs`、`net`。在没有模块访问的 compartment 里，唯一的 global 是我们 endow 的那些，因此一个自己注册 disposer 的被 endow 的 `setTimeout` 就是 *唯一的* `setTimeout`。那是把上面那个未决问题朝向给 session facet 做 compartment 的真正论据，基于人体工学而不是基于信任。

**TUI：出于同一原因可关闭。** Presentation facet 已经得到一个 compartment（§14.2），并且只通过 `TuiHost` facade 到达终端。没有可抓取的 ambient 终端。用同样方式 endow timer，表面就是排他的。

**Web：不可关闭，值得明确说为什么。** DOM 是从 *其中任何一个节点* 都能到达的 ambient 可变图。把一个元素交给 component，它就有 `ownerDocument`、`parentNode`、`window`——从那里再有 `addEventListener`、`MutationObserver`、一个比它的 mount 活得更久的分离子树。`lockdown()` 帮不上忙：逃生口不是原型，而是我们故意交出去的活对象图。

有两种机制真正能关掉它，两者的代价都超过问题目前的价值：

- **每个 facet 一个 iframe。** 真正的隔离、`postMessage` 边界，teardown 就是移除 frame。VS Code 对 webview 这样做。代价是没有共享 DOM：样式、布局和焦点都变成协议。

  Figma 走得更远，值得研究，因为它是「让表面排他」的最强形式。他们按 *能力* 分裂：插件逻辑运行在完全 **没有浏览器 API** 的 QuickJS-on-WASM 里，带着 scene graph，而 UI 运行在有浏览器 API、**没有 scene 访问** 的 iframe 里，由 `postMessage` 连接。插件代码从不触及 DOM——不是「沙箱化的 DOM 访问」，环境里没有 `document`。那才让他们能保证清理。

  从他们的历史里要拿走两件事。他们先发布了 **Realms**，并且两个月内被发现不安全，而这正是 §14.2 拒绝 `isolated-vm` 时所引用的同一类逃逸——生产证据而不是推断。而且 QuickJS 的代价是真的：实践者报告 *「真正无法穿透的错误」* 以及严重退化的调试体验，§14.2 在把 QuickJS 命名为升级路径时应当权衡这一点。正如有人说的，沙箱是一件 *「人人都想要，但真正做成过的例子少之又少」* 的事。
- **只声明式的 component。** Facet 从不收到节点——它返回一份描述，由宿主 reconcile。§11.1 已经指向这个方向（*「props 是 DTO；factory 从不收到 `TUI` 或 `Theme` 实例」*），把它扩展到 *从不收到 DOM 节点* 也站得住。但它排除了 ref，因此排除了大多数值得使用的组件框架。

**所以规则是：让安全路径成为容易路径，并且不要假装逃逸已经关闭。**

提供自己注册 disposer 的 `ctx.dom.on(el, event, fn)` 和 `ctx.timer.every(ms, fn)`，并让它们成为做这件事的显而易见的方式。§14.1 的威胁模型是 *粗心的* 作者，不是敌对的，而粗心作者会走符合人体工学的路径。逃逸仍然可达；它只是不是你会掉进去的那一条。

在表面可以被做成排他的地方——session、server、TUI——用 endowment 强制，而不是依赖人体工学。在不能的地方——web——写明 facet 作者拥有自己的 DOM 清理，并且如果威胁模型从粗心移到敌对，把 iframe 当作升级路径。

这与 §14.2 的 isolate 决定是同一形状：采用适合当前威胁模型的机制，点名更强的那个，并记录什么会触发迁过去。

### 14.4 对 API 的后果 {#144-consequences-for-the-api}

隔离不改变 §3–§4 里的形状，但它固定三件否则只会是惯例的事：

- **所有权是隐式的。** Facet 收到的每个句柄都是宿主构建的 binding，自己注册 disposer。因此没有 `own()`，而 `subscribe()` / `on()` 什么都不返回——没有 unsubscribe 句柄可持有，因此也没有可泄漏的。本地 `{ rpc: false }` service 是例外：它们交回原始实现，没有拦截，也没有自动 disposal。
- **Binding 返回的每个对象本身也是 binding** — 宿主构建、普通原型、已硬化、自己注册 disposer。这是让上一点传递成立的不变量。
- **借来的不可变 JSON 是被强制的，不是被建议的。** 值在穿越边界时被硬化，未冻结则被拒绝，因此 §9 的不克隆规则是安全的，而不是一份写下来的希望。

  这 **不** 延伸到副本的内部缓冲。`delta.md` 的 `apply` 原地变更普通对象，对着冻结对象会抛，因此宿主保持副本可变，只硬化它通过 `State.value` 交给 facet 的那个值。冻结发生在 binding，而不是缓冲。同一规则支配生产者侧：tracker 代理一个可变对象，并硬化它暴露出去的东西。

Facet 用编译成 generator 的 `await` 构建，因此宿主拥有恢复。Disposal 然后停止三件互不包含的事：取消 scope 的根 context（停止 **操作**），解开 driver（停止 **continuation**，运行每一个 `finally` 且不运行 `catch`），然后按逆序释放注册（停止 **effects**）。

Endowment 是最小的：`Date` 和 `Math` 被换成由时钟支撑的版本，timer 返回不透明整数并由 scope 拥有，`process` 和 `console` 是仅形状的 stub，而 `fetch`、`Buffer`、`require` 和 `process.exit` 从不被 endow。**网络访问是 binding，永远不是 endowment。**

## 15. 协议：把 service 暴露给外部客户端 {#15-protocol-exposing-services-to-foreign-clients}

上面的一切都假设两端是对着同一批 token 编译的 TypeScript。浏览器、脚本或另一种语言做不到——它需要一份可以 fetch 的描述。

**Schema 是 opt-in 且按 service 的。** 大多数插件从不暴露任何东西，也什么都不付。没有 `protocol` 块的 service 只是进程内和原生 RPC：它不在 catalogue 里，HTTP router 返回 `no_such_member`。

### 15.1 声明协议 {#151-declaring-a-protocol}

```ts
import { object, array, string, int, oneOf, literal } from "@pi/schema";

export const TranscriptEntry = object({
  id: string(),
  role: oneOf([literal("user"), literal("assistant")]),
  text: string(),
});
export type TranscriptEntry = Static<typeof TranscriptEntry>;

export const TranscriptState = defineState<TranscriptTail>("pi.transcript.tail", {
  schema: object({ entries: array(TranscriptEntry) }),
});

export interface Transcript {
  readonly tail: State<TranscriptTail>;
  page(params: { before: string; limit: number }, context: Context): Promise<TranscriptEntry[]>;
  subscribeRaw(sink: (e: TranscriptEntry) => void): Unsubscribe;
}

export const Transcript = defineService<Transcript>("pi.transcript", {
  protocol: {
    methods: { page: { params: object({ before: string(), limit: int() }),
                       result: array(TranscriptEntry) } },
    state:   { tail: TranscriptState },
  },
});
```

`page` 和 `tail` 被发布。`subscribeRaw` 不在 `protocol` 里，因此它是本地的——什么都不标记它，稍后发布它意味着加一个条目。

只有状态 **值** 需要 schema，为了根 `r` batch。Mutation 不需要，因为 recipe 从不离开 provider（§9.2），而 op 是结构的。

方法参数是单个对象，不是位置参数。名字于是存活进 TypeScript 签名、作为 `properties` 进 JSON Schema、进请求体，并且加一个可选字段不改变 arity。

`@pi/schema` 把 TypeBox 构造器作为自由函数再导出，好让声明保持可读。它们是函数而不是常量，因为 TypeBox schema 是可变对象，共享常量会 alias 进每一个引用它的 schema。

### 15.2 协议必须匹配类型 {#152-the-protocol-must-match-the-type}

从接口漂移的 schema 正是本设计存在要防止的失败，因此它被检查，采用与 `CheckComplete`（§4）相同的相互可赋值技术：

- `protocol.methods` 里的每一个 key 必须存在于 service 接口上——拼写错误是编译错误，而不是默默未发布的成员；
- 对每一个，`(params: Static<P>, context: Context) => Promise<Static<R>>` 必须可赋值给接口成员，反之亦然；
- `protocol.state` 里的每一个 key 必须是 `State<T>` 成员，其 `T` 匹配定义的值 schema。

省略永远合法。省略就是特性。

### 15.3 路由 {#153-routes}

```
GET  /v1/catalogue
POST /v1/call/{service}/{member}
POST /v1/call/{service}/{key}/{member}          keyed 实例
GET  /v1/state/{service}/{member}               SSE
GET  /v1/state/{service}/{key}/{member}         SSE
```

`peer` service 不带 key：server 从已认证 session 解析实例，因此客户端不能寻址另一个 peer 的（§10.2）。

**Catalogue**

```json
{ "version": "1",
  "services": {
    "pi.transcript": {
      "mode": "singleton",
      "methods": { "page": { "params": { "$ref": "#/definitions/PageParams" },
                             "result": { "type": "array",
                                         "items": { "$ref": "#/definitions/TranscriptEntry" } } } },
      "state": { "tail": { "value": { "$ref": "#/definitions/TranscriptTail" } } }
    }
  },
  "definitions": { "TranscriptEntry": { "type": "object", "properties": { "...": {} } } } }
```

**Call**

```
POST /v1/call/pi.transcript/page
{ "before": "entry_88", "limit": 50 }

200 { "result": [ { "id": "entry_87", "role": "assistant", "text": "..." } ] }
403 { "code": "forbidden", "message": "unknown root" }
404 { "code": "no_such_member" }            ← 未发布成员落在这里
422 { "code": "invalid_params", "message": "limit: expected integer" }
```

**经 SSE 的状态**

```
GET /v1/state/pi.lane/main/snapshot
Accept: text/event-stream
id: 0
event: ops
data: [["r",{"lane":"main","transcript":[],"operation":null}]]

id: 1
event: ops
data: [["p",["transcript"],12,0,[{"id":"e12"}]]]

id: 2
event: ops
data: [["a",["operation","streamingMessage","content",0,"text"],"Sure, I"]]
```

`id` 由 binding 盖章，不携带在 payload 里。第一个 batch 永远是 base batch，因此 hydrate 不是单独的路由。`Last-Event-ID` **不被** 遵守：`seq` 每次订阅重启，重新订阅是一个 base batch 加上缓冲的 batch（§9.2）；缺口、未知 id 和 provider reload 都走同一条路。关闭的 keyed 实例以 `event: closed` 结束流，客户端不重试。

外部客户端只需要 [delta.md §2](../../01-harness/01-delta/delta.md#2-ops) 的六个 op——`replace`、`set`、`delete`、`append`、`truncate`、`splice`。没有 mutation 名，没有 recipe，没有 provider 代码。Applier 在任何语言里都是一页代码。

**这就是非符合变得可见的地方**，也是唯一值得对此刻意的地方。格式是 JSON-Patch-*形状*，不是 RFC 6902：路径是数组而不是字符串 pointer，而 `append`、`truncate` 和 `splice` 没有 RFC 等价物。伸手去拿现成 `jsonpatch` 库的客户端不会工作。

两项缓解，哪一项都不是「符合」：

- Catalogue 显式广告 op 词汇，因此客户端发现这六个动词，而不是假设另一套词汇。
- 如果客户端真正需要 RFC 6902，server 可以在内容协商头后面提供有损降级——用斜杠连接路径并做 `~0` / `~1` 转义，把 `append` 和 `truncate` 物化成整值 `replace`，把 `splice` 展开成 `add` / `remove` 序列。大约十五行。它重新引入二次方文本代价，而这正是要点：符合是可用的，并且是客户端在为它付钱。

默认符合会把那个代价加在每一个消费者头上，只为服务一个假想的，甚至买不到真正的互操作，因为 Immer 的输出也从来不符合（§9.2）。

### 15.4 发布让你承诺什么 {#154-what-publishing-commits-you-to}

Catalogue 里的成员是兼容性承诺，内部 token 不是那种方式。成员从一开始就应携带稳定性标记，这样发布并不默默意味着冻结，而 §16 把版本协商列为未解决。

## 16. 相对 `plugins.md` 的差异 {#16-deltas-against-pluginsmd}

| 主题 | `plugins.md` | 这里 |
| --- | --- | --- |
| 依赖声明 | 从 `setup()` 副作用推导 | 静态 `uses` / `provides` / `observes` |
| setup 期间的句柄 | 断开的惰性 proxy | 校验之后的真正对象 |
| 校验 | 需要运行 facet 代码 | 纯 manifest 分析 |
| mode | 按调用点声明，再校验 | token 的属性 |
| 环 | 经由惰性被容忍 | 拒绝；显式 `deferred()` 逃生口 |
| 复制 | `ReplicatedState` 全值；`DeltaState` 推迟 | 一个原语；显式根 `r` + 六动词 op |
| hydrate | 分开的原子快照 + 缓冲 | 流的 base batch zero |
| presentation facet | 本地加载 | 由 server 和 worker 投递 |
| server↔worker | 未指定的倒置 | reporting registry；依赖指向上游 |
| 权威 | 方法体里的 `requireClientIdentity` | 上下文上的 principal；过滤视图 + handle 检查 |
| 每客户端状态 | 未处理 | `peer` mode：每个 peer 一个实例，作为 singleton 消费 |
| 资源所有权 | 显式 `own()` | 隐式；每个句柄都是自 dispose 的 binding |
| 状态更新 | 手写 patch union | provider 上普通 mutation；线路上六动词 op |
| UI mount | facet 拥有的 panel，未指定的宿主 API | 带 `claim` / `add` 的 slot；宿主在 disposal 时 unmount |
| 隔离 | 受信任代码，未指定 | 每个 presentation facet 一个 SES compartment |
| 外部客户端 | 未处理 | opt-in `protocol` 块；JSON Schema catalogue + HTTP/SSE |
| 生命周期 | 只有 `setup` | 同步 `construct`，异步 activate / deactivate |

## 17. 未决决定 {#17-open-decisions}

- cwd 来源的 *session* facet 是否也需要 compartment（§14.2）。
- `CheckComplete` 错误信息人体工学。
- 角色从哪里来，以及它们是每 server 还是每 session。
- Handle 表是 facet 拥有的，还是 kernel 提供的工具。
- Owner 如何在运行时授予和撤销 guest 访问。
- 协议版本协商，以及状态值定义的 reducer 如何参与源 generation 偏移（§9.2）。
- 高频状态值的流控；缺口恢复已经敲定（§9.2）。
- 发现启动之后创建的 lane（§9.2）。
- `reduceLaneSnapshot` 是现在还是以后变成 draft mutator；在它变成之前，lane 状态只做 replace。
- `deferred()` 能否经受与真实插件的接触，还是应当移除。
- Tracker 的性质测试（`delta.md` §3.3），在任何 facet 依赖它之前。
- 哪些持久值需要显式的周期性 `rebase()` 节奏，以约束恢复工作。


