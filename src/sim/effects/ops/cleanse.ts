// cleanse {target?="self"}: the Pokémon recovers from all special conditions ("This Pokémon recovers from all
// Special Conditions"; target: "Then, that Pokémon recovers" after a bonus that read them)
import { clearStatus, onField } from '../../combat'
import { TARGETS, defineOp, oneOf, who } from '../define'

export default defineOp({
  op: 'cleanse',
  validate: (p) => oneOf(p, 'target', TARGETS, true),
  apply: (ctx, p) => {
    const t = who(ctx, p, 'self')
    const f = t >= 0 ? onField(ctx.s, t) : null
    if (f) clearStatus(f)
  },
})
