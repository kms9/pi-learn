// T stage on the real model: DeepSeek deepseek-flash, thinking on, effort high (D7).
// The key comes only from the environment (source ~/.secrets/deepseek.env in the shell
// that starts this); nothing here writes it down.
//
//   PUPPETEER_CORE=<dir> node probes/real-t.mjs <phase> [port] [shots-prefix]
//
//   route  the preset team in Free mode: every call on deepseek-flash with effort high
//          (DSH-M0-02), @Bot and team memory (DSH-M0-03); a managed Bot asked to run a
//          shell gets no shell (DSH-M1-08).
//   math   the math courseware case, driven from the Squad page in a browser: a Run
//          from the start panel, the first draft rejected by an independent reviewer,
//          reworked and re-reviewed, the check redone on the new version when it was
//          built on the old one, the Run completed, the courseware previewed isolated
//          (DSH-M2-01/02/03/07, UI key flows). Light and dark screenshots.
//   teams  the m4 case: three Teams, a shared reviewer, FIFO, a child task (DSH-M4-01/02).
import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PROBES, lines, sleep, until } from './lib.mjs'
import { repliesOf, routesOf, sessionLogs } from './session-log.mjs'

const [phase, port = '3600', shots = '/tmp/squad-real'] = process.argv.slice(2)
if (!process.env.DEEPSEEK_API_KEY) { console.error('DEEPSEEK_API_KEY missing: source ~/.secrets/deepseek.env first'); process.exit(2) }
const REPO = join(PROBES, '..')
const PROJECT = join(PROBES, '.run', `real-${phase}`)
const CLI = join(REPO, 'dsh_squad', 'deploy', 'dsh-squad')
const run = (...args) => execFileSync(CLI, args, { encoding: 'utf8' })
const failures = []
const check = (id, ok, what, detail) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} ${id} ${what}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`); if (!ok) failures.push(`${id} ${what}`) }
const TERMINAL = ['completed', 'failed', 'cancelled', 'interrupted']
const id = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
const loginOf = () => readFileSync(join(PROJECT, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)

async function session() {
  const login = loginOf()
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
async function operator(method, path, body) {
  const d = JSON.parse(readFileSync(join(PROJECT, '.agents/dshsquad/.runtime/controller.json'), 'utf8'))
  const token = readFileSync(join(PROJECT, '.agents/dshsquad/.runtime/operator.token'), 'utf8').trim()
  const response = await fetch(`${d.endpoint}${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-squad-protocol': 'squad/3', 'x-squad-controller': d.controller_id }, body: body === undefined ? undefined : JSON.stringify(body) })
  return response.json()
}
const usage = () => {
  const out = execFileSync('python3', ['-c', `import sqlite3,json; db=sqlite3.connect(${JSON.stringify(join(PROJECT, '.dsh-squad/home/bot/usage.sqlite'))}); print(json.dumps([dict(zip(['session','provider','model','kind','input','output'],r)) for r in db.execute('select session,provider,model,kind,input,output from calls')]))`], { encoding: 'utf8' })
  return JSON.parse(out)
}
const adapterLog = () => lines(join(PROJECT, '.dsh-squad/home/squad-adapter/decisions.jsonl'))
const stored = () => JSON.parse(readFileSync(join(PROJECT, '.dsh-squad/home/bot/state.json'), 'utf8'))
const botsOf = () => Object.values(stored().bots)
const routeOk = bots => bots.every(bot => bot.model === 'deepseek-official/deepseek-flash' && bot.effort === 'high')

function fresh(caseDir) {
  rmSync(PROJECT, { recursive: true, force: true })
  if (caseDir) cpSync(join(REPO, 'dsh_squad', 'cases', caseDir, '.agents'), join(PROJECT, '.agents'), { recursive: true })
}

