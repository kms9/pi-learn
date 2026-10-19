// The Runs tab: start a Run, see its tasks as a graph, act on its cards.
import { createElement as h, Fragment, useState } from 'react'
import { call, requestId } from './api.js'
import { refreshNow } from './feed.js'
import { KIND, RUN_PHASE, TASK_STATE, artifactsOf, cardsOf, goalOf, graphOf, runsOf, short, tasksOf, terminal } from './model.js'
import { store, toast, useStore } from './store.js'

const TONE = { completed: 'ok', accepted: 'ok', running: 'warn', needs_review: 'bad', failed: 'bad', interrupted: 'bad', rejected: 'bad', cancelled: 'bad' }
const chip = (text, tone) => h('span', { className: 'sq-chip', 'data-tone': tone }, text)

// Every action goes through the host; the page shows the Controller's answer and then
// reads the snapshot again, never assuming its own change took effect.
export async function act(what, endpoint, payload) {
  try {
    await call(endpoint, payload)
    toast(`${what}：已提交`, 'ok')
  } catch (error) {
    toast(`${what}失败：${error.message}`)
  } finally {
    await refreshNow()
  }
}

function StartRun({ snapshot }) {
  const teams = (snapshot?.views?.teams ?? []).map(team => team.config)
  const [teamId, setTeam] = useState(teams[0]?.team_id ?? '')
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)
  const team = (snapshot?.views?.teams ?? []).find(candidate => candidate.config.team_id === teamId)
  const workflows = Object.keys(team?.workflows ?? {})
  const [workflowId, setWorkflow] = useState('')
  const start = async () => {
    setBusy(true)
    try {
      const run = await call('start-run', { requestId: requestId('run'), teamId, goal, ...(workflowId ? { workflowId } : {}) })
      store.set(state => ({ ...state, runId: run.run_id }))
      setGoal('')
      toast('小队已开始', 'ok')
    } catch (error) {
      toast(`没能开始：${error.message}`)
    } finally {
      setBusy(false)
      await refreshNow()
    }
  }
  return h('div', { className: 'sq-card' },
    h('h3', null, '开始一个小队任务'),
    h('select', { className: 'sq-select', value: teamId, onChange: event => setTeam(event.target.value), 'aria-label': '小队' },
      teams.length === 0 ? h('option', { value: '' }, '还没有小队，请先在「小队与规则」里建一个') : teams.map(t => h('option', { key: t.team_id, value: t.team_id }, t.team_id))),
    workflows.length > 0 ? h('select', { className: 'sq-select', value: workflowId, onChange: event => setWorkflow(event.target.value), 'aria-label': '流程' },
      h('option', { value: '' }, `默认流程${team?.config?.default_workflow ? `（${team.config.default_workflow}）` : '（由 Leader 安排）'}`),
      workflows.map(id => h('option', { key: id, value: id }, id))) : null,
    h('textarea', { className: 'sq-text', placeholder: '要完成什么？例如：认识分数：分数的意义与读写（五年级）', value: goal, onChange: event => setGoal(event.target.value) }),
    h('button', { className: 'sq-btn', 'data-kind': 'primary', disabled: busy || !teamId || goal.trim() === '', onClick: start }, busy ? '正在开始…' : '开始'))
}

export function RunList() {
  const snapshot = useStore(state => state.projection.snapshot)
  const runId = useStore(state => state.runId)
  const runs = runsOf(snapshot)
  return h(Fragment, null,
    h(StartRun, { snapshot }),
    runs.length === 0 ? h('div', { className: 'sq-muted' }, '还没有 Run。') : null,
    runs.map((run) => {
      const tasks = tasksOf(snapshot, run.run_id).filter(task => task.kind !== 'leader_step')
      const done = tasks.filter(task => task.state === 'completed').length
      return h('button', { key: run.run_id, className: 'sq-item', 'data-on': run.run_id === runId || undefined, onClick: () => store.set(state => ({ ...state, runId: run.run_id })) },
        h('div', null, chip(RUN_PHASE[run.phase] ?? run.phase, TONE[run.phase]), h('span', { className: 'sq-muted' }, run.team_id)),
        h('div', null, run.goal),
        h('div', { className: 'sq-muted' }, `${done}/${tasks.length} 个任务完成 · ${short(run.run_id)}`))
    }))
}

const NODE_W = 170
const NODE_H = 54
const GAP_X = 60
const GAP_Y = 18

