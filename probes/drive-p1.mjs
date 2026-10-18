// P1 seam checks on the mock model: a patched ds-bot (dsh_squad/patches/ds-bot) with the
// Squad gate (dsh_squad/gate). Builder (own chat and its Session in the group) and
// Reviewer (own chat, frozen to deepseek-v4-pro) are managed; Chief and Researcher stay
// free. Each case drives one wake-up path and checks what the gate decided and what the
// model was asked.
//
//   SQUAD=1 MOCK_DELAY_MS=600 CONTEXT_WINDOW=100000 CHECK_RATIO=0.45 probes/bench.sh p1 3201 8901 reset
//   node probes/drive-p1.mjs p1 3201 8901 [case ...]
//
// Writes probes/scenarios-p1/<id>.{jsonl,meta.json,gate.jsonl}.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROBES, expect, lines, openBench, sleep, until } from './lib.mjs'

const [name, port, mockPort, ...only] = process.argv.slice(2)
if (!name || !port || !mockPort) {
  console.error('usage: node probes/drive-p1.mjs <bench-name> <web-port> <mock-port> [case ...]')
  process.exit(2)
}
const OUT = join(PROBES, 'scenarios-p1')
const b = openBench({ name, port, mockPort, out: OUT, only })
const { home, login, api, gate, decisions, state, botNamed, roomNamed, send, settle, bench } = b
const mockCalls = () => lines(join(home, 'mock.jsonl'))
const since = ts => decisions().filter(line => line.ts >= ts)
const preSteps = (ts, sessionId) => since(ts).filter(line => line.event === 'pre-step' && (sessionId === undefined || line.sessionId === sessionId))
const chatOf = botName => botNamed(botName).sessionId ?? botNamed(botName).id
const groupOf = botName => roomNamed('研发群').sessions?.[botNamed(botName).id]
const callsFrom = (ts, sessionId) => mockCalls().filter(call => call.t >= ts && call.session === sessionId)
const verdict = async attemptId => (await gate('refresh', { attemptId }))?.verdict
const waitVerdict = async (attemptId, wanted, timeout = 60_000) => until(async () => {
  const value = await verdict(attemptId)
  return wanted.includes(value) ? value : undefined
}, timeout, 500) ?? await verdict(attemptId)
// A rejection of the given wake-up in the given Session since `ts`.
const rejected = (ts, sessionId, wake) => preSteps(ts, sessionId).filter(line => line.action === 'reject' && line.wakes.includes(wake))
let attemptSeq = 0
const nextAttempt = () => `att-${Date.now().toString(36)}-${++attemptSeq}`

// Every case records its own window of the gate's decisions next to the probe lines.
async function scenario(id, title, run) {
  const result = await b.scenario(id, title, run)
  if (result === undefined) return
  const meta = JSON.parse(readFileSync(join(OUT, `${id}.meta.json`), 'utf8'))
  const window = decisions().filter(line => line.ts >= meta.startTs && line.ts <= meta.endTs)
  writeFileSync(join(OUT, `${id}.gate.jsonl`), window.map(line => JSON.stringify(line)).join('\n') + '\n')
}

await login()

await scenario('P0-setup', 'four Bots, one group; Builder and Reviewer managed', async (act) => {
  const refs = ((await api('state')).models ?? []).map(model => model.ref)
  const flash = refs.find(ref => ref.endsWith('/deepseek-flash'))
  const pro = refs.find(ref => ref.endsWith('/deepseek-v4-pro'))
  const chief = Object.values(state().bots)[0]
  await api('update-bot', { id: chief.id, model: flash })
  await settle()
  for (const [botName, role, model] of [['Researcher', 'Research', flash], ['Builder', 'Engineer', flash], ['Reviewer', 'Review', pro]]) {
    await api('create-bot', { name: botName, role, instructions: `You are the team's ${role}.`, model })
  }
  await settle()
  const ids = ['Chief', 'Researcher', 'Builder', 'Reviewer'].map(n => botNamed(n).id)
  await api('create-room', { name: '研发群', members: ids, admin: ids[0] })
  await settle()
  // A group member Session exists once it first speaks; the admin calling on everyone
  // (the mock's 讨论) makes them all.
  await send(roomNamed('研发群').id, '讨论')
  await settle()
  const split = ref => ({ provider: ref.split('/')[0], model: ref.split('/').slice(1).join('/') })
  const room = roomNamed('研发群')
  act('manage Builder chat, Builder in the group, Reviewer chat (frozen v4-pro)')
  await gate('manage', { botId: botNamed('Builder').id, frozen: split(flash) })
  await gate('manage', { botId: botNamed('Builder').id, roomId: room.id, frozen: split(flash) })
  await gate('manage', { botId: botNamed('Reviewer').id, frozen: split(pro) })
  const created = decisions().filter(line => line.event === 'agent/created')
  const unknown = created.filter(line => line.owner === null)
  act('owners at agent/created', { created: created.length, unknown: unknown.length })
  return [expect(groupOf('Builder'), 'Builder has no group Session'), expect(unknown.length === 0, `${unknown.length} Session(s) had no owner at agent/created`)].filter(Boolean)
})

