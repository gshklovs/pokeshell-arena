// retreatLock {ticks, target?="target"}: "the Defending Pokémon can't retreat". It can't swap out (team mode) and
// can't dodge-roll (the 1v1 way to get away) for `ticks`.
import { onField } from '../../combat'
import { TARGETS, defineOp, int, oneOf, who } from '../define'

export default defineOp({
  op: 'retreatLock',
  validate: (p) => [...int(p, 'ticks', { min: 1, max: 900 }), ...oneOf(p, 'target', TARGETS, true)],
  apply: (ctx, p) => {
    const t = who(ctx, p, 'target')
    const f = t >= 0 ? onField(ctx.s, t) : null
    if (!f || (t !== ctx.caster && f.invuln > 0)) return
    const ticks = p.ticks as number
    const pl = ctx.s.players[t]
    pl.swapCd = Math.max(pl.swapCd, ticks)
    f.dodgeCd = Math.max(f.dodgeCd, ticks)
  },
})
