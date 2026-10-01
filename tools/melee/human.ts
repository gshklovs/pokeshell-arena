// Landability (docs/MELEE.md 3.7): how often a HUMAN-like player lands the most-fielded melee attacks, against each
// bot level's movement. The bots' own connect rate is the balance band; this is the feel check ("landing melees
// already felt a bit hard"). A scripted player:
//   - sees the foe late: a reaction delay of REACT ticks (about 230 ms), i.e. it steers, aims and decides from where
//     the foe was, not where it is;
//   - aims roughly: the angle to that seen position plus an error drawn per attempt, uniform in +-AIM_ERR degrees,
//     plus a small per-tick wobble; it holds the aim while approaching and releases (fires) when the seen foe looks
//     about inside the drawn telegraph (the swing's reach, the dash's run): the distance it judges is drawn per
//     attempt, RELEASE_LO..RELEASE_HI % of the telegraph's edge (a human fires a bit early or late); it keeps aiming
//     at the seen foe afterwards
//   - walks straight at the foe along the tile flow field, stops inside half its reach, mashes the button when ready
// The foe is a real bot (easy / normal / hard: its reaction, dodges, spacing) that never attacks (its meter is kept
// empty); the player's kit keeps only the scene's attack and its meter full. Connect = the release dealt damage to
// the foe before the next release (taps deal none: a string connects when its finisher lands). Deterministic.
//   npx vite-node tools/melee/human.ts [--levels easy,normal,hard] [--secs 40] [--only tackle,bite] [--shard i/n --json f]
//   npx vite-node tools/melee/human.ts --merge a.json b.json ...      (node tools/melee/run.mjs --script human shards it)
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { BotDriver, DIFFICULTY, createBot, type DifficultyName } from '../../src/bots/index'
import { flowField, followField } from '../../src/bots/nav'
import { parseArena } from '../../src/sim/arena'
import { FP, iatan2, icos, idiv, ilen, isin } from '../../src/sim/fixed'
import { resolveKit } from '../../src/sim/kit'
import { randInt, seedRng } from '../../src/sim/rng'
import * as R from '../../src/sim/rules'
import { createState } from '../../src/sim/state'
import { step } from '../../src/sim/step'
import { tileAt } from '../../src/sim/terrain'
import type { ArenaDef, ArenaFile, Dir, FighterKit, InputFrame, Kit, MatchDef, SimState } from '../../src/sim/types'
import { loadCards } from '../kits/cards'

const ROOT = resolve(__dirname, '../..')
// the landing levers (src/sim/melee.ts LANDING), overridable to measure each: --track 0|1 --pad px,arc --magnet n
const mel = await import('../../src/sim/melee').catch(() => null)
{
  const args0 = process.argv.slice(2)
  const o = (k: string) => (args0.includes(k) ? args0[args0.indexOf(k) + 1] : null)
  if (mel) {
    if (o('--track') !== null) mel.LANDING.track = o('--track') === '1'
    if (o('--pad') !== null) { const [a, b] = o('--pad')!.split(',').map(Number); mel.LANDING.padPx = a; mel.LANDING.padArc = b }
    if (o('--magnet') !== null) mel.LANDING.magnet = Number(o('--magnet'))
  }
}
const args = process.argv.slice(2)
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)

/** the human model */
const REACT = 14
const AIM_ERR = 12
const WOBBLE = 3
const RELEASE_LO = 70, RELEASE_HI = 115

/** the 24 most-fielded melee attacks (tools/melee/shots.mjs SCENES): [name, label, card, attack index] */
export const SCENES: [string, string, string, number][] = [
  ['tackle', 'Tackle', 'swsh7-134', 0], ['slash', 'Slash', 'me55-14', 0], ['bite', 'Bite', 'me55-88', 0],
  ['ram', 'Ram', 'me55-4', 0], ['gnaw', 'Gnaw', 'base1-58', 0], ['pound', 'Pound', 'base1-26', 0],
  ['spinning-attack', 'Spinning Attack', 'swsh7-3', 0], ['headbutt', 'Headbutt', 'swsh12pt5-34', 0],
  ['heavy-impact', 'Heavy Impact', 'swsh12pt5-109', 0], ['mega-punch', 'Mega Punch', 'me55-84', 1],
  ['rear-kick', 'Rear Kick', 'swsh7-102', 0], ['quick-attack', 'Quick Attack', 'me55-117', 0],
  ['body-slam', 'Body Slam', 'me55-68', 0], ['seismic-toss', 'Seismic Toss', 'base1-8', 0],
  ['counter', 'Counter', 'me55-85', 0], ['fury-swipes', 'Fury Swipes', 'neo1-71', 0], ['stomp', 'Stomp', 'neo1-76', 0],
  ['wing-attack', 'Wing Attack', 'swsh9-118', 0], ['dig', 'Dig', 'base1-47', 0], ['dragon-claw', 'Dragon Claw', 'swsh9-108', 0],
  ['vine-whip', 'Vine Whip', 'base1-30', 0], ['karate-chop', 'Karate Chop', 'base1-34', 0], ['take-down', 'Take Down', 'swsh11-89', 0],
  ['double-kick', 'Double Kick', 'base1-37', 0],
]
const TOP = 20
/** foes whose movement it plays against: a ranged Basic that keeps its distance, a close-range Basic, a big tank */
const FOES = ['base1-58', 'base1-46', 'swsh7-29']
const ARENAS = ['growlithe-meadow', 'herdier-temple', 'zarude-jungle']

