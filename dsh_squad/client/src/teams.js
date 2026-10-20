// Several Teams (UI plan §2.4, D3): an overview with a card per Team, and a switcher
// that focuses one Team's tree. Held messages and the start panel live here too.
import { createElement as h, useState } from 'react'
import { call, requestId } from './api.js'
import { refreshNow } from './feed.js'
import { layout } from './layout.js'
import { currentRun } from './summary.js'
import { store, toast, useStore } from './store.js'
import { StatusChip } from './summarybar.js'
import { treeOf } from './tree.js'
import { alsoIn, teamsOf } from './team-model.js'

export { alsoIn, teamsOf }

const LABEL = { running: '进行中', done: '完成', attention: '需要你处理', failed: '失败', stopped: '已停止', waiting: '未开始' }

function MiniTree({ snapshot, runId }) {
  const tree = runId ? treeOf(snapshot, runId) : undefined
  if (!tree) return h('div', { className: 'sq-mini sq-muted' }, '还没有任务')
  const size = { width: 18, height: 12, gapX: 8, gapY: 14 }
  const placed = layout(tree.root, new Set(), size)
  const at = new Map(placed.nodes.map(item => [item.node.id, item]))
  const scale = Math.min(1, 220 / Math.max(placed.width, 1), 90 / Math.max(placed.height, 1))
  return h('svg', { className: 'sq-mini', viewBox: `-4 -4 ${placed.width + 8} ${placed.height + 8}`, width: Math.max(40, (placed.width + 8) * scale), height: Math.max(24, (placed.height + 8) * scale), 'aria-hidden': true },
    placed.edges.filter(edge => !edge.dep).map((edge) => {
      const a = at.get(edge.from)
      const b = at.get(edge.to)
      return h('line', { key: `${edge.from}-${edge.to}`, x1: a.x + size.width / 2, y1: a.y + size.height, x2: b.x + size.width / 2, y2: b.y, stroke: 'var(--sq-line)', strokeWidth: 1.5 })
    }),
    placed.nodes.map(item => h('rect', { key: item.node.id, x: item.x, y: item.y, width: size.width, height: size.height, rx: 3, fill: `var(--sq-${item.node.state.status})` })))
}

function HeldList({ team }) {
  const [open, setOpen] = useState(false)
  if (team.held.length === 0) return null
  const dispose = async (row, disposition, extra = {}) => {
    try {
      if (disposition === 'started') {
        const run = await call('start-run', { requestId: requestId('held'), teamId: team.id, goal: row.text })
        extra = { run_id: run.run_id }
      }
      await call('dispose', { inputId: row.input_id, body: { request_id: requestId('dispose'), disposition, ...extra } })
      toast(disposition === 'dismissed' ? '已忽略这条消息' : disposition === 'started' ? '已用这句话开始' : '已转为补充指导', 'ok')
    } catch (error) {
      toast(`没有处理：${error.message}`)
    }
    await refreshNow()
  }
  const active = team.run && team.run.admitted && !['completed', 'cancelled'].includes(team.run.phase)
  return h('div', { className: 'sq-held' },
    h('button', { className: 'sq-link', onClick: (event) => { event.stopPropagation(); setOpen(value => !value) } }, `${team.held.length} 条消息没交给任何任务 ${open ? '▴' : '▾'}`),
    open ? team.held.map(row => h('div', { key: row.input_id, className: 'sq-held-row', onClick: event => event.stopPropagation() },
      h('div', null, `“${String(row.text).slice(0, 60)}”`),
      h('div', { className: 'sq-row' },
        active
          ? h('button', { className: 'sq-btn', onClick: () => dispose(row, 'guidance', { run_id: team.run.run_id, expected_revision: team.run.revision }) }, '转为补充指导')
          : h('button', { className: 'sq-btn', 'data-kind': 'primary', onClick: () => dispose(row, 'started') }, '用这句话开始'),
        h('button', { className: 'sq-btn', onClick: () => dispose(row, 'dismissed') }, '忽略')))) : null)
}

