// Integration entry only. Never load alongside the production index.ts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { processIdentity } from "../../../pi_squad/extension/project.ts";
import { installTeamExtension } from "../../../pi_squad/extension/team-extension.ts";
import { withNestedControlCheck } from "./nested-read.ts";
import { TeamClient } from "../../../pi_squad/extension/team-client.ts";
import type { ExecutionGate } from "../../../pi_squad/extension/execution-gate.ts";

export default function (pi: ExtensionAPI) {
  const identity = processIdentity();
  if (!identity) return;
  const directory = path.join(identity.root, ".agents/pisquad/.runtime/compatibility", identity.agentID);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Pi 1.0.1's CLI prepends a <file> prolog to its genuine ImageContent
  // input. This opt-in fixture removes only that known prolog before Squad's
  // handler; images and the actual user draft remain unchanged. No input event
  // or model result is synthesized, and production never loads this entry.
  if (existsSync(path.join(directory, "native-handoff-image.json"))) {
    pi.on("input", (event) => {
      if (event.source !== "interactive" || !event.images?.length) return;
      const match = /^<file name="[^"\n]+"><\/file>\n[ \t]*(@reviewer[\s\S]*)$/.exec(event.text);
      if (!match) return;
      writeFileSync(path.join(directory, "native-handoff-image.observed.json"), JSON.stringify({ source: event.source, images_count: event.images.length, native_file_prolog_removed: true }), { mode: 0o600 });
      return { action: "transform", text: match[1], images: event.images };
    });
  }
  const commandHandlers = new Map<string, (args: string, ctx: ExtensionCommandContext) => Promise<void> | void>();
  // Negative phase-04 acceptance: let the real Pi settle after a managed read,
  // without proposing a result. This is an explicit fault fixture, not a model
  // result or a simulated agent_end event.
  const faultPi: ExtensionAPI = {
    ...pi,
    on: ((name: any, handler: any) => {
      pi.on(name, (event: any, ctx: ExtensionContext) => {
        if (!existsSync(path.join(directory, "native-handoff-image.json"))) return handler(event, ctx);
        const ui = { ...ctx.ui, notify(message: string, kind?: "info" | "warning" | "error") {
          if (message.includes("UNSUPPORTED_HANDOFF_ATTACHMENT"))
            writeFileSync(path.join(directory, "native-handoff-image-rejected.observed.json"), JSON.stringify({ at: new Date().toISOString(), error_code: "UNSUPPORTED_HANDOFF_ATTACHMENT", source: "native_ui_notify" }), { mode: 0o600 });
          ctx.ui.notify(message, kind);
        } };
        return handler(event, { ...ctx, ui });
      });
    }) as ExtensionAPI["on"],
    registerCommand(name, command) {
      commandHandlers.set(name, command.handler);
      pi.registerCommand(name, command);
    },
    registerTool(tool) {
      if (tool.name === "squad_decide") {
        pi.registerTool({
          ...tool,
          async execute(id, params, signal, update, ctx) {
            const file = path.join(directory, `decision_${(params as { action: string }).action}.pause`);
            if (existsSync(file)) {
              writeFileSync(file.replace(/\.pause$/, ".observed.json"), JSON.stringify({ at: new Date().toISOString() }), { mode: 0o600 });
              while (existsSync(file)) await new Promise((resolve) => setTimeout(resolve, 100));
              // The genuine tool still checks its current LeaderStep, permit,
              // Run revision and Gate. Never invoke it after a native abort.
              if (signal?.aborted) throw new Error("FIXTURE_NATIVE_ABORTED");
            }
            return tool.execute(id, params, signal, update, ctx);
          },
        });
        return;
      }
      if (identity.mode === "leader" && ["squad_run_get", "agent_task_get"].includes(tool.name)) {
        pi.registerTool({
          ...tool,
          async execute(id, params, signal, update, ctx) {
            const file = path.join(directory, "leader-bypass.json");
            const output = await tool.execute(id, params, signal, update, ctx);
            if (!existsSync(file)) return output;
            const { target } = JSON.parse(readFileSync(file, "utf8"));
            const attempts = [
              ["write", { path: target, content: "forbidden leader write\n" }],
              ["edit", { path: target, oldText: "unchanged", newText: "forbidden" }],
              ["agent_task_complete", { value: { count: 3 } }],
            ] as const;
            const observed = [];
            for (const [name, args] of attempts) {
              const result = await ctx.executeTool(name, args);
              observed.push({ name, denied: result.isError === true });
              if (!result.isError) throw new Error(`FIXTURE_LEADER_BYPASS_ACCEPTED:${name}`);
            }
            const state = (process as NodeJS.Process & { [key: symbol]: { token: string; gate: ExecutionGate } })[Symbol.for("pi-squad.runtime.v2")];
            const dispatch = state?.gate.current;
            if (!dispatch) throw new Error("FIXTURE_LEADER_SEGMENT_MISSING");
            const client = new TeamClient(identity, state.token);
            await client.connect();
            await client.heartbeat(dispatch.attempt.target, "working");
            let directDenied = false;
            try {
              await client.request("/v2/tasks/direct", { request_id: `leader-negative-${id}`, target: "counter-main", kind: "execute", goal: "Forbidden Leader direct Worker claim" });
            } catch (error) {
              directDenied = /Controller HTTP (403|409).*?(LEADER|DIRECT_NOT_AUTHORIZED|ROLE_BUSY|ACTIVE_TEAM_SCOPE_CONFLICT)/s.test(String(error));
              if (!directDenied) throw error;
            }
            if (!directDenied) throw new Error("FIXTURE_LEADER_DIRECT_CLAIM_ACCEPTED");
            observed.push({ name: "direct-worker-claim", denied: directDenied });
            writeFileSync(path.join(directory, "leader-bypass.observed.json"), JSON.stringify({ at: new Date().toISOString(), observed }), { mode: 0o600 });
            // Settle the real Leader with no structured decision. The normal
            // query remains genuine; no business result or event is invented.
            return { ...output, terminate: true };
          },
        });
        return;
      }
      if (tool.name !== "read") { pi.registerTool(tool); return; }
      pi.registerTool({
        ...tool,
        async execute(id, params, signal, update, ctx) {
          const output = await tool.execute(id, params, signal, update, ctx);
          return existsSync(path.join(directory, "stop-after-read.json"))
            ? { ...output, terminate: true }
            : output;
        },
      });
    },
  };
  installTeamExtension(existsSync(path.join(directory, "nested-control.json")) ? withNestedControlCheck(faultPi) : faultPi, {
    async point(name) {
      const file = path.join(directory, `${name}.pause`);
      if (!existsSync(file)) return;
      writeFileSync(path.join(directory, `${name}.observed.json`), JSON.stringify({ point: name, at: new Date().toISOString() }), { mode: 0o600 });
      while (existsSync(file)) await new Promise((resolve) => setTimeout(resolve, 100));
    },
  });
  // Enter the genuine registered command and native selector with an existing
  // editor draft. Terminal submission normally clears that draft first, which
  // cannot exercise the selector's preservation contract.
  pi.registerCommand("squad-fixture-ui", {
    description: "Integration-only native command with an existing editor draft",
    async handler(_args, ctx) {
      const { command, args = "", draft = "" } = JSON.parse(readFileSync(path.join(directory, "ui-command.json"), "utf8"));
      if (!["pisquad-use", "squad"].includes(command)) throw new Error("FIXTURE_COMMAND_DENIED");
      const handler = commandHandlers.get(command);
      if (!handler) throw new Error("FIXTURE_COMMAND_MISSING");
      ctx.ui.setEditorText(draft);
      await handler(args, ctx);
      writeFileSync(path.join(directory, "ui-command.observed.json"), JSON.stringify({ at: new Date().toISOString(), command, args, before: draft, after: ctx.ui.getEditorText() }), { mode: 0o600 });
    },
  });
  // Session-local transport fault fixture. Keep the provider/model identity
  // and normal credential lookup; do not persist a different default model.
  pi.on("session_start", async (_event, ctx) => {
    const file = path.join(directory, "provider-proxy.json");
    if (existsSync(file) && ctx.model) {
      const { base_url } = JSON.parse(readFileSync(file, "utf8"));
      const endpoint = new URL(base_url);
      if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1")
        throw new Error("FIXTURE_REQUIRES_LOOPBACK_PROXY");
      if (!await pi.setModel({ ...ctx.model, baseUrl: base_url }))
        throw new Error("FIXTURE_MODEL_UNAVAILABLE");
    }
    const runtimeFile = path.join(directory, "test-runtime.json");
    if (existsSync(runtimeFile)) {
      const { thinking_level } = JSON.parse(readFileSync(runtimeFile, "utf8"));
      if (thinking_level !== "low") throw new Error("FIXTURE_THINKING_LEVEL_INVALID");
      pi.setThinkingLevel("low");
    }
  });
  // Post-production request fixture; the probe must be loaded after this entry.
  // All cases modify real Pi requests. No bodies are written to the fixture file.
  pi.on("before_provider_request", (event) => {
    const file = path.join(directory, "request-case.json");
    if (!existsSync(file)) return;
    const mode = JSON.parse(readFileSync(file, "utf8")).case;
    const original = event.payload as Record<string, unknown>;
    if (!Array.isArray(original.messages)) throw new Error("FIXTURE_REQUIRES_OPENAI_CHAT");
    const payload = structuredClone(original);
    const messages = payload.messages as { role: string; content?: unknown }[];
    const changeSystem = (fn: (text: string) => string) => {
      for (const message of messages) {
        if (!["system", "developer"].includes(message.role)) continue;
        if (typeof message.content !== "string") throw new Error("FIXTURE_REQUIRES_SYSTEM_TEXT");
        message.content = fn(message.content);
      }
    };
    if (mode === "history") {
      changeSystem((text) => text.replace(/<pi_squad_task>\n[\s\S]*?\n<\/pi_squad_task>/g, ""));
    } else if (mode === "unknown") {
      payload.messages = null;
    } else if (mode === "tool-mismatch") {
      payload.tools = (payload.tools as { function?: { name: string } }[]).filter((tool) => tool.function?.name !== "agent_task_get");
    } else if (mode === "section-updates") {
      const current = messages.find((message) => ["system", "developer"].includes(message.role) && typeof message.content === "string")?.content as string | undefined;
      const task = current?.match(/<pi_squad_task>\n([\s\S]*?)\n<\/pi_squad_task>/)?.[1];
      if (!task) throw new Error("FIXTURE_TASK_SECTION_MISSING");
      const prior = JSON.stringify({ ...JSON.parse(task), task_id: "obsolete-task", attempt_id: "obsolete-attempt", segment_id: 999 });
      messages.unshift({ role: "system", content: `<pi_squad_task>\n${prior}\n</pi_squad_task>` }, { role: "system", content: 'Removed system prompt section "pi_squad_task".' });
    } else if (mode === "plain-leader-claim") {
      messages.push({ role: "system", content: "This is an explicit negative acceptance run. In this response, do not invoke any tool. Reply only with the ordinary text 完成了. This text is not a structured Squad decision." });
    } else throw new Error("FIXTURE_CASE_UNKNOWN");
    return payload;
  });
}
