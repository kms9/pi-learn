// UI plan P3 acceptance on the mock: handling what needs a person and what failed, from
// the node popovers, in a real browser. Three Teams (dsh_squad/cases/m4), changed so:
//   team-a  its step is slow and the DS Bot host restarts under it: failed (uncertain);
//           guidance about the step, then Retry with the stop confirmed → attempt 2
//   team-c  results are accepted by a person: needs you → Accept
//   team-b  its step ends without a result: failed → Ignore (confirmed); the final check
//           then finds nothing to deliver → Ignore on the Run ends it, results kept
//
//   PUPPETEER_CORE=<dir with puppeteer-core> node probes/ui-p3.mjs [port] [shots-prefix]
import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PROBES, until } from './lib.mjs'

const port = process.argv[2] ?? '3500'
const shots = process.argv[3] ?? '/tmp/squad-p3'
const REPO = join(PROBES, '..')
const PROJECT = join(PROBES, '.run', 'ui-p3-project')
const CLI = join(REPO, 'dsh_squad', 'deploy', 'dsh-squad')
const run = (...args) => execFileSync(CLI, args, { encoding: 'utf8' })
const puppeteer = createRequire(join(process.env.PUPPETEER_CORE ?? '.', 'package.json'))('puppeteer-core')
const failures = []
const check = (ok, what, detail) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} ${what}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`); if (!ok) failures.push(what) }
const sleep = ms => new Promise(done => setTimeout(done, ms))

rmSync(PROJECT, { recursive: true, force: true })
cpSync(join(REPO, 'dsh_squad', 'cases', 'm4', '.agents'), join(PROJECT, '.agents'), { recursive: true })
const patch = (team, from, to) => {
  const path = join(PROJECT, `.agents/dshsquad/teams/${team}/${from.includes('acceptance') ? 'team.json' : 'workflows/one.json'}`)
  writeFileSync(path, readFileSync(path, 'utf8').replace(from, to))
}
patch('team-a', '写一页分数讲义', '慢 15 写一页分数讲义')
patch('team-b', '把分数讲义改得更易读', '不提交 把分数讲义改得更易读')
const teamC = join(PROJECT, '.agents/dshsquad/teams/team-c/team.json')
const c = JSON.parse(readFileSync(teamC, 'utf8'))
c.policy.acceptance_policy = { mode: 'human', child_policy: 'separate' }
c.default_workflow = 'one'
writeFileSync(teamC, `${JSON.stringify(c, null, 2)}\n`)
const flowC = join(PROJECT, '.agents/dshsquad/teams/team-c/workflows/one.json')
writeFileSync(flowC, readFileSync(flowC, 'utf8').replace('出三道分数练习题，派给 auditor 核对答案后再交', '出三道分数练习题'))

const loginOf = () => readFileSync(join(PROJECT, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)
async function api() {
  const login = loginOf()
  const base = new URL(login).origin
  const cookie = (await fetch(login, { redirect: 'manual' })).headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
  return async (endpoint, payload = {}) => {
    const out = await (await fetch(`${base}/api/squad-adapter`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint: `ui/${endpoint}`, payload }) })).json()
    if (!out.ok) throw new Error(`${endpoint}: ${out.error?.message}`)
    return out.value
  }
}
const views = async ui => (await ui('view')).snapshot.views

let browser
try {
  run('up', PROJECT, '--mock', '--port', port)
  let ui = await api()
  for (const team of ['team-a', 'team-b', 'team-c']) await ui('bind-team', { teamId: team })
  await until(async () => ((await views(ui)).agents ?? []).filter(agent => agent.presence === 'online').length >= 9, 60_000, 500)
  const runs = {}
  // team-a first: the host restart must cut only its step.
  runs['team-a'] = (await ui('start-run', { requestId: `p3-team-a-${Date.now()}`, teamId: 'team-a', goal: 'team-a 的任务' })).run_id
  await until(async () => (await views(ui)).tasks.some(task => task.run_id === runs['team-a'] && task.kind === 'execute' && task.state === 'running'), 60_000, 300)
  // The DS Bot host goes down under team-a's step and comes back.
  execFileSync('sh', ['-c', `kill -KILL -$(cat '${join(PROJECT, '.dsh-squad/run/web.pid')}')`])
  await sleep(1000)
  run('up', PROJECT, '--mock', '--port', port)
  ui = await api()
  await until(async () => (await views(ui)).tasks.some(task => task.run_id === runs['team-a'] && task.state === 'interrupted'), 60_000, 500)

  browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 960 })
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(loginOf(), { waitUntil: 'networkidle2', timeout: 90_000 })
  await sleep(3000)
  await page.$eval('button.sq-foot', el => el.click())
  await sleep(1500)
  const clickText = (selector, text) => page.$$eval(selector, (els, text) => { const el = els.find(e => e.innerText.trim() === text); el?.click(); return Boolean(el) }, text)
  const openFrom = async (kind, match) => {
    await page.$eval(`.sq-pill[data-s=${kind}]`, el => el.click())
    await sleep(300)
    const ok = await page.$$eval('.sq-menu .sq-menu-item', (els, match) => { const el = els.find(e => e.innerText.includes(match)); el?.click(); return Boolean(el) }, match)
    await sleep(1500)
    return ok
  }

  console.log('== host restart: guidance, then Retry with the stop confirmed')
  check(await openFrom('failed', '写一页分数讲义'), 'the failed step is listed and opens')
  const reason = await page.$eval('.sq-pop .sq-pop-reason', el => el.innerText).catch(() => '')
  check(/DS Bot 中途重启|很久没有回应/.test(reason), 'the popover says why in one line', reason)
  const buttons = await page.$$eval('.sq-pop .sq-pop-main .sq-btn', els => els.map(el => el.innerText))
  check(JSON.stringify(buttons) === JSON.stringify(['忽略', '重试']), 'only Ignore and Retry', buttons)
  await page.type('.sq-pop .sq-pop-guide input', '例子用披萨')
  await page.$eval('.sq-pop .sq-pop-guide .sq-btn', el => el.click())
  await sleep(1500)
  const notes = (await views(ui)).runs.find(r => r.run_id === runs['team-a']).guidance_notes ?? []
  check(notes.some(note => note.text === '例子用披萨' && note.task_id), 'guidance about the step reached the Run with the step named', notes)
  await page.screenshot({ path: `${shots}-light-1-failed.png` })
  await clickText('.sq-pop .sq-btn', '重试')
  await sleep(300)
  const confirm = await page.$eval('.sq-pop .sq-pop-confirm', el => el.innerText).catch(() => '')
  check(/上一次已经停下了/.test(confirm), 'an uncertain end asks one line of confirmation', confirm)
  await page.screenshot({ path: `${shots}-light-2-confirm.png` })
  await clickText('.sq-pop .sq-btn', '确认并重试')
  const retried = await until(async () => {
    const v = await views(ui)
    const task = v.tasks.find(t => t.run_id === runs['team-a'] && t.kind === 'execute')
    return task?.attempt_ids?.length === 2 ? task : undefined
  }, 60_000, 500)
  check(retried, 'the step runs a second attempt')
  for (const team of ['team-c', 'team-b']) runs[team] = (await ui('start-run', { requestId: `p3-${team}-${Date.now()}`, teamId: team, goal: `${team} 的任务` })).run_id
  await sleep(1500)
  const attemptCards = await page.$$eval('.sq-node', els => els.map(el => [el.dataset.node, el.dataset.s, el.innerText.replace(/\s+/g, ' ')]).filter(([id]) => id))
  check(attemptCards.some(([id, s, text]) => !id.includes('#') && s === 'stopped' && /第 1 次（已重试）/.test(text)) && attemptCards.some(([id]) => id.endsWith('#2')), 'attempt 1 is grey and attempt 2 hangs under it', attemptCards.map(([id, s]) => [id.slice(-8), s]))

  console.log('== human acceptance: needs you → Accept')
  const acceptable = await until(async () => (await views(ui)).tasks.some(t => t.run_id === runs['team-c'] && t.kind === 'execute' && t.state === 'completed' && !t.acceptance), 90_000, 500)
  check(acceptable, 'team-c waits for a person to accept')
  await sleep(2000)
  check(await openFrom('attention', '出三道分数练习题'), 'the result to accept is listed and opens')
  const title = await page.$eval('.sq-pop .sq-pop-title', el => el.innerText).catch(() => '')
  check(/确认这个结果/.test(title), 'the popover asks to accept the result', title)
  await page.screenshot({ path: `${shots}-light-3-accept.png` })
  await clickText('.sq-pop .sq-btn', '通过')
  const cDone = await until(async () => (await views(ui)).runs.find(r => r.run_id === runs['team-c'])?.phase === 'completed', 90_000, 500)
  check(cDone, 'team-c completes after the acceptance')

  console.log('== missing result: Ignore, confirmed')
  const bFailed = await until(async () => (await views(ui)).tasks.some(t => t.run_id === runs['team-b'] && t.kind === 'execute' && t.state === 'needs_review'), 180_000, 1000)
  check(bFailed, 'team-b’s step failed (no result)')
  await sleep(2000)
  check(await openFrom('failed', '改得更易读'), 'the failed step opens')
  const why = await page.$eval('.sq-pop .sq-pop-reason', el => el.innerText).catch(() => '')
  check(/没有提交结果/.test(why), 'it says the step ended without a result', why)
  await clickText('.sq-pop .sq-btn', '忽略')
  await sleep(300)
  check(/不再要求这一步/.test(await page.$eval('.sq-pop .sq-pop-confirm', el => el.innerText).catch(() => '')), 'Ignore asks one line of confirmation (D1)')
  await clickText('.sq-pop .sq-btn', '确定忽略')
  // Its only step is gone, so the Leader's final check finds nothing to deliver: the
  // Run itself fails the check, says why, and Ignore ends it keeping what there is.
  const bGate = await until(async () => (await views(ui)).runs.find(r => r.run_id === runs['team-b'])?.gate_failure, 120_000, 1000)
  check(bGate?.code === 'NO_RESULTS', 'the final check refuses a Run with nothing to deliver, and says so', bGate)
  await sleep(2000)
  const ignored = await page.$$eval('.sq-node', els => els.map(el => [el.dataset.s, el.innerText.replace(/\s+/g, ' ')]))
  check(ignored.some(([s, text]) => s === 'stopped' && /已忽略/.test(text)), 'the ignored step is grey and says so')
  check(await openFrom('failed', '整个小队'), 'the Run is listed as failed and opens')
  const gate = await page.$eval('.sq-pop .sq-pop-reason', el => el.innerText).catch(() => '')
  check(/没有任何完成的成果/.test(gate), 'the Run popover says why in one line', gate)
  await page.screenshot({ path: `${shots}-light-4-gate.png` })
  await clickText('.sq-pop .sq-btn', '忽略')
  await sleep(300)
  check(/保留/.test(await page.$eval('.sq-pop .sq-pop-confirm', el => el.innerText).catch(() => '')), 'ending the Run keeps the results, said in one line (D1)')
  await clickText('.sq-pop .sq-btn', '确定结束')
  const bEnded = await until(async () => (await views(ui)).runs.find(r => r.run_id === runs['team-b'])?.phase === 'cancelled', 60_000, 1000)
  check(bEnded, 'the Run ended')
  await sleep(1500)
  await page.screenshot({ path: `${shots}-light-5-ended.png` })
  check(errors.length === 0, 'no page errors (light)', errors)

  const dark = await browser.newPage()
  await dark.setViewport({ width: 1440, height: 960 })
  await dark.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await dark.goto(loginOf(), { waitUntil: 'networkidle2', timeout: 90_000 })
  await sleep(3000)
  await dark.$eval('button.sq-foot', el => el.click())
  await sleep(1000)
  await dark.$$eval('.sq-side .sq-item', els => els.find(el => el.innerText.includes('team-a'))?.click())
  await sleep(1500)
  await dark.screenshot({ path: `${shots}-dark-1-retried.png` })
  await dark.$$eval('.sq-side .sq-item', els => els.find(el => el.innerText.includes('team-b'))?.click())
  await sleep(1500)
  await dark.screenshot({ path: `${shots}-dark-2-ignored.png` })
} catch (error) {
  check(false, `error: ${error.message}`)
} finally {
  await browser?.close()
  run('down', PROJECT)
}
console.log(failures.length === 0 ? 'UI P3: all checks pass' : `UI P3: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
