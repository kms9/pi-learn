// The frame of the Squad page: the sidebar button, the console overlay with its tabs,
// the preview window, messages, and the strip above a bound group's composer.
import { createElement as h, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { RUN_PHASE, runsOf, tasksOf, terminal } from './model.js'
import { RunDetail, RunList } from './runs.js'
import { ConfigTab } from './config.js'
import { ReportsTab } from './reports.js'
import { store, useStore } from './store.js'
import { SummaryBar } from './summarybar.js'

const TABS = { runs: '运行', config: '小队与规则', reports: '实验报告' }
const open = patch => store.set(state => ({ ...state, open: true, ...patch }))
const close = () => store.set(state => ({ ...state, open: false, preview: null }))

export function SquadButton({ wide }) {
  const waiting = useStore(state => (state.approvals ?? []).length)
  return h('button', { className: 'sq-foot', title: 'Squad 小队', onClick: () => open({}) },
    h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, 'aria-hidden': true },
      h('circle', { cx: 8, cy: 9, r: 3 }), h('circle', { cx: 16, cy: 9, r: 3 }), h('path', { d: 'M3 19c0-3 2.5-5 5-5s5 2 5 5M11 19c0-3 2.5-5 5-5s5 2 5 5' })),
    wide === false ? null : h('span', null, waiting > 0 ? `小队（${waiting} 待批准）` : '小队'))
}

function Banner() {
  const connected = useStore(state => state.connected)
  const stale = useStore(state => state.projection.stale && state.projection.snapshot !== null)
  const error = useStore(state => state.projection.error)
  const failures = useStore(state => state.errors ?? [])
  if (failures.length > 0) {
    const why = { CONFIG_VERSION_CONFLICT: '小队配置改过但版本号没变，请在「小队与规则」里保存一次（会自动升版本）', ROLE_SNAPSHOT_MISMATCH: '角色说明改过，正在重新登记' }
    return h('div', { className: 'sq-banner' }, `有 ${failures.length} 个成员没能接上 Controller：${failures.slice(0, 3).map(failure => `${failure.agentId}（${why[failure.code] ?? failure.message}）`).join('；')}`)
  }
  if (connected === false) return h('div', { className: 'sq-banner' }, '还没连上 Squad Controller：请用 dsh_squad/deploy/dsh-squad up 启动这个项目。')
  if (stale) return h('div', { className: 'sq-banner' }, `连接中断，正在重新读取最新状态…${error ? `（${error}）` : ''}`)
  return null
}

function Console() {
  const tab = useStore(state => state.tab)
  const runId = useStore(state => state.runId)
  useEffect(() => {
    // Escape closes the preview first, then the console.
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      if (store.get().preview) store.set(state => ({ ...state, preview: null }))
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const body = tab === 'config' ? h(ConfigTab)
    : tab === 'reports' ? h(ReportsTab)
      : [h('div', { key: 'side', className: 'sq-side' }, h(RunList)), h('div', { key: 'main', className: 'sq-main' }, h(RunDetail, { runId }))]
  return h('div', { className: 'sq-root', role: 'dialog', 'aria-label': 'Squad 小队', onMouseDown: event => { if (event.target === event.currentTarget) close() } },
    h('div', { className: 'sq-shell' },
      h('div', { className: 'sq-head' },
        h('span', { className: 'sq-title' }, 'Squad 小队'),
        h('div', { className: 'sq-tabs', role: 'tablist' }, Object.entries(TABS).map(([id, label]) => h('button', { key: id, role: 'tab', className: 'sq-tab', 'data-on': tab === id || undefined, 'aria-selected': tab === id, onClick: () => store.set(state => ({ ...state, tab: id })) }, label))),
        h('span', { className: 'sq-spacer' }),
        h('button', { className: 'sq-x', 'aria-label': '关闭', onClick: close }, '×')),
      h(SummaryBar),
      h(Banner),
      h('div', { className: 'sq-body' }, body)))
}

// Courseware runs here, apart from DS Bot: another host name, a sandboxed frame, and
// the Controller's own no-network policy on the page (Q42).
function Preview({ preview }) {
  return h('div', { className: 'sq-root', style: { background: 'rgba(0,0,0,.45)' }, onMouseDown: event => { if (event.target === event.currentTarget) store.set(state => ({ ...state, preview: null })) } },
    h('div', { className: 'sq-preview' },
      h('div', { className: 'sq-head' }, h('span', { className: 'sq-title' }, `预览：${preview.name ?? ''}`), h('span', { className: 'sq-muted' }, '隔离运行，读不到 DS Bot 的登录和数据'), h('span', { className: 'sq-spacer' }), h('button', { className: 'sq-x', 'aria-label': '关闭预览', onClick: () => store.set(state => ({ ...state, preview: null })) }, '×')),
      h('iframe', { src: preview.url, sandbox: 'allow-scripts', referrerPolicy: 'no-referrer', title: preview.name ?? 'preview' })))
}

function Toast() {
  const toast = useStore(state => state.toast)
  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => store.set(state => (state.toast === toast ? { ...state, toast: null } : state)), 4000)
    return () => clearTimeout(timer)
  }, [toast])
  return toast ? h('div', { className: 'sq-toast', role: 'status' }, toast.text) : null
}

// The shell can mount an overlay slot more than once (one per layout); only the first
// mounted copy draws, so the console never appears twice.
let owner = null
export function SquadOverlay() {
  const isOpen = useStore(state => state.open)
  const preview = useStore(state => state.preview)
  const [self] = useState(() => Symbol('overlay'))
  const [, redraw] = useState(0)
  useEffect(() => {
    if (owner === null) owner = self
    redraw(n => n + 1)
    return () => { if (owner === self) owner = null }
  }, [])
  if (owner !== self) return null
  return createPortal(h('div', { 'data-squad': 'overlay' }, isOpen ? h(Console) : null, preview ? h(Preview, { preview }) : null, h(Toast)), document.body)
}

// Above the composer of a group bound to a Team: what its Run is doing, one click away.
export function GroupDock({ sessionId }) {
  const teams = useStore(state => state.teams)
  const snapshot = useStore(state => state.projection.snapshot)
  const teamId = Object.entries(teams ?? {}).find(([, team]) => team.roomId === sessionId)?.[0]
  if (teamId === undefined) return null
  const run = runsOf(snapshot).find(candidate => candidate.team_id === teamId)
  const tasks = run ? tasksOf(snapshot, run.run_id).filter(task => task.kind !== 'leader_step') : []
  const done = tasks.filter(task => task.state === 'completed').length
  return h('div', { className: 'sq-dock' },
    h('strong', null, `小队 ${teamId}`),
    run ? h('span', null, `${RUN_PHASE[run.phase] ?? run.phase} · ${done}/${tasks.length} 个任务完成`) : h('span', { className: 'sq-muted' }, '还没有 Run'),
    run && !terminal(run.phase) ? h('span', { className: 'sq-muted' }, '在这里说的话会作为补充说明交给 Leader') : null,
    h('span', { className: 'sq-spacer', style: { flex: 1 } }),
    h('button', { className: 'sq-btn', onClick: () => open({ tab: 'runs', runId: run?.run_id ?? null }) }, run ? '查看进度' : '开始'))
}
