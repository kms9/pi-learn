import assert from "node:assert/strict";
import test from "node:test";
import { installMessaging } from "./messaging.ts";
import { InboxStreamError } from "./inbox-stream.ts";
import type { Binding, ControllerClient } from "./controller-client.ts";

const binding = (): Binding => ({
  agent_id: "backend",
  runtime_id: "22222222-2222-4222-8222-222222222222",
  runtime_session_id: "sess-b",
  runtime_token: "harness-private-credential-at-least-32",
});

type Handler = (...args: any[]) => any;

function harness() {
  const handlers = new Map<string, Handler[]>();
  const sent: unknown[] = [];
  const notified: string[] = [];
  const entries: unknown[] = [];
  let idle = true;
  let pending = false;
  const commands = new Map<string, Handler>();
  const api = {
    on(event: string, fn: Handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
    },
    appendEntry(customType: string, data: unknown) {
      entries.push({ type: "custom", customType, data });
    },
    sendMessage(message: unknown) { sent.push(message); },
    registerCommand(_name: string, command: { handler: Handler }) { commands.set(_name, command.handler); },
    registerTool() {},
  };
  const ctx = {
    ui: { notify(text: string) { notified.push(text); } },
    sessionManager: { getEntries: () => entries },
    isIdle: () => idle,
    hasPendingMessages: () => pending,
  };
  const receipts: { id: string; status: string }[] = [];
  let messages: any[] = [];
  const gates = new Map<string, { resolve: (value: any) => void }>();
  const client = {
    async inbox() { return { messages: [...messages] }; },
    async receipt(_b: Binding, id: string, status: string) {
      receipts.push({ id, status });
      const found = messages.find(m => m.message_id === id);
      if (found) found.status = status;
      const gate = gates.get(`${id}:${status}`);
      if (gate) return new Promise(resolve => { gate.resolve = resolve; });
      return { ...(found ?? { message_id: id, kind: "ask", text: "q", from: { agent_id: "reviewer" } }), status };
    },
    streamInbox() { return new Promise(() => {}); },
    sendMessage() { throw new Error("sendMessage is not part of this harness"); },
    getMessage() { throw new Error("getMessage is not part of this harness"); },
  };
  installMessaging(api as any, client as unknown as ControllerClient, binding, new Map());
  return {
    sent, notified, receipts, ctx, client, commands,
    async transport() {
      let text = "";
      await commands.get("squad-transport")?.({}, { ui: { notify(value: string) { text = value; } } });
      return JSON.parse(text);
    },
    setIdle(value: boolean) { idle = value; },
    setPending(value: boolean) { pending = value; },
    queue(message: any) { messages = [message, ...messages]; },
    hold(id: string, status: string) { gates.set(`${id}:${status}`, { resolve: () => {} }); },
    release(id: string, status: string, body?: any) {
      const gate = gates.get(`${id}:${status}`);
      gate?.resolve(body ?? { message_id: id, kind: "ask", text: "q", status, from: { agent_id: "reviewer" } });
    },
    async fire(event: string, ...args: any[]) {
      let result;
      for (const fn of handlers.get(event) ?? []) result = await fn(...args);
      return result;
    },
  };
}

const ask = (id: string) => ({ message_id: id, kind: "ask", status: "stored", text: "/new && bash", from: { agent_id: "reviewer" } });

async function flush() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

test("busy ask is not injected until idle, then only once", async () => {
  const h = harness();
  h.setIdle(false);
  h.queue(ask("ask-1"));
  await h.fire("session_start", {}, h.ctx);
  await flush();
  assert.equal(h.sent.length, 0);
  assert.equal(h.receipts.some(r => r.status === "injection_requested"), false);
  h.setIdle(true);
  await h.fire("agent_end");
  await flush();
  assert.equal(h.sent.length, 1);
  await h.fire("agent_end");
  await flush();
  assert.equal(h.sent.length, 1, "agent_end must not inject the same ask twice");
  await h.fire("session_shutdown");
});

test("user input between claim and injection defers and does not call sendMessage", async () => {
  const h = harness();
  h.queue(ask("ask-2"));
  h.hold("ask-2", "injection_requested");
  const started = h.fire("session_start", {}, h.ctx);
  await flush();
  assert.deepEqual(h.receipts.at(-1), { id: "ask-2", status: "injection_requested" });
  await h.fire("input", { source: "user" });
  h.release("ask-2", "injection_requested");
  await started.catch(() => {});
  await flush();
  assert.equal(h.sent.length, 0);
  assert.equal(h.receipts.some(r => r.id === "ask-2" && r.status === "deferred"), true);
  await h.fire("session_shutdown");
});

