// retreat {px?=160}: "You may switch this Pokémon with 1 of your Benched Pokémon". The caster leaps `px` back
// (away from its aim) with a few invulnerable ticks, and its swap cooldown resets (team mode: the retreat is ready).
import { onField } from '../../combat'
import { FP, ONE, icos, idiv, isin } from '../../fixed'
import { defineOp, int } from '../define'

const TICKS = 10

export default defineOp({
  op: 'retreat',
  validate: (p) => int(p, 'px', { min: 1, max: 600, optional: true }),
  apply: (ctx, p) => {
    const f = onField(ctx.s, ctx.caster)
    if (!f) return
    const total = ((p.px as number | undefined) ?? 160) * FP
    f.knock = { vx: -idiv(idiv(icos(f.aim) * total, ONE), TICKS), vy: -idiv(idiv(isin(f.aim) * total, ONE), TICKS), t: TICKS }
    f.invuln = Math.max(f.invuln, TICKS)
    ctx.s.players[ctx.caster].swapCd = 0
  },
})
