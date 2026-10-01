// benchDamage {amount, count?=0 (all), side?="foe", radius?}: damage to benched Pokémon, no weakness/resistance.
//   Team mode: the target side's benched Pokémon (side "self": the caster's own bench). With no target (onCast /
//   onImpact) it hits the caster's first opponent's bench. Full elimination is fought in the arena: with
//   rules.BENCH_CAN_KO false (the default) bench damage can't Knock Out a benched Pokémon, it floors at
//   rules.BENCH_FLOOR_HP (10: damage counters, still alive; one already at or under 10 stays where it is). Each hit
//   emits a `bench` event (the "-30 to bench: Togepi" callout). BENCH_CAN_KO true: bench KOs count as knockouts.
//   1v1 (no Bench): a splash. Foes within `radius` px (default rules.SPLASH_RADIUS) of the point take `amount` once,
//   no W/R; the foe the attack hit directly takes rules.SPLASH_DIRECT_PERMILLE of it (the splash is for the Pokémon
//   around it: at full it doubled every bench attack in a 1v1). Side "self" in a 1v1 lands on the caster at half (the
//   drawback stays a drawback). The splash hits the Pokémon on the field, so it can KO (unchanged). It never splashes
//   through a wall: a foe out of sight of the point (terrain.inSight) is safe, the one hit directly aside.
import { hurt, onField } from '../../combat'
import { FP } from '../../fixed'
import { BENCH_CAN_KO, BENCH_FLOOR_HP, SPLASH_DIRECT_PERMILLE, SPLASH_RADIUS } from '../../rules'
import { inSight } from '../../terrain'
import { defineOp, int, oneOf } from '../define'

export default defineOp({
  op: 'benchDamage',
  validate: (p) => [
    ...int(p, 'amount', { min: 1 }), ...int(p, 'count', { min: 0, max: 5, optional: true }),
    ...oneOf(p, 'side', ['foe', 'self'], true), ...int(p, 'radius', { min: 1, max: 600, optional: true }),
  ],
  apply: (ctx, p) => {
    const s = ctx.s
    const amount = p.amount as number
    const own = p.side === 'self'
    if (ctx.def.mode === '1v1') {
      if (own) { hurt(s, ctx.caster, Math.trunc(amount / 20) * 10); return }
      const r = ((p.radius as number | undefined) ?? SPLASH_RADIUS) * FP
      const team = s.players[ctx.caster].team
      for (let i = 0; i < s.players.length; i++) {
        const f = s.players[i].team !== team ? onField(s, i) : null
        if (!f || f.invuln > 0) continue
        const dx = f.x - ctx.x, dy = f.y - ctx.y
        const rr = r + f.r * FP
        if (i !== ctx.target && !inSight(s, ctx.x, ctx.y, f.x, f.y)) continue
        if (dx * dx + dy * dy <= rr * rr) hurt(s, i, i === ctx.target ? Math.trunc((amount * SPLASH_DIRECT_PERMILLE) / 10000) * 10 : amount)
      }
      return
    }
    const t = own ? ctx.caster : ctx.target >= 0 ? ctx.target : s.players.findIndex((o) => o.team !== s.players[ctx.caster].team)
    if (t < 0) return
    const pl = s.players[t]
    let left = (p.count as number) || pl.members.length
    pl.members.forEach((m, i) => {
      if (i === pl.active || m.ko || left <= 0) return
      left--
      const hp = Math.max(BENCH_CAN_KO ? 0 : Math.min(m.hp, BENCH_FLOOR_HP), m.hp - amount)
      if (hp === m.hp) return
      s.events.push({ k: 'bench', p: t, member: i, amount: m.hp - hp })
      m.hp = hp
    })
  },
})
