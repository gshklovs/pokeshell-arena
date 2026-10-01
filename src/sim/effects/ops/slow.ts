// slow {permille, ticks, target?="target"}: move speed x (1000 - permille) / 1000
import { onField } from '../../combat'
import { TARGETS, defineOp, int, oneOf, who } from '../define'

export default defineOp({
  op: 'slow',
  validate: (p) => [...int(p, 'permille', { min: 1, max: 1000 }), ...int(p, 'ticks', { min: 1 }), ...oneOf(p, 'target', TARGETS, true)],
  apply: (ctx, p) => {
    const t = who(ctx, p, 'target')
    const f = t >= 0 ? onField(ctx.s, t) : null
    if (!f || f.invuln > 0) return
    const permille = p.permille as number, ticks = p.ticks as number
    if (!f.slow || f.slow.permille <= permille) f.slow = { permille, t: Math.max(ticks, f.slow?.t ?? 0) }
  },
})
