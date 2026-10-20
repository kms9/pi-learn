// UI plan P6 acceptance on the mock: the finish. A math Team with a 30-step workflow
// (no order between steps, each reviewed) gives a tree of 60 tasks under the Leader;
// one step never hands in a result and fails, which holds the Run until a person drops
// it from its popover (reached by keyboard). In a real browser: the empty Team opens
// on the start panel; the big tree lays out with every card in its own place and pans
// smoothly; the keyboard walks the cards (Tab), opens one (Enter), closes it (Esc) and
// the focus comes back; the failed step's popover takes the focus on its first action;
// cards and the canvas carry readable labels. Then the Controller is killed: the page
// says the connection dropped, and says so again when it is back. Light, then dark.
//
//   PUPPETEER_CORE=<dir with puppeteer-core> node probes/ui-p6.mjs [port] [shots-prefix]
import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PROBES, until } from './lib.mjs'

const port = process.argv[2] ?? '3530'
const shots = process.argv[3] ?? '/tmp/squad-p6'
const REPO = join(PROBES, '..')
const PROJECT = join(PROBES, '.run', 'ui-p6-project')
const CLI = join(REPO, 'dsh_squad', 'deploy', 'dsh-squad')
const run = (...args) => execFileSync(CLI, args, { encoding: 'utf8' })
const puppeteer = createRequire(join(process.env.PUPPETEER_CORE ?? '.', 'package.json'))('puppeteer-core')
const failures = []
const check = (ok, what, detail) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} ${what}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`); if (!ok) failures.push(what) }
const sleep = ms => new Promise(done => setTimeout(done, ms))
const STEPS = 30
const BROKEN = 7

rmSync(PROJECT, { recursive: true, force: true })
cpSync(join(REPO, 'dsh_squad', 'cases', 'math', '.agents'), join(PROJECT, '.agents'), { recursive: true })
const teamPath = join(PROJECT, '.agents/dshsquad/teams/math/team.json')
const team = JSON.parse(readFileSync(teamPath, 'utf8'))
team.default_workflow = 'big'
team.policy.max_total_tasks = 120
team.policy.max_parallel_tasks = 4
writeFileSync(teamPath, `${JSON.stringify(team, null, 2)}\n`)
const roles = ['researcher', 'builder', 'checker']
const steps = Array.from({ length: STEPS }, (_, i) => ({
  id: `s${i + 1}`, role_ref: roles[i % 3], kind: 'execute', depends_on: [],
  goal: i + 1 === BROKEN ? `第 ${i + 1} 节：整理练习答案（测试：不提交）` : i === 0 ? '第 1 节：分数的意义——把一个整体平均分成若干份，表示这样的一份或几份的数叫做分数；本节从切披萨、分蛋糕、折纸三个生活情境引入，配合数轴上的表示，让学生先感受“平均分”，再认识分子、分母和分数线各自的含义，最后比较同分母分数的大小' : `第 ${i + 1} 节：分数练习`,
}))
writeFileSync(join(PROJECT, '.agents/dshsquad/teams/math/workflows/big.json'), `${JSON.stringify({ schema_version: 1, workflow_id: 'big', steps }, null, 2)}\n`)
const loginOf = () => readFileSync(join(PROJECT, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)
const clickIn = (page, selector, text) => page.$$eval(selector, (els, wanted) => { const el = els.find(candidate => candidate.innerText.trim().includes(wanted)); el?.click(); return Boolean(el) }, text)
const active = page => page.evaluate(() => { const el = document.activeElement; return { node: el?.dataset?.node ?? null, label: el?.getAttribute('aria-label') ?? '', text: el?.innerText?.trim().slice(0, 20) ?? '' } })
const openAll = async (page) => {
  for (let i = 0; i < 80; i += 1) {
    const opened = await page.$eval('.sq-node[data-folded] .sq-node-count', el => { el.click(); return true }).catch(() => false)
    if (!opened) break
    await sleep(120)
  }
}

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

  console.log('== empty Team')
  const panel = await until(async () => (await page.$('.sq-start textarea')) !== null, 20_000, 300)
  check(panel, 'a Team with no Run opens on the start panel')
  await page.screenshot({ path: `${shots}-light-1-empty.png` })
  await page.type('.sq-start textarea', '五年级分数单元：30 节练习，一次排好')
  await clickIn(page, '.sq-start .sq-btn', '开始')

  console.log('== big tree')
  const failed = await until(async () => (await page.$$eval('.sq-node[data-s=failed]', els => els.length)) > 0, 300_000, 1000)
  check(failed, 'the step that never hands in a result fails')
  await openAll(page)
  const brokenCard = await page.$eval('.sq-node[data-s=failed]', el => el.dataset.node)
  await page.focus(`.sq-node[data-node="${brokenCard}"]`)
  await page.keyboard.press('Enter')
  await sleep(500)
  const inPop = await active(page)
  check((await page.$('.sq-pop')) !== null && /忽略|重试|确认/.test(inPop.text), 'the failed step’s popover takes the focus on its first action', inPop)
  await page.screenshot({ path: `${shots}-light-3-keyboard.png` })
  await page.keyboard.press('Escape')
  await sleep(400)
  check((await page.$('.sq-pop')) === null && (await active(page)).node === brokenCard, 'Esc closes the popover, focus back on the card')
  console.log('== the step is dropped; the Run completes')
  await page.$eval('.sq-node[data-s=failed]', el => el.click())
  await sleep(500)
  await clickIn(page, '.sq-pop .sq-btn', '忽略')
  await sleep(300)
  await clickIn(page, '.sq-pop .sq-btn', '确定忽略')

  const complete = await until(async () => (await page.$$eval('.sq-node[data-kind=run]', els => els.map(el => el.dataset.s)))[0] === 'done', 900_000, 2000)
  check(complete, 'the Run completes without the dropped step')
  // The dropped step is still selected (its details are open); close them.
  await page.keyboard.press('Escape')
  await sleep(300)
  // Every card in place: 29 steps and their reviews, and the dropped step, grey.
  const settled = await until(async () => {
    await openAll(page)
    const states = await page.$$eval('.sq-node[data-kind=task]', els => els.map(el => el.dataset.s))
    return states.length >= 2 * STEPS - 1 && states.filter(s => s === 'done').length >= 2 * (STEPS - 1) ? states : undefined
  }, 120_000, 2000)
  check(settled !== undefined, `the tree holds ${2 * STEPS - 1}+ task cards, all but the dropped step done`, await page.$$eval('.sq-node[data-kind=task]', els => els.length))
  await openAll(page)
  const cards = await page.$$eval('.sq-node', els => els.map(el => { const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform); return `${m?.[1]},${m?.[2]}` }))
  check(cards.length >= 60 && new Set(cards).size === cards.length, 'every card has its own place', { cards: cards.length, unique: new Set(cards).size })
  const clamp = await page.$$eval('.sq-node-title', els => els.every(el => el.scrollHeight <= el.clientHeight + 24 && el.clientHeight <= 40))
  check(clamp, 'a long goal is cut to two lines on its card')

  // Panning: frames per second and the longest task while the tree is dragged.
  await page.evaluate(() => {
    window.__frames = 0
    window.__long = 0
    const tick = () => { window.__frames += 1; if (window.__counting) requestAnimationFrame(tick) }
    window.__counting = true
    requestAnimationFrame(tick)
    new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__long = Math.max(window.__long, entry.duration) }).observe({ type: 'longtask' })
  })
  const box = await page.$eval('.sq-canvas', el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  const t0 = Date.now()
  await page.mouse.move(box.x + 30, box.y + box.h - 30)
  await page.mouse.down()
  for (let i = 0; i < 60; i += 1) {
    await page.mouse.move(box.x + 30 + i * 8, box.y + box.h - 30 - i * 3)
    await sleep(16)
  }
  await page.mouse.up()
  const seconds = (Date.now() - t0) / 1000
  const perf = await page.evaluate(() => { window.__counting = false; return { frames: window.__frames, long: window.__long } })
  const fps = perf.frames / seconds
  console.log(`   (pan: ${fps.toFixed(0)} fps, longest task ${perf.long.toFixed(0)} ms, ${cards.length} cards)`)
  check(fps >= 30 && perf.long < 200, 'panning 60 cards stays smooth (≥30 fps, no task over 200 ms)', { fps, long: perf.long })
  await clickIn(page, '.sq-canvas-tools .sq-btn', '适应窗口')
  await sleep(600)
  await page.screenshot({ path: `${shots}-light-2-big.png` })

  console.log('== keyboard and labels')
  const labels = await page.$$eval('.sq-node', els => els.map(el => el.getAttribute('aria-label') ?? ''))
  check(labels.every(label => /(进行中|完成|需要你处理|失败|已停止|未开始)/.test(label)), 'every card says its state to a screen reader', labels.filter(label => !/(进行中|完成|需要你处理|失败|已停止|未开始)/.test(label)).slice(0, 3))
  check(/个节点/.test(await page.$eval('.sq-canvas', el => el.getAttribute('aria-label') ?? '')), 'the canvas is a labelled region')
  await page.focus('.sq-node')
  const seen = []
  const path = []
  for (let i = 0; i < 4; i += 1) {
    seen.push((await active(page)).node)
    await page.keyboard.press('Tab')
    // The fold count is a button inside a card; Tab passes it too.
    path.push(await active(page))
    if ((await active(page)).node === null) { await page.keyboard.press('Tab'); path.push(await active(page)) }
  }
  check(seen.every(Boolean) && new Set(seen).size === seen.length, 'Tab walks from card to card', path)
  const doneCard = await page.$eval('.sq-node[data-s=done][data-kind=task]', el => el.dataset.node)
  await page.focus(`.sq-node[data-node="${doneCard}"]`)
  await page.keyboard.press('Enter')
  await sleep(500)
  const inDrawer = await active(page)
  check((await page.$('.sq-drawer')) !== null && inDrawer.label === '关闭详情', 'Enter opens the details, focus on its close button', inDrawer)
  await page.keyboard.press('Escape')
  await sleep(400)
  check((await page.$('.sq-drawer')) === null && (await page.$('.sq-shell')) !== null, 'Esc closes the details, not the page')
  check((await active(page)).node === doneCard, 'the focus is back on the card', await active(page))
  await page.keyboard.press('Escape')
  await sleep(400)
  check((await page.$('.sq-shell')) === null, 'with nothing open, Esc closes the page')
  await page.$eval('button.sq-foot', el => el.click())
  await sleep(1200)

  console.log('== connection drops and comes back')
  execFileSync('sh', ['-c', `kill -KILL -$(cat '${join(PROJECT, '.dsh-squad/run/controller.pid')}')`])
  const dropped = await until(async () => /连接中断|还没连上/.test(await page.$eval('.sq-banner', el => el.innerText).catch(() => '')), 30_000, 500)
  check(dropped, 'the page says the connection dropped')
  await page.screenshot({ path: `${shots}-light-4-dropped.png` })
  run('up', PROJECT, '--mock', '--port', port)
  const back = await until(async () => /已重新连上/.test(await page.$eval('.sq-toast', el => el.innerText).catch(() => '')), 60_000, 300)
  check(back, 'and says so when it is back')
  check(await until(async () => (await page.$('.sq-banner')) === null, 15_000, 300), 'the banner goes away by itself')
  check(errors.length === 0, 'no page errors (light)', errors)

  const dark = await browser.newPage()
  await dark.setViewport({ width: 1440, height: 960 })
  await dark.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await dark.goto(loginOf(), { waitUntil: 'networkidle2', timeout: 90_000 })
  await sleep(3000)
  await dark.$eval('button.sq-foot', el => el.click())
  await sleep(1500)
  await dark.$$eval('.sq-side .sq-item', els => els[0]?.click())
  await sleep(1500)
  await openAll(dark)
  await clickIn(dark, '.sq-canvas-tools .sq-btn', '适应窗口')
  await sleep(600)
  await dark.screenshot({ path: `${shots}-dark-1-big.png` })
  await dark.focus('.sq-node[data-kind=task]')
  await dark.keyboard.press('Tab')
  await sleep(300)
  await dark.screenshot({ path: `${shots}-dark-2-focus.png` })
} catch (error) {
  check(false, `error: ${error.message}`)
} finally {
  await browser?.close()
  run('down', PROJECT)
}
console.log(failures.length === 0 ? 'UI P6: all checks pass' : `UI P6: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
