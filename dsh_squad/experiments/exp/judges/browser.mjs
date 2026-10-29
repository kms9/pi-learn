// Shared browser helpers for the experiment judges (headless Chrome through puppeteer-core).
// puppeteer-core is not a dependency of this repository. Install it outside the repo and
// point at it:
//
//   cd ~/.cache/dsh-exp-tools && npm install puppeteer-core@25.14.0 axe-core@4.14.0
//   DSH_EXP_TOOLS=~/.cache/dsh-exp-tools CHROME=/usr/bin/google-chrome   (defaults)
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const TOOLS = process.env.DSH_EXP_TOOLS ?? join(homedir(), '.cache/dsh-exp-tools')
const tools = createRequire(join(TOOLS, 'package.json'))

export async function launch() {
  const puppeteer = tools('puppeteer-core')
  return puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] })
}

// Opens a file in a fresh page and records every request that leaves the file (R6).
// file:, data: and about: are local; anything else is recorded and aborted.
export async function openPage(browser, file, viewport = { width: 1280, height: 800 }) {
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
  const hasLesson = await page.waitForFunction(() => typeof window.lesson === 'object' && window.lesson !== null, { timeout: 3000 }).then(() => true, () => false)
  return { page, external, errors, hasLesson }
}

export const frame = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
export const settle = async page => { await frame(page); await new Promise(done => setTimeout(done, 30)) }

// Seeded generator, so every judge run asks the same questions.
export function seeded(seed = 20261029) {
  let state = seed >>> 0
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 }
}

// Numbers in a piece of text: handles the Unicode minus, fractions and decimals.
export function numbersIn(text) {
  const normalized = String(text ?? '').replace(/−/g, '-').replace(/,/g, '')
  const out = []
  for (const match of normalized.matchAll(/-?\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?/g)) {
    const parts = match[0].split('/').map(part => Number(part.trim()))
    out.push(parts.length === 2 ? parts[0] / parts[1] : parts[0])
  }
  return out
}

export const near = (a, b, tol = 0.01) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol

// Accessibility by axe-core: serious and critical violations of WCAG 2 A/AA.
export async function axeViolations(page) {
  await page.addScriptTag({ path: join(TOOLS, 'node_modules/axe-core/axe.min.js') })
  return page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
    return result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}:${v.impact}:${v.nodes.length}`)
  })
}
