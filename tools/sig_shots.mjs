// Contact sheets of the signature moves (docs/VFX.md "Signature moves"): for each look, one staged cast in the real game
// page caught three times: the aim telegraph while it winds up, in flight, and on impact. Vite runs in-process and the
// page's /api calls get a stand-in collection from pokeshell's card data (POKEARENA_CARDS; nothing is written to the
// repo); Playwright's Chromium is headless; both close at the end. The looks and their cards come from
// tools/kits/signature.ts --pick. Writes shots/signature/<look>.png (the three frames side by side) and
// shots/signature/sheet-<family>.png, plus sheet-pair.png: Starmie's Psychic against its Power Gem.
//   node tools/sig_shots.mjs [--out shots/signature] [--family psychic,fire] [--only powergem,psychic] [--iconic flame,hydro]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d)
const root = resolve(import.meta.dirname, '..')
const out = resolve(arg('--out', 'shots/signature'))
const list = (k) => (arg(k, '') ?? '').split(',').filter(Boolean)
const only = list('--only'), families = list('--family'), iconic = list('--iconic')
mkdirSync(out, { recursive: true })

const cardsPath = process.env.POKEARENA_CARDS ?? resolve(root, '../pokeshell/packs/pokemon/carddata.json')
if (!existsSync(cardsPath)) throw new Error('set POKEARENA_CARDS to pokeshell\'s packs/pokemon/carddata.json')
const data = JSON.parse(readFileSync(cardsPath, 'utf8')).cards
const packPath = join(dirname(cardsPath), 'pack.json')
const pack = existsSync(packPath) ? JSON.parse(readFileSync(packPath, 'utf8')).cards : {}

// [look, family, card, attack index, label]
const viteNode = join(root, 'node_modules', 'vite-node', 'vite-node.mjs')
const picked = JSON.parse(execFileSync(process.execPath, [viteNode, 'tools/kits/signature.ts', '--pick', iconic.join(',') || '-'], { cwd: root, encoding: 'utf8' }).trim().split('\n').pop())
// the pair: Starmie (swsh9-55) Psychic and Power Gem, side by side
const PAIR = [['pair-psychic', 'pair', 'swsh9-55', 0, 'Starmie: Psychic'], ['pair-powergem', 'pair', 'swsh9-55', 1, 'Starmie: Power Gem']]
const ALL = [...picked, ...PAIR]
const RUN = ALL.filter(([look, fam]) => (!only.length || only.includes(look) || (fam === 'pair' && only.includes('pair'))) && (!families.length || families.includes(fam)))

const FOE = 'swsh7-29' // Gyarados VMAX: 330 HP, so nothing ends the match before the picture
const ids = new Set([FOE, ...RUN.map((s) => s[2])])
const collection = [...ids].map((id) => {
  const c = data[id]
  if (!c) throw new Error(`no card ${id}`)
  const meta = pack[id] ?? {}
  return { card: id, character: meta.character, name: meta.name ?? id, set: meta.set, rarity: meta.rarity, caught: true, count: 1, shiny: false, data: c }
})
const API = {
  '/api/health': { ok: true, version: 'sig-shots', api: 1, state: '', pokeshell: { found: true, version: 'stand-in' } },
  '/api/collection': { cards: collection },
  '/api/wallet': { tokens: 0 },
  '/api/teams': { version: 1, selected: null, teams: [] },
  '/api/heartbeat': { ok: true },
}

/** in the page: stage casts of attack `ai` and hold the sim at `moment` ('tele', 'flight' or 'impact'). Resolves true
 * when the moment came. The sim is held through the loop's hit-stop counter, so the page keeps drawing it */
