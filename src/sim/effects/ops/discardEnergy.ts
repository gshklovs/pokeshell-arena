// discardEnergy {count, target?="self", type?}: removes pips after paying (one meter: the type is ignored).
//   self: "Discard an Energy from this Pokémon" (count 15 = all).
//   target: "Discard an Energy from your opponent's Active Pokémon" (and hand disruption: their hand = their pips).
import { TARGETS, defineOp, int, oneOf } from '../define'
import { foeOf } from '../facts'
import { ANY_TYPE, losePips } from '../pips'

export default defineOp({
  op: 'discardEnergy',
  validate: (p) => [...int(p, 'count', { min: 1, max: 15 }), ...oneOf(p, 'type', ANY_TYPE, true), ...oneOf(p, 'target', TARGETS, true)],
  apply: (ctx, p) => {
    const t = p.target === 'target' ? (ctx.target >= 0 ? ctx.target : foeOf(ctx.s, ctx.caster)) : ctx.caster
    if (t >= 0) losePips(ctx.s, t, p.count as number)
  },
})
