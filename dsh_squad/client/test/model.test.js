import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY, acceptSnapshot, lost, readEvents } from '../src/projection.js'
import { artifactsOf, cardsOf, graphOf } from '../src/model.js'

test('an older snapshot cannot replace a newer one; a new epoch always does', () => {
  let p = acceptSnapshot(EMPTY, { controller_epoch: 1, revision: 10, views: {} })
  assert.equal(p.revision, 10)
  assert.equal(acceptSnapshot(p, { controller_epoch: 1, revision: 7, views: {} }), p)
  p = acceptSnapshot(p, { controller_epoch: 2, revision: 3, views: {} })
  assert.equal(p.epoch, 2)
  assert.equal(p.revision, 3)
  assert.equal(lost(p, new Error('offline')).stale, true)
})

test('events only say when to read the snapshot again', () => {
  const p = { ...EMPTY, epoch: 1, revision: 10 }
  assert.deepEqual(readEvents(p, { controller_epoch: 1, events: [] }), { resnapshot: false, cursor: 10 })
  assert.equal(readEvents(p, { controller_epoch: 1, events: [{ seq: 11 }] }).resnapshot, true)
  assert.equal(readEvents(p, { controller_epoch: 1, events: [{ seq: 14 }] }).resnapshot, true, 'a gap')
  assert.equal(readEvents(p, { controller_epoch: 2, events: [] }).resnapshot, true, 'a restarted Controller')
  assert.equal(readEvents(p, undefined).resnapshot, true, 'a lost page')
})

const run = { run_id: 'run-1', phase: 'running', revision: 5, queue_seq: 1, blockers: [] }
const tasks = [
  { task_id: 'task-a', run_id: 'run-1', kind: 'execute', state: 'completed', revision: 4, dependencies: [], acceptance: { decision: 'rejected' }, superseded_by: 'task-c', result: { revision: 4, artifacts: [{ name: 'v1.html', sha256: 'aa' }] } },
  { task_id: 'task-b', run_id: 'run-1', kind: 'review', state: 'completed', revision: 3, dependencies: [{ task_id: 'task-a', condition: 'execution_completed' }], result: { value: { decision: 'rejected', reason: 'thin' } } },
  { task_id: 'task-c', run_id: 'run-1', kind: 'rework', rework_of: 'task-a', state: 'needs_review', revision: 2, dependencies: [] },
  { task_id: 'task-d', run_id: 'run-1', kind: 'execute', state: 'completed', revision: 6, dependencies: [], acceptance_policy: { mode: 'human' }, result: { hash: 'h6', revision: 6, artifacts: [] } },
  { task_id: 'task-l', run_id: 'run-1', kind: 'leader_step', state: 'running', revision: 1, dependencies: [] },
]
const snapshot = { views: { runs: [run], tasks, attempts: [{ attempt_id: 'attempt-x', task_id: 'task-c', cleanup_state: 'pending', revision: 9, target: { runtime_id: 'r' } }] } }

test('the graph leaves Leader steps out and places by dependency depth', () => {
  const g = graphOf(tasks)
  assert.equal(g.nodes.length, 4)
  const col = id => g.nodes.find(node => node.task.task_id === id).col
  assert.equal(col('task-a'), 0)
  assert.equal(col('task-b'), 1)
  assert.equal(col('task-c'), 1)
  assert.ok(g.edges.some(edge => edge.kind === 'rework'))
})

test('cards: accept for human results, recover, review verdicts, approvals, each with its revision', () => {
  const cards = cardsOf(snapshot, 'run-1', [{ id: 'ap-1', attemptId: 'attempt-x', taskId: 'task-c', tool: 'write' }])
  const of = type => cards.filter(card => card.type === type)
  assert.equal(of('accept')[0].task.task_id, 'task-d')
  assert.equal(of('accept')[0].expectedRevision, 6)
  assert.equal(of('accept')[0].resultHash, 'h6')
  assert.equal(of('recover')[0].attempt.attempt_id, 'attempt-x')
  assert.deepEqual(of('recover')[0].late, [])
  assert.equal(of('review')[0].verdict.decision, 'rejected')
  assert.equal(of('approve')[0].expectedRevision, 9)
  assert.equal(of('answer').length, 0)
  const held = cardsOf({ views: { ...snapshot.views, runs: [{ ...run, recovery_hold: true }] } }, 'run-1')
  assert.equal(held.filter(card => card.type === 'answer').length, 1)
})

test('a review reads as what it reviews', async () => {
  const { goalOf } = await import('../src/model.js')
  assert.match(goalOf(tasks[1], tasks), /^审核「undefined」|^审核/)
  assert.equal(goalOf(tasks[0], tasks), tasks[0].goal)
})

test('a recovery card offers the late result and the other runtimes of the role', async () => {
  const { cardsOf } = await import('../src/model.js')
  const views = {
    runs: [run],
    tasks: [{ task_id: 'task-z', run_id: 'run-1', kind: 'execute', role_id: 'builder', state: 'needs_review', revision: 3, dependencies: [], blockers: [{ kind: 'primary_offline' }] }],
    attempts: [{ attempt_id: 'attempt-z', task_id: 'task-z', cleanup_state: 'released', revision: 4 }],
    evidence: [{ seq: 7, attempt_id: 'attempt-z', disposition: 'rejected_late_or_stale' }],
    roles: [{ role_id: 'builder', primary_agent_id: 'a-builder' }],
    agents: [{ mode: 'role', role_id: 'builder', presence: 'online', binding: { agent_id: 'b-builder' } }, { mode: 'role', role_id: 'builder', presence: 'online', binding: { agent_id: 'a-builder' } }],
  }
  const [card] = cardsOf({ views }, 'run-1').filter(candidate => candidate.type === 'recover')
  assert.equal(card.attempt, undefined)
  assert.equal(card.attempts, 1)
  assert.equal(card.late[0].seq, 7)
  assert.deepEqual(card.others.map(agent => agent.binding.agent_id), ['b-builder'])
})

test('artifacts list every version, the rejected one marked as superseded', () => {
  const list = artifactsOf(tasks)
  assert.equal(list.length, 1)
  assert.equal(list[0].superseded, true)
})
