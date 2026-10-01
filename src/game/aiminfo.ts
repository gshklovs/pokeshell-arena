// The aim info (the user: "can previews also show any other helpful info pertaining to how a move works ... if its a
// status effect it shows it on pokemon, if something else it shows at top of screen"). While an attack is held, the
// renderer draws:
//  - badges by each Pokémon the cast would touch: conditions, forces, buffs, energy, heals, recoil (the caster's own
//    too), with the chance and how long. Read off the prediction's dry runs (predict.ts Prediction.effects), so they
//    are what the sim really does, not a reading of the op list
//  - marks on the team row for bench damage, a forced swap or a team heal
//  - a slim strip at the top: how the move behaves (homing, through walls, splits, sticks, pierces, a volley, ...),
//    the X+ math (in the printed gold, with what it adds right now), weakness, the energy and once-per-match notes,
//    and "blocked by wall". From the resolved attack's shape and effects, in explain.ts's words, kept short
// Pure and DOM-free; render-only (nothing here reaches the sim state, the bots or a replay).
import { onField } from '../sim/combat'
import { costPips } from '../sim/energy'
import { explainEffect, pct, secs, signed, tiles } from '../sim/explain'
import { runEffects } from '../sim/effects/registry'
import type { CastInfo } from '../sim/effects/define'
import { isStyle, type MeleeStyle } from '../sim/melee'
import { dryClone, type AimEffect, type Prediction } from '../sim/predict'
import * as R from '../sim/rules'
import { makeCtx } from '../sim/shapes'
import { TILE, type Effect, type MatchDef, type ResolvedAttack, type SimState } from '../sim/types'

/** move: how it behaves; bonus: the X+ math (printed gold); good / warn: in your favour / against you */
export type ChipTone = 'move' | 'bonus' | 'good' | 'warn'
export interface AimChip { text: string; tone: ChipTone }
export interface AimBadge { text: string; color: string; /** 0..1; 1 = for sure */ chance: number }
export interface BenchMark { p: number; member: number; text: string; color: string; chance: number }

export interface AimInfo {
  /** attack index (0..2) */
  attack: number
  /** the attack's name and element, for the strip's label */
  name: string
  element: string
  chips: AimChip[]
  /** the player the badges in `foe` are for (-1: no foe on the field) */
  target: number
  foe: AimBadge[]
  self: AimBadge[]
  bench: BenchMark[]
  /** the line to the target is cut by a wall (predict.aimBlocked) */
  blocked: boolean
}

/** at most this many chips in the strip, badges by a Pokémon */
export const MAX_CHIPS = 9
export const MAX_BADGES = 5

const STATUS_COLOR: Record<string, string> = { paralyzed: '#f7d038', asleep: '#7f9fe0', confused: '#e070c0', burned: '#f0643c', poisoned: '#a060d8' }
const C = { force: '#7cc4ff', slow: '#7ad67a', flinch: '#e8e8e8', heal: '#7ee08a', hurt: '#ff8a7a', energy: '#ffe28a', guard: '#9fd8ff', lock: '#ffb070', debuff: '#ff9a8a', buff: '#8fe3c0' }

/** a melee style (melee.ts STYLE_WHAT), in a couple of words */
const STYLE_SHORT: Record<MeleeStyle, string> = {
  jab: '1-2 combo', punch: 'punch string', uppercut: 'launcher', kick: 'sweep, knocks sideways', slash: 'wide slash',
  chop: 'overhead chop', thrust: 'long step-in stab', bite: 'latches on, gnaws', grab: 'grab & drag', throw: 'grab → throw',
  counter: 'parry → strike back', flurry: 'flurry, last blow lands', whip: 'lash reels in', tail: 'wide tail sweep',
  spin: 'spins, hits all around', headbutt: 'short bonk', strike: 'step-in strike', smash: 'staggering smash',
  tackle: 'body blow, bounces off', charge: 'plows through', swoop: 'curving swoop', slam: 'leap → shockwave',
  stomp: 'hop → stomp ring', burrow: 'digs under, bursts up', fly: 'flies up, dives', quick: 'blink dash', roll: 'rolling run',
}

/** a trajectory (shape.path), as a chip */
const PATH: Record<string, string> = {
  lob: 'lob: over walls, lands at the circle', phase: 'through walls', boomerang: 'comes back (hits again)', zigzag: 'zigzags',
  weave: 'weaves', spiral: 'corkscrews', helix: 'braided', drift: 'drifts along the aim', leap: 'airborne, crashes down',
}

