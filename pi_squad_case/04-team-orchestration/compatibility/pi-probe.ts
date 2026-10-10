// Load LAST with --no-extensions, after the Squad entry and any fault adapters.
// This is an observer, not a dispatch adapter or a model replacement.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { hostIdentity } from "../../../pi_squad/extension/doctor.ts";
import { expectedContext, canonicalEvidence, providerEvidence, type ContextEvidence } from "../../../pi_squad/extension/request-evidence.ts";
import { NESTED_DENIED_MARKER } from "./nested-read.ts";

export default function (pi: ExtensionAPI): void {
  const events: { seq: number; at: string; type: string; details: unknown }[] = [];
  let expected: ContextEvidence | undefined;
  let canonical: ReturnType<typeof canonicalEvidence> | undefined;
  let requestSeq = 0;
  let eventSeq = 0;
  let dropped = 0;
  let host = hostIdentity("unknown");
  const record = (type: string, details: unknown = {}): void => {
    events.push({ seq: ++eventSeq, at: new Date().toISOString(), type, details });
    if (events.length > 2000) { events.shift(); dropped++; }
  };
  pi.on("session_start", (event, ctx) => { host = hostIdentity(ctx.mode); expected = undefined; canonical = undefined; record(event.type, { reason: event.reason, mode: ctx.mode }); });
  pi.on("session_shutdown", (event) => record(event.type, { reason: event.reason }));
  pi.on("session_before_switch", () => record("session_before_switch"));
  pi.on("session_before_fork", () => record("session_before_fork"));
  pi.on("session_before_tree", () => record("session_before_tree"));
  pi.on("session_tree", (event) => record(event.type, { changed: event.oldLeafId !== event.newLeafId }));
  pi.on("session_before_compact", (event) => record(event.type, { reason: event.reason, will_retry: event.willRetry }));
  pi.on("session_compact", (event) => record(event.type, { reason: event.reason, will_retry: event.willRetry, from_extension: event.fromExtension }));
  pi.on("session_compact_failed", (event) => record(event.type, { reason: event.reason, aborted: event.aborted, will_retry: event.willRetry }));
  pi.on("user_bash", () => record("user_bash"));
  pi.on("input", (event) => record(event.type, { source: event.source }));
  pi.on("before_agent_start", (event) => {
    expected = expectedContext(event.systemPromptOptions?.sections ?? {}, pi.getActiveTools(), 0);
    canonical = undefined;
    record(event.type, expected);
  });
  pi.on("context_with_system", (event, ctx) => {
    if (!expected) return;
    canonical = canonicalEvidence(event.messages, { ...expected, request_seq: ++requestSeq }, pi.getActiveTools(), "last_observer", ctx.model);
    record(event.type, canonical);
  });
  pi.on("before_provider_request", (event) => record(event.type, providerEvidence(event.payload, canonical, "last_observer")));
  pi.on("after_provider_response", (event) => record(event.type, { status: event.status }));
  pi.on("tool_call", (event) => record(event.type, { tool_name: event.toolName, nested: Boolean(event.parentToolCallId) }));
  pi.on("tool_result", (event) => record(event.type, { tool_name: event.toolName, is_error: event.isError, nested_control_denied: event.content.some((part) => part.type === "text" && part.text === NESTED_DENIED_MARKER) }));
  pi.on("agent_before_settle", (event) => record(event.type, { outcome: event.outcome }));
  pi.on("agent_end", (event, ctx) => record(event.type, { idle: ctx.isIdle(), pending: ctx.hasPendingMessages() }));
  pi.on("agent_settled", (event, ctx) => record(event.type, { idle: ctx.isIdle(), pending: ctx.hasPendingMessages(), aborted: event.aborted }));
  pi.registerCommand("squad-probe-save", {
    description: "Save redacted schema 2 host compatibility observations",
    async handler(_args, ctx) {
      const directory = path.join(ctx.cwd, ".agents/pisquad/.runtime/integration-probes");
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const target = path.join(directory, `${ctx.sessionManager.getSessionId()}.json`);
      const report = () => JSON.stringify({ schema_version: 2, pi_version: host.pi_version, host, observed_at: new Date().toISOString(), events, assertions: { events_dropped: dropped } }, null, 2);
      let output = report();
      while (Buffer.byteLength(output) > 3 * 1024 * 1024 && events.length) { events.shift(); dropped++; output = report(); }
      writeFileSync(target + ".tmp", output, { mode: 0o600 });
      renameSync(target + ".tmp", target);
      ctx.ui.notify(`Probe saved: ${target}`, "info");
    },
  });
}
