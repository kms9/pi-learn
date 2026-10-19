// What the Squad page shows, derived from the Controller's snapshot. Pure.

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted'])
export const terminal = state => TERMINAL.has(state)

export const RUN_PHASE = {
  queued_run: '排队中', planning: '规划中', running: '进行中', completed: '已完成',
  failed: '失败', cancelled: '已取消', interrupted: '已中断',
}
export const TASK_STATE = {
  planned: '待开始', queued: '排队', waiting_dependency: '等待依赖', dispatching: '派发中',
  running: '执行中', result_proposed: '已提交', completed: '已完成', needs_review: '需人工处理',
  failed: '失败', cancelled: '已取消', interrupted: '已中断',
}
export const KIND = { execute: '执行', review: '审核', rework: '返工', ask: '提问', leader_step: 'Leader' }

export const runsOf = snapshot => [...(snapshot?.views?.runs ?? [])].sort((a, b) => b.queue_seq - a.queue_seq)
export const tasksOf = (snapshot, runId) => (snapshot?.views?.tasks ?? []).filter(task => task.run_id === runId)
export const attemptsOf = (snapshot, taskId) => (snapshot?.views?.attempts ?? []).filter(attempt => attempt.task_id === taskId)

/**
 * The Run's task graph for drawing: business tasks and reviews as nodes, Leader steps
 * left out; edges from dependencies, review targets and rework. Nodes get a column by
 * longest path from the sources and a row within the column.
 */
export function graphOf(tasks) {
  const nodes = tasks.filter(task => task.kind !== 'leader_step')
  const ids = new Set(nodes.map(task => task.task_id))
  const edges = []
  for (const task of nodes) {
    for (const dep of task.dependencies ?? []) if (ids.has(dep.task_id)) edges.push({ from: dep.task_id, to: task.task_id, kind: dep.condition })
    if (task.rework_of && ids.has(task.rework_of)) edges.push({ from: task.rework_of, to: task.task_id, kind: 'rework' })
  }
  const into = new Map(nodes.map(task => [task.task_id, []]))
  for (const edge of edges) into.get(edge.to).push(edge.from)
  const column = new Map()
  const depth = (id, seen = new Set()) => {
    if (column.has(id)) return column.get(id)
    if (seen.has(id)) return 0
    seen.add(id)
    const parents = into.get(id) ?? []
    const value = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(parent => depth(parent, seen)))
    column.set(id, value)
    return value
  }
  for (const task of nodes) depth(task.task_id)
  const rows = new Map()
  const placed = nodes.map((task) => {
    const col = column.get(task.task_id)
    const row = rows.get(col) ?? 0
    rows.set(col, row + 1)
    return { task, col, row }
  })
  return { nodes: placed, edges, columns: Math.max(0, ...placed.map(node => node.col)) + 1, rows: Math.max(0, ...rows.values()) }
}

/**
 * The cards that ask a person to act. Three kinds of buttons stay apart (D5):
 * - answer: questions for the user (a Leader step that needs guidance: tasks waiting with
 *   no way on, or a Run on recovery hold) — answered as Run Guidance;
 * - approve: a tool approval a managed member waits on;
 * - accept: a result whose acceptance policy is human.
 * Recovery cards cover executions that need a decision (needs_review, interrupted).
 * Every card carries the revision it was drawn for.
 */
