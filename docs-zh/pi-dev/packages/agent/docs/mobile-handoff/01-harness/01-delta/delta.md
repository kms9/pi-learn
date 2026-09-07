本文是 `delta.md` 的中文阅读版；命令、路径、API 名称保持英文。

# Delta Tracking 与 Op 词汇 {#delta-tracking-and-the-op-vocabulary}

> **生产状态：** 已落地于 `packages/chord/src/delta/index.ts`，测试在 `packages/chord/test/delta.test.ts`。Chord 拥有无依赖的 `Op`/`WireOp`、tracker、applier、codec 和校验边界；Session 存储、Harness 和 facet 消费它。本文档旁边的实现与测试是历史原型与基准证据，不是生产源码。
>
> 已落地的 tracker 在 `flush()` 时从脏树和 baseline 计算 delta，而不是为每次 mutation 保留一个 op。这解决了 FINDINGS D1。生产重新测量也关闭了 FINDINGS D2：通用字符串路径低于周围复制 / 渲染成本，因此显式 append/truncate API 被否决（[决定](append-decision.md)）。

一种机制覆盖 assistant 增量、工具输出、工具 details、lane 状态，以及任意 facet 状态 — 在线路上和持久化存储中。

```bash
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/delta.test.ts
# run from packages/chord
```

## 1. 为什么不用现有库 {#1-why-not-an-existing-library}

Immer、Valtio、Mutative 和 Colyseus 都**记录效果，而不是意图**。字符串是叶子，因此 `text += chunk` 是对整段新字符串的一次写入；库没有任何表示能知道你做了 append。`unshift` 是同一故事 — 引擎移动每一个下标，因此每一个都是一次写入。

实测，四个都是：

| 操作 | 它们发出什么 |
| --- | --- |
| 在 40 KB 上 `text += "x"` | 携带 40 KB 的 `replace` |
| 在 100 项上 `arr.unshift(x)` | 约 100 次下标写入 |
| `arr.pop()` | 对 `length` path 的一次写入，而那不是文档位置 |

Immer 自己的 pitfalls 页陈述了保证：patches 正确，并且**明确不是最小的**。Colyseus 记录了同样的数组弱点 — 去掉 20 项中的第一项要多花 38 字节。

我们自己对 base 与结果做 diff 也修不好。differ 看到两个值，看不到意图。前缀比较能抓住纯增长，但一个从前面丢掉*并且* append 的滚动窗口既不是旧值的前缀也不是后缀；在 5000 个元素上测得的回退是 `{index: 0, remove: 5000, items: 5000}` — 一次完整替换，恰好发生在优化存在的那个情形。

因此收益不是盲目的整值 differ。tracker 记录哪些 path 和数组操作变脏，然后在 `flush()` 时只把那些子树与已接受的 baseline 比较。

## 2. Ops {#2-ops}

**元组就是形式。到处都是。没有带键的变体。**

```ts
export type Seg = string | number;
export type Path = readonly Seg[];
/** Non-empty: `s`/`d`/`a`/`t` cannot target the root. Enforced by the type. */
export type NonEmptyPath = readonly [Seg, ...Seg[]];

export type Op =
  | readonly ["r", JsonValue]                            // replace the value
  | readonly ["s", NonEmptyPath, JsonValue]              // set
  | readonly ["d", NonEmptyPath]                         // delete
  | readonly ["a", NonEmptyPath, string]                 // append
  | readonly ["t", NonEmptyPath, number]                 // truncate, in chars
  | readonly ["p", Path, number, number, JsonValue[]]    // splice: index, remove, items
```

intern、id 引用和省略的 path **不在这里** — 它们活在 `WireOp` 中，并且只存在于 `encode` 与 `decode` 之间（§4）。

**`r` 是唯一替换整值的 op。** 它是一个 op 而不是一种 frame 种类，理由与 `a` 和 `t` 存在相同：它们是更小、并且陈述意图的 `s` 特化。

