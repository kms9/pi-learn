// The task tree canvas (UI plan §2.2–2.3): the Run's tree drawn top-down, cards
// absolutely placed by the layout, edges in SVG beneath. Cards move with a transform
// transition, so siblings make way by themselves when a node appears; a new node grows
// out of its parent; the tree stays centred until the person moves it. Folding and the
// details drawer live here too.
import { createElement as h, Fragment, memo, useEffect, useMemo, useRef, useState } from 'react'
import { autoFolded, treeOf } from './tree.js'
import { CARD, layout } from './layout.js'
import { KIND } from './model.js'
import { store, useStore } from './store.js'
import { StatusChip } from './summarybar.js'
import { NodePopover, hasActions } from './actions.js'
import { alsoIn } from './teams.js'

const PALETTE = ['#3d5afe', '#00897b', '#f4511e', '#8e24aa', '#c0ca33', '#0288d1', '#d81b60', '#6d4c41']
const NAMED = { deepseek: '#4d6bfe', blue: '#2563eb', green: '#16a34a', orange: '#ea580c', red: '#dc2626', purple: '#7c3aed', pink: '#db2777', teal: '#0d9488', yellow: '#ca8a04', gray: '#6b7280' }
const colorOf = (member) => {
  const named = member?.look?.color
  if (typeof named === 'string' && (NAMED[named] || /^#[0-9a-f]{6}$/i.test(named))) return NAMED[named] ?? named
  const key = member?.botId ?? member?.agentId ?? ''
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

export function Avatar({ member, size = 28 }) {
  const image = member?.look?.avatar?.image
  const name = member?.name || member?.agentId || '?'
  return image
    ? h('img', { className: 'sq-avatar', src: image, alt: '', width: size, height: size })
    : h('span', { className: 'sq-avatar', 'aria-hidden': true, style: { width: size, height: size, background: colorOf(member) } }, name.slice(0, 1).toUpperCase())
}

// A card redraws only when what it shows changed: a big tree (UI plan P6, 50+ nodes)
// stays smooth while the snapshot ticks.
const sameCard = (a, b) => a.selected === b.selected && a.isNew === b.isNew && a.item.x === b.item.x && a.item.y === b.item.y && a.item.hidden === b.item.hidden
  && a.also.join() === b.also.join() && a.onSelect === b.onSelect && a.onFold === b.onFold && a.onFocus === b.onFocus && cardKey(a.item.node) === cardKey(b.item.node)
const cardKey = node => JSON.stringify([node.id, node.title, node.state, node.folds?.status, node.children.length, node.member?.name, node.member?.model, node.member?.look?.color, node.member?.look?.avatar?.image, node.decisions, node.run?.guidance?.length, node.task?.kind])

const NodeCard = memo(function NodeCard({ item, selected, isNew, onSelect, onFold, onFocus, also = [] }) {
  const { node, hidden } = item
  const state = hidden > 0 && node.folds ? node.folds : node.state
  const count = node.children.length
  const folded = hidden > 0
  return h('div', {
    className: 'sq-node', 'data-s': state.status, 'data-kind': node.kind, 'data-new': isNew || undefined, 'data-selected': selected || undefined, 'data-folded': folded || undefined,
    style: { transform: `translate(${item.x}px, ${item.y}px)`, width: CARD.width, height: CARD.height },
    role: 'button', tabIndex: 0, 'aria-label': [node.kind === 'run' ? 'Leader' : node.member?.name || node.role, node.title, LABELS[state.status], state.note, state.reason, folded ? `折叠了 ${hidden} 个` : ''].filter(Boolean).join('，'), 'aria-pressed': selected, 'data-node': node.id,
    onClick: () => onSelect(node.id), onFocus: () => onFocus(item), onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node.id) } },
  },
  h('div', { className: 'sq-node-head' },
    h(Avatar, { member: node.member }),
    h('div', { className: 'sq-node-who' },
      h('div', { className: 'sq-node-role' }, node.kind === 'run' ? `Leader · ${node.member?.name ?? ''}` : `${node.member?.name || node.role}${node.task?.kind && node.task.kind !== 'execute' ? ` · ${KIND[node.task.kind] ?? node.task.kind}` : ''}`),
      node.member?.model ? h('div', { className: 'sq-node-model' }, node.member.model) : null),
    also.length > 0 ? h('span', { className: 'sq-node-also', title: `这位成员也在小队 ${also.join('、')} 工作` }, `也在小队 ${also.join('、')}`) : null,
    h(StatusChip, { state })),
  h('div', { className: 'sq-node-title', title: node.kind === 'run' ? node.run.goal : node.task?.goal }, node.title),
  h('div', { className: 'sq-node-note' }, [['failed', 'attention'].includes(state.status) ? '点开处理' : '', state.note, node.kind === 'run' && node.decisions ? `Leader 已决定 ${node.decisions} 次` : '', node.kind === 'run' && (node.run.guidance ?? []).length ? `${node.run.guidance.length} 条补充指导` : ''].filter(Boolean).slice(0, 2).join(' · ')),
  count > 0 ? h('button', {
    className: 'sq-node-count', 'aria-label': folded ? `展开 ${hidden} 个` : `折叠 ${count} 个子节点`, title: folded ? '展开' : '折叠',
    onClick: (event) => { event.stopPropagation(); onFold(node.id) },
  }, folded ? `+${hidden}` : String(count)) : null)
}, sameCard)
const LABELS = { running: '进行中', done: '完成', attention: '需要你处理', failed: '失败', stopped: '已停止', waiting: '未开始' }

