// EXP-03 judge: the twelve planted bugs, the regressions against the EXP-01 baseline on the
// input page, and the new requirement (a practice that asks for a quadratic from its vertex
// and a point). Nothing here is an LLM. Each probe says what it tried; a probe that cannot run
// counts as the bug still present.
//
//   node dsh_squad/experiments/exp/judges/exp03.mjs <lesson.html> [--probes]
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { launch, near, numbersIn, openPage, settle } from './browser.mjs'
import { judgeExp01 } from './exp01.mjs'

const EXP = dirname(dirname(fileURLToPath(import.meta.url)))
const INPUT = join(EXP, 'fixtures/exp03/input/lesson.html')
const DESKTOP = { width: 1280, height: 800 }
const MOBILE = { width: 375, height: 812 }
const sleep = ms => new Promise(done => setTimeout(done, ms))

const pass = () => ({ ok: true })
const fail = detail => ({ ok: false, detail })
const bugIf = (present, why) => ({ bug: present, detail: present ? why : null })

async function typeInto(page, id, value) {
  await page.click(`[data-testid="${id}"]`)
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  if (value !== '') await page.keyboard.type(value)
}

const text = (page, id) => page.evaluate(testid => document.querySelector(`[data-testid="${testid}"]`)?.textContent ?? '', id)