不要把替换编码成根 path 上的 set。base-batch 检测是**正确性边界** — 恢复停在那里（§9） — 因此它必须是 token 比较，`ops[0]?.[0] === "r"`，而不是 path 检查。检查 path 的谓词必须处理二元组 arity 形式，其中 `op[1]` 是值而不是 path，并且会把 `["s", []]` 分错类。

**只有 `p` 可以瞄准根**，而且只因为被跟踪的值本身可以是数组 — 根数组上的 `entries.push(x)` 是 `["p", [], 3, 0, [x]]`。覆盖其整个目标的 `p` 在 flush 时被规范化为 `r`（根）或 `s`（嵌套），因此根上的 `p` 永远是部分修改。另外四个动词取 `NonEmptyPath`：`["s", [], v]` 和 `["d", []]` 不能通过类型检查。

**不要增加一种带键的内存形状，再在序列化边界放一个 codec。** 同一事物的两种表示意味着两个 applier、两次大小估计，以及一次没人需要的转换。ops 在内存中、线路上和磁盘上都是元组；可读性是 debug formatter 的事。

六个动词。没有 `move`、`copy` 或 `test`：前两个是我们没有的情形的体积优化，`test` 属于我们没有的冲突模型，因为恰好有一个权威写入者。

`chars` 计 UTF-16 码元，与 `String.prototype.slice` 一致。**不是字节。** 字节 cap 是生产者的关切，从不穿过边界。

格式是 JSON-Patch-*形状*的，并不符合 RFC 6902。这没有成本：RFC 6902 自 2013 年以来没有后继，仍然是同样六个 ops，任何地方都没有增加字符串 splice。Immer 也从未符合。

## 3. tracker {#3-the-tracker}

状态是**普通 TypeScript**。没有容器，没有 handle，没有 schema，没有装饰器。你正常 mutation。

```ts
const t = track(laneView);
t.state.operation.streamingMessage.content[0].text += delta;   // -> append
t.state.transcript.push(entry);                         // -> splice
t.state.tools[0].details.failures.push({ name, msg });  // -> splice
delete t.state.config.model;                            // -> delete
const ops = t.flush();
```

三种机制，每种情形一个：

**对象** — 普通 `set` / `deleteProperty` trap。

**数组 — 在 `get` trap 中拦截 mutator 方法。** `arr.push(x)` 先经过 `get(arr, "push")`，因此 tracker 返回自己的函数，记录 `splice(len, 0, [x])` 然后委托。意图在引擎执行其下标写入*之前*被捕获，这就是为什么 `unshift` 是一个 op 而不是 O(n)。这是其他库都不做的事。

**字符串 — 在 `set` trap 上做脏标记，在 `flush()` 时做 overlap 检测。** 字符串是原语，因此没有东西可拦截。给定已接受的 `prev` 和最终的 `next`，找到 `prev` 中作为 `next` 前缀的最长后缀：

```
overlap === prev.length  ->  append(next.slice(overlap))
overlap > 0              ->  truncate(prev.length - overlap) + append(rest)
overlap === 0            ->  set(next)
```

永远正确，因为 overlap 是**验证过的**，不是猜的。滚动窗口可行：

```ts
s.out = s.out.slice(4) + "!!!";
// ["truncate", ["out"], 4]
// ["append",   ["out"], "!!!"]
```

### 3.1 overlap 绝不能用手写 KMP {#31-overlap-must-not-use-a-hand-written-kmp}

KMP 失败函数在渐近上是对的，实践中却**慢 47 倍**，因为它在 JS 里逐字符运行。在 50 KB 字符串上测 2000 次窗口滑动：KMP 2870 ms，原生探测 61 ms。

探测：在 `prev` 里 `indexOf` `next` 的短头部，用 `endsWith` 验证每个候选。两者都是原生的。在 200 次窗口滑动上验证与 KMP 相同。

`startsWith` 快路径先跑，因此纯 append — 主导情形 — 完全跳过探测。

### 3.2 实现必须守住的规则 {#32-rules-the-implementation-must-hold}

