// Markdown summary of an experiment report (plan §1.5, §1.6): every run, then per arm the
// count of successes, the median and range of requirement coverage, and the median time.
// It states no p-values: with these sample sizes a difference is only written when the arms'
// ranges do not overlap (plan §1.5).
//
//   node dsh_squad/experiments/exp/summarize.mjs <report.json> [> summary.md]
import { readFileSync } from 'node:fs'

const [file] = process.argv.slice(2)
if (!file) {
  console.error('usage: summarize.mjs <report.json>')
  process.exit(2)
}
const report = JSON.parse(readFileSync(file, 'utf8'))
const runs = report.runs.filter(r => r.discarded_first !== true && r.environment_interrupted !== true)
const discarded = report.runs.length - runs.length

const median = xs => {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
const range = xs => (xs.length === 0 ? null : [Math.min(...xs), Math.max(...xs)])
const pct = x => (x === null ? '-' : `${Math.round(x * 100)}%`)
const fmt = x => (x === null ? '-' : x.toFixed(2))
const failedChecks = run => (run.judge?.checks ?? []).filter(c => !c.ok).map(c => c.id).join(' ')

const lines = []
lines.push(`# ${report.title}`, '')
lines.push(`- 报告：\`${report.id}\``)
lines.push(`- 模式：${report.mock ? '**mock，只验证流程，数字不代表真实效果**' : `真实运行，${report.model.provider} / ${report.model.model}，effort ${report.model.effort}`}`)
lines.push(`- 每组重复：${report.repeats} 次；环境中断后重跑的记录：${discarded} 条（已从下表排除，报告 JSON 中保留）`)
lines.push('')
lines.push('## 每次运行')
lines.push('')
lines.push('| arm | 轮次 | 序号 | 结果 | 用时（s） | 验收 | 必过检查 | 覆盖率 | 未通过的检查 | 判题版本 |')
lines.push('|---|---|---|---|---|---|---|---|---|---|')
for (const run of runs) {
  const j = run.judge
  lines.push(`| ${run.arm} | ${run.repeat} | ${run.order ?? '-'} | ${run.outcome} | ${fmt(run.seconds)} | ${run.final?.accepted ? '是' : '否'} | ${j ? (j.must_passed ? '是' : '否') : '-'} | ${j ? pct(j.requirement_coverage) : '-'} | ${failedChecks(run) || '-'} | ${j?.version ?? '-'} |`)
}
lines.push('')
lines.push('## 每组汇总')
lines.push('')
lines.push('| arm | Goal Success | 覆盖率 中位数 | 覆盖率 范围 | 用时 中位数（s） | 用时 范围（s） |')
lines.push('|---|---|---|---|---|---|')
for (const arm of report.arms) {
  const mine = runs.filter(r => r.arm === arm)
  const ok = mine.filter(r => r.goal_success === true).length
  const coverage = mine.map(r => r.judge?.requirement_coverage).filter(x => typeof x === 'number')
  const seconds = mine.map(r => r.seconds).filter(x => typeof x === 'number')
  const r = range(coverage)
  const sr = range(seconds)
  lines.push(`| ${arm} | ${ok}/${mine.length} | ${pct(median(coverage))} | ${r ? `${pct(r[0])}～${pct(r[1])}` : '-'} | ${fmt(median(seconds))} | ${sr ? `${fmt(sr[0])}～${fmt(sr[1])}` : '-'} |`)
}
lines.push('')
lines.push('完整的运行明细、判题检查和失败归因在报告 JSON 中。样本小，不报显著性；只有两组范围不重叠时才写「优于」。')
console.log(lines.join('\n'))
