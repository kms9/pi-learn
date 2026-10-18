// The durable session log, read back: DSH v4 writes each Session to
// $DSH_HOME/sessions/<workspace>/<sessionId>/session.v4.jsonl.zstd as concatenated zstd
// frames (one per flush). Node's decoder stops after the first frame, so each frame is
// decoded on its own.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]

export function decodeFrames(buffer) {
  const starts = []
  for (let index = 0; index <= buffer.length - 4; index += 1) {
    if (buffer[index] === MAGIC[0] && buffer[index + 1] === MAGIC[1] && buffer[index + 2] === MAGIC[2] && buffer[index + 3] === MAGIC[3]) starts.push(index)
  }
  let text = ''
  let frame = 0
  while (frame < starts.length) {
    // The magic bytes can also occur inside a frame's payload: a candidate that does not
    // decode is joined with the next one.
    let end = frame + 1
    let decoded
    while (decoded === undefined && end <= starts.length) {
      try {
        decoded = zstdDecompressSync(buffer.subarray(starts[frame], starts[end] ?? buffer.length)).toString('utf8')
      } catch {
        end += 1
      }
    }
    if (decoded !== undefined) text += decoded
    frame = end
  }
  return text
}

export function sessionLogPath(dshHome, sessionId) {
  const root = join(dshHome, 'sessions')
  if (!existsSync(root)) return undefined
  for (const workspace of readdirSync(root)) {
    const path = join(root, workspace, sessionId, 'session.v4.jsonl.zstd')
    if (existsSync(path)) return path
  }
  return undefined
}

export function readSessionEvents(dshHome, sessionId) {
  const path = sessionLogPath(dshHome, sessionId)
  if (path === undefined) return []
  const events = []
  for (const line of decodeFrames(readFileSync(path)).split('\n')) {
    if (line.trim() === '') continue
    try { events.push(JSON.parse(line)) } catch { /* a torn last line */ }
  }
  return events
}

// The end the durable log holds for one turn: its kind, or undefined when the log has
// none (yet). `started` says whether the turn is in the log at all.
export function durableTurnEnd(events, turn) {
  const started = events.some(event => event.type === 'turn/start' && event.data?.turn === turn)
  const end = events.findLast(event => event.type === 'turn/end' && event.data?.turn === turn)
  return { started, kind: end?.data?.reason?.kind }
}
