// EXP-01 judge: deterministic checks of a single-page courseware (lesson.html) against
// requirements R1-R8 and the interface contract the task gives every arm (see
// specs/exp01.json). Nothing here is an LLM. Each check says what it tried and why it failed.
//
//   node dsh_squad/experiments/exp/judges/exp01.mjs <lesson.html>      (prints JSON)
import { fileURLToPath } from 'node:url'
import { axeViolations, launch, near, numbersIn, openPage, seeded, settle, TOOLS } from './browser.mjs'

const GRID = Array.from({ length: 41 }, (_, i) => -4 + i * 0.25) // x = -4 .. 6
const FIXED_CURVES = [{ a: 1, b: -2, c: -3 }, { a: -2, b: 4, c: 1 }, { a: 0.5, b: 1, c: -4 }]
const PRACTICE_TOL = 0.01
const MOBILE = { width: 375, height: 812 }
const DESKTOP = { width: 1280, height: 800 }

// Vertex, axis and roots of y = ax^2 + bx + c, from the formulas.
function facts({ a, b, c }) {
  const h = -b / (2 * a)
  const k = c - (b * b) / (4 * a)
  const delta = b * b - 4 * a * c
  const roots = delta > 0 ? [(-b + Math.sqrt(delta)) / (2 * a), (-b - Math.sqrt(delta)) / (2 * a)] : delta === 0 ? [h] : []
  return { h, k, delta, roots }
}

// Ten parameter sets with a != 0, covering delta > 0, = 0 and < 0. Fixed seed.
function paramSets() {
  const rand = seeded()
  const pick = (lo, hi) => Math.round((lo + rand() * (hi - lo)) * 2) / 2
  const sets = [{ a: 1, b: -4, c: 4 }, { a: -1, b: 0, c: -1 }] // delta = 0 and delta < 0 included
  while (sets.length < 10) {
    let a = pick(-3, 3)
    if (a === 0) a = 1
    sets.push({ a, b: pick(-6, 6), c: pick(-6, 6) })
  }
  return sets
}

async function setParams(page, params) {
  await page.evaluate(p => window.lesson.setParams(p), params)
  await settle(page)
}

// R1: the drawn curve follows f(x) on x in [-4, 6]. Each point of f inside the plot must
// lie on the drawn path; the path is read with getPointAtLength in the SVG's own coordinates.
async function curveMatches(page, params) {
  await setParams(page, params)
  const expected = await page.evaluate((p, xs) => {
    const curve = document.querySelector('[data-testid=curve]')
    if (!curve || !curve.ownerSVGElement) return { error: 'no [data-testid=curve] inside an svg' }
    const box = curve.ownerSVGElement.viewBox.baseVal
    const points = xs.map(x => window.lesson.toPixel(x, p.a * x * x + p.b * x + p.c))
    const inside = points.filter(([px, py]) => Number.isFinite(px) && Number.isFinite(py) && px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height)
    const length = curve.getTotalLength()
    const drawn = []
    for (let s = 0; s <= length; s += length / 600) { const q = curve.getPointAtLength(s); drawn.push([q.x, q.y]) }
    return { inside, drawn, tol: 0.012 * Math.max(box.width, box.height) }
  }, params, GRID)
  if (expected.error) return { ok: false, detail: expected.error }
  if (expected.inside.length < 10) return { ok: false, detail: `only ${expected.inside.length} of 41 points of f inside the plot` }
  const far = expected.inside.filter(([px, py]) => !expected.drawn.some(([dx, dy]) => Math.hypot(dx - px, dy - py) <= expected.tol))
  return far.length === 0 ? { ok: true } : { ok: false, detail: `${far.length} of ${expected.inside.length} points of f are off the drawn curve (tolerance ${expected.tol.toFixed(1)})` }
}

async function sliderMoves(page) {
  const seen = []
  for (const name of ['a', 'b', 'c']) {
    const value = name === 'a' ? 2 : -3
    const ok = await page.evaluate((n, v) => {
      const slider = document.querySelector(`[data-testid=slider-${n}]`)
      if (!slider) return 'missing'
      slider.value = String(v)
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      slider.dispatchEvent(new Event('change', { bubbles: true }))
      return window.lesson.getParams()[n] === v ? 'ok' : `params.${n} is ${window.lesson.getParams()[n]}`
    }, name, value)
    await settle(page)
    seen.push(`${name}:${ok}`)
  }
  return seen.every(entry => entry.endsWith(':ok')) ? { ok: true } : { ok: false, detail: seen.join(' ') }
}

