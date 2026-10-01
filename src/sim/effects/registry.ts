// The effect-primitive registry: every ./ops/<op>.ts (not its test) is registered, in sorted path order.
// Adding a primitive = adding one file there (plus its test). docs/SPEC.md section 7.
import type { Effect } from '../types'
import type { EffectCtx, OpDef } from './define'

const mods = import.meta.glob<{ default: OpDef }>(['./ops/*.ts', '!./ops/*.test.ts'], { eager: true })

export const OPS: Readonly<Record<string, OpDef>> = (() => {
  const out: Record<string, OpDef> = {}
  for (const path of Object.keys(mods).sort()) {
    const d = mods[path].default
    if (!d || typeof d.op !== 'string' || typeof d.apply !== 'function') throw new Error(`${path}: must export default defineOp({op, validate, apply})`)
    const file = path.replace(/^.*\//, '').replace(/\.ts$/, '')
    if (file !== d.op) throw new Error(`${path}: op "${d.op}" must match its file name`)
    if (out[d.op]) throw new Error(`effect op "${d.op}" registered twice`)
    out[d.op] = d
  }
  return out
})()

export function opNames(): string[] {
  return Object.keys(OPS)
}

/** run an effect list (ops were validated at kit load; an unknown op is skipped) */
export function runEffects(ctx: EffectCtx, list: Effect[] | undefined): void {
  if (!list) return
  for (const e of list) {
    const d = OPS[e.op]
    if (d) d.apply(ctx, e)
  }
}

/** every problem in an effect list, with `where` as the path prefix */
export function validateEffects(list: unknown, where: string): string[] {
  if (list === undefined) return []
  if (!Array.isArray(list)) return [`${where}: must be a list of effects`]
  const errs: string[] = []
  list.forEach((e, i) => {
    const at = `${where}[${i}]`
    if (!e || typeof e !== 'object' || typeof (e as Effect).op !== 'string') { errs.push(`${at}: an effect needs an "op"`); return }
    const d = OPS[(e as Effect).op]
    if (!d) { errs.push(`${at}: unknown op "${(e as Effect).op}" (known: ${opNames().join(', ')})`); return }
    for (const m of d.validate(e as Effect, validateEffects)) errs.push(`${at}: ${m}`)
  })
  return errs
}
