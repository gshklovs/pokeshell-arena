// mimic {wr?=true}: Metronome. Attack damage equal to the target's hardest-hitting printed attack (its base damage;
// the copied attack's other effects don't come along). Replaces a `damage` op: use it with printed damage "".
import { attackDamage, kitOf } from '../../combat'
import { defineOp } from '../define'

export default defineOp({
  op: 'mimic',
  validate: (p) => (p.wr !== undefined && typeof p.wr !== 'boolean' ? ['mimic.wr: true or false'] : []),
  apply: (ctx, p) => {
    if (ctx.target < 0) return
    const kit = kitOf(ctx.def, ctx.s, ctx.target)
    if (!kit) return
    let best = 0
    for (const a of kit.attacks) best = Math.max(best, a.baseDamage)
    attackDamage(ctx, best, p.wr !== false)
  },
})
