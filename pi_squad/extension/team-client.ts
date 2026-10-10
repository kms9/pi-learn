import { randomUUID } from "node:crypto";
import {
  PROTOCOL,
  discovery,
  readOperatorToken,
  type Discovery,
  type ProjectIdentity,
} from "./project.ts";
import type {
  Attempt,
  Binding,
  Dispatch,
  Instance,
  Snapshot,
} from "./protocol.ts";

export class TeamClient {
  private known?: Discovery;
  private connectionGeneration = 0;
  private binding?: Binding;
  cachedSnapshot?: Snapshot;
  constructor(
    readonly identity: ProjectIdentity,
    private runtimeToken: string,
  ) {}
  async connect(): Promise<Discovery> {
    const generation = ++this.connectionGeneration;
    const d = discovery(this.identity.root);
    const endpoint = process.env.PI_SQUAD_CONTROLLER_URL?.trim() || d.endpoint;
    const response = await fetch(`${endpoint}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw new Error(`Controller health HTTP ${response.status}`);
    const health = (await response.json()) as Discovery;
    for (const key of [
      "protocol_version",
      "project_root",
      "controller_id",
      "controller_epoch",
    ] as const) {
      if (health[key] !== d[key])
        throw new Error(`CONTROLLER_IDENTITY_MISMATCH: ${key}`);
    }
    if (generation !== this.connectionGeneration)
      throw new Error("DISCOVERY_SUPERSEDED: a newer connection check started");
    if (
      this.known?.controller_epoch !== d.controller_epoch ||
      this.known?.controller_id !== d.controller_id
    )
      this.cachedSnapshot = undefined;
    this.known = { ...d, endpoint };
    return this.known;
  }
  captureControllerFence(): () => void {
    const controllerID = this.known?.controller_id;
    const epoch = this.known?.controller_epoch;
    return () => {
      if (
        controllerID !== this.known?.controller_id ||
        epoch !== this.known?.controller_epoch
      ) throw new Error("CONTROLLER_IDENTITY_CHANGED: preview superseded");
    };
  }
  async request<T>(
    route: string,
    body?: unknown,
    operator = false,
    signal?: AbortSignal,
  ): Promise<T> {
    const sourceBinding = this.binding;
    if (!this.known) await this.connect();
    const d = this.known!;
    const requestID =
      body && typeof body === "object"
        ? String((body as Record<string, unknown>).request_id ?? "")
        : "";
    let response: Response;
    try {
      response = await fetch(`${d.endpoint}${route}`, {
        method: body === undefined ? "GET" : "POST",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
          : AbortSignal.timeout(5000),
        headers: {
          "content-type": "application/json",
          "X-Pi-Squad-Protocol": PROTOCOL,
          "X-Pi-Squad-Controller": d.controller_id,
          "X-Pi-Squad-Agent": this.identity.agentID,
          ...(sourceBinding
            ? { "X-Pi-Squad-Binding": JSON.stringify(sourceBinding) }
            : {}),
          authorization: `Bearer ${operator ? readOperatorToken(this.identity.root) : this.runtimeToken}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(
        `request_id=${requestID || "none"} ${route}: outcome unknown; ${String(error)}`,
      );
    }
    const text = await response.text();
    if (!response.ok)
      throw new Error(
        `Controller HTTP ${response.status} request_id=${requestID || "none"}: ${text}`,
      );
    return JSON.parse(text) as T;
  }
  async register(
    runtimeID: string,
    sessionID: string,
    previousSessionID: string | undefined,
    activity: string,
    capabilities: Record<string, boolean>,
    availableTools: string[],
  ): Promise<Instance> {
    const result = await this.request<Instance>("/v2/agents/register", {
      agent_id: this.identity.agentID,
      runtime_id: runtimeID,
      session_id: sessionID,
      previous_session_id: previousSessionID ?? "",
      runtime_token: this.runtimeToken,
      mode: this.identity.mode,
      role_id: this.identity.roleID,
      team_id: this.identity.teamID,
      activity,
      capabilities,
      role_hash: this.identity.roleHash,
      available_tools: availableTools,
    });
    this.binding = result.binding;
    return result;
  }
  async heartbeat(
    binding: Binding,
    activity: string,
    underlying_activity = activity,
  ): Promise<Instance> {
    // A verified snapshot may refresh Primary epoch without changing the
    // runtime/session. Send that binding in both the header and request body.
    this.binding = binding;
    const result = await this.request<Instance>("/v2/agents/heartbeat", {
      binding,
      activity,
      underlying_activity,
    });
    if (this.binding === binding) this.binding = result.binding;
    return result;
  }
  async snapshot(signal?: AbortSignal): Promise<Snapshot> {
    if (!this.known) await this.connect();
    const controller = this.known!;
    const snapshot = await this.request<Snapshot>(
      "/v2/snapshot",
      undefined,
      false,
      signal,
    );
    if (controller.controller_id !== this.known?.controller_id)
      throw new Error("CONTROLLER_IDENTITY_CHANGED: snapshot superseded");
    if (snapshot.controller_epoch !== this.known?.controller_epoch)
      throw new Error("CONTROLLER_EPOCH_CHANGED: rediscover required");
    if (
      !this.cachedSnapshot ||
      snapshot.controller_epoch !== this.cachedSnapshot.controller_epoch ||
      snapshot.revision > this.cachedSnapshot.revision ||
      (snapshot.revision === this.cachedSnapshot.revision &&
        Date.parse(snapshot.observed_at) >=
          Date.parse(this.cachedSnapshot.observed_at))
    )
      this.cachedSnapshot = snapshot;
    return this.cachedSnapshot;
  }
  readonly transport = {
    mode: "stopped",
    wakeups: 0,
    reconnects: 0,
    last_error: "",
    last_reconcile_at: "",
  };
  async watch(signal: AbortSignal, wake: () => void): Promise<void> {
    let cursor = 0,
      backoff = 500;
    while (!signal.aborted) {
      try {
        // Reconnect is read-only: rediscover and establish a current snapshot
        // before choosing an event cursor, never replay a prior dispatch.
        await this.connect();
        const known = this.known!;
        const initial = await this.snapshot(signal);
        cursor = initial.revision;
        this.transport.mode = "connecting";
        const connection = new AbortController();
        const connectTimeout = setTimeout(() => connection.abort(), 5000);
        let response: Response;
        try {
          response = await fetch(
            `${known.endpoint}/v2/events?after=${cursor}`,
            {
              headers: {
                accept: "text/event-stream",
                "X-Pi-Squad-Protocol": PROTOCOL,
                "X-Pi-Squad-Controller": known.controller_id,
              },
              signal: AbortSignal.any([signal, connection.signal]),
            },
          );
        } finally {
          clearTimeout(connectTimeout);
        }
        if (!response.ok || !response.body)
          throw new Error(`SSE HTTP ${response.status}`);
        this.transport.mode = "sse";
        this.transport.last_error = "";
        backoff = 500;
        wake();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (!signal.aborted) {
            const idleTimeout = setTimeout(() => connection.abort(), 35000);
            let chunk: ReadableStreamReadResult<Uint8Array>;
            try {
              chunk = await reader.read();
            } finally {
              clearTimeout(idleTimeout);
            }
            const { done, value } = chunk;
            if (done) throw new Error("SSE stream ended");
            buffer += decoder.decode(value, { stream: true });
            if (buffer.length > 256 * 1024)
              throw new Error("SSE frame too large");
            let boundary: number;
            let invalidated = false;
            while ((boundary = buffer.indexOf("\n\n")) >= 0) {
              const frame = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const data = frame
                .split("\n")
                .find((line) => line.startsWith("data: "));
              if (!data) continue;
              const event = JSON.parse(data.slice(6)) as {
                controller_epoch: number;
                seq: number;
              };
              if (event.controller_epoch !== known.controller_epoch)
                throw new Error("CONTROLLER_EPOCH_CHANGED");
              if (!Number.isSafeInteger(event.seq) || event.seq < 0)
                throw new Error("INVALID_EVENT_CURSOR");
              if (event.seq > cursor) {
                // Gap or newer hint is invalidation only. Commit the cursor from
                // the snapshot below so a failed reconcile cannot skip events.
                if (event.seq > cursor + 1)
                  this.transport.last_error = "EVENT_GAP";
                this.transport.wakeups++;
                invalidated = true;
              }
            }
            if (invalidated) {
              const snapshot = await this.snapshot(signal);
              if (snapshot.controller_epoch !== known.controller_epoch)
                throw new Error("CONTROLLER_EPOCH_CHANGED");
              cursor = snapshot.revision;
              this.transport.last_error = "";
              this.transport.last_reconcile_at = new Date().toISOString();
              wake();
            }
          }
        } finally {
          await reader.cancel().catch(() => undefined);
        }
      } catch (error) {
        if (signal.aborted) break;
        this.transport.mode = "polling";
        this.transport.last_error = String(error);
        this.transport.reconnects++;
        wake();
      }
      if (signal.aborted) break;
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", finish);
          resolve();
        };
        const timer = setTimeout(finish, backoff);
        signal.addEventListener("abort", finish, { once: true });
      });
      backoff = Math.min(15000, backoff * 2);
    }
    this.transport.mode = "stopped";
  }
  dispatches(): Promise<{ dispatches: Dispatch[] }> {
    return this.request("/v2/dispatches");
  }
  event(
    attempt: Attempt,
    type: string,
    extra: Record<string, unknown> = {},
  ): Promise<Attempt> {
    const endpoint =
      type === "yield"
        ? "yield"
        : type === "result_proposed"
          ? "result"
          : "events";
    return this.request(
      `/v2/attempts/${encodeURIComponent(attempt.attempt_id)}/${endpoint}`,
      {
        request_id: randomUUID(),
        expected_revision: attempt.revision,
        segment_id: attempt.segment_id,
        controller_epoch: attempt.controller_epoch,
        fencing_token: attempt.fencing_token,
        type,
        idle: false,
        pending: false,
        ...extra,
      },
    );
  }
}
