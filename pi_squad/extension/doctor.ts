import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { getPackageDir, VERSION, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

export const HOST_PROFILE = "pi-coding-agent/1.0.1";
export const HOST_VERSION = "1.0.1";
export const REQUIRED_EVENTS = [
  "systemPromptOptions", "context_with_system", "agent_settled", "agent_before_settle",
  "before_provider_request", "session_before_switch", "session_before_fork",
  "session_before_tree", "session_tree", "user_bash", "ui_prompt_start", "ui_prompt_end",
  "session_before_compact", "session_compact_failed", "addAutocompleteProvider",
  "expandPromptTemplates", "parentToolCallId", "executionMode",
] as const;

export function hostIdentity(mode: string) {
  let executable = "unknown";
  let digest = "unknown";
  try {
    const entry = process.argv[1];
    let main: string | undefined;
    try { if (entry) main = realpathSync(entry); } catch { /* native argv */ }
    executable = main && /\.[cm]?js$/.test(main) ? main : realpathSync(process.execPath);
    digest = createHash("sha256").update(readFileSync(executable)).digest("hex");
  } catch { /* Never infer installation identity from the source checkout. */ }
  return {
    profile_id: HOST_PROFILE, pi_version: VERSION, mode,
    node_version: process.version, pi_executable: executable, pi_executable_sha256: digest,
  };
}

export function inspectHost(pi: ExtensionAPI, ctx: ExtensionContext) {
  const apiChecks = {
    on: typeof pi.on === "function",
    getAllTools: typeof pi.getAllTools === "function",
    getActiveTools: typeof pi.getActiveTools === "function",
    setActiveTools: typeof pi.setActiveTools === "function",
    sendUserMessage: typeof pi.sendUserMessage === "function",
    appendEntry: typeof pi.appendEntry === "function",
    "ui.addAutocompleteProvider": typeof ctx.ui.addAutocompleteProvider === "function",
    isIdle: typeof ctx.isIdle === "function",
    hasPendingMessages: typeof ctx.hasPendingMessages === "function",
    abort: typeof ctx.abort === "function",
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  if (ctx.mode !== "tui") errors.push(`SQUAD_MODE_UNSUPPORTED: ${ctx.mode}; only tui is supported`);
  if (VERSION !== HOST_VERSION) errors.push(`SQUAD_HOST_UNSUPPORTED: Pi ${VERSION}; requires ${HOST_PROFILE}`);
  for (const [name, available] of Object.entries(apiChecks))
    if (!available) errors.push(`CAPABILITY_UNAVAILABLE: ${name}`);
  let declared: Record<string, boolean> | undefined;
  try {
    const types = readFileSync(path.join(getPackageDir(), "dist/core/extensions/types.d.ts"), "utf8");
    declared = Object.fromEntries(REQUIRED_EVENTS.map((name) => [name, types.includes(name)]));
    if (Object.values(declared).some((v) => !v)) warnings.push("DECLARATION_DIAGNOSTIC_INCOMPLETE: runtime probe required");
  } catch { warnings.push("DECLARATIONS_UNAVAILABLE: optional diagnostic; runtime probe required"); }
  return { ...hostIdentity(ctx.mode), api_checks: apiChecks, declared_capabilities: declared, runtime_probe: "NOT_RUN", errors, warnings };
}

export function capabilities(pi: ExtensionAPI, ctx: ExtensionContext): Record<string, boolean> {
  const report = inspectHost(pi, ctx);
  if (report.errors.length) throw new Error(report.errors.join("; "));
  // Declared support for the known profile, not proof that hooks were observed.
  return {
    sections: true,
    agent_settled: true,
    before_provider_request: true,
    native_input: true,
  };
}
