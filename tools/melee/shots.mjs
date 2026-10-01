// Melee storyboards (docs/MELEE.md): the most-fielded melee attacks in the real game page, each caught from the start
// of its windup to just after the hit, as a strip of frames (the loop paused and stepped one sim tick at a time, so
// every frame is a known tick), plus an optional .webm clip of the scene. Built on tools/move_shots.mjs: Vite runs
// in-process, the page's /api calls are answered here from pokeshell's card data (POKEARENA_CARDS; nothing is written
// to the repo), Playwright's Chromium is headless, and both are closed at the end.
//   node tools/melee/shots.mjs [--out shots/melee-before] [--only tackle,slash] [--video] [--frames 9] [--after 20] [--diff normal]
// (--frames / --after: how many frames, and how many ticks after the release to follow: a string, a hold or a throw
// plays out over 20-40 ticks since src/sim/melee.ts)
// Staging (a demo nicety, not the rules): the attacker's kit keeps only the attack in the scene and its meter is kept
// full; the foe (a tanky Gyarados VMAX) has an empty meter and full HP, so it moves and dodges but never attacks.
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d)
const root = resolve(import.meta.dirname, '../..')
const out = resolve(arg('--out', 'shots/melee-before'))
const only = (arg('--only', '') ?? '').split(',').filter(Boolean)
const video = process.argv.includes('--video')
// the bots' level (both sides): hard aims closer, so the captured swing tends to land (the before shots used normal)
const DIFF = arg('--diff', 'normal')
const FRAMES = parseInt(arg('--frames', '9'), 10)
const AFTER = parseInt(arg('--after', '20'), 10)
mkdirSync(out, { recursive: true })

const cardsPath = process.env.POKEARENA_CARDS ?? resolve(root, '../pokeshell/packs/pokemon/carddata.json')
if (!existsSync(cardsPath)) throw new Error('set POKEARENA_CARDS to pokeshell\'s packs/pokemon/carddata.json')
const data = JSON.parse(readFileSync(cardsPath, 'utf8')).cards
const packPath = join(dirname(cardsPath), 'pack.json')
const pack = existsSync(packPath) ? JSON.parse(readFileSync(packPath, 'utf8')).cards : {}

const FOE = 'swsh7-29'
// [name, label, card, attack index, arena]
export const SCENES = [
  ['tackle', 'Tackle', 'swsh7-134', 0, 'growlithe-meadow'],
  ['slash', 'Slash', 'me55-14', 0, 'herdier-temple'],
  ['bite', 'Bite', 'me55-88', 0, 'liepard-night-city'],
  ['ram', 'Ram', 'me55-4', 0, 'zarude-jungle'],
  ['gnaw', 'Gnaw', 'base1-58', 0, 'growlithe-meadow'],
  ['pound', 'Pound', 'base1-26', 0, 'cresselia-moonlit-sky'],
  ['spinning-attack', 'Spinning Attack', 'swsh7-3', 0, 'zarude-jungle'],
  ['headbutt', 'Headbutt', 'swsh12pt5-34', 0, 'lapras-lagoon'],
  ['heavy-impact', 'Heavy Impact', 'swsh12pt5-109', 0, 'sableye-crystal-cave'],
  ['mega-punch', 'Mega Punch', 'me55-84', 1, 'herdier-temple'],
  ['rear-kick', 'Rear Kick', 'swsh7-102', 0, 'herdier-temple'],
  ['quick-attack', 'Quick Attack', 'me55-117', 0, 'growlithe-meadow'],
  ['body-slam', 'Body Slam', 'me55-68', 0, 'growlithe-meadow'],
  ['seismic-toss', 'Seismic Toss', 'base1-8', 0, 'herdier-temple'],
  ['counter', 'Counter', 'me55-85', 0, 'herdier-temple'],
  ['fury-swipes', 'Fury Swipes', 'neo1-71', 0, 'liepard-night-city'],
  ['stomp', 'Stomp', 'neo1-76', 0, 'growlithe-meadow'],
  ['wing-attack', 'Wing Attack', 'swsh9-118', 0, 'kyogre-storm-sea'],
  ['dig', 'Dig', 'base1-47', 0, 'magmar-volcano'],
  ['dragon-claw', 'Dragon Claw', 'swsh9-108', 0, 'magmar-volcano'],
  ['vine-whip', 'Vine Whip', 'base1-30', 0, 'zarude-jungle'],
  ['karate-chop', 'Karate Chop', 'base1-34', 0, 'herdier-temple'],
  ['take-down', 'Take Down', 'swsh11-89', 0, 'growlithe-meadow'],
  ['double-kick', 'Double Kick', 'base1-37', 0, 'herdier-temple'],
]
const RUN = SCENES.filter(([n]) => !only.length || only.includes(n))

const ids = new Set([FOE, ...SCENES.map((s) => s[2])])
const collection = [...ids].map((id) => {
  const c = data[id]
  if (!c) throw new Error(`no card ${id}`)
  const meta = pack[id] ?? {}
  return { card: id, character: meta.character, name: meta.name ?? id, set: meta.set, rarity: meta.rarity, caught: true, count: 1, shiny: false, data: c }
})
const API = {
  '/api/health': { ok: true, version: 'melee-shots', api: 1, state: '', pokeshell: { found: true, version: 'stand-in' } },
  '/api/collection': { cards: collection },
  '/api/wallet': { tokens: 0 },
  '/api/teams': { version: 1, selected: null, teams: [] },
  '/api/heartbeat': { ok: true },
}

