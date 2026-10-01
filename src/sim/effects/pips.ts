// The energy adapter for effects. The arena has ONE energy meter per trainer (docs/SPEC.md section 5: an attack
// costs its card's energy count in pips, whatever the types), so energy text is translated to plain pips:
// "discard an Energy" = lose a pip, "attach / search for Energy" = gain a pip, "for each Energy attached" = unspent
// pips. Every op goes through here. Typed energy in card text is ignored.
import { ENERGY_CAP } from '../rules'
import type { SimState } from '../types'

/** unspent pips of player p */
export function pipTotal(s: SimState, p: number): number {
  return s.players[p].pips[0] ?? 0
}

/** remove up to n pips from player p; returns how many were removed */
export function losePips(s: SimState, p: number, n: number): number {
  const pips = s.players[p].pips
  const k = Math.max(0, Math.min(n, pips[0] ?? 0))
  pips[0] = (pips[0] ?? 0) - k
  return k
}

/** add up to n pips to player p (capped at rules.ENERGY_CAP); returns how many were added */
export function gainPips(s: SimState, p: number, n: number): number {
  const pips = s.players[p].pips
  const k = Math.max(0, Math.min(n, ENERGY_CAP - (pips[0] ?? 0)))
  pips[0] = (pips[0] ?? 0) + k
  return k
}

/** the energy-type param the energy ops still accept (kits name a type as flavour); it is ignored */
export const ANY_TYPE = ['any', 'Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Fairy', 'Dragon', 'Colorless'] as const
