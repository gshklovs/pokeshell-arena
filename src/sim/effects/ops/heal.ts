// heal {amount, target?="self"}: removes damage, capped at max HP.
//   target "team": the caster's active and every benched Pokémon ("Heal 30 damage from each of your Pokémon")
import { heal } from '../../combat'
import { defineOp, int, oneOf, who } from '../define'

export default defineOp({
  op: 'heal',
  validate: (p) => [...int(p, 'amount', { min: 1 }), ...oneOf(p, 'target', ['target', 'self', 'team'], true)],
  apply: (ctx, p) => {
    const amount = p.amount as number
    if (p.target === 'team') {
      const pl = ctx.s.players[ctx.caster]
      pl.members.forEach((m, i) => { if (i !== pl.active && !m.ko) m.hp = Math.min(m.maxHp, m.hp + amount) })
      heal(ctx.s, ctx.caster, amount)
      return
    }
    const t = who(ctx, p, 'self')
    if (t >= 0) heal(ctx.s, t, amount)
  },
})
