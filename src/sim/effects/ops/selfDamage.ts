// selfDamage {amount}: damage to the caster, no weakness/resistance ("Pikachu does 10 damage to itself"), scaled by
// rules.SELF_DAMAGE_PERMILLE (recoil is the one number the damage curve never compressed: it took the full printed
// amount while its hit was curved). rules.selfDamageOf gives the real amount (explain shows it)
import { hurt } from '../../combat'
import { selfDamageOf } from '../../rules'
import { defineOp, int } from '../define'

export default defineOp({
  op: 'selfDamage',
  validate: (p) => int(p, 'amount', { min: 1 }),
  apply: (ctx, p) => { hurt(ctx.s, ctx.caster, selfDamageOf(p.amount as number)) },
})
