import { readFileSync, readdirSync, lstatSync } from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { isMissingIdentity, readIdentityEnv, type IdentityEnv } from "./registration.ts";

export const ROLE_ENV = "PI_SQUAD_ROLE_ID";
const MAX_CONFIG_BYTES = 64 * 1024;
const ROLE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type RoleProfile = {
  name: string;
  description: string;
  body: string;
  configPath: string;
  roleDir: string;
};

export type SquadSetup =
  | { ok: true; source: "role"; identity: IdentityEnv; rolePrompt: string; roleDescription: string; configPath: string; roleDir: string; rolesRoot: string }
  | { ok: false; disabled: true }
  | { ok: false; missing: string[] }
  | { ok: false; error: string };

export function isSetupReady(value: SquadSetup): value is Extract<SquadSetup, { ok: true }> {
  return value.ok === true;
}

/** Only the header is YAML. Markdown headings/body are opaque instructions. */
export function parseRoleFile(raw: string, configPath: string): RoleProfile {
  if (Buffer.byteLength(raw) > MAX_CONFIG_BYTES) throw new Error(`file exceeds ${MAX_CONFIG_BYTES} bytes`);
  const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") throw new Error("expected YAML frontmatter starting with ---");
  const end = lines.findIndex((line, i) => i > 0 && line === "---");
  if (end < 0) throw new Error("missing closing --- for YAML frontmatter");
  const doc = parseDocument(lines.slice(1, end).join("\n"), { uniqueKeys: true, stringKeys: true });
  if (doc.errors.length || doc.warnings.length) throw new Error([...doc.errors, ...doc.warnings].map(e => e.message).join("; "));
  const header: unknown = doc.toJS({ maxAliasCount: 0 });
  if (!header || typeof header !== "object" || Array.isArray(header)) throw new Error("frontmatter must be a mapping");
  const fields = header as Record<string, unknown>;
  const unknown = Object.keys(fields).filter(key => key !== "name" && key !== "description");
  if (unknown.length) throw new Error(`unsupported frontmatter fields: ${unknown.join(", ")}`);
  const name = typeof fields.name === "string" ? fields.name.trim() : "";
  const description = typeof fields.description === "string" ? fields.description.trim() : "";
  const body = lines.slice(end + 1).join("\n").trim();
  if (!ROLE_NAME.test(name)) throw new Error("name must contain lowercase letters/digits separated by hyphens");
  if (!description) throw new Error("description must be a non-empty string");
  if (!body) throw new Error("Markdown body must not be empty");
  return { name, description, body, configPath, roleDir: path.dirname(configPath) };
}

export function discoverRoles(rolesRoot: string): Map<string, RoleProfile> {
  const roles = new Map<string, RoleProfile>();
  // One role directory, one fixed entry point. Never scan its other contents:
  // future notes/state files must not become prompts or additional roles.
  for (const entry of readdirSync(rolesRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isFile() && entry.name.endsWith(".md") && ROLE_NAME.test(path.basename(entry.name, ".md"))) {
      throw new Error(`${path.join(rolesRoot, entry.name)}: flat role files are no longer supported; move to ${path.basename(entry.name, ".md")}/role.md`);
    }
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const roleDir = path.join(rolesRoot, entry.name);
    const file = path.join(roleDir, "role.md");
    try {
      if (!entry.isDirectory()) throw new Error("role directory must not be a symlink");
      if (!ROLE_NAME.test(entry.name)) throw new Error("invalid role directory name");
      const stat = lstatSync(file);
      if (!stat.isFile()) throw new Error("role.md must be a regular file, not a directory or symlink");
      if (stat.size > MAX_CONFIG_BYTES) throw new Error(`file exceeds ${MAX_CONFIG_BYTES} bytes`);
      const role = parseRoleFile(readFileSync(file, "utf8"), file);
      if (roles.has(role.name)) throw new Error(`duplicate role name: ${role.name}`);
      roles.set(role.name, role);
    } catch (err) {
      throw new Error(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const role of roles.values()) {
    if (path.basename(role.roleDir) !== role.name) throw new Error(`${role.configPath}: directory must match name: ${role.name}`);
  }
  return roles;
}

/** Fresh loader for validation/tests. The extension caches its result for the Pi process. */
export function loadSquadSetup(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): SquadSetup {
  if (env.PI_SQUAD_CONFIG?.trim()) {
    return { ok: false, error: "PI_SQUAD_CONFIG JSON is no longer supported; migrate to .agents/roles/<name>/role.md and set PI_SQUAD_ROLE_ID, PI_SQUAD_AGENT_ID, PI_SQUAD_ID" };
  }
  const roleId = env[ROLE_ENV]?.trim();
  if (!roleId) return { ok: false, disabled: true };
  if (!ROLE_NAME.test(roleId)) return { ok: false, error: `invalid ${ROLE_ENV}: ${roleId}` };
  const rolesRoot = path.resolve(cwd, ".agents/roles");
  try {
    const role = discoverRoles(rolesRoot).get(roleId);
    if (!role) throw new Error(`unknown role ${roleId} in ${rolesRoot}`);
    // Registry role is the selected name; legacy PI_SQUAD_ROLE cannot override it.
    const identity = readIdentityEnv({ ...env, PI_SQUAD_ROLE: role.name });
    if (isMissingIdentity(identity)) return { ok: false, missing: identity.missing };
    return { ok: true, source: "role", identity, rolePrompt: role.body, roleDescription: role.description, configPath: role.configPath, roleDir: role.roleDir, rolesRoot };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
