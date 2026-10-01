// fizzle {}: the attack does nothing ("If tails, this attack does nothing"). In onCast it cancels the shape (the
// energy stays paid, the cooldown runs); later effects in the same list still run, so put it last or inside a coin.
import { defineOp } from '../define'

export default defineOp({
  op: 'fizzle',
  validate: () => [],
  apply: (ctx) => { ctx.cast.fizzle = true },
})
