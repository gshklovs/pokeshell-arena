// gainEnergy {count, type?}: adds pips to the caster's meter, capped (one meter: the type is ignored).
// "Search your deck for an Energy and attach it", "Draw 2 cards" (a draw is a pip: cards become options)
import { defineOp, int, oneOf } from '../define'
import { ANY_TYPE, gainPips } from '../pips'

export default defineOp({
  op: 'gainEnergy',
  validate: (p) => [...int(p, 'count', { min: 1, max: 15 }), ...oneOf(p, 'type', ANY_TYPE, true)],
  apply: (ctx, p) => { gainPips(ctx.s, ctx.caster, p.count as number) },
})