const { createServer } = await import('vite')
const server = await createServer({ root, server: { port: 5198, strictPort: false }, logLevel: 'warn' })
await server.listen()
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch()
const errors = []
const strips = []
try {
  for (const [name, label, me, ai, arena] of RUN) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, ...(video ? { recordVideo: { dir: out, size: { width: 960, height: 540 } } } : {}) })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(API[path] ?? {}) })
    })
    await page.goto(`${base}?auto=1&bots=1&mode=1v1&me=${me}&foe=${FOE}&arena=${arena}&seed=11&diff=${DIFF}`)
    await page.waitForFunction(() => window.__arena?.state?.().phase === 'fight', null, { timeout: 60000 })
    const atkName = await page.evaluate(([ai, label]) => {
      const r = window.__arena.runner, s = r.s
      const k = r.def.kits[s.players[0].members[s.players[0].active].kit]
      // a Stage 1 enters as the Basic of its line (start lines): take the named attack from whichever kit has it
      const atk = k.attacks.find((a) => a.name === label) ?? r.def.kits.flatMap((x) => x.attacks).find((a) => a.name === label) ?? k.attacks[ai] ?? k.attacks[0]
      k.attacks = [atk]
      window.__topUp = setInterval(() => {
        const s = window.__arena?.state?.()
        if (!s) return
        s.players.forEach((p, i) => { p.pips = p.pips.map(() => (i === 0 ? 5 : 0)); for (const m of p.members) if (!m.ko) m.hp = m.maxHp })
      }, 200)
      return atk.name
    }, [ai, label])
    // the third cast (the first two warm the bot up and bring the fighters together): pause on its first tick
    let got = true
    try {
      await page.waitForFunction(() => {
        const s = window.__arena.state(), f = s.players[0].fighter
        window.__casts ??= 0
        if (f.cast && !window.__inCast) { window.__inCast = true; window.__casts++ }
        if (!f.cast) window.__inCast = false
        if (window.__casts >= 3 && f.cast) { window.__arena.runner.paused = true; return true }
        return false
      }, null, { timeout: 45000, polling: 'raf' })
    } catch { got = false; console.log(`${name}: no cast in 45 s`) }
    const frames = []
    if (got) {
      await page.evaluate(() => clearInterval(window.__topUp))
      let after = 0
      for (let k = 0; k < FRAMES && after < AFTER; k++) {
        await page.waitForTimeout(40)
        const info = await page.evaluate(() => {
          const s = window.__arena.state(), f = s.players.map((p) => p.fighter)
          const cx = (f[0].x + f[1].x) / 2 / 256, cy = (f[0].y + f[1].y) / 2 / 256
          const w = Math.min(1920, Math.max(760, Math.abs(f[0].x - f[1].x) / 256 + 420)), h = Math.round((w * 9) / 16)
          return { tick: s.tick, cast: f[0].cast?.t ?? 0, dash: !!f[0].dash, x: Math.round(Math.max(0, Math.min(1920 - w, cx - w / 2))), y: Math.round(Math.max(0, Math.min(1080 - h, cy - h / 2))), width: Math.round(w), height: h }
        })
        const file = join(out, `${name}-${k}.png`)
        await page.screenshot({ path: file, clip: { x: info.x, y: info.y, width: info.width, height: info.height } })
        frames.push({ file, cap: info.cast ? `windup ${info.cast}` : info.dash ? 'dashing' : `+${after}` })
        const n = info.cast > 4 ? Math.min(3, info.cast - 1) : info.cast > 0 ? 1 : after < 4 ? 1 : Math.max(3, Math.ceil((AFTER - 4) / Math.max(1, FRAMES - 5)))
        if (!info.cast) after += n
        await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__arena.runner.tick() }, n)
      }
    }
    strips.push({ name, label: `${label} (${atkName}, ${me})`, frames })
    console.log(`${name}: ${frames.length} frames${got ? '' : ' (missed)'}`)
    const vid = page.video()
    await ctx.close()
    if (vid) { try { renameSync(await vid.path(), join(out, `${name}.webm`)) } catch { /* no clip */ } }
  }
  // one strip per scene, then a contact sheet of every strip
  for (const st of strips.filter((x) => x.frames.length)) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 400 } })
    const page = await ctx.newPage()
    const cells = st.frames.map(({ file, cap }) => `<figure><img src="data:image/png;base64,${readFileSync(file).toString('base64')}"><figcaption>${cap}</figcaption></figure>`).join('')
    await page.setContent(`<!doctype html><html><head><style>
      body { margin: 0; padding: 10px; background: #111418; font: 600 15px system-ui, sans-serif; color: #e8ecf1 }
      h1 { margin: 0 0 8px; font-size: 18px } main { display: grid; grid-template-columns: repeat(${Math.min(6, Math.ceil(st.frames.length / 2))}, 1fr); gap: 6px }
      figure { margin: 0; background: #1b2027; border-radius: 6px; overflow: hidden }
      img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block } figcaption { padding: 4px 6px }
    </style></head><body><h1>${st.label}</h1><main>${cells}</main></body></html>`)
    await page.screenshot({ path: join(out, `strip-${st.name}.png`), fullPage: true })
    await ctx.close()
  }
  console.log(`strips in ${out}`)
} finally {
  await browser.close()
  await server.close()
}
if (errors.length) { console.log('page errors:', errors.join('\n')); process.exitCode = 1 }
