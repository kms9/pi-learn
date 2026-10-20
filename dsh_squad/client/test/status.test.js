import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reasonOf, runStatusOf, statusOf } from '../src/status.js'
import { summaryOf } from '../src/summary.js'

const t = (extra = {}) => ({ task_id: 'task-1', run_id: 'run-1', kind: 'execute', state: 'running', revision: 1, dependencies: [], blockers: [], attempt_ids: ['attempt-1'], goal: '制作课件', ...extra })
const a = (extra = {}) => ({ attempt_id: 'attempt-1', task_id: 'task-1', state: 'running', cleanup_state: 'pending', ...extra })

// Every row of the plan's §3.1 table, in order.
test('rule 1: replaced, cancelled → stopped', () => {
  assert.deepEqual(statusOf(t({ superseded_by: 'task-2', state: 'completed' })), { status: 'stopped', note: '已被返工替代' })
  assert.equal(statusOf(t({ state: 'cancelled' })).status, 'stopped')
})

test('rule 2: approvals, human acceptance → needs you', () => {
  assert.equal(statusOf(t(), { approvals: [{ taskId: 'task-1' }] }).note, '等你批准工具')
  assert.equal(statusOf(t({ state: 'completed', result: { hash: 'h' }, acceptance_policy: { mode: 'human' } })).status, 'attention')
})

test('rule 3: an end nobody confirmed → failed, uncertain', () => {
  for (const error of ['host_restart', 'outcome_unknown', 'controller_restart', 'lease_expired', 'session_changed']) {
    const s = statusOf(t({ state: 'needs_review' }), { attempts: [a({ state: 'needs_review', error })] })
    assert.equal(s.status, 'failed', error)
    assert.equal(s.uncertain, true, error)
    assert.equal(s.reason, reasonOf(error))
  }
})

test('rule 4: failed, missing result, rejected, budget → failed with a reason', () => {
  const missing = statusOf(t({ state: 'needs_review' }), { attempts: [a({ state: 'needs_review', error: 'RESULT_MISSING', cleanup_state: 'released' })] })
  assert.equal(missing.status, 'failed')
  assert.equal(missing.reason, '这一步结束时没有提交结果。')
  const blocked = statusOf(t({ state: 'needs_review', blockers: [{ kind: 'attempt_budget', resource: 'task-1' }], attempt_ids: ['a', 'b', 'c'] }))
  assert.match(blocked.reason, /重试了 3 次/)
  assert.equal(statusOf(t({ state: 'failed', attempt_ids: [] })).status, 'failed')
})

test('rule 5/6: done when accepted; a review is done with its verdict; waiting review is running', () => {
  assert.equal(statusOf(t({ state: 'completed', acceptance: { decision: 'accepted' } })).status, 'done')
  assert.deepEqual(statusOf(t({ kind: 'review', state: 'completed', result: { value: { decision: 'rejected' } } })), { status: 'done', note: '退回' })
  assert.deepEqual(statusOf(t({ state: 'completed', result: { hash: 'h' }, acceptance_policy: { mode: 'review' } })), { status: 'running', note: '等审核' })
})

test('rule 7: running, proposed, waiting for children → running', () => {
  assert.equal(statusOf(t({ state: 'running' })).note, '执行中')
  assert.equal(statusOf(t({ state: 'result_proposed' })).note, '已提交，收尾中')
  assert.equal(statusOf(t({ state: 'waiting_dependency' }), { attempts: [a({ state: 'suspended' })] }).note, '等子任务')
})

test('rule 8: planned, queued, waiting on dependencies → not started', () => {
  const tasks = [t({ task_id: 'task-0', goal: '梳理知识点' })]
  assert.deepEqual(statusOf(t({ state: 'queued', attempt_ids: [], blockers: [{ kind: 'dependencies' }], dependencies: [{ task_id: 'task-0' }] }), { tasks }), { status: 'waiting', note: '等待：梳理知识点' })
  assert.equal(statusOf(t({ state: 'planned', attempt_ids: [] })).status, 'waiting')
})

test('every reason code in §3.2 has words; an unknown one says so', () => {
  for (const code of ['RESULT_MISSING', 'host_restart', 'outcome_unknown', 'controller_restart', 'lease_expired', 'session_changed', 'acceptance_failed', 'attempt_budget', 'GATE_NOT_READY', 'model_mismatch', 'dependency_interrupted', 'manual_interference']) {
    assert.doesNotMatch(reasonOf(code), /出了点问题/, code)
  }
  assert.match(reasonOf('SOMETHING_NEW'), /出了点问题（SOMETHING_NEW）/)
})

test('the Run card: queued, held, failed final check, done', () => {
  assert.deepEqual(runStatusOf({ phase: 'queued_run', admitted: false, waiting_roles: [{ role_id: 'reviewer' }] }), { status: 'waiting', note: '排队：等 reviewer' })
  assert.equal(runStatusOf({ phase: 'running', admitted: true, recovery_hold: true }).status, 'attention')
  assert.equal(runStatusOf({ phase: 'needs_review', admitted: true, recovery_hold: true }).status, 'attention', 'held for a failed step')
  assert.equal(runStatusOf({ phase: 'needs_review', admitted: true, recovery_hold: true, gate_failure: { code: 'ACCEPTANCE_PENDING' } }).status, 'failed', 'the final check refused it')
  assert.equal(runStatusOf({ phase: 'completed' }).status, 'done')
  assert.equal(runStatusOf({ phase: 'running', admitted: true }).status, 'running')
})

test('the summary counts across Teams and lists where to jump', () => {
  const snapshot = { views: {
    runs: [{ run_id: 'run-1', team_id: 'a', phase: 'running', admitted: true, queue_seq: 1 }, { run_id: 'run-2', team_id: 'b', phase: 'queued_run', admitted: false, queue_seq: 2, waiting_roles: [{ role_id: 'reviewer', owner_team_id: 'a' }] }],
    tasks: [t(), t({ task_id: 'task-2', state: 'needs_review', attempt_ids: ['attempt-2'] }), t({ task_id: 'task-3', state: 'completed', result: { hash: 'h' }, acceptance_policy: { mode: 'human' } })],
    attempts: [a(), a({ attempt_id: 'attempt-2', task_id: 'task-2', state: 'needs_review', error: 'RESULT_MISSING', cleanup_state: 'released' })],
    agents: [{ presence: 'online', team_id: 'a' }, { presence: 'offline', team_id: 'b' }],
  } }
  const all = summaryOf(snapshot, [], null)
  assert.equal(all.running, 1)
  assert.deepEqual(all.failed.map(item => item.taskId), ['task-2'])
  assert.deepEqual(all.attention.map(item => item.taskId), ['task-3'])
  assert.equal(all.queued[0].teamId, 'b')
  assert.equal(all.members, 2)
  const held = summaryOf({ views: { ...snapshot.views, runs: [{ ...snapshot.views.runs[0], recovery_hold: true }] } }, [], 'a')
  assert.equal(held.attention.filter(item => item.taskId === null).length, 0, 'a Run held for a failed step is not counted twice')
  const onlyB = summaryOf(snapshot, [], 'b')
  assert.equal(onlyB.failed.length + onlyB.attention.length + onlyB.running, 0)
})
