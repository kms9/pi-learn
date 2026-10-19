// M1 end-to-end on the mock model: the real Go Controller (dsh_squad/controller) and a
// DSH host with the patched ds-bot and the Squad adapter (dsh_squad/adapter), talking
// squad/3. The model is probes/squad-mock.mjs in front of ds-bot's mock, so Squad task
// turns call the task tools. The driver sets everything up itself:
//
//   node probes/drive-m1.mjs m1 3301 8911 [case ...]
//
// 1. writes a test project in probes/.run/<name>-project (roles builder and reviewer,
//    Team math), builds and starts the Controller on it;
// 2. starts the bench (SQUAD=1 SQUAD_MOCK=1 DSH_SQUAD_PROJECT=<project>) with a reset;
// 3. creates Builder and Reviewer, manages their chats as Controller runtimes;
// 4. runs the cases, then stops the bench and the Controller.
//
// Writes probes/scenarios-m1/<id>.{jsonl,meta.json,adapter.jsonl}.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PROBES, expect, lines, openBench, sleep, until } from './lib.mjs'

const [name, port, mockPort, ...only] = process.argv.slice(2)
if (!name || !port || !mockPort) {
  console.error('usage: node probes/drive-m1.mjs <bench-name> <web-port> <mock-port> [case ...]')
  process.exit(2)
}
const REPO = dirname(PROBES)
const OUT = join(PROBES, 'scenarios-m1')
const PROJECT = join(PROBES, '.run', `${name}-project`)
const CONTROLLER_BIN = join(REPO, 'dsh_squad', '.build', 'controller')

// ---- the project and the Controller -------------------------------------------------
function writeProject() {
  rmSync(PROJECT, { recursive: true, force: true })
  const base = join(PROJECT, '.agents', 'dshsquad')
  const file = (path, body) => { mkdirSync(dirname(join(base, path)), { recursive: true }); writeFileSync(join(base, path), body) }
  for (const role of ['builder', 'reviewer']) {
    file(`roles/${role}/role.md`, `---\nname: ${role}\ndescription: the ${role} of the math team\n---\nYou are the ${role}.\n`)
    file(`roles/${role}/agents.md`, 'Work carefully and submit with squad_submit_result.\n')
  }
  file('teams/math/team.json', `${JSON.stringify({
    schema_version: 1, team_id: 'math', config_version: 1, leader: { agent_ref: 'chief' },
    members: [{ role_ref: 'builder', responsibility: 'build' }, { role_ref: 'reviewer', responsibility: 'review' }],
    instructions_file: 'instructions.md',
    policy: { run_admission: 'fifo_single_active', max_parallel_tasks: 2, max_delegate_depth: 2, max_total_tasks: 12, max_attempts_per_task: 3, allowed_tools: ['read'], writable_roots: [], acceptance_policy: { mode: 'review', reviewer_ref: 'reviewer', child_policy: 'separate' } },
  }, null, 2)}\n`)
  file('teams/math/instructions.md', 'Teach one math idea clearly.\n')
}

