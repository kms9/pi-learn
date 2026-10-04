import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Invocation } from "./invocation.ts";
import { rosterProjection } from "./team-roster.ts";
import { openDashboard } from "./dashboard.ts";
import { classify, parseHandoff } from "./handoff-input.ts";
import type { TaskContract } from "./protocol.ts";

const commands = [
  "help",
  "whoami",
  "agents",
  "roles",
  "teams",
  "run",
  "use-run",
  "status",
  "task",
  "call",
  "ask",
  "send",
  "amend",
  "takeover",
  "cancel",
  "recover",
  "retry",
  "rebind",
  "accept",
  "reject",
  "resume",
  "reconcile",
  "role",
  "leader",
  "inbox",
  "transport",
  "dashboard",
  "request",
];
function show(ctx: ExtensionContext, value: unknown): void {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  ctx.ui.notify(
    text.length > 12000 ? `${text.slice(0, 12000)}\n[truncated]` : text,
    "info",
  );
}
function words(text: string): string[] {
  const result: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    if (/\s/.test(text[offset])) { offset++; continue; }
    const quote = text[offset];
    if (quote !== '"' && quote !== "'") {
      const start = offset;
      while (offset < text.length && !/\s/.test(text[offset])) offset++;
      result.push(text.slice(start, offset));
      continue;
    }
    offset++;
    let token = "";
    while (offset < text.length && text[offset] !== quote) {
      if (quote === '"' && text[offset] === "\\" &&
          ['"', "\\"].includes(text[offset + 1])) offset++;
      token += text[offset++];
    }
    if (offset === text.length) throw new Error("INVALID_ARGUMENTS: unclosed quote");
    offset++;
    if (offset < text.length && !/\s/.test(text[offset]))
      throw new Error("INVALID_ARGUMENTS: quoted argument needs a separator");
    result.push(token);
  }
  return result;
}
function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  if (!args[i + 1] || args[i + 1].startsWith("--"))
    throw new Error(`${name} requires a value`);
  return args[i + 1];
}
function validateOptions(
  args: string[],
  values: string[],
  switches: string[] = [],
): void {
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (seen.has(option)) throw new Error(`duplicate option: ${option}`);
    seen.add(option);
    if (values.includes(option)) {
      flag(args, option);
      i++;
    } else if (!switches.includes(option)) {
      throw new Error(`unknown option or extra argument: ${option}`);
    }
  }
}
export function installCommands(runtime: Invocation): void {
  const { pi, client } = runtime;
  const runID = () => runtime.gate.current?.task.run_id ?? runtime.selectedRun;
  const call = async (
    target: string,
    goal: string,
    kind: string,
    writeSet: string[] = [],
    parent = false,
  ) => {
    const current = runtime.gate.current;
    const generation = runtime.gate.generation;
    const binding = JSON.stringify(runtime.binding);
    if (current && current.task.kind !== "leader_step" && !parent)
      throw new Error("ACTIVE_TASK_SCOPE_CONFLICT: use --parent current");
    if (parent && !current) throw new Error("NO_CURRENT_ATTEMPT");
    const direct = target.startsWith("agent:");
    const run = runID();
    if (!direct && !run) throw new Error("NO_ACTIVE_TEAM_CONTEXT");
    const parentTask = parent
      ? await client.request<TaskContract>(`/v2/tasks/${current!.task.task_id}`)
      : undefined;
    if (
      generation !== runtime.gate.generation ||
      binding !== JSON.stringify(runtime.binding) ||
      current !== runtime.gate.current ||
      run !== runID()
    )
      throw new Error("STALE_LOCAL_CALLBACK");
    const route = parent
      ? `/v2/tasks/${current!.task.task_id}/children`
      : direct
        ? "/v2/tasks/direct"
        : `/v2/runs/${run}/handoffs`;
    return client.request(
      route,
      {
        request_id: randomUUID(),
        target: target.replace(/^(role|agent):/, ""),
        goal,
        kind,
        write_set: writeSet,
        expected_revision: parentTask?.revision,
      },
      true,
    );
  };
  const handler = async (raw: string, ctx: ExtensionCommandContext) => {
    try {
      const args = words(raw);
      const command = args.shift() || "help";
      const exactArgs: Record<string, number> = {
        help: 0, whoami: 0, agents: 0, roles: 0, teams: 0,
        inbox: 0, transport: 0, dashboard: 0, takeover: 0,
        task: 1, "use-run": 1,
      };
      if (command in exactArgs && args.length !== exactArgs[command])
        throw new Error(`INVALID_ARGUMENTS: ${command} expects ${exactArgs[command]} arguments`);
      if (command === "status" && args.length > 1)
        throw new Error("status [run_id]");
      if (command === "request") {
        if (!args[0] || args[0].startsWith("--")) throw new Error("request <request_id> [--runtime]");
        validateOptions(args.slice(1), [], ["--runtime"]);
      }
      const inputClass = classify(command, false);
      if (inputClass === "manual_interference")
        await runtime.interrupt("manual_interference");
      if (command === "help") {
        show(
          ctx,
          [
            "以下命令均以 /squad 开头：",
            "help | whoami | agents | roles | teams | inbox | transport | dashboard",
            "status [run_id] | task <task_id> | request <request_id> [--runtime]",
            "run <team_id> <goal> | use-run <run_id>",
            "call|ask role:<id>|agent:<id> [--write <path>] [--parent current] -- <goal>",
            "send agent:<id> <notice> | takeover",
            "cancel run:<id>|task:<id> [--note <reason>]",
            "amend task:<id> <text>",
            "recover task:<id> [--evidence <path>] [--note <reason>]",
            "retry|rebind task:<id> [--rebind-current] [--note <reason>]",
            "accept|reject task:<id> [--note <reason>]",
            "resume run:<id> [--rebind-current] [--expected-runtime <UUID>] [--note <reason>]",
            "reconcile attempt:<id> --confirm-stopped --expected-runtime <UUID> --note <停止证据>",
            "role release <role> | role promote <role> <agent> | leader release <team>",
            "role/leader 操作可加 --expected-runtime <UUID>、--note <reason>。",
            "管理操作除 amend 外均支持 --preview；不加时按当前 revision 显式提交。",
            "accept/reject 仅用于 human policy；recover 只挂证据，reconcile 是人工停止声明。",
            "operator 凭据由本地管理命令读取；停服后 serve --rotate-operator-token 轮换。",
            "旧别名：/squad-whoami、/squad-inbox、/squad-transport。",
            "/pisquad-use 选择角色填入草稿，不自动提交。完整说明：pi_squad/USAGE.md",
          ].join("\n"),
        );
        return;
      }
      if (command === "whoami") {
        show(ctx, {
          ...runtime.identity,
          mode: runtime.disabledReason ? "ordinary" : runtime.identity.mode,
          requested_mode: runtime.disabledReason
            ? runtime.identity.mode
            : undefined,
          role: undefined,
          binding: runtime.binding,
          current_task: runtime.gate.current?.task.task_id,
          selected_run: runtime.selectedRun,
          disabled_reason: runtime.disabledReason,
          host: runtime.host,
          active_tools: pi.getActiveTools(),
          tool_contracts: pi.getAllTools().map(({ name, exposure }) => ({ name, exposure })),
        });
        return;
      }
      if (runtime.disabledReason)
        throw new Error(
          `${runtime.identity.mode === "leader" ? "LEADER" : "SQUAD"}_MODE_DISABLED: reload after resolving the startup failure`,
        );
      if (["agents", "roles", "teams", "status"].includes(command)) {
        show(
          ctx,
          args[0] && command === "status"
            ? await client.request(`/v2/runs/${encodeURIComponent(args[0])}`)
            : await client.snapshot(),
        );
        return;
      }
      if (command === "request") {
        if (!args[0]) throw new Error("request <request_id>");
        show(
          ctx,
          await client.request(
            `/v2/requests/${encodeURIComponent(args[0])}`,
            undefined,
            !args.includes("--runtime"),
          ),
        );
        return;
      }
      if (command === "task") {
        if (!args[0]) throw new Error("task <task_id>");
        show(
          ctx,
          await client.request(`/v2/tasks/${encodeURIComponent(args[0])}`),
        );
        return;
      }
      if (command === "inbox") {
        show(ctx, await client.request("/v2/messages/inbox"));
        return;
      }
      if (command === "send") {
        const target = args.shift();
        if (!target || !args.length) throw new Error("send agent:<id> <text>");
        const targetID = target.replace(/^agent:/, "");
        const assertCurrent = runtime.captureExecutionFence();
        const snap = await client.snapshot();
        assertCurrent();
        const recipient = snap.views.agents.find(
          (a) => (a.binding as { agent_id: string }).agent_id === targetID,
        );
        if (!recipient) throw new Error("AGENT_NOT_FOUND");
        show(
          ctx,
          await client.request("/v2/messages/send", {
            request_id: randomUUID(),
            target: targetID,
            expected_target: recipient.binding,
            kind: "notice",
            text: args.join(" "),
          }),
        );
        return;
      }
      if (command === "transport") {
        show(ctx, {
          discovery: await client.connect(),
          transport: client.transport,
          execution_gate: {
            frozen: runtime.gate.frozen,
            generation: runtime.gate.generation,
            attempt_id: runtime.gate.current?.attempt.attempt_id,
            segment_id: runtime.gate.current?.attempt.segment_id,
            cleanup_state: runtime.gate.current?.attempt.cleanup_state,
          },
        });
        return;
      }
      if (command === "use-run") {
        if (!args[0]) throw new Error("use-run <run_id>");
        if (runtime.gate.current) throw new Error("ACTIVE_TASK_SCOPE_CONFLICT");
        const generation = runtime.gate.generation;
        const binding = JSON.stringify(runtime.binding);
        const run = await client.request<{ phase: string }>(
          `/v2/runs/${encodeURIComponent(args[0])}`,
        );
        if (
          generation !== runtime.gate.generation ||
          binding !== JSON.stringify(runtime.binding) ||
          runtime.gate.current
        )
          throw new Error("STALE_LOCAL_CALLBACK");
        if (["completed", "failed", "cancelled"].includes(run.phase))
          throw new Error("RUN_TERMINAL");
        runtime.selectedRun = args[0];
        show(ctx, { run_id: args[0] });
        return;
      }
      if (command === "run") {
        const team = args.shift();
        if (!team || !args.length) throw new Error("run <team_id> <goal>");
        const assertCurrent = runtime.captureExecutionFence();
        const result = await client.request<{ run_id: string }>(
          "/v2/runs",
          { request_id: randomUUID(), team_id: team, goal: args.join(" ") },
          true,
        );
        assertCurrent();
        runtime.selectedRun = result.run_id;
        show(ctx, result);
        return;
      }
      if (command === "call" || command === "ask") {
        const target = args.shift();
        if (!target || !/^(role|agent):/.test(target))
          throw new Error("explicit role: or agent: target required");
        const separator = args.indexOf("--");
        const options = separator < 0 ? [] : args.slice(0, separator);
        if (separator < 0 && args[0]?.startsWith("--"))
          throw new Error("call/ask options require -- before the goal");
        validateOptions(options, ["--write", "--parent"]);
        const goal = (separator < 0 ? args : args.slice(separator + 1)).join(
          " ",
        );
        if (!goal.trim()) throw new Error("EMPTY_HANDOFF_TASK");
        const write = flag(options, "--write");
        const parent = flag(options, "--parent");
        if (parent && parent !== "current")
          throw new Error("--parent current required");
        show(
          ctx,
          await call(
            target,
            goal,
            command === "ask" ? "ask" : "execute",
            write ? [write] : [],
            parent === "current",
          ),
        );
        return;
      }
      if (command === "takeover") {
        await runtime.interrupt("manual_interference");
        show(ctx, "已记录人工接管；未知执行保持隔离。");
        return;
      }
      if (
        [
          "cancel",
          "recover",
          "retry",
          "rebind",
          "accept",
          "reject",
          "resume",
          "reconcile",
          "amend",
        ].includes(command)
      ) {
        const target = args.shift();
        if (!target) throw new Error("explicit target required");
        const match = /^(run|task|attempt):(.+)$/.exec(target);
        const kind = match?.[1] ?? "task";
        const id = match?.[2] ?? target;
        const allowed: Record<string, string[]> = {
          run: ["cancel", "resume"],
          task: ["cancel", "amend", "recover", "retry", "rebind", "accept", "reject"],
          attempt: ["reconcile"],
        };
        if (!allowed[kind]?.includes(command))
          throw new Error(`INVALID_OPERATION: ${kind} ${command}`);
        if (command !== "amend") {
          const values = ["--note"];
          const switches = ["--preview"];
          if (command === "recover") values.push("--evidence", "--attach-evidence");
          if (["resume", "reconcile"].includes(command)) values.push("--expected-runtime");
          if (["resume", "retry", "rebind"].includes(command)) switches.push("--rebind-current");
          if (command === "reconcile") switches.push("--confirm-stopped");
          validateOptions(args, values, switches);
          if (args.includes("--evidence") && args.includes("--attach-evidence"))
            throw new Error("provide only one evidence option");
        } else if (!args.join(" ").trim()) throw new Error("amend requires text");
        const assertCurrent = runtime.captureExecutionFence();
        const assertController = client.captureControllerFence();
        const current = await client.request<{
          revision: number;
          target?: { runtime_id: string };
          result?: { hash: string };
        }>(`/v2/${kind}s/${encodeURIComponent(id)}`);
        assertCurrent();
        assertController();
        const body = {
          request_id: randomUUID(),
          expected_revision: current.revision,
          expected_runtime: flag(args, "--expected-runtime"),
          note: command === "amend" ? args.join(" ") : flag(args, "--note"),
          evidence: flag(args, "--evidence") ?? flag(args, "--attach-evidence"),
          confirm_stopped: args.includes("--confirm-stopped"),
          rebind_current: args.includes("--rebind-current"),
          result_hash: ["accept", "reject"].includes(command) ? current.result?.hash : undefined,
        };
        show(ctx, {
          target: `${kind}:${id}`,
          operation: command,
          ...body,
          submitted: false,
        });
        if (command !== "amend" && args.includes("--preview")) return;
        show(
          ctx,
          await client.request(
            `/v2/${kind}s/${encodeURIComponent(id)}/${command}`,
            body,
            true,
          ),
        );
        return;
      }
      if (command === "role" || command === "leader") {
        const action = args.shift();
        const id = args.shift();
        if (!id || !action || !["release", "promote"].includes(action))
          throw new Error(
            "role release <role> | role promote <role> <agent> | leader release <team>",
          );
        if (command === "leader" && action !== "release")
          throw new Error("leader only supports release");
        if (action === "promote" && (!args[0] || args[0].startsWith("--")))
          throw new Error("role promote requires an Agent ID");
        validateOptions(
          action === "promote" ? args.slice(1) : args,
          ["--expected-runtime", "--note"],
          ["--preview"],
        );
        const assertCurrent = runtime.captureExecutionFence();
        const assertController = client.captureControllerFence();
        const snapshot = await client.snapshot();
        assertCurrent();
        assertController();
        const binding = (
          command === "role" ? snapshot.views.roles : snapshot.views.leaders
        )?.find((x) => x[command === "role" ? "role_id" : "team_id"] === id);
        if (!binding) throw new Error("BINDING_NOT_FOUND");
        const owner = String(
          binding.primary_agent_id ?? binding.agent_id ?? "",
        );
        const agent = snapshot.views.agents.find(
          (x) => (x.binding as { agent_id?: string })?.agent_id === owner,
        );
        const expected =
          flag(args, "--expected-runtime") ??
          (agent?.binding as { runtime_id?: string })?.runtime_id;
        const q = {
          request_id: randomUUID(),
          expected_revision: binding.revision,
          expected_runtime: expected,
          agent_id: action === "promote" ? args[0] : undefined,
          note: flag(args, "--note"),
        };
        const route =
          command === "role"
            ? `/v2/roles/${encodeURIComponent(id)}/${action}`
            : `/v2/teams/${encodeURIComponent(id)}/leader/${action}`;
        show(ctx, { target: id, operation: action, ...q, submitted: false });
        if (args.includes("--preview")) return;
        show(ctx, await client.request(route, q, true));
        return;
      }
      if (command === "dashboard") {
        await openDashboard(runtime, ctx);
        return;
      }
      throw new Error(`UNKNOWN_COMMAND: ${command}; use /squad help`);
    } catch (error) {
      ctx.ui.notify(
        `pi-squad: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  };
  pi.registerCommand("squad", {
    description: "Team runtime commands and explicit operator actions",
    getArgumentCompletions(prefix) {
      if (!prefix.includes(" "))
        return commands
          .filter((c) => c.startsWith(prefix))
          .map((c) => ({ value: c, label: c }));
      const command = prefix.split(/\s/)[0],
        split = prefix.lastIndexOf(" "),
        base = prefix.slice(0, split + 1),
        fragment = prefix.slice(split + 1),
        snapshot = client.cachedSnapshot;
      const parts = prefix.trimStart().split(/\s+/);
      if ((command === "role" || command === "leader") && parts.length === 2)
        return (command === "role" ? ["release", "promote"] : ["release"])
          .filter((action) => action.startsWith(fragment))
          .map((action) => ({ value: base + action, label: action }));
      if (!snapshot) return [];
      if (command === "role" || command === "leader") {
        const rows =
          command === "role" ? snapshot.views.roles : snapshot.views.leaders;
        const ids =
          parts.length === 3
            ? rows.map((row) =>
                String(row[command === "role" ? "role_id" : "team_id"]),
              )
            : command === "role" && parts[1] === "promote" && parts.length === 4
              ? ((snapshot.views.roles.find((row) => row.role_id === parts[2])
                  ?.secondary_agent_ids as string[] | undefined) ?? [])
              : [];
        return ids
          .filter((id) => id.startsWith(fragment))
          .map((id) => ({
            value: base + id,
            label: id,
            description: `snapshot revision ${snapshot.revision}`,
          }));
      }
      const roster = rosterProjection(runtime, snapshot);
      const roles = roster?.roles.map((r) => r.id) ?? [];
      const agents = snapshot.views.agents.map((a) =>
        String((a.binding as { agent_id: string }).agent_id),
      );
      const runs = snapshot.views.runs.map((r) => String(r.run_id));
      const tasks = snapshot.views.tasks.map((r) => String(r.task_id));
      const candidates =
        command === "call" || command === "ask"
          ? [
              ...roles.map((r) => `role:${r}`),
              ...agents.map((a) => `agent:${a}`),
            ]
          : command === "send"
            ? agents.map((a) => `agent:${a}`)
            : command === "run"
              ? snapshot.views.teams.map((t) =>
                  String((t.config as { team_id: string }).team_id),
                )
              : command === "use-run" || command === "status"
                ? runs
                : command === "task"
                  ? tasks
                  : command === "cancel"
                    ? [
                        ...runs.map((id) => `run:${id}`),
                        ...tasks.map((id) => `task:${id}`),
                      ]
                    : [
                          "amend",
                          "recover",
                          "retry",
                          "rebind",
                          "accept",
                          "reject",
                        ].includes(command)
                      ? tasks.map((id) => `task:${id}`)
                      : command === "resume"
                        ? runs.map((id) => `run:${id}`)
                        : command === "reconcile"
                          ? snapshot.views.attempts.map(
                              (a) => `attempt:${a.attempt_id}`,
                            )
                          : [];
      return candidates
        .filter((id) => id.startsWith(fragment))
        .map((id) => ({
          value: base + id,
          label: id,
          description: id.startsWith("role:")
            ? roster?.roles.find((r) => r.id === id.slice(5))?.description
            : `snapshot revision ${snapshot.revision}`,
        }));
    },
    handler,
  });
  for (const [alias, subcommand] of [
    ["squad-whoami", "whoami"],
    ["squad-inbox", "inbox"],
    ["squad-transport", "transport"],
  ])
    pi.registerCommand(alias, {
      description: `/squad ${subcommand}`,
      handler: (args, ctx) => handler(`${subcommand} ${args}`.trim(), ctx),
    });
  pi.registerCommand("pisquad-use", {
    description: "Pick a role and fill the editor without submitting",
    async handler(_args, ctx) {
      const run = runID();
      if (!run) {
        ctx.ui.notify("NO_ACTIVE_TEAM_CONTEXT", "error");
        return;
      }
      const old = ctx.ui.getEditorText();
      const before = runtime.gate.generation;
      try {
        const snapshot = await client.snapshot();
        if (before !== runtime.gate.generation || run !== runID()) return;
        const roster = rosterProjection(runtime, snapshot);
        if (!roster) throw new Error("NO_ACTIVE_TEAM_CONTEXT");
        const options = roster.roles.map(
          (role) => `${role.id} — ${role.description}`,
        );
        const picked = await ctx.ui.select("Role", options);
        const role = picked ? roster.roles[options.indexOf(picked)] : undefined;
        if (
          role &&
          before === runtime.gate.generation &&
          run === runID() &&
          ctx.ui.getEditorText() === old
        ) {
          const target = existsSync(path.resolve(ctx.cwd, role.id))
            ? `@role:${role.id}`
            : `@${role.id}`;
          ctx.ui.setEditorText(
            `${target} ${old.replace(/^@(?:role:)?[a-z][a-z0-9-]*\s*/, "")}`,
          );
        }
      } catch (e) {
        ctx.ui.notify(String(e), "error");
      }
    },
  });
  pi.on("input", async (event, ctx) => {
    if (runtime.disabledReason) return { action: "continue" };
    if (event.source !== "interactive") return { action: "continue" };
    const generation = runtime.gate.generation;
    const binding = JSON.stringify(runtime.binding);
    const session = ctx.sessionManager.getSessionId();
    let roles = new Set<string>();
    const run = runID();
    const isCurrent = () =>
      generation === runtime.gate.generation &&
      binding === JSON.stringify(runtime.binding) &&
      session === ctx.sessionManager.getSessionId() &&
      run === runID();
    try {
      if (/^[ \t]*@/.test(event.text)) {
        roles = new Set([
          ...readdirSync(
            path.join(runtime.identity.root, ".agents/pisquad/roles"),
          ),
          ...(rosterProjection(runtime)?.roles.map((role) => role.id) ?? []),
        ]);
        const candidate = parseHandoff(
          event.text,
          roles,
          ctx.cwd,
          Boolean(event.images?.length),
        );
        // Ordinary file references do not need a live Run or Controller.
        if (candidate.kind !== "ordinary") {
          if (run) {
            const r = await client.request<{
              phase: string;
              config_snapshot: { config: { members: { role_ref: string }[] } };
            }>(`/v2/runs/${run}`);
            if (!isCurrent()) return { action: "handled" };
            if (["completed", "failed", "cancelled"].includes(r.phase)) {
              throw new Error("RUN_TERMINAL");
            }
            roles = new Set(
              r.config_snapshot.config.members.map((m) => m.role_ref),
            );
          }
          const parsed = parseHandoff(
            event.text,
            roles,
            ctx.cwd,
            Boolean(event.images?.length),
          );
          if (!run && /^[ \t]*@role:/.test(event.text))
            throw new Error("NO_ACTIVE_TEAM_CONTEXT");
          if (parsed.kind === "error") throw new Error(parsed.code);
          if (parsed.kind === "ordinary") throw new Error("ROLE_NOT_IN_TEAM");
          if (parsed.kind === "handoff") {
            show(ctx, await call(`role:${parsed.role}`, parsed.goal, "execute"));
            return { action: "handled" };
          }
        }
      }
      if (runtime.identity.mode === "leader") {
        const snapshot = await client.snapshot();
        if (!isCurrent()) return { action: "handled" };
        const active = snapshot.views.runs.find(
          (r) =>
            r.team_id === runtime.identity.teamID &&
            r.admitted &&
            !["completed", "failed", "cancelled"].includes(String(r.phase)),
        );
        if (classify(undefined, Boolean(active)) === "run_guidance" && active) {
          show(
            ctx,
            await client.request(
              `/v2/runs/${active.run_id}/guidance`,
              {
                request_id: randomUUID(),
                expected_revision: active.revision,
                note: event.text,
              },
              true,
            ),
          );
          return { action: "handled" };
        }
      }
      if (
        classify(undefined, false) === "manual_interference" &&
        runtime.gate.current
      )
        await runtime.interrupt("manual_interference");
      return { action: "continue" };
    } catch (error) {
      if (!isCurrent()) return { action: "handled" };
      if (String(error).includes("RUN_TERMINAL")) runtime.selectedRun = undefined;
      if (!ctx.ui.getEditorText())
        ctx.ui.setEditorText(event.text);
      ctx.ui.notify(`pi-squad: ${String(error)}`, "error");
      return { action: "handled" };
    }
  });
}
