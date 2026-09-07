本文是 `README.md` 的中文阅读版；命令、路径、API 名称保持英文。

# Facet 沙箱 — isolated-vm {#facet-sandbox--isolated-vm}

**未经修改的 pi facet 代码，运行在没有任何 ambient authority 的 V8 isolate 中。**
完整 JIT，因此大约是 native 的 1.8×，而不是 WASM 解释器那种 8–17× 的代价。

```bash
npm install
npm run demo     # 一个 facet：contributions、components、commands、callbacks
npm run audit    # 逃逸审计——真正有意思的那个
npm run bench    # 穿越成本、isolate 成本、300 个 component
npm test         # 412 条性质断言
```

Node 22+（`--experimental-strip-types`）。QuickJS-WASM 对等实现见 `../facet-sandbox-poc`。

## 安全主张，以及为何它是结构性的 {#the-safety-claim-and-why-it-is-structural}

isolated-vm **可以**被用得不安全，而这正是 `facets.md` §14.2 所反对的。踩坑点是把指向 host 对象的活句柄交给 guest——通过 `derefInto()`，或从 host 调用返回一个 `Reference`——之后 guest 就能沿着该对象的原型链走进 host realm。

这层 membrane 让这种事 **从构造上不可能，而不是靠小心**：

1. `encode()` 是 host 值到达 guest 的唯一途径，它是带 replacer 的 `JSON.stringify`。**输出是字符串。** 字符串无法携带引用。
2. Host 可调用对象从不穿越。它们变成 `hostTable` 里的整数 id，而 `hostTable` 完全活在 host 侧。Guest 收到的是一个 **number**。
3. 交给 guest 的 `Reference` **恰好只有一个**——`__invokeRef`，唯一的 call-in 入口。
4. `derefInto()` 恰好用了一次，作用在 guest **自己的** global 上。永远不会把 host 对象当作它的参数。

Guest 对 host 的全部视图就是 `{ number, string }`。没有对象图，因此没有可走的东西。

### 审计结果（`npm run audit`） {#audit-results-npm-run-audit}

```
Ambient authority:
  require / process / fetch          ["undefined","undefined","undefined"]
  global names visible               64 globals

Classic escape ladders:
  Function('return process')()       undefined
  constructor walk on host data      undefined

The isolated-vm Reference footgun:
  __invokeRef.deref()                blocked: TypeError   ("Cannot dereference
                                     this from current isolate")
  __invokeRef.copySync()             blocked: TypeError
  __invokeRef.getSync('constructor') blocked: TypeError
  derefInto() is callable?           inert (object)
  invoke derefInto() result          blocked: TypeError
  host globals via derefInto()       no host globals

Resource bounds:
  spinning guest interrupted         after 205ms
  isolate usable afterwards          true
```

初稿里有一次探测给出了 **假阳性**：用 `f.deref === undefined` 来证明返回的 host 函数是 Proxy 而不是 Reference。Membrane 的 proxy 对 *每一个* 属性都返回 proxy，所以 `f.deref` 是 truthy。这不是泄漏——调用它会路由到 `hostFn["deref"]`，该属性不存在，于是在 host 侧抛错。审计现在会真正调用它，而不是检查它是否缺失。

## 性能 {#performance}

| | isolated-vm | QuickJS | native |
| --- | --- | --- | --- |
| 300 个 markdown component，小 | **70 ms** | 494 ms | ~40 ms |
| 300 个 markdown component，典型 | **108 ms** | 1118 ms | 64 ms |
| 300 个 markdown component，大 | **419 ms** | 4260 ms | ~150 ms |
| 146 KB bundle 加载 | **35 ms** | 104 ms | — |
| membrane 穿越 | **4.5 µs** | 7–17 µs | — |
| 每个 compartment | 1080 KB，5.5 ms | **77 KB，0.8 ms** | — |

**典型尺寸下大约是 native 的 1.8×。** QuickJS 是 8–17×，并且随输入变大而更差。

Isolate 的内存成本是 QuickJS runtime 的 **14×**（1080 KB vs 77 KB），创建也更慢。对少数几个 facet 这无所谓；对几百个就不行。

`Intl.Segmenter` **在这里存在**，而这正是在 QuickJS 下复用 `packages/tui` 组件的那个硬阻塞点。单凭这一点就可能决定选择。

## 限制 {#limitations}

