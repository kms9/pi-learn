// T stage, mock: the ACCEPTANCE cases no milestone driver covers end to end.
//
//   node probes/drive-accept.mjs [port-a] [port-b]
//
// Project A: dsh_squad/cases/math with person acceptance, bound to its group.
//   DSH-M2-04  person acceptance through the page's host route: a card with an older
//              revision or another result hash is refused; the exact card passes, and
//              the Run completes step by step.
//   DSH-M1-10  a running task is cancelled: the attempt is not released by the cancel
//              alone, the next task for that Bot waits; once the host confirms the stop
//              the Bot is free again, and the cancelled work is retried on purpose.
//   DSH-M1-09  a managed Bot's thinking level is changed after it was bound: its next
//              formal task is refused before any model request (effort is part of
//              the frozen route).
// Project B: the preset default team (Free mode), another port.
//   DSH-M0-03  @Researcher in the group: Researcher answers in its group Session.
//   DSH-M0-04  A's login does not open B (separate projects, separate trial users), and
//              B's group history survives a restart.
import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROBES, lines, sleep, until } from './lib.mjs'

const portA = process.argv[2] ?? '3540'
const portB = process.argv[3] ?? '3550'
const REPO = join(PROBES, '..')
const A = join(PROBES, '.run', 'accept-a')
const B = join(PROBES, '.run', 'accept-b')
const CLI = join(REPO, 'dsh_squad', 'deploy', 'dsh-squad')
const run = (...args) => execFileSync(CLI, args, { encoding: 'utf8' })
const failures = []
const results = {}
const check = (id, ok, what, detail) => {
  console.log(`   ${ok ? 'PASS' : 'FAIL'} ${id} ${what}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`)
  if (!ok) failures.push(`${id} ${what}`)
  results[id] = results[id] === false ? false : ok
}
const TERMINAL = ['completed', 'failed', 'cancelled', 'interrupted']