**插入的值被收养；发出的载荷在 flush 时被克隆。** 调用者可以保留只读引用，但不得在 tracker 外 mutation 被收养的对象。`flush()` 克隆载荷并推进一份克隆的已接受 baseline，因此发出的 ops 从不与生产者状态别名。

**`x = undefined` 规范化为 `delete`。** JSON 没有 `undefined`，带缺失值的 `set` 在 `JSON.stringify` 往返后与丢失的值无法区分。

**`arr.length = n` 被翻译，从不作为 path 发出。** 收缩变成 splice，增长变成 null 的 splice。`length` 是真实 mutation，但不是文档位置 — 这是 Immer 交付的 bug（issue 208）。像早期原型那样静默丢掉它，意味着 `arr.length = 0` 永远到不了副本。

**数字数组键被规范化为数字。** Proxy trap 交付 `"0"`；path 携带 `0`。Valtio 交付字符串形式，对体积和比较都更差。

**proxy 按对象和 path 缓存**，因此 `s.a === s.a`，并且不会在每次访问时重建 proxy。

**范围只是 `JsonValue`，而且必须被检查，不能被假定。**
`structuredClone` 不是 JSON 检查 — 它会高兴地克隆 `Map`、`Set`、`Date` 和 `RegExp`，结果随后与 `JSON.stringify` 产生的不同，于是生产者与副本静默分叉。在记录时断言该值，并拒绝 symbol 键。没有它会泄漏什么，见 §7.4。

**恰好两个 op 到达根**，applier 的根分支必须处理两者：永远有 `r`，以及当被跟踪的值本身是数组时的 `p`。
`s`/`d`/`a`/`t` 按类型不能，这使得该分支的 fallthrough 可证明不可达。只在那里处理 `r` 能通过每一个手写测试，并在第一个产生根 splice 的随机序列上失败。

**同一事务链内对同一地址的两次写入。** 当一次提交中对同一地址发出若干写入时，每一次都必须相对前一次的结果记录，而不是相对事务前状态。applier 按顺序重放它们；其他任何做法都会把第二次应用到陈旧的 base 上。这在浮现它的那次负载里没有触发 — 一旦触发就会静默损坏。

### 3.2.1 替换整值 {#321-replacing-the-whole-value}

对 `state` 赋值会替换它：

```ts
tracker.state = next;    // emits ["r", next]; discards ops recorded before it
```

`state` **必须是 tracker 上的 setter**，而不是普通属性。没有它，`tracker.state = next` 会用普通对象换掉 proxy，之后每一次 mutation 都被静默取消跟踪 — 没有错误，没有 ops，`target` 不变。这也是任何人首先会尝试的事。

先前的 ops 被丢弃，因为它们描述一个不再存在的值。

只有*完整*替换才折叠为 `r`。改写值的一部分时 ops 存活，因为它们确实更便宜：

```
partial rewrite        2 op(s), base=false
    ["s",["user"],{"id":"u2","name":"bob"}]
    ["s",["items"],["x"]]
```

### 3.2.2 第一次 flush 是 base batch {#322-the-first-flush-is-a-base-batch}

`track()` 打开一条流，消费者从空开始，因此第一次 flush 永远发出 `["r", value]` — 携带在它之前做的任何 mutation：

```ts
const t = track({ x: 0, l: [] });
t.state.x = 100;
t.state.l.push("xyz");
t.flush();      // [["r", { x: 100, l: ["xyz"] }]]
t.state.x = 101;
t.flush();      // [["s", ["x"], 101]]
```

要求生产者先记住一次 `rebase()` 会在运行时失败，失败在消费者里，远离错误本身。

### 3.2.3 稍后强制一次 base batch {#323-forcing-a-base-batch-later}

```ts
tracker.rebase();        // next flush is ["r", value]; value unchanged
```

丢弃挂起的 ops 是正确的：proxy 直接 mutation target，因此值已经携带它们。在已落地实现中 `tracker.state = tracker.state` 有同样效果，但 `rebase()` 直接陈述意图。

**没有任何东西会自行产生 base batch。** `flush()` 发出 ops；只有当生产者要求时才会发生替换。因此一串 append 会无限期地保持为一串 delta。

