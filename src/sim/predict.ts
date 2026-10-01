// Damage prediction while aiming (render-only): a pure dry run of the real attack pipeline on a throwaway copy of the
// state. Nothing here knows what an op does: the cast is paid, released and advanced by the sim's own code
// (shapes.release / advanceProjectiles / advanceAreas / advanceDash / advanceMelee, and through them every effect op, the
// melee strings, holds and throws (melee.ts), the damage curve,
// weakness / resistance, shields, buffs, statuses, energy counts), and the prediction is the damage the target takes.
// So it stays right as ops, kits and trajectories change.
//
//  - "as if it hits": the copy aims the cast straight at the target and keeps the target on the shape's path (at the
//    caster's front for an instant shape, on the shot / area / dasher while they fly), with no invulnerability. If the
//    shape still misses (a wall in the way), the effects run directly on the target instead (onCast, onHit, onImpact)
//  - chance: every PRNG draw is scripted. The outcomes are enumerated (each draw low = heads / the roll succeeds, or
//    high = tails / it fails) for exact bounds, and the average is exact for coin flips (1/2 each); when a weighted
//    roll is involved (a `chance` op, a blind) it is the mean of fixed-seed runs. The sim's own RNG never moves
//  - the real state is never written: the copy gets its own players, shape lists, tile arrays and events
//  - what else it does (render-only, the aim info): each run's events and the fighters' fields before and after say
//    which conditions, forces, buffs, energy changes, heals, recoil and bench hits the cast caused, on the target and
//    on the caster; weighted like the damage, that is each one's chance (Prediction.effects)
import { onField } from './combat'
import { costPips } from './energy'
import { advanceAreas, advanceDash, advanceMelee, advanceProjectiles, makeCtx, release } from './shapes'
import { runEffects } from './effects/registry'
import type { CastInfo } from './effects/define'
import { FP, iatan2, idiv, icos, ilen, isin, ONE } from './fixed'
import * as R from './rules'
import { seedRng } from './rng'
import { inSight } from './terrain'
import type { Effect, Fighter, MatchDef, ResolvedAttack, SimState } from './types'

export interface Prediction {
  /** the player predicted against */
  target: number
  /** the damage the target takes over the whole cast (every hit and pulse), least / most / on average */
  min: number
  max: number
  avg: number
  /** the outcome depends on coin flips or rolls (min < max, or a flip decides something else) */
  chance: boolean
  /** hits that landed in the typical run (a lingering area pulses several times) */
  hits: number
  /** +1 the target is weak to it, -1 it resists, 0 neither */
  eff: number
  /** the target would be Knocked Out: 'always', 'maybe' (on some flips), or 'no' */
  ko: 'always' | 'maybe' | 'no'
  /** the caster is Confused: the attack may fail before it starts (half the time, the TCG coin) */
  confused: boolean
  /** what else the cast does to the target, the caster and the benches (render-only: the aim info) */
  effects: AimEffect[]
}

/** one thing a cast does besides the target's damage, read off the dry runs (not the op list). `kind`:
 *  - status:<paralyzed|asleep|confused|burned|poisoned>, flinch, slow (amount = permille), push / pull (amount = px),
 *    buff:<stat> (amount, as the buff stores it), dispel, shield (amount; 100000 = all), invuln, energy (pips gained,
 *    negative lost), jam (the meter stops for `ticks`), lock (amount = attacks locked), trap (no swap / dodge),
 *    heal, recoil (damage to the caster), leap (the caster is thrown back: a retreat, a bounce)
 *  - on the bench (`on` 'bench', with p and member): bench (damage), swap (forced in), heal
 *  `chance` is 0..1 (coin flips, rolls, a confused caster), `ticks` how long it lasts (0: until something ends it) */
export interface AimEffect {
  on: 'target' | 'self' | 'bench'
  kind: string
  amount: number
  ticks: number
  chance: number
  p?: number
  member?: number
}

/** how many scripted runs an enumeration may take before it settles for the extremes */
const MAX_RUNS = 48
/** fixed seeds for the average when a weighted roll is involved */
const MEAN_RUNS = 48
/** ticks a dry run may advance lingering shapes */
const MAX_TICKS = 600

