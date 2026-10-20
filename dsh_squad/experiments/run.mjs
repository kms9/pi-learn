// Comparison experiment (M3-3): the same task done four ways, each in a fresh project
// directory, so no group inherits another's Bots, memory or results (D12).
//
//   node dsh_squad/experiments/run.mjs [--mock] [--groups S,A,B,C] [--repeats N]
//        [--goal "..."] [--publish <project>] [--port 3500] [--minutes 10]
//        [--merge <earlier report>]   keep that report's other groups, run only --groups
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
// How long one run may take before it counts as timed out (real models review slowly).
const limitMs = Number(option('minutes', '10')) * 60_000
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
async function quiet(api, { quietMs = 8000, timeoutMs = limitMs } = {}) {
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
  // trace: where every number came from (DSH-M3-03): the project directory keeps the
  // session logs (route and tool list of each request), memory and Controller data.
  const result = { ok: false, seconds: null, model_calls: 0, tokens: null, reviews: 0, reworks: 0, human_actions: 0, outcome: 'not run', note: '', trace: { project, run_id: null, config_hash: null, tools: group === 'S' || group === 'A' ? 'DS Bot free mode' : null, memory_entries: null, artifacts: [] } }
  try {
    cli('up')
    const { bot, squad } = await host(project)
    await bot('state')
    if (group === 'A') execFileSync(CLI, ['provision', project], { encoding: 'utf8' })
    await quiet(bot, { quietMs: 4000 })
    const before = usageOf(await bot('usage', {}))
    result.trace.memory_entries = (await Promise.all(bots0(await bot('state')).map(candidate => bot('memory-view', { botId: candidate.id }).then(view => view.entries.length).catch(() => 0)))).reduce((sum, n) => sum + n, 0)
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
      for (const deadline = Date.now() + limitMs; Date.now() < deadline && final === undefined;) {
        await sleep(1000)
        const snap = (await squad('ui/view')).snapshot
        const current = snap.views.runs.find(candidate => candidate.run_id === run.run_id)
        if (['completed', 'failed', 'cancelled', 'interrupted'].includes(current?.phase)) final = { current, tasks: snap.views.tasks.filter(task => task.run_id === run.run_id) }
      }
      result.ok = final?.current.phase === 'completed'
      result.outcome = final?.current.phase ?? 'timed out'
      result.reviews = final?.tasks.filter(task => task.kind === 'review').length ?? 0
      result.reworks = final?.tasks.filter(task => task.kind === 'rework').length ?? 0
      result.trace.run_id = run.run_id
      result.trace.config_hash = final?.current.config?.hash ?? null
      result.trace.tools = final?.tasks.find(task => task.kind !== 'leader_step')?.allowed_tools ?? null
      result.trace.artifacts = (final?.tasks ?? []).flatMap(task => (task.result?.artifacts ?? []).map(art => ({ task_id: task.task_id, name: art.name, sha256: art.sha256, accepted: task.acceptance?.decision === 'accepted' })))
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

const bots0 = view => (Array.isArray(view.bots) ? view.bots : Object.values(view.bots ?? {}))
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
    '每次运行的 trace 指向它的项目目录：会话日志记着每次请求的模型、思考档位和工具列表，Controller 数据记着输入、结果和成果文件的哈希；没有按价格折算费用（缺少约定的价格表）。',
    'S、A 组没有结束信号：以团队安静下来为结束，「成功」只表示有回复，不代表质量；B、C 组以 Run 通过最终关卡为成功。',
    ...(mock ? ['本报告用脚本化 mock 模型：只证明实验流程能完整跑通，数字不代表真实效果。'] : []),
  ],
}
// Groups carried over from an earlier report (--merge): only the groups run now are
// replaced, so one group can be run again without the others.
const merge = option('merge', undefined)
const carried = merge ? JSON.parse(readFileSync(resolve(merge), 'utf8')).groups.filter(group => !groups.includes(group.id)) : []
if (merge) report.notes.push(`组 ${carried.map(group => group.id).join('、') || '（无）'} 取自之前的报告 ${merge.split('/').at(-1)}。`)
const outDir = join(HERE, 'reports')
const path = join(outDir, `${report.id}.json`)
// Written after every group, so a run stopped halfway keeps the groups that finished.
function write() {
  const order = ['S', 'A', 'B', 'C', 'D']
  const out = { ...report, groups: [...carried, ...report.groups].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)) }
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`)
  if (publish) {
    const target = join(resolve(publish), '.dsh-squad', 'reports')
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, `${report.id}.json`), `${JSON.stringify(out, null, 2)}\n`)
  }
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
  write()
}
write()
console.log(`report: ${path}`)
if (publish) console.log(`published to ${join(resolve(publish), '.dsh-squad', 'reports')}`)
