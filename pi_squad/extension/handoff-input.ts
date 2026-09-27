import { existsSync } from "node:fs";
import path from "node:path";

export type Handoff =
  | { kind: "ordinary" }
  | { kind: "handoff"; role: string; goal: string }
  | { kind: "error"; code: string };
export function parseHandoff(
  text: string,
  roles: Set<string>,
  cwd: string,
  attachments = false,
): Handoff {
  const match = /^[ \t]*(@[^\s]+)(?:\s+([\s\S]*))?$/.exec(text);
  if (!match) return { kind: "ordinary" };
  const token = match[1].slice(1);
  const explicit = token.startsWith("role:");
  if (explicit && !/^role:[a-z][a-z0-9-]*$/.test(token))
    return { kind: "error", code: "INVALID_HANDOFF_SYNTAX" };
  if (
    token.startsWith("./") ||
    token.startsWith("../") ||
    token.includes("/") ||
    token.includes("\\")
  )
    return { kind: "ordinary" };
  const role = explicit ? token.slice(5) : token;
  if (!roles.has(role))
    return explicit
      ? { kind: "error", code: "ROLE_NOT_IN_TEAM" }
      : { kind: "ordinary" };
  if (!explicit && existsSync(path.resolve(cwd, token)))
    return { kind: "error", code: "TARGET_AMBIGUOUS: use @role:id or @./file" };
  if (attachments)
    return { kind: "error", code: "UNSUPPORTED_HANDOFF_ATTACHMENT" };
  const goal = (match[2] ?? "").trim();
  if (!goal) return { kind: "error", code: "EMPTY_HANDOFF_TASK" };
  if (/^@(?:role:)?[a-z][a-z0-9-]*(?:\s|$)/.test(goal))
    return { kind: "error", code: "MULTI_TARGET_NOT_SUPPORTED" };
  return { kind: "handoff", role, goal };
}
export type InputClass =
  | "read_only"
  | "related"
  | "management"
  | "run_guidance"
  | "manual_interference";
export function classify(
  command: string | undefined,
  leaderActive: boolean,
): InputClass {
  if (!command) return leaderActive ? "run_guidance" : "manual_interference";
  if (
    [
      "help",
      "whoami",
      "agents",
      "roles",
      "teams",
      "status",
      "task",
      "dashboard",
      "inbox",
      "transport",
      "use-run",
      "picker",
      "request",
    ].includes(command)
  )
    return "read_only";
  if (["call", "ask", "amend", "send"].includes(command)) return "related";
  return "management";
}
