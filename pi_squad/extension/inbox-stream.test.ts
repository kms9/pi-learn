import assert from "node:assert/strict";
import test from "node:test";
import { createInboxEventParser, streamInbox, InboxStreamError } from "./inbox-stream.ts";

test("SSE chunked CRLF, comments and data do not turn heartbeats into messages", () => {
  const events: string[] = [];
  const parse = createInboxEventParser(event => events.push(event));
  for (const character of ": keepalive\r\n\r\nevent: inbox\r\ndata: {}\r\n\r\nevent: binding_closed\ndata: {}\n\n") parse(character);
  assert.deepEqual(events, ["inbox", "binding_closed"]);
});
test("partial or oversized SSE frames never cause a spurious wake", () => {
  const events: string[] = [];
  const parse = createInboxEventParser(event => events.push(event));
  parse("event: inbox\ndata: {}");
  assert.deepEqual(events, []);
  assert.throws(() => parse("x".repeat(65537)), /exceeds/);
});
test("SSE uses header credentials, wakes only on inbox and stops on binding closure", async () => {
  const original = globalThis.fetch;
  const token = "test-private-runtime-token";
  let wakes = 0;
  let connected = 0;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input).includes(token), false);
    assert.equal((init?.headers as Record<string,string>).authorization, `Bearer ${token}`);
    return new Response("event: inbox\ndata: {}\n\n: ping\n\nevent: binding_closed\ndata: {}\n\n", { headers: { "content-type": "text/event-stream" } });
  };
  try {
    await assert.rejects(streamInbox("http://example.invalid", { agent_id:"a", runtime_id:"uuid", runtime_session_id:"session", runtime_token:token }, new AbortController().signal, () => wakes++, () => connected++), error => error instanceof InboxStreamError && error.status === 409);
    assert.equal(wakes, 1); assert.equal(connected, 1);
  } finally { globalThis.fetch = original; }
});
