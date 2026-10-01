// coin {heads?: [...], tails?: [...]}: one coin flip from the sim PRNG
import { flip } from '../../rng'
import { defineOp } from '../define'

export default defineOp({
  op: 'coin',
  validate: (p, sub) => [
    ...(p.heads === undefined && p.tails === undefined ? ['coin: needs heads or tails'] : []),
    ...sub(p.heads, 'heads'), ...sub(p.tails, 'tails'),
  ],
  apply: (ctx, p) => {
    const heads = flip(ctx.s)
    ctx.s.events.push({ k: 'coin', p: ctx.caster, heads })
    ctx.run((heads ? p.heads : p.tails) as never)
  },
})
