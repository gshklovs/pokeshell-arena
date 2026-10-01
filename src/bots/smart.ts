// The difficulty bots (docs/SPEC.md section 11). One brain with skills switched on per level:
//   easy    wanders toward the foe, fires when roughly aligned and in reach, rarely dodges
//   normal  keeps its preferred range, strafes, dodges the shots it sees coming, fires the best attack in reach
//   hard    + energy planning, weakness-aware attacks / targets / swaps, terrain combos, leading shots and
//             projecting the motion it has watched over its reaction delay, walking around hazards
//   expert  + a short look-ahead: it clones the state and plays a few candidate inputs forward with the sim
// The harness (BotDriver) adds the reaction delay and the aim error. On top of it a bot notices each new shot or
// windup 0..reactionJitter ticks later still (noticed()), and times and aims its dodges and parries with a seeded
// human error: it reacts to nothing sooner than a person could, and sees only what the screen shows (the telegraph,
// not the foe's held aim: a press isn't in the sim until its release). Bots are deterministic: they read only the
// BotView and draw from their own seeded PRNG.
import { canAct, kitOf, onField } from '../sim/combat'
import { canPay } from '../sim/energy'
import { FP, ONE, angleDiff, iatan2, icos, idiv, ilen, isin, wrapAngle } from '../sim/fixed'
import { randInt, roll, seedRng, type HasRng } from '../sim/rng'
import { ENERGY_CAP, EVO_MAX } from '../sim/rules'
import { cloneState } from '../sim/state'
import { evolveOptions, step } from '../sim/step'
import { fighterBlocked } from '../sim/movement'
import { PARRY_TICKS, holding } from '../sim/melee'
import { circleHitsSolid, solid, tileAt } from '../sim/terrain'
import { BTN, evolveTo, swapTo, TILE, type Dir, type FighterKit, type InputFrame, type MatchDef, type ResolvedAttack, type SimState } from '../sim/types'
import type { Bot, BotView, Difficulty } from './bot'
import {
  afterPaying, distPx, effDamage, enemiesOf, extrapolate, harmful, hasOp, matchup, reach, threat, tileIndexAt,
  ticksUntilPayable, touchesWater,
} from './brain'
import { flowField, followField, lineOfSight } from './nav'

