// coinsUntilTails {perHeads, max?=10}: "flip a coin until you get tails", perHeads runs once per heads (at most
// `max` flips, so a lucky streak stays bounded)
import { flip } from '../../rng'
import { defineOp, int } from '../define'

export default defineOp({
  op: 'coinsUntilTails',
  validate: (p, sub) => [...int(p, 'max', { min: 1, max: 20, optional: true }), ...(p.perHeads === undefined ? ['coinsUntilTails.perHeads: missing'] : sub(p.perHeads, 'perHeads'))],
  apply: (ctx, p) => {
    const max = (p.max as number | undefined) ?? 10
    for (let i = 0; i < max; i++) {
      const heads = flip(ctx.s)
      ctx.s.events.push({ k: 'coin', p: ctx.caster, heads })
      if (!heads) break
      ctx.run(p.perHeads as never)
    }
  },
})
