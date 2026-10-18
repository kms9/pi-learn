// Drives the P0 scenarios on a probe bench that runs the real DeepSeek API
// (MODEL=real probes/bench.sh ...), plus the three cases the mock run left open: a part
// switch rejected mid-turn (S7), nested PTC tool calls (S8) and a silent model fallback
// (S9). Prompts are short and ask for one-sentence answers to keep the cost down.
//
//   set -a; . ~/.secrets/deepseek.env; set +a
//   MODEL=real CONTEXT_WINDOW=60000 CHECK_RATIO=0.45 probes/bench.sh real 3198 8898 reset
//   node probes/drive-real.mjs real 3198 8898 [scenario ...]
//
// Writes probes/scenarios-real/<id>.{jsonl,meta.json}.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROBES, expect, openBench, sleep, until } from './lib.mjs'

const [name, port, mockPort, ...only] = process.argv.slice(2)
if (!name || !port || !mockPort) {
  console.error('usage: node probes/drive-real.mjs <bench-name> <web-port> <mock-port> [scenario ...]')
  process.exit(2)
}
const b = openBench({ name, port, mockPort, out: join(PROBES, 'scenarios-real'), only, quietMs: 4000, stepTimeoutMs: 240_000 })
const { home, login, api, driver, state, botNamed, roomNamed, send, probeLines, settle, bench, scenario } = b
const SHORT = 'Answer in one short sentence unless a task needs more. Do not ask follow-up questions.'
const since = ts => probeLines().filter(line => line.ts >= ts)
const sessionOf = bot => bot.sessionId ?? bot.id
const workspace = join(home, 'bot', 'workspace')
// Outside DSH_HOME: DS Bot refuses a working folder that holds DSH data.
const altDir = join(PROBES, '.run', `${name}-alt-workdir`)

// Small files the multi-step scenarios read: real tool calls, a few hundred tokens each.
function seedFiles(dir) {
  mkdirSync(dir, { recursive: true })
  for (const [file, topic] of [['a.txt', 'alpha: task contracts'], ['b.txt', 'beta: dependency DAGs'], ['c.txt', 'gamma: independent review']]) {
    writeFileSync(join(dir, file), `${topic}\n${Array.from({ length: 12 }, (_, i) => `line ${i + 1}: notes about ${topic.split(': ')[1]}.`).join('\n')}\n`)
  }
}

await login()

await scenario('S0-setup', 'four Bots on the real model, one group', async (act) => {
  const value = await api('state')
  const refs = (value.models ?? []).map(model => model.ref)
  const flash = refs.find(ref => ref.endsWith('/deepseek-flash'))
  const pro = refs.find(ref => ref.endsWith('/deepseek-v4-pro'))
  if (!flash) return [`deepseek-flash not served (${refs.join(', ')})`]
  const chief = Object.values(state().bots)[0]
  act('pick Chief model', { model: flash })
  await api('update-bot', { id: chief.id, model: flash, instructions: SHORT })
  await settle()
  // Reviewer runs on v4-pro so that S9 can take that model out of the catalog.
  for (const [botName, role, model] of [['Researcher', 'Research', flash], ['Builder', 'Engineer', flash], ['Reviewer', 'Review', pro ?? flash]]) {
    act(`create ${botName}`, { model })
    await api('create-bot', { name: botName, role, instructions: `You are the team's ${role}. ${SHORT}`, model })
  }
  await settle()
  const ids = ['Chief', 'Researcher', 'Builder', 'Reviewer'].map(n => botNamed(n)?.id)
  act('create group 研发群')
  await api('create-room', { name: '研发群', members: ids, admin: ids[0] })
  await settle()
  seedFiles(workspace)
  seedFiles(altDir)
  return [expect(roomNamed('研发群')?.members.length === 4, 'group not made with four members'), expect(pro, 'deepseek-v4-pro not served; S9 cannot test the fallback')].filter(Boolean)
})

await scenario('S1-mention', '@ one Bot in the group', async (act) => {
  act('user posts "@Researcher 用一句话介绍你自己" in group')
  await send(roomNamed('研发群').id, '@Researcher 用一句话介绍你自己')
  const quiet = await settle()
  const log = roomNamed('研发群').log ?? []
  return [expect(quiet, 'did not go quiet'), expect(log.some(line => line.who === 'Researcher'), 'Researcher did not answer in the group')].filter(Boolean)
})

