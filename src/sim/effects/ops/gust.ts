// gust {mode?="pull", px?=140}: "Switch 1 of your opponent's Benched Pokémon with their Active Pokémon".
//   Team mode, with a benched Pokémon: a forced swap. "pull" drags in their most damaged benched Pokémon (you
//   choose: the one closest to a KO); "push" sends in their next benched one (they choose). The new active keeps the
//   old one's spot, with no invulnerability; its conditions are gone (it just switched in).
//   1v1 (or an empty Bench): "pull" yanks the target `px` toward the caster, "push" shoves it `px` away.
import { onField, shove } from '../../combat'
import { newFighter } from '../../state'
import { defineOp, int, oneOf } from '../define'

export default defineOp({
  op: 'gust',
  validate: (p) => [...oneOf(p, 'mode', ['pull', 'push'], true), ...int(p, 'px', { min: 1, max: 600, optional: true })],
  apply: (ctx, p) => {
    const { def, s } = ctx
    const t = ctx.target
    const f = t >= 0 ? onField(s, t) : null
    if (!f || f.invuln > 0) return
    const pull = p.mode !== 'push'
    const pl = s.players[t]
    let pick = -1
    if (def.mode !== '1v1') {
      pl.members.forEach((m, i) => {
        if (i === pl.active || m.ko) return
        if (pick < 0) { pick = i; return }
        if (pull && m.hp < pl.members[pick].hp) pick = i
      })
    }
    if (pick < 0) {
      const c = onField(s, ctx.caster)
      if (c) shove(s, t, c.x, c.y, pull ? -((p.px as number | undefined) ?? 140) : ((p.px as number | undefined) ?? 140), 10)
      return
    }
    const nf = newFighter(def.kits[pl.members[pick].kit], f.x, f.y, f.facing, s.tick)
    nf.aim = f.aim
    pl.active = pick
    pl.fighter = nf
    s.projectiles = s.projectiles.filter((x) => x.owner !== t)
    s.areas = s.areas.filter((x) => x.owner !== t)
    s.events.push({ k: 'swap', p: t, member: pick })
  },
})
