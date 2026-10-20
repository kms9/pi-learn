// M2 on the mock model: a whole Team Run of the math courseware case (D11) through the
// one-command pair (dsh_squad/deploy/dsh-squad), the adapter and the real Controller.
//
//   node probes/drive-m2.mjs [port]
//
// The project is dsh_squad/cases/math copied to probes/.run/m2-project; for the test the
// build step's goal asks the mock to make a first draft the reviewer rejects (首版请退回),
// so the Run goes through review → rejection → the Leader's rework → re-review. Checks:
//   DSH-M2-01  the workflow runs in dependency order (research, build, check)
//   DSH-M2-02  the builder's lesson.html is a Controller artifact, reviewed by another Bot
//   DSH-M2-03  rejected → rework → re-review, the rejected version kept
//   DSH-M2-07  the page is served with a sandbox CSP and no network
//   and the Run ends completed through the Leader and the final gate.
import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROBES, lines, until } from './lib.mjs'

const port = process.argv[2] ?? '3430'
const REPO = join(PROBES, '..')
const PROJECT = join(PROBES, '.run', 'm2-project')
const CLI = join(REPO, 'dsh_squad', 'deploy', 'dsh-squad')
const run = (...args) => execFileSync(CLI, args, { encoding: 'utf8' })
const failures = []
const check = (ok, what, detail) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} ${what}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`); if (!ok) failures.push(what) }

rmSync(PROJECT, { recursive: true, force: true })
cpSync(join(REPO, 'dsh_squad', 'cases', 'math', '.agents'), join(PROJECT, '.agents'), { recursive: true })
const workflowPath = join(PROJECT, '.agents/dshsquad/teams/math/workflows/lesson.json')
const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'))
workflow.steps.find(step => step.id === 'build').goal += '（测试：首版请退回）'
writeFileSync(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`)

