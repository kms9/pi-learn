// Judge for the lite comparison (feat/dsh-exp-lite): one fraction courseware, the same
// checks for every group. Deterministic: headless Chrome and axe-core, plus keyword checks
// on the visible text. Keyword checks are heuristics; the report says so.
//
//   node dsh_squad/experiments/lite/judges/courseware.mjs <file.html> [--shots <prefix>]
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { axeViolations, launch, openPage, settle } from './browser.mjs'

const DESKTOP = { width: 1280, height: 800 }
const MOBILE = { width: 375, height: 812 }

// Knowledge the page must teach (Chinese, grade 5 fractions), each a visible-text test.
const KNOWLEDGE = [
  ['K1 分数的意义（平均分）', text => /平均分/.test(text)],
  ['K2 分子与分母', text => /分子/.test(text) && /分母/.test(text)],
  ['K3 分数的读法与写法', text => /读作|读法|写作|写法/.test(text)],
  ['K4 单位分数或几分之一', text => /单位分数|几分之一|\d\s*\/\s*\d|\d+分之\d+/.test(text)],
  ['K5 例题或练习', text => /例|练习|习题/.test(text)],
  ['K6 教学要点或易错点', text => /教学要点|要点|易错|误区/.test(text)],
]

// Interact with the first controls and report whether the page's content changed.
async function interactionChanges(page) {
  const before = await page.evaluate(() => document.body.innerText + document.body.innerHTML.length)
  const tried = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('input[type=range], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, button, summary, [role=button], [onclick]')].slice(0, 6)
    const labels = []
    for (const el of controls) {
      labels.push(`${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ''}`)
      if (el.tagName === 'SELECT') { el.selectedIndex = Math.min(1, el.options.length - 1); el.dispatchEvent(new Event('change', { bubbles: true })) }
      else if (el.tagName === 'INPUT' && el.type === 'range') { el.value = String(Number(el.max || 10)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }
      else if (el.tagName === 'INPUT') { el.value = '1'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }
      else el.click()
    }
    return labels
  })
  await settle(page)
  const after = await page.evaluate(() => document.body.innerText + document.body.innerHTML.length)
  return { changed: before !== after, tried }
}

export async function judgeCourseware(file, { shots } = {}) {
  const browser = await launch()
  const checks = []
  const add = (id, level, ok, detail = null) => checks.push({ id, level, ok: Boolean(ok), detail })
  let text = ''
  let shown = ''
  let counts = {}
  try {
    const source = readFileSync(file, 'utf8')
    add('L0', 'must', /<html[\s>]/i.test(source) && /<body[\s>]/i.test(source), 'a complete HTML document (html and body)')
    const { page, external, errors } = await openPage(browser, file, DESKTOP)
    await settle(page)
    // Knowledge is checked on all the page's text, including text in hidden tabs or pages
    // (a student reaches it by clicking). The rendered-only text is kept as a separate count.
    text = await page.evaluate(() => document.body?.textContent ?? '')
    shown = await page.evaluate(() => document.body?.innerText ?? '')
    counts = await page.evaluate(() => ({
      interactive: document.querySelectorAll('input, select, textarea, button, summary, [role=button], [onclick]').length,
      visuals: document.querySelectorAll('svg, canvas, img').length,
    }))
    for (const [id, test] of KNOWLEDGE) add(id, id.startsWith('K1') || id.startsWith('K2') || id.startsWith('K3') ? 'must' : 'should', test(text), test(shown) ? 'shown without interaction' : 'only in hidden tabs or pages')
    add('V1 有图示（svg、canvas 或 img）', 'should', counts.visuals > 0)
    add('F1 有可交互控件', 'must', counts.interactive > 0, `${counts.interactive} control(s)`)
    if (counts.interactive > 0) {
      const { changed, tried } = await interactionChanges(page)
      add('F2 使用控件后页面内容有变化', 'must', changed, `tried ${tried.join(', ') || 'none'}`)
    } else {
      add('F2 使用控件后页面内容有变化', 'must', false, 'no control to use')
    }
    if (shots) await page.screenshot({ path: `${shots}-desktop.png` })
    const errorCount = errors.length
    add('C1 无控制台错误或页面异常', 'must', errorCount === 0, errorCount ? errors.slice(0, 2).join(' | ') : null)
    add('R6 无外部网络请求', 'must', external.length === 0, external.length ? `${external.length} external request(s)` : null)
    await page.close()

    const mobile = await openPage(browser, file, MOBILE)
    await settle(mobile.page)
    const width = await mobile.page.evaluate(() => document.documentElement.scrollWidth)
    add('M1 375 px 宽时无横向滚动', 'should', width <= MOBILE.width, `scrollWidth ${width}`)
    if (shots) await mobile.page.screenshot({ path: `${shots}-mobile.png` })
    await mobile.page.close()

    const { page: a11y } = await openPage(browser, file, DESKTOP)
    const violations = await axeViolations(a11y)
    add('A1 无严重或严重级的无障碍违规（axe）', 'should', violations.length === 0, violations.slice(0, 4).join('; ') || null)
    await a11y.close()
  } finally {
    await browser.close()
  }
  const must = checks.filter(c => c.level === 'must')
  const result = {
    judge: 'courseware-fraction',
    version: 1,
    file,
    text_chars: text.length,
    shown_chars: shown.length,
    counts,
    checks,
    must_passed: must.every(c => c.ok),
    requirement_coverage: checks.filter(c => c.ok).length / checks.length,
    goal_success: must.every(c => c.ok),
  }
  return result
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]
  const shotsAt = process.argv.indexOf('--shots')
  if (!file) { console.error('usage: courseware.mjs <file.html> [--shots <prefix>]'); process.exit(2) }
  const out = await judgeCourseware(file, { shots: shotsAt > 0 ? process.argv[shotsAt + 1] : undefined })
  writeFileSync(1, `${JSON.stringify(out, null, 2)}\n`)
}