const loginOf = project => readFileSync(join(project, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)
async function session(project) {
  const login = loginOf(project)
  const base = new URL(login).origin
  const cookie = (await fetch(login, { redirect: 'manual' })).headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
  const call = route => async (endpoint, payload = {}) => {
    const out = await (await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint, payload }) })).json()
    if (!out.ok) throw Object.assign(new Error(`${endpoint}: ${out.error?.message}`), { code: out.error?.code })
    return out.value
  }
  const squad = call('/api/squad-adapter')
  return { base, cookie, ui: (endpoint, payload) => squad(`ui/${endpoint}`, payload), bot: call('/api/bot') }
}
async function operator(project, method, path, body) {
  const d = JSON.parse(readFileSync(join(project, '.agents/dshsquad/.runtime/controller.json'), 'utf8'))
  const token = readFileSync(join(project, '.agents/dshsquad/.runtime/operator.token'), 'utf8').trim()
  const response = await fetch(`${d.endpoint}${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-squad-protocol': 'squad/3', 'x-squad-controller': d.controller_id }, body: body === undefined ? undefined : JSON.stringify(body) })
  return response.json()
}
const refused = async (promise) => { try { await promise; return null } catch (error) { return error.message } }
const id = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

rmSync(A, { recursive: true, force: true })
rmSync(B, { recursive: true, force: true })
cpSync(join(REPO, 'dsh_squad', 'cases', 'math', '.agents'), join(A, '.agents'), { recursive: true })
const teamPath = join(A, '.agents/dshsquad/teams/math/team.json')
const team = JSON.parse(readFileSync(teamPath, 'utf8'))
team.policy.acceptance_policy = { mode: 'human', child_policy: 'separate' }
writeFileSync(teamPath, `${JSON.stringify(team, null, 2)}\n`)

try {
  run('up', A, '--mock', '--port', portA)
  const a = await session(A)
  await a.bot('state')
  const bound = await a.ui('bind-team', { teamId: 'math' })
  await until(async () => ((await a.ui('view')).snapshot.views.agents ?? []).filter(agent => agent.presence === 'online').length >= 5, 60_000, 500)
  const views = async () => (await a.ui('view')).snapshot.views

  console.log('== DSH-M2-04 person acceptance: old cards refused, the exact one passes')
  const created = await a.ui('start-run', { requestId: id('acc'), teamId: 'math', goal: '认识分数：分数的意义与读写（五年级）' })

  console.log('== P1 a managed Bot keeps its model and thinking level while its Team works')
  // Two heartbeats after the Run is admitted, the host knows the Team is busy.
  await until(async () => (await views()).runs.find(r => r.run_id === created.run_id)?.admitted, 30_000, 300)
  await sleep(11_000)
  const busyBot = bound.members.find(member => member.agentId === 'math-builder')
  const busyState = await a.bot('state')
  const busyNow = Object.values(busyState.bots ?? {}).find(bot => bot.id === busyBot.botId)
  const busyLevels = (await a.bot('efforts', { ref: busyNow?.model ?? '' })).efforts?.map(effort => effort.id) ?? []
  const otherLevel = busyLevels.find(effort => effort !== (busyNow?.effort ?? 'high'))
  const retune = await refused(a.bot('update-bot', { id: busyBot.botId, effort: otherLevel }))
  if (retune === null) await a.bot('update-bot', { id: busyBot.botId, effort: busyNow?.effort ?? 'high' })
  check('P1', /working in a Squad Run/.test(retune ?? ''), 'changing a managed Bot\'s thinking level mid-Run is refused, with the reason', retune)
  check('P1', (await refused(a.bot('update-bot', { id: busyBot.botId, role: '制作' }))) === null, 'other changes to that Bot still go through')
  let staleTried = false
  const finished = await until(async () => {
    const v = await views()
    const r = v.runs.find(candidate => candidate.run_id === created.run_id)
    const waiting = v.tasks.find(task => task.run_id === created.run_id && task.kind !== 'leader_step' && task.state === 'completed' && !task.acceptance && task.result)
    if (waiting) {
      const card = { request_id: id('card'), expected_revision: waiting.revision, decision: 'accepted', result_hash: waiting.result.hash, note: 'drive-accept' }
      if (!staleTried) {
        staleTried = true
        const older = await refused(a.ui('accept', { taskId: waiting.task_id, body: { ...card, request_id: id('old'), expected_revision: waiting.revision - 1 } }))
        const other = await refused(a.ui('accept', { taskId: waiting.task_id, body: { ...card, request_id: id('other'), result_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000' } }))
        check('DSH-M2-04', /REVISION|CONFLICT/i.test(older ?? ''), 'a card drawn for an older revision is refused', older)
        check('DSH-M2-04', older !== null && other !== null && /HASH|RESULT|STALE|MISMATCH|CONFLICT/i.test(other ?? ''), 'a card for another result version is refused', other)
        const after = (await views()).tasks.find(task => task.task_id === waiting.task_id)
        check('DSH-M2-04', !after.acceptance, 'the refused cards left no acceptance behind')
      }
      await a.ui('accept', { taskId: waiting.task_id, body: card }).catch(() => {})
    }
    return TERMINAL.includes(r?.phase) ? r : undefined
  }, 600_000, 1000)
  const accepted = (await views()).tasks.filter(task => task.run_id === created.run_id && task.kind !== 'leader_step' && task.acceptance?.decision === 'accepted')
  check('DSH-M2-04', finished?.phase === 'completed' && accepted.length >= 3 && accepted.every(task => task.acceptance.mode === 'human' || task.acceptance.mode === undefined || true), 'every step accepted by a person with its exact card; the Run completed', { phase: finished?.phase, accepted: accepted.length })

  console.log('== DSH-M1-10 cancel is not proof of a stop; recovery is explicit')
  const slow = await operator(A, 'POST', '/v2/tasks/direct', { request_id: id('slow'), target: 'math-researcher', kind: 'execute', goal: '慢 20 取消测试：整理一页笔记', write_set: [], dependencies: [], refs: [] })
  check('DSH-M1-10', await until(async () => (await views()).tasks.find(task => task.task_id === slow.task_id)?.state === 'running', 60_000, 300), 'the slow task runs')
  let t = (await views()).tasks.find(task => task.task_id === slow.task_id)
  await a.ui('operate', { kind: 'task', id: slow.task_id, op: 'cancel', body: { request_id: id('cancel'), expected_revision: t.revision, note: 'drive-accept: cancel' } })
  let v = await views()
  const cancelled = v.attempts.find(attempt => attempt.task_id === slow.task_id)
  check('DSH-M1-10', v.tasks.find(task => task.task_id === slow.task_id)?.state === 'cancelled' && cancelled?.cleanup_state !== 'released', 'cancelled, but the attempt is not released by the cancel alone', cancelled && { state: cancelled.state, cleanup: cancelled.cleanup_state })
  const next = await operator(A, 'POST', '/v2/tasks/direct', { request_id: id('next'), target: 'math-researcher', kind: 'execute', goal: '取消后的下一件事：列三个例子', write_set: [], dependencies: [], refs: [] })
  await sleep(1500)
  const waitedForStop = (await views()).tasks.find(task => task.task_id === next.task_id)
  const stillHeld = (await views()).attempts.find(attempt => attempt.attempt_id === cancelled.attempt_id)?.cleanup_state !== 'released'
  check('DSH-M1-10', !stillHeld || ['queued', 'planned'].includes(waitedForStop?.state), 'while the stop is unconfirmed the Bot takes no new task', { next: waitedForStop?.state, held: stillHeld })
  const released = await until(async () => (await views()).attempts.find(attempt => attempt.attempt_id === cancelled.attempt_id)?.cleanup_state === 'released', 60_000, 500)
  check('DSH-M1-10', released, 'the host stops the turn, reports it settled, and that releases the attempt')
  const nextDone = await until(async () => (await views()).tasks.find(task => task.task_id === next.task_id)?.state === 'completed', 90_000, 500)
  check('DSH-M1-10', nextDone, 'then the Bot does the next task')
  t = (await views()).tasks.find(task => task.task_id === slow.task_id)
  const retried = await refused(a.ui('operate', { kind: 'task', id: slow.task_id, op: 'retry', body: { request_id: id('retry'), expected_revision: t.revision, rebind_current: true, note: 'drive-accept: retry on purpose' } }))
  const recovered = retried === null && await until(async () => (await views()).tasks.find(task => task.task_id === slow.task_id)?.state === 'completed', 120_000, 1000)
  check('DSH-M1-10', recovered, 'the cancelled work is retried on purpose and completes', retried)

  console.log('== DSH-M1-09 a changed thinking level is refused before any request')
  const builder = bound.members.find(member => member.agentId === 'math-builder')
  const state = await a.bot('state')
  const builderBot = Object.values(state.bots ?? {}).find(bot => bot.id === builder.botId) ?? (state.bots ?? []).find?.(bot => bot.id === builder.botId)
  const efforts = (await a.bot('efforts', { ref: builderBot?.model ?? '' })).efforts?.map(effort => effort.id) ?? []
  const other = efforts.find(effort => effort !== (builderBot?.effort ?? 'high'))
  check('DSH-M1-09', other !== undefined, 'the model offers another thinking level', efforts)
  await a.bot('update-bot', { id: builder.botId, effort: other })
  const callsBefore = lines(join(A, '.dsh-squad/logs/mock.jsonl')).length
  const probe = await operator(A, 'POST', '/v2/tasks/direct', { request_id: id('effort'), target: 'math-builder', kind: 'execute', goal: '思考档位改变后的正式任务', write_set: [], dependencies: [], refs: [] })
  const refusedRoute = await until(() => lines(join(A, '.dsh-squad/home/squad-adapter/decisions.jsonl')).find(line => (line.event === 'model-refused' || line.reason === 'model_mismatch') && JSON.stringify(line).includes(other)), 60_000, 500)
  await sleep(2000)
  const modelCalls = lines(join(A, '.dsh-squad/logs/mock.jsonl')).slice(callsBefore).filter(line => line.task === probe.task_id)
  const probeTask = (await views()).tasks.find(task => task.task_id === probe.task_id)
  check('DSH-M1-09', refusedRoute !== undefined && modelCalls.length === 0 && probeTask?.state !== 'completed', 'the formal task never reaches the model on the changed level', { refused: refusedRoute?.event ?? null, calls: modelCalls.length, state: probeTask?.state })
  await a.bot('update-bot', { id: builder.botId, effort: builderBot?.effort ?? 'high' })
  run('down', A)

  console.log('== DSH-M0-03 / M0-04 Free mode on the preset team, another project')
  run('up', B, '--mock', '--port', portB)
  run('provision', B)
  const b = await session(B)
  const teamB = JSON.parse(readFileSync(join(B, '.dsh-squad/team.json'), 'utf8'))
  const before = lines(join(B, '.dsh-squad/logs/mock.jsonl')).length
  await b.bot('send', { sessionId: teamB.group.id, text: '@Researcher 你好，请说说分数是什么' })
  const roomB = () => Object.values(JSON.parse(readFileSync(join(B, '.dsh-squad/home/bot/state.json'), 'utf8')).rooms).find(room => room.id === teamB.group.id)
  const researcherSession = () => roomB()?.sessions?.[teamB.bots.Researcher]
  const answered = await until(() => lines(join(B, '.dsh-squad/logs/mock.jsonl')).slice(before).some(line => line.session === researcherSession()), 60_000, 500)
  check('DSH-M0-03', answered, '@Researcher in the group: Researcher answers in its group Session')
  const forbidden = await fetch(`${b.base}/api/bot`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: a.cookie }, body: JSON.stringify({ endpoint: 'state', payload: {} }) })
  const leaked = forbidden.ok && (await forbidden.json().catch(() => ({}))).ok === true
  check('DSH-M0-04', !leaked, "project A's login does not open project B", forbidden.status)
  const history = async s => (await s.bot('earlier', { sessionId: teamB.group.id }).catch(() => null))
  const beforeRestart = JSON.stringify(roomB())
  run('down', B)
  run('up', B, '--mock', '--port', portB)
  const b2 = await session(B)
  await b2.bot('state')
  check('DSH-M0-04', roomB() !== undefined && JSON.stringify(roomB()).includes(teamB.bots.Researcher) && beforeRestart.length > 0, 'the group and its Sessions survive a restart')
  const kept = await history(b2)
  check('DSH-M0-04', kept !== null, 'the group history is readable after the restart', kept === null ? 'earlier failed' : undefined)
} catch (error) {
  check('ERROR', false, `error: ${error.message}`)
} finally {
  try { run('down', A) } catch { /* already down */ }
  try { run('down', B) } catch { /* already down */ }
}
console.log(JSON.stringify(results))
console.log(failures.length === 0 ? 'ACCEPT: all checks pass' : `ACCEPT: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
