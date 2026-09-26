/** Markdown role discovery, process identity, registration and heartbeat. */
import { createConnectionNotices } from "./connection-notices.ts";
import { installMessaging } from "./messaging.ts";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { truncateHead, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { ControllerError, createControllerClient } from "./controller-client.ts";
import { isSetupReady } from "./config.ts";
import { getProcessSetup } from "./runtime.ts";
import { startHeartbeat, type HeartbeatHandle } from "./heartbeat.ts";
import { readRuntimeSessionId, registerAgent } from "./registration.ts";

function discoveryText(value: unknown): string {
  const output = truncateHead(JSON.stringify(value, null, 2));
  return output.content + (output.truncated
    ? "\n[Output truncated. Narrow list_agents with role/squad_id/status, then use get_agent with an exact agent_id.]"
    : "");
}

export default function (pi: ExtensionAPI) {
  const processSetup = getProcessSetup();
  const { setup, cwd, runtimeId, runtimeToken } = processSetup;
  const setupError = setup.ok ? undefined : "error" in setup ? setup.error : undefined;
  const identityReady = isSetupReady(setup);
  const env = identityReady ? { ...setup.identity, cwd, runtimeId, runtimeToken, roleDescription: setup.roleDescription } : undefined;
  const rolePrompt = identityReady ? setup.rolePrompt : undefined;
  const client = createControllerClient(env?.controllerUrl ?? (process.env.PI_SQUAD_CONTROLLER_URL?.trim() || "http://127.0.0.1:18741"));

  const connectionNotices = createConnectionNotices();
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
        : "missing" in setup
          ? { ok: false as const, missing: setup.missing, cwd, runtime_id: runtimeId }
          : { ok: false as const, disabled: true, cwd, runtime_id: runtimeId };
    }
    return {
      ok: true as const,
      source: setup.source,
      config_path: setup.configPath,
      role_dir: setup.roleDir,
      roles_root: setup.rolesRoot,
      role_id: setup.identity.role,
      role_description: setup.roleDescription,
      cwd,
      runtime_id: runtimeId,
      runtime_session_id: runtimeSessionId,
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
    connectionNotices.reset((text, level) => ctx.ui.notify(text, level));
    const myGen = generation;

    runtimeSessionId = readRuntimeSessionId(ctx.sessionManager);

    if (setupError) {
      ctx.ui.notify(`pi-squad: ${setupError}; register skipped`, "error");
      return;
    }
    if (!setup.ok && "disabled" in setup) return;
    if (!identityReady || !env) {
      const missing = !setup.ok && "missing" in setup ? setup.missing.join(", ") : "identity";
      ctx.ui.notify(`pi-squad: missing ${missing}; register skipped`, "warning");
      return;
    }

    try {
      const record = await registerAgent(client, { ...env, previousSessionId: processSetup.sessionId }, runtimeSessionId);
      if (myGen !== generation) return;
      processSetup.sessionId = runtimeSessionId;
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
          if (err instanceof ControllerError && (err.status === 409 || err.status === 404)) { registered = false; heartbeat?.stop(); }
          connectionNotices.failed("heartbeat", err);
        },
        runtimeId,
        runtimeToken,
        () => { if (myGen === generation) connectionNotices.healthy("heartbeat"); },
      );
    } catch (err) {
      if (myGen !== generation) return;
      ctx.ui.notify(`pi-squad register failed: ${String(err)}`, "error");
    }
  });

  installMessaging(pi, client, () => {
    if (!registered || !env || !runtimeSessionId) throw new Error("pi-squad: no registered runtime binding");
    return { agent_id: env.agentId, runtime_id: runtimeId, runtime_session_id: runtimeSessionId, runtime_token: runtimeToken };
  }, processSetup.deliveries, connectionNotices);

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
      "Discover agents through the controller. Filter by role, squad_id and status=online to find candidates; role may match multiple agents. Use the returned agent_id with get_agent for an exact lookup. No filters lists all records, including self and offline agents. Discovery does not send messages.",
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
        content: [{ type: "text" as const, text: discoveryText({ agents }) }],
        details: { agents },
      };
    },
  });

  pi.registerTool({
    name: "get_agent",
    label: "Get Agent",
    description:
      "Look up one agent by its exact agent_id from list_agents. Returns current registry metadata including role, squad_id, online/offline status, cwd, runtime_id and Pi session id when available. Offline records remain queryable; unknown IDs are errors. Does not select by role, send messages, or reserve the target runtime.",
    parameters: Type.Object({
      agent_id: Type.String({ minLength: 1, description: "Exact agent_id returned by list_agents; not a role name or Herdr pane ID" }),
    }),
    async execute(_toolCallId, params, signal) {
      try {
        const agent = await client.getAgent(params.agent_id, signal);
        return {
          content: [{ type: "text" as const, text: discoveryText({ agent }) }],
          details: { agent },
        };
      } catch (err) {
        if (err instanceof ControllerError && err.status === 404) {
          throw new Error(`Agent not found: ${params.agent_id.trim()}. Use list_agents to discover available agent_id values.`);
        }
        throw err;
      }
    },
  });

}
