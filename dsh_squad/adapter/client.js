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
var import_react5 = require("react");
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
var TASK_STATE = {
  planned: "待开始",
  queued: "排队",
  waiting_dependency: "等待依赖",
  dispatching: "派发中",
  running: "执行中",
  result_proposed: "已提交",
  completed: "已完成",
  needs_review: "需人工处理",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "已中断"
};
var KIND = { execute: "执行", review: "审核", rework: "返工", ask: "提问", leader_step: "Leader" };
var runsOf = (snapshot) => [...snapshot?.views?.runs ?? []].sort((a, b) => b.queue_seq - a.queue_seq);
var tasksOf = (snapshot, runId) => (snapshot?.views?.tasks ?? []).filter((task) => task.run_id === runId);
var attemptsOf = (snapshot, taskId) => (snapshot?.views?.attempts ?? []).filter((attempt) => attempt.task_id === taskId);
function graphOf(tasks) {
  const nodes = tasks.filter((task) => task.kind !== "leader_step");
  const ids = new Set(nodes.map((task) => task.task_id));
  const edges = [];
  for (const task of nodes) {
    for (const dep of task.dependencies ?? []) if (ids.has(dep.task_id)) edges.push({ from: dep.task_id, to: task.task_id, kind: dep.condition });
    if (task.rework_of && ids.has(task.rework_of)) edges.push({ from: task.rework_of, to: task.task_id, kind: "rework" });
  }
  const into = new Map(nodes.map((task) => [task.task_id, []]));
  for (const edge of edges) into.get(edge.to).push(edge.from);
  const column = /* @__PURE__ */ new Map();
  const depth = (id, seen = /* @__PURE__ */ new Set()) => {
    if (column.has(id)) return column.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = into.get(id) ?? [];
    const value = parents.length === 0 ? 0 : 1 + Math.max(...parents.map((parent) => depth(parent, seen)));
    column.set(id, value);
    return value;
  };
  for (const task of nodes) depth(task.task_id);
  const rows = /* @__PURE__ */ new Map();
  const placed = nodes.map((task) => {
    const col = column.get(task.task_id);
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    return { task, col, row };
  });
  return { nodes: placed, edges, columns: Math.max(0, ...placed.map((node) => node.col)) + 1, rows: Math.max(0, ...rows.values()) };
}
function cardsOf(snapshot, runId, approvals = []) {
  const tasks = tasksOf(snapshot, runId);
  const run = runsOf(snapshot).find((candidate) => candidate.run_id === runId);
  const cards = [];
  for (const task of tasks) {
    if (task.kind !== "leader_step" && task.state === "completed" && task.acceptance == null && task.acceptance_policy?.mode === "human" && task.result) {
      cards.push({ type: "accept", key: `accept:${task.task_id}:${task.revision}`, task, expectedRevision: task.revision, resultHash: task.result.hash });
    }
    const blockedOnBinding = (task.blockers ?? []).some((blocker) => ["primary_offline", "binding_changed"].includes(blocker.kind));
    if (task.state === "needs_review" || task.state === "interrupted" && attemptsOf(snapshot, task.task_id).some((attempt) => attempt.cleanup_state !== "released") || blockedOnBinding && task.kind !== "leader_step") {
      const attempts = attemptsOf(snapshot, task.task_id);
      const attempt = attempts.filter((candidate) => candidate.cleanup_state !== "released").at(-1);
      const ids = new Set(attempts.map((candidate) => candidate.attempt_id));
      const late = (snapshot?.views?.evidence ?? []).filter((row) => ids.has(row.attempt_id) && row.disposition === "rejected_late_or_stale");
      const primary = (snapshot?.views?.roles ?? []).find((role) => role.role_id === task.role_id);
      const others = (snapshot?.views?.agents ?? []).filter((agent) => agent.role_id === task.role_id && agent.mode === "role" && agent.presence === "online" && agent.binding?.agent_id !== primary?.primary_agent_id);
      cards.push({ type: "recover", key: `recover:${task.task_id}:${task.revision}`, task, attempt, attempts: attempts.length, late, primary, others, expectedRevision: task.revision });
    }
    if (task.kind === "review" && task.state === "completed" && task.result?.value?.decision) {
      cards.push({ type: "review", key: `review:${task.task_id}`, task, verdict: task.result.value });
    }
  }
  for (const entry of approvals) {
    if (tasks.some((task) => task.task_id === entry.taskId)) {
      const attempt = (snapshot?.views?.attempts ?? []).find((candidate) => candidate.attempt_id === entry.attemptId);
      cards.push({ type: "approve", key: `approve:${entry.id}`, approval: entry, attemptId: entry.attemptId, expectedRevision: attempt?.revision });
    }
  }
  const asks = (run?.blockers ?? []).filter((blocker) => !["role_busy", "earlier_run", "active_run"].includes(blocker.kind));
  if (run && !terminal(run.phase) && (run.recovery_hold || asks.length > 0)) {
    cards.push({ type: "answer", key: `answer:${run.run_id}:${run.revision}`, run, expectedRevision: run.revision, why: run.recovery_hold ? "Controller 重启后 Run 暂停，需要确认后继续" : asks.map((blocker) => blocker.kind).join("、") });
  }
  return cards;
}
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
var import_react2 = require("react");

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
  errors: []
});
function useStore(select) {
  return (0, import_react.useSyncExternalStore)(store.subscribe, () => select(store.get()));
}
var toast = (text, kind = "error") => store.set((state) => ({ ...state, toast: { text, kind, at: Date.now() } }));

