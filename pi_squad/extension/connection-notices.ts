export type ConnectionChannel = "sse" | "inbox" | "heartbeat";
type Notify = (text: string, level: "info" | "warning" | "error") => void;

export function isTransportInterruption(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Do not conceal unrelated TypeErrors or protocol/identity failures.
  if (typeof (error as { status?: unknown }).status === "number") return false;
  return (error instanceof TypeError && ["fetch failed", "terminated"].includes(error.message))
    || error.name === "TimeoutError"
    || ["SSE connection ended", "SSE connection timed out"].includes(error.message);
}

/** One user-visible outage across SSE, HTTP inbox and heartbeat. */
export function createConnectionNotices() {
  let notify: Notify = () => {};
  const failures = new Map<ConnectionChannel, string>();
  const reported = new Set<string>();
  let outageNotified = false;
  return {
    reset(nextNotify?: Notify) {
      failures.clear(); reported.clear(); outageNotified = false;
      notify = nextNotify ?? (() => {});
    },
    failed(channel: ConnectionChannel, error: unknown) {
      const description = String(error);
      failures.set(channel, description);
      if (isTransportInterruption(error)) {
        if (!outageNotified) {
          outageNotified = true;
          notify("pi-squad: 控制器连接中断，正在重连并补查收件箱；消息结果以收件记录为准。", "warning");
        }
        return;
      }
      const signature = `${channel}:${description}`;
      if (!reported.has(signature)) {
        reported.add(signature);
        notify(`pi-squad ${channel}: ${description}`, "warning");
      }
    },
    healthy(channel: ConnectionChannel) {
      failures.delete(channel);
      if (failures.size === 0 && outageNotified) {
        outageNotified = false;
        reported.clear();
        notify("pi-squad: 控制器通信已恢复。消息处理结果请查看收件箱。", "info");
      }
    },
    snapshot() { return { interrupted: failures.size > 0, failures: Object.fromEntries(failures) }; },
  };
}
export type ConnectionNotices = ReturnType<typeof createConnectionNotices>;
