import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Dispatch } from "./protocol.ts";

export const CONTROL_TOOLS = new Set([
  "squad_run_create", "squad_decide", "agent_invoke", "agent_task_complete",
  "agent_task_yield", "agent_clarify", "agent_clarification_answer", "send_message", "reply_message",
]);
export const CONTROL_TOOL_OPTIONS = { exposure: "model-only", executionMode: "sequential" } as const;

export function taskTools(dispatch: Dispatch): string[] {
  return dispatch.attempt.segment_mode === "response_only"
    ? ["agent_task_get", "agent_clarification_answer"]
    : dispatch.task.kind === "leader_step"
      ? ["squad_decide", "squad_run_get", "agent_task_get"]
      : dispatch.task.kind === "ask"
        ? ["get_message", "reply_message"]
        : [...dispatch.attempt.context.allowed_tools, "agent_task_complete", "agent_task_get", "agent_invoke", "agent_task_yield", "agent_clarify"];
}

/** Verify the complete loadout before recording injection intent. */
export function activateTaskTools(pi: ExtensionAPI, names: string[]): void {
  const wanted = [...new Set(names)].sort();
  const available = new Map(pi.getAllTools().map((tool) => [tool.name, tool]));
  for (const name of wanted) {
    const tool = available.get(name);
    if (!tool) throw new Error(`TASK_TOOL_UNAVAILABLE: ${name}`);
    if (!["direct", "model-only"].includes(tool.exposure))
      throw new Error(`TASK_TOOL_EXPOSURE_UNSUPPORTED: ${name} (${tool.exposure})`);
    if (CONTROL_TOOLS.has(name) && tool.exposure !== "model-only")
      throw new Error(`CONTROL_TOOL_EXPOSURE_UNSUPPORTED: ${name}`);
  }
  pi.setActiveTools(wanted);
  if (JSON.stringify([...pi.getActiveTools()].sort()) !== JSON.stringify(wanted))
    throw new Error("TASK_TOOL_ACTIVATION_MISMATCH");
}
