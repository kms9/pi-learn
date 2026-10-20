// What the overview needs about each Team (UI plan §2.4). Pure, so it is tested
// without a page.
import { runStatusOf, statusOf } from './status.js'
import { currentRun } from './summary.js'

/** Every Team the page knows: configured ones and bound ones, with where each stands. */
export function teamsOf(snapshot, bound = {}, approvals = []) {
  const views = snapshot?.views ?? {}
  const ids = [...new Set([...(views.teams ?? []).map(team => team.config?.team_id), ...Object.keys(bound)].filter(Boolean))].sort()
  const held = (views.held_inputs ?? []).filter(row => row.disposition === 'pending')
  return ids.map((id) => {
    const run = currentRun(snapshot, id)
    const counts = { running: 0, done: 0, attention: 0, failed: 0, stopped: 0, waiting: 0 }
    const tasks = run ? (views.tasks ?? []).filter(task => task.run_id === run.run_id && task.kind !== 'leader_step') : []
    for (const task of tasks) counts[statusOf(task, { attempts: views.attempts ?? [], approvals, tasks }).status] += 1
    const agents = new Set((bound[id]?.members ?? []).map(member => member.agentId))
    return {
      id, run, runState: run ? runStatusOf(run) : { status: 'waiting', note: '还没有 Run' }, counts,
      room: bound[id]?.roomName ?? null, bound: Boolean(bound[id]), members: bound[id]?.members ?? [],
      // One group message is held once per member; the card shows it once.
      held: held.filter(row => agents.has(row.binding?.agent_id)).filter((row, i, rows) => rows.findIndex(other => other.text === row.text) === i),
    }
  })
}

/** Teams other than this one where the same Bot works too. */
export function alsoIn(botId, teamId, bound = {}) {
  if (!botId) return []
  return Object.entries(bound).filter(([id, team]) => id !== teamId && (team.members ?? []).some(member => member.botId === botId)).map(([id]) => id)
}
