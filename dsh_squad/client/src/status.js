// The five states people see (UI plan §3): running, done, needs you, failed, stopped,
// plus a neutral "not started" that is none of them. Every internal state, blocker and
// error code maps to one of these, first matching rule wins. Pure.

export const STATUS = {
  running: { key: 'running', label: '进行中' },
  done: { key: 'done', label: '完成' },
  attention: { key: 'attention', label: '需要你处理' },
  failed: { key: 'failed', label: '失败' },
  stopped: { key: 'stopped', label: '已停止' },
  waiting: { key: 'waiting', label: '未开始' },
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted'])
// Ends whose outcome nobody could confirm: the work may or may not have happened.
const UNCERTAIN = new Set(['host_restart', 'outcome_unknown', 'controller_restart', 'lease_expired', 'session_changed', 'extension_reload', 'manual_interference', 'manual_compaction'])

/** One line for people, from an internal reason code (§3.2). */
export function reasonOf(code, detail = {}) {
  const name = detail.taskName ? `「${detail.taskName}」` : '它依赖的任务'
  switch (code) {
    case 'RESULT_MISSING': return '这一步结束时没有提交结果。'
    case 'host_restart': return 'DS Bot 中途重启，不确定这一步做完没有。'
    case 'outcome_unknown': return '没能确认这一步是否真正结束。'
    case 'controller_restart': return 'Squad 服务中途重启，这一步被暂停了。'
    case 'lease_expired': return '这一步很久没有回应（可能卡住或电脑休眠过）。'
    case 'session_changed': return '这个成员换了新的对话段，原来的工作停在一半。'
    case 'acceptance_failed':
    case 'acceptance_rejected': return `结果没有通过验收${detail.reason ? `：${detail.reason}` : '。'}`
    case 'attempt_budget': return `已经重试了 ${detail.attempts ?? '多'} 次仍没完成。`
    case 'GATE_NOT_READY':
    case 'ACCEPTANCE_PENDING':
    case 'EXECUTION_UNCONFIRMED':
    case 'DEPENDENCY_PENDING': return `最后检查没通过：${detail.taskName ? `「${detail.taskName}」还没完成或没通过审核。` : '还有任务没完成或没通过审核。'}`
    case 'model_mismatch': return '这个成员的模型变了，为保证一致没有继续。'
    case 'dependency_interrupted': return `${name}没有完成。`
    case 'manual_interference':
    case 'manual_compaction':
    case 'extension_reload': return '这一步被手动打断了。'
    case 'human_attestation': return '已确认停止。'
    case 'self_review': return '审核人和作者是同一个角色，没法独立审核。'
    case 'review_budget':
    case 'TASK_BUDGET_EXHAUSTED': return '任务数量超过了小队的上限。'
    case 'write_authorization_invalid': return '这一步要写的文件不在允许的范围内。'
    case 'context_unavailable': return '读不到这个角色的工作规则。'
    case 'result_ref_invalid': return '它要用的上游结果已经变了。'
    case 'binding_changed': return '负责这一步的成员换了。'
    case 'primary_offline':
    case 'agent_offline': return '负责这一步的成员不在线。'
    default: return `出了点问题（${code ?? '未知'}）。`
  }
}

const latestAttempt = (task, attempts) => {
  const id = task.attempt_ids?.at(-1)
  return id === undefined ? undefined : attempts.find(attempt => attempt.attempt_id === id)
}
const blockerKinds = task => new Set((task.blockers ?? []).map(blocker => blocker.kind))

/**
 * A task's state for people, with a short secondary note and, for failures, the reason.
 * @param {object} task  a task contract from the snapshot
 * @param {{attempts?:object[], approvals?:object[], tasks?:object[]}} context
 * @returns {{status:string, note:string, reason?:string, code?:string}}
 */
export function statusOf(task, { attempts = [], approvals = [], tasks = [] } = {}) {
  const attempt = latestAttempt(task, attempts)
  const kinds = blockerKinds(task)
  const nameOf = id => tasks.find(candidate => candidate.task_id === id)?.goal
  // 1. Replaced, cancelled, superseded: grey.
  if (task.superseded_by) return { status: 'stopped', note: '已被返工替代' }
  if (task.state === 'cancelled') return { status: 'stopped', note: task.acceptance?.reason?.includes('忽略') ? '已忽略' : '已取消' }
  // 2. Waiting on a person.
  if (approvals.some(entry => entry.taskId === task.task_id)) return { status: 'attention', note: '等你批准工具' }
  if (task.state === 'completed' && task.result && !task.acceptance && task.acceptance_policy?.mode === 'human') return { status: 'attention', note: '等你验收' }
  // 3. An end nobody could confirm.
  const uncertain = attempt && attempt.cleanup_state !== 'released' && (task.state === 'needs_review' || task.state === 'interrupted')
  if (uncertain) {
    const code = UNCERTAIN.has(attempt.error) ? attempt.error : (attempt.error || 'outcome_unknown')
    return { status: 'failed', note: '需要确认', code, reason: reasonOf(code), uncertain: true }
  }
  // 4. Failed.
  if (task.state === 'failed' || task.state === 'needs_review' || task.state === 'interrupted') {
    const blocker = (task.blockers ?? [])[0]
    const code = attempt?.error || blocker?.kind || (task.acceptance?.decision === 'rejected' ? 'acceptance_rejected' : task.state)
    return { status: 'failed', note: '没能完成', code, reason: reasonOf(code, { reason: task.acceptance?.reason, attempts: task.attempt_ids?.length, taskName: nameOf(blocker?.resource) }) }
  }
  // 5. Done.
  if (task.state === 'completed') {
    if (task.kind === 'review') return { status: 'done', note: task.result?.value?.decision === 'rejected' ? '退回' : '通过' }
    if (task.acceptance?.decision === 'accepted') return { status: 'done', note: '' }
    if (task.acceptance?.decision === 'rejected') return { status: 'stopped', note: '被退回' }
    // 6. Done but its review has not decided yet.
    return { status: 'running', note: '等审核' }
  }
  // 7. Running.
  if (task.state === 'result_proposed') return { status: 'running', note: '已提交，收尾中' }
  if (attempt?.state === 'suspended') return { status: 'running', note: '等子任务' }
  if (task.state === 'running' || task.state === 'dispatching') return { status: 'running', note: '执行中' }
  // 8. Not started.
  if (kinds.has('dependencies')) {
    const waits = (task.dependencies ?? []).map(dep => nameOf(dep.task_id)).filter(Boolean)
    return { status: 'waiting', note: waits.length ? `等待：${waits[0].slice(0, 12)}` : '等待依赖' }
  }
  if (kinds.has('primary_offline') || kinds.has('agent_offline')) return { status: 'waiting', note: '成员不在线' }
  return { status: 'waiting', note: '排队' }
}

/** A Run's state for people (the Leader's card). */
export function runStatusOf(run, { heldPending = 0 } = {}) {
  if (run === undefined) return { status: 'waiting', note: '' }
  if (run.phase === 'completed') return { status: 'done', note: '已完成' }
  if (run.phase === 'cancelled') return { status: 'stopped', note: '已结束' }
  if (run.recovery_hold && run.phase !== 'needs_review') return { status: 'attention', note: '系统重启后待确认' }
  if (run.phase === 'needs_review' || run.phase === 'failed' || run.phase === 'interrupted') {
    const code = run.gate_failure?.code ?? 'GATE_NOT_READY'
    return { status: 'failed', note: '终审没通过', code, reason: reasonOf(code, { taskName: run.gate_failure?.task_goal }) }
  }
  if (heldPending > 0) return { status: 'attention', note: `${heldPending} 条消息待处理` }
  if (!run.admitted) {
    const wait = run.waiting_roles?.[0]
    return { status: 'waiting', note: wait ? `排队：等 ${wait.role_id}` : '排队' }
  }
  return { status: 'running', note: run.phase === 'planning' ? '规划中' : '进行中' }
}

export const isTerminal = state => TERMINAL.has(state)
