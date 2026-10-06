// The web arena (npm run build:web, the Vercel site) as a brand-new visitor: empty storage, the welcome and its 3
// starter packs, a pack opened through the page, the loadout with the pulled cards, a battle started from the Battle
// button and won (the result's tokens), and everything still there after a reload.
//   node tests/web-smoke.mjs                 builds nothing: serves dist/ with `vite preview` on a free port
//   node tests/web-smoke.mjs <url>           against a running server or a deployment (e.g. the Vercel preview URL)
// Screenshots in shots/web/ (gitignored). Needs Playwright's Chromium (npx playwright install chromium).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(fileURLToPath(import.meta.url), '..', '..')
const out = join(root, 'shots', 'web')
mkdirSync(out, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let fails = 0
const check = (ok, what) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++ }

let base = process.argv[2]
let server = null
if (!base) {
  if (!existsSync(join(root, 'dist', 'index.html'))) throw new Error('no dist/: npm run build:web first')
  const port = await new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)) }) })
  server = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--mode', 'web', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
  base = `http://127.0.0.1:${port}/`
  for (let i = 0; i < 100; i++) { await sleep(100); if (await fetch(base).then((r) => r.ok, () => false)) break }
}
if (!base.endsWith('/')) base += '/'

const browser = await chromium.launch()
const errors = []
try {
  // a new context: no storage at all, a first visit
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  const missing = []
  page.on('response', (r) => { if (r.status() >= 400) missing.push(`${r.status()} ${new URL(r.url()).pathname}`) })
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  const shot = (n) => page.screenshot({ path: join(out, `${n}.png`) })

  console.log(`web smoke: ${base}`)
  await page.goto(base)
  await page.waitForSelector('.blocked-card h2', { timeout: 20000 })
  const title = await page.textContent('.blocked-card h2')
  check(title?.includes('Welcome to the arena'), `the welcome: "${title}"`)
  const btn = await page.textContent('#open-packs')
  check(/Open a pack/.test(btn ?? '') && /3 to open/.test(btn ?? ''), `the starter packs button: "${btn?.replace(/\s+/g, ' ')}"`)
  check(/saved in this browser/.test(await page.textContent('.blocked-card')), 'it says where the cards are kept')
  await shot('01-welcome')

  await page.click('#open-packs')
  const openBtn = await page.waitForSelector('#packs:not(.hidden) .pk-open-btn', { timeout: 20000 }).catch(() => null)
  check(!!openBtn, 'the pack scene offers Open the pack')
  await shot('02-pack-scene')
  if (openBtn) await openBtn.click()
  const phase = () => page.evaluate(() => document.querySelector('.pk-scene')?.dataset.phase)
  for (let i = 0; i < 20 && (await phase()) === 'idle'; i++) await sleep(250)
  check((await phase()) !== 'idle', `the pack tore open (${await phase()})`)
  await sleep(1500)
  for (let i = 0; i < 40 && !(await page.$('.pk-btn--main')); i++) {
    const skip = await page.$('.pk-hud__btns .pk-btn:not(.pk-btn--icon)')
    if (skip) await skip.click().catch(() => {})
    await sleep(500)
  }
  await sleep(800)
  await shot('03-pack-summary')
  const done = await page.$('.pk-btn--main')
  check(!!done, 'the pack summary has Done')
  if (done) await done.click({ force: true })
  await page.waitForSelector('.lo-head', { timeout: 20000 })
  await sleep(1200)
  const cards = await page.$$eval('.roster .card, .card', (els) => els.length)
  check(cards > 0, `the loadout lists the pulled cards (${cards})`)
  const chip = (await page.textContent('#tokens'))?.replace(/\s+/g, ' ').trim()
  check(/0\s*\/ 10/.test(chip ?? '') && /2 packs/.test(chip ?? ''), `the wallet chip: "${chip}"`)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pokearena.web.v1') ?? 'null'))
  check(stored && stored.balance === 2 && Object.keys(stored.cards).length > 0, `localStorage holds the collection (${stored && Object.keys(stored.cards).length} cards, ${stored?.balance} packs)`)
  await shot('04-loadout')

  // a 1v1 from the loadout: the Battle button, then knock the bot out (the sim's state, as the screenshot tools do)
  await page.click('.lo-modes [data-mode="1v1"], [data-mode="1v1"]').catch(() => {})
  await sleep(300)
  await page.click('#go')
  for (let i = 0; i < 60; i++) {
    const phase = await page.evaluate(() => window.__arena?.state?.()?.phase ?? null)
    if (phase === 'fight') break
    if (await page.$('#reveal:not(.hidden)')) await page.keyboard.press('Enter')
    await sleep(500)
  }
  const fighting = await page.evaluate(() => window.__arena?.state?.()?.phase === 'fight')
  check(fighting, 'a battle started from the Battle button')
  await sleep(1500)
  await shot('05-match')
  if (fighting) {
    await page.evaluate(() => { for (const m of window.__arena.state().players[1].members) { m.hp = 0 } })
    await page.waitForFunction(() => window.__arena.screen() === 'result' && window.__arena.reward().kind !== 'pending', null, { timeout: 30000 })
    const reward = await page.evaluate(() => window.__arena.reward())
    check(reward.kind === 'granted' && reward.points >= 1 && reward.perPack === 10, `the win: +${reward.points} tokens, ${reward.progress} / ${reward.perPack} (${reward.kind})`)
    await sleep(2600)
    const res = (await page.textContent('#result .reward'))?.replace(/\s+/g, ' ').trim()
    check(/tokens earned/.test(res ?? ''), `the result screen: "${res?.slice(0, 80)}"`)
    await shot('06-result')
  }

  // a reload: the same collection, no second starter grant
  await page.goto(base)
  await page.waitForSelector('.lo-head', { timeout: 20000 })
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('pokearena.web.v1') ?? 'null'))
  check(after.balance === 2 && after.progress >= 1 && Object.keys(after.cards).length === Object.keys(stored.cards).length, `after a reload: ${after.balance} packs, ${after.progress} tokens, ${Object.keys(after.cards).length} cards`)
  await shot('07-reloaded')
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`)
  const notArt = missing.filter((m) => !/\/(sprites|pokeshell\/img|arenas\/[^/]+\/(bg|props)\.png)/.test(m))
  check(notArt.length === 0, `nothing else missing${notArt.length ? `: ${notArt.slice(0, 5).join(', ')}` : ''} (art requests that 404: ${missing.length - notArt.length})`)
} finally {
  await browser.close()
  server?.kill()
}
console.log(`web smoke: ${fails ? `${fails} failed` : 'all ok'} (screenshots in ${out})`)
process.exit(fails ? 1 : 0)