恢复从最后一个 base batch 重放（§9）。来自 `delta.examples.ts`，500 次持久化写入进入 50 KB 滚动窗口的 bash 形状负载：

| | 写入的批次 | 恢复时要重放 |
| --- | --- | --- |
| 从不 | 500 | **499** |
| 每 50 次 `rebase()` | 500 | 0 |

两个调用者需要这个：

- **持久化 sink。** `pendingToolOutput` 在命令运行期间每个 checkpoint 累积一批。一次跑十分钟的 `make -j8` 否则会留下数百批次在恢复时折叠。每 N 次 checkpoint 让「最多重放 N 批」成为策略，而不是意外。
- **重新订阅时的 facet host。** `facets.md` §9.2 要求每一次订阅的第一批都是 base batch，看到缺口的消费者重新订阅以得到一个。host 必须能按需产生一个，而不是等它碰巧发生。

### 3.3 已知缺口 {#33-known-gaps}

- `sort` / `reverse` / `fill` / `copyWithin` 把数组标脏，并发出结果的结构 / 下标变更，而不是保留生产者的方法意图。只有当测得的负载需要时才增加专用 op。
- 手动下标平移循环（`for (…) a[i] = a[i+1]`）仍可能花费 O(n) 次 set。正确，不是最小，且不可避免 — 生产者确实写了每一个元素。
- 滚动窗口字符串赋值仍在 flush 时运行 overlap 发现，这是故意的：生产测量不能证明文本专用的 tracker 状态或 API 表面是值得的（[决定](append-decision.md)）。

### 3.4 字符串算法必须守住的约束 {#34-constraints-the-string-algorithm-must-hold}

每一条都很容易以通过手写测试的方式弄错。

**固定长度的探测找不到短于探测的 overlap。** 头部必须真正出现在 `a` 中：`"abcdefgh"` -> `"defghxyz"` overlap 为 5，64 字符的头部不可能出现在 8 字符字符串里。先试长头部，然后回退到单字符头部。只用 50 KB 字符串的测试，overlap 巨大，会让损坏的实现通过。

**给候选扫描设上界。** 重复性输出 — 构建日志，或一串同一字符 — 会让长头部在数千个位置匹配，每一次都花费一次完整 `endsWith`。无上界时，50 KB 窗口上 2000 次滑动要 4.7 s，有界则 93 ms。超过上界返回 0，发出 set：更大，永不错误。

**在任何东西依赖这个之前做属性测试。** 3000 次随机 mutation 往返会在第一次运行就找到 §3.2 的根 splice 漏洞；手写用例找不到。要移植的套件是 `delta.test.ts`。

## 4. codec {#4-the-codec}

两套词汇，不是一套。

`Op` 是 tracker 产生、`apply` 消费的东西。**path 永远内联。** 它不知道字典。

`WireOp` 是穿过边界的东西。它恰好增加两种压缩：

```
["#", id, path]     defines an id, emitted on a path's SECOND use
a numeric PathRef   references a previously defined id
a shortened tuple   reuses the previous op's path; arity disambiguates
```

`encoder().encode(ops): WireOp[]` 和 `decoder().decode(wire): Op[]` 是两者存在的唯二位置。把它们留在 `Op` 之外意味着 `apply` 没有 id 解析、没有 `#` 分支、也没有上一 path 状态 — 从热路径去掉三个分支 — 并且脏树生成在编码前始终使用内联 path。

`["r", value]` 不携带 path，因此编码成它自己。这就是为什么 `isBase` 在两套词汇上都不需改变。

### 4.1 两条容易弄错的规则 {#41-two-rules-that-are-easy-to-get-wrong}

**每条流一对 encoder/decoder。** id 表跨越整个订阅或文件：在批次 3 intern 的 path 在批次 40 被引用。在批次 40 订阅的第二个消费者从未见过定义，因此它需要自己的 encoder。在消费者之间共享一个会把迟到订阅者无法解析的 id 交给它，而 base batch 救不了它 — `["r", value]` 不携带引用，并让表空着。

