import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { discoverRoles, loadSquadSetup, parseRoleFile } from "./config.ts";
import { getProcessSetup } from "./runtime.ts";
import { buildRegisterPayload } from "./registration.ts";

const role = (name = "reviewer", body = "# Work\nReview carefully.") => `---\nname: ${name}\ndescription: >-\n  Reviews changes\n  with evidence.\n---\n${body}\n`;
function fixture(t: { after: (fn: () => void) => void }) {
  const cwd = mkdtempSync(path.join(tmpdir(), "squad-role-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const dir = path.join(cwd, ".agents/roles");
  mkdirSync(dir, { recursive: true });
  mkdirSync(path.join(dir, "reviewer"));
  writeFileSync(path.join(dir, "reviewer/role.md"), role());
  return { cwd, dir };
}
const env = { PI_SQUAD_ROLE_ID: "reviewer", PI_SQUAD_AGENT_ID: "reviewer-1", PI_SQUAD_ID: "alpha" };

test("frontmatter/body separation preserves Markdown and real YAML syntax", () => {
  const parsed = parseRoleFile("\uFEFF" + role().replaceAll("\n", "\r\n"), "reviewer.md");
  assert.equal(parsed.description, "Reviews changes with evidence.");
  assert.equal(parsed.body, "# Work\nReview carefully.");
  assert.equal(parsed.name, "reviewer");
});

test("rejects malformed, unsupported and empty role definitions", () => {
  for (const raw of [
    "no header", "---\nname: x", "---\n- x\n---\nbody",
    role().replace("description:", "name: duplicate\ndescription:"),
    role().replace("name: reviewer", "name: 123"),
    role().replace("name: reviewer", "name: ../reviewer"),
    role().replace("description:", "tools: read\ndescription:"),
    "---\nname: x\ndescription: ''\n---\nbody",
    role("reviewer", " "), role("reviewer", "a".repeat(65536)),
  ]) assert.throws(() => parseRoleFile(raw, "role.md"));
});

test("startup selects exactly one role, maps description and keeps instance env separate", t => {
  const { cwd, dir } = fixture(t);
  mkdirSync(path.join(dir, "backend"));
  writeFileSync(path.join(dir, "backend/role.md"), role("backend", "Build only."));
  const setup = loadSquadSetup({ ...env, PI_SQUAD_ROLE: "ignored", HERDR_PANE_ID: "w7:p2" }, cwd);
  assert.equal(setup.ok, true);
  if (!setup.ok) return;
  assert.equal(setup.source, "role");
  assert.equal(setup.identity.role, "reviewer");
  assert.equal(setup.identity.agentId, "reviewer-1");
  assert.equal(setup.identity.paneId, "w7:p2");
  assert.equal(setup.configPath, path.join(dir, "reviewer/role.md"));
  const payload = buildRegisterPayload({ ...setup.identity, cwd, runtimeId: "uuid", roleDescription: setup.roleDescription }, "session");
  assert.equal(payload.cwd, cwd);
  assert.equal(payload.runtime_id, "uuid");
  assert.equal(payload.role_description, setup.roleDescription);
  assert.equal(payload.runtime_session_id, "session");
  assert.ok(!("role_prompt" in payload));
});

test("no selector disables quietly; old JSON and missing identity produce actionable failures", t => {
  const { cwd } = fixture(t);
  assert.deepEqual(loadSquadSetup({}, cwd), { ok: false, disabled: true });
  assert.match((loadSquadSetup({ PI_SQUAD_CONFIG: "old.json" }, cwd) as { error: string }).error, /no longer supported/);
  assert.deepEqual(loadSquadSetup({ PI_SQUAD_ROLE_ID: "reviewer" }, cwd), { ok: false, missing: ["PI_SQUAD_AGENT_ID", "PI_SQUAD_ID"] });
  assert.match((loadSquadSetup({ ...env, PI_SQUAD_ROLE_ID: "unknown" }, cwd) as { error: string }).error, /unknown role/);
});

test("only the cwd roles directory is scanned; duplicates and mismatched directory names fail", t => {
  const { cwd, dir } = fixture(t);
  const child = path.join(cwd, "child"); mkdirSync(child);
  assert.equal(loadSquadSetup(env, child).ok, false);
  mkdirSync(path.join(cwd, ".agents/skills"));
  writeFileSync(path.join(cwd, ".agents/skills/README.md"), "not a role");
  assert.equal(discoverRoles(dir).size, 1);
  mkdirSync(path.join(dir, "duplicate"));
  writeFileSync(path.join(dir, "duplicate/role.md"), role());
  assert.throws(() => discoverRoles(dir), /duplicate role/);
  writeFileSync(path.join(dir, "duplicate/role.md"), role("different"));
  assert.throws(() => discoverRoles(dir), /directory must match/);
});

test("runtime UUID is stable across module reloads, changes across processes, and caches startup config", async () => {
  const before = getProcessSetup();
  const reloaded = await import(`./runtime.ts?reload=${Date.now()}`);
  assert.strictEqual(reloaded.getProcessSetup(), before);
  assert.match(before.runtimeId, /^[0-9a-f-]{14}4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const code = `import { getProcessSetup } from ${JSON.stringify(new URL("./runtime.ts", import.meta.url).href)}; console.log(getProcessSetup().runtimeId);`;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.notEqual(child.stdout.trim(), before.runtimeId);
  assert.equal(before.cwd, process.cwd());
});


test("role directory companion files are ignored; missing entry and flat layout fail", t => {
  const { cwd, dir } = fixture(t);
  const roleDir = path.join(dir, "reviewer");
  writeFileSync(path.join(roleDir, "notes.md"), "---\nname: another-role\n---\nnot a role entry");
  mkdirSync(path.join(roleDir, "runtime"));
  writeFileSync(path.join(roleDir, "runtime/role.md"), "invalid frontmatter");
  const setup = loadSquadSetup(env, cwd);
  assert.ok(setup.ok);
  if (setup.ok) {
    assert.equal(setup.roleDir, roleDir);
    assert.equal(setup.rolePrompt, "# Work\nReview carefully.");
  }
  writeFileSync(path.join(dir, "legacy.md"), role("legacy"));
  assert.throws(() => discoverRoles(dir), /flat role files.*legacy\/role.md/);
  rmSync(path.join(dir, "legacy.md"));
  rmSync(path.join(roleDir, "role.md"));
  assert.throws(() => discoverRoles(dir), /role.md/);
});
