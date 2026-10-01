// paint {terrain: water|fire|shock|none, radius, ticks?}: paints surface tiles around the point
import { paint, type Paint } from '../../terrain'
import { defineOp, int, oneOf } from '../define'

export default defineOp({
  op: 'paint',
  validate: (p) => [...oneOf(p, 'terrain', ['water', 'fire', 'shock', 'none']), ...int(p, 'radius', { min: 1, max: 600 }), ...int(p, 'ticks', { min: 1, optional: true })],
  apply: (ctx, p) => { paint(ctx.s, ctx.x, ctx.y, p.radius as number, p.terrain as Paint, p.ticks as number | undefined) },
})