/** a copy of the state for a dry run: its own players, shape lists, tiles and events (nothing shared that ops write) */
export function dryClone(s: SimState): SimState {
  return {
    ...s,
    players: JSON.parse(JSON.stringify(s.players)) as SimState['players'],
    projectiles: JSON.parse(JSON.stringify(s.projectiles)) as SimState['projectiles'],
    beams: s.beams.map((b) => ({ ...b })),
    areas: s.areas.map((a) => ({ ...a })),
    swings: s.swings.map((w) => ({ ...w, hit: w.hit.slice() })),
    tiles: s.tiles.slice(),
    propHp: s.propHp.slice(),
    wet: s.wet.slice(),
    shock: s.shock.slice(),
    fire: s.fire.slice(),
    events: [],
  }
}

/** the PRNG of a dry run: scripted draws (false = low: heads / the roll succeeds; true = high: tails / it fails;
 * past the script's end every draw is low), counting how many were made; or a plain seed */
type Rng = { script: boolean[]; draws: number } | { seed: number }

function useRng(c: SimState, r: Rng): void {
  if ('seed' in r) { c.rng = seedRng(r.seed); return }
  // rng.randInt does `h.rng = nextRng(h.rng)` and then reads h.rng: the setter picks what the read returns
  let v = 0
  Object.defineProperty(c, 'rng', {
    configurable: true, enumerable: true,
    get: () => v,
    set: () => { v = r.script[r.draws++] ? 999 : 0 },
  })
}

interface Run { dmg: number; hits: number; eff: number; ko: boolean; fizzled?: boolean; fx?: Map<string, AimEffect> }

/** the fields of a player the effects change, before the cast */
interface Snap { f: Fighter; pips: number; fill: number; swapCd: number; bench: number[] }

function snap(c: SimState, p: number): Snap {
  const pl = c.players[p]
  return {
    f: JSON.parse(JSON.stringify(pl.fighter)) as Fighter, pips: pl.pips[0] ?? 0, fill: Math.min(0, ...pl.fill), swapCd: pl.swapCd,
    bench: pl.members.map((m) => m.hp),
  }
}

/** a condition's length (combat.applyStatus); burned lasts until a coin ends it */
const STATUS_TICKS: Record<string, number> = { paralyzed: R.PARALYZE_TICKS, asleep: R.SLEEP_MAX_TICKS, confused: R.CONFUSE_TICKS, burned: 0, poisoned: R.POISON_TICKS }

