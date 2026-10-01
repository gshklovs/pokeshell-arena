// The downloadable (standalone) arena in a browser: the welcome on a new state, opening a starter pack through the
// page, the loadout with the pulled cards, a match started and won (the result screen's tokens toward the next pack).
//   node tests/standalone-ui.mjs [<pokeshell-arena.exe>]
// A temp state and an OS-picked port, the host stopped through POST /api/shutdown at the end; screenshots in
// shots/standalone/ (gitignored). Needs Playwright's Chromium (npx playwright install chromium).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(fileURLToPath(import.meta.url), '..', '..')
const exe = process.argv[2] ?? [join(root, 'release', 'pokeshell-arena.exe'), join(root, 'host', 'target', 'bundle', 'release', 'arena-host.exe')].find((p) => existsSync(p))
if (!exe || !existsSync(exe)) throw new Error('no bundled build (npm run release:win)')
const out = join(root, 'shots', 'standalone')
mkdirSync(out, { recursive: true })
const tmp = mkdtempSync(join(tmpdir(), 'arena-standalone-ui-'))
const state = join(tmp, 'state')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let fails = 0
const check = (ok, what) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++ }

// the server itself (--serve): this test owns it and stops it
const host = spawn(exe, ['--serve', '--state', state, '--port', '0', '--no-idle-exit'], { stdio: 'ignore', windowsHide: true })
let port = 0
for (let i = 0; i < 100 && !port; i++) {
  await sleep(100)
  try { port = JSON.parse(readFileSync(join(state, 'host.json'), 'utf8')).port } catch { /* not yet */ }
}
if (!port) throw new Error('the arena did not start')
const base = `http://127.0.0.1:${port}/`
const browser = await chromium.launch()
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()) })
  const shot = (n) => page.screenshot({ path: join(out, `${n}.png`) })

  console.log(`standalone UI: ${exe} on ${base}`)
  await page.goto(base)
  await page.waitForSelector('.blocked-card h2', { timeout: 15000 })
  const title = await page.textContent('.blocked-card h2')
  check(title?.includes('Welcome to the arena'), `the welcome: "${title}"`)
  const btn = await page.textContent('#open-packs')
  check(/Open a pack/.test(btn ?? '') && /3 to open/.test(btn ?? ''), `the starter packs button: "${btn?.replace(/\s+/g, ' ')}"`)
  await shot('01-welcome')

  // open one starter pack through the page: the scene, then Skip and Done
  const faces = []
  page.on('response', (r) => { if (r.url().includes('/pokeshell/img/') && r.status() === 200) faces.push(r.url()) })
  await page.click('#open-packs')
  await page.waitForSelector('#packs:not(.hidden) .pk-btn', { timeout: 15000 })
  await sleep(1500)
  await shot('02-pack-scene')
  // open it (the page runs with reduced motion: the scene's "Open the pack" button tears it), then skip the reveal
  const openBtn = await page.waitForSelector('.pk-open-btn', { timeout: 10000 }).catch(() => null)
  check(!!openBtn, 'the scene offers Open the pack')
  if (openBtn) await openBtn.click({ force: true })
  await sleep(2500)
  for (let i = 0; i < 40 && !(await page.$('.pk-btn--main')); i++) {
    const skip = await page.$('.pk-hud__btns .pk-btn:not(.pk-btn--icon)')
    if (skip) await skip.click({ force: true }).catch(() => {})
    await sleep(500)
  }
  await sleep(800)
  await shot('03-pack-summary')
  check(faces.length > 0, `card faces loaded in the pack (${faces.length})`)
  const done = await page.$('.pk-btn--main')
  check(!!done, 'the pack summary has Done')
  if (done) await done.click({ force: true })
  // back on the loadout: the welcome is gone, the pulled cards are the roster, 2 packs left
  await page.waitForSelector('.lo-head', { timeout: 15000 })
  await sleep(1200)
  const cards = await page.$$eval('.roster .card, .card', (els) => els.length)
  check(cards > 0, `the loadout lists the pulled cards (${cards})`)
  const chip = (await page.textContent('#tokens'))?.replace(/\s+/g, ' ').trim()
  check(/0\s*\/ 10/.test(chip ?? '') && /2 packs/.test(chip ?? ''), `the wallet chip: "${chip}"`)
  const line = (await page.textContent('.opt.reward'))?.replace(/\s+/g, ' ')
  check(/a win earns \d+ tokens? \(10 = 1 pack\)/.test(line ?? ''), `the reward line: "${line?.slice(0, 60)}"`)
  await shot('04-loadout')

  // a match with an owned card: start it, then knock the bot out (the sim's state, as the screenshot tools do)
  const owned = await page.evaluate(async () => (await (await fetch('/api/collection')).json()).cards.find((c) => c.data?.hp && c.data?.attacks?.length)?.card)
  await page.goto(`${base}?auto=1&mode=1v1&me=${owned}&diff=hard&seed=7&arena=growlithe-meadow`)
  await page.waitForFunction(() => window.__arena?.state?.().phase === 'fight', null, { timeout: 30000 })
  check(true, `a 1v1 match started with ${owned}`)
  await sleep(1500)
  await shot('05-match')
  await page.evaluate(() => { for (const m of window.__arena.state().players[1].members) { m.hp = 0 } })
  await page.waitForFunction(() => window.__arena.screen() === 'result' && window.__arena.reward().kind !== 'pending', null, { timeout: 30000 })
  const reward = await page.evaluate(() => window.__arena.reward())
  check(reward.kind === 'granted' && reward.points === 2 && reward.progress === 2 && reward.perPack === 10, `the win: +${reward.points} tokens, ${reward.progress} / ${reward.perPack} (${reward.kind})`)
  await sleep(2600)
  const res = (await page.textContent('#result .reward'))?.replace(/\s+/g, ' ').trim()
  check(/tokens earned/.test(res ?? '') && /\+2/.test(res ?? '') && /2 \/ 10/.test(res ?? ''), `the result screen: "${res?.slice(0, 80)}"`)
  await shot('06-result')
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`)
} finally {
  await browser.close()
  await fetch(`${base}api/shutdown`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {})
  await new Promise((r) => { host.once('exit', r); setTimeout(r, 5000) })
  rmSync(tmp, { recursive: true, force: true })
}
console.log(`standalone UI: ${fails ? `${fails} failed` : 'all ok'} (screenshots in ${out})`)
process.exit(fails ? 1 : 0)
