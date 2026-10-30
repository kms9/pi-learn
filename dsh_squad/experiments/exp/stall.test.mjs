// Unit tests of the stall check (run: node --test dsh_squad/experiments/exp/stall.test.mjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkStall, progressSignature } from './stall.mjs'

const task = (id, state, decision = null) => ({ task_id: id, state, acceptance: decision ? { decision } : null, result: null })
const LIMIT = 10 * 60_000

test('a Run in needs_review that changes nothing for the limit is stalled', () => {
  const run = { phase: 'needs_review' }
  const tasks = [task('designer', 'needs_review'), task('builder', 'planned')]
  const watch = { signature: null, since: 0 }
  assert.equal(checkStall(watch, run, tasks, 0, LIMIT), false)
  assert.equal(checkStall(watch, run, tasks, LIMIT - 1, LIMIT), false)
  assert.equal(checkStall(watch, run, tasks, LIMIT, LIMIT), true)
})

test('any change restarts the clock', () => {
  const run = { phase: 'needs_review' }
  const watch = { signature: null, since: 0 }
  checkStall(watch, run, [task('designer', 'needs_review')], 0, LIMIT)
  assert.equal(checkStall(watch, run, [task('designer', 'needs_review')], LIMIT - 1000, LIMIT), false)
  // The designer got a verdict: the signature changes, so the clock starts again.
  assert.equal(checkStall(watch, run, [task('designer', 'completed', 'accepted')], LIMIT + 5000, LIMIT), false)
  assert.equal(checkStall(watch, run, [task('designer', 'completed', 'accepted')], 2 * LIMIT + 5000, LIMIT), true)
})

test('a Run that is not in needs_review is never a stall, however long it sits', () => {
  const run = { phase: 'running' }
  const watch = { signature: null, since: 0 }
  checkStall(watch, run, [task('builder', 'running')], 0, LIMIT)
  assert.equal(checkStall(watch, run, [task('builder', 'running')], 10 * LIMIT, LIMIT), false)
})

test('the signature ignores the order of tasks', () => {
  const a = progressSignature({ phase: 'running' }, [task('a', 'planned'), task('b', 'running')])
  const b = progressSignature({ phase: 'running' }, [task('b', 'running'), task('a', 'planned')])
  assert.equal(a, b)
})
