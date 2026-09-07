本文是 `README.md` 的中文阅读版；命令、路径、API 名称保持英文。

# @earendil-works/chord {#earendil-workschord}

Chord 是一套面向由插件/扩展组装而成的系统的应用组合运行时。它提供 facet、service、可复制状态，以及可插拔的远程服务边界。它作为独立包在 Pi monorepo 中开发，但不是 Pi 包：它不依赖任何其他 Pi workspace 包，也可以被无关应用使用。

## Chord 的用途 {#what-chord-is-for}

同一个应用功能可能需要在多种环境中运行：例如 agent worker、终端 UI，以及远程 WebUI。Chord 提供通用机制，让这类扩展既能让人愉快地编写，也能让 agent 愉快地编写。

设计由若干相互关联的部分组成：

- **Plugins** 是同步的装配单元，声明它们提供和需要的服务。每个插件都声明完自己的形态后，host 会校验完整依赖图、绑定服务、在消费者之前激活提供者，并按依赖的反序释放资源。这些单元称为 *facets*。

- **Facets** 是 plugin 的组成部分。每个 facet 单独打包，并在它应当运行的进程或环境中运行。你可以用 facet 把一个 plugin 拆成需要加载到不同进程和环境中的独立片段（例如 backend、browser、TUI 等）。

- **Services** 是带类型、稳定的 token，要么只有一个提供者（**singleton**），要么是动态按键实例（**keyed**）。服务可以是进程本地的、带无限制的 JavaScript 契约，也可以远程暴露。当提供者断开或被替换时，消费者仍保留稳定的 facade。

- **Replicated state** 把权威状态暴露给本地和远程已连接的消费者。生产者变更被跟踪的 `state` 代理并调用 `publish(context)`；消费者收到完整的不可变值。Chord 每次发布刷新一批已解码的操作，而每个远程 client/state 流拥有独立的 path-codec 状态。副本在断开或替换后变为未就绪，直到重新 hydrate。

- **Delta tracking** 在 flush 时从被跟踪的纯 JSON 推导紧凑操作。它在不保留变更历史的情况下保留字符串追加/前端截断以及数组追加行为，支持持久的 base batch，并在应用不可信操作时进行校验。

- **Remote service sources** 通告 facet host 之外可用的服务，并为其 facet 所需的服务打开 binding。Binding 通过应用提供的 adapter 承载逻辑调用和订阅。Chord 要求参数、结果、快照、更新和目录为 strict-JSON，但不规定 framing、routing、transport 或应用层的 wire envelope。`JsonRepresentation<T>` 为带未知 payload 的应用数据推导出适合上线的类型，而 `isJsonValue()` 在 adapter 边界校验收到的值。对称 RPC peer 计划作为该边界的一种可选实现。

- **Context** Chord 提供类似 Go 的 context 系统，用于取消以及按调用作用域携带应用值。应用可以通过这些值传递权限或 telemetry，而 Chord 本身不依赖其中任何一项。

当前运行时从 `@earendil-works/chord` 导出 service token、singleton 与 keyed provider、remote binding、replicated state、facet host 以及 facet loader。公共类型和通用运行时 API 从包根导入。Context 常量和函数位于 `@earendil-works/chord/context`，因为它们的通用名称不应污染根 API。
Chord 自有标识符使用 `chord.*` 命名空间，其保留的服务前缀是 `$chord.*`。

## 远程服务 adapter {#remote-service-adapters}

Chord 拥有与传输无关的服务 wire grammar。消费者 adapter 使用 `createServiceCatalogueCall()`、`createServiceSubscribeCall()` 和 `createServiceUnsubscribeCall()` 处理 `$chord.service` 控制调用。
`createRemoteServiceEndpoint()` 为一个 provider consumer 处理这些调用，包括订阅激活与清理。`parseServiceCall()`、`parseServiceCatalogue()` 以及 decoded/wire 的 snapshot 和 update parser 在 adapter 建立 strict-JSON 边界之后校验 Chord 语义。`RemoteServiceErrorCode` 和 `REMOTE_SERVICE_ERROR_CODES` 定义可能跨越该边界的服务错误。

可复制状态操作在 provider 侧使用一个 `createServiceStateEncoder()`，在 consumer 侧为每个订阅使用一个 `createServiceStateDecoder()`。这些 registry 为每个 instance/member state 创建独立的 Delta path dictionary，并在替换、不可用、关闭或全新 hydrate 时重置。应用可以把这些值放入任意 routing、request、response 或 event envelope；Chord 不规定该外层协议。