function TeamCard({ team, snapshot }) {
  const focus = () => store.set(state => ({ ...state, teamScope: team.id, runId: team.run?.run_id ?? null }))
  const queued = team.run && !team.run.admitted ? team.run.waiting_roles?.[0] : null
  return h('div', { className: 'sq-team', role: 'button', tabIndex: 0, 'data-team': team.id, 'data-s': team.runState.status, 'aria-label': `小队 ${team.id}：${team.runState.label ?? team.runState.status}`, onClick: focus, onKeyDown: event => { if (event.key === 'Enter') focus() } },
    h('div', { className: 'sq-row' },
      h('strong', { style: { flex: 1 } }, `小队 ${team.id}`),
      h(StatusChip, { state: team.runState }),
      h('button', { className: 'sq-btn sq-team-menu', title: '规则', 'aria-label': `小队 ${team.id} 的规则`, onClick: (event) => { event.stopPropagation(); store.set(state => ({ ...state, tab: 'config', configFocus: `team:${team.id}` })) } }, '⚙')),
    h('div', { className: 'sq-muted' }, team.bound ? `群「${team.room}」· ${team.members.length} 位成员` : '还没绑定到群'),
    h('div', { className: 'sq-team-goal' }, team.run ? team.run.goal : '还没有 Run'),
    queued ? h('div', { className: 'sq-muted' }, `排队：等 ${queued.role_id}，`, h('button', { className: 'sq-link', onClick: (event) => { event.stopPropagation(); store.set(state => ({ ...state, teamScope: queued.owner_team_id, runId: queued.owner_run_id })) } }, `被小队 ${queued.owner_team_id} 占用`)) : null,
    h(MiniTree, { snapshot, runId: team.run?.run_id }),
    h('div', { className: 'sq-row sq-team-counts' }, Object.entries(team.counts).filter(([, n]) => n > 0).map(([status, n]) => h('span', { key: status, className: 'sq-status', 'data-s': status }, `${LABEL[status]} ${n}`))),
    h(HeldList, { team }))
}

export function Overview() {
  const snapshot = useStore(state => state.projection.snapshot)
  const bound = useStore(state => state.teams)
  const approvals = useStore(state => state.approvals)
  const teams = teamsOf(snapshot, bound, approvals)
  return h('div', { className: 'sq-main' },
    h('div', { className: 'sq-row' }, h('h2', { style: { margin: 0, flex: 1 } }, `全部小队（${teams.length}）`),
      h('button', { className: 'sq-btn', 'data-kind': 'primary', onClick: () => store.set(state => ({ ...state, startOpen: true })) }, '＋ 开始一个小队任务')),
    h('div', { className: 'sq-grid sq-teams' }, teams.map(team => h(TeamCard, { key: team.id, team, snapshot }))),
    teams.length === 0 ? h('div', { className: 'sq-card' }, '还没有小队。在「小队与规则」里新建一个。') : null)
}

export function TeamSwitcher() {
  const snapshot = useStore(state => state.projection.snapshot)
  const bound = useStore(state => state.teams)
  const scope = useStore(state => state.teamScope ?? null)
  const ids = teamsOf(snapshot, bound).map(team => team.id)
  if (ids.length < 2) return null
  const pick = id => store.set(state => ({ ...state, teamScope: id, runId: id === null ? state.runId : (currentRun(snapshot, id)?.run_id ?? null) }))
  if (ids.length > 4) {
    return h('select', { className: 'sq-select sq-switch', value: scope ?? '', onChange: event => pick(event.target.value || null), 'aria-label': '切换小队' },
      h('option', { value: '' }, `全部小队（${ids.length}）`), ids.map(id => h('option', { key: id, value: id }, `小队 ${id}`)))
  }
  return h('div', { className: 'sq-seg', role: 'tablist', 'aria-label': '切换小队' },
    [null, ...ids].map(id => h('button', { key: id ?? 'all', role: 'tab', 'aria-selected': scope === id, 'data-on': scope === id || undefined, onClick: () => pick(id) }, id === null ? `全部（${ids.length}）` : id)))
}