await scenario('P1-admitted', 'an admitted attempt runs, uses tools, and is judged settled_completed', async (act) => {
  const attemptId = nextAttempt()
  act('admit Builder: 长任务 2 1', { attemptId })
  await gate('admit', { botId: botNamed('Builder').id, attemptId, text: '长任务 2 1' })
  const final = await waitVerdict(attemptId, ['settled_completed', 'settled_aborted', 'settled_failed', 'settled_blocked', 'outcome_unknown'])
  await settle()
  const opened = decisions().some(line => line.event === 'attempt/open' && line.attemptId === attemptId)
  act('verdict', { verdict: final })
  return [expect(final === 'settled_completed', `verdict ${final}`), expect(opened, 'attempt never opened')].filter(Boolean)
})

await scenario('N1-mention', '@Builder in the group: the relay into Builder\'s managed Session is held', async (act) => {
  const ts = new Date().toISOString()
  act('user posts "@Builder 帮忙看看" in group')
  await send(roomNamed('研发群').id, '@Builder 帮忙看看')
  await settle()
  const held = rejected(ts, groupOf('Builder'), 'group-relay')
  act('after', { rejected: held.length, modelCalls: callsFrom(ts, groupOf('Builder')).length })
  return [expect(held.length > 0, 'no held group relay'), expect(callsFrom(ts, groupOf('Builder')).length === 0, 'Builder\'s group Session reached the model')].filter(Boolean)
})

await scenario('N2-bot-to-bot', 'message_bot and post_to_group into managed Sessions are held; free Bots still talk', async (act) => {
  const ts = new Date().toISOString()
  act('Chief: 转告 Builder: 请准备构建环境 (message_bot)')
  await send(botNamed('Chief').id, '转告 Builder: 请准备构建环境')
  await settle()
  act('Chief: 群发 研发群: 今天开会 (post_to_group → relay)')
  await send(botNamed('Chief').id, '群发 研发群: 今天开会')
  await settle()
  const chat = rejected(ts, chatOf('Builder'), 'bot-request')
  const group = rejected(ts, groupOf('Builder'), 'group-relay')
  const freeAnswered = callsFrom(ts, groupOf('Researcher')).length > 0
  act('after', { chatRejects: chat.length, groupRejects: group.length, freeAnswered })
  return [expect(chat.length > 0, 'message_bot was not held'), expect(group.length > 0, 'group relay was not held'), expect(callsFrom(ts, chatOf('Builder')).length + callsFrom(ts, groupOf('Builder')).length === 0, 'a managed Session reached the model'), expect(freeAnswered, 'a free member did not answer the post')].filter(Boolean)
})

await scenario('N3-user', 'a user message straight into a managed chat is held', async (act) => {
  const ts = new Date().toISOString()
  await send(botNamed('Builder').id, '你好')
  await settle()
  const held = rejected(ts, chatOf('Builder'), 'user')
  act('after', { rejected: held.length })
  return [expect(held.length > 0, 'user message not held'), expect(callsFrom(ts, chatOf('Builder')).length === 0, 'reached the model')].filter(Boolean)
})

await scenario('N4-schedule', 'a scheduled task due in a managed chat is held', async (act) => {
  const at = new Date(Date.now() + 65_000).toISOString()
  act('schedule-create for Builder', { at })
  await api('schedule-create', { target: botNamed('Builder').id, title: 'p1 check', prompt: '定时检查', when: { kind: 'at', at } })
  await sleep(Date.parse(at) - Date.now() + 1000)
  const held = await until(() => rejected(at, chatOf('Builder'), 'schedule').length > 0 || undefined, 60_000)
  await settle()
  act('after', { held: Boolean(held) })
  return [expect(held, 'schedule not held'), expect(callsFrom(at, chatOf('Builder')).length === 0, 'reached the model')].filter(Boolean)
})

await scenario('N5-reply', 'a reply coming back to a managed Bot after its attempt ended is held', async (act) => {
  const ts = new Date().toISOString()
  const attemptId = nextAttempt()
  act('admit Builder: 转告 Chief: 进度如何', { attemptId })
  await gate('admit', { botId: botNamed('Builder').id, attemptId, text: '转告 Chief: 进度如何' })
  const final = await waitVerdict(attemptId, ['settled_completed', 'outcome_unknown', 'settled_failed'])
  await settle()
  const held = rejected(ts, chatOf('Builder'), 'reply')
  act('after', { verdict: final, replyRejects: held.length })
  return [expect(final === 'settled_completed', `attempt verdict ${final}`), expect(held.length > 0, 'the reply was not held')].filter(Boolean)
})

