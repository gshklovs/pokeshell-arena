// The teaser's footage (docs/media/teaser.gif; tools/teaser/README.md): real game page clips recorded in headless
// Chromium. Vite runs in-process; the page's /api calls get a stand-in collection from pokeshell's card data
// (POKEARENA_CARDS, read-only), so no host and no pokeshell state are involved. The pack clip runs against the pack demo
// server (scripts/packs-demo.mjs, started here on its own port; its card-image export lands in this checkout's .cache).
//
// Smooth frames at 1080p: the page's clock runs SLOW times slower (performance.now, Date.now, requestAnimationFrame
// timestamps, timers, and CSS / Web Animations through DevTools), the DevTools screencast catches the frames it paints
// with their wall-clock timestamps, and the timestamps are divided back. Per clip: shots/teaser/raw/<clip>.mp4 (50 fps,
// near-lossless), <clip>.events.json (the beats and sim events, seconds into the clip) and <clip>.cam.json (both
// fighters' positions per frame, for the compositor's camera).
//
// The fight clips are directed: a bot-vs-bot team match where a script plays both sides, beat by beat (place the two
// fighters, cast a signature move, the foe dodges, a melee hit, a swap, an evolve, a KO). Every move is the real sim
// running the real kit; only who stands where and which button is pressed is staged.
//   node tools/teaser/capture.mjs [--out shots/teaser/raw] [--only duel-water,pack] [--slow 4] [--probe]
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d)
const root = resolve(import.meta.dirname, '../..')
const out = resolve(arg('--out', join(root, 'shots/teaser/raw')))
const only = (arg('--only', '') ?? '').split(',').filter(Boolean)
const SLOW = Number(arg('--slow', 4))
const PROBE = process.argv.includes('--probe')
const FPS = 50
mkdirSync(out, { recursive: true })

const cardsPath = process.env.POKEARENA_CARDS ?? resolve(root, '../pokeshell/packs/pokemon/carddata.json')
if (!existsSync(cardsPath)) throw new Error('set POKEARENA_CARDS to pokeshell\'s packs/pokemon/carddata.json')
const data = JSON.parse(readFileSync(cardsPath, 'utf8')).cards
const packPath = join(dirname(cardsPath), 'pack.json')
const pack = existsSync(packPath) ? JSON.parse(readFileSync(packPath, 'utf8')).cards : {}

