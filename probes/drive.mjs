// Drives the six P0 scenarios on a running probe bench (probes/bench.sh) and writes one
// event sequence per scenario to probes/scenarios/<id>.jsonl, plus <id>.meta.json with the
// actions taken, their times and what DS Bot's state showed afterwards.
//
//   node probes/drive.mjs <bench-name> <web-port> <mock-port> [scenario ...]
//
// It talks to DS Bot only through its documented /api/bot channel, the way ds-bot's own
// dev/smoke.mjs does, and restarts the web host through probes/bench.sh.
import { join } from 'node:path'
import { PROBES, expect, lines, openBench, sleep, until } from './lib.mjs'

const [name, port, mockPort, ...only] = process.argv.slice(2)
if (!name || !port || !mockPort) {
  console.error('usage: node probes/drive.mjs <bench-name> <web-port> <mock-port> [scenario ...]')
  process.exit(2)
}
const b = openBench({ name, port, mockPort, out: join(PROBES, 'scenarios'), only })
const { login, api, state, botNamed, roomNamed, send, settle, bench, scenario } = b
const EVENTS = b.events

await login()

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