export function cardsOf(snapshot, runId, approvals = []) {
  const tasks = tasksOf(snapshot, runId)
  const run = runsOf(snapshot).find(candidate => candidate.run_id === runId)
  const cards = []
  for (const task of tasks) {
    if (task.kind !== 'leader_step' && task.state === 'completed' && task.acceptance == null && task.acceptance_policy?.mode === 'human' && task.result) {
      cards.push({ type: 'accept', key: `accept:${task.task_id}:${task.revision}`, task, expectedRevision: task.revision, resultHash: task.result.hash })
    }
    const blockedOnBinding = (task.blockers ?? []).some(blocker => ['primary_offline', 'binding_changed'].includes(blocker.kind))
    if (task.state === 'needs_review' || (task.state === 'interrupted' && attemptsOf(snapshot, task.task_id).some(attempt => attempt.cleanup_state !== 'released')) || (blockedOnBinding && task.kind !== 'leader_step')) {
      const attempts = attemptsOf(snapshot, task.task_id)
      const attempt = attempts.filter(candidate => candidate.cleanup_state !== 'released').at(-1)
      const ids = new Set(attempts.map(candidate => candidate.attempt_id))
      // Results that arrived after their execution was fenced off, kept as evidence.
      const late = (snapshot?.views?.evidence ?? []).filter(row => ids.has(row.attempt_id) && row.disposition === 'rejected_late_or_stale')
      // Runtimes of the same role that could take the work over (role swap).
      const primary = (snapshot?.views?.roles ?? []).find(role => role.role_id === task.role_id)
      const others = (snapshot?.views?.agents ?? []).filter(agent => agent.role_id === task.role_id && agent.mode === 'role' && agent.presence === 'online' && agent.binding?.agent_id !== primary?.primary_agent_id)
      cards.push({ type: 'recover', key: `recover:${task.task_id}:${task.revision}`, task, attempt, attempts: attempts.length, late, primary, others, expectedRevision: task.revision })
    }
    if (task.kind === 'review' && task.state === 'completed' && task.result?.value?.decision) {
      cards.push({ type: 'review', key: `review:${task.task_id}`, task, verdict: task.result.value })
    }
  }
  for (const entry of approvals) {
    if (tasks.some(task => task.task_id === entry.taskId)) {
      const attempt = (snapshot?.views?.attempts ?? []).find(candidate => candidate.attempt_id === entry.attemptId)
      cards.push({ type: 'approve', key: `approve:${entry.id}`, approval: entry, attemptId: entry.attemptId, expectedRevision: attempt?.revision })
    }
  }
  // Waiting for another Run's role (role_busy, earlier_run) is queueing, not a question:
  // the Run header says what it waits for. Only a held Run asks the user.
  const asks = (run?.blockers ?? []).filter(blocker => !['role_busy', 'earlier_run', 'active_run'].includes(blocker.kind))
  if (run && !terminal(run.phase) && (run.recovery_hold || asks.length > 0)) {
    cards.push({ type: 'answer', key: `answer:${run.run_id}:${run.revision}`, run, expectedRevision: run.revision, why: run.recovery_hold ? 'Controller 重启后 Run 暂停，需要确认后继续' : asks.map(blocker => blocker.kind).join('、') })
  }
  return cards
}

/** Artifacts of the Run's results, newest version first. */
export function artifactsOf(tasks) {
  const out = []
  for (const task of tasks) {
    for (const artifact of task.result?.artifacts ?? []) {
      out.push({ ...artifact, taskId: task.task_id, kind: task.kind, accepted: task.acceptance?.decision === 'accepted', superseded: Boolean(task.superseded_by), resultRevision: task.result.revision })
    }
  }
  return out.reverse()
}

// A review's goal is the Controller's instruction to the reviewer; people read what it
// reviews instead.
export function goalOf(task, tasks = []) {
  if (task.kind !== 'review') return task.goal
  const target = tasks.find(candidate => candidate.task_id === task.dependencies?.[0]?.task_id)
  return target ? `审核「${target.role_id}」的结果：${target.goal}` : '独立审核'
}

/** What a queued Run waits for, in words; empty when it does not wait on another Run. */
export const waitingOf = run => (run?.waiting_roles ?? []).map(wait => `等待角色 ${wait.role_id}（被小队 ${wait.owner_team_id} 的 Run 占用）`)

export const short = id => String(id ?? '').replace(/^(task|run|attempt)-/, '').slice(0, 8)