async function routePhase() {
  fresh()
  run('up', PROJECT, '--port', port)
  run('provision', PROJECT)
  const { bot } = await session()
  await bot('state')
  const team = JSON.parse(readFileSync(join(PROJECT, '.dsh-squad/team.json'), 'utf8'))
  check('DSH-M0-02', routeOk(botsOf()), 'every preset Bot is set to deepseek-flash with effort high', botsOf().map(b => [b.name, b.model, b.effort]))

  console.log('== group chat in Free mode')
  const home = join(PROJECT, '.dsh-squad/home')
  const room = () => Object.values(stored().rooms).find(candidate => candidate.id === team.group.id)
  const groupSession = name => room()?.sessions?.[team.bots[name]]
  const saidAfter = (sessionId, since) => repliesOf(sessionLogs(home).get(sessionId) ?? []).filter(reply => reply.time >= since && reply.text.trim() !== '')
  let since = Date.now()
  await bot('send', { sessionId: team.group.id, text: '大家好！请每位用一句话说说自己在团队里负责什么。' })
  const spoke = await until(() => ['Chief', 'Researcher', 'Builder', 'Reviewer'].filter(name => saidAfter(groupSession(name), since).length > 0).length >= 2, 600_000, 5000)
  check('DSH-M0-03', spoke, 'members answer a message in the group', ['Chief', 'Researcher', 'Builder', 'Reviewer'].map(name => `${name}:${saidAfter(groupSession(name), since).length}`))
  since = Date.now()
  await bot('send', { sessionId: team.group.id, text: '@Researcher 分数和除法有什么关系？请简短回答。' })
  const mentioned = await until(() => saidAfter(groupSession('Researcher'), since).length > 0, 300_000, 5000)
  check('DSH-M0-03', mentioned, '@Researcher: Researcher answers in the group', saidAfter(groupSession('Researcher'), since)[0]?.text.slice(0, 120))
  const memory = await bot('memory-view', { botId: team.bots.Chief })
  check('DSH-M0-03', memory.entries.some(entry => entry.scope === 'team'), 'the team memory is there', memory.entries.length)
  since = Date.now()
  await bot('send', { sessionId: team.group.id, text: '@Chief 我们团队里谁负责审核成果？只回答名字。' })
  const recalled = await until(() => saidAfter(groupSession('Chief'), since).some(reply => /Reviewer/.test(reply.text)), 300_000, 5000)
  check('DSH-M0-03', recalled, 'Chief answers from the team memory who reviews', saidAfter(groupSession('Chief'), since).map(reply => reply.text.slice(0, 80)))
  await bot('usage', {})
  const requests = [...sessionLogs(home).values()].flatMap(routesOf).filter(route => route.type === 'request/header')
  const wrong = requests.filter(route => route.provider !== 'deepseek-official' || route.model !== 'deepseek-flash' || route.effort !== 'high')
  check('DSH-M0-02', requests.length > 0 && wrong.length === 0, `every one of ${requests.length} model requests used deepseek-official/deepseek-flash, effort high`, wrong.slice(0, 3))

  console.log('== a managed Bot asked to run a shell')
  run('down', PROJECT)
  cpSync(join(REPO, 'dsh_squad', 'cases', 'math', '.agents'), join(PROJECT, '.agents'), { recursive: true })
  run('up', PROJECT, '--port', port)
  const s = await session()
  await s.bot('state')
  await s.ui('bind-team', { teamId: 'math' })
  check('DSH-M0-02', routeOk(botsOf()), 'Bots the Team needed were made on the same route', botsOf().map(b => [b.name, b.model, b.effort]))
  await until(async () => ((await s.ui('view')).snapshot.views.agents ?? []).filter(agent => agent.presence === 'online').length >= 5, 120_000, 1000)
  const task = await operator('POST', '/v2/tasks/direct', { request_id: id('shell'), target: 'math-researcher', kind: 'execute', goal: '请先用 bash 或 run_code 执行 `ls /` 和 `cat /etc/hostname`，把输出写进结果。如果工具不可用，说明你尝试了什么、为什么不行，然后照常用 squad_submit_result 提交结果。', write_set: [], dependencies: [], refs: [] })
  const done = await until(async () => {
    const t = (await s.ui('view')).snapshot.views.tasks.find(candidate => candidate.task_id === task.task_id)
    return TERMINAL.includes(t?.state) || t?.state === 'needs_review' ? t : undefined
  }, 600_000, 3000)
  const guarded = adapterLog().filter(line => line.event === 'tool-guard')
  const sessionFiles = execFileSync('sh', ['-c', `grep -rlE '"(bash|run_code)"' '${join(PROJECT, '.dsh-squad/home/sessions')}' 2>/dev/null | head -50 || true`], { encoding: 'utf8' }).trim()
  const hostname = readFileSync('/etc/hostname', 'utf8').trim()
  const leaked = hostname.length > 3 && JSON.stringify(done?.result ?? '').includes(hostname)
  check('DSH-M1-08', done?.state === 'completed' && !leaked, 'the task finished without any shell output in its result', { state: done?.state, guardRefusals: guarded.length, toolMentions: sessionFiles.split('\n').filter(Boolean).length, answer: String(done?.result?.value?.answer ?? JSON.stringify(done?.result?.value ?? '')).slice(0, 200) })
}

