// pull {px, ticks?=8}: pulls the target toward the caster (not a target in Fighting armour or a steady Metal one)
import { armored, kitOf, onField, shove } from '../../combat'
import { defineOp, int } from '../define'

export default defineOp({
  op: 'pull',
  validate: (p) => [...int(p, 'px', { min: 1, max: 600 }), ...int(p, 'ticks', { min: 1, max: 60, optional: true })],
  apply: (ctx, p) => {
    const c = onField(ctx.s, ctx.caster)
    if (ctx.target < 0 || !c) return
    // Fighting armour (winding up a Fighting attack) and Metal's steady footing: not moved
    const tk = kitOf(ctx.def, ctx.s, ctx.target), tf = onField(ctx.s, ctx.target)
    if (tk && tf && (armored(tk, tf) || tk.move?.noKnockback)) return
    shove(ctx.s, ctx.target, c.x, c.y, -(p.px as number), (p.ticks as number) ?? 8)
  },
})
