// Screenshots of the move language and the type flavours in action (docs/MOVES.md, docs/KITS.md): bot-vs-bot 1v1s in
// the real game page, each caught while a move's trajectory / hit area / telegraph is on screen, cropped around the
// fight, then laid out on contact sheets. Ported from the unfinished move-design pass (branch pack-redesign-restore)
// onto kitshots' stand-in collection: Vite runs in-process, the page's /api calls are answered here from pokeshell's
// card data (POKEARENA_CARDS; nothing is written to the repo), Playwright's Chromium is headless, and both are closed
// at the end. Writes shots/moves/<scene>.png, shots/moves/sheet-moves.png and shots/moves/sheet-types.png.
//   node tools/move_shots.mjs [--out shots/moves] [--only thunder,surf,...]
//   node tools/move_shots.mjs --sheet vfx [--out shots/vfx/after] [--before shots/vfx/before] [--only wave,beam]
// --sheet vfx (docs/VFX.md): one staged cast per ranged / area / cone archetype, frozen mid-flight: the caster and a
// still foe placed on an open floor at the shape's reach, the caster forced to cast that attack, the sim held (the
// page keeps drawing) at the moment, cropped. With --before, the sheet pairs each crop with the one in that folder
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d)
const root = resolve(import.meta.dirname, '..')
const sheetArg = arg('--sheet', 'moves')
const out = resolve(arg('--out', sheetArg === 'vfx' ? 'shots/vfx/after' : 'shots/moves'))
const beforeDir = arg('--before', null)
const only = (arg('--only', '') ?? '').split(',').filter(Boolean)
mkdirSync(out, { recursive: true })

const cardsPath = process.env.POKEARENA_CARDS ?? resolve(root, '../pokeshell/packs/pokemon/carddata.json')
if (!existsSync(cardsPath)) throw new Error('set POKEARENA_CARDS to pokeshell\'s packs/pokemon/carddata.json')
const data = JSON.parse(readFileSync(cardsPath, 'utf8')).cards
const packPath = join(dirname(cardsPath), 'pack.json')
const pack = existsSync(packPath) ? JSON.parse(readFileSync(packPath, 'utf8')).cards : {}

