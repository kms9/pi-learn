// Read-only runtime observation; load last in the integration extension list.
// Explicit /squad-probe-save writes only its redacted observation report.
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { VERSION, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export default function (pi: ExtensionAPI): void {
  const events: { seq: number; at: string; type: string; details: unknown }[] =
    [];
  let contextIDs: string[] = [];
  let contextSegment: number | undefined;
  const contextFields = ["role_id", "team_id", "run_id", "task_id", "attempt_id", "segment_id", "role_hash", "working_hash", "config_hash"];
  const identityOf = (task: Record<string, unknown>) => Object.fromEntries(
    contextFields.map((key) => [key, task[key] ?? null]),
  );
  let expectedIdentity: Record<string, unknown> = {};
  let expectedSectionHashes: Record<string, string> = {};
  const record = (type: string, details: unknown = {}) => {
    events.push({
      seq: events.length + 1,
      at: new Date().toISOString(),
      type,
      details,
    });
  };
  pi.on("session_start", (event) =>
    record("session_start", { reason: event.reason }),
  );
  pi.on("session_shutdown", (event) =>
    record("session_shutdown", { reason: event.reason }),
  );
  pi.on("session_before_switch", () => record("session_before_switch"));
  pi.on("session_before_fork", () => record("session_before_fork"));
  pi.on("session_before_tree", () => record("session_before_tree"));
  pi.on("session_tree", (event) =>
    record("session_tree", { changed: event.newLeafId !== event.oldLeafId }),
  );
  pi.on("session_before_compact", (event) =>
    record("session_before_compact", { reason: event.reason }),
  );
  pi.on("session_compact", () => record("session_compact"));
  pi.on("user_bash", () => record("user_bash"));
  pi.on("input", (event) =>
    record("input", {
      source: event.source,
      sha256: hash(event.text),
      bytes: Buffer.byteLength(event.text),
    }),
  );
  pi.on("before_agent_start", (event) => {
    const section = event.systemPromptOptions?.sections?.pi_squad_task;
    let task: Record<string, unknown> = {};
    if (typeof section === "string") {
      try { task = JSON.parse(section); } catch { /* Recorded as missing. */ }
    }
    expectedIdentity = identityOf(task);
    expectedSectionHashes = Object.fromEntries(
      Object.entries(event.systemPromptOptions?.sections ?? {})
        .filter(([name, content]) => name.startsWith("pi_squad_") && typeof content === "string" && content.length > 0)
        .map(([name, content]) => [name, hash(content)]),
    );
    contextIDs = [task.task_id, task.attempt_id].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    contextSegment = typeof task.segment_id === "number" ? task.segment_id : undefined;
    record("before_agent_start", {
      section_keys: Object.keys(event.systemPromptOptions?.sections ?? {}),
      expected_identity: expectedIdentity,
      expected_section_hashes: expectedSectionHashes,
      task_id: typeof task.task_id === "string" ? task.task_id : "",
      attempt_id: typeof task.attempt_id === "string" ? task.attempt_id : "",
      segment_id: contextSegment,
    });
  });
  pi.on("before_provider_request", (event) => {
    const body = JSON.stringify(event.payload);
    const taskIDs = [...new Set(body.match(/task-[a-f0-9]+/g) ?? [])];
    const payload = event.payload as Record<string, unknown>;
    const tools = Array.isArray(payload.tools)
      ? payload.tools.map((tool: unknown) => {
          const v = tool as { name?: string; function?: { name?: string } };
          return v.name ?? v.function?.name ?? "unknown";
        })
      : [];
    // Inspect only actual system/developer text, not historical user/tool messages.
    // Persist identifiers and hashes; never persist prompt bodies or headers.
    const systemText: string[] = [];
    if (Array.isArray(payload.messages)) for (const raw of payload.messages) {
      const message = raw as { role?: string; content?: unknown };
      if (!["system", "developer"].includes(message.role ?? "")) continue;
      if (typeof message.content === "string") systemText.push(message.content);
      else if (Array.isArray(message.content)) for (const part of message.content) {
        if (part && typeof part === "object" && typeof part.text === "string") systemText.push(part.text);
      }
    }
    const systemContexts: Record<string, unknown>[] = [];
    const sectionHashes: Record<string, string[]> = {};
    for (const text of systemText) for (const match of text.matchAll(/<(pi_squad_[a-z_]+)>\n([\s\S]*?)\n<\/\1>/g)) {
      (sectionHashes[match[1]] ??= []).push(hash(match[2]));
      if (match[1] === "pi_squad_task") {
        try { systemContexts.push(identityOf(JSON.parse(match[2]))); }
        catch { systemContexts.push({ parse_error: true }); }
      }
    }
    record("before_provider_request", {
      expected_identity: expectedIdentity,
      system_task_contexts: systemContexts,
      system_section_hashes: sectionHashes,
      expected_section_hashes: expectedSectionHashes,
      active_context_matches: systemContexts.length > 0 && JSON.stringify(systemContexts[systemContexts.length - 1]) === JSON.stringify(expectedIdentity),
      sha256: hash(body),
      bytes: Buffer.byteLength(body),
      keys: Object.keys(payload),
      task_ids: taskIDs,
      context_identity_present: contextIDs.length === 2 && contextSegment !== undefined &&
        contextIDs.every((id) => body.includes(JSON.stringify(id).slice(1, -1))) &&
        body.includes(JSON.stringify(`"segment_id":${contextSegment},`).slice(1, -1)),
      segment_id: contextSegment,
      tools,
      role_section: body.includes("pi_squad_role"),
      task_section: body.includes("pi_squad_task"),
    });
  });
  pi.on("agent_end", () => record("agent_end"));
  pi.on("agent_before_settle", (event) =>
    record("agent_before_settle", { outcome: event.outcome }),
  );
  pi.on("agent_settled", (_event, ctx) =>
    record("agent_settled", {
      idle: ctx.isIdle(),
      pending: ctx.hasPendingMessages(),
    }),
  );
  pi.registerCommand("squad-probe-save", {
    description: "Save redacted integration runtime probe observations",
    async handler(_args, ctx) {
      const directory = path.join(
        ctx.cwd,
        ".agents/pisquad/.runtime/integration-probes",
      );
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const target = path.join(
        directory,
        `${ctx.sessionManager.getSessionId()}.json`,
      );
      const report = {
        schema_version: 1,
        pi_version: VERSION,
        observed_at: new Date().toISOString(),
        events,
        assertions: {
          sections: events.some((e) => e.type === "before_agent_start"),
          before_provider_request: events.some(
            (e) => e.type === "before_provider_request",
          ),
          agent_settled: events.some((e) => e.type === "agent_settled"),
          native_events: events
            .filter(
              (e) => e.type.startsWith("session_") || e.type === "user_bash",
            )
            .map((e) => e.type),
        },
      };
      writeFileSync(target + ".tmp", JSON.stringify(report, null, 2), {
        mode: 0o600,
      });
      renameSync(target + ".tmp", target);
      ctx.ui.notify(`Probe saved: ${target}`, "info");
    },
  });
}
