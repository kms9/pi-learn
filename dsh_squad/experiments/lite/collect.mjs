// Collects each run's courseware from the run's project and judges it with the same checks
// (judges/courseware.mjs). Writes a summary and screenshots into an output directory.
//
//   node dsh_squad/experiments/lite/collect.mjs <report.json> <out-dir>
//
// Where each deliverable comes from:
//   B, C  the Squad artifact the run's result carries (Controller content store, by sha256)
//   S, A  the newest .html in the Bot's workspace; if none, the HTML the assistant wrote in
//         its replies (from the DSH session log)
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { judgeCourseware } from './judges/courseware.mjs'
import { repliesOf, sessionLogs } from '../../../probes/session-log.mjs'

const [reportPath, outDir] = process.argv.slice(2)
if (!reportPath || !outDir) { console.error('usage: collect.mjs <report.json> <out-dir>'); process.exit(2) }
mkdirSync(outDir, { recursive: true })
const report = JSON.parse(readFileSync(reportPath, 'utf8'))

function newestHtml(dir) {
  let best
  const walk = (d) => {
    let names = []
    try { names = readdirSync(d) } catch { return }
    for (const name of names) {
      const path = join(d, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name.endsWith('.html') && (!best || statSync(path).mtimeMs > statSync(best).mtimeMs)) best = path
    }
  }
  walk(dir)
  return best
}

// The longest HTML document any assistant message in the run's sessions contains.
function htmlFromReplies(home) {
  let best = ''
  for (const records of sessionLogs(home).values()) {
    for (const reply of repliesOf(records)) {
      const start = reply.text.search(/<!doctype html|<html[\s>]/i)
      const end = reply.text.toLowerCase().lastIndexOf('</html>')
      if (start !== -1 && end > start) {
        const html = reply.text.slice(start, end + '</html>'.length)
        if (html.length > best.length) best = html
      }
    }
  }
  return best
}

function sourceOf(run, group) {
  const project = run.trace?.project ?? run.project
  if (group === 'B' || group === 'C') {
    const art = (run.trace?.artifacts ?? []).filter(a => /\.html$/.test(a.name)).at(-1)
    if (!art) return { file: null, note: 'no html artifact in the run result' }
    const hex = String(art.sha256).replace(/^sha256[/:]/, '')
    const file = join(project, '.dsh-squad/controller/artifacts/sha256', hex)
    return existsSync(file) ? { file, note: `squad artifact ${art.name} (accepted=${art.accepted})` } : { file: null, note: 'artifact file missing' }
  }
  const home = join(project, '.dsh-squad/home')
  const workspace = join(home, 'bot/workspace')
  const written = newestHtml(workspace)
  if (written) return { file: written, note: `file written in the bot workspace: ${written.split('/').at(-1)}` }
  const html = htmlFromReplies(home)
  if (!html) return { file: null, note: 'no html file and no html in replies' }
  const file = join(outDir, `${group}-extracted.html`)
  writeFileSync(file, html)
  return { file, note: 'html taken from the assistant reply text' }
}

const summary = { report: reportPath.split('/').at(-1), id: report.id, mock: report.mock, groups: [] }
for (const group of report.groups) {
  for (const [index, run] of group.runs.entries()) {
    const id = `${group.id}-${index + 1}`
    const source = sourceOf(run, group.id)
    const entry = { group: group.id, run: index + 1, outcome: run.outcome, seconds: run.seconds, model_calls: run.model_calls, tokens: run.tokens, reviews: run.reviews, reworks: run.reworks, source: source.note, judge: null, artifact: null }
    if (source.file) {
      const copied = join(outDir, `${id}.html`)
      rmSync(copied, { force: true })
      copyFileSync(source.file, copied)
      chmodSync(copied, 0o644)
      entry.artifact = `${id}.html`
      entry.judge = await judgeCourseware(copied, { shots: join(outDir, id) })
    }
    summary.groups.push(entry)
    console.log(`${id} ${entry.outcome} goal=${entry.judge?.goal_success ?? '-'} cov=${entry.judge ? entry.judge.requirement_coverage.toFixed(2) : '-'} ${source.note}`)
  }
}
writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
console.log(`summary: ${join(outDir, 'summary.json')}`)
