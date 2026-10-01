// when {cond, then, else?, kind?, type?, n?}: runs `then` if the condition holds, else `else` ("If ..., this attack
// does 60 more damage"; "You can use this attack only if ..." = else: [{op: "fizzle"}]).
//   selfDamaged / foeDamaged   the caster / the target has damage counters
//   selfHurt                   the caster took attack damage within rules.RECENT_TICKS ("damaged during your opponent's last turn")
//   allyKo                     one of the caster's Pokémon was KO'd within RECENT_TICKS
//   fresh / foeFresh           the caster / the target came onto the field within RECENT_TICKS ("moved from the Bench this turn")
//   foeStatus                  the target has a special condition; foeAsleep: it is Asleep
//   foeIs {kind}               the target's card is a kind: V, VMAX, VSTAR, GX, EX, ex, Basic, Evolution, Rule
//   hasEnergy {n?=1}           the caster has at least n unspent pips ("If this Pokémon has any Fire Energy attached")
//   foeEnergy {n?=1}           the target has at least n unspent pips
//   stadium                    the caster stands on a painted surface, tall grass or lava ("If you have a Stadium in play")
//   foeBuffed / selfBuffed     a shield or buff is on the target / caster ("has a Pokémon Tool attached")
//   usedVstar                  the caster's trainer has used their VSTAR Power
//   prizesLeft / foePrizesLeft {n}  the caster / the target needs at most n more prizes (facts.prizesLeft)
//   samePips / noPips          the caster's unspent pips equal the target's (both holding some) / are 0 (hands: pips)
//   late {n}                   the fight has lasted at least n TURNs (Lost Zone counts)
import { onField } from '../../combat'
import { defineOp, int, oneOf } from '../define'
import { conditions, damageCounters, foeOf, isKind, KINDS, prizesLeft, recent, onStadium, turnsElapsed } from '../facts'
import { ANY_TYPE, pipTotal } from '../pips'

export const CONDS = [
  'selfDamaged', 'foeDamaged', 'selfHurt', 'allyKo', 'fresh', 'foeFresh', 'foeStatus', 'foeAsleep', 'foeIs', 'hasEnergy',
  'foeEnergy', 'stadium', 'foeBuffed', 'selfBuffed', 'usedVstar', 'prizesLeft', 'foePrizesLeft', 'samePips', 'noPips', 'late',
] as const

export default defineOp({
  op: 'when',
  validate: (p, sub) => [
    ...oneOf(p, 'cond', CONDS),
    ...(p.cond === 'foeIs' ? oneOf(p, 'kind', KINDS) : []),
    ...oneOf(p, 'type', ANY_TYPE, true),
    ...int(p, 'n', { min: 0, max: 100, optional: true }),
    ...(p.then === undefined && p.else === undefined ? ['when: needs then or else'] : []),
    ...sub(p.then, 'then'), ...sub(p.else, 'else'),
  ],
  apply: (ctx, p) => {
    const { def, s } = ctx
    const me = ctx.caster
    const foe = ctx.target >= 0 ? ctx.target : foeOf(s, me)
    const n = (p.n as number | undefined) ?? 1
    const mf = onField(s, me)
    const ff = foe >= 0 ? onField(s, foe) : null
    let ok = false
    switch (p.cond) {
      case 'selfDamaged': ok = damageCounters(s, me) > 0; break
      case 'foeDamaged': ok = foe >= 0 && damageCounters(s, foe) > 0; break
      case 'selfHurt': ok = !!mf && recent(s, mf.hurtAt); break
      case 'allyKo': ok = recent(s, s.players[me].koAt); break
      case 'fresh': ok = !!mf && recent(s, mf.enteredAt); break
      case 'foeFresh': ok = !!ff && recent(s, ff.enteredAt); break
      case 'foeStatus': ok = foe >= 0 && conditions(s, foe) > 0; break
      case 'foeAsleep': ok = !!ff && ff.status.asleep > 0; break
      case 'foeIs': ok = foe >= 0 && isKind(def, s, foe, p.kind as string); break
      case 'hasEnergy': ok = pipTotal(s, me) >= n; break
      case 'foeEnergy': ok = foe >= 0 && pipTotal(s, foe) >= n; break
      case 'stadium': ok = onStadium(s, me); break
      case 'foeBuffed': ok = !!ff && (!!ff.shield || ff.buffs.length > 0); break
      case 'selfBuffed': ok = !!mf && (!!mf.shield || mf.buffs.length > 0); break
      case 'usedVstar': ok = s.players[me].usedOnce.includes('vstar'); break
      case 'prizesLeft': ok = prizesLeft(def, s, me) <= n; break
      case 'foePrizesLeft': ok = foe >= 0 && prizesLeft(def, s, foe) <= n; break
      // both at 0 doesn't count: on the one meter that is most of the fight (Noivern V's Synchro Loud won 90%+)
      case 'samePips': ok = foe >= 0 && pipTotal(s, me) > 0 && pipTotal(s, me) === pipTotal(s, foe); break
      case 'noPips': ok = pipTotal(s, me) === 0; break
      case 'late': ok = turnsElapsed(s) >= n; break
    }
    ctx.run((ok ? p.then : p.else) as never)
  },
})
