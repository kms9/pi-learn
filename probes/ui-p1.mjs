// UI plan P1 acceptance on the mock: the five states and the summary bar, in a real
// browser, light and dark. A Team's step is slowed down and the Controller killed in
// the middle of it: the Run is then held for a person (needs you) and the step's end is
// uncertain (failed).
//
//   PUPPETEER_CORE=<dir with puppeteer-core> node probes/ui-p1.mjs [port] [shots-prefix]
import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PROBES, until } from './lib.mjs'

const port = process.argv[2] ?? '3480'
const shots = process.argv[3] ?? '/tmp/squad-p1'
const REPO = join(PROBES, '..')
const PROJECT = join(PROBES, '.run', 'ui-p1-project')
const CLI = join(REPO, 'dsh_squad', 'deploy', 'dsh-squad')
const run = (...args) => execFileSync(CLI, args, { encoding: 'utf8' })
const puppeteer = createRequire(join(process.env.PUPPETEER_CORE ?? '.', 'package.json'))('puppeteer-core')
const failures = []
const check = (ok, what, detail) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} ${what}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`); if (!ok) failures.push(what) }
const sleep = ms => new Promise(done => setTimeout(done, ms))

rmSync(PROJECT, { recursive: true, force: true })
cpSync(join(REPO, 'dsh_squad', 'cases', 'm4', '.agents'), join(PROJECT, '.agents'), { recursive: true })
const flow = join(PROJECT, '.agents/dshsquad/teams/team-a/workflows/one.json')
writeFileSync(flow, readFileSync(flow, 'utf8').replace('写一页分数讲义', '慢 20 写一页分数讲义'))

async function session() {
  const login = readFileSync(join(PROJECT, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)
  const base = new URL(login).origin
  const cookie = (await fetch(login, { redirect: 'manual' })).headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
  const call = async (endpoint, payload = {}) => {
    const out = await (await fetch(`${base}/api/squad-adapter`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint: `ui/${endpoint}`, payload }) })).json()
    if (!out.ok) throw new Error(`${endpoint}: ${out.error?.message}`)
    return out.value
  }
  return { login, ui: call }
}

let browser
try {
  run('up', PROJECT, '--mock', '--port', port)
  let { ui } = await session()
  await ui('bind-team', { teamId: 'team-a' })
  await until(async () => ((await ui('view')).snapshot.views.agents ?? []).filter(agent => agent.presence === 'online').length >= 3, 60_000, 500)
  const started = await ui('start-run', { requestId: `p1-${Date.now()}`, teamId: 'team-a', goal: '分数讲义' })
  const running = await until(async () => (await ui('view')).snapshot.views.tasks.some(task => task.run_id === started.run_id && task.kind === 'execute' && task.state === 'running'), 90_000, 500)
  check(running, 'the slowed step is running')
  execFileSync('sh', ['-c', `kill -KILL -$(cat '${join(PROJECT, '.dsh-squad/run/controller.pid')}')`])
  await sleep(1000)
  run('up', PROJECT, '--mock', '--port', port)
  ;({ ui } = await session())
  await until(async () => { try { return (await ui('view')).snapshot.views.runs.some(r => r.recovery_hold) } catch { return false } }, 60_000, 500)

  browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  for (const scheme of ['light', 'dark']) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1400, height: 900 })
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto((await session()).login, { waitUntil: 'networkidle2', timeout: 90_000 })
    await sleep(3000)
    const dark = await page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))
    check(dark === (scheme === 'dark'), `${scheme}: the shell's theme is followed`, { dark })
    await page.$eval('button.sq-foot', el => el.click())
    await until(async () => (await page.$$('.sq-pill')).length >= 1, 20_000, 300)
    const pills = await page.$$eval('.sq-pill', els => els.map(el => [el.dataset.s, el.innerText]))
    check(!pills.some(([s]) => s === 'attention'), `${scheme}: the held Run is not counted again (its failed step is)`, pills)
    check(pills.some(([s, text]) => s === 'failed' && /1 个失败/.test(text)), `${scheme}: one failed (the step cut by the restart)`, pills)
    check((await page.$$('.sq-node[data-selected]')).length === 0, `${scheme}: nothing jumped by itself (D6)`)
    const colors = await page.$eval('.sq-pill[data-s=failed]', el => [getComputedStyle(el).color, getComputedStyle(document.body).getPropertyValue('--sq-failed').trim()])
    check(colors[0] !== '' && colors[1] !== '', `${scheme}: the failed pill has the failed color`, colors)
    await page.$eval('.sq-pill[data-s=failed]', el => el.click())
    await sleep(300)
    const items = await page.$$eval('.sq-menu .sq-menu-item', els => els.map(el => el.innerText))
    check(items.length === 1 && /Squad 服务中途重启|没能确认/.test(items[0]), `${scheme}: the failed item says why in one line`, items)
    await page.screenshot({ path: `${shots}-${scheme}-menu.png` })
    await page.$eval('.sq-menu .sq-menu-item', el => el.click())
    await sleep(1200)
    const focused = await page.$$eval('.sq-node[data-selected]', els => els.map(el => el.innerText.replace(/\s+/g, ' ')))
    check(focused.length === 1 && /写一页分数讲义/.test(focused[0]), `${scheme}: the jump lands on the step`, focused)
    await page.screenshot({ path: `${shots}-${scheme}-jump.png` })
    check(errors.length === 0, `${scheme}: no page errors`, errors)
    await page.close()
  }
} catch (error) {
  check(false, `error: ${error.message}`)
} finally {
  await browser?.close()
  run('down', PROJECT)
}
console.log(failures.length === 0 ? 'UI P1: all checks pass' : `UI P1: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
