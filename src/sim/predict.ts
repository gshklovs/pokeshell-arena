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
import { onField } from './combat'
import { costPips } from './energy'
import { advanceAreas, advanceDash, advanceMelee, advanceProjectiles, makeCtx, release } from './shapes'
import { runEffects } from './effects/registry'
import type { CastInfo } from './effects/define'
import { FP, iatan2, idiv, icos, isin, ONE } from './fixed'
import { seedRng } from './rng'
import type { Effect, MatchDef, ResolvedAttack, SimState } from './types'

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

interface Run { dmg: number; hits: number; eff: number; ko: boolean; fizzled?: boolean }

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
  return { ...damageTo(c, t), hits: n.hits }
}

/** the effects straight on the target (onCast, onHit, onImpact at the target): when no shape could reach it */
function runEffectsOnly(def: MatchDef, s: SimState, p: number, ai: number, t: number, rng: Rng): Run | null {
  const c = prepare(def, s, p, ai, t, rng)
  if (!c) return null
  const pl = c.players[p]
  const atk = def.kits[pl.members[pl.active].kit].attacks[ai]
  const f = pl.fighter, tf = c.players[t].fighter
  const cast: CastInfo = { player: p, attack: ai, element: atk.element, bonus: 0 }
  runEffects(makeCtx(def, c, cast, -1, f.x, f.y), atk.onCast)
  if (!cast.fizzle && onField(c, p)) {
    runEffects(makeCtx(def, c, cast, t, tf.x, tf.y), atk.onHit)
    runEffects(makeCtx(def, c, cast, -1, tf.x, tf.y), atk.onImpact)
  }
  return { ...damageTo(c, t), hits: cast.fizzle ? 0 : 1 }
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
  const blind = f.buffs.some((b) => b.stat === 'blind')
  if (complete && !blind && !weighted(atk.onCast) && !weighted(atk.onHit) && !weighted(atk.onImpact)) {
    avg = leaves.reduce((n, l) => n + l.run.dmg * l.w, 0)
  } else if (!draws) {
    avg = dmgs[0]
  } else {
    let sum = 0, n = 0
    for (let k = 0; k < MEAN_RUNS; k++) {
      const r = once(def, s, p, ai, t, () => ({ seed: 0x5eed + k }))
      if (r) { sum += r.dmg; n++; min = Math.min(min, r.dmg); max = Math.max(max, r.dmg) }
    }
    avg = n ? sum / n : dmgs[0]
  }
  const confused = f.status.confused > 0
  if (confused) { min = 0; avg /= 2 }
  const kos = leaves.filter((l) => l.run.ko).length
  const typical = leaves[0].run
  return {
    target: t, min, max, avg: Math.round(avg), chance: draws || confused, hits: typical.hits,
    eff: leaves.find((l) => l.run.eff)?.run.eff ?? 0,
    ko: kos === 0 ? 'no' : kos === leaves.length && !confused ? 'always' : 'maybe',
    confused,
  }
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
