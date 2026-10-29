import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { checkPage } from '../src/pagecheck.js'

// The headless browser is installed outside the repository (see src/pagecheck.js).
const tools = process.env.DSH_EXP_TOOLS ?? join(homedir(), '.cache/dsh-exp-tools')
let installed = true
try { createRequire(join(tools, 'package.json'))('puppeteer-core') } catch { installed = false }
const skip = installed ? false : 'puppeteer-core is not installed under DSH_EXP_TOOLS'

test('the page check reports overflow, unnamed controls, outside requests and console errors', { skip, timeout: 60_000 }, async () => {
  const out = await checkPage('<!doctype html><html><body><div style="width:900px">wide</div><input id="q"><img src="https://example.invalid/x.png"><script>console.error("boom")</script></body></html>')
  assert.match(out, /external requests \(blocked\): 1/)
  assert.match(out, /console errors: boom/)
  assert.match(out, /375 px: horizontal overflow yes/)
  assert.match(out, /1280 px: horizontal overflow no/)
  assert.match(out, /controls without an accessible name: input#q/)
})

test('a labelled page is clean', { skip, timeout: 60_000 }, async () => {
  const out = await checkPage('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><label for="a">A</label><input id="a" type="range"><button>Go</button><p>Hello</p></body></html>')
  assert.match(out, /external requests \(blocked\): none/)
  assert.match(out, /console errors: none/)
  assert.match(out, /controls without an accessible name: none/)
  assert.match(out, /visible text \(1280 px\): .*Hello/)
})

test('an empty page is refused before any browser starts', async () => {
  assert.match(await checkPage('  '), /give the HTML/)
})