/** the ops that make an X+ (their bonus is computed for right now) */
const PER_OPS = new Set(['bonusPer', 'bonusPerEnergy', 'spendEnergy'])
/** the flips and rolls that add damage */
const FLIP_OPS = new Set(['coin', 'coins', 'coinsUntilTails', 'chance'])

const holds = (list: unknown, ops: Set<string>): boolean => Array.isArray(list) && list.some((e: Effect) => e && (ops.has(e.op) || Object.values(e).some((v) => Array.isArray(v) && holds(v, ops))))
const short = (t: string, n = 58) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)
const bare = (t: string) => t.replace(/\s*\([^)]*\)/g, '')

/** the bonus one op adds right now: the op alone on a copy of the state, the cost paid (the real state is untouched) */
function bonusNow(def: MatchDef, s: SimState, p: number, ai: number, atk: ResolvedAttack, t: number, e: Effect, onHit: boolean): number {
  const c = dryClone(s)
  const pl = c.players[p]
  pl.pips[0] = Math.max(0, (pl.pips[0] ?? 0) - costPips(atk.cost))
  const f = pl.fighter, tf = t >= 0 ? onField(c, t) : null
  const cast: CastInfo = { player: p, attack: ai, element: atk.element, bonus: 0 }
  runEffects(makeCtx(def, c, cast, onHit && tf ? t : -1, tf ? tf.x : f.x, tf ? tf.y : f.y), [e])
  return cast.bonus
}

/** the X+ chips: each top-level op of onCast / onHit that adds damage by a count, a condition or flips */
function bonusChips(def: MatchDef, s: SimState, p: number, ai: number, atk: ResolvedAttack, t: number): AimChip[] {
  const out: AimChip[] = []
  const lists: [Effect[], boolean][] = [[atk.onCast, false], [atk.onHit, true]]
  for (const [list, onHit] of lists) {
    for (const e of list ?? []) {
      if (PER_OPS.has(e.op)) {
        const now = bonusNow(def, s, p, ai, atk, t, e, onHit)
        out.push({ text: `bonus: ${short(bare(explainEffect(e)), 44)} (now ${signed(now)})`, tone: 'bonus' })
      } else if (e.op === 'when' && holds([e], new Set([...PER_OPS, 'bonus']))) {
        const now = bonusNow(def, s, p, ai, atk, t, e, onHit)
        out.push({ text: `${short(bare(explainEffect(e)), 44)} (${now ? `now ${signed(now)}` : 'not now'})`, tone: 'bonus' })
      } else if (FLIP_OPS.has(e.op) && holds([e], new Set(['bonus', 'damage']))) {
        out.push({ text: short(bare(explainEffect(e))), tone: 'bonus' })
      } else if (e.op === 'mimic') out.push({ text: bare(explainEffect(e)), tone: 'bonus' })
    }
  }
  return out
}

