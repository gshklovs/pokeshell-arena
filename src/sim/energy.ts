// Energy (docs/SPEC.md section 5): ONE meter that fills over time. An attack costs its card's energy count (its
// convertedEnergyCost: every cost symbol is one pip, whatever its type); retreat costs the retreat count.
// `pips` / `fill` are one-entry arrays (the meter), kept as arrays so the state shape stays stable. The `types`
// parameters are what callers pass for the old typed meters; the single meter ignores them.
import { ENERGY_CAP, ENERGY_FILL } from './rules'
import type { EnergyType, FighterKit, PlayerState } from './types'

/** pips an attack costs: one per cost symbol (Free / empty symbols cost nothing) */
export function costPips(cost: readonly string[]): number {
  let n = 0
  for (const c of cost) if (c && c !== 'Free') n++
  return n
}

/** the pips a payment would take from the meter ([n]), or null if the meter can't pay */
export function planPayment(cost: readonly string[], _types: readonly EnergyType[], pips: readonly number[]): number[] | null {
  const need = costPips(cost)
  return need <= (pips[0] ?? 0) ? [need] : null
}

export function canPay(cost: readonly string[], types: readonly EnergyType[], pips: readonly number[]): boolean {
  return planPayment(cost, types, pips) !== null
}

/** pay the cost from the player's meter; false (and nothing taken) if it can't */
export function pay(pl: PlayerState, types: readonly EnergyType[], cost: readonly string[]): boolean {
  const plan = planPayment(cost, types, pl.pips)
  if (!plan) return false
  pl.pips[0] -= plan[0]
  return true
}

/** one tick of meter fill */
export function fillMeters(pl: PlayerState): void {
  for (let i = 0; i < pl.pips.length; i++) {
    if (pl.pips[i] >= ENERGY_CAP) { pl.fill[i] = 0; continue }
    if (++pl.fill[i] >= ENERGY_FILL) { pl.fill[i] = 0; pl.pips[i]++ }
  }
}

/** remove up to `count` pips (any type: one meter); returns how many were removed */
export function discard(pl: PlayerState, _types: readonly EnergyType[], _type: string, count: number): number {
  const n = Math.max(0, Math.min(count, pl.pips[0] ?? 0))
  pl.pips[0] -= n
  return n
}

/** add up to `count` pips, capped (any type: one meter); returns how many were added */
export function gain(pl: PlayerState, _types: readonly EnergyType[], _type: string, count: number): number {
  const n = Math.max(0, Math.min(count, ENERGY_CAP - (pl.pips[0] ?? 0)))
  pl.pips[0] += n
  return n
}

/** legacy (v1 typed meters): the three most-needed typed energies across the team's attacks, ties to the lead's
 * type. Matches ignore it; PlayerDef.energy still carries it for older loadouts */
export function defaultEnergy(team: readonly FighterKit[]): EnergyType[] {
  const need = new Map<string, number>()
  const lead = team[0]?.types[0] ?? 'Colorless'
  for (const k of team) {
    for (const a of k.attacks) {
      for (const c of a.cost) if (c !== 'Colorless') need.set(c, (need.get(c) ?? 0) + 1)
    }
    for (const t of k.types) if (t !== 'Colorless') need.set(t, (need.get(t) ?? 0) + 0.5)
  }
  const ranked = [...need.entries()].sort((a, b) => b[1] - a[1] || (a[0] === lead ? -1 : b[0] === lead ? 1 : a[0] < b[0] ? -1 : 1))
  const out: EnergyType[] = []
  for (const [t] of ranked) if (out.length < 3) out.push(t as EnergyType)
  if (out.length === 0) out.push('Colorless')
  while (out.length < 3) out.push(out[0])
  return out
}
