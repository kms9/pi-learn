import { realpathSync, lstatSync } from "node:fs";
import path from "node:path";
import { within } from "./project.ts";
import type { Binding, Dispatch } from "./protocol.ts";

export class ExecutionGate {
  generation = 0;
  current?: Dispatch;
  frozen = false;
  private injected = new Set<string>();
  constructor(private root: string) {}
  private clock = () => Date.now();
  setClock(clock: () => number): void {
    this.clock = clock;
  }
  invalidate(): void {
    this.generation++;
    this.frozen = true;
  }
  key(d: Dispatch): string {
    return `${d.attempt.attempt_id}:${d.attempt.segment_id}`;
  }
  canInject(
    d: Dispatch,
    binding: Binding,
    idle: boolean,
    pending: boolean,
  ): boolean {
    const a = d.attempt;
    return (
      !this.frozen &&
      idle &&
      !pending &&
      !this.injected.has(this.key(d)) &&
      (!this.current || this.current.attempt.attempt_id === a.attempt_id) &&
      Object.keys(binding).every(
        (k) => binding[k as keyof Binding] === a.target[k as keyof Binding],
      ) &&
      this.clock() < Date.parse(a.lease_expires_at) &&
      a.state === "admitted"
    );
  }
  markInjection(d: Dispatch): void {
    this.current = d;
    this.injected.add(this.key(d));
  }
  checkTool(name: string, args: Record<string, unknown>): string | undefined {
    const d = this.current;
    if (!d) {
      const input = args.path ?? args.file_path;
      if (typeof input === "string") {
        try {
          const p = realpathSync(path.resolve(this.root, input));
          if (within(path.join(this.root, ".agents/pisquad/.runtime"), p))
            return "CONTROL_PATH_DENIED";
        } catch {
          /* nonexistent path */
        }
      }
      return undefined;
    }
    const expiresAt = Date.parse(d.attempt.lease_expires_at);
    if (
      this.frozen ||
      !Number.isFinite(expiresAt) ||
      this.clock() >= expiresAt ||
      d.attempt.cleanup_state === "released" ||
      !["running", "result_proposed"].includes(d.attempt.state)
    )
      return "EXECUTION_QUARANTINED: no valid execution permit";
    if (
      d.task.kind === "ask" &&
      !["get_message", "reply_message"].includes(name)
    )
      return "ASK_TOOL_DENIED";
    if (d.task.kind === "ask")
      return args.message_id === d.task.task_id
        ? undefined
        : "ASK_MESSAGE_SCOPE_MISMATCH";
    if (
      d.task.kind === "leader_step" &&
      !["squad_decide", "squad_run_get", "agent_task_get"].includes(name)
    )
      return "LEADER_TOOL_DENIED";
    if (
      d.attempt.segment_mode === "response_only" &&
      !["agent_task_get", "agent_clarification_answer"].includes(name)
    )
      return "RESPONSE_ONLY_TOOL_DENIED";
    if (
      [
        "agent_clarify",
        "agent_clarification_answer",
        "agent_task_complete",
        "agent_task_get",
        "agent_task_yield",
        "agent_invoke",
        "squad_decide",
      ].includes(name)
    )
      return undefined;
    if (!d.attempt.context.allowed_tools.includes(name))
      return `TOOL_NOT_ALLOWED: ${name}`;
    if (name === "bash")
      return "SHELL_NOT_ALLOWED: arbitrary shell effects cannot be fenced";
    for (const key of ["path", "file_path", "cwd"]) {
      if (typeof args[key] !== "string") continue;
      let target = path.resolve(this.root, args[key] as string);
      const suffix: string[] = [];
      while (true) {
        try {
          lstatSync(target);
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT")
            return "INVALID_PATH";
          const next = path.dirname(target);
          if (next === target) return "INVALID_PATH";
          suffix.unshift(path.basename(target));
          target = next;
        }
      }
      try {
        target = path.join(realpathSync(target), ...suffix);
      } catch {
        return "INVALID_PATH";
      }
      if (
        !within(this.root, target) ||
        target === path.join(this.root, "AGENTS.md") ||
        within(path.join(this.root, ".agents"), target) ||
        within(path.join(this.root, ".git"), target)
      )
        return "CONTROL_PATH_DENIED";
      for (
        let parent = target;
        parent !== this.root && within(this.root, parent);
        parent = path.dirname(parent)
      ) {
        try {
          if (lstatSync(path.join(parent, ".agents/pisquad")).isDirectory())
            return "NESTED_PROJECT_DENIED";
        } catch {
          /* no nested root */
        }
      }
      if (
        ["write", "edit"].includes(name) &&
        !d.attempt.context.write_set.some((root) => within(root, target))
      )
        return "WRITE_SET_DENIED";
    }
    return undefined;
  }
}
