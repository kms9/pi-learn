// Timeline of a free-mode group (S, A) from its DSH session logs: each user message, each
// assistant reply with its tool calls, and file writes (feat/dsh-exp-lite). Read-only.
//
//   node dsh_squad/experiments/lite/session-timeline.mjs <project dir>
import { sessionLogs } from '../../../probes/session-log.mjs'
import { join } from 'node:path'

const home = join(process.argv[2], '.dsh-squad/home')
const all = []
const ms = r => (typeof r.time === 'number' ? r.time : Date.parse(r.time))
for (const [session, records] of sessionLogs(home)) {
  for (const r of records) if (r.time) all.push({ session: session.slice(0, 16), ...r })
}
all.sort((a, b) => ms(a) - ms(b))
const t0 = ms(all.find(r => r.type === 'user/message'))
const at = r => ((ms(r) - t0) / 1000).toFixed(1)
const toolsOf = r => (r.data?.message?.content ?? []).filter(b => /tool/i.test(b.type ?? '')).map(b => `${b.name}${b.arguments?.path ? `(${b.arguments.path})` : ''}`)
for (const r of all) {
  if (r.type === 'user/message') {
    const text = (r.data?.content ?? []).filter(b => b.type === 'text').map(b => b.text).join(' ').replace(/\s+/g, ' ')
    console.log(`| ${at(r)} | user | ${r.session} | ${text.slice(0, 80)} |`)
  } else if (r.type === 'assistant/message') {
    const text = (r.data?.message?.content ?? []).filter(b => b.type === 'text').map(b => b.text).join(' ').replace(/\s+/g, ' ')
    const tools = toolsOf(r)
    console.log(`| ${at(r)} | assistant | ${r.session} | tools: ${tools.join(', ') || '-'}; text ${text.length} chars |`)
  }
}
