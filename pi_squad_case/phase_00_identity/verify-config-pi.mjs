#!/usr/bin/env node
/**
 * Prove a running Pi loads role config + registration from PI_SQUAD_CONFIG.
 *
 * Starts a throwaway controller and three `pi --mode rpc` processes:
 *   - reviewer config
 *   - backend config
 *   - no PI_SQUAD_CONFIG (must not register)
 *
 * Registration is checked on the controller. Role injection is checked by
 * submitting a prompt (so before_agent_start runs) and reading /squad-whoami.
 * The model reply is not required.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const extension = path.join(root, "pi_squad/extension/index.ts");
const controllerDir = path.join(root, "pi_squad/controller");
const work = mkdtempSync(path.join(tmpdir(), "pi-squad-config-"));
const db = path.join(work, "pi_squad.sqlite");
const piBin = process.env.PI_BIN || "pi";

const reviewerToken = "ROLE_TOKEN_REVIEWER_9f3a";
const backendToken = "ROLE_TOKEN_BACKEND_9f3a";
const squadId = `cfg-${process.pid}`;

const reviewerConfig = path.join(work, "reviewer.json");
const backendConfig = path.join(work, "backend.json");
writeFileSync(reviewerConfig, JSON.stringify({
  agent_id: "cfg-reviewer",
  role: "reviewer",
  squad_id: squadId,
  space_id: "space-from-reviewer-file",
  role_prompt: `You are the reviewer. Role token: ${reviewerToken}. Do not edit files.`,
}, null, 2));
writeFileSync(backendConfig, JSON.stringify({
  agent_id: "cfg-backend",
  role: "backend",
  squad_id: squadId,
  space_id: "space-from-backend-file",
  role_prompt: `You are the backend engineer. Role token: ${backendToken}.`,
}, null, 2));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const children = [];

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

function startController(port) {
  const log = [];
  const child = spawnGrouped("go", [
    "run", "./cmd/controller",
    "-listen", `127.0.0.1:${port}`,
    "-db", db,
    "-heartbeat-timeout", "30s",
  ], {
    cwd: controllerDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => log.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => log.push(chunk.toString("utf8")));
  return { child, log };
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

function startPi(name, extraEnv) {
  const lines = [];
  const stderr = [];
  const child = spawnGrouped(piBin, [
    "--mode", "rpc",
    "--no-extensions",
    "--no-session",
    "--no-skills",
    "--no-prompt-templates",
    "--no-context-files",
    "--no-themes",
    "--offline",
    "--no-approve",
    "-e", extension,
  ], {
    cwd: root,
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
      try {
        lines.push(JSON.parse(line));
      } catch {
        lines.push({ type: "nonjson", text: line.slice(0, 300) });
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr.push(chunk.toString("utf8"));
    if (stderr.join("").length > 8000) stderr.splice(0, stderr.length - 4);
  });
  return {
    name,
    child,
    lines,
    stderr,
    send(obj) {
      child.stdin.write(`${JSON.stringify(obj)}\n`);
    },
  };
}

async function waitFor(label, predicate, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}`);
}

function whoamiMessages(pi) {
  return pi.lines
    .filter((line) => line.type === "extension_ui_request" && line.method === "notify" && typeof line.message === "string")
    .map((line) => {
      try { return JSON.parse(line.message); } catch { return undefined; }
    })
    .filter((body) => body && (body.agent_id || body.missing || body.error));
}

async function askWhoami(pi, timeoutMs = 10000) {
  const before = whoamiMessages(pi).length;
  pi.send({ type: "prompt", message: "/squad-whoami" });
  return waitFor(`${pi.name} whoami`, () => {
    const messages = whoamiMessages(pi);
    return messages.length > before ? messages[messages.length - 1] : undefined;
  }, timeoutMs);
}

async function main() {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const controller = startController(port);
  try {
    await waitFor("controller health", async () => {
      try {
        const res = await fetch(`${base}/health`);
        return res.ok;
      } catch {
        return false;
      }
    }, 60000);
  } catch (err) {
    killChild(controller.child);
    throw new Error(`${err.message}\ncontroller log:\n${controller.log.join("").slice(-2000)}`);
  }

  const placement = { PI_SQUAD_CONTROLLER_URL: base };
  const reviewer = startPi("reviewer", { ...placement, PI_SQUAD_CONFIG: reviewerConfig });
  const backend = startPi("backend", { ...placement, PI_SQUAD_CONFIG: backendConfig });
  const bare = startPi("bare", { ...placement });

  const failures = [];
  const evidence = {};
  try {
    let listed;
    try {
      listed = await waitFor("both agents online", async () => {
        const res = await fetch(`${base}/agents?squad_id=${encodeURIComponent(squadId)}`);
        if (!res.ok) return undefined;
        const body = await res.json();
        const agents = body.agents ?? [];
        const online = new Set(agents.filter((agent) => agent.status === "online").map((agent) => agent.agent_id));
        return online.has("cfg-reviewer") && online.has("cfg-backend") ? agents : undefined;
      }, 45000);
    } catch (err) {
      throw new Error([
        err.message,
        `reviewer stderr: ${reviewer.stderr.join("").slice(-800)}`,
        `backend stderr: ${backend.stderr.join("").slice(-800)}`,
        `bare stderr: ${bare.stderr.join("").slice(-800)}`,
        `reviewer stdout: ${JSON.stringify(reviewer.lines.slice(-6))}`,
        `backend stdout: ${JSON.stringify(backend.lines.slice(-6))}`,
      ].join("\n"));
    }
    evidence.registry = listed.map((agent) => ({
      agent_id: agent.agent_id,
      role: agent.role,
      squad_id: agent.squad_id,
      space_id: agent.space_id,
      status: agent.status,
      has_role_prompt: Object.hasOwn(agent, "role_prompt"),
    }));

    for (const agent of listed) {
      if (agent.agent_id === "cfg-reviewer") {
        if (agent.role !== "reviewer" || agent.space_id !== "space-from-reviewer-file") {
          failures.push(`reviewer registry mismatch: ${JSON.stringify(agent)}`);
        }
      }
      if (agent.agent_id === "cfg-backend") {
        if (agent.role !== "backend" || agent.space_id !== "space-from-backend-file") {
          failures.push(`backend registry mismatch: ${JSON.stringify(agent)}`);
        }
      }
      if (Object.hasOwn(agent, "role_prompt")) {
        failures.push(`role_prompt leaked into registry for ${agent.agent_id}`);
      }
    }

    const reviewerWho = await askWhoami(reviewer);
    const backendWho = await askWhoami(backend);
    const bareWho = await askWhoami(bare);
    evidence.whoami_before_turn = { reviewer: reviewerWho, backend: backendWho, bare: bareWho };

    if (reviewerWho.role_prompt?.includes(reviewerToken) !== true) {
      failures.push("reviewer process did not load reviewer role prompt");
    }
    if (backendWho.role_prompt?.includes(backendToken) !== true) {
      failures.push("backend process did not load backend role prompt");
    }
    if (reviewerWho.config_path !== reviewerConfig || backendWho.config_path !== backendConfig) {
      failures.push(`config path mismatch: ${reviewerWho.config_path} / ${backendWho.config_path}`);
    }
    if (reviewerWho.registered !== true || backendWho.registered !== true) {
      failures.push(`whoami did not see registration: reviewer=${reviewerWho.registered} backend=${backendWho.registered}`);
    }
    if (reviewerWho.source !== "config" || backendWho.source !== "config") {
      failures.push(`expected config source, got ${reviewerWho.source} / ${backendWho.source}`);
    }
    if (reviewerWho.role_prompt === backendWho.role_prompt) {
      failures.push("two PI_SQUAD_CONFIG values loaded the same role prompt");
    }
    if (bareWho.ok !== false || !bareWho.missing?.includes("PI_SQUAD_AGENT_ID")) {
      failures.push(`bare Pi registered or hid the missing env: ${JSON.stringify(bareWho)}`);
    }

    const afterBare = await fetch(`${base}/agents?squad_id=${encodeURIComponent(squadId)}`).then((res) => res.json());
    if ((afterBare.agents ?? []).length !== 2) {
      failures.push(`bare Pi changed the registry: ${JSON.stringify(afterBare.agents)}`);
    }

    for (const pi of [reviewer, backend]) {
      pi.send({ type: "prompt", message: "Reply with the single word pong." });
    }
    const injected = {};
    for (const [pi, token] of [[reviewer, reviewerToken], [backend, backendToken]]) {
      try {
        injected[pi.name] = await waitFor(`${pi.name} role injection`, async () => {
          let body;
          try {
            body = await askWhoami(pi, 5000);
          } catch {
            return undefined;
          }
          return body.role_prompt_in_system_prompt === true && body.role_prompt?.includes(token)
            ? body
            : undefined;
        }, 40000);
      } catch (err) {
        failures.push(`${err.message}; stderr=${pi.stderr.join("").slice(-500)}`);
        injected[pi.name] = whoamiMessages(pi).at(-1);
      }
    }
    evidence.whoami_after_turn = injected;

    const summary = {
      pass: failures.length === 0,
      work,
      controller: base,
      failures,
      evidence,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    for (const pi of [reviewer, backend, bare]) {
      try { pi.send({ type: "abort" }); } catch { /* stdin may already be closed */ }
      killChild(pi.child);
    }
    killChild(controller.child);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  cleanup();
  process.exit(1);
});