/** what a run did besides the target's damage: its events, and the two fighters' fields against their snapshots */
function observe(c: SimState, p: number, t: number, bp: Snap, bt: Snap): Map<string, AimEffect> {
  const out = new Map<string, AimEffect>()
  const put = (on: AimEffect['on'], kind: string, amount: number, ticks: number, at: { p?: number; member?: number } = {}) => {
    const key = `${on}:${kind}:${at.p ?? ''}:${at.member ?? ''}`
    const o = out.get(key)
    if (!o) { out.set(key, { on, kind, amount, ticks, chance: 1, ...at }); return }
    // a sum for amounts (two heals, every recoil tick); a condition is once, the longest
    if (kind !== 'flinch' && !kind.startsWith('status:')) o.amount += amount
    o.ticks = Math.max(o.ticks, ticks)
  }
  const side = (q: number): AimEffect['on'] | null => (q === t ? 'target' : q === p ? 'self' : null)
  const swapped = c.events.some((e) => e.k === 'swap' && e.p === t)
  for (const e of c.events) {
    if (e.k === 'bench') { put('bench', 'bench', e.amount, 0, { p: e.p, member: e.member }); continue }
    if (e.k === 'swap') { if (e.p === t) put('bench', 'swap', 0, 0, { p: e.p, member: e.member }); continue }
    if (e.k !== 'status' && e.k !== 'flinch' && e.k !== 'heal' && e.k !== 'dmg') continue
    const on = side(e.p)
    if (!on) continue
    if (e.k === 'status') put(on, `status:${e.status}`, 0, STATUS_TICKS[e.status] ?? 0)
    else if (e.k === 'flinch') put(on, 'flinch', 0, e.ticks)
    else if (e.k === 'heal') put(on, 'heal', e.amount, 0)
    else if (on === 'self') put(on, 'recoil', e.amount, 0)
  }
  const caster = c.players[p].fighter
  const sides: [AimEffect['on'], number, Snap][] = [['target', t, bt], ['self', p, bp]]
  for (const [on, q, b] of sides) {
    const pl = c.players[q]
    if (on === 'target' && swapped) continue // a new fighter: its fields say nothing about this cast
    if (pl.active < 0 || pl.members[pl.active].ko) continue
    const f = pl.fighter, f0 = b.f
    if (f.slow && (!f0.slow || f.slow.t !== f0.slow.t || f.slow.permille !== f0.slow.permille)) put(on, 'slow', f.slow.permille, f.slow.t)
    if (f.knock && JSON.stringify(f.knock) !== JSON.stringify(f0.knock)) {
      const px = idiv(ilen(f.knock.vx, f.knock.vy) * f.knock.t, FP)
      if (on === 'self') put(on, 'leap', px, 0)
      else put(on, f.knock.vx * (f.x - caster.x) + f.knock.vy * (f.y - caster.y) >= 0 ? 'push' : 'pull', px, 0)
    }
    // buffs are appended: what's new is what this cast added
    const was = f0.buffs.map((x) => JSON.stringify(x))
    for (const x of f.buffs) {
      const k = was.indexOf(JSON.stringify(x))
      if (k >= 0) was.splice(k, 1)
      else put(on, `buff:${x.stat}`, x.amount, x.t)
    }
    const helpful = (q: Fighter) => !!q.shield || q.buffs.some((x) => x.amount > 0 && x.stat !== 'blind')
    if (on === 'target' && helpful(f0) && !helpful(f)) put(on, 'dispel', 0, 0)
    if (f.shield && (!f0.shield || f.shield.t !== f0.shield.t)) put(on, 'shield', f.shield.amount, f.shield.t)
    if (on === 'self' && f.invuln > f0.invuln) put(on, 'invuln', 0, f.invuln)
    const dp = (pl.pips[0] ?? 0) - b.pips
    if (dp !== 0) put(on, 'energy', dp, 0)
    const jam = b.fill - Math.min(0, ...pl.fill)
    if (jam > 0) put(on, 'jam', 0, jam)
    let locked = 0, lockT = 0
    f.cooldowns.forEach((cd, i) => { if (cd > (f0.cooldowns[i] ?? 0)) { locked++; lockT = Math.max(lockT, cd) } })
    if (locked) put(on, 'lock', locked, lockT)
    const trapT = Math.max(pl.swapCd > b.swapCd ? pl.swapCd : 0, f.dodgeCd > f0.dodgeCd ? f.dodgeCd : 0)
    if (trapT > 0) put(on, 'trap', 0, trapT)
    if (on === 'self') pl.members.forEach((m, i) => { if (i !== pl.active && m.hp > (b.bench[i] ?? m.hp)) put('bench', 'heal', m.hp - b.bench[i], 0, { p: q, member: i }) })
  }
  return out
}

function damageTo(c: SimState, t: number): Run {
  let dmg = 0, hits = 0, eff = 0
  for (const e of c.events) {
    if (e.k !== 'dmg' || e.p !== t) continue
    dmg += e.amount
    hits++
    if (e.eff && !eff) eff = e.eff
  }
  const pl = c.players[t]
  const m = pl.members[Math.max(0, pl.active)]
  const fizzled = c.events.some((e) => e.k === 'fizzle' && e.p !== t)
  return { dmg, hits, eff, ko: !!m && m.hp <= 0, fizzled }
}

/** the copy with the cast paid and the caster ready to release it at the target */
function prepare(def: MatchDef, s: SimState, p: number, ai: number, t: number, rng: Rng): SimState | null {
  const c = dryClone(s)
  const pl = c.players[p]
  const f = onField(c, p), tf = onField(c, t)
  const atk = pl.active >= 0 ? def.kits[pl.members[pl.active].kit].attacks[ai] : undefined
  if (!f || !tf || !atk) return null
  useRng(c, rng)
  // the energy is paid when the attack starts (step.tryAttack): what's left is what "for each energy" counts
  pl.pips[0] = Math.max(0, (pl.pips[0] ?? 0) - costPips(atk.cost))
  f.cast = null; f.dash = null; f.dodge = null; f.recovery = 0
  // only this cast's shapes: other live shots would muddle the target's HP
  c.projectiles = []; c.areas = []; c.beams = []; c.swings = []
  tf.invuln = 0; tf.dodge = null; tf.knock = null
  return c
}

