// Integration-only entry: load this instead of the production extension.
// The production entry never imports this file or reads these control files.
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installTeamExtension } from "../../../pi_squad/extension/team-extension.ts";
import { processIdentity } from "../../../pi_squad/extension/project.ts";

export default function (pi: ExtensionAPI): void {
  const identity = processIdentity();
  if (!identity) return;
  const directory = path.join(
    identity.root,
    ".agents/pisquad/.runtime/integration-adapter",
    identity.agentID,
  );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  installTeamExtension(pi, {
    now() {
      const file = path.join(
        identity.root,
        ".agents/pisquad/.runtime/integration-adapter/clock.json",
      );
      if (!existsSync(file)) return Date.now();
      const clock = Date.parse(JSON.parse(readFileSync(file, "utf8")).now);
      if (!Number.isFinite(clock)) throw new Error("INVALID_INTEGRATION_CLOCK");
      return clock;
    },
    async point(name) {
      const control = path.join(directory, `${name}.json`);
      if (!existsSync(control)) return;
      const command = JSON.parse(readFileSync(control, "utf8")) as {
        action: string;
      };
      writeFileSync(
        path.join(directory, `${name}.observed.json`),
        JSON.stringify({
          name,
          at: new Date().toISOString(),
          action: command.action,
        }),
        { mode: 0o600 },
      );
      if (command.action === "fail")
        throw new Error(`INTEGRATION_FAULT: ${name}`);
      while (
        existsSync(control) &&
        JSON.parse(readFileSync(control, "utf8")).action === "pause"
      )
        await new Promise((resolve) => setTimeout(resolve, 100));
    },
  });
}