function stage([ai, card, moment]) {
  const r = window.__arena.runner
  const FPX = 256, ME = { x: 520, y: 540 }
  if (!window.__frz) { window.__frz = { v: 0 }; Object.defineProperty(r.loop, 'freeze', { get: () => window.__frz.v, set: () => {} }) }
  window.__frz.v = 0
  const want = r.def.kits.findIndex((k) => k.card === card)
  const m = r.s.players[0].members[r.s.players[0].active]
  if (want >= 0) m.kit = want
  const kit = r.def.kits[m.kit]
  const sh = kit.attacks[ai].shape
  const n = (k, d) => (typeof sh[k] === 'number' ? sh[k] : d)
  // the foe's distance: inside the shape's reach
  const D = sh.kind === 'projectile' ? Math.min(440, n('range', 600) * (sh.path === 'lob' ? 0.9 : 0.7))
    : sh.kind === 'beam' ? Math.min(420, n('length', 500) * 0.75)
      : sh.kind === 'cone' ? n('range', 160) * 0.7
        : sh.kind === 'area' && sh.at === 'aim' ? Math.min(520, n('range', 300))
          : sh.kind === 'area' ? n('radius', 80) * 0.7
            : sh.kind === 'dash' ? Math.min(300, n('distance', 200) * 0.8) : 90
  const flightHold = sh.kind === 'projectile' ? Math.max(5, Math.round((Math.max(40, D * (sh.path === 'lob' ? 0.5 : 0.55) - 40)) / Math.max(1, n('speed', 12))))
    : sh.kind === 'area' ? (sh.at === 'aim' ? Math.max(2, n('delay', 30) - 6) : 3) : sh.kind === 'dash' ? 4 : 2
  // the frame: the caster, the foe and the shape's far end (a beam's head past the foe)
  const reach = sh.kind === 'beam' ? n('length', 500) : sh.kind === 'projectile' ? Math.min(n('range', 600), D + 200) : D
  const w = Math.min(1920, Math.max(820, reach + 360)), h = Math.round((w * 9) / 16)
  // an area's column rises over its spot: frame a little higher
  const up = sh.kind === 'area' ? Math.round(h * 0.15) : 0
  window.__vfxBox = { x: Math.round(Math.max(0, Math.min(1920 - w, ME.x + reach / 2 - w / 2))), y: Math.round(Math.max(0, Math.min(1080 - h, ME.y - h / 2 - up))), width: Math.round(w), height: h }
  let rel = null, press = false, done = false, hitAt = null
  const from = r.s.nextId
  r.s.projectiles = r.s.projectiles.filter((p) => p.owner !== 0); r.s.areas = r.s.areas.filter((x) => x.owner !== 0); r.s.beams = r.s.beams.filter((x) => x.owner !== 0)
  const place = (s) => {
    const me = s.players[0].fighter, foe = s.players[1].fighter
    me.x = ME.x * FPX; me.y = ME.y * FPX; foe.x = Math.round((ME.x + D) * FPX); foe.y = ME.y * FPX; foe.knock = null
  }
  r.bots[1].input = () => ({ mx: 0, my: 0, aim: 128, buttons: 0 })
  r.s.players[0].usedOnce = [] // a GX / VSTAR attack can be staged again
  for (const m of r.s.players[1].members) { m.maxHp = 5000; m.hp = 5000 } // no hit ends the match mid-staging
  const hold = (ok) => { done = true; window.__frz.v = 1e9; ok(true) }
  return new Promise((ok) => {
    setTimeout(() => ok(done), 15000)
    r.bots[0].input = (s) => {
      const me = s.players[0].fighter, foe = s.players[1].fighter
      for (const m of s.players[1].members) m.hp = m.maxHp // a big hit mustn't end the match mid-staging
      const own = (x) => x.owner === 0 && x.id >= from
      const mine = s.projectiles.some(own) || s.areas.some(own) || s.beams.some(own) || s.swings.some(own)
      if (!me.cast && !mine && !me.dash && rel === null) place(s)
      const aim = Math.round((Math.atan2(foe.y - me.y, foe.x - me.x) / (Math.PI * 2)) * 256) & 255
      press = !press
      if (!done) {
        if (moment === 'tele' && me.cast && me.cast.attack === ai) hold(ok)
        if ((mine || me.dash) && rel === null && !me.cast) rel = s.tick
        // in flight: a shot part-way; an aimed area a few ticks before it lands (its telegraph and what's coming down)
        const falling = s.areas.filter(own)
        if (moment === 'flight' && rel !== null && (sh.kind === 'area' && sh.at === 'aim' ? falling.length > 0 && Math.min(...falling.map((x) => x.land)) <= 7 : s.tick - rel >= flightHold)) hold(ok)
        if (moment === 'impact' && rel !== null) {
          // the hit, a telegraphed area landing, or a shot ending (not an area's cast-time impact)
          const aimed = sh.kind === 'area' || n('fuse', 0) > 0
          if (hitAt === null && s.events.some((e) => (e.k === 'landed' && e.p === 0) || (e.k === 'dmg' && e.p === 1) || (!aimed && e.k === 'impact' && e.p === 0))) hitAt = s.tick
          if (hitAt !== null && s.tick - hitAt >= 1) hold(ok)
        }
      }
      return { mx: 0, my: 0, aim, buttons: rel === null && !me.cast && press ? 1 << ai : 0 }
    }
  })
}