**在 base batch 上重置表。** 读者用全新 decoder 从*最后*一个 base batch 重放，因此一次替换之后的一切必须自包含。把 id 带过替换会发出读者从未见过的定义引用：

```
  4    : [["a",0,"x4"],["a",1,"y4"]]
  5 BASE: [["r",{…}]]
  6    : [["a",0,"x6"]]        <- id 0 was defined in batch 1
  -> RECOVERY FAILED: PathError - unresolvable path: 0
```

**arity 省略的范围是一批。** 让它跨批次会使一批的第一个 op 依赖上一批的最后一个，因此跳过或重排一批的读者会解码到错误 path。id 是唯一的跨批次状态，字典让那些成为显式的。

### 4.2 在第二次使用时 intern，而不是第一次 {#42-intern-on-second-use-not-first}

定义比它替换的 path 更贵，因此第一次使用就 intern 会在每一条恰好写一次的 path 上亏损 — 而大多数都是。在批量负载上测得：**首次使用 255.5 KB，对完全不 intern 的 179.6 KB。**

### 4.3 实测 {#43-measured}

相对内联 path 的线路字节，往返已验证：

| 流 | 内联 | 线路 | 节省 |
| --- | --- | --- | --- |
| 一条热 path（滚动的工具输出窗口） | 11,290 B | 7,538 B | **33.2%** |
| 四条交替 path（lane 状态） | 14,160 B | 11,032 B | **22.1%** |
| 200 条不同 path | 16,455 B | 16,035 B | 2.6% |

第一种情形是省略在干活，第二种是 intern。第三种两者都帮不上忙，定义还要花一点 — 这正是第二次使用 intern 存在以约束的情形。

## 5. flush 发出 ops，并丢掉死掉的 {#5-flush-emits-ops-and-drops-the-dead-ones}

`flush()` 针对上次接受的 baseline 为脏 path 计算 ops。它不为每次 mutation 保留一个 op，因此重复和交错写入由变更状态界定，而不是由写入次数界定。没有大小比较或替换启发式：替换是生产者通过赋值 `state` 或调用 `rebase()` 要求的。

更早的设计把 op 字节与值的序列化大小比较，并在 ops 更大时替换。它被移除了。相对无条件发出 ops，在六种负载上测量，它只在两种上改变了输出 — 两者都需要在单次 flush 中改变数百条不同 path。harness 和复制路径都不那样做：`LaneSnapshot` 一次折叠一个事件，最宽的情形（`run_end`）触及四个字段。该规则花费每次 flush 一次比较、一份运行中的大小估计，以及一条无法维持它的 ops 失效规则。

### 5.1 脏树折叠 {#51-dirty-tree-collapse}

已落地的 tracker 只记录哪些子树是脏的。flush 时它把每个脏子树的已接受 baseline 与其最终值比较，并发出存活的结构变更。对同一字段的重复写入自然折叠；对两个字段的交替写入保留两条脏 path，而不是每次 mutation 一个 op；在最终比较允许时，父替换吞掉脏子孙。`packages/chord/test/delta.test.ts` 把交错滚动窗口情形钉在 1,000 次交替写入后至多三个 op。

这取代了原型的反向死 op 遍历和仅相邻合并器。不要把那些算法移植进 Chord：flush 时生成就是 D1 的修复。

> **对象键顺序不是被复制的不变量。** 值会往返，但一次 flush 内的删除再插入活动可以在副本上产生不同的插入顺序。不要对被复制的值做哈希或内容寻址，在展示顺序要紧的地方显式排序。

## 6. 没有 frame 类型 {#6-there-is-no-frame-type}

逻辑批次是 `Op[]`；传输和持久化存储携带有状态编码后的 `WireOp[]`。不要包装任何一种批次。

**`seq` 不属于载荷。** 它会防御我们没有的有损传输：持久化 list 元素已经从存储携带 `seq`，进程内回调不能跳过，SSE 要么按序交付要么中断 — 而中断意味着重新订阅，意味着一次 base batch。存储 `seq` 的第二份拷贝只能与第一份不一致。SSE 绑定盖上 `id:`，那才是传输元数据所属之处。

