本文是 `FINDINGS.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 01-delta：已知缺陷与实测发现 {#01-delta-known-defects-and-measured-findings}

这里的每一项都是在 `delta.md` 以及旁边的原型实现写完**之后**发现的。目录中的代码都没有应用这些结论。生产代码现在位于 `packages/chord/src/delta/index.ts`：flush 时的 dirty tracking 解决了 D1，生产重新测量在不引入新 API 的情况下关闭了 D2。见 [`append-decision.md`](append-decision.md)。下面每一项仍是当初的问题、证据与候选修复记录。

所有数字都用 **`node --experimental-strip-types`** 测得，而不是 `tsx`。
这一点很重要：tsx 会经 esbuild 转译，并把同一基准放大 **2.6 倍**（每次写入 183 µs 对 63 µs）。不要经转译器对本模块做基准测试。

---

## D1. 交错路径会破坏合并（接近正确性问题，内存无上界） {#d1-interleaved-paths-defeat-coalescing-correctness-adjacent-unbounded-memory}

**严重性：高。** 这是应最先修复的一项。

### 问题 {#problem}

`flush()` 只合并**相邻** op。因此，在两条路径之间交替写入的生产者永远合并不了任何东西，ops 数组随写入次数增长，而不是随值的大小增长。

这不是假想场景。bash 正是这样做的：每个 chunk 都会更新输出文本和一个字节计数器。

```ts
const next = t.state.content[0].text + chunk;
t.state.content[0].text = next.length > CAP ? next.slice(next.length - CAP) : next;
t.state.truncation.totalBytes += chunk.length;    // <- the other path
```

### 证据 {#evidence}

50 KB 窗口，200 字节 chunk，中间不 flush：

| 被暂扣的写入 | ops | 字节 |
| --- | --- | --- |
| 1 | 3 | 0.3 KB |
| 100 | 201 | 26 KB |
| **1000** | **2001** | **264 KB** |

同样的负载若没有交错，会得到 1 个 op 和 51 KB。窗口被限制在 50 KB；描述它的 ops 却没有上界。

### 为什么这不只是内存问题 {#why-it-matters-beyond-memory}

任何让 sink **暂扣**写入的设计 — 限速、反压、慢消费者 — 都依赖被暂扣的写入零成本。它们目前的成本是「全部」。见 `../../04-tool-output/rate-limiting.md`。

### 候选修复 {#candidate-fix}

在**记录**时按 path 而不是按相邻性折叠：每条 path 一个槽位，最多持有两个 op（`[s]`、`[d]`、`[t]`、`[a]`，或 `[t, a]`），按首次触达顺序发出。

一个原型在同样负载上达到了 **2 个 op / 51 KB**。这里没有收录它，因为它没有按本单元其余部分的标准得到验证。

**四条折叠规则，每一条都是对该词汇的具体主张：**

1. 同一 path 上后到的 `s` 会取代先到的 `s` — 但**不能**取代先到的 `d`，后者必须存活，否则该 key 在重新插入时会改变位置（§5.1）。
2. 连续的 `a` 合并。一旦合并后的 append **严格长于**当前值，窗口已经在滑动，append 是更昂贵的写法，因此折叠为 `s`。严格地说：字符串仍在向 cap *增长*时，append 等于整个值，此时折叠会在每个批次重发整串。
3. 同一 path 上的 `t` 与 `a` **可交换** — truncate 从前面丢掉，append 加到末尾 — 因此滚动窗口的 `t,a,t,a,...` 会折成各一个。没有这一条，成对合并根本不会触发。
4. 挂起的 `s` 之后再来 `t` 或 `a` 什么也不改变：`s` 已经表示「这条 path 变成它的当前值」。

**原型踩过的陷阱。** 槽位按首次触达顺序发出，这会丢掉「子写入发生在后来的父写入*之前*」这一事实：

```
script  : a={x:1}; a.b=99; a={c:2}
producer: {"a":{"c":2}}
replica : {"a":{"c":2,"b":99}}      <- WRONG
```

set 或 delete 必须在记录时让其 path **下方**每一个挂起槽位失效。当时现有的 `verify-dead` 风格测试对 1190 个序列都通过了，因为生成器只嵌套一层。针对这一点的测试必须生成真正嵌套的 path，并在子写入之间交错父级覆盖。

---

## D2. `overlap()` 曾占原型 tracker 时间的 94.5% — 已关闭 {#d2-overlap-was-945-of-prototype-tracker-time--closed}

**历史严重性：高。生产决定：** 不要增加显式 append/truncate API。原型画像被缓慢的 `startsWith` 路径主导；生产代码使用展平后的 slice 比较，本地测得每次 200 KB assistant append flush 为 17.8–18.7 µs，每次 50 KB 滚动窗口 flush 为 2.43–2.46 µs。见 [`append-decision.md`](append-decision.md)。下面是当初的证据。

### 问题 {#problem-1}

tracker 通过搜索两段 50 KB 字符串来推断「你做了 append 并驱逐了前缀」。
`next.slice(-CAP)` 产生的每个新值都是 V8 `SlicedString` — 惰性子串 — 而 `indexOf` / `endsWith` 会强制它**展平**，每次调用复制 50 KB。

### 证据 {#evidence-1}

对 20 000 次写入的滚动窗口循环做 CPU profile，node，最后才 flush：

```
  94.5%  overlap
   2.7%  (anon)
   1.2%  (garbage collector)
   0.5%  set
   0.3%  emit
   0.0%  fold
