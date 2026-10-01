// bonusPerEnergy {amount, max, type?}: this cast does `amount` more damage per unspent pip, up to `max` pips
// (Hydro Pump: "10 more damage for each Water Energy ... not used to pay"; one meter: the type is ignored).
// Use it in onCast. (`bonusPer` with per "myEnergy" is the general form.)
import { defineOp, int, oneOf } from '../define'
import { ANY_TYPE, pipTotal } from '../pips'

export default defineOp({
  op: 'bonusPerEnergy',
  validate: (p) => [...oneOf(p, 'type', ANY_TYPE, true), ...int(p, 'amount', { min: 1 }), ...int(p, 'max', { min: 1, max: 15 })],
  apply: (ctx, p) => { ctx.cast.bonus += Math.min(pipTotal(ctx.s, ctx.caster), p.max as number) * (p.amount as number) },
})