function kitFiles(): Map<string, Kit> {
  const m = new Map<string, Kit>()
  const dir = join(ROOT, 'data/kits')
  for (const f of readdirSync(dir)) if (f.endsWith('.json')) { const k = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Kit; m.set(k.card, k) }
  return m
}
function arena(id: string): ArenaDef {
  const f = JSON.parse(readFileSync(join(ROOT, 'public/arenas', id, 'arena.json'), 'utf8')) as ArenaFile
  const pj = join(ROOT, 'public/arenas', id, 'props.json')
  if (existsSync(pj)) f.propFrames = JSON.parse(readFileSync(pj, 'utf8')).frames
  return parseArena(f)
}

/** the reach at which the player releases: the drawn swing (range + step-in), the dash's run, an area's reach */
function releaseReach(k: FighterKit): number {
  const sh = k.attacks[0].shape
  const n = (key: string, d: number) => (typeof sh[key] === 'number' ? (sh[key] as number) : d)
  switch (sh.kind) {
    case 'melee': return n('range', 64) + n('lunge', 0)
    case 'dash': return Math.trunc(n('distance', 200) * (sh.path === 'leap' ? 1 : 0.8))
    case 'area': return sh.at === 'aim' ? n('range', 300) : n('radius', 100)
    default: return 200
  }
}

interface Tally { casts: number; hits: number }
type Rows = Record<string, Record<string, Tally>>

/** one match: the scripted player (0) against a bot's movement (1); returns releases and connects */
function play(me: FighterKit, foe: FighterKit, ar: ArenaDef, level: DifficultyName, seed: number, secs: number): Tally {
  const def: MatchDef = { mode: '1v1', seed, arena: ar, kits: [me, foe], matchTicks: 99 * 60, players: [
    { team: 0, name: 'H', members: [0], energy: ['Colorless'] }, { team: 1, name: 'B', members: [1], energy: ['Colorless'] }] }
  const s = createState(def)
  s.phase = 'fight'; s.phaseT = 0
  const bot = new BotDriver(createBot(level), def, 1, DIFFICULTY[level], seed * 7 + 2)
  const h = { rng: seedRng(seed ^ 0x51ab) }
  const hist: { x: number; y: number }[] = []
  let err = 0, field: Int16Array | null = null, fieldAt = -1, fieldTile = -1
  let open = false, landed = false
  let rf = 100
  const out: Tally = { casts: 0, hits: 0 }
  const reach = releaseReach(me)
  for (let t = 0; t < secs * 60 && s.phase === 'fight'; t++) {
    const pl = s.players[0], fo = s.players[1]
    pl.pips[0] = R.ENERGY_CAP; fo.pips[0] = 0
    for (const m of [...pl.members, ...fo.members]) m.hp = m.maxHp
    const f = pl.fighter, e = fo.fighter
    hist.push({ x: e.x, y: e.y })
    if (hist.length > REACT + 1) hist.shift()
    const seen = hist[0]
    const dx = seen.x - f.x, dy = seen.y - f.y
    const dist = idiv(ilen(dx, dy), FP)
    const wob = randInt(h, 2 * WOBBLE + 1) - WOBBLE
    const aim = (iatan2(dy, dx) + Math.round((err * 256) / 360) + Math.round((wob * 256) / 360)) & 255
    // walk: the flow field toward the seen foe (re-planned when it changes tile), stop inside half the reach
    let mx: Dir = 0, my: Dir = 0
    if (dist > Math.max(30, reach / 2)) {
      const tt = tileAt(seen.x, seen.y)
      const key = tt.ty * 1000 + tt.tx
      if (!field || key !== fieldTile || t - fieldAt > 30) { field = flowField(s, tt.tx, tt.ty); fieldTile = key; fieldAt = t }
      const a = followField(s, field, f.x, f.y) ?? iatan2(dy, dx)
      const c = icos(a), sn = isin(a)
      mx = (c > 27000 ? 1 : c < -27000 ? -1 : 0) as Dir; my = (sn > 27000 ? 1 : sn < -27000 ? -1 : 0) as Dir
    }
    const ready = f.recovery === 0 && !f.cast && !f.dash && !f.dodge && !(f.flinch ?? 0)
    let buttons = 0
    if (ready && dist * 100 <= (reach + e.r) * rf) {
      buttons = 1
      // the next attempt's aim error and judged range
      err = randInt(h, 2 * AIM_ERR + 1) - AIM_ERR
      rf = RELEASE_LO + randInt(h, RELEASE_HI - RELEASE_LO + 1)
    }
    const inp: InputFrame = { mx, my, aim, buttons }
    const before = f.cast
    step(def, s, [inp, bot.input(s)])
    // a new release: the previous one is scored
    if (!before && s.players[0].fighter.cast) { if (open && landed) out.hits++; open = true; landed = false; out.casts++ }
    for (const ev of s.events) if (ev.k === 'dmg' && ev.src === 0 && ev.p === 1 && open) landed = true
  }
  if (open && landed) out.hits++
  return out
}

