import type { Binding } from "./controller-client.ts";

export class InboxStreamError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "InboxStreamError"; }
}

/** SSE framing for the private inbox invalidation protocol (not an event log).
 * Accept LF/CRLF/CR and chunk boundaries; bound malformed frames in memory.
 */
export function createInboxEventParser(onEvent: (event: string) => void) {
  let buffer = "";
  let event = "";
  let hasData = false;
  let frameSize = 0;
  return (chunk: string) => {
    buffer += chunk;
    while (true) {
      const match = /[\r\n]/.exec(buffer);
      if (!match) break;
      const index = match.index;
      if (buffer[index] === "\r" && index === buffer.length - 1) break;
      const line = buffer.slice(0, index);
      const width = buffer[index] === "\r" && buffer[index + 1] === "\n" ? 2 : 1;
      buffer = buffer.slice(index + width);
      frameSize += line.length + width;
      if (frameSize > 65536) throw new Error("SSE frame exceeds 64 KiB character limit");
      if (!line) {
        if (hasData) onEvent(event || "message");
        event = ""; hasData = false; frameSize = 0;
      } else if (line[0] !== ":") {
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") event = value;
        if (field === "data") hasData = true;
      }
    }
    if (buffer.length + frameSize > 65536) throw new Error("SSE frame exceeds 64 KiB character limit");
  };
}

/** One connection only. The lifecycle owner controls retries and reconciliation. */
export async function streamInbox(root: string, binding: Binding, signal: AbortSignal, onWake: () => void, onConnected: () => void): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  let deadline: ReturnType<typeof setTimeout>;
  const arm = (ms: number) => {
    clearTimeout(deadline);
    deadline = setTimeout(() => controller.abort(new Error("SSE connection timed out")), ms);
    deadline.unref?.();
  };
  arm(5000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const query = new URLSearchParams({ agent_id: binding.agent_id, runtime_id: binding.runtime_id, runtime_session_id: binding.runtime_session_id });
    const response = await fetch(`${root}/messages/events?${query}`, {
      signal: controller.signal, redirect: "error", cache: "no-store",
      headers: { accept: "text/event-stream", authorization: `Bearer ${binding.runtime_token ?? ""}` },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new InboxStreamError(`SSE HTTP ${response.status}`, response.status);
    }
    if (response.headers.get("content-type")?.split(";")[0].trim() !== "text/event-stream" || !response.body) {
      await response.body?.cancel();
      throw new InboxStreamError("Controller did not return text/event-stream");
    }
    reader = response.body.getReader();
    arm(35000);
    onConnected();
    const decoder = new TextDecoder();
    const parse = createInboxEventParser(event => {
      if (event === "binding_closed") throw new InboxStreamError("SSE runtime binding closed", 409);
      if (event === "inbox") onWake();
    });
    while (!controller.signal.aborted) {
      const part = await reader.read();
      if (part.done) throw new InboxStreamError("SSE connection ended");
      arm(35000);
      parse(decoder.decode(part.value, { stream: true }));
    }
  } finally {
    clearTimeout(deadline!);
    signal.removeEventListener("abort", abort);
    controller.abort();
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}
