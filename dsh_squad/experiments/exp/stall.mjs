// Stall check of an experiment Run (decided 2026-10-29; from EXP-02 on). A Run that waits in
// needs_review while nothing changes for a stretch of active time is stalled: the Controller
// has quarantined an execution after a host sleep, and only a person can retry it. The runner
// ends such an attempt, records it as an environment interruption, and runs it again (plan §6).
//
// Active time is the monotonic clock: it does not run while the machine sleeps.

// What the check watches: the Run's phase and every task's state, decision and result revision.
export function progressSignature(run, tasks) {
  const rows = tasks.map(task => [task.task_id, task.state, task.acceptance?.decision ?? null, task.result?.revision ?? null]).sort()
  return JSON.stringify({ phase: run?.phase ?? null, tasks: rows })
}

// `watch` is { signature, since }: the last signature and the active time it last changed.
// Returns true when the Run is in needs_review and has not changed for limitMs of active time.
export function checkStall(watch, run, tasks, activeNow, limitMs) {
  const signature = progressSignature(run, tasks)
  if (signature !== watch.signature) {
    watch.signature = signature
    watch.since = activeNow
    return false
  }
  return run?.phase === 'needs_review' && activeNow - watch.since >= limitMs
}