**其他任何东西也不需要包装。** 一旦替换是一个 op（§2），`kind` 判别就是冗余的，而地址已经说明一批属于哪个值。剩下的会是包着数组的结构体。

生产者批次就是 `Op[]`，其编码后的边界形式是 `WireOp[]`。**base batch** 是第一个 op 为 `r` 的一批；
`isBase(ops)` 是 `ops[0]?.[0] === "r"`，精确而不是启发式，因为 flush 保证 `r` 出现在下标 0 或者根本不出现（§5）。

frame 曾经做的一切现在都由已经存在的东西完成：

| 曾经在 frame 上 | 现在 |
| --- | --- |
| `seq` | list 元素的 `seq`，或 SSE `id:` |
| `kind: "replace"` | `r` op |
| 它属于哪个值 | 地址 |
| 「这是一份快照」 | `"base"` 存储标签 |

**重新订阅是一次 base batch 加上被缓冲的批次** — 与 lane 适配器已经为 harness 做的同一件事：先快照，然后客户端赶上期间累积的任何东西。没有 `Last-Event-ID`，也没有跨订阅恢复；那会需要一份被保留的 op 日志，而 §5 故意不保留。

看到缺口、无法解析 path，或冷连接的消费者走一条路径：要一次 base batch。这就是为什么没有 `Rebase` 类型。

成本，直说：**消费者无法单从载荷检测陈旧。** 它依赖传输报告中断。对 SSE 和进程内这是健全的。若有损或复用的传输终究出现，序号放在那条传输的信封上 — 而不是回到 ops 里。

## 7. 安全 {#7-safety}

ops 来自 facet、插件隔间，或 details 可能回显模型输出的工具。**其中没有任何东西是受信任输入**，不受信数据遇见受信机制的边界，正是本设计必须守住的地方。

参照点是 CVE-2025-55182 — React Server Components 中的 RCE，CVSS 10.0，已被野外利用。它们的 Flight 协议是重建结构的紧凑带标签线路格式，因此相似是真实的。失败是*「未能正确校验结构……把伪造对象当成真的」*：伪造的 Chunk 被解析为 Promise，并暴露包含 gadget 的内部状态以到达 `Function`。

**我们在结构上更安全，而且不是因为勤勉：**

| | Flight | ops |
| --- | --- | --- |
| 能描述运行时对象 | 能 — Chunk 解析为 Promise | 不能 |
| 能引用代码或模块 | 能 — 客户端组件 | 不能 |
| 值 | 任意对象图 | `JsonValue` |
| 伪造载荷的最坏情况 | RCE | 损坏的副本状态 |

Flight *必须*引用代码；那是它的工作。op 只能把一个 `JsonValue` 放到一条 path 上，因此 gadget 链没有第一环。这就是为什么攻击者不能在 `Object.prototype` 上植入一个不 resolve 的 `then`：只含数据的 `then` 不可调用，而当 `then` 不可调用时 `await` 正常 resolve。

> **规则：任何 op 都不得命名 host 会解析的东西。** 不是 mutation 名，不是组件 id，不是模块引用。mutation 名因无关原因被移除（§8）；这是永不重新引入它们的第二个、也是更好的理由，因为它是让 Flight 可被利用的配料。

### 7.1 path 是危险的部分 {#71-paths-are-the-dangerous-part}

`JSON.parse` 单独是安全的 — `{"__proto__":{}}` 变成一个*自有*属性。
危险的是 `parent[key]`，而这恰好是应用 path 所做的事。

单个键不够。`x["__proto__"] = v` 换掉的是 *x 自己的* 父，那是局部的。需要一次**行走** — `x["__proto__"]["polluted"] = v` — 才能到达共享原型，而 path 恰恰是一次行走。

`constructor` 比 `__proto__` 更糟，因为 `({}).constructor.constructor` 是 `Function`。那架梯子在这里被关上，只因为 op 值不能是函数；正确关上它的方式是拒绝该段。

