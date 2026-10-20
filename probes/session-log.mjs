// Reading DSH session logs (session.v4.jsonl.zstd: zstd frames of JSON lines) for
// evidence: which route each model request used, and what each assistant said.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** Every record of one session log, in order. */
export function readSessionLog(file) {
  const buf = readFileSync(file)
  const starts = []
  for (let i = buf.indexOf(MAGIC); i !== -1; i = buf.indexOf(MAGIC, i + 4)) starts.push(i)
  let text = ''
  for (let k = 0; k < starts.length; k += 1) {
    try { text += zstdDecompressSync(buf.subarray(starts[k], starts[k + 1] ?? buf.length)).toString() } catch { /* a frame cut by a write in progress */ }
  }
  return text.split('\n').filter(Boolean).map((line) => { try { return JSON.parse(line) } catch { return undefined } }).filter(Boolean)
}

/** Session id → its records, for every session under a DSH home. */
export function sessionLogs(home) {
  const out = new Map()
  const walk = (dir) => {
    let names = []
    try { names = readdirSync(dir) } catch { return }
    for (const name of names) {
      const path = join(dir, name)
      if (name === 'session.v4.jsonl.zstd') out.set(dir.split('/').at(-1), readSessionLog(path))
      else if (statSync(path).isDirectory()) walk(path)
    }
  }
  walk(join(home, 'sessions'))
  return out
}

/** The route of every model request: from request headers, and selections in between. */
export function routesOf(records) {
  return records.flatMap((record) => {
    const config = record.type === 'request/header' ? record.data?.header?.config : record.type === 'model/selection' ? record.data : undefined
    return config ? [{ type: record.type, time: record.time, provider: config.provider, model: config.model, effort: config.reasoningEffort }] : []
  })
}

/** What the assistant said (text only, reasoning left out), with times. */
export function repliesOf(records) {
  return records.filter(record => record.type === 'assistant/message').map(record => ({
    time: record.time,
    text: (record.data?.message?.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n'),
    tools: (record.data?.message?.content ?? []).filter(block => block.type === 'toolCall' || block.type === 'tool_use' || block.type === 'tool-call').map(block => block.name),
  }))
}
