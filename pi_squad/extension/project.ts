import { strictJSON } from "./strict-json.ts";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { parseRoleFile, type RoleProfile } from "./config.ts";

export const PROTOCOL = "pi-squad/2";
export const validID = (value: string) => /^[a-z][a-z0-9-]*$/.test(value);
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export type Discovery = {
  schema_version: number;
  protocol_version: string;
  controller_id: string;
  controller_epoch: number;
  project_root: string;
  endpoint: string;
  pid: number;
};
export type ProjectIdentity = {
  root: string;
  mode: "role" | "leader";
  agentID: string;
  roleID?: string;
  teamID?: string;
  role?: RoleProfile;
  roleHash: string;
};

export function exactPath(root: string, relative: string): string {
  if (path.isAbsolute(relative))
    throw new Error("absolute configuration path rejected");
  let current = root;
  for (const part of relative.split("/")) {
    if (
      !part ||
      part === "." ||
      part === ".." ||
      !readdirSync(current).includes(part)
    )
      throw new Error(`missing exact configuration path: ${relative}`);
    current = path.join(current, part);
  }
  const real = realpathSync(current);
  if (!within(root, real))
    throw new Error(`configuration escapes Project: ${relative}`);
  return real;
}
export function within(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return (
    !path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${path.sep}`)
  );
}
export function findProject(cwd: string): string {
  let current = realpathSync(cwd);
  while (true) {
    try {
      const found = exactPath(current, ".agents/pisquad");
      if (!lstatSync(found).isDirectory())
        throw new Error("pisquad must be a directory");
      return current;
    } catch (error) {
      // A case alias or escaping symlink at this level must not fall through.
      try {
        lstatSync(path.join(current, ".agents/pisquad"));
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code !== "ENOENT")
          throw statError;
        const next = path.dirname(current);
        if (next === current) break;
        current = next;
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    "PROJECT_NOT_FOUND: migrate .agents/roles explicitly to .agents/pisquad",
  );
}
export function readIdentity(
  env = process.env,
  cwd = process.cwd(),
): ProjectIdentity | undefined {
  const mode = env.PI_SQUAD_MODE?.trim();
  if (!mode) return undefined;
  if (mode !== "leader" && mode !== "role")
    throw new Error("PI_SQUAD_MODE must be leader or role");
  const agentID = env.PI_SQUAD_AGENT_ID?.trim() ?? "";
  if (!validID(agentID))
    throw new Error("PI_SQUAD_AGENT_ID must be a stable lowercase ID");
  const root = findProject(cwd);
  if (mode === "leader") {
    const teamID = env.PI_SQUAD_TEAM_ID?.trim() ?? "";
    if (!validID(teamID))
      throw new Error("PI_SQUAD_TEAM_ID required for leader");
    return { root, mode, agentID, teamID, roleHash: "" };
  }
  const roleID = env.PI_SQUAD_ROLE_ID?.trim() ?? "";
  if (!validID(roleID)) throw new Error("PI_SQUAD_ROLE_ID required for role");
  const file = exactPath(root, `.agents/pisquad/roles/${roleID}/role.md`);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(
    readFileSync(file),
  );
  const role = parseRoleFile(text, file);
  if (role.name !== roleID)
    throw new Error("role name must match its directory");
  exactPath(root, `.agents/pisquad/roles/${roleID}/agents.md`);
  return { root, mode, agentID, roleID, role, roleHash: hash(text) };
}
export function discovery(root: string): Discovery {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(
    readFileSync(exactPath(root, ".agents/pisquad/.runtime/controller.json")),
  );
  const d = strictJSON(text, [
    "schema_version",
    "protocol_version",
    "controller_id",
    "controller_epoch",
    "project_root",
    "endpoint",
    "pid",
  ]) as Discovery;
  const url = new URL(d.endpoint);
  if (
    d.schema_version !== 1 ||
    d.protocol_version !== PROTOCOL ||
    d.project_root !== root ||
    !d.controller_id ||
    !Number.isInteger(d.controller_epoch) ||
    d.controller_epoch < 1 ||
    url.hostname !== "127.0.0.1" ||
    url.protocol !== "http:" ||
    !url.port ||
    url.username ||
    url.password ||
    d.endpoint !== url.origin ||
    !Number.isInteger(d.pid) ||
    d.pid < 1
  )
    throw new Error("invalid Project discovery");
  return d;
}
export function readOperatorToken(root: string): string {
  const file = exactPath(root, ".agents/pisquad/.runtime/operator.token");
  const stat = lstatSync(file);
  if (!stat.isFile() || (stat.mode & 0o777) !== 0o600)
    throw new Error("operator credential must have mode 0600");
  const token = readFileSync(file, "utf8").trim();
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new Error("invalid operator credential");
  return token;
}

const identityKey = Symbol.for("pi-squad.identity.v2");
export function processIdentity(): ProjectIdentity | undefined {
  const owner = process as NodeJS.Process & {
    [identityKey]?: { identity?: ProjectIdentity; error?: string };
  };
  if (!owner[identityKey]) {
    try {
      owner[identityKey] = { identity: readIdentity() };
    } catch (error) {
      owner[identityKey] = { error: String(error) };
    }
  }
  const cached = owner[identityKey]!;
  if (cached.error) throw new Error(cached.error);
  return cached.identity;
}