// ---------------------------------------------------------------- the clips
// a beat: `card` (its kit is put on your active Pokémon) casts attack `ai` at the foe `d` px away. `dodge`: the foe
// rolls out of it; `ko`: the foe is left on `ko` HP; `swap` / `evolve`: you swap to the next slot / evolve; `walk`:
// both walk at each other a moment first. `at`: where the two stand (the middle of the pair), `ang` the direction
// from you to the foe (degrees)
const TANK = 'swsh7-29' // Gyarados VMAX: 330 HP
const FIGHTS = [
  { name: 'duel-water', arena: 'lapras-lagoon', me: 'base1-2,swsh7-50,swsh9-55', at: [960, 600], beats: [
    { card: 'base1-2', ai: 0, d: 380 }, { card: 'swsh7-50', ai: 1, d: 420 }, { card: 'swsh9-55', ai: 1, d: 360 },
    { card: 'swsh9-55', ai: 1, d: 340, dodge: true }, { card: 'swsh7-50', ai: 1, d: 380, ko: 30 },
  ] },
  { name: 'duel-fire', arena: 'magmar-volcano', me: 'swsh7-170,swsh7-6,me55-124', at: [960, 560], beats: [
    { card: 'swsh7-170', ai: 1, d: 400 }, { card: 'swsh7-6', ai: 1, d: 420 }, { card: 'me55-124', ai: 0, d: 360 },
    { card: 'swsh7-170', ai: 1, d: 380, ko: 40 },
  ] },
  { name: 'duel-night', arena: 'cresselia-moonlit-sky', me: 'sma-SV69,swsh11-74,swsh7-8', at: [960, 560], beats: [
    { card: 'sma-SV69', ai: 1, d: 400 }, { card: 'swsh11-74', ai: 1, d: 420 }, { card: 'swsh11-74', ai: 0, d: 380 },
    { card: 'swsh7-8', ai: 0, d: 340 }, { card: 'sma-SV69', ai: 1, d: 380, dodge: true },
  ] },
  { name: 'duel-storm', arena: 'kyogre-storm-sea', me: 'swsh11tg-TG13,base1-16,swsh7-14,swsh7-27', at: [960, 560], beats: [
    { card: 'swsh7-27', ai: 0, d: 400 },
    { card: 'swsh11tg-TG13', ai: 0, d: 380 }, { card: 'base1-16', ai: 1, d: 420 }, { card: 'swsh7-14', ai: 1, d: 360 },
  ] },
  // melee: Leafeon V's Leaf Blade and a close-up brawl; a swap; then the evolve
  { name: 'melee', arena: 'zarude-jungle', me: 'swsh7-7,base1-4,base1-16', at: [960, 560], beats: [
    { card: 'swsh7-7', ai: 0, d: 110, walk: true }, { card: 'swsh7-7', ai: 1, d: 110 }, { card: 'swsh7-7', ai: 0, d: 110 },
    { swap: true }, { evolve: true }, { evolve: true },
  ] },
  { name: 'evo', arena: 'herdier-temple', me: 'base1-4,swsh7-50,base1-2', at: [960, 560], beats: [
    { evolve: true, d: 300 }, { evolve: true, d: 300 }, { card: 'base1-4', ai: 1, d: 300 },
  ] },
  { name: 'duel-ice', arena: 'glastrier-ice-field', me: 'neo1-44,swsh9-55,swsh7-8', at: [960, 560], beats: [
    { card: 'neo1-44', ai: 1, d: 380 }, { card: 'swsh7-8', ai: 1, d: 400 }, { card: 'swsh9-55', ai: 1, d: 360, ko: 30 },
  ] },
  { name: 'duel-cave', arena: 'sableye-crystal-cave', me: 'swsh9-55,sma-SV46,base1-2', at: [960, 560], beats: [
    { card: 'swsh9-55', ai: 1, d: 360 }, { card: 'sma-SV46', ai: 0, d: 420 }, { card: 'base1-2', ai: 0, d: 380, dodge: true },
  ] },
]
const CLIPS = [...FIGHTS.map((f) => ({ ...f, kind: 'fight' })), { name: 'pack', kind: 'pack', secs: 30 }]
const RUN = CLIPS.filter((c) => !only.length || only.includes(c.name))

const ids = new Set(['base1-46', 'base1-24', 'base1-4', TANK, 'neo1-45', 'base1-63', 'base1-42', ...FIGHTS.flatMap((f) => f.me.split(','))])
const collection = [...ids].map((id) => {
  const c = data[id]
  if (!c) throw new Error(`no card ${id}`)
  const meta = pack[id] ?? {}
  return { card: id, character: meta.character, name: meta.name ?? id, set: meta.set, rarity: meta.rarity, caught: true, count: 1, shiny: false, data: c }
})
const API = {
  '/api/health': { ok: true, version: 'teaser', api: 1, state: '', pokeshell: { found: true, version: 'stand-in' } },
  '/api/collection': { cards: collection },
  '/api/wallet': { tokens: 0 },
  '/api/teams': { version: 1, selected: null, teams: [] },
  '/api/heartbeat': { ok: true },
}

// ---------------------------------------------------------------- the slow clock (an init script)
const slowClock = (SLOW) => {
  const rp = performance.now.bind(performance), rd = Date.now, p0 = rp(), d0 = rd()
  window.__vt = { p0, d0, slow: SLOW, now: () => (rp() - p0) / SLOW }
  performance.now = () => p0 + (rp() - p0) / SLOW
  Date.now = () => Math.round(d0 + (rd() - d0) / SLOW)
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => raf((t) => cb(p0 + (t - p0) / SLOW))
  const st = window.setTimeout.bind(window), si = window.setInterval.bind(window)
  window.setTimeout = (fn, ms, ...a) => st(fn, (Number(ms) || 0) * SLOW, ...a)
  window.setInterval = (fn, ms, ...a) => si(fn, (Number(ms) || 0) * SLOW, ...a)
}