function Edges({ items, edges, width, height }) {
  const at = new Map(items.map(item => [item.node.id, item]))
  return h('svg', { className: 'sq-edges', width: Math.max(width, 1), height: Math.max(height, 1), 'aria-hidden': true },
    edges.map((edge) => {
      const a = at.get(edge.from)
      const b = at.get(edge.to)
      if (!a || !b) return null
      if (edge.dep) {
        const x1 = a.x + CARD.width
        const y1 = a.y + CARD.height / 2
        const x2 = b.x
        const y2 = b.y + CARD.height / 2
        const forward = x2 > x1
        const d = forward ? `M${x1},${y1} C${x1 + 30},${y1} ${x2 - 30},${y2} ${x2},${y2}` : `M${a.x + CARD.width / 2},${a.y + CARD.height} C${a.x + CARD.width / 2},${a.y + CARD.height + 30} ${b.x + CARD.width / 2},${b.y - 30} ${b.x + CARD.width / 2},${b.y}`
        return h('path', { key: `d-${edge.from}-${edge.to}`, className: 'sq-edge-dep', d })
      }
      const x1 = a.x + CARD.width / 2
      const y1 = a.y + CARD.height
      const x2 = b.x + CARD.width / 2
      const y2 = b.y
      // A later row of wrapped siblings: down, along the left of the block, along the
      // lane above the row, down into the card (layout.js).
      if (edge.bus) {
        const { trunkX, firstLane, lane } = edge.bus
        return h('path', { key: `${edge.from}-${edge.to}`, className: 'sq-edge', 'data-to-s': b.node.state.status, 'data-bus': true, d: `M${x1},${y1} V${firstLane} H${trunkX} V${lane} H${x2} V${y2}` })
      }
      const mid = (y1 + y2) / 2
      return h('path', { key: `${edge.from}-${edge.to}`, className: 'sq-edge', 'data-to-s': b.node.state.status, d: `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`, style: { transition: 'd .25s' } })
    }))
}