await scenario('N6-retry', 'DS Bot\'s retry after a tool call written as text is held', async (act) => {
  const ts = new Date().toISOString()
  const attemptId = nextAttempt()
  act('admit Builder: 写成文字', { attemptId })
  await gate('admit', { botId: botNamed('Builder').id, attemptId, text: '写成文字' })
  await waitVerdict(attemptId, ['settled_completed', 'outcome_unknown', 'settled_failed'])
  await settle()
  const held = rejected(ts, chatOf('Builder'), 'retry')
  act('after', { retryRejects: held.length })
  return [expect(held.length > 0, 'the retry was not held')].filter(Boolean)
})

await scenario('N7-stopped', 'another Bot stops a running attempt: aborted, and the stop notice is held', async (act) => {
  const ts = new Date().toISOString()
  const attemptId = nextAttempt()
  // stop_bot refuses a Bot that is not running, so Builder runs an attempt first.
  act('admit Builder: 长任务 8 1', { attemptId })
  await gate('admit', { botId: botNamed('Builder').id, attemptId, text: '长任务 8 1' })
  await until(() => since(ts).some(line => line.event === 'attempt/open' && line.attemptId === attemptId), 30_000)
  await sleep(1500)
  act('Chief: 叫停 Builder: 暂停一下 (stop_bot)')
  await send(botNamed('Chief').id, '叫停 Builder: 暂停一下')
  const final = await waitVerdict(attemptId, ['settled_aborted', 'settled_completed', 'outcome_unknown'])
  await settle()
  const held = rejected(ts, chatOf('Builder'), 'stopped')
  act('after', { verdict: final, stoppedRejects: held.length })
  return [expect(final === 'settled_aborted', `verdict ${final}`), expect(held.length > 0, 'the stop notice was not held')].filter(Boolean)
})

await scenario('N8-steer-and-fence', 'mid-attempt steering is filtered out; a superseded admission and a forged one are held', async (act) => {
  const ts = new Date().toISOString()
  const long = nextAttempt()
  act('admit Builder: 长任务 6 1', { attemptId: long })
  await gate('admit', { botId: botNamed('Builder').id, attemptId: long, text: '长任务 6 1' })
  await until(() => since(ts).some(line => line.event === 'attempt/open' && line.attemptId === long), 30_000)
  act('Chief: 插话 Builder: 先停一下 (message_bot now → steer)')
  await send(botNamed('Chief').id, '插话 Builder: 先停一下')
  // Two admissions while the long one runs: the first is superseded by the second.
  const older = nextAttempt()
  const newer = nextAttempt()
  await sleep(1500)
  act('admit two more while it runs', { older, newer })
  await gate('admit', { botId: botNamed('Builder').id, attemptId: older, text: '收到吗' })
  await gate('admit', { botId: botNamed('Builder').id, attemptId: newer, text: '收到吗' })
  act('inject a forged squad input')
  await gate('inject-raw', { botId: botNamed('Builder').id, attemptId: 'forged-1', fence: 999, text: '收到吗' })
  await waitVerdict(long, ['settled_completed', 'outcome_unknown', 'settled_failed'], 90_000)
  await settle()
  const steered = preSteps(ts, chatOf('Builder')).filter(line => line.reason === 'attempt_continues' && line.held.some(entry => entry.wake === 'bot-request'))
  const holds = preSteps(ts, chatOf('Builder')).flatMap(line => line.held)
  const stale = holds.filter(entry => entry.why === 'stale_fence')
  const forged = holds.filter(entry => entry.why === 'unknown_attempt' || entry.why === 'stale_fence')
  const newerOpened = since(ts).some(line => line.event === 'attempt/open' && line.attemptId === newer)
  act('after', { longVerdict: await verdict(long), steeredFiltered: steered.length, stale: stale.length, forgedOrStale: forged.length, newerOpened })
  return [expect(await verdict(long) === 'settled_completed', `long attempt ${await verdict(long)}`), expect(steered.length > 0, 'steering was not filtered mid-attempt'), expect(stale.length > 0, 'the superseded admission was not held as stale'), expect(newerOpened, 'the newest admission did not open'), expect(holds.some(entry => entry.why === 'stale_fence' || entry.why === 'unknown_attempt'), 'the forged input was not held')].filter(Boolean)
})