const FOE = 'swsh7-29' // Gyarados VMAX: 330 HP, so no signature move ends the match before the picture
const mine = (a) => `s.projectiles.some((p) => p.owner === 0 && p.attack === ${a} && p.age > 14)`
const area = (a, extra = 'true') => `s.areas.some((x) => x.owner === 0 && x.attack === ${a} && (${extra}))`
// [sheet, name, label, my card, arena, when (a predicate over the sim state s)]
const SCENES = [
  ['moves', 'earthquake', 'Earthquake: a ring through the ground', 'swsh11-102', 'herdier-temple', area(1)],
  ['moves', 'thunder', 'Thunder: telegraphed, then from the sky', 'me55-150', 'lapras-lagoon', area(1, 'x.next > 4')],
  ['moves', 'hydro-pump', 'Hydro Pump: a long shoving jet', 'base1-2', 'magmar-volcano', 's.beams.some((b) => b.owner === 0)'],
  ['moves', 'rock-throw', 'Rock Throw: a lob over the wall', 'sma-SV20', 'sableye-crystal-cave', mine(0)],
  ['moves', 'leaf-boomerang', 'Leaf Boomerang: out and back', 'swsh12pt5-1', 'zarude-jungle', 's.projectiles.some((p) => p.owner === 0 && p.back === 1)'],
  ['moves', 'body-slam', 'Body Slam: airborne, crashes down', 'me55-68', 'growlithe-meadow', '!!s.players[0].fighter.dash'],
  ['moves', 'surf', 'Surf: a wave surging out from you', 'swsh7-25', 'lapras-lagoon', area(1)],
  ['moves', 'ember', 'Ember: a short fan of embers', 'swsh9-24', 'growlithe-meadow', 's.projectiles.filter((p) => p.owner === 0).length >= 2'],
  ['moves', 'razor-leaf', 'Razor Leaf: three blades that cut through', 'swsh9-7', 'zarude-jungle', 's.projectiles.some((p) => p.owner === 0)'],
  ['moves', 'rock-slide', 'Rock Slide: rocks crash down in a line', 'sm115-35', 'herdier-temple', 's.areas.filter((x) => x.owner === 0).length >= 3'],
  ['moves', 'hurricane', 'Hurricane: a storm drifting along the aim', 'swsh9-116', 'kyogre-storm-sea', area(1, 'x.t < 150')],
  ['moves', 'thunder-shock', 'Thunder Shock: a crackling zigzag bolt', 'me55-23', 'growlithe-meadow', mine(0)],
  ['moves', 'fire-spin', 'Fire Spin: a lingering vortex', 'me55-11', 'zarude-jungle', area(0, 'x.next < 20')],
  ['moves', 'swift', 'Swift: fluttering stars', 'neo1-56', 'cresselia-moonlit-sky', mine(1)],
  ['moves', 'take-down', 'Take Down: a committed charge', 'swsh11-89', 'growlithe-meadow', '!!s.players[0].fighter.dash'],
  ['moves', 'psychic', 'Psychic: a homing orb (the type)', 'me55-65', 'cresselia-moonlit-sky', mine(0)],
  ['types', 'type-psychic', 'Psychic: gentle homing', 'base1-43', 'cresselia-moonlit-sky', mine(0)],
  ['types', 'type-fire', 'Fire: a burning trail', 'base1-28', 'growlithe-meadow', mine(0)],
  ['types', 'type-water', 'Water: pushback and flooding', 'base1-59', 'lapras-lagoon', 's.wet.filter((v) => v > 0).length > 6'],
  ['types', 'type-lightning', 'Lightning: fastest, arcs through water', 'sma-SV13', 'lapras-lagoon', mine(0)],
  ['types', 'type-grass', 'Grass: roots and drains', 'base1-44', 'zarude-jungle', 's.players[1].fighter.slow'],
  ['types', 'type-fighting', 'Fighting: armour while winding up', 'base1-52', 'herdier-temple', '!!s.players[0].fighter.cast'],
  ['types', 'type-darkness', 'Darkness: ambush lunge', 'me55-95', 'liepard-night-city', '!!s.players[0].fighter.cast'],
  ['types', 'type-metal', 'Metal: heavy, braces', 'swsh12pt5-92', 'sableye-crystal-cave', mine(0)],
  ['types', 'type-dragon', 'Dragon: pierces, wide beams', 'swsh7-110', 'magmar-volcano', 's.beams.some((b) => b.owner === 0) || ' + mine(1)],
  ['types', 'type-fairy', 'Fairy: charm (the foe hits weaker)', 'sma-SV34', 'cresselia-moonlit-sky', 's.beams.some((b) => b.owner === 0) || !!s.players[0].fighter.cast'],
  ['types', 'type-colorless', 'Colorless: quick and reliable (Whirlwind)', 'base1-57', 'growlithe-meadow', 's.swings.some((w) => w.owner === 0) || !!s.players[0].fighter.cast'],
]
// the vfx sheet: [archetype, card, attack index, label] (tools/kits/looks.ts --pick, a few swapped for the move that
// names it best). Melee and dash archetypes are drawn by the swing / fighter code and are not on this sheet
const VFX = [
  ['wave', 'swsh7-34', 0, 'Wave Splash'], ['surf', 'swsh7-25', 1, 'Surf'], ['ripple', 'base1-53', 0, 'Thunder Wave'],
  ['beam', 'sma-SV30', 0, 'Core Beam'], ['hyperbeam', 'swsh7-228', 1, 'Photon Laser'], ['solar', 'swsh7-6', 1, 'Solar Beam'],
  ['pulse', 'swsh12pt5-100', 0, 'Dragon Pulse'], ['zap', 'neo1-34', 1, 'Electric Current'], ['stream', 'base1-59', 0, 'Water Gun'],
  ['hydro', 'swsh11-37', 0, 'Hydro Splash'], ['drain', 'sma-SV34', 0, 'Draining Kiss'], ['fireball', 'swsh7-93', 0, 'Fiery Wrath'],
  ['fan', 'neo1-23', 0, 'Sputter (ember)'], ['bolt', 'swsh12pt5gg-GG08', 0, 'Explosive Bolt'], ['thunder', 'swsh9-52', 0, 'Windup Thunder'],
  ['rain', 'swsh11-39', 0, 'Rain Splash'], ['hazard', 'swsh11-13', 0, 'Fan Tornado'], ['quake', 'base1-19', 1, 'Earthquake'],
  ['leaves', 'neo1-50', 0, 'Petal Dance'], ['boomerang', 'swsh12pt5-1', 0, 'Leaf Boomerang'], ['vortex', 'base1-13', 1, 'Whirlpool'],
  ['mud', 'swsh11-106', 0, 'Mud-Slap'], ['rockslide', 'sm115-35', 0, 'Rock Slide'], ['lob', 'swsh11-141', 0, 'Garbage Attack'],
  ['bubble', 'neo1-48', 0, 'Bubble'], ['orb', 'me55-77', 1, 'Magical Shot (psychic)'], ['ball', 'sm115-21', 0, 'Lightning Ball'],
  ['blast', 'swsh11-91', 0, 'Geo Cannon'], ['sphere', 'swsh9-79', 0, 'Aura Sphere Volley'], ['barrage', 'base1-69', 0, 'Poison Sting'],
  ['stars', 'swsh9-71', 0, 'Rainbow Flavor'], ['weave', 'swsh12pt5-11', 0, 'Leafage'], ['seed', 'neo1-7', 1, 'Leech Seed'],
  ['spit', 'sma-SV19', 0, 'Spit Poison'], ['web', 'neo1-27', 0, 'Spider Web'], ['phase', 'swsh11-76', 0, 'Doom Curse'],
  ['hypno', 'me55-1', 0, 'Hypnosis'], ['bullet', 'me55-139', 0, 'Pay Day'], ['sniper', 'swsh11-36', 1, 'Hydro Jet'],
  ['lance', 'base1-55', 0, 'Horn Hazard'], ['bounce', 'swsh12pt5gg-GG68', 0, 'Metal Blast'], ['breath', 'swsh9-34', 0, 'Ice Breath'],
  ['flame', 'swsh9-23', 0, 'Firebreathing'], ['gust', 'swsh11-13', 1, 'Tearing Gust'], ['snow', 'neo1-79', 0, 'Powder Snow'],
  ['heat', 'swsh11-26', 0, 'Heat Blast'], ['glare', 'neo1-24', 0, 'Mean Look'], ['roar', 'me55-3', 1, 'Bug Buzz'],
  ['sound', 'me55-110', 0, 'Screech'], ['nova', 'neo1-34', 0, 'Discharge'], ['explode', 'base1-53', 1, 'Selfdestruct'],
  ['gas', 'swsh9-84', 0, 'Poison Gas'], ['powder', 'neo1-49', 0, 'Poisonpowder'], ['pillar', 'swsh9-76', 0, 'Desert Pillar'],
  ['max', 'swsh11tg-TG13', 0, 'G-Max Wave'],
]
const vfx = sheetArg === 'vfx'
const ALL = vfx ? VFX.map(([look, card, i, label]) => ['vfx', look, `${label} (${look})`, card, 'herdier-temple', null, i]) : SCENES
const RUN = ALL.filter(([, n]) => !only.length || only.includes(n))