export function RunGraph({ tasks }) {
  const graph = graphOf(tasks)
  if (graph.nodes.length === 0) return h('div', { className: 'sq-muted' }, 'Leader 还没有安排任务。')
  const at = new Map(graph.nodes.map(node => [node.task.task_id, { x: 12 + node.col * (NODE_W + GAP_X), y: 12 + node.row * (NODE_H + GAP_Y) }]))
  const width = 24 + graph.columns * (NODE_W + GAP_X) - GAP_X
  const height = 24 + graph.rows * (NODE_H + GAP_Y) - GAP_Y
  const fill = { completed: '#e6f4ea', running: '#fff4e0', needs_review: '#fdecea', failed: '#fdecea', interrupted: '#fdecea', cancelled: '#eeeeee' }
  return h('div', { className: 'sq-dag' },
    h('svg', { width, height, role: 'img', 'aria-label': '任务依赖图' },
      h('defs', null, h('marker', { id: 'sq-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, h('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#999' }))),
      graph.edges.map((edge, index) => {
        const a = at.get(edge.from)
        const b = at.get(edge.to)
        return h('path', { key: index, d: `M${a.x + NODE_W},${a.y + NODE_H / 2} C${a.x + NODE_W + GAP_X / 2},${a.y + NODE_H / 2} ${b.x - GAP_X / 2},${b.y + NODE_H / 2} ${b.x},${b.y + NODE_H / 2}`, fill: 'none', stroke: edge.kind === 'rework' ? '#c62828' : '#999', strokeDasharray: edge.kind === 'rework' ? '4 3' : undefined, markerEnd: 'url(#sq-arrow)' })
      }),
      graph.nodes.map(({ task }) => {
        const p = at.get(task.task_id)
        const decision = task.acceptance?.decision ?? (task.kind === 'review' ? task.result?.value?.decision : undefined)
        const goal = goalOf(task, tasks)
        return h('g', { key: task.task_id, transform: `translate(${p.x},${p.y})` },
          h('title', null, `${goal}\n${task.task_id}`),
          h('rect', { width: NODE_W, height: NODE_H, rx: 8, fill: fill[task.state] ?? '#f4f6ff', stroke: task.superseded_by ? '#c62828' : '#bbb', strokeDasharray: task.superseded_by ? '4 3' : undefined }),
          h('text', { x: 8, y: 18 }, `${KIND[task.kind] ?? task.kind} · ${task.role_id}`),
          h('text', { x: 8, y: 34 }, `${TASK_STATE[task.state] ?? task.state}${decision ? ` · ${decision === 'accepted' ? '通过' : '退回'}` : ''}`),
          h('text', { x: 8, y: 48, fill: '#888' }, goal.length > 14 ? `${goal.slice(0, 14)}…` : goal))
      })))
}

function AnswerCard({ card }) {
  const [text, setText] = useState('')
  return h('div', { className: 'sq-card' },
    h('h3', null, '需要你回答'),
    h('div', null, card.why),
    h('textarea', { className: 'sq-text', placeholder: '写给 Leader 的说明', value: text, onChange: event => setText(event.target.value) }),
    h('div', { className: 'sq-row' },
      h('button', { className: 'sq-btn', 'data-kind': 'primary', disabled: text.trim() === '', onClick: () => act('回答', 'operate', { kind: 'run', id: card.run.run_id, op: 'guidance', body: { request_id: requestId('guide'), expected_revision: card.expectedRevision, note: text.trim() } }) }, '回答'),
      card.run.recovery_hold ? h('button', { className: 'sq-btn', onClick: () => act('继续 Run', 'operate', { kind: 'run', id: card.run.run_id, op: 'resume', body: { request_id: requestId('resume'), expected_revision: card.expectedRevision, note: '在 Squad 页面确认继续' } }) }, '确认继续') : null))
}

function ApproveCard({ card }) {
  const { approval } = card
  const answer = choice => act(choice === 'allow' ? '批准工具' : '拒绝工具', 'approve', { approvalId: approval.id, attemptId: card.attemptId, expectedRevision: card.expectedRevision, choice })
  return h('div', { className: 'sq-card' },
    h('h3', null, '需要你批准工具'),
    h('div', null, `${approval.tool}：${approval.reason || '（没有说明）'}`),
    approval.detail?.code || approval.detail?.text ? h('pre', { className: 'sq-muted', style: { whiteSpace: 'pre-wrap', margin: 0 } }, String(approval.detail.code ?? approval.detail.text).slice(0, 600)) : null,
    h('div', { className: 'sq-row' },
      h('button', { className: 'sq-btn', 'data-kind': 'primary', disabled: card.expectedRevision === undefined, onClick: () => answer('allow') }, '批准一次'),
      h('button', { className: 'sq-btn', 'data-kind': 'danger', onClick: () => answer('reject') }, '拒绝')))
}

function AcceptCard({ card }) {
  const [note, setNote] = useState('')
  const decide = decision => act(decision === 'accepted' ? '验收通过' : '验收退回', 'accept', { taskId: card.task.task_id, body: { request_id: requestId('accept'), expected_revision: card.expectedRevision, decision, result_hash: card.resultHash, note: note.trim() || (decision === 'accepted' ? '验收通过' : '需要修改') } })
  return h('div', { className: 'sq-card' },
    h('h3', null, '需要你验收成果'),
    h('div', null, card.task.goal),
    h('pre', { className: 'sq-muted', style: { whiteSpace: 'pre-wrap', margin: 0 } }, JSON.stringify(card.task.result?.value ?? null, null, 2).slice(0, 800)),
    h('input', { className: 'sq-input', placeholder: '验收意见', value: note, onChange: event => setNote(event.target.value) }),
    h('div', { className: 'sq-row' },
      h('button', { className: 'sq-btn', 'data-kind': 'primary', onClick: () => decide('accepted') }, '验收通过'),
      h('button', { className: 'sq-btn', 'data-kind': 'danger', onClick: () => decide('rejected') }, '退回')))
}

function RecoverCard({ card }) {
  const { task, attempt } = card
  const [confirm, setConfirm] = useState(false)
  return h('div', { className: 'sq-card' },
    h('h3', null, '需要恢复'),
    h('div', null, `${KIND[task.kind] ?? task.kind} · ${task.role_id}：${TASK_STATE[task.state] ?? task.state}${attempt?.error ? `（${attempt.error}）` : ''}`),
    h('div', { className: 'sq-muted' }, '不确定这次执行是否真的停下时，不会自动重来。确认它已经停止后再释放；释放后可以重试或取消。'),
    attempt ? h('label', { className: 'sq-row' }, h('input', { type: 'checkbox', checked: confirm, onChange: event => setConfirm(event.target.checked) }), '我确认这次执行已经停止') : null,
    h('div', { className: 'sq-row' },
      attempt ? h('button', { className: 'sq-btn', disabled: !confirm, onClick: () => act('确认已停止', 'operate', { kind: 'attempt', id: attempt.attempt_id, op: 'reconcile', body: { request_id: requestId('reconcile'), expected_revision: attempt.revision, expected_runtime: attempt.target?.runtime_id, note: '在 Squad 页面确认已停止', confirm_stopped: true } }) }, '确认已停止') : null,
      h('button', { className: 'sq-btn', disabled: Boolean(attempt), onClick: () => act('重试', 'operate', { kind: 'task', id: task.task_id, op: 'retry', body: { request_id: requestId('retry'), expected_revision: card.expectedRevision, note: '在 Squad 页面重试' } }) }, '重试'),
      h('button', { className: 'sq-btn', 'data-kind': 'danger', onClick: () => act('取消任务', 'operate', { kind: 'task', id: task.task_id, op: 'cancel', body: { request_id: requestId('cancel'), expected_revision: card.expectedRevision, note: '在 Squad 页面取消' } }) }, '取消任务')))
}

function ReviewCard({ card }) {
  const target = card.task.dependencies?.[0]?.task_id
  return h('div', { className: 'sq-card' },
    h('h3', null, '审核结论 ', chip(card.verdict.decision === 'accepted' ? '通过' : '退回', card.verdict.decision === 'accepted' ? 'ok' : 'bad')),
    h('div', null, card.verdict.reason),
    h('div', { className: 'sq-muted' }, `审核 ${short(target)} 的第 ${card.verdict.candidates?.[0]?.result_revision ?? '?'} 版`))
}

export function RunDetail({ runId }) {
  const snapshot = useStore(state => state.projection.snapshot)
  const approvals = useStore(state => state.approvals)
  const previewBase = useStore(state => state.previewBase)
  const [guide, setGuide] = useState('')
  const run = runsOf(snapshot).find(candidate => candidate.run_id === runId)
  if (run === undefined) return h('div', { className: 'sq-muted' }, '选择左边的一个 Run，或开始一个新的。')
  const tasks = tasksOf(snapshot, runId)
  const cards = cardsOf(snapshot, runId, approvals)
  const of = type => cards.filter(card => card.type === type)
  const artifacts = artifactsOf(tasks)
  const section = (title, list, Card) => (list.length === 0 ? null : h('div', { className: 'sq-section' }, h('h2', null, `${title}（${list.length}）`), h('div', { className: 'sq-grid' }, list.map(card => h(Card, { key: card.key, card })))))
  return h(Fragment, null,
    h('div', { className: 'sq-card' },
      h('div', { className: 'sq-row' }, chip(RUN_PHASE[run.phase] ?? run.phase, TONE[run.phase]), h('strong', null, run.goal)),
      h('div', { className: 'sq-muted' }, `小队 ${run.team_id} · ${short(run.run_id)} · 第 ${run.revision} 版${(run.guidance ?? []).length ? ` · 已有 ${run.guidance.length} 条补充说明` : ''}`),
      terminal(run.phase) ? null : h('div', { className: 'sq-row' },
        h('input', { className: 'sq-input', style: { flex: 1 }, placeholder: '给 Leader 补充说明（例如：例子用披萨）', value: guide, onChange: event => setGuide(event.target.value) }),
        h('button', { className: 'sq-btn', disabled: guide.trim() === '', onClick: () => { void act('补充说明', 'operate', { kind: 'run', id: run.run_id, op: 'guidance', body: { request_id: requestId('guide'), expected_revision: run.revision, note: guide.trim() } }); setGuide('') } }, '发送'),
        h('button', { className: 'sq-btn', 'data-kind': 'danger', onClick: () => act('取消 Run', 'operate', { kind: 'run', id: run.run_id, op: 'cancel', body: { request_id: requestId('cancel'), expected_revision: run.revision, note: '在 Squad 页面取消' } }) }, '取消 Run'))),
    section('需要你回答', of('answer'), AnswerCard),
    section('需要你批准工具', of('approve'), ApproveCard),
    section('需要你验收成果', of('accept'), AcceptCard),
    section('需要恢复', of('recover'), RecoverCard),
    h('div', { className: 'sq-section' }, h('h2', null, '任务依赖图'), h(RunGraph, { tasks })),
    artifacts.length === 0 ? null : h('div', { className: 'sq-section' }, h('h2', null, '成果文件'),
      h('table', { className: 'sq-table' }, h('tbody', null, artifacts.map(art => h('tr', { key: `${art.taskId}:${art.sha256}` },
        h('td', null, art.name ?? art.path), h('td', null, chip(art.superseded ? '已被返工取代' : art.accepted ? '已通过' : '待审核', art.superseded ? 'bad' : art.accepted ? 'ok' : 'warn')),
        h('td', { className: 'sq-muted' }, `${short(art.taskId)} · ${art.sha256.slice(0, 10)}`),
        h('td', null, previewBase && art.media_type === 'text/html' ? h('button', { className: 'sq-btn', onClick: () => store.set(state => ({ ...state, preview: { url: `${previewBase}/v2/artifacts/sha256/${art.sha256}`, name: art.name } })) }, '预览') : null)))))),
    section('审核结论', of('review'), ReviewCard),
    h('div', { className: 'sq-section' }, h('h2', null, '全部任务'),
      h('div', { className: 'sq-muted' }, `Leader 已做 ${tasks.filter(task => task.kind === 'leader_step').length} 次决定（不在表中）`),
      h('table', { className: 'sq-table' },
        h('thead', null, h('tr', null, ['类型', '角色', '状态', '验收', '目标'].map(label => h('th', { key: label }, label)))),
        h('tbody', null, tasks.filter(task => task.kind !== 'leader_step').map(task => h('tr', { key: task.task_id },
          h('td', null, KIND[task.kind] ?? task.kind), h('td', null, task.role_id || '—'),
          h('td', null, chip(TASK_STATE[task.state] ?? task.state, TONE[task.state])),
          h('td', null, task.acceptance ? chip(task.acceptance.decision === 'accepted' ? '通过' : '退回', TONE[task.acceptance.decision]) : '—'),
          h('td', null, goalOf(task, tasks))))))))
}
