import type { IntegrationHooks } from "./integration-hooks.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installManagedSearch } from "./managed-search.ts";
import { installManagedFiles } from "./managed-files.ts";
import { installRosterCompletion } from "./team-roster.ts";
import { processIdentity } from "./project.ts";
import { Invocation } from "./invocation.ts";
import { installTaskTools } from "./task-tools.ts";
import { installIdentityTools } from "./identity-tools.ts";
import { installTeamMessaging } from "./team-messaging.ts";
import { installCommands } from "./squad-commands.ts";

export function installTeamExtension(
  pi: ExtensionAPI,
  integration?: IntegrationHooks,
): void {
  try {
    const identity = processIdentity();
    if (!identity) return;
    const runtime = new Invocation(pi, identity, integration);
    runtime.install();
    installManagedFiles(runtime);
    installManagedSearch(runtime);
    installTaskTools(runtime);
    installIdentityTools(runtime);
    installTeamMessaging(runtime);
    installCommands(runtime);
    installRosterCompletion(runtime);
  } catch (error) {
    // An explicitly selected but invalid identity must not break ordinary Pi.
    let notified = false;
    pi.on("session_start", (_event, ctx) => {
      if (!notified) {
        ctx.ui.notify(`pi-squad: ${String(error)}`, "error");
        notified = true;
      }
    });
  }
}
