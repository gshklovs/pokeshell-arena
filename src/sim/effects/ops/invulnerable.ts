// invulnerable {ticks}: the caster ignores hits (attacks pass through, no effects)
import { onField } from '../../combat'
import { defineOp, int } from '../define'

export default defineOp({
  op: 'invulnerable',
  validate: (p) => int(p, 'ticks', { min: 1, max: 600 }),
  apply: (ctx, p) => {
    const f = onField(ctx.s, ctx.caster)
    if (f) f.invuln = Math.max(f.invuln, p.ticks as number)
  },
})