/** the match with the cast's onHit list counted each time the sim reads it (shapes read it once per hit) */
function counted(def: MatchDef, s: SimState, p: number, ai: number, n: { hits: number }): MatchDef {
  const pl = s.players[p]
  const ki = pl.members[pl.active].kit
  return {
    ...def,
    kits: def.kits.map((k, i) => (i !== ki ? k : {
      ...k,
      attacks: k.attacks.map((a, j) => (j !== ai ? a : Object.defineProperty({ ...a }, 'onHit', { get: () => { n.hits++; return a.onHit }, enumerable: true }))),
    })),
  }
}

/** the real release, with the target kept on the shape's path while it lives */
function runShape(def0: MatchDef, s: SimState, p: number, ai: number, t: number, rng: Rng): Run | null {
  const n = { hits: 0 }
  const c = prepare(def0, s, p, ai, t, rng)
  if (!c) return null
  const def = counted(def0, c, p, ai, n)
  const f = c.players[p].fighter, tf = c.players[t].fighter
  f.aim = iatan2(tf.y - f.y, tf.x - f.x) & 255
  // in front of the caster, touching: inside any instant shape's reach (cone, melee, beam)
  const d = (f.r + tf.r + 2) * FP
  tf.x = f.x + idiv(icos(f.aim) * d, ONE)
  tf.y = f.y + idiv(isin(f.aim) * d, ONE)
  const bp = snap(c, p), bt = snap(c, t)
  release(def, c, p, ai)
  for (let k = 0; k < MAX_TICKS; k++) {
    const shot = c.projectiles.find((x) => x.owner === p)
    const area = c.areas.find((x) => x.owner === p)
    const dash = onField(c, p)?.dash
    // a live melee swing (melee.ts): its strikes, a hold, a throw, a parry window that swings at its end
    const swing = c.swings.find((x) => x.owner === p && x.live >= 0)
    if (!shot && !area && !dash && !swing) break
    const g = onField(c, t)
    if (!g) break
    g.invuln = 0
    if (shot) { g.x = shot.x; g.y = shot.y } else if (area) { g.x = area.x; g.y = area.y } else if (swing) {
      // held: the hold carries it; else at the swinger's front, touching (inside every strike's arc)
      if (swing.held !== t) { const dd = (f.r + g.r + 2) * FP; g.x = f.x + idiv(icos(f.aim) * dd, ONE); g.y = f.y + idiv(isin(f.aim) * dd, ONE) }
    } else { g.x = f.x; g.y = f.y }
    c.tick++
    if (dash) advanceDash(def, c, p)
    advanceMelee(def, c)
    advanceProjectiles(def, c)
    advanceAreas(def, c)
    // the target reels from taps but can't dodge a dry run's strikes: drop its flinch guard
    g.flinchGuard = 0
  }
  return { ...damageTo(c, t), hits: n.hits, fx: observe(c, p, t, bp, bt) }
}

/** the effects straight on the target (onCast, onHit, onImpact at the target): when no shape could reach it */
function runEffectsOnly(def: MatchDef, s: SimState, p: number, ai: number, t: number, rng: Rng): Run | null {
  const c = prepare(def, s, p, ai, t, rng)
  if (!c) return null
  const pl = c.players[p]
  const atk = def.kits[pl.members[pl.active].kit].attacks[ai]
  const f = pl.fighter, tf = c.players[t].fighter
  const cast: CastInfo = { player: p, attack: ai, element: atk.element, bonus: 0 }
  const bp = snap(c, p), bt = snap(c, t)
  runEffects(makeCtx(def, c, cast, -1, f.x, f.y), atk.onCast)
  if (!cast.fizzle && onField(c, p)) {
    runEffects(makeCtx(def, c, cast, t, tf.x, tf.y), atk.onHit)
    runEffects(makeCtx(def, c, cast, -1, tf.x, tf.y), atk.onImpact)
  }
  return { ...damageTo(c, t), hits: cast.fizzle ? 0 : 1, fx: observe(c, p, t, bp, bt) }
}

function once(def: MatchDef, s: SimState, p: number, ai: number, t: number, rng: () => Rng): Run | null {
  const r = rng()
  const a = runShape(def, s, p, ai, t, r)
  // a hit that landed (even for 0), or a cast that fizzled: that's the outcome
  if (!a || a.hits > 0 || a.fizzled) return a
  // the shape reached nothing (a wall in the way): the effects on the target, with the same draws
  return runEffectsOnly(def, s, p, ai, t, rng())
}

