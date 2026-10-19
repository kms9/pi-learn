// M0 on the mock model: the one-command pair (dsh_squad/deploy/dsh-squad) on a fresh
// project directory, the preset team, Free-mode group chat and memory, a restart.
//
//   node probes/drive-m0.mjs [port]
//
// Uses probes/.run/m0-project (made afresh). Prints one PASS/FAIL line per check and
// exits non-zero when any fails. Free mode only: no Bot is managed here.
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { PROBES, lines, sleep, until } from './lib.mjs'

const port = process.argv[2] ?? '3420'
const PROJECT = join(PROBES, '.run', 'm0-project')
const CLI = join(PROBES, '..', 'dsh_squad', 'deploy', 'dsh-squad')
const run = (...args) => execFileSync(CLI, args, { encoding: 'utf8' })
const failures = []
const check = (ok, what) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) failures.push(what) }

async function session() {
  const login = readFileSync(join(PROJECT, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)
  const base = new URL(login).origin
  const cookie = (await fetch(login, { redirect: 'manual' })).headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
  return async (endpoint, payload = {}) => {
    const out = await (await fetch(`${base}/api/bot`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint, payload }) })).json()
    if (!out.ok) throw new Error(`${endpoint}: ${out.error?.message}`)
    return out.value
  }
}
const stored = () => JSON.parse(readFileSync(join(PROJECT, '.dsh-squad/home/bot/state.json'), 'utf8'))
const calls = () => lines(join(PROJECT, '.dsh-squad/logs/mock.jsonl'))
const adapterLog = () => lines(join(PROJECT, '.dsh-squad/home/squad-adapter/decisions.jsonl'))

rmSync(PROJECT, { recursive: true, force: true })
try {
  console.log('== M0-up one command on a fresh project directory')
  run('up', PROJECT, '--mock', '--port', port)
  check(readFileSync(join(PROJECT, '.agents/dshsquad/teams/default/team.json'), 'utf8').includes('"team_id": "default"'), 'default team written into the project')
  check(await until(() => adapterLog().some(line => line.event === 'controller/found'), 30_000), 'the adapter found the Controller')

  console.log('== M0-provision preset team, twice')
  const first = run('provision', PROJECT)
  const second = run('provision', PROJECT)
  const bots = Object.values(stored().bots)
  check(['Chief', 'Researcher', 'Builder', 'Reviewer'].every(name => bots.some(bot => bot.name === name)) && bots.length === 4, 'four Bots, named')
  check(bots.every(bot => bot.model?.endsWith('/deepseek-flash') && bot.effort === 'high'), 'every Bot on deepseek-flash, effort high')
  check(Object.values(stored().rooms).filter(room => room.name === '小队群').length === 1, 'one group chat')
  check(first.includes('team memory added') && second.includes('already there'), 'second run changes nothing')
  const api = await session()
  const team = JSON.parse(readFileSync(join(PROJECT, '.dsh-squad/team.json'), 'utf8'))
  const memory = await api('memory-view', { botId: team.bots.Chief })
  check(memory.entries.some(entry => entry.scope === 'team' && entry.text.includes('Reviewer')), 'team memory entry')

  console.log('== M0-free group chat in Free mode')
  const before = calls().length
  await api('send', { sessionId: team.group.id, text: '讨论' })
  // The admin calls on everyone (the mock's 讨论): each member answers in its own group Session.
  const answered = await until(() => {
    const room = Object.values(stored().rooms).find(candidate => candidate.id === team.group.id)
    const members = Object.values(room?.sessions ?? {})
    const spoke = new Set(calls().slice(before).map(call => call.session))
    return members.length >= 3 && members.filter(id => spoke.has(id)).length >= 3
  }, 60_000, 500)
  check(answered, 'three members answered in their group Sessions')
  check(!adapterLog().some(line => line.event === 'pre-step'), 'the adapter decided no step (nothing managed)')

  console.log('== M0-restart down and up keep Bots, group and memory')
  run('down', PROJECT)
  run('up', PROJECT, '--mock', '--port', port)
  check(Object.keys(stored().bots).length === 4 && Object.keys(stored().rooms).length === 1, 'Bots and group kept')
  const again = await session()
  check((await again('memory-view', { botId: team.bots.Chief })).entries.length >= 1, 'memory kept')
  check(await until(() => adapterLog().filter(line => line.event === 'controller/found').length >= 2, 30_000), 'the adapter found the restarted Controller')
  await sleep(1000)
} catch (error) {
  check(false, `error: ${error.message}`)
} finally {
  run('down', PROJECT)
}
console.log(failures.length === 0 ? 'M0: all checks pass' : `M0: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
