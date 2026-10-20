// UI plan P5 acceptance on the mock: several Teams in a real browser, with the m4 case.
// Three Teams are bound; messages said in two groups before any Run are held. The
// overview shows one card per Team; one held message is dropped, A starts from the
// panel, B and C right after. A and C run while B waits for the reviewer A holds; C's
// held message becomes guidance from its card. The person follows B's queue reason to
// A's tree, where the shared reviewer is marked as also in B; when B starts the bar
// says so without moving the view (D6). Light during, dark at the end.
//
//   PUPPETEER_CORE=<dir with puppeteer-core> node probes/ui-p5.mjs [port] [shots-prefix]
import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PROBES, until } from './lib.mjs'

const port = process.argv[2] ?? '3520'
const shots = process.argv[3] ?? '/tmp/squad-p5'
const REPO = join(PROBES, '..')
const PROJECT = join(PROBES, '.run', 'ui-p5-project')
const CLI = join(REPO, 'dsh_squad', 'deploy', 'dsh-squad')
const run = (...args) => execFileSync(CLI, args, { encoding: 'utf8' })
const puppeteer = createRequire(join(process.env.PUPPETEER_CORE ?? '.', 'package.json'))('puppeteer-core')
const failures = []
const check = (ok, what, detail) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} ${what}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`); if (!ok) failures.push(what) }
const sleep = ms => new Promise(done => setTimeout(done, ms))
const TERMINAL = ['completed', 'failed', 'cancelled', 'interrupted']

rmSync(PROJECT, { recursive: true, force: true })
cpSync(join(REPO, 'dsh_squad', 'cases', 'm4', '.agents'), join(PROJECT, '.agents'), { recursive: true })
const loginOf = () => readFileSync(join(PROJECT, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)

async function session() {
  const login = loginOf()
  const base = new URL(login).origin
  const cookie = (await fetch(login, { redirect: 'manual' })).headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
  const call = route => async (endpoint, payload = {}) => {
    const out = await (await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint, payload }) })).json()
    if (!out.ok) throw new Error(`${endpoint}: ${out.error?.message}`)
    return out.value
  }
  const squad = call('/api/squad-adapter')
  return { ui: (endpoint, payload) => squad(`ui/${endpoint}`, payload), bot: call('/api/bot') }
}
const teamCards = page => page.$$eval('.sq-team', els => els.map(el => ({ id: el.dataset.team, s: el.dataset.s, text: el.innerText.replace(/\s+/g, ' ') })))
const cardOf = async (page, id) => (await teamCards(page)).find(card => card.id === id)
const clickIn = (page, selector, text) => page.$$eval(selector, (els, wanted) => { const el = els.find(candidate => candidate.innerText.trim().includes(wanted)); el?.click(); return Boolean(el) }, text)

let browser
try {
  run('up', PROJECT, '--mock', '--port', port)
  const { ui, bot } = await session()
  await bot('state')
  const bound = {}
  for (const team of ['team-a', 'team-b', 'team-c']) bound[team] = await ui('bind-team', { teamId: team })
  await until(async () => ((await ui('view')).snapshot.views.agents ?? []).filter(agent => agent.presence === 'online').length >= 9, 60_000, 500)
  // Said in two groups while no Run is on: held, pending a person.
  const later = '题目里请加一道应用题'
  const noise = '这条只是随口一说'
  await bot('send', { sessionId: bound['team-c'].roomId, text: later })
  await bot('send', { sessionId: bound['team-a'].roomId, text: noise })
  const pending = await until(async () => {
    const rows = ((await ui('view')).snapshot.views.held_inputs ?? []).filter(row => row.disposition === 'pending')
    return rows.some(row => row.text.includes(later)) && rows.some(row => row.text.includes(noise))
  }, 60_000, 500)
  check(pending, 'both group messages are held, pending')

  browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 960 })
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(loginOf(), { waitUntil: 'networkidle2', timeout: 90_000 })
  await sleep(3000)
  await page.$eval('button.sq-foot', el => el.click())
  await sleep(1500)

  console.log('== overview')
  const cards = await teamCards(page)
  check(cards.map(card => card.id).join() === 'team-a,team-b,team-c', 'the overview has one card per Team', cards)
  const seg = await page.$$eval('.sq-seg button', els => els.map(el => el.innerText))
  check(seg.length === 4 && /全部/.test(seg[0]), 'the switcher: all, then each Team', seg)
  check(/1 条消息没交给任何任务/.test((await cardOf(page, 'team-a'))?.text ?? '') && /1 条消息/.test((await cardOf(page, 'team-c'))?.text ?? ''), 'each held group message shows once, on its Team’s card')
  await page.$eval('.sq-team[data-team=team-a] .sq-held .sq-link', el => el.click())
  await sleep(300)
  const heldButtons = await page.$$eval('.sq-team[data-team=team-a] .sq-held-row .sq-btn', els => els.map(el => el.innerText))
  check(JSON.stringify(heldButtons) === JSON.stringify(['用这句话开始', '忽略']), 'with no Run on: start with it, or drop it', heldButtons)
  await page.screenshot({ path: `${shots}-light-1-held.png` })
  await clickIn(page, '.sq-team[data-team=team-a] .sq-held-row .sq-btn', '忽略')
  const dropped = await until(async () => !/条消息没交给/.test((await cardOf(page, 'team-a'))?.text ?? ''), 15_000, 300)
  const rows = ((await ui('view')).snapshot.views.held_inputs ?? []).filter(row => row.text.includes(noise))
  check(dropped && rows.length > 0 && rows.every(row => row.disposition === 'dismissed'), 'dropping it once drops every member’s copy', rows.map(row => row.disposition))

  console.log('== start A from the panel, B and C right after')
  await clickIn(page, '.sq-main .sq-btn', '开始一个小队任务')
  await sleep(500)
  await page.select('.sq-start select', 'team-a')
  await page.type('.sq-start textarea', '慢 5 写一份分数讲义')
  await clickIn(page, '.sq-start .sq-btn', '开始')
  const scoped = await until(async () => (await page.$eval('.sq-seg [data-on]', el => el.innerText).catch(() => '')) === 'team-a', 20_000, 300)
  check(scoped, 'starting from the panel focuses that Team')
  const runs = { 'team-a': (await ui('view')).snapshot.views.runs.find(r => r.team_id === 'team-a') }
  for (const team of ['team-b', 'team-c']) runs[team] = await ui('start-run', { requestId: `p5-${team}-${Date.now().toString(36)}`, teamId: team, goal: `慢 5 ${team} 的任务` })
  await clickIn(page, '.sq-seg button', '全部')
  const shape = await until(async () => {
    const now = await teamCards(page)
    const by = id => now.find(card => card.id === id)
    return by('team-a')?.s === 'running' && by('team-c')?.s === 'running' && /被小队 team-a 占用/.test(by('team-b')?.text ?? '') ? now : undefined
  }, 60_000, 500)
  check(shape !== undefined, 'A and C run; B waits for the reviewer, held by A', await teamCards(page))
  check(await page.$$eval('.sq-team[data-team=team-a] .sq-mini rect', els => els.length >= 1), 'cards carry a thumbnail tree')
  await page.screenshot({ path: `${shots}-light-2-overview.png` })

  console.log('== C’s held message becomes guidance')
  await page.$eval('.sq-team[data-team=team-c] .sq-held .sq-link', el => el.click())
  await sleep(300)
  check(await clickIn(page, '.sq-team[data-team=team-c] .sq-held-row .sq-btn', '转为补充指导'), 'with C’s Run on, the message can become its guidance')
  const guided = await until(async () => ((await ui('view')).snapshot.views.runs.find(r => r.run_id === runs['team-c'].run_id)?.guidance ?? []).filter(text => text.includes(later)).length === 1, 15_000, 300)
  check(guided, 'C’s Run has the message as guidance, once')

  console.log('== follow B’s queue to A; B starts while A is on screen')
  await page.$eval('.sq-team[data-team=team-b] .sq-link', el => el.click())
  await sleep(1200)
  check((await page.$eval('.sq-seg [data-on]', el => el.innerText).catch(() => '')) === 'team-a' && (await page.$$('.sq-node')).length >= 1, 'the queue reason jumps to A’s tree')
  const also = await until(async () => (await page.$$eval('.sq-node-also', els => els.map(el => el.innerText))).find(text => /team-b/.test(text)), 120_000, 500)
  check(also !== undefined, 'the shared reviewer’s card says it is also in team-b', also)
  await page.screenshot({ path: `${shots}-light-3-team-a.png` })
  const notice = await until(async () => (await page.$$eval('.sq-notice', els => els.map(el => el.innerText))).find(text => /team-b 已开始/.test(text)), 300_000, 500)
  check(notice !== undefined, 'when B starts the bar says so')
  check((await page.$eval('.sq-seg [data-on]', el => el.innerText).catch(() => '')) === 'team-a', 'and the view stays on A (D6)')
  await page.screenshot({ path: `${shots}-light-4-notice.png` })
  await clickIn(page, '.sq-notice', 'team-b')
  await sleep(1200)
  check((await page.$eval('.sq-seg [data-on]', el => el.innerText).catch(() => '')) === 'team-b', 'the notice switches to B')

  console.log('== rules from a Team card')
  await clickIn(page, '.sq-seg button', '全部')
  await sleep(600)
  await page.$eval('.sq-team[data-team=team-c] .sq-team-menu', el => el.click())
  await sleep(1500)
  const ruled = await page.$eval('.sq-side .sq-item[data-on]', el => el.innerText).catch(() => '')
  check(/team-c/.test(ruled), 'the gear opens that Team’s rules', ruled)
  await page.$$eval('.sq-tab', els => els.find(el => el.innerText === '运行')?.click())

  const done = await until(async () => {
    const all = (await ui('view')).snapshot.views.runs
    return ['team-a', 'team-b', 'team-c'].every(team => TERMINAL.includes(all.find(r => r.run_id === runs[team].run_id)?.phase)) ? all : undefined
  }, 600_000, 1000)
  check(done && ['team-a', 'team-b', 'team-c'].every(team => done.find(r => r.run_id === runs[team].run_id).phase === 'completed'), 'all three Runs complete')
  check(errors.length === 0, 'no page errors (light)', errors)

  const dark = await browser.newPage()
  await dark.setViewport({ width: 1440, height: 960 })
  await dark.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await dark.goto(loginOf(), { waitUntil: 'networkidle2', timeout: 90_000 })
  await sleep(3000)
  await dark.$eval('button.sq-foot', el => el.click())
  await sleep(1500)
  check((await teamCards(dark)).every(card => card.s === 'done'), 'dark: every Team card is done')
  await dark.screenshot({ path: `${shots}-dark-1-overview.png` })
  await dark.$eval('.sq-team[data-team=team-b]', el => el.click())
  await sleep(1500)
  await dark.screenshot({ path: `${shots}-dark-2-team-b.png` })
} catch (error) {
  check(false, `error: ${error.message}`)
} finally {
  await browser?.close()
  run('down', PROJECT)
}
console.log(failures.length === 0 ? 'UI P5: all checks pass' : `UI P5: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
