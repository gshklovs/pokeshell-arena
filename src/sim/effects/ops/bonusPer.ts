// bonusPer {per, amount, max?}: this cast does `amount` more damage for each unit of `per` (at most `max` units; with
// no `max` the total is capped at rules.BONUS_CAP). A negative amount is "N less damage for each".
// Use it in onCast (or onHit before `damage`, for per-target counts such as foeDamage).
//   myEnergy / foeEnergy / bothEnergy   unspent pips ("for each Energy attached"; one meter: a `type` is ignored);
//                                       bothEnergy counts the caster's like myAttached
//   myAttached                          the pips this attack cost plus the caster's unspent pips ("for each Energy
//                                       attached to this Pokémon": the energy that paid for it is attached too)
//   myDamage / foeDamage                damage counters on the caster / the target
//   myBench / foeBench / bothBench      benched Pokémon (a 1v1 counts rules.VIRTUAL_BENCH per side)
//   myPrizes / foePrizes                prizes the caster / the target has taken (1v1: facts.prizesTaken)
//   turns                               whole TURNs the fight has lasted ("for each card in your discard pile")
//   foeStatus                           special conditions on the target
//   hurt                                counters of the attack damage the caster took within RECENT_TICKS (Rage)
//   foeRetreat                          the target's retreat cost
//   myTypes                             distinct types across the caster's team (facts.teamTypes)
//   myPrizesLeft                        prizes the caster still needs ("for each of your remaining Prize cards")
import { onField, kitOf } from '../../combat'
import { BONUS_CAP } from '../../rules'
import { defineOp, int, oneOf } from '../define'
import { benchCount, conditions, damageCounters, foeOf, prizesLeft, prizesTaken, recent, teamTypes, turnsElapsed } from '../facts'
import { ANY_TYPE, pipTotal } from '../pips'

export const PER = [
  'myEnergy', 'foeEnergy', 'bothEnergy', 'myDamage', 'foeDamage', 'myBench', 'foeBench', 'bothBench', 'myPrizes', 'foePrizes',
  'turns', 'foeStatus', 'hurt', 'foeRetreat', 'myTypes', 'myPrizesLeft', 'myAttached',
] as const

export default defineOp({
  op: 'bonusPer',
  validate: (p) => [
    ...oneOf(p, 'per', PER), ...int(p, 'amount', { min: -1000, max: 1000 }), ...int(p, 'max', { min: 1, max: 50, optional: true }),
    ...oneOf(p, 'type', ANY_TYPE, true),
  ],
  apply: (ctx, p) => {
    const { def, s } = ctx
    const me = ctx.caster
    const foe = ctx.target >= 0 ? ctx.target : foeOf(s, me)
    let n = 0
    switch (p.per) {
      case 'myEnergy': n = pipTotal(s, me); break
      case 'myAttached': n = pipTotal(s, me) + (kitOf(def, s, me)?.attacks[ctx.cast.attack]?.cost.length ?? 0); break
      case 'foeEnergy': n = foe >= 0 ? pipTotal(s, foe) : 0; break
      // "attached to both Active Pokémon": yours counts what paid for this attack too (myAttached)
      case 'bothEnergy': n = pipTotal(s, me) + (kitOf(def, s, me)?.attacks[ctx.cast.attack]?.cost.length ?? 0) + (foe >= 0 ? pipTotal(s, foe) : 0); break
      case 'myDamage': n = damageCounters(s, me); break
      case 'foeDamage': n = foe >= 0 ? damageCounters(s, foe) : 0; break
      case 'myBench': n = benchCount(def, s, me); break
      case 'foeBench': n = foe >= 0 ? benchCount(def, s, foe) : 0; break
      case 'bothBench': n = benchCount(def, s, me) + (foe >= 0 ? benchCount(def, s, foe) : 0); break
      case 'myPrizes': n = prizesTaken(def, s, me); break
      case 'foePrizes': n = foe >= 0 ? prizesTaken(def, s, foe) : 0; break
      case 'turns': n = turnsElapsed(s); break
      case 'foeStatus': n = foe >= 0 ? conditions(s, foe) : 0; break
      case 'hurt': { const f = onField(s, me); n = f && recent(s, f.hurtAt) ? Math.trunc(f.hurtAmt / 10) : 0; break }
      case 'foeRetreat': n = foe >= 0 ? (kitOf(def, s, foe)?.retreat ?? 0) : 0; break
      case 'myTypes': n = teamTypes(def, me); break
      case 'myPrizesLeft': n = prizesLeft(def, s, me); break
    }
    const amount = p.amount as number
    if (p.max !== undefined) { ctx.cast.bonus += Math.min(n, p.max as number) * amount; return }
    const add = n * amount
    ctx.cast.bonus += amount >= 0 ? Math.min(add, BONUS_CAP) : Math.max(add, -BONUS_CAP)
  },
})
