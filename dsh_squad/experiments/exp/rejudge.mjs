// Re-judges the stored final artifacts of a report with the current judge (plan §6: the
// artifacts are kept, the verdicts are judged again). The first time a report is re-judged,
// its previous version is kept next to it as <report>.judge-v<old>.json.
//
//   node dsh_squad/experiments/exp/rejudge.mjs dsh_squad/experiments/exp/reports/<report>.json
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { judgeExp01 } from './judges/exp01.mjs'

const JUDGES = { exp01: judgeExp01 }
const [file] = process.argv.slice(2)
if (!file) {
  console.error('usage: rejudge.mjs <report.json>')
  process.exit(2)
}
const report = JSON.parse(readFileSync(file, 'utf8'))
const judge = JUDGES[report.experiment]
if (!judge) {
  console.error(`no judge for ${report.experiment}`)
  process.exit(2)
}
const artifact = report.task.artifact
const versions = new Set()
for (const record of report.runs) {
  if (record.discarded_first === true || record.final?.accepted === undefined) continue
  const path = `${record.project}/final/${artifact}`
  if (!existsSync(path)) {
    console.log(`${record.arm} ${record.repeat}: no stored artifact, left as it was`)
    continue
  }
  if (record.judge) versions.add(record.judge.version)
  const runs = []
  for (let round = 0; round < 3; round += 1) runs.push(await judge(path))
  const first = JSON.stringify(runs[0].checks.map(c => [c.id, c.ok]))
  record.judge = { ...runs[0], consistent: runs.every(r => JSON.stringify(r.checks.map(c => [c.id, c.ok])) === first) }
  delete record.judge_error
  record.goal_success = record.final.accepted === true && record.judge.must_passed === true
  console.log(`${record.arm} ${record.repeat}: goal_success=${record.goal_success} coverage=${record.judge.requirement_coverage.toFixed(3)} consistent=${record.judge.consistent}`)
}
if (versions.size > 0) {
  const kept = `${file.replace(/\.json$/, '')}.judge-v${[...versions].join('-')}.json`
  if (!existsSync(kept)) copyFileSync(file, kept)
  console.log(`previous verdicts kept in ${kept}`)
}
writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)
console.log(`report updated: ${file}`)