const ids = new Set([FOE, ...ALL.map((s) => s[3])])
const collection = [...ids].map((id) => {
  const c = data[id]
  if (!c) throw new Error(`no card ${id}`)
  const meta = pack[id] ?? {}
  return { card: id, character: meta.character, name: meta.name ?? id, set: meta.set, rarity: meta.rarity, caught: true, count: 1, shiny: false, data: c }
})
const API = {
  '/api/health': { ok: true, version: 'move-shots', api: 1, state: '', pokeshell: { found: true, version: 'stand-in' } },
  '/api/collection': { cards: collection },
  '/api/wallet': { tokens: 0 },
  '/api/teams': { version: 1, selected: null, teams: [] },
  '/api/heartbeat': { ok: true },
}

/** in the page: stage one forced cast of attack `ai` (the vfx sheet) and hold the sim at the moment. Resolves true
 * when the moment came. The sim is held through the loop's hit-stop counter (pinned), so the page keeps drawing it */
function stage([ai, card]) {
  const r = window.__arena.runner
  const FPX = 256, ME = { x: 560, y: 540 }
  // an evolved card enters the match as its Basic: stage the card itself (its kit is in the match as an evolution)
  const want = r.def.kits.findIndex((k) => k.card === card)
  const m = r.s.players[0].members[r.s.players[0].active]
  if (want >= 0) m.kit = want
  const kit = r.def.kits[m.kit]
  const sh = kit.attacks[ai].shape
  const n = (k, d) => (typeof sh[k] === 'number' ? sh[k] : d)
  // the foe's distance: inside the shape's reach (an aimed area lands at its range, so the foe stands there)
  const D = sh.kind === 'projectile' ? Math.min(460, n('range', 600) * (sh.path === 'lob' ? 1 : 0.75))
    : sh.kind === 'beam' ? Math.min(440, n('length', 500) * 0.8)
      : sh.kind === 'cone' ? n('range', 160) * 0.75
        : sh.kind === 'area' && sh.at === 'aim' ? Math.min(560, n('range', 300))
          : sh.kind === 'area' ? n('radius', 80) * 0.7 : 200
  // how long after release to hold: a shot about half-way, an aimed area just after it lands, a lingering one a while
  const line = n('stagger', 8) * (Math.max(1, n('count', 1)) - 1)
  const wait = sh.kind === 'projectile' ? Math.max(5, Math.round((Math.max(40, D * (sh.path === 'lob' ? 0.5 : 0.8) - n('radius', 10) * 2 - 50) / 2) / Math.max(1, n('speed', 12))))
    : sh.kind === 'beam' ? 2 : sh.kind === 'cone' || sh.kind === 'melee' ? 3
      : sh.kind === 'area' ? (sh.at === 'aim' ? n('delay', 30) + line + 3 : 4) + (n('ticks', 1) > 30 ? 20 : 0) : 3
  // rocks from above: caught mid-fall (the last one still dropping)
  const falling = kit.attacks[ai].look === 'rockslide' || kit.attacks[ai].look === 'meteor'
  const hold = falling ? Math.max(2, wait - 10) : wait
  const w = Math.min(1920, Math.max(760, D + 460)), h = Math.round((w * 9) / 16)
  window.__vfxBox = { x: Math.round(Math.max(0, ME.x + D / 2 - w / 2)), y: Math.round(Math.max(0, Math.min(1080 - h, ME.y - h / 2))), width: Math.round(w), height: h }
  let rel = null, press = false, done = false
  // this cast's shapes only: the ones made from here on (the bots may have left a shot in the air)
  const from = r.s.nextId
  r.s.projectiles = r.s.projectiles.filter((p) => p.owner !== 0); r.s.areas = r.s.areas.filter((x) => x.owner !== 0)
  const place = (s) => {
    const me = s.players[0].fighter, foe = s.players[1].fighter
    me.x = ME.x * FPX; me.y = ME.y * FPX; foe.x = Math.round((ME.x + D) * FPX); foe.y = ME.y * FPX; foe.knock = null
  }
  r.bots[1].input = () => ({ mx: 0, my: 0, aim: 128, buttons: 0 })
  return new Promise((ok) => {
    setTimeout(() => ok(done), 20000)
    r.bots[0].input = (s) => {
      const me = s.players[0].fighter, foe = s.players[1].fighter
      const own = (x) => x.owner === 0 && x.id >= from
      const mine = s.projectiles.some(own) || s.areas.some(own) || s.beams.some(own) || s.swings.some(own)
      if (!me.cast && !mine && !me.dash && rel === null) place(s)
      const aim = Math.round((Math.atan2(foe.y - me.y, foe.x - me.x) / (Math.PI * 2)) * 256) & 255
      press = !press
      if (mine && rel === null && !me.cast) rel = s.tick
      if (rel !== null && !done && s.tick - rel >= hold) { done = true; Object.defineProperty(r.loop, 'freeze', { get: () => 1e9, set: () => {} }); ok(true) }
      return { mx: 0, my: 0, aim, buttons: rel === null && !me.cast && press ? 1 << ai : 0 }
    }
  })
}

