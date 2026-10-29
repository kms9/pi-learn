// EXP-02 judge: deterministic checks of the pendulum page (lesson.html) against R1–R10 and
// the interface the task gives every arm (window.lessonState, specs/exp02.json). Nothing
// here is an LLM. Each check says what it tried and why it failed. The timing checks run in
// real time: a full judge round takes a few minutes.
//
//   node dsh_squad/experiments/exp/judges/exp02.mjs <lesson.html>      (prints JSON)
import { pathToFileURL, fileURLToPath } from 'node:url'
import { axeViolations, launch, near, numbersIn, settle } from './browser.mjs'

const G = 9.8
const LENGTHS = [0.25, 1.0, 1.96]
const MOBILE = { width: 375, height: 812 }
const DESKTOP = { width: 1280, height: 800 }
const sleep = ms => new Promise(done => setTimeout(done, ms))
const theory = L => 2 * Math.PI * Math.sqrt(L / G)

// Opens the page and records outside requests and console errors. Ready = window.lessonState exists.
async function openPage(browser, file, viewport) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const external = []
  const errors = []
  await page.setRequestInterception(true)
  page.on('request', request => {
    const url = request.url()
    if (/^(file|data|about|blob):/.test(url)) return request.continue()
    external.push(url)
    return request.abort()
  })
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(String(error.message ?? error)))
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 15_000 })
  const hasState = await page.waitForFunction(() => typeof window.lessonState === 'function', { timeout: 3000 }).then(() => true, () => false)
  return { page, external, errors, hasState }
}

const state = page => page.evaluate(() => window.lessonState())
const text = (page, id) => page.evaluate(testid => document.querySelector(`[data-testid="${testid}"]`)?.textContent ?? '', id)
const click = (page, id) => page.click(`[data-testid="${id}"]`)

