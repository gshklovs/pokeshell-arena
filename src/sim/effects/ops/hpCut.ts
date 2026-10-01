// hpCut {permille}: damage counters equal to a share of the target's remaining HP, rounded up to 10 (Super Fang:
// "half the Defending Pokémon's remaining HP" = 500). No weakness/resistance, no shields.
import { hurt, onField } from '../../combat'
import { defineOp, int } from '../define'

export default defineOp({
  op: 'hpCut',
  validate: (p) => int(p, 'permille', { min: 1, max: 1000 }),
  apply: (ctx, p) => {
    const t = ctx.target
    const f = t >= 0 ? onField(ctx.s, t) : null
    if (!f || f.invuln > 0) return
    const pl = ctx.s.players[t]
    const hp = pl.members[pl.active].hp
    hurt(ctx.s, t, Math.ceil((hp * (p.permille as number)) / 10000) * 10)
  },
})
