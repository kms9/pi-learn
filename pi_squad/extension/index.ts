import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installTeamExtension } from "./team-extension.ts";

/** The package entry only assembles the Project runtime extension. */
export default function (pi: ExtensionAPI): void {
  installTeamExtension(pi);
}
