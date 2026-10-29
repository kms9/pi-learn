import { test } from 'node:test'
import assert from 'node:assert/strict'
import { artifactLines, digestOf, htmlArtifact } from '../src/artifacts.js'

const store = new Map([
  ['aa'.repeat(32), Buffer.from('<!doctype html><p>page</p>')],
  ['bb'.repeat(32), Buffer.from('%PDF-1.4 binary')],
])
const read = async hex => {
  if (!store.has(hex)) throw new Error('missing')
  return store.get(hex)
}

test('the digest is read from either form the Controller states', () => {
  assert.equal(digestOf({ sha256: `sha256/${'cd'.repeat(32)}` }), 'cd'.repeat(32))
  assert.equal(digestOf({ sha256: `sha256:${'cd'.repeat(32)}` }), 'cd'.repeat(32))
})

test('a text artifact is shown to the reader; other media are named only', async () => {
  const lines = await artifactLines({
    artifacts: [
      { name: 'lesson.html', media_type: 'text/html', sha256: `sha256/${'aa'.repeat(32)}` },
      { name: 'notes.pdf', media_type: 'application/pdf', sha256: `sha256/${'bb'.repeat(32)}` },
    ],
  }, read)
  assert.equal(lines[0], `artifact lesson.html (text/html, sha256 ${'aa'.repeat(6)}):`)
  assert.equal(lines[1], '<!doctype html><p>page</p>')
  assert.equal(lines[2], 'artifact notes.pdf (application/pdf): not shown')
})

test('a long artifact is cut at the limit, and a missing one is named unavailable', async () => {
  const lines = await artifactLines({
    artifacts: [
      { name: 'lesson.html', media_type: 'text/html', sha256: `sha256/${'aa'.repeat(32)}` },
      { name: 'gone.txt', media_type: 'text/plain', sha256: `sha256/${'ee'.repeat(32)}` },
    ],
  }, read, 10)
  assert.equal(lines[1], '<!doctype \n[cut at 10 characters]')
  assert.equal(lines[2], 'artifact gone.txt: unavailable')
})

test('a result without artifacts shows nothing', async () => {
  assert.deepEqual(await artifactLines(undefined, read), [])
  assert.deepEqual(await artifactLines({ artifacts: [] }, read), [])
})

test('the HTML artifact of a result is found among its artifacts', async () => {
  const html = await htmlArtifact({ artifacts: [{ name: 'x.pdf', media_type: 'application/pdf', sha256: `sha256/${'bb'.repeat(32)}` }, { name: 'lesson.html', media_type: 'text/html', sha256: `sha256/${'aa'.repeat(32)}` }] }, read)
  assert.equal(html, '<!doctype html><p>page</p>')
  assert.equal(await htmlArtifact({ artifacts: [] }, read), undefined)
})