export function StartPanel() {
  const open = useStore(state => state.startOpen)
  const snapshot = useStore(state => state.projection.snapshot)
  const { scope } = useScope()
  const bound = useStore(state => state.teams)
  const teams = (snapshot?.views?.teams ?? []).map(team => team.config)
  const [teamId, setTeam] = useState(null)
  const [goal, setGoal] = useState('')
  const [workflowId, setWorkflow] = useState('')
  const [busy, setBusy] = useState(false)
  const chosen = teamId ?? scope ?? teams[0]?.team_id ?? ''
  // A Team with no Run yet opens on this panel: there is nothing else to look at.
  const empty = chosen !== '' && scope !== null && !(snapshot?.views?.runs ?? []).some(run => run.team_id === chosen)
  if (!open && !empty) return null
  const team = (snapshot?.views?.teams ?? []).find(candidate => candidate.config.team_id === chosen)
  const workflows = Object.keys(team?.workflows ?? {})
  const close = () => store.set(state => ({ ...state, startOpen: false }))
  const start = async () => {
    setBusy(true)
    try {
      const run = await call('start-run', { requestId: requestId('run'), teamId: chosen, goal, ...(workflowId ? { workflowId } : {}) })
      store.set(state => ({ ...state, startOpen: false, teamScope: chosen, runId: run.run_id }))
      setGoal('')
      toast('小队已开始', 'ok')
    } catch (error) {
      toast(`没能开始：${error.message}`)
    } finally {
      setBusy(false)
      await refreshNow()
    }
  }
  return h('aside', { className: 'sq-start', role: 'dialog', 'aria-label': '开始一个小队任务' },
    h('div', { className: 'sq-row' }, h('strong', { style: { flex: 1 } }, '开始一个小队任务'), open ? h('button', { className: 'sq-x', 'aria-label': '关闭', onClick: close }, '×') : null),
    h('label', null, '小队', h('select', { className: 'sq-select', value: chosen, onChange: event => setTeam(event.target.value) }, teams.map(t => h('option', { key: t.team_id, value: t.team_id }, t.team_id)))),
    bound[chosen] ? null : h('div', { className: 'sq-muted' }, `还没绑定到群：会自动建群「${chosen} 小队」并把成员拉进去。`),
    workflows.length > 0 ? h('label', null, '流程', h('select', { className: 'sq-select', value: workflowId, onChange: event => setWorkflow(event.target.value) },
      h('option', { value: '' }, `默认流程${team?.config?.default_workflow ? `（${team.config.default_workflow}）` : '（由 Leader 安排）'}`),
      workflows.map(id => h('option', { key: id, value: id }, id)))) : null,
    h('label', null, '目标', h('textarea', { className: 'sq-text', style: { minHeight: 120 }, placeholder: '要完成什么？例如：认识分数：分数的意义与读写（五年级）', value: goal, onChange: event => setGoal(event.target.value) })),
    h('button', { className: 'sq-btn', 'data-kind': 'primary', disabled: busy || !chosen || goal.trim() === '', onClick: start }, busy ? '正在开始…' : '开始'))
}

/** The Runs tab: the overview for several Teams, else one Team's Run. */
export function useScope() {
  const snapshot = useStore(state => state.projection.snapshot)
  const bound = useStore(state => state.teams)
  const scope = useStore(state => state.teamScope ?? null)
  const count = teamsOf(snapshot, bound).length
  return { overview: scope === null && count >= 2, scope: count < 2 ? (teamsOf(snapshot, bound)[0]?.id ?? null) : scope }
}