await scenario('S2-bot-to-bot', 'message_bot, post_to_group, group_relay', async (act) => {
  const chief = botNamed('Chief')
  act('ask Chief to message Builder (message_bot)')
  await send(chief.id, '用 message_bot 告诉 Builder：请准备构建环境，回一句话即可。收到回复后用一句话告诉我。')
  await settle()
  act('ask Chief to post in the group (post_to_group → group_relay)')
  await send(chief.id, '用 post_to_group 在「研发群」发一句：今天下午三点开会，收到请回一个字。')
  await settle()
  const exchanges = state().exchanges.filter(entry => entry.from === chief.id && entry.to === botNamed('Builder').id)
  const log = roomNamed('研发群').log ?? []
  return [expect(exchanges.some(entry => entry.role === 'request'), 'no Chief→Builder request'), expect(log.some(line => line.who === 'Chief'), 'Chief did not post in the group')].filter(Boolean)
})

await scenario('S3-schedule', 'a scheduled task fires in a Bot chat', async (act) => {
  const reviewer = botNamed('Reviewer')
  const at = new Date(Date.now() + 65_000).toISOString()
  act('schedule-create for Reviewer', { at })
  await api('schedule-create', { target: reviewer.id, title: 'probe check', prompt: '定时检查：回复「收到」两个字即可。', when: { kind: 'at', at } })
  await sleep(Date.parse(at) - Date.now() + 1000)
  const chat = sessionOf(botNamed('Reviewer'))
  const fired = await until(() => since(at).some(line => line.event === 'agent/inbox/claimed' && line.session === chat && line.message?.source?.kind === 'schedule'), 60_000)
  act(fired ? 'Reviewer claimed the reminder' : 'nothing claimed by Reviewer after due time')
  await settle()
  return [expect(fired, 'the task did not reach Reviewer')].filter(Boolean)
})

await scenario('S5-part-switch', 'context fills between turns; ds-bot moves the chat to a fresh part', async (act) => {
  const researcher = botNamed('Researcher')
  const first = sessionOf(researcher)
  // ~10k tokens of plain notes per message; the check line is ~23k tokens.
  const filler = Array.from({ length: 700 }, (_, i) => `Note ${i}: the review step checks result version ${i % 17} against goal revision ${i % 11}.`).join('\n')
  for (const round of [1, 2, 3]) {
    act(`send Researcher ~10k tokens of notes, round ${round}`)
    await send(researcher.id, `以下是第${round}批会议记录，只需回复「已读」两个字。\n\n${filler}`)
    await settle()
    if ((botNamed('Researcher').segments ?? []).length > 0) break
  }
  const now = botNamed('Researcher')
  act('parts', { segments: (now.segments ?? []).length, sessionId: now.sessionId, first })
  return [expect((now.segments ?? []).length >= 1 && sessionOf(now) !== first, 'Researcher did not switch to a new part')].filter(Boolean)
})

await scenario('S7-midturn-switch', 'the working folder changes mid-turn; ds-bot rejects the next step and switches part', async (act) => {
  const builder = botNamed('Builder')
  const chat = sessionOf(builder)
  seedFiles(altDir)
  const sent = new Date().toISOString()
  act('ask Builder for a three-read task, one tool call at a time')
  await send(builder.id, '请严格一次只调用一个工具：先用 read 读 a.txt，再用 read 读 b.txt，再用 read 读 c.txt，最后用一句话说出三个文件第一行。')
  const firstTool = await until(() => since(sent).find(line => line.event === 'tools/execute:out' && line.session === chat), 120_000, 100)
  if (firstTool === undefined) return ['Builder never ran a tool']
  act('first tool done; move Builder to another working folder mid-turn', { altDir })
  await api('update-bot', { id: builder.id, workDir: altDir })
  await settle()
  // DSH ends a turn whose next step a pre-step listener rejects as `blocked`. ds-bot's
  // listener can sit outside the probe's, so the reject itself may never reach the probe;
  // the blocked turn end is the evidence either way.
  const rejected = since(sent).filter(line => line.event === 'agent/pre-step:out' && line.decision === 'reject')
  const blocked = since(sent).filter(line => line.session === chat && line.event === 'session/event' && line.type === 'turn/end' && line.reason?.kind === 'blocked')
  const now = botNamed('Builder')
  act('after', { rejectsSeenByProbe: rejected.length, blockedTurnEnds: blocked.length, segments: (now.segments ?? []).length })
  return [expect(rejected.length + blocked.length > 0, 'no rejected step (neither a reject nor a blocked turn end)'), expect(sessionOf(now) !== chat, 'Builder stayed in the same part')].filter(Boolean)
})