// src/feed.js
var timer = null;
var running = false;
async function refresh() {
  const view = await call("view");
  store.set((state) => view.connected === false ? { ...state, connected: false } : { ...state, connected: true, projection: acceptSnapshot(state.projection, view.snapshot), teams: view.teams ?? {}, approvals: view.approvals ?? [], previewBase: view.previewBase, errors: view.errors ?? [] });
}
async function step() {
  const { projection } = store.get();
  try {
    if (projection.stale || projection.snapshot === null) return await refresh();
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

// src/runs.js
var TONE = { completed: "ok", accepted: "ok", running: "warn", needs_review: "bad", failed: "bad", interrupted: "bad", rejected: "bad", cancelled: "bad" };
var chip = (text, tone) => (0, import_react2.createElement)("span", { className: "sq-chip", "data-tone": tone }, text);
async function act(what, endpoint, payload) {
  try {
    await call(endpoint, payload);
    toast(`${what}：已提交`, "ok");
  } catch (error) {
    toast(`${what}失败：${error.message}`);
  } finally {
    await refreshNow();
  }
}
function StartRun({ snapshot }) {
  const teams = (snapshot?.views?.teams ?? []).map((team2) => team2.config);
  const [teamId, setTeam] = (0, import_react2.useState)(teams[0]?.team_id ?? "");
  const [goal, setGoal] = (0, import_react2.useState)("");
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const team = (snapshot?.views?.teams ?? []).find((candidate) => candidate.config.team_id === teamId);
  const workflows = Object.keys(team?.workflows ?? {});
  const [workflowId, setWorkflow] = (0, import_react2.useState)("");
  const start = async () => {
    setBusy(true);
    try {
      const run = await call("start-run", { requestId: requestId("run"), teamId, goal, ...workflowId ? { workflowId } : {} });
      store.set((state) => ({ ...state, runId: run.run_id }));
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
    "div",
    { className: "sq-card" },
    (0, import_react2.createElement)("h3", null, "开始一个小队任务"),
    (0, import_react2.createElement)(
      "select",
      { className: "sq-select", value: teamId, onChange: (event) => setTeam(event.target.value), "aria-label": "小队" },
      teams.length === 0 ? (0, import_react2.createElement)("option", { value: "" }, "还没有小队，请先在「小队与规则」里建一个") : teams.map((t) => (0, import_react2.createElement)("option", { key: t.team_id, value: t.team_id }, t.team_id))
    ),
    workflows.length > 0 ? (0, import_react2.createElement)(
      "select",
      { className: "sq-select", value: workflowId, onChange: (event) => setWorkflow(event.target.value), "aria-label": "流程" },
      (0, import_react2.createElement)("option", { value: "" }, `默认流程${team?.config?.default_workflow ? `（${team.config.default_workflow}）` : "（由 Leader 安排）"}`),
      workflows.map((id) => (0, import_react2.createElement)("option", { key: id, value: id }, id))
    ) : null,
    (0, import_react2.createElement)("textarea", { className: "sq-text", placeholder: "要完成什么？例如：认识分数：分数的意义与读写（五年级）", value: goal, onChange: (event) => setGoal(event.target.value) }),
    (0, import_react2.createElement)("button", { className: "sq-btn", "data-kind": "primary", disabled: busy || !teamId || goal.trim() === "", onClick: start }, busy ? "正在开始…" : "开始")
  );
}
function RunList() {
  const snapshot = useStore((state) => state.projection.snapshot);
  const runId = useStore((state) => state.runId);
  const runs = runsOf(snapshot);
  return (0, import_react2.createElement)(
    import_react2.Fragment,
    null,
    (0, import_react2.createElement)(StartRun, { snapshot }),
    runs.length === 0 ? (0, import_react2.createElement)("div", { className: "sq-muted" }, "还没有 Run。") : null,
    runs.map((run) => {
      const tasks = tasksOf(snapshot, run.run_id).filter((task) => task.kind !== "leader_step");
      const done = tasks.filter((task) => task.state === "completed").length;
      return (0, import_react2.createElement)(
        "button",
        { key: run.run_id, className: "sq-item", "data-on": run.run_id === runId || void 0, onClick: () => store.set((state) => ({ ...state, runId: run.run_id })) },
        (0, import_react2.createElement)("div", null, chip(RUN_PHASE[run.phase] ?? run.phase, TONE[run.phase]), (0, import_react2.createElement)("span", { className: "sq-muted" }, run.team_id)),
        (0, import_react2.createElement)("div", null, run.goal),
        (0, import_react2.createElement)("div", { className: "sq-muted" }, `${done}/${tasks.length} 个任务完成 · ${short(run.run_id)}${waitingOf(run).length ? " · 排队中" : ""}`)
      );
    })
  );
}
var NODE_W = 170;
var NODE_H = 54;
var GAP_X = 60;
var GAP_Y = 18;
function RunGraph({ tasks }) {
  const graph = graphOf(tasks);
  if (graph.nodes.length === 0) return (0, import_react2.createElement)("div", { className: "sq-muted" }, "Leader 还没有安排任务。");
  const at = new Map(graph.nodes.map((node) => [node.task.task_id, { x: 12 + node.col * (NODE_W + GAP_X), y: 12 + node.row * (NODE_H + GAP_Y) }]));
  const width = 24 + graph.columns * (NODE_W + GAP_X) - GAP_X;
  const height = 24 + graph.rows * (NODE_H + GAP_Y) - GAP_Y;
  const fill = { completed: "#e6f4ea", running: "#fff4e0", needs_review: "#fdecea", failed: "#fdecea", interrupted: "#fdecea", cancelled: "#eeeeee" };
  return (0, import_react2.createElement)(
    "div",
    { className: "sq-dag" },
    (0, import_react2.createElement)(
      "svg",
      { width, height, role: "img", "aria-label": "任务依赖图" },
      (0, import_react2.createElement)("defs", null, (0, import_react2.createElement)("marker", { id: "sq-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto" }, (0, import_react2.createElement)("path", { d: "M0,0 L10,5 L0,10 z", fill: "#999" }))),
      graph.edges.map((edge, index) => {
        const a = at.get(edge.from);
        const b = at.get(edge.to);
        return (0, import_react2.createElement)("path", { key: index, d: `M${a.x + NODE_W},${a.y + NODE_H / 2} C${a.x + NODE_W + GAP_X / 2},${a.y + NODE_H / 2} ${b.x - GAP_X / 2},${b.y + NODE_H / 2} ${b.x},${b.y + NODE_H / 2}`, fill: "none", stroke: edge.kind === "rework" ? "#c62828" : "#999", strokeDasharray: edge.kind === "rework" ? "4 3" : void 0, markerEnd: "url(#sq-arrow)" });
      }),
      graph.nodes.map(({ task }) => {
        const p = at.get(task.task_id);
        const decision = task.acceptance?.decision ?? (task.kind === "review" ? task.result?.value?.decision : void 0);
        const goal = goalOf(task, tasks);
        return (0, import_react2.createElement)(
          "g",
          { key: task.task_id, transform: `translate(${p.x},${p.y})` },
          (0, import_react2.createElement)("title", null, `${goal}
${task.task_id}`),
          (0, import_react2.createElement)("rect", { width: NODE_W, height: NODE_H, rx: 8, fill: fill[task.state] ?? "#f4f6ff", stroke: task.superseded_by ? "#c62828" : "#bbb", strokeDasharray: task.superseded_by ? "4 3" : void 0 }),
          (0, import_react2.createElement)("text", { x: 8, y: 18 }, `${KIND[task.kind] ?? task.kind} · ${task.role_id}`),
          (0, import_react2.createElement)("text", { x: 8, y: 34 }, `${TASK_STATE[task.state] ?? task.state}${decision ? ` · ${decision === "accepted" ? "通过" : "退回"}` : ""}`),
          (0, import_react2.createElement)("text", { x: 8, y: 48, fill: "#888" }, goal.length > 14 ? `${goal.slice(0, 14)}…` : goal)
        );
      })
    )
  );
}
function AnswerCard({ card }) {
  const [text, setText] = (0, import_react2.useState)("");
  return (0, import_react2.createElement)(
    "div",
    { className: "sq-card" },
    (0, import_react2.createElement)("h3", null, "需要你回答"),
    (0, import_react2.createElement)("div", null, card.why),
    (0, import_react2.createElement)("textarea", { className: "sq-text", placeholder: "写给 Leader 的说明", value: text, onChange: (event) => setText(event.target.value) }),
    (0, import_react2.createElement)(
      "div",
      { className: "sq-row" },
      (0, import_react2.createElement)("button", { className: "sq-btn", "data-kind": "primary", disabled: text.trim() === "", onClick: () => act("回答", "operate", { kind: "run", id: card.run.run_id, op: "guidance", body: { request_id: requestId("guide"), expected_revision: card.expectedRevision, note: text.trim() } }) }, "回答"),
      card.run.recovery_hold ? (0, import_react2.createElement)("button", { className: "sq-btn", onClick: () => act("继续 Run", "operate", { kind: "run", id: card.run.run_id, op: "resume", body: { request_id: requestId("resume"), expected_revision: card.expectedRevision, note: "在 Squad 页面确认继续" } }) }, "确认继续") : null
    )
  );
}
function ApproveCard({ card }) {
  const { approval } = card;
  const answer = (choice) => act(choice === "allow" ? "批准工具" : "拒绝工具", "approve", { approvalId: approval.id, attemptId: card.attemptId, expectedRevision: card.expectedRevision, choice });
  return (0, import_react2.createElement)(
    "div",
    { className: "sq-card" },
    (0, import_react2.createElement)("h3", null, "需要你批准工具"),
    (0, import_react2.createElement)("div", null, `${approval.tool}：${approval.reason || "（没有说明）"}`),
    approval.detail?.code || approval.detail?.text ? (0, import_react2.createElement)("pre", { className: "sq-muted", style: { whiteSpace: "pre-wrap", margin: 0 } }, String(approval.detail.code ?? approval.detail.text).slice(0, 600)) : null,
    (0, import_react2.createElement)(
      "div",
      { className: "sq-row" },
      (0, import_react2.createElement)("button", { className: "sq-btn", "data-kind": "primary", disabled: card.expectedRevision === void 0, onClick: () => answer("allow") }, "批准一次"),
      (0, import_react2.createElement)("button", { className: "sq-btn", "data-kind": "danger", onClick: () => answer("reject") }, "拒绝")
    )
  );
}
function AcceptCard({ card }) {
  const [note, setNote] = (0, import_react2.useState)("");
  const decide = (decision) => act(decision === "accepted" ? "验收通过" : "验收退回", "accept", { taskId: card.task.task_id, body: { request_id: requestId("accept"), expected_revision: card.expectedRevision, decision, result_hash: card.resultHash, note: note.trim() || (decision === "accepted" ? "验收通过" : "需要修改") } });
  return (0, import_react2.createElement)(
    "div",
    { className: "sq-card" },
    (0, import_react2.createElement)("h3", null, "需要你验收成果"),
    (0, import_react2.createElement)("div", null, card.task.goal),
    (0, import_react2.createElement)("pre", { className: "sq-muted", style: { whiteSpace: "pre-wrap", margin: 0 } }, JSON.stringify(card.task.result?.value ?? null, null, 2).slice(0, 800)),
    (0, import_react2.createElement)("input", { className: "sq-input", placeholder: "验收意见", value: note, onChange: (event) => setNote(event.target.value) }),
    (0, import_react2.createElement)(
      "div",
      { className: "sq-row" },
      (0, import_react2.createElement)("button", { className: "sq-btn", "data-kind": "primary", onClick: () => decide("accepted") }, "验收通过"),
      (0, import_react2.createElement)("button", { className: "sq-btn", "data-kind": "danger", onClick: () => decide("rejected") }, "退回")
    )
  );
}
function RecoverCard({ card }) {
  const { task, attempt, late = [], others = [], primary } = card;
  const [confirm, setConfirm] = (0, import_react2.useState)(false);
  const body = (extra) => ({ request_id: requestId("recover"), expected_revision: card.expectedRevision, ...extra });
  return (0, import_react2.createElement)(
    "div",
    { className: "sq-card" },
    (0, import_react2.createElement)("h3", null, "需要恢复"),
    (0, import_react2.createElement)("div", null, `${KIND[task.kind] ?? task.kind} · ${task.role_id}：${TASK_STATE[task.state] ?? task.state}${attempt?.error ? `（${attempt.error}）` : ""}${(task.blockers ?? []).length ? ` · ${(task.blockers ?? []).map((blocker) => blocker.kind).join("、")}` : ""}`),
    attempt ? (0, import_react2.createElement)(
      import_react2.Fragment,
      null,
      (0, import_react2.createElement)("div", { className: "sq-muted" }, "不确定这次执行是否真的停下时，不会自动重来。确认它已经停止后再释放，之后可以重试、采用迟到的结果或取消。"),
      (0, import_react2.createElement)("label", { className: "sq-row" }, (0, import_react2.createElement)("input", { type: "checkbox", checked: confirm, onChange: (event) => setConfirm(event.target.checked) }), "我确认这次执行已经停止"),
      (0, import_react2.createElement)("button", { className: "sq-btn", disabled: !confirm, onClick: () => act("确认已停止", "operate", { kind: "attempt", id: attempt.attempt_id, op: "reconcile", body: { request_id: requestId("reconcile"), expected_revision: attempt.revision, expected_runtime: attempt.target?.runtime_id, note: "在 Squad 页面确认已停止", confirm_stopped: true } }) }, "确认已停止")
    ) : null,
    late.length > 0 ? (0, import_react2.createElement)(
      "div",
      null,
      (0, import_react2.createElement)("div", null, `执行被隔离后又收到 ${late.length} 份结果（已拒绝，保留为证据）：`),
      late.map((row) => (0, import_react2.createElement)(
        "div",
        { key: row.seq, className: "sq-row" },
        (0, import_react2.createElement)("span", { className: "sq-muted" }, `#${row.seq} · ${row.source} · ${String(row.at ?? "").slice(0, 19).replace("T", " ")}`),
        (0, import_react2.createElement)("button", { className: "sq-btn", disabled: Boolean(attempt), onClick: () => act("采用迟到的结果", "operate", { kind: "task", id: task.task_id, op: "recover", body: body({ evidence: `evidence:${row.seq}`, note: "在 Squad 页面采用迟到的结果" }) }) }, "采用这个结果")
      ))
    ) : null,
    others.length > 0 && attempt === void 0 ? (0, import_react2.createElement)(
      "div",
      null,
      (0, import_react2.createElement)("div", null, `${task.role_id} 现在由 ${primary?.primary_agent_id || "（无人）"} 负责，可以换成：`),
      others.map((agent) => (0, import_react2.createElement)("button", { key: agent.binding.agent_id, className: "sq-btn", onClick: async () => {
        await act(`换成 ${agent.binding.agent_id}`, "operate", { kind: "role", id: task.role_id, op: "promote", body: { request_id: requestId("promote"), expected_revision: primary?.revision ?? 0, expected_runtime: snapshotAgent(primary?.primary_agent_id)?.binding?.runtime_id ?? "", agent_id: agent.binding.agent_id } });
      } }, agent.binding.agent_id))
    ) : null,
    (0, import_react2.createElement)(
      "div",
      { className: "sq-row" },
      (0, import_react2.createElement)("button", { className: "sq-btn", disabled: Boolean(attempt), onClick: () => act(card.attempts > 0 ? "重试" : "换人重新安排", "operate", { kind: "task", id: task.task_id, op: card.attempts > 0 ? "retry" : "rebind", body: body({ rebind_current: true, note: "在 Squad 页面处理" }) }) }, card.attempts > 0 ? "重试" : "按当前负责人重新安排"),
      (0, import_react2.createElement)("button", { className: "sq-btn", "data-kind": "danger", onClick: () => act("取消任务", "operate", { kind: "task", id: task.task_id, op: "cancel", body: body({ note: "在 Squad 页面取消" }) }) }, "取消任务")
    )
  );
}
function snapshotAgent(agentId) {
  return (store.get().projection.snapshot?.views?.agents ?? []).find((agent) => agent.binding?.agent_id === agentId);
}
function ReviewCard({ card }) {
  const target = card.task.dependencies?.[0]?.task_id;
  return (0, import_react2.createElement)(
    "div",
    { className: "sq-card" },
    (0, import_react2.createElement)("h3", null, "审核结论 ", chip(card.verdict.decision === "accepted" ? "通过" : "退回", card.verdict.decision === "accepted" ? "ok" : "bad")),
    (0, import_react2.createElement)("div", null, card.verdict.reason),
    (0, import_react2.createElement)("div", { className: "sq-muted" }, `审核 ${short(target)} 的第 ${card.verdict.candidates?.[0]?.result_revision ?? "?"} 版`)
  );
}
function RunDetail({ runId }) {
  const snapshot = useStore((state) => state.projection.snapshot);
  const approvals = useStore((state) => state.approvals);
  const previewBase = useStore((state) => state.previewBase);
  const [guide, setGuide] = (0, import_react2.useState)("");
  const run = runsOf(snapshot).find((candidate) => candidate.run_id === runId);
  if (run === void 0) return (0, import_react2.createElement)("div", { className: "sq-muted" }, "选择左边的一个 Run，或开始一个新的。");
  const tasks = tasksOf(snapshot, runId);
  const cards = cardsOf(snapshot, runId, approvals);
  const of = (type) => cards.filter((card) => card.type === type);
  const artifacts = artifactsOf(tasks);
  const section = (title, list, Card) => list.length === 0 ? null : (0, import_react2.createElement)("div", { className: "sq-section" }, (0, import_react2.createElement)("h2", null, `${title}（${list.length}）`), (0, import_react2.createElement)("div", { className: "sq-grid" }, list.map((card) => (0, import_react2.createElement)(Card, { key: card.key, card }))));
  return (0, import_react2.createElement)(
    import_react2.Fragment,
    null,
    (0, import_react2.createElement)(
      "div",
      { className: "sq-card" },
      (0, import_react2.createElement)("div", { className: "sq-row" }, chip(RUN_PHASE[run.phase] ?? run.phase, TONE[run.phase]), (0, import_react2.createElement)("strong", null, run.goal)),
      (0, import_react2.createElement)("div", { className: "sq-muted" }, `小队 ${run.team_id} · ${short(run.run_id)} · 第 ${run.revision} 版${(run.guidance ?? []).length ? ` · 已有 ${run.guidance.length} 条补充说明` : ""}`),
      waitingOf(run).length > 0 ? (0, import_react2.createElement)("div", null, chip("排队中", "warn"), waitingOf(run).join("；"), "，对方结束后自动开始。") : null,
      terminal(run.phase) ? null : (0, import_react2.createElement)(
        "div",
        { className: "sq-row" },
        (0, import_react2.createElement)("input", { className: "sq-input", style: { flex: 1 }, placeholder: "给 Leader 补充说明（例如：例子用披萨）", value: guide, onChange: (event) => setGuide(event.target.value) }),
        (0, import_react2.createElement)("button", { className: "sq-btn", disabled: guide.trim() === "", onClick: () => {
          void act("补充说明", "operate", { kind: "run", id: run.run_id, op: "guidance", body: { request_id: requestId("guide"), expected_revision: run.revision, note: guide.trim() } });
          setGuide("");
        } }, "发送"),
        (0, import_react2.createElement)("button", { className: "sq-btn", "data-kind": "danger", onClick: () => act("取消 Run", "operate", { kind: "run", id: run.run_id, op: "cancel", body: { request_id: requestId("cancel"), expected_revision: run.revision, note: "在 Squad 页面取消" } }) }, "取消 Run")
      )
    ),
    section("需要你回答", of("answer"), AnswerCard),
    section("需要你批准工具", of("approve"), ApproveCard),
    section("需要你验收成果", of("accept"), AcceptCard),
    section("需要恢复", of("recover"), RecoverCard),
    (0, import_react2.createElement)("div", { className: "sq-section" }, (0, import_react2.createElement)("h2", null, "任务依赖图"), (0, import_react2.createElement)(RunGraph, { tasks })),
    artifacts.length === 0 ? null : (0, import_react2.createElement)(
      "div",
      { className: "sq-section" },
      (0, import_react2.createElement)("h2", null, "成果文件"),
      (0, import_react2.createElement)("table", { className: "sq-table" }, (0, import_react2.createElement)("tbody", null, artifacts.map((art) => (0, import_react2.createElement)(
        "tr",
        { key: `${art.taskId}:${art.sha256}` },
        (0, import_react2.createElement)("td", null, art.name ?? art.path),
        (0, import_react2.createElement)("td", null, chip(art.superseded ? "已被返工取代" : art.accepted ? "已通过" : "待审核", art.superseded ? "bad" : art.accepted ? "ok" : "warn")),
        (0, import_react2.createElement)("td", { className: "sq-muted" }, `${short(art.taskId)} · ${art.sha256.slice(0, 10)}`),
        (0, import_react2.createElement)("td", null, previewBase && art.media_type === "text/html" ? (0, import_react2.createElement)("button", { className: "sq-btn", onClick: () => store.set((state) => ({ ...state, preview: { url: `${previewBase}/v2/artifacts/sha256/${art.sha256}`, name: art.name } })) }, "预览") : null)
      ))))
    ),
    section("审核结论", of("review"), ReviewCard),
    (0, import_react2.createElement)(
      "div",
      { className: "sq-section" },
      (0, import_react2.createElement)("h2", null, "全部任务"),
      (0, import_react2.createElement)("div", { className: "sq-muted" }, `Leader 已做 ${tasks.filter((task) => task.kind === "leader_step").length} 次决定（不在表中）`),
      (0, import_react2.createElement)(
        "table",
        { className: "sq-table" },
        (0, import_react2.createElement)("thead", null, (0, import_react2.createElement)("tr", null, ["类型", "角色", "状态", "验收", "目标"].map((label) => (0, import_react2.createElement)("th", { key: label }, label)))),
        (0, import_react2.createElement)("tbody", null, tasks.filter((task) => task.kind !== "leader_step").map((task) => (0, import_react2.createElement)(
          "tr",
          { key: task.task_id },
          (0, import_react2.createElement)("td", null, KIND[task.kind] ?? task.kind),
          (0, import_react2.createElement)("td", null, task.role_id || "—"),
          (0, import_react2.createElement)("td", null, chip(TASK_STATE[task.state] ?? task.state, TONE[task.state])),
          (0, import_react2.createElement)("td", null, task.acceptance ? chip(task.acceptance.decision === "accepted" ? "通过" : "退回", TONE[task.acceptance.decision]) : "—"),
          (0, import_react2.createElement)("td", null, goalOf(task, tasks))
        )))
      )
    )
  );
}

// src/config.js
var import_react3 = require("react");

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
var ACCEPTANCE = { review: "独立审核（指定审核角色）", on_completion: "完成即通过（不审核，仅用于对照实验）" };
var CONDITION = { acceptance_accepted: "上一步通过审核后", execution_completed: "上一步做完就开始" };
var KINDS = { execute: "执行", review: "审核", ask: "提问" };
function useConfig() {
  const [state, setState] = (0, import_react3.useState)({ files: null, error: null });
  const load = async () => {
    try {
      const out = await call("config");
      setState({ files: out.files, error: null });
    } catch (error) {
      setState({ files: null, error: error.message });
    }
  };
  (0, import_react3.useEffect)(() => {
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
  return (0, import_react3.createElement)("label", { style: { display: "flex", flexDirection: "column", gap: 4 } }, (0, import_react3.createElement)("span", null, label), children, hint ? (0, import_react3.createElement)("span", { className: "sq-muted" }, hint) : null);
}
function RoleEditor({ id, role, files, reload, fresh }) {
  const [form, setForm] = (0, import_react3.useState)({ name: id ?? "", description: role?.description ?? "", body: role?.body ?? "", rules: role?.rules ?? "" });
  (0, import_react3.useEffect)(() => setForm({ name: id ?? "", description: role?.description ?? "", body: role?.body ?? "", rules: role?.rules ?? "" }), [id, role?.body]);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const ok = validId(form.name) && form.description.trim() !== "" && form.body.trim() !== "";
  const wanted = () => ({ [`roles/${form.name}/role.md`]: roleDoc(form), [`roles/${form.name}/agents.md`]: `${form.rules.trim() || "提交结果必须用 squad_submit_result。"}
` });
  return (0, import_react3.createElement)(
    "div",
    { className: "sq-card" },
    (0, import_react3.createElement)("h3", null, fresh ? "新建角色" : `角色 ${id}`),
    (0, import_react3.createElement)(Field, { label: "角色 ID", hint: "小写英文字母开头，可用数字和 -，例如 checker" }, (0, import_react3.createElement)("input", { className: "sq-input", value: form.name, disabled: !fresh, onChange: set("name") })),
    (0, import_react3.createElement)(Field, { label: "一句话说明" }, (0, import_react3.createElement)("input", { className: "sq-input", value: form.description, onChange: set("description") })),
    (0, import_react3.createElement)(Field, { label: "角色说明（这个角色是谁、怎么做事）" }, (0, import_react3.createElement)("textarea", { className: "sq-text", style: { minHeight: 120 }, value: form.body, onChange: set("body") })),
    (0, import_react3.createElement)(Field, { label: "工作规则" }, (0, import_react3.createElement)("textarea", { className: "sq-text", value: form.rules, onChange: set("rules") })),
    (0, import_react3.createElement)(
      "div",
      { className: "sq-row" },
      (0, import_react3.createElement)("button", { className: "sq-btn", disabled: !ok, onClick: () => save(files, wanted(), true, reload) }, "检查"),
      (0, import_react3.createElement)("button", { className: "sq-btn", "data-kind": "primary", disabled: !ok, onClick: () => save(files, wanted(), false, reload) }, "保存")
    )
  );
}
function TeamEditor({ id, team, roles, files, reload, fresh }) {
  const blank = { id: "", leader: "chief", members: [], acceptance: "review", reviewer: "", defaultWorkflow: "", parallel: 2, instructions: "" };
  const [form, setForm] = (0, import_react3.useState)(team ?? blank);
  (0, import_react3.useEffect)(() => setForm(team ?? blank), [id, team?.raw?.config_version]);
  const roleIds = Object.keys(roles);
  const member = (roleId) => form.members.find((entry) => entry.role_ref === roleId);
  const toggle = (roleId) => setForm((current) => ({ ...current, members: member(roleId) ? current.members.filter((entry) => entry.role_ref !== roleId) : [...current.members, { role_ref: roleId, responsibility: roles[roleId]?.description ?? roleId }] }));
  const ok = validId(form.id) && form.members.length > 0 && (form.acceptance !== "review" || member(form.reviewer));
  const wanted = () => ({ [`teams/${form.id}/team.json`]: teamDoc(form), [`teams/${form.id}/instructions.md`]: `${form.instructions.trim() || "按流程完成任务。"}
` });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return (0, import_react3.createElement)(
    "div",
    { className: "sq-card" },
    (0, import_react3.createElement)("h3", null, fresh ? "新建小队" : `小队 ${id}`),
    (0, import_react3.createElement)(Field, { label: "小队 ID", hint: "小写英文，例如 math" }, (0, import_react3.createElement)("input", { className: "sq-input", value: form.id, disabled: !fresh, onChange: set("id") })),
    (0, import_react3.createElement)(Field, { label: "Leader（负责安排和收尾的 Bot）", hint: "chief 对应 Bot「Chief」" }, (0, import_react3.createElement)("input", { className: "sq-input", value: form.leader, onChange: set("leader") })),
    (0, import_react3.createElement)(
      "div",
      null,
      (0, import_react3.createElement)("div", null, "成员角色"),
      roleIds.length === 0 ? (0, import_react3.createElement)("div", { className: "sq-muted" }, "先新建角色") : roleIds.map((roleId) => (0, import_react3.createElement)(
        "div",
        { key: roleId, className: "sq-row" },
        (0, import_react3.createElement)("label", { className: "sq-row" }, (0, import_react3.createElement)("input", { type: "checkbox", checked: Boolean(member(roleId)), onChange: () => toggle(roleId) }), roleId),
        member(roleId) ? (0, import_react3.createElement)("input", { className: "sq-input", style: { flex: 1 }, value: member(roleId).responsibility, placeholder: "在小队里负责什么", onChange: (event) => setForm((current) => ({ ...current, members: current.members.map((entry) => entry.role_ref === roleId ? { ...entry, responsibility: event.target.value } : entry) })) }) : null
      ))
    ),
    (0, import_react3.createElement)(Field, { label: "成果怎么验收" }, (0, import_react3.createElement)("select", { className: "sq-select", value: form.acceptance, onChange: set("acceptance") }, Object.entries(ACCEPTANCE).map(([value, label]) => (0, import_react3.createElement)("option", { key: value, value }, label)))),
    form.acceptance === "review" ? (0, import_react3.createElement)(Field, { label: "审核角色（必须是成员，且不能审自己）" }, (0, import_react3.createElement)("select", { className: "sq-select", value: form.reviewer, onChange: set("reviewer") }, (0, import_react3.createElement)("option", { value: "" }, "选择"), form.members.map((entry) => (0, import_react3.createElement)("option", { key: entry.role_ref, value: entry.role_ref }, entry.role_ref)))) : null,
    (0, import_react3.createElement)(Field, { label: "默认流程" }, (0, import_react3.createElement)("select", { className: "sq-select", value: form.defaultWorkflow, onChange: set("defaultWorkflow") }, (0, import_react3.createElement)("option", { value: "" }, "不用流程，由 Leader 安排"), Object.keys(team?.workflows ?? {}).map((workflowId) => (0, import_react3.createElement)("option", { key: workflowId, value: workflowId }, workflowId)))),
    (0, import_react3.createElement)(Field, { label: "同时进行的任务数" }, (0, import_react3.createElement)("input", { className: "sq-input", type: "number", min: 1, max: 8, value: form.parallel, onChange: set("parallel") })),
    (0, import_react3.createElement)(Field, { label: "小队说明（所有成员都会看到）" }, (0, import_react3.createElement)("textarea", { className: "sq-text", value: form.instructions, onChange: set("instructions") })),
    (0, import_react3.createElement)(
      "div",
      { className: "sq-row" },
      (0, import_react3.createElement)("button", { className: "sq-btn", disabled: !ok, onClick: () => save(files, wanted(), true, reload) }, "检查"),
      (0, import_react3.createElement)("button", { className: "sq-btn", "data-kind": "primary", disabled: !ok, onClick: () => save(files, wanted(), false, reload) }, "保存"),
      fresh ? null : (0, import_react3.createElement)("button", { className: "sq-btn", onClick: async () => {
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
  const [form, setForm] = (0, import_react3.useState)(start);
  (0, import_react3.useEffect)(() => setForm(start), [teamId, workflowId]);
  const roles = (team?.members ?? []).map((entry) => entry.role_ref);
  const setStep = (index, patch) => setForm((current) => ({ ...current, steps: current.steps.map((step2, i) => i === index ? { ...step2, ...patch } : step2) }));
  const ok = validId(form.id) && form.steps.length > 0 && form.steps.every((step2) => validId(step2.id) && step2.role_ref && step2.goal?.trim());
  const wanted = () => ({ [`teams/${teamId}/workflows/${form.id}.json`]: workflowDoc(form) });
  return (0, import_react3.createElement)(
    "div",
    { className: "sq-card" },
    (0, import_react3.createElement)("h3", null, fresh ? `给小队 ${teamId} 新建流程` : `流程 ${teamId} / ${workflowId}`),
    (0, import_react3.createElement)(Field, { label: "流程 ID" }, (0, import_react3.createElement)("input", { className: "sq-input", value: form.id, disabled: !fresh, onChange: (event) => setForm((current) => ({ ...current, id: event.target.value })) })),
    (0, import_react3.createElement)(
      "table",
      { className: "sq-table" },
      (0, import_react3.createElement)("thead", null, (0, import_react3.createElement)("tr", null, ["步骤 ID", "角色", "类型", "目标", "在哪一步之后", ""].map((label) => (0, import_react3.createElement)("th", { key: label }, label)))),
      (0, import_react3.createElement)("tbody", null, form.steps.map((step2, index) => (0, import_react3.createElement)(
        "tr",
        { key: index },
        (0, import_react3.createElement)("td", null, (0, import_react3.createElement)("input", { className: "sq-input", value: step2.id, onChange: (event) => setStep(index, { id: event.target.value }) })),
        (0, import_react3.createElement)("td", null, (0, import_react3.createElement)("select", { className: "sq-select", value: step2.role_ref, onChange: (event) => setStep(index, { role_ref: event.target.value }) }, (0, import_react3.createElement)("option", { value: "" }, "选择"), roles.map((role) => (0, import_react3.createElement)("option", { key: role, value: role }, role)))),
        (0, import_react3.createElement)("td", null, (0, import_react3.createElement)("select", { className: "sq-select", value: step2.kind || "execute", onChange: (event) => setStep(index, { kind: event.target.value }) }, Object.entries(KINDS).map(([value, label]) => (0, import_react3.createElement)("option", { key: value, value }, label)))),
        (0, import_react3.createElement)("td", null, (0, import_react3.createElement)("textarea", { className: "sq-text", style: { minHeight: 40 }, value: step2.goal ?? "", onChange: (event) => setStep(index, { goal: event.target.value }) })),
        (0, import_react3.createElement)(
          "td",
          null,
          (0, import_react3.createElement)(
            "select",
            { className: "sq-select", value: step2.depends_on?.[0]?.step ?? "", onChange: (event) => setStep(index, { depends_on: event.target.value ? [{ step: event.target.value, condition: step2.depends_on?.[0]?.condition || "acceptance_accepted" }] : [] }) },
            (0, import_react3.createElement)("option", { value: "" }, "一开始就做"),
            form.steps.filter((_, i) => i !== index).map((other) => (0, import_react3.createElement)("option", { key: other.id, value: other.id }, other.id))
          ),
          step2.depends_on?.[0] ? (0, import_react3.createElement)("select", { className: "sq-select", value: step2.depends_on[0].condition, onChange: (event) => setStep(index, { depends_on: [{ ...step2.depends_on[0], condition: event.target.value }] }) }, Object.entries(CONDITION).map(([value, label]) => (0, import_react3.createElement)("option", { key: value, value }, label))) : null
        ),
        (0, import_react3.createElement)("td", null, (0, import_react3.createElement)("button", { className: "sq-btn", "data-kind": "danger", onClick: () => setForm((current) => ({ ...current, steps: current.steps.filter((_, i) => i !== index) })) }, "删除"))
      )))
    ),
    (0, import_react3.createElement)(
      "div",
      { className: "sq-row" },
      (0, import_react3.createElement)("button", { className: "sq-btn", onClick: () => setForm((current) => ({ ...current, steps: [...current.steps, { id: `step-${current.steps.length + 1}`, role_ref: roles[0] ?? "", kind: "execute", goal: "", depends_on: current.steps.length > 0 ? [{ step: current.steps.at(-1).id, condition: "acceptance_accepted" }] : [] }] })) }, "加一步"),
      (0, import_react3.createElement)("button", { className: "sq-btn", disabled: !ok, onClick: () => save(files, wanted(), true, reload) }, "检查"),
      (0, import_react3.createElement)("button", { className: "sq-btn", "data-kind": "primary", disabled: !ok, onClick: () => save(files, wanted(), false, reload) }, "保存")
    )
  );
}
function ConfigTab() {
  const [{ files, error }, reload] = useConfig();
  const bound = useStore((state) => state.teams);
  const [selected, setSelected] = (0, import_react3.useState)(null);
  if (error) return (0, import_react3.createElement)("div", { className: "sq-main" }, (0, import_react3.createElement)("div", { className: "sq-card" }, `读不到配置：${error}`));
  if (files === null) return (0, import_react3.createElement)("div", { className: "sq-main" }, (0, import_react3.createElement)("div", { className: "sq-muted" }, "读取中…"));
  const { roles, teams } = configOf(files);
  const item = (key2, title, sub) => (0, import_react3.createElement)("button", { key: key2, className: "sq-item", "data-on": selected?.key === key2 || void 0, onClick: () => setSelected({ key: key2 }) }, (0, import_react3.createElement)("div", null, title), sub ? (0, import_react3.createElement)("div", { className: "sq-muted" }, sub) : null);
  const key = selected?.key ?? "";
  let editor = (0, import_react3.createElement)("div", { className: "sq-muted" }, "选择左边的小队、流程或角色，或新建一个。小队由角色组成，流程规定先做什么、后做什么。");
  const [kind, a, b] = key.split(":");
  if (kind === "team") editor = (0, import_react3.createElement)(TeamEditor, { id: a, team: teams[a], roles, files, reload });
  if (kind === "new-team") editor = (0, import_react3.createElement)(TeamEditor, { roles, files, reload, fresh: true });
  if (kind === "role") editor = (0, import_react3.createElement)(RoleEditor, { id: a, role: roles[a], files, reload });
  if (kind === "new-role") editor = (0, import_react3.createElement)(RoleEditor, { files, reload, fresh: true });
  if (kind === "flow") editor = (0, import_react3.createElement)(WorkflowEditor, { teamId: a, team: teams[a], workflowId: b, files, reload });
  if (kind === "new-flow") editor = (0, import_react3.createElement)(WorkflowEditor, { teamId: a, team: teams[a], files, reload, fresh: true });
  return (0, import_react3.createElement)(
    import_react3.Fragment,
    null,
    (0, import_react3.createElement)(
      "div",
      { className: "sq-side" },
      (0, import_react3.createElement)("div", { className: "sq-muted" }, "小队"),
      Object.values(teams).map((team) => (0, import_react3.createElement)(
        import_react3.Fragment,
        { key: team.id },
        item(`team:${team.id}`, team.id, `${team.members?.length ?? 0} 个角色 · ${bound[team.id] ? "已绑定到群" : "未绑定"}`),
        Object.keys(team.workflows ?? {}).map((workflowId) => item(`flow:${team.id}:${workflowId}`, `　流程 ${workflowId}`, `${team.workflows[workflowId].steps.length} 步`)),
        item(`new-flow:${team.id}`, "　＋ 新建流程")
      )),
      item("new-team", "＋ 新建小队"),
      (0, import_react3.createElement)("div", { className: "sq-muted" }, "角色"),
      Object.entries(roles).map(([roleId, role]) => item(`role:${roleId}`, roleId, role.description)),
      item("new-role", "＋ 新建角色")
    ),
    (0, import_react3.createElement)("div", { className: "sq-main" }, editor)
  );
}

// src/reports.js
var import_react4 = require("react");
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
  return (0, import_react4.createElement)("div", { style: { display: "flex", flexDirection: "column", gap: 4 } }, groups.map((group, index) => (0, import_react4.createElement)(
    "div",
    { key: group.id, className: "sq-row", style: { flexWrap: "nowrap" } },
    (0, import_react4.createElement)("span", { style: { width: 28 } }, group.id),
    (0, import_react4.createElement)("div", { style: { flex: 1 } }, (0, import_react4.createElement)("div", { className: "sq-bar", style: { width: `${values[index] / max * 100}%` } })),
    (0, import_react4.createElement)("span", { className: "sq-muted", style: { width: 110, textAlign: "right" } }, `${fmt(values[index], 1)} ${unit}`)
  )));
}
function Report({ report }) {
  const groups = report.groups ?? [];
  return (0, import_react4.createElement)(
    "div",
    { className: "sq-card" },
    (0, import_react4.createElement)("h3", null, report.title ?? report.id),
    (0, import_react4.createElement)("div", { className: "sq-muted" }, `${report.created} · 模型 ${report.model?.model ?? "?"}${report.model?.effort ? `（${report.model.effort}）` : ""} · 每组 ${report.repeats ?? "?"} 次`),
    report.mock ? (0, import_react4.createElement)("div", { className: "sq-banner", style: { borderRadius: 8 } }, "这份报告用的是脚本化的 mock 模型，只验证实验流程能跑通，数字不代表真实效果。") : null,
    (0, import_react4.createElement)("div", null, `任务：${report.task?.goal ?? ""}`),
    (0, import_react4.createElement)(
      "table",
      { className: "sq-table" },
      (0, import_react4.createElement)("thead", null, (0, import_react4.createElement)("tr", null, ["组", "做法", "成功", "平均耗时", "平均模型调用", "平均 Token", "审核", "返工", "人工介入"].map((label) => (0, import_react4.createElement)("th", { key: label }, label)))),
      (0, import_react4.createElement)("tbody", null, groups.map((group) => (0, import_react4.createElement)(
        "tr",
        { key: group.id },
        (0, import_react4.createElement)("td", null, group.id),
        (0, import_react4.createElement)("td", null, GROUP[group.id] ?? group.label),
        (0, import_react4.createElement)("td", null, `${group.summary?.succeeded ?? 0}/${group.runs?.length ?? 0}`),
        (0, import_react4.createElement)("td", null, `${fmt(group.summary?.mean_seconds, 1)} 秒`),
        (0, import_react4.createElement)("td", null, fmt(group.summary?.mean_model_calls, 1)),
        (0, import_react4.createElement)("td", null, fmt(group.summary?.mean_tokens)),
        (0, import_react4.createElement)("td", null, fmt(group.summary?.reviews)),
        (0, import_react4.createElement)("td", null, fmt(group.summary?.reworks)),
        (0, import_react4.createElement)("td", null, fmt(group.summary?.human_actions))
      )))
    ),
    (0, import_react4.createElement)(
      "div",
      { className: "sq-grid" },
      (0, import_react4.createElement)("div", null, (0, import_react4.createElement)("div", { className: "sq-muted" }, "平均 Token（含辅助调用）"), (0, import_react4.createElement)(Bars, { groups, pick: (s) => s?.mean_tokens, unit: "" })),
      (0, import_react4.createElement)("div", null, (0, import_react4.createElement)("div", { className: "sq-muted" }, "平均耗时"), (0, import_react4.createElement)(Bars, { groups, pick: (s) => s?.mean_seconds, unit: "秒" }))
    ),
    (report.notes ?? []).length > 0 ? (0, import_react4.createElement)("ul", { className: "sq-muted" }, report.notes.map((note, index) => (0, import_react4.createElement)("li", { key: index }, note))) : null
  );
}
function ReportsTab() {
  const [reports, setReports] = (0, import_react4.useState)(null);
  const [error, setError] = (0, import_react4.useState)(null);
  (0, import_react4.useEffect)(() => {
    call("reports").then(setReports, (failure) => setError(failure.message));
  }, []);
  return (0, import_react4.createElement)(
    "div",
    { className: "sq-main" },
    error ? (0, import_react4.createElement)("div", { className: "sq-card" }, `读不到报告：${error}`) : null,
    reports === null && !error ? (0, import_react4.createElement)("div", { className: "sq-muted" }, "读取中…") : null,
    reports?.length === 0 ? (0, import_react4.createElement)("div", { className: "sq-card" }, (0, import_react4.createElement)(import_react4.Fragment, null, "还没有实验报告。用 ", (0, import_react4.createElement)("code", null, "node dsh_squad/experiments/run.mjs"), " 跑一次对照实验后会出现在这里。")) : null,
    (reports ?? []).map((report) => (0, import_react4.createElement)(Report, { key: report.id, report }))
  );
}

// src/shell.js
var TABS = { runs: "运行", config: "小队与规则", reports: "实验报告" };
var open = (patch) => store.set((state) => ({ ...state, open: true, ...patch }));
var close = () => store.set((state) => ({ ...state, open: false, preview: null }));
function SquadButton({ wide }) {
  const waiting = useStore((state) => (state.approvals ?? []).length);
  return (0, import_react5.createElement)(
    "button",
    { className: "sq-foot", title: "Squad 小队", onClick: () => open({}) },
    (0, import_react5.createElement)(
      "svg",
      { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true },
      (0, import_react5.createElement)("circle", { cx: 8, cy: 9, r: 3 }),
      (0, import_react5.createElement)("circle", { cx: 16, cy: 9, r: 3 }),
      (0, import_react5.createElement)("path", { d: "M3 19c0-3 2.5-5 5-5s5 2 5 5M11 19c0-3 2.5-5 5-5s5 2 5 5" })
    ),
    wide === false ? null : (0, import_react5.createElement)("span", null, waiting > 0 ? `小队（${waiting} 待批准）` : "小队")
  );
}
function Banner() {
  const connected = useStore((state) => state.connected);
  const stale = useStore((state) => state.projection.stale && state.projection.snapshot !== null);
  const error = useStore((state) => state.projection.error);
  const failures = useStore((state) => state.errors ?? []);
  if (failures.length > 0) {
    const why = { CONFIG_VERSION_CONFLICT: "小队配置改过但版本号没变，请在「小队与规则」里保存一次（会自动升版本）", ROLE_SNAPSHOT_MISMATCH: "角色说明改过，正在重新登记" };
    return (0, import_react5.createElement)("div", { className: "sq-banner" }, `有 ${failures.length} 个成员没能接上 Controller：${failures.slice(0, 3).map((failure) => `${failure.agentId}（${why[failure.code] ?? failure.message}）`).join("；")}`);
  }
  if (connected === false) return (0, import_react5.createElement)("div", { className: "sq-banner" }, "还没连上 Squad Controller：请用 dsh_squad/deploy/dsh-squad up 启动这个项目。");
  if (stale) return (0, import_react5.createElement)("div", { className: "sq-banner" }, `连接中断，正在重新读取最新状态…${error ? `（${error}）` : ""}`);
  return null;
}
function Console() {
  const tab = useStore((state) => state.tab);
  const runId = useStore((state) => state.runId);
  (0, import_react5.useEffect)(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (store.get().preview) store.set((state) => ({ ...state, preview: null }));
      else close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const body = tab === "config" ? (0, import_react5.createElement)(ConfigTab) : tab === "reports" ? (0, import_react5.createElement)(ReportsTab) : [(0, import_react5.createElement)("div", { key: "side", className: "sq-side" }, (0, import_react5.createElement)(RunList)), (0, import_react5.createElement)("div", { key: "main", className: "sq-main" }, (0, import_react5.createElement)(RunDetail, { runId }))];
  return (0, import_react5.createElement)(
    "div",
    { className: "sq-root", role: "dialog", "aria-label": "Squad 小队", onMouseDown: (event) => {
      if (event.target === event.currentTarget) close();
    } },
    (0, import_react5.createElement)(
      "div",
      { className: "sq-shell" },
      (0, import_react5.createElement)(
        "div",
        { className: "sq-head" },
        (0, import_react5.createElement)("span", { className: "sq-title" }, "Squad 小队"),
        (0, import_react5.createElement)("div", { className: "sq-tabs", role: "tablist" }, Object.entries(TABS).map(([id, label]) => (0, import_react5.createElement)("button", { key: id, role: "tab", className: "sq-tab", "data-on": tab === id || void 0, "aria-selected": tab === id, onClick: () => store.set((state) => ({ ...state, tab: id })) }, label))),
        (0, import_react5.createElement)("span", { className: "sq-spacer" }),
        (0, import_react5.createElement)("button", { className: "sq-x", "aria-label": "关闭", onClick: close }, "×")
      ),
      (0, import_react5.createElement)(Banner),
      (0, import_react5.createElement)("div", { className: "sq-body" }, body)
    )
  );
}
function Preview({ preview }) {
  return (0, import_react5.createElement)(
    "div",
    { className: "sq-root", style: { background: "rgba(0,0,0,.45)" }, onMouseDown: (event) => {
      if (event.target === event.currentTarget) store.set((state) => ({ ...state, preview: null }));
    } },
    (0, import_react5.createElement)(
      "div",
      { className: "sq-preview" },
      (0, import_react5.createElement)("div", { className: "sq-head" }, (0, import_react5.createElement)("span", { className: "sq-title" }, `预览：${preview.name ?? ""}`), (0, import_react5.createElement)("span", { className: "sq-muted" }, "隔离运行，读不到 DS Bot 的登录和数据"), (0, import_react5.createElement)("span", { className: "sq-spacer" }), (0, import_react5.createElement)("button", { className: "sq-x", "aria-label": "关闭预览", onClick: () => store.set((state) => ({ ...state, preview: null })) }, "×")),
      (0, import_react5.createElement)("iframe", { src: preview.url, sandbox: "allow-scripts", referrerPolicy: "no-referrer", title: preview.name ?? "preview" })
    )
  );
}
function Toast() {
  const toast2 = useStore((state) => state.toast);
  (0, import_react5.useEffect)(() => {
    if (!toast2) return void 0;
    const timer2 = setTimeout(() => store.set((state) => state.toast === toast2 ? { ...state, toast: null } : state), 4e3);
    return () => clearTimeout(timer2);
  }, [toast2]);
  return toast2 ? (0, import_react5.createElement)("div", { className: "sq-toast", role: "status" }, toast2.text) : null;
}
var owner = null;
function SquadOverlay() {
  const isOpen = useStore((state) => state.open);
  const preview = useStore((state) => state.preview);
  const [self] = (0, import_react5.useState)(() => /* @__PURE__ */ Symbol("overlay"));
  const [, redraw] = (0, import_react5.useState)(0);
  (0, import_react5.useEffect)(() => {
    if (owner === null) owner = self;
    redraw((n) => n + 1);
    return () => {
      if (owner === self) owner = null;
    };
  }, []);
  if (owner !== self) return null;
  return (0, import_react_dom.createPortal)((0, import_react5.createElement)("div", { "data-squad": "overlay" }, isOpen ? (0, import_react5.createElement)(Console) : null, preview ? (0, import_react5.createElement)(Preview, { preview }) : null, (0, import_react5.createElement)(Toast)), document.body);
}
function GroupDock({ sessionId }) {
  const teams = useStore((state) => state.teams);
  const snapshot = useStore((state) => state.projection.snapshot);
  const teamId = Object.entries(teams ?? {}).find(([, team]) => team.roomId === sessionId)?.[0];
  if (teamId === void 0) return null;
  const run = runsOf(snapshot).find((candidate) => candidate.team_id === teamId);
  const tasks = run ? tasksOf(snapshot, run.run_id).filter((task) => task.kind !== "leader_step") : [];
  const done = tasks.filter((task) => task.state === "completed").length;
  return (0, import_react5.createElement)(
    "div",
    { className: "sq-dock" },
    (0, import_react5.createElement)("strong", null, `小队 ${teamId}`),
    run ? (0, import_react5.createElement)("span", null, `${RUN_PHASE[run.phase] ?? run.phase} · ${done}/${tasks.length} 个任务完成`) : (0, import_react5.createElement)("span", { className: "sq-muted" }, "还没有 Run"),
    run && !terminal(run.phase) ? (0, import_react5.createElement)("span", { className: "sq-muted" }, "在这里说的话会作为补充说明交给 Leader") : null,
    (0, import_react5.createElement)("span", { className: "sq-spacer", style: { flex: 1 } }),
    (0, import_react5.createElement)("button", { className: "sq-btn", onClick: () => open({ tab: "runs", runId: run?.run_id ?? null }) }, run ? "查看进度" : "开始")
  );
}

// src/styles.js
var CSS = `
.sq-root{--sq-bg:#fbfbfa;--sq-panel:#ffffff;--sq-line:#e4e2dd;--sq-text:#1f1e1c;--sq-muted:#6f6b64;--sq-accent:#3d5afe;--sq-ok:#1f8a4c;--sq-warn:#b26a00;--sq-bad:#c62828;--sq-chip:#f1efea;
  position:fixed;inset:0;z-index:2147480000;display:flex;align-items:stretch;justify-content:center;background:rgba(20,18,15,.38);font:14px/1.5 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--sq-text)}
@media (prefers-color-scheme:dark){.sq-root{--sq-bg:#1b1a18;--sq-panel:#23221f;--sq-line:#3a3833;--sq-text:#eceae5;--sq-muted:#a29e95;--sq-accent:#8c9eff;--sq-ok:#5cc489;--sq-warn:#e0a54a;--sq-bad:#ef6f6c;--sq-chip:#2f2d29}}
.sq-shell{margin:24px;flex:1;max-width:1280px;background:var(--sq-bg);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.25)}
.sq-head{display:flex;align-items:center;gap:16px;padding:12px 18px;border-bottom:1px solid var(--sq-line);background:var(--sq-panel)}
.sq-title{font-weight:650;font-size:16px}
.sq-tabs{display:flex;gap:4px}
.sq-tab{border:0;background:none;color:var(--sq-muted);padding:6px 12px;border-radius:8px;cursor:pointer;font:inherit}
.sq-tab[data-on]{background:var(--sq-chip);color:var(--sq-text);font-weight:600}
.sq-spacer{flex:1}
.sq-x{border:0;background:none;font-size:20px;color:var(--sq-muted);cursor:pointer;padding:0 6px}
.sq-banner{padding:6px 18px;background:#fff4e0;color:#7a4b00;font-size:13px}
@media (prefers-color-scheme:dark){.sq-banner{background:#3a2c12;color:#f3cf8b}}
.sq-body{flex:1;display:flex;min-height:0}
.sq-side{width:300px;border-right:1px solid var(--sq-line);overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.sq-main{flex:1;overflow:auto;padding:16px 20px;display:flex;flex-direction:column;gap:16px}
.sq-item{border:1px solid var(--sq-line);border-radius:10px;padding:8px 10px;background:var(--sq-panel);cursor:pointer;text-align:left;font:inherit;color:inherit}
.sq-item[data-on]{border-color:var(--sq-accent);box-shadow:0 0 0 1px var(--sq-accent)}
.sq-muted{color:var(--sq-muted);font-size:12px}
.sq-chip{display:inline-block;white-space:nowrap;padding:1px 8px;border-radius:999px;background:var(--sq-chip);font-size:12px;margin-right:6px}
.sq-chip[data-tone=ok]{color:var(--sq-ok)}.sq-chip[data-tone=warn]{color:var(--sq-warn)}.sq-chip[data-tone=bad]{color:var(--sq-bad)}
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
.sq-dock{display:flex;align-items:center;gap:8px;padding:6px 10px;margin:0 0 6px;border:1px solid #e4e2dd;border-radius:10px;font-size:13px}
.sq-bar{height:8px;border-radius:4px;background:var(--sq-accent)}
`;
function installStyles() {
  const style = document.createElement("style");
  style.dataset.squad = "page";
  style.textContent = CSS;
  document.head.append(style);
  return () => style.remove();
}

// src/index.js
var inject = ["slots"];
function apply(ctx) {
  ctx.effect(() => installStyles(), "squad: styles");
  ctx.effect(() => startFeed(), "squad: projection feed");
  const fill = (name, options, component) => ctx.effect(() => ctx.slots.inject(name, () => ctx.slots.register({ name, ...options }, component)), `squad: ${name}`);
  fill("sidebar.footer.action", { id: "squad-open", order: -250 }, SquadButton);
  fill("shell.overlay", { id: "squad", order: 70 }, SquadOverlay);
  fill("conversation.input.dock", { id: "squad-run", order: -130 }, GroupDock);
}
return Object.defineProperty({ ...module.exports }, Symbol.toStringTag, { value: 'Module' })
  },
})