async function mathPhase() {
  fresh('math')
  const flowPath = join(PROJECT, '.agents/dshsquad/teams/math/workflows/lesson.json')
  const flow = JSON.parse(readFileSync(flowPath, 'utf8'))
  flow.steps.find(step => step.id === 'build').goal += '。（验收测试要求：第一版只写标题和一句定义，不写例题、不做互动；审核退回后，第二版再补全例题和互动。）'
  writeFileSync(flowPath, `${JSON.stringify(flow, null, 2)}\n`)
  run('up', PROJECT, '--port', port)
  run('provision', PROJECT)
  const { ui, bot } = await session()
  await bot('state')
  const puppeteer = createRequire(join(process.env.PUPPETEER_CORE ?? '.', 'package.json'))('puppeteer-core')
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 960 })
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(loginOf(), { waitUntil: 'networkidle2', timeout: 90_000 })
    await sleep(3000)
    await page.$eval('button.sq-foot', el => el.click())
    const panel = await until(async () => (await page.$('.sq-start textarea')) !== null, 30_000, 500)
    check('UI', panel, 'the Team with no Run opens on the start panel')
    await page.type('.sq-start textarea', '认识分数：分数的意义与读写（五年级）')
    await page.$$eval('.sq-start .sq-btn', els => els.find(el => el.innerText.trim() === '开始')?.click())
    const started = await until(async () => (await page.$$('.sq-node')).length >= 2, 600_000, 2000)
    check('UI', started, 'the tree grows from the Leader after the start')
    await page.screenshot({ path: `${shots}-math-light-1-start.png` })
    const views = async () => (await ui('view')).snapshot.views
    const runId = (await views()).runs.at(-1)?.run_id
    let redone = 0
    let shotAttention = false
    const finished = await until(async () => {
      const v = await views()
      const r = v.runs.find(candidate => candidate.run_id === runId)
      // Anything that needs a person: a check built on a replaced version is redone with
      // the new one (D2); everything else is left for the report.
      const pill = await page.$('.sq-pill[data-s=attention]')
      if (pill && !shotAttention) { shotAttention = true; await page.screenshot({ path: `${shots}-math-light-2-attention.png` }) }
      const staleTask = v.tasks.find(task => task.run_id === runId && (task.stale_inputs ?? []).length > 0 && !task.stale_kept && !task.superseded_by && task.state === 'completed' && !v.tasks.some(other => other.rework_of === task.task_id))
      if (staleTask && redone < 3) {
        await page.$eval('.sq-pill[data-s=attention]', el => el.click()).catch(() => {})
        await sleep(500)
        await page.$$eval('.sq-menu .sq-menu-item', els => els.find(el => /基于旧版本/.test(el.innerText))?.click()).catch(() => {})
        await sleep(1500)
        const clicked = await page.$$eval('.sq-pop .sq-btn', els => { const el = els.find(candidate => candidate.innerText === '用新版本重做'); el?.click(); return Boolean(el) }).catch(() => false)
        if (clicked) redone += 1
      }
      return TERMINAL.includes(r?.phase) ? r : undefined
    }, 3_600_000, 5000)
    const v = await views()
    const tasks = v.tasks.filter(task => task.run_id === runId)
    const byGoal = text => tasks.filter(task => !['leader_step', 'review'].includes(task.kind) && task.goal.includes(text))
    const [build] = byGoal('制作一页 HTML 课件')
    const rework = tasks.find(task => task.kind === 'rework')
    const reviews = tasks.filter(task => task.kind === 'review')
    console.log(`   (run ${runId?.slice(0, 16)} ${finished?.phase ?? v.runs.find(r => r.run_id === runId)?.phase}; ${tasks.length} tasks; redone ${redone})`)
    check('DSH-M2-01', finished?.phase === 'completed', 'the Run completed on the real model', { phase: finished?.phase, gate: v.runs.find(r => r.run_id === runId)?.gate_failure, states: tasks.map(task => `${task.kind}:${task.state}:${task.acceptance?.decision ?? '-'}`) })
    const research = byGoal('梳理')[0]
    check('DSH-M2-01', research && build && (build.dependencies ?? []).some(dep => dep.task_id === research.task_id) && (build.attempt_ids?.length ?? 0) > 0, 'the build waited on the accepted research')
    check('DSH-M2-03', build?.acceptance?.decision === 'rejected' && build?.superseded_by === rework?.task_id && rework?.acceptance?.decision === 'accepted', 'the first draft was rejected, reworked as a new node, and the rework accepted', { build: build?.acceptance?.decision, superseded: Boolean(build?.superseded_by), rework: rework?.acceptance?.decision })
    const reviewerOf = task => reviews.find(review => review.dependencies?.some(dep => dep.task_id === task?.task_id))?.result?.agent_id
    check('DSH-M2-02', reviewerOf(rework) && reviewerOf(rework) !== rework?.result?.agent_id, 'an independent Bot reviewed the exact rework version', { author: rework?.result?.agent_id, reviewer: reviewerOf(rework) })
    const art = (rework ?? build)?.result?.artifacts?.find(candidate => candidate.media_type === 'text/html' || /\.html$/.test(candidate.name ?? ''))
    check('DSH-M2-02', art !== undefined, 'the accepted courseware is an HTML artifact', (rework ?? build)?.result?.artifacts)
    await page.screenshot({ path: `${shots}-math-light-3-done.png` })
    // Preview in the browser: another host name, a sandbox, no cookies, no network.
    if (art) {
      await page.$$eval('.sq-btn', els => els.find(el => el.innerText === '列表视图')?.click())
      await sleep(800)
      const opened = await page.$$eval('.sq-btn', els => { const el = els.find(candidate => candidate.innerText === '预览'); el?.click(); return Boolean(el) })
      await sleep(3000)
      const frame = page.frames().find(f => f.url().includes('/v2/artifacts/'))
      const cookie = frame ? await frame.evaluate(() => { try { return document.cookie } catch (error) { return `blocked: ${error.name}` } }) : null
      const host = frame ? new URL(frame.url()).host : null
      check('DSH-M2-07', opened && frame && host !== new URL(loginOf()).host && (cookie === '' || /blocked/.test(cookie ?? '')), 'the courseware previews on another host name with no cookies', { host, cookie })
      await page.screenshot({ path: `${shots}-math-light-4-preview.png` })
    }
    check('UI', errors.length === 0, 'no page errors', errors)
    const dark = await browser.newPage()
    await dark.setViewport({ width: 1440, height: 960 })
    await dark.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
    await dark.goto(loginOf(), { waitUntil: 'networkidle2', timeout: 90_000 })
    await sleep(3000)
    await dark.$eval('button.sq-foot', el => el.click())
    await sleep(1500)
    await dark.$$eval('.sq-side .sq-item', els => els[0]?.click())
    await sleep(1500)
    for (let i = 0; i < 20; i += 1) {
      const opened = await dark.$eval('.sq-node[data-folded] .sq-node-count', el => { el.click(); return true }).catch(() => false)
      if (!opened) break
      await sleep(300)
    }
    await dark.$$eval('.sq-canvas-tools .sq-btn', els => els.find(el => el.innerText === '适应窗口')?.click())
    await sleep(800)
    await dark.screenshot({ path: `${shots}-math-dark-1-tree.png` })
  } finally {
    await browser.close()
  }
}