async function textFor(page, id) {
  return page.evaluate(testid => document.querySelector(`[data-testid=${testid}]`)?.textContent ?? '', id)
}

// R3: vertex, axis and roots text match the formulas for each parameter set.
async function factsText(page, sets) {
  const bad = []
  for (const params of sets) {
    await setParams(page, params)
    const { h, k, delta, roots } = facts(params)
    const vertex = numbersIn(await textFor(page, 'vertex'))
    const axis = numbersIn(await textFor(page, 'axis'))
    const rootsText = await textFor(page, 'roots')
    const label = JSON.stringify(params)
    if (!(vertex.some(v => near(v, h)) && vertex.some(v => near(v, k)))) bad.push(`vertex ${label}`)
    if (!axis.some(v => near(v, h))) bad.push(`axis ${label}`)
    if (delta < 0) {
      if (!rootsText.includes('无实数根')) bad.push(`roots should say 无实数根 ${label}`)
    } else {
      const found = numbersIn(rootsText)
      const ok = roots.every(r => found.some(f => near(f, r)))
      if (!ok) bad.push(`roots ${label}`)
    }
  }
  return bad.length === 0 ? { ok: true } : { ok: false, detail: bad.slice(0, 4).join('; ') + (bad.length > 4 ? ` (+${bad.length - 4})` : '') }
}

async function explanations(page) {
  const need = [
    ['explain-completing-square', /配方/],
    ['explain-root-formula', /求根|判别式|Δ|△/],
    ['explain-opening', /开口|向上|向下|a\s*[>＞]\s*0|a\s*[<＜]\s*0/],
  ]
  const weak = []
  for (const [id, pattern] of need) {
    const text = await textFor(page, id)
    if (text.trim().length < 8 || !pattern.test(text)) weak.push(id)
  }
  return weak.length === 0 ? { ok: true } : { ok: false, detail: `missing or unrelated text: ${weak.join(', ')}` }
}

// R5: the practice reads its vertex from window.lesson.practice(); the judge types an
// answer, submits, and reads data-result on the feedback element.
async function practice(page) {
  // Typed the way a student types: keystrokes, so a number field drops the spaces a text
  // field would keep. Assigning .value would bypass that and test the wrong thing.
  const submit = async (x, y) => {
    for (const [id, value] of [['practice-x', x], ['practice-y', y]]) {
      await page.click(`[data-testid=${id}]`)
      await page.keyboard.down('Control')
      await page.keyboard.press('KeyA')
      await page.keyboard.up('Control')
      await page.keyboard.press('Backspace')
      await page.keyboard.type(value)
    }
    await page.click('[data-testid=practice-submit]')
    await settle(page)
    return page.evaluate(() => document.querySelector('[data-testid=feedback]')?.getAttribute('data-result') ?? 'none')
  }
  const expected = await page.evaluate(() => window.lesson.practice())
  const [h, k] = expected.vertex
  const cases = [
    ['correct', String(Number(h.toFixed(2))), String(Number(k.toFixed(2))), 'correct'],
    ['correct with spaces', ` ${h.toFixed(2)} `, ` ${k.toFixed(2)} `, 'correct'],
    ['wrong x', String(h + 1), String(k), 'wrong'],
  ]
  const results = []
  for (const [label, x, y, want] of cases) {
    const got = await submit(x, y)
    results.push(got === want ? null : `${label}: got ${got}, want ${want}`)
  }
  const bad = results.filter(Boolean)
  return bad.length === 0 ? { ok: true } : { ok: false, detail: bad.join('; ') }
}

// R6 is recorded by openPage (external requests). R7: the layout at 375 px.
async function mobileLayout(browser, file) {
  const { page, external, errors } = await openPage(browser, file, MOBILE)
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  const outside = await page.evaluate(() => ['slider-a', 'slider-b', 'slider-c', 'practice-submit'].filter(id => {
    const el = document.querySelector(`[data-testid=${id}]`)
    if (!el) return true
    const box = el.getBoundingClientRect()
    return box.left < 0 || box.right > window.innerWidth + 0.5 || box.width === 0
  }))
  await page.close()
  return { width, outside, external: external.length, errors: errors.length }
}

