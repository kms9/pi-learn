// Drives the six P0 scenarios on a running probe bench (probes/bench.sh) and writes one
// event sequence per scenario to probes/scenarios/<id>.jsonl, plus <id>.meta.json with the
// actions taken, their times and what DS Bot's state showed afterwards.
//
//   node probes/drive.mjs <bench-name> <web-port> <mock-port> [scenario ...]
//
// It talks to DS Bot only through its documented /api/bot channel, the way ds-bot's own
// dev/smoke.mjs does, and restarts the web host through probes/bench.sh.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [name, port, mockPort, ...only] = process.argv.slice(2)
if (!name || !port || !mockPort) {
  console.error('usage: node probes/drive.mjs <bench-name> <web-port> <mock-port> [scenario ...]')
  process.exit(2)
}
const PROBES = dirname(fileURLToPath(import.meta.url))
const HOME = join(PROBES, '.run', name)
const OUT = join(PROBES, 'scenarios')
const EVENTS = join(HOME, 'probe', 'events.jsonl')
const BASE = `http://127.0.0.1:${port}`
const QUIET_MS = 3000
const STEP_TIMEOUT_MS = 180_000
mkdirSync(OUT, { recursive: true })

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const lines = path => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [])
const mockCalls = () => lines(join(HOME, 'mock.jsonl')).length

let cookie
async function login() {
  const log = readFileSync(join(HOME, 'web.log'), 'utf8')
  const url = log.match(new RegExp(`http://127\\.0\\.0\\.1:${port}/\\?token=[^\\s]+`))?.[0]
  if (!url) throw new Error('no login URL in web.log')
  const response = await fetch(url, { redirect: 'manual' })
  const cookies = response.headers.getSetCookie().map(entry => entry.split(';')[0])
  if (cookies.length === 0) throw new Error(`login returned no cookie (${response.status})`)
  cookie = cookies.join('; ')
}
async function api(endpoint, payload = {}) {
  const response = await fetch(`${BASE}/api/bot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ endpoint, payload }),
  })
  const result = await response.json()
  if (!result.ok) throw new Error(`${endpoint}: ${result.error?.message ?? JSON.stringify(result)}`)
  return result.value
}
const state = () => readJson(join(HOME, 'bot', 'state.json'))
const botNamed = wanted => Object.values(state().bots).find(bot => bot.name === wanted)
const roomNamed = wanted => Object.values(state().rooms).find(room => room.name === wanted)
const send = (sessionId, text) => api('send', { sessionId, text })

// Quiet: no Bot shows an activity and the mock has taken no call for QUIET_MS.
async function settle(timeout = STEP_TIMEOUT_MS) {
  const deadline = Date.now() + timeout
  let calls = mockCalls()
  let since = Date.now()
  while (Date.now() < deadline) {
    await sleep(500)
    const { activity = {} } = await api('state')
    const now = mockCalls()
    if (now !== calls || Object.keys(activity).length > 0) {
      calls = now
      since = Date.now()
    } else if (Date.now() - since >= QUIET_MS) {
      return true
    }
  }
  return false
}
async function until(check, timeout = 60_000, every = 300) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await sleep(every)
  }
  return undefined
}
const bench = action => execFileSync(join(PROBES, 'bench.sh'), [name, port, mockPort, action], { encoding: 'utf8', env: process.env })

// One scenario: its actions are logged with times, then the probe lines in its window.
async function scenario(id, title, run) {
  if (only.length > 0 && !only.includes(id)) return
  const actions = []
  const act = (what, extra = {}) => { actions.push({ ts: new Date().toISOString(), what, ...extra }); console.log(`  ${id}: ${what}`) }
  const startSeq = { pid: undefined, seq: 0 }
  const before = lines(EVENTS)
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
  const after = lines(EVENTS)
  const events = after.slice(before.length).filter(line => line.ts >= startTs)
  writeFileSync(join(OUT, `${id}.jsonl`), events.map(line => JSON.stringify(line)).join('\n') + '\n')
  const counts = {}
  for (const line of events) counts[line.event] = (counts[line.event] ?? 0) + 1
  writeFileSync(join(OUT, `${id}.meta.json`), `${JSON.stringify({ id, title, result, error, startTs, endTs, actions, eventCount: events.length, counts, startSeq }, null, 2)}\n`)
  console.log(`   ${result} ${events.length} events${error ? ` — ${error}` : ''}`)
}

await login()
const expect = (condition, message) => (condition ? undefined : message)

// Setup: Chief plus three Bots on two different model routes, one four-member group.
await scenario('S0-setup', 'four Bots, one group', async (act) => {
  const value = await api('state')
  const models = value.models ?? []
  if (models.length === 0) return ['no models']
  const chief = Object.values(state().bots)[0]
  act('pick Chief model', { model: models.at(-1).ref })
  await api('update-bot', { id: chief.id, model: models.at(-1).ref })
  await settle()
  for (const [index, [botName, role]] of [['Researcher', 'Research'], ['Builder', 'Engineer'], ['Reviewer', 'Review']].entries()) {
    const model = models[index % models.length].ref
    act(`create ${botName}`, { model })
    await api('create-bot', { name: botName, role, instructions: `You are the team's ${role}.`, model })
  }
  await settle()
  const ids = ['Chief', 'Researcher', 'Builder', 'Reviewer'].map(n => botNamed(n)?.id)
  act('create group 研发群')
  await api('create-room', { name: '研发群', members: ids, admin: ids[0] })
  await settle()
  const room = roomNamed('研发群')
  return [expect(room && room.members.length === 4, 'group not made with four members'), expect(new Set(Object.values(state().bots).map(bot => bot.model)).size >= 2, 'expected two model routes')].filter(Boolean)
})