/** how the shape behaves, as chips */
function moveChips(s: SimState, atk: ResolvedAttack): string[] {
  const sh = atk.shape
  const n = (k: string, d = 0) => (typeof sh[k] === 'number' ? (sh[k] as number) : d)
  const path = typeof sh.path === 'string' ? sh.path : ''
  const out: string[] = []
  const low = () => s.tiles.includes(TILE.LOW)
  switch (sh.kind) {
    case 'projectile': {
      if (n('wall') > 0) out.push(`rolling wall, ${tiles(2 * n('wall'))} wide`)
      else if (n('count', 1) > 1) out.push(`${n('count', 1)}-shot volley, hits once`)
      if (n('homing') > 0) out.push('homing')
      if (PATH[path]) out.push(PATH[path])
      if (path === 'bounce') out.push(`ricochets ${n('bounces', 2)}×`)
      if (n('pierce') > 0) out.push(n('pierce') === 1 ? 'pierces the first target' : `pierces ${n('pierce')} targets`)
      if (n('grow') > 0) out.push('swells as it flies')
      if (n('fuse') > 0) out.push(`${n('stick') > 0 ? 'sticks to the foe' : 'sticks where it lands'}, bursts after ${secs(n('fuse'))}`)
      else if (n('blast') > 0 && path !== 'lob') out.push(`blast radius ${tiles(n('blast'))}`)
      if (path === 'lob') out.push(`bursts ${tiles(n('blast', 60))} around`)
      if (n('split') > 0) out.push(`splits into ${n('split')} shards`)
      if (sh.trail) out.push('burning trail')
      if (path !== 'lob' && path !== 'phase' && low()) out.push('flies over low obstacles')
      break
    }
    case 'beam':
      out.push(`instant beam, ${tiles(n('length', 500))}`)
      if (low()) out.push('flies over low obstacles')
      break
    case 'cone': out.push(`instant cone, ${tiles(n('range', 160))}`); break
    case 'area': {
      if (sh.at === 'aim') out.push(`lands after ${secs(n('delay', R.AREA_TELEGRAPH))}`)
      else out.push('all around you')
      const count = sh.at === 'aim' ? Math.min(5, n('count', 1)) : 1
      if (count > 1) out.push(n('scatter') > 0 ? `${count} impacts, scattered` : `${count} impacts in a line`)
      const ticks = Math.max(1, n('ticks', 1)), every = Math.max(1, n('every', 30))
      if (ticks > every) out.push(`pulses every ${secs(every)} for ${secs(ticks)}`)
      if (path === 'drift') out.push(PATH.drift)
      break
    }
    case 'terrain': out.push(sh.at === 'aim' ? 'paints the ground at the aim' : 'paints the ground around you'); break
    case 'self': out.push('on yourself'); break
    case 'dash':
      if (PATH[path]) out.push(PATH[path])
      if (sh.invulnerable !== 0) out.push('untouchable while dashing')
      break
  }
  if (isStyle(sh.style)) {
    out.push(STYLE_SHORT[sh.style])
    if (n('strikes', 1) > 1 && sh.style !== 'jab' && sh.style !== 'spin') out.push(`${n('strikes')}-hit string`)
    if (n('hold') > 0 && sh.style !== 'throw') out.push(`holds ${secs(n('hold'))}`)
    if (n('parry') > 0) out.push(`parry window ${secs(n('parry'))}`)
    if (n('interrupt')) out.push('breaks windups')
    if (n('backstab')) out.push('backstabs reel')
  }
  if (atk.traits?.includes('armor')) out.push('armour while winding up')
  if (atk.traits?.includes('ambush')) out.push(`+${Math.round((R.AMBUSH_PERMILLE - 1000) / 10)}% from behind or mid-cast`)
  return out
}

/** a badge for an effect the dry runs saw (null: nothing worth a badge) */
export function badgeOf(e: AimEffect, attacks = 3): AimBadge | null {
  const a = e.amount, t = e.ticks, chance = e.chance
  const b = (text: string, color: string): AimBadge => ({ text, color, chance })
  const dur = t > 0 ? ` · ${secs(t)}` : ''
  if (e.kind.startsWith('status:')) {
    const st = e.kind.slice(7)
    const col = STATUS_COLOR[st] ?? '#ffb3ff'
    if (st === 'asleep') return b('asleep (a hit wakes)', col)
    if (st === 'burned') return b(`burned ${R.BURN_DAMAGE}/${secs(R.TURN)}`, col)
    if (st === 'poisoned') return b(`poisoned ${R.POISON_DAMAGE}/${secs(R.TURN)}`, col)
    return b(`${st}${dur}`, col)
  }
  if (e.kind.startsWith('buff:')) {
    const stat = e.kind.slice(5)
    if (stat === 'damage') return a < 0 ? b(`weaker hits ${signed(a)}${dur}`, C.debuff) : b(`${signed(a)} damage${dur}`, C.buff)
    if (stat === 'defense') return a > 0 ? b(`takes ${signed(-a)}${dur}`, C.guard) : b(`takes ${signed(-a)}${dur}`, C.debuff)
    if (stat === 'speed') return b(`speed ${signed(Math.round(a / 10))}%${dur}`, a < 0 ? C.slow : C.buff)
    if (stat === 'blind') return b(`blinded: ${pct(a)} miss${dur}`, C.debuff)
    if (stat === 'thorns') return b(`thorns ${a}${dur}`, C.guard)
    if (stat === 'reflect') return b(`reflects ${pct(a)}${dur}`, C.guard)
    return b(`${stat} ${signed(a)}${dur}`, a < 0 ? C.debuff : C.buff)
  }
  switch (e.kind) {
    case 'flinch': return b(`reels${dur}`, C.flinch)
    case 'slow': return b(`slowed ${pct(a)}${dur}`, C.slow)
    case 'push': return a > 0 ? b(`knocked back ${tiles(a)}`, C.force) : null
    case 'pull': return a > 0 ? b(`pulled in ${tiles(a)}`, C.force) : null
    case 'leap': return b('thrown back', C.force)
    case 'dispel': return b('buffs stripped', C.debuff)
    case 'shield': return b(`${a >= 100000 ? 'blocks all' : `shield ${a}`}${dur}`, C.guard)
    case 'invuln': return b(`untouchable${dur}`, C.guard)
    case 'energy': return b(`${signed(a)} energy`, a > 0 ? C.energy : C.lock)
    case 'jam': return b(`energy stalls${dur}`, C.lock)
    case 'lock': return b(`${a >= attacks ? "can't attack" : a === 1 ? 'an attack locked' : `${a} attacks locked`}${dur}`, C.lock)
    case 'trap': return b(`can't swap or dodge${dur}`, C.lock)
    case 'heal': return a > 0 ? b(`+${a} HP`, C.heal) : null
    case 'recoil': return a > 0 ? b(`−${a} HP recoil`, C.hurt) : null
    default: return null
  }
}

