// UI plan P4 acceptance on the mock: attempt history, rework and Q41 in a real browser.
// The math case's first draft is rejected and reworked; the check that ran on that
// draft is then built on a replaced version: it needs a person, who redoes it with the
// new version from its popover (D2). The old check goes grey, the redo hangs under it,
// and the Run completes. Light during, dark at the end.
//
//   PUPPETEER_CORE=<dir with puppeteer-core> node probes/ui-p4.mjs [port] [shots-prefix]
import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PROBES, until } from './lib.mjs'

const port = process.argv[2] ?? '3510'
const shots = process.argv[3] ?? '/tmp/squad-p4'
const REPO = join(PROBES, '..')
const PROJECT = join(PROBES, '.run', 'ui-p4-project')
const CLI = join(REPO, 'dsh_squad', 'deploy', 'dsh-squad')
const run = (...args) => execFileSync(CLI, args, { encoding: 'utf8' })
const puppeteer = createRequire(join(process.env.PUPPETEER_CORE ?? '.', 'package.json'))('puppeteer-core')
const failures = []
const check = (ok, what, detail) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} ${what}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`); if (!ok) failures.push(what) }
const sleep = ms => new Promise(done => setTimeout(done, ms))

rmSync(PROJECT, { recursive: true, force: true })
cpSync(join(REPO, 'dsh_squad', 'cases', 'math', '.agents'), join(PROJECT, '.agents'), { recursive: true })
const flowPath = join(PROJECT, '.agents/dshsquad/teams/math/workflows/lesson.json')
const flow = JSON.parse(readFileSync(flowPath, 'utf8'))
flow.steps.find(step => step.id === 'build').goal += '（测试：首版请退回）'
writeFileSync(flowPath, `${JSON.stringify(flow, null, 2)}\n`)
const loginOf = () => readFileSync(join(PROJECT, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)
const cards = page => page.$$eval('.sq-node', els => els.map(el => {
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform)
  return { id: el.dataset.node, s: el.dataset.s, x: Number(m?.[1]), y: Number(m?.[2]), text: el.innerText.replace(/\s+/g, ' '), folded: el.hasAttribute('data-folded') }
}))

let browser
try {
  run('up', PROJECT, '--mock', '--port', port)
  browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 960 })
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(loginOf(), { waitUntil: 'networkidle2', timeout: 90_000 })
  await sleep(3000)
  await page.$eval('button.sq-foot', el => el.click())
  await sleep(1200)
  await page.type('.sq-shell textarea', '认识分数：分数的意义与读写（五年级）')
  await page.$$eval('.sq-shell button', els => els.find(el => el.innerText.trim() === '开始')?.click())

  const stale = await until(async () => (await page.$$eval('.sq-pill[data-s=attention]', els => els.map(el => el.innerText))).length > 0, 240_000, 500)
  check(stale, 'something needs a person after the rework')
  await page.$eval('.sq-pill[data-s=attention]', el => el.click())
  await sleep(300)
  const items = await page.$$eval('.sq-menu .sq-menu-item', els => els.map(el => el.innerText))
  check(items.some(text => /检查课件/.test(text) && /基于旧版本/.test(text)), 'the check is listed as built on an old version', items)
  await page.$$eval('.sq-menu .sq-menu-item', els => els.find(el => /检查课件/.test(el.innerText))?.click())
  await sleep(1500)
  const popover = await page.$eval('.sq-pop', el => el.innerText).catch(() => '')
  check(/基于旧版本/.test(popover) && /被退回的旧版本/.test(popover), 'the popover says which input was replaced', popover)
  const buttons = await page.$$eval('.sq-pop .sq-pop-main .sq-btn', els => els.map(el => el.innerText))
  check(JSON.stringify(buttons) === JSON.stringify(['保留这一版', '用新版本重做']), 'keep or redo, nothing else', buttons)
  await page.screenshot({ path: `${shots}-light-1-stale.png` })
  await page.$$eval('.sq-pop .sq-btn', els => els.find(el => el.innerText === '用新版本重做')?.click())

  const done = await until(async () => (await cards(page)).some(card => card.id?.startsWith('run:') && card.s === 'done'), 240_000, 1000)
  check(done, 'the Run completes after the redo')
  await sleep(1500)
  for (let i = 0; i < 30; i += 1) {
    const opened = await page.$eval('.sq-node[data-folded] .sq-node-count', el => { el.click(); return true }).catch(() => false)
    if (!opened) break
    await sleep(350)
  }
  const end = await cards(page)
  const checks = end.filter(card => /检查课件/.test(card.text) && !/审核/.test(card.text))
  const oldCheck = checks.find(card => card.s === 'stopped')
  const redo = checks.find(card => card.s === 'done' && card !== oldCheck)
  check(oldCheck && redo && redo.y > oldCheck.y, 'the old check is grey and its redo hangs under it', checks.map(card => [card.s, card.y, card.text.slice(-24)]))
  const drafts = end.filter(card => /制作一页 HTML 课件/.test(card.text) && !/审核/.test(card.text))
  check(drafts.some(card => card.s === 'stopped' && /已被返工替代/.test(card.text)), 'the rejected draft is grey, replaced by its rework')
  await page.screenshot({ path: `${shots}-light-2-history.png` })
  await page.$$eval('.sq-canvas-tools .sq-btn', els => els.find(el => el.innerText === '适应窗口')?.click())
  await sleep(600)
  await page.screenshot({ path: `${shots}-light-3-fit.png` })
  check(errors.length === 0, 'no page errors (light)', errors)

  const dark = await browser.newPage()
  await dark.setViewport({ width: 1440, height: 960 })
  await dark.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await dark.goto(loginOf(), { waitUntil: 'networkidle2', timeout: 90_000 })
  await sleep(3000)
  await dark.$eval('button.sq-foot', el => el.click())
  await sleep(800)
  await dark.$$eval('.sq-side .sq-item', els => els[0]?.click())
  await sleep(1500)
  const folded = await cards(dark)
  check(folded.some(card => card.folded), 'finished rework chains fold into stacks')
  await dark.screenshot({ path: `${shots}-dark-1-folded.png` })
  for (let i = 0; i < 30; i += 1) {
    const opened = await dark.$eval('.sq-node[data-folded] .sq-node-count', el => { el.click(); return true }).catch(() => false)
    if (!opened) break
    await sleep(350)
  }
  await dark.$$eval('.sq-canvas-tools .sq-btn', els => els.find(el => el.innerText === '适应窗口')?.click())
  await sleep(600)
  await dark.screenshot({ path: `${shots}-dark-2-open.png` })
} catch (error) {
  check(false, `error: ${error.message}`)
} finally {
  await browser?.close()
  run('down', PROJECT)
}
console.log(failures.length === 0 ? 'UI P4: all checks pass' : `UI P4: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