await scenario('S1-mention', '@ one Bot in the group', async (act) => {
  const room = roomNamed('研发群')
  act('user posts "@Researcher 帮我查一下资料" in group')
  await send(room.id, '@Researcher 帮我查一下资料')
  const quiet = await settle()
  const log = roomNamed('研发群').log ?? []
  return [expect(quiet, 'did not go quiet'), expect(log.some(line => line.who === 'Researcher'), 'Researcher did not answer in the group')].filter(Boolean)
})

await scenario('S2-bot-to-bot', 'message_bot, post_to_group, group_relay', async (act) => {
  const chief = botNamed('Chief')
  act('user asks Chief: 转告 Builder: 请准备构建环境 (message_bot)')
  await send(chief.id, '转告 Builder: 请准备构建环境')
  await settle()
  act('user asks Chief: 群发 研发群: 今天下午开会 (post_to_group → group_relay)')
  await send(chief.id, '群发 研发群: 今天下午开会')
  await settle()
  const exchanges = state().exchanges.filter(entry => entry.from === chief.id && entry.to === botNamed('Builder').id)
  const log = roomNamed('研发群').log ?? []
  return [expect(exchanges.some(entry => entry.role === 'request'), 'no Chief→Builder request'),
    expect(log.some(line => line.who === 'Chief' && String(line.text).includes('今天下午开会')), 'post missing in group')].filter(Boolean)
})

await scenario('S3-schedule', 'a scheduled task fires in a Bot chat', async (act) => {
  const reviewer = botNamed('Reviewer')
  const at = new Date(Date.now() + 70_000).toISOString()
  act('schedule-create for Reviewer', { at })
  let created
  try {
    created = await api('schedule-create', { target: reviewer.id, title: 'probe check', prompt: '定时检查一下进度', when: { kind: 'at', at } })
  } catch (error) {
    return [`schedule-create failed: ${error.message}`]
  }
  act('created', { created: JSON.stringify(created)?.slice(0, 200) })
  await sleep(Date.parse(at) - Date.now() + 2000)
  const chat = botNamed('Reviewer').sessionId ?? reviewer.id
  const fired = await until(() => lines(EVENTS).some(line => line.ts >= at && line.event === 'agent/inbox/claimed' && line.session === chat && line.message?.source?.kind === 'schedule'), 60_000)
  act(fired ? 'reviewer claimed an input after due time' : 'nothing claimed by Reviewer after due time')
  await settle()
  return [expect(fired, 'the task did not reach Reviewer')].filter(Boolean)
})

await scenario('S4-restart', 'host restarts while a Bot works; ds-bot resumes it', async (act) => {
  const chief = botNamed('Chief')
  const builder = botNamed('Builder')
  act('user asks Chief: 转告 Builder: 慢慢做 25')
  await send(chief.id, '转告 Builder: 慢慢做 25')
  const working = await until(async () => {
    const { activity = {} } = await api('state')
    return activity[builder.sessionId ?? builder.id] !== undefined
  }, 60_000)
  act(working ? 'Builder is working' : 'Builder never showed activity')
  await sleep(4000)
  act('restart web host (SIGTERM, then start)')
  bench('restart-web')
  await login()
  act('host back')
  await sleep(6000)
  const quiet = await settle(240_000)
  const exchanges = state().exchanges.filter(entry => entry.from === builder.id && entry.to === chief.id && entry.role === 'reply')
  return [expect(working, 'Builder never worked before the restart'), expect(quiet, 'did not go quiet after restart'), expect(exchanges.length > 0, 'Builder never replied to Chief after the restart')].filter(Boolean)
})

await scenario('S5-part-switch', 'context fills; ds-bot moves the chat to a fresh part', async (act) => {
  const researcher = botNamed('Researcher')
  const firstSession = researcher.sessionId ?? researcher.id
  for (const round of [1, 2, 3, 4]) {
    act(`user asks Researcher: 长文 30 第${round}篇`)
    await send(researcher.id, `长文 30 第${round}篇`)
    await settle()
    if ((botNamed('Researcher').segments ?? []).length > 0) break
  }
  const now = botNamed('Researcher')
  act('parts', { segments: (now.segments ?? []).length, sessionId: now.sessionId, firstSession })
  return [expect((now.segments ?? []).length >= 1 && now.sessionId !== firstSession, 'Researcher did not switch to a new part')].filter(Boolean)
})

await scenario('S6-cancel', 'user stops a member working in the group', async (act) => {
  const room = roomNamed('研发群')
  act('user posts "派活 40" in group (admin hands a member 40 s of work)')
  await send(room.id, '派活 40')
  // DS Bot's activity view is not keyed by group Session, so the probe's own status
  // lines say which member's group Session is running.
  const sent = new Date().toISOString()
  const member = await until(async () => {
    const current = roomNamed('研发群')
    const bySession = new Map(Object.entries(current.sessions ?? {}).map(([botId, sessionId]) => [sessionId, botId]))
    const running = lines(EVENTS).filter(line => line.ts >= sent && line.event === 'agent/status' && line.status === 'running' && bySession.has(line.session) && bySession.get(line.session) !== current.admin)
    return running.at(-1) === undefined ? undefined : bySession.get(running.at(-1).session)
  }, 60_000)
  if (member === undefined) return ['no member started work']
  act('member working', { bot: state().bots[member]?.name })
  await sleep(5000)
  act('stop-member-work')
  const stopped = await api('stop-member-work', { roomId: room.id, botId: member })
  act('stop returned', { stopped })
  await settle()
  return [expect(stopped === true, 'stop-member-work returned false')].filter(Boolean)
})

console.log('done')
