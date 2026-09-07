本文是 `append-decision.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 决定：不提供显式文本 append/truncate API {#decision-no-explicit-text-appendtruncate-api}

**状态：已关闭。** 不要添加 `appendText`、显式 truncate、文本专用的 dirty-node 种类，或 proxy 到 tracker 的查找机制。

## 为何曾被考虑 {#why-it-was-considered}

tracker 标记脏 path，并在 `flush()` 时与已接受的 baseline 比较。对于不断增长或滚动的字符串，确认这种关系可能扫描整段被保留的字符串，尽管生产者已经知道自己做了 append 或驱逐了文本。

原始基准让这看起来很昂贵，因为它的 append 快路径使用了 `after.startsWith(before)`。V8 会逐字符走完生产者的 cons string。生产 Chord 现在使用：

```ts
if (after.length > before.length && after.slice(0, before.length) === before) {
  // emit append
}
```

slice 展平一次，比较走原生字符串路径。flush 时的 dirty tracking 也消除了原型里被保留 op 的放大。

## 本地确认 {#local-confirmation}

于 2026-09-01 相对 `origin/dev` 的 `1a7bc80e7` 测量，直接使用 `packages/chord/src/delta/index.ts`，Node 26.0.0，Apple M5 Max。每种负载 3,000 次预热，随后 11 个样本、每个样本 10,000 次 mutation-plus-flush 迭代；第二个进程复现了结果。

| 负载 | 中位 µs/flush，第 1 次 | 中位 µs/flush，第 2 次 |
| --- | ---: | ---: |
| 200 KB assistant 字符串，append 8 个字符 | 18.68 | 17.81 |
| 50 KB 滚动窗口，每次滑过 32 个变化字符 | 2.46 | 2.43 |
| transcript push，一条小 entry | 0.74 | 0.78 |

assistant tracker 从 200,000 个变化字符开始，每次 append `" abcdef"` 并 flush。滚动 tracker 从 50,000 个变化字符开始，然后赋 `text.slice(32) + chunk`，每次 flush 使用不同的 32 字符 `chunk:<base36 index>:durable-stream` 值；每次 flush 都断言发出 `t` + `a`。transcript tracker push `{ id: "e<index>", text: "message <index>" }`，并断言每次 flush 一个 `p`。setup 与垃圾回收在每次计时循环之外。

以每秒 100 次 assistant 更新计，不断增长的字符串情形大约消耗 1.8 ms/s，约合一核的 0.18%。测得的滚动窗口成本本身也太小，不足以支撑被放弃的显式 API。

## 否决该 API 的原因 {#why-the-api-is-rejected}

原型需要文本专用的 dirty-node 状态、proxy 到 tracker 的查找、重复 append/drop 的折叠，以及随后整值替换的交互规则。它产生了细微的静默失败：一种实现回落到普通 differ 而测试仍然通过；另一种在 drop 触及更早的 append 时发生漂移。

这些复杂度不值得去节省低于周围复制、隔离和渲染成本的微秒。保持普通字符串 mutation 和通用 Chord op 词汇。

只有当生产 profile 显示 delta flush 时间在真实负载中占到有意义的比例时才重新打开。先重新测量通用快路径；那里的回归比增加生产者专用 API 更便宜、也更安全。