// Sets a range input the way a slider's events do, then lets the page redraw.
async function slide(page, id, value) {
  await page.evaluate((testid, v) => {
    const el = document.querySelector(`[data-testid="${testid}"]`)
    el.value = String(v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, id, value)
  await settle(page)
}

// Clears a field and types the value by keystrokes (a number field drops what it may not hold).
async function typeInto(page, id, value) {
  await page.click(`[data-testid="${id}"]`)
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  if (value !== '') await page.keyboard.type(value)
}

// Upward zero crossings of the angle series, linearly interpolated.
function crossings(series) {
  const out = []
  for (let i = 1; i < series.length; i += 1) {
    const a = series[i - 1]
    const b = series[i]
    if (a.angleDeg < 0 && b.angleDeg >= 0) out.push(a.t + (0 - a.angleDeg) * (b.t - a.t) / (b.angleDeg - a.angleDeg))
  }
  return out
}

const fail = detail => ({ ok: false, detail })
const pass = () => ({ ok: true })
const joined = bad => (bad.length === 0 ? pass() : fail(bad.slice(0, 4).join('; ') + (bad.length > 4 ? ` (+${bad.length - 4})` : '')))

// R1: goal and principle text, and the theory line follows the length.
async function principle(page) {
  const bad = []
  if ((await text(page, 'goal')).trim().length < 4) bad.push('no goal text')
  const statement = await text(page, 'principle')
  if (!/2\s*π/.test(statement) || !statement.includes('√')) bad.push('principle does not state T = 2π√(L/g)')
  if (!/10\s*°/.test(statement)) bad.push('principle does not state the 10° limit')
  for (const L of [1.96, 0.25]) {
    await slide(page, 'length', L)
    if (!numbersIn(await text(page, 'theory')).some(v => near(v, theory(L), 0.0015))) bad.push(`theory does not show ${theory(L).toFixed(3)} s for L = ${L}`)
  }
  await slide(page, 'length', 1)
  return joined(bad)
}

// R2: start, pause (the clock holds, the angle holds), resume (no jump), reset, and a change of length restarts.
async function stateMachine(page) {
  const bad = []
  await slide(page, 'length', 1)
  await slide(page, 'angle', 5)
  await click(page, 'reset')
  await sleep(100)
  let s = await state(page)
  if (s.running || s.t > 0.01) bad.push('reset does not stop and zero the clock')
  await click(page, 'start')
  await sleep(1000)
  s = await state(page)
  if (!s.running || s.t < 0.5) bad.push('start does not run the motion')
  await click(page, 'pause')
  await sleep(150)
  const paused = await state(page)
  await sleep(600)
  const held = await state(page)
  if (held.running || Math.abs(held.t - paused.t) > 0.01 || Math.abs(held.angleDeg - paused.angleDeg) > 0.01) bad.push('pause does not hold the clock and the angle')
  await click(page, 'start')
  await sleep(300)
  const resumed = await state(page)
  const before = paused.series.at(-1)
  const after = resumed.series.find(p => p.t > paused.t)
  if (!before || !after || after.t - before.t > 0.1 || Math.abs(after.angleDeg - before.angleDeg) > 2) bad.push('resume does not continue the motion smoothly')
  await click(page, 'reset')
  await sleep(100)
  s = await state(page)
  if (s.running || s.t > 0.01 || Math.abs(s.angleDeg - 5) > 0.05) bad.push('reset does not return to the starting angle')
  await click(page, 'start')
  await sleep(400)
  await slide(page, 'length', 0.5)
  await sleep(60)
  s = await state(page)
  if (s.t > 0.2) bad.push('changing the length while running does not restart the motion')
  await click(page, 'reset')
  return joined(bad)
}

// R3: the period from the series, for three lengths at a 5° start, within 3% of 2π√(L/g).
async function periods(page) {
  const bad = []
  for (const L of LENGTHS) {
    await slide(page, 'length', L)
    await slide(page, 'angle', 5)
    await click(page, 'reset')
    await click(page, 'start')
    const want = 4 * theory(L) + 0.5
    let s = await state(page)
    for (let i = 0; i < 300 && !(s.series.length > 0 && s.series.at(-1).t >= want); i += 1) {
      await sleep(200)
      s = await state(page)
    }
    await click(page, 'pause')
    const ups = crossings(s.series)
    if (ups.length < 3) {
      bad.push(`L = ${L}: fewer than 3 periods in the series`)
      continue
    }
    const gaps = ups.slice(1).map((t, i) => t - ups[i])
    const T = gaps.reduce((sum, g) => sum + g, 0) / gaps.length
    const err = Math.abs(T - theory(L)) / theory(L)
    if (err >= 0.03) bad.push(`L = ${L}: period ${T.toFixed(3)} s against ${theory(L).toFixed(3)} s (${(err * 100).toFixed(1)}%)`)
  }
  return joined(bad)
}

// Waits for a measurement row beyond the first `before` rows; returns its cell texts.
async function waitRow(page, before) {
  for (let i = 0; i < 180; i += 1) {
    const cells = await page.evaluate(n => {
      const rows = document.querySelectorAll('[data-testid="row"]')
      if (rows.length <= n) return null
      return [...rows[rows.length - 1].querySelectorAll('td')].map(td => td.textContent)
    }, before)
    if (cells) return cells
    await sleep(500)
  }
  return null
}

// R4: the 10-period measurement for each length, as a row of three values.
async function measures(page) {
  const bad = []
  for (const L of LENGTHS) {
    await slide(page, 'length', L)
    const before = await page.evaluate(() => document.querySelectorAll('[data-testid="row"]').length)
    await click(page, 'measure')
    const cells = await waitRow(page, before)
    if (!cells || cells.length < 3) {
      bad.push(`L = ${L}: no measurement row within 90 s`)
      continue
    }
    const [rowL, tenT, T] = cells.map(cell => {
      const m = /=\s*(-?\d+(?:\.\d+)?)/.exec(cell)
      return m ? Number(m[1]) : NaN
    })
    if (!near(rowL, L, 0.005)) bad.push(`row says L = ${rowL} for ${L}`)
    if (Math.abs(tenT - 10 * theory(L)) / (10 * theory(L)) >= 0.03) bad.push(`L = ${L}: 10T = ${tenT} s against ${(10 * theory(L)).toFixed(2)} s`)
    if (!near(tenT / 10, T, 0.01)) bad.push(`L = ${L}: T ${T} does not match 10T / 10`)
  }
  return joined(bad)
}

// R5: one point per measurement, and the slope within 5% of 2π/√g.
async function chart(page) {
  const rows = await page.evaluate(() => document.querySelectorAll('[data-testid="row"]').length)
  const points = await page.evaluate(() => document.querySelectorAll('[data-testid="point"]').length)
  if (rows < 3 || points !== rows) return fail(`${points} points for ${rows} rows`)
  const k = numbersIn(await text(page, 'slope'))[0]
  const want = 2 * Math.PI / Math.sqrt(G)
  return Number.isFinite(k) && Math.abs(k - want) / want <= 0.05 ? pass() : fail(`slope ${k} against ${want.toFixed(3)}`)
}

// R6: at 25° the warning shows and says it is approximate.
async function warning(page) {
  await slide(page, 'angle', 25)
  const shown = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="warning"]')
    return Boolean(el) && !el.hidden && el.textContent.includes('近似')
  })
  await slide(page, 'angle', 5)
  return shown ? pass() : fail('no warning containing 近似 at 25°')
}

