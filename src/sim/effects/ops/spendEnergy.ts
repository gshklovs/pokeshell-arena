// spendEnergy {max, amount, type?, paid?}: discards up to `max` unspent pips (after paying) and this cast does
// `amount` more damage per pip discarded ("You may discard any amount of Fire Energy ... 50 more damage for each"; one
// meter: the type is ignored). paid: 1 counts the pips that paid for the attack as discarded too (up to `max`), then
// spends the rest: energy discarded "from your Pokémon" includes the energy the attack was paid with (in the TCG it is
// still attached), and bots and players alike fire as soon as they can pay, so the leftover alone was nearly always 0.
// Use it in onCast.
import { kitOf } from '../../combat'
import { defineOp, int, oneOf } from '../define'
import { ANY_TYPE, losePips } from '../pips'

export default defineOp({
  op: 'spendEnergy',
  validate: (p) => [
    ...oneOf(p, 'type', ANY_TYPE, true), ...int(p, 'max', { min: 1, max: 15 }), ...int(p, 'amount', { min: 1, max: 1000 }),
    ...int(p, 'paid', { min: 0, max: 1, optional: true }),
  ],
  apply: (ctx, p) => {
    const max = p.max as number
    const paid = p.paid ? Math.min(max, kitOf(ctx.def, ctx.s, ctx.caster)?.attacks[ctx.cast.attack]?.cost.length ?? 0) : 0
    ctx.cast.bonus += (paid + losePips(ctx.s, ctx.caster, max - paid)) * (p.amount as number)
  },
})
