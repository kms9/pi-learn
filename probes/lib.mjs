// Shared helpers for the P0 scenario drivers (drive.mjs on the mock model, drive-real.mjs
// on the real DeepSeek API): login, DS Bot's /api/bot channel, the test-only driver
// route, waiting for the team to go quiet, and one-scenario-per-file recording.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROBES = dirname(fileURLToPath(import.meta.url))
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
export const lines = path => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [])

export async function until(check, timeout = 60_000, every = 300) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await sleep(every)
  }
  return undefined
}

export function openBench({ name, port, mockPort, out, only = [], quietMs = 3000, stepTimeoutMs = 180_000 }) {
  const home = join(PROBES, '.run', name)
  const events = join(home, 'probe', 'events.jsonl')
  const base = `http://127.0.0.1:${port}`
  mkdirSync(out, { recursive: true })
  let cookie

  async function login() {
    const log = readFileSync(join(home, 'web.log'), 'utf8')
    const url = log.match(new RegExp(`http://127\\.0\\.0\\.1:${port}/\\?token=[^\\s]+`))?.[0]
    if (!url) throw new Error('no login URL in web.log')
    const response = await fetch(url, { redirect: 'manual' })
    const cookies = response.headers.getSetCookie().map(entry => entry.split(';')[0])
    if (cookies.length === 0) throw new Error(`login returned no cookie (${response.status})`)
    cookie = cookies.join('; ')
  }
  const post = async (route, endpoint, payload) => {
    const response = await fetch(`${base}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ endpoint, payload }),
    })
    const result = await response.json()
    if (!result.ok) throw new Error(`${endpoint}: ${result.error?.message ?? JSON.stringify(result)}`)
    return result.value
  }
  const api = (endpoint, payload = {}) => post('/api/bot', endpoint, payload)
  const driver = (endpoint, payload = {}) => post('/api/squad-probe-driver', endpoint, payload)
  const state = () => readJson(join(home, 'bot', 'state.json'))
  const botNamed = wanted => Object.values(state().bots).find(bot => bot.name === wanted)
  const roomNamed = wanted => Object.values(state().rooms).find(room => room.name === wanted)
  const send = (sessionId, text) => api('send', { sessionId, text })
  const probeLines = () => lines(events)
  // Activity: probe lines (every model call, tool and status change writes one) and mock
  // calls. Quiet: neither moved and no Bot shows an activity for quietMs.
  const activityMark = () => lines(events).length + lines(join(home, 'mock.jsonl')).length

  async function settle(timeout = stepTimeoutMs) {
    const deadline = Date.now() + timeout
    let mark = activityMark()
    let since = Date.now()
    while (Date.now() < deadline) {
      await sleep(500)
      const { activity = {} } = await api('state')
      const now = activityMark()
      if (now !== mark || Object.keys(activity).length > 0) {
        mark = now
        since = Date.now()
      } else if (Date.now() - since >= quietMs) {
        return true
      }
    }
    return false
  }
  const bench = (action, env = {}) => execFileSync(join(PROBES, 'bench.sh'), [name, port, mockPort, action], { encoding: 'utf8', env: { ...process.env, ...env } })

  // One scenario: its actions are logged with times, then the probe lines in its window.
  async function scenario(id, title, run) {
    if (only.length > 0 && !only.includes(id)) return
    const actions = []
    const act = (what, extra = {}) => { actions.push({ ts: new Date().toISOString(), what, ...extra }); console.log(`  ${id}: ${what}`) }
    const before = probeLines()
    const startTs = new Date().toISOString()
    let result = 'PASS'
    let error
    console.log(`== ${id} ${title}`)
    try {
      const checks = await run(act)
      if (checks?.length > 0) { result = 'FAIL'; error = checks.join('; ') }
    } catch (caught) {
      result = 'FAIL'
      error = String(caught?.stack ?? caught)
    }
    const endTs = new Date().toISOString()
    const recorded = probeLines().slice(before.length).filter(line => line.ts >= startTs)
    writeFileSync(join(out, `${id}.jsonl`), recorded.map(line => JSON.stringify(line)).join('\n') + '\n')
    const counts = {}
    for (const line of recorded) counts[line.event] = (counts[line.event] ?? 0) + 1
    writeFileSync(join(out, `${id}.meta.json`), `${JSON.stringify({ id, title, result, error, startTs, endTs, actions, eventCount: recorded.length, counts }, null, 2)}\n`)
    console.log(`   ${result} ${recorded.length} events${error ? ` — ${error}` : ''}`)
    return result
  }

  return { home, events, login, api, driver, state, botNamed, roomNamed, send, probeLines, settle, bench, scenario }
}

export const expect = (condition, message) => (condition ? undefined : message)