/** does an effect list (nested lists too) hold a weighted roll (not a fair coin) */
function weighted(list: unknown): boolean {
  if (!Array.isArray(list)) return false
  return list.some((e: Effect) => e && (e.op === 'chance' || Object.values(e).some((v) => Array.isArray(v) && weighted(v))))
}

/** the damage attack `ai` of player p would do to player t right now, if it hits. Null when either is off the field */
export function predictDamage(def: MatchDef, s: SimState, p: number, ai: number, t: number): Prediction | null {
  const f = onField(s, p)
  const pl = s.players[p]
  if (!f || pl.active < 0 || !onField(s, t)) return null
  const atk: ResolvedAttack | undefined = def.kits[pl.members[pl.active].kit].attacks[ai]
  if (!atk) return null
  // enumerate the draws: every scripted run branches at each draw past its script
  const leaves: { run: Run; w: number }[] = []
  const stack: boolean[][] = [[]]
  let runs = 0, complete = true
  while (stack.length) {
    if (runs >= MAX_RUNS) { complete = false; break }
    const pre = stack.pop()!
    const seen = { script: pre, draws: 0 }
    const run = once(def, s, p, ai, t, () => { seen.draws = 0; return seen })
    runs++
    if (!run) return null
    leaves.push({ run, w: Math.pow(2, -Math.max(pre.length, seen.draws)) })
    for (let j = pre.length; j < seen.draws; j++) stack.push([...pre, ...new Array<boolean>(j - pre.length).fill(false), true])
  }
  const draws = leaves.length > 1
  if (!complete) {
    // too many to list: the extremes (every draw low, every draw high) still bound a monotone attack
    for (const hi of [false, true]) {
      const r = once(def, s, p, ai, t, () => ({ script: new Array<boolean>(64).fill(hi), draws: 0 }))
      if (r) leaves.push({ run: r, w: 0 })
    }
  }
  const dmgs = leaves.map((l) => l.run.dmg)
  let min = Math.min(...dmgs), max = Math.max(...dmgs)
  let avg: number
  // the runs each effect's chance is read from, with their weights (the ones the average is taken over)
  let sample: { run: Run; w: number }[]
  const blind = f.buffs.some((b) => b.stat === 'blind')
  if (complete && !blind && !weighted(atk.onCast) && !weighted(atk.onHit) && !weighted(atk.onImpact)) {
    avg = leaves.reduce((n, l) => n + l.run.dmg * l.w, 0)
    sample = leaves
  } else if (!draws) {
    avg = dmgs[0]
    sample = [{ run: leaves[0].run, w: 1 }]
  } else {
    let sum = 0, n = 0
    const runs: Run[] = []
    for (let k = 0; k < MEAN_RUNS; k++) {
      const r = once(def, s, p, ai, t, () => ({ seed: 0x5eed + k }))
      if (r) { sum += r.dmg; n++; min = Math.min(min, r.dmg); max = Math.max(max, r.dmg); runs.push(r) }
    }
    avg = n ? sum / n : dmgs[0]
    sample = runs.length ? runs.map((run) => ({ run, w: 1 / runs.length })) : [{ run: leaves[0].run, w: 1 }]
  }
  const confused = f.status.confused > 0
  if (confused) { min = 0; avg /= 2 }
  const effects = gather(sample, confused ? 0.5 : 1)
  const kos = leaves.filter((l) => l.run.ko).length
  const typical = leaves[0].run
  return {
    target: t, min, max, avg: Math.round(avg), chance: draws || confused, hits: typical.hits,
    eff: leaves.find((l) => l.run.eff)?.run.eff ?? 0,
    ko: kos === 0 ? 'no' : kos === leaves.length && !confused ? 'always' : 'maybe',
    confused, effects,
  }
}

