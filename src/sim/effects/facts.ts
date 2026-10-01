// Facts about the match that counting and conditional effects read (`bonusPer`, `when`). Pure reads, no writes.
// The translations (a 1v1 has no Bench and no Prize cards) live here, so every op counts the same way (docs/KITS.md).
import { kitOf, onField } from '../combat'
import * as R from '../rules'
import { COLS, tileAt } from '../terrain'
import { TILE, type MatchDef, type SimState } from '../types'

/** the opposing player an effect without a target means: the first foe on the field, else the first foe */
export function foeOf(s: SimState, p: number): number {
  const team = s.players[p].team
  let first = -1
  for (let i = 0; i < s.players.length; i++) {
    if (s.players[i].team === team) continue
    if (onField(s, i)) return i
    if (first < 0) first = i
  }
  return first
}

/** damage counters (10 HP each) on player p's active Pokémon */
export function damageCounters(s: SimState, p: number): number {
  const pl = s.players[p]
  if (pl.active < 0) return 0
  const m = pl.members[pl.active]
  return Math.trunc((m.maxHp - m.hp) / 10)
}

/** benched (alive, not active) Pokémon; a 1v1 counts R.VIRTUAL_BENCH */
export function benchCount(def: MatchDef, s: SimState, p: number): number {
  if (def.mode === '1v1') return R.VIRTUAL_BENCH
  const pl = s.players[p]
  return pl.members.filter((m, i) => i !== pl.active && !m.ko).length
}

/** "prizes player p has taken": the arena has no prizes (full team elimination), so card text that counts prizes
 * counts progress toward a win. Team mode: p's knockouts. A 1v1 (one KO ends it): the foe's HP lost, scaled to the
 * TCG's 6 prizes */
export function prizesTaken(def: MatchDef, s: SimState, p: number): number {
  if (def.mode !== '1v1') return s.players[p].kos
  const foe = foeOf(s, p)
  if (foe < 0) return 0
  const pl = s.players[foe]
  const m = pl.members[Math.max(0, pl.active)]
  return Math.min(R.TCG_PRIZES - 1, Math.trunc((R.TCG_PRIZES * (m.maxHp - m.hp)) / m.maxHp))
}

/** "prizes player p still needs": team mode, the foes still standing; a 1v1, 6 minus prizesTaken */
export function prizesLeft(def: MatchDef, s: SimState, p: number): number {
  if (def.mode === '1v1') return R.TCG_PRIZES - prizesTaken(def, s, p)
  const team = s.players[p].team
  return s.players.filter((o) => o.team !== team).reduce((n, o) => n + o.members.filter((m) => !m.ko).length, 0)
}

/** distinct types across player p's team ("for each type of basic Energy attached to all of your Pokémon": one
 * meter has no types, so the team's own types count) */
export function teamTypes(def: MatchDef, p: number): number {
  const set = new Set<string>()
  for (const k of def.players[p].members) for (const t of def.kits[k].types) if (t !== 'Colorless') set.add(t)
  return Math.max(1, set.size)
}

/** the number of special conditions on player p */
export function conditions(s: SimState, p: number): number {
  const f = onField(s, p)
  if (!f) return 0
  const st = f.status
  return (st.paralyzed > 0 ? 1 : 0) + (st.asleep > 0 ? 1 : 0) + (st.confused > 0 ? 1 : 0) + (st.burned > 0 ? 1 : 0) + (st.poisoned > 0 ? 1 : 0)
}

/** whole TURNs the fight has lasted (the discard pile and the Lost Zone grow with time) */
export function turnsElapsed(s: SimState): number {
  return Math.trunc(s.phaseT / R.TURN)
}

/** is player p standing on a Stadium: a painted surface (water / fire / shock), tall grass or lava */
export function onStadium(s: SimState, p: number): boolean {
  const f = onField(s, p)
  if (!f) return false
  const t = tileAt(f.x, f.y)
  const i = t.ty * COLS + t.tx
  return s.wet[i] > 0 || s.fire[i] > 0 || s.shock[i] > 0 || s.tiles[i] === TILE.GRASS || s.tiles[i] === TILE.HAZARD
}

export const KINDS = ['V', 'VMAX', 'VSTAR', 'GX', 'EX', 'ex', 'Basic', 'Evolution', 'Rule'] as const

/** does player p's active card have a subtype. "Evolution" = Stage 1 / Stage 2 / VMAX / VSTAR; "Rule" = any rule box;
 * "V" = any Pokémon V (V, VMAX, VSTAR) */
export function isKind(def: MatchDef, s: SimState, p: number, kind: string): boolean {
  const k = kitOf(def, s, p)
  if (!k) return false
  const sub = k.subtypes
  if (kind === 'Evolution') return sub.some((x) => x === 'Stage 1' || x === 'Stage 2' || x === 'VMAX' || x === 'VSTAR')
  if (kind === 'Rule') return sub.some((x) => ['V', 'VMAX', 'VSTAR', 'GX', 'EX', 'ex', 'TAG TEAM', 'V-UNION', 'Radiant'].includes(x))
  if (kind === 'V') return sub.some((x) => x === 'V' || x === 'VMAX' || x === 'VSTAR' || x === 'V-UNION')
  return sub.includes(kind)
}

/** did something happen to p within the RECENT window (a tick stamp; -1 = never) */
export function recent(s: SimState, at: number): boolean {
  return at >= 0 && s.tick - at <= R.RECENT_TICKS
}
