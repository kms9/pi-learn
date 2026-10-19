import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { hostTools, refusal, TASK_TOOLS } from '../src/toolset.js'
import { endReport, nextReceipt, resultValue } from '../src/reports.js'
import { contextHash, taskSection } from '../src/context.js'
import { createClient, ControllerError } from '../src/controller.js'

test('contract tools map to DSH names; task tools are always in', () => {
  const tools = hostTools(['read', 'find'])
  for (const name of ['read', 'read_image', 'glob', ...TASK_TOOLS]) assert.ok(tools.has(name), name)
  assert.ok(!tools.has('bash'))
  assert.ok(!tools.has('write'))
})

test('a formal attempt refuses what its contract does not allow', () => {
  const attempt = { allowedTools: ['read'] }
  assert.equal(refusal('read', attempt, true), undefined)
  assert.equal(refusal('squad_submit_result', attempt, true), undefined)
  assert.match(refusal('bash', attempt, true), /not allowed/)
  assert.match(refusal('message_bot', attempt, true), /not allowed/)
  assert.match(refusal('read', undefined, true), /none is running/)
  // A free Session keeps its tools, but cannot use the task tools.
  assert.equal(refusal('bash', undefined, false), undefined)
  assert.match(refusal('squad_submit_result', undefined, false), /only in a Squad task/)
  // The stand-in admits without a contract: the host's tools stay.
  assert.equal(refusal('bash', {}, true), undefined)
})

test('receipts go out in order and only as far as the facts go', () => {
  assert.equal(nextReceipt([], { delivered: false, opened: false }), 'adapter_received')
  assert.equal(nextReceipt(['adapter_received'], { delivered: false, opened: false }), undefined)
  assert.equal(nextReceipt(['adapter_received'], { delivered: true, opened: false }), 'injection_requested')
  assert.equal(nextReceipt(['adapter_received', 'injection_requested'], { delivered: true, opened: true }), 'input_observed')
  assert.equal(nextReceipt(['adapter_received', 'injection_requested', 'input_observed'], { delivered: true, opened: true }), undefined)
})

test('verdicts end the attempt as settled or as an interruption', () => {
  assert.deepEqual(endReport({ verdict: 'settled_completed' }), { kind: 'settled', outcome: 'completed' })
  assert.deepEqual(endReport({ verdict: 'settled_aborted' }), { kind: 'settled', outcome: 'aborted' })
  assert.deepEqual(endReport({ verdict: 'outcome_unknown' }), { kind: 'interrupt', reason: 'outcome_unknown' })
  assert.deepEqual(endReport({ verdict: 'outcome_unknown' }, { hostRestarted: true }), { kind: 'interrupt', reason: 'host_restart' })
  assert.equal(endReport({ verdict: 'running' }), undefined)
  assert.equal(endReport({ verdict: 'awaiting_durable' }), undefined)
})

test('a result is the model JSON object, or its text as an answer', () => {
  assert.deepEqual(resultValue('{"steps":3}'), { steps: 3 })
  assert.deepEqual(resultValue('three steps'), { answer: 'three steps' })
  assert.deepEqual(resultValue('[1,2]'), { answer: '[1,2]' })
  assert.equal(resultValue('  '), undefined)
})

test('the task section names the goal, the tools and how to finish', () => {
  const text = taskSection({
    task: { task_id: 'task-1', kind: 'execute', goal: 'explain fractions', refs: [] },
    attempt: { attempt_no: 1, context: { role: { name: 'builder', body: 'You build.' }, team_instructions: 'Be clear.', allowed_tools: ['read'] } },
  })
  assert.match(text, /explain fractions/)
  assert.match(text, /squad_submit_result/)
  assert.match(text, /besides the task tools: read/)
  assert.equal(contextHash(text).length, 64)
  assert.equal(taskSection({}), '')
})

test('the client sends squad/3 headers and the exact binding', async () => {
  let seen
  const server = createServer((req, res) => {
    seen = { url: req.url, headers: req.headers }
    if (req.url === '/v2/dispatches') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ dispatches: [{ attempt: { attempt_id: 'a1' } }] }))
      return
    }
    res.statusCode = 409
    res.end(JSON.stringify({ code: 'STALE_EXECUTION', message: 'old' }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const client = createClient({ endpoint: `http://127.0.0.1:${server.address().port}`, controllerId: 'ctl-1' })
  const runtime = { token: 'secret', binding: { agent_id: 'builder-bot', runtime_id: 'r', session_id: 's', binding_epoch: 2, primary_epoch: 1 } }
  try {
    const out = await client.dispatches(runtime)
    assert.equal(out[0].attempt.attempt_id, 'a1')
    assert.equal(seen.headers['x-squad-protocol'], 'squad/3')
    assert.equal(seen.headers['x-squad-controller'], 'ctl-1')
    assert.equal(seen.headers.authorization, 'Bearer secret')
    assert.deepEqual(JSON.parse(seen.headers['x-squad-binding']), runtime.binding)
    await assert.rejects(client.attemptEvent(runtime, 'a1', { type: 'renew' }), error => error instanceof ControllerError && error.code === 'STALE_EXECUTION')
  } finally {
    server.close()
  }
})

test('the Leader sees each task and what is left to decide', async () => {
  const { runStatus } = await import('../src/run.js')
  const base = { run_id: 'run-1', goal: 'g' }
  const build = { ...base, task_id: 'task-b', kind: 'execute', role_id: 'builder', state: 'completed', acceptance: { decision: 'rejected' } }
  const review = { ...base, task_id: 'task-r', kind: 'review', role_id: 'reviewer', state: 'completed', result: { value: { decision: 'rejected', reason: 'too short' } } }
  let status = runStatus([build, review, { ...base, task_id: 'task-l', kind: 'leader_step', state: 'running' }], 'run-1')
  assert.equal(status.lines.length, 2)
  assert.deepEqual(status.rejected.map(item => item.taskId), ['task-b'])
  assert.match(status.summary, /dispatch rework/)
  const rework = { ...base, task_id: 'task-w', kind: 'rework', role_id: 'builder', rework_of: 'task-b', state: 'running' }
  status = runStatus([build, review, rework], 'run-1')
  assert.equal(status.rejected.length, 0)
  assert.match(status.summary, /still open: wait/)
  status = runStatus([{ ...build, superseded_by: 'task-w' }, review, { ...rework, state: 'completed', acceptance: { decision: 'accepted' } }], 'run-1')
  assert.equal(status.done, true)
  assert.match(status.summary, /complete the Run/)
  assert.equal(runStatus([], 'run-1').done, false)
})

test('a Leader step and a review get their own instructions', () => {
  const attempt = { attempt_no: 1, context: { role: { name: 'chief' }, allowed_tools: [] } }
  const leader = taskSection({ task: { task_id: 'task-l', kind: 'leader_step', goal: 'teach', refs: [] }, attempt, run: { lines: ['- task-b | execute'], summary: 'wait' } })
  assert.match(leader, /## Run status/)
  assert.match(leader, /squad_decide/)
  const review = taskSection({ task: { task_id: 'task-r', kind: 'review', goal: 'check', refs: [] }, attempt })
  assert.match(review, /squad_review/)
  assert.doesNotMatch(review, /squad_submit_result once/)
})
