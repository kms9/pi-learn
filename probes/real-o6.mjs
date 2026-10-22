// O6 (P3 = B) on the real model: a project started with no key in the environment; the
// key is entered in DS Bot's own dialog (DSH keeps it in its credential store); the
// preset team then answers on deepseek-flash, effort high. The key is read from this
// process's environment only to type it, never printed; the hosts started here do not
// get it in their environment. At the end the project is searched for the key: only
// DSH's credential file may hold it, and that file is removed.
//
//   ( set -a; . ~/.secrets/deepseek.env; set +a; PUPPETEER_CORE=<dir> node probes/real-o6.mjs [port] [shots] )
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PROBES, sleep, until } from './lib.mjs'
import { repliesOf, routesOf, sessionLogs } from './session-log.mjs'

const [port = '3590', shots = '/tmp/squad-o6'] = process.argv.slice(2)
const KEY = process.env.DEEPSEEK_API_KEY
if (!KEY) { console.error('DEEPSEEK_API_KEY missing: source ~/.secrets/deepseek.env first'); process.exit(2) }
const REPO = join(PROBES, '..')
const PROJECT = join(PROBES, '.run', 'real-o6')
const CLI = join(REPO, 'dsh_squad', 'deploy', 'dsh-squad')
const hostEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'DEEPSEEK_API_KEY'))
const run = (...args) => execFileSync(CLI, args, { encoding: 'utf8', env: hostEnv })
const puppeteer = createRequire(join(process.env.PUPPETEER_CORE ?? '.', 'package.json'))('puppeteer-core')
const failures = []
const check = (ok, what, detail) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} ${what}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`); if (!ok) failures.push(what) }
const loginOf = () => readFileSync(join(PROJECT, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)
const filesUnder = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  const info = statSync(path, { throwIfNoEntry: false })
  return info === undefined ? [] : info.isDirectory() ? filesUnder(path) : [path]
})
const holdsKey = path => { try { return readFileSync(path).includes(KEY) } catch { return false } }

rmSync(PROJECT, { recursive: true, force: true })
let browser
try {
  run('up', PROJECT, '--port', port)
  browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 960 })
  await page.goto(loginOf(), { waitUntil: 'networkidle2', timeout: 90_000 })
  await sleep(3500)
  const offered = await page.$$eval('button, [role=button]', els => { const el = els.find(e => (e.getAttribute('aria-label') || e.innerText || '').includes('Enter a DeepSeek API key')); el?.click(); return Boolean(el) })
  check(offered, 'with no key, DS Bot offers to enter one')
  await page.waitForSelector('input[type=password]', { timeout: 10_000 })
  await sleep(500)
  await page.screenshot({ path: `${shots}-1-key-dialog.png` })
  await page.type('input[type=password]', KEY)
  await page.$$eval('button', els => els.find(e => e.innerText.trim() === 'Save and continue')?.click())
  // Accepted: DS Bot moves on to choosing a model for its Main Bot.
  const accepted = await until(async () => (await page.$$eval('button', els => els.some(e => /DeepSeek-V[\d.]+-Flash/.test(e.innerText)))), 20_000, 500)
  check(accepted, 'the key is accepted: DS Bot moves on to choosing a model')
  await page.$$eval('button', els => els.find(e => e.innerText.trim() === 'Configure later')?.click())
  await sleep(1000)
  await page.screenshot({ path: `${shots}-2-after.png` })

  run('provision', PROJECT)
  const home = join(PROJECT, '.dsh-squad/home')
  const state = JSON.parse(readFileSync(join(home, 'bot/state.json'), 'utf8'))
  const chief = Object.values(state.bots).find(bot => bot.name === 'Chief')
  check(chief?.model === 'deepseek-official/deepseek-flash' && chief?.effort === 'high', 'the preset team is on deepseek-flash, effort high', chief && [chief.model, chief.effort])
  const login = loginOf()
  const base = new URL(login).origin
  const cookie = (await fetch(login, { redirect: 'manual' })).headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
  const since = Date.now()
  await fetch(`${base}/api/bot`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint: 'send', payload: { sessionId: chief.id, text: '你好，请用一句话介绍你自己。' } }) })
  const answered = await until(() => repliesOf(sessionLogs(home).get(chief.id) ?? []).some(reply => reply.time >= since && reply.text.trim() !== ''), 180_000, 3000)
  check(answered, 'Chief answers with the key from the page, none in the environment')
  const routes = routesOf(sessionLogs(home).get(chief.id) ?? []).filter(route => route.type === 'request/header')
  check(routes.length > 0 && routes.every(route => route.model === 'deepseek-flash' && route.effort === 'high'), 'on deepseek-flash, effort high', routes.slice(-1))

  console.log('== where the key is')
  await browser.close()
  browser = undefined
  run('down', PROJECT)
  const holders = filesUnder(PROJECT).filter(holdsKey).map(path => path.slice(PROJECT.length + 1))
  check(holders.length === 1 && /\.credentials\.yaml$/.test(holders[0]), 'only DSH\'s credential file holds the key', holders)
  const shotsDir = shots.split('/').slice(0, -1).join('/')
  check(filesUnder(shotsDir).filter(holdsKey).length === 0, 'no screenshot holds it')
  for (const path of holders) rmSync(join(PROJECT, path), { force: true })
} catch (error) {
  check(false, `error: ${String(error.message).replaceAll(KEY, '<key>')}`)
} finally {
  await browser?.close()
  try { run('down', PROJECT) } catch { /* already down */ }
}
console.log(failures.length === 0 ? 'O6: all checks pass' : `O6: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
