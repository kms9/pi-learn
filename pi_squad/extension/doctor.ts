import { readFileSync } from "node:fs";
import path from "node:path";
import { getPackageDir, VERSION } from "@earendil-works/pi-coding-agent";

export function capabilities(): Record<string, boolean> {
  const types = readFileSync(
    path.join(getPackageDir(), "dist/core/extensions/types.d.ts"),
    "utf8",
  );
  const required = [
    "systemPromptOptions",
    "agent_settled",
    "agent_before_settle",
    "before_provider_request",
    "session_before_switch",
    "session_before_fork",
    "session_before_tree",
    "session_tree",
    "user_bash",
    "ui_prompt_start",
    "ui_prompt_end",
    "session_before_compact",
    "addAutocompleteProvider",
    "expandPromptTemplates",
  ];
  const missing = required.filter((name) => !types.includes(name));
  if (missing.length)
    throw new Error(
      `CAPABILITY_UNAVAILABLE Pi ${VERSION}: ${missing.join(", ")}`,
    );
  return {
    sections: true,
    agent_settled: true,
    before_provider_request: true,
    native_input: true,
  };
}
