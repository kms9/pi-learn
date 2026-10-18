// Turns each probes/scenarios/<id>.jsonl into <id>.timeline.md: one line per gate-relevant
// event (inbox, step admission, model route, tool dispatch, turn end, idle, session log
// lines that matter), with the Bot/group each Session belongs to.
//
//   node probes/analyze.mjs [scenario ...]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'scenarios')
const only = process.argv.slice(2)
const KEPT_SESSION_TYPES = new Set(['turn/start', 'turn/end', 'step/start', 'step/end', 'tool/call', 'tool/result', 'user/message', 'agent/inbox/spliced', 'model/selection', 'compaction/start', 'compaction/end', 'turn/interrupted'])

// Unknown Sessions get stable short names; a Session the probe could not attribute when the
// line was written is marked with `?`, which is itself a finding (the seam gap).
const short = id => (id ?? '').replace(/^session-/, '').slice(0, 8)
const who = (line, names) => {
  if (line.owner) {
    const label = `${line.owner.bot ?? ''}${line.owner.room ? `@${line.owner.room}` : ''}${line.owner.place === 'group-own' ? '(group)' : ''}${line.owner.place === 'chat-part' ? '(old part)' : ''}`
    names.set(line.session, label)
    return label
  }
  return line.session ? `${names.get(line.session) ?? '?'}[${short(line.session)}]` : '-'
}
const src = source => (source && typeof source === 'object' ? [source.kind, source.role, source.resumed ? 'resumed' : '', source.retried ? 'retried' : ''].filter(Boolean).join(':') : '')

function describe(line) {
  switch (line.event) {
    case 'agent/inbox/inserted':
    case 'agent/inbox/claimed':
    case 'agent/inbox/discarded':
      return `${src(line.message?.source)} "${(line.message?.text ?? '').replace(/\s+/g, ' ').slice(0, 60)}"`
    case 'agent/pre-step:in':
      return `turn ${line.turn} step ${line.step} msgs=[${(line.messages ?? []).map(message => src(message.source)).join(',')}]`
    case 'agent/pre-step:out':
      return `decision=${line.decision} entered=${line.entered ?? 0}`
    case 'agent/request:out':
      return `${line.route?.provider}/${line.route?.model}${line.route?.effort ? ` effort=${line.route.effort}` : ''}`
    case 'tools/pre-execute:out':
      return `decision=${line.decision?.kind ?? JSON.stringify(line.decision)}`
    case 'tools/pre-execute:in':
    case 'tools/execute:in':
      return `${line.tool}${line.parentCall ? ` (nested in ${short(line.parentCall)})` : ''}`
    case 'tools/execute:out':
    case 'tools/execute:throw':
      return `${line.ms} ms${line.isError ? ' error' : ''}${line.error ? ` ${JSON.stringify(line.error)}` : ''}`
    case 'tools/result':
      return `${line.tool}${line.isError ? ' error' : ''}`
    case 'agent/status':
      return String(typeof line.status === 'object' ? JSON.stringify(line.status) : line.status)
    case 'agent/turn-stopping':
      return `inbox nextStep=${line.inbox?.nextStep ?? '?'} nextTurn=${line.inbox?.nextTurn ?? '?'}`
    case 'probe/when-idle':
      return `after ${line.waitedMs} ms`
    case 'llm/stream':
      return `${line.purpose ? `purpose=${line.purpose} ` : ''}msgs=${line.messages ?? '?'} tools=${line.tools ?? 0}`
    case 'session/event': {
      const data = line.data ?? {}
      if (line.type === 'user/message') return `${line.type} ${src(line.source)} "${(line.text ?? '').replace(/\s+/g, ' ').slice(0, 50)}"`
      if (line.type === 'turn/end') return `${line.type} ${JSON.stringify(data.reason ?? '')}`
      if (line.type === 'agent/inbox/spliced') return `${line.type} ${data.target} +${Array.isArray(data.inserted) ? data.inserted.length : String(data.inserted ?? '').replace(/\D/g, '') || 0} -${data.removedCount ?? 0}`
      return `${line.type}${data.turn !== undefined ? ` turn ${data.turn}` : ''}${data.step !== undefined ? ` step ${data.step}` : ''}`
    }
    case 'session/created':
      return 'new Session'
    case 'agent/created':
      return `source=${JSON.stringify(line.source)}`
    case 'agent/error':
      return JSON.stringify(line.error)
    default:
      return ''
  }
}

const keep = line => line.event !== 'session/event' || KEPT_SESSION_TYPES.has(line.type)

for (const file of readdirSync(DIR).filter(name => name.endsWith('.jsonl')).sort()) {
  const id = file.replace(/\.jsonl$/, '')
  if (only.length > 0 && !only.includes(id)) continue
  const meta = JSON.parse(readFileSync(join(DIR, `${id}.meta.json`), 'utf8'))
  const events = readFileSync(join(DIR, file), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
  // First pass learns each Session's owner from any line that had one.
  const names = new Map()
  for (const line of events) if (line.owner) who(line, names)
  const rows = []
  let pid
  for (const line of events.filter(keep)) {
    if (line.pid !== pid) {
      rows.push(`| | | **host pid ${line.pid}** | | |`)
      pid = line.pid
    }
    const unattributed = line.session && !line.owner ? ' ⚠' : ''
    rows.push(`| ${line.seq} | ${line.ts.slice(11, 23)} | ${who(line, names)}${unattributed} | \`${line.event}\` | ${describe(line).replace(/\|/g, '\\|')} |`)
  }
  const actions = meta.actions.map(action => `- ${action.ts.slice(11, 23)} ${action.what}${action.model ? ` (${action.model})` : ''}${action.bot ? ` (${action.bot})` : ''}${action.segments !== undefined ? ` (parts=${action.segments})` : ''}`).join('\n')
  const counts = Object.entries(meta.counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => `\`${name}\` ${count}`).join(' · ')
  const doc = `# ${id}: ${meta.title}

- 结果: **${meta.result}**${meta.error ? ` — ${meta.error}` : ''}
- 时间窗: ${meta.startTs} → ${meta.endTs}
- 事件数: ${meta.eventCount}（原始序列 [${file}](${file})）
- 计数: ${counts}

## 操作

${actions}

## 时间线（过滤后；⚠ = 该行写入时探针无法从 DS Bot 公开状态归属 Session）

| seq | 时间 | Session | 事件 | 摘要 |
|---|---|---|---|---|
${rows.join('\n')}
`
  writeFileSync(join(DIR, `${id}.timeline.md`), doc)
  console.log(`${id}: ${rows.length} rows`)
}
