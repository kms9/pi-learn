// Pi 1.1.0 integration entry only. Never load alongside the production entry.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getPackageDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { processIdentity } from "../../../../pi_squad/extension/project.ts";
import { installTeamExtension } from "../../../../pi_squad/extension/team-extension.ts";
import { CONTROL_TOOLS } from "../../../../pi_squad/extension/control-tools.ts";

export default async function (pi: ExtensionAPI): Promise<void> {
  const identity = processIdentity();
  if (!identity) return;
  const directory = path.join(identity.root, ".agents/pisquad/.runtime/compatibility", identity.agentID);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Use the installed 1.1.0 built-in client, with only this local server.
  // Personal MCP configuration and credentials are not loaded or changed.
  const { createMcpExtension } = await import(pathToFileURL(path.join(getPackageDir(), "dist/extensions/mcp/index.js")).href);
  createMcpExtension({
    loadConfig: () => ({ servers: [], errors: [], autoEnableCodemode: false }),
    logPath: path.join(directory, "mcp-client.log"),
  })(pi);
  pi.registerMcpServer("squad_fixture", {
    command: "python3",
    args: [path.join(identity.root, "pi_squad_case/04-team-orchestration/compatibility/pi-1.1.0/mcp-server.py"), path.join(directory, "mcp-methods.ndjson")],
    exposure: "codemode",
  });
  installTeamExtension({
    ...pi,
    registerTool(tool) {
      if (tool.name !== "read") { pi.registerTool(tool); return; }
      pi.registerTool({
        ...tool,
        async execute(id, params, signal, update, ctx) {
          const registered = pi.getAllTools();
          const name = "mcp__squad_fixture__unapproved";
          if (!registered.some((tool) => tool.name === name)) throw new Error("FIXTURE_MCP_NOT_REGISTERED");
          for (const target of CONTROL_TOOLS)
            if (!registered.some((tool) => tool.name === target && tool.exposure === "model-only"))
              throw new Error(`FIXTURE_CONTROL_NOT_MODEL_ONLY:${target}`);
          const observed: { name: string; denied: boolean; reason: string }[] = [];
          for (const target of [name, ...CONTROL_TOOLS]) {
            let reason = "";
            let denied = false;
            try {
              const result = await ctx.executeTool(target, { value: { unexpected_nested_result: true } });
              reason = result.result.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
              denied = result.isError && /TOOL_NOT_ALLOWED|NESTED_CONTROL_CALL_DENIED|model-only|not (available|callable)|unknown tool|tool.*not found/i.test(reason);
            } catch (error) {
              reason = String(error);
              denied = /TOOL_NOT_ALLOWED|NESTED_CONTROL_CALL_DENIED|model-only|not (available|callable)|unknown tool|tool.*not found/i.test(reason);
            }
            observed.push({ name: target, denied, reason });
            if (!denied) throw new Error(`FIXTURE_UNAPPROVED_NESTED_CALL:${target}`);
          }
          writeFileSync(path.join(directory, "nested-mcp-control.observed.json"), JSON.stringify({ at: new Date().toISOString(), observed, active_tools: pi.getActiveTools(), mcp_exposure: registered.find((tool) => tool.name === name)?.exposure }), { mode: 0o600 });
          return tool.execute(id, params, signal, update, ctx);
        },
      });
    },
  });
}