let controller
function startController() {
  execFileSync('go', ['build', '-o', CONTROLLER_BIN, './cmd/controller'], { cwd: join(REPO, 'dsh_squad', 'controller'), stdio: 'inherit' })
  const log = join(PROBES, '.run', `${name}-controller.log`)
  writeFileSync(log, '')
  controller = spawn(CONTROLLER_BIN, ['serve', '--project-root', PROJECT, '--lease-ttl', '60s'], { stdio: ['ignore', 'ignore', 'pipe'] })
  controller.stderr.on('data', chunk => writeFileSync(log, chunk, { flag: 'a' }))
}
const discovery = () => JSON.parse(readFileSync(join(PROJECT, '.agents/dshsquad/.runtime/controller.json'), 'utf8'))
const operatorToken = () => readFileSync(join(PROJECT, '.agents/dshsquad/.runtime/operator.token'), 'utf8').trim()
async function ctl(method, path, body) {
  const d = discovery()
  const response = await fetch(`${d.endpoint}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${operatorToken()}`, 'x-squad-protocol': 'squad/3', 'x-squad-controller': d.controller_id },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const out = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(out)}`)
  return out
}
const snapshot = () => ctl('GET', '/v2/snapshot')
const taskOf = id => ctl('GET', `/v2/tasks/${id}`)
const attemptOf = id => ctl('GET', `/v2/attempts/${id}`)
const reconcile = (attempt, note) => ctl('POST', `/v2/attempts/${attempt.attempt_id}/reconcile`, { request_id: `reconcile-${attempt.attempt_id}`, expected_revision: attempt.revision, expected_runtime: attempt.target.runtime_id, note, confirm_stopped: true })
let requestSeq = 0
const createTask = (target, goal, requestId = `m1-${Date.now().toString(36)}-${++requestSeq}`) =>
  ctl('POST', '/v2/tasks/direct', { request_id: requestId, target, kind: 'execute', goal, write_set: [], dependencies: [], refs: [] })
const waitTask = (id, states, timeout = 90_000) => until(async () => {
  const t = await taskOf(id)
  return states.includes(t.state) ? t : undefined
}, timeout, 500)

writeProject()
startController()
if (await until(() => existsSync(join(PROJECT, '.agents/dshsquad/.runtime/controller.json')), 30_000) === undefined) throw new Error('the Controller did not publish its discovery file')
Object.assign(process.env, { SQUAD: '1', SQUAD_MOCK: '1', DSH_SQUAD_PROJECT: PROJECT })
process.env.MOCK_DELAY_MS ??= '300'

const b = openBench({ name, port, mockPort, out: OUT, only })
const { home, login, api, gate, decisions, state, botNamed, send, settle, bench } = b
console.log(bench('reset'))
const squadCalls = () => lines(join(home, 'mock.jsonl')).filter(line => line.squad === true)
const mockCallsOf = sessionId => lines(join(home, 'mock.jsonl')).filter(line => line.session === sessionId)
const since = ts => decisions().filter(line => line.ts >= ts)
const chatOf = botName => botNamed(botName).sessionId ?? botNamed(botName).id

async function scenario(id, title, run) {
  const result = await b.scenario(id, title, run)
  if (result === undefined) return
  const meta = JSON.parse(readFileSync(join(OUT, `${id}.meta.json`), 'utf8'))
  const window = decisions().filter(line => line.ts >= meta.startTs && line.ts <= meta.endTs)
  writeFileSync(join(OUT, `${id}.adapter.jsonl`), window.map(line => JSON.stringify(line)).join('\n') + '\n')
}

try {
  await login()

  await scenario('M1-setup', 'Builder and Reviewer are managed and registered as Controller runtimes', async (act) => {
    const refs = ((await api('state')).models ?? []).map(model => model.ref)
    const flash = refs.find(ref => ref.endsWith('/deepseek-flash'))
    const chief = Object.values(state().bots)[0]
    await api('update-bot', { id: chief.id, model: flash })
    for (const [botName, role] of [['Builder', 'Engineer'], ['Reviewer', 'Review']]) await api('create-bot', { name: botName, role, instructions: `You are the team's ${role}.`, model: flash })
    await settle()
    const frozen = { provider: flash.split('/')[0], model: flash.split('/').slice(1).join('/') }
    act('manage Builder and Reviewer chats as builder-bot and reviewer-bot')
    await gate('manage', { botId: botNamed('Builder').id, agentId: 'builder-bot', roleId: 'builder', frozen })
    await gate('manage', { botId: botNamed('Reviewer').id, agentId: 'reviewer-bot', roleId: 'reviewer', frozen })
    const online = await until(async () => {
      const agents = (await snapshot()).views.agents ?? []
      const ours = agents.filter(agent => ['builder-bot', 'reviewer-bot'].includes(agent.binding?.agent_id) && agent.presence === 'online')
      return ours.length === 2 ? ours : undefined
    }, 30_000, 500)
    act('registered', { agents: (online ?? []).map(agent => ({ id: agent.binding.agent_id, host: agent.host, epoch: agent.binding.binding_epoch })) })
    return [expect(online, 'Builder and Reviewer did not come online at the Controller'),
      expect(online?.every(agent => agent.host?.profile === 'dsh/0.2.1-rc.2+ds-bot/e13bc34' && agent.host?.place === 'chat'), 'host binding missing')].filter(Boolean)
  })

  await scenario('M1-formal', 'DSH-M1-01: a formal Task runs from dispatch to settled with the full receipt chain', async (act) => {
    const t = await createTask('builder-bot', '解释什么是分数')
    act('operator creates a direct Task for builder-bot', { taskId: t.task_id })
    const done = await waitTask(t.task_id, ['completed', 'needs_review', 'interrupted', 'failed'])
    const attemptId = done?.attempt_ids?.at(-1)
    const attempt = attemptId ? await attemptOf(attemptId) : undefined
    const local = (await gate('state')).attempts[attemptId]
    const calls = squadCalls().filter(call => call.task === t.task_id)
    act('after', { state: done?.state, result: done?.result?.value ?? null, receipt: attempt?.receipt, attemptState: attempt?.state, verdict: local?.verdict?.verdict, contextHash: local?.contextHash, receipts: local?.receipts, tools: calls.map(call => call.tool) })
    return [expect(done?.state === 'completed', `task ended ${done?.state}`),
      expect(done?.result?.value?.answer?.includes('分数'), 'result value missing'),
      expect(attempt?.receipt === 'input_observed', `receipt chain stopped at ${attempt?.receipt}`),
      expect(local?.verdict?.verdict === 'settled_completed', `adapter verdict ${local?.verdict?.verdict}`),
      expect(typeof local?.contextHash === 'string', 'no task context hash'),
      expect(calls.some(call => call.tool === 'squad_submit_result'), 'the model never submitted')].filter(Boolean)
  })

  await scenario('M1-duplicate', 'DSH-M1-02: the same request_id twice makes one Task and one Attempt', async (act) => {
    const requestId = `m1-dup-${Date.now().toString(36)}`
    const [first, second] = [await createTask('builder-bot', '重复请求测试', requestId), await createTask('builder-bot', '重复请求测试', requestId)]
    act('create twice', { first: first.task_id, second: second.task_id })
    const done = await waitTask(first.task_id, ['completed', 'needs_review', 'interrupted', 'failed'])
    const tasks = ((await snapshot()).views.tasks ?? []).filter(task => task.source?.input_id === requestId)
    act('after', { state: done?.state, attempts: done?.attempt_ids?.length, tasks: tasks.length })
    return [expect(first.task_id === second.task_id, 'a second Task was made'), expect(tasks.length === 1, `${tasks.length} Tasks for one request`),
      expect(done?.attempt_ids?.length === 1, `${done?.attempt_ids?.length} attempts`), expect(done?.state === 'completed', `task ended ${done?.state}`)].filter(Boolean)
  })

  await scenario('M1-guard', 'DSH-M1-08: a tool outside the contract (bash) is refused inside the attempt', async (act) => {
    const ts = new Date().toISOString()
    const t = await createTask('builder-bot', '用bash 列出文件后汇报')
    const done = await waitTask(t.task_id, ['completed', 'needs_review', 'interrupted', 'failed'])
    const refused = since(ts).filter(line => line.event === 'tool-guard' && line.tool === 'bash')
    act('after', { state: done?.state, refused: refused.length })
    return [expect(refused.length > 0, 'bash was not refused'), expect(done?.state === 'completed', `task ended ${done?.state}`)].filter(Boolean)
  })

  await scenario('M1-no-result', 'DSH-M1-06 / M2-05: a turn that says "done" without submitting does not complete', async (act) => {
    const t = await createTask('builder-bot', '不提交 只说完成')
    const done = await waitTask(t.task_id, ['completed', 'needs_review', 'interrupted', 'failed'])
    const attempt = done?.attempt_ids?.length ? await attemptOf(done.attempt_ids.at(-1)) : undefined
    act('after', { state: done?.state, attemptState: attempt?.state, error: attempt?.error })
    // needs_review keeps builder-bot reserved until an operator attests the stop.
    if (attempt !== undefined) await reconcile(attempt, 'test: the turn ended without a result')
    return [expect(done?.state === 'needs_review', `task ended ${done?.state}`), expect(attempt?.error === 'RESULT_MISSING', `attempt error ${attempt?.error}`)].filter(Boolean)
  })

  await scenario('M1-held', 'DSH-M1-03: a user message into a managed chat is held and kept by the Controller', async (act) => {
    const ts = new Date().toISOString()
    const before = mockCallsOf(chatOf('Builder')).length
    await send(chatOf('Builder'), '你好，在吗')
    await settle()
    const held = await until(async () => {
      const rows = (await snapshot()).views.held_inputs ?? []
      return rows.find(row => row.binding?.agent_id === 'builder-bot' && row.held_at >= ts && row.wake === 'user')
    }, 20_000, 500)
    const calls = mockCallsOf(chatOf('Builder')).length - before
    act('after', { held: held ?? null, modelCalls: calls })
    return [expect(held, 'the Controller has no held input'), expect(calls === 0, `Builder reached the model ${calls} time(s)`)].filter(Boolean)
  })

  await scenario('M1-restart', 'DSH-M1-05: a host restart mid-attempt is reported, not replayed', async (act) => {
    const t = await createTask('builder-bot', '慢 12 长一点的任务')
    const attemptId = (await until(async () => {
      const local = Object.entries((await gate('state')).attempts).find(([, attempt]) => attempt.taskId === t.task_id && attempt.verdict?.verdict === 'running')
      return local?.[0]
    }, 30_000, 300))
    act('attempt running; restart the web host', { attemptId })
    bench('restart-web')
    await login()
    const restartedAt = new Date().toISOString()
    const done = await waitTask(t.task_id, ['completed', 'needs_review', 'interrupted', 'failed'], 60_000)
    await sleep(15_000)
    const attempt = attemptId ? await attemptOf(attemptId) : undefined
    const replays = squadCalls().filter(call => call.task === t.task_id && call.t >= restartedAt)
    act('after', { state: done?.state, attemptState: attempt?.state, error: attempt?.error, replays: replays.length })
    return [expect(done?.state === 'interrupted', `task ended ${done?.state}`), expect(attempt?.error === 'host_restart', `attempt error ${attempt?.error}`), expect(replays.length === 0, `${replays.length} model call(s) after the restart`)].filter(Boolean)
  })
} finally {
  console.log(bench('stop'))
  controller?.kill('SIGTERM')
  console.log('done')
}
