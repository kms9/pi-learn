import type { ControllerClient, RegisterPayload } from "./controller-client.ts";

export type IdentityEnv = {
  cwd?: string;
  runtimeId?: string;
  runtimeToken?: string;
  previousSessionId?: string;
  roleDescription?: string;
  agentId: string;
  role: string;
  squadId: string;
  controllerUrl: string;
  herdrSessionId?: string;
  spaceId?: string;
  paneId?: string;
  heartbeatIntervalMs: number;
};

export type MissingIdentityError = {
  missing: string[];
};

const DEFAULT_CONTROLLER_URL = "http://127.0.0.1:18741";
const DEFAULT_HEARTBEAT_MS = 5000;

function firstEnv(env: NodeJS.ProcessEnv, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

/**
 * Read P0 identity from the process environment.
 * agent_id / role / squad_id are experiment-injected; Herdr only supplies
 * pane/workspace when present. herdr_session_id and runtime_session_id
 * stay empty unless a real value is provided — never fabricated.
 */
export function readIdentityEnv(env: NodeJS.ProcessEnv = process.env): IdentityEnv | MissingIdentityError {
  const missing: string[] = [];
  const agentId = firstEnv(env, "PI_SQUAD_AGENT_ID");
  const role = firstEnv(env, "PI_SQUAD_ROLE");
  const squadId = firstEnv(env, "PI_SQUAD_ID");
  if (!agentId) missing.push("PI_SQUAD_AGENT_ID");
  if (!role) missing.push("PI_SQUAD_ROLE");
  if (!squadId) missing.push("PI_SQUAD_ID");
  if (!agentId || !role || !squadId) return { missing };

  const intervalRaw = firstEnv(env, "PI_SQUAD_HEARTBEAT_INTERVAL_MS");
  const heartbeatIntervalMs = intervalRaw ? Number(intervalRaw) : DEFAULT_HEARTBEAT_MS;

  return {
    agentId,
    role,
    squadId,
    controllerUrl: firstEnv(env, "PI_SQUAD_CONTROLLER_URL") ?? DEFAULT_CONTROLLER_URL,
    herdrSessionId: firstEnv(env, "PI_SQUAD_HERDR_SESSION_ID", "HERDR_SESSION_NAME", "HERDR_SESSION"),
    spaceId: firstEnv(env, "HERDR_WORKSPACE_ID", "PI_SQUAD_SPACE_ID"),
    paneId: firstEnv(env, "HERDR_PANE_ID", "PI_SQUAD_PANE_ID"),
    heartbeatIntervalMs: Number.isFinite(heartbeatIntervalMs) && heartbeatIntervalMs > 0
      ? heartbeatIntervalMs
      : DEFAULT_HEARTBEAT_MS,
  };
}

export function isMissingIdentity(value: IdentityEnv | MissingIdentityError): value is MissingIdentityError {
  return Array.isArray((value as MissingIdentityError).missing);
}

/** Only report a session id that Pi actually returned. Empty/undefined is omitted. */
export function readRuntimeSessionId(sessionManager: { getSessionId?: () => string | undefined } | undefined): string | undefined {
  if (!sessionManager || typeof sessionManager.getSessionId !== "function") {
    return undefined;
  }
  try {
    const id = sessionManager.getSessionId();
    const trimmed = typeof id === "string" ? id.trim() : "";
    return trimmed || undefined;
  } catch {
    return undefined;
  }
}

export function buildRegisterPayload(env: IdentityEnv, runtimeSessionId?: string): RegisterPayload {
  return {
    agent_id: env.agentId,
    cwd: env.cwd,
    runtime_id: env.runtimeId,
    runtime_token: env.runtimeToken,
    previous_session_id: env.previousSessionId,
    role_description: env.roleDescription,
    role: env.role,
    squad_id: env.squadId,
    runtime_type: "pi",
    ...(env.herdrSessionId ? { herdr_session_id: env.herdrSessionId } : {}),
    ...(env.spaceId ? { space_id: env.spaceId } : {}),
    ...(env.paneId ? { pane_id: env.paneId } : {}),
    ...(runtimeSessionId ? { runtime_session_id: runtimeSessionId } : {}),
  };
}

export async function registerAgent(
  client: ControllerClient,
  env: IdentityEnv,
  runtimeSessionId?: string,
) {
  return client.register(buildRegisterPayload(env, runtimeSessionId));
}
