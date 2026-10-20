// UI plan P2 acceptance on the mock: the task tree canvas in a real browser. The math
// case's first draft is rejected, so the tree gets a review, a rework under the
// replaced draft and a second review; screenshots at the start, the middle and the end
// (light), and the end in dark.
//
//   PUPPETEER_CORE=<dir with puppeteer-core> node probes/ui-p2.mjs [port] [shots-prefix]
import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PROBES, until } from './lib.mjs'

const port = process.argv[2] ?? '3490'
const shots = process.argv[3] ?? '/tmp/squad-p2'
const REPO = join(PROBES, '..')
const PROJECT = join(PROBES, '.run', 'ui-p2-project')
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
// Card geometry and state straight from the page.
const cards = page => page.$$eval('.sq-node', els => els.map(el => {
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform)
  return { id: el.dataset.node, s: el.dataset.s, kind: el.dataset.kind, x: Number(m?.[1]), y: Number(m?.[2]), text: el.innerText.replace(/\s+/g, ' '), isNew: el.hasAttribute('data-new'), folded: el.hasAttribute('data-folded'), avatar: !!el.querySelector('.sq-avatar') }
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

  // Watch the tree grow: every 400 ms, note new nodes and moves of nodes already drawn.
  const history = []
  let grew = false
  let madeWay = false
  let shotMid = false
  const deadline = Date.now() + 240_000
  let done = false
  while (Date.now() < deadline && !done) {
    await sleep(400)
    const now = await cards(page).catch(() => [])
    if (now.some(card => card.isNew)) grew = true
    const before = history.at(-1) ?? []
    for (const card of now) {
      const old = before.find(candidate => candidate.id === card.id)
      if (old && old.kind !== 'run' && (Math.abs(old.x - card.x) > 1)) madeWay = true
    }
    history.push(now)
    if (history.length === 3) await page.screenshot({ path: `${shots}-light-1-start.png` })
    if (!shotMid && now.some(card => card.text.includes('返工'))) { await page.screenshot({ path: `${shots}-light-2-middle.png` }); shotMid = true }
    // Since P4 the check built on the rejected draft waits for a person: keep it.
    const stale = now.find(card => /基于旧版本/.test(card.text))
    if (stale) {
      await page.$eval(`[data-node="${stale.id}"]`, el => el.click())
      await sleep(400)
      await page.$$eval('.sq-pop .sq-btn', els => els.find(el => el.innerText === '保留这一版')?.click())
      await sleep(600)
    }
    done = now.some(card => card.kind === 'run' && card.s === 'done')
  }
  check(done, 'the Run completes on the canvas')
  check(grew, 'new nodes grow in')
  check(madeWay, 'existing siblings made way as nodes appeared')
  await sleep(1500)
  await page.screenshot({ path: `${shots}-light-3-end.png` })

  // The finished tree folds its finished subtrees; open everything to read the shape.
  let end = await cards(page)
  check(end.some(card => card.folded), 'finished subtrees fold by themselves', end.map(card => [card.text.slice(0, 20), card.folded]))
  for (let i = 0; i < 30; i += 1) {
    const opened = await page.$eval('.sq-node[data-folded] .sq-node-count', el => { el.click(); return true }).catch(() => false)
    if (!opened) break
    await sleep(350)
  }
  end = await cards(page)
  const find = text => end.find(card => card.text.includes(text))
  const root = end.find(card => card.kind === 'run')
  const build = end.find(card => card.kind === 'task' && card.text.includes('已被返工替代'))
  const rework = find('按审查意见修改')
  const reviews = end.filter(card => card.text.includes('审核：'))
  check(root && root.y === 0 && /Leader/.test(root.text), 'the Leader is the root', root)
  check(build?.s === 'stopped' && /已被返工替代/.test(build.text), 'the rejected first draft is grey', build)
  check(rework && build && rework.y > build.y && rework.s === 'done', 'the rework hangs under the draft it replaces and is done', { build, rework })
  check(reviews.length >= 3 && reviews.some(card => /退回/.test(card.text)), 'reviews are their own nodes, one says rejected', reviews.map(card => card.text.slice(0, 40)))
  check(end.filter(card => card.kind === 'task').every(card => card.avatar) && end.some(card => /deepseek-flash/.test(card.text)), 'cards show the member and its model')
  const before = (await cards(page)).length
  await page.$eval('.sq-node[data-kind=run] .sq-node-count', el => el.click())
  await sleep(500)
  const foldedAll = await cards(page)
  check(foldedAll.length === 1 && foldedAll[0].folded, 'folding the root draws one card with the stack under it', { before, after: foldedAll.length })
  await page.$eval('.sq-node[data-kind=run] .sq-node-count', el => el.click())
  await sleep(500)
  check((await cards(page)).length === before, 'unfolding brings them back')
  await page.$$eval('.sq-canvas-tools .sq-btn', els => els.find(el => el.innerText === '回到中心')?.click())
  await sleep(600)
  const centre = await page.evaluate(() => {
    const canvas = document.querySelector('.sq-canvas').getBoundingClientRect()
    const rootCard = document.querySelector('.sq-node[data-kind=run]').getBoundingClientRect()
    return { canvas: canvas.left + canvas.width / 2, root: rootCard.left + rootCard.width / 2 }
  })
  check(Math.abs(centre.canvas - centre.root) < 4, 'the root is centred', centre)
  await page.$eval('.sq-node[data-kind=task]', el => el.click())
  await sleep(400)
  check(await page.$('.sq-drawer') !== null, 'a card opens its details')
  await page.screenshot({ path: `${shots}-light-4-details.png` })
  check(errors.length === 0, 'no page errors (light)', errors)

  const dark = await browser.newPage()
  await dark.setViewport({ width: 1440, height: 960 })
  await dark.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }])
  await dark.goto(loginOf(), { waitUntil: 'networkidle2', timeout: 90_000 })
  await sleep(3000)
  await dark.$eval('button.sq-foot', el => el.click())
  await sleep(800)
  await dark.$$eval('.sq-side .sq-item', els => els[0]?.click())
  await sleep(1500)
  const motion = await dark.$eval('.sq-node', el => getComputedStyle(el).transitionDuration)
  check(/^0s/.test(motion), 'reduced motion turns the movement off', motion)
  check(await dark.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')), 'dark theme followed')
  await dark.screenshot({ path: `${shots}-dark-3-end.png` })
  await dark.$eval('.sq-node[data-kind=task]', el => el.click())
  await sleep(400)
  await dark.screenshot({ path: `${shots}-dark-4-details.png` })
} catch (error) {
  check(false, `error: ${error.message}`)
} finally {
  await browser?.close()
  run('down', PROJECT)
}
console.log(failures.length === 0 ? 'UI P2: all checks pass' : `UI P2: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
