// counters {amount, target?="target"}: put damage counters (amount = HP, 10 per counter) on a Pokémon. Not attack
// damage: no weakness/resistance, no shields or defense buffs. With no target it lands on the caster's first foe
// ("Put 6 damage counters on your opponent's Pokémon in any way you like")
import { hurt, onField } from '../../combat'
import { TARGETS, defineOp, int, oneOf } from '../define'
import { foeOf } from '../facts'

export default defineOp({
  op: 'counters',
  validate: (p) => [...int(p, 'amount', { min: 1, max: 10000 }), ...oneOf(p, 'target', TARGETS, true)],
  apply: (ctx, p) => {
    const t = p.target === 'self' ? ctx.caster : ctx.target >= 0 ? ctx.target : foeOf(ctx.s, ctx.caster)
    const f = t >= 0 ? onField(ctx.s, t) : null
    if (!f || (t !== ctx.caster && f.invuln > 0)) return
    hurt(ctx.s, t, p.amount as number)
  },
})
