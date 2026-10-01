// shield {amount?=all, ticks, target?="self"}: prevents up to `amount` attack damage for `ticks`
// (Withdraw: "prevent all damage done to Squirtle during your opponent's next turn" = all, 1 TURN)
import { onField } from '../../combat'
import { TARGETS, defineOp, int, oneOf, who } from '../define'

export default defineOp({
  op: 'shield',
  validate: (p) => [...int(p, 'amount', { min: 1, optional: true }), ...int(p, 'ticks', { min: 1 }), ...oneOf(p, 'target', TARGETS, true)],
  apply: (ctx, p) => {
    const t = who(ctx, p, 'self')
    const f = t >= 0 ? onField(ctx.s, t) : null
    if (!f) return
    f.shield = { amount: (p.amount as number) ?? 100000, t: p.ticks as number }
  },
})
