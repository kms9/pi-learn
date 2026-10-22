// Generated from dsh_squad/client/src by `npm run build` there. Do not edit by hand.
window.__ModuleLoader__.load({
  id: 'dsh-squad-adapter',
  factory: (require) => {
const module = { exports: {} }
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/shell.js
var import_react9 = require("react");
var import_react_dom = require("react-dom");

// src/model.js
var TERMINAL = /* @__PURE__ */ new Set(["completed", "failed", "cancelled", "interrupted"]);
var terminal = (state) => TERMINAL.has(state);
var RUN_PHASE = {
  queued_run: "排队中",
  planning: "规划中",
  running: "进行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "已中断"
};
var KIND = { execute: "执行", review: "审核", rework: "返工", ask: "提问", leader_step: "Leader" };
var runsOf = (snapshot) => [...snapshot?.views?.runs ?? []].sort((a, b) => b.queue_seq - a.queue_seq);
var tasksOf = (snapshot, runId) => (snapshot?.views?.tasks ?? []).filter((task) => task.run_id === runId);
function artifactsOf(tasks) {
  const out = [];
  for (const task of tasks) {
    for (const artifact of task.result?.artifacts ?? []) {
      out.push({ ...artifact, taskId: task.task_id, kind: task.kind, accepted: task.acceptance?.decision === "accepted", superseded: Boolean(task.superseded_by), resultRevision: task.result.revision });
    }
  }
  return out.reverse();
}
function goalOf(task, tasks = []) {
  if (task.kind !== "review") return task.goal;
  const target = tasks.find((candidate) => candidate.task_id === task.dependencies?.[0]?.task_id);
  return target ? `审核「${target.role_id}」的结果：${target.goal}` : "独立审核";
}
var waitingOf = (run) => (run?.waiting_roles ?? []).map((wait) => `等待角色 ${wait.role_id}（被小队 ${wait.owner_team_id} 的 Run 占用）`);
var short = (id) => String(id ?? "").replace(/^(task|run|attempt)-/, "").slice(0, 8);

// src/runs.js
var import_react6 = require("react");

// src/api.js
var ROUTE = "api/squad-adapter";
async function call(endpoint, payload = {}) {
  let response;
  try {
    response = await fetch(ROUTE, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: `ui/${endpoint}`, payload }) });
  } catch (error) {
    throw Object.assign(new Error("连不上 DS Bot 宿主，请确认它还在运行。"), { code: "NETWORK", cause: error });
  }
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { code: `HTTP_${response.status}` });
  const result = await response.json();
  if (!result.ok) throw Object.assign(new Error(result.error?.message ?? "请求失败"), { code: "SQUAD" });
  return result.value;
}
var requestId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// src/projection.js
var EMPTY = { epoch: null, revision: -1, snapshot: null, stale: true, error: null };
function acceptSnapshot(current, snapshot) {
  if (snapshot === void 0 || snapshot === null) return current;
  const epoch = snapshot.controller_epoch;
  const revision = Number(snapshot.revision ?? 0);
  if (current.epoch === epoch && revision < current.revision) return current;
  return { epoch, revision, snapshot, stale: false, error: null };
}
function readEvents(current, page) {
  if (page === void 0 || page === null) return { resnapshot: true, cursor: current.revision };
  if (current.epoch !== null && page.controller_epoch !== current.epoch) return { resnapshot: true, cursor: 0 };
  const events = page.events ?? [];
  if (events.length === 0) return { resnapshot: false, cursor: current.revision };
  const first = events[0].seq;
  const last = events.at(-1).seq;
  const gap = first > current.revision + 1;
  return { resnapshot: last > current.revision || gap, cursor: Math.max(current.revision, last) };
}
var lost = (current, error) => ({ ...current, stale: true, error: String(error?.message ?? error) });

