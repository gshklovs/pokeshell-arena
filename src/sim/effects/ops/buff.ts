// buff {stat: damage|speed|defense, amount, ticks, target?="self"}
//   damage: +amount attack damage; speed: +amount permille move speed; defense: -amount incoming attack damage
import { onField } from '../../combat'
import { TARGETS, defineOp, int, oneOf, who } from '../define'

export default defineOp({
  op: 'buff',
  validate: (p) => [...oneOf(p, 'stat', ['damage', 'speed', 'defense']), ...int(p, 'amount', { min: -1000, max: 1000 }), ...int(p, 'ticks', { min: 1 }), ...oneOf(p, 'target', TARGETS, true)],
  apply: (ctx, p) => {
    const t = who(ctx, p, 'self')
    const f = t >= 0 ? onField(ctx.s, t) : null
    if (f) f.buffs.push({ stat: p.stat as string, amount: p.amount as number, t: p.ticks as number })
  },
})
