// Comparison experiment (M3-3): the same task done four ways, each in a fresh project
// directory, so no group inherits another's Bots, memory or results (D12).
//
//   node dsh_squad/experiments/run.mjs [--mock] [--groups S,A,B,C] [--repeats N]
//        [--goal "..."] [--publish <project>] [--port 3500]
//
//   S  one strong agent: the goal sent to the Main Bot's own chat
//   A  DS Bot free collaboration: the preset team, the goal posted in its group
//   B  Squad task DAG, no review: the math case with acceptance on_completion
//   C  Squad DAG with independent review: the math case as it is
//   (D, C plus advanced resource scheduling, comes after M4.)
//
// One model for every group (D7): the mock, or DeepSeek deepseek-flash with effort high
// from DEEPSEEK_API_KEY. Cost is DS Bot's own usage ledger, auxiliary calls (memory,
// summaries, handoff notes) included and counted apart. Writes a dsh-squad-experiment/1
// report to dsh_squad/experiments/reports/ and, with --publish, into that project's
// .dsh-squad/reports/ where the Squad page shows it.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SQUAD = dirname(HERE)
const CLI = join(SQUAD, 'deploy', 'dsh-squad')
const args = process.argv.slice(2)
const option = (name, fallback) => { const index = args.indexOf(`--${name}`); return index === -1 ? fallback : args[index + 1] }
const mock = args.includes('--mock') || !process.env.DEEPSEEK_API_KEY
const groups = option('groups', 'S,A,B,C').split(',').map(group => group.trim().toUpperCase()).filter(Boolean)
const repeats = Math.max(1, Number(option('repeats', '1')))
const goal = option('goal', '认识分数：分数的意义与读写（五年级），做一页可交互的 HTML 课件并说明教学要点')
const publish = option('publish', undefined)
const basePort = Number(option('port', '3500'))
const RUNS = join(HERE, '.runs')
const sleep = ms => new Promise(done => setTimeout(done, ms))

async function host(project) {
  const login = readFileSync(join(project, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)
  const base = new URL(login).origin
  const cookie = (await fetch(login, { redirect: 'manual' })).headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
  const post = route => async (endpoint, payload = {}) => {
    const out = await (await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint, payload }) })).json()
    if (!out.ok) throw new Error(`${endpoint}: ${out.error?.message}`)
    return out.value
  }
  return { bot: post('/api/bot'), squad: post('/api/squad-adapter') }
}

// Usage from DS Bot's ledger: [hour, owner, model, kind, input, cacheRead, cacheWrite, output, calls].
function usageOf(view) {
  const total = { input: 0, cache_read: 0, cache_write: 0, output: 0, calls: 0, auxiliary_calls: 0, auxiliary_tokens: 0 }
  for (const row of view?.rows ?? []) {
    const kind = view.kinds[row[3]]
    const tokens = row[4] + row[5] + row[6] + row[7]
    total.input += row[4]; total.cache_read += row[5]; total.cache_write += row[6]; total.output += row[7]; total.calls += row[8]
    if (kind !== 'chat' && kind !== 'group') { total.auxiliary_calls += row[8]; total.auxiliary_tokens += tokens }
  }
  total.total = total.input + total.cache_read + total.cache_write + total.output
  return total
}

