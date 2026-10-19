// The Squad page in a real browser (headless Chrome), against a running pair with the
// math case: open the page, start a Run from the form, wait for it, check the graph,
// the sandboxed preview and the Teams editor; screenshots on the way.
//
//   PUPPETEER_CORE=<dir with node_modules/puppeteer-core> CHROME=/usr/bin/google-chrome \
//     node probes/ui-check.mjs <project> <screenshot-prefix>
//
// puppeteer-core is not a dependency of this repository; install it anywhere.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

const [project, out = '/tmp/squad-ui'] = process.argv.slice(2)
const puppeteer = createRequire(join(process.env.PUPPETEER_CORE ?? '.', 'package.json'))('puppeteer-core')
const failures = []
const check = (ok, what, detail) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} ${what}${!ok && detail !== undefined ? ` — ${detail}` : ''}`); if (!ok) failures.push(what) }
const sleep = ms => new Promise(done => setTimeout(done, ms))
const login = readFileSync(`${project}/.dsh-squad/logs/web.log`, 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/g).at(-1)
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 900 })
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  const clickText = (selector, wanted) => page.$$eval(selector, (els, wanted) => { const el = els.find(e => e.innerText.trim() === wanted); el?.click(); return Boolean(el) }, wanted)
  await page.goto(login, { waitUntil: 'networkidle2', timeout: 90_000 })
  await sleep(3000)
  check(await page.$('button.sq-foot') !== null, 'the Squad button is in the sidebar')
  await page.$eval('button.sq-foot', el => el.click())
  await sleep(1500)
  check((await page.$$('.sq-shell')).length === 1, 'the console opens once')
  await page.type('.sq-shell textarea', '认识分数：分数的意义与读写（五年级）')
  await clickText('.sq-shell button', '开始')
  let phase = ''
  for (let i = 0; i < 150 && phase !== '已完成'; i += 1) {
    await sleep(2000)
    phase = (await page.$eval('.sq-main', el => el.innerText)).match(/^(已完成|进行中|规划中|排队中|失败|已中断)/m)?.[1] ?? ''
  }
  check(phase === '已完成', 'the Run started from the form completed', phase)
  await page.screenshot({ path: `${out}-run.png` })
  check((await page.$$('.sq-dag svg g')).length >= 3, 'the task graph has its nodes')
  const previewed = await clickText('.sq-shell button', '预览')
  await sleep(2500)
  const frame = page.frames().find(f => f.url().includes('/v2/artifacts/'))
  check(previewed && frame?.url().startsWith('http://localhost:'), 'the preview loads from another host name', frame?.url())
  const cookie = frame ? await frame.evaluate(() => { try { return `readable:${document.cookie}` } catch (e) { return e.name } }) : 'no frame'
  check(cookie === 'SecurityError', 'the preview cannot read cookies (DSH-M2-07)', cookie)
  await page.screenshot({ path: `${out}-preview.png` })
  await page.keyboard.press('Escape')
  await sleep(300)
  check((await page.$$('.sq-shell')).length === 1 && (await page.$$('.sq-preview')).length === 0, 'Escape closes the preview, not the console')
  await clickText('.sq-tab', '小队与规则')
  await sleep(1500)
  check((await page.$eval('.sq-side', el => el.innerText)).includes('math'), 'the Teams editor lists the Team')
  await page.screenshot({ path: `${out}-config.png` })
  check(errors.length === 0, 'no page errors', errors.join(' | '))
} finally {
  await browser.close()
}
console.log(failures.length === 0 ? 'UI: all checks pass' : `UI: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
