import { randomUUID } from "node:crypto";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { capabilities, inspectHost } from "./doctor.ts";
import { activateTaskTools, taskTools } from "./control-tools.ts";
import { ExecutionGate } from "./execution-gate.ts";
import { TeamClient } from "./team-client.ts";
import { hash } from "./project.ts";
import { sections, briefing } from "./context-assembly.ts";
import { expectedContext, canonicalEvidence, providerEvidence, type ContextEvidence } from "./request-evidence.ts";
import type { IntegrationHooks } from "./integration-hooks.ts";
import type { ProjectIdentity } from "./project.ts";
import type { Binding, Dispatch } from "./protocol.ts";

const stateKey = Symbol.for("pi-squad.runtime.v2");
type ProcessState = {
  runtimeID: string;
  token: string;
  sessionID?: string;
  ordinaryTools?: string[];
  gate: ExecutionGate;
  dispose?: () => void;
};
export class Invocation {
  readonly client: TeamClient;
  readonly gate: ExecutionGate;
  binding?: Binding;
  context?: ExtensionContext;
  selectedRun?: string;
  disabledReason?: string;
  host?: ReturnType<typeof inspectHost>;
  private state: ProcessState;
  private alive = true;
  private timer?: ReturnType<typeof setInterval>;
  private stream?: AbortController;
  private queue: Promise<unknown> = Promise.resolve();
  private polling = false;
  private lastHeartbeat = 0;
  private recordedNotices = new Set<string>();
  private outcome = "completed";
  private localTurn = 0;
  private nativeChangePrepared = false;
  private nativeManualCompacting = false;
  private requestSeq = 0;
  private expectedContext?: ContextEvidence;
  private canonical?: ReturnType<typeof canonicalEvidence>;
  private expectedInput?: string;
  private uiDepth = 0;
  private pendingBash: { hash: string; before: Set<string> }[] = [];
  private observedBash = new Set<string>();
  private notified = false;
  private ordinaryTools: string[] = [];
  constructor(
    readonly pi: ExtensionAPI,
    readonly identity: ProjectIdentity,
    private integration?: IntegrationHooks,
  ) {
    const owner = process as NodeJS.Process & { [stateKey]?: ProcessState };
    owner[stateKey]?.dispose?.();
    this.state = owner[stateKey] ??= {
      runtimeID: randomUUID(),
      token: randomUUID() + randomUUID(),
      gate: new ExecutionGate(identity.root),
    };
    this.gate = this.state.gate;
    this.gate.setClock(() => this.integration?.now?.() ?? Date.now());
    this.client = new TeamClient(identity, this.state.token);
    this.state.dispose = () => {
      this.alive = false;
      if (this.timer) clearInterval(this.timer);
      this.stream?.abort();
    };
  }
  private localIdle(ctx: ExtensionContext): boolean {
    return ctx.isIdle() && this.uiDepth === 0 && this.pendingBash.length === 0;
  }
  private activity(ctx: ExtensionContext): string {
    return this.uiDepth > 0
      ? "blocked"
      : this.pendingBash.length > 0 || !ctx.isIdle()
        ? "working"
        : "idle";
  }
  private observeBash(ctx: ExtensionContext): void {
    const entries = ctx.sessionManager.getEntries();
    this.pendingBash = this.pendingBash.filter((pending) => {
      const ended = entries.find((entry) => {
        if (
          entry.type !== "message" ||
          pending.before.has(entry.id) ||
          this.observedBash.has(entry.id)
        )
          return false;
        const message = entry.message as unknown as {
          role: string;
          command?: string;
        };
        return (
          message.role === "bashExecution" &&
          hash(message.command ?? "") === pending.hash
        );
      });
      if (ended) this.observedBash.add(ended.id);
      return !ended;
    });
  }
  captureExecutionFence(): () => void {
    const binding = JSON.stringify(this.binding);
    const current = this.gate.current;
    const segment = current?.attempt.segment_id;
    const generation = this.gate.generation;
    return () => {
      if (
        !this.alive ||
        binding !== JSON.stringify(this.binding) ||
        current !== this.gate.current ||
        segment !== this.gate.current?.attempt.segment_id ||
        generation !== this.gate.generation
      )
        throw new Error("STALE_LOCAL_CALLBACK");
    };
  }
  serial<T>(fn: () => Promise<T>): Promise<T> {
    const binding = JSON.stringify(this.binding);
    const current = this.gate.current;
    const segment = current?.attempt.segment_id;
    const generation = this.gate.generation;
    const next = this.queue.then(() => {
      if (
        !this.alive ||
        generation !== this.gate.generation ||
        binding !== JSON.stringify(this.binding) ||
        current !== this.gate.current ||
        segment !== this.gate.current?.attempt.segment_id
      )
        throw new Error("STALE_LOCAL_CALLBACK");
      return fn();
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
  async event(
    type: string,
    extra: Record<string, unknown> = {},
    validate?: () => void,
  ): Promise<void> {
    const checkEvent = this.captureExecutionFence();
    if (type === "result_proposed" || type === "yield")
      await this.integration?.point(type === "yield" ? "yield_before_commit" : "result_before_commit");
    await this.serial(async () => {
      checkEvent();
      validate?.();
      const current = this.gate.current;
      if (!current) throw new Error("NO_CURRENT_ATTEMPT");
      const generation = this.gate.generation;
      const binding = JSON.stringify(this.binding);
      const segment = current.attempt.segment_id;
      const next = await this.client.event(current.attempt, type, extra);
      if (
        !this.alive ||
        this.gate.current !== current ||
        this.gate.generation !== generation ||
        JSON.stringify(this.binding) !== binding ||
        current.attempt.segment_id !== segment
      )
        throw new Error("STALE_LOCAL_CALLBACK");
      current.attempt = next;
    });
    // Pause tool completion, not the transport queue: a deliberate integration
    // pause must still allow lease renewals and lifecycle reports to proceed.
    if (type === "result_proposed")
      await this.integration?.point("result_after_commit_before_settled");
  }
  async interrupt(reason: string, abortModel = true): Promise<void> {
    if (!this.gate.current || this.gate.frozen) return;
    this.gate.invalidate();
    this.expectedInput = undefined;
    if (
      abortModel && this.context &&
      this.gate.current.attempt.target.session_id ===
        this.context.sessionManager.getSessionId() &&
      !this.context.isIdle()
    )
      this.context.abort();
    await this.client.request("/v2/agents/interruption", {
      request_id: randomUUID(),
      binding: this.binding,
      reason,
    });
  }
  install(): void {
    const { pi } = this;
    pi.on("session_start", async (event, ctx) => {
      this.context = ctx;
      if (this.disabledReason) return;
      // /new and /resume may run while the active tool set is restricted to
      // the previous segment. Only startup/reload supplies an ordinary set.
      if (
        !this.state.ordinaryTools ||
        event.reason === "startup" ||
        event.reason === "reload"
      )
        this.state.ordinaryTools = this.pi.getActiveTools();
      this.ordinaryTools = [...this.state.ordinaryTools];
      if (this.identity.mode === "leader")
        this.pi.setActiveTools(["squad_run_create", "agent_task_get"]);
      this.selectedRun = undefined;
      let registrationStarted = false;
      try {
        this.host = inspectHost(this.pi, ctx);
        const declaredCapabilities = capabilities(this.pi, ctx);
        if (this.gate.current && event.reason !== "startup")
          await this.interrupt(
            event.reason === "reload" ? "extension_reload" : "session_changed",
          );
        const session = ctx.sessionManager.getSessionId();
        await this.client.connect();
        registrationStarted = true;
        const registered = await this.client.register(
          this.state.runtimeID,
          session,
          this.state.sessionID,
          ctx.isIdle() ? "idle" : "working",
          declaredCapabilities,
          this.ordinaryTools,
        );
        if (!this.alive) return;
        this.binding = registered.binding;
        this.nativeChangePrepared = false;
        this.state.sessionID = session;
        await this.client.snapshot();
        if (!this.gate.current) this.gate.frozen = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => void this.poll(), 1000);
        this.timer.unref?.();
        this.stream?.abort();
        this.stream = new AbortController();
        void this.client.watch(this.stream.signal, () => void this.poll());
      } catch (error) {
        if (
          !this.binding &&
          !this.gate.current &&
          ((!registrationStarted && !this.state.sessionID) ||
            (this.identity.mode === "leader" &&
              /IDENTITY_ALREADY_OWNED|TEAM_LEADER_ALREADY_ACTIVE|INVALID_LEADER/.test(
                String(error),
              )))
        ) {
          this.disabledReason = String(error);
          const squadTools = new Set([
            "squad_run_get",
            "squad_run_create",
            "squad_decide",
            "agent_clarify",
            "agent_clarification_answer",
            "agent_task_get",
            "agent_task_complete",
            "agent_task_yield",
            "agent_invoke",
            "list_agents",
            "get_agent",
            "read_inbox",
            "get_message",
            "send_message",
            "reply_message",
          ]);
          this.pi.setActiveTools(
            this.ordinaryTools.filter((name) => !squadTools.has(name)),
          );
          this.gate.frozen = false;
          ctx.ui.notify(
            `pi-squad: ${this.identity.mode} 模式未启用；普通 Pi 可继续使用。${this.disabledReason}`,
            "error",
          );
          if (ctx.mode !== "tui") process.stderr.write(`pi-squad: ${this.disabledReason}; ordinary Pi remains available.\n`);
          return;
        }
        this.fail(error);
      }
    });
    pi.on("session_shutdown", async (event) => {
      if (this.gate.current) {
        try {
          await this.interrupt(
            event.reason === "reload" ? "extension_reload" : "session_changed",
          );
          if (this.context) await this.reportStopped(this.context);
        } catch {
          this.gate.invalidate();
        }
      }
      if (this.timer) clearInterval(this.timer);
      this.stream?.abort();
      this.selectedRun = undefined;
    });
    const prepareSessionChange = () => {
      this.nativeChangePrepared = true;
      this.gate.generation++;
      this.expectedInput = undefined;
    };
    pi.on("session_before_switch", prepareSessionChange);
    pi.on("session_before_fork", prepareSessionChange);
    pi.on("session_before_tree", prepareSessionChange);
    pi.on("ui_prompt_start", () => {
      this.uiDepth++;
      this.lastHeartbeat = 0;
    });
    pi.on("ui_prompt_end", () => {
      this.uiDepth = Math.max(0, this.uiDepth - 1);
      this.lastHeartbeat = 0;
    });
    pi.on("session_tree", async (event) => {
      if (event.newLeafId !== event.oldLeafId) {
        this.selectedRun = undefined;
        await this.interrupt("session_changed").catch((e) => this.fail(e));
      }
    });
    const markManualCompaction = async (reason: string) => {
      const current = this.gate.current;
      // compact() has already awaited abort. An idle/suspended maintenance
      // operation must not interrupt a later continuation. Fence an active
      // segment now: its deferred settled callback may already have run, and
      // a terminating tool can report completed even when abort was requested.
      // Do not abort again here and cancel the user's compaction itself.
      if (reason === "manual" && current && current.attempt.state !== "suspended")
        await this.interrupt("manual_compaction", false).catch((e) => this.fail(e));
    };
    pi.on("session_before_compact", (event) => {
      this.nativeManualCompacting = event.reason === "manual";
      return markManualCompaction(event.reason);
    });
    pi.on("session_compact", () => { this.nativeManualCompacting = false; });
    pi.on("session_compact_failed", async (event) => {
      // Pi aborts before this hook, and a too-small session throws before
      // session_before_compact. Fence the active segment here as well, so
      // deferred settlement cannot report that abort as a missing result.
      try { await markManualCompaction(event.reason); }
      finally { this.nativeManualCompacting = false; }
    });
    pi.on("user_bash", async (event, ctx) => {
      this.pendingBash.push({
        hash: hash(event.command),
        before: new Set(
          ctx.sessionManager.getEntries().map((entry) => entry.id),
        ),
      });
      this.lastHeartbeat = 0;
      await this.interrupt("manual_interference").catch((e) => this.fail(e));
    });
    pi.on("before_agent_start", (event) => {
      if (this.disabledReason) return;
      this.localTurn++;
      this.nativeChangePrepared = false;
      if (!event.systemPromptOptions?.sections) {
        this.gate.invalidate();
        this.context?.abort();
        throw new Error("CAPABILITY_UNAVAILABLE: sections missing at runtime");
      }
      const dynamic = sections(this.identity, this.gate.current);
      for (const key of Object.keys(event.systemPromptOptions.sections))
        if (key.startsWith("pi_squad_"))
          delete event.systemPromptOptions.sections[key];
      Object.assign(event.systemPromptOptions.sections, dynamic);
      this.expectedContext = expectedContext(dynamic, this.gate.current ? taskTools(this.gate.current) : pi.getActiveTools(), 0);
      this.canonical = undefined;
      this.outcome = "completed";
    });
    pi.on("context_with_system", (event, ctx) => {
      if (this.disabledReason || !this.expectedContext) return;
      this.canonical = canonicalEvidence(event.messages, { ...this.expectedContext, request_seq: ++this.requestSeq }, pi.getActiveTools(), "squad_hook", ctx.model);
      pi.appendEntry("pi-squad-canonical", this.canonical);
    });
    pi.on("before_provider_request", (event) => {
      if (this.disabledReason) return;
      pi.appendEntry(
        "pi-squad-payload",
        providerEvidence(event.payload, this.canonical, "squad_hook"),
      );
    });
    pi.on("agent_before_settle", (event) => {
      this.outcome = event.outcome;
    });
    pi.on("agent_settled", (_event, ctx) => {
      this.context = ctx;
      const current = this.gate.current;
      const checkFence = this.captureExecutionFence();
      const outcome = this.outcome;
      const turn = this.localTurn;
      const session = ctx.sessionManager.getSessionId();
      const stillSettled = () => {
        checkFence();
        if (this.context !== ctx || this.localTurn !== turn ||
          ctx.sessionManager.getSessionId() !== session ||
          current?.attempt.target.session_id !== session ||
          this.nativeChangePrepared || !this.localIdle(ctx) || ctx.hasPendingMessages())
          throw new Error("STALE_SETTLED_CALLBACK");
      };
      // compact() aborts first and only then emits before/failed hooks.
      // Defer confirmation until those hooks can fence this segment. A changed
      // generation rejects this callback rather than affecting a later turn.
      setTimeout(() => {
        if (!current || this.gate.frozen) return;
        try { checkFence(); } catch { return; }
        try { stillSettled(); } catch { return; }
        void this.settle(ctx, outcome, stillSettled);
      }, 0);
    });
    pi.on("input", async (event) => {
      if (this.disabledReason) return { action: "continue" };
      if (event.source === "rpc" && this.gate.current) {
        this.context?.ui.notify("SQUAD_MODE_UNSUPPORTED: RPC input cannot enter a formal TUI segment.", "error");
        return { action: "handled" };
      }
      if (event.source === "extension") {
        if (this.gate.current && this.gate.frozen) return { action: "handled" };
        if (this.gate.current && event.text !== this.expectedInput) {
          this.context?.ui.notify(
            "AGENT_BUSY: unrelated extension input cannot enter a reserved Squad session.",
            "warning",
          );
          return { action: "handled" };
        }
        this.expectedInput = undefined;
        if (this.gate.current && !this.gate.frozen) {
          const current = this.gate.current;
          const generation = this.gate.generation;
          const binding = JSON.stringify(this.binding);
          await this.integration?.point("input_after_injection_before_ack");
          if (
            !this.alive ||
            this.gate.current !== current ||
            this.gate.generation !== generation ||
            JSON.stringify(this.binding) !== binding
          )
            return { action: "handled" };
          await this.event("input_observed")
            .then(() => this.integration?.point("input_after_ack"))
            .catch((e) => this.fail(e));
        }
        return { action: this.gate.frozen ? "handled" : "continue" };
      }
      return { action: "continue" };
    });
    pi.on("tool_call", (event) => {
      const reason = this.gate.checkTool(event.toolName, event.input, event.parentToolCallId);
      if (reason) return { block: true, reason };
    });
  }
  private async settle(ctx: ExtensionContext, outcome: string, validate: () => void): Promise<void> {
    if (!this.gate.current) return;
    if (this.gate.frozen) {
      await this.reportStopped(ctx).catch((error) => this.fail(error));
      return;
    }
    try {
      await this.integration?.point("settled_before_confirm");
      await this.event("settled", {
        idle: true,
        pending: false,
        outcome,
      }, validate);
      const settled = this.gate.current;
      await this.integration?.point("settled_after_confirm");
      if (settled && this.gate.current === settled && settled.attempt.cleanup_state === "released") {
        this.gate.current = undefined;
        this.pi.setActiveTools(
          this.identity.mode === "leader"
            ? ["squad_run_create", "agent_task_get"]
            : this.ordinaryTools,
        );
      }
    } catch (error) {
      if (/STALE_(LOCAL|SETTLED)_CALLBACK/.test(String(error))) return;
      this.fail(error);
    }
  }
  private async reportStopped(ctx: ExtensionContext): Promise<void> {
    const current = this.gate.current;
    if (!current || !this.localIdle(ctx) || ctx.hasPendingMessages()) return;
    const generation = this.gate.generation;
    const binding = JSON.stringify(this.binding);
    const segment = current.attempt.segment_id;
    const canReport = () =>
      this.alive &&
      this.context === ctx &&
      this.gate.current === current &&
      this.gate.generation === generation &&
      current.attempt.segment_id === segment &&
      JSON.stringify(this.binding) === binding &&
      ctx.sessionManager.getSessionId() === current.attempt.target.session_id &&
      this.localIdle(ctx) &&
      !ctx.hasPendingMessages();
    const a = await this.client.request<import("./protocol.ts").Attempt>(
      `/v2/attempts/${current.attempt.attempt_id}`,
    );
    if (
      !canReport() ||
      !["cancelled", "interrupted", "needs_review"].includes(a.state) ||
      a.cleanup_state === "released"
    )
      return;
    const stopped = await this.client.request<import("./protocol.ts").Attempt>(
      `/v2/attempts/${a.attempt_id}/stopped`,
      {
        request_id: randomUUID(),
        expected_revision: a.revision,
        segment_id: current.attempt.segment_id,
        fencing_token: current.attempt.fencing_token,
        binding: current.attempt.target,
        idle: true,
        pending: false,
      },
    );
    if (canReport()) current.attempt = stopped;
  }
  private fail(error: unknown): void {
    if (error instanceof Error && error.message === "STALE_LOCAL_CALLBACK")
      return;
    this.gate.frozen = true;
    if (
      this.gate.current &&
      this.context &&
      this.gate.current.attempt.target.session_id ===
        this.context.sessionManager.getSessionId() &&
      !this.nativeManualCompacting &&
      !this.context.isIdle()
    )
      this.context.abort();
    if (!this.notified) {
      this.context?.ui.notify(
        `pi-squad: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      this.notified = true;
    }
  }
  private async poll(): Promise<void> {
    if (this.polling || !this.alive || !this.binding || !this.context) return;
    this.polling = true;
    let sourceBinding = JSON.stringify(this.binding);
    const ctx = this.context;
    const generation = this.gate.generation;
    const session = ctx.sessionManager.getSessionId();
    const isCurrent = () =>
      this.alive &&
      this.context === ctx &&
      this.gate.generation === generation &&
      ctx.sessionManager.getSessionId() === session &&
      JSON.stringify(this.binding) === sourceBinding;
    try {
      this.observeBash(ctx);
      if (this.notified) await this.client.connect();
      if (!isCurrent()) return;
      if (
        (this.integration?.now?.() ?? Date.now()) - this.lastHeartbeat >
        4000
      ) {
        try {
          await this.client.heartbeat(
            this.binding,
            this.activity(ctx),
            this.pendingBash.length > 0 || !ctx.isIdle() ? "working" : "idle",
          );
        } catch (error) {
          if (!isCurrent()) return;
          if (this.gate.current || !String(error).includes("BINDING_CHANGED"))
            throw error;
          const snapshot = await this.client.snapshot();
          if (!isCurrent()) return;
          const own = snapshot.views.agents.find((a) => {
            const b = a.binding as Binding;
            return (
              b.agent_id === this.binding!.agent_id &&
              b.runtime_id === this.binding!.runtime_id &&
              b.session_id === this.binding!.session_id &&
              !a.revoked
            );
          });
          if (!own) throw error;
          this.binding = own.binding as Binding;
          sourceBinding = JSON.stringify(this.binding);
          await this.client.heartbeat(
            this.binding,
            this.activity(ctx),
            this.pendingBash.length > 0 || !ctx.isIdle() ? "working" : "idle",
          );
        }
        if (!isCurrent()) return;
        this.lastHeartbeat = this.integration?.now?.() ?? Date.now();
        if (!this.gate.current && this.gate.frozen) {
          this.gate.frozen = false;
          this.notified = false;
          ctx.ui.notify("控制器通信已恢复。", "info");
        }
      }
      // Operator reconciliation can release a suspended Attempt while the
      // local gate is not frozen. Reconcile every retained reservation before
      // renewing or considering a different dispatch.
      if (this.gate.current) {
        const current = this.gate.current;
        const previous = await this.client.request<
          import("./protocol.ts").Attempt
        >(`/v2/attempts/${current.attempt.attempt_id}`);
        if (
          !isCurrent() ||
          current !== this.gate.current ||
          JSON.stringify(this.binding) !== sourceBinding
        )
          return;
        if (previous.cleanup_state === "released") {
          if (!this.localIdle(ctx) || ctx.hasPendingMessages()) {
            // Busy work can now be an unrelated user turn in the same
            // session. Keep the formal gate closed; never abort that turn
            // merely because an older reservation was released remotely.
            if (!this.gate.frozen) this.gate.invalidate();
            return;
          }
          this.gate.current = undefined;
          this.gate.frozen = false;
          this.notified = false;
          this.pi.setActiveTools(
            this.identity.mode === "leader"
              ? ["squad_run_create", "agent_task_get"]
              : this.ordinaryTools,
          );
        }
      }
      if (
        this.gate.current &&
        !this.gate.frozen &&
        this.gate.current.attempt.state !== "suspended" &&
        Date.parse(this.gate.current.attempt.lease_expires_at) -
          (this.integration?.now?.() ?? Date.now()) <
          20000
      )
        await this.event("renew");
      if (!isCurrent()) return;
      try {
        const inbox = await this.client.request<{
          messages: {
            message_id: string;
            kind: string;
            text: string;
            status: string;
          }[];
        }>("/v2/messages/inbox");
        if (!isCurrent()) return;
        for (const message of inbox.messages) {
          if (!["stored", "received"].includes(message.status)) continue;
          if (message.status === "stored")
            await this.client.request(
              `/v2/messages/${message.message_id}/receipt`,
              { request_id: randomUUID(), status: "received" },
            );
          if (!isCurrent()) return;
          if (!this.recordedNotices.has(message.message_id)) {
            const recorded = ctx.sessionManager
              .getEntries()
              .some(
                (entry) =>
                  entry.type === "custom" &&
                  entry.customType === "pi-squad-notice" &&
                  (entry.data as { message_id?: string })?.message_id ===
                    message.message_id,
              );
            if (!recorded) {
              this.pi.appendEntry("pi-squad-notice", message);
              ctx.ui.notify(
                `Squad ${message.kind}: ${message.text.slice(0, 240)}`,
                "info",
              );
            }
            this.recordedNotices.add(message.message_id);
          }
          await this.client.request(
            `/v2/messages/${message.message_id}/receipt`,
            { request_id: randomUUID(), status: "recorded" },
          );
          if (!isCurrent()) return;
        }
        ctx.ui.setStatus("pi-squad-messages", undefined);
      } catch (error) {
        if (!isCurrent()) return;
        ctx.ui.setStatus(
          "pi-squad-messages",
          `消息接收暂不可用：${String(error).slice(0, 160)}`,
        );
      }
      const { dispatches } = await this.client.dispatches();
      if (!isCurrent()) return;
      for (const d of dispatches) {
        if (!isCurrent()) break;
        if (
          ["cancelled", "interrupted", "needs_review"].includes(d.attempt.state)
        ) {
          if (this.gate.current?.attempt.attempt_id === d.attempt.attempt_id) {
            this.gate.invalidate();
            // Native /compact has already stopped the formal agent loop.
            // Its summarizer is separate maintenance; do not cancel it when
            // the interruption we just reported comes back through polling.
            if (!ctx.isIdle()) {
              if (!this.nativeManualCompacting) ctx.abort();
            } else await this.reportStopped(ctx);
          }
          continue;
        }
        if (
          !this.gate.canInject(
            d,
            this.binding,
            this.localIdle(ctx),
            ctx.hasPendingMessages(),
          )
        )
          continue;
        this.gate.current = d;
        const generation = this.gate.generation;
        await this.integration?.point("dispatch_before_received");
        if (!this.alive || this.gate.current !== d || generation !== this.gate.generation)
          continue;
        await this.event("adapter_received");
        if (d.task.run_id) {
          const run = await this.client.request<Record<string, unknown>>(
            `/v2/runs/${d.task.run_id}`,
          );
          const snapshot = await this.client.snapshot();
          d.briefing = briefing(d, run, snapshot);
        }
        const input = `${d.task.kind === "ask" ? `Managed ask message_id=${d.task.task_id}; use only get_message/reply_message for this exact ID. End after reply_message.\n` : ""}Segment mode: ${d.attempt.segment_mode ?? "work"}; clarification: ${d.attempt.clarification_text ?? "none"}\nPi Squad TaskContract (data):\n${JSON.stringify(d.task)}\nBriefing (data): ${JSON.stringify(d.briefing ?? {})}\n\n${d.task.goal}`;
        await this.integration?.point("before_final_gate");
        if (
          !this.alive ||
          generation !== this.gate.generation ||
          !this.gate.canInject(
            d,
            this.binding,
            this.localIdle(ctx),
            ctx.hasPendingMessages(),
          )
        ) {
          if (this.alive && !this.gate.frozen) {
            await this.event("deferred", { uninjected: true });
            this.gate.current = undefined;
          }
          continue;
        }
        const loadout = taskTools(d);
        activateTaskTools(this.pi, loadout);
        await this.event("injection_requested");
        // No await between the final gate and Pi input. Durable injection intent
        // precedes this call, so ambiguous outcomes never cause an automatic replay.
        if (
          !this.alive ||
          generation !== this.gate.generation ||
          !this.gate.canInject(
            d,
            this.binding,
            this.localIdle(ctx),
            ctx.hasPendingMessages(),
          )
        ) {
          if (this.alive && !this.gate.frozen) {
            await this.event("deferred", { uninjected: true });
            this.gate.current = undefined;
          }
          continue;
        }
        activateTaskTools(this.pi, loadout);
        this.gate.markInjection(d);
        this.expectedInput = input;
        this.pi.sendUserMessage(input, { expandPromptTemplates: false });
      }
    } catch (error) {
      if (isCurrent()) this.fail(error);
    } finally {
      this.polling = false;
    }
  }
}
