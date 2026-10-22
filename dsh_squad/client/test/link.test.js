import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSquadLink } from '../src/link-model.js'

test('a ?squad= link names Team, Run and node', () => {
  assert.deepEqual(parseSquadLink('?squad=math%3Arun-1%3At1'), { teamId: 'math', runId: 'run-1', taskId: 't1' })
  assert.deepEqual(parseSquadLink('?squad=math:run-1:'), { teamId: 'math', runId: 'run-1', taskId: null })
  assert.equal(parseSquadLink('?other=1'), undefined)
  assert.equal(parseSquadLink('?squad=math'), undefined)
})