async function teamsPhase() {
  fresh('m4')
  run('up', PROJECT, '--port', port)
  run('provision', PROJECT)
  const { ui, bot } = await session()
  await bot('state')
  const bound = {}
  for (const team of ['team-a', 'team-b', 'team-c']) bound[team] = await ui('bind-team', { teamId: team })
  check('DSH-M4-01', routeOk(botsOf()), 'every Bot on deepseek-flash, effort high', botsOf().map(b => [b.name, b.model, b.effort]))
  await until(async () => ((await ui('view')).snapshot.views.agents ?? []).filter(agent => agent.presence === 'online').length >= 9, 120_000, 1000)
  const runs = {}
  for (const team of ['team-a', 'team-b', 'team-c']) runs[team] = await ui('start-run', { requestId: id(team), teamId: team, goal: team === 'team-a' ? '写一份五年级分数入门讲义（三段以内）' : team === 'team-b' ? '把一段分数讲义改得更易读（自己先写一段再改）' : '出三道分数练习题并附答案' })
  await sleep(5000)
  let v = (await ui('view')).snapshot.views
  const r = id => v.runs.find(candidate => candidate.run_id === runs[id].run_id)
  check('DSH-M4-01', r('team-a').admitted && r('team-c').admitted && !r('team-b').admitted && r('team-b').waiting_roles?.[0]?.role_id === 'reviewer', 'A and C start; B waits for the reviewer A holds')
  const done = await until(async () => {
    v = (await ui('view')).snapshot.views
    return ['team-a', 'team-b', 'team-c'].every(team => TERMINAL.includes(r(team)?.phase)) ? v : undefined
  }, 3_600_000, 5000)
  check('DSH-M4-01', done && ['team-a', 'team-b', 'team-c'].every(team => r(team).phase === 'completed'), 'all three Runs complete on the real model', ['team-a', 'team-b', 'team-c'].map(team => `${team}:${r(team)?.phase}`))
  const events = []
  for (let after = 0; ;) {
    const page = (await ui('events', { after })).events ?? []
    if (page.length === 0) break
    events.push(...page)
    after = page.at(-1).seq
  }
  const seqOf = (type, entity) => events.filter(event => event.type === type && event.entity_id === entity).map(event => event.seq)
  const aEnd = Math.max(...seqOf('leader_decision', runs['team-a'].run_id), 0)
  const bStart = Math.min(...seqOf('run_admitted', runs['team-b'].run_id), Infinity)
  check('DSH-M4-01', aEnd > 0 && bStart > aEnd, 'B started only after A finished')
  const reviewOf = team => v.tasks.find(task => task.run_id === runs[team].run_id && task.kind === 'review')?.result?.agent_id
  check('DSH-M4-01', reviewOf('team-a') === 'team-a-reviewer' && reviewOf('team-b') === 'team-b-reviewer', 'the shared reviewer worked in each Team’s own runtime', { a: reviewOf('team-a'), b: reviewOf('team-b') })
  const cTasks = v.tasks.filter(task => task.run_id === runs['team-c'].run_id)
  const parent = cTasks.find(task => task.kind === 'execute' && !task.parent_id)
  const child = cTasks.find(task => task.parent_id === parent?.task_id)
  const parentAttempts = (parent?.attempt_ids ?? []).map(attemptId => v.attempts.find(attempt => attempt.attempt_id === attemptId))
  check('DSH-M4-02', child?.state === 'completed' && parent?.state === 'completed' && parentAttempts.some(attempt => (attempt?.segment_id ?? 1) >= 2), 'the maker delegated to the auditor, waited, and finished in a later segment', { child: child && `${child.role_id}:${child.state}`, parent: parent?.state, segments: parentAttempts.map(attempt => attempt?.segment_id) })
}

try {
  if (phase === 'route') await routePhase()
  else if (phase === 'math') await mathPhase()
  else if (phase === 'teams') await teamsPhase()
  else throw new Error(`unknown phase ${phase}`)
} catch (error) {
  check('ERROR', false, `error: ${error.message}`)
} finally {
  const calls = await (async () => { try { await (await session()).bot('usage', {}); return usage() } catch { return [] } })()
  try { run('down', PROJECT) } catch { /* already down */ }
  const sum = calls.reduce((acc, call) => ({ input: acc.input + call.input, output: acc.output + call.output }), { input: 0, output: 0 })
  console.log(`   (usage ledger: ${calls.length} calls, input ${sum.input}, output ${sum.output} tokens; models ${[...new Set(calls.map(call => `${call.provider}/${call.model}`))].join(', ')})`)
}
console.log(failures.length === 0 ? `REAL ${phase}: all checks pass` : `REAL ${phase}: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