// R7: three numeric questions: a right answer, a wrong one and a non-number, each with text feedback.
async function quizzes(page) {
  const answers = { 1: ['1.00', '2.00'], 2: ['2.01', '1.00'], 3: ['2', '3'] }
  const bad = []
  for (const [n, [right, wrong]] of Object.entries(answers)) {
    for (const [value, want] of [[right, 'correct'], [wrong, 'wrong'], ['abc', 'wrong']]) {
      await typeInto(page, `quiz-${n}-input`, value)
      await click(page, `quiz-${n}-submit`)
      await settle(page)
      const feedback = await page.evaluate(id => {
        const el = document.querySelector(`[data-testid="${id}"]`)
        return { result: el?.getAttribute('data-result') ?? 'none', text: el?.textContent.trim() ?? '' }
      }, `quiz-${n}-feedback`)
      if (feedback.result !== want) bad.push(`quiz ${n} with "${value}": got ${feedback.result}, want ${want}`)
      if (feedback.text === '') bad.push(`quiz ${n} with "${value}": no feedback text`)
    }
  }
  return joined(bad)
}

// R10: names and keyboard reach for each control, and axe on the page.
async function accessibility(page) {
  const controls = ['length', 'angle', 'start', 'pause', 'reset', 'measure', 'quiz-1-input', 'quiz-1-submit', 'quiz-2-input', 'quiz-2-submit', 'quiz-3-input', 'quiz-3-submit']
  const unfocusable = await page.evaluate(ids => ids.filter(id => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return true
    el.focus()
    return document.activeElement !== el
  }), controls)
  const unnamed = await page.evaluate(ids => ids.filter(id => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return true
    const named = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label') || el.textContent.trim()
    return !named
  }), controls)
  const violations = await axeViolations(page)
  const problems = [...unfocusable.map(id => `not focusable ${id}`), ...unnamed.map(id => `no accessible name ${id}`), ...violations.map(v => `axe ${v}`)]
  return problems.length === 0 ? pass() : fail(problems.slice(0, 6).join('; '))
}

// R9: 375 px, no horizontal scroll, the controls inside the viewport.
async function mobileLayout(browser, file) {
  const { page, external, errors } = await openPage(browser, file, MOBILE)
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  const outside = await page.evaluate(ids => ids.filter(id => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return true
    const box = el.getBoundingClientRect()
    return box.left < 0 || box.right > window.innerWidth + 0.5 || box.width === 0
  }), ['length', 'angle', 'start', 'pause', 'reset', 'measure', 'quiz-1-submit', 'quiz-3-submit'])
  await page.close()
  return { width, outside, external: external.length, errors: errors.length }
}

// A check that throws fails that check with the reason; it does not stop the others.
export async function judgeExp02(file) {
  const browser = await launch()
  const checks = []
  const add = (id, level, result) => checks.push({ id, level, ok: result.ok, detail: result.detail ?? null })
  const guard = async (id, level, body) => {
    try {
      add(id, level, await body())
    } catch (error) {
      add(id, level, fail(`exception: ${String(error.message ?? error).slice(0, 160)}`))
    }
  }
  try {
    const { page, external, errors, hasState } = await openPage(browser, file, DESKTOP)
    add('C0', 'must', hasState ? pass() : fail('window.lessonState is not a function'))
    if (hasState) {
      await guard('R1', 'must', () => principle(page))
      await guard('R2', 'must', () => stateMachine(page))
      await guard('R3', 'must', () => periods(page))
      await guard('R4', 'must', () => measures(page))
      await guard('R5', 'must', () => chart(page))
      await guard('R6', 'should', () => warning(page))
      await guard('R7', 'must', () => quizzes(page))
      await guard('R10', 'should', () => accessibility(page))
    }
    await page.close()
    let mobile = { width: 0, outside: [], external: 0, errors: 0 }
    await guard('R9', 'should', async () => {
      mobile = await mobileLayout(browser, file)
      return mobile.width <= MOBILE.width && mobile.outside.length === 0 ? pass() : fail(`scrollWidth ${mobile.width}; outside: ${mobile.outside.join(',') || 'none'}`)
    })
    const extEnd = external.length + mobile.external
    add('R8', 'must', extEnd === 0 ? pass() : fail(`${extEnd} external request(s)`))
    const errs = errors.length + mobile.errors
    add('C1', 'must', errs === 0 ? pass() : fail(errors.slice(0, 2).join(' | ')))
  } catch (error) {
    add('C0', 'must', fail(`exception: ${String(error.message ?? error).slice(0, 160)}`))
  } finally {
    await browser.close()
  }
  const must = checks.filter(c => c.level === 'must')
  const requirements = checks.filter(c => c.id.startsWith('R'))
  return {
    judge: 'exp02',
    version: 1,
    checks,
    must_passed: must.every(c => c.ok),
    requirement_coverage: requirements.filter(c => c.ok).length / requirements.length,
    goal_success: must.every(c => c.ok),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: exp02.mjs <lesson.html>')
    process.exit(2)
  }
  console.log(JSON.stringify(await judgeExp02(file), null, 2))
}