function run(): Rows {
  const levels = opt('--levels', 'easy,normal,hard').split(',') as DifficultyName[]
  const secs = parseInt(opt('--secs', '40'), 10)
  const only = opt('--only', '').split(',').filter(Boolean)
  const [shard, shards] = opt('--shard', '0/1').split('/').map((x) => parseInt(x, 10))
  const cards = new Map(loadCards().map((c) => [c.id, c]))
  const kits = kitFiles()
  const rows: Rows = {}
  const foes = FOES.map((id) => resolveKit(cards.get(id)!, kits.get(id) ?? null))
  const ars = ARENAS.map(arena)
  let job = 0
  for (const [name, label, card, ai] of SCENES) {
    if (only.length && !only.includes(name)) continue
    const full = resolveKit(cards.get(card)!, kits.get(card) ?? null)
    const atk = full.attacks.find((a) => a.name === label) ?? full.attacks[ai]
    const me: FighterKit = { ...full, attacks: [atk] }
    for (const level of levels) {
      rows[name] ??= {}
      rows[name][level] ??= { casts: 0, hits: 0 }
      foes.forEach((foe, fi) => ars.forEach((ar, ai2) => {
        if (job++ % shards !== shard) return
        const r = play(me, foe, ar, level, 9001 + fi * 31 + ai2 * 7, secs)
        rows[name][level].casts += r.casts
        rows[name][level].hits += r.hits
      }))
    }
  }
  return rows
}

function merge(parts: Rows[]): Rows {
  const r: Rows = {}
  for (const p of parts) for (const [n, lv] of Object.entries(p)) for (const [l, t] of Object.entries(lv)) {
    r[n] ??= {}; r[n][l] ??= { casts: 0, hits: 0 }
    r[n][l].casts += t.casts; r[n][l].hits += t.hits
  }
  return r
}

function report(r: Rows): string {
  const levels = [...new Set(Object.values(r).flatMap((x) => Object.keys(x)))]
  const pc = (t?: Tally) => (t && t.casts ? `${Math.round((100 * t.hits) / t.casts)}%` : '-')
  const lv = mel ? ` · levers ${JSON.stringify(mel.LANDING)}` : ' · (no melee.ts)'
  const out = [`human-like player (reaction ${REACT} ticks, aim error +-${AIM_ERR} deg, fires at ${RELEASE_LO}-${RELEASE_HI}% of the telegraph's reach), connect rate vs each bot level's movement${lv}`, '',
    `| attack | ${levels.join(' | ')} | releases |`, `|---|${levels.map(() => '---:').join('|')}|---:|`]
  const top = SCENES.slice(0, TOP).map((x) => x[0])
  const sum: Record<string, Tally> = {}
  for (const [name] of SCENES) {
    const row = r[name]
    if (!row) continue
    out.push(`| ${name}${top.includes(name) ? '' : ' (not top 20)'} | ${levels.map((l) => pc(row[l])).join(' | ')} | ${levels.reduce((n, l) => n + (row[l]?.casts ?? 0), 0)} |`)
    if (top.includes(name)) for (const l of levels) { sum[l] ??= { casts: 0, hits: 0 }; sum[l].casts += row[l]?.casts ?? 0; sum[l].hits += row[l]?.hits ?? 0 }
  }
  out.push(`| **top 20** | ${levels.map((l) => `**${pc(sum[l])}**`).join(' | ')} | ${levels.reduce((n, l) => n + (sum[l]?.casts ?? 0), 0)} |`)
  return out.join('\n')
}

if (args.includes('--merge')) {
  const files = args.slice(args.indexOf('--merge') + 1).filter((a) => a.endsWith('.json'))
  console.log(report(merge(files.map((f) => JSON.parse(readFileSync(f, 'utf8')) as Rows))))
} else {
  const rows = run()
  if (args.includes('--json')) writeFileSync(opt('--json', 'human.json'), JSON.stringify(rows))
  else console.log(report(rows))
}
