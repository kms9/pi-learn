import { readFileSync } from "node:fs";
import path from "node:path";

import {
  isMissingIdentity,
  readIdentityEnv,
  type IdentityEnv,
} from "./registration.ts";

/** One variable selects which JSON config this Pi process loads. */
export const CONFIG_ENV = "PI_SQUAD_CONFIG";
const MAX_CONFIG_BYTES = 64 * 1024;
const DEFAULT_CONTROLLER_URL = "http://127.0.0.1:18741";
const DEFAULT_HEARTBEAT_MS = 5000;

export type SquadSetup =
  | {
      ok: true;
      source: "config" | "env";
      identity: IdentityEnv;
      rolePrompt?: string;
      configPath?: string;
    }
  | { ok: false; missing: string[] }
  | { ok: false; error: string };

export function isSetupReady(value: SquadSetup): value is Extract<SquadSetup, { ok: true }> {
  return value.ok === true;
}

function envValue(env: NodeJS.ProcessEnv, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function stringField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function positiveMs(value: unknown): number | undefined {
  const n = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Load identity and the optional role prompt.
 *
 * `PI_SQUAD_CONFIG` is a filesystem path. When set, agent_id / role / squad_id /
 * role_prompt come only from that file, so two processes can load two configs
 * by changing one variable. Placement (controller URL, heartbeat, Herdr ids)
 * still prefers the process environment, because those belong to where the
 * process was started, not to the persona file.
 *
 * When the variable is unset, fall back to PI_SQUAD_AGENT_ID / ROLE / ID and
 * do not invent a role prompt.
 */
export function loadSquadSetup(env: NodeJS.ProcessEnv = process.env): SquadSetup {
  const configPath = env[CONFIG_ENV]?.trim();
  if (!configPath) {
    const identity = readIdentityEnv(env);
    if (isMissingIdentity(identity)) return { ok: false, missing: identity.missing };
    return { ok: true, source: "env", identity };
  }

  const resolved = path.resolve(configPath);
  let raw: string;
  try {
    raw = readFileSync(resolved, "utf8");
  } catch (err) {
    return {
      ok: false,
      error: `cannot read ${CONFIG_ENV}=${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (Buffer.byteLength(raw) > MAX_CONFIG_BYTES) {
    return { ok: false, error: `${CONFIG_ENV} file exceeds ${MAX_CONFIG_BYTES} bytes: ${resolved}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      error: `${CONFIG_ENV} is not JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: `${CONFIG_ENV} must be a JSON object: ${resolved}` };
  }

  const file = parsed as Record<string, unknown>;
  if (file.role_prompt !== undefined && typeof file.role_prompt !== "string") {
    return { ok: false, error: `${CONFIG_ENV} role_prompt must be a string: ${resolved}` };
  }

  const missing: string[] = [];
  const agentId = stringField(file.agent_id);
  const role = stringField(file.role);
  const squadId = stringField(file.squad_id);
  if (!agentId) missing.push("agent_id");
  if (!role) missing.push("role");
  if (!squadId) missing.push("squad_id");
  if (missing.length > 0) {
    return { ok: false, error: `${CONFIG_ENV} missing ${missing.join(", ")}: ${resolved}` };
  }

  return {
    ok: true,
    source: "config",
    configPath: resolved,
    rolePrompt: stringField(file.role_prompt),
    identity: {
      agentId,
      role,
      squadId,
      controllerUrl: envValue(env, "PI_SQUAD_CONTROLLER_URL")
        ?? stringField(file.controller_url)
        ?? DEFAULT_CONTROLLER_URL,
      herdrSessionId: envValue(env, "PI_SQUAD_HERDR_SESSION_ID", "HERDR_SESSION_NAME", "HERDR_SESSION")
        ?? stringField(file.herdr_session_id),
      spaceId: envValue(env, "HERDR_WORKSPACE_ID", "PI_SQUAD_SPACE_ID") ?? stringField(file.space_id),
      paneId: envValue(env, "HERDR_PANE_ID", "PI_SQUAD_PANE_ID") ?? stringField(file.pane_id),
      heartbeatIntervalMs: positiveMs(env.PI_SQUAD_HEARTBEAT_INTERVAL_MS)
        ?? positiveMs(file.heartbeat_interval_ms)
        ?? DEFAULT_HEARTBEAT_MS,
    },
  };
}
