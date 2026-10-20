// Screenshots for the user guide that no acceptance script takes: the rules editors
// (Team, role, workflow), the experiment report tab, and the guidance box on a Run.
// Mock model, light and dark.
//
//   PUPPETEER_CORE=<dir> node probes/doc-shots.mjs [port] [shots-prefix] [report.json]
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PROBES } from './lib.mjs'

const [port = '3700', shots = '/tmp/squad-doc', report] = process.argv.slice(2)
const REPO = join(PROBES, '..')
const PROJECT = join(PROBES, '.run', 'doc-shots')
const CLI = join(REPO, 'dsh_squad', 'deploy', 'dsh-squad')
const run = (...args) => execFileSync(CLI, args, { encoding: 'utf8' })
const puppeteer = createRequire(join(process.env.PUPPETEER_CORE ?? '.', 'package.json'))('puppeteer-core')
const sleep = ms => new Promise(done => setTimeout(done, ms))
const loginOf = () => readFileSync(join(PROJECT, '.dsh-squad/logs/web.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)
const clickText = (page, selector, text) => page.$$eval(selector, (els, wanted) => { const el = els.find(candidate => candidate.innerText.trim().startsWith(wanted)); el?.click(); return Boolean(el) }, text)

rmSync(PROJECT, { recursive: true, force: true })
cpSync(join(REPO, 'dsh_squad', 'cases', 'math', '.agents'), join(PROJECT, '.agents'), { recursive: true })
if (report) {
  mkdirSync(join(PROJECT, '.dsh-squad', 'reports'), { recursive: true })
  cpSync(report, join(PROJECT, '.dsh-squad', 'reports', report.split('/').at(-1)))
}
let browser
try {
  run('up', PROJECT, '--mock', '--port', port)
  run('provision', PROJECT)
  browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  for (const scheme of ['light', 'dark']) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 960 })
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
    await page.goto(loginOf(), { waitUntil: 'networkidle2', timeout: 90_000 })
    await sleep(3000)
    await page.$eval('button.sq-foot', el => el.click())
    await sleep(1500)
    await clickText(page, '.sq-tab', '小队与规则')
    await sleep(1500)
    await clickText(page, '.sq-side .sq-item', 'math')
    await sleep(1000)
    await page.screenshot({ path: `${shots}-${scheme}-config-team.png` })
    await clickText(page, '.sq-side .sq-item', 'builder')
    await sleep(1000)
    await page.screenshot({ path: `${shots}-${scheme}-config-role.png` })
    await clickText(page, '.sq-side .sq-item', '流程 lesson')
    await sleep(1000)
    await page.screenshot({ path: `${shots}-${scheme}-config-flow.png` })
    await clickText(page, '.sq-side .sq-item', '＋ 新建小队')
    await sleep(800)
    await page.screenshot({ path: `${shots}-${scheme}-config-new-team.png` })
    await clickText(page, '.sq-tab', '实验报告')
    await sleep(1500)
    await page.screenshot({ path: `${shots}-${scheme}-reports.png` })
    await clickText(page, '.sq-tab', '运行')
    await sleep(800)
    if (scheme === 'light') {
      // A Run to show the guidance box while it works.
      await page.type('.sq-start textarea', '慢 8 认识分数：分数的意义与读写（五年级）')
      await clickText(page, '.sq-start .sq-btn', '开始')
      await sleep(6000)
      await page.type('.sq-main .sq-input', '例子请用切披萨来讲')
      await sleep(300)
      await page.screenshot({ path: `${shots}-${scheme}-guidance.png` })
      await clickText(page, '.sq-main .sq-btn', '发送')
      await sleep(1500)
    }
    await page.close()
  }
} finally {
  await browser?.close()
  run('down', PROJECT)
}
console.log('doc shots done')