/** record the page while `run` runs: the frames as JPEGs with their virtual times (ms on the page's clock) */
async function record(page, dir, run) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Animation.enable')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / SLOW })
  const vt = await page.evaluate(() => ({ d0: window.__vt.d0, slow: window.__vt.slow }))
  const frames = []
  cdp.on('Page.screencastFrame', (ev) => {
    const f = join(dir, `${String(frames.length).padStart(5, '0')}.jpg`)
    writeFileSync(f, Buffer.from(ev.data, 'base64'))
    frames.push({ f, t: (ev.metadata.timestamp * 1000 - vt.d0) / vt.slow })
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
  try { await run() } finally { await cdp.send('Page.stopScreencast').catch(() => {}) }
  await page.waitForTimeout(300)
  // in time order, one frame per timestamp
  frames.sort((a, b) => a.t - b.t)
  return frames.filter((f, i) => i === 0 || f.t > frames[i - 1].t + 0.5)
}

/** the frames to a constant-rate mp4 (each frame held until the next one's time) */
function encode(frames, file) {
  const list = frames.map((f, i) => `file '${f.f.replace(/\\/g, '/')}'\nduration ${(((frames[i + 1]?.t ?? f.t + 20) - f.t) / 1000).toFixed(5)}`).join('\n')
  const lf = file.replace(/\.mp4$/, '.txt')
  writeFileSync(lf, list + `\nfile '${frames[frames.length - 1].f.replace(/\\/g, '/')}'\n`)
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lf, '-vf', `fps=${FPS}`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', file], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`)
  rmSync(lf, { force: true })
}

const vwait = (page, ms) => page.waitForTimeout(ms * SLOW)

/** in the page: set up the director (both bots' inputs, the logs, the camera log) */
function director() {
  const r = window.__arena.runner
  const FP = 256
  window.__log = []
  window.__cam = []
  const feed = r.renderer.feed.bind(r.renderer)
  r.renderer.feed = (evs, s) => {
    const t = window.__vt.now()
    for (const e of evs) {
      if (e.k === 'cast') {
        const pl = s.players[e.p], m = pl.members[pl.active], k = r.def.kits[m?.kit], a = k?.attacks[e.attack]
        window.__log.push({ t, k: 'cast', p: e.p, card: k?.card, name: a?.name, look: a?.look ?? null, shape: a?.shape?.kind })
      } else if (['ko', 'swap', 'evolve', 'parry', 'splat', 'throw', 'landed', 'impact'].includes(e.k) || e.k === 'strike' || (e.k === 'dmg' && e.amount >= 20)) {
        window.__log.push({ t, k: e.k, p: e.p, amount: e.amount, x: e.x !== undefined ? Math.round(e.x / FP) : undefined, y: e.y !== undefined ? Math.round(e.y / FP) : undefined })
      }
    }
    return feed(evs, s)
  }
  const camLoop = () => {
    const s = r.s
    const a = s.players[0].fighter, b = s.players[1].fighter
    window.__cam.push([Math.round(window.__vt.now()), Math.round(a.x / FP), Math.round(a.y / FP), Math.round(b.x / FP), Math.round(b.y / FP)])
    requestAnimationFrame(camLoop)
  }
  requestAnimationFrame(camLoop)
  // both sides: idle until a beat says otherwise; energy always full; the foe's HP topped up unless a KO is wanted
  window.__ctl = { me: null, foe: null, keepHp: true }
  // no hit ends the foe before its KO beat (a super-effective Thunderbolt does 244)
  for (const m of r.s.players[1].members) { m.maxHp = 5000; m.hp = 5000 }
  const idle = () => ({ mx: 0, my: 0, aim: 0, buttons: 0 })
  r.bots[0].input = (s) => (window.__ctl.me ?? idle)(s)
  r.bots[1].input = (s) => (window.__ctl.foe ?? idle)(s)
  window.__topUp = setInterval(() => {
    const s = r.s
    s.players.forEach((p) => { p.pips = p.pips.map(() => 10) })
    if (window.__ctl.keepHp) for (const m of s.players[1].members) if (!m.ko) m.hp = m.maxHp
    for (const m of s.players[0].members) if (!m.ko) m.hp = m.maxHp
  }, 50)
}

/** in the page: play one beat; resolves (with what happened) when it's over */
function beat(b) {
  const r = window.__arena.runner
  const FP = 256
  const s0 = r.s
  const me0 = s0.players[0], foe0 = s0.players[1]
  const aimAt = (s) => { const a = s.players[0].fighter, f = s.players[1].fighter; return Math.round((Math.atan2(f.y - a.y, f.x - a.x) / (Math.PI * 2)) * 256) & 255 }
  const ctl = window.__ctl
  const ang = ((b.ang ?? 0) * Math.PI) / 180
  const place = (s) => {
    const a = s.players[0].fighter, f = s.players[1].fighter, d = b.d ?? 360
    const [cx, cy] = b.at
    a.x = Math.round((cx - (Math.cos(ang) * d) / 2) * FP); a.y = Math.round((cy - (Math.sin(ang) * d) / 2) * FP)
    f.x = Math.round((cx + (Math.cos(ang) * d) / 2) * FP); f.y = Math.round((cy + (Math.sin(ang) * d) / 2) * FP)
    f.knock = null; a.knock = null
  }
  if (b.card) {
    const want = r.def.kits.findIndex((k) => k.card === b.card)
    const m = me0.members[me0.active]
    if (want >= 0 && m) m.kit = want
  }
  me0.usedOnce = []
  if (!b.keep && !b.swap && !b.evolve) place(s0)
  if (b.evolve && b.d) place(s0)
  ctl.keepHp = !b.ko
  if (b.ko) { const m = foe0.members[foe0.active]; if (m && !m.ko) m.hp = b.ko }
  const from = s0.nextId
  const t0 = s0.tick
  return new Promise((ok) => {
    let state = 'go', hitAt = null, press = false, dodged = false, endAt = null
    const finish = (why) => { if (endAt === null) endAt = { tick: r.s.tick, why } }
    ctl.foe = (s) => {
      const f = s.players[1].fighter, a = s.players[0].fighter
      if (b.dodge && !dodged) {
        const near = s.projectiles.some((p) => p.owner === 0 && p.id >= from && Math.hypot(p.x - f.x, p.y - f.y) < 190 * FP)
          || (s.players[0].fighter.cast && s.tick - t0 > 12 && b.dodgeEarly)
        if (near) { dodged = true; return { mx: 0, my: -1, aim: 0, buttons: 8 } }
      }
      if (b.walk && s.tick - t0 < 40) return { mx: Math.sign(a.x - f.x), my: 0, aim: 0, buttons: 0 }
      return { mx: 0, my: 0, aim: 0, buttons: 0 }
    }
    ctl.me = (s) => {
      const a = s.players[0].fighter, f = s.players[1].fighter
      if (endAt) {
        if (s.tick - endAt.tick > (b.tail ?? 40)) { ctl.me = null; ctl.foe = null; ok({ ...endAt, dodged }) }
        return { mx: 0, my: 0, aim: aimAt(s), buttons: 0 }
      }
      if (s.tick - t0 > 240) finish('timeout')
      if (b.walk && s.tick - t0 < 40) return { mx: Math.sign(f.x - a.x), my: 0, aim: aimAt(s), buttons: 0 }
      if (b.swap) { if (s.events.some((e) => e.k === 'swap' && e.p === 0)) finish('swap'); return { mx: 0, my: 0, aim: aimAt(s), buttons: 2 << 8 } }
      if (b.evolve) {
        s.players[0].evo = 60
        if (s.events.some((e) => e.k === 'evolve' && e.p === 0)) finish('evolve')
        press = !press
        return { mx: 0, my: 0, aim: aimAt(s), buttons: press ? 64 : 0 }
      }
      const own = (x) => x.owner === 0 && x.id >= from
      const out = s.projectiles.some(own) || s.areas.some(own) || s.beams.some(own) || s.swings?.some(own)
      if (state === 'go' && (a.cast || out || a.dash)) state = 'cast'
      if (s.events.some((e) => (e.k === 'dmg' && e.p === 1) || (e.k === 'landed' && e.p === 0) || (e.k === 'ko' && e.p === 1))) hitAt ??= s.tick
      if (state === 'cast' && !a.cast && !out && !a.dash) finish(hitAt !== null ? 'hit' : 'done')
      if (hitAt !== null && s.tick - hitAt > 30) finish('hit')
      press = !press
      return { mx: 0, my: 0, aim: aimAt(s), buttons: state === 'go' && press ? 1 << b.ai : 0 }
    }
  })
}

async function fight(page, base, c) {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(API[path] ?? {}) })
  })
  await page.goto(`${base}?auto=1&bots=1&mode=team&me=${c.me}&foe=${TANK},${TANK},${TANK}&arena=${c.arena}&seed=${c.seed ?? 4}&diff=normal`)
  await page.waitForFunction(() => window.__arena?.runner, null, { timeout: 90000 })
  if (PROBE) {
    const kits = await page.evaluate(() => window.__arena.runner.def.kits.map((k) => `${k.card} ${k.name}: ${k.attacks.map((a, i) => `#${i} ${a.name} [${a.look ?? '-'} ${a.shape.kind}]`).join(', ')}`))
    console.log(c.name, '\n  ' + kits.join('\n  '))
    return null
  }
  await page.waitForFunction(() => window.__arena.state().phase === 'fight', null, { timeout: 60000 })
  await page.evaluate(director)
  await vwait(page, 700) // past most of the FIGHT! banner
  const results = []
  const frames = await record(page, join(out, c.name), async () => {
    for (const b of c.beats) {
      const t = await page.evaluate(() => window.__vt.now())
      const res = await page.evaluate(beat, { ...b, at: b.at ?? c.at })
      results.push({ t, beat: b, ...res })
    }
    await vwait(page, 400)
  })
  const log = await page.evaluate(() => window.__log)
  const cam = await page.evaluate(() => window.__cam)
  return { frames, events: [...results.map((x) => ({ t: x.t, k: 'beat', ...x })), ...log], cam }
}

/** the pack: the game's random-pack flow (src/game/packs.ts) on the demo server's stand-in host, the roll reel landing
 * on Evolving Skies; the pack itself is rolled in the page with an alt-art hit at the back (the mock booster, real
 * cards), torn and opened by the scene's autoplay, the face-down hits shaken open with the mouse */
async function packClip(page, base, c) {
  await page.goto(`${base}?random=1&roll=swsh7&delay=900&seed=3&auto=1`)
  await page.waitForSelector('#demo-random')
  const res = await page.evaluate(async () => {
    const m = await import('/src/packs/mock.ts')
    const d = await m.loadMockData('/pokeshell/')
    return m.rollPackWith(d, 'swsh7', 'alt-art', m.seededRandom(11))
  })
  const sets = await (await page.request.get(`${base}api/sets`)).json()
  const s = sets.sets.find((x) => x.id === 'swsh7')
  await page.route('**/api/pack/open', async (route) => {
    await new Promise((ok) => setTimeout(ok, 900 * SLOW))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...res, random: true, setChance: s?.chance, setOneIn: s?.oneIn, tokens: 9, imageBase: '/pokeshell/' }) })
  })
  const log = []
  const frames = await record(page, join(out, c.name), async () => {
    await vwait(page, 300)
    await page.click('#demo-random')
    const until = Date.now() + c.secs * 1000 * SLOW
    let shook = 0
    while (Date.now() < until) {
      const ph = await page.evaluate(() => ({ phase: document.querySelector('.demo-stage [data-phase]')?.dataset.phase ?? '', down: !!document.querySelector('.pk-shake-down'), t: window.__vt.now() }))
      if (log[log.length - 1]?.phase !== ph.phase || log[log.length - 1]?.down !== ph.down) log.push({ k: 'phase', ...ph })
      if (ph.down && shook < 4) {
        // grab the face-down hit and shake it
        const el = await page.$('.pk-shake-down')
        const bb = el && (await el.boundingBox())
        if (bb) {
          shook++
          log.push({ k: 'shake', t: await page.evaluate(() => window.__vt.now()) })
          const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2
          await page.mouse.move(cx, cy)
          await page.mouse.down()
          for (let i = 0; i < 24; i++) { await page.mouse.move(cx + (i % 2 ? 80 : -80), cy + (i % 4 < 2 ? 20 : -20), { steps: 3 }); await page.waitForTimeout(22 * SLOW) }
          await page.mouse.move(cx, cy, { steps: 4 })
          await page.mouse.up()
        }
      }
      await page.waitForTimeout(100)
    }
  })
  return { frames, events: log, cam: [] }
}

