import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allowedByPolicy, decideStep, nextRoute, wakeOf } from '../src/policy.js'

const msg = (id, source) => ({ id, source })
const bot = (role, extra = {}) => ({ kind: 'bot', form: 'relay', role, exchangeId: `x-${role}`, ...extra })
const frozen = { provider: 'deepseek-official', model: 'deepseek-v4-pro' }
const binding = (extra = {}) => ({ fence: 2, frozen, policy: {}, ...extra })
const admissions = new Map([['a1', { attemptId: 'a1', fence: 2 }], ['a0', { attemptId: 'a0', fence: 1 }]])
const route = { ...frozen, effort: 'high' }

test('every wake-up DS Bot and DSH produce has a name', () => {
  // The sources P0 recorded, plus retry and resend from the code.
  const cases = [
    [{ kind: 'user', rpcId: 'r' }, 'user'],
    [{ kind: 'schedule' }, 'schedule'],
    [{ kind: 'squad', attemptId: 'a1', fence: 2 }, 'squad'],
    [bot('room'), 'group-relay'],
    [bot('post'), 'group-post'],
    [bot('report'), 'group-report'],
    [bot('request'), 'bot-request'],
    [bot('reply'), 'reply'],
    [bot('stopped'), 'stopped'],
    [bot('handoff'), 'handoff'],
    [bot('kickoff'), 'kickoff'],
    [bot('request', { resumed: true }), 'resume'],
    [bot('resume', { resumed: true }), 'resume'],
    [bot('request', { resent: true }), 'resume'],
    [bot('retry', { retried: true }), 'retry'],
    [bot('room', { retried: true }), 'retry'],
    [undefined, 'unknown'],
  ]
  for (const [source, wake] of cases) assert.equal(wakeOf(source), wake, JSON.stringify(source))
})

test('without an admission no wake-up opens a step, whatever started it', () => {
  for (const source of [{ kind: 'user' }, { kind: 'schedule' }, bot('room'), bot('post'), bot('request'), bot('reply'), bot('stopped'), bot('handoff'), bot('kickoff'), bot('request', { resumed: true }), bot('retry', { retried: true })]) {
    const decision = decideStep({ messages: [msg('m', source)], turn: 3, step: 1 }, binding(), undefined, admissions, route)
    assert.equal(decision.action, 'reject', wakeOf(source))
    assert.equal(decision.reason, 'no_admission')
    assert.deepEqual(decision.hold.map(entry => entry.why), ['no_admission'])
  }
  assert.equal(decideStep({ messages: [], turn: 3, step: 1 }, binding(), undefined, admissions, route).reason, 'no_attempt')
})

test('an admission with the current fence opens one attempt; a stale or unknown one is held', () => {
  const open = decideStep({ messages: [msg('m1', { kind: 'squad', attemptId: 'a1', fence: 2 })], turn: 3, step: 1 }, binding(), undefined, admissions, route)
  assert.equal(open.action, 'enter')
  assert.deepEqual(open.opens, { attemptId: 'a1', fence: 2 })
  const stale = decideStep({ messages: [msg('m0', { kind: 'squad', attemptId: 'a0', fence: 1 })], turn: 3, step: 1 }, binding(), undefined, admissions, route)
  assert.equal(stale.action, 'reject')
  assert.equal(stale.hold[0].why, 'stale_fence')
  const unknown = decideStep({ messages: [msg('m9', { kind: 'squad', attemptId: 'zz', fence: 2 })], turn: 3, step: 1 }, binding(), undefined, admissions, route)
  assert.equal(unknown.hold[0].why, 'unknown_attempt')
})

test('mid-attempt, foreign input is filtered out and the attempt goes on', () => {
  const active = { attemptId: 'a1', fence: 2, turn: 3 }
  const decision = decideStep({ messages: [msg('steer', bot('request')), msg('late', { kind: 'user' })], turn: 3, step: 2 }, binding(), active, admissions, route)
  assert.equal(decision.action, 'enter')
  assert.equal(decision.reason, 'attempt_continues')
  assert.deepEqual(decision.keep, [])
  assert.deepEqual(decision.hold.map(entry => entry.id), ['steer', 'late'])
})

