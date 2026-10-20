// The summary bar's numbers (UI plan §2.1), for one Team or all of them. Pure. No cost
// and no elapsed time: the bar shows people, work and what needs a person.
import { runStatusOf, statusOf } from './status.js'

const runsOfTeam = (snapshot, teamId) => (snapshot?.views?.runs ?? []).filter(run => teamId === null || run.team_id === teamId)

// The Run a Team is on now: the active one, else the newest.
export function currentRun(snapshot, teamId) {
  const runs = runsOfTeam(snapshot, teamId).sort((a, b) => b.queue_seq - a.queue_seq)
  return runs.find(run => run.admitted && !['completed', 'cancelled', 'failed'].includes(run.phase)) ?? runs[0]
}

/**
 * @param {object} snapshot  the Controller's snapshot
 * @param {object[]} approvals  tool approvals waiting (from the adapter)
 * @param {string|null} teamId  null for every Team
 */
export function summaryOf(snapshot, approvals = [], teamId = null) {
  const views = snapshot?.views ?? {}
  const tasks = views.tasks ?? []
  const attempts = views.attempts ?? []
  const teams = teamId === null ? [...new Set((views.runs ?? []).map(run => run.team_id))] : [teamId]
  const members = (views.agents ?? []).filter(agent => !agent.revoked && (teamId === null || agent.team_id === teamId))
  const out = { members: members.length, online: members.filter(agent => agent.presence === 'online').length, running: 0, attention: [], failed: [], queued: [] }
  for (const team of teams) {
    const run = currentRun(snapshot, team)
    if (run === undefined) continue
    const runState = runStatusOf(run)
    const item = (extra) => ({ teamId: team, runId: run.run_id, ...extra })
    if (runState.status === 'attention') out.attention.push(item({ taskId: null, title: run.goal, note: runState.note }))
    if (runState.status === 'failed') out.failed.push(item({ taskId: null, title: run.goal, note: runState.reason }))
    if (runState.status === 'waiting' && !run.admitted) out.queued.push(item({ title: run.goal, note: runState.note, owner: run.waiting_roles?.[0]?.owner_team_id }))
    const own = tasks.filter(task => task.run_id === run.run_id && task.kind !== 'leader_step')
    for (const task of own) {
      const state = statusOf(task, { attempts, approvals, tasks: own })
      if (state.status === 'running') out.running += 1
      if (state.status === 'attention') out.attention.push(item({ taskId: task.task_id, title: task.goal, note: state.note }))
      if (state.status === 'failed') out.failed.push(item({ taskId: task.task_id, title: task.goal, note: state.reason }))
    }
  }
  return out
}