// Each probe returns { bug, detail }: bug is true when the behaviour it checks is still wrong.
const probes = {
  // The vertex of y = x² + 4x is at x = −2.
  async B01(browser, file) {
    const { page } = await openPage(browser, file, DESKTOP)
    try {
      await page.evaluate(() => window.lesson.setParams({ a: 1, b: 4, c: 0 }))
      await settle(page)
      const vertex = numbersIn(await text(page, 'vertex'))
      return bugIf(!vertex.some(v => near(v, -2)), `vertex text is ${JSON.stringify(await text(page, 'vertex'))}, want x = -2`)
    } finally {
      await page.close()
    }
  },
  // y = 2x² − 4x − 6 has roots 3 and −1.
  async B02(browser, file) {
    const { page } = await openPage(browser, file, DESKTOP)
    try {
      await page.evaluate(() => window.lesson.setParams({ a: 2, b: -4, c: -6 }))
      await settle(page)
      const roots = numbersIn(await text(page, 'roots'))
      return bugIf(!(roots.some(v => near(v, 3)) && roots.some(v => near(v, -1))), `roots text is ${JSON.stringify(await text(page, 'roots'))}, want 3 and -1`)
    } finally {
      await page.close()
    }
  },
  // The curve must reach the right end of the plot, x = 6.
  async B03(browser, file) {
    const { page } = await openPage(browser, file, DESKTOP)
    try {
      await page.evaluate(() => window.lesson.setParams({ a: 1, b: -2, c: -3 }))
      await settle(page)
      const last = await page.evaluate(() => {
        const numbers = document.querySelector('[data-testid=curve]').getAttribute('d').match(/-?\d+(\.\d+)?/g).map(Number)
        const px = numbers.filter((_, i) => i % 2 === 0).at(-1)
        const x0 = window.lesson.toPixel(-4, 0)[0]
        const x1 = window.lesson.toPixel(6, 0)[0]
        return -4 + (px - x0) / (x1 - x0) * 10
      })
      return bugIf(Math.abs(last - 6) > 0.01, `the drawn curve ends at x = ${last.toFixed(3)}, want 6`)
    } finally {
      await page.close()
    }
  },
  // The vertex of y = x² − 9 is at y = −9, below the plot; the marker must stay in the plot.
  async B04(browser, file) {
    const { page } = await openPage(browser, file, DESKTOP)
    try {
      await page.evaluate(() => window.lesson.setParams({ a: 1, b: 0, c: -9 }))
      await settle(page)
      const cy = await page.evaluate(() => Number(document.querySelector('[data-testid=vertex-point]').getAttribute('cy')))
      return bugIf(!(cy >= 0 && cy <= 400.01), `the vertex marker is at cy = ${cy.toFixed(1)}, outside the plot (0 to 400)`)
    } finally {
      await page.close()
    }
  },
  // Pausing and resuming the demonstration must continue from where it stopped.
  async B05(browser, file) {
    const { page } = await openPage(browser, file, DESKTOP)
    try {
      await page.click('[data-testid=anim-toggle]')
      await sleep(1000)
      await page.click('[data-testid=anim-toggle]')
      await sleep(100)
      const before = await page.evaluate(() => window.lesson.getParams().a)
      await page.click('[data-testid=anim-toggle]')
      await sleep(50)
      const after = await page.evaluate(() => window.lesson.getParams().a)
      return bugIf(Math.abs(after - before) > 0.2, `a is ${before.toFixed(3)} when paused and ${after.toFixed(3)} when resumed`)
    } finally {
      await page.close()
    }
  },
  // A slider moved during the demonstration keeps its value when the demonstration ends.
  async B06(browser, file) {
    const { page } = await openPage(browser, file, DESKTOP)
    try {
      await page.click('[data-testid=anim-toggle]')
      await sleep(500)
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid=slider-a]')
        el.value = '2'
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await sleep(5000)
      const a = await page.evaluate(() => window.lesson.getParams().a)
      return bugIf(Math.abs(a - 2) > 0.01, `a is ${a.toFixed(3)} after the demonstration ended; the slider set 2`)
    } finally {
      await page.close()
    }
  },
  // The practice is judged by value: "2.0" and "-3.0" are the vertex (2, −3).
  async B07(browser, file) {
    const { page } = await openPage(browser, file, DESKTOP)
    try {
      await typeInto(page, 'practice-x', '2.0')
      await typeInto(page, 'practice-y', '-3.0')
      await page.click('[data-testid=practice-submit]')
      await settle(page)
      const result = await page.evaluate(() => document.querySelector('[data-testid=feedback]')?.getAttribute('data-result') ?? 'none')
      return bugIf(result !== 'correct', `the vertex typed as 2.0 and -3.0 is judged ${result}`)
    } finally {
      await page.close()
    }
  },
  // Both coordinates are judged: a right x with a wrong y is wrong.
  async B08(browser, file) {
    const { page } = await openPage(browser, file, DESKTOP)
    try {
      await typeInto(page, 'practice-x', '2')
      await typeInto(page, 'practice-y', '0')
      await page.click('[data-testid=practice-submit]')
      await settle(page)
      const result = await page.evaluate(() => document.querySelector('[data-testid=feedback]')?.getAttribute('data-result') ?? 'none')
      return bugIf(result === 'correct', 'x = 2 with y = 0 is judged correct; the vertex is (2, -3)')
    } finally {
      await page.close()
    }
  },
  // The plot fits a 375 px screen (it is not a fixed 600 px wide).
  async B09(browser, file) {
    const { page } = await openPage(browser, file, MOBILE)
    try {
      const width = await page.evaluate(() => document.querySelector('[data-testid=plot]').getBoundingClientRect().width)
      return bugIf(width > 375, `the plot is ${width.toFixed(0)} px wide at 375 px`)
    } finally {
      await page.close()
    }
  },
  // At 375 px the submit button is fully inside the viewport.
  async B10(browser, file) {
    const { page } = await openPage(browser, file, MOBILE)
    try {
      const right = await page.evaluate(() => document.querySelector('[data-testid=practice-submit]').getBoundingClientRect().right)
      return bugIf(!(right <= 375.5), `the submit button ends at x = ${right.toFixed(0)} at 375 px`)
    } finally {
      await page.close()
    }
  },
  // Each slider has an accessible name: a label for it, aria-label, aria-labelledby or an enclosing label.
  async B11(browser, file) {
    const { page } = await openPage(browser, file, DESKTOP)
    try {
      const unnamed = await page.evaluate(ids => ids.filter(id => {
        const el = document.querySelector(`[data-testid="${id}"]`)
        if (!el) return true
        return !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label'))
      }), ['slider-a', 'slider-b', 'slider-c'])
      return bugIf(unnamed.length > 0, `no accessible name: ${unnamed.join(', ')}`)
    } finally {
      await page.close()
    }
  },
  // A wrong answer gets text, and the feedback is announced (role=status or aria-live).
  async B12(browser, file) {
    const { page } = await openPage(browser, file, DESKTOP)
    try {
      await typeInto(page, 'practice-x', '9')
      await typeInto(page, 'practice-y', '9')
      await page.click('[data-testid=practice-submit]')
      await settle(page)
      const feedback = await page.evaluate(() => {
        const el = document.querySelector('[data-testid=feedback]')
        return { text: el?.textContent.trim() ?? '', live: Boolean(el?.getAttribute('aria-live')) || el?.getAttribute('role') === 'status' }
      })
      return bugIf(feedback.text === '' || !feedback.live, `feedback text ${JSON.stringify(feedback.text)}, announced ${feedback.live}`)
    } finally {
      await page.close()
    }
  },
}

