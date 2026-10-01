// execute {hp}: if the target has `hp` HP or less left, it is Knocked Out ("Knock Out 1 of your opponent's Pokémon
// that has 30 HP or less remaining"; Lost Impact-style "is Knocked Out" = a large hp, usually behind `when`)
import { hurt, onField } from '../../combat'
import { defineOp, int } from '../define'

export default defineOp({
  op: 'execute',
  validate: (p) => int(p, 'hp', { min: 1, max: 100000 }),
  apply: (ctx, p) => {
    const t = ctx.target
    const f = t >= 0 ? onField(ctx.s, t) : null
    if (!f || f.invuln > 0) return
    const pl = ctx.s.players[t]
    const m = pl.members[pl.active]
    if (m.hp <= (p.hp as number)) hurt(ctx.s, t, m.hp)
  },
})