**保留的 path 段：`__proto__`、`constructor`、`prototype`。** 在记录时*以及*应用时拒绝，包括经由 intern 的 path id。

它们作为*段*被保留，而不是作为值。带字面 `"__proto__"` 键的对象作为整值复制没问题；只有*穿过*它行走的 path 被拒绝。这是对可变内容的真实限制 — 把它写下来，不要假装它不存在。

同一危险上的另外两项措施：

- **用 `Object.defineProperty` 写入**，永远不要赋值，因此继承的 setter 不能运行。
- **只解析自有属性**（`Object.hasOwn`），因此行走不能逃进原型链，继承的 getter 不能触发。这第二次挡住 `constructor`，因为它是继承的。

原型污染在这里实际买给攻击者的比乍看更窄：**它翻转默认值，并不覆盖显式值。** 自有属性会遮蔽。因此 `{name:"bob", isAdmin:false}` 不受影响；被读成 `opts.skipSandbox` 的 option bag 会。我们自己的 `ShellExecOptions`、`ShellOutputCaptureOptions`、`ListReadOptions` 和 `TrackerOptions` 正是那种形状。还要注意 `"x" in {}` 和 `const {x = false} = {}` 在污染下都会说谎 — 这就是为什么 applier 使用 `Object.hasOwn`。

### 7.2 数组下标 {#72-array-indices}

下标可以寻址已有元素，或恰好在末尾再追加一个。

这不是任意 cap；它是让值保持为 `JsonValue` 的东西。稀疏数组无法在 JSON 往返中存活 — 空洞序列化为 `null` 并作为真实属性返回 — 因此在长度为 3 的数组上 `arr[7] = x` 已经产生副本无法匹配的状态。拒绝这次写入比分叉更诚实。

它作为副作用而不是目的去掉了一种拒绝服务：`["s",["xs",4294967290],1]` 否则会从一个 op 分配 42.9 亿项的数组。增长仍然可用并且保持成比例，因为 `arr.length = n` 被发成为显式 null 的 splice，其 op 大小随缺口增长。

### 7.3 在 decode 时校验 op 结构 {#73-validate-op-structure-on-decode}

这是应用到我们身上的 RSC 教训。decoder 不得信任元组形状。相对未校验的 applier 测量：

| 畸形 op | 结果 |
| --- | --- |
| `["p",["xs"],0,0,"not-an-array"]` | 字符串被 spread 进数组：`["n","o","t",…]` |
| `["s","a",9]` — path 是字符串 | 被接受；`"a".slice(0,-1)` 是 `""`，因此它写在根上 |
| `["ZZZ",["a"],9]` | 静默忽略，副本无错误地分叉 |

校验：动词已知，arity 与动词匹配，path 是字符串和非负整数的数组，`p` 携带整数下标和计数外加 items 数组，`#` 定义数组 path。未知动词是**错误**，不是 no-op — 静默跳过它，就是更新的生产者的 op 消失、副本漂移的方式。

**每套词汇一个校验器。** `assertValidOp` 守护 `apply` 并拒绝 id、短形式和 `#`；`assertValidWireOp` 守护 `decode` 并允许它们。
用线路语法去校验已解码的 op 比它自己的类型更松：二元组 `["s", value]` 会通过，然后 `apply` 会把值读成 path。

### 7.4 tracker 的笼子在类型上泄漏，而不是在形状上 {#74-the-trackers-cage-leaks-on-types-not-shape}

facet 不能伪造 op：它 mutation 普通对象，tracker 构建元组，因此形状在构造上就是良构的。值和键是另一回事，而 `structuredClone` **不是** JSON 检查。

| facet 写入什么 | 会发生什么 |
| --- | --- |
| 函数 | 抛出（`DataCloneError`） |
| BigInt、环 | 抛出 |
| `new Map([[1,2]])` | op 携带 `{}`，生产者保留真正的 Map — **静默分叉** |
| `new Date(0)` | op 携带 ISO 字符串，生产者保留 Date |
| `state[Symbol("s")] = 1` | 发出 `["s",[null],1]` — **来自我们自己 tracker 的畸形 op** |

