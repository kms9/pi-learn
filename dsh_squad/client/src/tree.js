// The Run as a tree (UI plan §2.2), from the Controller's snapshot. Pure.
//
// The Leader is the root. Workflow steps and the Leader's dispatches hang under it; a
// delegated child under its parent; a review under the task it reviews; a rework under
// the task it replaces (D4). Each retry of a task is its own node under the attempt
// before it, older attempts grey (D5); what hangs under the task hangs under its last
// attempt. Leader steps are not nodes: the root counts them.
import { runStatusOf, statusOf } from './status.js'

const byTime = (a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || String(a.task_id).localeCompare(String(b.task_id))

/** The task a node hangs under, or null for the root. */
export function parentOf(task) {
  const origin = task.origin
  if (origin?.kind === 'review' || origin?.kind === 'rework' || origin?.kind === 'delegate') return origin.by ?? null
  // Data from before origins were recorded.
  if (task.kind === 'review') return task.dependencies?.[0]?.task_id ?? null
  if (task.rework_of) return task.rework_of
  if (task.parent_id) return task.parent_id
  return null
}

export function oneLine(task, tasks = []) {
  if (task.title) return task.title
  if (task.kind === 'review') {
    const target = tasks.find(candidate => candidate.task_id === parentOf(task))
    return `审核：${target ? oneLine(target, tasks) : '上一步的结果'}`
  }
  const first = String(task.goal ?? '').split(/[。\n]/)[0].trim()
  return first.length > 40 ? `${first.slice(0, 40)}…` : first
}

/**
 * @param {object} snapshot
 * @param {string} runId
 * @param {{approvals?:object[], bots?:Record<string, object>}} context
 */
export function treeOf(snapshot, runId, { approvals = [], bots = {} } = {}) {
  const views = snapshot?.views ?? {}
  const run = (views.runs ?? []).find(candidate => candidate.run_id === runId)
  if (run === undefined) return undefined
  const all = (views.tasks ?? []).filter(task => task.run_id === runId)
  const tasks = all.filter(task => task.kind !== 'leader_step').sort(byTime)
  const attempts = views.attempts ?? []
  const agents = views.agents ?? []
  const who = (agentId) => {
    const agent = agents.find(candidate => candidate.binding?.agent_id === agentId)
    const bot = agent?.host?.bot_id ? bots[agent.host.bot_id] : undefined
    return { agentId, botId: agent?.host?.bot_id ?? null, name: bot?.name ?? agentId ?? '', look: bot ?? null, model: agent?.route?.model ?? bot?.model?.split('/').pop() ?? null }
  }
  const root = {
    id: `run:${run.run_id}`, kind: 'run', run, title: run.goal, role: 'Leader', member: who(run.leader?.agent_id),
    state: runStatusOf(run), decisions: all.filter(task => task.kind === 'leader_step').length, children: [], deps: [],
  }
  const nodes = new Map([[root.id, root]])
  const last = new Map()
  for (const task of tasks) {
    const own = (task.attempt_ids ?? []).map(id => attempts.find(attempt => attempt.attempt_id === id)).filter(Boolean)
    const state = statusOf(task, { attempts, approvals, tasks })
    // Each node gets its own children and deps: a shared array would hang an attempt
    // under itself.
    const base = () => ({ kind: 'task', task, title: oneLine(task, tasks), role: task.role_id, member: who(task.target?.agent_id ?? task.expected_target?.agent_id), children: [], deps: [] })
    const chain = own.length <= 1 ? [{ ...base(), id: task.task_id, attemptNo: own.length, attempt: own[0], state }]
      : own.map((attempt, index) => ({
        ...base(),
        id: index === 0 ? task.task_id : `${task.task_id}#${index + 1}`,
        attemptNo: index + 1,
        attempt,
        state: index === own.length - 1 ? { ...state, note: [`第 ${index + 1} 次`, state.note].filter(Boolean).join(' · ') } : { status: 'stopped', note: `第 ${index + 1} 次（已重试）`, reason: attempt.error ? undefined : undefined },
      }))
    for (let i = 1; i < chain.length; i += 1) chain[i - 1].children.push(chain[i])
    for (const node of chain) nodes.set(node.id, node)
    last.set(task.task_id, chain.at(-1))
  }
  for (const task of tasks) {
    const first = nodes.get(task.task_id)
    const parent = parentOf(task)
    const under = parent !== null && last.has(parent) ? last.get(parent) : root
    under.children.push(first)
    // Order between siblings, drawn as faint lines: dependencies not already the parent.
    for (const dep of task.dependencies ?? []) {
      if (dep.task_id !== parent && last.has(dep.task_id)) first.deps.push(last.get(dep.task_id).id)
    }
  }
  return { root, nodes }
}

/** Every node under a node (not itself). */
export function descendants(node) {
  const out = []
  const walk = (current) => { for (const child of current.children) { out.push(child); walk(child) } }
  walk(node)
  return out
}

/**
 * Which subtrees start folded: finished ones (done or stopped all the way down), unless
 * they hold something that needs a person or failed (UI plan §2.2).
 */
export function autoFolded(root) {
  const folded = new Set()
  const settled = node => ['done', 'stopped'].includes(node.state.status)
  const walk = (node) => {
    for (const child of node.children) walk(child)
    if (node.children.length === 0 || node.kind === 'run') return
    const below = descendants(node)
    if (settled(node) && below.every(settled)) folded.add(node.id)
  }
  walk(root)
  return folded
}