const { createServer } = await import('vite')
const server = await createServer({ root, server: { port: 5201, strictPort: false }, logLevel: 'warn' })
await server.listen()
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch()
const errors = []
const done = []
try {
  for (const [look, fam, card, ai, label] of RUN) for (let attempt = 1; attempt <= 3; attempt++) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    try {
    const page = await ctx.newPage()
    page.on('pageerror', (e) => { errors.push(`${look}: ${e.message}`); if (errors.length < 6) console.log('page error', look, e.stack) })
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(API[path] ?? {}) })
    })
    await page.goto(`${base}?auto=1&bots=1&mode=1v1&me=${card}&foe=${FOE}&arena=herdier-temple&seed=7&diff=normal`)
    try {
      await page.waitForFunction(() => window.__arena?.state?.().phase === 'fight', null, { timeout: 60000 })
    } catch { console.log(`${look}: the match never started; skipped`); await ctx.close(); break }
    await page.evaluate(() => {
      window.__topUp = setInterval(() => {
        const s = window.__arena?.state?.()
        if (!s) return
        s.players.forEach((p, i) => { p.pips = p.pips.map(() => (i === 0 ? 10 : 0)); for (const m of p.members) if (!m.ko) m.hp = m.maxHp })
      }, 200)
    })
    await page.waitForTimeout(1600) // past the FIGHT! banner
    const frames = []
    for (const moment of ['tele', 'flight', 'impact']) {
      const got = await page.evaluate(stage, [ai, card, moment])
      // the impact flourishes run on rendered frames: catch them early
      await page.waitForTimeout(moment === 'impact' ? 40 : 160)
      const box = await page.evaluate(() => window.__vfxBox)
      const file = join(out, `${look}-${moment}.png`)
      await page.screenshot({ path: file, clip: box })
      frames.push({ file, got, moment })
      // let the cast finish before the next one
      await page.evaluate(() => { if (window.__frz) window.__frz.v = 0 })
      await page.waitForTimeout(900)
    }
    done.push({ look, fam, label, frames })
    console.log(`shot ${look} (${card} #${ai} ${label})${frames.every((f) => f.got) ? '' : ' [some moments missed: ' + frames.filter((f) => !f.got).map((f) => f.moment).join(', ') + ']'}`)
    await ctx.close()
    break
    } catch (e) {
      // a page reload (Vite picking up an edit mid-run) destroys the context: try the look again
      console.log(`${look}: ${String(e.message ?? e).split(String.fromCharCode(10))[0]} (attempt ${attempt})`)
      await ctx.close().catch(() => {})
    }
  }
  // the sheets: a row per look, its three frames side by side
  const byFam = new Map()
  for (const d of ALL) {
    const [look, fam, , , label] = d
    const frames = ['tele', 'flight', 'impact'].map((m) => join(out, `${look}-${m}.png`))
    if (!frames.every((f) => existsSync(f))) continue
    const missed = done.find((x) => x.look === look)?.frames.filter((f) => !f.got).map((f) => f.moment) ?? []
    byFam.set(fam, [...(byFam.get(fam) ?? []), { look, label, frames, missed }])
  }
  for (const [fam, rows] of byFam) {
    // only the sheets of the families shot this run
    if (!done.some((d) => d.fam === fam)) continue
    const ctx = await browser.newContext({ viewport: { width: 1800, height: 400 } })
    const page = await ctx.newPage()
    const img = (f) => `<img src="data:image/png;base64,${readFileSync(f).toString('base64')}">`
    const cells = rows.map(({ look, label, frames, missed }) => `<section><h2>${label} <small>${look}${missed.length ? ` (missed: ${missed.join(', ')})` : ''}</small></h2><div class="row">${frames.map((f, i) => `<figure>${img(f)}<i>${['telegraph', 'in flight', 'impact'][i]}</i></figure>`).join('')}</div></section>`).join('')
    await page.setContent(`<!doctype html><html><head><style>
      body { margin: 0; padding: 16px; background: #111418; font: 600 18px system-ui, sans-serif; color: #e8ecf1 }
      h1 { margin: 0 0 12px; font-size: 24px } h2 { margin: 12px 0 6px; font-size: 18px } small { color: #8a96a8; font-weight: 500 }
      .row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px }
      figure { margin: 0; position: relative; background: #1b2027; border-radius: 8px; overflow: hidden }
      img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block }
      i { position: absolute; left: 8px; top: 6px; font: 700 14px system-ui; color: #fff; text-shadow: 0 1px 3px #000 }
    </style></head><body><h1>Signature moves: ${fam}</h1>${cells}</body></html>`)
    await page.screenshot({ path: join(out, `sheet-${fam}.png`), fullPage: true })
    console.log(`sheet-${fam}.png (${rows.length})`)
    await ctx.close()
  }
} finally {
  await browser.close()
  await server.close()
}
if (errors.length) { console.log('page errors:', errors.join('\n')); process.exitCode = 1 }
