import { randomUUID } from "node:crypto";
import { loadSquadSetup, type SquadSetup } from "./config.ts";

export type ProcessSetup = { runtimeId: string; runtimeToken: string; sessionId?: string; deliveries: Map<string, string>; cwd: string; setup: SquadSetup };
const key = Symbol.for("pi-squad.process-setup.v1");

/** Lives on process rather than the reloadable module: /new and /reload retain it. */
export function getProcessSetup(): ProcessSetup {
  const owner = process as NodeJS.Process & { [key: symbol]: ProcessSetup | undefined };
  if (!owner[key]) {
    const cwd = process.cwd();
    owner[key] = { runtimeId: randomUUID(), runtimeToken: randomUUID() + randomUUID(), deliveries: new Map(), cwd, setup: loadSquadSetup(process.env, cwd) };
  }
  const state = owner[key]!;
 state.runtimeToken ??= randomUUID() + randomUUID();
 state.deliveries ??= new Map();
 return state;
}
