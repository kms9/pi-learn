// A tidy top-down tree layout (UI plan §2.2). Pure: nodes in, positions out. Each
// subtree is as wide as its children together (or one card), a parent sits centred over
// its children, and the whole tree is centred on the root. A folded node keeps its
// children out of the layout and reports how many it hides.
import { descendants } from './tree.js'

export const CARD = { width: 232, height: 112, gapX: 28, gapY: 56 }

export function layout(root, folded = new Set(), size = CARD) {
  const out = []
  const edges = []
  const widthOf = new Map()
  const visibleChildren = node => (folded.has(node.id) ? [] : node.children)
  const measure = (node) => {
    const children = visibleChildren(node)
    const inner = children.reduce((sum, child) => sum + measure(child), 0) + Math.max(0, children.length - 1) * size.gapX
    const width = Math.max(size.width, inner)
    widthOf.set(node.id, width)
    return width
  }
  const place = (node, left, depth) => {
    const width = widthOf.get(node.id)
    const x = left + (width - size.width) / 2
    const y = depth * (size.height + size.gapY)
    out.push({ node, x, y, depth, hidden: folded.has(node.id) ? descendants(node).length : 0 })
    const children = visibleChildren(node)
    const inner = children.reduce((sum, child) => sum + widthOf.get(child.id), 0) + Math.max(0, children.length - 1) * size.gapX
    let cursor = left + (width - inner) / 2
    for (const child of children) {
      edges.push({ from: node.id, to: child.id })
      place(child, cursor, depth + 1)
      cursor += widthOf.get(child.id) + size.gapX
    }
  }
  const total = measure(root)
  place(root, 0, 0)
  const ids = new Set(out.map(item => item.node.id))
  const deps = out.flatMap(item => item.node.deps.filter(id => ids.has(id)).map(id => ({ from: id, to: item.node.id, dep: true })))
  const depth = Math.max(0, ...out.map(item => item.depth))
  return { nodes: out, edges: [...edges, ...deps], width: total, height: (depth + 1) * size.height + depth * size.gapY, rootX: out[0].x }
}