## 跟踪 JSON delta {#tracking-json-deltas}

从 `@earendil-works/chord/delta` 导入独立的 delta 原语：

```ts
import { apply, track } from "@earendil-works/chord/delta";

const changes = track({ output: "", count: 0 });
changes.flush(); // 打开的 base batch
changes.state.output += "done\n";
changes.state.count += 1;

const ops = changes.flush();
const replica = apply({ output: "", count: 0 }, ops);
```

第一次 flush 始终是完整的 base batch。之后的 flush 包含基于 path 的变更。`applyImmutable()` 在应用这些 batch 的同时保留先前的 replica revision。`replicatedState(initial)` 直接使用 tracking：

```ts
const status = env.replicatedState({ output: "", count: 0 });
status.state.output += "done\n";
status.state.count += 1;
status.publish(context);
```

`publish()` 刷新一次；远程连接管道为每个 client/state 配对独立编码该操作 batch。字符串赋值会把纯追加和滚动窗口移动保留为 append 与 front-truncate 操作；无关的重写回退为 set。插入到被跟踪状态中的值归 tracker 所有，此后只能通过 `state` 变更。关于 mutation、array、lifecycle 以及 consumer-ownership 规则，见 [Delta guide](src/delta/README.md)。

## 打包与加载 facet {#bundling-and-loading-facets}

`@earendil-works/chord/bundler` 使用 esbuild 把 ESM 或 TypeScript 应用入口变成独立的、内容寻址的 CommonJS 文件。包级 API 从 `package.json` 读取 plugin 身份和构建配置，然后应用宿主应用提供的 facet 路径约定：

```json
{
  "name": "@example/my-plugin",
  "version": "1.0.0",
  "type": "module",
  "peerDependencies": {
    "@earendil-works/chord": "^0.84.4"
  },
  "chord": {
    "facets": {
      "worker": "./src/custom-worker.ts",
      "presentation": false
    }
  }
}
```

```ts
import { bundleFacetPackage } from "@earendil-works/chord/bundler";

await bundleFacetPackage({
	packagePath: "/path/to/my-plugin",
	outdir: "/application-owned/plugin-builds/my-plugin",
	defaultFacets: {
		worker: "src/worker.ts",
		presentation: "src/presentation.ts",
	},
});
```

已有的约定文件会成为入口，除非 `chord.facets` 覆盖或禁用它们。Peer dependency 会被 externalize，并在加载时相对 host 解析。Chord 从不安装依赖，也不运行包生命周期脚本。`bundleFacets()` 仍作为较低层 API 提供给已经拥有显式 plugin 身份和入口映射的调用方。

输出目录为每个入口包含一个 `.cjs` 文件，外加 `chord-facets.json`。通过仅限 Node 的 loader 加载一个由应用选定的入口：

```ts
import { createFacetBundleLoader } from "@earendil-works/chord/node";

const loader = createFacetBundleLoader({
	manifestPath: "/application-owned/plugin-builds/my-plugin/chord-facets.json",
	entry: "worker",
	resolveExternal: (specifier) => import.meta.resolve(specifier),
});
const loaded = await loader.load();
```

每次 `load()` 都会校验 SHA-256 完整性，并用 `node:vm` 直接编译 CommonJS 主体，而不是把 plugin 放入 Node 的 CommonJS 或 ESM 模块缓存。Externals 由 host 解析，并通过受限的 `require` 加载；esbuild 会降低动态 import，使它们走同一路径。释放已退役的 generation 会丢掉 loader 的 facet 引用，一旦 plugin 自有资源也消失，其编译代码即可被垃圾回收。

为了传输到另一个 Node host，`readFacetBundleArtifact()` 将一个已校验的 manifest 入口与其源码打包，`createFacetBundleArtifactLoader()` 物化全新的临时 generation，同时相对接收方 host 解析 externals。

要重新加载：加载一个候选，把它的 facet 传给 `FacetHost.reload()`，失败时释放候选，并且仅在成功切换后才释放已退役的 `LoadedFacets`。Host 在旧 provider 仍被路由的同时激活并校验候选，然后直接替换每个 singleton，没有不可用间隔。因此稳定的 service handle 在普通 reload 期间不会断开。Keyed instances 仍与 incarnation 绑定，替换会收到新的 generation。Bundler 在替换先前输出之前写入完整的临时目录，因此 loader 不会观察到部分构建的 generation。

更广泛的 RPC 与 generation-loading 架构见 [PLANNING.md](PLANNING.md)。
