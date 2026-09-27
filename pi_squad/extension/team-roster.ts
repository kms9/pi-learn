import type { Invocation } from "./invocation.ts";

type Roster = {
  key: string;
  run: string;
  roles: { id: string; description: string }[];
};
const projections = new WeakMap<Invocation, Roster>();

// Every UI entry point projects the same authoritative snapshot and Run roster.
export function rosterProjection(
  runtime: Invocation,
  snapshot = runtime.client.cachedSnapshot,
): Roster | undefined {
  const run = runtime.gate.current?.task.run_id ?? runtime.selectedRun;
  if (!snapshot || !run || runtime.disabledReason) return undefined;
  const current = snapshot.views.runs?.find((r) => r.run_id === run);
  if (
    !current ||
    ["completed", "failed", "cancelled"].includes(String(current.phase))
  )
    return undefined;
  const config = current.config_snapshot as {
    config: { members: { role_ref: string }[] };
    hash: string;
  };
  const key = JSON.stringify([
    runtime.identity.root,
    current.team_id,
    run,
    config.hash,
    runtime.gate.generation,
    snapshot.controller_epoch,
    snapshot.revision,
    snapshot.observed_at,
  ]);
  const cached = projections.get(runtime);
  if (cached?.key === key) return cached;
  const result = {
    key,
    run,
    roles: config.config.members.map(({ role_ref: id }) => {
      const role = snapshot.views.roles?.find((r) => r.role_id === id);
      const primary = String(role?.primary_agent_id || "unassigned");
      const instance = snapshot.views.agents?.find(
        (a) => (a.binding as { agent_id: string }).agent_id === primary,
      );
      return {
        id,
        description: `Primary ${primary}; ${String(instance?.presence ?? "offline")}/${String(instance?.activity ?? "unknown")}; owner ${String(role?.owner_run_id || "free")}; revision ${snapshot.revision}`,
      };
    }),
  };
  projections.set(runtime, result);
  return result;
}

export function installRosterCompletion(runtime: Invocation): void {
  let generation = 0;
  runtime.pi.on("session_start", (_event, ctx) => {
    generation++;
    if (runtime.disabledReason) return;
    const installed = generation;
    ctx.ui.addAutocompleteProvider((original) => ({
      triggerCharacters: [
        ...new Set([...(original.triggerCharacters ?? []), "@"]),
      ],
      shouldTriggerFileCompletion:
        original.shouldTriggerFileCompletion?.bind(original),
      async getSuggestions(lines, line, column, options) {
        const prefix = lines[line]?.slice(0, column) ?? "";
        const match =
          line === 0 ? /^[ \t]*@((?:role:)?[a-z0-9-]*)$/.exec(prefix) : null;
        const run = runtime.gate.current?.task.run_id ?? runtime.selectedRun;
        if (!match || !run || options.signal.aborted)
          return original.getSuggestions(lines, line, column, options);
        const gateGeneration = runtime.gate.generation;
        const isCurrent = () =>
          !options.signal.aborted &&
          !runtime.disabledReason &&
          installed === generation &&
          gateGeneration === runtime.gate.generation &&
          run === (runtime.gate.current?.task.run_id ?? runtime.selectedRun);
        try {
          const [snapshot, fallback] = await Promise.all([
            runtime.client.snapshot(options.signal),
            original.getSuggestions(lines, line, column, options),
          ]);
          if (!isCurrent()) return null;
          const roster = rosterProjection(runtime, snapshot);
          if (!roster) return fallback;
          const explicit = match[1].startsWith("role:");
          const fragment = match[1].replace(/^role:/, "");
          const items = roster.roles
            .filter((role) => role.id.startsWith(fragment))
            .map((role) => ({
              value: `@${explicit ? "role:" : ""}${role.id}`,
              label: `@${role.id}`,
              description: role.description,
            }));
          return { prefix, items: [...items, ...(fallback?.items ?? [])] };
        } catch {
          if (!isCurrent()) return null;
          const fallback = await original.getSuggestions(
            lines, line, column, options,
          );
          return isCurrent() ? fallback : null;
        }
      },
      applyCompletion(lines, line, column, item, prefix) {
        if (
          item.description?.startsWith("Primary ") &&
          /^@(?:role:)?[a-z][a-z0-9-]*$/.test(item.value)
        ) {
          const next = [...lines];
          const start = column - prefix.length;
          next[line] =
            next[line].slice(0, start) +
            item.value +
            " " +
            next[line].slice(column);
          return {
            lines: next,
            cursorLine: line,
            cursorCol: start + item.value.length + 1,
          };
        }
        return original.applyCompletion(lines, line, column, item, prefix);
      },
    }));
  });
}
