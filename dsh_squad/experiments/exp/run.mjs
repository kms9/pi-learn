// Experiment runner v2 (EXP-01 to EXP-04, docs/dsh-squad-EXP01-04-实验计划-2026-10-29.md).
// Every arm of an experiment is a team in DS Bot + Squad. Each run gets a fresh project
// directory (D12), the same goal, and the same model; the final artifact is judged by
// deterministic scripts outside the project, and nothing here calls an LLM.
//
//   node dsh_squad/experiments/exp/run.mjs <exp> [--arms B0,B1,P1] [--repeats 5]
//        [--minutes 30] [--port 3600] [--mock] [--resume reports/<report>.json]
//
// Arms and their templates come from specs/<exp>.json and templates/<exp>/<arm>/.
// Arms run interleaved by repeat (round 1 of every arm, then round 2, ...). A run during
// which the machine slept is marked environment_interrupted and run again once (plan §6).
// Writes dsh-squad-experiment/2 into reports/. The report and its Markdown summary are
// committed (plan §8 decision 8); the Runs' evidence in .runs/ stays local.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { judgeExp01 } from './judges/exp01.mjs'
import { judgeExp02 } from './judges/exp02.mjs'
import { judgeExp03 } from './judges/exp03.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SQUAD = dirname(dirname(HERE))
const CLI = join(SQUAD, 'deploy', 'dsh-squad')
const RUNS = join(HERE, '.runs')
const REPORTS = join(HERE, 'reports')
const JUDGES = { exp01: judgeExp01, exp02: judgeExp02, exp03: judgeExp03 }

const [expId, ...rest] = process.argv.slice(2)
const option = (name, fallback) => { const i = rest.indexOf(`--${name}`); return i === -1 ? fallback : rest[i + 1] }
const mock = rest.includes('--mock') || !process.env.DEEPSEEK_API_KEY
const spec = JSON.parse(readFileSync(join(HERE, 'specs', `${expId}.json`), 'utf8'))
const arms = option('arms', spec.arms.join(',')).split(',').map(arm => arm.trim()).filter(Boolean)
const repeats = Math.max(1, Number(option('repeats', String(spec.repeats))))
const basePort = Number(option('port', '3600'))
const limitMs = Number(option('minutes', String(spec.minutes))) * 60_000
const sleep = ms => new Promise(done => setTimeout(done, ms))
const judge = JUDGES[expId]
if (!judge) { console.error(`no judge for ${expId}`); process.exit(2) }

// Wall-clock jumps that monotonic time does not show are sleeps: a laptop lid, a VM pause.
// Accumulated over the run; any run with more than 5 s of it is environment-interrupted.
const sleeps = { ms: 0 }
let lastWall = Date.now()
let lastMono = performance.now()
const watch = setInterval(() => {
  const wall = Date.now() - lastWall
  const mono = performance.now() - lastMono
  if (wall - mono > 5000) sleeps.ms += wall - mono
  lastWall = Date.now()
  lastMono = performance.now()
}, 1000)
watch.unref()

async function host(project) {
  const login = readFileSync(join(project, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)
  const base = new URL(login).origin
  const cookie = (await fetch(login, { redirect: 'manual' })).headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
  const call = route => async (endpoint, payload = {}) => {
    const out = await (await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint, payload }) })).json()
    if (!out.ok) throw new Error(`${endpoint}: ${out.error?.message}`)
    return out.value
  }
  const squad = call('/api/squad-adapter')
  return { ui: (endpoint, payload) => squad(`ui/${endpoint}`, payload) }
}

