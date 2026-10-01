// bonus {amount}: this cast does `amount` more damage (Leaf Blade "90+": coin heads -> bonus 60). Use it in onCast,
// so every hit of the cast carries it and weakness/resistance apply once to the total.
import { defineOp, int } from '../define'

export default defineOp({
  op: 'bonus',
  validate: (p) => int(p, 'amount', { min: -1000, max: 1000 }),
  apply: (ctx, p) => { ctx.cast.bonus += p.amount as number },
})