```

展平可以直接观察到：

| 对 50 KB 窗口调用 `overlap()` | µs |
| --- | --- |
| 复用同一对字符串 | 37 |
| **每次调用都是新的 sliced string** | **149** |

更早的基准报告了 29 µs，因为它把两段已经展平的字符串复用了 2000 次 — 真实循环里从不发生这种情况。**不要用复用的 fixture 去基准字符串操作。**

### 候选修复 {#candidate-fix-1}

不要去推断生产者已经知道的事情。`ToolOutput` 执行窗口化，因此可以直接发出 ops，而不是赋一个新字符串再让 tracker 去搜索差异：

```ts
out.append(chunk);       // -> ["t", path, dropped], ["a", path, chunk]
```

两个整数 — 追加了多少字符、驱逐了多少字符 — 就能描述有界窗口任意两次观察之间发生的一切。这种形状的原型在每一种负载下内存中都**恰好持有窗口**，没有 ops 数组，没有 overlap 检测，也完全没有折叠规则。

这**不会**移除 `overlap`：一般情形下生产者赋了一整段新字符串、delta 必须被发现时，它仍然留下。它只是把它从热路径上拿掉。

### 不要做 {#do-not}

在做完上述事情之前，不要去「优化」`overlap` 本身。它的算法已经正确且有界（`maxOverlapScan`）；成本是字符串展平，任何探测策略都躲不开。

---

## D3. 嵌套 path 的 proxy 开销是下一个问题，目前看不见 {#d3-nested-path-proxy-overhead-is-next-and-currently-invisible}

**严重性：未知 — 先测量再行动。**

`overlap` 主导得如此彻底，profile 里看不到别的。但两组基准以一种指向 path 深度的方式互相矛盾：

| | 每次写入 µs |
| --- | --- |
| 顶层 path（`{ text }`） | 63 |
| 嵌套 path（`{ content: [{ text }] }`） | 244 |

仅深度就差 4 倍。每一次嵌套属性访问都会包一层子 proxy，并通过拼接 path 构建 cache key，因此读取 `content[0].text` 每次都会分配。

**只有当生产环境的 delta 成本变得实质性时才重新 profile。** 这可能是下一个瓶颈，也可能什么都不是；当前数字无法区分，因为 `overlap` 把两者都淹没了。

---

## D4. 测过并发现不值得做的事情 {#d4-things-measured-and-found-not-worth-doing}

记下来以免有人重复劳动。在上面的 profile 里，它们合计都在 **1.5% 以下**。

**用 path trie 替换 `JSON.stringify(path)` 键。** 单独看确实更快 — 在 `LaneSnapshot` 形状上 6 倍，在 500 条不同 path 上 93 倍 — 因为 stringify 成本随 path 深度增长，而 trie 遍历每段只是一次 `Map.get`。但整个槽位层只占运行时的 0.5%。只有当前生产 profile 说该做时才构建它。

**trie 作为存储 vs trie 作为索引。** 若终究要建 trie，它应该把 path 映射到 **ops 数组中的位置**，而不是持有 ops。持有它们会丢掉首次触达顺序，并迫使 flush 时排序以重建。测得的差异：没有（1.4x / 0.9x / 1.0x）。论据是结构上的，不是性能上的。

**用 `maxDepth` 启发式跳过子孙扫描。** 已否决：扁平 map 在常见情形上也在输，启发式会把真实成本藏起来而不是去掉。

**在 `a`+`a` 合并中急切做字符串拼接。** 真实存在（每次写入都会重建不断增长的字符串），但大约只值 5%。比较长度，只在发出时物化。

---

## D5. 产出这些数字时犯过的测量错误 {#d5-measurement-errors-made-while-producing-these-numbers}

列出来是因为每一项都曾得出自信但错误的结论，而且同样的陷阱仍在。

- **经 `tsx` 做基准** — 把一切放大 2.6 倍。
- **在字符串基准中复用已展平的字符串** — 把真实成本藏了 4 倍。
- **重复性 fixture**（`"x".repeat(n)`）— overlap 检测会撞上候选上界并放弃，于是基准测到的是回退路径，不是真实路径。使用有变化的文本。
- **把 cache hit 当成工作来测** — 当文本和宽度未变时 `Markdown.render()` 返回 `cachedLines`，因此「重复同一调用」的循环把成本为 0.86 ms 的事情测成了 0.065 ms。
- **常数项主导时却在讨论复杂度** — 发生过两次。
- **测 heap 而不是 retained size** — 一个生成 800 × 1 MB 字符串的 fixture 报告了 40 MB 的「增长」，那其实是它自己的垃圾。