// src/store.js
var import_react = require("react");
function createStore(initial) {
  let value = initial;
  const listeners = /* @__PURE__ */ new Set();
  return {
    get: () => value,
    set: (next) => {
      const updated = typeof next === "function" ? next(value) : next;
      if (updated === value) return;
      value = updated;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
var store = createStore({
  open: false,
  tab: "runs",
  runId: null,
  projection: EMPTY,
  teams: {},
  approvals: [],
  previewBase: null,
  connected: null,
  toast: null,
  preview: null,
  errors: [],
  teamScope: null,
  focus: null,
  bots: {},
  startOpen: false,
  configFocus: null
});
function useStore(select) {
  return (0, import_react.useSyncExternalStore)(store.subscribe, () => select(store.get()));
}
var toast = (text, kind = "error") => store.set((state) => ({ ...state, toast: { text, kind, at: Date.now() } }));

// src/feed.js
var timer = null;
var running = false;
var PRESENCE_MS = 15e3;
var refreshedAt = 0;
async function refresh() {
  refreshedAt = Date.now();
  const view = await call("view");
  const before = store.get();
  if (view.connected !== false && (before.projection.stale && before.projection.snapshot !== null || before.connected === false)) toast("已重新连上，状态已更新", "ok");
  store.set((state) => view.connected === false ? { ...state, connected: false } : { ...state, connected: true, projection: acceptSnapshot(state.projection, view.snapshot), teams: view.teams ?? {}, approvals: view.approvals ?? [], previewBase: view.previewBase, errors: view.errors ?? [], bots: view.bots ?? state.bots });
}
async function step() {
  const { projection } = store.get();
  try {
    if (projection.stale || projection.snapshot === null || Date.now() - refreshedAt > PRESENCE_MS) return await refresh();
    const page = await call("events", { after: projection.revision });
    if (page?.connected === false) return store.set((state) => ({ ...state, connected: false }));
    if (readEvents(projection, page).resnapshot) await refresh();
  } catch (error) {
    store.set((state) => ({ ...state, projection: lost(state.projection, error) }));
  }
}
var refreshNow = () => step().catch(() => {
}).then(() => refresh().catch(() => {
}));
function startFeed() {
  if (running) return () => {
  };
  running = true;
  const loop = async () => {
    await step();
    timer = setTimeout(loop, store.get().open ? 1200 : 4e3);
  };
  void loop();
  return () => {
    running = false;
    clearTimeout(timer);
  };
}

// src/status.js
var UNCERTAIN = /* @__PURE__ */ new Set(["host_restart", "outcome_unknown", "controller_restart", "lease_expired", "session_changed", "extension_reload", "manual_interference", "manual_compaction"]);
function reasonOf(code, detail = {}) {
  const name = detail.taskName ? `「${detail.taskName}」` : "它依赖的任务";
  switch (code) {
    case "RESULT_MISSING":
      return "这一步结束时没有提交结果。";
    case "host_restart":
      return "DS Bot 中途重启，不确定这一步做完没有。";
    case "outcome_unknown":
      return "没能确认这一步是否真正结束。";
    case "controller_restart":
      return "Squad 服务中途重启，这一步被暂停了。";
    case "lease_expired":
      return "这一步很久没有回应（可能卡住或电脑休眠过）。";
    case "host_reconciled":
      return "这一步很久没有回应，宿主恢复后确认它已经停下了；点「重试」再做一次。";
    case "session_changed":
      return "这个成员换了新的对话段，原来的工作停在一半。";
    case "acceptance_failed":
    case "acceptance_rejected":
      return `结果没有通过验收${detail.reason ? `：${detail.reason}` : "。"}`;
    case "attempt_budget":
      return `已经重试了 ${detail.attempts ?? "多"} 次仍没完成。`;
    case "GATE_NOT_READY":
    case "ACCEPTANCE_PENDING":
    case "EXECUTION_UNCONFIRMED":
    case "DEPENDENCY_PENDING":
      return `最后检查没通过：${detail.taskName ? `「${detail.taskName}」还没完成或没通过审核。` : "还有任务没完成或没通过审核。"}`;
    case "NO_RESULTS":
      return "没有任何完成的成果可以交付。";
    case "model_mismatch":
      return "这个成员的模型变了，为保证一致没有继续。";
    case "dependency_interrupted":
      return `${name}没有完成。`;
    case "manual_interference":
    case "manual_compaction":
    case "extension_reload":
      return "这一步被手动打断了。";
    case "human_attestation":
      return "已确认停止。";
    case "self_review":
      return "审核人和作者是同一个角色，没法独立审核。";
    case "review_budget":
    case "TASK_BUDGET_EXHAUSTED":
      return "任务数量超过了小队的上限。";
    case "write_authorization_invalid":
      return "这一步要写的文件不在允许的范围内。";
    case "context_unavailable":
      return "读不到这个角色的工作规则。";
    case "result_ref_invalid":
      return "它要用的上游结果已经变了。";
    case "binding_changed":
      return "负责这一步的成员换了。";
    case "primary_offline":
    case "agent_offline":
      return "负责这一步的成员不在线。";
    default:
      return `出了点问题（${code ?? "未知"}）。`;
  }
}
function staleOf(task, tasks = []) {
  if (task.stale_kept || task.superseded_by || task.state === "cancelled" || task.kind === "review" || task.kind === "leader_step") return [];
  if (task.acceptance?.decision === "rejected") return [];
  const ids = /* @__PURE__ */ new Set([...(task.dependencies ?? []).map((dep) => dep.task_id), ...(task.refs ?? []).map((ref) => ref.task_id)]);
  return tasks.filter((candidate) => ids.has(candidate.task_id) && candidate.superseded_by);
}
var latestAttempt = (task, attempts) => {
  const id = task.attempt_ids?.at(-1);
  return id === void 0 ? void 0 : attempts.find((attempt) => attempt.attempt_id === id);
};
var blockerKinds = (task) => new Set((task.blockers ?? []).map((blocker) => blocker.kind));
function statusOf(task, { attempts = [], approvals = [], tasks = [] } = {}) {
  const attempt = latestAttempt(task, attempts);
  const kinds = blockerKinds(task);
  const nameOf = (id) => tasks.find((candidate) => candidate.task_id === id)?.goal;
  if (task.superseded_by) return { status: "stopped", note: "已被返工替代" };
  if (task.state === "cancelled") return { status: "stopped", note: task.ignored ? "已忽略" : "已取消" };
  if (task.state === "completed" && staleOf(task, tasks).length > 0) return { status: "attention", note: "基于旧版本", stale: staleOf(task, tasks).map((input) => input.task_id) };
  if (approvals.some((entry) => entry.taskId === task.task_id)) return { status: "attention", note: "等你批准工具" };
  if (task.state === "completed" && task.result && !task.acceptance && task.acceptance_policy?.mode === "human") return { status: "attention", note: "等你验收" };
  const uncertain = attempt && attempt.cleanup_state !== "released" && (task.state === "needs_review" || task.state === "interrupted");
  if (uncertain) {
    const code = UNCERTAIN.has(attempt.error) ? attempt.error : attempt.error || "outcome_unknown";
    return { status: "failed", note: "需要确认", code, reason: reasonOf(code), uncertain: true };
  }
  if (task.state === "failed" || task.state === "needs_review" || task.state === "interrupted") {
    const blocker = (task.blockers ?? [])[0];
    const code = attempt?.error || blocker?.kind || (task.acceptance?.decision === "rejected" ? "acceptance_rejected" : task.state);
    return { status: "failed", note: "没能完成", code, reason: reasonOf(code, { reason: task.acceptance?.reason, attempts: task.attempt_ids?.length, taskName: nameOf(blocker?.resource) }) };
  }
  if (task.state === "completed") {
    if (task.kind === "review") return { status: "done", note: task.result?.value?.decision === "rejected" ? "退回" : "通过" };
    if (task.acceptance?.decision === "accepted") return { status: "done", note: "" };
    if (task.acceptance?.decision === "rejected") return { status: "stopped", note: "被退回" };
    return { status: "running", note: "等审核" };
  }
  if (task.state === "result_proposed") return { status: "running", note: "已提交，收尾中" };
  if (attempt?.state === "suspended") return { status: "running", note: "等子任务" };
  if (task.state === "running" || task.state === "dispatching") return { status: "running", note: "执行中" };
  if (kinds.has("dependencies")) {
    const waits = (task.dependencies ?? []).map((dep) => nameOf(dep.task_id)).filter(Boolean);
    return { status: "waiting", note: waits.length ? `等待：${waits[0].slice(0, 12)}` : "等待依赖" };
  }
  if (kinds.has("primary_offline") || kinds.has("agent_offline")) return { status: "waiting", note: "成员不在线" };
  return { status: "waiting", note: "排队" };
}
function runStatusOf(run, { heldPending = 0 } = {}) {
  if (run === void 0) return { status: "waiting", note: "" };
  if (run.phase === "completed") return { status: "done", note: "已完成" };
  if (run.phase === "cancelled") return { status: "stopped", note: "已结束" };
  if (run.gate_failure || run.phase === "failed") {
    const code = run.gate_failure?.code ?? "GATE_NOT_READY";
    return { status: "failed", note: "终审没通过", code, reason: reasonOf(code, { taskName: run.gate_failure?.task_goal }) };
  }
  if (run.recovery_hold || run.phase === "needs_review" || run.phase === "interrupted") return { status: "attention", note: run.phase === "needs_review" ? "有步骤需要处理，处理后继续" : "系统重启后待确认" };
  if (heldPending > 0) return { status: "attention", note: `${heldPending} 条消息待处理` };
  if (!run.admitted) {
    const wait = run.waiting_roles?.[0];
    return { status: "waiting", note: wait ? `排队：等 ${wait.role_id}` : "排队" };
  }
  return { status: "running", note: run.phase === "planning" ? "规划中" : "进行中" };
}

// src/summarybar.js
var import_react3 = require("react");

// src/summary.js
var runsOfTeam = (snapshot, teamId) => (snapshot?.views?.runs ?? []).filter((run) => teamId === null || run.team_id === teamId);
function currentRun(snapshot, teamId) {
  const runs = runsOfTeam(snapshot, teamId).sort((a, b) => b.queue_seq - a.queue_seq);
  return runs.find((run) => run.admitted && !["completed", "cancelled", "failed"].includes(run.phase)) ?? runs[0];
}
function summaryOf(snapshot, approvals = [], teamId = null) {
  const views = snapshot?.views ?? {};
  const tasks = views.tasks ?? [];
  const attempts = views.attempts ?? [];
  const teams = teamId === null ? [...new Set((views.runs ?? []).map((run) => run.team_id))] : [teamId];
  const members = (views.agents ?? []).filter((agent) => !agent.revoked && (teamId === null || agent.team_id === teamId));
  const out = { members: members.length, online: members.filter((agent) => agent.presence === "online").length, running: 0, attention: [], failed: [], queued: [] };
  for (const team of teams) {
    const run = currentRun(snapshot, team);
    if (run === void 0) continue;
    const runState = runStatusOf(run);
    const item = (extra) => ({ teamId: team, runId: run.run_id, ...extra });
    if (runState.status === "failed") out.failed.push(item({ taskId: null, title: run.goal, note: runState.reason }));
    if (runState.status === "waiting" && !run.admitted) out.queued.push(item({ title: run.goal, note: runState.note, owner: run.waiting_roles?.[0]?.owner_team_id }));
    const own = tasks.filter((task) => task.run_id === run.run_id && task.kind !== "leader_step");
    const failedBefore = out.failed.length;
    for (const task of own) {
      const state = statusOf(task, { attempts, approvals, tasks: own });
      if (state.status === "running") out.running += 1;
      if (state.status === "attention") out.attention.push(item({ taskId: task.task_id, title: task.goal, note: state.note }));
      if (state.status === "failed") out.failed.push(item({ taskId: task.task_id, title: task.goal, note: state.reason }));
    }
    if (runState.status === "attention" && out.failed.length === failedBefore) out.attention.push(item({ taskId: null, title: run.goal, note: runState.note }));
  }
  return out;
}

// src/teams.js
var import_react2 = require("react");

// src/tree.js
var byTime = (a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || String(a.task_id).localeCompare(String(b.task_id));
function parentOf(task) {
  const origin = task.origin;
  if (origin?.kind === "review" || origin?.kind === "rework" || origin?.kind === "delegate") return origin.by ?? null;
  if (task.kind === "review") return task.dependencies?.[0]?.task_id ?? null;
  if (task.rework_of) return task.rework_of;
  if (task.parent_id) return task.parent_id;
  return null;
}
function oneLine(task, tasks = []) {
  if (task.title) return task.title;
  if (task.kind === "review") {
    const target = tasks.find((candidate) => candidate.task_id === parentOf(task));
    return `审核：${target ? oneLine(target, tasks) : "上一步的结果"}`;
  }
  const first = String(task.goal ?? "").split(/[。\n]/)[0].trim();
  return first.length > 40 ? `${first.slice(0, 40)}…` : first;
}
function treeOf(snapshot, runId, { approvals = [], bots = {} } = {}) {
  const views = snapshot?.views ?? {};
  const run = (views.runs ?? []).find((candidate) => candidate.run_id === runId);
  if (run === void 0) return void 0;
  const all = (views.tasks ?? []).filter((task) => task.run_id === runId);
  const tasks = all.filter((task) => task.kind !== "leader_step").sort(byTime);
  const attempts = views.attempts ?? [];
  const agents = views.agents ?? [];
  const who = (agentId) => {
    const agent = agents.find((candidate) => candidate.binding?.agent_id === agentId);
    const bot = agent?.host?.bot_id ? bots[agent.host.bot_id] : void 0;
    return { agentId, botId: agent?.host?.bot_id ?? null, name: bot?.name ?? agentId ?? "", look: bot ?? null, model: agent?.route?.model ?? bot?.model?.split("/").pop() ?? null };
  };
  const root = {
    id: `run:${run.run_id}`,
    kind: "run",
    run,
    title: run.goal,
    role: "Leader",
    member: who(run.leader?.agent_id),
    state: runStatusOf(run),
    decisions: all.filter((task) => task.kind === "leader_step").length,
    children: [],
    deps: []
  };
  const nodes = /* @__PURE__ */ new Map([[root.id, root]]);
  const last = /* @__PURE__ */ new Map();
  for (const task of tasks) {
    const own = (task.attempt_ids ?? []).map((id) => attempts.find((attempt) => attempt.attempt_id === id)).filter(Boolean);
    const state = statusOf(task, { attempts, approvals, tasks });
    const base = () => ({ kind: "task", task, title: oneLine(task, tasks), role: task.role_id, member: who(task.target?.agent_id ?? task.expected_target?.agent_id), children: [], deps: [] });
    const chain = own.length <= 1 ? [{ ...base(), id: task.task_id, attemptNo: own.length, attempt: own[0], state }] : own.map((attempt, index) => ({
      ...base(),
      id: index === 0 ? task.task_id : `${task.task_id}#${index + 1}`,
      attemptNo: index + 1,
      attempt,
      state: index === own.length - 1 ? { ...state, note: [`第 ${index + 1} 次`, state.note].filter(Boolean).join(" · ") } : { status: "stopped", note: `第 ${index + 1} 次（已重试）`, reason: attempt.error ? void 0 : void 0 }
    }));
    for (let i = 1; i < chain.length; i += 1) chain[i - 1].children.push(chain[i]);
    if (chain.length > 1) chain[0].folds = { ...state, note: [`重试 ${chain.length - 1} 次后`, state.note || { done: "完成", failed: "仍未完成", running: "进行中", attention: "等你处理", stopped: "已停止", waiting: "等待" }[state.status]].join("") };
    for (const node of chain) nodes.set(node.id, node);
    last.set(task.task_id, chain.at(-1));
  }
  for (const task of tasks) {
    const first = nodes.get(task.task_id);
    const parent = parentOf(task);
    const under = parent !== null && last.has(parent) ? last.get(parent) : root;
    under.children.push(first);
    for (const dep of task.dependencies ?? []) {
      if (dep.task_id !== parent && last.has(dep.task_id)) first.deps.push(last.get(dep.task_id).id);
    }
  }
  return { root, nodes };
}
function descendants(node) {
  const out = [];
  const walk = (current) => {
    for (const child of current.children) {
      out.push(child);
      walk(child);
    }
  };
  walk(node);
  return out;
}
function autoFolded(root) {
  const folded = /* @__PURE__ */ new Set();
  const settled = (node) => ["done", "stopped"].includes(node.state.status);
  const walk = (node) => {
    for (const child of node.children) walk(child);
    if (node.children.length === 0 || node.kind === "run") return;
    const below = descendants(node);
    if (settled(node) && below.every(settled)) folded.add(node.id);
  };
  walk(root);
  return folded;
}

// src/layout.js
var CARD = { width: 232, height: 112, gapX: 28, gapY: 56 };
var PER_ROW = 6;
function layout(root, folded = /* @__PURE__ */ new Set(), size = CARD) {
  const out = [];
  const edges = [];
  const boxOf = /* @__PURE__ */ new Map();
  const limit = size.wrapWidth ?? PER_ROW * (size.width + size.gapX) - size.gapX;
  const visibleChildren = (node) => folded.has(node.id) ? [] : node.children;
  const rowWidth = (row) => row.reduce((sum, child) => sum + boxOf.get(child.id).width, 0) + Math.max(0, row.length - 1) * size.gapX;
  const rowsOf = (children) => {
    if (rowWidth(children) <= limit) return children.length ? [children] : [];
    const rows = [[]];
    for (const child of children) {
      const row = rows.at(-1);
      if (row.length > 0 && rowWidth([...row, child]) > limit) rows.push([child]);
      else row.push(child);
    }
    return rows;
  };
  const measure = (node) => {
    const children = visibleChildren(node);
    for (const child of children) measure(child);
    const rows = rowsOf(children);
    const inner = Math.max(0, ...rows.map(rowWidth));
    const below = rows.reduce((sum, row) => sum + size.gapY + Math.max(...row.map((child) => boxOf.get(child.id).height)), 0);
    const box = { width: Math.max(size.width, inner), height: size.height + below, rows };
    boxOf.set(node.id, box);
    return box;
  };
  const place = (node, left, top, depth) => {
    const box = boxOf.get(node.id);
    const x = left + (box.width - size.width) / 2;
    out.push({ node, x, y: top, depth, hidden: folded.has(node.id) ? descendants(node).length : 0 });
    let rowTop = top + size.height + size.gapY;
    const trunkX = left + (box.width - Math.max(0, ...box.rows.map(rowWidth))) / 2 - size.gapX / 2;
    const firstLane = rowTop - size.gapY / 2;
    box.rows.forEach((row, index) => {
      let cursor = left + (box.width - rowWidth(row)) / 2;
      for (const child of row) {
        edges.push(index === 0 ? { from: node.id, to: child.id } : { from: node.id, to: child.id, bus: { trunkX, firstLane, lane: rowTop - size.gapY / 2 } });
        place(child, cursor, rowTop, depth + 1);
        cursor += boxOf.get(child.id).width + size.gapX;
      }
      rowTop += Math.max(...row.map((child) => boxOf.get(child.id).height)) + size.gapY;
    });
  };
  const total = measure(root);
  place(root, 0, 0, 0);
  const ids = new Set(out.map((item) => item.node.id));
  const deps = out.flatMap((item) => item.node.deps.filter((id) => ids.has(id)).map((id) => ({ from: id, to: item.node.id, dep: true })));
  return { nodes: out, edges: [...edges, ...deps], width: total.width, height: total.height, rootX: out[0].x };
}

// src/team-model.js
function teamsOf(snapshot, bound = {}, approvals = []) {
  const views = snapshot?.views ?? {};
  const ids = [...new Set([...(views.teams ?? []).map((team) => team.config?.team_id), ...Object.keys(bound)].filter(Boolean))].sort();
  const held = (views.held_inputs ?? []).filter((row) => row.disposition === "pending");
  return ids.map((id) => {
    const run = currentRun(snapshot, id);
    const counts = { running: 0, done: 0, attention: 0, failed: 0, stopped: 0, waiting: 0 };
    const tasks = run ? (views.tasks ?? []).filter((task) => task.run_id === run.run_id && task.kind !== "leader_step") : [];
    for (const task of tasks) counts[statusOf(task, { attempts: views.attempts ?? [], approvals, tasks }).status] += 1;
    const agents = new Set((bound[id]?.members ?? []).map((member) => member.agentId));
    return {
      id,
      run,
      runState: run ? runStatusOf(run) : { status: "waiting", note: "还没有 Run" },
      counts,
      room: bound[id]?.roomName ?? null,
      bound: Boolean(bound[id]),
      members: bound[id]?.members ?? [],
      // One group message is held once per member; the card shows it once.
      held: held.filter((row) => agents.has(row.binding?.agent_id)).filter((row, i, rows) => rows.findIndex((other) => other.text === row.text) === i)
    };
  });
}
function alsoIn(botId, teamId, bound = {}) {
  if (!botId) return [];
  return Object.entries(bound).filter(([id, team]) => id !== teamId && (team.members ?? []).some((member) => member.botId === botId)).map(([id]) => id);
}

// src/teams.js
var LABEL = { running: "进行中", done: "完成", attention: "需要你处理", failed: "失败", stopped: "已停止", waiting: "未开始" };
function MiniTree({ snapshot, runId }) {
  const tree = runId ? treeOf(snapshot, runId) : void 0;
  if (!tree) return (0, import_react2.createElement)("div", { className: "sq-mini sq-muted" }, "还没有任务");
  const size = { width: 18, height: 12, gapX: 8, gapY: 14 };
  const placed = layout(tree.root, /* @__PURE__ */ new Set(), size);
  const at = new Map(placed.nodes.map((item) => [item.node.id, item]));
  const scale = Math.min(1, 220 / Math.max(placed.width, 1), 90 / Math.max(placed.height, 1));
  return (0, import_react2.createElement)(
    "svg",
    { className: "sq-mini", viewBox: `-4 -4 ${placed.width + 8} ${placed.height + 8}`, width: Math.max(40, (placed.width + 8) * scale), height: Math.max(24, (placed.height + 8) * scale), "aria-hidden": true },
    placed.edges.filter((edge) => !edge.dep).map((edge) => {
      const a = at.get(edge.from);
      const b = at.get(edge.to);
      return (0, import_react2.createElement)("line", { key: `${edge.from}-${edge.to}`, x1: a.x + size.width / 2, y1: a.y + size.height, x2: b.x + size.width / 2, y2: b.y, stroke: "var(--sq-line)", strokeWidth: 1.5 });
    }),
    placed.nodes.map((item) => (0, import_react2.createElement)("rect", { key: item.node.id, x: item.x, y: item.y, width: size.width, height: size.height, rx: 3, fill: `var(--sq-${item.node.state.status})` }))
  );
}
function HeldList({ team }) {
  const [open3, setOpen] = (0, import_react2.useState)(false);
  if (team.held.length === 0) return null;
  const dispose = async (row, disposition, extra = {}) => {
    try {
      if (disposition === "started") {
        const run = await call("start-run", { requestId: requestId("held"), teamId: team.id, goal: row.text });
        extra = { run_id: run.run_id };
      }
      await call("dispose", { inputId: row.input_id, body: { request_id: requestId("dispose"), disposition, ...extra } });
      toast(disposition === "dismissed" ? "已忽略这条消息" : disposition === "started" ? "已用这句话开始" : "已转为补充指导", "ok");
    } catch (error) {
      toast(`没有处理：${error.message}`);
    }
    await refreshNow();
  };
  const active = team.run && team.run.admitted && !["completed", "cancelled"].includes(team.run.phase);
  return (0, import_react2.createElement)(
    "div",
    { className: "sq-held" },
    (0, import_react2.createElement)("button", { className: "sq-link", onClick: (event) => {
      event.stopPropagation();
      setOpen((value) => !value);
    } }, `${team.held.length} 条消息没交给任何任务 ${open3 ? "▴" : "▾"}`),
    open3 ? team.held.map((row) => (0, import_react2.createElement)(
      "div",
      { key: row.input_id, className: "sq-held-row", onClick: (event) => event.stopPropagation() },
      (0, import_react2.createElement)("div", null, `“${String(row.text).slice(0, 60)}”`),
      (0, import_react2.createElement)(
        "div",
        { className: "sq-row" },
        active ? (0, import_react2.createElement)("button", { className: "sq-btn", onClick: () => dispose(row, "guidance", { run_id: team.run.run_id, expected_revision: team.run.revision }) }, "转为补充指导") : (0, import_react2.createElement)("button", { className: "sq-btn", "data-kind": "primary", onClick: () => dispose(row, "started") }, "用这句话开始"),
        (0, import_react2.createElement)("button", { className: "sq-btn", onClick: () => dispose(row, "dismissed") }, "忽略")
      )
    )) : null
  );
}
function TeamCard({ team, snapshot }) {
  const focus = () => store.set((state) => ({ ...state, teamScope: team.id, runId: team.run?.run_id ?? null }));
  const queued = team.run && !team.run.admitted ? team.run.waiting_roles?.[0] : null;
  return (0, import_react2.createElement)(
    "div",
    { className: "sq-team", role: "button", tabIndex: 0, "data-team": team.id, "data-s": team.runState.status, "aria-label": `小队 ${team.id}：${team.runState.label ?? team.runState.status}`, onClick: focus, onKeyDown: (event) => {
      if (event.key === "Enter") focus();
    } },
    (0, import_react2.createElement)(
      "div",
      { className: "sq-row" },
      (0, import_react2.createElement)("strong", { style: { flex: 1 } }, `小队 ${team.id}`),
      (0, import_react2.createElement)(StatusChip, { state: team.runState }),
      (0, import_react2.createElement)("button", { className: "sq-btn sq-team-menu", title: "规则", "aria-label": `小队 ${team.id} 的规则`, onClick: (event) => {
        event.stopPropagation();
        store.set((state) => ({ ...state, tab: "config", configFocus: `team:${team.id}` }));
      } }, "⚙")
    ),
    (0, import_react2.createElement)("div", { className: "sq-muted" }, team.bound ? `群「${team.room}」· ${team.members.length} 位成员` : "还没绑定到群"),
    (0, import_react2.createElement)("div", { className: "sq-team-goal" }, team.run ? team.run.goal : "还没有 Run"),
    queued ? (0, import_react2.createElement)("div", { className: "sq-muted" }, `排队：等 ${queued.role_id}，`, (0, import_react2.createElement)("button", { className: "sq-link", onClick: (event) => {
      event.stopPropagation();
      store.set((state) => ({ ...state, teamScope: queued.owner_team_id, runId: queued.owner_run_id }));
    } }, `被小队 ${queued.owner_team_id} 占用`)) : null,
    (0, import_react2.createElement)(MiniTree, { snapshot, runId: team.run?.run_id }),
    (0, import_react2.createElement)("div", { className: "sq-row sq-team-counts" }, Object.entries(team.counts).filter(([, n]) => n > 0).map(([status, n]) => (0, import_react2.createElement)("span", { key: status, className: "sq-status", "data-s": status }, `${LABEL[status]} ${n}`))),
    (0, import_react2.createElement)(HeldList, { team })
  );
}
function Overview() {
  const snapshot = useStore((state) => state.projection.snapshot);
  const bound = useStore((state) => state.teams);
  const approvals = useStore((state) => state.approvals);
  const teams = teamsOf(snapshot, bound, approvals);
  return (0, import_react2.createElement)(
    "div",
    { className: "sq-main" },
    (0, import_react2.createElement)(
      "div",
      { className: "sq-row" },
      (0, import_react2.createElement)("h2", { style: { margin: 0, flex: 1 } }, `全部小队（${teams.length}）`),
      (0, import_react2.createElement)("button", { className: "sq-btn", "data-kind": "primary", onClick: () => store.set((state) => ({ ...state, startOpen: true })) }, "＋ 开始一个小队任务")
    ),
    (0, import_react2.createElement)("div", { className: "sq-grid sq-teams" }, teams.map((team) => (0, import_react2.createElement)(TeamCard, { key: team.id, team, snapshot }))),
    teams.length === 0 ? (0, import_react2.createElement)("div", { className: "sq-card" }, "还没有小队。在「小队与规则」里新建一个。") : null
  );
}
function TeamSwitcher() {
  const snapshot = useStore((state) => state.projection.snapshot);
  const bound = useStore((state) => state.teams);
  const scope = useStore((state) => state.teamScope ?? null);
  const ids = teamsOf(snapshot, bound).map((team) => team.id);
  if (ids.length < 2) return null;
  const pick = (id) => store.set((state) => ({ ...state, teamScope: id, runId: id === null ? state.runId : currentRun(snapshot, id)?.run_id ?? null }));
  if (ids.length > 4) {
    return (0, import_react2.createElement)(
      "select",
      { className: "sq-select sq-switch", value: scope ?? "", onChange: (event) => pick(event.target.value || null), "aria-label": "切换小队" },
      (0, import_react2.createElement)("option", { value: "" }, `全部小队（${ids.length}）`),
      ids.map((id) => (0, import_react2.createElement)("option", { key: id, value: id }, `小队 ${id}`))
    );
  }
  return (0, import_react2.createElement)(
    "div",
    { className: "sq-seg", role: "tablist", "aria-label": "切换小队" },
    [null, ...ids].map((id) => (0, import_react2.createElement)("button", { key: id ?? "all", role: "tab", "aria-selected": scope === id, "data-on": scope === id || void 0, onClick: () => pick(id) }, id === null ? `全部（${ids.length}）` : id))
  );
}
function StartPanel() {
  const open3 = useStore((state) => state.startOpen);
  const snapshot = useStore((state) => state.projection.snapshot);
  const { scope } = useScope();
  const bound = useStore((state) => state.teams);
  const teams = (snapshot?.views?.teams ?? []).map((team2) => team2.config);
  const [teamId, setTeam] = (0, import_react2.useState)(null);
  const [goal, setGoal] = (0, import_react2.useState)("");
  const [workflowId, setWorkflow] = (0, import_react2.useState)("");
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const chosen = teamId ?? scope ?? teams[0]?.team_id ?? "";
  const empty = chosen !== "" && scope !== null && !(snapshot?.views?.runs ?? []).some((run) => run.team_id === chosen);
  if (!open3 && !empty) return null;
  const team = (snapshot?.views?.teams ?? []).find((candidate) => candidate.config.team_id === chosen);
  const workflows = Object.keys(team?.workflows ?? {});
  const close2 = () => store.set((state) => ({ ...state, startOpen: false }));
  const start = async () => {
    setBusy(true);
    try {
      const run = await call("start-run", { requestId: requestId("run"), teamId: chosen, goal, ...workflowId ? { workflowId } : {} });
      store.set((state) => ({ ...state, startOpen: false, teamScope: chosen, runId: run.run_id }));
      setGoal("");
      toast("小队已开始", "ok");
    } catch (error) {
      toast(`没能开始：${error.message}`);
    } finally {
      setBusy(false);
      await refreshNow();
    }
  };
  return (0, import_react2.createElement)(
    "aside",
    { className: "sq-start", role: "dialog", "aria-label": "开始一个小队任务" },
    (0, import_react2.createElement)("div", { className: "sq-row" }, (0, import_react2.createElement)("strong", { style: { flex: 1 } }, "开始一个小队任务"), open3 ? (0, import_react2.createElement)("button", { className: "sq-x", "aria-label": "关闭", onClick: close2 }, "×") : null),
    (0, import_react2.createElement)("label", null, "小队", (0, import_react2.createElement)("select", { className: "sq-select", value: chosen, onChange: (event) => setTeam(event.target.value) }, teams.map((t) => (0, import_react2.createElement)("option", { key: t.team_id, value: t.team_id }, t.team_id)))),
    bound[chosen] ? null : (0, import_react2.createElement)("div", { className: "sq-muted" }, `还没绑定到群：会自动建群「${chosen} 小队」并把成员拉进去。`),
    workflows.length > 0 ? (0, import_react2.createElement)("label", null, "流程", (0, import_react2.createElement)(
      "select",
      { className: "sq-select", value: workflowId, onChange: (event) => setWorkflow(event.target.value) },
      (0, import_react2.createElement)("option", { value: "" }, `默认流程${team?.config?.default_workflow ? `（${team.config.default_workflow}）` : "（由 Leader 安排）"}`),
      workflows.map((id) => (0, import_react2.createElement)("option", { key: id, value: id }, id))
    )) : null,
    (0, import_react2.createElement)("label", null, "目标", (0, import_react2.createElement)("textarea", { className: "sq-text", style: { minHeight: 120 }, placeholder: "要完成什么？例如：认识分数：分数的意义与读写（五年级）", value: goal, onChange: (event) => setGoal(event.target.value) })),
    (0, import_react2.createElement)("button", { className: "sq-btn", "data-kind": "primary", disabled: busy || !chosen || goal.trim() === "", onClick: start }, busy ? "正在开始…" : "开始")
  );
}
function useScope() {
  const snapshot = useStore((state) => state.projection.snapshot);
  const bound = useStore((state) => state.teams);
  const scope = useStore((state) => state.teamScope ?? null);
  const count = teamsOf(snapshot, bound).length;
  return { overview: scope === null && count >= 2, scope: count < 2 ? teamsOf(snapshot, bound)[0]?.id ?? null : scope };
}

// src/summarybar.js
function jumpTo(item) {
  store.set((state) => ({ ...state, open: true, tab: "runs", runId: item.runId, teamScope: item.teamId ?? state.teamScope, focus: { taskId: item.taskId, runId: item.runId, at: Date.now() } }));
}
function Pill({ kind, items, label }) {
  const [open3, setOpen] = (0, import_react3.useState)(false);
  const [flash, setFlash] = (0, import_react3.useState)(false);
  const count = (0, import_react3.useRef)(items.length);
  (0, import_react3.useEffect)(() => {
    if (items.length > count.current) {
      setFlash(true);
      const timer2 = setTimeout(() => setFlash(false), 1e3);
      count.current = items.length;
      return () => clearTimeout(timer2);
    }
    count.current = items.length;
    return void 0;
  }, [items.length]);
  if (items.length === 0) return null;
  const groups = [...new Set(items.map((item) => item.teamId))];
  return (0, import_react3.createElement)(
    "span",
    { style: { position: "relative" } },
    (0, import_react3.createElement)("button", { className: "sq-pill", "data-s": kind, "data-flash": flash || void 0, "aria-expanded": open3, onClick: () => setOpen((value) => !value) }, `${items.length} 个${label} ▾`),
    open3 ? (0, import_react3.createElement)(
      "div",
      { className: "sq-menu", role: "menu", onMouseLeave: () => setOpen(false) },
      groups.map((team) => [
        groups.length > 1 || team ? (0, import_react3.createElement)("div", { key: `g-${team}`, className: "sq-menu-group" }, `小队 ${team}`) : null,
        ...items.filter((item) => item.teamId === team).map((item) => (0, import_react3.createElement)(
          "button",
          { key: `${item.runId}:${item.taskId}`, role: "menuitem", className: "sq-menu-item", onClick: () => {
            setOpen(false);
            jumpTo(item);
          } },
          (0, import_react3.createElement)("div", null, item.taskId === null ? `整个小队：${item.title}` : item.title.length > 36 ? `${item.title.slice(0, 36)}…` : item.title),
          (0, import_react3.createElement)("div", { className: "sq-muted" }, item.note || "")
        ))
      ])
    ) : null
  );
}
function SummaryBar() {
  const snapshot = useStore((state) => state.projection.snapshot);
  const approvals = useStore((state) => state.approvals);
  const scope = useStore((state) => state.teamScope ?? null);
  const started = useStarted(snapshot, scope);
  if (!snapshot) return null;
  const sum = summaryOf(snapshot, approvals, scope);
  const every = scope === null ? sum : summaryOf(snapshot, approvals, null);
  return (0, import_react3.createElement)(
    "div",
    { className: "sq-sum", role: "status", "aria-label": "小队概况" },
    (0, import_react3.createElement)(TeamSwitcher),
    (0, import_react3.createElement)("span", { className: "sq-sum-num" }, "成员 ", (0, import_react3.createElement)("b", null, sum.members), sum.online < sum.members ? `（${sum.online} 在线）` : ""),
    (0, import_react3.createElement)("span", { className: "sq-sum-num" }, "运行中 ", (0, import_react3.createElement)("b", null, sum.running)),
    (0, import_react3.createElement)(Pill, { kind: "attention", items: every.attention, label: "需要你处理" }),
    (0, import_react3.createElement)(Pill, { kind: "failed", items: every.failed, label: "失败" }),
    every.queued.map((item) => (0, import_react3.createElement)("button", { key: item.runId, className: "sq-menu-item sq-muted", onClick: () => jumpTo(item) }, `小队 ${item.teamId} ${item.note}${item.owner ? `（小队 ${item.owner} 正在用）` : ""}`)),
    started.list.map((item) => (0, import_react3.createElement)("button", { key: item.runId, className: "sq-notice", onClick: () => {
      started.drop(item.runId);
      jumpTo({ teamId: item.teamId, runId: item.runId, taskId: null });
    } }, `小队 ${item.teamId} 已开始 →`))
  );
}
function useStarted(snapshot, scope) {
  const seen = (0, import_react3.useRef)(null);
  const [list, setList] = (0, import_react3.useState)([]);
  const admitted = (snapshot?.views?.runs ?? []).filter((run) => run.admitted);
  const key = admitted.map((run) => run.run_id).sort().join(",");
  (0, import_react3.useEffect)(() => {
    if (!snapshot) return;
    if (seen.current === null) {
      seen.current = new Set(admitted.map((run) => run.run_id));
      return;
    }
    const fresh = admitted.filter((run) => !seen.current.has(run.run_id));
    for (const run of fresh) seen.current.add(run.run_id);
    const others = fresh.filter((run) => scope !== null && run.team_id !== scope);
    if (others.length > 0) setList((current) => [...current, ...others.map((run) => ({ runId: run.run_id, teamId: run.team_id }))]);
  }, [key]);
  (0, import_react3.useEffect)(() => {
    setList((current) => current.filter((item) => item.teamId !== scope));
  }, [scope]);
  return { list, drop: (runId) => setList((current) => current.filter((item) => item.runId !== runId)) };
}
var StatusChip = ({ state }) => (0, import_react3.createElement)("span", { className: "sq-status", "data-s": state.status, title: state.reason ?? state.note ?? "" }, state.label ?? labelOf(state.status));
var LABELS = { running: "进行中", done: "完成", attention: "需要你处理", failed: "失败", stopped: "已停止", waiting: "未开始" };
var labelOf = (status) => LABELS[status] ?? status;

// src/canvas.js
var import_react5 = require("react");

// src/actions.js
var import_react4 = require("react");
async function act(what, endpoint, payload, after) {
  try {
    await call(endpoint, payload);
    toast(`${what}：已提交`, "ok");
    after?.();
  } catch (error) {
    const stale = /REVISION|CONFLICT|changed|moved on/i.test(error.message);
    toast(stale ? "这一步已更新，刷新后再处理。" : `${what}失败：${error.message}`);
  } finally {
    await refreshNow();
  }
}
function Guidance({ run, task }) {
  const [text, setText] = (0, import_react4.useState)("");
  if (!run || ["completed", "cancelled"].includes(run.phase)) return null;
  return (0, import_react4.createElement)(
    "div",
    { className: "sq-row sq-pop-guide" },
    (0, import_react4.createElement)("input", { className: "sq-input", style: { flex: 1 }, placeholder: task ? "就这一步给 Leader 补充指导" : "给 Leader 补充指导", value: text, onChange: (event) => setText(event.target.value), onClick: (event) => event.stopPropagation() }),
    (0, import_react4.createElement)("button", { className: "sq-btn", disabled: text.trim() === "", onClick: () => act("补充指导", "operate", { kind: "run", id: run.run_id, op: "guidance", body: { request_id: requestId("guide"), expected_revision: run.revision, note: text.trim(), ...task ? { task_id: task.task_id } : {} } }, () => setText("")) }, "发送")
  );
}
function FailedTask({ node }) {
  const { task, state } = node;
  const attempts = useStore((s) => s.projection.snapshot?.views?.attempts ?? []);
  const evidence = useStore((s) => s.projection.snapshot?.views?.evidence ?? []);
  const [step2, setStep] = (0, import_react4.useState)(null);
  const own = (task.attempt_ids ?? []).map((id) => attempts.find((attempt) => attempt.attempt_id === id)).filter(Boolean);
  const open3 = own.filter((attempt) => attempt.cleanup_state !== "released");
  const late = evidence.filter((row) => own.some((attempt) => attempt.attempt_id === row.attempt_id) && row.disposition === "rejected_late_or_stale");
  const runtime = open3.at(-1)?.target?.runtime_id ?? own.at(-1)?.target?.runtime_id ?? "";
  const restart = (confirm) => act("重试", "operate", { kind: "task", id: task.task_id, op: "restart", body: { request_id: requestId("restart"), expected_revision: task.revision, expected_runtime: runtime, note: "在 Squad 页面重试", confirm_stopped: confirm } });
  const adopt = (row) => act("采用这份结果", "operate", { kind: "task", id: task.task_id, op: "recover", body: { request_id: requestId("adopt"), expected_revision: task.revision, evidence: `evidence:${row.seq}`, note: "在 Squad 页面采用迟到的结果" } });
  return (0, import_react4.createElement)(
    import_react4.Fragment,
    null,
    (0, import_react4.createElement)("div", { className: "sq-pop-title" }, "没能完成"),
    (0, import_react4.createElement)("div", { className: "sq-pop-reason" }, state.reason),
    step2 === "ignore" ? (0, import_react4.createElement)(
      "div",
      { className: "sq-pop-confirm" },
      "忽略后最终检查不再要求这一步。确定？",
      (0, import_react4.createElement)("div", { className: "sq-row" }, (0, import_react4.createElement)("button", { className: "sq-btn", onClick: () => setStep(null) }, "算了"), (0, import_react4.createElement)("button", { className: "sq-btn", "data-kind": "danger", onClick: () => act("忽略", "operate", { kind: "task", id: task.task_id, op: "cancel", body: { request_id: requestId("ignore"), expected_revision: task.revision, note: "忽略：在 Squad 页面忽略这一步", ignore: true } }) }, "确定忽略"))
    ) : step2 === "confirm" ? (0, import_react4.createElement)(
      "div",
      { className: "sq-pop-confirm" },
      "重试前请确认：上一次已经停下了（例如 DS Bot 已重启完毕）。",
      (0, import_react4.createElement)("div", { className: "sq-row" }, (0, import_react4.createElement)("button", { className: "sq-btn", onClick: () => setStep(null) }, "算了"), (0, import_react4.createElement)("button", { className: "sq-btn", "data-kind": "primary", onClick: () => restart(true) }, "确认并重试"))
    ) : (0, import_react4.createElement)(
      "div",
      { className: "sq-row sq-pop-main" },
      (0, import_react4.createElement)("button", { className: "sq-btn", onClick: () => setStep("ignore") }, "忽略"),
      (0, import_react4.createElement)("button", { className: "sq-btn", "data-kind": "primary", onClick: () => open3.length > 0 ? setStep("confirm") : restart(false) }, "重试")
    ),
    late.length > 0 && step2 === null ? (0, import_react4.createElement)("div", { className: "sq-pop-extra" }, `它在中断后交了一份结果。`, open3.length === 0 ? (0, import_react4.createElement)("button", { className: "sq-link", onClick: () => adopt(late.at(-1)) }, "采用这份结果") : (0, import_react4.createElement)("span", { className: "sq-muted" }, "（确认停止后可以采用）")) : null
  );
}
function FailedRun({ run, state }) {
  const [step2, setStep] = (0, import_react4.useState)(null);
  return (0, import_react4.createElement)(
    import_react4.Fragment,
    null,
    (0, import_react4.createElement)("div", { className: "sq-pop-title" }, "最后检查没通过"),
    (0, import_react4.createElement)("div", { className: "sq-pop-reason" }, state.reason),
    step2 === "ignore" ? (0, import_react4.createElement)(
      "div",
      { className: "sq-pop-confirm" },
      "结束这个 Run，已有的成果都保留。确定？",
      (0, import_react4.createElement)("div", { className: "sq-row" }, (0, import_react4.createElement)("button", { className: "sq-btn", onClick: () => setStep(null) }, "算了"), (0, import_react4.createElement)("button", { className: "sq-btn", "data-kind": "danger", onClick: () => act("结束 Run", "operate", { kind: "run", id: run.run_id, op: "cancel", body: { request_id: requestId("end"), expected_revision: run.revision, note: "忽略：结束 Run，保留成果" } }) }, "确定结束"))
    ) : (0, import_react4.createElement)(
      "div",
      { className: "sq-row sq-pop-main" },
      (0, import_react4.createElement)("button", { className: "sq-btn", onClick: () => setStep("ignore") }, "忽略"),
      (0, import_react4.createElement)("button", { className: "sq-btn", "data-kind": "primary", onClick: () => act("重试", "operate", { kind: "run", id: run.run_id, op: "resume", body: { request_id: requestId("resume"), expected_revision: run.revision, note: "在 Squad 页面让 Leader 重新检查" } }) }, "重试")
    )
  );
}
function Stale({ task }) {
  const tasks = useStore((s) => s.projection.snapshot?.views?.tasks ?? []);
  const inputs = (task.dependencies ?? []).map((dep) => tasks.find((candidate) => candidate.task_id === dep.task_id)).filter((input) => input?.superseded_by);
  const name = inputs[0] ? inputs[0].title || String(inputs[0].goal).split(/[。\n]/)[0].slice(0, 24) : "上游";
  const op = (which) => act(which === "rebase" ? "用新版本重做" : "保留这一版", "operate", { kind: "task", id: task.task_id, op: which, body: { request_id: requestId(which), expected_revision: task.revision, note: which === "rebase" ? "在 Squad 页面用新版本重做" : "在 Squad 页面保留这一版" } });
  return (0, import_react4.createElement)(
    import_react4.Fragment,
    null,
    (0, import_react4.createElement)("div", { className: "sq-pop-title" }, "基于旧版本"),
    (0, import_react4.createElement)("div", null, `它用的是「${name}」被退回的旧版本，那一步已经返工。`),
    (0, import_react4.createElement)(
      "div",
      { className: "sq-row sq-pop-main" },
      (0, import_react4.createElement)("button", { className: "sq-btn", onClick: () => op("keep") }, "保留这一版"),
      (0, import_react4.createElement)("button", { className: "sq-btn", "data-kind": "primary", onClick: () => op("rebase") }, "用新版本重做")
    )
  );
}
function Approval({ entry, expectedRevision }) {
  return (0, import_react4.createElement)(
    import_react4.Fragment,
    null,
    (0, import_react4.createElement)("div", { className: "sq-pop-title" }, "需要你批准工具"),
    (0, import_react4.createElement)("div", null, `想运行 ${entry.tool}${entry.reason ? `：${entry.reason}` : ""}`),
    entry.detail?.code || entry.detail?.text ? (0, import_react4.createElement)("pre", { className: "sq-pre sq-muted" }, String(entry.detail.code ?? entry.detail.text).slice(0, 400)) : null,
    (0, import_react4.createElement)(
      "div",
      { className: "sq-row sq-pop-main" },
      (0, import_react4.createElement)("button", { className: "sq-btn", "data-kind": "danger", onClick: () => act("拒绝", "approve", { approvalId: entry.id, attemptId: entry.attemptId, expectedRevision, choice: "reject" }) }, "拒绝"),
      (0, import_react4.createElement)("button", { className: "sq-btn", "data-kind": "primary", onClick: () => act("允许", "approve", { approvalId: entry.id, attemptId: entry.attemptId, expectedRevision, choice: "allow" }) }, "允许一次")
    )
  );
}
function Accept({ task }) {
  const previewBase = useStore((s) => s.previewBase);
  const [reject, setReject] = (0, import_react4.useState)(false);
  const [reason, setReason] = (0, import_react4.useState)("");
  const decide = (decision, note) => act(decision === "accepted" ? "验收通过" : "退回", "accept", { taskId: task.task_id, body: { request_id: requestId("accept"), expected_revision: task.revision, decision, result_hash: task.result.hash, note } });
  const html = (task.result?.artifacts ?? []).find((art) => art.media_type === "text/html");
  return (0, import_react4.createElement)(
    import_react4.Fragment,
    null,
    (0, import_react4.createElement)("div", { className: "sq-pop-title" }, "请确认这个结果是否可以交付"),
    (0, import_react4.createElement)("pre", { className: "sq-pre sq-muted" }, JSON.stringify(task.result?.value ?? null, null, 2).slice(0, 300)),
    html && previewBase ? (0, import_react4.createElement)("button", { className: "sq-link", onClick: () => store.set((s) => ({ ...s, preview: { url: `${previewBase}/v2/artifacts/sha256/${html.sha256}`, name: html.name } })) }, `预览 ${html.name ?? ""}`) : null,
    reject ? (0, import_react4.createElement)(
      "div",
      { className: "sq-pop-confirm" },
      (0, import_react4.createElement)("input", { className: "sq-input", placeholder: "一句话写清要改什么", value: reason, onChange: (event) => setReason(event.target.value) }),
      (0, import_react4.createElement)("div", { className: "sq-row" }, (0, import_react4.createElement)("button", { className: "sq-btn", onClick: () => setReject(false) }, "算了"), (0, import_react4.createElement)("button", { className: "sq-btn", "data-kind": "danger", disabled: reason.trim() === "", onClick: () => decide("rejected", reason.trim()) }, "退回"))
    ) : (0, import_react4.createElement)(
      "div",
      { className: "sq-row sq-pop-main" },
      (0, import_react4.createElement)("button", { className: "sq-btn", onClick: () => setReject(true) }, "退回"),
      (0, import_react4.createElement)("button", { className: "sq-btn", "data-kind": "primary", onClick: () => decide("accepted", "在 Squad 页面验收通过") }, "通过")
    )
  );
}
function Held({ run }) {
  return (0, import_react4.createElement)(
    import_react4.Fragment,
    null,
    (0, import_react4.createElement)("div", { className: "sq-pop-title" }, "系统重启过，确认后继续"),
    (0, import_react4.createElement)("div", { className: "sq-muted" }, "先处理下面标红的步骤（重试或忽略），再让 Run 继续。"),
    (0, import_react4.createElement)(
      "div",
      { className: "sq-row sq-pop-main" },
      (0, import_react4.createElement)("button", { className: "sq-btn", "data-kind": "primary", onClick: () => act("继续", "operate", { kind: "run", id: run.run_id, op: "resume", body: { request_id: requestId("resume"), expected_revision: run.revision, note: "在 Squad 页面确认继续" } }) }, "继续")
    )
  );
}
function hasActions(node) {
  return node && (node.state.status === "failed" || node.state.status === "attention");
}
function NodePopover({ node, x, y, onDetails, onClose }) {
  const approvals = useStore((s) => s.approvals);
  const attempts = useStore((s) => s.projection.snapshot?.views?.attempts ?? []);
  const runs = useStore((s) => s.projection.snapshot?.views?.runs ?? []);
  const run = node.kind === "run" ? node.run : runs.find((candidate) => candidate.run_id === node.task?.run_id);
  const task = node.task;
  const approval = task ? approvals.find((entry) => entry.taskId === task.task_id) : void 0;
  const attempt = approval ? attempts.find((candidate) => candidate.attempt_id === approval.attemptId) : void 0;
  let body = null;
  if (node.state.status === "failed") body = node.kind === "run" ? (0, import_react4.createElement)(FailedRun, { run, state: node.state }) : (0, import_react4.createElement)(FailedTask, { node });
  else if (approval) body = (0, import_react4.createElement)(Approval, { entry: approval, expectedRevision: attempt?.revision });
  else if (task && node.state.note === "基于旧版本") body = (0, import_react4.createElement)(Stale, { task });
  else if (task && task.state === "completed" && task.acceptance_policy?.mode === "human") body = (0, import_react4.createElement)(Accept, { task });
  else if (node.kind === "run" && run?.recovery_hold) body = (0, import_react4.createElement)(Held, { run });
  const box = (0, import_react4.useRef)(null);
  (0, import_react4.useEffect)(() => {
    box.current?.querySelector(".sq-pop-main .sq-btn, .sq-btn, textarea, input")?.focus({ preventScroll: true });
  }, [node.id]);
  return (0, import_react4.createElement)(
    "div",
    { className: "sq-pop", "data-s": node.state.status, style: { transform: `translate(${x}px, ${y}px)` }, onMouseDown: (event) => event.stopPropagation(), onClick: (event) => event.stopPropagation(), role: "dialog", "aria-label": `处理这一步：${node.title}`, ref: box },
    (0, import_react4.createElement)("button", { className: "sq-x sq-pop-close", "aria-label": "关闭", onClick: onClose }, "×"),
    body,
    (0, import_react4.createElement)(Guidance, { run, task }),
    (0, import_react4.createElement)("button", { className: "sq-link sq-muted", onClick: onDetails }, "查看详情")
  );
}

// src/canvas.js
var PALETTE = ["#3d5afe", "#00897b", "#f4511e", "#8e24aa", "#c0ca33", "#0288d1", "#d81b60", "#6d4c41"];
var NAMED = { deepseek: "#4d6bfe", blue: "#2563eb", green: "#16a34a", orange: "#ea580c", red: "#dc2626", purple: "#7c3aed", pink: "#db2777", teal: "#0d9488", yellow: "#ca8a04", gray: "#6b7280" };
var colorOf = (member) => {
  const named = member?.look?.color;
  if (typeof named === "string" && (NAMED[named] || /^#[0-9a-f]{6}$/i.test(named))) return NAMED[named] ?? named;
  const key = member?.botId ?? member?.agentId ?? "";
  let hash = 0;
  for (const ch of key) hash = hash * 31 + ch.charCodeAt(0) >>> 0;
  return PALETTE[hash % PALETTE.length];
};
function Avatar({ member, size = 28 }) {
  const image = member?.look?.avatar?.image;
  const name = member?.name || member?.agentId || "?";
  return image ? (0, import_react5.createElement)("img", { className: "sq-avatar", src: image, alt: "", width: size, height: size }) : (0, import_react5.createElement)("span", { className: "sq-avatar", "aria-hidden": true, style: { width: size, height: size, background: colorOf(member) } }, name.slice(0, 1).toUpperCase());
}
var sameCard = (a, b) => a.selected === b.selected && a.isNew === b.isNew && a.item.x === b.item.x && a.item.y === b.item.y && a.item.hidden === b.item.hidden && a.also.join() === b.also.join() && a.onSelect === b.onSelect && a.onFold === b.onFold && a.onFocus === b.onFocus && cardKey(a.item.node) === cardKey(b.item.node);
var cardKey = (node) => JSON.stringify([node.id, node.title, node.state, node.folds?.status, node.children.length, node.member?.name, node.member?.model, node.member?.look?.color, node.member?.look?.avatar?.image, node.decisions, node.run?.guidance?.length, node.task?.kind]);
var NodeCard = (0, import_react5.memo)(function NodeCard2({ item, selected, isNew, onSelect, onFold, onFocus, also = [] }) {
  const { node, hidden } = item;
  const state = hidden > 0 && node.folds ? node.folds : node.state;
  const count = node.children.length;
  const folded = hidden > 0;
  return (0, import_react5.createElement)(
    "div",
    {
      className: "sq-node",
      "data-s": state.status,
      "data-kind": node.kind,
      "data-new": isNew || void 0,
      "data-selected": selected || void 0,
      "data-folded": folded || void 0,
      style: { transform: `translate(${item.x}px, ${item.y}px)`, width: CARD.width, height: CARD.height },
      role: "button",
      tabIndex: 0,
      "aria-label": [node.kind === "run" ? "Leader" : node.member?.name || node.role, node.title, LABELS2[state.status], state.note, state.reason, folded ? `折叠了 ${hidden} 个` : ""].filter(Boolean).join("，"),
      "aria-pressed": selected,
      "data-node": node.id,
      onClick: () => onSelect(node.id),
      onFocus: () => onFocus(item),
      onKeyDown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(node.id);
        }
      }
    },
    (0, import_react5.createElement)(
      "div",
      { className: "sq-node-head" },
      (0, import_react5.createElement)(Avatar, { member: node.member }),
      (0, import_react5.createElement)(
        "div",
        { className: "sq-node-who" },
        (0, import_react5.createElement)("div", { className: "sq-node-role" }, node.kind === "run" ? `Leader · ${node.member?.name ?? ""}` : `${node.member?.name || node.role}${node.task?.kind && node.task.kind !== "execute" ? ` · ${KIND[node.task.kind] ?? node.task.kind}` : ""}`),
        node.member?.model ? (0, import_react5.createElement)("div", { className: "sq-node-model" }, node.member.model) : null
      ),
      also.length > 0 ? (0, import_react5.createElement)("span", { className: "sq-node-also", title: `这位成员也在小队 ${also.join("、")} 工作` }, `也在小队 ${also.join("、")}`) : null,
      (0, import_react5.createElement)(StatusChip, { state })
    ),
    (0, import_react5.createElement)("div", { className: "sq-node-title", title: node.kind === "run" ? node.run.goal : node.task?.goal }, node.title),
    (0, import_react5.createElement)("div", { className: "sq-node-note" }, [["failed", "attention"].includes(state.status) ? "点开处理" : "", state.note, node.kind === "run" && node.decisions ? `Leader 已决定 ${node.decisions} 次` : "", node.kind === "run" && (node.run.guidance ?? []).length ? `${node.run.guidance.length} 条补充指导` : ""].filter(Boolean).slice(0, 2).join(" · ")),
    count > 0 ? (0, import_react5.createElement)("button", {
      className: "sq-node-count",
      "aria-label": folded ? `展开 ${hidden} 个` : `折叠 ${count} 个子节点`,
      title: folded ? "展开" : "折叠",
      onClick: (event) => {
        event.stopPropagation();
        onFold(node.id);
      }
    }, folded ? `+${hidden}` : String(count)) : null
  );
}, sameCard);
var LABELS2 = { running: "进行中", done: "完成", attention: "需要你处理", failed: "失败", stopped: "已停止", waiting: "未开始" };
function Edges({ items, edges, width, height }) {
  const at = new Map(items.map((item) => [item.node.id, item]));
  return (0, import_react5.createElement)(
    "svg",
    { className: "sq-edges", width: Math.max(width, 1), height: Math.max(height, 1), "aria-hidden": true },
    edges.map((edge) => {
      const a = at.get(edge.from);
      const b = at.get(edge.to);
      if (!a || !b) return null;
      if (edge.dep) {
        const x12 = a.x + CARD.width;
        const y12 = a.y + CARD.height / 2;
        const x22 = b.x;
        const y22 = b.y + CARD.height / 2;
        const forward = x22 > x12;
        const d = forward ? `M${x12},${y12} C${x12 + 30},${y12} ${x22 - 30},${y22} ${x22},${y22}` : `M${a.x + CARD.width / 2},${a.y + CARD.height} C${a.x + CARD.width / 2},${a.y + CARD.height + 30} ${b.x + CARD.width / 2},${b.y - 30} ${b.x + CARD.width / 2},${b.y}`;
        return (0, import_react5.createElement)("path", { key: `d-${edge.from}-${edge.to}`, className: "sq-edge-dep", d });
      }
      const x1 = a.x + CARD.width / 2;
      const y1 = a.y + CARD.height;
      const x2 = b.x + CARD.width / 2;
      const y2 = b.y;
      if (edge.bus) {
        const { trunkX, firstLane, lane } = edge.bus;
        return (0, import_react5.createElement)("path", { key: `${edge.from}-${edge.to}`, className: "sq-edge", "data-to-s": b.node.state.status, "data-bus": true, d: `M${x1},${y1} V${firstLane} H${trunkX} V${lane} H${x2} V${y2}` });
      }
      const mid = (y1 + y2) / 2;
      return (0, import_react5.createElement)("path", { key: `${edge.from}-${edge.to}`, className: "sq-edge", "data-to-s": b.node.state.status, d: `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`, style: { transition: "d .25s" } });
    })
  );
}
function Drawer({ node, onClose }) {
  const previewBase = useStore((state) => state.previewBase);
  const attempts = useStore((state) => state.projection.snapshot?.views?.attempts ?? []);
  const closer = (0, import_react5.useRef)(null);
  (0, import_react5.useEffect)(() => {
    closer.current?.focus({ preventScroll: true });
  }, [node?.id]);
  if (!node) return null;
  const task = node.task;
  const run = node.run;
  const own = task ? (task.attempt_ids ?? []).map((id) => attempts.find((attempt) => attempt.attempt_id === id)).filter(Boolean) : [];
  const result = task?.result;
  return (0, import_react5.createElement)(
    "aside",
    { className: "sq-drawer", role: "dialog", "aria-label": `详情：${node.title}` },
    (0, import_react5.createElement)("div", { className: "sq-row" }, (0, import_react5.createElement)(StatusChip, { state: node.state }), (0, import_react5.createElement)("strong", { style: { flex: 1 } }, node.title), (0, import_react5.createElement)("button", { className: "sq-x", "aria-label": "关闭详情", onClick: onClose, ref: closer }, "×")),
    node.state.reason ? (0, import_react5.createElement)("div", { className: "sq-reason" }, node.state.reason) : null,
    (0, import_react5.createElement)("div", { className: "sq-row" }, (0, import_react5.createElement)(Avatar, { member: node.member, size: 22 }), (0, import_react5.createElement)("span", null, node.kind === "run" ? `Leader · ${node.member?.name ?? ""}` : `${node.member?.name || ""} · ${node.role}`), node.member?.model ? (0, import_react5.createElement)("span", { className: "sq-muted" }, node.member.model) : null),
    (0, import_react5.createElement)("div", { className: "sq-muted" }, node.kind === "run" ? "目标" : "任务"),
    (0, import_react5.createElement)("div", { className: "sq-pre" }, run?.goal ?? task?.goal),
    run && (run.guidance ?? []).length ? (0, import_react5.createElement)(import_react5.Fragment, null, (0, import_react5.createElement)("div", { className: "sq-muted" }, "补充指导"), (0, import_react5.createElement)("ul", null, run.guidance.map((text, index) => (0, import_react5.createElement)("li", { key: index }, typeof text === "string" ? text : text.text)))) : null,
    task?.kind === "review" && result?.value ? (0, import_react5.createElement)(import_react5.Fragment, null, (0, import_react5.createElement)("div", { className: "sq-muted" }, "审核结论"), (0, import_react5.createElement)("div", null, `${result.value.decision === "accepted" ? "通过" : "退回"}：${result.value.reason ?? ""}`)) : null,
    task && task.kind !== "review" && result ? (0, import_react5.createElement)(import_react5.Fragment, null, (0, import_react5.createElement)("div", { className: "sq-muted" }, `结果（第 ${result.revision} 版）`), (0, import_react5.createElement)("pre", { className: "sq-pre" }, JSON.stringify(result.value, null, 2).slice(0, 1200))) : null,
    (result?.artifacts ?? []).length ? (0, import_react5.createElement)("div", null, result.artifacts.map((art) => (0, import_react5.createElement)(
      "div",
      { key: art.sha256, className: "sq-row" },
      (0, import_react5.createElement)("span", null, art.name ?? art.path),
      previewBase && art.media_type === "text/html" ? (0, import_react5.createElement)("button", { className: "sq-btn", onClick: () => store.set((state) => ({ ...state, preview: { url: `${previewBase}/v2/artifacts/sha256/${art.sha256}`, name: art.name } })) }, "预览") : null
    ))) : null,
    task?.acceptance && task.kind !== "review" ? (0, import_react5.createElement)("div", { className: "sq-muted" }, `验收：${task.acceptance.decision === "accepted" ? "通过" : "退回"}${task.acceptance.reason ? ` · ${task.acceptance.reason}` : ""}`) : null,
    own.length > 1 ? (0, import_react5.createElement)(import_react5.Fragment, null, (0, import_react5.createElement)("div", { className: "sq-muted" }, "尝试历史"), (0, import_react5.createElement)("ol", null, own.map((attempt) => (0, import_react5.createElement)("li", { key: attempt.attempt_id }, `${attempt.state}${attempt.error ? `（${attempt.error}）` : ""}`)))) : null,
    (0, import_react5.createElement)(
      "details",
      { className: "sq-tech" },
      (0, import_react5.createElement)("summary", null, "技术细节"),
      (0, import_react5.createElement)("pre", { className: "sq-pre" }, JSON.stringify(task ? { task_id: task.task_id, kind: task.kind, state: task.state, revision: task.revision, origin: task.origin, blockers: task.blockers, attempts: own.map((attempt) => ({ id: attempt.attempt_id, state: attempt.state, segment: attempt.segment_id, error: attempt.error, cleanup: attempt.cleanup_state })) } : { run_id: run.run_id, phase: run.phase, revision: run.revision, recovery_hold: run.recovery_hold, blockers: run.blockers }, null, 2))
    )
  );
}
var memory = /* @__PURE__ */ new Map();
function RunCanvas({ runId }) {
  const snapshot = useStore((state) => state.projection.snapshot);
  const approvals = useStore((state) => state.approvals);
  const bots = useStore((state) => state.bots);
  const focus = useStore((state) => state.focus);
  const tree = (0, import_react5.useMemo)(() => treeOf(snapshot, runId, { approvals, bots }), [snapshot, runId, approvals, bots]);
  const bound = useStore((state) => state.teams);
  const [overrides, setOverrides] = (0, import_react5.useState)(() => memory.get(runId)?.overrides ?? {});
  const [selected, setSelected] = (0, import_react5.useState)(null);
  const [details, setDetails] = (0, import_react5.useState)(false);
  const [view, setView] = (0, import_react5.useState)(() => memory.get(runId)?.view ?? { x: 0, y: 24, scale: 1, moved: false });
  (0, import_react5.useEffect)(() => {
    memory.set(runId, { view, overrides });
  }, [runId, view, overrides]);
  const box = (0, import_react5.useRef)(null);
  const seen = (0, import_react5.useRef)(null);
  const drag = (0, import_react5.useRef)(null);
  const foldedRef = (0, import_react5.useRef)(/* @__PURE__ */ new Set());
  const selectRef = (0, import_react5.useRef)((id) => {
    setSelected(id);
    setDetails(false);
  });
  const toggleRef = (0, import_react5.useRef)((id) => setOverrides((current) => ({ ...current, [id]: !foldedRef.current.has(id) })));
  const auto = (0, import_react5.useMemo)(() => tree ? autoFolded(tree.root) : /* @__PURE__ */ new Set(), [tree]);
  const forcedOpen = (0, import_react5.useMemo)(() => {
    const open3 = /* @__PURE__ */ new Set();
    if (!tree || !focus?.taskId) return open3;
    const target = [...tree.nodes.values()].find((node2) => node2.task?.task_id === focus.taskId && !node2.children.some((child) => child.task?.task_id === focus.taskId));
    const walk = (node2, path) => {
      if (node2 === target) {
        for (const id of path) open3.add(id);
        return true;
      }
      return node2.children.some((child) => walk(child, [...path, node2.id]));
    };
    if (target) walk(tree.root, []);
    return open3;
  }, [tree, focus?.at]);
  const folded = (0, import_react5.useMemo)(() => new Set([...auto, ...Object.entries(overrides).filter(([, value]) => value).map(([id]) => id)].filter((id) => overrides[id] !== false && !forcedOpen.has(id))), [auto, overrides, forcedOpen]);
  const placed = (0, import_react5.useMemo)(() => tree ? layout(tree.root, folded) : null, [tree, folded]);
  const fresh = /* @__PURE__ */ new Set();
  if (placed) {
    if (seen.current === null) seen.current = new Set(placed.nodes.map((item) => item.node.id));
    for (const item of placed.nodes) if (!seen.current.has(item.node.id)) fresh.add(item.node.id);
  }
  (0, import_react5.useEffect)(() => {
    if (placed) for (const item of placed.nodes) seen.current.add(item.node.id);
  });
  (0, import_react5.useEffect)(() => {
    seen.current = null;
    setSelected(null);
    setView((current) => ({ ...current, moved: false }));
  }, [runId]);
  (0, import_react5.useEffect)(() => {
    if (!placed || !box.current || view.moved) return;
    const width = box.current.clientWidth;
    setView((current) => ({ ...current, x: Math.round(width / 2 - (placed.rootX + CARD.width / 2) * current.scale), y: 24 }));
  }, [placed?.width, placed?.rootX, view.moved, view.scale]);
  (0, import_react5.useEffect)(() => {
    if (!placed || !focus || focus.runId !== runId || !box.current) return;
    const item = focus.taskId ? [...placed.nodes].reverse().find((candidate) => candidate.node.task?.task_id === focus.taskId) : placed.nodes[0];
    if (!item) return;
    setSelected(item.node.id);
    setDetails(false);
    const { clientWidth, clientHeight } = box.current;
    setView((current) => ({ ...current, moved: true, x: Math.round(clientWidth / 2 - (item.x + CARD.width / 2) * current.scale), y: Math.round(clientHeight / 2 - (item.y + CARD.height / 2) * current.scale) }));
    const el = box.current.querySelector(`[data-node="${CSS.escape(item.node.id)}"]`);
    el?.setAttribute("data-flash", "");
    const timer2 = setTimeout(() => el?.removeAttribute("data-flash"), 1200);
    return () => clearTimeout(timer2);
  }, [focus?.at, placed !== null]);
  (0, import_react5.useEffect)(() => {
    if (!selected) return void 0;
    const onKey = (event) => {
      if (event.key !== "Escape" || store.get().preview) return;
      event.stopImmediatePropagation();
      close2();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [selected]);
  const close2 = () => {
    const id = selected;
    setSelected(null);
    setTimeout(() => box.current?.querySelector(`[data-node="${CSS.escape(id ?? "")}"]`)?.focus({ preventScroll: true }), 0);
  };
  const onFocus = (0, import_react5.useMemo)(() => (item) => {
    const el = box.current;
    if (!el) return;
    setView((current) => {
      const left = current.x + item.x * current.scale;
      const top = current.y + item.y * current.scale;
      const inside = left >= 0 && top >= 0 && left + CARD.width * current.scale <= el.clientWidth && top + CARD.height * current.scale <= el.clientHeight;
      return inside ? current : { ...current, moved: true, x: Math.round(el.clientWidth / 2 - (item.x + CARD.width / 2) * current.scale), y: Math.round(el.clientHeight / 2 - (item.y + CARD.height / 2) * current.scale) };
    });
  }, []);
  if (!tree || !placed) return (0, import_react5.createElement)("div", { className: "sq-muted" }, "选择左边的一个 Run，或开始一个新的。");
  const node = selected ? tree.nodes.get(selected) : null;
  const selectedItem = node ? placed.nodes.find((item) => item.node.id === node.id) : null;
  const popover = node && hasActions(node) && !details && selectedItem;
  const select = selectRef.current;
  const toggle = toggleRef.current;
  foldedRef.current = folded;
  const onWheel = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setView((current) => ({ ...current, moved: true, scale: Math.min(1.6, Math.max(0.2, current.scale * (event.deltaY < 0 ? 1.1 : 0.9))) }));
  };
  return (0, import_react5.createElement)(
    "div",
    { className: "sq-canvas-wrap" },
    (0, import_react5.createElement)(
      "div",
      { className: "sq-canvas-tools" },
      (0, import_react5.createElement)("button", { className: "sq-btn", onClick: () => setView((current) => ({ ...current, moved: false, scale: 1 })) }, "回到中心"),
      (0, import_react5.createElement)("button", { className: "sq-btn", onClick: () => {
        const width = box.current?.clientWidth ?? 800;
        const height = box.current?.clientHeight ?? 500;
        const scale = Math.max(0.2, Math.min(1, (width - 40) / placed.width, (height - 48) / placed.height));
        setView({ moved: true, scale, x: Math.round((width - placed.width * scale) / 2), y: 24 });
      } }, "适应窗口")
    ),
    (0, import_react5.createElement)(
      "div",
      {
        className: "sq-canvas",
        ref: box,
        onWheel,
        role: "region",
        "aria-label": `任务树：${tree.root.title}，${placed.nodes.length} 个节点。Tab 逐个经过，Enter 打开，Esc 关闭`,
        onMouseDown: (event) => {
          if (event.target === event.currentTarget || event.target.classList?.contains("sq-edges")) drag.current = { x: event.clientX, y: event.clientY, view };
        },
        onMouseMove: (event) => {
          if (drag.current) setView({ ...drag.current.view, moved: true, x: drag.current.view.x + event.clientX - drag.current.x, y: drag.current.view.y + event.clientY - drag.current.y });
        },
        onMouseUp: () => {
          drag.current = null;
        },
        onMouseLeave: () => {
          drag.current = null;
        }
      },
      (0, import_react5.createElement)(
        "div",
        { className: "sq-layer", style: { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` } },
        (0, import_react5.createElement)(Edges, { items: placed.nodes, edges: placed.edges, width: placed.width, height: placed.height }),
        placed.nodes.map((item) => (0, import_react5.createElement)(NodeCard, { key: item.node.id, item, selected: selected === item.node.id, isNew: fresh.has(item.node.id), onSelect: select, onFold: toggle, onFocus, also: item.node.kind === "task" ? alsoIn(item.node.member?.botId, tree.root.run.team_id, bound) : [] })),
        popover ? (0, import_react5.createElement)(NodePopover, { key: `pop-${node.id}`, node, x: selectedItem.x + CARD.width + 14, y: selectedItem.y, onDetails: () => setDetails(true), onClose: close2 }) : null
      )
    ),
    node && !popover ? (0, import_react5.createElement)(Drawer, { node, onClose: close2 }) : null
  );
}

// src/runs.js
var TONE = { completed: "ok", accepted: "ok", running: "warn", needs_review: "bad", failed: "bad", interrupted: "bad", rejected: "bad", cancelled: "bad" };
var chip = (text, tone) => (0, import_react6.createElement)("span", { className: "sq-chip", "data-tone": tone }, text);
async function act2(what, endpoint, payload) {
  try {
    await call(endpoint, payload);
    toast(`${what}：已提交`, "ok");
  } catch (error) {
    toast(`${what}失败：${error.message}`);
  } finally {
    await refreshNow();
  }
}
function RunList({ teamId = null }) {
  const snapshot = useStore((state) => state.projection.snapshot);
  const runId = useStore((state) => state.runId);
  const runs = runsOf(snapshot).filter((run) => teamId === null || run.team_id === teamId);
  return (0, import_react6.createElement)(
    import_react6.Fragment,
    null,
    (0, import_react6.createElement)("button", { className: "sq-btn", "data-kind": "primary", onClick: () => store.set((state) => ({ ...state, startOpen: true })) }, "＋ 开始一个小队任务"),
    runs.length === 0 ? (0, import_react6.createElement)("div", { className: "sq-muted" }, "还没有 Run。") : null,
    runs.map((run) => {
      const tasks = tasksOf(snapshot, run.run_id).filter((task) => task.kind !== "leader_step");
      const done = tasks.filter((task) => task.state === "completed").length;
      return (0, import_react6.createElement)(
        "button",
        { key: run.run_id, className: "sq-item", "data-on": run.run_id === runId || void 0, onClick: () => store.set((state) => ({ ...state, runId: run.run_id })) },
        (0, import_react6.createElement)("div", { className: "sq-row" }, (0, import_react6.createElement)(StatusChip, { state: runStatusOf(run) }), (0, import_react6.createElement)("span", { className: "sq-muted" }, run.team_id)),
        (0, import_react6.createElement)("div", null, run.goal),
        (0, import_react6.createElement)("div", { className: "sq-muted" }, `${done}/${tasks.length} 个任务完成 · ${short(run.run_id)}${waitingOf(run).length ? " · 排队中" : ""}`)
      );
    })
  );
}
function RunDetail({ runId }) {
  const snapshot = useStore((state) => state.projection.snapshot);
  const approvals = useStore((state) => state.approvals);
  const previewBase = useStore((state) => state.previewBase);
  const focus = useStore((state) => state.focus);
  const [guide, setGuide] = (0, import_react6.useState)("");
  const [listView, setListView] = (0, import_react6.useState)(false);
  (0, import_react6.useEffect)(() => {
    if (!focus?.taskId || focus.runId !== runId) return;
    document.getElementById(`sq-task-${focus.taskId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus?.at, runId]);
  const run = runsOf(snapshot).find((candidate) => candidate.run_id === runId);
  if (run === void 0) return (0, import_react6.createElement)("div", { className: "sq-muted" }, "选择左边的一个 Run，或开始一个新的。");
  const tasks = tasksOf(snapshot, runId);
  const artifacts = artifactsOf(tasks);
  return (0, import_react6.createElement)(
    import_react6.Fragment,
    null,
    (0, import_react6.createElement)(
      "div",
      { className: "sq-card" },
      (0, import_react6.createElement)("div", { className: "sq-row" }, (0, import_react6.createElement)(StatusChip, { state: runStatusOf(run) }), (0, import_react6.createElement)("strong", null, run.goal)),
      (0, import_react6.createElement)("div", { className: "sq-muted" }, `小队 ${run.team_id} · ${short(run.run_id)} · 第 ${run.revision} 版${(run.guidance ?? []).length ? ` · 已有 ${run.guidance.length} 条补充说明` : ""}`),
      waitingOf(run).length > 0 ? (0, import_react6.createElement)("div", null, chip("排队中", "warn"), waitingOf(run).join("；"), "，对方结束后自动开始。") : null,
      terminal(run.phase) ? null : (0, import_react6.createElement)(
        "div",
        { className: "sq-row" },
        (0, import_react6.createElement)("input", { className: "sq-input", style: { flex: 1 }, placeholder: "给 Leader 补充说明（例如：例子用披萨）", value: guide, onChange: (event) => setGuide(event.target.value) }),
        (0, import_react6.createElement)("button", { className: "sq-btn", disabled: guide.trim() === "", onClick: () => {
          void act2("补充说明", "operate", { kind: "run", id: run.run_id, op: "guidance", body: { request_id: requestId("guide"), expected_revision: run.revision, note: guide.trim() } });
          setGuide("");
        } }, "发送"),
        (0, import_react6.createElement)("button", { className: "sq-btn", "data-kind": "danger", onClick: () => act2("取消 Run", "operate", { kind: "run", id: run.run_id, op: "cancel", body: { request_id: requestId("cancel"), expected_revision: run.revision, note: "在 Squad 页面取消" } }) }, "取消 Run")
      )
    ),
    (0, import_react6.createElement)(
      "div",
      { className: "sq-section" },
      (0, import_react6.createElement)("div", { className: "sq-row" }, (0, import_react6.createElement)("h2", { style: { margin: 0, flex: 1 } }, listView ? "任务列表" : "任务树"), (0, import_react6.createElement)("button", { className: "sq-btn", onClick: () => setListView((value) => !value) }, listView ? "树视图" : "列表视图")),
      listView ? null : (0, import_react6.createElement)(RunCanvas, { key: runId, runId })
    ),
    artifacts.length === 0 ? null : (0, import_react6.createElement)(
      "div",
      { className: "sq-section" },
      (0, import_react6.createElement)("h2", null, "成果文件"),
      (0, import_react6.createElement)("table", { className: "sq-table" }, (0, import_react6.createElement)("tbody", null, artifacts.map((art) => (0, import_react6.createElement)(
        "tr",
        { key: `${art.taskId}:${art.sha256}` },
        (0, import_react6.createElement)("td", null, art.name ?? art.path),
        (0, import_react6.createElement)("td", null, chip(art.superseded ? "已被返工取代" : art.accepted ? "已通过" : "待审核", art.superseded ? "bad" : art.accepted ? "ok" : "warn")),
        (0, import_react6.createElement)("td", { className: "sq-muted" }, `${short(art.taskId)} · ${art.sha256.slice(0, 10)}`),
        (0, import_react6.createElement)("td", null, previewBase && art.media_type === "text/html" ? (0, import_react6.createElement)("button", { className: "sq-btn", onClick: () => store.set((state) => ({ ...state, preview: { url: `${previewBase}/v2/artifacts/sha256/${art.sha256}`, name: art.name } })) }, "预览") : null)
      ))))
    ),
    !listView ? null : (0, import_react6.createElement)(
      "div",
      { className: "sq-section" },
      (0, import_react6.createElement)("div", { className: "sq-muted" }, `Leader 已做 ${tasks.filter((task) => task.kind === "leader_step").length} 次决定（不在表中）`),
      (0, import_react6.createElement)(
        "table",
        { className: "sq-table" },
        (0, import_react6.createElement)("thead", null, (0, import_react6.createElement)("tr", null, ["类型", "角色", "状态", "验收", "目标"].map((label) => (0, import_react6.createElement)("th", { key: label }, label)))),
        (0, import_react6.createElement)("tbody", null, tasks.filter((task) => task.kind !== "leader_step").map((task) => (0, import_react6.createElement)(
          "tr",
          { key: task.task_id, id: `sq-task-${task.task_id}`, "data-focus": focus?.taskId === task.task_id || void 0 },
          (0, import_react6.createElement)("td", null, KIND[task.kind] ?? task.kind),
          (0, import_react6.createElement)("td", null, task.role_id || "—"),
          (0, import_react6.createElement)("td", null, (() => {
            const state = statusOf(task, { attempts: snapshot.views.attempts ?? [], approvals, tasks });
            return (0, import_react6.createElement)("span", null, (0, import_react6.createElement)(StatusChip, { state }), state.note ? (0, import_react6.createElement)("span", { className: "sq-muted" }, ` ${state.note}`) : null, state.reason ? (0, import_react6.createElement)("div", { className: "sq-muted" }, state.reason) : null);
          })()),
          (0, import_react6.createElement)("td", null, task.acceptance ? chip(task.acceptance.decision === "accepted" ? "通过" : "退回", TONE[task.acceptance.decision]) : "—"),
          (0, import_react6.createElement)("td", null, goalOf(task, tasks))
        )))
      )
    )
  );
}

// src/config.js
var import_react7 = require("react");

// src/config-model.js
var ID = /^[a-z][a-z0-9-]*$/;
var validId = (id) => ID.test(id);
function parseRole(content = "") {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const head = match?.[1] ?? "";
  const field = (name) => {
    const raw = head.match(new RegExp(`^${name}:\\s*(.*)$`, "m"))?.[1]?.trim() ?? "";
    if (!raw.startsWith('"')) return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };
  return { name: field("name"), description: field("description"), body: (match?.[2] ?? "").trim() };
}
var yamlText = (text) => /^[\w一-鿿][^:#\n]*$/u.test(text) ? text : JSON.stringify(text);
var roleDoc = ({ name, description, body }) => `---
name: ${name}
description: ${yamlText(description.trim())}
---
${body.trim()}
`;
var DEFAULT_POLICY = {
  run_admission: "fifo_single_active",
  max_parallel_tasks: 2,
  max_delegate_depth: 2,
  max_total_tasks: 20,
  max_attempts_per_task: 3,
  allowed_tools: ["read", "grep", "find", "ls"],
  writable_roots: []
};
function parseTeam(content, instructions = "") {
  const team = JSON.parse(content);
  const acceptance = team.policy?.acceptance_policy ?? {};
  return {
    id: team.team_id,
    leader: team.leader?.agent_ref ?? "chief",
    members: team.members ?? [],
    acceptance: acceptance.mode ?? "review",
    reviewer: acceptance.reviewer_ref ?? "",
    defaultWorkflow: team.default_workflow ?? "",
    parallel: team.policy?.max_parallel_tasks ?? 2,
    instructions,
    raw: team
  };
}
function teamDoc(form) {
  const base = form.raw ?? {};
  const policy = { ...DEFAULT_POLICY, ...base.policy ?? {}, max_parallel_tasks: Number(form.parallel) || 1 };
  policy.acceptance_policy = form.acceptance === "review" ? { mode: "review", reviewer_ref: form.reviewer, child_policy: base.policy?.acceptance_policy?.child_policy ?? "separate" } : { mode: form.acceptance, child_policy: base.policy?.acceptance_policy?.child_policy ?? "separate" };
  const team = {
    schema_version: 1,
    team_id: form.id,
    config_version: (base.config_version ?? 0) + 1,
    leader: { agent_ref: form.leader },
    members: form.members.map((member) => ({ role_ref: member.role_ref, responsibility: member.responsibility || member.role_ref })),
    instructions_file: "instructions.md",
    ...form.defaultWorkflow ? { default_workflow: form.defaultWorkflow } : {},
    policy
  };
  return `${JSON.stringify(team, null, 2)}
`;
}
function parseWorkflow(content) {
  const workflow = JSON.parse(content);
  return { id: workflow.workflow_id, steps: workflow.steps.map((step2) => ({ ...step2, depends_on: step2.depends_on ?? [] })) };
}
function workflowDoc({ id, steps }) {
  const clean = steps.map((step2) => ({
    id: step2.id,
    role_ref: step2.role_ref,
    kind: step2.kind || "execute",
    goal: step2.goal,
    depends_on: (step2.depends_on ?? []).filter((dep) => dep.step).map((dep) => ({ step: dep.step, condition: dep.condition || "acceptance_accepted" })),
    // Each dependency's result is also handed to the step as an input.
    refs: (step2.depends_on ?? []).filter((dep) => dep.step).map((dep) => ({ task_id: dep.step, result_revision: 0, hash: "", length: 0 }))
  }));
  return `${JSON.stringify({ schema_version: 1, workflow_id: id, steps: clean }, null, 2)}
`;
}
function editsFor(files, wanted) {
  const hashOf = new Map(files.map((file) => [file.path, file.hash]));
  const contentOf = new Map(files.map((file) => [file.path, file.content]));
  return Object.entries(wanted).filter(([path, content]) => contentOf.get(path) !== content).map(([path, content]) => ({ path, content, expected_hash: hashOf.get(path) ?? "" }));
}
function configOf(files) {
  const roles = {};
  const teams = {};
  const content = (path) => files.find((file) => file.path === path)?.content;
  for (const file of files) {
    let match = file.path.match(/^roles\/([^/]+)\/role\.md$/);
    if (match) roles[match[1]] = { ...parseRole(file.content), rules: content(`roles/${match[1]}/agents.md`) ?? "" };
    match = file.path.match(/^teams\/([^/]+)\/team\.json$/);
    if (match) {
      try {
        teams[match[1]] = { ...parseTeam(file.content, content(`teams/${match[1]}/instructions.md`) ?? ""), workflows: {} };
      } catch {
        teams[match[1]] = { id: match[1], broken: true, workflows: {} };
      }
    }
  }
  for (const file of files) {
    const match = file.path.match(/^teams\/([^/]+)\/workflows\/([^/]+)\.json$/);
    if (match && teams[match[1]]) {
      try {
        teams[match[1]].workflows[match[2]] = parseWorkflow(file.content);
      } catch {
      }
    }
  }
  return { roles, teams };
}

// src/config.js
var ACCEPTANCE = { review: "独立审核（指定审核角色）", human: "人工验收（你在 Squad 页面确认每个结果）", on_completion: "完成即通过（不审核，仅用于对照实验）" };
var CONDITION = { acceptance_accepted: "上一步通过审核后", execution_completed: "上一步做完就开始" };
var KINDS = { execute: "执行", review: "审核", ask: "提问" };
function useConfig() {
  const [state, setState] = (0, import_react7.useState)({ files: null, error: null });
  const load = async () => {
    try {
      const out = await call("config");
      setState({ files: out.files, error: null });
    } catch (error) {
      setState({ files: null, error: error.message });
    }
  };
  (0, import_react7.useEffect)(() => {
    void load();
  }, []);
  return [state, load];
}
async function save(files, wanted, validateOnly, reload) {
  const edits = editsFor(files, wanted);
  if (edits.length === 0) return toast("没有改动", "ok");
  try {
    const out = await call("config-save", { edits, validateOnly });
    toast(validateOnly ? "检查通过，可以保存" : `已保存（${out.teams.length} 个小队，${out.roles.length} 个角色）`, "ok");
    if (!validateOnly) await reload();
  } catch (error) {
    toast(`没有保存：${error.message.replace(/^CONFIG_REJECTED:\s*/, "")}`);
  }
  await refreshNow();
}
function Field({ label, children, hint }) {
  return (0, import_react7.createElement)("label", { style: { display: "flex", flexDirection: "column", gap: 4 } }, (0, import_react7.createElement)("span", null, label), children, hint ? (0, import_react7.createElement)("span", { className: "sq-muted" }, hint) : null);
}
function RoleEditor({ id, role, files, reload, fresh }) {
  const [form, setForm] = (0, import_react7.useState)({ name: id ?? "", description: role?.description ?? "", body: role?.body ?? "", rules: role?.rules ?? "" });
  (0, import_react7.useEffect)(() => setForm({ name: id ?? "", description: role?.description ?? "", body: role?.body ?? "", rules: role?.rules ?? "" }), [id, role?.body]);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const ok = validId(form.name) && form.description.trim() !== "" && form.body.trim() !== "";
  const wanted = () => ({ [`roles/${form.name}/role.md`]: roleDoc(form), [`roles/${form.name}/agents.md`]: `${form.rules.trim() || "提交结果必须用 squad_submit_result。"}
` });
  return (0, import_react7.createElement)(
    "div",
    { className: "sq-card" },
    (0, import_react7.createElement)("h3", null, fresh ? "新建角色" : `角色 ${id}`),
    (0, import_react7.createElement)(Field, { label: "角色 ID", hint: "小写英文字母开头，可用数字和 -，例如 checker" }, (0, import_react7.createElement)("input", { className: "sq-input", value: form.name, disabled: !fresh, onChange: set("name") })),
    (0, import_react7.createElement)(Field, { label: "一句话说明" }, (0, import_react7.createElement)("input", { className: "sq-input", value: form.description, onChange: set("description") })),
    (0, import_react7.createElement)(Field, { label: "角色说明（这个角色是谁、怎么做事）" }, (0, import_react7.createElement)("textarea", { className: "sq-text", style: { minHeight: 120 }, value: form.body, onChange: set("body") })),
    (0, import_react7.createElement)(Field, { label: "工作规则" }, (0, import_react7.createElement)("textarea", { className: "sq-text", value: form.rules, onChange: set("rules") })),
    (0, import_react7.createElement)(
      "div",
      { className: "sq-row" },
      (0, import_react7.createElement)("button", { className: "sq-btn", disabled: !ok, onClick: () => save(files, wanted(), true, reload) }, "检查"),
      (0, import_react7.createElement)("button", { className: "sq-btn", "data-kind": "primary", disabled: !ok, onClick: () => save(files, wanted(), false, reload) }, "保存")
    )
  );
}
function TeamEditor({ id, team, roles, files, reload, fresh }) {
  const blank = { id: "", leader: "chief", members: [], acceptance: "review", reviewer: "", defaultWorkflow: "", parallel: 2, instructions: "" };
  const [form, setForm] = (0, import_react7.useState)(team ?? blank);
  (0, import_react7.useEffect)(() => setForm(team ?? blank), [id, team?.raw?.config_version]);
  const roleIds = Object.keys(roles);
  const member = (roleId) => form.members.find((entry) => entry.role_ref === roleId);
  const toggle = (roleId) => setForm((current) => ({ ...current, members: member(roleId) ? current.members.filter((entry) => entry.role_ref !== roleId) : [...current.members, { role_ref: roleId, responsibility: roles[roleId]?.description ?? roleId }] }));
  const ok = validId(form.id) && form.members.length > 0 && (form.acceptance !== "review" || member(form.reviewer));
  const wanted = () => ({ [`teams/${form.id}/team.json`]: teamDoc(form), [`teams/${form.id}/instructions.md`]: `${form.instructions.trim() || "按流程完成任务。"}
` });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return (0, import_react7.createElement)(
    "div",
    { className: "sq-card" },
    (0, import_react7.createElement)("h3", null, fresh ? "新建小队" : `小队 ${id}`),
    (0, import_react7.createElement)(Field, { label: "小队 ID", hint: "小写英文，例如 math" }, (0, import_react7.createElement)("input", { className: "sq-input", value: form.id, disabled: !fresh, onChange: set("id") })),
    (0, import_react7.createElement)(Field, { label: "Leader（负责安排和收尾的 Bot）", hint: "chief 对应 Bot「Chief」" }, (0, import_react7.createElement)("input", { className: "sq-input", value: form.leader, onChange: set("leader") })),
    (0, import_react7.createElement)(
      "div",
      null,
      (0, import_react7.createElement)("div", null, "成员角色"),
      roleIds.length === 0 ? (0, import_react7.createElement)("div", { className: "sq-muted" }, "先新建角色") : roleIds.map((roleId) => (0, import_react7.createElement)(
        "div",
        { key: roleId, className: "sq-row" },
        (0, import_react7.createElement)("label", { className: "sq-row" }, (0, import_react7.createElement)("input", { type: "checkbox", checked: Boolean(member(roleId)), onChange: () => toggle(roleId) }), roleId),
        member(roleId) ? (0, import_react7.createElement)("input", { className: "sq-input", style: { flex: 1 }, value: member(roleId).responsibility, placeholder: "在小队里负责什么", onChange: (event) => setForm((current) => ({ ...current, members: current.members.map((entry) => entry.role_ref === roleId ? { ...entry, responsibility: event.target.value } : entry) })) }) : null
      ))
    ),
    (0, import_react7.createElement)(Field, { label: "成果怎么验收" }, (0, import_react7.createElement)("select", { className: "sq-select", value: form.acceptance, onChange: set("acceptance") }, Object.entries(ACCEPTANCE).map(([value, label]) => (0, import_react7.createElement)("option", { key: value, value }, label)))),
    form.acceptance === "review" ? (0, import_react7.createElement)(Field, { label: "审核角色（必须是成员，且不能审自己）" }, (0, import_react7.createElement)("select", { className: "sq-select", value: form.reviewer, onChange: set("reviewer") }, (0, import_react7.createElement)("option", { value: "" }, "选择"), form.members.map((entry) => (0, import_react7.createElement)("option", { key: entry.role_ref, value: entry.role_ref }, entry.role_ref)))) : null,
    (0, import_react7.createElement)(Field, { label: "默认流程" }, (0, import_react7.createElement)("select", { className: "sq-select", value: form.defaultWorkflow, onChange: set("defaultWorkflow") }, (0, import_react7.createElement)("option", { value: "" }, "不用流程，由 Leader 安排"), Object.keys(team?.workflows ?? {}).map((workflowId) => (0, import_react7.createElement)("option", { key: workflowId, value: workflowId }, workflowId)))),
    (0, import_react7.createElement)(Field, { label: "同时进行的任务数" }, (0, import_react7.createElement)("input", { className: "sq-input", type: "number", min: 1, max: 8, value: form.parallel, onChange: set("parallel") })),
    (0, import_react7.createElement)(Field, { label: "小队说明（所有成员都会看到）" }, (0, import_react7.createElement)("textarea", { className: "sq-text", value: form.instructions, onChange: set("instructions") })),
    (0, import_react7.createElement)(
      "div",
      { className: "sq-row" },
      (0, import_react7.createElement)("button", { className: "sq-btn", disabled: !ok, onClick: () => save(files, wanted(), true, reload) }, "检查"),
      (0, import_react7.createElement)("button", { className: "sq-btn", "data-kind": "primary", disabled: !ok, onClick: () => save(files, wanted(), false, reload) }, "保存"),
      fresh ? null : (0, import_react7.createElement)("button", { className: "sq-btn", onClick: async () => {
        try {
          await call("bind-team", { teamId: form.id });
          toast("已绑定到群", "ok");
        } catch (error) {
          toast(`绑定失败：${error.message}`);
        }
        await refreshNow();
      } }, "建群并绑定")
    )
  );
}
function WorkflowEditor({ teamId, team, workflowId, files, reload, fresh }) {
  const start = workflowId && team?.workflows?.[workflowId] ? team.workflows[workflowId] : { id: "", steps: [] };
  const [form, setForm] = (0, import_react7.useState)(start);
  (0, import_react7.useEffect)(() => setForm(start), [teamId, workflowId]);
  const roles = (team?.members ?? []).map((entry) => entry.role_ref);
  const setStep = (index, patch) => setForm((current) => ({ ...current, steps: current.steps.map((step2, i) => i === index ? { ...step2, ...patch } : step2) }));
  const ok = validId(form.id) && form.steps.length > 0 && form.steps.every((step2) => validId(step2.id) && step2.role_ref && step2.goal?.trim());
  const wanted = () => ({ [`teams/${teamId}/workflows/${form.id}.json`]: workflowDoc(form) });
  return (0, import_react7.createElement)(
    "div",
    { className: "sq-card" },
    (0, import_react7.createElement)("h3", null, fresh ? `给小队 ${teamId} 新建流程` : `流程 ${teamId} / ${workflowId}`),
    (0, import_react7.createElement)(Field, { label: "流程 ID" }, (0, import_react7.createElement)("input", { className: "sq-input", value: form.id, disabled: !fresh, onChange: (event) => setForm((current) => ({ ...current, id: event.target.value })) })),
    (0, import_react7.createElement)(
      "table",
      { className: "sq-table" },
      (0, import_react7.createElement)("thead", null, (0, import_react7.createElement)("tr", null, ["步骤 ID", "角色", "类型", "目标", "在哪一步之后", ""].map((label) => (0, import_react7.createElement)("th", { key: label }, label)))),
      (0, import_react7.createElement)("tbody", null, form.steps.map((step2, index) => (0, import_react7.createElement)(
        "tr",
        { key: index },
        (0, import_react7.createElement)("td", null, (0, import_react7.createElement)("input", { className: "sq-input", value: step2.id, onChange: (event) => setStep(index, { id: event.target.value }) })),
        (0, import_react7.createElement)("td", null, (0, import_react7.createElement)("select", { className: "sq-select", value: step2.role_ref, onChange: (event) => setStep(index, { role_ref: event.target.value }) }, (0, import_react7.createElement)("option", { value: "" }, "选择"), roles.map((role) => (0, import_react7.createElement)("option", { key: role, value: role }, role)))),
        (0, import_react7.createElement)("td", null, (0, import_react7.createElement)("select", { className: "sq-select", value: step2.kind || "execute", onChange: (event) => setStep(index, { kind: event.target.value }) }, Object.entries(KINDS).map(([value, label]) => (0, import_react7.createElement)("option", { key: value, value }, label)))),
        (0, import_react7.createElement)("td", null, (0, import_react7.createElement)("textarea", { className: "sq-text", style: { minHeight: 40 }, value: step2.goal ?? "", onChange: (event) => setStep(index, { goal: event.target.value }) })),
        (0, import_react7.createElement)(
          "td",
          null,
          (0, import_react7.createElement)(
            "select",
            { className: "sq-select", value: step2.depends_on?.[0]?.step ?? "", onChange: (event) => setStep(index, { depends_on: event.target.value ? [{ step: event.target.value, condition: step2.depends_on?.[0]?.condition || "acceptance_accepted" }] : [] }) },
            (0, import_react7.createElement)("option", { value: "" }, "一开始就做"),
            form.steps.filter((_, i) => i !== index).map((other) => (0, import_react7.createElement)("option", { key: other.id, value: other.id }, other.id))
          ),
          step2.depends_on?.[0] ? (0, import_react7.createElement)("select", { className: "sq-select", value: step2.depends_on[0].condition, onChange: (event) => setStep(index, { depends_on: [{ ...step2.depends_on[0], condition: event.target.value }] }) }, Object.entries(CONDITION).map(([value, label]) => (0, import_react7.createElement)("option", { key: value, value }, label))) : null
        ),
        (0, import_react7.createElement)("td", null, (0, import_react7.createElement)("button", { className: "sq-btn", "data-kind": "danger", onClick: () => setForm((current) => ({ ...current, steps: current.steps.filter((_, i) => i !== index) })) }, "删除"))
      )))
    ),
    (0, import_react7.createElement)(
      "div",
      { className: "sq-row" },
      (0, import_react7.createElement)("button", { className: "sq-btn", onClick: () => setForm((current) => ({ ...current, steps: [...current.steps, { id: `step-${current.steps.length + 1}`, role_ref: roles[0] ?? "", kind: "execute", goal: "", depends_on: current.steps.length > 0 ? [{ step: current.steps.at(-1).id, condition: "acceptance_accepted" }] : [] }] })) }, "加一步"),
      (0, import_react7.createElement)("button", { className: "sq-btn", disabled: !ok, onClick: () => save(files, wanted(), true, reload) }, "检查"),
      (0, import_react7.createElement)("button", { className: "sq-btn", "data-kind": "primary", disabled: !ok, onClick: () => save(files, wanted(), false, reload) }, "保存")
    )
  );
}
function ConfigTab() {
  const [{ files, error }, reload] = useConfig();
  const bound = useStore((state) => state.teams);
  const [selected, setSelected] = (0, import_react7.useState)(() => store.get().configFocus ? { key: store.get().configFocus } : null);
  (0, import_react7.useEffect)(() => {
    if (store.get().configFocus) store.set((state) => ({ ...state, configFocus: null }));
  }, []);
  if (error) return (0, import_react7.createElement)("div", { className: "sq-main" }, (0, import_react7.createElement)("div", { className: "sq-card" }, `读不到配置：${error}`));
  if (files === null) return (0, import_react7.createElement)("div", { className: "sq-main" }, (0, import_react7.createElement)("div", { className: "sq-muted" }, "读取中…"));
  const { roles, teams } = configOf(files);
  const item = (key2, title, sub) => (0, import_react7.createElement)("button", { key: key2, className: "sq-item", "data-on": selected?.key === key2 || void 0, onClick: () => setSelected({ key: key2 }) }, (0, import_react7.createElement)("div", null, title), sub ? (0, import_react7.createElement)("div", { className: "sq-muted" }, sub) : null);
  const key = selected?.key ?? "";
  let editor = (0, import_react7.createElement)("div", { className: "sq-muted" }, "选择左边的小队、流程或角色，或新建一个。小队由角色组成，流程规定先做什么、后做什么。");
  const [kind, a, b] = key.split(":");
  if (kind === "team") editor = (0, import_react7.createElement)(TeamEditor, { id: a, team: teams[a], roles, files, reload });
  if (kind === "new-team") editor = (0, import_react7.createElement)(TeamEditor, { roles, files, reload, fresh: true });
  if (kind === "role") editor = (0, import_react7.createElement)(RoleEditor, { id: a, role: roles[a], files, reload });
  if (kind === "new-role") editor = (0, import_react7.createElement)(RoleEditor, { files, reload, fresh: true });
  if (kind === "flow") editor = (0, import_react7.createElement)(WorkflowEditor, { teamId: a, team: teams[a], workflowId: b, files, reload });
  if (kind === "new-flow") editor = (0, import_react7.createElement)(WorkflowEditor, { teamId: a, team: teams[a], files, reload, fresh: true });
  return (0, import_react7.createElement)(
    import_react7.Fragment,
    null,
    (0, import_react7.createElement)(
      "div",
      { className: "sq-side" },
      (0, import_react7.createElement)("div", { className: "sq-muted" }, "小队"),
      Object.values(teams).map((team) => (0, import_react7.createElement)(
        import_react7.Fragment,
        { key: team.id },
        item(`team:${team.id}`, team.id, `${team.members?.length ?? 0} 个角色 · ${bound[team.id] ? "已绑定到群" : "未绑定"}`),
        Object.keys(team.workflows ?? {}).map((workflowId) => item(`flow:${team.id}:${workflowId}`, `　流程 ${workflowId}`, `${team.workflows[workflowId].steps.length} 步`)),
        item(`new-flow:${team.id}`, "　＋ 新建流程")
      )),
      item("new-team", "＋ 新建小队"),
      (0, import_react7.createElement)("div", { className: "sq-muted" }, "角色"),
      Object.entries(roles).map(([roleId, role]) => item(`role:${roleId}`, roleId, role.description)),
      item("new-role", "＋ 新建角色")
    ),
    (0, import_react7.createElement)("div", { className: "sq-main" }, editor)
  );
}

// src/reports.js
var import_react8 = require("react");
var GROUP = {
  S: "单个强 Agent",
  A: "DS Bot 自由协作",
  B: "Squad 任务 DAG（不审核）",
  C: "Squad DAG + 独立审核",
  D: "C + 高级资源调度"
};
var fmt = (value, digits = 0) => value === null || value === void 0 || Number.isNaN(value) ? "—" : Number(value).toLocaleString("zh-CN", { maximumFractionDigits: digits });
function Bars({ groups, pick, unit }) {
  const values = groups.map((group) => pick(group.summary) ?? 0);
  const max = Math.max(1, ...values);
  return (0, import_react8.createElement)("div", { style: { display: "flex", flexDirection: "column", gap: 4 } }, groups.map((group, index) => (0, import_react8.createElement)(
    "div",
    { key: group.id, className: "sq-row", style: { flexWrap: "nowrap" } },
    (0, import_react8.createElement)("span", { style: { width: 28 } }, group.id),
    (0, import_react8.createElement)("div", { style: { flex: 1 } }, (0, import_react8.createElement)("div", { className: "sq-bar", style: { width: `${values[index] / max * 100}%` } })),
    (0, import_react8.createElement)("span", { className: "sq-muted", style: { width: 110, textAlign: "right" } }, `${fmt(values[index], 1)} ${unit}`)
  )));
}
function Report({ report }) {
  const groups = report.groups ?? [];
  return (0, import_react8.createElement)(
    "div",
    { className: "sq-card" },
    (0, import_react8.createElement)("h3", null, report.title ?? report.id),
    (0, import_react8.createElement)("div", { className: "sq-muted" }, `${report.created} · 模型 ${report.model?.model ?? "?"}${report.model?.effort ? `（${report.model.effort}）` : ""} · 每组 ${report.repeats ?? "?"} 次`),
    report.mock ? (0, import_react8.createElement)("div", { className: "sq-banner", style: { borderRadius: 8 } }, "这份报告用的是脚本化的 mock 模型，只验证实验流程能跑通，数字不代表真实效果。") : null,
    (0, import_react8.createElement)("div", null, `任务：${report.task?.goal ?? ""}`),
    (0, import_react8.createElement)(
      "table",
      { className: "sq-table" },
      (0, import_react8.createElement)("thead", null, (0, import_react8.createElement)("tr", null, ["组", "做法", "成功", "平均耗时", "平均模型调用", "平均 Token", "审核", "返工", "人工介入"].map((label) => (0, import_react8.createElement)("th", { key: label }, label)))),
      (0, import_react8.createElement)("tbody", null, groups.map((group) => (0, import_react8.createElement)(
        "tr",
        { key: group.id },
        (0, import_react8.createElement)("td", null, group.id),
        (0, import_react8.createElement)("td", null, GROUP[group.id] ?? group.label),
        (0, import_react8.createElement)("td", null, `${group.summary?.succeeded ?? 0}/${group.runs?.length ?? 0}`),
        (0, import_react8.createElement)("td", null, `${fmt(group.summary?.mean_seconds, 1)} 秒`),
        (0, import_react8.createElement)("td", null, fmt(group.summary?.mean_model_calls, 1)),
        (0, import_react8.createElement)("td", null, fmt(group.summary?.mean_tokens)),
        (0, import_react8.createElement)("td", null, fmt(group.summary?.reviews)),
        (0, import_react8.createElement)("td", null, fmt(group.summary?.reworks)),
        (0, import_react8.createElement)("td", null, fmt(group.summary?.human_actions))
      )))
    ),
    (0, import_react8.createElement)(
      "div",
      { className: "sq-grid" },
      (0, import_react8.createElement)("div", null, (0, import_react8.createElement)("div", { className: "sq-muted" }, "平均 Token（含辅助调用）"), (0, import_react8.createElement)(Bars, { groups, pick: (s) => s?.mean_tokens, unit: "" })),
      (0, import_react8.createElement)("div", null, (0, import_react8.createElement)("div", { className: "sq-muted" }, "平均耗时"), (0, import_react8.createElement)(Bars, { groups, pick: (s) => s?.mean_seconds, unit: "秒" }))
    ),
    (report.notes ?? []).length > 0 ? (0, import_react8.createElement)("ul", { className: "sq-muted" }, report.notes.map((note, index) => (0, import_react8.createElement)("li", { key: index }, note))) : null
  );
}
function ReportsTab() {
  const [reports, setReports] = (0, import_react8.useState)(null);
  const [error, setError] = (0, import_react8.useState)(null);
  (0, import_react8.useEffect)(() => {
    call("reports").then(setReports, (failure) => setError(failure.message));
  }, []);
  return (0, import_react8.createElement)(
    "div",
    { className: "sq-main" },
    error ? (0, import_react8.createElement)("div", { className: "sq-card" }, `读不到报告：${error}`) : null,
    reports === null && !error ? (0, import_react8.createElement)("div", { className: "sq-muted" }, "读取中…") : null,
    reports?.length === 0 ? (0, import_react8.createElement)("div", { className: "sq-card" }, (0, import_react8.createElement)(import_react8.Fragment, null, "还没有实验报告。用 ", (0, import_react8.createElement)("code", null, "node dsh_squad/experiments/run.mjs"), " 跑一次对照实验后会出现在这里。")) : null,
    (reports ?? []).map((report) => (0, import_react8.createElement)(Report, { key: report.id, report }))
  );
}

// src/shell.js
var TABS = { runs: "运行", config: "小队与规则", reports: "实验报告" };
var open = (patch) => store.set((state) => ({ ...state, open: true, ...patch }));
var close = () => store.set((state) => ({ ...state, open: false, preview: null }));
function SquadButton({ wide }) {
  const waiting = useStore((state) => (state.approvals ?? []).length);
  return (0, import_react9.createElement)(
    "button",
    { className: "sq-foot", title: "Squad 小队", onClick: () => open({}) },
    (0, import_react9.createElement)(
      "svg",
      { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true },
      (0, import_react9.createElement)("circle", { cx: 8, cy: 9, r: 3 }),
      (0, import_react9.createElement)("circle", { cx: 16, cy: 9, r: 3 }),
      (0, import_react9.createElement)("path", { d: "M3 19c0-3 2.5-5 5-5s5 2 5 5M11 19c0-3 2.5-5 5-5s5 2 5 5" })
    ),
    wide === false ? null : (0, import_react9.createElement)("span", null, waiting > 0 ? `小队（${waiting} 待批准）` : "小队")
  );
}
function Banner() {
  const connected = useStore((state) => state.connected);
  const stale = useStore((state) => state.projection.stale && state.projection.snapshot !== null);
  const error = useStore((state) => state.projection.error);
  const failures = useStore((state) => state.errors ?? []);
  if (failures.length > 0) {
    const why = { CONFIG_VERSION_CONFLICT: "小队配置改过但版本号没变，请在「小队与规则」里保存一次（会自动升版本）", ROLE_SNAPSHOT_MISMATCH: "角色说明改过，正在重新登记" };
    return (0, import_react9.createElement)("div", { className: "sq-banner" }, `有 ${failures.length} 个成员没能接上 Controller：${failures.slice(0, 3).map((failure) => `${failure.agentId}（${why[failure.code] ?? failure.message}）`).join("；")}`);
  }
  if (connected === false) return (0, import_react9.createElement)("div", { className: "sq-banner" }, "还没连上 Squad Controller：请用 dsh_squad/deploy/dsh-squad up 启动这个项目。");
  if (stale) return (0, import_react9.createElement)("div", { className: "sq-banner" }, `连接中断，正在重新读取最新状态…${error ? `（${error}）` : ""}`);
  return null;
}
function Console() {
  const tab = useStore((state) => state.tab);
  const runId = useStore((state) => state.runId);
  const { overview, scope } = useScope();
  (0, import_react9.useEffect)(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (store.get().preview) store.set((state) => ({ ...state, preview: null }));
      else if (store.get().startOpen) store.set((state) => ({ ...state, startOpen: false }));
      else close();
    };
    window.addEventListener("keydown", onKey);
    const onTab = (event) => {
      if (event.key !== "Tab") return;
      const layers = document.querySelectorAll("[data-squad=overlay] .sq-root");
      const top = layers[layers.length - 1];
      if (!top) return;
      const all = [...top.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.getClientRects().length > 0);
      if (all.length === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const at = all.indexOf(document.activeElement);
      const next = at === -1 ? event.shiftKey ? all.length - 1 : 0 : (at + (event.shiftKey ? -1 : 1) + all.length) % all.length;
      all[next].focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onTab, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onTab, true);
    };
  }, []);
  const loading = useStore((state) => state.projection.snapshot === null && state.connected !== false);
  const failed = useStore((state) => state.projection.error);
  const body = loading && tab === "runs" ? (0, import_react9.createElement)("div", { className: "sq-main sq-empty", role: "status" }, failed ? `还读不到小队状态（${failed}），正在重试…` : "正在读取小队状态…") : tab === "config" ? (0, import_react9.createElement)(ConfigTab) : tab === "reports" ? (0, import_react9.createElement)(ReportsTab) : overview ? (0, import_react9.createElement)(Overview) : [(0, import_react9.createElement)("div", { key: "side", className: "sq-side" }, (0, import_react9.createElement)(RunList, { teamId: scope })), (0, import_react9.createElement)("div", { key: "main", className: "sq-main" }, (0, import_react9.createElement)(RunDetail, { runId }))];
  return (0, import_react9.createElement)(
    "div",
    { className: "sq-root", role: "dialog", "aria-modal": true, "aria-label": "Squad 小队", onMouseDown: (event) => {
      if (event.target === event.currentTarget) close();
    } },
    (0, import_react9.createElement)(
      "div",
      { className: "sq-shell" },
      (0, import_react9.createElement)(
        "div",
        { className: "sq-head" },
        (0, import_react9.createElement)("span", { className: "sq-title" }, "Squad 小队"),
        (0, import_react9.createElement)("div", { className: "sq-tabs", role: "tablist" }, Object.entries(TABS).map(([id, label]) => (0, import_react9.createElement)("button", { key: id, role: "tab", className: "sq-tab", "data-on": tab === id || void 0, "aria-selected": tab === id, onClick: () => store.set((state) => ({ ...state, tab: id })) }, label))),
        (0, import_react9.createElement)("span", { className: "sq-spacer" }),
        (0, import_react9.createElement)("button", { className: "sq-btn sq-gear", title: "规则", "aria-label": scope ? `小队 ${scope} 的规则` : "小队与规则", onClick: () => store.set((state) => ({ ...state, tab: "config", configFocus: scope ? `team:${scope}` : null })) }, "⚙ 规则"),
        (0, import_react9.createElement)("button", { className: "sq-x", "aria-label": "关闭", onClick: close }, "×")
      ),
      (0, import_react9.createElement)(SummaryBar),
      (0, import_react9.createElement)(Banner),
      (0, import_react9.createElement)("div", { className: "sq-body" }, body, tab === "runs" ? (0, import_react9.createElement)(StartPanel) : null)
    )
  );
}
function Preview({ preview }) {
  return (0, import_react9.createElement)(
    "div",
    { className: "sq-root", style: { background: "rgba(0,0,0,.45)" }, onMouseDown: (event) => {
      if (event.target === event.currentTarget) store.set((state) => ({ ...state, preview: null }));
    } },
    (0, import_react9.createElement)(
      "div",
      { className: "sq-preview" },
      (0, import_react9.createElement)("div", { className: "sq-head" }, (0, import_react9.createElement)("span", { className: "sq-title" }, `预览：${preview.name ?? ""}`), (0, import_react9.createElement)("span", { className: "sq-muted" }, "隔离运行，读不到 DS Bot 的登录和数据"), (0, import_react9.createElement)("span", { className: "sq-spacer" }), (0, import_react9.createElement)("button", { className: "sq-x", "aria-label": "关闭预览", onClick: () => store.set((state) => ({ ...state, preview: null })) }, "×")),
      (0, import_react9.createElement)("iframe", { src: preview.url, sandbox: "allow-scripts", referrerPolicy: "no-referrer", title: preview.name ?? "preview" })
    )
  );
}
function Toast() {
  const toast2 = useStore((state) => state.toast);
  (0, import_react9.useEffect)(() => {
    if (!toast2) return void 0;
    const timer2 = setTimeout(() => store.set((state) => state.toast === toast2 ? { ...state, toast: null } : state), 4e3);
    return () => clearTimeout(timer2);
  }, [toast2]);
  return toast2 ? (0, import_react9.createElement)("div", { className: "sq-toast", role: "status" }, toast2.text) : null;
}
var owner = null;
function SquadOverlay() {
  const isOpen = useStore((state) => state.open);
  const preview = useStore((state) => state.preview);
  const [self] = (0, import_react9.useState)(() => /* @__PURE__ */ Symbol("overlay"));
  const [, redraw] = (0, import_react9.useState)(0);
  (0, import_react9.useEffect)(() => {
    if (owner === null) owner = self;
    redraw((n) => n + 1);
    return () => {
      if (owner === self) owner = null;
    };
  }, []);
  if (owner !== self) return null;
  return (0, import_react_dom.createPortal)((0, import_react9.createElement)("div", { "data-squad": "overlay" }, isOpen ? (0, import_react9.createElement)(Console) : null, preview ? (0, import_react9.createElement)(Preview, { preview }) : null, (0, import_react9.createElement)(Toast)), document.body);
}
function GroupDock({ sessionId }) {
  const teams = useStore((state) => state.teams);
  const snapshot = useStore((state) => state.projection.snapshot);
  const teamId = Object.entries(teams ?? {}).find(([, team]) => team.roomId === sessionId)?.[0];
  if (teamId === void 0) return null;
  const run = runsOf(snapshot).find((candidate) => candidate.team_id === teamId);
  const tasks = run ? tasksOf(snapshot, run.run_id).filter((task) => task.kind !== "leader_step") : [];
  const done = tasks.filter((task) => task.state === "completed").length;
  return (0, import_react9.createElement)(
    "div",
    { className: "sq-dock" },
    (0, import_react9.createElement)("strong", null, `小队 ${teamId}`),
    run ? (0, import_react9.createElement)("span", null, `${RUN_PHASE[run.phase] ?? run.phase} · ${done}/${tasks.length} 个任务完成`) : (0, import_react9.createElement)("span", { className: "sq-muted" }, "还没有 Run"),
    run && !terminal(run.phase) ? (0, import_react9.createElement)("span", { className: "sq-muted" }, "在这里说的话会作为补充说明交给 Leader") : null,
    (0, import_react9.createElement)("span", { className: "sq-spacer", style: { flex: 1 } }),
    (0, import_react9.createElement)("button", { className: "sq-btn", onClick: () => open({ tab: "runs", teamScope: teamId, runId: run?.run_id ?? null, startOpen: !run }) }, run ? "查看进度" : "开始")
  );
}

// src/styles.js
var CSS2 = `
body{--sq-bg:#fbfbfa;--sq-panel:#ffffff;--sq-line:#e4e2dd;--sq-text:#1f1e1c;--sq-muted:#6f6b64;--sq-accent:#3d5afe;--sq-chip:#f1efea;--sq-canvas:#f8f7f4;
  --sq-running:#2563eb;--sq-running-bg:#e8efff;--sq-done:#15803d;--sq-done-bg:#e3f5e8;--sq-attention:#c2410c;--sq-attention-bg:#fff0e3;--sq-failed:#dc2626;--sq-failed-bg:#fdeaea;--sq-stopped:#6b7280;--sq-stopped-bg:#eeeff1;--sq-waiting:#6f6b64;--sq-waiting-bg:#ffffff;
  --sq-ok:var(--sq-done);--sq-warn:var(--sq-attention);--sq-bad:var(--sq-failed)}
body[data-ds-dark-theme]{--sq-bg:#1b1a18;--sq-panel:#23221f;--sq-line:#3a3833;--sq-text:#eceae5;--sq-muted:#a29e95;--sq-accent:#8c9eff;--sq-chip:#2f2d29;--sq-canvas:#16161a;
  --sq-running:#60a5fa;--sq-running-bg:#16233d;--sq-done:#4ade80;--sq-done-bg:#14301f;--sq-attention:#fb923c;--sq-attention-bg:#3a2412;--sq-failed:#f87171;--sq-failed-bg:#3b1717;--sq-stopped:#9ca3af;--sq-stopped-bg:#2a2b2f;--sq-waiting:#a29e95;--sq-waiting-bg:#23221f}
.sq-root{position:fixed;inset:0;z-index:2147480000;display:flex;align-items:stretch;justify-content:center;background:rgba(20,18,15,.38);font:14px/1.5 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--sq-text)}
.sq-shell{margin:24px;flex:1;max-width:1280px;background:var(--sq-bg);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.25)}
.sq-head{display:flex;align-items:center;gap:16px;padding:12px 18px;border-bottom:1px solid var(--sq-line);background:var(--sq-panel)}
.sq-title{font-weight:650;font-size:16px}
.sq-tabs{display:flex;gap:4px}
.sq-tab{border:0;background:none;color:var(--sq-muted);padding:6px 12px;border-radius:8px;cursor:pointer;font:inherit}
.sq-tab[data-on]{background:var(--sq-chip);color:var(--sq-text);font-weight:600}
.sq-spacer{flex:1}
.sq-x{border:0;background:none;font-size:20px;color:var(--sq-muted);cursor:pointer;padding:0 6px}
.sq-banner{padding:6px 18px;background:#fff4e0;color:#7a4b00;font-size:13px}
body[data-ds-dark-theme] .sq-banner{background:#3a2c12;color:#f3cf8b}
.sq-body{flex:1;display:flex;min-height:0}
.sq-side{width:300px;border-right:1px solid var(--sq-line);overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.sq-main{flex:1;overflow:auto;padding:16px 20px;display:flex;flex-direction:column;gap:16px}
.sq-item{border:1px solid var(--sq-line);border-radius:10px;padding:8px 10px;background:var(--sq-panel);cursor:pointer;text-align:left;font:inherit;color:inherit}
.sq-item[data-on]{border-color:var(--sq-accent);box-shadow:0 0 0 1px var(--sq-accent)}
.sq-muted{color:var(--sq-muted);font-size:12px}
.sq-chip{display:inline-block;white-space:nowrap;padding:1px 8px;border-radius:999px;background:var(--sq-chip);font-size:12px;margin-right:6px}
.sq-chip[data-tone=ok]{color:var(--sq-ok)}.sq-chip[data-tone=warn]{color:var(--sq-warn)}.sq-chip[data-tone=bad]{color:var(--sq-bad)}
.sq-status{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid transparent}
.sq-status::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.sq-status[data-s=running]{color:var(--sq-running);background:var(--sq-running-bg)}
.sq-status[data-s=done]{color:var(--sq-done);background:var(--sq-done-bg)}
.sq-status[data-s=attention]{color:var(--sq-attention);background:var(--sq-attention-bg)}
.sq-status[data-s=failed]{color:var(--sq-failed);background:var(--sq-failed-bg)}
.sq-status[data-s=stopped]{color:var(--sq-stopped);background:var(--sq-stopped-bg)}
.sq-status[data-s=waiting]{color:var(--sq-waiting);background:var(--sq-waiting-bg);border-color:var(--sq-line)}
.sq-sum{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 18px;border-bottom:1px solid var(--sq-line);background:var(--sq-panel);font-size:13px}
.sq-sum-num{color:var(--sq-muted)}.sq-sum-num b{color:var(--sq-text);font-size:14px}
.sq-pill{position:relative;border:0;border-radius:999px;padding:3px 12px;font:inherit;font-weight:600;cursor:pointer}
.sq-pill[data-s=attention]{color:var(--sq-attention);background:var(--sq-attention-bg)}
.sq-pill[data-s=failed]{color:var(--sq-failed);background:var(--sq-failed-bg)}
.sq-pill[data-flash]{animation:sq-flash .9s ease-out 1}
@keyframes sq-flash{0%{box-shadow:0 0 0 0 currentColor}100%{box-shadow:0 0 0 8px transparent}}
@media (prefers-reduced-motion:reduce){.sq-pill[data-flash]{animation:none}}
.sq-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:5;min-width:320px;max-width:480px;background:var(--sq-panel);border:1px solid var(--sq-line);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:6px;display:flex;flex-direction:column;gap:2px;color:var(--sq-text);font-weight:400;text-align:left}
.sq-menu-group{font-size:12px;color:var(--sq-muted);padding:4px 8px 0}
.sq-menu-item{border:0;background:none;text-align:left;padding:6px 8px;border-radius:8px;cursor:pointer;font:inherit;color:inherit}
.sq-menu-item:hover,.sq-menu-item:focus{background:var(--sq-chip);outline:none}
tr[data-focus]{outline:2px solid var(--sq-attention);outline-offset:-2px}
.sq-canvas-wrap{position:relative;border:1px solid var(--sq-line);border-radius:12px;overflow:hidden;background:var(--sq-canvas)}
.sq-canvas{position:relative;height:min(64vh,640px);min-height:420px;overflow:hidden;cursor:grab}
.sq-canvas:active{cursor:grabbing}
.sq-canvas-tools{position:absolute;left:10px;top:10px;z-index:3;display:flex;gap:6px}
.sq-layer{position:absolute;left:0;top:0;transform-origin:0 0;transition:transform .25s ease}
.sq-edges{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.sq-edge{fill:none;stroke:var(--sq-line);stroke-width:1.6}
.sq-edge[data-to-s=stopped]{stroke-dasharray:4 4}
.sq-edge-dep{fill:none;stroke:var(--sq-muted);stroke-width:1;stroke-dasharray:3 4;opacity:.45}
.sq-node{position:absolute;left:0;top:0;box-sizing:border-box;padding:8px 10px 6px;border-radius:12px;background:var(--sq-panel);border:1px solid var(--sq-line);border-top:3px solid var(--sq-waiting);box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;flex-direction:column;gap:3px;cursor:pointer;transition:transform .25s ease,box-shadow .2s,opacity .25s;color:var(--sq-text)}
.sq-node[data-s=running]{border-top-color:var(--sq-running)}.sq-node[data-s=done]{border-top-color:var(--sq-done)}
.sq-node[data-s=attention]{border-top-color:var(--sq-attention);box-shadow:0 0 0 1px var(--sq-attention)}
.sq-node[data-s=failed]{border-top-color:var(--sq-failed);box-shadow:0 0 0 1px var(--sq-failed)}
.sq-node[data-s=stopped]{border-top-color:var(--sq-stopped);opacity:.72}
.sq-node[data-kind=run]{border-width:1px 1px 1px 1px;border-top-width:4px}
.sq-node[data-selected]{box-shadow:0 0 0 2px var(--sq-accent)}
.sq-node[data-folded]{box-shadow:0 1px 3px rgba(0,0,0,.08),4px 4px 0 -1px var(--sq-panel),4px 4px 0 0 var(--sq-line),8px 8px 0 -1px var(--sq-panel),8px 8px 0 0 var(--sq-line)}
.sq-node[data-new]{animation:sq-grow .35s ease-out}
.sq-node[data-flash]{animation:sq-node-flash 1.1s ease-out}
@keyframes sq-grow{from{opacity:0;scale:.82;translate:0 -18px}to{opacity:1;scale:1;translate:0 0}}
@keyframes sq-node-flash{0%,60%{box-shadow:0 0 0 4px var(--sq-attention)}100%{box-shadow:0 0 0 0 transparent}}
.sq-node-head{display:flex;align-items:center;gap:8px;min-width:0}
.sq-node-who{flex:1;min-width:0}
.sq-node-role{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sq-node-model{font-size:11px;color:var(--sq-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sq-node-title{font-size:13px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sq-node-note{font-size:11px;color:var(--sq-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sq-node-count{position:absolute;right:-8px;bottom:-10px;min-width:22px;height:22px;border-radius:11px;border:1px solid var(--sq-line);background:var(--sq-panel);color:var(--sq-text);font:600 11px/20px system-ui,sans-serif;cursor:pointer;padding:0 6px}
.sq-avatar{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font:600 13px/1 system-ui,sans-serif;flex:none;object-fit:cover}
.sq-drawer{position:absolute;right:0;top:0;bottom:0;width:360px;max-width:80%;z-index:4;background:var(--sq-panel);border-left:1px solid var(--sq-line);padding:14px;overflow:auto;display:flex;flex-direction:column;gap:8px;box-shadow:-8px 0 24px rgba(0,0,0,.12)}
.sq-reason{color:var(--sq-failed)}
.sq-pre{white-space:pre-wrap;word-break:break-word;margin:0;font-size:12px}
.sq-tech summary{cursor:pointer;color:var(--sq-muted);font-size:12px}
@media (prefers-reduced-motion:reduce){.sq-node,.sq-layer{transition:none}.sq-node[data-new]{animation:sq-fade .2s}.sq-node[data-flash]{animation:none;box-shadow:0 0 0 3px var(--sq-attention)}}
@keyframes sq-fade{from{opacity:0}to{opacity:1}}
.sq-pop{position:absolute;left:0;top:0;z-index:6;width:300px;box-sizing:border-box;background:var(--sq-panel);color:var(--sq-text);border:1px solid var(--sq-line);border-left:4px solid var(--sq-attention);border-radius:12px;padding:12px 14px;box-shadow:0 12px 32px rgba(0,0,0,.2);display:flex;flex-direction:column;gap:8px;font-size:13px;cursor:default}
.sq-pop[data-s=failed]{border-left-color:var(--sq-failed)}
.sq-pop-close{position:absolute;right:6px;top:2px}
.sq-pop-title{font-weight:650}
.sq-pop-reason{color:var(--sq-failed)}
.sq-pop-main{justify-content:flex-end}
.sq-pop-confirm{display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:8px;background:var(--sq-chip)}
.sq-pop-confirm .sq-row{justify-content:flex-end}
.sq-pop-extra{font-size:12px}
.sq-link{border:0;background:none;padding:0;color:var(--sq-accent);cursor:pointer;font:inherit;text-align:left}
.sq-card{border:1px solid var(--sq-line);border-radius:12px;background:var(--sq-panel);padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.sq-card h3{margin:0;font-size:14px}
.sq-section h2{margin:0 0 8px;font-size:15px}
.sq-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sq-btn{border:1px solid var(--sq-line);background:var(--sq-panel);color:var(--sq-text);border-radius:8px;padding:5px 12px;cursor:pointer;font:inherit}
.sq-btn[data-kind=primary]{background:var(--sq-accent);border-color:var(--sq-accent);color:#fff}
.sq-btn[data-kind=danger]{color:var(--sq-bad)}
.sq-btn:disabled{opacity:.5;cursor:default}
.sq-input,.sq-text,.sq-select{width:100%;box-sizing:border-box;border:1px solid var(--sq-line);background:var(--sq-panel);color:var(--sq-text);border-radius:8px;padding:6px 8px;font:inherit}
.sq-text{min-height:64px;resize:vertical}
.sq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.sq-table{width:100%;border-collapse:collapse;font-size:13px}
.sq-table th,.sq-table td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--sq-line);vertical-align:top}
.sq-table th{color:var(--sq-muted);font-weight:500}
.sq-dag{overflow:auto;border:1px solid var(--sq-line);border-radius:12px;background:var(--sq-panel)}
.sq-dag text{font:12px system-ui,sans-serif;fill:var(--sq-text)}
.sq-preview{position:fixed;inset:40px;z-index:2147480001;background:var(--sq-panel);border-radius:12px;display:flex;flex-direction:column;box-shadow:0 18px 60px rgba(0,0,0,.35)}
.sq-preview iframe{flex:1;border:0;border-radius:0 0 12px 12px;background:#fff}
.sq-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147480002;background:#2b2926;color:#fff;padding:8px 14px;border-radius:10px;max-width:70vw}
.sq-foot{display:flex;align-items:center;gap:6px;width:100%;border:0;background:none;color:inherit;padding:6px 8px;border-radius:8px;cursor:pointer;font:inherit}
.sq-foot:hover{background:rgba(127,127,127,.12)}
.sq-dock{display:flex;align-items:center;gap:8px;padding:6px 10px;margin:0 0 6px;border:1px solid var(--sq-line);border-radius:10px;font-size:13px;color:var(--sq-text);background:var(--sq-panel)}
.sq-bar{height:8px;border-radius:4px;background:var(--sq-accent)}
.sq-body{position:relative}
.sq-start{position:absolute;right:0;top:0;bottom:0;width:380px;max-width:90%;z-index:6;background:var(--sq-panel);border-left:1px solid var(--sq-line);box-shadow:-10px 0 30px rgba(0,0,0,.14);padding:16px;display:flex;flex-direction:column;gap:12px;overflow:auto;animation:sq-slide .2s ease-out}
.sq-start label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--sq-muted)}
@keyframes sq-slide{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.sq-start{animation:none}}
.sq-gear{white-space:nowrap}
.sq-seg{display:inline-flex;border:1px solid var(--sq-line);border-radius:8px;overflow:hidden}
.sq-seg button{border:0;border-right:1px solid var(--sq-line);background:var(--sq-panel);color:var(--sq-muted);padding:3px 10px;font:inherit;cursor:pointer}
.sq-seg button:last-child{border-right:0}
.sq-seg button[data-on]{background:var(--sq-chip);color:var(--sq-text);font-weight:600}
.sq-switch{width:auto}
.sq-notice{border:1px solid var(--sq-running);color:var(--sq-running);background:var(--sq-running-bg);border-radius:999px;padding:2px 10px;font:inherit;font-size:12px;cursor:pointer}
.sq-teams{grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.sq-team{border:1px solid var(--sq-line);border-left:4px solid var(--sq-waiting);border-radius:12px;background:var(--sq-panel);padding:12px 14px;display:flex;flex-direction:column;gap:6px;cursor:pointer;color:var(--sq-text)}
.sq-team:hover,.sq-team:focus{box-shadow:0 0 0 2px var(--sq-accent);outline:none}
.sq-team[data-s=running]{border-left-color:var(--sq-running)}.sq-team[data-s=done]{border-left-color:var(--sq-done)}.sq-team[data-s=attention]{border-left-color:var(--sq-attention)}.sq-team[data-s=failed]{border-left-color:var(--sq-failed)}.sq-team[data-s=stopped]{border-left-color:var(--sq-stopped)}
.sq-team-goal{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sq-team-menu{padding:2px 8px}
.sq-team-counts{flex-wrap:wrap;gap:4px}
.sq-mini{display:block;margin:4px 0;min-height:24px}
.sq-link{border:0;background:none;padding:0;color:var(--sq-accent);font:inherit;font-size:12px;cursor:pointer;text-decoration:underline}
.sq-held{border-top:1px dashed var(--sq-line);padding-top:6px;display:flex;flex-direction:column;gap:6px}
.sq-held-row{background:var(--sq-chip);border-radius:8px;padding:6px 8px;display:flex;flex-direction:column;gap:4px;cursor:default;font-size:13px}
.sq-node-also{font-size:11px;color:var(--sq-accent);border:1px solid var(--sq-accent);border-radius:999px;padding:0 6px;white-space:nowrap}
.sq-empty{align-items:center;justify-content:center;color:var(--sq-muted)}
.sq-node:focus-visible,.sq-team:focus-visible,.sq-btn:focus-visible,.sq-pill:focus-visible,.sq-seg button:focus-visible,.sq-link:focus-visible{outline:2px solid var(--sq-accent);outline-offset:2px}
`;
function installStyles() {
  const style = document.createElement("style");
  style.dataset.squad = "page";
  style.textContent = CSS2;
  document.head.append(style);
  return () => style.remove();
}

// src/link-model.js
function parseSquadLink(search) {
  const value = new URLSearchParams(search ?? "").get("squad");
  if (!value) return void 0;
  const [teamId, runId, taskId] = value.split(":");
  if (!teamId || !runId) return void 0;
  return { teamId, runId, taskId: taskId || null };
}

// src/link.js
function open2(target) {
  store.set((state) => ({ ...state, open: true, tab: "runs", teamScope: target.teamId, runId: target.runId, focus: { taskId: target.taskId, runId: target.runId, at: Date.now() } }));
}
function followLinks() {
  const first = parseSquadLink(window.location.search);
  if (first !== void 0) {
    open2(first);
    const url = new URL(window.location.href);
    url.searchParams.delete("squad");
    window.history.replaceState(window.history.state, "", url);
  }
  const onClick = (event) => {
    const anchor = event.target?.closest?.("a[href]");
    if (!anchor) return;
    let url;
    try {
      url = new URL(anchor.getAttribute("href"), window.location.href);
    } catch {
      return;
    }
    const target = url.pathname === "/" ? parseSquadLink(url.search) : void 0;
    if (target === void 0) return;
    event.preventDefault();
    event.stopPropagation();
    open2(target);
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}

// src/index.js
var inject = ["slots"];
function apply(ctx) {
  ctx.effect(() => installStyles(), "squad: styles");
  ctx.effect(() => startFeed(), "squad: projection feed");
  ctx.effect(() => followLinks(), "squad: links from the group");
  const fill = (name, options, component) => ctx.effect(() => ctx.slots.inject(name, () => ctx.slots.register({ name, ...options }, component)), `squad: ${name}`);
  fill("sidebar.footer.action", { id: "squad-open", order: -250 }, SquadButton);
  fill("shell.overlay", { id: "squad", order: 70 }, SquadOverlay);
  fill("conversation.input.dock", { id: "squad-run", order: -130 }, GroupDock);
}
return Object.defineProperty({ ...module.exports }, Symbol.toStringTag, { value: 'Module' })
  },
})
