import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import type { Invocation } from "./invocation.ts";
import type { Binding } from "./protocol.ts";
import { toolResult } from "./task-tools.ts";
export function installIdentityTools(runtime: Invocation): void {
  runtime.pi.registerTool({
    name: "list_agents",
    label: "List Agents",
    description:
      "Read current Project Agent identity, presence, activity and Primary/Secondary qualification. This does not authorize invocation.",
    parameters: Type.Object({
      agent_id: Type.Optional(Type.String()),
      role: Type.Optional(Type.String()),
      squad_id: Type.Optional(Type.String()),
      status: Type.Optional(
        StringEnum(["online", "suspect", "offline"] as const),
      ),
    }),
    async execute(_id, p) {
      const snapshot = await runtime.client.snapshot();
      const agents = snapshot.views.agents.filter(
        (a) =>
          (!p.agent_id || (a.binding as Binding).agent_id === p.agent_id) &&
          (!p.role || a.role_id === p.role) &&
          (!p.squad_id || a.team_id === p.squad_id) &&
          (!p.status || a.presence === p.status),
      );
      return toolResult({
        agents,
        revision: snapshot.revision,
        observed_at: snapshot.observed_at,
      });
    },
  });
  runtime.pi.registerTool({
    name: "get_agent",
    label: "Get Agent",
    description: "Read an exact stable Agent ID and current runtime binding.",
    parameters: Type.Object({ agent_id: Type.String() }),
    async execute(_id, p) {
      const snapshot = await runtime.client.snapshot();
      const agent = snapshot.views.agents.find(
        (a) => (a.binding as Binding).agent_id === p.agent_id,
      );
      if (!agent) throw new Error("AGENT_NOT_FOUND");
      return toolResult({
        agent,
        revision: snapshot.revision,
        observed_at: snapshot.observed_at,
      });
    },
  });
}
