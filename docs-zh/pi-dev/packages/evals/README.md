本文是 `README.md` 的中文阅读版；命令、路径、API 名称保持英文。

# Pi evals {#pi-evals}

Pi evals 是面向 Pi 工作流的、由模型支撑的行为检查。它们把真实的 `AgentSession` 适配到 `vitest-evals`，在隔离的临时项目和 agent 目录中运行，并附上原生 Pi session artifact。
用它们衡量端到端行为，并比较 prompt、工具、技能、模型或其他 harness 配置。

## 运行 evals {#running-evals}

从仓库根目录用默认 provider 和 model 运行：

```bash
npm run eval -- --provider openai --model gpt-5.6-sol
```

等价的环境变量是：

```bash
PI_PROVIDER=openai PI_MODEL=gpt-5.6-sol npm run eval
```

CLI 值优先，并成为未显式选择模型的 harness 的默认值。Provider 和 model 必须一起提供。当每个被执行的 harness 都自行配置模型时，runner 也允许没有默认值。
认证来自 Pi 常规的 `ModelRuntime`，包括 Pi 订阅凭据和 provider API-key
环境变量。

额外参数会转发给 Vitest：

```bash
npm run eval -- src/extensions.eval.ts
npm run eval -- -t "creates, reloads, and uses"
```

每次调用都会打印一个被忽略的 `.eval/` artifact 目录。`runs.jsonl` 索引已完成的 harness run，以及它们在 `sessions/` 下的原生 Pi session JSONL 附件。这些文件可能包含 prompt、响应、源代码和工具输出。

## 编写 evals {#writing-evals}

关于通用 suite、judge、assertion 以及规范化 trace 的指导，请遵循 [`vitest-evals`](https://github.com/getsentry/vitest-evals)。Pi 专用 evals 使用来自 `src/pi-harness.ts` 的 `createPiCodingAgentHarness(...)`，每个 `describeEval(...)` suite 绑定一个 harness：

```ts
import { expect } from "vitest";
import { describeEval } from "vitest-evals";
import { createPiCodingAgentHarness } from "./pi-harness.ts";

const harness = createPiCodingAgentHarness({ noTools: "all" });

describeEval("Pi smoke", { harness }, (it) => {
	it("answers a factual question", async ({ run }) => {
		const result = await run("What is the capital of France? Reply with only the city name.");
		expect(result.output).toBe("Paris");
	});
});
```

### 配置 Pi harness {#configuring-the-pi-harness}

`createPiCodingAgentHarness(...)` 接受：

- `name`：报告和比较使用的稳定 harness 身份。
- `model`：可选的 `{ provider, id }` 选择。它会覆盖 runner 的默认模型。
- `noTools`：Pi 的工具禁用配置。
- `transformSystemPrompt`：在 eval 开始前变换完整的默认 prompt。
- `output`：把最终响应和 `AgentSession` 变换为 JSON-safe 的领域结果。

显式选择的模型使模型比较 harness 独立于 runner 默认值：

```ts
const harness = createPiCodingAgentHarness({
	name: "claude-opus-4-6",
	model: { provider: "anthropic", id: "claude-opus-4-6" },
});
```

一次 run 可以接受单个 prompt，或一串 prompt 与 reload 步骤。当前面的 prompt 创建或更改 Pi 资源时，reload 步骤很有用：

```ts
const result = await run([
	{ type: "prompt", content: "Create a Pi extension." },
	{ type: "reload" },
	{ type: "prompt", content: "Use the extension." },
]);
```

### 变换 harness 输出 {#transforming-harness-output}

使用 `output` 暴露场景特定的、JSON-safe 行为，而不把该行为加入通用 Pi adapter：

```ts
const harness = createPiCodingAgentHarness({
	output: ({ response, session }) => ({
		response,
		activeTools: session.getActiveToolNames(),
		extensionErrors: session.resourceLoader.getExtensions().errors,
	}),
});
```

在 `result.output` 上断言应用行为。在 `result.session` 上断言模型和工具 trace，使用
`vitest-evals` 的辅助函数，例如 `toolCalls(...)`。

### 编写比较性 eval 集 {#writing-comparative-eval-sets}

把 `evalHarnessTable(...)` 与 Vitest 原生的 `describe.for(...)` 一起使用，以便用多个 harness 跑同一组输入。
Harness 可以在 prompt、工具、技能、模型或任何其他 Pi 配置上不同：

```ts
import { describe } from "vitest";
import { createJudge, describeEval } from "vitest-evals";
import { evalHarnessTable } from "./vitest-evals/harness-table.ts";

const TargetTaskJudge = createJudge<string, string>("TargetTaskJudge", ({ output }) => ({
	score: output === "expected result" ? 1 : 0,
}));

const harnessTable = evalHarnessTable(
	"target skill effectiveness",
	{
		baseline: withoutTargetSkillHarness,
		candidate: withTargetSkillHarness,
		repetitions: 6,
	},
);

describe.for(harnessTable)("$name repetition $repetition", ({ harness }) => {
	describeEval("target skill effectiveness", { harness, judges: [TargetTaskJudge], judgeThreshold: null }, (it) => {
		it("completes the target task", async ({ run }) => {
			await run("Complete the target task.");
		});
	});
});
```

比较性 suite 应当用确定性或模型支撑的 judge 记录正确性，并设置 `judgeThreshold: null`。
这样低分只是观察结果，而不会让 Vitest 调用失败。硬断言只用于 suite 不变量和基础设施契约。`expect.soft(...)` 仍会使测试失败，不是计分机制。

Pi harness 在删除临时工作区之前会快照原生 session JSONL。一个仅用于 eval 的 `afterEach` hook
会在 reporter 运行之前，把该快照登记到显式的 Vitest test task。

Harness 名称在一个 eval 集内必须稳定且唯一。分组键把 repetition 与非空字符串
`input.id`（若可用）组合；否则与输入的严格规范 JSON 的 SHA-256 哈希组合。用 `candidate` 表示一种处理，
或用 `candidates` 表示多种处理。每个 candidate 只与声明的 baseline 比较。对于每个匹配的
input 和 repetition，reporter 根据每次 run 记录的平均 judge 分数计算通过率提升，把至少为 `1` 的分数视为通过。Lift 是 candidate 通过率减去 baseline 通过率，单位为百分点。缺失的
judge 分数报告为不完整观察。Token、延迟和估计成本仍是单独的
candidate 减 baseline 成对 delta；缺失的 telemetry 仍不可用。如果执行顺序随机化变得
必要，请使用 Vitest 内置的 sequence shuffling。

关于比较性 eval 方法、repetition 策略、可信 judge 以及 telemetry 解读，见 [`skill-eval-harness`](https://github.com/adewale/skill-eval-harness/) 的指导。