const runtimeDir = join(PROJECT, '.agents/dshsquad/.runtime')
const discovery = () => JSON.parse(readFileSync(join(runtimeDir, 'controller.json'), 'utf8'))
async function ctl(method, path, body) {
  const d = discovery()
  const response = await fetch(`${d.endpoint}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${readFileSync(join(runtimeDir, 'operator.token'), 'utf8').trim()}`, 'x-squad-protocol': 'squad/3', 'x-squad-controller': d.controller_id },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let out
  try { out = JSON.parse(text) } catch { out = text }
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 300)}`)
  return { out, headers: response.headers }
}
async function hostSession() {
  const login = readFileSync(join(PROJECT, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)
  const base = new URL(login).origin
  const cookie = (await fetch(login, { redirect: 'manual' })).headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
  return async (route, endpoint, payload = {}) => {
    const out = await (await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint, payload }) })).json()
    if (!out.ok) throw new Error(`${endpoint}: ${out.error?.message}`)
    return out.value
  }
}

try {
  console.log('== M2-setup the pair, and Team math bound to its group')
  run('up', PROJECT, '--mock', '--port', port)
  const host = await hostSession()
  await host('/api/bot', 'state')
  const bound = await host('/api/squad-adapter', 'bind-team', { teamId: 'math' })
  check(bound.members.length === 5 && bound.members.filter(member => member.leader).length === 1, 'Leader and four roles bound in one group', bound)
  const online = await until(async () => {
    const agents = (await ctl('GET', '/v2/snapshot')).out.views.agents ?? []
    return agents.filter(agent => agent.presence === 'online').length >= 5 ? agents : undefined
  }, 60_000, 500)
  check(online !== undefined, 'five runtimes online at the Controller')

  console.log('== M2-run a lesson Run from start to delivery')
  const created = (await ctl('POST', '/v2/runs', { request_id: `m2-${Date.now().toString(36)}`, team_id: 'math', goal: '认识分数：分数的意义与读写（五年级）' })).out
  // The user speaks in the Team's group during the Run (M2-2): held from the managed
  // Sessions, then Run Guidance at the Controller, once.
  const advice = '例子请用切披萨来讲'
  await host('/api/bot', 'send', { sessionId: bound.roomId, text: advice })
  // The check ran on the first draft; once that draft is reworked the check is built on
  // a replaced version (Q41) and the person redoes it with the new one, as from the page.
  let redone = null
  const finished = await until(async () => {
    const r = (await ctl('GET', `/v2/runs/${created.run_id}`)).out
    if (redone === null) {
      const all = ((await ctl('GET', '/v2/snapshot')).out.views.tasks ?? []).filter(task => task.run_id === created.run_id)
      const replaced = new Set(all.filter(task => task.superseded_by).map(task => task.task_id))
      const stale = all.find(task => task.state === 'completed' && task.kind === 'execute' && !task.superseded_by && task.acceptance?.decision !== 'rejected' && (task.dependencies ?? []).some(dep => replaced.has(dep.task_id)))
      if (stale) {
        await ctl('POST', `/v2/tasks/${stale.task_id}/rebase`, { request_id: `m2-rebase-${Date.now()}`, expected_revision: stale.revision, note: 'drive-m2: redo with the new version' })
        redone = stale.task_id
      }
    }
    return ['completed', 'failed', 'cancelled', 'interrupted'].includes(r.phase) ? r : undefined
  }, 600_000, 1000)
  const tasks = ((await ctl('GET', '/v2/snapshot')).out.views.tasks ?? []).filter(task => task.run_id === created.run_id)
  const byGoal = text => tasks.filter(task => task.kind !== 'leader_step' && task.kind !== 'review' && task.goal.includes(text))
  const [research] = byGoal('梳理')
  const [build] = byGoal('制作一页 HTML 课件')
  const checkTask = byGoal('检查课件').find(task => task.kind === 'execute')
  const rework = tasks.find(task => task.kind === 'rework')
  const reviews = tasks.filter(task => task.kind === 'review')
  check(finished?.phase === 'completed', 'the Run completed', { phase: finished?.phase, blockers: finished?.blockers, states: tasks.map(task => `${task.kind}:${task.state}:${task.acceptance?.decision ?? '-'}`) })
  const startOf = task => task?.attempt_ids?.length ? task : undefined
  check(research?.acceptance?.decision === 'accepted' && startOf(build) && startOf(checkTask), 'research, build and check all ran (DSH-M2-01)')
  check(build?.acceptance?.decision === 'rejected' && build?.superseded_by === rework?.task_id, 'the first build was rejected and superseded by the rework, not overwritten (DSH-M2-03)', { build: build?.acceptance, superseded: build?.superseded_by })
  check(rework?.acceptance?.decision === 'accepted' && reviews.some(review => review.dependencies?.some(dep => dep.task_id === rework.task_id)), 'the rework was re-reviewed and accepted (DSH-M2-03)')
  const art = rework?.result?.artifacts?.[0]
  check(art?.name === 'lesson.html' && art?.path === `artifact:sha256/${art?.sha256}`, 'the accepted courseware is a Controller artifact (DSH-M2-02)', rework?.result?.artifacts)
  const reviewerOf = task => reviews.find(review => review.dependencies?.some(dep => dep.task_id === task?.task_id))?.result?.agent_id
  check(reviewerOf(rework) !== undefined && reviewerOf(rework) !== rework?.result?.agent_id, 'reviewed by a different Bot than the author (DSH-M2-02)', { author: rework?.result?.agent_id, reviewer: reviewerOf(rework) })
  if (art !== undefined) {
    const page = await ctl('GET', `/v2/artifacts/sha256/${art.sha256}`)
    const csp = page.headers.get('content-security-policy') ?? ''
    check(String(page.out).includes('认识分数') && /sandbox/.test(csp) && /default-src 'none'/.test(csp), 'the page is served sandboxed, with no network (DSH-M2-07)', csp)
  }
  check((finished?.guidance ?? []).filter(text => text.includes(advice)).length === 1, 'the group message became Run Guidance once (M2-2)', finished?.guidance)
  const held = ((await ctl('GET', '/v2/snapshot')).out.views.held_inputs ?? []).filter(row => (row.text ?? '').includes(advice))
  check(held.length >= 1 && held.every(row => row.disposition === `guidance:${created.run_id}`), 'every held copy is marked as guidance for this Run', held.map(row => row.disposition))
  const redo = tasks.find(task => task.rework_of === redone)
  check(redone !== null && redo?.acceptance?.decision === 'accepted' && (redo.dependencies ?? []).every(dep => !tasks.find(task => task.task_id === dep.task_id)?.superseded_by), 'the check built on the first draft was redone with the reworked build (Q41)', { redone, redo: redo && { state: redo.state, acceptance: redo.acceptance?.decision } })
  const leaderSteps = tasks.filter(task => task.kind === 'leader_step')
  check(leaderSteps.every(task => task.state === 'completed'), 'every Leader step settled', leaderSteps.map(task => task.state))
  const squad = lines(join(PROJECT, '.dsh-squad/logs/mock.jsonl')).filter(line => line.squad)
  console.log(`   (model calls in Squad turns: ${squad.length}; tasks ${tasks.length}, reviews ${reviews.length}, Leader steps ${leaderSteps.length})`)
} catch (error) {
  check(false, `error: ${error.message}`)
} finally {
  run('down', PROJECT)
}
console.log(failures.length === 0 ? 'M2: all checks pass' : `M2: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
