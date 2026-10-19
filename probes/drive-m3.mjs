// M3 on the mock model, through the host routes the Squad page uses (ui/*), against
// the one-command pair: the projection bridge, the page's actions and the config editor.
//
//   node probes/drive-m3.mjs [port]
//
// Checks:
//   M3-4       config: an invalid Team is refused and nothing written; a valid save
//              raises the Team's config_version; validate-only writes nothing
//   M3-1       the snapshot and the event cursor; a restarted Controller is noticed
//              (new epoch) and read again (DSH-M3-01)
//   DSH-M3-02  actions bind the revision they were drawn for: a stale one is refused
//   the start button is idempotent; only listed operations pass; the operator
//   credential never reaches the page; published reports are listed
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROBES, until } from './lib.mjs'
import { EMPTY, acceptSnapshot, readEvents } from '../dsh_squad/client/src/projection.js'

const port = process.argv[2] ?? '3450'
const REPO = join(PROBES, '..')
const PROJECT = join(PROBES, '.run', 'm3-project')
const CLI = join(REPO, 'dsh_squad', 'deploy', 'dsh-squad')
const run = (...args) => execFileSync(CLI, args, { encoding: 'utf8' })
const failures = []
const check = (ok, what, detail) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} ${what}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`); if (!ok) failures.push(what) }
const refused = async promise => promise.then(() => undefined, error => error.message)

rmSync(PROJECT, { recursive: true, force: true })
cpSync(join(REPO, 'dsh_squad', 'cases', 'math', '.agents'), join(PROJECT, '.agents'), { recursive: true })

async function session() {
  const login = readFileSync(join(PROJECT, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)
  const base = new URL(login).origin
  const cookie = (await fetch(login, { redirect: 'manual' })).headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
  const raw = async (route, endpoint, payload = {}) => {
    const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint, payload }) })
    return response.text()
  }
  const call = async (route, endpoint, payload) => {
    const out = JSON.parse(await raw(route, endpoint, payload))
    if (!out.ok) throw new Error(out.error?.message)
    return out.value
  }
  return { ui: (endpoint, payload) => call('/api/squad-adapter', `ui/${endpoint}`, payload), bot: (endpoint, payload) => call('/api/bot', endpoint, payload), raw }
}

try {
  run('up', PROJECT, '--mock', '--port', port)
  let { ui, bot, raw } = await session()
  await bot('state')

  console.log('== M3-config the editor goes through the Controller')
  const { files } = await ui('config')
  const team = files.find(file => file.path === 'teams/math/team.json')
  const instructions = files.find(file => file.path === 'teams/math/instructions.md')
  check(files.length >= 10 && !files.some(file => file.path.includes('.runtime')), 'the editable files are listed, the runtime is not')
  const ghost = team.content.replace('"role_ref": "checker"', '"role_ref": "ghost"')
  const bad = await refused(ui('config-save', { edits: [{ path: team.path, content: ghost, expected_hash: team.hash }] }))
  check(/CONFIG_INVALID|ghost|invalid member/.test(bad ?? ''), 'a Team naming a missing role is refused', bad)
  check(readFileSync(join(PROJECT, '.agents/dshsquad/teams/math/team.json'), 'utf8') === team.content, 'and nothing was written')
  await ui('config-save', { edits: [{ path: instructions.path, content: '只做验证。\n', expected_hash: instructions.hash }], validateOnly: true })
  check(readFileSync(join(PROJECT, '.agents/dshsquad/teams/math/instructions.md'), 'utf8') === instructions.content, 'validate-only writes nothing')
  await ui('config-save', { edits: [{ path: instructions.path, content: `${instructions.content.trim()} 例子贴近生活。\n`, expected_hash: instructions.hash }] })
  const version = JSON.parse(readFileSync(join(PROJECT, '.agents/dshsquad/teams/math/team.json'), 'utf8')).config_version
  check(version === 2, 'saving the instructions raised the Team config_version', version)
  const stale = await refused(ui('config-save', { edits: [{ path: instructions.path, content: 'x\n', expected_hash: instructions.hash }] }))
  check(/CONFIG_CHANGED/.test(stale ?? ''), 'a save against an older read is refused', stale)

  console.log('== M3-run the page starts a Run and follows it')
  const bound = await ui('bind-team', { teamId: 'math' })
  check(bound.members.length === 5, 'the Team is bound to its group from the page')
  await until(async () => ((await ui('view')).snapshot.views.agents ?? []).filter(agent => agent.presence === 'online').length >= 5, 60_000, 500)
  let projection = acceptSnapshot(EMPTY, (await ui('view')).snapshot)
  const requestId = `m3-${Date.now().toString(36)}`
  const first = await ui('start-run', { requestId, teamId: 'math', goal: '认识分数（五年级）' })
  const again = await ui('start-run', { requestId, teamId: 'math', goal: '认识分数（五年级）' })
  check(first.run_id === again.run_id, 'a second click with the same request makes no second Run')
  const page = await ui('events', { after: projection.revision })
  check(readEvents(projection, page).resnapshot, 'events past the copy ask for a fresh snapshot')
  projection = acceptSnapshot(projection, (await ui('view')).snapshot)
  const current = projection.snapshot.views.runs.find(r => r.run_id === first.run_id)
  const old = await refused(ui('operate', { kind: 'run', id: first.run_id, op: 'guidance', body: { request_id: `g-old-${Date.now()}`, expected_revision: current.revision - 1, note: '旧卡片' } }))
  check(old !== undefined, 'guidance against an older Run revision is refused (DSH-M3-02)', old)
  const fresh = await refused(ui('operate', { kind: 'run', id: first.run_id, op: 'guidance', body: { request_id: `g-new-${Date.now()}`, expected_revision: current.revision, note: '例子用披萨' } }))
  check(fresh === undefined || /REVISION|CONFLICT|changed/i.test(fresh), 'guidance against the current revision goes through (or lost a race to the Run)', fresh)
  const notListed = await refused(ui('operate', { kind: 'role', id: 'builder', op: 'release', body: {} }))
  check(/not allowed/.test(notListed ?? ''), 'an operation outside the page list is refused', notListed)
  const approval = await refused(ui('approve', { approvalId: 'nope', attemptId: 'attempt-x', expectedRevision: 1, choice: 'allow' }))
  check(/no longer open/.test(approval ?? ''), 'an approval card that is gone cannot be answered', approval)
  const finished = await until(async () => {
    const r = (await ui('view')).snapshot.views.runs.find(candidate => candidate.run_id === first.run_id)
    return ['completed', 'failed', 'cancelled', 'interrupted'].includes(r?.phase) ? r : undefined
  }, 300_000, 1000)
  check(finished?.phase === 'completed', 'the Run started from the page completed', finished?.phase)
  const viewText = await raw('/api/squad-adapter', 'ui/view', {})
  const token = readFileSync(join(PROJECT, '.agents/dshsquad/.runtime/operator.token'), 'utf8').trim()
  check(!viewText.includes(token), 'the operator credential never reaches the page')

  console.log('== M3-restart a restarted Controller is noticed and read again (DSH-M3-01)')
  projection = acceptSnapshot(projection, (await ui('view')).snapshot)
  const epoch = projection.epoch
  execFileSync('sh', ['-c', `kill -TERM -$(cat '${join(PROJECT, '.dsh-squad/run/controller.pid')}')`])
  await until(() => { try { execFileSync('sh', ['-c', `kill -0 -$(cat '${join(PROJECT, '.dsh-squad/run/controller.pid')}') 2>/dev/null`]); return false } catch { return true } }, 15_000, 300)
  run('up', PROJECT, '--mock', '--port', port)
  const pageAfter = await until(async () => { try { return await ui('events', { after: projection.revision }) } catch { return undefined } }, 30_000, 500)
  check(readEvents(projection, pageAfter).resnapshot && pageAfter?.controller_epoch !== epoch, 'the new epoch asks for a fresh snapshot', { before: epoch, after: pageAfter?.controller_epoch })
  const next = acceptSnapshot(projection, (await ui('view')).snapshot)
  check(next.epoch !== epoch && next.snapshot.views.runs.some(r => r.run_id === first.run_id && r.phase === 'completed'), 'the fresh snapshot replaces the old one and still shows the finished Run')

  console.log('== M3-reports published experiment reports are listed')
  const reports = join(PROJECT, '.dsh-squad', 'reports')
  mkdirSync(reports, { recursive: true })
  writeFileSync(join(reports, 'exp-test.json'), JSON.stringify({ schema: 'dsh-squad-experiment/1', id: 'exp-test', mock: true, groups: [] }))
  const listed = await ui('reports')
  check(listed.some(report => report.id === 'exp-test'), 'the report is listed for the page')
} catch (error) {
  check(false, `error: ${error.message}`)
} finally {
  run('down', PROJECT)
}
console.log(failures.length === 0 ? 'M3: all checks pass' : `M3: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
