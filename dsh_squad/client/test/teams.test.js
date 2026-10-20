import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alsoIn, teamsOf } from '../src/team-model.js'

const bound = {
  'team-a': { roomId: 'r-a', roomName: 'team-a 小队', members: [{ agentId: 'chief-a', botId: 'b-chief' }, { agentId: 'team-a-reviewer', botId: 'b-rev' }] },
  'team-b': { roomId: 'r-b', roomName: 'team-b 小队', members: [{ agentId: 'team-b-reviewer', botId: 'b-rev' }] },
}
const snapshot = {
  views: {
    teams: [{ config: { team_id: 'team-a' } }, { config: { team_id: 'team-b' } }, { config: { team_id: 'team-c' } }],
    runs: [
      { run_id: 'ra', team_id: 'team-a', admitted: true, phase: 'executing', queue_seq: 1, goal: 'A' },
      { run_id: 'rb', team_id: 'team-b', admitted: false, phase: 'queued', queue_seq: 2, goal: 'B', waiting_roles: [{ role_id: 'reviewer', owner_team_id: 'team-a', owner_run_id: 'ra' }] },
    ],
    tasks: [
      { task_id: 't1', run_id: 'ra', kind: 'execute', state: 'running', attempt_ids: [], dependencies: [], blockers: [] },
      { task_id: 't2', run_id: 'ra', kind: 'execute', state: 'completed', acceptance: { decision: 'accepted' }, attempt_ids: [], dependencies: [], blockers: [] },
      { task_id: 'l1', run_id: 'ra', kind: 'leader_step', state: 'completed', attempt_ids: [], dependencies: [], blockers: [] },
    ],
    held_inputs: [
      { input_id: 'h1', text: '再做一份练习', disposition: 'pending', binding: { agent_id: 'team-b-reviewer' } },
      { input_id: 'h2', text: '再做一份练习', disposition: 'pending', binding: { agent_id: 'team-b-reviewer' } },
      { input_id: 'h3', text: '旧的', disposition: 'dismissed', binding: { agent_id: 'team-b-reviewer' } },
    ],
  },
}

test('every configured or bound Team, sorted, with where it stands', () => {
  const teams = teamsOf(snapshot, bound)
  assert.deepEqual(teams.map(team => team.id), ['team-a', 'team-b', 'team-c'])
  const [a, b, c] = teams
  assert.equal(a.counts.running, 1)
  assert.equal(a.counts.done, 1)
  assert.equal(a.room, 'team-a 小队')
  assert.equal(b.run.run_id, 'rb')
  assert.equal(c.run, undefined)
  assert.equal(c.bound, false)
})

test('a held group message shows once on its Team', () => {
  const [a, b] = teamsOf(snapshot, bound)
  assert.equal(a.held.length, 0)
  assert.deepEqual(b.held.map(row => row.input_id), ['h1'])
})

test('a shared Bot is also in the other Team', () => {
  assert.deepEqual(alsoIn('b-rev', 'team-a', bound), ['team-b'])
  assert.deepEqual(alsoIn('b-chief', 'team-a', bound), [])
  assert.deepEqual(alsoIn(null, 'team-a', bound), [])
})
