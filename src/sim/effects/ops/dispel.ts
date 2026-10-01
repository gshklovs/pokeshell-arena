// dispel {target?="target"}: strips shields and buffs ("discard all Pokémon Tools from your opponent's Active
// Pokémon", "Discard a Special Energy": the tools of the arena are its buffs). Debuffs the caster put on it stay:
// only helpful ones (a shield, positive damage / speed / defense, thorns) are removed.
import { onField } from '../../combat'
import { TARGETS, defineOp, oneOf, who } from '../define'

export default defineOp({
  op: 'dispel',
  validate: (p) => oneOf(p, 'target', TARGETS, true),
  apply: (ctx, p) => {
    const t = who(ctx, p, 'target')
    const f = t >= 0 ? onField(ctx.s, t) : null
    if (!f) return
    f.shield = null
    f.buffs = f.buffs.filter((b) => b.amount < 0 || b.stat === 'blind')
  },
})