// Free modes have no end signal: the team is done when nothing moves for a while.
async function quiet(api, { quietMs = 8000, timeoutMs = 600_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  let since = Date.now()
  while (Date.now() < deadline) {
    await sleep(1000)
    const { activity = {} } = await api('state')
    const usage = usageOf(await api('usage', {}))
    const mark = `${usage.calls}:${Object.keys(activity).length}`
    if (mark !== last || Object.keys(activity).length > 0) { last = mark; since = Date.now() } else if (Date.now() - since >= quietMs) return true
  }
  return false
}

function prepare(group, project) {
  rmSync(project, { recursive: true, force: true })
  mkdirSync(project, { recursive: true })
  if (group === 'B' || group === 'C') {
    cpSync(join(SQUAD, 'cases', 'math', '.agents'), join(project, '.agents'), { recursive: true })
    if (group === 'B') {
      const path = join(project, '.agents/dshsquad/teams/math/team.json')
      const team = JSON.parse(readFileSync(path, 'utf8'))
      team.policy.acceptance_policy = { mode: 'on_completion', child_policy: 'separate' }
      writeFileSync(path, `${JSON.stringify(team, null, 2)}\n`)
    }
  }
}

async function runOnce(group, index, port) {
  const project = join(RUNS, `${group}-${index}`)
  prepare(group, project)
  const cli = (...more) => execFileSync(CLI, [...more, project, ...(mock ? ['--mock'] : []), '--port', String(port)].filter(Boolean), { encoding: 'utf8' })
  const result = { ok: false, seconds: null, model_calls: 0, tokens: null, reviews: 0, reworks: 0, human_actions: 0, outcome: 'not run', note: '' }
  try {
    cli('up')
    const { bot, squad } = await host(project)
    await bot('state')
    if (group === 'A') execFileSync(CLI, ['provision', project], { encoding: 'utf8' })
    await quiet(bot, { quietMs: 4000 })
    const before = usageOf(await bot('usage', {}))
    const started = Date.now()
    const view = await bot('state')
    const bots = Array.isArray(view.bots) ? view.bots : Object.values(view.bots ?? {})
    if (group === 'S') {
      const chief = bots.find(candidate => (view.mainBotIds ?? []).includes(candidate.id))
      await bot('send', { sessionId: chief.sessionId ?? chief.id, text: goal })
      result.ok = await quiet(bot)
      result.outcome = result.ok ? 'answered' : 'timed out'
    } else if (group === 'A') {
      const rooms = Array.isArray(view.rooms) ? view.rooms : Object.values(view.rooms ?? {})
      await bot('send', { sessionId: rooms.find(room => room.name === '小队群').id, text: goal })
      result.ok = await quiet(bot)
      result.outcome = result.ok ? 'the team went quiet' : 'timed out'
    } else {
      const run = await squad('ui/start-run', { requestId: `exp-${group}-${index}-${Date.now()}`, teamId: 'math', goal })
      let final
      for (let i = 0; i < 600 && final === undefined; i += 1) {
        await sleep(1000)
        const snap = (await squad('ui/view')).snapshot
        const current = snap.views.runs.find(candidate => candidate.run_id === run.run_id)
        if (['completed', 'failed', 'cancelled', 'interrupted'].includes(current?.phase)) final = { current, tasks: snap.views.tasks.filter(task => task.run_id === run.run_id) }
      }
      result.ok = final?.current.phase === 'completed'
      result.outcome = final?.current.phase ?? 'timed out'
      result.reviews = final?.tasks.filter(task => task.kind === 'review').length ?? 0
      result.reworks = final?.tasks.filter(task => task.kind === 'rework').length ?? 0
      await quiet(bot, { quietMs: 3000, timeoutMs: 60_000 })
    }
    result.seconds = Math.round((Date.now() - started) / 100) / 10
    const after = usageOf(await bot('usage', {}))
    result.tokens = Object.fromEntries(Object.keys(after).map(key => [key, after[key] - before[key]]))
    result.model_calls = result.tokens.calls
  } catch (error) {
    result.outcome = 'error'
    result.note = String(error.message ?? error).slice(0, 300)
  } finally {
    try { execFileSync(CLI, ['down', project], { encoding: 'utf8' }) } catch { /* already down */ }
  }
  return result
}

const mean = values => (values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length)
const report = {
  schema: 'dsh-squad-experiment/1',
  id: `exp-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  title: '同一任务四种做法的对照',
  created: new Date().toISOString(),
  mock,
  model: mock ? { provider: 'mock', model: 'ds-bot mock + squad mock', effort: null } : { provider: 'deepseek-official', model: 'deepseek-flash', effort: 'high' },
  repeats,
  task: { goal },
  groups: [],
  notes: [
    '每组每次都在全新的项目目录里运行：新的 Bot、新的记忆、新的 Controller 数据（D12）。',
    'Token 和调用次数来自 DS Bot 自己的用量账本，包含记忆、摘要、交接等辅助调用（另列 auxiliary_*）。',
    'S、A 组没有结束信号：以团队安静下来为结束，「成功」只表示有回复，不代表质量；B、C 组以 Run 通过最终关卡为成功。',
    ...(mock ? ['本报告用脚本化 mock 模型：只证明实验流程能完整跑通，数字不代表真实效果。'] : []),
  ],
}
mkdirSync(RUNS, { recursive: true })
for (const [index, group] of groups.entries()) {
  const runs = []
  for (let n = 0; n < repeats; n += 1) {
    console.log(`== ${group} run ${n + 1}/${repeats}`)
    const result = await runOnce(group, n, basePort + index * 10)
    console.log(`   ${result.ok ? 'ok' : 'NOT OK'} ${result.outcome} ${result.seconds ?? '-'}s calls ${result.model_calls} tokens ${result.tokens?.total ?? '-'}${result.note ? ` (${result.note})` : ''}`)
    runs.push(result)
  }
  const ok = runs.filter(run => run.ok)
  report.groups.push({
    id: group,
    runs,
    summary: {
      succeeded: ok.length,
      mean_seconds: mean(ok.map(run => run.seconds)),
      mean_model_calls: mean(ok.map(run => run.model_calls)),
      mean_tokens: mean(ok.map(run => run.tokens?.total ?? 0)),
      mean_auxiliary_calls: mean(ok.map(run => run.tokens?.auxiliary_calls ?? 0)),
      reviews: runs.reduce((sum, run) => sum + run.reviews, 0),
      reworks: runs.reduce((sum, run) => sum + run.reworks, 0),
      human_actions: runs.reduce((sum, run) => sum + run.human_actions, 0),
    },
  })
}
const outDir = join(HERE, 'reports')
mkdirSync(outDir, { recursive: true })
const path = join(outDir, `${report.id}.json`)
writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`)
console.log(`report: ${path}`)
if (publish) {
  const target = join(resolve(publish), '.dsh-squad', 'reports')
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, `${report.id}.json`), `${JSON.stringify(report, null, 2)}\n`)
  console.log(`published to ${target}`)
}
