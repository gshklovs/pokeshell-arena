// Screenshots of distinctive kits in action (beam, cone, telegraphed area, terrain, status): bot-vs-bot 1v1s in
// the real game page. Vite runs in-process; the page's /api calls are answered here with a stand-in collection
// built at run time from pokeshell's card data (POKEARENA_CARDS; nothing is written to the repo), so no host or
// pokeshell install is needed. Writes shots/kits-*.png.
//   node tools/kits/kitshots.mjs [--out shots] [--only beam,cone,...]
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d)
const root = resolve(import.meta.dirname, '../..')
const out = resolve(arg('--out', 'shots'))
const only = (arg('--only', '') ?? '').split(',').filter(Boolean)
mkdirSync(out, { recursive: true })

// ---------------------------------------------------------------- the stand-in collection
const cardsPath = process.env.POKEARENA_CARDS ?? resolve(root, '../pokeshell/packs/pokemon/carddata.json')
if (!existsSync(cardsPath)) throw new Error('set POKEARENA_CARDS to pokeshell\'s packs/pokemon/carddata.json')
const data = JSON.parse(readFileSync(cardsPath, 'utf8')).cards
const packPath = join(dirname(cardsPath), 'pack.json')
const pack = existsSync(packPath) ? JSON.parse(readFileSync(packPath, 'utf8')).cards : {}

// scenario: [name, me, foe, arena, what to wait for (a predicate on the state, as source), extra wait ms]
const SCENES = [
  ['beam', 'me55-121', 'swsh9-17', 'lapras-lagoon', 's => s.beams.length > 0', 60],
  ['cone', 'base1-4', 'swsh7-7', 'zarude-jungle', 's => s.swings.some(w => w.range > 200)', 90],
  ['area-telegraph', 'swsh9-18', 'swsh7-29', 'magmar-volcano', 's => s.areas.length > 0', 120],
  ['terrain-flood', 'swsh12pt5-36', 'swsh12pt5-53', 'growlithe-meadow', 's => s.wet.filter(v => v > 0).length > 20', 400],
  ['status-sleep', 'base1-29', 'base1-58', 'herdier-temple', 's => s.players.some(p => p.fighter.status.asleep > 0 || p.fighter.status.paralyzed > 0)', 150],
  ['lost-impact', 'swsh11-131', 'swsh7-214', 'sableye-crystal-cave', 's => s.areas.length > 0', 80],
].filter(([n]) => !only.length || only.includes(n))

const ids = new Set(SCENES.flatMap(([, a, b]) => [a, b]))
const collection = [...ids].map((id) => {
  const c = data[id]
  if (!c) throw new Error(`no card ${id}`)
  const meta = pack[id] ?? {}
  return { card: id, character: meta.character, name: meta.name ?? id, set: meta.set, rarity: meta.rarity, caught: true, count: 1, shiny: false, data: c }
})

const API = {
  '/api/health': { ok: true, version: 'kitshots', api: 1, state: '', pokeshell: { found: true, version: 'stand-in' } },
  '/api/collection': { cards: collection },
  '/api/wallet': { tokens: 0 },
  '/api/teams': { version: 1, selected: null, teams: [] },
  '/api/heartbeat': { ok: true },
}

// ---------------------------------------------------------------- Vite + Chromium
const { createServer } = await import('vite')
const server = await createServer({ root, server: { port: 5198, strictPort: false }, logLevel: 'warn' })
await server.listen()
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch()
const errors = []
try {
  for (const [name, me, foe, arena, until, extra] of SCENES) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(API[path] ?? {}) })
    })
    await page.goto(`${base}?auto=1&bots=1&mode=1v1&me=${me}&foe=${foe}&arena=${arena}&seed=7&diff=normal`)
    await page.waitForFunction(() => window.__arena?.state?.().phase === 'fight', null, { timeout: 30000 })
    // staging: both sides start with a full meter, so the signature attacks come out quickly
    await page.evaluate(() => { for (const p of window.__arena.state().players) p.pips[0] = 10 })
    try {
      await page.waitForFunction(`(${until})(window.__arena.state())`, null, { timeout: 40000, polling: 16 })
      await page.waitForTimeout(extra)
    } catch { console.log(`${name}: the moment didn't come in time; shooting anyway`) }
    await page.screenshot({ path: join(out, `kits-${name}.png`) })
    console.log(`shot kits-${name}.png (${me} vs ${foe})`)
    await ctx.close()
  }
} finally {
  await browser.close()
  await server.close()
}
if (errors.length) { console.log('page errors:', errors.join('\n')); process.exitCode = 1 }
