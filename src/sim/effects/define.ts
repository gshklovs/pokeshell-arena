// The effect-primitive contract (docs/SPEC.md section 7). One op per file in ./ops/, each `export default defineOp(...)`.
// This file imports nothing from the registry, so ops can't form an import cycle with it.
import type { Effect, EnergyType, MatchDef, SimState } from '../types'

/** the attack an effect belongs to */
export interface CastInfo {
  player: number
  attack: number
  element: EnergyType
  /** extra damage for this cast (coin bonuses, per-energy bonuses); `damage` adds it */
  bonus: number
  /** a damage scale for this hit, permille (a split shot's shard); absent = 1000 */
  scale?: number
  /** set by `fizzle` in onCast: the attack does nothing (no shape is spawned; the energy stays paid) */
  fizzle?: boolean
  /** the attack damage the last `damage` op dealt to this target (for `drain`, `bounty`) */
  dealt?: number
}

/** everything an op may touch. `x`, `y` are the point in sub-pixels (the hit or impact point, or the caster) */
export interface EffectCtx {
  def: MatchDef
  s: SimState
  caster: number
  /** the player hit, or -1 (onCast / onImpact) */
  target: number
  x: number
  y: number
  cast: CastInfo
  /** run a nested effect list with this context (coin, chance, coins) */
  run(list: Effect[] | undefined): void
}

export interface OpDef<P extends Effect = Effect> {
  op: string
  /** problems with the params, [] when fine. `sub` validates a nested effect list */
  validate(p: P, sub: (list: unknown, where: string) => string[]): string[]
  apply(ctx: EffectCtx, p: P): void
}

export function defineOp<P extends Effect>(d: OpDef<P>): OpDef<P> {
  return d
}

// ------------------------------------------------------------------ param checks for validate()
export function int(p: Effect, key: string, opt: { min?: number; max?: number; optional?: boolean } = {}): string[] {
  const v = p[key]
  if (v === undefined) return opt.optional ? [] : [`${p.op}.${key}: missing`]
  if (!Number.isInteger(v)) return [`${p.op}.${key}: must be an integer`]
  const n = v as number
  if (opt.min !== undefined && n < opt.min) return [`${p.op}.${key}: ${n} < ${opt.min}`]
  if (opt.max !== undefined && n > opt.max) return [`${p.op}.${key}: ${n} > ${opt.max}`]
  return []
}

export function oneOf(p: Effect, key: string, values: readonly string[], optional = false): string[] {
  const v = p[key]
  if (v === undefined) return optional ? [] : [`${p.op}.${key}: missing`]
  return values.includes(v as string) ? [] : [`${p.op}.${key}: ${JSON.stringify(v)} is not one of ${values.join(', ')}`]
}

export const TARGETS = ['target', 'self'] as const

/** the player an op aims at: `target: "self"` or the hit target (falls back to the caster when there is none) */
export function who(ctx: EffectCtx, p: Effect, dflt: 'target' | 'self'): number {
  const t = (p.target as string | undefined) ?? dflt
  if (t === 'self') return ctx.caster
  return ctx.target
}
