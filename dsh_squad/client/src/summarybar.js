// The summary bar (UI plan §2.1): members, how much is running, and what needs a
// person or failed, each a list that jumps to the node. It never moves the view by
// itself (D6): a new item only makes its pill flash once. No cost, no elapsed time.
import { createElement as h, useEffect, useRef, useState } from 'react'
import { summaryOf } from './summary.js'
import { store, useStore } from './store.js'
import { TeamSwitcher } from './teams.js'

export function jumpTo(item) {
  store.set(state => ({ ...state, open: true, tab: 'runs', runId: item.runId, teamScope: item.teamId ?? state.teamScope, focus: { taskId: item.taskId, runId: item.runId, at: Date.now() } }))
}

function Pill({ kind, items, label }) {
  const [open, setOpen] = useState(false)
  const [flash, setFlash] = useState(false)
  const count = useRef(items.length)
  useEffect(() => {
    if (items.length > count.current) {
      setFlash(true)
      const timer = setTimeout(() => setFlash(false), 1000)
      count.current = items.length
      return () => clearTimeout(timer)
    }
    count.current = items.length
    return undefined
  }, [items.length])
  if (items.length === 0) return null
  const groups = [...new Set(items.map(item => item.teamId))]
  return h('span', { style: { position: 'relative' } },
    h('button', { className: 'sq-pill', 'data-s': kind, 'data-flash': flash || undefined, 'aria-expanded': open, onClick: () => setOpen(value => !value) }, `${items.length} 个${label} ▾`),
    open ? h('div', { className: 'sq-menu', role: 'menu', onMouseLeave: () => setOpen(false) },
      groups.map(team => [
        groups.length > 1 || team ? h('div', { key: `g-${team}`, className: 'sq-menu-group' }, `小队 ${team}`) : null,
        ...items.filter(item => item.teamId === team).map(item => h('button', { key: `${item.runId}:${item.taskId}`, role: 'menuitem', className: 'sq-menu-item', onClick: () => { setOpen(false); jumpTo(item) } },
          h('div', null, item.taskId === null ? `整个小队：${item.title}` : item.title.length > 36 ? `${item.title.slice(0, 36)}…` : item.title),
          h('div', { className: 'sq-muted' }, item.note || ''))),
      ])) : null)
}

export function SummaryBar() {
  const snapshot = useStore(state => state.projection.snapshot)
  const approvals = useStore(state => state.approvals)
  const scope = useStore(state => state.teamScope ?? null)
  const started = useStarted(snapshot, scope)
  if (!snapshot) return null
  // Numbers follow the Team in focus; the two menus always span every Team (§2.4), and
  // picking an item switches to its Team.
  const sum = summaryOf(snapshot, approvals, scope)
  const every = scope === null ? sum : summaryOf(snapshot, approvals, null)
  return h('div', { className: 'sq-sum', role: 'status', 'aria-label': '小队概况' },
    h(TeamSwitcher),
    h('span', { className: 'sq-sum-num' }, '成员 ', h('b', null, sum.members), sum.online < sum.members ? `（${sum.online} 在线）` : ''),
    h('span', { className: 'sq-sum-num' }, '运行中 ', h('b', null, sum.running)),
    h(Pill, { kind: 'attention', items: every.attention, label: '需要你处理' }),
    h(Pill, { kind: 'failed', items: every.failed, label: '失败' }),
    every.queued.map(item => h('button', { key: item.runId, className: 'sq-menu-item sq-muted', onClick: () => jumpTo(item) }, `小队 ${item.teamId} ${item.note}${item.owner ? `（小队 ${item.owner} 正在用）` : ''}`)),
    started.list.map(item => h('button', { key: item.runId, className: 'sq-notice', onClick: () => { started.drop(item.runId); jumpTo({ teamId: item.teamId, runId: item.runId, taskId: null }) } }, `小队 ${item.teamId} 已开始 →`)))
}

// A Team that starts while the person looks at another one gets a line in the bar,
// never a switch of view (D6, §4.5).
function useStarted(snapshot, scope) {
  const seen = useRef(null)
  const [list, setList] = useState([])
  const admitted = (snapshot?.views?.runs ?? []).filter(run => run.admitted)
  const key = admitted.map(run => run.run_id).sort().join(',')
  useEffect(() => {
    if (!snapshot) return
    if (seen.current === null) { seen.current = new Set(admitted.map(run => run.run_id)); return }
    const fresh = admitted.filter(run => !seen.current.has(run.run_id))
    for (const run of fresh) seen.current.add(run.run_id)
    const others = fresh.filter(run => scope !== null && run.team_id !== scope)
    if (others.length > 0) setList(current => [...current, ...others.map(run => ({ runId: run.run_id, teamId: run.team_id }))])
  }, [key])
  useEffect(() => { setList(current => current.filter(item => item.teamId !== scope)) }, [scope])
  return { list, drop: runId => setList(current => current.filter(item => item.runId !== runId)) }
}

// The five-state label used everywhere.
export const StatusChip = ({ state }) => h('span', { className: 'sq-status', 'data-s': state.status, title: state.reason ?? state.note ?? '' }, state.label ?? labelOf(state.status))
const LABELS = { running: '进行中', done: '完成', attention: '需要你处理', failed: '失败', stopped: '已停止', waiting: '未开始' }
const labelOf = status => LABELS[status] ?? status
