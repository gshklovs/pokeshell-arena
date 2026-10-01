// coins {count, perHeads: [...]}: "flip N coins, X for each heads" (perHeads runs once per heads)
import { flip } from '../../rng'
import { defineOp, int } from '../define'

export default defineOp({
  op: 'coins',
  validate: (p, sub) => [...int(p, 'count', { min: 1, max: 20 }), ...(p.perHeads === undefined ? ['coins.perHeads: missing'] : sub(p.perHeads, 'perHeads'))],
  apply: (ctx, p) => {
    for (let i = 0; i < (p.count as number); i++) {
      const heads = flip(ctx.s)
      ctx.s.events.push({ k: 'coin', p: ctx.caster, heads })
      if (heads) ctx.run(p.perHeads as never)
    }
  },
})
