// Token use per scenario of a probe run: turn calls from the probe's assistant/message
// usage, auxiliary calls (memory, steward, handoff notes, titles…) from DS Bot's usage
// ledger rows that it metered live. Each call is put in the scenario whose time window
// holds it. Writes <dir>/tokens.json and prints a Markdown table.
//
//   node probes/tokens.mjs <bench-name> <scenario-dir>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { PROBES } from './lib.mjs'

const [name, dirArg] = process.argv.slice(2)
const dir = join(PROBES, dirArg ?? 'scenarios-real')
const home = join(PROBES, '.run', name)
const metas = readdirSync(dir).filter(file => file.endsWith('.meta.json')).map(file => JSON.parse(readFileSync(join(dir, file), 'utf8')))
const windowOf = time => metas.find(meta => time >= Date.parse(meta.startTs) && time <= Date.parse(meta.endTs))?.id ?? '(between scenarios)'
const zero = () => ({ calls: 0, input: 0, cacheRead: 0, output: 0 })
const rows = {}
const add = (id, kind, call) => {
  const row = (rows[id] ??= { turn: zero(), aux: zero(), auxKinds: {} })
  const bucket = row[kind]
  bucket.calls += 1
  bucket.input += call.input
  bucket.cacheRead += call.cacheRead
  bucket.output += call.output
  if (kind === 'aux') row.auxKinds[call.kind] = (row.auxKinds[call.kind] ?? 0) + 1
}

for (const meta of metas) {
  for (const line of readFileSync(join(dir, `${meta.id}.jsonl`), 'utf8').split('\n').filter(Boolean)) {
    const event = JSON.parse(line)
    if (event.event !== 'session/event' || event.type !== 'assistant/message' || event.usage === undefined) continue
    add(meta.id, 'turn', { input: event.usage.inputTokens ?? 0, cacheRead: event.usage.cacheReadTokens ?? 0, output: event.usage.outputTokens ?? 0 })
  }
}
const db = new DatabaseSync(join(home, 'bot', 'usage.sqlite'), { readOnly: true })
for (const call of db.prepare('select time, kind, input, cache_read, output from calls where live = 1').all()) {
  add(windowOf(call.time), 'aux', { kind: call.kind, input: call.input, cacheRead: call.cache_read, output: call.output })
}

const total = { turn: zero(), aux: zero() }
for (const row of Object.values(rows)) for (const kind of ['turn', 'aux']) for (const key of Object.keys(total[kind])) total[kind][key] += row[kind][key]
writeFileSync(join(dir, 'tokens.json'), `${JSON.stringify({ rows, total }, null, 2)}\n`)
const fmt = bucket => `${bucket.calls} | ${bucket.input} | ${bucket.cacheRead} | ${bucket.output}`
console.log('| 场景 | 回合调用 | 回合 input | 回合 cache read | 回合 output | 辅助调用 | 辅助 input | 辅助 cache read | 辅助 output | 辅助种类 |')
console.log('|---|---|---|---|---|---|---|---|---|---|')
for (const [id, row] of Object.entries(rows).sort()) console.log(`| ${id} | ${fmt(row.turn)} | ${fmt(row.aux)} | ${Object.entries(row.auxKinds).map(([kind, count]) => `${kind}×${count}`).join(' ')} |`)
console.log(`| **合计** | ${fmt(total.turn)} | ${fmt(total.aux)} | |`)
