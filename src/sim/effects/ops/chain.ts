// chain {permille, radius?=160}: the Lightning flavour. After a hit, the bolt arcs on: another foe on the field within
// `radius` px of the target takes `permille` of the damage just dealt, and a target standing in (or touching) water
// or electrified water takes that much again (damage counters: no W/R). Put it after `damage` in onHit.
import { hurt, onField } from '../../combat'
import { FP } from '../../fixed'
import { circleTouches, isWater } from '../../terrain'
import { defineOp, int } from '../define'

export default defineOp({
  op: 'chain',
  validate: (p) => [...int(p, 'permille', { min: 1, max: 1000 }), ...int(p, 'radius', { min: 1, max: 600, optional: true })],
  apply: (ctx, p) => {
    const dealt = ctx.cast.dealt ?? 0
    const t = ctx.target
    const tf = t >= 0 ? onField(ctx.s, t) : null
    if (dealt <= 0 || !tf) return
    const arc = Math.trunc((dealt * (p.permille as number)) / 1000)
    if (arc <= 0) return
    const s = ctx.s
    if (circleTouches(s, tf.x, tf.y, tf.r, (i) => isWater(s, i) || s.shock[i] > 0)) hurt(s, t, arc)
    const r = ((p.radius as number | undefined) ?? 160) * FP
    const team = s.players[ctx.caster].team
    for (let i = 0; i < s.players.length; i++) {
      if (i === t || s.players[i].team === team) continue
      const f = onField(s, i)
      if (!f || f.invuln > 0) continue
      const dx = f.x - tf.x, dy = f.y - tf.y
      if (dx * dx + dy * dy <= r * r) hurt(s, i, arc)
    }
  },
})
