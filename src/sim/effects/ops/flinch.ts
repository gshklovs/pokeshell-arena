// flinch {ticks, interrupt?=false, target?="target"}: the target reels (no walking, no attack start, no dodge) for
// `ticks`; `interrupt` also breaks a windup in progress (its energy stays spent). Armour shrugs it off, and a fighter
// just out of a flinch is immune for a moment (melee.ts: no stunlock)
import { flinch } from '../../melee'
import { TARGETS, defineOp, int, oneOf, who } from '../define'

export default defineOp({
  op: 'flinch',
  validate: (p) => [
    ...int(p, 'ticks', { min: 1, max: 60 }), ...oneOf(p, 'target', TARGETS, true),
    ...(p.interrupt === undefined || typeof p.interrupt === 'boolean' ? [] : ['flinch.interrupt: true or false']),
  ],
  apply: (ctx, p) => {
    const t = who(ctx, p, 'target')
    if (t < 0) return
    flinch(ctx.def, ctx.s, t, p.ticks as number, p.interrupt === true)
  },
})