const ATTACK_BTNS = [BTN.ATTACK1, BTN.ATTACK2, BTN.ATTACK3]
const DIRS: [Dir, Dir][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
const PROBE_ORDER = [0, 1, -1, 2, -2, 3, -3, 4]

export interface Skills {
  /** easy: a seeded random walk toward / around the foe, fire only when roughly aligned */
  wander: boolean
  /** keep the preferred range and strafe */
  keepRange: boolean
  /** dodge shots it sees coming (dodgePermille per shot) */
  dodge: boolean
  /** hold cheap attacks when they'd delay a better one */
  plan: boolean
  /** weakness-aware attacks, targets and swaps */
  weakness: boolean
  /** flood then zap, burn grass, avoid hazards */
  terrain: boolean
  /** lead shots, and project the motion it has watched (the foe's walk, a shot's flight) over its reaction delay.
   * Never a reaction: a new shot or windup still reaches it only after reactionTicks + its jitter */
  lead: boolean
  /** clone-and-simulate look-ahead */
  look: boolean
  /** ticks a projectile may be away (in its delayed view) and still trigger a dodge */
  dodgeWindow: number
}

export const SKILLS: Record<'easy' | 'normal' | 'hard' | 'expert', Skills> = {
  easy: { wander: true, keepRange: false, dodge: true, plan: false, weakness: false, terrain: false, lead: false, look: false, dodgeWindow: 40 },
  normal: { wander: false, keepRange: true, dodge: true, plan: false, weakness: false, terrain: false, lead: false, look: false, dodgeWindow: 70 },
  hard: { wander: false, keepRange: true, dodge: true, plan: true, weakness: true, terrain: true, lead: true, look: false, dodgeWindow: 16 },
  expert: { wander: false, keepRange: true, dodge: true, plan: true, weakness: true, terrain: true, lead: true, look: true, dodgeWindow: 16 },
}

interface Seen { t: number; x: number; y: number; key: number }
/** how it answers one noticed threat (a shot, a windup), rolled once: whether it rolls, which way (a sideways angle
 * off the shot's line; 0 = straight back along it), and its timing error in ticks */
interface Plan { roll: boolean; side: number | null; wrong: boolean; err: number }

/** the look-ahead's horizon (ticks after the present) and how often it decides */
const LOOK_TICKS = 30
const LOOK_EVERY = 8
/** how much better (score) a candidate must look than the Hard plan to override it */
const LOOK_MARGIN = 20
/** movement hysteresis (anti-dither): a bot never reverses its walk direction sooner than this many ticks after
 * picking it (a dodge roll or a blocked way excepted), and the strafe side flips at most this often off a wall */
export const MIN_HOLD = 10
const STRAFE_FLIP_EVERY = 30
/** the range band: approach past pref + BAND, back off under pref - BAND, and keep going until back at pref */
const BAND = 40

export class SmartBot implements Bot {
  private h: HasRng = { rng: 1 }
  private me = 0
  private strafe: 1 | -1 = 1
  private strafeFlipAt = -9999
  /** the range mode it is in (hysteresis: it holds until it is back at the preferred range) */
  private rangeMode: 'approach' | 'hold' | 'retreat' = 'hold'
  /** easy: backing off a foe that got too close, until it is well clear */
  private backingOff = false
  /** the walk direction last sent and the tick it was picked */
  private held: { mx: Dir; my: Dir; at: number } = { mx: 0, my: 0, at: -9999 }
  private closeIn = false
  /** the real tick of the last press; nothing else is pressed until the delayed view shows its result */
  private committed = -1
  private dodgeAt = -1
  private lastButtons = 0
  private lastSwap = -9999
  /** per threat id: the real tick it becomes noticed (its first sight + the reaction jitter) */
  private seenAt = new Map<number, number>()
  private plans = new Map<number, Plan>()
  /** this tick's threatDodge found a noticed threat and rolled to dodge it (the look-ahead may roll only then) */
  private mayRoll = false
  private hist: Seen[] = []
  private field: Int16Array | null = null
  private fieldAt = -999
  private fieldTile = -1
  private wanderDir = 0
  private wanderUntil = 0
  /** my own recent outputs by real tick (the look-ahead replays them over the reaction gap) */
  private sent: { t: number; f: InputFrame }[] = []
  private lookUntil = -1
  private lookFrame: InputFrame | null = null

  constructor(readonly diff: Difficulty, readonly skills: Skills) {}

  reset(_def: MatchDef, player: number, seed: number): void {
    this.h = { rng: seedRng(seed ^ 0x5eed) }
    this.me = player
    this.committed = -1
    this.dodgeAt = -1
    this.lastButtons = 0
    this.lastSwap = -9999
    this.seenAt.clear()
    this.plans.clear()
    this.mayRoll = false
    this.hist = []
    this.field = null
    this.fieldAt = -999
    this.sent = []
    this.lookUntil = -1
    this.lookFrame = null
    this.strafeFlipAt = -9999
    this.rangeMode = 'hold'
    this.backingOff = false
    this.held = { mx: 0, my: 0, at: -9999 }
  }

  think(v: BotView): InputFrame {
    const out = this.antiDither(v, this.decide(v))
    // presses are edges: never hold the same button two frames running
    if (out.buttons & this.lastButtons) out.buttons = 0
    if (out.buttons & ~BTN.DODGE) this.committed = v.tick
    if (out.buttons & BTN.DODGE) this.dodgeAt = v.tick
    this.lastButtons = out.buttons
    this.sent.push({ t: v.tick, f: out })
    while (this.sent.length > 64) this.sent.shift()
    return out
  }

  /** hysteresis on the walk direction: a reversal on either axis (left <-> right, up <-> down) within MIN_HOLD
   * ticks keeps the held direction, unless it is a dodge roll or the held way is blocked. Without it the bot's
   * choices at a threshold (range band, flow-field tile edge, look-ahead scores) flip it back and forth every
   * tick or few ticks, and the fighter vibrates in place */
  private antiDither(v: BotView, out: InputFrame): InputFrame {
    const h = this.held
    if (out.mx === h.mx && out.my === h.my) return out
    const reverses = out.mx * h.mx < 0 || out.my * h.my < 0
    if (reverses && v.tick - h.at < MIN_HOLD && !(out.buttons & BTN.DODGE) && canAct(v.state.players[this.me].fighter)) {
      const f = v.state.players[this.me].fighter
      const d = h.mx !== 0 && h.my !== 0 ? 181 : 256
      const probe = 34 * FP
      if (!fighterBlocked(v.state, f, f.x + idiv(h.mx * probe * d, 256), f.y + idiv(h.my * probe * d, 256))) return { ...out, mx: h.mx, my: h.my }
    }
    this.held = { mx: out.mx as Dir, my: out.my as Dir, at: v.tick }
    return out
  }

  // ------------------------------------------------------------------ decisions
  private decide(v: BotView): InputFrame {
    const { state: s, def, me } = v
    this.defRef = def
    const pl = s.players[me]
    const ready = s.tick > this.committed
    if (pl.active < 0) {
      if (!ready) return { mx: 0, my: 0, aim: pl.fighter.aim, buttons: 0 }
      const slot = this.pickReplacement(def, s)
      return { mx: 0, my: 0, aim: pl.fighter.aim, buttons: slot >= 0 ? swapTo(slot + 1) : BTN.SWAP_NEXT }
    }
    const f = pl.fighter
    const kit = kitOf(def, s, me)!
    const foe = this.pickFoe(def, s, kit)
    if (foe < 0) return { mx: 0, my: 0, aim: f.aim, buttons: 0 }
    const e = s.players[foe].fighter
    const foeKit = kitOf(def, s, foe)!
    const delay = Math.max(0, v.tick - s.tick)

    // the foe's velocity (sub-px per tick) from what this bot has seen
    const key = foe * 16 + s.players[foe].active
    if (!this.hist.length || this.hist[this.hist.length - 1].t !== s.tick) this.hist.push({ t: s.tick, x: e.x, y: e.y, key })
    while (this.hist.length > 12) this.hist.shift()
    let vx = 0, vy = 0
    const old = this.hist.find((h) => h.key === key && s.tick - h.t >= 4)
    if (old) { const dt = s.tick - old.t; vx = idiv(e.x - old.x, dt); vy = idiv(e.y - old.y, dt) }

    // where the foe is now (hard+: extrapolated over this bot's own reaction delay)
    const lead = this.skills.lead
    const now = lead ? extrapolate(s, e.x, e.y, vx, vy, delay, e.r) : { x: e.x, y: e.y }
    const dx = now.x - f.x, dy = now.y - f.y
    const dist = idiv(ilen(dx, dy), FP)
    const toFoe = iatan2(dy, dx)
    const los = lineOfSight(s, f.x, f.y, e.x, e.y)

    if (v.tick % 90 === 0) {
      this.closeIn = roll(this.h, this.diff.aggression)
      if (randInt(this.h, 3) === 0) this.strafe = this.strafe > 0 ? -1 : 1
    }

    // the attack this bot is working toward, and the range it wants for it
    const types = def.players[me].energy
    const plan = this.planAttack(kit, foeKit, types, s.players[me].pips.length)
    let pref = plan ? Math.max(50, idiv(this.effReach(plan) * 8, 10)) : 120
    if (this.skills.weakness && plan) {
      // kite a foe whose reach is shorter than ours
      const foeReach = Math.max(0, ...foeKit.attacks.map((a) => (a.baseDamage > 0 ? reach(a.shape) : 0)))
      if (foeReach + 60 < reach(plan.shape) - 30) pref = Math.max(pref, Math.min(reach(plan.shape) - 30, foeReach + 70))
      else if (this.closeIn) pref = Math.max(50, idiv(pref * 3, 4))
    } else if (this.closeIn) pref = Math.max(50, idiv(pref, 2))
    // melee (docs/MELEE.md 3.7): close the gap on a foe that is recovering, reeling or winding up something long
    // (punish the recovery)
    const close = !!plan && (plan.shape.kind === 'melee' || plan.shape.kind === 'dash')
    if (close && !this.skills.wander && (e.recovery > 8 || (e.cast !== null && e.cast.t > 8) || (e.flinch ?? 0) > 0)) pref = Math.max(40, idiv(reach(plan!.shape) * 6, 10))

    // ---- movement
    let [mx, my] = this.move(v, kit, f, e, dist, toFoe, los, pref)
    let aim = toFoe
    let buttons = 0
    const canMove = canAct(f) && !f.dash
    const free = ready && canMove && !f.cast && !f.dodge

    // ---- dodging what's coming (it also sidesteps when the roll is spent)
    this.mayRoll = false
    if (this.skills.dodge && canMove && !f.dodge) {
      const d = this.threatDodge(v, def, f, delay)
      this.mayRoll = !!d?.roll
      if (d) {
        if (!f.cast && s.tick > this.dodgeAt && f.dodgeCd === 0 && d.roll) return { mx: d.mx, my: d.my, aim, buttons: BTN.DODGE }
        if (this.skills.lead) { mx = d.mx; my = d.my }
      }
    }

    // ---- evolve when the charge is full (easy dawdles; hard+ picks the evolution best against the foe)
    if (free && pl.evo >= EVO_MAX) {
      const opts = evolveOptions(def, s, me)
      if (opts.length) {
        const n = this.pickEvolution(def, s, opts, foeKit, foe)
        if (n > 0) return { mx, my, aim, buttons: evolveTo(n) }
      }
    }

    // ---- a voluntary swap (hard+)
    if (this.skills.weakness && free && def.players[me].members.length > 1) {
      const slot = this.pickSwap(v, def, s, kit, foeKit)
      if (slot >= 0) { this.lastSwap = v.tick; return { mx, my, aim, buttons: swapTo(slot + 1) } }
    }

    // ---- a throw (melee.ts): while it holds the foe, aim where the throw splats it (the nearest wall past the foe)
    const held = holding(s, me)
    if (held >= 0 && !this.skills.wander) {
      const g = s.players[held].fighter
      let best = -1, bestD = 1e9
      for (let k = 0; k < 16; k++) {
        const a = k * 16
        for (let d = 40; d <= 320; d += 20) {
          const t = tileAt(g.x + idiv(icos(a) * d * FP, ONE), g.y + idiv(isin(a) * d * FP, ONE))
          if (solid(s, t.tx, t.ty)) { if (d < bestD) { bestD = d; best = a } break }
        }
      }
      aim = best >= 0 ? best : aim
    }

    // ---- hard+: a counter's parry when a foe's close attack is about to land on it
    if (this.skills.weakness && free && f.recovery === 0) {
      const i = kit.attacks.findIndex((a, j) => j < ATTACK_BTNS.length && typeof a.shape.parry === 'number' && f.cooldowns[j] === 0 && canPay(a.cost, types as never, s.players[me].pips))
      const ea = e.cast ? foeKit.attacks[e.cast.attack] : undefined
      const cid = ea ? this.castId(s, foe, e.cast!.t, ea.windup) : 0
      // only a windup it has noticed, read off the telegraph with its timing error
      if (i >= 0 && e.cast && ea && this.noticed(v, cid)) {
        const left = e.cast.t - delay + this.plan(cid + 1, 0).err
        const w = kit.attacks[i].windup
        const aimedAtMe = Math.abs(angleDiff(e.aim, iatan2(f.y - e.y, f.x - e.x))) <= 24
        if ((ea.shape.kind === 'melee' || ea.shape.kind === 'dash') && aimedAtMe && dist <= reach(ea.shape) + f.r + 30 && left >= w - 2 && left <= w + PARRY_TICKS - 4) {
          return { mx, my, aim, buttons: ATTACK_BTNS[i] }
        }
      }
    }

    // ---- attacks
    if (free && f.recovery === 0) {
      const pick = this.pickAttack(s, kit, foeKit, f, e, foe, dist, toFoe, los, types, plan, vx, vy)
      if (pick) {
        const [a, i] = pick
        aim = this.aimFor(s, a, f, e, vx, vy, delay, dist)
        buttons = ATTACK_BTNS[i]
      }
    }
    if (!buttons && f.cast) {
      // keep tracking during the windup: the attack leaves toward the aim at release
      const a = kit.attacks[f.cast.attack]
      if (a) aim = this.aimFor(s, a, f, e, vx, vy, delay, dist)
    }

    let frame: InputFrame = { mx, my, aim, buttons }
    if (this.skills.look) frame = this.lookAhead(v, frame, foe, kit, pref, free)
    return frame
  }

  // ------------------------------------------------------------------ targets and swaps
  private pickFoe(def: MatchDef, s: SimState, kit: FighterKit): number {
    const es = enemiesOf(s, this.me)
    if (es.length <= 1 || !this.skills.weakness) return es[0] ?? -1
    const f = s.players[this.me].fighter
    let best = -1, bestV = -1e9
    for (const e of es) {
      const ek = kitOf(def, s, e)!
      const hp = s.players[e].members[s.players[e].active].hp
      const val = idiv(threat(kit, ek) * 1000, Math.max(1, hp)) - idiv(ilen(s.players[e].fighter.x - f.x, s.players[e].fighter.y - f.y), FP)
      if (val > bestV) { bestV = val; best = e }
    }
    return best
  }

  /** which evolveOptions entry to take (1-based), 0 = not now */
  private pickEvolution(def: MatchDef, s: SimState, opts: number[], foeKit: FighterKit, foe: number): number {
    if (this.skills.wander && !roll(this.h, 40)) return 0
    if (!this.skills.weakness) return 1
    const pl = s.players[this.me]
    const m = pl.members[pl.active]
    const damage = m.maxHp - m.hp
    const fhp = s.players[foe].members[s.players[foe].active].hp
    let best = 1, bestV = -1e9
    opts.forEach((k, i) => {
      const kit = def.kits[k]
      const val = matchup(kit, Math.max(1, kit.hp - damage), foeKit, fhp)
      if (val > bestV) { bestV = val; best = i + 1 }
    })
    return best
  }

  /** the bench member to send in after a KO */
  private pickReplacement(def: MatchDef, s: SimState): number {
    const pl = s.players[this.me]
    const alive = pl.members.map((m, i) => [m, i] as const).filter(([m]) => !m.ko)
    if (!alive.length) return -1
    if (!this.skills.weakness) return alive[0][1]
    const foe = enemiesOf(s, this.me)[0]
    const fk = foe !== undefined ? kitOf(def, s, foe) : null
    const fhp = foe !== undefined ? s.players[foe].members[s.players[foe].active].hp : 0
    let best = alive[0][1], bestV = -1e9
    for (const [m, i] of alive) {
      const k = def.kits[m.kit]
      const val = fk ? matchup(k, m.hp, fk, fhp) : m.hp
      if (val > bestV) { bestV = val; best = i }
    }
    return best
  }

  /** hard+: swap out of a bad matchup (or to save a nearly KO'd Pokémon) when the retreat is affordable */
  private pickSwap(v: BotView, def: MatchDef, s: SimState, kit: FighterKit, foeKit: FighterKit): number {
    const pl = s.players[this.me]
    if (pl.swapCd > 0 || v.tick - this.lastSwap < 240) return -1
    const types = def.players[this.me].energy
    const cost = new Array<string>(kit.retreat).fill('Colorless')
    const left = afterPaying(cost, types, pl.pips)
    if (!left) return -1
    const foe = enemiesOf(s, this.me)[0]
    const fhp = s.players[foe].members[s.players[foe].active].hp
    const mine = pl.members[pl.active]
    const cur = matchup(kit, mine.hp, foeKit, fhp)
    let best = -1, bestV = -1e9
    pl.members.forEach((m, i) => {
      if (m.ko || i === pl.active) return
      const val = matchup(def.kits[m.kit], m.hp, foeKit, fhp)
      if (val > bestV) { bestV = val; best = i }
    })
    if (best < 0) return -1
    const dying = threat(foeKit, kit) >= mine.hp && mine.hp * 3 < mine.maxHp && pl.members[best].hp > mine.hp
    return bestV - cur >= 200 || (dying && bestV >= cur - 50) ? best : -1
  }

  // ------------------------------------------------------------------ attacks
  /** the value of landing an attack now (0 = not worth pressing) */
  private value(s: SimState, a: ResolvedAttack, foeKit: FighterKit, foeHp: number, e: { x: number; y: number; r: number }): number {
    const w = this.skills.weakness
    let v = w ? effDamage(a, foeKit) : a.baseDamage
    if (w && v >= foeHp) v += 60
    if (hasOp(a.onHit, 'status') || hasOp(a.onCast, 'status')) v += 8
    if (this.skills.terrain) {
      if (a.element === 'Lightning' && touchesWater(s, e.x, e.y, e.r) && !foeKit.types.includes('Lightning')) v += 35
      if (a.element === 'Fire' && !foeKit.types.includes('Fire')) {
        const i = tileIndexAt(e.x, e.y)
        if (i >= 0 && i < s.tiles.length && s.tiles[i] === TILE.GRASS) v += 20
      }
      if (hasOp(a.onImpact, 'paint', (x) => x.terrain === 'water') && !touchesWater(s, e.x, e.y, e.r)) {
        // flood the foe's ground: slows non-Water foes, and sets up a Lightning teammate's zap
        const team = s.players[this.me]
        const zap = team.members.some((m) => !m.ko && this.kitHasLightning(m.kit))
        v += zap ? 15 : 6
      }
    }
    if (a.shape.kind === 'self' && v === 0) return 0
    return v
  }

  /** the range it fires from: the full reach for easy; ranged shots only from where they tend to land */
  private effReach(a: ResolvedAttack): number {
    const r = reach(a.shape)
    if (this.skills.wander) return r
    const k = a.shape.kind
    if (k === 'projectile' || k === 'beam') return idiv(r * (this.skills.lead ? 80 : 85), 100)
    return r
  }

  private kitHasLightning(k: number): boolean {
    return this.defRef?.kits[k]?.attacks.some((a) => a.element === 'Lightning' && a.baseDamage > 0) ?? false
  }
  private defRef: MatchDef | null = null

  /** the attack it is working toward: the most valuable one its meters can ever pay */
  private planAttack(kit: FighterKit, foeKit: FighterKit, types: readonly string[], meters: number): ResolvedAttack | null {
    const full = new Array<number>(meters).fill(ENERGY_CAP)
    let best: ResolvedAttack | null = null, bestV = -1
    for (const a of kit.attacks) {
      if (!canPay(a.cost, types as never, full)) continue
      const v = (this.skills.weakness ? effDamage(a, foeKit) : a.baseDamage) * 10 - a.cost.length
      if (a.baseDamage > 0 && v > bestV) { bestV = v; best = a }
    }
    return best
  }

  private pickAttack(
    s: SimState, kit: FighterKit, foeKit: FighterKit, f: SimState['players'][number]['fighter'], e: SimState['players'][number]['fighter'],
    foe: number, dist: number, toFoe: number, los: boolean, types: readonly string[], plan: ResolvedAttack | null,
    vx = 0, vy = 0,
  ): [ResolvedAttack, number] | null {
    const pl = s.players[this.me]
    const foeHp = s.players[foe].members[s.players[foe].active].hp
    if (this.skills.wander) {
      // easy: only when roughly lined up with one of the 8 directions
      const off = Math.abs(angleDiff(toFoe, ((toFoe + 16) >> 5) << 5))
      if (off > 8) return null
    }
    let best: [ResolvedAttack, number] | null = null, bestV = 0
    kit.attacks.forEach((a, i) => {
      if (i >= ATTACK_BTNS.length || f.cooldowns[i] > 0 || !canPay(a.cost, types as never, pl.pips)) return
      if (a.oncePerMatch && pl.usedOnce.includes(a.oncePerMatch)) return
      const self = a.shape.kind === 'self' || (a.shape.kind === 'area' && a.shape.at !== 'aim')
      if (a.shape.kind !== 'self' && this.effReach(a) + e.r - 4 < dist) return
      if (!self && !los) return
      // a melee swing (melee.ts) only when the foe will still be inside the arc after the windup and the step-in
      if (a.shape.kind === 'melee' && !this.skills.wander && typeof a.shape.parry !== 'number') {
        const p = extrapolate(s, e.x, e.y, vx, vy, a.windup, e.r)
        if (distPx(f.x, f.y, p.x, p.y) > reach(a.shape) + e.r) return
      }
      let val = this.value(s, a, foeKit, foeHp, e)
      if (a.shape.kind === 'self' && a.baseDamage === 0) val = hasOp(a.onCast, 'shield') && dist < 260 ? 12 : 0
      if (this.skills.wander) val = 1 + randInt(this.h, 4) // easy: any attack it can fire, no judgement
      if (val > bestV || (val === bestV && best && a.cost.length < best[0].cost.length)) { bestV = val; best = [a, i] }
    })
    if (!best || !this.skills.plan || !plan) return best
    const [a] = best as [ResolvedAttack, number]
    if (a === plan || canPay(plan.cost, types as never, pl.pips)) return best
    // energy planning: would spending on this delay the planned attack by much?
    const left = afterPaying(a.cost, types as never, pl.pips)!
    const without = ticksUntilPayable(plan.cost, types as never, pl.pips, pl.fill)
    const withIt = ticksUntilPayable(plan.cost, types as never, left, pl.fill)
    const vA = this.value(s, a, foeKit, foeHp, e), vP = this.value(s, plan, foeKit, foeHp, e)
    const efficient = vA * Math.max(1, plan.cost.length) >= vP * Math.max(1, a.cost.length)
    const capped = pl.pips.reduce((n, p) => n + p, 0) >= ENERGY_CAP * pl.pips.length - 1
    const kills = vA >= foeHp
    return efficient || capped || kills || withIt - without <= 20 ? best : null
  }

  /** where to aim an attack: straight at the foe, or (hard+) where it will be when the attack arrives */
  private aimFor(s: SimState, a: ResolvedAttack, f: { x: number; y: number }, e: { x: number; y: number; r: number }, vx: number, vy: number, delay: number, dist: number): number {
    if (!this.skills.lead) return iatan2(e.y - f.y, e.x - f.x)
    let t = delay + a.windup
    const sp = typeof a.shape.speed === 'number' ? (a.shape.speed as number) : 0
    if (a.shape.kind === 'projectile' && sp > 0) {
      // iterate the intercept a few times
      let d = dist
      for (let k = 0; k < 3; k++) {
        const tt = Math.min(90, delay + a.windup + idiv(d, sp))
        const p = extrapolate(s, e.x, e.y, vx, vy, tt, e.r)
        d = idiv(ilen(p.x - f.x, p.y - f.y), FP)
        t = tt
      }
    } else if (a.shape.kind === 'beam' || a.shape.kind === 'area') {
      t = delay + a.windup
    } else {
      t = delay + idiv(a.windup, 2)
    }
    const p = extrapolate(s, e.x, e.y, vx, vy, Math.min(90, t), e.r)
    return iatan2(p.y - f.y, p.x - f.x)
  }

  // ------------------------------------------------------------------ dodging
  /** has it noticed a threat (a shot, a windup) yet: the first time it is in view the bot draws its jitter, and the
   * threat reaches it that many ticks later. With the harness's delay nothing is answered sooner than reactionTicks
   * after it happened (the user: "how does the bot know to dodge the second i click my attack?") */
  private noticed(v: BotView, id: number): boolean {
    let at = this.seenAt.get(id)
    if (at === undefined) {
      at = v.tick + randInt(this.h, this.diff.reactionJitter + 1)
      this.seenAt.set(id, at)
      if (this.seenAt.size > 128) this.seenAt.delete(this.seenAt.keys().next().value as number)
    }
    return v.tick >= at
  }

  /** the plan for a noticed threat, rolled once: dodge or not, the wrong way sometimes, a timing error. `side` is
   * the correct sideways angle, taken on the first call (crossing the shot's line later doesn't flip it) */
  private plan(id: number, side: number): Plan {
    let p = this.plans.get(id)
    if (!p) {
      const err = this.diff.timingErr
      p = { roll: roll(this.h, this.diff.dodgePermille), side: null, wrong: roll(this.h, this.diff.wrongDodgePermille), err: randInt(this.h, 2 * err + 1) - err }
      this.plans.set(id, p)
      if (this.plans.size > 128) this.plans.delete(this.plans.keys().next().value as number)
    }
    // the wrong way: across the line (the other side) or straight back along it
    if (p.side === null) p.side = p.wrong ? (randInt(this.h, 2) ? -side : 0) : side
    return p
  }

  /** a windup's id: its start tick and its player */
  private castId(s: SimState, p: number, left: number, windup: number): number {
    return (s.tick - (windup - left)) * 8 + p * 2 + 1_000_000
  }

  private threatDodge(v: BotView, def: MatchDef, f: SimState['players'][number]['fighter'], delay: number): { mx: Dir; my: Dir; roll: boolean } | null {
    const s = v.state
    // hard+ projects a shot's straight flight over its delay (motion it can see), but only once it has noticed it
    const comp = this.skills.lead ? delay : 0
    for (const pr of s.projectiles) {
      if (s.players[pr.owner].team === s.players[this.me].team) continue
      // a volley (a fan, a braid, a shot's shards) is one threat: noticed once, one plan for all its shots
      const key = pr.grp || pr.id
      if (!this.noticed(v, key)) continue
      // a wiggling shot (zigzag, weave, spiral, braid) is read along its mean line, not its heading of the moment
      const path = kitOf(def, s, pr.owner)?.attacks[pr.attack]?.shape.path
      const wig = !pr.kid && (path === 'zigzag' || path === 'weave' || path === 'spiral' || path === 'helix')
      const spd = ilen(pr.vx, pr.vy)
      const vx = wig ? idiv(icos(pr.base) * spd, ONE) : pr.vx, vy = wig ? idiv(isin(pr.base) * spd, ONE) : pr.vy
      const px = pr.x + vx * comp, py = pr.y + vy * comp
      const rx = f.x - px, ry = f.y - py
      const v2 = vx * vx + vy * vy
      if (v2 === 0) continue
      const dot = rx * vx + ry * vy
      if (dot <= 0) continue
      const tStar = idiv(dot, v2)
      const sp = ilen(vx, vy)
      const cross = rx * vy - ry * vx
      const miss = idiv(Math.abs(cross), Math.max(1, sp))
      if (miss > (pr.r + f.r + 8) * FP) continue
      const pl = this.plan(key * 4, cross > 0 ? -64 : 64)
      // its timing: the window it waits for, give or take its error (early rolls run out of i-frames, late ones eat it)
      if (tStar > this.skills.dodgeWindow + pl.err) continue
      const a = wrapAngle(iatan2(vy, vx) + pl.side!)
      const [mx, my] = DIRS[((a + 16) >> 5) & 7]
      if (circleHitsSolid(s, f.x + mx * 60 * FP, f.y + my * 60 * FP, f.r)) {
        const [ox, oy] = DIRS[((wrapAngle(a + 128) + 16) >> 5) & 7]
        return { mx: ox, my: oy, roll: pl.roll }
      }
      return { mx, my, roll: pl.roll }
    }
    if (!this.skills.weakness) return null
    // hard+: read the foe's windups off their telegraphs (melee, cones, beams aimed at it; a shot's locked aim line)
    for (let p = 0; p < s.players.length; p++) {
      if (s.players[p].team === s.players[this.me].team) continue
      const ef = onField(s, p)
      if (!ef || !ef.cast) continue
      const a = kitOf(def, s, p)?.attacks[ef.cast.attack]
      if (!a || a.baseDamage === 0) continue
      const d = distPx(ef.x, ef.y, f.x, f.y)
      const k = a.shape.kind
      if ((k === 'melee' || k === 'cone' || k === 'dash') && d > reach(a.shape) + f.r + 30) continue
      if ((k === 'beam' || k === 'projectile') && d > reach(a.shape) + 20) continue
      if (k === 'self') continue
      const id = this.castId(s, p, ef.cast.t, a.windup)
      if (!this.noticed(v, id)) continue
      const away = iatan2(f.y - ef.y, f.x - ef.x)
      const off = angleDiff(ef.aim, away)
      const side = off > 0 ? 64 : -64
      if (k === 'projectile') {
        // a shot's aim locks through its windup: walk off the telegraphed line (no roll: the shot is dodged when it flies)
        if (Math.abs(off) > 20) continue
        const [mx, my] = DIRS[((wrapAngle(ef.aim + this.plan(id, side).side!) + 16) >> 5) & 7]
        return { mx, my, roll: false }
      }
      const pl = this.plan(id, side)
      // the wrong way off a close attack: into it, or sideways inside its reach
      const dir = k === 'beam' ? wrapAngle(ef.aim + pl.side!) : pl.wrong ? wrapAngle(away + (pl.side ? 128 : side)) : away
      const [mx, my] = DIRS[((dir + 16) >> 5) & 7]
      return { mx, my, roll: pl.roll }
    }
    return null
  }

  // ------------------------------------------------------------------ movement
  private move(v: BotView, kit: FighterKit, f: { x: number; y: number; r: number }, e: { x: number; y: number }, dist: number, toFoe: number, los: boolean, pref: number): [Dir, Dir] {
    const s = v.state
    const t = tileAt(e.x, e.y)
    const ti = t.ty * 48 + t.tx
    if (!this.field || v.tick - this.fieldAt >= 20 || (ti !== this.fieldTile && v.tick - this.fieldAt >= 6)) {
      this.field = flowField(s, t.tx, t.ty)
      this.fieldAt = v.tick
      this.fieldTile = ti
    }
    let want: number
    if (this.skills.wander) {
      if (v.tick >= this.wanderUntil) {
        this.wanderUntil = v.tick + 40 + randInt(this.h, 50)
        const r = randInt(this.h, 10)
        this.wanderDir = r < 5 ? -1 : wrapAngle(toFoe + (randInt(this.h, 7) - 3) * 32)
        if (r >= 8) this.wanderDir = randInt(this.h, 8) * 32
      }
      want = this.wanderDir < 0 || !los || dist > 500 ? (followField(s, this.field, f.x, f.y) ?? toFoe) : this.wanderDir
      if (dist < 70) this.backingOff = true
      else if (dist >= 110) this.backingOff = false
      if (this.backingOff) want = wrapAngle(toFoe + 128)
    } else {
      // the range band with hysteresis: once it starts closing in or backing off it keeps on until it is back at
      // the preferred range, so a distance hovering at a band edge doesn't flip it every tick
      if (!los || dist > pref + BAND) this.rangeMode = 'approach'
      else if (dist < pref - BAND) this.rangeMode = 'retreat'
      else if ((this.rangeMode === 'approach' && dist <= pref) || (this.rangeMode === 'retreat' && dist >= pref)) this.rangeMode = 'hold'
      if (this.rangeMode === 'approach') want = followField(s, this.field, f.x, f.y) ?? toFoe
      else if (this.rangeMode === 'retreat') want = wrapAngle(toFoe + 128)
      else want = wrapAngle(toFoe + 64 * this.strafe)
    }
    return this.steer(s, kit, f, want)
  }

  /** the 8-way direction nearest `want` that isn't blocked (hard+: nor harmful) */
  private steer(s: SimState, kit: FighterKit, f: { x: number; y: number; r: number }, want: number): [Dir, Dir] {
    const sector = ((want + 16) >> 5) & 7
    const avoid = this.skills.terrain && !harmful(s, kit, f.x, f.y, f.r)
    for (let n = 0; n < PROBE_ORDER.length; n++) {
      const [mx, my] = DIRS[(sector + PROBE_ORDER[n] + 8) & 7]
      const probe = 34 * FP
      const d = mx !== 0 && my !== 0 ? 181 : 256
      const px = f.x + idiv(mx * probe * d, 256), py = f.y + idiv(my * probe * d, 256)
      if (circleHitsSolid(s, px, py, f.r)) {
        if (n === 1 && s.tick - this.strafeFlipAt >= STRAFE_FLIP_EVERY) { this.strafe = this.strafe > 0 ? -1 : 1; this.strafeFlipAt = s.tick }
        continue
      }
      if (avoid && harmful(s, kit, px, py, f.r)) continue
      return [mx, my]
    }
    return [0, 0]
  }

  // ------------------------------------------------------------------ expert: look-ahead
  private lookAhead(v: BotView, frame: InputFrame, foe: number, kit: FighterKit, pref: number, free: boolean): InputFrame {
    const s = v.state
    // keep following a chosen move for a few ticks
    if (this.lookFrame && v.tick < this.lookUntil && !frame.buttons) {
      const lf = this.lookFrame
      return { mx: lf.mx, my: lf.my, aim: frame.aim, buttons: 0 }
    }
    // the move it has been following stays the incumbent: a new one must beat it by the margin (hysteresis;
    // without it the choice flip-flopped between opposite sides every LOOK_EVERY ticks)
    const incumbent = this.lookFrame && !frame.buttons ? { ...this.lookFrame, aim: frame.aim } : null
    this.lookFrame = null
    if (!free || v.tick % LOOK_EVERY !== 0) return frame
    const f = s.players[this.me].fighter
    const e = s.players[foe].fighter
    if (distPx(f.x, f.y, e.x, e.y) > 760) return frame
    const toFoe = iatan2(e.y - f.y, e.x - f.x)
    const cands: InputFrame[] = [incumbent ?? frame]
    if (incumbent) cands.push(frame)
    const moveTo = (a: number): InputFrame => { const [mx, my] = this.steer(s, kit, f, a); return { mx, my, aim: frame.aim, buttons: 0 } }
    if (frame.buttons) cands.push({ ...frame, buttons: 0 })
    cands.push(moveTo(toFoe + 64), moveTo(toFoe - 64), moveTo(toFoe + 128), moveTo(toFoe))
    // a roll only against a threat it has noticed and chose to dodge (threatDodge): the rollouts see every shot in
    // its view, and without this gate they rolled out of each one perfectly, the first tick it came into view
    if (f.dodgeCd === 0 && s.tick > this.dodgeAt && this.mayRoll) {
      for (const side of [64, -64]) { const m = moveTo(toFoe + side); cands.push({ ...m, buttons: BTN.DODGE }) }
    }
    const types = v.def.players[this.me].energy
    const pl = s.players[this.me]
    kit.attacks.forEach((a, i) => {
      if (i >= ATTACK_BTNS.length || f.cooldowns[i] > 0 || !canPay(a.cost, types, pl.pips) || frame.buttons === ATTACK_BTNS[i]) return
      if (a.oncePerMatch && pl.usedOnce.includes(a.oncePerMatch)) return
      cands.push({ mx: frame.mx, my: frame.my, aim: frame.aim, buttons: ATTACK_BTNS[i] })
    })
    // one coin-flip stream for every candidate (fair comparison), drawn from the bot's own PRNG: the look-ahead
    // never peeks at the sim's upcoming coin flips
    const rng = seedRng(randInt(this.h, 0x7fffffff))
    const base = this.rollout(v, cands[0], foe, pref, rng)
    let best = 0, bestV = base + LOOK_MARGIN
    for (let c = 1; c < cands.length; c++) {
      const sc = this.rollout(v, cands[c], foe, pref, rng)
      if (sc > bestV) { bestV = sc; best = c }
    }
    const pick = cands[best]
    if ((best !== 0 || incumbent) && !pick.buttons && (pick.mx !== frame.mx || pick.my !== frame.my)) { this.lookFrame = pick; this.lookUntil = v.tick + LOOK_EVERY }
    return pick
  }

  /** play a candidate forward: replay my own inputs over the reaction gap, then the candidate (held), the foe
   * modelled as a Hard bot seeing the present. Score: damage dealt minus taken, knockouts, energy kept, range */
  private rollout(v: BotView, cand: InputFrame, foe: number, pref: number, rng: number): number {
    const def = v.def
    const sim = cloneState(v.state)
    sim.rng = rng
    // the future it imagines holds only the shots and windups it has noticed
    const known = (id: number) => (this.seenAt.get(id) ?? Infinity) <= v.tick
    sim.projectiles = sim.projectiles.filter((pr) => sim.players[pr.owner].team === sim.players[this.me].team || known(pr.id))
    for (let p = 0; p < sim.players.length; p++) {
      const ef = onField(sim, p)
      const a = ef?.cast ? kitOf(def, sim, p)?.attacks[ef.cast.attack] : undefined
      if (ef && a && p !== this.me && !known(this.castId(sim, p, ef.cast!.t, a.windup))) ef.cast = null
    }
    const me = this.me
    const model = new SmartBot({ reactionTicks: 0, aimErrorDeg: 0, dodgePermille: 500, aggression: 700, reactionJitter: 0, wrongDodgePermille: 0, timingErr: 0 }, SKILLS.hard)
    model.reset(def, foe, 0x1234 + v.tick)
    const hp = (p: number) => sim.players[p].members.reduce((n, m) => n + m.hp, 0)
    const myHp0 = hp(me), foeHp0 = hp(foe), myPr0 = sim.players[me].kos, foePr0 = sim.players[foe].kos
    const end = v.tick + LOOK_TICKS
    const inputs: InputFrame[] = sim.players.map(() => ({ mx: 0, my: 0, aim: 0, buttons: 0 }))
    for (let t = sim.tick; t < end && sim.phase === 'fight'; t++) {
      let mine: InputFrame
      if (t < v.tick) mine = this.sent.find((x) => x.t === t)?.f ?? { mx: 0, my: 0, aim: cand.aim, buttons: 0 }
      else if (t === v.tick) mine = cand
      else {
        const mf = sim.players[me].fighter, ef = sim.players[foe].fighter
        mine = { mx: cand.mx, my: cand.my, aim: iatan2(ef.y - mf.y, ef.x - mf.x), buttons: 0 }
      }
      inputs[me] = mine
      inputs[foe] = model.think({ tick: sim.tick, me: foe, state: sim, def })
      step(def, sim, inputs)
    }
    const dealt = foeHp0 - hp(foe), taken = myHp0 - hp(me)
    const kos = (sim.players[me].kos - myPr0) - (sim.players[foe].kos - foePr0)
    let score = dealt * 10 - taken * 12 + kos * 400 + sim.players[me].pips.reduce((n, p) => n + p, 0) * 4
    if ((sim.phase as string) === 'over') score += sim.winner === sim.players[me].team ? 5000 : -5000
    const mf = sim.players[me].fighter, ef = sim.players[foe].fighter
    if (sim.players[me].active >= 0 && sim.players[foe].active >= 0) score -= idiv(Math.abs(distPx(mf.x, mf.y, ef.x, ef.y) - pref), 10)
    return score
  }
}
