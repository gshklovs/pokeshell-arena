// blind {ticks, permille?=500, target?="target"}: Smokescreen / Sand-Attack. "If the Defending Pokémon tries to
// attack, your opponent flips a coin. If tails, that attack does nothing": each attack it releases within `ticks`
// misses outright with this chance (shapes.release rolls it).
import { onField } from '../../combat'
import { TARGETS, defineOp, int, oneOf, who } from '../define'

export default defineOp({
  op: 'blind',
  validate: (p) => [...int(p, 'ticks', { min: 1, max: 900 }), ...int(p, 'permille', { min: 1, max: 1000, optional: true }), ...oneOf(p, 'target', TARGETS, true)],
  apply: (ctx, p) => {
    const t = who(ctx, p, 'target')
    const f = t >= 0 ? onField(ctx.s, t) : null
    if (!f || f.invuln > 0) return
    f.buffs = f.buffs.filter((b) => b.stat !== 'blind')
    f.buffs.push({ stat: 'blind', amount: (p.permille as number | undefined) ?? 500, t: p.ticks as number })
  },
})