**预算不会嵌套。** timeout 约束的是一次 `evalSync`。被 *host* 再进入的 guest 函数——贡献的 callback、component 方法——拿到的是 `callGuestRef` 自己的预算，而不是外层的。在 `property-test.ts` 里显式断言过；一个失控 callback 在外层预算 50 ms 下跑了 5005 ms。要约束 facet 的总时间需要单独记账。

**Async 是 settle-callback，不是原生 promise。** `applySync` 是同步的，因此 host Promise 无法穿越。Host 返回一个 token，guest 据此构造真正的 Promise，host 再通过回调进去 settle。已验证：两次顺序的 guest `await` 期间，host 事件循环走了 22 次。

**原生 addon，而且 ABI 矩阵是真问题。** `isolated-vm` 带 prebuild，只有对不上时才回退到 `node-gyp rebuild`——所以安装要一秒，而不是一小时。它 **并没有** 在编译 V8；V8 已经在 Node 二进制里。但覆盖面很窄：

| version | engines | prebuilds |
| --- | --- | --- |
| **6.2.0** | `>=22.0.0` | linux-x64/arm64, darwin-arm64, win32-x64 — abi127, abi137 |
| 7.0.1 | `>=24.0.0` | — |
| 7.0.0 | `>=26.0.0` | — |

darwin-**x64** 到处都没有。在 Node 22 上安装 `isolated-vm@7` 会落到源码构建，并且 **没有 Python 和 C++ 工具链就会失败**——这里验证过。另外注意 6.2.0 尽管已有 7.0.1，在 npm 上仍是 `latest`，因为它晚一天发布。

这个项目 **不是 abandonware**——从 6.0.1（2025 年 7 月）到 7.0.1（2026 年 8 月），仍在积极发版。§14.2 的「maintenance mode」说法已经过时，应当更正。真正的风险不同：采用它会把你的最低 Node 版本绑到他们的版本上，而他们在一年内就在 6.x 丢掉了 Node 20、在 7.x 丢掉了 Node 22。发布 SEA 构建可以把这个问题从每个用户的安装挪到你的 CI。

**内存：引用会释放，但是惰性的。** 从 QuickJS membrane 原样移植的 `WeakRef` + `FinalizationRegistry` intern 表是有效的——20 000 次穿越后 **活引用为 0**。但 finalization 并不及时：强制 GC 后 200 ms，仍有 5 000 个引用活着。在持续 churn 下，引用积累比收集器回收更快，32 MB 的 isolate 确实撞过上限。

后果是一条 API 规则，而不是 membrane 的修复：**不要在热路径上创建引用。** 构造时 `slots.claim(factory)` 是一个引用直到永远；component 方法每帧返回一个新闭包则是每帧一个。

**撞上 `memoryLimit` 会干净地杀死该 facet。** 它抛出一个可捕获的 `"Isolate was disposed during execution due to memory limit"`，host 仍然存活——但 isolate 已经死了且不可恢复，因此 teardown 必须容忍已经 disposed 的 isolate。对它调用 `dispose()` 会抛 `"Isolate is already disposed"`；membrane 对此做了防护。

> **不要在受压的 isolate 上调用 `isolate.getHeapStatisticsSync()`。** 测试期间它 **直接 abort 了整个进程**——硬崩溃，不是异常。`heapMB()` helper 因此从 membrane 里删掉了，而没有随之一起发布。

**仍然是一个进程、一个引擎。** 单独的 isolate 是比 SES 强得多的边界，但 Figma 选择 QuickJS 的论据是 *不同的 VM* 无法混淆对象，因为表示不同。这里的保证是 V8 的 isolate 边界加上 membrane 的纪律——很强，并且如上所述被结构性强制，但不是同一类主张。

## 文件 {#files}

- `src/membrane.ts` — membrane。安全论证写在文件头注释里。
- `src/facet-example.js` — 未经修改的 facet 代码：`ctx.use()`、带闭包的 `slots.claim()`、返回给 host 的 class 实例、subscribe callback。
- `src/demo-facet.ts` — 加载它并演练四次边界穿越。
- `src/escape-audit.ts` — 上面的审计。
- `src/property-test.ts` — 412 条断言：随机 `JsonValue` 双向 round-trip、穿越后的 identity、可调用对象、错误传播、GC 下的引用释放、双向 prototype pollution、预算、async、disposal。
- `src/bench.ts` — 上面的数字。
- `src/markdown-bundle.js` — 真正的 pi `Markdown` 组件，经 esbuild 打包。
