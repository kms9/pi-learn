// The page check an author or reviewer runs on its own draft before it hands the page in
// (EXP plan §1.2, D4). A headless Chrome on the host loads the HTML with the network
// blocked and reports what a browser sees of the page itself: console errors, requests
// that would leave the page, horizontal overflow at 375 and 1280 px, the visible text,
// and controls with no accessible name. It runs no acceptance checks, so nothing the
// Run is judged on can be read from it.
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

// The same install the experiment judges use (puppeteer-core outside the repository).
const TOOLS = process.env.DSH_EXP_TOOLS ?? join(homedir(), '.cache/dsh-exp-tools')
const CHROME = process.env.CHROME ?? '/usr/bin/google-chrome'
const VIEWPORTS = [{ label: '375 px', width: 375, height: 812 }, { label: '1280 px', width: 1280, height: 800 }]
const MAX_HTML = 2_000_000
const MAX_TEXT = 400

// Runs in the page. Plain DOM reads only.
function measure() {
  const labelText = id => (id ? [...document.querySelectorAll(`label[for="${CSS.escape(id)}"]`)].map(el => el.textContent).join(' ') : '')
  const named = el => {
    if (el.getAttribute('aria-label')?.trim()) return true
    const ids = el.getAttribute('aria-labelledby')
    if (ids && ids.split(/\s+/).some(id => document.getElementById(id)?.textContent.trim())) return true
    if (labelText(el.id).trim() || el.closest('label')) return true
    if (el.title?.trim()) return true
    if (el.tagName === 'INPUT' && el.type === 'image' && el.alt?.trim()) return true
    return el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA' && el.textContent.trim() !== ''
  }
  const controls = [...document.querySelectorAll('input, select, textarea, button, a[href], [role="button"], [role="slider"]')]
    .filter(el => el.type !== 'hidden' && el.getAttribute('aria-hidden') !== 'true' && !el.closest('[hidden]'))
  const unnamed = controls.filter(el => !named(el)).map(el => (el.id ? `${el.tagName.toLowerCase()}#${el.id}` : el.tagName.toLowerCase()))
  return {
    scrollWidth: document.documentElement.scrollWidth,
    text: (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim(),
    controls: controls.length,
    unnamed,
  }
}

/**
 * The page check of one HTML document, as the text the author reads back.
 * @param {string} html  the full page
 * @returns {Promise<string>}
 */
export async function checkPage(html) {
  if (typeof html !== 'string' || html.trim() === '') return 'Page check: give the HTML of the page in html.'
  if (html.length > MAX_HTML) return `Page check: the page is over ${MAX_HTML} characters.`
  let puppeteer
  try {
    puppeteer = createRequire(join(TOOLS, 'package.json'))('puppeteer-core')
  } catch {
    return 'Page check is not available on this host (no headless browser installed).'
  }
  let browser
  try {
    // The model wrote this page, so the browser keeps its sandbox.
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  } catch (error) {
    return `Page check failed to start the browser: ${String(error?.message ?? error).slice(0, 160)}`
  }
  try {
    // Each URL and message counts once, however many viewports reach it.
    const external = new Set()
    const errors = new Set()
    const lines = []
    let text = ''
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage()
      await page.setViewport({ width: viewport.width, height: viewport.height })
      await page.setRequestInterception(true)
      page.on('request', request => {
        if (/^(data|about|blob):/.test(request.url())) return request.continue()
        external.add(request.url().slice(0, 120))
        return request.abort()
      })
      // The browser also logs each blocked request as a failed load; the list above says it.
      page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource: net::ERR_FAILED')) errors.add(message.text().slice(0, 160)) })
      page.on('pageerror', error => errors.add(String(error?.message ?? error).slice(0, 160)))
      try {
        await page.setContent(html, { waitUntil: 'load', timeout: 10_000 })
        const seen = await page.evaluate(measure)
        const overflow = seen.scrollWidth > viewport.width
        lines.push(`${viewport.label}: horizontal overflow ${overflow ? `yes (scrollWidth ${seen.scrollWidth})` : 'no'}`)
        if (viewport.width === VIEWPORTS[1].width) text = seen.text
        if (viewport.width === VIEWPORTS[0].width) lines.push(`controls without an accessible name: ${seen.unnamed.length === 0 ? 'none' : seen.unnamed.slice(0, 12).join(', ')} (of ${seen.controls})`)
      } catch (error) {
        lines.push(`${viewport.label}: could not render (${String(error?.message ?? error).slice(0, 120)})`)
      } finally {
        await page.close()
      }
    }
    const head = [
      `external requests (blocked): ${external.size === 0 ? 'none' : `${external.size}: ${[...external].slice(0, 5).join(' ')}`}`,
      `console errors: ${errors.size === 0 ? 'none' : [...errors].slice(0, 5).join(' | ')}`,
    ]
    return [...head, ...lines, `visible text (1280 px): ${text.slice(0, MAX_TEXT) || '(none)'}`].join('\n')
  } finally {
    await browser.close()
  }
}
