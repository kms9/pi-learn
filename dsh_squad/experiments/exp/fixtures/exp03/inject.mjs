// Plants the twelve bugs of EXP-03 (plan §4.2) into the golden page, and writes:
//   input/lesson.html          the page every arm starts from (all twelve bugs)
//   hidden/bugs.json           the answer key: id, category, what it is, the decoys (never copied into a project)
//   hidden/variants/<ID>.html  each bug alone, for the judge's self-check
//
// Each bug is a list of exact replacements. Every "from" text must occur exactly once in the
// golden page, or the script stops: a planted bug must be where it is written.
//
//   node dsh_squad/experiments/exp/fixtures/exp03/inject.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const golden = readFileSync(join(HERE, 'golden.html'), 'utf8')

const BUGS = [
  { id: 'B01', category: 'formula', name: 'vertex x has the wrong sign', edits: [['return -p.b / (2 * p.a)', 'return p.b / (2 * p.a)']] },
  { id: 'B02', category: 'formula', name: 'root formula divides by 2 instead of 2a', edits: [
    ['(-params.b + Math.sqrt(delta)) / (2 * params.a)', '(-params.b + Math.sqrt(delta)) / 2'],
    ['(-params.b - Math.sqrt(delta)) / (2 * params.a)', '(-params.b - Math.sqrt(delta)) / 2'],
  ] },
  { id: 'B03', category: 'svg-bounds', name: 'the curve sampling stops one step early', edits: [['for (var s = X0; s <= X1 + 1e-9; s += 0.05) {', 'for (var s = X0; s <= X1 - 0.05 + 1e-9; s += 0.05) {']] },
  { id: 'B04', category: 'svg-bounds', name: 'the vertex marker is not clamped to the plot', edits: [['clamp(p[1], 0, 400).toFixed(2)', 'p[1].toFixed(2)']] },
  { id: 'B05', category: 'animation', name: 'pausing the demonstration loses its progress', edits: [['anim.elapsed += performance.now() - anim.since', 'anim.elapsed = 0']] },
  { id: 'B06', category: 'animation', name: 'a slider does not stop the running demonstration', edits: [['      stopAnimation()\n      var next', '      var next']] },
  { id: 'B07', category: 'judging', name: 'answers are compared as strings', edits: [
    ['var okX = Math.abs(x - practiceVertex[0]) <= TOL', 'var okX = String(rawX) === String(practiceVertex[0])'],
    ['var okY = Math.abs(y - practiceVertex[1]) <= TOL', 'var okY = String(rawY) === String(practiceVertex[1])'],
  ] },
  { id: 'B08', category: 'judging', name: 'only the x coordinate is judged', edits: [['var right = okX && okY', 'var right = okX']] },
  { id: 'B09', category: 'mobile-layout', name: 'the plot is a fixed 600 px wide', edits: [['svg { width: 100%; height: auto;', 'svg { width: 600px; height: auto;']] },
  { id: 'B10', category: 'mobile-layout', name: 'the practice row does not wrap, so the submit button is cut off', edits: [
    ['.practice { display: flex; flex-wrap: wrap;', '.practice { display: flex; flex-wrap: nowrap;'],
    ['.practice input { width: 6em;', '.practice input { width: 9em;'],
  ] },
  { id: 'B11', category: 'accessibility', name: 'the three sliders have no accessible name', edits: [
    ['<label for="slider-a">', '<label>'],
    ['<label for="slider-b">', '<label>'],
    ['<label for="slider-c">', '<label>'],
  ] },
  { id: 'B12', category: 'accessibility', name: 'feedback is colour only and not announced', edits: [
    [' role="status"', ''],
    ['fb.textContent = right', "fb.textContent = ''; right"],
  ] },
]

// Decoys (plan §4.2): code a reviewer may flag, which is correct. Flagging them is a false positive.
const DECOYS = [
  { id: 'D1', name: 'x * x instead of Math.pow(x, 2)', where: 'curve sampling, f(x, p)' },
  { id: 'D2', name: 'a // TODO comment for a feature that is already implemented', where: 'before the animation state' },
]

function apply(text, edits, label) {
  let out = text
  for (const [from, to] of edits) {
    const count = out.split(from).length - 1
    if (count !== 1) throw new Error(`${label}: "${from.slice(0, 60)}" occurs ${count} times in the page, want 1`)
    out = out.replace(from, () => to)
  }
  return out
}

const all = BUGS.reduce((text, bug) => apply(text, bug.edits, bug.id), golden)
const variants = BUGS.map(bug => ({ id: bug.id, html: apply(golden, bug.edits, bug.id) }))
for (const v of variants) {
  if (v.html === golden) throw new Error(`${v.id} changes nothing`)
}

const input = join(HERE, 'input')
const hidden = join(HERE, 'hidden')
mkdirSync(input, { recursive: true })
mkdirSync(join(hidden, 'variants'), { recursive: true })
writeFileSync(join(input, 'lesson.html'), all)
writeFileSync(join(hidden, 'golden.html'), golden)
writeFileSync(join(hidden, 'bugs.json'), `${JSON.stringify({ bugs: BUGS.map(({ edits, ...rest }) => rest), decoys: DECOYS, edits: Object.fromEntries(BUGS.map(b => [b.id, b.edits])) }, null, 2)}\n`)
for (const v of variants) writeFileSync(join(hidden, 'variants', `${v.id}.html`), v.html)
console.log(`input: ${input}/lesson.html (${all.length} bytes, ${BUGS.length} bugs)`)
console.log(`hidden: ${hidden}`)
