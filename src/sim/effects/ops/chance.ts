// chance {permille, then: [...], else?: [...]}: a weighted roll from the sim PRNG
import { roll } from '../../rng'
import { defineOp, int } from '../define'

export default defineOp({
  op: 'chance',
  validate: (p, sub) => [...int(p, 'permille', { min: 0, max: 1000 }), ...(p.then === undefined ? ['chance.then: missing'] : sub(p.then, 'then')), ...sub(p.else, 'else')],
  apply: (ctx, p) => { ctx.run((roll(ctx.s, p.permille as number) ? p.then : p.else) as never) },
})
