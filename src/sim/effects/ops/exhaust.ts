// exhaust {ticks, target?="self", which?="all"}: attacks go on cooldown for at least `ticks`.
//   self, all:    "During your next turn, this Pokémon can't attack" (1 TURN)
//   self, this:   "During your next turn, this Pokémon can't use <this attack>"
//   target, all:  "The Defending Pokémon can't attack during your opponent's next turn"
//   target, best: "Choose 1 of the Defending Pokémon's attacks; it can't use it" (its most expensive one)
import { kitOf, onField } from '../../combat'
import { TARGETS, defineOp, int, oneOf, who } from '../define'

export default defineOp({
  op: 'exhaust',
  validate: (p) => [...int(p, 'ticks', { min: 1, max: 900 }), ...oneOf(p, 'target', TARGETS, true), ...oneOf(p, 'which', ['all', 'this', 'best'], true)],
  apply: (ctx, p) => {
    const t = who(ctx, p, 'self')
    const f = t >= 0 ? onField(ctx.s, t) : null
    const kit = t >= 0 ? kitOf(ctx.def, ctx.s, t) : null
    if (!f || !kit || (t !== ctx.caster && f.invuln > 0)) return
    const ticks = p.ticks as number
    const which = (p.which as string | undefined) ?? 'all'
    let only = -1
    if (which === 'this') only = t === ctx.caster ? ctx.cast.attack : -1
    if (which === 'best') kit.attacks.forEach((a, i) => { if (only < 0 || a.cost.length > kit.attacks[only].cost.length) only = i })
    for (let i = 0; i < f.cooldowns.length; i++) if (only < 0 || i === only) f.cooldowns[i] = Math.max(f.cooldowns[i], ticks)
  },
})
