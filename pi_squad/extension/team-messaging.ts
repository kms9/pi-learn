import { randomUUID } from "node:crypto";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import type { Invocation } from "./invocation.ts";
import type { Binding } from "./protocol.ts";
import { toolResult } from "./task-tools.ts";

export function installTeamMessaging(runtime: Invocation): void {
  const { pi, client } = runtime;
  pi.registerTool({
    name: "read_inbox",
    label: "Read Squad Inbox",
    description:
      "Read current binding messages without triggering a model turn.",
    parameters: Type.Object({}),
    async execute() {
      return toolResult(await client.request("/v2/messages/inbox"));
    },
  });
  pi.registerTool({
    name: "get_message",
    label: "Get Squad Message",
    description: "Read an exact notice/reply visible to this binding.",
    parameters: Type.Object({ message_id: Type.String() }),
    async execute(_id, params) {
      const current = runtime.gate.current;
      if (
        current?.task.kind === "ask" &&
        params.message_id !== current.task.task_id
      )
        throw new Error("ASK_MESSAGE_SCOPE_MISMATCH");
      return toolResult(
        await client.request(
          `/v2/messages/${encodeURIComponent(params.message_id)}`,
        ),
      );
    },
  });
  pi.registerTool({
    name: "send_message",
    label: "Send Squad Message",
    description:
      "Send a passive notice; ask creates a managed, asynchronous Task with normal authorization and execution gates.",
    parameters: Type.Object({
      to_agent_id: Type.String(),
      kind: StringEnum(["notice", "ask"] as const),
      text: Type.String(),
      request_id: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      const request = params.request_id ?? randomUUID();
      if (params.kind === "ask") {
        const current = runtime.gate.current;
        if (current) throw new Error("USE_AGENT_INVOKE_WITH_CURRENT_SCOPE");
        return toolResult(
          await client.request("/v2/tasks/direct", {
            request_id: request,
            target: params.to_agent_id,
            kind: "ask",
            goal: params.text,
            write_set: [],
          }),
        );
      }
      const snapshot = await client.snapshot();
      const target = snapshot.views.agents.find(
        (a) => (a.binding as Binding).agent_id === params.to_agent_id,
      );
      if (!target) throw new Error("AGENT_NOT_FOUND");
      return toolResult(
        await client.request("/v2/messages/send", {
          request_id: request,
          target: params.to_agent_id,
          expected_target: target.binding,
          kind: "notice",
          text: params.text,
        }),
      );
    },
  });
  pi.registerTool({
    name: "reply_message",
    label: "Reply to Squad Message",
    description:
      "Reply to an exact passive message or propose the current managed ask answer; publication waits for settled.",
    parameters: Type.Object({
      message_id: Type.String(),
      text: Type.String(),
      request_id: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      const current = runtime.gate.current;
      if (current?.task.kind === "ask") {
        if (params.message_id !== current.task.task_id)
          throw new Error("ASK_MESSAGE_SCOPE_MISMATCH");
        await runtime.event("result_proposed", {
          result: {
            goal_revision: current.task.applied_revision,
            value: { answer: params.text },
            artifacts: [],
            refs: [],
          },
        });
        return toolResult({
          state: "reply_proposed",
          message_id: current.task.task_id,
          next: "End this turn; reply is published only after matching settled.",
        });
      }
      const original = await client.request<{ from: Binding }>(
        `/v2/messages/${encodeURIComponent(params.message_id)}`,
      );
      return toolResult(
        await client.request("/v2/messages/send", {
          request_id: params.request_id ?? `reply:${params.message_id}`,
          target: original.from.agent_id,
          expected_target: original.from,
          kind: "reply",
          text: params.text,
          reply_to: params.message_id,
        }),
      );
    },
  });
}