await scenario('N9-cancel', 'a cancelled attempt is settled_aborted, never completed', async (act) => {
  const ts = new Date().toISOString()
  const attemptId = nextAttempt()
  await gate('admit', { botId: botNamed('Builder').id, attemptId, text: '长任务 8 1' })
  await until(() => since(ts).some(line => line.event === 'attempt/open' && line.attemptId === attemptId), 30_000)
  await sleep(2000)
  act('cancel the attempt', { attemptId })
  await gate('cancel', { attemptId })
  const final = await waitVerdict(attemptId, ['settled_aborted', 'settled_completed', 'outcome_unknown'])
  await settle()
  act('after', { verdict: final })
  return [expect(final === 'settled_aborted', `verdict ${final}`)].filter(Boolean)
})

await scenario('N10-handoff', 'a part switch keeps the owner from the first event, and the handoff self-start is held', async (act) => {
  const ts = new Date().toISOString()
  const first = chatOf('Builder')
  for (let round = 1; round <= 4 && chatOf('Builder') === first; round += 1) {
    const attemptId = nextAttempt()
    act(`admit Builder: 长文 30 (round ${round})`, { attemptId })
    await gate('admit', { botId: botNamed('Builder').id, attemptId, text: `长文 30 第${round}篇` })
    await waitVerdict(attemptId, ['settled_completed', 'outcome_unknown', 'settled_failed', 'settled_blocked'])
    await settle()
  }
  const fresh = chatOf('Builder')
  const created = since(ts).find(line => line.event === 'agent/created' && line.sessionId === fresh)
  const held = rejected(ts, fresh, 'handoff')
  act('after', { switched: fresh !== first, ownerAtCreation: created?.owner ?? null, handoffRejects: held.length, freshModelCalls: callsFrom(ts, fresh).length })
  return [expect(fresh !== first, 'no part switch'), expect(created?.owner?.botId === botNamed('Builder').id && created?.owner?.partOf === first, `owner at creation ${JSON.stringify(created?.owner)}`), expect(held.length > 0, 'handoff self-start not held'), expect(callsFrom(ts, fresh).length === 0, 'the fresh part reached the model')].filter(Boolean)
})

await scenario('N11-restart', 'a restart mid-attempt: no resume, no replay, verdict outcome_unknown', async (act) => {
  const ts = new Date().toISOString()
  const attemptId = nextAttempt()
  act('admit Builder: 长任务 10 1', { attemptId })
  await gate('admit', { botId: botNamed('Builder').id, attemptId, text: '长任务 10 1' })
  await until(() => since(ts).some(line => line.event === 'attempt/open' && line.attemptId === attemptId), 30_000)
  await sleep(2500)
  act('restart web host (SIGTERM, then start)')
  bench('restart-web')
  const back = new Date().toISOString()
  await login()
  await sleep(8000)
  await settle()
  const selfStarts = since(back).filter(line => line.event === 'self-start')
  const entered = preSteps(back, chatOf('Builder')).filter(line => line.action === 'enter')
  const calls = callsFrom(back, chatOf('Builder'))
  const final = await verdict(attemptId)
  act('after', { selfStarts: selfStarts.map(line => `${line.what}:${line.allowed}`), enteredAfterRestart: entered.length, modelCallsAfterRestart: calls.length, verdict: final })
  return [expect(selfStarts.some(line => line.what === 'resume' && line.allowed === false), 'resume was not refused'), expect(entered.length === 0, 'Builder entered a step after the restart'), expect(calls.length === 0, 'Builder reached the model after the restart (replay)'), expect(final === 'outcome_unknown', `verdict ${final}`)].filter(Boolean)
})

await scenario('N12-model-freeze', 'Reviewer\'s frozen model leaves the catalog: the fallback is refused before any request', async (act) => {
  act('restart web host with deepseek-v4-pro removed from the catalog')
  bench('restart-web', { CATALOG: 'flash-only' })
  await login()
  await sleep(4000)
  // The catalog read makes DS Bot re-apply every Bot's model, which moves Reviewer.
  await api('models').catch(() => api('state'))
  await api('state')
  await sleep(3000)
  const ts = new Date().toISOString()
  const attemptId = nextAttempt()
  act('admit Reviewer: 你好', { attemptId })
  await gate('admit', { botId: botNamed('Reviewer').id, attemptId, text: '你好' })
  await settle()
  const refused = preSteps(ts, chatOf('Reviewer')).filter(line => line.reason === 'model_mismatch')
  const calls = callsFrom(ts, chatOf('Reviewer'))
  act('after', { refused: refused.length, route: refused[0]?.route ?? null, frozen: refused[0]?.frozen ?? null, applied: botNamed('Reviewer').appliedModel, modelCalls: calls.length })
  return [expect(refused.length > 0, 'the fallback route was not refused'), expect(calls.length === 0, 'Reviewer reached the model on the fallback')].filter(Boolean)
})

console.log('done')
