import { randomUUID } from "node:crypto";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { truncateHead } from "@earendil-works/pi-coding-agent";
import type { Invocation } from "./invocation.ts";
import type { Attempt, TaskContract, Snapshot } from "./protocol.ts";
import { runStatus } from "./context-assembly.ts";

export function toolResult(value: unknown) {
  const output = truncateHead(JSON.stringify(value, null, 2));
  return {
    content: [
      {
        type: "text" as const,
        text:
          output.content +
          (output.truncated ? "\n[truncated; use exact task query]" : ""),
      },
    ],
    details: value,
  };
}
export function installTaskTools(runtime: Invocation): void {
  const { pi, client } = runtime;
  pi.registerTool({
    name: "squad_run_get",
    label: "Read Run",
    description:
      "Read fresh Run revision, task states/results/acceptance and blockers from one snapshot. Use the top-level revision for squad_decide; refresh before deciding from old briefing state.",
    parameters: Type.Object({ run_id: Type.String() }),
    async execute(_id, params) {
      return toolResult(
        runStatus(await client.request<Snapshot>("/v2/snapshot"), params.run_id),
      );
    },
  });

  pi.registerTool({
    name: "agent_clarify",
    label: "Ask Parent Clarification",
    description:
      "Yield the child segment and request a capacity-limited response from its parent; end this turn after success.",
    parameters: Type.Object({ question: Type.String() }),
    async execute(_id, params) {
      const current = runtime.gate.current;
      if (!current) throw new Error("CURRENT_CHILD_REQUIRED");
      await runtime.serial(async () => {
        const checkCurrent = runtime.captureExecutionFence();
        const attempt = await client.request<Attempt>(
          `/v2/attempts/${current.attempt.attempt_id}/clarify`,
          {
            request_id: randomUUID(),
            expected_revision: current.attempt.revision,
            question: params.question,
          },
        );
        checkCurrent();
        current.attempt = attempt;
      });
      return toolResult({
        state: "clarification_requested",
        next: "End this turn; do not wait or poll.",
      });
    },
  });
  pi.registerTool({
    name: "agent_clarification_answer",
    label: "Answer Child Clarification",
    description:
      "Answer only the current response-only clarification; end this turn after success.",
    parameters: Type.Object({ answer: Type.String() }),
    async execute(_id, params) {
      await runtime.event("clarification_answer", { answer: params.answer });
      return toolResult({
        state: "answer_proposed",
        next: "End this response-only segment.",
      });
    },
  });

  pi.registerTool({
    name: "agent_task_get",
    label: "Get Task",
    description: "Read a formal task without starting work.",
    parameters: Type.Object({ task_id: Type.String() }),
    async execute(_id, params) {
      return toolResult(
        await client.request(`/v2/tasks/${encodeURIComponent(params.task_id)}`),
      );
    },
  });
  pi.registerTool({
    name: "agent_task_complete",
    label: "Propose Task Result",
    description:
      "Propose structured output. Controller only completes after this Pi settles; this is not business acceptance.",
    parameters: Type.Object({
      value: Type.Unknown(),
      artifacts: Type.Optional(
        Type.Array(
          Type.Object({
            path: Type.String(),
            sha256: Type.String(),
            length: Type.Optional(Type.Integer()),
          }),
        ),
      ),
      refs: Type.Optional(
        Type.Array(
          Type.Object({
            task_id: Type.String(),
            result_revision: Type.Number(),
            hash: Type.String(),
          }),
        ),
      ),
    }),
    async execute(_id, params) {
      const current = runtime.gate.current;
      if (!current || current.task.kind === "leader_step")
        throw new Error("CURRENT_WORKER_TASK_REQUIRED");
      await runtime.event("result_proposed", {
        result: {
          goal_revision: current.task.applied_revision,
          value: params.value,
          artifacts: params.artifacts ?? [],
          refs: params.refs ?? [],
        },
      });
      return toolResult({
        state: "result_proposed",
        task_id: current.task.task_id,
        next: "End this turn and wait for settled; do not claim accepted.",
      });
    },
  });
  pi.registerTool({
    name: "agent_task_yield",
    label: "Yield Task",
    description:
      "Yield the current execution segment to declared children. End this turn after yielding; do not poll.",
    parameters: Type.Object({}),
    async execute() {
      await runtime.event("yield");
      return toolResult({
        state: "yield_requested",
        next: "End this turn. Controller waits for settled before dispatching children.",
      });
    },
  });
  pi.registerTool({
    name: "agent_invoke",
    label: "Invoke Agent",
    description:
      "Asynchronously invoke a child in current scope, or a preauthorized standalone root. Returns task_id; never blocks waiting for model output.",
    parameters: Type.Object({
      target: Type.String({
        description: "Bare role_id for a Team-scoped child; bare agent_id for standalone work. Do not use the CLI-only role: or agent: prefixes. Scope is inherited from the current task, not selected by this field.",
      }),
      goal: Type.String(),
      kind: Type.Optional(StringEnum(["execute", "review", "ask"] as const)),
      write_set: Type.Optional(Type.Array(Type.String())),
      expected_output: Type.Optional(Type.Unknown()),
      acceptance: Type.Optional(Type.Unknown()),
      refs: Type.Optional(
        Type.Array(
          Type.Object({
            task_id: Type.String(),
            result_revision: Type.Number(),
            hash: Type.String(),
          }),
        ),
      ),
      dependencies: Type.Optional(
        Type.Array(
          Type.Object({
            task_id: Type.String(),
            condition: StringEnum([
              "execution_completed",
              "acceptance_accepted",
              "review_rejected",
            ] as const),
          }),
        ),
      ),
    }),
    async execute(_id, params) {
      const current = runtime.gate.current;
      if (current?.task.kind === "leader_step")
        throw new Error("LEADER_MUST_USE_SQUAD_DECIDE");
      const route = current
        ? `/v2/tasks/${encodeURIComponent(current.task.task_id)}/children`
        : "/v2/tasks/direct";
      const result = await runtime.serial(async () => {
        const checkCurrent = runtime.captureExecutionFence();
        if (current) {
          const task = await client.request<TaskContract>(
            `/v2/tasks/${encodeURIComponent(current.task.task_id)}`,
          );
          checkCurrent();
          current.task = task;
        }
        const result = await client.request(route, {
          request_id: randomUUID(),
          target: params.target,
          goal: params.goal,
          kind: params.kind ?? "execute",
          write_set: params.write_set ?? [],
          expected_output: params.expected_output,
          acceptance: params.acceptance,
          refs: params.refs,
          dependencies: params.dependencies,
          expected_revision: current?.task.revision,
        });
        checkCurrent();
        if (current) {
          const task = await client.request<TaskContract>(
            `/v2/tasks/${encodeURIComponent(current.task.task_id)}`,
          );
          checkCurrent();
          current.task = task;
        }
        return result;
      });
      return toolResult(result);
    },
  });
  pi.registerTool({
    name: "squad_run_create",
    label: "Create Team Run",
    description:
      "Create an explicit Run for this idle Team Leader; does not spawn processes.",
    parameters: Type.Object({
      goal: Type.String(),
      workflow_id: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      if (runtime.identity.mode !== "leader" || runtime.gate.current)
        throw new Error("IDLE_LEADER_REQUIRED");
      return toolResult(
        await client.request("/v2/runs", {
          request_id: randomUUID(),
          team_id: runtime.identity.teamID,
          goal: params.goal,
          workflow_id: params.workflow_id,
        }),
      );
    },
  });
  pi.registerTool({
    name: "squad_decide",
    label: "Team Decision",
    description:
      "Submit a revision-checked dispatch plan, wait, or completion intent from current LeaderStep. End the turn after success.",
    parameters: Type.Object({
      action: StringEnum(["dispatch", "wait", "complete"] as const),
      expected_revision: Type.Number(),
      note: Type.String(),
      tasks: Type.Optional(
        Type.Array(
          Type.Object({
            rework_of: Type.Optional(Type.String()),
            id: Type.String(),
            role_ref: Type.String(),
            kind: StringEnum(["execute", "review", "rework", "ask"] as const),
            goal: Type.String(),
            depends_on: Type.Array(
              Type.Object({
                step: Type.String(),
                condition: StringEnum([
                  "execution_completed",
                  "acceptance_accepted",
                  "review_rejected",
                ] as const),
              }),
            ),
            write_set: Type.Optional(Type.Array(Type.String())),
            expected_output: Type.Optional(Type.Unknown()),
            acceptance: Type.Optional(Type.Unknown()),
            refs: Type.Optional(
              Type.Array(
                Type.Object({
                  task_id: Type.String(),
                  result_revision: Type.Number(),
                  hash: Type.String(),
                }),
              ),
            ),
          }),
        ),
      ),
    }),
    async execute(_id, params) {
      const current = runtime.gate.current;
      if (
        !current ||
        current.task.kind !== "leader_step" ||
        !current.task.run_id
      )
        throw new Error("CURRENT_LEADER_STEP_REQUIRED");
      const result = await runtime.serial(async () => {
        const checkCurrent = runtime.captureExecutionFence();
        const result = await client.request(
          `/v2/runs/${current.task.run_id}/decisions`,
          {
            ...params,
            tasks: params.tasks ?? [],
            request_id: randomUUID(),
            attempt_id: current.attempt.attempt_id,
          },
        );
        checkCurrent();
        const attempt = await client.request<Attempt>(
          `/v2/attempts/${current.attempt.attempt_id}`,
        );
        checkCurrent();
        current.attempt = attempt;
        return result;
      });
      return toolResult(result);
    },
  });
}
