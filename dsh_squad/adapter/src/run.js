// What a Run looks like to its Leader: one line per business task and what is left to
// decide. Pure; the tasks come from the Controller's snapshot. The Leader still makes
// the decision (squad_decide); this only lays the facts out, and the Controller's final
// gate checks them again.

const short = id => String(id ?? '').slice(0, 13)

export function runStatus(tasks, runId) {
  const own = (tasks ?? []).filter(task => task.run_id === runId && task.kind !== 'leader_step')
  const lines = own.map((task) => {
    const acceptance = task.acceptance?.decision ?? 'none'
    const extra = [
      task.rework_of ? `rework of ${task.rework_of}` : '',
      task.superseded_by ? `superseded by ${task.superseded_by}` : '',
      task.kind === 'review' && task.result?.value?.decision ? `verdict ${task.result.value.decision}: ${String(task.result.value.reason ?? '').slice(0, 120)}` : '',
    ].filter(Boolean).join('; ')
    return `- ${task.task_id} | ${task.kind} | role ${task.role_id} | ${task.state} | acceptance ${acceptance}${extra ? ` | ${extra}` : ''} | goal: ${String(task.goal).slice(0, 80)}`
  })
  const reworked = new Set(own.map(task => task.rework_of).filter(Boolean))
  const rejected = own.filter(task => task.kind !== 'review' && task.acceptance?.decision === 'rejected' && !task.superseded_by && !reworked.has(task.task_id))
  const terminal = state => ['completed', 'failed', 'cancelled', 'interrupted'].includes(state)
  const open = own.filter(task => !terminal(task.state))
  const done = own.length > 0 && own.every((task) => {
    if (task.kind === 'review') return terminal(task.state)
    if (task.superseded_by || task.state === 'cancelled') return true
    return task.state === 'completed' && task.acceptance?.decision === 'accepted'
  })
  return {
    lines,
    rejected: rejected.map(task => ({ taskId: task.task_id, roleId: task.role_id, goal: task.goal })),
    open: open.length,
    done,
    summary: done ? 'every business task is accepted: complete the Run'
      : rejected.length > 0 ? `rejected without rework: ${rejected.map(task => `${task.task_id} (role ${task.role_id})`).join(', ')}; dispatch rework`
        : `${open.length} task(s) still open: wait`,
  }
}

export { short }
