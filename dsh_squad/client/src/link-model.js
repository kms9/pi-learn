// The ?squad= link a group reminder carries (P2 = C). Pure.
/** The Team, Run and node a ?squad= value names, or undefined. Pure. */
export function parseSquadLink(search) {
  const value = new URLSearchParams(search ?? '').get('squad')
  if (!value) return undefined
  const [teamId, runId, taskId] = value.split(':')
  if (!teamId || !runId) return undefined
  return { teamId, runId, taskId: taskId || null }
}
