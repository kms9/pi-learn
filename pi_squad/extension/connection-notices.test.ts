import assert from "node:assert/strict";
import test from "node:test";
import { createConnectionNotices, isTransportInterruption } from "./connection-notices.ts";

test("one outage across SSE, inbox and repeated heartbeat errors; one recovery", () => {
  const seen: string[] = [];
  const notices = createConnectionNotices();
  notices.reset(text => seen.push(text));
  notices.failed("sse", new TypeError("terminated"));
  notices.failed("inbox", new TypeError("fetch failed"));
  for (let i = 0; i < 4; i++) notices.failed("heartbeat", new TypeError("fetch failed"));
  assert.equal(seen.length, 1);
  assert.equal(notices.snapshot().interrupted, true);
  notices.healthy("sse"); notices.healthy("inbox");
  assert.equal(seen.length, 1);
  notices.healthy("heartbeat"); notices.healthy("heartbeat");
  assert.equal(seen.length, 2);
  assert.match(seen[1], /通信已恢复/);
  assert.equal(notices.snapshot().interrupted, false);
  notices.failed("sse", new TypeError("terminated"));
  assert.equal(seen.length, 3);
});
test("identity failures and unrelated bugs are not hidden as network retries", () => {
  const seen: string[] = [];
  const notices = createConnectionNotices();
  notices.reset(text => seen.push(text));
  notices.failed("inbox", new TypeError("fetch failed"));
  const denied = Object.assign(new Error("binding conflict"), { status: 409 });
  notices.failed("heartbeat", denied); notices.failed("heartbeat", denied);
  assert.equal(seen.length, 2);
  notices.healthy("inbox");
  assert.equal(seen.length, 2);
  assert.equal(notices.snapshot().interrupted, true);
  assert.equal(isTransportInterruption(denied), false);
  assert.equal(isTransportInterruption(new TypeError("unexpected property access")), false);
  notices.reset(text => seen.push(text));
  assert.equal(notices.snapshot().interrupted, false);
});