function Drawer({ node, onClose }) {
  const previewBase = useStore(state => state.previewBase)
  const attempts = useStore(state => state.projection.snapshot?.views?.attempts ?? [])
  const closer = useRef(null)
  useEffect(() => { closer.current?.focus({ preventScroll: true }) }, [node?.id])
  if (!node) return null
  const task = node.task
  const run = node.run
  const own = task ? (task.attempt_ids ?? []).map(id => attempts.find(attempt => attempt.attempt_id === id)).filter(Boolean) : []
  const result = task?.result
  return h('aside', { className: 'sq-drawer', role: 'dialog', 'aria-label': `详情：${node.title}` },
    h('div', { className: 'sq-row' }, h(StatusChip, { state: node.state }), h('strong', { style: { flex: 1 } }, node.title), h('button', { className: 'sq-x', 'aria-label': '关闭详情', onClick: onClose, ref: closer }, '×')),
    node.state.reason ? h('div', { className: 'sq-reason' }, node.state.reason) : null,
    h('div', { className: 'sq-row' }, h(Avatar, { member: node.member, size: 22 }), h('span', null, node.kind === 'run' ? `Leader · ${node.member?.name ?? ''}` : `${node.member?.name || ''} · ${node.role}`), node.member?.model ? h('span', { className: 'sq-muted' }, node.member.model) : null),
    h('div', { className: 'sq-muted' }, node.kind === 'run' ? '目标' : '任务'),
    h('div', { className: 'sq-pre' }, run?.goal ?? task?.goal),
    run && (run.guidance ?? []).length ? h(Fragment, null, h('div', { className: 'sq-muted' }, '补充指导'), h('ul', null, run.guidance.map((text, index) => h('li', { key: index }, typeof text === 'string' ? text : text.text)))) : null,
    task?.kind === 'review' && result?.value ? h(Fragment, null, h('div', { className: 'sq-muted' }, '审核结论'), h('div', null, `${result.value.decision === 'accepted' ? '通过' : '退回'}：${result.value.reason ?? ''}`)) : null,
    task && task.kind !== 'review' && result ? h(Fragment, null, h('div', { className: 'sq-muted' }, `结果（第 ${result.revision} 版）`), h('pre', { className: 'sq-pre' }, JSON.stringify(result.value, null, 2).slice(0, 1200))) : null,
    (result?.artifacts ?? []).length ? h('div', null, result.artifacts.map(art => h('div', { key: art.sha256, className: 'sq-row' }, h('span', null, art.name ?? art.path),
      previewBase && art.media_type === 'text/html' ? h('button', { className: 'sq-btn', onClick: () => store.set(state => ({ ...state, preview: { url: `${previewBase}/v2/artifacts/sha256/${art.sha256}`, name: art.name } })) }, '预览') : null))) : null,
    task?.acceptance && task.kind !== 'review' ? h('div', { className: 'sq-muted' }, `验收：${task.acceptance.decision === 'accepted' ? '通过' : '退回'}${task.acceptance.reason ? ` · ${task.acceptance.reason}` : ''}`) : null,
    own.length > 1 ? h(Fragment, null, h('div', { className: 'sq-muted' }, '尝试历史'), h('ol', null, own.map(attempt => h('li', { key: attempt.attempt_id }, `${attempt.state}${attempt.error ? `（${attempt.error}）` : ''}`)))) : null,
    h('details', { className: 'sq-tech' }, h('summary', null, '技术细节'),
      h('pre', { className: 'sq-pre' }, JSON.stringify(task ? { task_id: task.task_id, kind: task.kind, state: task.state, revision: task.revision, origin: task.origin, blockers: task.blockers, attempts: own.map(attempt => ({ id: attempt.attempt_id, state: attempt.state, segment: attempt.segment_id, error: attempt.error, cleanup: attempt.cleanup_state })) } : { run_id: run.run_id, phase: run.phase, revision: run.revision, recovery_hold: run.recovery_hold, blockers: run.blockers }, null, 2))))
}

// Each Run keeps where the person left it (pan, zoom, folds) while they switch Teams.
const memory = new Map()

