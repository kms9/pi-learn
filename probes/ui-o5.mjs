// O5 (P2 = C) on the mock: when something needs a person, the Team's Leader Bot posts a
// reminder in the Team's group with a link; the post wakes nobody; the link opens the
// Squad page at the node, clicked in DS Bot or opened as an address. Light and dark.
//
//   PUPPETEER_CORE=<dir> node probes/ui-o5.mjs [port] [shots-prefix]
import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PROBES, lines, sleep, until } from './lib.mjs'

const port = process.argv[2] ?? '3560'
const shots = process.argv[3] ?? '/tmp/squad-o5'
const REPO = join(PROBES, '..')
const PROJECT = join(PROBES, '.run', 'ui-o5-project')
const CLI = join(REPO, 'dsh_squad', 'deploy', 'dsh-squad')
const run = (...args) => execFileSync(CLI, args, { encoding: 'utf8' })
const puppeteer = createRequire(join(process.env.PUPPETEER_CORE ?? '.', 'package.json'))('puppeteer-core')
const failures = []
const check = (ok, what, detail) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} ${what}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`); if (!ok) failures.push(what) }
const loginOf = () => readFileSync(join(PROJECT, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)

rmSync(PROJECT, { recursive: true, force: true })
cpSync(join(REPO, 'dsh_squad', 'cases', 'math', '.agents'), join(PROJECT, '.agents'), { recursive: true })
const teamPath = join(PROJECT, '.agents/dshsquad/teams/math/team.json')
const team = JSON.parse(readFileSync(teamPath, 'utf8'))
team.policy.acceptance_policy = { mode: 'human', child_policy: 'separate' }
writeFileSync(teamPath, `${JSON.stringify(team, null, 2)}\n`)

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
  return { base, ui: (endpoint, payload) => squad(`ui/${endpoint}`, payload), bot: call('/api/bot') }
}
const stored = () => JSON.parse(readFileSync(join(PROJECT, '.dsh-squad/home/bot/state.json'), 'utf8'))
const calls = () => lines(join(PROJECT, '.dsh-squad/logs/mock.jsonl'))

let browser
try {
  run('up', PROJECT, '--mock', '--port', port)
  const { base, ui, bot } = await session()
  await bot('state')
  const bound = await ui('bind-team', { teamId: 'math' })
  await until(async () => ((await ui('view')).snapshot.views.agents ?? []).filter(agent => agent.presence === 'online').length >= 5, 60_000, 500)
  const created = await ui('start-run', { requestId: `o5-${Date.now()}`, teamId: 'math', goal: '认识分数：分数的意义与读写（五年级）' })

  console.log('== the reminder in the group')
  const lead = bound.members.find(member => member.leader)
  const roomLog = () => stored().rooms[bound.roomId]?.log ?? []
  const notice = await until(() => roomLog().find(line => line.botId === lead.botId && /【Squad】/.test(line.text ?? '')), 120_000, 1000)
  check(notice !== undefined, 'the Leader posts a reminder in the Team\'s group', roomLog().slice(-3))
  check(/需要你处理：/.test(notice?.text ?? '') && /http:\/\/127\.0\.0\.1:\d+\/\?squad=math%3A/.test(notice?.text ?? ''), 'it says what needs a person and links to the node', notice?.text)
  const callsAfter = calls().length
  const memberSessions = new Set(Object.values(stored().rooms[bound.roomId]?.sessions ?? {}))
  await sleep(8000)
  const woken = calls().slice(callsAfter).filter(call => memberSessions.has(call.session))
  check(woken.length === 0, 'the reminder wakes no member', woken.length)
  // The same thing is not posted twice.
  await sleep(12_000)
  check(roomLog().filter(line => line.text === notice?.text).length === 1, 'what was posted is not posted again')

  console.log('== the link opens the Squad page at the node')
  const link = /\((http:\/\/127\.0\.0\.1:\d+\/\?squad=[^)]+)\)/.exec(notice?.text ?? '')?.[1]
  const taskId = decodeURIComponent(link?.split('squad=')[1] ?? '').split(':')[2]
  browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 960 })
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(loginOf(), { waitUntil: 'networkidle2', timeout: 90_000 })
  await sleep(3000)
  const opened = await page.$$eval('*', (els) => {
    const el = els.find(candidate => candidate.children.length === 0 && candidate.textContent.trim() === 'math 小队')
    el?.click()
    return Boolean(el)
  })
  await sleep(2500)
  check(opened, 'the Team\'s group is in DS Bot\'s sidebar')
  const anchor = await until(async () => (await page.$$eval('a[href*="squad="]', els => els.map(el => el.getAttribute('href')))).at(-1), 20_000, 500)
  check(anchor !== undefined, 'the reminder shows in the group with its link', anchor)
  await page.screenshot({ path: `${shots}-light-1-group.png` })
  await page.$$eval('a[href*="squad="]', els => els.at(-1)?.click())
  const focused = await until(async () => page.$eval(`.sq-node[data-node="${taskId}"]`, el => el.hasAttribute('data-selected')).catch(() => false), 20_000, 500)
  check(focused, 'clicking it opens the Squad page with that node selected', taskId)
  await page.screenshot({ path: `${shots}-light-2-opened.png` })
  check(errors.length === 0, 'no page errors', errors)

  const dark = await browser.newPage()
  await dark.setViewport({ width: 1440, height: 960 })
  await dark.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await dark.goto(loginOf(), { waitUntil: 'networkidle2', timeout: 90_000 })
  await sleep(2000)
  await dark.goto(link, { waitUntil: 'networkidle2', timeout: 90_000 })
  const direct = await until(async () => dark.$eval(`.sq-node[data-node="${taskId}"]`, el => el.hasAttribute('data-selected')).catch(() => false), 20_000, 500)
  check(direct, 'opening the link as an address does the same')
  check(!(await dark.evaluate(() => window.location.search)).includes('squad='), 'and the address loses the parameter')
  await dark.screenshot({ path: `${shots}-dark-1-opened.png` })
  await ui('operate', { kind: 'run', id: created.run_id, op: 'cancel', body: { request_id: `o5-end-${Date.now()}`, expected_revision: (await ui('view')).snapshot.views.runs.find(r => r.run_id === created.run_id).revision, note: 'ui-o5 done' } }).catch(() => {})
} catch (error) {
  check(false, `error: ${error.message}`)
} finally {
  await browser?.close()
  run('down', PROJECT)
}
console.log(failures.length === 0 ? 'O5: all checks pass' : `O5: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
