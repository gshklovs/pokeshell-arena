// What the bots know about the game, as pure functions over a (read-only) state: expected damage with weakness and
// resistance, matchups, energy timing, terrain danger, intercepts. Integer math only, so bots stay deterministic.
import { applyWR, hasType, kitOf, onField } from '../sim/combat'
import { canPay, planPayment } from '../sim/energy'
import { FP, idiv, ilen } from '../sim/fixed'
import { ENERGY_CAP, ENERGY_FILL } from '../sim/rules'
import { circleHitsSolid, circleTouches, COLS, isWater, ROWS, tileAt } from '../sim/terrain'
import { TILE, type Effect, type EnergyType, type FighterKit, type MatchDef, type ResolvedAttack, type Shape, type SimState } from '../sim/types'

/** how far an attack reaches, in px */
export function reach(sh: Shape): number {
  const n = (k: string) => (typeof sh[k] === 'number' ? (sh[k] as number) : 0)
  switch (sh.kind) {
    case 'projectile': return n('range')
    case 'beam': return n('length')
    case 'cone': return n('range')
    case 'melee': return n('range') + n('lunge')
    case 'area': return sh.at === 'aim' ? (n('range') || 300) + n('radius') : n('radius')
    case 'dash': return n('distance')
    case 'terrain': return (n('range') || 200) + n('radius')
    default: return 140
  }
}

/** does an effect list (recursively) contain an op */
export function hasOp(list: Effect[] | undefined, op: string, pred: (e: Effect) => boolean = () => true): boolean {
  for (const e of list ?? []) {
    if (e.op === op && pred(e)) return true
    for (const k of ['heads', 'tails', 'then', 'else', 'perHeads']) {
      const sub = e[k]
      if (Array.isArray(sub) && hasOp(sub as Effect[], op, pred)) return true
    }
  }
  return false
}

/** the attack's damage against a foe, weakness and resistance applied (printed base damage) */
export function effDamage(a: ResolvedAttack, foe: FighterKit | null): number {
  if (a.baseDamage <= 0) return 0
  return foe ? applyWR(a.baseDamage, a.element, foe).amount : a.baseDamage
}

/** the most damage one of `kit`'s attacks does to `foe` */
export function threat(kit: FighterKit, foe: FighterKit): number {
  let best = 0
  for (const a of kit.attacks) best = Math.max(best, effDamage(a, foe))
  return best
}

/** how good `mine` (with myHp left) is against `foe` (with foeHp left): hits it survives minus hits it needs, x100 */
export function matchup(mine: FighterKit, myHp: number, foe: FighterKit, foeHp: number): number {
  const off = threat(mine, foe), def = threat(foe, mine)
  const toKo = off > 0 ? idiv(foeHp + off - 1, off) : 20
  const toDie = def > 0 ? idiv(myHp + def - 1, def) : 20
  return (Math.min(20, toDie) - Math.min(20, toKo)) * 100 + idiv(myHp * 20, Math.max(1, mine.hp))
}

/** ticks until the meters can pay `cost` (0 = now), assuming no spending; 9999 if never (wrong meter types) */
export function ticksUntilPayable(cost: readonly string[], types: readonly EnergyType[], pips: readonly number[], fill: readonly number[]): number {
  if (canPay(cost, types, pips)) return 0
  if (!canPay(cost, types, pips.map(() => ENERGY_CAP))) return 9999
  const times: number[] = []
  for (let i = 0; i < pips.length; i++) for (let j = 0; j < ENERGY_CAP; j++) times.push(ENERGY_FILL - fill[i] + j * ENERGY_FILL)
  times.sort((a, b) => a - b)
  for (const t of times) {
    const at = pips.map((p, i) => {
      const first = ENERGY_FILL - fill[i]
      return t < first ? p : Math.min(ENERGY_CAP, p + 1 + idiv(t - first, ENERGY_FILL))
    })
    if (canPay(cost, types, at)) return t
  }
  return 9999
}

/** the pips left after paying `cost` (null if it can't) */
export function afterPaying(cost: readonly string[], types: readonly EnergyType[], pips: readonly number[]): number[] | null {
  const plan = planPayment(cost, types, pips)
  return plan ? pips.map((p, i) => p - plan[i]) : null
}

/** would standing at (x, y) hurt this kit: electrified water, fire, lava */
export function harmful(s: SimState, kit: FighterKit, x: number, y: number, rPx: number): boolean {
  if (!hasType(kit, 'Lightning') && circleTouches(s, x, y, rPx, (j) => s.shock[j] > 0)) return true
  const t = tileAt(x, y)
  if (t.tx < 0 || t.ty < 0 || t.tx >= COLS || t.ty >= ROWS) return false
  const i = t.ty * COLS + t.tx
  if (s.fire[i] > 0 && !hasType(kit, 'Fire')) return true
  if (s.tiles[i] === TILE.HAZARD && s.wet[i] === 0 && !hasType(kit, 'Fire')) return true
  return false
}

/** is a fighter standing in or touching water (shallow or deep) */
export function touchesWater(s: SimState, x: number, y: number, rPx: number): boolean {
  return circleTouches(s, x, y, rPx + 6, (j) => isWater(s, j))
}

/** the tile under a point */
export function tileIndexAt(x: number, y: number): number {
  const t = tileAt(x, y)
  return t.ty * COLS + t.tx
}

/** enemies on the field, in player order */
export function enemiesOf(s: SimState, me: number): number[] {
  const out: number[] = []
  for (let i = 0; i < s.players.length; i++) if (s.players[i].team !== s.players[me].team && onField(s, i)) out.push(i)
  return out
}

/** the active kit of a player (null while a replacement is pending) */
export function activeKit(def: MatchDef, s: SimState, p: number): FighterKit | null {
  return kitOf(def, s, p)
}

/** point (x, y) + velocity x t, pulled back while it's inside a wall (the foe can't be there) */
export function extrapolate(s: SimState, x: number, y: number, vx: number, vy: number, t: number, rPx: number): { x: number; y: number } {
  for (let k = t; k > 0; k = idiv(k * 2, 3)) {
    const px = x + vx * k, py = y + vy * k
    if (!circleHitsSolid(s, px, py, rPx)) return { x: px, y: py }
  }
  return { x, y }
}

/** px between two sub-pixel points */
export function distPx(ax: number, ay: number, bx: number, by: number): number {
  return idiv(ilen(bx - ax, by - ay), FP)
}