test('policy switches let resume or self-started work through, and only those', () => {
  assert.equal(allowedByPolicy('resume', { allowResume: true }), true)
  assert.equal(allowedByPolicy('resume', { allowSelfStart: true }), false)
  for (const wake of ['handoff', 'stopped', 'reply', 'retry', 'group-report']) assert.equal(allowedByPolicy(wake, { allowSelfStart: true }), true)
  for (const wake of ['user', 'schedule', 'group-relay', 'bot-request']) assert.equal(allowedByPolicy(wake, { allowResume: true, allowSelfStart: true }), false)
  const decision = decideStep({ messages: [msg('h', bot('handoff'))], turn: 1, step: 1 }, binding({ policy: { allowSelfStart: true } }), undefined, admissions, route)
  assert.equal(decision.action, 'enter')
  assert.equal(decision.reason, 'policy_allows')
})

test('a frozen route refuses a fallback before the request goes out', () => {
  const fallback = nextRoute({ lastUsed: { provider: 'deepseek-official', model: 'deepseek-v4-pro' }, pending: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' } })
  assert.deepEqual(fallback, { provider: 'deepseek-official', model: 'deepseek-flash', effort: 'high' })
  const decision = decideStep({ messages: [msg('m1', { kind: 'squad', attemptId: 'a1', fence: 2 })], turn: 3, step: 1 }, binding(), undefined, admissions, fallback)
  assert.equal(decision.action, 'reject')
  assert.equal(decision.reason, 'model_mismatch')
  // The same route, with or without an effort, passes; no frozen route checks nothing.
  assert.equal(decideStep({ messages: [msg('m1', { kind: 'squad', attemptId: 'a1', fence: 2 })], turn: 3, step: 1 }, binding(), undefined, admissions, { ...frozen }).action, 'enter')
  assert.equal(decideStep({ messages: [msg('m1', { kind: 'squad', attemptId: 'a1', fence: 2 })], turn: 3, step: 1 }, binding({ frozen: undefined }), undefined, admissions, fallback).action, 'enter')
  // A fallback mid-attempt stops the attempt at its next step.
  assert.equal(decideStep({ messages: [], turn: 3, step: 2 }, binding(), { attemptId: 'a1', fence: 2, turn: 3 }, admissions, fallback).reason, 'model_mismatch')
})

test('harness input steers a running attempt but never opens one', () => {
  const reminder = msg('r', { kind: 'repeat-tool-reminder' })
  assert.equal(wakeOf(reminder.source), 'harness:repeat-tool-reminder')
  const idle = decideStep({ messages: [reminder], turn: 3, step: 1 }, binding(), undefined, admissions, route)
  assert.equal(idle.action, 'reject')
  const running = decideStep({ messages: [reminder], turn: 3, step: 2 }, binding(), { attemptId: 'a1', fence: 2, turn: 3 }, admissions, route)
  assert.equal(running.action, 'enter')
  assert.deepEqual(running.keep, ['r'])
})

test('a held group message keeps what the user said, not the relay around it', async () => {
  const { userWords } = await import('../src/policy.js')
  const relay = '[Group chat "team-c 小队" · your turn]\nMembers: the user, Maker and you (admin).\n\nThis round so far, starting with the new message (oldest first):\nUser: 题目里请加一道应用题\nMaker: 好的\nUser: 再加一道选择题\n\nSpeaking order for this round: Lead C (you, now).'
  assert.equal(userWords(relay), '题目里请加一道应用题\n再加一道选择题')
  assert.equal(userWords('直接说的话'), '直接说的话')
  assert.equal(userWords('[Group chat "x" · your turn]\nno round here'), '[Group chat "x" · your turn]\nno round here')
})

test('an answer to a question or a view card is the user, held from a formal attempt', () => {
  assert.equal(wakeOf({ kind: 'user-question-reply', callId: 'c1', outcome: 'answered' }), 'user-answer')
  const binding = { fence: 1 }
  const active = { attemptId: 'a1' }
  const out = decideStep({ messages: [{ id: 'm1', source: { kind: 'user-question-reply', callId: 'c1' } }], step: 2 }, binding, active, new Map(), undefined)
  assert.deepEqual(out.keep, [])
  assert.deepEqual(out.hold.map(entry => entry.why), ['no_admission'])
})