export function RunCanvas({ runId }) {
  const snapshot = useStore(state => state.projection.snapshot)
  const approvals = useStore(state => state.approvals)
  const bots = useStore(state => state.bots)
  const focus = useStore(state => state.focus)
  const tree = useMemo(() => treeOf(snapshot, runId, { approvals, bots }), [snapshot, runId, approvals, bots])
  const bound = useStore(state => state.teams)
  const [overrides, setOverrides] = useState(() => memory.get(runId)?.overrides ?? {})
  const [selected, setSelected] = useState(null)
  const [details, setDetails] = useState(false)
  const [view, setView] = useState(() => memory.get(runId)?.view ?? { x: 0, y: 24, scale: 1, moved: false })
  useEffect(() => { memory.set(runId, { view, overrides }) }, [runId, view, overrides])
  const box = useRef(null)
  const seen = useRef(null)
  const drag = useRef(null)
  // Stable handlers, so unchanged cards are not redrawn.
  const foldedRef = useRef(new Set())
  const selectRef = useRef((id) => { setSelected(id); setDetails(false) })
  const toggleRef = useRef(id => setOverrides(current => ({ ...current, [id]: !foldedRef.current.has(id) })))
  const auto = useMemo(() => (tree ? autoFolded(tree.root) : new Set()), [tree])
  // A node a jump points at is never folded away: its ancestors open.
  const forcedOpen = useMemo(() => {
    const open = new Set()
    if (!tree || !focus?.taskId) return open
    const target = [...tree.nodes.values()].find(node => node.task?.task_id === focus.taskId && !node.children.some(child => child.task?.task_id === focus.taskId))
    const walk = (node, path) => {
      if (node === target) { for (const id of path) open.add(id); return true }
      return node.children.some(child => walk(child, [...path, node.id]))
    }
    if (target) walk(tree.root, [])
    return open
  }, [tree, focus?.at])
  const folded = useMemo(() => new Set([...auto, ...Object.entries(overrides).filter(([, value]) => value).map(([id]) => id)].filter(id => overrides[id] !== false && !forcedOpen.has(id))), [auto, overrides, forcedOpen])
  const placed = useMemo(() => (tree ? layout(tree.root, folded) : null), [tree, folded])
  // Remember the nodes already drawn: only the ones that appear later grow in.
  const fresh = new Set()
  if (placed) {
    if (seen.current === null) seen.current = new Set(placed.nodes.map(item => item.node.id))
    for (const item of placed.nodes) if (!seen.current.has(item.node.id)) fresh.add(item.node.id)
  }
  useEffect(() => { if (placed) for (const item of placed.nodes) seen.current.add(item.node.id) })
  useEffect(() => { seen.current = null; setSelected(null); setView(current => ({ ...current, moved: false })) }, [runId])
  // Centred on the root until the person pans or zooms.
  useEffect(() => {
    if (!placed || !box.current || view.moved) return
    const width = box.current.clientWidth
    setView(current => ({ ...current, x: Math.round(width / 2 - (placed.rootX + CARD.width / 2) * current.scale), y: 24 }))
  }, [placed?.width, placed?.rootX, view.moved, view.scale])
  // A jump from the summary bar: pan so the node is in the middle, select it, flash it.
  useEffect(() => {
    if (!placed || !focus || focus.runId !== runId || !box.current) return
    const item = focus.taskId ? [...placed.nodes].reverse().find(candidate => candidate.node.task?.task_id === focus.taskId) : placed.nodes[0]
    if (!item) return
    setSelected(item.node.id)
    setDetails(false)
    const { clientWidth, clientHeight } = box.current
    setView(current => ({ ...current, moved: true, x: Math.round(clientWidth / 2 - (item.x + CARD.width / 2) * current.scale), y: Math.round(clientHeight / 2 - (item.y + CARD.height / 2) * current.scale) }))
    const el = box.current.querySelector(`[data-node="${CSS.escape(item.node.id)}"]`)
    el?.setAttribute('data-flash', '')
    const timer = setTimeout(() => el?.removeAttribute('data-flash'), 1200)
    return () => clearTimeout(timer)
  }, [focus?.at, placed !== null])
  // Escape closes the popover or the drawer before anything else, and the focus goes
  // back to the card it came from.
  useEffect(() => {
    if (!selected) return undefined
    const onKey = (event) => {
      if (event.key !== 'Escape' || store.get().preview) return
      event.stopImmediatePropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [selected])
  const close = () => {
    const id = selected
    setSelected(null)
    setTimeout(() => box.current?.querySelector(`[data-node="${CSS.escape(id ?? '')}"]`)?.focus({ preventScroll: true }), 0)
  }
  // A card reached with Tab is brought into view.
  const onFocus = useMemo(() => (item) => {
    const el = box.current
    if (!el) return
    setView((current) => {
      const left = current.x + item.x * current.scale
      const top = current.y + item.y * current.scale
      const inside = left >= 0 && top >= 0 && left + CARD.width * current.scale <= el.clientWidth && top + CARD.height * current.scale <= el.clientHeight
      return inside ? current : { ...current, moved: true, x: Math.round(el.clientWidth / 2 - (item.x + CARD.width / 2) * current.scale), y: Math.round(el.clientHeight / 2 - (item.y + CARD.height / 2) * current.scale) }
    })
  }, [])
  if (!tree || !placed) return h('div', { className: 'sq-muted' }, '选择左边的一个 Run，或开始一个新的。')
  const node = selected ? tree.nodes.get(selected) : null
  const selectedItem = node ? placed.nodes.find(item => item.node.id === node.id) : null
  // A node that needs a person or failed opens its popover; the rest open details.
  const popover = node && hasActions(node) && !details && selectedItem
  const select = selectRef.current
  const toggle = toggleRef.current
  foldedRef.current = folded
  const onWheel = (event) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    setView(current => ({ ...current, moved: true, scale: Math.min(1.6, Math.max(0.2, current.scale * (event.deltaY < 0 ? 1.1 : 0.9))) }))
  }
  return h('div', { className: 'sq-canvas-wrap' },
    h('div', { className: 'sq-canvas-tools' },
      h('button', { className: 'sq-btn', onClick: () => setView(current => ({ ...current, moved: false, scale: 1 })) }, '回到中心'),
      h('button', { className: 'sq-btn', onClick: () => {
        const width = box.current?.clientWidth ?? 800
        const height = box.current?.clientHeight ?? 500
        const scale = Math.max(0.2, Math.min(1, (width - 40) / placed.width, (height - 48) / placed.height))
        setView({ moved: true, scale, x: Math.round((width - placed.width * scale) / 2), y: 24 })
      } }, '适应窗口')),
    h('div', {
      className: 'sq-canvas', ref: box, onWheel, role: 'region', 'aria-label': `任务树：${tree.root.title}，${placed.nodes.length} 个节点。Tab 逐个经过，Enter 打开，Esc 关闭`,
      onMouseDown: (event) => { if (event.target === event.currentTarget || event.target.classList?.contains('sq-edges')) drag.current = { x: event.clientX, y: event.clientY, view } },
      onMouseMove: (event) => { if (drag.current) setView({ ...drag.current.view, moved: true, x: drag.current.view.x + event.clientX - drag.current.x, y: drag.current.view.y + event.clientY - drag.current.y }) },
      onMouseUp: () => { drag.current = null }, onMouseLeave: () => { drag.current = null },
    },
    h('div', { className: 'sq-layer', style: { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` } },
      h(Edges, { items: placed.nodes, edges: placed.edges, width: placed.width, height: placed.height }),
      placed.nodes.map(item => h(NodeCard, { key: item.node.id, item, selected: selected === item.node.id, isNew: fresh.has(item.node.id), onSelect: select, onFold: toggle, onFocus, also: item.node.kind === 'task' ? alsoIn(item.node.member?.botId, tree.root.run.team_id, bound) : [] })),
      popover ? h(NodePopover, { key: `pop-${node.id}`, node, x: selectedItem.x + CARD.width + 14, y: selectedItem.y, onDetails: () => setDetails(true), onClose: close }) : null)),
    node && !popover ? h(Drawer, { node, onClose: close }) : null)
}
