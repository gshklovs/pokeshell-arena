// Screenshots and a fight video of the game running (npm run shots). Everything in temp dirs, nothing left running:
//   1. a stand-in pokeshell: tests/fixtures/fake-pokeshell with a richer collection (tools/shots_fixture.py renders
//      real cards' faces from a pokeshell checkout, read-only; else the small test fixture)
//   2. arena-host (host/target/release) on a free port with a temp arena state, stopped through POST /api/shutdown
//   3. Vite in-process, proxying /api and /pokeshell to that host; Playwright's Chromium drives the page
// Writes shots/*.png, shots/fight.webm (and shots/fight.gif when ffmpeg is on PATH).
//   node tools/shots.mjs [--out shots] [--pokeshell ..\pokeshell] [--only loadout,team,...] [--host <arena-host.exe>]
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d)
const root = resolve(import.meta.dirname, '..')
const out = resolve(arg('--out', 'shots'))
const only = arg('--only', '')?.split(',').filter(Boolean) ?? []
const want = (k) => !only.length || only.includes(k)
mkdirSync(out, { recursive: true })
const tmp = mkdtempSync(join(tmpdir(), 'arena-shots-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- 1. the stand-in pokeshell
const shell = resolve(root, 'tests/fixtures/fake-pokeshell/scripts/pokeshell.ps1')
const pokeshellRepo = resolve(arg('--pokeshell', resolve(root, '../pokeshell')))
const repoGuess = [pokeshellRepo, resolve(root, '../../../../pokeshell')].find((p) => existsSync(join(p, 'packs/pokemon/carddata.json')))
let home = join(tmp, 'home')
let collection = resolve(root, 'tests/fixtures/collection.json')
if (repoGuess) {
  const py = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [resolve(root, 'tools/shots_fixture.py'), '--pokeshell', repoGuess, '--out', join(tmp, 'fx')], { encoding: 'utf8' })
  if (py.status === 0) { home = join(tmp, 'fx', 'home'); collection = join(tmp, 'fx', 'collection.json'); console.log(py.stdout.trim()) }
  else console.log('shots: fixture build failed, using the small test fixture:', (py.stderr || '').slice(0, 300))
}
mkdirSync(home, { recursive: true })

// ---------------------------------------------------------------- 2. arena-host
const exe = resolve(arg('--host', resolve(root, 'host/target/release/arena-host.exe')))
if (!existsSync(exe)) throw new Error('arena-host is not built: cargo build --release --manifest-path host\\Cargo.toml')
const state = join(tmp, 'arena-state')
mkdirSync(state, { recursive: true })
const hostProc = spawn(exe, ['--port', '0', '--state', state, '--dist', resolve(root, 'dist'), '--pokeshell', shell, '--pokeshell-home', home, '--no-idle-exit'],
  { env: { ...process.env, FAKE_POKESHELL_COLLECTION: collection, POKESHELL_HOME: home }, stdio: 'ignore', windowsHide: true })
let port = 0
for (let i = 0; i < 100 && !port; i++) {
  await sleep(100)
  try { port = JSON.parse(readFileSync(join(state, 'host.json'), 'utf8')).port } catch { /* not yet */ }
}
if (!port) throw new Error('arena-host did not start')
const hostUrl = `http://127.0.0.1:${port}`
process.env.POKEARENA_HOST = hostUrl
// two pack tokens in the stand-in's wallet, so the result screen's pack button has something to open
await fetch(`${hostUrl}/api/health`).catch(() => {})

// ---------------------------------------------------------------- 3. Vite + Chromium
const { createServer } = await import('vite')
const server = await createServer({ root, server: { port: 5199, strictPort: false, fs: { allow: [root] } }, logLevel: 'warn' })
await server.listen()
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch()
const errors = []
async function newPage(video = false, colorScheme = 'light') {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme, ...(video ? { recordVideo: { dir: tmp, size: { width: 1280, height: 720 } } } : {}) })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  return { ctx, page }
}
let { ctx, page } = await newPage()
const wait = (ms) => page.waitForTimeout(ms)
const shot = async (name) => { await page.screenshot({ path: resolve(out, `${name}.png`) }); console.log('shot', name) }
const fight = () => page.waitForFunction(() => window.__arena?.state?.().phase === 'fight', null, { timeout: 20000 })
/** wait until a stat of the running match passes a value (e.g. the first KO) */
const until = (fn, arg2, timeout = 60000) => page.waitForFunction(fn, arg2, { timeout, polling: 30 })

