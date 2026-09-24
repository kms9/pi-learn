import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { streamInbox } from "./inbox-stream.ts";

const binding = {
  agent_id: "backend",
  runtime_id: "22222222-2222-4222-8222-222222222222",
  runtime_session_id: "sess-b",
  runtime_token: "silence-private-credential-at-least-32",
};

function silenceServer() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    res.write("event: inbox\ndata: {}\n\n");
  });
  return new Promise<{ url: string; close: () => Promise<void> }>(resolve => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise(done => server.close(() => done())),
      });
    });
  });
}

test("successful SSE with no further bytes aborts on the 35s read deadline", async () => {
  const server = await silenceServer();
  const signal = new AbortController();
  const started = Date.now();
  await assert.rejects(
    streamInbox(server.url, binding, signal.signal, () => {}, () => {}),
    /timed out/,
  );
  const elapsed = Date.now() - started;
  assert.equal(elapsed >= 34000 && elapsed < 40000, true, `elapsed ${elapsed}`);
  await server.close();
});

test("shutdown abort during the silence wait cancels without waiting out the deadline", async () => {
  const server = await silenceServer();
  const signal = new AbortController();
  const started = Date.now();
  const pending = streamInbox(server.url, binding, signal.signal, () => {}, () => {});
  setTimeout(() => signal.abort(), 200);
  await assert.rejects(pending);
  const elapsed = Date.now() - started;
  assert.equal(elapsed < 2000, true, `elapsed ${elapsed}`);
  await server.close();
});
