import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noticeKey, noticesFor, squadLink } from '../src/notices.js'

const run = { run_id: 'run-1', team_id: 'math', goal: '认识分数', phase: 'running', admitted: true, queue_seq: 1 }
const failedTask = { task_id: 't1', run_id: 'run-1', kind: 'execute', state: 'needs_review', goal: '制作课件。细节', revision: 2, dependencies: [], blockers: [], attempt_ids: ['a1'] }
const humanTask = { task_id: 't2', run_id: 'run-1', kind: 'execute', state: 'completed', goal: '检查课件', revision: 3, dependencies: [], blockers: [], attempt_ids: ['a2'], result: { hash: 'h' }, acceptance_policy: { mode: 'human' } }
const snapshot = { views: { runs: [run], tasks: [failedTask, humanTask], attempts: [{ attempt_id: 'a1', task_id: 't1', state: 'needs_review', error: 'host_restart', cleanup_state: 'pending' }, { attempt_id: 'a2', task_id: 't2', state: 'settled', cleanup_state: 'released' }], agents: [] } }

test('one post per Team lists what needs a person, each with a link to its node', () => {
  const [post, ...rest] = noticesFor(snapshot, [])
  assert.equal(rest.length, 0)
  assert.equal(post.teamId, 'math')
  assert.equal(post.keys.length, 2)
  assert.match(post.text, /小队 math 有 2 件事需要你处理/)
  assert.match(post.text, /失败：制作课件/)
  assert.match(post.text, /需要你处理：检查课件/)
  assert.ok(post.text.includes(`(${squadLink({ teamId: 'math', runId: 'run-1', taskId: 't1' })})`))
})

test('what was already posted is not posted again; a new state is', () => {
  const seen = new Set(noticesFor(snapshot, [])[0].keys)
  assert.deepEqual(noticesFor(snapshot, [], seen), [])
  const later = { views: { ...snapshot.views, tasks: [failedTask, { ...humanTask, state: 'needs_review' }], attempts: [...snapshot.views.attempts.slice(0, 1), { ...snapshot.views.attempts[1], state: 'needs_review', error: 'RESULT_MISSING' }] } }
  const posts = noticesFor(later, [], seen)
  assert.equal(posts.length, 1)
  assert.equal(posts[0].keys.length, 1)
})

test('the link names Team, Run and node', () => {
  assert.equal(squadLink({ teamId: 'math', runId: 'run-1', taskId: null }), '/?squad=math%3Arun-1%3A')
  assert.equal(squadLink({ teamId: 'math', runId: 'run-1', taskId: 't1' }, 'http://127.0.0.1:3400/'), 'http://127.0.0.1:3400/?squad=math%3Arun-1%3At1')
  assert.equal(noticeKey({ kind: 'failed', runId: 'r', taskId: 't', note: 'x' }), 'failed|r|t|x')
})
