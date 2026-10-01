// drain {permille}: heals the caster by a share of the attack damage the last `damage` op dealt to this target,
// rounded up to 10 ("heal half the damage done"; Leech Life = 1000). Put it after `damage` in onHit.
import { heal } from '../../combat'
import { defineOp, int } from '../define'

export default defineOp({
  op: 'drain',
  validate: (p) => int(p, 'permille', { min: 1, max: 2000 }),
  apply: (ctx, p) => {
    const dealt = ctx.cast.dealt ?? 0
    if (dealt <= 0) return
    const n = Math.ceil((dealt * (p.permille as number)) / 10000) * 10
    heal(ctx.s, ctx.caster, n)
  },
})
