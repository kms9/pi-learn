import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoFolded, oneLine, treeOf } from '../src/tree.js'
import { CARD, layout } from '../src/layout.js'

const task = (id, extra = {}) => ({ task_id: id, run_id: 'run-1', kind: 'execute', state: 'completed', goal: `goal ${id}。细节`, created_at: `2026-10-19T00:00:0${id.slice(-1)}Z`, dependencies: [], blockers: [], attempt_ids: [`a-${id}`], acceptance: { decision: 'accepted' }, ...extra })
const attempt = (id, taskId, extra = {}) => ({ attempt_id: id, task_id: taskId, state: 'settled', cleanup_state: 'released', ...extra })
const run = { run_id: 'run-1', team_id: 'math', goal: '认识分数', phase: 'running', admitted: true, leader: { agent_id: 'chief' } }

function snapshot(tasks, attempts) {
  return { views: { runs: [run], tasks, attempts, agents: [{ binding: { agent_id: 'math-builder' }, host: { bot_id: 'bot-b' }, route: { model: 'deepseek-flash' } }] } }
}

test('the Leader is the root; steps, reviews, rework and children hang where they belong', () => {
  const tasks = [
    task('t1', { origin: { kind: 'workflow' } }),
    task('t2', { origin: { kind: 'workflow' }, superseded_by: 't4', acceptance: { decision: 'rejected' }, dependencies: [{ task_id: 't1' }], target: { agent_id: 'math-builder' } }),
    task('t3', { kind: 'review', origin: { kind: 'review', by: 't2' }, dependencies: [{ task_id: 't2' }], result: { value: { decision: 'rejected' } } }),
    task('t4', { kind: 'rework', origin: { kind: 'rework', by: 't2' }, rework_of: 't2' }),
    task('t5', { origin: { kind: 'delegate', by: 't4' }, parent_id: 't4' }),
    { task_id: 'tl', run_id: 'run-1', kind: 'leader_step', state: 'completed', goal: 'x', dependencies: [], blockers: [], attempt_ids: [] },
  ]
  const attempts = tasks.filter(t => t.kind !== 'leader_step').map(t => attempt(`a-${t.task_id}`, t.task_id))
  const { root, nodes } = treeOf(snapshot(tasks, attempts), 'run-1', { bots: { 'bot-b': { name: 'Builder', color: 'blue' } } })
  assert.deepEqual(root.children.map(n => n.id), ['t1', 't2'])
  assert.equal(root.decisions, 1)
  assert.deepEqual(nodes.get('t2').children.map(n => n.id), ['t3', 't4'])
  assert.deepEqual(nodes.get('t4').children.map(n => n.id), ['t5'])
  assert.equal(nodes.get('t2').state.status, 'stopped')
  assert.deepEqual(nodes.get('t2').deps, ['t1'])
  assert.equal(nodes.get('t2').member.name, 'Builder')
  assert.equal(nodes.get('t2').member.model, 'deepseek-flash')
  assert.equal(nodes.get('t3').title, '审核：goal t2')
})

test('each retry is a node under the attempt before it; older attempts are grey (D5)', () => {
  const t = task('t1', { state: 'running', acceptance: undefined, attempt_ids: ['a1', 'a2'], origin: { kind: 'workflow' } })
  const review = task('t2', { kind: 'review', origin: { kind: 'review', by: 't1' } })
  const { root, nodes } = treeOf(snapshot([t, review], [attempt('a1', 't1', { error: 'host_restart' }), attempt('a2', 't1', { state: 'running', cleanup_state: 'pending' }), attempt('a-t2', 't2')]), 'run-1')
  assert.deepEqual(root.children.map(n => n.id), ['t1'])
  assert.equal(nodes.get('t1').state.status, 'stopped')
  assert.match(nodes.get('t1').state.note, /第 1 次（已重试）/)
  const second = nodes.get('t1#2')
  assert.equal(second.state.status, 'running')
  assert.match(second.state.note, /第 2 次/)
  assert.deepEqual(second.children.map(n => n.id), ['t2'], 'the review hangs under the last attempt')
})

test('a finished subtree folds by itself, unless something below needs a person or failed', () => {
  const tasks = [task('t1', { origin: { kind: 'workflow' } }), task('t2', { kind: 'review', origin: { kind: 'review', by: 't1' } }), task('t3', { origin: { kind: 'workflow' } }), task('t4', { kind: 'review', state: 'needs_review', origin: { kind: 'review', by: 't3' }, acceptance: undefined, attempt_ids: [] })]
  const { root } = treeOf(snapshot(tasks, tasks.map(t => attempt(`a-${t.task_id}`, t.task_id))), 'run-1')
  const folded = autoFolded(root)
  assert.ok(folded.has('t1'))
  assert.ok(!folded.has('t3'))
})

test('one line is the title, else the first sentence', () => {
  assert.equal(oneLine({ goal: '梳理知识点。再写例题' }), '梳理知识点')
  assert.equal(oneLine({ goal: 'x', title: '一句话' }), '一句话')
})

test('layout: parents centred over children, siblings make way, the root centred, folding hides', () => {
  const leaf = id => ({ id, children: [], deps: [] })
  const tree = (n) => ({ id: 'root', children: Array.from({ length: n }, (_, i) => leaf(`c${i}`)), deps: [] })
  const two = layout(tree(2))
  const x = id => two.nodes.find(item => item.node.id === id).x
  assert.equal(x('root'), (x('c0') + x('c1')) / 2, 'the root sits over the middle of its children')
  assert.equal(x('c1') - x('c0'), CARD.width + CARD.gapX)
  const three = layout(tree(3))
  const x3 = id => three.nodes.find(item => item.node.id === id).x
  assert.ok(x3('c0') < x('c0') + 1 && three.width > two.width, 'a new sibling widens the row')
  assert.equal(x3('root'), x3('c1'), 'still centred')
  assert.equal(two.nodes.find(item => item.node.id === 'c0').y, CARD.height + CARD.gapY)
  const folded = layout(tree(3), new Set(['root']))
  assert.equal(folded.nodes.length, 1)
  assert.equal(folded.nodes[0].hidden, 3)
  assert.deepEqual(layout(tree(2)), layout(tree(2)), 'deterministic')
})
