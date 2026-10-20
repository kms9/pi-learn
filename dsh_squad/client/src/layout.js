// A tidy top-down tree layout (UI plan §2.2). Pure: nodes in, positions out. Each
// subtree is as wide as its children together (or one card), a parent sits centred over
// its children, and the whole tree is centred on the root. A folded node keeps its
// children out of the layout and reports how many it hides.
//
// Many siblings wrap (Q47): when a node's children side by side would be wider than
// about six cards, they are packed into rows in order, each row centred under the
// parent, later rows below the earlier ones. Edges to a later row run down the left of
// the block and along a lane above that row, so they never cross a card.
import { descendants } from './tree.js'

export const CARD = { width: 232, height: 112, gapX: 28, gapY: 56 }
const PER_ROW = 6

export function layout(root, folded = new Set(), size = CARD) {
  const out = []
  const edges = []
  const boxOf = new Map()
  const limit = size.wrapWidth ?? PER_ROW * (size.width + size.gapX) - size.gapX
  const visibleChildren = node => (folded.has(node.id) ? [] : node.children)
  const rowWidth = row => row.reduce((sum, child) => sum + boxOf.get(child.id).width, 0) + Math.max(0, row.length - 1) * size.gapX
  // Children packed into rows, in order: a row takes children while it fits the limit.
  const rowsOf = (children) => {
    if (rowWidth(children) <= limit) return children.length ? [children] : []
    const rows = [[]]
    for (const child of children) {
      const row = rows.at(-1)
      if (row.length > 0 && rowWidth([...row, child]) > limit) rows.push([child])
      else row.push(child)
    }
    return rows
  }
  const measure = (node) => {
    const children = visibleChildren(node)
    for (const child of children) measure(child)
    const rows = rowsOf(children)
    const inner = Math.max(0, ...rows.map(rowWidth))
    const below = rows.reduce((sum, row) => sum + size.gapY + Math.max(...row.map(child => boxOf.get(child.id).height)), 0)
    const box = { width: Math.max(size.width, inner), height: size.height + below, rows }
    boxOf.set(node.id, box)
    return box
  }
  const place = (node, left, top, depth) => {
    const box = boxOf.get(node.id)
    const x = left + (box.width - size.width) / 2
    out.push({ node, x, y: top, depth, hidden: folded.has(node.id) ? descendants(node).length : 0 })
    let rowTop = top + size.height + size.gapY
    // The trunk for later rows: just left of the widest row.
    const trunkX = left + (box.width - Math.max(0, ...box.rows.map(rowWidth))) / 2 - size.gapX / 2
    const firstLane = rowTop - size.gapY / 2
    box.rows.forEach((row, index) => {
      let cursor = left + (box.width - rowWidth(row)) / 2
      for (const child of row) {
        edges.push(index === 0 ? { from: node.id, to: child.id } : { from: node.id, to: child.id, bus: { trunkX, firstLane, lane: rowTop - size.gapY / 2 } })
        place(child, cursor, rowTop, depth + 1)
        cursor += boxOf.get(child.id).width + size.gapX
      }
      rowTop += Math.max(...row.map(child => boxOf.get(child.id).height)) + size.gapY
    })
  }
  const total = measure(root)
  place(root, 0, 0, 0)
  const ids = new Set(out.map(item => item.node.id))
  const deps = out.flatMap(item => item.node.deps.filter(id => ids.has(id)).map(id => ({ from: id, to: item.node.id, dep: true })))
  return { nodes: out, edges: [...edges, ...deps], width: total.width, height: total.height, rootX: out[0].x }
}
