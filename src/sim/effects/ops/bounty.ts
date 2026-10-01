// bounty {prizes}: "If your opponent's Pokémon is Knocked Out by damage from this attack, take 1 more Prize card".
// The arena has no prizes (a match is won by full team elimination), so the bigger reward for the KO is tempo: the
// caster gains 2 pips per extra prize. Put it after `damage` in onHit; it fires when the target's active is at 0 HP
// (the KO lands this tick) and this cast dealt damage.
import { defineOp, int } from '../define'
import { gainPips } from '../pips'

export default defineOp({
  op: 'bounty',
  validate: (p) => int(p, 'prizes', { min: 1, max: 3 }),
  apply: (ctx, p) => {
    const t = ctx.target
    if (t < 0) return
    const pl = ctx.s.players[t]
    if (pl.active < 0) return
    const m = pl.members[pl.active]
    if (!m.ko && m.hp === 0 && (ctx.cast.dealt ?? 0) > 0) gainPips(ctx.s, ctx.caster, 2 * (p.prizes as number))
  },
})
