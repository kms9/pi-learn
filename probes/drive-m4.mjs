// M4 end to end on the mock model (M4-4): three Teams on one pair, through the page's
// host routes, then a Controller crash recovered from the page.
//
//   node probes/drive-m4.mjs [port]
//
// Project: dsh_squad/cases/m4 copied to probes/.run/m4-project.
//   DSH-M4-01  A and B share the reviewer, C stands apart: C starts with A, B waits
//              for the reviewer (atomic, FIFO) and starts after A; the same reviewer
//              Bot reviews in each Team's own group runtime.
//   DSH-M4-02  C has room for one execution: its maker delegates a child, yields, and
//              continues in the same attempt (segment 2) after the child reports back.
//   DSH-M4-03  the Controller is killed while a task runs: the restart holds it, the
//              result that arrives late is refused and kept, the page confirms the
//              stop and retries, and the task completes.
import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { PROBES, until } from './lib.mjs'

const port = process.argv[2] ?? '3470'
const REPO = join(PROBES, '..')
const PROJECT = join(PROBES, '.run', 'm4-project')
const CLI = join(REPO, 'dsh_squad', 'deploy', 'dsh-squad')
const run = (...args) => execFileSync(CLI, args, { encoding: 'utf8' })
const failures = []
const check = (ok, what, detail) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} ${what}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`); if (!ok) failures.push(what) }
const TERMINAL = ['completed', 'failed', 'cancelled', 'interrupted']

rmSync(PROJECT, { recursive: true, force: true })
cpSync(join(REPO, 'dsh_squad', 'cases', 'm4', '.agents'), join(PROJECT, '.agents'), { recursive: true })

async function session() {
  const login = readFileSync(join(PROJECT, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)
  const base = new URL(login).origin
  const cookie = (await fetch(login, { redirect: 'manual' })).headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
  const call = route => async (endpoint, payload = {}) => {
    const out = await (await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint, payload }) })).json()
    if (!out.ok) throw new Error(`${endpoint}: ${out.error?.message}`)
    return out.value
  }
  const squad = call('/api/squad-adapter')
  return { ui: (endpoint, payload) => squad(`ui/${endpoint}`, payload), bot: call('/api/bot') }
}
const views = async ui => (await ui('view')).snapshot.views

try {
  run('up', PROJECT, '--mock', '--port', port)
  const { ui, bot } = await session()
  await bot('state')

  console.log('== M4-teams three Teams bound to three groups')
  const bound = {}
  for (const team of ['team-a', 'team-b', 'team-c']) bound[team] = await ui('bind-team', { teamId: team })
  const reviewerBot = team => bound[team].members.find(member => member.agentId === `${team}-reviewer`)?.botId
  check(reviewerBot('team-a') !== undefined && reviewerBot('team-a') === reviewerBot('team-b') && bound['team-a'].roomId !== bound['team-b'].roomId, 'one Reviewer Bot in two Teams’ groups')
  const online = await until(async () => ((await views(ui)).agents ?? []).filter(agent => agent.presence === 'online').length >= 9, 60_000, 500)
  check(online, 'nine runtimes online (three Leaders, six role places)')

  console.log('== M4-01 shared reviewer: atomic FIFO admission (DSH-M4-01)')
  const runs = {}
  for (const team of ['team-a', 'team-b', 'team-c']) runs[team] = await ui('start-run', { requestId: `m4-${team}-${Date.now().toString(36)}`, teamId: team, goal: `${team} 的任务` })
  await until(async () => (await views(ui)).runs.filter(r => r.admitted).length >= 2, 30_000, 300)
  let state = await views(ui)
  const r = id => state.runs.find(candidate => candidate.run_id === runs[id].run_id)
  check(r('team-a').admitted && r('team-c').admitted, 'A and C start at once')
  check(!r('team-b').admitted && r('team-b').waiting_roles?.[0]?.role_id === 'reviewer' && r('team-b').waiting_roles?.[0]?.owner_run_id === runs['team-a'].run_id, 'B waits for the reviewer A holds', r('team-b'))
  const done = await until(async () => {
    state = await views(ui)
    return ['team-a', 'team-b', 'team-c'].every(team => TERMINAL.includes(r(team).phase)) ? state : undefined
  }, 600_000, 1000)
  check(done !== undefined && ['team-a', 'team-b', 'team-c'].every(team => r(team).phase === 'completed'), 'all three Runs complete', ['team-a', 'team-b', 'team-c'].map(team => r(team)?.phase))
  const events = state.events ?? []
  const seqOf = (type, id) => events.filter(event => event.type === type && event.entity_id === id).map(event => event.seq)
  const aEnd = Math.max(...seqOf('leader_decision', runs['team-a'].run_id), 0)
  const bStart = Math.min(...seqOf('run_admitted', runs['team-b'].run_id), Infinity)
  check(aEnd > 0 && bStart > aEnd, 'B started only after A finished', { aEnd, bStart })
  const reviewOf = team => state.tasks.find(task => task.run_id === runs[team].run_id && task.kind === 'review')?.result?.agent_id
  check(reviewOf('team-a') === 'team-a-reviewer' && reviewOf('team-b') === 'team-b-reviewer', 'the reviewer reviewed in each Team’s own runtime', { a: reviewOf('team-a'), b: reviewOf('team-b') })

  console.log('== M4-02 capacity 1: child, yield, same attempt (DSH-M4-02)')
  const cTasks = state.tasks.filter(task => task.run_id === runs['team-c'].run_id)
  const parent = cTasks.find(task => task.kind === 'execute' && !task.parent_id)
  const child = cTasks.find(task => task.parent_id === parent?.task_id)
  const parentAttempts = (parent?.attempt_ids ?? []).map(id => state.attempts.find(attempt => attempt.attempt_id === id))
  check(child?.state === 'completed' && child.role_id === 'auditor', 'the maker delegated a child to the auditor, and it completed', child && { state: child.state, role: child.role_id })
  check(parent?.state === 'completed' && parentAttempts.length === 1 && parentAttempts[0]?.segment_id === 2, 'the parent completed in one attempt, on its second segment', { attempts: parentAttempts.length, segment: parentAttempts[0]?.segment_id })

  console.log('== M4-03 the Controller dies mid-task; the page recovers it (DSH-M4-03)')
  const task = await (async () => {
    const d = JSON.parse(readFileSync(join(PROJECT, '.agents/dshsquad/.runtime/controller.json'), 'utf8'))
    const token = readFileSync(join(PROJECT, '.agents/dshsquad/.runtime/operator.token'), 'utf8').trim()
    const response = await fetch(`${d.endpoint}/v2/tasks/direct`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-squad-protocol': 'squad/3', 'x-squad-controller': d.controller_id }, body: JSON.stringify({ request_id: `m4-crash-${Date.now()}`, target: 'team-a-author', kind: 'execute', goal: '慢 12 恢复测试：写一段讲义', write_set: [], dependencies: [], refs: [] }) })
    return response.json()
  })()
  const running = await until(async () => ((await views(ui)).tasks.find(t => t.task_id === task.task_id)?.state === 'running'), 60_000, 300)
  check(running, 'the direct task is running')
  execFileSync('sh', ['-c', `kill -KILL -$(cat '${join(PROJECT, '.dsh-squad/run/controller.pid')}')`])
  await new Promise(done => setTimeout(done, 1000))
  run('up', PROJECT, '--mock', '--port', port)
  const held = await until(async () => {
    try {
      const v = await views(ui)
      const t = v.tasks.find(candidate => candidate.task_id === task.task_id)
      return t?.state === 'needs_review' ? v : undefined
    } catch { return undefined }
  }, 60_000, 500)
  check(held !== undefined, 'after the restart the task is held for review')
  // The Bot finishes its turn (the mock waits 12 s) and its result reaches the new Controller.
  const late = await until(async () => {
    const v = await views(ui)
    const attempt = v.attempts.find(candidate => candidate.task_id === task.task_id)
    return (v.evidence ?? []).find(row => row.attempt_id === attempt?.attempt_id && row.disposition === 'rejected_late_or_stale')
  }, 60_000, 1000)
  check(late !== undefined, 'the result that arrived late was refused and kept as evidence')
  let v = await views(ui)
  const attempt = v.attempts.find(candidate => candidate.task_id === task.task_id)
  await ui('operate', { kind: 'attempt', id: attempt.attempt_id, op: 'reconcile', body: { request_id: `rec-${Date.now()}`, expected_revision: attempt.revision, expected_runtime: attempt.target.runtime_id, note: 'drive-m4: the host was checked', confirm_stopped: true } })
  v = await views(ui)
  const t = v.tasks.find(candidate => candidate.task_id === task.task_id)
  await ui('operate', { kind: 'task', id: t.task_id, op: 'retry', body: { request_id: `retry-${Date.now()}`, expected_revision: t.revision, rebind_current: true, note: 'drive-m4: retry after the crash' } })
  const recovered = await until(async () => {
    const current = (await views(ui)).tasks.find(candidate => candidate.task_id === task.task_id)
    return TERMINAL.includes(current?.state) ? current : undefined
  }, 120_000, 1000)
  check(recovered?.state === 'completed' && recovered.attempt_ids.length === 2, 'confirmed stopped, retried, and completed on a second attempt', recovered && { state: recovered.state, attempts: recovered.attempt_ids.length })
} catch (error) {
  check(false, `error: ${error.message}`)
} finally {
  run('down', PROJECT)
}
console.log(failures.length === 0 ? 'M4: all checks pass' : `M4: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
