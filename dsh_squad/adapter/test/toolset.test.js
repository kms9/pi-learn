import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pathRefusal } from '../src/toolset.js'

test('file tools in a formal attempt reach only the project and the workspace (DSH-M1-08)', () => {
  const roots = ['/home/u/.dsh/bot/workspace', '/srv/project']
  assert.equal(pathRefusal('read', { file_path: 'notes/a.md' }, roots), undefined)
  assert.equal(pathRefusal('read', { file_path: '/srv/project/.agents/x.md' }, roots), undefined)
  assert.match(pathRefusal('read', { file_path: '/etc/hostname' }, roots), /may not reach/)
  assert.match(pathRefusal('read', { file_path: '../../../../etc/passwd' }, roots), /may not reach/)
  assert.match(pathRefusal('read', { file_path: '/srv/projectile/x' }, roots), /may not reach/, 'a sibling with the same prefix is outside')
  assert.match(pathRefusal('read_image', { path: '/root/a.png' }, roots), /may not reach/)
  assert.match(pathRefusal('glob', { path: '/', pattern: '*' }, roots), /may not reach/)
  assert.match(pathRefusal('glob', { pattern: '/etc/**' }, roots), /may not reach/)
  assert.equal(pathRefusal('glob', { pattern: '**/*.md' }, roots), undefined)
  assert.match(pathRefusal('grep', { path: '/var/log', pattern: 'x' }, roots), /may not reach/)
  assert.match(pathRefusal('write', { file_path: '/tmp/x' }, roots), /may not reach/)
  // A symlink inside the workspace that points out is followed first.
  const real = path => (path === '/home/u/.dsh/bot/workspace/link' ? '/etc' : path)
  assert.match(pathRefusal('read', { file_path: 'link' }, roots, real), /may not reach/)
  assert.equal(pathRefusal('squad_task', {}, roots), undefined)
})

test('a review handed in as a plain result keeps only its verdict', async () => {
  const { reviewVerdict } = await import('../src/reports.js')
  assert.deepEqual(reviewVerdict({ decision: 'Accepted', reason: ' ok ', candidates: [{ hash: 'file-sha' }] }), { decision: 'accepted', reason: 'ok' })
  assert.deepEqual(reviewVerdict({ decision: 'rejected' }), { decision: 'rejected', reason: '(no reason)' })
  assert.equal(reviewVerdict({ answer: 'looks fine' }), undefined)
  assert.equal(reviewVerdict('accepted'), undefined)
})