// ---------------------------------------------------------------- run
const { createServer } = await import('vite')
const server = await createServer({ root, server: { port: 5293, strictPort: false }, logLevel: 'warn' })
await server.listen()
const base = server.resolvedUrls.local[0]
let demo = null
const PACK_PORT = 5295
if (!PROBE && RUN.some((c) => c.kind === 'pack')) {
  demo = spawn(process.execPath, [join(root, 'scripts/packs-demo.mjs')], { cwd: root, env: { ...process.env, PORT: String(PACK_PORT) }, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true })
  await new Promise((ok, no) => {
    demo.stdout.on('data', (d) => { if (String(d).includes('pack-opening demo:')) ok() })
    demo.on('exit', (code) => no(new Error(`packs-demo exited ${code}`)))
  })
}
const browser = await chromium.launch()
try {
  for (const c of RUN) {
    if (PROBE && c.kind !== 'fight') continue
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: 'dark' })
    await ctx.addInitScript(slowClock, SLOW)
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log(`${c.name}: page error ${e.message}`))
    const r = c.kind === 'fight' ? await fight(page, base, c) : await packClip(page, `http://127.0.0.1:${PACK_PORT}/`, c)
    await ctx.close()
    if (!r) continue
    const t0 = r.frames[0].t
    const secs = (r.frames[r.frames.length - 1].t - t0) / 1000
    for (const e of r.events) e.t = Math.round(e.t - t0) / 1000 // seconds into the clip
    writeFileSync(join(out, `${c.name}.events.json`), JSON.stringify(r.events, null, 1))
    writeFileSync(join(out, `${c.name}.cam.json`), JSON.stringify(r.cam.map(([t, ...p]) => [Math.round(t - t0) / 1000, ...p])))
    encode(r.frames, join(out, `${c.name}.mp4`))
    const gaps = r.frames.slice(1).map((f, i) => f.t - r.frames[i].t)
    console.log(`${c.name}: ${r.frames.length} frames over ${secs.toFixed(1)} s (${(r.frames.length / secs).toFixed(0)} fps, worst gap ${Math.max(...gaps).toFixed(0)} ms)`)
    for (const e of r.events.filter((x) => x.k === 'beat')) console.log(`  ${e.t.toFixed(2)} ${JSON.stringify(e.beat)} -> ${e.why}${e.dodged ? ' (dodged)' : ''}`)
    rmSync(join(out, c.name), { recursive: true, force: true })
  }
} finally {
  await browser.close()
  await server.close()
  if (demo) demo.kill()
}