/** most likely first, then as the runs found them */
function badges(list: AimEffect[], on: 'target' | 'self', attacks: number): AimBadge[] {
  return list.filter((e) => e.on === on).map((e) => badgeOf(e, attacks)).filter((x): x is AimBadge => !!x)
    .sort((x, y) => y.chance - x.chance).slice(0, MAX_BADGES)
}

/** the aim info for player p's attack `ai`: `pr` is the prediction against the foe it's aimed at (null: no foe) */
export function aimInfo(def: MatchDef, s: SimState, p: number, ai: number, pr: Prediction | null, blocked = false): AimInfo | null {
  const pl = s.players[p]
  if (!pl || pl.active < 0) return null
  const atk = def.kits[pl.members[pl.active].kit].attacks[ai]
  if (!atk) return null
  const t = pr?.target ?? -1
  const chips: AimChip[] = []
  if (blocked) chips.push({ text: 'blocked by wall', tone: 'warn' })
  for (const text of moveChips(s, atk)) chips.push({ text, tone: 'move' })
  // weakness / resistance, as the target's card prints it
  if (pr && pr.eff !== 0 && t >= 0) {
    const tk = def.kits[s.players[t].members[Math.max(0, s.players[t].active)].kit]
    if (pr.eff > 0) chips.push({ text: `${tk.weaknesses.find((w) => w.type === atk.element)?.value ?? '×2'} weakness`, tone: 'good' })
    else chips.push({ text: `resisted ${(tk.resistances.find((r) => r.type === atk.element)?.value ?? '').replace('-', '−')}`.trim(), tone: 'warn' })
  }
  chips.push(...bonusChips(def, s, p, ai, atk, t))
  const need = costPips(atk.cost), have = pl.pips[0] ?? 0
  chips.push(need > 0 ? { text: `costs ${need} energy, you have ${have}`, tone: have < need ? 'warn' : 'move' } : { text: 'free', tone: 'move' })
  if (atk.oncePerMatch) {
    const used = pl.usedOnce.includes(atk.oncePerMatch)
    chips.push({ text: used ? `${atk.oncePerMatch.toUpperCase()} already used` : `once per match (${atk.oncePerMatch.toUpperCase()})`, tone: used ? 'warn' : 'move' })
  }
  if (pr?.confused) chips.push({ text: 'you are confused: 50% it fails', tone: 'warn' })
  const fx = pr?.effects ?? []
  const n = def.kits[pl.members[pl.active].kit].attacks.length
  const tn = t >= 0 && s.players[t].active >= 0 ? def.kits[s.players[t].members[s.players[t].active].kit].attacks.length : 3
  const bench: BenchMark[] = fx.filter((e) => e.on === 'bench' && e.p !== undefined && e.member !== undefined).map((e) => ({
    p: e.p!, member: e.member!, chance: e.chance,
    ...(e.kind === 'bench' ? { text: `−${e.amount}`, color: C.hurt } : e.kind === 'swap' ? { text: 'forced in', color: C.force } : { text: `+${e.amount}`, color: C.heal }),
  }))
  return {
    attack: ai, name: atk.name, element: atk.element, chips: chips.slice(0, MAX_CHIPS), target: t,
    foe: badges(fx, 'target', tn), self: badges(fx, 'self', n), bench, blocked,
  }
}

/** "50%" for a badge that may not happen, '' for a sure one */
export function chanceLabel(chance: number): string {
  return chance >= 0.995 ? '' : `${Math.max(1, Math.round(chance * 100))}%`
}
