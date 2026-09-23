/**
 * Pi Squad extension: load a config, register, heartbeat, list_agents.
 *
 * PI_SQUAD_CONFIG selects a JSON file (role prompt + registration fields).
 * Without it, PI_SQUAD_AGENT_ID / ROLE / ID still register, with no role prompt.
 * Does not implement messaging, tasks, spawn, or depend on pi-agent-teams.
 */
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createControllerClient } from "./controller-client.ts";
import { isSetupReady, loadSquadSetup } from "./config.ts";
import { startHeartbeat, type HeartbeatHandle } from "./heartbeat.ts";
import { readRuntimeSessionId, registerAgent } from "./registration.ts";

export default function (pi: ExtensionAPI) {
  const setup = loadSquadSetup();
  const setupError = setup.ok ? undefined : "error" in setup ? setup.error : undefined;
  const identityReady = isSetupReady(setup);
  const env = identityReady ? setup.identity : undefined;
  const rolePrompt = identityReady ? setup.rolePrompt : undefined;
  const client = createControllerClient(env?.controllerUrl ?? "http://127.0.0.1:18741");

  let heartbeat: HeartbeatHandle | undefined;
  let generation = 0;
  let runtimeSessionId: string | undefined;
  let registered = false;
  let injectedSystemPrompt: string | undefined;

  const clearRuntime = () => {
    generation += 1;
    registered = false;
    injectedSystemPrompt = undefined;
    heartbeat?.stop();
    heartbeat = undefined;
  };

  const whoami = () => {
    if (!setup.ok) {
      return "error" in setup
        ? { ok: false as const, error: setup.error }
        : { ok: false as const, missing: setup.missing };
    }
    return {
      ok: true as const,
      source: setup.source,
      config_path: setup.configPath,
      agent_id: setup.identity.agentId,
      role: setup.identity.role,
      squad_id: setup.identity.squadId,
      controller_url: setup.identity.controllerUrl,
      space_id: setup.identity.spaceId,
      pane_id: setup.identity.paneId,
      role_prompt: setup.rolePrompt ?? "",
      registered,
      injected: Boolean(injectedSystemPrompt),
      role_prompt_in_system_prompt: Boolean(
        setup.rolePrompt && injectedSystemPrompt?.includes(setup.rolePrompt),
      ),
    };
  };

  pi.on("session_shutdown", () => {
    clearRuntime();
  });

  if (rolePrompt) {
    pi.on("before_agent_start", async (event) => {
      const systemPrompt = `${event.systemPrompt}\n\n## Pi Squad role\n${rolePrompt}`;
      injectedSystemPrompt = systemPrompt;
      return { systemPrompt };
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    clearRuntime();
    const myGen = generation;

    runtimeSessionId = readRuntimeSessionId(ctx.sessionManager);

    if (setupError) {
      ctx.ui.notify(`pi-squad: ${setupError}; register skipped`, "error");
      return;
    }
    if (!identityReady || !env) {
      const missing = !setup.ok && "missing" in setup ? setup.missing.join(", ") : "identity";
      ctx.ui.notify(`pi-squad: missing ${missing}; register skipped`, "warning");
      return;
    }

    try {
      const record = await registerAgent(client, env, runtimeSessionId);
      if (myGen !== generation) return;
      registered = true;
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

  pi.registerCommand("squad-whoami", {
    description: "Show the Pi Squad config loaded into this process, and whether its role prompt was appended",
    handler: async (_args, ctx) => {
      ctx.ui.notify(JSON.stringify(whoami()), "info");
    },
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