因此 tracker 必须在记录时检查给它的东西，错误就在那里：

- **拒绝 symbol 键。** 它们不是 path 段。
- **对每一个被记录的值断言 `JsonValue`。** 显式拒绝 `Map`、`Set`、`Date`、`RegExp`、typed array 和类实例。§3.2 中的范围限制是一条注释；它必须是一次检查。

状态上的 getter 是安全的 — trap 记录计算出的结果 — 而*看起来*像 op 的 facet 值被嵌在 `["s", path, value]` 内部，永远不能被读成顶层 op，因为没有任何东西会展平。

### 7.5 Applier {#75-applier}

```ts
export function apply<T>(target: T | undefined, ops: readonly Op[]): T;
```

六个动词，没有领域知识，没有库，没有工具代码，没有注册表查找，也**没有 path 表** — id 和省略的 path 在 `apply` 看到任何东西之前由 `decode` 解析（§4）。

它返回值而不是原地 mutation，因为 `r` 会彻底替换它。
运行在**消费者拥有的普通可变对象**上。不得指向 Immer 产生的值，后者会深冻结并抛出。

任何语言里一页代码，这正是让非 JS 消费者可行的性质。Colyseus 在同一基础上交付 C#、Lua 和 Haxe 的 decoder。

## 8. 这从代码库中移除什么 {#8-what-this-removes-from-the-codebase}

具体删除，不是原则上的简化：

- **Immer**，从 harness 和 facet 层。见 §1 为何产生 patch 的库不能服务这个目的。
- **按类型的 reducer。** 只有一个 applier，`apply(target, ops)`，没有领域知识，没有注册表。没有人为 `ToolOutputState` 或插件的形状写 fold。
- **`detailMutations` 和 `initialDetails`**，以及随之而来「`details: unknown` 迫使特殊处理」的论据。结构 tracker 从不需要类型。
- **作为 reducer 返回值的 `Rebase`。** 无法应用的 fold 让状态保持原样，host 发送一次 base batch。
- **线路上的 mutation 名**，因此也没有 mutation 名版本偏移。名字从不穿过边界，因此增加或重命名一个不是破坏性变更。

以及三件不要构建的东西，每一件在看到 §1 之前都看起来合理：

- **盲目的整值 differ。** 已落地的 tracker 只把脏子树与已接受的 baseline 比较；它不扫描无关状态。
- **带键的 op 形状外加 codec。** 元组就是到处都是的形式（§2）。
- **frame 包装。** 旅行的是 `Op[]`（§6）。

## 9. 持久化形式 {#9-durable-form}

被跟踪的值存储为**编码后的 `WireOp[]` 批次列表**，每次 flush 追加一批。base batch 携带存储标签 `"base"`；每个值一个有状态 decoder 在 `apply` 之前解码它们。

恢复向后读到最后一个 base batch 并向前应用：

```ts
readList(address, { order: "desc", stopAtTag: "base", limit: 100 })
```

`stopAtTag` 是*页内*停止条件：若页中没有 base batch，消费者用 cursor 再翻一页。标签活在存储记录上、`seq` 旁边，从不在值内部，因此存储从不解析 ops。见 [scopes.md](../02-scopes/scopes.md) §11。

这让「替换截断恢复」（§5）成为真实而不是愿望 — 读者停在最后一个 base batch，而不是从开头重放。

## 10. 开放问题 {#10-open-questions}

- 若出现许多不同 path 共享长前缀的负载，做前缀 intern（path 头部上的 trie）。第二次使用 intern（§4）去掉了病态情形；这会走得更远。
- 数组重排是否需要专用 op；已落地的 tracker 当前把数组标脏，并发出结果的结构 / 下标变更。
- 跨语言副本：applier 在任何语言里都是一页代码，但 intern 表和线路分帧并未为非 JS 消费者指定。

JSONL 日志中的地址 intern 与 path intern 是同一技巧，在上一层作用于 `namespace` + `key`。它**不是**开放问题 — 它在 [scopes.md](../02-scopes/scopes.md) §12 中指定，并且是与这一套分开的字典。