// Final artifact: the content of the artifact the named step's accepted result carries.
// Fetched from the Controller on loopback (the artifact route needs no credential).
async function finalArtifact(project, tasks, step) {
  const controller = JSON.parse(readFileSync(join(project, '.agents/dshsquad/.runtime/controller.json'), 'utf8'))
  const task = tasks.filter(t => t.title === step && t.kind !== 'review').at(-1)
  const art = task?.result?.artifacts?.find(a => a.name === spec.artifact)
  if (!art) return { task: task?.task_id ?? null, bytes: null, sha256: null, path: null, accepted: false }
  const hex = String(art.sha256).replace(/^sha256[/:]/, '')
  const response = await fetch(`${controller.endpoint}/v2/artifacts/sha256/${hex}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const digest = createHash('sha256').update(bytes).digest('hex')
  return { task: task.task_id, bytes: bytes.length, sha256: digest === hex ? hex : `MISMATCH ${digest}`, text: bytes, accepted: task.acceptance?.decision === 'accepted' }
}

function prepare(arm, project) {
  rmSync(project, { recursive: true, force: true })
  mkdirSync(project, { recursive: true })
  cpSync(join(HERE, 'templates', expId, arm, '.agents'), join(project, '.agents'), { recursive: true })
  // Task inputs (plan §1.3): copied into the project, where the formal task can read them.
  for (const [target, source] of Object.entries(spec.inputs ?? {})) {
    mkdirSync(dirname(join(project, target)), { recursive: true })
    cpSync(join(HERE, source), join(project, target))
  }
}

function cli(project, ...more) {
  return execFileSync(CLI, [...more, project, ...(mock ? ['--mock'] : []), '--port', String(basePort)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

async function runOnce(arm, round, order) {
  const project = join(RUNS, `${expId}-${arm}-${round + 1}`)
  prepare(arm, project)
  const sleptBefore = sleeps.ms
  const started = Date.now()
  const record = { arm, repeat: round + 1, order: order + 1, project, outcome: 'not run', run_id: null, seconds: null, suspended_seconds: 0, environment_interrupted: false, final: null, judge: null, error: null, goal_success: false }
  try {
    cli(project, 'up')
    const { ui } = await host(project)
    const run = await ui('start-run', { requestId: `${expId}-${arm}-${round + 1}-${Date.now()}`, teamId: spec.team, goal: spec.goal })
    record.run_id = run.run_id
    let current
    let tasks = []
    // The limit counts active time: the monotonic clock does not run while the machine sleeps.
    for (const deadline = performance.now() + limitMs; performance.now() < deadline;) {
      await sleep(2000)
      const snap = (await ui('view')).snapshot
      current = snap.views.runs.find(candidate => candidate.run_id === run.run_id)
      tasks = snap.views.tasks.filter(task => task.run_id === run.run_id)
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(current?.phase)) break
    }
    // A Run that is still going at the limit is a Runtime Failure (plan §6), not its phase.
    const terminal = ['completed', 'failed', 'cancelled', 'interrupted'].includes(current?.phase)
    record.outcome = terminal ? current.phase : 'timed_out'
    record.phase_at_end = current?.phase ?? null
    record.final = await finalArtifact(project, tasks, spec.final_steps?.[arm] ?? spec.final_step)
    record.counts = { tasks: tasks.length, kinds: tasks.reduce((acc, t) => ({ ...acc, [t.kind]: (acc[t.kind] ?? 0) + 1 }), {}) }
    if (record.final.text) {
      const file = join(project, 'final', spec.artifact)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, record.final.text)
      delete record.final.text
      // Judging is separate from the Run: a judge failure is recorded as judge_error and
      // leaves the Run's outcome as the Controller reported it.
      try {
        const runs = []
        for (let round = 0; round < 3; round += 1) runs.push(await judge(file))
        const first = JSON.stringify(runs[0].checks.map(c => [c.id, c.ok]))
        record.judge = { ...runs[0], consistent: runs.every(r => JSON.stringify(r.checks.map(c => [c.id, c.ok])) === first) }
      } catch (error) {
        record.judge_error = String(error.message ?? error).slice(0, 400)
      }
    }
  } catch (error) {
    record.error = String(error.message ?? error).slice(0, 400)
    record.outcome = 'error'
  } finally {
    try { cli(project, 'down') } catch { /* already down */ }
    record.seconds = Math.round((Date.now() - started) / 100) / 10
    record.suspended_seconds = Math.round((sleeps.ms - sleptBefore) / 100) / 10
    record.environment_interrupted = record.suspended_seconds > 5
    // Goal Success needs the Controller's acceptance as well as the judge's must-checks.
    record.goal_success = record.outcome === 'completed' && record.final?.accepted === true && record.judge?.must_passed === true
  }
  return record
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const fresh = {
  schema: 'dsh-squad-experiment/2',
  id: `${expId}-${stamp}`,
  experiment: expId,
  title: spec.title,
  created: new Date().toISOString(),
  mock,
  model: mock ? { provider: 'mock', model: 'ds-bot mock + squad mock', effort: null } : { provider: 'deepseek-official', model: 'deepseek-flash', effort: 'high' },
  arms,
  repeats,
  task: { goal: spec.goal, artifact: spec.artifact, final_steps: spec.final_steps ?? { all: spec.final_step } },
  runs: [],
}
// --resume <report> continues an experiment that stopped (a restart kills the runner, the
// Runs it finished stay in the report). Every (arm, repeat) already in the report is skipped.
const resumeFrom = option('resume', '')
const report = resumeFrom ? JSON.parse(readFileSync(resumeFrom, 'utf8')) : fresh
if (resumeFrom && (report.experiment !== expId || report.mock !== mock)) {
  console.error(`${resumeFrom} is not a ${expId} report in the same mode (mock=${mock})`)
  process.exit(2)
}
const path = resumeFrom || join(REPORTS, `${report.id}.json`)
const done = new Set(report.runs.filter(r => r.discarded_first !== true && r.environment_interrupted !== true).map(r => `${r.arm}:${r.repeat}`))
function write() {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`)
}
mkdirSync(RUNS, { recursive: true })
for (let round = 0; round < repeats; round += 1) {
  for (const [armIndex, arm] of arms.entries()) {
    const order = round * arms.length + armIndex
    console.log(`== ${expId} ${arm} round ${round + 1}/${repeats}`)
    if (done.has(`${arm}:${round + 1}`)) { console.log('   already in the report; skipped'); continue }
    // A run the machine slept through is not a result (plan §6): it stays in the report, marked
    // discarded, and the run is repeated, up to three attempts in all.
    let record = await runOnce(arm, round, order)
    for (let attempt = 1; record.environment_interrupted && attempt < 3; attempt += 1) {
      console.log(`   environment interrupted (${record.suspended_seconds}s asleep); running again`)
      record.discarded_first = true
      report.runs.push(record)
      record = await runOnce(arm, round, order)
    }
    report.runs.push(record)
    console.log(`   ${record.outcome} ${record.seconds}s goal_success=${record.goal_success} ${record.judge ? `coverage=${record.judge.requirement_coverage.toFixed(2)}` : (record.judge_error ?? record.error ?? 'no artifact')}`)
    write()
  }
}
write()
console.log(`report: ${path}`)
