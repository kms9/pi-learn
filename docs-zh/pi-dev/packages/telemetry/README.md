本文是 `README.md` 的中文阅读版；命令、路径、API 名称保持英文。

# @earendil-works/pi-telemetry {#earendil-workspi-telemetry}

面向 pi 包的供应商无关 telemetry 契约与带类型的 schema 工具。

本包提供：

- 显式的、基于回调的 `TelemetryContext` / `TelemetrySpan` 契约；
- 共享的 `NOOP_TELEMETRY_CONTEXT`；
- 参考实现 `InMemoryTelemetryContext`；
- 可序列化的 schema 定义以及推断出的 TypeScript 类型；
- 没有 exporter、没有全局 current-span 状态、也不依赖某个 telemetry backend。

应用可以使用内存参考实现，或为 OpenTelemetry、Sentry、日志或其他 backend 提供 adapter。Pi 包显式传递 telemetry context，并单独定义其领域 schema。

## 目录 {#table-of-contents}

- [安装](#installation)
- [Telemetry 概念](#telemetry-concepts)
- [核心 Context API](#core-context-api)
- [Adapter 契约](#adapter-contract)
- [No-op Context](#no-op-context)
- [内存参考 Adapter](#in-memory-reference-adapter)
- [Adapter 一致性](#adapter-conformance)
- [带类型的 Schema](#typed-schemas)
  - [开始与完成属性](#start-and-completion-attributes)
- [Schema 元数据](#schema-metadata)
- [Pi 包集成](#pi-package-integration)
- [安全与可移植性](#security-and-portability)
- [API 参考](#api-reference)
- [开发](#development)
- [许可证](#license)

## 安装 {#installation}

```bash
npm install @earendil-works/pi-telemetry
```

## Telemetry 概念 {#telemetry-concepts}

Telemetry 描述程序运行时做了什么。本包用 span、attribute、event、status 以及显式 context 来建模这项工作：

| 概念 | 通俗含义 |
|---|---|
| **Span** | 一次操作的计时记录，例如加载账户或发起 AI 请求。它在工作开始前开始，在工作结束时结束。 |
| **Parent and child spans** | 操作可以包含更小的操作。一个请求 span 可能包含一次缓存查找和一次数据库查询。它们一起形成一棵树，显示时间花在哪里。 |
| **Attribute** | 附着在 span 上的具名事实，例如 `provider: "openai"`、`cache.hit: true` 或 `item_count: 12`。Attribute 描述操作及其结果。 |
| **Event** | span 期间某个时间点上的具名事件，例如 `retry.scheduled` 或 `cache.lookup`。Event 没有持续时间，可以携带自己的 attribute。 |
| **Status** | 操作的结果：`ok` 或 `error`。Error status 可以包含错误名称和消息。 |
| **Context** | 标识新工作在 span 树中归属位置的句柄。从某个 context 启动 span 会使其成为该 context 的子 span。 |

例如，加载账户可能产生这样的 telemetry：

```text
example.account.load                         span
├─ attributes: account.id=123, found=true   关于该 span 的事实
├─ event: example.cache.lookup              span 期间的发生
│  └─ attribute: cache.hit=false            关于该 event 的事实
└─ status: ok                               最终结果
```

Span 是诊断数据，不是业务状态。记录它不得改变账户加载是否运行、成功、失败或被持久化。Adapter 把这些通用概念翻译成 OpenTelemetry、Sentry、日志或其他 backend 使用的对应概念。

## 核心 Context API {#core-context-api}

`TelemetryContext` 在回调周围启动 span。回调接收一个 `TelemetrySpan`，它同时也是子 span 的显式 parent context。

```typescript
import {
  NOOP_TELEMETRY_CONTEXT,
  type TelemetryContext,
} from '@earendil-works/pi-telemetry';

async function loadAccount(
  accountId: string,
  telemetryContext: TelemetryContext = NOOP_TELEMETRY_CONTEXT,
) {
  return telemetryContext.startSpan(
    {
      name: 'example.account.load',
      attributes: { 'example.account.id': accountId },
    },
    async (span) => {
      const account = await readAccount(accountId);
      span.setAttributes({ 'example.account.found': account !== undefined });
      return account;
    },
  );
}
```

把回调 span 传给更底层的工作以创建显式嵌套：

```typescript
return telemetryContext.startSpan({ name: 'example.parent' }, async (parentSpan) => {
  return parentSpan.startSpan({ name: 'example.child' }, async (childSpan) => {
    childSpan.addEvent('example.cache.lookup', { 'example.cache.hit': true });
    return performWork();
  });
});
```

没有公开的 `end()` 方法。`startSpan()` 拥有结算，并保持 span 打开直到回调的值或 promise 结算。对于用正常返回值表示的预期失败，请显式设置 status：

```typescript
return telemetryContext.startSpan({ name: 'example.save' }, async (span) => {
  const result = await save();
  if (!result.ok) {
    span.setStatus({
      status: 'error',
      error: { name: 'SaveError', message: result.reason },
    });
  }
  return result;
});
```

## Adapter 契约 {#adapter-contract}

Adapter 实现 `TelemetryContext`，并把通用 API 桥接到其 backend。它必须：

- 创建子 span，并同步地恰好调用一次回调；
- 保留回调的返回值和拒绝值，在同步抛出后返回以同一值拒绝的 promise；
- 保持原生 span 打开，直到返回的 promise 结算；
- 把正常完成视为 `ok`，把抛出/拒绝视为 error，除非已设置显式 status；
- 使重复的 `setStatus()` 调用 last-write-wins；
- 合并 `setAttributes()` 调用，后面的已定义值替换先前值，并忽略 `undefined`；
- 使记录方法同步、被动且不抛出；
- 忽略结算之后的调用；
- 原子地忽略失败的记录调用、抑制 backend 失败，并且仍恰好执行一次业务回调。

Adapter 可以在内部激活 backend 原生的环境 context 以用于自动 instrumentation，但 pi 代码始终通过 `TelemetryContext` 参数传播 parent。Exporter 缓冲、flush、采样、backend ID 以及 backend 特定的 context 对象属于 adapter。使用 [adapter 一致性套件](#adapter-conformance) 检查这些可观察语义。

## No-op Context {#no-op-context}

当 telemetry 可选时使用 `NOOP_TELEMETRY_CONTEXT`：

```typescript
import { NOOP_TELEMETRY_CONTEXT } from '@earendil-works/pi-telemetry';

const result = await NOOP_TELEMETRY_CONTEXT.startSpan(
  { name: 'example.operation' },
  () => runOperation(),
);
```

No-op context：

- 同步调用回调；
- 保留返回值和异步拒绝，并把同步抛出转换为以同一值拒绝的 promise；
- 使用一个共享的冻结惰性 span，包括嵌套 span；
- 不检查或保留名称、attribute、event 或 status。

## 内存参考 Adapter {#in-memory-reference-adapter}

`InMemoryTelemetryContext` 是与 backend 无关的参考实现。它适用于测试、本地诊断，以及有意要在没有 exporter 的情况下做进程本地捕获的应用：

```typescript
import { InMemoryTelemetryContext } from '@earendil-works/pi-telemetry';

const telemetry = new InMemoryTelemetryContext();

await telemetry.startSpan(
  { name: 'example.operation', attributes: { input: 'demo' } },
  async (span) => {
    span.addEvent('example.started');
    span.setAttributes({ output_count: 3 });
  },
);

console.log(telemetry.getSpans());
```

`getSpans()` 按 span 开始顺序返回分离的快照。每个 `RecordedTelemetrySpan` 包含确定性的数字 ID、parent ID、合并后的 attribute、有序 event、最终 status、结算状态，以及确定性的结束序号。它不记录时间戳。

该 adapter 可以安全地作为普通 `TelemetryContext` 使用，但存储无界且是进程本地的。创建新实例以隔离测试或记录范围，并且除非调用方的数据策略允许，否则不要捕获敏感 attribute。

## Adapter 一致性 {#adapter-conformance}

`@earendil-works/pi-telemetry/testing` 导出一套与 runner 无关的一致性套件，建模为分组用例。Fixture 提供新的 context，并将其 backend 的已完成 span 转换成规范化的 `RecordedTelemetrySpan` 快照：

```typescript
import {
  createTelemetryAdapterConformance,
  type TelemetryAdapterFixture,
} from '@earendil-works/pi-telemetry/testing';
import { describe, it } from 'vitest';

const conformance = createTelemetryAdapterConformance(async () => {
  const adapter = createMyTelemetryAdapter();
  return {
    context: adapter.context,
    getSpans: async () => adapter.normalizedSpans(),
    async [Symbol.asyncDispose]() {
      await adapter.close();
    },
  } satisfies TelemetryAdapterFixture;
});

for (const group of new Set(conformance.map((testCase) => testCase.group))) {
  describe(group, () => {
    for (const testCase of conformance.filter((candidate) => candidate.group === group)) {
      it(testCase.name, () => testCase.run());
    }
  });
}
```

该套件检查同步的单次准入、结果与拒绝身份、自动与显式 status、attribute 合并、event 顺序、结算后的惰性调用、嵌套与并发的父子关系，以及对不可读 telemetry payload 失败的抑制。`getSpans()` 可以在返回前 flush 异步 exporter。Testing 子路径使用 Node 的断言 API；根 telemetry 包仍是运行时无关的。

## 带类型的 Schema {#typed-schemas}

底层 span API 有意接受开放的名称和 attribute 包，以便 adapter 保持通用。领域包可以定义封闭的、可序列化的 schema，并从中推断精确的 TypeScript 类型。

```typescript
import {
  createTypedSpanStarter,
  defineTelemetrySchema,
} from '@earendil-works/pi-telemetry';

export const EXAMPLE_TELEMETRY_SCHEMA = defineTelemetrySchema({
  version: 1,
  spans: {
    'example.read': {
      description: 'Read one resource',
      parents: { kind: 'any' },
      startAttributes: {
        'example.resource': {
          type: 'string',
          required: true,
          values: ['account', 'project'],
          description: 'Resource kind',
        },
      },
      endAttributes: {
        'example.item_count': {
          type: 'number',
          description: 'Number of returned items',
        },
      },
      events: {
        'example.cache': {
          description: 'Cache lookup result',
          attributes: {
            'example.cache.hit': {
              type: 'boolean',
              required: true,
              description: 'Whether the cache contained the resource',
            },
          },
        },
      },
      status: {
        default: 'ok',
        errorWhen: 'The read throws or returns an error result',
      },
    },
  },
} as const);

const startSpan = createTypedSpanStarter(
  telemetryContext,
  [EXAMPLE_TELEMETRY_SCHEMA],
);
```

Starter 为每个 span 暴露一个 overload，并在编译期检查名称和 attribute。联合值名称必须在调用前收窄，以保留每个运行时名称与其 attribute schema 之间的关系。其回调接收一个覆盖同一组 schema 的子 starter，已经绑定到回调 span：

```typescript
await startSpan(
  'example.read',
  { 'example.resource': 'account' },
  async (span, startChildSpan) => {
    span.addEvent('example.cache', { 'example.cache.hit': true });
    const accounts = await readAccounts();
    span.setAttributes({ 'example.item_count': accounts.length });

    await startChildSpan(
      'example.read',
      { 'example.resource': 'project' },
      async (childSpan) => {
        const projects = await readProjects();
        childSpan.setAttributes({ 'example.item_count': projects.length });
      },
    );

    return accounts;
  },
);
```

### 开始与完成属性 {#start-and-completion-attributes}

`startAttributes` 和 `endAttributes` 描述某个 attribute 通常何时已知，而不是分开的运行时存储：

| Schema 字段 | 值如何记录 | 是否必需 |
|---|---|---|
| `startAttributes` | 在创建 span 时作为带类型 starter 的 `attributes` 参数传入 | 每个定义显式设置 `required: true` 或 `false` |
| `endAttributes` | 稍后通过 schema 作用域 span 的 `setAttributes()` 方法添加 | 始终可选 |

两组都会成为同一 backend span 上的普通 attribute。没有单独的 end-attribute payload 或 end 回调。在前面的例子中，`example.resource` 在 `example.read` 开始时已知，而 `example.item_count` 只有在 `readAccounts()` 返回后才已知：

```typescript
await startSpan(
  'example.read',
  { 'example.resource': 'account' }, // 必需的 start attribute
  async (span) => {
    const accounts = await readAccounts();
    span.setAttributes({
      'example.item_count': accounts.length, // 可选的完成 attribute
    });
    return accounts;
  },
); // 解析回调会结算该 span
```

“End” 意味着完成期充实：end attribute 可以在回调活跃期间的任意时刻设置，也可以在不可用时省略。调用零次 `setAttributes()` 是有效的。这对早期失败、取消，以及并非每条路径都存在的 provider 特定数据很重要。

重复的 `setAttributes()` 调用会合并到同一 attribute 包中。同一键的后面已定义值会替换先前值，而 `undefined` 会被忽略。Schema 作用域方法只接受当前 span 声明的 end attribute。

Attribute 不会结束 span。从回调返回、resolve、抛出或拒绝控制结算；`startSpan()` 执行实际的结束操作。结算之后的 adapter 调用是惰性的。

Starter 可以组合多个独立版本化的 schema：

```typescript
import { AGENT_TELEMETRY_SCHEMAS } from '@earendil-works/pi-agent-core';

const startAgentSpan = createTypedSpanStarter(
  telemetryContext,
  AGENT_TELEMETRY_SCHEMAS,
);
```

内联 schema 数组会自动保留其 tuple 类型。单独声明的数组应使用 `as const`。数组中字面重复的 span 名称会在编译期被拒绝；schema 不会在运行时合并、检查或保留。

Schema 推导的类型会拒绝缺失的必需 attribute、未知键、无效的封闭集值、未声明的 event，以及空 schema 上的 attribute。End attribute 始终是可选充实；类型系统不要求必须调用 `setAttributes()`。

`defineTelemetrySchema()` 是带类型的恒等函数。它返回普通的 JSON 可序列化数据，不做运行时校验或 parent 规则强制。

## Schema 元数据 {#schema-metadata}

支持的 attribute 类型是：

- `string`、`number` 和 `boolean`；
- `string[]`、`number[]` 和 `boolean[]`。

Attribute 定义支持：

- `values`：标量值的封闭集；
- `elementValues`：数组元素的封闭集；
- `examples`：文档示例；
- `sensitive`：标记需要特殊处理的数据；
- `cardinality`：记录预期的 `low` 或 `high` 基数。

Start 和 event attribute 声明 `required`。End attribute 不声明；见 [开始与完成属性](#start-and-completion-attributes)。

Parent 元数据是描述性 schema 数据：

- `{ kind: 'any' }`：根或任意调用方 span；
- `{ kind: 'root_or_external' }`：根或 schema 之外由调用方拥有的 span；
- `{ kind: 'spans', spans: [...] }`：仅列出的 schema span。

Adapter 不需要理解 schema 对象。Instrumentation 辅助函数和测试用它们保持发出的名称和 attribute 一致。

## Pi 包集成 {#pi-package-integration}

包所有权有意拆分：

- `@earendil-works/pi-telemetry` 拥有供应商无关契约、no-op 与内存参考 context、schema 工具以及 adapter 一致性套件；
- `@earendil-works/pi-ai` 在 provider 请求选项中接受并传播 `telemetryContext`，但不拥有 telemetry schema；
- `@earendil-works/pi-agent-core` 拥有并导出 pi AI-request 与 harness schema、它们组合后的只读 schema tuple，以及带类型的 span 辅助函数。

```typescript
import {
  AGENT_TELEMETRY_SCHEMAS,
  AI_TELEMETRY_SCHEMA,
  HARNESS_TELEMETRY_SCHEMA,
  startAiSpan,
  startHarnessSpan,
} from '@earendil-works/pi-agent-core';
```

Pi schema 使用 pi 拥有的 `pi.ai.*`、`pi.harness.*` 和 `pi.session.*` 名称。Adapter 可以把它们翻译成 backend 约定，而不改变发出的 pi 词汇。

## 安全与可移植性 {#security-and-portability}

Telemetry 是进程本地诊断，不是持久应用状态。不要把 `TelemetryContext`、`TelemetrySpan` 或 backend 原生的 trace 对象持久化到记录、消息、快照或延迟句柄中。

Attribute 值有意限制为原始标量和数组。领域 instrumentation 应避免 prompt、completion、工具参数或输出、文件内容、provider payload、header、凭据以及自由形式的错误细节，除非其 schema 和数据策略明确允许。

本包不使用 `AsyncLocalStorage` 或其他运行时特定的环境 context API。它适用于 Node.js、Bun、浏览器和 worker；backend adapter 仍负责自己的运行时兼容性。

## API 参考 {#api-reference}

### 核心类型与值 {#core-types-and-values}

| 导出 | 用途 |
|---|---|
| `TelemetryContext` | 启动由回调管理的子 span |
| `TelemetrySpan` | 记录 attribute、event 和 status；也充当子 context |
| `SpanOptions` | Span 名称和可选的 start attribute |
| `SpanAttributes` / `AttributeValue` | 开放的 adapter 级 attribute 包及支持的值 |
| `SpanStatus` | 显式的 `ok` 或 `error` status |
| `NOOP_TELEMETRY_CONTEXT` | 用于禁用 telemetry 的共享被动 context |
| `InMemoryTelemetryContext` | 带确定性进程本地记录的参考 adapter |
| `RecordedTelemetrySpan` | 规范化的已捕获 span 快照 |
| `RecordedTelemetryEvent` | 规范化的已捕获 event 快照 |

### Schema 定义与推断 {#schema-definitions-and-inference}

| 导出 | 用途 |
|---|---|
| `defineTelemetrySchema()` | 面向可序列化 schema 数据的带类型恒等辅助函数 |
| `createTypedSpanStarter()` | 把 parent context 绑定到一个或多个 schema 词汇 |
| `TypedSpanStarter` | 带递归子绑定回调的精确 starter 类型 |
| `TelemetrySchemaDefinition` | 顶层 schema 形态 |
| `TelemetrySpanDefinition` | Span 元数据、parent、attribute、event 和 status 规则 |
| `TelemetryAttributeType` | 支持的标量和数组类型名 |
| `TelemetryAttributeMetadata` | 描述、敏感性和基数元数据 |
| `TelemetryAttributeDefinition` | Attribute 类型、允许值、示例和元数据 |
| `TelemetryStartAttributeDefinition` | 带是否必需的 start attribute 定义 |
| `TelemetryEventAttributeDefinition` | 带是否必需的 event attribute 定义 |
| `TelemetryEventDefinition` | Event 描述和 attribute 定义 |
| `TelemetryParentDefinition` | 开放、外部根或有限 schema-parent 规则 |
| `TelemetrySchemaSpanName` | 已声明 span 名称的联合 |
| `TelemetrySchemaSpanStartAttributes` | 单个 span 精确推断的 start attribute |
| `TelemetrySchemaSpanEndAttributes` | 单个 span 可选推断的 end attribute |
| `TelemetrySchemaSpanEventName` | 单个 span 声明的 event 联合 |
| `TelemetrySchemaSpanEventAttributes` | 单个 event 精确推断的 attribute |
| `SchemaTelemetrySpan` | 限制为单个 schema span 的 span 视图 |
| `TelemetrySchemaSpanUnion` | schema 中所有 span 的判别联合 |
| `InferStartAttributes` | 从 start 定义推断的必需与可选值 |
| `InferOptionalAttributes` | 从 end 定义推断的可选值 |
| `InferEventAttributes` | 从 event 定义推断的必需与可选值 |
| `InferRequiredAndOptionalAttributes` | 带是否必需的定义的共享推断工具 |
| `ExactTelemetryAttributes` | 拒绝期望 attribute 集之外的键 |

### Testing 子路径 {#testing-subpath}

| 导出 | 用途 |
|---|---|
| `createTelemetryAdapterConformance()` | 创建与 runner 无关的 adapter 一致性用例 |
| `TelemetryAdapterFixture` | 单个用例的新 context 与规范化快照读取器 |
| `TelemetryAdapterFixtureFactory` | 创建隔离 fixture |
| `TelemetryAdapterConformanceCase` | 测试 runner 执行的分组用例 |

## 开发 {#development}

在本包目录下：

```bash
npm test
npm run build
```

仓库范围的类型检查、格式化、lint 和 smoke 检查用：

```bash
npm run check
```

## 许可证 {#license}

MIT
