#!/usr/bin/env node
/**
 * Isolated acceptance for list_agents / get_agent.
 *
 * Pi --mode rpc processes register against a private controller. A local
 * provider emits the requested tool call so Pi's own tool executor runs
 * list_agents / get_agent. That is not a natural-language model turn and
 * not an HTTP unit test of the extension.
 *
 * Never contacts 127.0.0.1:18741 and does not stop user processes.
 */
import { spawn } from "node:child_process";
import http from "node:http";
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const extension = path.join(root, "pi_squad/extension/index.ts");
const controllerDir = path.join(root, "pi_squad/controller");
const outDir = path.dirname(fileURLToPath(import.meta.url));
const work = realpathSync(mkdtempSync(path.join(tmpdir(), "pi-squad-get-agent-")));
const db = path.join(work, "pi_squad.sqlite");
const piBin = process.env.PI_BIN || "pi";
const forbiddenPorts = new Set([18741, 18751]);
const heartbeatTimeout = "3s";
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fatDescription = "A".repeat(52000);
const slashId = "squad/a/b";
const spaceId = "a b";
const sidecarNotes = "SIDECAR_NOTES_9f3a not a role entry";
const sidecarJson = "SIDECAR_JSON_9f3a";
const sidecarRuntime = "SIDECAR_RUNTIME_9f3a";
const reviewerBody = "You are the reviewer. Do not edit files.";
const promptLog = path.join(work, "observed-prompts.jsonl");

const children = [];
const cases = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function record(id, status, detail) {
  cases.push({ id, status, ...detail });
  console.error(`${status} ${id}`);
}

function killChild(child) {
  if (!child?.pid || child.killed) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try { child.kill("SIGTERM"); } catch { /* already gone */ }
  }
}

function cleanup() {
  for (const child of children) killChild(child);
}

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