const { createServer } = await import('vite')
const server = await createServer({ root, server: { port: 5199, strictPort: false }, logLevel: 'warn' })
await server.listen()
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch()
const errors = []
const shots = { moves: [], types: [], vfx: [] }
try {
  for (const [sheet, name, label, me, arena, when, force] of RUN) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => { errors.push(`${name}: ${e.message}`); if (errors.length < 4) console.log('page error', name, e.stack) })
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(API[path] ?? {}) })
    })
    await page.goto(`${base}?auto=1&bots=1&mode=1v1&me=${me}&foe=${FOE}&arena=${arena}&seed=7&diff=normal`)
    try {
      await page.waitForFunction(() => window.__arena?.state?.().phase === 'fight', null, { timeout: 60000 })
    } catch { console.log(`${name}: the match never started; skipped`); await ctx.close(); continue }
    // staging: keep the meters topped up and nobody KO'd, so the signature moves keep coming (a demo nicety, not the rules)
    // (the dodge scenes let the foe attack: a bot only dodges what comes at it)
    await page.evaluate((foeFights) => {
      window.__foeFights = foeFights
      window.__topUp = setInterval(() => {
        const s = window.__arena?.state?.()
        if (!s) return
        // the foe is a punching bag: full HP, an empty meter (it dodges and moves, never attacks)
        s.players.forEach((p, i) => { p.pips = p.pips.map(() => (i === 0 || window.__foeFights ? 5 : 0)); for (const m of p.members) if (!m.ko) m.hp = m.maxHp })
      }, 200)
    }, name.startsWith('move-'))
    let got = true
    if (vfx) {
      await page.waitForTimeout(1600) // past the FIGHT! banner
      got = await page.evaluate(stage, [force, me])
      if (!got) console.log(`${name}: the moment didn't come; shooting anyway`)
      await page.waitForTimeout(150) // a few drawn frames of the held moment (particles, trails)
    } else try {
      await page.waitForFunction(new Function(`const s = window.__arena.state(); return s.phase === 'fight' && (${when})`), null, { timeout: 45000, polling: 16 })
    } catch { got = false; console.log(`${name}: the moment didn't come in 45 s; shooting anyway`) }
    // crop around the fight: both fighters and what's between them
    const box = await page.evaluate(() => {
      const s = window.__arena?.state?.()
      if (!s) return { x: 0, y: 0, width: 1920, height: 1080 }
      const f = s.players.map((p) => p.fighter)
      const cx = (f[0].x + f[1].x) / 2 / 256, cy = (f[0].y + f[1].y) / 2 / 256
      const w = Math.min(1920, Math.max(960, Math.abs(f[0].x - f[1].x) / 256 + 480)), h = Math.round(w * 9 / 16)
      const x = Math.max(0, Math.min(1920 - w, cx - w / 2)), y = Math.max(0, Math.min(1080 - h, cy - h / 2))
      return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: h }
    })
    // the vfx sheet: a fixed crop around the staging line (the caster, the shape, the foe)
    if (vfx) Object.assign(box, await page.evaluate(() => window.__vfxBox))
    const file = join(out, `${name}.png`)
    await page.screenshot({ path: file, clip: box })
    shots[sheet].push({ file, label: got ? label : `${label} (not caught)` })
    console.log(`shot ${name}.png (${me}${got ? '' : ', missed'})`)
    await ctx.close()
  }
  // the contact sheets: a 4-wide grid of every scene's crop on disk (an --only rerun refreshes its own), labelled
  const missed = new Set(Object.values(shots).flat().filter((x) => x.label.endsWith('(not caught)')).map((x) => x.file))
  for (const sheet of Object.keys(shots)) {
    shots[sheet] = ALL.filter((s) => s[0] === sheet && existsSync(join(out, `${s[1]}.png`)))
      .map((s) => ({ file: join(out, `${s[1]}.png`), label: missed.has(join(out, `${s[1]}.png`)) ? `${s[2]} (not caught)` : s[2] }))
  }
  for (const [sheet, list] of Object.entries(shots)) {
    if (!list.length) continue
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 400 } })
    const page = await ctx.newPage()
    const img = (f) => `<img src="data:image/png;base64,${readFileSync(f).toString('base64')}">`
    const pair = (f) => {
      const b = beforeDir && join(resolve(beforeDir), f.split(/[\\/]/).pop())
      return b && existsSync(b) ? `<div class="pair"><div>${img(b)}<i>before</i></div><div>${img(f)}<i>after</i></div></div>` : img(f)
    }
    const cells = list.map(({ file, label }) => `<figure>${sheet === 'vfx' ? pair(file) : img(file)}<figcaption>${label}</figcaption></figure>`).join('')
    await page.setContent(`<!doctype html><html><head><style>
      body { margin: 0; padding: 16px; background: #111418; font: 600 18px system-ui, sans-serif; color: #e8ecf1 }
      h1 { margin: 0 0 12px; font-size: 24px } main { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px }
      figure { margin: 0; background: #1b2027; border-radius: 10px; overflow: hidden }
      img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block } figcaption { padding: 8px 10px }
      .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 2px } .pair div { position: relative }
      .pair i { position: absolute; left: 6px; top: 4px; font: 700 13px system-ui; color: #fff; text-shadow: 0 1px 2px #000 }
      ${sheet === 'vfx' && beforeDir ? 'main { grid-template-columns: repeat(2, 1fr) }' : ''}
    </style></head><body><h1>${sheet === 'moves' ? 'Moves: trajectories and telegraphs' : sheet === 'vfx' ? 'Archetype visuals, mid-flight (docs/VFX.md)' : 'Type flavours and movement'}</h1><main>${cells}</main></body></html>`)
    await page.screenshot({ path: join(out, `sheet-${sheet}.png`), fullPage: true })
    console.log(`sheet-${sheet}.png (${list.length})`)
    await ctx.close()
  }
} finally {
  await browser.close()
  await server.close()
}
if (errors.length) { console.log('page errors:', errors.join('\n')); process.exitCode = 1 }
