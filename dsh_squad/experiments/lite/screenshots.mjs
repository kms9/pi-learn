// Screenshots of the Squad page for one finished run (feat/dsh-exp-lite), headless Chrome.
// Needs the project's stack up (dsh-squad up <project> --port N); takes the login address
// from the project's web log. Captures: the Runs list, the task tree of the run, one node's
// detail (the Builder node that was superseded by reworks), and the team configuration tab.
//
//   node dsh_squad/experiments/lite/screenshots.mjs <project dir> <out dir> <prefix> <node-title>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch } from './judges/browser.mjs'

const [project, outDir, prefix, nodeWord = 'Builder'] = process.argv.slice(2)
const log = readFileSync(join(project, '.dsh-squad/logs/web.log'), 'utf8')
const login = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)
const wait = ms => new Promise(done => setTimeout(done, ms))
const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 860 })
await page.goto(login, { waitUntil: 'networkidle2', timeout: 90_000 })
await page.waitForSelector('button.sq-foot', { timeout: 60_000 })
await page.$eval('button.sq-foot', el => el.click())
await wait(2000)
await page.screenshot({ path: join(outDir, `${prefix}-01-runs.png`) })
await page.evaluate(() => [...document.querySelectorAll('.sq-item')].find(e => /认识分数/.test(e.innerText))?.click())
await wait(3000)
await page.screenshot({ path: join(outDir, `${prefix}-02-tree.png`) })
const opened = await page.evaluate(word => {
  const nodes = [...document.querySelectorAll('.sq-node')].filter(e => e.innerText.includes(word))
  const node = nodes.find(e => /替代|已停止|返工/.test(e.innerText)) ?? nodes[0]
  node?.click()
  return Boolean(node)
}, nodeWord)
await wait(2000)
await page.screenshot({ path: join(outDir, `${prefix}-03-node-${nodeWord.toLowerCase()}.png`) })
await page.evaluate(() => [...document.querySelectorAll('.sq-tab')].find(e => e.innerText.trim() === '小队与规则')?.click())
await wait(2500)
await page.screenshot({ path: join(outDir, `${prefix}-04-team.png`) })
await page.evaluate(() => [...document.querySelectorAll('.sq-item')].find(e => /^\s*math/.test(e.innerText))?.click())
await wait(2500)
await page.screenshot({ path: join(outDir, `${prefix}-05-team-detail.png`) })
console.log(`captured; node opened: ${opened}`)
await browser.close()