test("active ask blocks bash/edit/write/other tools and allows only the current message id", async () => {
  const h = harness();
  h.queue(ask("ask-3"));
  await h.fire("session_start", {}, h.ctx);
  await flush();
  assert.equal(h.sent.length, 1);
  const blocked = ["bash", "edit", "write", "other_extension_tool"].map(toolName =>
    h.fire("tool_call", { toolName, input: { message_id: "ask-3" } }));
  const results = await Promise.all(blocked);
  for (const result of results) assert.equal(result?.block, true);
  const allowedGet = await h.fire("tool_call", { toolName: "get_message", input: { message_id: "ask-3" } });
  const allowedReply = await h.fire("tool_call", { toolName: "reply_message", input: { message_id: "ask-3" } });
  const wrongId = await h.fire("tool_call", { toolName: "reply_message", input: { message_id: "other" } });
  assert.equal(allowedGet, undefined);
  assert.equal(allowedReply, undefined);
  assert.equal(wrongId?.block, true);
  await h.fire("session_shutdown");
});

test("401 from SSE stops that generation instead of reconnecting", async () => {
  const h = harness();
  h.client.streamInbox = async () => { throw new InboxStreamError("SSE HTTP 401", 401); };
  await h.fire("session_start", {}, h.ctx);
  await new Promise(resolve => setTimeout(resolve, 20));
  const transport = await h.transport();
  assert.equal(transport.reconnects, 0);
  assert.equal(transport.mode, "polling");
  await h.fire("session_shutdown");
});

test("404 stops SSE reconnect but still reconciles through HTTP inbox", async () => {
  const h = harness();
  h.client.streamInbox = async () => { throw new InboxStreamError("SSE HTTP 404", 404); };
  let inboxCalls = 0;
  const original = h.client.inbox;
  h.client.inbox = async () => { inboxCalls++; return original(); };
  h.queue({ message_id: "notice-404", kind: "notice", status: "stored", text: "still here", from: { agent_id: "reviewer" } });
  await h.fire("session_start", {}, h.ctx);
  await new Promise(resolve => setTimeout(resolve, 30));
  const transport = await h.transport();
  assert.equal(transport.reconnects, 0);
  assert.equal(transport.mode, "polling");
  assert.equal(inboxCalls > 0, true);
  assert.equal(h.notified.some(text => text.includes("notice-404")), true);
  await h.fire("session_shutdown");
});

test("binding_closed 409 stops that generation", async () => {
  const h = harness();
  h.client.streamInbox = async () => { throw new InboxStreamError("SSE runtime binding closed", 409); };
  await h.fire("session_start", {}, h.ctx);
  await new Promise(resolve => setTimeout(resolve, 20));
  const transport = await h.transport();
  assert.equal(transport.reconnects, 0);
  assert.equal(transport.mode, "polling");
  await h.fire("session_shutdown");
});

test("a repeated wake does not notify the same notice twice", async () => {
  const h = harness();
  h.queue({ message_id: "notice-dup", kind: "notice", status: "stored", text: "once", from: { agent_id: "reviewer" } });
  await h.fire("session_start", {}, h.ctx);
  await flush();
  const before = h.notified.filter(text => text.includes("notice-dup")).length;
  await h.fire("agent_end");
  await flush();
  const after = h.notified.filter(text => text.includes("notice-dup")).length;
  assert.equal(before, 1);
  assert.equal(after, 1);
  await h.fire("session_shutdown");
});

test("shutdown before a late inbox return does not inject", async () => {
  const h = harness();
  let releaseInbox: (value: { messages: any[] }) => void = () => {};
  h.client.inbox = () => new Promise(resolve => { releaseInbox = resolve; });
  await h.fire("session_start", {}, h.ctx);
  await h.fire("session_shutdown");
  releaseInbox({ messages: [ask("ask-late")] });
  await flush();
  assert.equal(h.sent.length, 0);
  assert.equal(h.receipts.length, 0);
});

test("a wake during an in-flight read causes one more reconcile and does not drop the new message", async () => {
  const h = harness();
  let calls = 0;
  let releaseFirst: (value: { messages: any[] }) => void = () => {};
  h.client.inbox = () => {
    calls++;
    if (calls === 1) return new Promise(resolve => { releaseFirst = resolve; });
    return Promise.resolve({ messages: [ask("ask-during")] });
  };
  await h.fire("session_start", {}, h.ctx);
  await flush();
  h.queue(ask("ask-during"));
  await h.fire("agent_end");
  releaseFirst({ messages: [] });
  await flush();
  await flush();
  assert.equal(calls >= 2, true);
  assert.equal(h.sent.length, 1);
  await h.fire("session_shutdown");
});
