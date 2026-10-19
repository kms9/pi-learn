// Preset team for a running pair (M0-3): Chief (the Main Bot), Researcher, Builder and
// Reviewer, one group chat with all four, and a first team memory entry. Idempotent:
// Bots and the group are found by name and only made when missing.
//
//   node dsh_squad/deploy/provision.mjs <project>
//
// Every Bot gets deepseek-flash; on the real API with reasoning effort high (D7). It
// talks to DS Bot's own /api/bot channel with the host's login link, as the web page
// does, and writes the names and ids it used to <project>/.dsh-squad/team.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const project = resolve(process.argv[2] ?? '')
const state = join(project, '.dsh-squad')
const GROUP = '小队群'
const TEAM = [
  { name: 'Researcher', role: '研究员', instructions: '查资料、梳理知识点，给出有出处的要点。' },
  { name: 'Builder', role: '实现者', instructions: '按要求做出成品（文档、课件、代码），交付前自查。' },
  { name: 'Reviewer', role: '审查者', instructions: '独立审查成品，只给出通过或退回的结论和理由。' },
]
const MEMORY = '团队记住 本小队有 Chief、Researcher、Builder、Reviewer 四位成员：Researcher 梳理，Builder 交付，Reviewer 独立审查；正式任务由 Squad 下发。'

const log = readFileSync(join(state, 'logs', 'web.log'), 'utf8')
const login = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g)?.at(-1)
if (login === undefined) throw new Error('no login link in the host log; is the host up?')
const base = new URL(login).origin
const response = await fetch(login, { redirect: 'manual' })
const cookie = response.headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
if (cookie === '') throw new Error(`login returned no cookie (${response.status})`)

async function api(endpoint, payload = {}) {
  const out = await fetch(`${base}/api/bot`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint, payload }) })
  const result = await out.json()
  if (!result.ok) throw new Error(`${endpoint}: ${result.error?.message ?? JSON.stringify(result)}`)
  return result.value
}
const sleep = ms => new Promise(done => setTimeout(done, ms))

// The first state read sets up the Main Bot.
let view = await api('state')
for (let i = 0; i < 60 && (view.mainBotIds ?? []).length === 0; i += 1) {
  await sleep(500)
  view = await api('state')
}
const list = value => (Array.isArray(value) ? value : Object.values(value ?? {}))
const bots = () => list(view.bots)
const named = name => bots().find(bot => bot.name === name)
const flash = (view.models ?? []).map(model => model.ref).find(ref => ref.endsWith('/deepseek-flash'))
if (flash === undefined) throw new Error('deepseek-flash is not in the model catalog')
const efforts = (await api('efforts', { ref: flash }).catch(() => ({ efforts: [] }))).efforts ?? []
const effort = efforts.some(entry => (entry?.id ?? entry) === 'high') ? 'high' : undefined

const mainId = view.mainBotIds[0]
const main = bots().find(bot => bot.id === mainId)
if (main.name !== 'Chief') await api('update-bot', { id: mainId, name: 'Chief' })
await api('update-bot', { id: mainId, model: flash, ...(effort ? { effort } : {}) })
const made = []
for (const member of TEAM) {
  view = await api('state')
  const existing = named(member.name)
  if (existing !== undefined) {
    await api('update-bot', { id: existing.id, model: flash, ...(effort ? { effort } : {}) })
    continue
  }
  await api('create-bot', { ...member, model: flash, ...(effort ? { effort } : {}) })
  made.push(member.name)
}
view = await api('state')
const ids = ['Chief', ...TEAM.map(member => member.name)].map(name => named(name)?.id)
if (ids.some(id => id === undefined)) throw new Error('a team Bot is missing after provisioning')
let room = list(view.rooms).find(candidate => candidate.name === GROUP)
if (room === undefined) {
  room = await api('create-room', { name: GROUP, members: ids, admin: ids[0] })
  made.push(GROUP)
}
let memory = 'kept'
if (made.length > 0) {
  memory = await api('memory-ask', { botId: ids[0], text: MEMORY }).then(() => 'added').catch(error => `not added: ${error.message}`)
}
const team = {
  provisioned: new Date().toISOString(),
  model: flash,
  effort: effort ?? null,
  bots: Object.fromEntries(['Chief', ...TEAM.map(member => member.name)].map((name, index) => [name, ids[index]])),
  group: { name: GROUP, id: room.id },
}
writeFileSync(join(state, 'team.json'), `${JSON.stringify(team, null, 2)}\n`)
console.log(`made: ${made.length > 0 ? made.join(', ') : 'nothing (already there)'}; model ${flash}${effort ? ` (effort ${effort})` : ''}; team memory ${memory}`)
console.log(`open: ${login}`)
