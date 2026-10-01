// energyJam {ticks, target?="target"}: the target's meters stop filling for `ticks` (each meter's progress goes
// negative; at most 3 TURNs of jam stack). "Energy can't be attached to the Defending Pokémon", "attacks cost more",
// "your opponent can't play Items", milling their deck: they get their next pips later.
import { TURN } from '../../rules'
import { TARGETS, defineOp, int, oneOf } from '../define'
import { foeOf } from '../facts'

export default defineOp({
  op: 'energyJam',
  validate: (p) => [...int(p, 'ticks', { min: 1, max: 3 * TURN }), ...oneOf(p, 'target', TARGETS, true)],
  apply: (ctx, p) => {
    const t = p.target === 'self' ? ctx.caster : ctx.target >= 0 ? ctx.target : foeOf(ctx.s, ctx.caster)
    if (t < 0) return
    const pl = ctx.s.players[t]
    for (let i = 0; i < pl.fill.length; i++) pl.fill[i] = Math.max(-3 * TURN, Math.min(pl.fill[i], 0) - (p.ticks as number))
  },
})