await scenario('S8-ptc-nested', 'a plain DSH Session on the PTC preset runs nested tool calls', async (act) => {
  const presets = await driver('presets')
  act('presets', { presets: presets.map(preset => preset.id).join(',') })
  const ptc = presets.find(preset => /ptc/i.test(preset.id) && !preset.broken)
  if (ptc === undefined) return [`no PTC preset among ${presets.map(preset => preset.id).join(', ')}`]
  const { sessionId } = await driver('create', { cwd: workspace, agentPreset: ptc.id })
  const sent = new Date().toISOString()
  act('created PTC Session; ask for one program that reads two files', { sessionId, preset: ptc.id })
  await driver('send', { sessionId, text: '用一次 run_code 程序，在程序里调用 read 读取 a.txt 和 b.txt，返回两个文件的第一行。然后用一句话回答。' })
  await settle()
  const nested = since(sent).filter(line => line.session === sessionId && line.event === 'tools/execute:in' && line.parentCall)
  const guardedNested = since(sent).filter(line => line.session === sessionId && line.event === 'tools/pre-execute:in' && line.parentCall)
  act('after', { nested: nested.length, preExecuteNested: guardedNested.length })
  return [expect(nested.length > 0, 'no nested tool call observed')].filter(Boolean)
})

await scenario('S6-cancel', 'user stops a member working in the group', async (act) => {
  const room = roomNamed('研发群')
  const builderGroup = () => roomNamed('研发群').sessions?.[botNamed('Builder').id]
  const sent = new Date().toISOString()
  act('user asks @Builder for an ~800-character write-up in the group')
  await send(room.id, '@Builder 请写一段约 800 字的说明，介绍任务依赖图如何调度。')
  const streaming = await until(() => since(sent).some(line => line.event === 'llm/stream' && line.session === builderGroup()), 90_000, 200)
  if (!streaming) return ['Builder never started its model call']
  await sleep(3000)
  act('stop-member-work')
  const stopped = await api('stop-member-work', { roomId: room.id, botId: botNamed('Builder').id })
  act('stop returned', { stopped })
  await settle()
  return [expect(stopped === true, 'stop-member-work returned false')].filter(Boolean)
})

await scenario('S4-restart', 'host restarts while a Bot streams; ds-bot resumes it', async (act) => {
  const builder = botNamed('Builder')
  const chat = sessionOf(builder)
  const sent = new Date().toISOString()
  act('ask Chief to have Builder write ~800 characters (message_bot)')
  await send(botNamed('Chief').id, '用 message_bot 让 Builder 写一段约 800 字的构建环境说明并回给你，你收到后用一句话告诉我。')
  const streaming = await until(() => since(sent).some(line => line.event === 'llm/stream' && line.session === sessionOf(botNamed('Builder')) && line.owner?.bot === 'Builder'), 120_000, 200)
  if (!streaming) return ['Builder never started its model call']
  await sleep(3000)
  act('restart web host (SIGTERM, then start)')
  bench('restart-web')
  await login()
  act('host back')
  await sleep(6000)
  const quiet = await settle(300_000)
  const resumed = since(sent).filter(line => line.event === 'agent/inbox/claimed' && line.message?.source?.resumed)
  const replies = state().exchanges.filter(entry => entry.from === builder.id && entry.role === 'reply' && entry.time >= Date.parse(sent))
  act('after', { resumed: resumed.length, replies: replies.length, chat })
  return [expect(quiet, 'did not go quiet after restart'), expect(resumed.length > 0, 'no resumed delivery'), expect(replies.length > 0, 'Builder never replied after the restart')].filter(Boolean)
})

await scenario('S9-fallback', "the Reviewer's model leaves the catalog; which model does its next turn use?", async (act) => {
  const reviewer = botNamed('Reviewer')
  act('restart web host with deepseek-v4-pro removed from the catalog', { model: reviewer.model })
  bench('restart-web', { CATALOG: 'flash-only' })
  await login()
  await sleep(4000)
  const sent = new Date().toISOString()
  act('ask Reviewer for one sentence')
  await send(reviewer.id, '回复「在线」两个字。')
  await settle()
  const routes = since(sent).filter(line => line.event === 'agent/request:out' && line.owner?.bot === 'Reviewer').map(line => `${line.route?.provider}/${line.route?.model}`)
  const failed = since(sent).filter(line => line.event === 'agent/error' || (line.event === 'session/event' && line.type === 'turn/end' && line.reason?.kind !== 'completed'))
  act('after', { configured: botNamed('Reviewer').model, applied: botNamed('Reviewer').appliedModel, routes: routes.join(','), failures: failed.length })
  return [expect(routes.length > 0 || failed.length > 0, 'Reviewer neither ran nor failed')].filter(Boolean)
})

console.log('done')
