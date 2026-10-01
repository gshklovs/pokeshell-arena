// damage {amount, wr?=true, pierce?=false}: attack damage to the target (cast bonus, buffs, weakness/resistance,
// shields apply).
//   wr: true | false | "weakness" | "resistance": which of the two apply ("isn't affected by Resistance" = "weakness")
//   pierce: ignore shields and defense buffs on the target ("isn't affected by any effects on the Defending Pokémon")
import { attackDamage, type WR } from '../../combat'
import { defineOp, int } from '../define'

const WRS = [true, false, 'weakness', 'resistance', 'both', 'none']

export default defineOp({
  op: 'damage',
  validate: (p) => [
    ...int(p, 'amount', { min: 0 }),
    ...(p.wr !== undefined && !WRS.includes(p.wr as never) ? ['damage.wr: true, false, "weakness" or "resistance"'] : []),
    ...(p.pierce !== undefined && typeof p.pierce !== 'boolean' ? ['damage.pierce: true or false'] : []),
  ],
  apply: (ctx, p) => { attackDamage(ctx, p.amount as number, (p.wr as boolean | WR | undefined) ?? true, p.pierce === true) },
})
