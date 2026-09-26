import type { ControllerClient } from "./controller-client.ts";

export type HeartbeatHandle = {
  stop: () => void;
};

/**
 * Periodic heartbeat. Caller must stop and recreate on session_start
 * (/new, resume, reload) so a stale generation cannot keep writing.
 */
export function startHeartbeat(
  client: ControllerClient,
  agentId: string,
  intervalMs: number,
  getRuntimeSessionId: () => string | undefined,
  onError?: (err: unknown) => void,
  runtimeId?: string,
  runtimeToken?: string,
  onSuccess?: () => void,
): HeartbeatHandle {
  let stopped = false;
  let pending = false;
  const tick = () => {
    if (stopped || pending) return;
    pending = true;
    void client.heartbeat(agentId, getRuntimeSessionId(), runtimeId, runtimeToken).then(() => { if (!stopped) onSuccess?.(); }).catch((err) => {
      if (!stopped) onError?.(err);
    }).finally(() => { pending = false; });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  if (typeof timer === "object" && timer && "unref" in timer) {
    timer.unref();
  }
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
