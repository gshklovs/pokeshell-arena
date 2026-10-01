// thorns {amount?, permille?, ticks}: while it lasts, whoever deals attack damage to the caster takes `amount`
// (damage counters, "put 3 damage counters on the Attacking Pokémon") or `permille` of the damage dealt ("equal to
// the damage done to this Pokémon": 1000). One of the two.
import { onField } from '../../combat'
import { defineOp, int } from '../define'

export default defineOp({
  op: 'thorns',
  validate: (p) => [
    ...int(p, 'amount', { min: 1, max: 1000, optional: true }), ...int(p, 'permille', { min: 1, max: 2000, optional: true }),
    ...((p.amount === undefined) === (p.permille === undefined) ? ['thorns: exactly one of amount or permille'] : []),
    ...int(p, 'ticks', { min: 1, max: 900 }),
  ],
  apply: (ctx, p) => {
    const f = onField(ctx.s, ctx.caster)
    if (!f) return
    if (p.amount !== undefined) f.buffs.push({ stat: 'thorns', amount: p.amount as number, t: p.ticks as number })
    else f.buffs.push({ stat: 'reflect', amount: p.permille as number, t: p.ticks as number })
  },
})
