/**
 * Pi Squad P0 extension: register + heartbeat + list_agents.
 *
 * Thin adapter only. Does not implement messaging, tasks, spawn, or
 * depend on pi-agent-teams / pi-intercom.
 */
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createControllerClient } from "./controller-client.ts";
import { startHeartbeat, type HeartbeatHandle } from "./heartbeat.ts";
import {
  isMissingIdentity,
  readIdentityEnv,
  readRuntimeSessionId,
  registerAgent,
} from "./registration.ts";

export default function (pi: ExtensionAPI) {
  const envOrMissing = readIdentityEnv();
  const identityReady = !isMissingIdentity(envOrMissing);
  const env = identityReady ? envOrMissing : undefined;
  const client = createControllerClient(env?.controllerUrl ?? "http://127.0.0.1:18741");

  let heartbeat: HeartbeatHandle | undefined;
  let generation = 0;
  let runtimeSessionId: string | undefined;

  const clearRuntime = () => {
    generation += 1;
    heartbeat?.stop();
    heartbeat = undefined;
  };

  pi.on("session_shutdown", () => {
    clearRuntime();
  });

  pi.on("session_start", async (_event, ctx) => {
    clearRuntime();
    const myGen = generation;

    runtimeSessionId = readRuntimeSessionId(ctx.sessionManager);

    if (!identityReady || !env) {
      ctx.ui.notify(
        `pi-squad: missing ${isMissingIdentity(envOrMissing) ? envOrMissing.missing.join(", ") : "identity"}; register skipped`,
        "warning",
      );
      return;
    }

    try {
      const record = await registerAgent(client, env, runtimeSessionId);
      if (myGen !== generation) return;
      ctx.ui.setStatus(
        "pi-squad",
        `${record.agent_id} ${record.status} (${record.role}/${record.squad_id})`,
      );
      heartbeat = startHeartbeat(
        client,
        env.agentId,
        env.heartbeatIntervalMs,
        () => runtimeSessionId,
        (err) => {
          if (myGen !== generation) return;
          ctx.ui.notify(`pi-squad heartbeat failed: ${String(err)}`, "warning");
        },
      );
    } catch (err) {
      if (myGen !== generation) return;
      ctx.ui.notify(`pi-squad register failed: ${String(err)}`, "error");
    }
  });

  pi.registerTool({
    name: "list_agents",
    label: "List Agents",
    description:
      "List logical agents in the Pi Squad controller registry. Offline agents remain visible with status=offline. Registry role is a routing label, not a system prompt.",
    parameters: Type.Object({
      agent_id: Type.Optional(Type.String({ description: "Exact agent_id" })),
      role: Type.Optional(Type.String({ description: "Registry role label" })),
      squad_id: Type.Optional(Type.String({ description: "Squad id" })),
      status: Type.Optional(StringEnum(["online", "offline"] as const)),
    }),
    async execute(_toolCallId, params) {
      const agents = await client.listAgents({
        agent_id: params.agent_id,
        role: params.role,
        squad_id: params.squad_id,
        status: params.status,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ agents }, null, 2) }],
        details: { agents },
      };
    },
  });
}