try {
  // 1. the loadout: a team of three with an evolution line, the collection with card faces
  if (want('loadout')) {
    await page.goto(`${base}?deck=choose&mode=team&team=base1-46,base1-63,swsh7-7&diff=hard`)
    await page.waitForSelector('.card')
    await wait(900)
    await shot('01-loadout')
    await page.click('.modes button[data-v="1v1"]')
    await wait(300)
    await shot('02-loadout-1v1')
    // evolved cards in the team enter as the Basic of their line (the slot says "starts ▸ Charmander → ...")
    await page.goto(`${base}?deck=choose&mode=team&team=base1-4,base1-42,base1-14&diff=normal`)
    await page.waitForSelector('.card')
    await wait(900)
    await shot('01b-loadout-lines')
    // the card list sorted by last pulled (newest first); then back to the default for the shots after
    await page.selectOption('#sort', 'pulled')
    await wait(300)
    await shot('01c-loadout-last-pulled')
    await page.selectOption('#sort', 'hp')
  }

  // 1b. the two bot-match modes: Random decks (yours from your cards, the bot's from all) and You choose (the bot
  // rolls good cards for its level), each shown on the reveal before the fight
  if (want('modes')) {
    await page.goto(`${base}?deck=random&mode=team&diff=normal`)
    await page.waitForSelector('.slot.mystery')
    await wait(500)
    await shot('12-loadout-random')
    await page.click('#go')
    await page.waitForSelector('.rv-mon')
    await wait(1400)
    await shot('13-reveal-random')
    const before = await page.evaluate(() => window.__arena.rolled().me.picked.map((e) => e.kit.card).join())
    await page.keyboard.press('KeyR')
    await page.waitForFunction((b) => window.__arena.rolled?.()?.me.picked.map((e) => e.kit.card).join() !== b, before)
    await wait(1400)
    await shot('14-reveal-rerolled')
    const owned = await page.evaluate(() => window.__arena.rolled().me.picked.every((e) => e.owned))
    console.log(`random decks: your rolled team is all owned cards: ${owned}`)
    await page.goto(`${base}?deck=choose&mode=team&team=base1-4,base1-24,swsh7-8&diff=expert`)
    await page.waitForSelector('.card')
    await page.click('#go')
    await page.waitForSelector('.rv-mon')
    await wait(1400)
    await shot('15-reveal-choose-expert')
    await page.click('#rv-fight')
    await fight()
    console.log('the reveal -> Fight! starts the match')
  }

  // 2. a team match (bot vs bot, a demo): the intro, mid-fight, a swap, a KO, an evolution
  if (want('team')) {
    await page.goto(`${base}?auto=1&bots=1&mode=team&me=base1-24,base1-42,base1-14&diff=normal&arena=lapras-lagoon&seed=21`)
    await page.waitForFunction(() => window.__arena?.state?.().phase === 'countdown', null, { timeout: 20000 })
    await wait(1300)
    await shot('03-team-intro')
    await fight()
    await wait(3500)
    await shot('04-team-fight')
    await until(() => window.__arena.runner.stats.swaps.reduce((a, b) => a + b, 0) > 0 || window.__arena.runner.stats.kos.some((k) => k > 0))
    await wait(120)
    await shot('05-team-swap')
    await until(() => window.__arena.runner.stats.kos.some((k) => k > 0))
    await wait(220)
    await shot('06-team-ko')
  }

  // 2b. you in a team match: a click on the team bar goes through to the arena (an attack, no swap); the number key
  // swaps (paying the retreat); a KO brings up the picker, 3 picks
  if (want('swap')) {
    await page.goto(`${base}?auto=1&mode=team&me=base1-58,base1-63,base1-46&diff=hard&arena=growlithe-meadow&seed=4`)
    await fight()
    await wait(700)
    // team slot 2 of 3 in the HUD's layout (design px 994..1126, 850..920)
    const at = await page.evaluate(() => {
      const c = document.querySelector('#game').getBoundingClientRect()
      return { x: c.left + (1060 * c.width) / 1920, y: c.top + (885 * c.height) / 1080 }
    })
    const before = await page.evaluate(() => window.__arena.state().players[0].active)
    await page.mouse.click(at.x, at.y)
    await wait(150)
    const clicked = await page.evaluate(() => window.__arena.state().players[0].active)
    console.log(`click on team slot 2 -> active member ${clicked + 1} (was ${before + 1}: clicks don't swap)`)
    // the click was an attack and spent energy: wait until the meter can pay the retreat again, then press 2
    await page.waitForFunction(() => (window.__arena.state().players[0].pips[0] ?? 0) >= 2 && window.__arena.state().players[0].swapCd === 0, null, { timeout: 15000 }).catch(() => {})
    await page.keyboard.press('Digit2')
    await wait(150)
    const swapped = await page.evaluate(() => window.__arena.state().players[0].active)
    console.log(`key 2 -> active member ${swapped + 1}`)
    await shot('05b-you-swap')
    await until(() => window.__arena.state().players[0].active < 0, null, 60000)
    await wait(250)
    await shot('06b-forced-swap-picker')
    // the mouse over the first picker card: it grows (render-only), its key chip lights up
    const card = await page.evaluate(() => {
      const n = window.__arena.state().players[0].members.filter((m) => !m.ko).length
      const c = document.querySelector('#game').getBoundingClientRect()
      const x = 960 - (n * 190 + (n - 1) * 18) / 2 + 95, y = 412 + 112
      return { x: c.left + (x * c.width) / 1920, y: c.top + (y * c.height) / 1080 }
    })
    await page.mouse.move(card.x, card.y)
    await wait(250)
    await shot('06c-picker-hover')
    await page.keyboard.press('Digit3')
    await wait(200)
    const picked = await page.evaluate(() => window.__arena.state().players[0].active)
    console.log(`forced swap: key 3 -> active member ${picked + 1}`)
  }

  // 2c. the pause menu over a match, and the no-cards screen (the collection answered empty)
  if (want('screens')) {
    await page.goto(`${base}?auto=1&mode=team&me=base1-58,base1-63,base1-46&diff=normal&arena=kyogre-storm-sea&seed=6`)
    await fight()
    await wait(1500)
    await page.keyboard.press('Escape')
    await page.waitForSelector('#pause:not(.hidden) .pause-box')
    await wait(500)
    await shot('16-pause')
    await page.route('**/api/collection', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cards: [] }) }))
    await page.goto(base)
    await page.waitForSelector('.blocked-card')
    await wait(600)
    await shot('17-no-cards')
    await page.unroute('**/api/collection')
  }

  // 2e. quitting a match (a forfeit: a loss, no tokens, recorded as forfeit): from the HUD's Quit button, then from the
  // pause menu with the keyboard (Esc, Q, Q)
  if (want('quit')) {
    const matches = () => { try { return readFileSync(join(state, 'matches.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) } catch { return [] } }
    const n0 = matches().length
    const wallet0 = await (await fetch(`${hostUrl}/api/wallet`)).json().catch(() => ({}))
    await page.goto(`${base}?auto=1&mode=team&me=base1-58,base1-63,base1-46&diff=hard&arena=growlithe-meadow&seed=9`)
    await fight()
    await wait(800)
    await shot('20-quit-button')
    await page.click('#quit')
    await page.waitForSelector('#forfeit-yes')
    await wait(300)
    await shot('21-quit-confirm')
    const pausedWhileAsking = await page.evaluate(() => window.__arena.runner.paused)
    await page.click('#forfeit-yes')
    await page.waitForSelector('#result:not(.hidden) .result-box.lose')
    await page.waitForFunction(() => window.__arena.reward().kind !== 'pending', null, { timeout: 30000 })
    await wait(600)
    await shot('22-quit-result')
    const title = await page.textContent('.res-title')
    // the keyboard path: Esc opens the pause menu, Q asks, Q quits
    await page.goto(`${base}?auto=1&mode=1v1&me=base1-58&diff=easy&arena=herdier-temple&seed=10`)
    await fight()
    await wait(500)
    await page.keyboard.press('Escape')
    await page.waitForSelector('#pause:not(.hidden) #forfeit')
    await page.keyboard.press('KeyQ')
    await page.waitForSelector('#forfeit-yes')
    await page.keyboard.press('KeyQ')
    await page.waitForSelector('#result:not(.hidden) .result-box.lose')
    await page.waitForFunction(() => window.__arena.reward().kind !== 'pending', null, { timeout: 30000 })
    const added = matches().slice(n0)
    const wallet1 = await (await fetch(`${hostUrl}/api/wallet`)).json().catch(() => ({}))
    const ok = pausedWhileAsking && title?.trim() === 'FORFEIT' && added.length === 2 && added.every((m) => m.forfeit === true && m.won === false && m.granted === 0) && wallet1.tokens === wallet0.tokens
    console.log(`quit match: HUD button + pause Q -> ${added.length} forfeits recorded (${added.map((m) => `won=${m.won} forfeit=${m.forfeit} granted=${m.granted}`).join('; ')}), paused while asking: ${pausedWhileAsking}, title ${title?.trim()}, tokens ${wallet0.tokens} -> ${wallet1.tokens}: ${ok ? 'OK' : 'FAILED'}`)
    if (!ok) process.exitCode = 1
  }

  // 2d. the same screens in the dark theme (the binder's night desk; the system scheme drives it)
  if (want('dark')) {
    const d = await newPage(false, 'dark')
    const p2 = d.page
    await p2.goto(`${base}?deck=choose&mode=team&team=base1-46,base1-63,swsh7-7&diff=hard`)
    await p2.waitForSelector('.card')
    await p2.waitForTimeout(900)
    await p2.screenshot({ path: resolve(out, '18-dark-loadout.png') }); console.log('shot 18-dark-loadout')
    await p2.goto(`${base}?auto=1&bots=1&mode=team&me=base1-24,base1-42,base1-14&diff=normal&arena=lapras-lagoon&seed=21`)
    await p2.waitForFunction(() => window.__arena?.state?.().phase === 'fight', null, { timeout: 20000 })
    await p2.waitForTimeout(3500)
    await p2.screenshot({ path: resolve(out, '19-dark-fight.png') }); console.log('shot 19-dark-fight')
    await d.ctx.close()
  }

  // 3. evolution: Charmander with its owned Charmeleon and Charizard; the charge is topped up so the moment comes fast
  if (want('evolve')) {
    await page.goto(`${base}?auto=1&bots=1&mode=team&me=base1-46,base1-58,base1-63&diff=easy&arena=growlithe-meadow&seed=5`)
    await fight()
    await wait(400)
    await page.evaluate(() => { window.__arena.state().players[0].evo = 60 })
    await until(() => window.__arena.runner.stats.evolves[0] > 0, null, 30000).catch(() => {})
    await wait(380)
    await shot('07-evolve')
    await wait(700)
    await shot('07-evolve-b')
  }

  // 4. a won match through the host: Leafeon VMAX against easy bots, played with the keyboard and mouse
  if (want('result')) {
    await page.goto(`${base}?auto=1&mode=1v1&me=swsh7-8&diff=easy&arena=herdier-temple&seed=3`)
    await fight()
    for (let i = 0; i < 500; i++) {
      const st = await page.evaluate(() => {
        const s = window.__arena.state(), r = document.querySelector('#game').getBoundingClientRect()
        const me = s.players[0].fighter, foe = s.players[1].fighter
        return { phase: s.phase, me: { x: me.x / 256, y: me.y / 256 }, foe: { x: foe.x / 256, y: foe.y / 256 }, r: { l: r.left, t: r.top, w: r.width, h: r.height } }
      })
      if (st.phase === 'over') break
      await page.mouse.move(st.r.l + (st.foe.x * st.r.w) / 1920, st.r.t + (st.foe.y * st.r.h) / 1080)
      const keys = []
      if (Math.abs(st.foe.x - st.me.x) > 70) keys.push(st.foe.x > st.me.x ? 'KeyD' : 'KeyA')
      if (Math.abs(st.foe.y - st.me.y) > 70) keys.push(st.foe.y > st.me.y ? 'KeyS' : 'KeyW')
      for (const k of keys) await page.keyboard.down(k)
      await wait(80)
      for (const k of keys) await page.keyboard.up(k)
      await page.keyboard.press(i % 3 === 2 ? 'KeyK' : 'KeyJ')
    }
    await page.waitForSelector('#result:not(.hidden) .result-box', { timeout: 60000 })
    await page.waitForFunction(() => window.__arena.reward().kind !== 'pending', null, { timeout: 30000 })
    await wait(3200)
    await shot('08-result')
    const open = await page.$('#open-pack')
    if (open) {
      // the pack odds panel: every set's chance in a random pack
      await page.click('#result .odds-panel summary')
      await page.waitForSelector('#result .odds-body table', { timeout: 15000 }).catch(() => {})
      await wait(300)
      await shot('08b-pack-odds')
      await page.click('#result .odds-panel summary')
      // a token opens a random pack: first which pack it was (the stand-in rolls Base Set, 1 in 61: the vintage
      // fanfare), then pokeshell's (stand-in's) booster behind the tear gesture
      await open.click()
      await page.waitForSelector('.pk-roll', { timeout: 30000 })
      await wait(1200)
      await shot('09-packs')
      await page.click('.pk-roll')
      await wait(1800)
      await shot('10-pack-opening')
    }
  }

  // 4b. attack info: the attack sheet on the loadout (hover) and the reveal (I), the in-battle peek (hold I), and the
  // aim prediction (hold the mouse on the foe) for a "+" attack (Mewtwo's Psychic 10+) and a coin flip (Leaf Blade 90+)
  if (want('attacks')) {
    await page.goto(`${base}?deck=choose&mode=team&team=base1-10,swsh7-7,base1-14&diff=normal`)
    await page.waitForSelector('.card')
    await wait(600)
    await page.hover('#roster .card[data-card="swsh7-8"]')
    await page.waitForSelector('#atk-pop:not(.hidden) .atk-sheet')
    await wait(400)
    await shot('30-attacks-loadout')
    await page.mouse.move(5, 5)
    await page.click('#go')
    await page.waitForSelector('.rv-mon')
    await wait(1400)
    await page.keyboard.press('KeyI')
    await page.waitForSelector('.rv-details .atk-sheet')
    await wait(900)
    await shot('31-attacks-reveal')
    const aimAtFoe = async () => {
      const st = await page.evaluate(() => {
        const s = window.__arena.state(), r = document.querySelector('#game').getBoundingClientRect()
        const foe = s.players[1].fighter
        return { x: r.left + ((foe.x / 256) * r.width) / 1920, y: r.top + ((foe.y / 256) * r.height) / 1080 }
      })
      await page.mouse.move(st.x, st.y)
    }
    await page.goto(`${base}?auto=1&mode=1v1&me=base1-10&foe=base1-4&diff=easy&arena=growlithe-meadow&seed=12`)
    await fight()
    await wait(2500)
    await page.keyboard.down('KeyI')
    await wait(500)
    await shot('32-attacks-peek')
    await page.keyboard.up('KeyI')
    await aimAtFoe()
    await page.mouse.down()
    for (let k = 0; k < 4; k++) { await wait(120); await aimAtFoe() }
    await shot('33-aim-predict-plus')
    await page.mouse.up()
    await page.goto(`${base}?auto=1&mode=1v1&me=swsh7-7&foe=base1-63&diff=easy&arena=herdier-temple&seed=13`)
    await fight()
    await wait(1500)
    // Leaf Blade is a melee swipe: step up to the foe first (a screenshot shortcut, straight into the state)
    await page.evaluate(() => { const s = window.__arena.state(); const me = s.players[0].fighter, foe = s.players[1].fighter; me.x = foe.x - 110 * 256; me.y = foe.y })
    await aimAtFoe()
    await page.mouse.down()
    for (let k = 0; k < 4; k++) { await wait(120); await aimAtFoe() }
    await shot('34-aim-predict-coin')
    // off the aim path: the nearest foe's number, dimmed
    const off = await page.evaluate(() => {
      const s = window.__arena.state(), r = document.querySelector('#game').getBoundingClientRect()
      const me = s.players[0].fighter, foe = s.players[1].fighter
      const x = (2 * me.x - foe.x) / 256, y = (2 * me.y - foe.y) / 256
      return { x: r.left + (Math.max(40, Math.min(1880, x)) * r.width) / 1920, y: r.top + (Math.max(40, Math.min(1040, y)) * r.height) / 1080 }
    })
    await page.mouse.move(off.x, off.y)
    await wait(400)
    await shot('35-aim-predict-off-path')
    await page.mouse.up()
    // the dry runs are cheap: time one prediction round (an aimed coin-flip attack) in the page
    const ms = await page.evaluate(async () => {
      const m = await import('/src/sim/predict.ts')
      const r = window.__arena.runner
      const t0 = performance.now()
      for (let k = 0; k < 20; k++) m.predictDamage(r.def, r.s, 0, 0, 1)
      return (performance.now() - t0) / 20
    })
    console.log(`prediction: ${ms.toFixed(2)} ms per aimed coin-flip attack (run every 6 frames)`)
  }

  // 4c. the aim info: badges by the Pokémon the held attack touches, the strip at the top with how it works, the
  // wall check. Each match is frozen (runner.paused) once the fighters are placed, so the shot shows that layout
  if (want('aiminfo')) {
    const toPage = (x, y) => page.evaluate(([x, y]) => {
      const r = document.querySelector('#game').getBoundingClientRect()
      return { x: r.left + (x * r.width) / 1920, y: r.top + (y * r.height) / 1080 }
    }, [x, y])
    /** a match, the two fighters placed (design px; `wall`: a wall tile between them, found in the arena), frozen,
     * then attack `button` (0 left, 2 right) held on the foe */
    const aimShot = async (name, url, opts = {}) => {
      await page.goto(`${base}?auto=1&mode=1v1&diff=easy&${url}`)
      await fight()
      await wait(1200)
      const at = await page.evaluate((o) => {
        const s = window.__arena.state(), r = window.__arena.runner
        let me = o.me ?? [760, 560], foe = o.foe ?? [1060, 560]
        if (o.wall) {
          // a wall tile with open floor 4 tiles either side on its row
          for (let i = 0; i < s.tiles.length && o.wall !== 'done'; i++) {
            const tx = i % 48, ty = Math.floor(i / 48)
            if (s.tiles[i] !== 1 || tx < 6 || tx > 41 || ty < 5 || ty > 21) continue
            const free = (x) => s.tiles[ty * 48 + x] === 0
            if ([2, 3, 4].every((d) => free(tx - d) && free(tx + d))) { me = [(tx - 3) * 40 + 20, ty * 40 + 20]; foe = [(tx + 4) * 40 + 20, ty * 40 + 20]; o.wall = 'done' }
          }
        }
        // a later card of the line (a screenshot shortcut, straight into the state): its kit is in the match already
        const k = o.kit ? r.def.kits.findIndex((x) => x.card === o.kit) : -1
        if (k >= 0) { const m = s.players[0].members[0]; m.kit = k; m.maxHp = r.def.kits[k].hp; m.hp = m.maxHp; s.players[0].fighter.cooldowns = r.def.kits[k].attacks.map(() => 0) }
        const p0 = s.players[0].fighter, p1 = s.players[1].fighter
        p0.x = me[0] * 256; p0.y = me[1] * 256; p1.x = foe[0] * 256; p1.y = foe[1] * 256
        s.players[0].pips[0] = o.pips ?? 5
        if (o.foePips !== undefined) s.players[1].pips[0] = o.foePips
        if (o.hurt) s.players[0].members[0].hp = Math.max(10, s.players[0].members[0].hp - o.hurt)
        r.paused = true
        return foe
      }, opts)
      const pt = await toPage(at[0], at[1] - 10)
      await page.mouse.move(pt.x, pt.y)
      await page.mouse.down({ button: opts.button === 2 ? 'right' : 'left' })
      await wait(500)
      await shot(name)
      await page.mouse.up({ button: opts.button === 2 ? 'right' : 'left' })
      await wait(300)
      await page.evaluate(() => { window.__arena.runner.paused = false })
    }
    // an X+ (Psychic: +10 per foe energy), homing
    await aimShot('36-aim-info-plus', 'me=base1-10&foe=base1-4&arena=growlithe-meadow&seed=21', { foePips: 3 })
    // a coin flip that may hurt you (Thunder Jolt), into a weakness
    await aimShot('37-aim-info-coin-recoil', 'me=base1-58&foe=base1-63&arena=herdier-temple&seed=22', { button: 2 })
    // a coin-flip condition (Confuse Ray), an instant beam
    await aimShot('38-aim-info-status', 'me=base1-68&foe=base1-44&arena=growlithe-meadow&seed=23')
    // a straight shot with a wall in the way: dimmed, "blocked by wall"
    await aimShot('39-aim-info-blocked', 'me=base1-44&foe=base1-63&arena=herdier-temple&seed=24', { wall: true })
    // a phase shot (Leafeon VMAX's Grass Knot) through that wall: not blocked; an X+ and a slow on the foe
    await aimShot('40-aim-info-phase', 'me=swsh7-7&foe=base1-63&arena=herdier-temple&seed=25', { wall: true, foePips: 2, kit: 'swsh7-8' })
    // on yourself: Barrier spends your energy and makes you untouchable
    await aimShot('41-aim-info-self', 'me=base1-10&foe=base1-46&arena=growlithe-meadow&seed=26', { button: 2 })
    // a heal on yourself and a slow on the foe (Leech Seed, hurt first)
    await aimShot('42-aim-info-heal', 'me=base1-44&foe=base1-46&arena=growlithe-meadow&seed=27', { hurt: 30 })
    // a 3-shot volley that burns a trail and costs you an energy (Ember), with a pulsing area foe nearby
    await aimShot('43-aim-info-volley', 'me=base1-46&foe=base1-44&arena=growlithe-meadow&seed=28', { button: 2 })
    // a coin-flip shield on yourself (Withdraw)
    await aimShot('44-aim-info-shield', 'me=base1-63&foe=base1-58&arena=growlithe-meadow&seed=29', { button: 2 })
  }

  // 5. the fight video: a team demo match, recorded at 1280x720
  if (want('video')) {
    await ctx.close()
    ;({ ctx, page } = await newPage(true))
    await page.goto(`${base}?auto=1&bots=1&mode=team&me=base1-4,base1-2,base1-15&diff=hard&arena=magmar-volcano&seed=8`)
    await page.waitForFunction(() => window.__arena?.state?.().phase === 'countdown', null, { timeout: 20000 })
    await page.waitForTimeout(16000)
    const v = page.video()
    await ctx.close()
    const src = v ? await v.path() : null
    if (src && existsSync(src)) {
      rmSync(resolve(out, 'fight.webm'), { force: true })
      renameSync(src, resolve(out, 'fight.webm'))
      console.log('video fight.webm')
      const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '2', '-t', '9', '-i', resolve(out, 'fight.webm'), '-vf', 'fps=15,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer', resolve(out, 'fight.gif')])
      if (ff.status === 0) console.log('video fight.gif')
    }
    ;({ ctx, page } = await newPage())
  }
} finally {
  await browser.close()
  await server.close()
  await fetch(`${hostUrl}/api/shutdown`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {})
  for (let i = 0; i < 50 && hostProc.exitCode === null; i++) await sleep(100)
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* the video dir may still be locked briefly */ }
  if (errors.length) console.log(`page errors (${errors.length}):\n  ` + [...new Set(errors)].slice(0, 12).join('\n  '))
  console.log(`shots in ${out}: ${readdirSync(out).filter((f) => /\.(png|webm|gif)$/.test(f)).join(', ')}`)
}