/** every effect seen in the runs, with its chance (the weight of the runs it happened in) and its biggest size */
function gather(sample: { run: Run; w: number }[], odds: number): AimEffect[] {
  const all = new Map<string, AimEffect>()
  for (const { run, w } of sample) {
    for (const [key, e] of run.fx ?? []) {
      const o = all.get(key)
      if (!o) { all.set(key, { ...e, chance: w }); continue }
      o.chance += w
      if (Math.abs(e.amount) > Math.abs(o.amount)) o.amount = e.amount
      o.ticks = Math.max(o.ticks, e.ticks)
    }
  }
  return [...all.values()].map((e) => ({ ...e, chance: Math.min(1, Math.round(e.chance * odds * 1000) / 1000) }))
}

/** is a straight shot's line to the target cut by a wall or prop: a projectile (not a lob, a phase shot or a
 * ricochet) or a beam would break on it first. The prediction still assumes a hit; the aim info says it's blocked */
export function aimBlocked(def: MatchDef, s: SimState, p: number, ai: number, t: number): boolean {
  const f = onField(s, p), tf = onField(s, t)
  const pl = s.players[p]
  if (!f || !tf || pl.active < 0) return false
  const sh = def.kits[pl.members[pl.active].kit].attacks[ai]?.shape
  if (!sh) return false
  if (sh.kind === 'projectile') { if (sh.path === 'lob' || sh.path === 'phase' || sh.path === 'bounce') return false } else if (sh.kind !== 'beam') return false
  return !inSight(s, f.x, f.y, tf.x, tf.y)
}

/** a shape's reach and half-width in px along the aim (render-side targeting; floats are fine here) */
function reachOf(atk: ResolvedAttack, r: number): { reach: number; half: number; arc: number } {
  const sh = atk.shape
  const n = (k: string, d: number) => (typeof sh[k] === 'number' ? (sh[k] as number) : d)
  switch (sh.kind) {
    case 'projectile': return { reach: n('range', 600), half: Math.max(n('radius', 10), n('wall', 0)) + Math.max(0, n('count', 1) - 1) * 8, arc: 0 }
    case 'beam': return { reach: n('length', 500), half: n('width', 20) / 2, arc: 0 }
    case 'cone': case 'melee': return { reach: n('range', sh.kind === 'melee' ? 64 : 160) + n('lunge', 0), half: 0, arc: n('arc', 64) }
    case 'dash': return { reach: n('distance', 200), half: n('radius', r), arc: 0 }
    case 'area': case 'terrain': return sh.at === 'aim' ? { reach: n('range', 300) + n('radius', 80), half: n('radius', 80), arc: 0 } : { reach: n('radius', 80), half: n('radius', 80), arc: 256 }
    default: return { reach: r + 40, half: r + 40, arc: 256 }
  }
}

/** the foe an aimed attack is pointed at: the nearest one on the aim path, else the nearest foe (`onPath` false).
 * -1 when no foe is on the field */
export function aimTarget(def: MatchDef, s: SimState, p: number, ai: number, aim: number): { target: number; onPath: boolean } {
  const f = onField(s, p)
  const pl = s.players[p]
  if (!f || pl.active < 0) return { target: -1, onPath: false }
  const atk = def.kits[pl.members[pl.active].kit].attacks[ai]
  const g = atk ? reachOf(atk, f.r) : { reach: 0, half: 0, arc: 0 }
  const a = (aim / 256) * Math.PI * 2
  const dx = Math.cos(a), dy = Math.sin(a)
  let best = -1, bestD = Infinity, near = -1, nearD = Infinity
  for (let i = 0; i < s.players.length; i++) {
    if (s.players[i].team === pl.team) continue
    const ef = onField(s, i)
    if (!ef) continue
    const vx = (ef.x - f.x) / FP, vy = (ef.y - f.y) / FP
    const dist = Math.hypot(vx, vy)
    if (dist < nearD) { nearD = dist; near = i }
    const along = vx * dx + vy * dy
    const perp = Math.abs(vx * dy - vy * dx)
    let on: boolean
    if (g.arc >= 256) on = dist <= g.reach + ef.r
    else if (g.arc > 0) on = dist <= g.reach + ef.r && (dist <= ef.r || Math.acos(Math.max(-1, Math.min(1, along / dist))) <= ((g.arc / 256) * Math.PI) + Math.asin(Math.min(1, ef.r / dist)))
    else on = along > -ef.r && along <= g.reach + ef.r && perp <= g.half + ef.r
    if (on && dist < bestD) { bestD = dist; best = i }
  }
  return best >= 0 ? { target: best, onPath: true } : { target: near, onPath: false }
}