// R8: names and keyboard reach for each control, feedback as text, and axe on the page.
async function accessibility(page) {
  const controls = ['slider-a', 'slider-b', 'slider-c', 'practice-x', 'practice-y', 'practice-submit']
  const unfocusable = await page.evaluate(ids => ids.filter(id => {
    const el = document.querySelector(`[data-testid=${id}]`)
    if (!el) return true
    el.focus()
    return document.activeElement !== el
  }), controls)
  const unnamed = await page.evaluate(ids => ids.filter(id => {
    const el = document.querySelector(`[data-testid=${id}]`)
    if (!el) return true
    const named = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label') || el.textContent.trim()
    return !named
  }), controls)
  const violations = await axeViolations(page)
  const problems = [...unfocusable.map(id => `not focusable ${id}`), ...unnamed.map(id => `no accessible name ${id}`), ...violations.map(v => `axe ${v}`)]
  return problems.length === 0 ? { ok: true } : { ok: false, detail: problems.slice(0, 6).join('; ') }
}

// A check that throws (a missing window.lesson method, a broken page) fails that check
// with the reason; it does not stop the other checks or the run.
export async function judgeExp01(file) {
  const browser = await launch()
  const checks = []
  const add = (id, level, result) => checks.push({ id, level, ok: result.ok, detail: result.detail ?? null })
  const guard = async (id, level, body) => {
    try {
      add(id, level, await body())
    } catch (error) {
      add(id, level, { ok: false, detail: `exception: ${String(error.message ?? error).slice(0, 160)}` })
    }
  }
  try {
    const { page, external, errors, hasLesson } = await openPage(browser, file, DESKTOP)
    add('C0', 'must', { ok: hasLesson, detail: hasLesson ? null : 'window.lesson is not defined' })
    if (hasLesson) {
      await guard('R1', 'must', async () => {
        const r1 = []
        for (const params of FIXED_CURVES) r1.push(await curveMatches(page, params))
        return r1.every(r => r.ok) ? { ok: true } : { ok: false, detail: r1.find(r => !r.ok).detail }
      })
      await guard('R2', 'must', async () => {
        const sets = paramSets()
        const r2 = []
        for (const params of sets) r2.push(await curveMatches(page, params))
        const sliders = await sliderMoves(page)
        return r2.every(r => r.ok) && sliders.ok ? { ok: true } : { ok: false, detail: r2.find(r => !r.ok)?.detail ?? sliders.detail }
      })
      await guard('R3', 'must', () => factsText(page, paramSets()))
      await guard('R4', 'must', () => explanations(page))
      await guard('R5', 'must', () => practice(page))
      await guard('R8', 'should', () => accessibility(page))
    }
    await page.close()
    let mobile = { width: 0, outside: [], external: 0, errors: 0 }
    await guard('R7', 'should', async () => {
      mobile = await mobileLayout(browser, file)
      return mobile.width <= MOBILE.width && mobile.outside.length === 0 ? { ok: true } : { ok: false, detail: `scrollWidth ${mobile.width}; outside: ${mobile.outside.join(',') || 'none'}` }
    })
    const extEnd = external.length + mobile.external
    add('R6', 'must', { ok: extEnd === 0, detail: extEnd > 0 ? `${extEnd} external request(s)` : null })
    const errs = errors.length + mobile.errors
    add('C1', 'must', { ok: errs === 0, detail: errs > 0 ? errors.slice(0, 2).join(' | ') : null })
  } catch (error) {
    add('C0', 'must', { ok: false, detail: `exception: ${String(error.message ?? error).slice(0, 160)}` })
  } finally {
    await browser.close()
  }
  const must = checks.filter(c => c.level === 'must')
  const requirements = checks.filter(c => c.id.startsWith('R'))
  return {
    judge: 'exp01',
    version: 3,
    tools: TOOLS,
    checks,
    must_passed: must.every(c => c.ok),
    requirement_coverage: requirements.filter(c => c.ok).length / requirements.length,
    goal_success: must.every(c => c.ok),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]
  if (!file) { console.error('usage: exp01.mjs <lesson.html>'); process.exit(2) }
  const out = await judgeExp01(file)
  console.log(JSON.stringify(out, null, 2))
}
