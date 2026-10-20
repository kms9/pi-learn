// The Runs tab: start a Run, see its tasks as a graph, act on its cards.
import { createElement as h, Fragment, useEffect, useState } from 'react'
import { call, requestId } from './api.js'
import { refreshNow } from './feed.js'
import { KIND, artifactsOf, goalOf, runsOf, short, tasksOf, terminal, waitingOf } from './model.js'
import { store, toast, useStore } from './store.js'
import { runStatusOf, statusOf } from './status.js'
import { StatusChip } from './summarybar.js'
import { RunCanvas } from './canvas.js'

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

export function RunList({ teamId = null }) {
  const snapshot = useStore(state => state.projection.snapshot)
  const runId = useStore(state => state.runId)
  const runs = runsOf(snapshot).filter(run => teamId === null || run.team_id === teamId)
  return h(Fragment, null,
    h('button', { className: 'sq-btn', 'data-kind': 'primary', onClick: () => store.set(state => ({ ...state, startOpen: true })) }, '＋ 开始一个小队任务'),
    runs.length === 0 ? h('div', { className: 'sq-muted' }, '还没有 Run。') : null,
    runs.map((run) => {
      const tasks = tasksOf(snapshot, run.run_id).filter(task => task.kind !== 'leader_step')
      const done = tasks.filter(task => task.state === 'completed').length
      return h('button', { key: run.run_id, className: 'sq-item', 'data-on': run.run_id === runId || undefined, onClick: () => store.set(state => ({ ...state, runId: run.run_id })) },
        h('div', { className: 'sq-row' }, h(StatusChip, { state: runStatusOf(run) }), h('span', { className: 'sq-muted' }, run.team_id)),
        h('div', null, run.goal),
        h('div', { className: 'sq-muted' }, `${done}/${tasks.length} 个任务完成 · ${short(run.run_id)}${waitingOf(run).length ? ' · 排队中' : ''}`))
    }))
}

export function RunDetail({ runId }) {
  const snapshot = useStore(state => state.projection.snapshot)
  const approvals = useStore(state => state.approvals)
  const previewBase = useStore(state => state.previewBase)
  const focus = useStore(state => state.focus)
  const [guide, setGuide] = useState('')
  const [listView, setListView] = useState(false)
  // A jump from the summary bar: the row scrolls into view once (until the canvas, P2).
  useEffect(() => {
    if (!focus?.taskId || focus.runId !== runId) return
    document.getElementById(`sq-task-${focus.taskId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focus?.at, runId])
  const run = runsOf(snapshot).find(candidate => candidate.run_id === runId)
  if (run === undefined) return h('div', { className: 'sq-muted' }, '选择左边的一个 Run，或开始一个新的。')
  const tasks = tasksOf(snapshot, runId)
  const artifacts = artifactsOf(tasks)
  return h(Fragment, null,
    h('div', { className: 'sq-card' },
      h('div', { className: 'sq-row' }, h(StatusChip, { state: runStatusOf(run) }), h('strong', null, run.goal)),
      h('div', { className: 'sq-muted' }, `小队 ${run.team_id} · ${short(run.run_id)} · 第 ${run.revision} 版${(run.guidance ?? []).length ? ` · 已有 ${run.guidance.length} 条补充说明` : ''}`),
      waitingOf(run).length > 0 ? h('div', null, chip('排队中', 'warn'), waitingOf(run).join('；'), '，对方结束后自动开始。') : null,
      terminal(run.phase) ? null : h('div', { className: 'sq-row' },
        h('input', { className: 'sq-input', style: { flex: 1 }, placeholder: '给 Leader 补充说明（例如：例子用披萨）', value: guide, onChange: event => setGuide(event.target.value) }),
        h('button', { className: 'sq-btn', disabled: guide.trim() === '', onClick: () => { void act('补充说明', 'operate', { kind: 'run', id: run.run_id, op: 'guidance', body: { request_id: requestId('guide'), expected_revision: run.revision, note: guide.trim() } }); setGuide('') } }, '发送'),
        h('button', { className: 'sq-btn', 'data-kind': 'danger', onClick: () => act('取消 Run', 'operate', { kind: 'run', id: run.run_id, op: 'cancel', body: { request_id: requestId('cancel'), expected_revision: run.revision, note: '在 Squad 页面取消' } }) }, '取消 Run'))),
    h('div', { className: 'sq-section' },
      h('div', { className: 'sq-row' }, h('h2', { style: { margin: 0, flex: 1 } }, listView ? '任务列表' : '任务树'), h('button', { className: 'sq-btn', onClick: () => setListView(value => !value) }, listView ? '树视图' : '列表视图')),
      listView ? null : h(RunCanvas, { key: runId, runId })),
    artifacts.length === 0 ? null : h('div', { className: 'sq-section' }, h('h2', null, '成果文件'),
      h('table', { className: 'sq-table' }, h('tbody', null, artifacts.map(art => h('tr', { key: `${art.taskId}:${art.sha256}` },
        h('td', null, art.name ?? art.path), h('td', null, chip(art.superseded ? '已被返工取代' : art.accepted ? '已通过' : '待审核', art.superseded ? 'bad' : art.accepted ? 'ok' : 'warn')),
        h('td', { className: 'sq-muted' }, `${short(art.taskId)} · ${art.sha256.slice(0, 10)}`),
        h('td', null, previewBase && art.media_type === 'text/html' ? h('button', { className: 'sq-btn', onClick: () => store.set(state => ({ ...state, preview: { url: `${previewBase}/v2/artifacts/sha256/${art.sha256}`, name: art.name } })) }, '预览') : null)))))),
    !listView ? null : h('div', { className: 'sq-section' },
      h('div', { className: 'sq-muted' }, `Leader 已做 ${tasks.filter(task => task.kind === 'leader_step').length} 次决定（不在表中）`),
      h('table', { className: 'sq-table' },
        h('thead', null, h('tr', null, ['类型', '角色', '状态', '验收', '目标'].map(label => h('th', { key: label }, label)))),
        h('tbody', null, tasks.filter(task => task.kind !== 'leader_step').map(task => h('tr', { key: task.task_id, id: `sq-task-${task.task_id}`, 'data-focus': focus?.taskId === task.task_id || undefined },
          h('td', null, KIND[task.kind] ?? task.kind), h('td', null, task.role_id || '—'),
          h('td', null, (() => { const state = statusOf(task, { attempts: snapshot.views.attempts ?? [], approvals, tasks }); return h('span', null, h(StatusChip, { state }), state.note ? h('span', { className: 'sq-muted' }, ` ${state.note}`) : null, state.reason ? h('div', { className: 'sq-muted' }, state.reason) : null) })()),
          h('td', null, task.acceptance ? chip(task.acceptance.decision === 'accepted' ? '通过' : '退回', TONE[task.acceptance.decision]) : '—'),
          h('td', null, goalOf(task, tasks))))))))
}
