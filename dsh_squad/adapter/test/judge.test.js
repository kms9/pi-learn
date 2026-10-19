import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { newAttempt, observe, verdictOf } from '../src/judge.js'

const PROBES = join(import.meta.dirname, '..', '..', '..', 'probes')
const fold = (attempt, facts) => facts.reduce(observe, attempt)
const attempt = (extra = {}) => newAttempt({ attemptId: 'a1', sessionId: 's1', fence: 1, turn: 3, pid: 100, ...extra })

test('completed only when live end, durable end, call pairing and approvals all agree', () => {
  const ran = fold(attempt(), [{ type: 'tool/call', callId: 'c1' }, { type: 'dispatch/start' }, { type: 'dispatch/end' }, { type: 'tool/result', callId: 'c1' }])
  assert.equal(verdictOf(ran).verdict, 'running')
  const ended = observe(ran, { type: 'turn/end', turn: 3, kind: 'completed' })
  assert.equal(verdictOf(ended).verdict, 'awaiting_durable')
  assert.equal(verdictOf(observe(ended, { type: 'durable', kind: 'completed' })).verdict, 'settled_completed')
  assert.equal(verdictOf(observe(ended, { type: 'durable', kind: undefined })).verdict, 'outcome_unknown')
  // A turn end for another turn of the Session is not this attempt's.
  assert.equal(verdictOf(observe(ran, { type: 'turn/end', turn: 4, kind: 'completed' })).verdict, 'running')
})

test('an open call, a running dispatch or a waiting approval keeps a completed turn unknown', () => {
  const end = [{ type: 'turn/end', turn: 3, kind: 'completed' }, { type: 'durable', kind: 'completed' }]
  const open = verdictOf(fold(attempt(), [{ type: 'tool/call', callId: 'c1' }, ...end]))
  assert.equal(open.verdict, 'outcome_unknown')
  assert.deepEqual(open.open, ['c1'])
  assert.equal(verdictOf(fold(attempt(), [{ type: 'dispatch/start' }, ...end])).verdict, 'outcome_unknown')
  assert.equal(verdictOf(fold(attempt(), [{ type: 'approval/start' }, ...end])).verdict, 'outcome_unknown')
  assert.equal(verdictOf(fold(attempt(), [{ type: 'approval/start' }, { type: 'approval/end' }, ...end])).verdict, 'settled_completed')
})

test('aborted, blocked and failed turns are settled but never completed', () => {
  assert.equal(verdictOf(observe(attempt(), { type: 'turn/end', turn: 3, kind: 'aborted' })).verdict, 'settled_aborted')
  assert.equal(verdictOf(observe(attempt(), { type: 'turn/end', turn: 3, kind: 'blocked' })).verdict, 'settled_blocked')
  assert.equal(verdictOf(observe(attempt(), { type: 'turn/end', turn: 3, kind: 'model_mismatch' })).verdict, 'settled_failed')
})

test('a restart during the attempt leaves it unknown unless the durable log shows its end', () => {
  const cut = observe(attempt(), { type: 'host/restarted' })
  assert.equal(verdictOf(cut).verdict, 'outcome_unknown')
  assert.equal(verdictOf(observe(cut, { type: 'durable', kind: undefined })).verdict, 'outcome_unknown')
  assert.equal(verdictOf(observe(cut, { type: 'durable', kind: 'interrupted' })).verdict, 'outcome_unknown')
  // The turn had already finished and was written out before the host went down.
  assert.equal(verdictOf(observe(cut, { type: 'durable', kind: 'completed' })).verdict, 'settled_completed')
})

// Replays of P0 recordings. The mock run's probe kept the turn/end reason only as a
// summary: "[object kind,reason]" is the user-aborted turn and "[object kind]" a
// completed one there (the DSH durable logs of that run said so, see the P0 report).
const kindOf = line => line.reason?.kind ?? (line.data?.reason === '[object kind,reason]' ? 'aborted' : line.data?.reason === '[object kind]' ? 'completed' : line.data?.reason?.kind)
function replay(file, sessionPrefix, turn, durable) {
  const lines = readFileSync(join(PROBES, file), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  const mine = lines.filter(line => line.session?.startsWith(sessionPrefix))
  const first = mine.find(line => line.event === 'session/event' && line.type === 'turn/start' && line.data?.turn === turn)
  let state = attempt({ sessionId: first.session, turn, pid: first.pid })
  let pid = first.pid
  for (const line of lines.slice(lines.indexOf(first) + 1)) {
    if (line.pid !== pid) { state = observe(state, { type: 'host/restarted' }); pid = line.pid }
    if (line.session !== first.session || line.event !== 'session/event') continue
    if (line.type === 'tool/call') state = observe(state, { type: 'tool/call', callId: line.data?.callId })
    if (line.type === 'tool/result') state = observe(state, { type: 'tool/result', callId: line.data?.message?.toolCallId })
    if (line.type === 'turn/end') state = observe(state, { type: 'turn/end', turn: line.data?.turn, kind: kindOf(line) })
  }
  return durable === undefined ? state : observe(state, { type: 'durable', kind: durable })
}

test('P0 mock S6: the user-stopped group turn is settled as aborted', () => {
  assert.equal(verdictOf(replay('scenarios/S6-cancel.jsonl', 'session-5c8383fc', 3, 'aborted')).verdict, 'settled_aborted')
})

test('P0 mock S4: the turn the restart cut is unknown, before and after DSH writes `interrupted`', () => {
  // Builder's turn 3: no live end before the host went down; its next turn (4) is the
  // resumed replay, which is not the same attempt.
  assert.equal(verdictOf(replay('scenarios/S4-restart.jsonl', 'session-9b37d195', 3)).verdict, 'outcome_unknown')
  assert.equal(verdictOf(replay('scenarios/S4-restart.jsonl', 'session-9b37d195', 3, 'interrupted')).verdict, 'outcome_unknown')
})

test('P0 mock S1: a member turn is completed once the durable end agrees', () => {
  assert.equal(verdictOf(replay('scenarios/S1-mention.jsonl', 'session-5c8383fc', 1)).verdict, 'awaiting_durable')
  assert.equal(verdictOf(replay('scenarios/S1-mention.jsonl', 'session-5c8383fc', 1, 'completed')).verdict, 'settled_completed')
})

test('P0 real S8: the PTC turn pairs its run_code call and completes', () => {
  const state = replay('scenarios-real/S8-ptc-nested.jsonl', 'session-0b78b997', 1, 'completed')
  assert.ok(Object.keys(state.calls).length >= 1)
  assert.equal(verdictOf(state).verdict, 'settled_completed')
})

test('a durable read while the attempt still runs confirms nothing', () => {
  const polled = observe(attempt(), { type: 'durable', kind: undefined })
  assert.equal(polled.durableChecked, false)
  const ended = observe(polled, { type: 'turn/end', turn: 3, kind: 'completed' })
  assert.equal(verdictOf(ended).verdict, 'awaiting_durable')
  assert.equal(verdictOf(observe(ended, { type: 'durable', kind: 'completed' })).verdict, 'settled_completed')
})