function spawnGrouped(command, args, opts) {
  const child = spawn(command, args, { ...opts, detached: true });
  children.push(child);
  return child;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function unusedPort() {
  for (let i = 0; i < 8; i++) {
    const port = await freePort();
    if (port && !forbiddenPorts.has(port)) return port;
  }
  throw new Error("could not allocate a port other than 18741 or 18751");
}

function assertIsolated(base) {
  const url = new URL(base);
  if (url.hostname !== "127.0.0.1" || forbiddenPorts.has(Number(url.port))) {
    throw new Error(`refusing non-isolated controller URL ${base}`);
  }
}

function cleanEnv(extra) {
  const env = { ...process.env, ...extra };
  for (const key of Object.keys(env)) {
    if (key.startsWith("PI_SQUAD_") || key.startsWith("HERDR_")) delete env[key];
  }
  Object.assign(env, extra);
  env.PI_OFFLINE = "1";
  return env;
}

function writeRole(rolesDir, name, description, body) {
  const roleDir = path.join(rolesDir, name);
  mkdirSync(roleDir, { recursive: true });
  writeFileSync(path.join(roleDir, "role.md"), `---
name: ${name}
description: ${description}
---
${body}
`);
  return roleDir;
}

function writeDriver() {
  const rolesDir = path.join(work, ".agents/roles");
  mkdirSync(rolesDir, { recursive: true });
  const reviewerDir = writeRole(rolesDir, "reviewer", "Reviewer catalog entry", reviewerBody);
  writeFileSync(path.join(reviewerDir, "notes.md"), `---
name: another-role
description: must not be loaded
---
${sidecarNotes}
`);
  writeFileSync(path.join(reviewerDir, "state.json"), JSON.stringify({ token: sidecarJson }));
  mkdirSync(path.join(reviewerDir, "runtime"));
  writeFileSync(path.join(reviewerDir, "runtime/state.json"), JSON.stringify({ token: sidecarRuntime }));
  writeRole(rolesDir, "backend", "Backend catalog entry", "You are the backend engineer.");
  writeRole(rolesDir, "fat", fatDescription, "Fat role body for truncation.");
  const driver = path.join(work, "tool-driver.mjs");
  writeFileSync(driver, `import { appendFileSync } from "node:fs";
const promptLog = ${JSON.stringify(promptLog)};
export default function (pi) {
  pi.registerProvider("squad-acceptance", {
    baseUrl: "http://127.0.0.1:1",
    apiKey: "local-acceptance",
    api: "squad-acceptance-api",
    models: [{
      id: "local",
      name: "Local acceptance",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 256,
    }],
    streamSimple(model, context) {
      try {
        appendFileSync(promptLog, JSON.stringify({ systemPrompt: context?.systemPrompt ?? null }) + "\\n");
      } catch {}
      const queue = [];
      const waiters = [];
      let finished = false;
      const usage = {
        input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };
      const output = {
        role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id,
        usage, stopReason: "stop", timestamp: Date.now(),
      };
      const stream = {
        push(event) {
          if (finished) return;
          if (event.type === "done" || event.type === "error") finished = true;
          const waiter = waiters.shift();
          if (waiter) waiter({ value: event, done: false });
          else queue.push(event);
        },
        result() { return Promise.resolve(output); },
        [Symbol.asyncIterator]() {
          return { next() {
            if (queue.length) return Promise.resolve({ value: queue.shift(), done: false });
            if (finished) return Promise.resolve({ value: undefined, done: true });
            return new Promise((resolve) => waiters.push(resolve));
          } };
        },
      };
      const messages = context.messages ?? [];
      const last = messages[messages.length - 1];
      const textOf = (message) => {
        if (!message) return "";
        if (typeof message.content === "string") return message.content;
        if (Array.isArray(message.content)) {
          return message.content.filter((block) => block?.type === "text").map((block) => block.text).join("");
        }
        return "";
      };
      queueMicrotask(() => {
        try {
          const userText = last?.role === "user" ? textOf(last) : "";
          const marker = userText.indexOf("TOOL ");
          if (marker >= 0) {
            const spec = JSON.parse(userText.slice(marker + 5).trim());
            const call = {
              type: "toolCall",
              id: "call-" + Date.now().toString(36) + Math.random().toString(16).slice(2),
              name: spec.name,
              arguments: spec.arguments ?? {},
            };
            output.content.push(call);
            output.stopReason = "toolUse";
            stream.push({ type: "start", partial: output });
            stream.push({ type: "toolcall_start", contentIndex: 0, partial: output });
            stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: call, partial: output });
            stream.push({ type: "done", reason: "toolUse", message: output });
            return;
          }
          output.content.push({ type: "text", text: "stopped" });
          stream.push({ type: "start", partial: output });
          stream.push({ type: "text_start", contentIndex: 0, partial: output });
          stream.push({ type: "text_end", contentIndex: 0, content: "stopped", partial: output });
          stream.push({ type: "done", reason: "stop", message: output });
        } catch (err) {
          output.stopReason = "error";
          output.errorMessage = err instanceof Error ? err.message : String(err);
          stream.push({ type: "error", reason: "error", error: output });
        }
      });
      return stream;
    },
  });
}
`);
  return driver;
}

function startController(port, bin) {
  const log = [];
  const child = spawnGrouped(bin, [
    "-listen", `127.0.0.1:${port}`,
    "-db", db,
    "-heartbeat-timeout", heartbeatTimeout,
  ], { cwd: work, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => log.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => log.push(chunk.toString("utf8")));
  return { child, log };
}

function startPi(name, extraEnv, driver, cwd = work) {
  const lines = [];
  const stderr = [];
  const child = spawnGrouped(piBin, [
    "--mode", "rpc",
    "--provider", "squad-acceptance",
    "--model", "local",
    "--no-extensions",
    "--no-session",
    "--no-skills",
    "--no-prompt-templates",
    "--no-context-files",
    "--no-themes",
    "--offline",
    "--no-approve",
    "-e", driver,
    "-e", extension,
  ], {
    cwd,
    env: cleanEnv(extraEnv),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, "");
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      try { lines.push(JSON.parse(line)); }
      catch { lines.push({ type: "nonjson", text: line.slice(0, 400) }); }
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr.push(chunk.toString("utf8"));
    if (stderr.join("").length > 12000) stderr.splice(0, stderr.length - 6);
  });
  return {
    name,
    child,
    lines,
    stderr,
    send(obj) { child.stdin.write(`${JSON.stringify(obj)}\n`); },
  };
}

async function waitFor(label, predicate, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function listRegistry(base, query = "") {
  assertIsolated(base);
  const res = await fetch(`${base}/agents${query}`);
  if (!res.ok) throw new Error(`registry ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.agents ?? [];
}

function toolText(result) {
  const content = result?.content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block?.type === "text").map((block) => block.text ?? "").join("\n");
}

async function callTool(pi, name, args, timeoutMs = 30000) {
  const toolsBefore = pi.lines.filter((line) => line.type === "tool_execution_end").length;
  const settledBefore = pi.lines.filter((line) => line.type === "agent_settled").length;
  pi.send({ type: "prompt", message: `TOOL ${JSON.stringify({ name, arguments: args })}` });
  let ended;
  try {
    ended = await waitFor(`${pi.name} ${name} tool_execution_end`, () => {
      const ends = pi.lines.filter((line) => line.type === "tool_execution_end");
      return ends.length > toolsBefore ? ends[ends.length - 1] : undefined;
    }, timeoutMs);
  } catch (err) {
    ended = undefined;
    pi._waitError = err.message;
  }
  let settled;
  try {
    settled = await waitFor(`${pi.name} ${name} settled`, () => {
      const marks = pi.lines.filter((line) => line.type === "agent_settled");
      return marks.length > settledBefore ? marks[marks.length - 1] : undefined;
    }, timeoutMs);
  } catch {
    settled = undefined;
  }
  return {
    ended,
    settled,
    text: toolText(ended?.result),
    details: ended?.result?.details,
    isError: ended?.isError === true,
    recent: pi.lines.slice(-8).map((line) => ({ type: line.type, toolName: line.toolName, isError: line.isError })),
    stderr: pi.stderr.join("").slice(-600),
    waitError: pi._waitError,
  };
}

function startDelayProxy(targetPort) {
  const hits = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const delay = req.method === "GET" && url.pathname === "/agents/reviewer-a";
    const hit = { path: url.pathname, method: req.method, aborted: false, responded: false };
    hits.push(hit);
    const markAbort = () => { hit.aborted = true; };
    req.on("aborted", markAbort);
    req.on("close", () => { if (!res.writableEnded) markAbort(); });
    const forward = () => {
      hit.responded = true;
      const preq = http.request({
        hostname: "127.0.0.1",
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
      }, (pres) => {
        res.writeHead(pres.statusCode ?? 502, pres.headers);
        pres.pipe(res);
      });
      preq.on("error", (err) => {
        if (!res.headersSent) res.writeHead(502);
        res.end(String(err));
      });
      req.pipe(preq);
    };
    if (!delay) {
      forward();
      return;
    }
    const timer = setTimeout(forward, 8000);
    req.on("close", () => { if (!res.writableEnded) clearTimeout(timer); });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        port: address && typeof address === "object" ? address.port : 0,
        hits,
      });
    });
  });
}

function notifyMessages(pi) {
  return pi.lines
    .filter((line) => line.type === "extension_ui_request" && line.method === "notify" && typeof line.message === "string")
    .map((line) => line.message);
}

async function askWhoami(pi, timeoutMs = 10000) {
  const before = notifyMessages(pi).length;
  pi.send({ type: "prompt", message: "/squad-whoami" });
  const message = await waitFor(`${pi.name} whoami`, () => {
    const messages = notifyMessages(pi).slice(before);
    const raw = messages.find((item) => item.includes('"role_dir"') || item.includes('"error"') || item.includes('"missing"'));
    return raw;
  }, timeoutMs);
  return JSON.parse(message);
}

function observedPrompts() {
  try {
    return readFileSync(promptLog, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line).systemPrompt ?? "");
  } catch {
    return [];
  }
}

function agentOf(call) {
  return call?.details?.agent;
}

function idsOf(call) {
  const agents = call?.details?.agents;
  return Array.isArray(agents) ? agents.map((agent) => agent.agent_id) : undefined;
}

function summarize(agent) {
  if (!agent) return undefined;
  return {
    agent_id: agent.agent_id,
    role: agent.role,
    squad_id: agent.squad_id,
    status: agent.status,
    cwd: agent.cwd,
    runtime_id: agent.runtime_id,
    role_description_len: typeof agent.role_description === "string" ? agent.role_description.length : undefined,
    has_role_prompt: Object.hasOwn(agent, "role_prompt"),
  };
}

async function main() {
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  assertIsolated(base);
  const driver = writeDriver();
  const bin = path.join(work, "controller");
  await new Promise((resolve, reject) => {
    const build = spawn("go", ["build", "-o", bin, "./cmd/controller"], { cwd: controllerDir, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    build.stderr.on("data", (chunk) => { err += chunk.toString("utf8"); });
    build.on("exit", (code) => code === 0 ? resolve() : reject(new Error(err || `go build exit ${code}`)));
  });
  const controller = startController(port, bin);
  try {
    await waitFor("controller health", async () => {
      try {
        const res = await fetch(`${base}/health`);
        return res.ok;
      } catch { return false; }
    }, 20000);
  } catch (err) {
    throw new Error(`${err.message}\n${controller.log.join("").slice(-1500)}`);
  }

  const proxy = await startDelayProxy(port);
  if (forbiddenPorts.has(proxy.port)) throw new Error(`proxy bound forbidden port ${proxy.port}`);
  const placement = {
    PI_SQUAD_CONTROLLER_URL: base,
    PI_SQUAD_HEARTBEAT_INTERVAL_MS: "1000",
  };
  const specs = [
    ["reviewer-a", { ...placement, PI_SQUAD_ROLE_ID: "reviewer", PI_SQUAD_AGENT_ID: "reviewer-a", PI_SQUAD_ID: "alpha" }],
    ["reviewer-b", { ...placement, PI_SQUAD_ROLE_ID: "reviewer", PI_SQUAD_AGENT_ID: "reviewer-b", PI_SQUAD_ID: "alpha" }],
    ["backend-1", { ...placement, PI_SQUAD_ROLE_ID: "backend", PI_SQUAD_AGENT_ID: "backend-1", PI_SQUAD_ID: "alpha" }],
    ["reviewer-other", { ...placement, PI_SQUAD_ROLE_ID: "reviewer", PI_SQUAD_AGENT_ID: "reviewer-other", PI_SQUAD_ID: "beta" }],
    ["dot", { ...placement, PI_SQUAD_ROLE_ID: "reviewer", PI_SQUAD_AGENT_ID: ".", PI_SQUAD_ID: "paths" }],
    ["dotdot", { ...placement, PI_SQUAD_ROLE_ID: "reviewer", PI_SQUAD_AGENT_ID: "..", PI_SQUAD_ID: "paths" }],
    ["slash", { ...placement, PI_SQUAD_ROLE_ID: "reviewer", PI_SQUAD_AGENT_ID: slashId, PI_SQUAD_ID: "paths" }],
    ["space", { ...placement, PI_SQUAD_ROLE_ID: "reviewer", PI_SQUAD_AGENT_ID: spaceId, PI_SQUAD_ID: "paths" }],
    ["fat", { ...placement, PI_SQUAD_ROLE_ID: "fat", PI_SQUAD_AGENT_ID: "fat-desc", PI_SQUAD_ID: "trunc" }],
  ];
  const pis = Object.fromEntries(specs.map(([name, env]) => [name, startPi(name, env, driver)]));
  const reader = startPi("reader", { PI_SQUAD_CONTROLLER_URL: base }, driver);
  const cancelReader = startPi("cancel-reader", { PI_SQUAD_CONTROLLER_URL: `http://127.0.0.1:${proxy.port}` }, driver);

  let registered;
  try {
    registered = await waitFor("registered agents", async () => {
      const agents = await listRegistry(base);
      const ids = new Set(agents.filter((agent) => agent.status === "online").map((agent) => agent.agent_id));
      const expected = ["reviewer-a", "reviewer-b", "backend-1", "reviewer-other", ".", "..", slashId, spaceId, "fat-desc"];
      return expected.every((id) => ids.has(id)) ? agents : undefined;
    }, 45000);
  } catch (err) {
    const stderr = Object.values(pis).map((pi) => `${pi.name}: ${pi.stderr.join("").slice(-400)}`).join("\n");
    throw new Error(`${err.message}\n${stderr}\nregistry: ${JSON.stringify(await listRegistry(base).catch((e) => e.message))}`);
  }
  const registeredIds = registered.map((agent) => agent.agent_id).sort();

  const reviewerDir = path.join(work, ".agents/roles/reviewer");
  pis["reviewer-a"].send({ type: "prompt", message: "observe role prompt" });
  let observed = "";
  try {
    observed = await waitFor("reviewer prompt observation", () => {
      return observedPrompts().find((prompt) => prompt.includes(reviewerBody));
    }, 20000);
  } catch (err) {
    observed = "";
    record("role-dir-prompt", "FAIL", {
      expected: "injected system prompt contains the reviewer role.md body and none of the sibling notes/json/runtime tokens",
      actual: { wait: err.message, prompts: observedPrompts().map((prompt) => prompt.slice(0, 200)) },
    });
  }
  if (observed) {
    const leaked = [sidecarNotes, sidecarJson, sidecarRuntime, "another-role", "must not be loaded"].filter((token) => observed.includes(token));
    const promptOk = observed.includes(reviewerBody) && leaked.length === 0 && observed.split(reviewerBody).length === 2;
    record("role-dir-prompt", promptOk ? "PASS" : "FAIL", {
      expected: "system prompt includes reviewer role.md body once and excludes sibling notes.md, state.json, and runtime/ contents",
      actual: { leaked, bodyCount: observed.split(reviewerBody).length - 1, tail: observed.slice(-400) },
    });
  }

  try {
    const who = await askWhoami(pis["reviewer-a"]);
    const whoOk = who.ok === true
      && who.role_dir === reviewerDir
      && who.config_path === path.join(reviewerDir, "role.md")
      && who.role_id === "reviewer";
    record("role-dir-whoami", whoOk ? "PASS" : "FAIL", {
      expected: `whoami.role_dir is ${reviewerDir} and config_path is its role.md`,
      actual: { role_dir: who.role_dir, config_path: who.config_path, role_id: who.role_id, ok: who.ok },
    });
  } catch (err) {
    record("role-dir-whoami", "FAIL", { expected: "whoami returns role_dir", actual: { wait: err.message, notifies: notifyMessages(pis["reviewer-a"]).slice(-3) } });
  }

  const legacyWork = realpathSync(mkdtempSync(path.join(tmpdir(), "pi-squad-flat-role-")));
  mkdirSync(path.join(legacyWork, ".agents/roles"), { recursive: true });
  writeFileSync(path.join(legacyWork, ".agents/roles/reviewer.md"), `---
name: reviewer
description: old flat file
---
Old flat body.
`);
  const legacy = startPi("legacy-flat", {
    ...placement,
    PI_SQUAD_ROLE_ID: "reviewer",
    PI_SQUAD_AGENT_ID: "legacy-flat",
    PI_SQUAD_ID: "alpha",
  }, driver, legacyWork);
  try {
    const legacyNotice = await waitFor("flat layout error", () => {
      return notifyMessages(legacy).find((message) => message.includes("flat role files"));
    }, 20000);
    const afterLegacy = await listRegistry(base);
    const registeredLegacy = afterLegacy.some((agent) => agent.agent_id === "legacy-flat");
    const legacyOk = legacyNotice.includes("reviewer/role.md") && !registeredLegacy;
    record("flat-layout-rejected", legacyOk ? "PASS" : "FAIL", {
      expected: "flat .agents/roles/reviewer.md notifies a migration error naming reviewer/role.md and does not register",
      actual: { notice: legacyNotice.slice(0, 400), registeredLegacy },
    });
  } catch (err) {
    record("flat-layout-rejected", "FAIL", {
      expected: "flat role file notifies a migration error and does not register",
      actual: { wait: err.message, notifies: notifyMessages(legacy).slice(-4), stderr: legacy.stderr.join("").slice(-400) },
    });
  }

  const reviewerList = await callTool(pis["reviewer-a"], "list_agents", { role: "backend", squad_id: "alpha", status: "online" });
  const backendList = await callTool(pis["backend-1"], "list_agents", { role: "reviewer", squad_id: "alpha", status: "online" });
  const mutualIds = {
    reviewerSees: idsOf(reviewerList),
    backendSees: idsOf(backendList),
  };
  const mutualOk = mutualIds.reviewerSees?.length === 1 && mutualIds.reviewerSees[0] === "backend-1"
    && mutualIds.backendSees?.includes("reviewer-a") && mutualIds.backendSees?.includes("reviewer-b")
    && !mutualIds.backendSees?.includes("reviewer-other");
  record("mutual-discovery", mutualOk ? "PASS" : "FAIL", {
    expected: "reviewer-a lists backend-1; backend-1 lists both alpha reviewers and not beta",
    actual: mutualIds,
    text: { reviewer: reviewerList.text?.slice(0, 300), backend: backendList.text?.slice(0, 300) },
    stderr: !mutualOk ? reviewerList.stderr || backendList.stderr : undefined,
  });

  const sameRole = await callTool(reader, "list_agents", { role: "reviewer", squad_id: "alpha", status: "online" });
  const exactA = await callTool(reader, "get_agent", { agent_id: "reviewer-a" });
  const roleAsId = await callTool(reader, "get_agent", { agent_id: "reviewer" });
  const sameIds = idsOf(sameRole);
  const sameOk = sameIds?.includes("reviewer-a") && sameIds?.includes("reviewer-b") && sameIds?.length === 2
    && exactA.details?.agent?.agent_id === "reviewer-a"
    && exactA.details?.agent?.agent_id !== "reviewer-b"
    && !exactA.details?.agents
    && roleAsId.isError && /not found/i.test(`${roleAsId.text}\n${roleAsId.error ?? ""}`);
  record("same-role-no-misselect", sameOk ? "PASS" : "FAIL", {
    expected: "role filter returns both instances; get_agent(reviewer-a) returns only that record; get_agent(reviewer) errors",
    actual: { sameIds, exact: summarize(agentOf(exactA)), roleAsIdError: roleAsId.isError, roleAsIdText: roleAsId.text?.slice(0, 300) },
  });

  const exact = agentOf(exactA);
  const exactOk = exact?.agent_id === "reviewer-a" && exactA.text.includes('"agent"') && !exactA.text.includes('"agents"');
  record("exact-id", exactOk ? "PASS" : "FAIL", {
    expected: "get_agent text and details are a single { agent } for reviewer-a",
    actual: { summary: summarize(exact), textHead: exactA.text?.slice(0, 180), isError: exactA.isError },
  });

  const metaOk = exact?.cwd === work
    && uuidV4.test(exact?.runtime_id ?? "")
    && exact?.role_description === "Reviewer catalog entry"
    && exact?.role === "reviewer"
    && exact?.squad_id === "alpha"
    && !Object.hasOwn(exact ?? {}, "role_prompt");
  record("metadata", metaOk ? "PASS" : "FAIL", {
    expected: "cwd is the temp workdir, runtime_id is UUID v4, role_description is the frontmatter description, role_prompt is absent",
    actual: summarize(exact),
  });

  const specials = {};
  let specialOk = true;
  for (const id of [".", "..", slashId, spaceId]) {
    const call = await callTool(reader, "get_agent", { agent_id: id });
    specials[id] = { isError: call.isError, agent_id: call.details?.agent?.agent_id, textHead: call.text?.slice(0, 160) };
    if (call.isError || call.details?.agent?.agent_id !== id) specialOk = false;
  }
  record("special-ids", specialOk ? "PASS" : "FAIL", {
    expected: "get_agent returns the exact record for '.', '..', slash, and space ids",
    actual: specials,
  });

  const unknown = await callTool(reader, "get_agent", { agent_id: "missing-agent" });
  const unknownOk = unknown.isError && /Agent not found: missing-agent/.test(unknown.text);
  record("unknown-id", unknownOk ? "PASS" : "FAIL", {
    expected: "error text contains Agent not found: missing-agent",
    actual: { isError: unknown.isError, text: unknown.text?.slice(0, 400), recent: unknown.recent },
  });

  const blank = await callTool(reader, "get_agent", { agent_id: "" });
  const spaces = await callTool(reader, "get_agent", { agent_id: "   " });
  const blankRejected = (call) => call.isError || /empty|minLength|required|invalid/i.test(`${call.text}\n${JSON.stringify(call.recent)}`);
  const blankOk = blankRejected(blank) && blankRejected(spaces) && !agentOf(blank) && !agentOf(spaces);
  record("blank-id", blankOk ? "PASS" : "FAIL", {
    expected: "empty and whitespace agent_id are rejected and do not return an agent",
    actual: {
      empty: { isError: blank.isError, text: blank.text?.slice(0, 300), recent: blank.recent, waitError: blank.waitError },
      spaces: { isError: spaces.isError, text: spaces.text?.slice(0, 300), recent: spaces.recent },
    },
  });

  const beforeReaderTools = registeredIds;
  const readerList = await callTool(reader, "list_agents", { squad_id: "alpha", status: "online" });
  const readerGet = await callTool(reader, "get_agent", { agent_id: "backend-1" });
  const after = await listRegistry(base);
  const afterIds = after.map((agent) => agent.agent_id).sort();
  const readerIds = idsOf(readerList);
  const noRoleOk = readerIds?.includes("reviewer-a") && readerIds?.includes("backend-1")
    && readerGet.details?.agent?.agent_id === "backend-1"
    && afterIds.length === beforeReaderTools.length
    && afterIds.every((id, i) => id === beforeReaderTools[i]);
  record("no-role-custom-url", noRoleOk ? "PASS" : "FAIL", {
    expected: "reader with only PI_SQUAD_CONTROLLER_URL can list and get, and does not add a registry row",
    actual: { readerIds, get: summarize(agentOf(readerGet)), before: beforeReaderTools, after: afterIds },
  });

  const fat = await callTool(reader, "get_agent", { agent_id: "fat-desc" });
  const fatAgent = agentOf(fat);
  const truncOk = fat.text.includes("[Output truncated")
    && !fat.text.includes(fatDescription)
    && fatAgent?.role_description === fatDescription
    && fatAgent?.agent_id === "fat-desc";
  record("truncation", truncOk ? "PASS" : "FAIL", {
    expected: "tool text is truncated with the narrowing hint; details.agent.role_description remains the full 52000-character description",
    actual: {
      textHasNotice: fat.text.includes("[Output truncated"),
      textHasFullDescription: fat.text.includes(fatDescription),
      textBytes: Buffer.byteLength(fat.text, "utf8"),
      detailsLen: fatAgent?.role_description?.length,
      isError: fat.isError,
    },
  });

  killChild(pis["reviewer-b"].child);
  await sleep(4500);
  const offlineGet = await callTool(reader, "get_agent", { agent_id: "reviewer-b" });
  const onlineList = await callTool(reader, "list_agents", { role: "reviewer", squad_id: "alpha", status: "online" });
  const offlineList = await callTool(reader, "list_agents", { agent_id: "reviewer-b", status: "offline" });
  const offlineAgent = agentOf(offlineGet);
  const offlineOk = offlineAgent?.agent_id === "reviewer-b"
    && offlineAgent?.status === "offline"
    && !idsOf(onlineList)?.includes("reviewer-b")
    && idsOf(offlineList)?.includes("reviewer-b");
  record("offline-still-queryable", offlineOk ? "PASS" : "FAIL", {
    expected: "after heartbeat timeout, get_agent returns reviewer-b offline; online filter excludes it; offline filter includes it",
    actual: {
      get: summarize(offlineAgent),
      online: idsOf(onlineList),
      offline: idsOf(offlineList),
    },
  });

  const startsBefore = cancelReader.lines.filter((line) => line.type === "tool_execution_start").length;
  cancelReader.send({ type: "prompt", message: `TOOL ${JSON.stringify({ name: "get_agent", arguments: { agent_id: "reviewer-a" } })}` });
  let cancelStart;
  try {
    cancelStart = await waitFor("cancel tool start", () => {
      const starts = cancelReader.lines.filter((line) => line.type === "tool_execution_start");
      return starts.length > startsBefore ? starts[starts.length - 1] : undefined;
    }, 20000);
  } catch (err) {
    cancelStart = undefined;
    record("cancel-signal", "FAIL", {
      expected: "get_agent starts, RPC abort cancels the in-flight controller request, and the tool does not return the agent",
      actual: { wait: err.message, stderr: cancelReader.stderr.join("").slice(-500), recent: cancelReader.lines.slice(-6) },
    });
  }
  if (cancelStart) {
    cancelReader.send({ type: "abort" });
    await sleep(1500);
    const hit = proxy.hits.find((item) => item.path === "/agents/reviewer-a");
    const cancelEnd = cancelReader.lines.filter((line) => line.type === "tool_execution_end").at(-1);
    const returnedAgent = cancelEnd?.isError !== true && cancelEnd?.result?.details?.agent?.agent_id === "reviewer-a";
    const cancelOk = Boolean(hit?.aborted) && hit?.responded !== true && !returnedAgent;
    record("cancel-signal", cancelOk ? "PASS" : "FAIL", {
      expected: "abort closes the delayed GET /agents/reviewer-a before the proxy responds, and the tool does not return that agent",
      actual: {
        hit,
        toolStarted: cancelStart.toolName,
        isError: cancelEnd?.isError,
        returnedAgent,
        text: toolText(cancelEnd?.result).slice(0, 240),
      },
    });
  }

  const nlReason = "No isolated local model was available. A remote model call was not attempted, so natural-language tool selection is not evidenced.";
  record("natural-language-model", "NOT_RUN", { expected: "a model selects list_agents/get_agent from a natural-language prompt", actual: nlReason });

  const failed = cases.filter((item) => item.status === "FAIL").map((item) => item.id);
  const summary = {
    pass: failed.length === 0,
    not_p0_exit_gate: true,
    controller: base,
    proxy: `http://127.0.0.1:${proxy.port}`,
    work,
    db,
    contacted_18741: false,
    cases,
  };
  writeFileSync(path.join(outDir, "evidence.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ pass: summary.pass, failed, controller: base, evidence: path.join(outDir, "evidence.json") }));
  proxy.server.close();
  killChild(controller.child);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  writeFileSync(path.join(outDir, "evidence.json"), JSON.stringify({ pass: false, harness_error: String(err), cases }, null, 2));
  process.exit(1);
});