// The new requirement (spec: the practice that asks for y = ax² + bx + c from a vertex and a point).
async function newRequirement(browser, file) {
  const { page } = await openPage(browser, file, DESKTOP)
  try {
    const present = await page.evaluate(ids => ids.every(id => document.querySelector(`[data-testid="${id}"]`)), ['formula-a', 'formula-b', 'formula-c', 'formula-submit', 'formula-feedback'])
    if (!present) return fail('no formula-a, formula-b, formula-c, formula-submit or formula-feedback')
    const cases = [[['2', '-4', '0'], 'correct'], [['2.0', '-4.0', '0.0'], 'correct'], [['2', '-4', '1'], 'wrong'], [['x', '-4', '0'], 'wrong']]
    const bad = []
    for (const [[a, b, c], want] of cases) {
      await typeInto(page, 'formula-a', a)
      await typeInto(page, 'formula-b', b)
      await typeInto(page, 'formula-c', c)
      await page.click('[data-testid="formula-submit"]')
      await settle(page)
      const feedback = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="formula-feedback"]')
        return { result: el?.getAttribute('data-result') ?? 'none', text: el?.textContent.trim() ?? '' }
      })
      if (feedback.result !== want) bad.push(`(${a}, ${b}, ${c}) judged ${feedback.result}, want ${want}`)
      else if (feedback.text === '') bad.push(`(${a}, ${b}, ${c}): no feedback text`)
    }
    return bad.length === 0 ? pass() : fail(bad.join('; '))
  } finally {
    await page.close()
  }
}

let inputBaseline
const baseline = () => {
  inputBaseline ??= judgeExp01(INPUT)
  return inputBaseline
}

// Every probe on one page: { id: { bug, detail } }. A probe that throws counts as the bug present.
export async function probeAll(browser, file) {
  const out = {}
  for (const [id, probe] of Object.entries(probes)) {
    try {
      out[id] = await probe(browser, file)
    } catch (error) {
      out[id] = { bug: true, detail: `exception: ${String(error.message ?? error).slice(0, 140)}` }
    }
  }
  return out
}

export async function judgeExp03(file) {
  const browser = await launch()
  const checks = []
  try {
    const formula = await newRequirement(browser, file).catch(error => fail(`exception: ${String(error.message ?? error).slice(0, 140)}`))
    checks.push({ id: 'N1', level: 'must', ok: formula.ok, detail: formula.detail ?? null })

    const found = await probeAll(browser, file)
    for (const [id, result] of Object.entries(found)) checks.push({ id: `P-${id}`, level: 'probe', ok: !result.bug, detail: result.detail })
    const escaped = Object.entries(found).filter(([, result]) => result.bug).map(([id]) => id)

    const before = await baseline()
    const after = await judgeExp01(file)
    const regressed = []
    for (const check of before.checks.filter(c => c.id.startsWith('R'))) {
      const now = after.checks.find(c => c.id === check.id)
      if (check.ok && !now?.ok) regressed.push(`${check.id}: ${now?.detail ?? 'failed'}`)
    }
    checks.push({ id: 'E1', level: 'must', ok: escaped.length <= 1, detail: escaped.length ? `${escaped.length} bug(s) still present: ${escaped.join(' ')}` : null })
    checks.push({ id: 'G1', level: 'must', ok: regressed.length === 0, detail: regressed.join('; ') || null })
    for (const check of after.checks.filter(c => c.id.startsWith('R'))) checks.push({ id: `B-${check.id}`, level: 'baseline', ok: check.ok, detail: check.detail })

    const must = checks.filter(c => c.level === 'must')
    const requirements = checks.filter(c => c.id === 'N1' || c.id.startsWith('P-') || c.id.startsWith('B-'))
    return {
      judge: 'exp03',
      version: 1,
      checks,
      escaped,
      regressions: regressed.length,
      must_passed: must.every(c => c.ok),
      requirement_coverage: requirements.filter(c => c.ok).length / requirements.length,
      goal_success: must.every(c => c.ok),
    }
  } finally {
    await browser.close()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, mode] = process.argv.slice(2)
  if (!file) {
    console.error('usage: exp03.mjs <lesson.html> [--probes]')
    process.exit(2)
  }
  if (mode === '--probes') {
    const browser = await launch()
    try {
      console.log(JSON.stringify(await probeAll(browser, file), null, 2))
    } finally {
      await browser.close()
    }
  } else {
    console.log(JSON.stringify(await judgeExp03(file), null, 2))
  }
}
