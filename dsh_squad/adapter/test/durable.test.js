import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { decodeFrames, durableTurnEnd, readSessionEvents, sessionLogPath } from '../src/durable.js'

const lines = events => `${events.map(event => JSON.stringify(event)).join('\n')}\n`

test('every frame of a multi-frame log is decoded, not only the first', () => {
  const frames = [
    [{ type: 'session', id: 's1' }],
    [{ type: 'turn/start', data: { turn: 1 } }, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } }],
    [{ type: 'turn/start', data: { turn: 2 } }],
    [{ type: 'turn/end', data: { turn: 2, reason: { kind: 'interrupted' } } }],
  ]
  const buffer = Buffer.concat(frames.map(events => zstdCompressSync(Buffer.from(lines(events)))))
  const decoded = decodeFrames(buffer).trim().split('\n').map(line => JSON.parse(line))
  assert.equal(decoded.length, 5)
  assert.deepEqual(durableTurnEnd(decoded, 1), { started: true, kind: 'completed' })
  assert.deepEqual(durableTurnEnd(decoded, 2), { started: true, kind: 'interrupted' })
  assert.deepEqual(durableTurnEnd(decoded, 3), { started: false, kind: undefined })
})

test('a Session log is found under any workspace of DSH_HOME', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'squad-durable-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  assert.equal(sessionLogPath(home, 'session-x'), undefined)
  assert.deepEqual(readSessionEvents(home, 'session-x'), [])
  const dir = join(home, 'sessions', '--some-workspace--', 'session-x')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'session.v4.jsonl.zstd'), Buffer.concat([
    zstdCompressSync(Buffer.from(lines([{ type: 'turn/start', data: { turn: 1 } }]))),
    zstdCompressSync(Buffer.from(lines([{ type: 'turn/end', data: { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } } }]))),
  ]))
  assert.equal(durableTurnEnd(readSessionEvents(home, 'session-x'), 1).kind, 'aborted')
})
