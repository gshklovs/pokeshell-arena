// The card-text parser: an attack's rules text -> effect lists (docs/KITS.md "Mechanics mapping").
// It reads the text at runtime (the auto-kit, the coverage tool); no card text is ever stored in this repo.
//
// The text is normalized (lowercase, the card's own name -> "this pokemon", the Defending / opponent's Active
// Pokémon -> "foe", reminder parentheses dropped), then consumed clause by clause: each rule matches at the start of
// what is left and emits effects into a slot:
//   cast  onCast (the caster, once at release)       pre   onHit before the damage op (bonuses, conditions)
//   post  onHit after the damage op (status, drain)   impact  onImpact (terrain, stadiums)
// A clause no rule matches is a leftover. Rules tagged `flavor` match on purpose and do nothing in the arena
// (deck order, revealing a hand). Every rule has a mechanic id, which the coverage report groups by.
import { TURN } from './rules'
import type { Effect } from './types'

export type Slot = 'cast' | 'pre' | 'post' | 'impact'
export interface Emit { slot: Slot; e: Effect }

export interface ParsedText {
  /** effects by slot, in text order */
  onCast: Effect[]
  pre: Effect[]
  post: Effect[]
  onImpact: Effect[]
  /** damage op options the text asks for */
  wr: boolean | 'weakness' | 'resistance'
  pierce: boolean
  /** the printed damage is a per-unit amount ("30×"): the damage op does 0 and bonuses carry it */
  perUnit: boolean
  /** the damage op hits no one directly (only counters / bench): its amount goes to 0 */
  noDirect: boolean
  /** mechanic ids matched, in order */
  mechs: string[]
  /** mechanic ids that are approximations (the arena can't do the exact thing) */
  approx: string[]
  /** clauses nothing matched */
  leftovers: string[]
}

interface Ctx {
  /** the most recent "flip N coins" count, for "if at least 2 of them are heads" */
  lastCoins: number
  out: ParsedText
}

type Build = (m: RegExpMatchArray, c: Ctx) => Emit[] | null

interface Rule {
  mech: string
  re: RegExp
  build: Build
  approx?: boolean
  flavor?: boolean
}

// ------------------------------------------------------------------ helpers
const n = (s: string | undefined, dflt = 1): number => {
  if (s === undefined || s === '') return dflt
  if (/^(a|an|one|the)$/.test(s)) return 1
  if (s === 'two') return 2
  if (s === 'three') return 3
  if (s === 'all' || s === 'any amount of' || s === 'any number of') return 15
  const v = parseInt(s, 10)
  return Number.isFinite(v) ? v : dflt
}
const cast = (e: Effect): Emit => ({ slot: 'cast', e })
const pre = (e: Effect): Emit => ({ slot: 'pre', e })
const post = (e: Effect): Emit => ({ slot: 'post', e })
const impact = (e: Effect): Emit => ({ slot: 'impact', e })
const STATUS: Record<string, string> = { asleep: 'asleep', burned: 'burned', confused: 'confused', paralyzed: 'paralyzed', poisoned: 'poisoned' }
const FOE = "(?:foe|that pokemon|it|the new active pokemon)"
const NUM = '(\\d+|a|an|one|two|three|all|any amount of|any number of)'
const ENERGY = "(?:(?:basic |special )?(?:\\w+ )?energy(?: cards?)?)"

/** a condition phrase -> a `when` condition ({cond, ...params}), or null */
function condOf(t: string): Record<string, unknown> | null {
  const s = t.trim()
  const kind = (k: string) => ({ cond: 'foeIs', kind: k })
  let m: RegExpMatchArray | null
  if (/^foe (?:already )?has (?:any )?damage counters on it$/.test(s)) return { cond: 'foeDamaged' }
  if (/^this pokemon has (?:any )?damage counters on it$/.test(s)) return { cond: 'selfDamaged' }
  if ((m = s.match(/^foe is an? (?:pokemon )?(v|vmax|vstar|gx|ex|basic pokemon|evolution pokemon|evolved pokemon|pokemon v or a pokemon gx|pokemon v)$/))) {
    const k = m[1]
    if (k.startsWith('pokemon v')) return kind('V')
    if (k === 'v') return kind('V')
    if (k === 'vmax') return kind('VMAX')
    if (k === 'vstar') return kind('VSTAR')
    if (k === 'gx') return kind('GX')
    if (k === 'ex') return kind('ex')
    if (k === 'basic pokemon') return kind('Basic')
    return kind('Evolution')
  }
  if ((m = s.match(/^foe is a pokemon (vmax|ex|gx|v)$/))) return kind(m[1] === 'vmax' ? 'VMAX' : m[1] === 'ex' ? 'ex' : m[1] === 'gx' ? 'GX' : 'V')
  if (/^this pokemon has (?:any )?[\w ]+ energy (?:attached|attaches)$/.test(s)) return { cond: 'hasEnergy', n: 1 }
  if (/^an attack damaged this pokemon during your opponent's last turn$/.test(s)) return { cond: 'selfHurt' }
  if ((m = s.match(/^you have at least (\d+) energy in play$/))) return { cond: 'hasEnergy', n: Math.min(5, n(m[1])) }
  if (/^you have a stadium in play$/.test(s)) return { cond: 'stadium' }
  if (/^foe is affected by a special condition$/.test(s)) return { cond: 'foeStatus' }
  if (/^foe is asleep$/.test(s)) return { cond: 'foeAsleep' }
  if (/^any of your pokemon were knocked out/.test(s)) return { cond: 'allyKo' }
  if (/^this pokemon (?:moved from your bench to the active spot|was on the bench and became your active pokemon) this turn$/.test(s)) return { cond: 'fresh' }
  if (/^this pokemon evolved from [\w ]+ during this turn$/.test(s)) return { cond: 'fresh' }
  if (/^foe moved from the bench to the active spot during your opponent's last turn$/.test(s)) return { cond: 'foeFresh' }
  if (/^you have used your vstar power$/.test(s)) return { cond: 'usedVstar' }
  if ((m = s.match(/^your opponent has (?:exactly )?(\d+) (?:or fewer )?prize cards? remaining$/))) return { cond: 'foePrizesLeft', n: n(m[1]) }
  if ((m = s.match(/^you have (?:only |exactly )?(\d+) prize cards? remaining$/))) return { cond: 'prizesLeft', n: n(m[1]) }
  if (/^you have the same number of cards in your hand as your opponent$/.test(s)) return { cond: 'samePips' }
  if (/^you have no cards in your hand$/.test(s)) return { cond: 'noPips' }
  if (/^this pokemon has a pokemon tool attached$/.test(s)) return { cond: 'selfBuffed' }
  if (/^foe has a pokemon tool attached$/.test(s)) return { cond: 'foeBuffed' }
  if (/^this pokemon was damaged by an attack during your opponent's last turn$/.test(s)) return { cond: 'selfHurt' }
  if ((m = s.match(/^you have (\d+) or more cards in the lost zone$/))) return { cond: 'late', n: n(m[1]) }
  if (/^(?:your )?benched pokemon have any damage counters on them$/.test(s)) return { cond: 'selfDamaged', approx: true }
  if (/^(?:[\w ]+ is on your bench|any of your benched [\w ]+ have any damage counters on them|you played [\w' ]+ from your hand during this turn|[\w& ]+ is in your discard pile|the total of both players' remaining prize cards is exactly \d+|you and your opponent have the same number of benched pokemon)$/.test(s)) return { cond: 'chance', approx: true }
  return null
}

/** a `when` effect for a condition phrase, or a 50% chance for conditions the arena can't see */
function whenOf(c: Record<string, unknown>, then: Effect[], els?: Effect[]): { e: Effect; approx: boolean } {
  const approx = !!c.approx
  const { approx: _a, ...cond } = c
  if (cond.cond === 'chance') return { e: { op: 'chance', permille: 500, then, ...(els ? { else: els } : {}) }, approx: true }
  return { e: { op: 'when', ...cond, ...(then.length ? { then } : {}), ...(els ? { else: els } : {}) }, approx }
}

/** "for each X" -> a bonusPer `per` source */
function perOf(x: string): { per: string; approx?: boolean; plusOne?: boolean } | null {
  const s = x.trim()
  if (/^(?:\w+ )?energy (?:card )?attached to (?:foe|all of your opponent's pokemon|your opponent's pokemon)$/.test(s)) return { per: 'foeEnergy' }
  if (/^(?:basic |\w+ )?energy (?:card )?attached to this pokemon but not used to pay for this attack's energy cost$/.test(s)) return { per: 'myEnergy' }
  // "attached to this Pokémon" counts what the attack was paid with too (the TCG's attached energy covers the cost):
  // on the one meter the unspent pips alone are nearly always 0 once the attack is paid
  if (/^(?:basic |\w+ )?energy (?:card )?attached to this pokemon$/.test(s)) return { per: 'myAttached' }
  if (/^(?:[\w ]+ )?energy attached to all of your pokemon$/.test(s)) return { per: 'myAttached' }
  if (/^benched pokemon$/.test(s)) return { per: 'bothBench' }
  if (/^damage counters? on that pokemon$/.test(s)) return { per: 'foeDamage' }
  if (/^(?:of )?your remaining prize cards$/.test(s)) return { per: 'myPrizesLeft' }
  if (/^cards with [\w ]+ in their names that you have in play$/.test(s)) return { per: 'myBench', approx: true, plusOne: true }
  if (/^(?:[\w ]+ )?energy (?:card )?attached to all of your pokemon$/.test(s)) return { per: 'myAttached', approx: true }
  if (/^energy attached to both active pokemon$/.test(s)) return { per: 'bothEnergy' }
  if (/^damage counters? on this pokemon$/.test(s)) return { per: 'myDamage' }
  if (/^damage counters? on (?:foe|all of your opponent's pokemon)$/.test(s)) return { per: 'foeDamage' }
  if (/^prize cards? your opponent has taken$/.test(s)) return { per: 'foePrizes' }
  if (/^prize cards? your opponent took during their last turn$/.test(s)) return { per: 'foePrizes', approx: true }
  if (/^prize cards? you have taken$/.test(s)) return { per: 'myPrizes' }
  if (/^benched pokemon \(?both yours and your opponent's\)?$/.test(s)) return { per: 'bothBench' }
  if (/^(?:of )?your opponent's benched pokemon$/.test(s)) return { per: 'foeBench' }
  if (/^(?:of )?your benched pokemon$/.test(s)) return { per: 'myBench' }
  if (/^(?:of )?your pokemon in play$/.test(s)) return { per: 'myBench', plusOne: true }
  if (/^card in your hand$/.test(s)) return { per: 'myAttached' }
  if (/^colorless in foe's retreat cost$/.test(s)) return { per: 'foeRetreat' }
  if (/^(?:different )?type of (?:basic energy attached to all of your pokemon|pokemon on your bench|basic energy you revealed in this way)$/.test(s)) return { per: 'myTypes' }
  if (/^(?:[\w' -]+ (?:card )?in (?:your|your opponent's) discard pile|[\w' -]+ in the lost zone.*)$/.test(s)) return { per: 'turns', approx: true }
  if (/^special condition affecting this pokemon$/.test(s)) return { per: 'foeStatus', approx: true }
  if (/^(?:of )?your (?:[\w ]+ )?pokemon (?:in play |that has any damage counters on it|that has a maximum hp of \d+).*$/.test(s)) return { per: 'myBench', approx: true, plusOne: true }
  if (/^(?:of )?your opponent's pokemon (?:in play )?that has an ability$/.test(s)) return { per: 'foeBench', approx: true }
  if (/^(?:of )?your [\w, -]+ in play$/.test(s)) return { per: 'myBench', approx: true, plusOne: true }
  if (/^pokemon tool (?:card )?(?:attached to all of your pokemon|in the lost zone.*)$/.test(s)) return { per: 'turns', approx: true }
  if (/^special energy card attached to your opponent's pokemon$/.test(s)) return { per: 'foeEnergy', approx: true }
  if (/^damage counter on all of your benched [\w ]+ pokemon$/.test(s)) return { per: 'myDamage', approx: true }
  return null
}

// ------------------------------------------------------------------ the rules (tried in order at the start of the text)
const RULES: Rule[] = [
  // ---- coins
  { mech: 'coin', re: /^flip a coin\. if heads, (.+?)[;.] if tails, (.+?)\./, build: (m, c) => coin(parseClause(m[1], c), parseClause(m[2], c)) },
  { mech: 'coin', re: /^flip a coin\. if heads, (.+?)\. if tails, (.+?)\./, build: (m, c) => coin(parseClause(m[1], c), parseClause(m[2], c)) },
  { mech: 'coin', re: /^flip a coin\. if heads, (.+?)\./, build: (m, c) => coin(parseClause(m[1], c), []) },
  { mech: 'coin', re: /^flip a coin\. if tails, (.+?)\./, build: (m, c) => coin([], parseClause(m[1], c)) },
  { mech: 'coin', re: /^you and your opponent play rock-paper-scissors until someone wins\. if you win, (.+?)\./, approx: true, build: (m, c) => coin(parseClause(m[1], c), []) },
  { mech: 'coins', re: new RegExp(`^flip (\\d+|two|three) coins\\. this attack does (\\d+) (?:more )?damage (?:for each heads|times the number of heads)\\.`), build: (m, c) => { c.lastCoins = n(m[1]); c.out.perUnit = !/more/.test(m[0]); return [pre({ op: 'coins', count: n(m[1]), perHeads: [{ op: 'bonus', amount: n(m[2]) }] })] } },
  { mech: 'coins', re: /^flip (\d+) coins\. for each heads, (.+?)\./, build: (m, c) => { c.lastCoins = n(m[1]); return coins(n(m[1]), parseClause(m[2], c)) } },
  { mech: 'coins', re: /^flip a coin for each of your pokemon in play[^.]*\. this attack does (\d+) damage times the number of heads\./, approx: true, build: (m, c) => { c.out.perUnit = true; return [pre({ op: 'coins', count: 3, perHeads: [{ op: 'bonus', amount: n(m[1]) }] })] } },
  { mech: 'coins', re: /^flip a number of coins equal to [^.]+\. (?:this attack does (\d+) damage (?:plus (\d+) more damage for each heads|times (?:the|then) number of heads)|for each heads, [^.]+)\./, approx: true, build: (m, c) => { c.out.perUnit = !m[2]; return [pre({ op: 'coins', count: 3, perHeads: [{ op: 'bonus', amount: n(m[2] ?? m[1], 10) }] })] } },
  { mech: 'coins', re: /^if at least (\d+) of them are heads, (.+?)\./, build: (m, c) => {
    const k = n(m[1]), N = Math.max(k, c.lastCoins || 3)
    let p = 0
    for (let i = k; i <= N; i++) p += binom(N, i)
    return [post({ op: 'chance', permille: Math.round((1000 * p) / 2 ** N), then: flat(parseClause(m[2], c)) })]
  } },
  { mech: 'flipUntilTails', re: /^flip a coin until you get tails\. this attack does (\d+) (more )?damage for each heads\./, build: (m, c) => { c.out.perUnit = !m[2]; return [pre({ op: 'coinsUntilTails', perHeads: [{ op: 'bonus', amount: n(m[1]) }] })] } },
  { mech: 'flipUntilTails', re: /^flip a coin until you get tails\. (?:for each heads, )?(?:search your deck for [^.]+|discard the top card of your opponent's deck)\.(?: then, shuffle your deck\.)?/, build: (m) => [/opponent/.test(m[0]) ? post({ op: 'coinsUntilTails', max: 5, perHeads: [{ op: 'energyJam', ticks: 30 }] }) : cast({ op: 'coinsUntilTails', max: 3, perHeads: [{ op: 'gainEnergy', count: 1 }] })] },

  // ---- damage modifiers on the damage op itself
  { mech: 'ignoreWR', re: /^this attack's damage isn't affected by weakness or resistance, or by any effects on foe\./, build: (_m, c) => { c.out.wr = false; c.out.pierce = true; return [] } },
  { mech: 'ignoreWR', re: /^this (?:attack's )?damage isn't affected by weakness(?:,)? (?:or|and) resistance(?:, pokemon powers, or any other effects on foe)?\./, build: (m, c) => { c.out.wr = false; if (/effects/.test(m[0])) c.out.pierce = true; return [] } },
  { mech: 'ignoreWR', re: /^(?:this attack's damage isn't affected by resistance|don't apply weakness and resistance for this attack)\./, build: (m, c) => { c.out.wr = /weakness/.test(m[0]) ? false : 'weakness'; return [] } },
  { mech: 'ignoreWR', re: /^this attack's damage isn't affected by weakness(?: or by any effects on foe)?\./, build: (m, c) => { c.out.wr = 'resistance'; if (/effects/.test(m[0])) c.out.pierce = true; return [] } },
  { mech: 'pierce', re: /^this attack's damage isn't affected by any effects on foe\./, build: (_m, c) => { c.out.pierce = true; return [] } },
  { mech: 'pierce', re: /^before doing damage, discard all pokemon tools from foe\.(?: if you discarded a pokemon tool in this way, this attack does (\d+) more damage\.)?/, build: (m) => [...(m[1] ? [pre({ op: 'when', cond: 'foeBuffed', then: [{ op: 'bonus', amount: n(m[1]) }] })] : []), pre({ op: 'dispel' })] },
  { mech: 'pierce', re: /^before doing damage, discard a special energy from foe\./, build: () => [pre({ op: 'dispel' }), post({ op: 'discardEnergy', count: 1, target: 'target' })] },

  // ---- scaling damage ("for each")
  { mech: 'scaling', re: /^(?:this attack )?does (\d+) damage (?:plus|minus) (\d+) (?:more )?damage for each (.+?)\./, build: (m, c) => per(m[3], /minus/.test(m[0]) ? -n(m[2]) : n(m[2]), c) },
  { mech: 'scaling', re: /^this attack does (\d+) (more |less )?damage (?:for each|times the (?:amount|number) of) (.+?)\./, build: (m, c) => { if (!m[2]) c.out.perUnit = true; return per(m[3], m[2] === 'less ' ? -n(m[1]) : n(m[1]), c) } },
  { mech: 'scaling', re: /^this attack does (\d+) more damage times the (?:amount|number) of (.+?)\./, build: (m, c) => per(m[2], n(m[1]), c) },
  { mech: 'scaling', re: /^does (\d+) damage times the number of (.+?)\./, build: (m, c) => { c.out.perUnit = true; return per(m[2], n(m[1]), c) } },
  { mech: 'scaling', re: /^extra (?:\w+ )?energy after the \w+ (?:doesn't|don't) count\./, build: () => [] },
  { mech: 'scaling', re: /^you can't add more than (\d+) damage in this way\./, build: () => [] },
  { mech: 'scaling', re: /^put (\d+) damage counters? on foe for each (.+?)\./, build: (m, c) => { const r = per(m[2], 10 * n(m[1]), c); c.out.perUnit = true; return r } },
  { mech: 'scaling', re: /^this attack does (\d+) damage to (\d+) of your opponent's pokemon for each (.+?)\./, build: (m, c) => { c.out.perUnit = true; return per(m[3], n(m[1]), c) } },
  { mech: 'scaling', re: /^(?:reveal the top (\d+) cards of your deck|discard the top (\d+) cards of your deck)\. this attack does (\d+) damage for each [^.]+ you find there\.(?: then, [^.]+\.)?/, approx: true, build: (m, c) => { c.out.perUnit = true; return [pre({ op: 'coins', count: n(m[1] ?? m[2], 3), perHeads: [{ op: 'bonus', amount: n(m[3]) }] })] } },
  { mech: 'scaling', re: /^discard the top (\d+) cards of your deck\. this attack does (\d+) damage for each energy card you discarded in this way\./, approx: true, build: (m, c) => { c.out.perUnit = true; return [pre({ op: 'coins', count: n(m[1]), perHeads: [{ op: 'bonus', amount: n(m[2]) }] })] } },

  // ---- spend energy for damage
  { mech: 'spendEnergy', re: /^you may discard (?:any amount of|up to (\d+)) (?:basic )?\w+ energy(?: or (?:any amount of|up to \d+) (?:basic )?\w+ energy)? from (?:this pokemon|your pokemon)\. this attack does (\d+) (more )?damage for each card you discarded in this way\./, build: (m, c) => { if (!m[3]) c.out.perUnit = true; return [cast({ op: 'spendEnergy', max: m[1] ? n(m[1]) : 3, amount: n(m[2]), paid: 1 })] } },
  { mech: 'spendEnergy', re: /^discard (?:any amount of|up to (\d+)|all) (?:basic )?(?:\w+ )?energy (?:from (?:this pokemon|your pokemon))\. this attack does (\d+) (more )?damage for each card you discarded in this way\./, build: (m, c) => { if (!m[3]) c.out.perUnit = true; return [cast({ op: 'spendEnergy', max: m[1] ? n(m[1]) : 3, amount: n(m[2]), paid: 1 })] } },
  { mech: 'spendEnergy', re: /^(?:shuffle any amount of \w+ energy from your pokemon into your deck|discard all lightning energy cards attached to this pokemon in order to use this attack)\. (?:this attack does (\d+) damage for each card you shuffled into your deck in this way|flip a number of coins [^.]+\. this attack does (\d+) damage times then number of heads)\./, approx: true, build: (m, c) => { c.out.perUnit = true; return [cast({ op: 'spendEnergy', max: 3, amount: m[1] ? n(m[1]) : Math.trunc(n(m[2]) / 2), paid: 1 })] } },
  { mech: 'spendEnergy', re: /^you may discard (?:all|\d+) (?:\w+ )?energy from this pokemon\. if you do, (.+?)\./, build: (m, c) => [cast({ op: 'discardEnergy', count: /all/.test(m[0]) ? 15 : n(m[0].match(/discard (\d+)/)?.[1]) }), ...parseClause(m[1], c)] },
  { mech: 'spendEnergy', re: /^you may discard up to (\d+) cards from the top of your deck\. this attack does (\d+) more damage for each card you discarded in this way\./, approx: true, build: (m) => [pre({ op: 'coins', count: n(m[1]), perHeads: [{ op: 'bonus', amount: n(m[2]) }] })] },
  { mech: 'spendEnergy', re: /^(?:put any number of pokemon tool cards from your discard pile in the lost zone|discard cards from the top of your deck until only \d+ cards? remains?|reveal any number of basic energy cards from your hand)\. this attack does (\d+) more damage for each (?:card you put in the lost zone|energy card you discarded|type of basic energy you revealed) in this way\./, approx: true, build: (m) => [cast({ op: 'spendEnergy', max: 3, amount: n(m[1]) })] },
  { mech: 'spendEnergy', re: /^discard your hand\. if you discarded (\d+) or more cards in this way, this attack does (\d+) more damage\./, approx: true, build: (m) => [cast({ op: 'when', cond: 'hasEnergy', n: Math.min(5, n(m[1])), then: [{ op: 'bonus', amount: n(m[2]) }] }), cast({ op: 'discardEnergy', count: 15 })] },
  { mech: 'spendEnergy', re: /^put up to (\d+) damage counters on this pokemon\. this attack does (\d+) damage for each damage counter you placed in this way\./, build: (m, c) => { c.out.perUnit = true; return [cast({ op: 'selfDamage', amount: 10 * n(m[1]) }), cast({ op: 'bonus', amount: n(m[1]) * n(m[2]) })] } },
  { mech: 'bonus', re: /^you may do (\d+) more damage\. if you do, (.+?)\./, build: (m, c) => [pre({ op: 'bonus', amount: n(m[1]) }), ...parseClause(m[2], c)] },

  // ---- conditional damage / effects
  { mech: 'conditional', re: /^if (.+?), this attack does (\d+) more damage(?:, and (.+?))?\. (?:then, (.+?)\.)?/, build: (m, c) => cond(m[1], [{ op: 'bonus', amount: n(m[2]) }, ...(m[3] ? flatHit(parseClause(m[3], c)) : [])], c, m[4] ? parseClause(m[4], c) : []) },
  { mech: 'conditional', re: /^if (.+?), this attack does (\d+) (?:damage )?plus (\d+) more damage\. if not, this attack does \d+ damage\./, build: (m, c) => cond(m[1], [{ op: 'bonus', amount: n(m[3]) }], c) },
  { mech: 'conditional', re: /^if this pokemon was damaged by an attack during your opponent's last turn, this attack does that much more damage\./, build: () => [pre({ op: 'bonusPer', per: 'hurt', amount: 10 })] },
  { mech: 'conditional', re: /^(?:if this pokemon has no damage counters on it|if this pokemon didn't move from the bench to the active spot this turn), this attack does nothing\./, build: (m) => [cast({ op: 'when', cond: /counters/.test(m[0]) ? 'selfDamaged' : 'fresh', else: [{ op: 'fizzle' }] })] },
  { mech: 'conditional', re: /^you can(?:'t)? use this attack (?:only )?(?:if|unless) (.+?)\./, build: (m) => {
    const c = condOf(m[1].replace(/^the defending pokemon is/, 'foe is'))
    if (!c) return null
    return [cast(whenOf(c, [], [{ op: 'fizzle' }]).e)]
  } },

  // ---- status conditions
  { mech: 'status', re: new RegExp(`^${FOE} is now (asleep|burned|confused|paralyzed|poisoned)(?:,? and (asleep|burned|confused|paralyzed|poisoned))?(?: \\(?after doing damage\\)?)?\\.`), build: (m) => [post({ op: 'status', status: STATUS[m[1]] }), ...(m[2] ? [post({ op: 'status', status: STATUS[m[2]] })] : [])] },
  { mech: 'status', re: /^this pokemon is now (asleep|burned|confused|paralyzed|poisoned)\./, build: (m) => [cast({ op: 'status', status: STATUS[m[1]], target: 'self' })] },
  { mech: 'status', re: /^(?:it now takes (\d+) poison damage instead of \d+ after each player's turn|during pokemon checkup, (?:put (\d+) damage counters on (?:that pokemon|foe) instead of \d+|flip \d+ coins instead of \d+\. if either of them is tails, this pokemon is still asleep))\.?/, approx: true, build: (m) => (m[1] || m[2] ? [post({ op: 'counters', amount: n(m[1] ?? String(10 * n(m[2]))) })] : []) },
  { mech: 'status', re: /^if this pokemon evolved from \w+ during this turn, put \d+ damage counters on that pokemon instead of \d+ during pokemon checkup\./, approx: true, build: () => [] },
  { mech: 'status', re: /^(?:this pokemon|that pokemon|foe) recovers from all special conditions\./, build: (m) => [/this/.test(m[0]) ? cast({ op: 'cleanse' }) : post({ op: 'cleanse', target: 'target' })] },
  { mech: 'status', re: /^if the defending pokemon doesn't have a char counter on it, [^.]+\. [^.]+\. if tails, [^.]+\.(?: char counters stay [^.]+\.)?/, approx: true, build: () => [post({ op: 'coin', heads: [{ op: 'status', status: 'burned' }] })] },

  // ---- recoil, heal, drain
  { mech: 'selfDamage', re: /^(?:this pokemon|it) (?:also )?does (\d+) damage to itself(?: for each damage counter on it)?\./, build: (m) => [cast({ op: 'selfDamage', amount: /for each/.test(m[0]) ? 30 : n(m[1]) })] },
  { mech: 'selfDamage', re: /^then, this pokemon does (\d+) damage to itself\./, build: (m) => [cast({ op: 'selfDamage', amount: n(m[1]) })] },
  { mech: 'heal', re: /^heal (\d+|all) damage from this pokemon\.?/, build: (m) => [cast({ op: 'heal', amount: m[1] === 'all' ? 1000 : n(m[1]) })] },
  { mech: 'heal', re: /^heal (\d+|all) damage from (?:each of )?(?:your (?:fairy )?pokemon|all of your pokemon|(\d+) of your (?:benched )?pokemon)\./, build: (m) => [cast({ op: 'heal', amount: m[1] === 'all' ? 60 : n(m[1]), target: 'team' })] },
  { mech: 'heal', re: /^(?:discard an energy from this pokemon and heal all damage from it|(?:discard (?:\d+|all) [\w ]*energy (?:cards? )?(?:attached to this pokemon|from this pokemon) in order to use this attack\. )?remove all damage counters from this pokemon)\./, build: (m) => [...(/discard (?:an|\d+)/.test(m[0]) ? [cast({ op: 'discardEnergy', count: 1 })] : []), cast({ op: 'heal', amount: 1000 })] },
  { mech: 'heal', re: /^(?:discard all energy from this pokemon\. )?heal all damage from (\d+) of your benched pokemon\./, build: (m) => [...(/discard/.test(m[0]) ? [cast({ op: 'discardEnergy', count: 15 })] : []), cast({ op: 'heal', amount: 100, target: 'team' })] },
  { mech: 'heal', re: /^flip (?:a coin|(\d+) coins)\. (?:if heads, remove all damage counters from (\d+) of your pokemon|remove (\d+) damage counters times the number of heads from this pokemon)\.[^.]*\.?/, build: (m) => (m[1] ? coins(n(m[1]), [cast({ op: 'heal', amount: 10 * n(m[3]) })]) : coin([cast({ op: 'heal', amount: 1000 })], [])) },
  { mech: 'heal', re: /^flip a coin\. if heads and if any of your pokemon have any damage counters on them, [^.]+\. if tails and [^.]+\./, approx: true, build: () => coin([cast({ op: 'heal', amount: 40 })], []) },
  { mech: 'drain', re: /^(?:unless all damage from this attack is prevented, you may remove (\d+) damage counters? from this pokemon|if this attack damages foe, remove (\d+) damage counter from this pokemon, if it has any)\./, build: (m) => [post({ op: 'when', cond: 'foeDamaged', then: [{ op: 'heal', amount: 10 * n(m[1] ?? m[2]) }] })] },
  { mech: 'drain', re: /^remove a number of damage counters from this pokemon equal to half the damage done to foe[^.]*\. if this pokemon has fewer damage counters than that, remove all of them\./, build: () => [post({ op: 'drain', permille: 500 })] },
  { mech: 'drain', re: /^if this attack damages foe, foe is now poisoned and you remove a number of damage counters from this pokemon equal to half that damage[^.]*\. if this pokemon has fewer damage counters than that, remove all of them\./, build: () => [post({ op: 'status', status: 'poisoned' }), post({ op: 'drain', permille: 500 })] },

  // ---- defense: shields, reductions, invulnerability, thorns
  { mech: 'prevent', re: /^during your opponent's next turn, (?:this pokemon takes (\d+) less damage from attacks|all damage done by attacks to this pokemon (?:during your opponent's next turn )?is reduced by (\d+))\./, build: (m) => [cast({ op: 'buff', stat: 'defense', amount: n(m[1] ?? m[2]), ticks: TURN })] },
  { mech: 'prevent', re: /^all damage done by attacks to this pokemon during your opponent's next turn is reduced by (\d+)\./, build: (m) => [cast({ op: 'buff', stat: 'defense', amount: n(m[1]), ticks: TURN })] },
  { mech: 'prevent', re: /^(?:during your opponent's next turn, )?prevent all (?:damage from and effects of attacks|effects of attacks, including damage,) done to this pokemon(?: during your opponent's next turn)?\./, build: () => [cast({ op: 'invulnerable', ticks: TURN })] },
  { mech: 'prevent', re: /^(?:during your opponent's next turn, )?prevent all damage done to this pokemon(?: by attacks)?(?: during your opponent's next turn)?\./, build: () => [cast({ op: 'shield', ticks: TURN })] },
  { mech: 'prevent', re: /^(?:during your opponent's next turn, )?prevent all damage done to this pokemon by attacks (?:from [\w -]+|if that damage is \d+ or less)(?: during your opponent's next turn)?\./, approx: true, build: () => [cast({ op: 'shield', amount: 60, ticks: TURN })] },
  { mech: 'prevent', re: /^during your opponent's next turn, whenever (\d+) or less damage is done to this pokemon[^.]*, prevent that damage\./, approx: true, build: (m) => [cast({ op: 'buff', stat: 'defense', amount: n(m[1]), ticks: TURN })] },
  { mech: 'prevent', re: /^during your opponent's next turn, whenever this pokemon takes damage, divide that damage in half[^.]*\./, approx: true, build: () => [cast({ op: 'buff', stat: 'defense', amount: 40, ticks: TURN })] },
  { mech: 'prevent', re: /^if foe attacks this pokemon during your opponent's next turn, any damage done to this pokemon is reduced by (\d+)[^.]*\./, build: (m) => [cast({ op: 'buff', stat: 'defense', amount: n(m[1]), ticks: TURN })] },
  { mech: 'prevent', re: /^discard (\d+) \w+ energy card attached to this pokemon in order to prevent all effects of attacks, including damage, done to this pokemon during your opponent's next turn\./, build: (m) => [cast({ op: 'discardEnergy', count: n(m[1]) }), cast({ op: 'invulnerable', ticks: TURN })] },
  { mech: 'prevent', re: /^if heads, then if, during your opponent's next turn, this pokemon would be knocked out by an attack, [^.]+\./, approx: true, build: () => [cast({ op: 'buff', stat: 'defense', amount: 60, ticks: TURN })] },
  { mech: 'prevent', re: /^during your opponent's next turn, this pokemon can't become asleep, confused, paralyzed, or poisoned\./, approx: true, build: () => [cast({ op: 'cleanse' })] },
  { mech: 'thorns', re: /^during your opponent's next turn, if this pokemon is damaged by an attack[^,]*, put (?:(\d+) )?damage counters? on the attacking pokemon(?: equal to the damage done to this pokemon)?\./, build: (m) => [cast(!m[1] ? { op: 'thorns', permille: 1000, ticks: TURN } : { op: 'thorns', amount: 10 * n(m[1]), ticks: TURN })] },
  { mech: 'thorns', re: /^if a pokemon knocks out this pokemon during your opponent's next turn, knock out that pokemon\./, approx: true, build: () => [cast({ op: 'thorns', permille: 1000, ticks: TURN })] },

  // ---- debuffs on the foe
  { mech: 'weaken', re: new RegExp(`^during your opponent's next turn, (?:${FOE}'s attacks|attacks used by ${FOE}) do (\\d+) less damage[^.]*\\.`), build: (m) => [post({ op: 'buff', stat: 'damage', amount: -n(m[1]), ticks: TURN, target: 'target' })] },
  { mech: 'weaken', re: new RegExp(`^(?:during your next turn|until the end of your next turn), (?:${FOE} takes (\\d+) more damage from attacks|if an attack damages ${FOE}[^,]*, that attack does (\\d+) more damage to ${FOE})[^.]*\\.`), build: (m) => [post({ op: 'buff', stat: 'defense', amount: -n(m[1] ?? m[2]), ticks: 2 * TURN, target: 'target' })] },
  { mech: 'weaken', re: /^during your next turn, this pokemon's attacks do (\d+) more damage[^.]*\./, build: (m) => [cast({ op: 'buff', stat: 'damage', amount: n(m[1]), ticks: 2 * TURN })] },
  { mech: 'blind', re: new RegExp(`^(?:during your opponent's next turn, )?if ${FOE} tries to attack(?: during your opponent's next turn)?, your opponent flips a coin\\. if tails, that attack (?:does nothing|doesn't happen)\\.`), build: () => [post({ op: 'blind', ticks: TURN })] },
  { mech: 'cantAttack', re: new RegExp(`^(?:during your opponent's next turn, )?${FOE} can't attack(?: this pokemon)?(?: or retreat)?(?: during your opponent's next turn)?\\.`), build: (m) => [post({ op: 'exhaust', ticks: TURN, target: 'target' }), ...(/retreat/.test(m[0]) ? [post({ op: 'retreatLock', ticks: TURN })] : [])] },
  { mech: 'cantAttack', re: new RegExp(`^until the end of your opponent's next turn, ${FOE} can't attack or retreat\\.`), build: () => [post({ op: 'exhaust', ticks: TURN, target: 'target' }), post({ op: 'retreatLock', ticks: TURN })] },
  { mech: 'cantAttack', re: /^choose (\d+) of foe's attacks\. (?:that pokemon|foe) can't use that attack during your opponent's next turn\./, build: () => [post({ op: 'exhaust', ticks: 2 * TURN, target: 'target', which: 'best' })] },
  { mech: 'retreatLock', re: new RegExp(`^(?:during your opponent's next turn, )?${FOE} can't retreat(?: during your opponent's next turn| as long as this pokemon remains your active pokemon)?\\.`), build: () => [post({ op: 'retreatLock', ticks: TURN })] },
  { mech: 'retreatLock', re: /^until the end of your opponent's next turn, as long as this pokemon is your active pokemon, foe can't retreat, and [^.]+\./, build: () => [post({ op: 'retreatLock', ticks: TURN })] },
  { mech: 'retreatLock', re: /^during your opponent's next turn, foe's attacks cost colorless more, and its retreat cost is colorless more\./, build: () => [post({ op: 'energyJam', ticks: 45 }), post({ op: 'retreatLock', ticks: TURN })] },

  // ---- self lockout
  { mech: 'selfLock', re: /^(?:during your next turn, )?this pokemon can't (?:attack|use attacks)(?: during your next turn)?\.?/, build: () => [cast({ op: 'exhaust', ticks: TURN })] },
  { mech: 'selfLock', re: /^(?:during your next turn, )?this pokemon can't use [^.]+?(?: during your next turn)?\./, build: () => [cast({ op: 'exhaust', ticks: TURN, which: 'this' })] },
  { mech: 'selfLock', re: /^either way, you can't use this attack again as long as this pokemon stays in play[^.]*\./, build: () => [cast({ op: 'exhaust', ticks: 600, which: 'this' })] },

  // ---- bench and spread damage
  { mech: 'bench', re: /^this attack (?:also )?does (\d+) damage to (\d+|each) of your opponent's benched pokemon(?: v| that has any damage counters on it)?\./, build: (m) => [post({ op: 'benchDamage', amount: n(m[1]), ...(m[2] === 'each' ? {} : { count: n(m[2]) }) })] },
  // "each of your opponent's Pokémon that has a Pokémon Tool attached": only a foe with a Tool (its buffs or a shield)
  { mech: 'bench', re: /^this attack does (\d+) damage to each of your opponent's pokemon that has a pokemon tool attached\./, build: (m, c) => { c.out.noDirect = true; return [post({ op: 'when', cond: 'foeBuffed', then: [{ op: 'damage', amount: n(m[1]) }, { op: 'benchDamage', amount: n(m[1]) }] })] } },
  { mech: 'bench', re: /^this attack does (\d+) damage to each of your opponent's (?:pokemon(?: ex| v)?|pokemon v and pokemon gx)\./, build: (m, c) => { c.out.noDirect = true; return [post({ op: 'damage', amount: n(m[1]) }), post({ op: 'benchDamage', amount: n(m[1]) })] } },
  { mech: 'bench', re: /^this attack does (\d+) damage to each (?:pokemon v and pokemon gx|of your opponent's pokemon v)[^.]*\./, build: (m, c) => { c.out.noDirect = true; return [post({ op: 'damage', amount: n(m[1]) }), post({ op: 'benchDamage', amount: n(m[1]) })] } },
  { mech: 'bench', re: /^(?:this attack )?(?:also )?does (\d+) damage to (?:(\d+|each) of your (?:own )?benched pokemon|each of your own benched pokemon|(\d+) of your benched pokemon|(\d+) of your pokemon)\./, build: (m) => [cast({ op: 'benchDamage', amount: n(m[1]), side: 'self', ...(m[2] && m[2] !== 'each' ? { count: n(m[2]) } : {}) })] },
  { mech: 'bench', re: /^(?:do|does) (\d+) damage to each (?:benched pokemon \(?yours and your opponent's\)?|pokemon on each player's bench)\.(?: this pokemon does (\d+) damage to itself\.)?/, build: (m) => [post({ op: 'benchDamage', amount: n(m[1]) }), cast({ op: 'benchDamage', amount: n(m[1]), side: 'self' }), ...(m[2] ? [cast({ op: 'selfDamage', amount: n(m[2]) })] : [])] },
  { mech: 'bench', re: /^this attack does (\d+) damage to (\d+) of your opponent's (?:pokemon|benched pokemon)(?: v)?\./, build: (m, c) => { c.out.noDirect = true; return [post({ op: 'damage', amount: n(m[1]) })] } },
  { mech: 'bench', re: /^choose (\d+) of your opponent's pokemon(?: (\d+) times)?\.[^.]*\. (?:for each time you chose a pokemon, do (\d+) damage to it|this attack does (\d+) damage to that pokemon)\.(?: this damage isn't affected by weakness or resistance\.| don't apply weakness and resistance for this attack\.| this attack's damage isn't affected by weakness, resistance, pokemon powers, or any other effects on foe\.)?/, build: (m, c) => { c.out.noDirect = true; c.out.wr = false; return [post({ op: 'damage', amount: n(m[3] ?? m[4]) * n(m[2], 1) })] } },
  { mech: 'bench', re: /^choose (\d+) of your opponent's pokemon\. this attack does (\d+) damage to that pokemon\./, build: (m, c) => { c.out.noDirect = true; return [post({ op: 'damage', amount: n(m[2]) })] } },
  { mech: 'bench', re: /^if your opponent has any benched pokemon, choose (\d+) of them(?: and flip a coin)?\.(?: flip (\d+) coins\.)? (?:for each heads|if heads), this attack does (\d+) damage to that pokemon\./, build: (m) => (m[2] ? coins(n(m[2]), [post({ op: 'benchDamage', amount: n(m[3]), count: 1 })]) : coin([post({ op: 'benchDamage', amount: n(m[3]), count: 1 })], [])) },
  { mech: 'bench', re: /^flip a coin\. if heads, this attack does (\d+) damage to each of your opponent's benched pokemon; if tails, this attack does (\d+) damage to each of your own benched pokemon\./, build: (m) => coin([post({ op: 'benchDamage', amount: n(m[1]) })], [cast({ op: 'benchDamage', amount: n(m[2]), side: 'self' })]) },
  { mech: 'bench', re: /^does (\d+) damage to each pokemon in play that has a pokemon power\. don't apply weakness and resistance\./, approx: true, build: (m, c) => { c.out.noDirect = true; return [post({ op: 'damage', amount: n(m[1]), wr: false })] } },

  // ---- damage counters
  { mech: 'counters', re: /^(?:put|place) (\d+) damage counters? on (?:your opponent's (?:active )?pokemon|foe|(\d+|each) of your opponent's pokemon)(?: in any way you like)?\.(?: if you played [^.]+ instead\.)?/, build: (m, c) => { c.out.noDirect = true; return [post({ op: 'counters', amount: 10 * n(m[1]) })] } },
  { mech: 'counters', re: /^choose (\d+) of your opponent's pokemon and put (\d+) damage counters on each of them\./, build: (m, c) => { c.out.noDirect = true; return [post({ op: 'counters', amount: 10 * n(m[2]) })] } },
  { mech: 'counters', re: /^put (\d+) damage counters on (\d+) of your opponent's pokemon\. if your opponent's pokemon is knocked out by this attack, take another turn after this one\.(?: if [^.]+\.)?/, approx: true, build: (m, c) => { c.out.noDirect = true; return [post({ op: 'counters', amount: 10 * n(m[1]) })] } },
  { mech: 'counters', re: /^move all damage counters from this pokemon to foe\./, build: (_m, c) => { c.out.noDirect = true; return [pre({ op: 'bonusPer', per: 'myDamage', amount: 10 }), post({ op: 'damage', amount: 0, wr: false, pierce: true }), post({ op: 'heal', amount: 1000 })] } },
  { mech: 'counters', re: /^move (\d+) damage counters from each of your pokemon to (\d+) of your opponent's pokemon\./, approx: true, build: (m, c) => { c.out.noDirect = true; return [cast({ op: 'heal', amount: 10 * n(m[1]), target: 'team' }), post({ op: 'counters', amount: 30 * n(m[1]) })] } },
  { mech: 'counters', re: /^put damage counters on foe equal to the number of damage counters on (\d+) of your benched pokemon\./, approx: true, build: (_m, c) => { c.out.noDirect = true; return [pre({ op: 'bonusPer', per: 'myDamage', amount: 10 }), post({ op: 'damage', amount: 0, wr: false, pierce: true })] } },
  { mech: 'counters', re: /^does damage to foe equal to half foe's remaining hp[^.]*\./, build: (_m, c) => { c.out.noDirect = true; return [post({ op: 'hpCut', permille: 500 })] } },
  { mech: 'counters', re: /^place damage counters on foe until its remaining hp is (\d+)\./, approx: true, build: (_m, c) => { c.out.noDirect = true; return [post({ op: 'hpCut', permille: 800 })] } },

  // ---- knock outs and prizes
  { mech: 'execute', re: /^knock out (\d+) of your opponent's pokemon in play that has (\d+) hp or less remaining\./, build: (m) => [post({ op: 'execute', hp: n(m[2]) })] },
  { mech: 'execute', re: /^foe is knocked out\./, build: () => [post({ op: 'execute', hp: 100000 })] },
  { mech: 'execute', re: /^at the end of your opponent's next turn, foe will be knocked out\./, approx: true, build: () => [post({ op: 'status', status: 'poisoned' }), post({ op: 'counters', amount: 60 })] },
  { mech: 'bounty', re: /^if your opponent's (?:basic )?pokemon is knocked out by damage from this attack, take (\d+) more prize cards?\./, build: (m) => [post({ op: 'bounty', prizes: n(m[1]) })] },
  { mech: 'bounty', re: /^if foe is knocked out during your next turn, take (\d+) more prize card\./, approx: true, build: () => [post({ op: 'buff', stat: 'defense', amount: -20, ticks: 2 * TURN, target: 'target' })] },

  // ---- energy: discard, gain
  { mech: 'discardEnergy', re: new RegExp(`^discard ${NUM} ${ENERGY}(?:, a \\w+ energy(?: card)?,? and a \\w+ energy(?: card)?)? (?:from|attached to) this pokemon(?: in order to use this attack)?\\.`), build: (m) => [cast({ op: 'discardEnergy', count: /, a /.test(m[0]) ? 3 : n(m[1]) })] },
  { mech: 'discardEnergy', re: new RegExp(`^discard a \\w+ energy, a \\w+ energy, and a \\w+ energy from this pokemon\\.`), build: () => [cast({ op: 'discardEnergy', count: 3 })] },
  { mech: 'discardEnergy', re: new RegExp(`^(?:put|move) ${NUM} (?:basic )?energy (?:attached to (?:this pokemon|your pokemon) )?(?:in the lost zone|into your hand|from this pokemon to (?:\\d+ of )?your benched pokemon(?: in any way you like)?)\\.`), build: (m) => [cast({ op: 'discardEnergy', count: n(m[1]) })] },
  { mech: 'discardEnergy', re: /^put all energy attached to this pokemon in the lost zone\./, build: () => [cast({ op: 'discardEnergy', count: 15 })] },
  { mech: 'discardEnergy', re: /^(?:take (\d+) lightning energy cards? attached to this pokemon and attach it to \d+ of your benched pokemon\. if you have no benched pokemon, discard that energy card|flip a coin\. if tails, discard (\d+) energy card attached to this pokemon)\./, build: (m) => (m[2] ? coin([], [cast({ op: 'discardEnergy', count: n(m[2]) })]) : [cast({ op: 'discardEnergy', count: n(m[1]) })]) },
  { mech: 'discardEnergy', re: /^discard all (?:\w+ )?energy from this pokemon,? and (.+?)\./, build: (m, c) => [cast({ op: 'discardEnergy', count: 15 }), ...parseClause(m[1], c)] },
  { mech: 'foeEnergy', re: new RegExp(`^(?:discard|put) ${NUM} (?:special )?energy (?:from|attached to) (?:foe|your opponent's pokemon)(?: in the lost zone)?\\.`), build: (m) => [post({ op: 'discardEnergy', count: n(m[1]), target: 'target' })] },
  { mech: 'foeEnergy', re: /^discard all energy from both active pokemon\./, build: () => [post({ op: 'discardEnergy', count: 15, target: 'target' }), cast({ op: 'discardEnergy', count: 15 })] },
  { mech: 'foeEnergy', re: /^if foe has any energy cards attached to it, choose (\d+) of them and discard it\./, build: (m) => [post({ op: 'discardEnergy', count: n(m[1]), target: 'target' })] },
  { mech: 'foeEnergy', re: /^you may move an energy from foe to (\d+) of their benched pokemon\./, build: () => [post({ op: 'discardEnergy', count: 1, target: 'target' })] },
  { mech: 'foeEnergy', re: /^you may discard an energy from this pokemon\. if you do, discard an energy from foe\./, build: () => [cast({ op: 'discardEnergy', count: 1 }), post({ op: 'discardEnergy', count: 1, target: 'target' })] },
  { mech: 'foeEnergy', re: /^if your opponent has a stadium in play, discard it\. if you discarded a stadium in this way, discard (\d+) energy from foe\./, build: (m) => [impact({ op: 'paint', terrain: 'none', radius: 120 }), post({ op: 'when', cond: 'stadium', then: [{ op: 'discardEnergy', count: n(m[1]), target: 'target' }] })] },
  { mech: 'accel', re: new RegExp(`^(?:you may )?(?:search your deck for|attach) (?:up to )?${NUM} (?:basic |special )?(?:\\w+ )?energy (?:cards? )?(?:from your (?:hand|discard pile) )?(?:and attach (?:them|it) )?to (?:this pokemon|your pokemon|your benched pokemon|(?:\\d+|each) of your (?:benched )?(?:\\w+ )?pokemon(?:-gx or pokemon-ex| gx or pokemon ex| v)?|this [\\w-]+)(?: in any way you like)?\\.(?: then, shuffle your deck\\.)?(?: if you do, heal (\\d+) damage from that pokemon\\.)?`), build: (m) => [cast({ op: 'gainEnergy', count: Math.min(3, n(m[1])) }), ...(m[2] ? [cast({ op: 'heal', amount: n(m[2]), target: 'team' })] : [])] },
  { mech: 'accel', re: /^(?:you may )?attach any number of (?:basic )?(?:\w+ )?energy cards from your hand to your pokemon in any way you like\./, build: () => [cast({ op: 'gainEnergy', count: 2 })] },
  { mech: 'accel', re: /^search your deck for (?:up to )?(\d+|a|an) (?:basic )?(?:\w+ )?energy (?:cards? )?and attach (?:them|it) to [^.]+\.(?: if you go second[^.]+\.)?(?: then, shuffle your deck\.)?/, build: (m) => [cast({ op: 'gainEnergy', count: Math.min(3, n(m[1])) })] },
  { mech: 'accel', re: /^(?:look at the top (\d+) cards of your deck(?: and attach any number of basic energy cards you find there to your pokemon in any way you like\. shuffle the other cards back into your deck|\. you may attach any number of energy cards you find there to this pokemon\. put the other cards back in any order)|discard the top (\d+) cards of your deck\. if any of those cards are energy cards, attach them to this pokemon|discard the top card of your deck\. if that card is an energy card, this attack does (\d+) more damage, and attach that card to this pokemon)\./, approx: true, build: (m) => [cast({ op: 'gainEnergy', count: 1 }), ...(m[3] ? [pre({ op: 'coin', heads: [{ op: 'bonus', amount: n(m[3]) }] })] : [])] },
  { mech: 'accel', re: /^(?:for each [\w ]+ in play, you may search your deck for a lightning energy card and attach it to [\w ]+\. shuffle your deck afterward|flip (\d+) coins\. (?:for each heads, search your deck for a \w+ energy card and attach it to [^.]+\. then, shuffle your deck|attach a number of basic energy cards up to the number of heads from your discard pile to your benched pokemon in any way you like))\./, approx: true, build: (m) => (m[1] ? coins(n(m[1]), [cast({ op: 'gainEnergy', count: 1 })]) : [cast({ op: 'gainEnergy', count: 2 })]) },
  { mech: 'accel', re: /^flip a coin\. if heads, (?:search your deck for up to (\d+) \w+ energy cards and attach them to your pokemon in any way you like\. then, shuffle your deck|you may attach up to (\d+) \w+ energy cards from your hand to this pokemon)\./, build: (m) => coin([cast({ op: 'gainEnergy', count: Math.min(3, n(m[1] ?? m[2])) })], []) },
  { mech: 'accel', re: /^if you did any damage with this attack, you may attach a \w+ energy card from your discard pile to this pokemon\./, build: () => [post({ op: 'gainEnergy', count: 1 })] },
  { mech: 'accel', re: /^(?:move all energy from this pokemon to your benched pokemon in any way you like|if you have any grass pokemon on your bench, [^.]+)\./, approx: true, build: () => [cast({ op: 'retreat' })] },

  // ---- switching
  { mech: 'switch', re: /^(?:you may )?switch this pokemon with (\d+) of your benched (?:\w+ )?pokemon\.(?: if you do, switch out your oppoennt's active pokemon to the bench\.)?/, build: (m) => [cast({ op: 'retreat' }), ...(/oppoennt/.test(m[0]) ? [post({ op: 'gust', mode: 'push' })] : [])] },
  { mech: 'switch', re: /^(?:you may )?shuffle this pokemon and all (?:attached cards|cards attached to it) into your deck\.(?: flip a coin\. if heads, shuffle a card from your discard pile into your deck\.)?/, build: () => [cast({ op: 'retreat', px: 220 }), cast({ op: 'heal', amount: 30 })] },
  { mech: 'switch', re: /^put this pokemon and all attached cards in the lost zone\./, approx: true, build: () => [cast({ op: 'retreat', px: 240 })] },
  { mech: 'switch', re: /^flip a coin\. if heads, search your deck for a pokemon and switch it with this pokemon\.[^.]*\.[^.]*\.[^.]*\./, approx: true, build: () => coin([cast({ op: 'retreat' })], []) },
  { mech: 'gust', re: new RegExp(`^(?:flip a coin\\. if heads, )?(?:switch (?:in )?(\\d+) of your opponent's benched pokemon (?:with their active pokemon|to the active spot)|if your opponent has any benched pokemon, choose (\\d+) of them and switch it with (?:his or her|their) active pokemon)\\.(?: this attack does (\\d+) damage to the new active pokemon\\.)?(?: the new active pokemon is now (confused|asleep|paralyzed|poisoned|burned)\\.)?`), build: (m) => {
    const e: Emit[] = [post({ op: 'gust', mode: 'pull' }), ...(m[3] ? [post({ op: 'damage', amount: n(m[3]) })] : []), ...(m[4] ? [post({ op: 'status', status: m[4] })] : [])]
    return /^flip/.test(m[0]) ? coin(e, []) : e
  } },
  { mech: 'gust', re: /^(?:you may have )?your opponent switch(?:es)? their active pokemon with (\d+) of their benched pokemon\./, build: () => [post({ op: 'gust', mode: 'push' })] },
  { mech: 'gust', re: /^(?:flip a coin\. if heads and )?if your opponent has any benched pokemon, (?:he|she|he or she|he of she) chooses (\d+) of them and switches it with (?:the defending pokemon|foe|his or her active pokemon)[^.]*\./, build: (m) => (/^flip/.test(m[0]) ? coin([post({ op: 'gust', mode: 'push' })], []) : [post({ op: 'gust', mode: 'push' })]) },
  { mech: 'gust', re: /^if this attack doesn't knock out foe, and if there are any pokemon on your opponent's bench, choose (\d+) of them and switch it with foe\./, build: () => [post({ op: 'gust', mode: 'pull' })] },
  { mech: 'gust', re: /^(?:if foe is an evolved pokemon, devolve it by putting the highest stage evolution card on it into your opponent's hand|devolve (?:each of your opponent's evolved pokemon|\d+ of your opponent's evolved pokemon)[^.]*|(?:your opponent )?shuffles? (?:their|your opponent's) active pokemon and all (?:attached cards|cards attached to it) into their deck|if foe has any damage counters on it, put it and all attached cards into your opponent's hand|put (\d+) of your opponent's benched pokemon and all cards attached to them into your opponent's hand)\.(?: if your opponent has no benched pokemon, this attack does nothing\.)?(?: your opponent shuffles those cards into their deck\.)?/, approx: true, build: () => [post({ op: 'gust', mode: 'push', px: 200 }), post({ op: 'counters', amount: 30 })] },

  // ---- hand, deck and trainer disruption of the opponent
  { mech: 'disrupt', re: /^(?:discard a random card from your opponent's hand|put a random card from your opponent's hand in the lost zone|choose a random card from your opponent's hand\. your opponent reveals that card and shuffles it into their deck|your opponent reveals their hand, and you put an item card you find there on the bottom of your opponent's deck|your opponent shuffles their hand into their deck and draws (\d+) cards)\./, build: () => [post({ op: 'discardEnergy', count: 1, target: 'target' })] },
  { mech: 'disrupt', re: /^flip (\d+) coins\. if either of them is heads, your opponent reveals their hand\. for each heads, [^.]+\./, build: (m) => coins(n(m[1]), [post({ op: 'discardEnergy', count: 1, target: 'target' })]) },
  { mech: 'disrupt', re: /^(?:discard the top (\d+) cards? of your opponent's deck|discard the top card of your opponent's deck|put the top card of your opponent's deck in the lost zone)\./, build: (m) => [post({ op: 'energyJam', ticks: Math.min(3 * TURN, 30 * n(m[1])) })] },
  { mech: 'disrupt', re: /^(?:during your opponent's next turn, (?:they can't play any [\w ]+ cards from their hand|energy cards can't be attached from your opponent's hand to foe|whenever they try to use a trainer card from their hand, [^.]+)|your opponent can't play any [\w ]+ cards from their hand during their next turn)\./, build: () => [post({ op: 'energyJam', ticks: TURN })] },
  { mech: 'disrupt', re: /^flip a coin\. if heads, during your opponent's next turn, they can't play any supporter cards from their hand\. if tails, [^.]+\./, build: () => [post({ op: 'energyJam', ticks: TURN })] },
  { mech: 'disrupt', re: /^discard (?:up to (\d+)|all) pokemon tools from your opponent's pokemon\./, build: () => [post({ op: 'dispel' })] },
  { mech: 'disrupt', re: /^your opponent reveals their hand\. add a card you find there to their prize cards face down\./, approx: true, build: () => [post({ op: 'discardEnergy', count: 2, target: 'target' })] },

  // ---- stadiums: the arena's terrain
  { mech: 'stadium', re: /^(?:you may )?discard a stadium in play\./, build: () => [impact({ op: 'paint', terrain: 'none', radius: 140 })] },

  // ---- draw / search: a pip or a small buff
  { mech: 'evolve', re: /^(?:flip a coin\. if heads, )?search your deck for (?:a card that evolves from this pokemon|a card that evolves from (\d+) of your pokemon|a [\w ]+ and put it onto this [\w ]+ to evolve it)[^.]*\.(?: then, shuffle your deck\.)?/, build: (m) => {
    const e = [cast({ op: 'buff', stat: 'damage', amount: 20, ticks: 4 * TURN }), cast({ op: 'heal', amount: 30 })]
    return /^flip/.test(m[0]) ? coin(e, []) : e
  } },
  { mech: 'evolve', re: /^(?:for each of your benched basic pokemon, search your deck for a card that evolves from that pokemon|flip (\d+) coins\. choose a number of your pokemon in play up to the number of heads\. for each of those pokemon, search your deck for a card that evolves from that pokemon)[^.]*\.(?: then, shuffle your deck\.)?/, build: () => [cast({ op: 'buff', stat: 'damage', amount: 20, ticks: 4 * TURN }), cast({ op: 'heal', amount: 30, target: 'team' })] },
  { mech: 'benchCall', re: /^(?:search your deck for (?:up to (\d+)|any number of|a) (?:basic pokemon|[\w, ]+pokemon named [\w ]+|[\w ]+) and put (?:them|it) onto your bench|put (?:up to )?(\d+|a) [\w ]+ pokemon(?:-gx|-ex| gx| ex)?(?: or [\w -]+)? from your discard pile onto your bench|put (?:up to )?(\d+) in any combination of [^.]+ from your discard pile onto your bench)\.(?: (?:shuffle your deck afterward|then, shuffle your deck)\.)?(?: if you do, attach up to (\d+) \w+ energy cards from your discard pile to that pokemon\.)?/, build: (m) => [cast({ op: 'buff', stat: 'defense', amount: 10, ticks: 3 * TURN }), ...(m[4] ? [cast({ op: 'gainEnergy', count: 1 })] : [])] },
  { mech: 'draw', re: /^(?:you may )?(?:draw (?:\d+|a) cards?|draw cards until you have (\d+) cards in your hand|each player draws a card|shuffle your hand into your deck(?:\. then,|, then) draw (?:\d+|a) cards?(?: for each card in your opponent's hand)?|discard a card from your hand\. if you do, draw (\d+) cards)\.(?: if you go second and it's your first turn, draw (\d+) more cards\.)?/, build: () => [cast({ op: 'gainEnergy', count: 1 })] },
  { mech: 'draw', re: /^(?:you may )?search your deck for (?:up to )?(?:\d+|a|an|any number of) (?:[\w-]+ )?(?:[\w ,]+?)(?:cards?|pokemon|\w+)?,? (?:reveal (?:it|them), )?and put (?:it|them) into your hand\.(?: then, shuffle your deck\.)?/, build: () => [cast({ op: 'gainEnergy', count: 1 })] },
  { mech: 'draw', re: /^(?:flip a coin\. if heads, (?:draw a card|search your deck for a supporter card, reveal it, and put it into your hand\. then, shuffle your deck)|put (?:up to )?(\d+|a) (?:[\w ]+ )?cards? from your discard pile into your hand|look at the top (\d+) cards of your deck and put (\d+) of them into your hand\. put the other cards in the lost zone|discard the top (\d+) cards of your deck and put (\d+) of them into your hand|each player reveals the top (\d+) cards of their deck, then draws those cards|flip a number of coins equal to the total number of pokemon in play\. [^.]+\. shuffle your deck afterward|flip a coin until you get tails\. search your deck for a number of cards up to the number of heads and put them into your hand\. then, shuffle your deck)\./, build: () => [cast({ op: 'gainEnergy', count: 1 })] },
  { mech: 'draw', re: /^(?:if you go first, you can use this attack during your first turn|you can use this attack only if you go second, and only during your first turn)\. (.+)$/, build: (m, c) => parseClause(m[1], c) },
  { mech: 'draw', re: /^choose up to (\d+) of your benched pokemon\. for each of those pokemon, search your deck for a basic energy card and attach it to that pokemon\. then, shuffle your deck\./, build: () => [cast({ op: 'gainEnergy', count: 2 })] },

  // ---- copies, transforms and odd ones, approximated
  { mech: 'mimic', re: /^choose (\d+) of foe's attacks\. metronome copies that attack[^.]*\./, build: () => [post({ op: 'mimic' })] },
  { mech: 'mimic', re: /^flip a coin\. if heads, choose an attack on (\d+) of your opponent's pokemon\. [^.]+\. this pokemon performs that attack\./, build: () => coin([post({ op: 'mimic' })], []) },
  { mech: 'mimic', re: /^choose (\d+) of your benched [\w ]+ pokemon's attacks and use it as this attack\./, approx: true, build: () => [post({ op: 'mimic' })] },
  { mech: 'mimic', re: /^flip a coin\. if heads, search your deck for a pokemon and switch it with this pokemon\. any attached cards[^.]+\. if you switched a pokemon in this way, put this card into your deck\. then, shuffle your deck\./, approx: true, build: () => coin([post({ op: 'mimic' })], []) },
  { mech: 'mimic', re: /^if this pokemon was attacked last turn, do the final result of that attack on this pokemon to foe\./, build: (_m, c) => { c.out.noDirect = true; return [pre({ op: 'bonusPer', per: 'hurt', amount: 10 }), post({ op: 'damage', amount: 0, wr: false })] } },
  { mech: 'mimic', re: /^choose a supporter card from your opponent's discard pile and use the effect of that card as the effect of this attack\./, approx: true, build: () => [cast({ op: 'gainEnergy', count: 2 })] },
  { mech: 'extraTurn', re: /^take another turn after this one\./, approx: true, build: () => [cast({ op: 'gainEnergy', count: 3 })] },
  { mech: 'extraTurn', re: /^if 1 of your pokemon used [\w ]+ during your last turn, this attack can't be used\./, build: () => [cast({ op: 'exhaust', ticks: 2 * TURN, which: 'this' })] },
  { mech: 'weaken', re: /^(?:until the end of your next turn, )?foe's weakness is now \w+(?: until the end of your next turn)?\./, approx: true, build: () => [post({ op: 'buff', stat: 'defense', amount: -30, ticks: 2 * TURN, target: 'target' })] },
  { mech: 'weaken', re: /^if foe has a weakness, you may change it to a type of your choice other than colorless\./, approx: true, build: () => [post({ op: 'buff', stat: 'defense', amount: -20, ticks: 3 * TURN, target: 'target' })] },
  { mech: 'prevent', re: /^change this pokemon's resistance to a type of your choice other than colorless\./, approx: true, build: () => [cast({ op: 'buff', stat: 'defense', amount: 20, ticks: 3 * TURN })] },
  { mech: 'prevent', re: /^during your opponent's next turn, if this pokemon is knocked out, your opponent can't take any prize cards for it\./, approx: true, build: () => [cast({ op: 'buff', stat: 'defense', amount: 20, ticks: TURN })] },
  { mech: 'prevent', re: /^then if, during your opponent's next turn, this pokemon would be knocked out by an attack, [^.]+\./, approx: true, build: () => [cast({ op: 'buff', stat: 'defense', amount: 60, ticks: TURN })] },
  { mech: 'disrupt', re: /^until this pokemon leaves play, it gains an ability that has the effect "[^"]+"\./, approx: true, build: () => [post({ op: 'dispel' }), post({ op: 'energyJam', ticks: TURN })] },
  { mech: 'disrupt', re: /^(?:add the top (\d+) cards of your opponent's deck to their prize cards|both players shuffle their prize cards into their decks\. then, each player puts the top (\d+) cards of their deck face down as their prize cards)\./, approx: true, build: () => [post({ op: 'energyJam', ticks: 2 * TURN })] },
  { mech: 'disrupt', re: /^each player reveals their hand\. if a card in your opponent's hand has the same name as a card in your hand, this attack does (\d+) more damage\./, approx: true, build: (m) => [pre({ op: 'chance', permille: 400, then: [{ op: 'bonus', amount: n(m[1]) }] })] },
  { mech: 'bounty', re: /^take a prize card\./, approx: true, build: (_m, c) => { c.out.noDirect = true; return [post({ op: 'counters', amount: 60 })] } },
  { mech: 'execute', re: /^that pokemon is knocked out\./, build: () => [post({ op: 'execute', hp: 100000 })] },
  { mech: 'counters', re: /^put (\d+) damage counters on (\d+) of your pokemon\./, build: (m) => [cast({ op: 'counters', amount: 10 * n(m[1]), target: 'self' })] },
  { mech: 'status', re: /^put (\d+) damage counters on that pokemon instead of \d+ during pokemon checkup\./, approx: true, build: (m) => [post({ op: 'counters', amount: 10 * n(m[1]) - 10 })] },
  { mech: 'scaling', re: /^does (\d+) damage plus (\d+) damage times the number of (.+?)\./, build: (m, c) => per(m[3], n(m[2]), c) },
  { mech: 'combo', re: /^you can use this attack only if this pokemon used [\w ]+ during your last turn\./, approx: true, build: () => [] },
  { mech: 'selfDamage', re: /^(?:does|do) (\d+) damage to this pokemon\./, build: (m) => [cast({ op: 'selfDamage', amount: n(m[1]) })] },
  { mech: 'bench', re: /^(?:do|does) (\d+) damage to each benched pokemon\./, build: (m) => [post({ op: 'benchDamage', amount: n(m[1]) }), cast({ op: 'benchDamage', amount: n(m[1]), side: 'self' })] },
  { mech: 'ignoreWR', re: /^this attack's damage isn't affected by weakness, resistance, pokemon powers, or any other effects on foe\./, build: (_m, c) => { c.out.wr = false; c.out.pierce = true; return [] } },
  { mech: 'bench', re: /^choose (\d+) of your opponent's pokemon (\d+) times\. for each time you chose a pokemon, do (\d+) damage to it\.(?: this damage isn't affected by weakness or resistance\.)?/, build: (m, c) => { c.out.noDirect = true; c.out.wr = false; return [post({ op: 'damage', amount: n(m[3]) * n(m[2]) })] } },
  { mech: 'gust', re: /^(?:devolve it by putting the highest stage evolution card on it into your opponent's hand|shuffle foe and all (?:attached cards|cards attached to it) into their deck|put it and all attached cards into your opponent's hand)\.(?: if your opponent has no benched pokemon, this attack does nothing\.)?/, approx: true, build: () => [post({ op: 'gust', mode: 'push', px: 200 }), post({ op: 'counters', amount: 30 })] },
  { mech: 'disrupt', re: /^during your opponent's next turn, whenever they try to use a trainer card from their hand, they flip a coin\. if tails, [^.]+\./, build: () => [post({ op: 'energyJam', ticks: TURN })] },
  { mech: 'status', re: /^if foe doesn't have a char counter on it, flip a coin\. if heads, put a char counter on it\. a char counter [^.]+\. if tails, [^.]+\./, approx: true, build: () => [post({ op: 'coin', heads: [{ op: 'status', status: 'burned' }] })] },
  { mech: 'retreatLock', re: /^until the end of your (?:opponent's )?next turn, as long as this pokemon is your active pokemon, foe can't retreat, and [^.]+\./, build: () => [post({ op: 'retreatLock', ticks: 2 * TURN })] },
  { mech: 'flavor', flavor: true, re: /^(?:then, shuffle your deck|shuffle your deck afterward|if you go second and it's your first turn, instead [^.]+|if the total of both players' remaining prize cards is exactly \d+, this attack can be used for \w+)\./, build: () => [] },

  // ---- no arena meaning (on purpose)
  { mech: 'flavor', flavor: true, re: /^(?:discard the top (?:\d+ )?cards? (?:of|from) your deck|put the top (\d+) cards of your deck in the lost zone|your opponent reveals their hand|look at the top (\d+) cards of either player's deck and (?:rearrange them as you like|put them back in any order)|look at the top card of your opponent's deck\. you may have your opponent shuffle their deck|shuffle (?:up to (\d+)|(\d+)) [^.]*from your discard pile into your deck|then, shuffle (?:those|all)[^.]+ into your deck|if you have exactly (?:\d+, )*\d+,? or \d+ prize cards remaining, discard the top (\d+) cards of your deck|all pokemon powers stop working until the end of your next turn)\./, build: () => [] },
]

// multi-sentence specials that start like a plain coin flip: tried before everything
RULES.unshift(
  ...RULES.filter((r) => r.mech === 'mimic' && /^\/\^flip/.test(String(r.re))),
  { mech: 'disrupt', re: /^during your opponent's next turn, whenever they try to use a trainer card from their hand, they flip a coin\. if tails, [^.]+\./, build: () => [post({ op: 'energyJam', ticks: TURN })] },
)
RULES.push(
  { mech: 'heal', re: /^remove all damage counters from (\d+) of your pokemon\./, build: () => [cast({ op: 'heal', amount: 1000 })] },
  { mech: 'extraTurn', approx: true, re: /^if your opponent's pokemon is knocked out by this attack, take another turn after this one\./, build: () => [post({ op: 'gainEnergy', count: 2 })] },
)
// generic fallbacks, tried after every specific rule
RULES.push(
  { mech: 'coins', approx: true, re: /^flip (\d+) coins\. (?:if either of them is heads, )?(.+?)\./, build: (m, c) => { c.lastCoins = n(m[1]); const body = parseClause(m[2], c); return body.length ? coins(n(m[1]), body) : null } },
  { mech: 'conditional', re: /^if (.+?), (.+?)\./, build: (m, c) => {
    const k = condOf(m[1])
    if (!k) return null
    const body = parseClause(m[2], c)
    if (!body.length) return null
    return cond(m[1], flatHit(body), c)
  } },
)

function binom(nn: number, k: number): number {
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (nn - k + i)) / i
  return r
}

/** the effects of emits, flattened into one hit-side list (coin branches run in onHit unless cast-only) */
function flat(list: Emit[]): Effect[] {
  return list.filter((x) => x.slot !== 'impact').map((x) => x.e)
}
function flatHit(list: Emit[]): Effect[] {
  return flat(list)
}

/** a coin with branches: placed in onCast when both branches are caster-only, else in onHit (before the damage op
 * if a branch changes the damage). "If tails, this attack does nothing" + target effects on heads: the coin fizzles
 * the cast on tails, and the heads effects run unconditionally on hit (a hit means heads) */
function coin(heads: Emit[], tails: Emit[]): Emit[] {
  const isFizzle = (l: Emit[]) => l.length === 1 && l[0].e.op === 'fizzle'
  if (isFizzle(tails) && heads.some((x) => x.slot !== 'cast')) return [cast({ op: 'coin', tails: [{ op: 'fizzle' }], heads: heads.filter((x) => x.slot === 'cast').map((x) => x.e) }), ...heads.filter((x) => x.slot !== 'cast')]
  if (isFizzle(heads) && tails.some((x) => x.slot !== 'cast')) return [cast({ op: 'coin', heads: [{ op: 'fizzle' }], tails: tails.filter((x) => x.slot === 'cast').map((x) => x.e) }), ...tails.filter((x) => x.slot !== 'cast')]
  const all = [...heads, ...tails]
  const slot: Slot = all.some((x) => x.slot === 'pre') ? 'pre' : all.some((x) => x.slot === 'post') ? 'post' : 'cast'
  const e: Effect = { op: 'coin' }
  if (heads.length) e.heads = flat(heads)
  if (tails.length) e.tails = flat(tails)
  if (!heads.length && !tails.length) return []
  const out: Emit[] = [{ slot, e }]
  for (const x of all) if (x.slot === 'impact') out.push(x)
  return out
}

function coins(count: number, each: Emit[]): Emit[] {
  if (!each.length) return []
  const slot: Slot = each.some((x) => x.slot === 'pre') ? 'pre' : each.some((x) => x.slot === 'post') ? 'post' : 'cast'
  return [{ slot, e: { op: 'coins', count, perHeads: flat(each) } }]
}

function per(x: string, amount: number, c: Ctx): Emit[] | null {
  const p = perOf(x.replace(/^(?:basic )?(?:\w+ )?energy cards? attached to/, 'energy attached to').replace(/^the (?:amount|number) of /, ''))
  if (!p) return null
  if (p.approx) c.out.approx.push('scaling')
  const e: Emit[] = [pre({ op: 'bonusPer', per: p.per, amount })]
  if (p.plusOne) e.push(pre({ op: 'bonus', amount }))
  return e
}

function cond(phrase: string, then: Effect[], c: Ctx, after: Emit[] = []): Emit[] | null {
  const k = condOf(phrase)
  if (!k) return null
  const w = whenOf(k, then)
  if (w.approx) c.out.approx.push('conditional')
  // a condition that reads the foe goes on hit; one about the caster could be onCast, but a bonus must be on hit
  return [pre(w.e), ...after]
}

// ------------------------------------------------------------------ normalizing and the clause loop
/** the name variants a card uses for itself in its text ("Charizard VSTAR" -> also "Charizard") */
export function selfNames(name: string): string[] {
  const out = new Set<string>([name])
  const base = name.replace(/\s*(?:VMAX|VSTAR|V|-GX| GX|-EX| EX| ex| δ)$/, '').trim()
  out.add(base)
  out.add(base.replace(/^(?:Radiant|Alolan|Galarian|Hisuian|Dark|Light|Shining|Origin Forme|Single Strike|Rapid Strike) /, ''))
  return [...out].filter((x) => x.length >= 3).sort((a, b) => b.length - a.length)
}

export function normalize(text: string, name: string): string {
  let t = ' ' + text.replace(/\s+/g, ' ') + ' '
  for (const nm of selfNames(name)) {
    const esc = nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    t = t.replace(new RegExp(`(?<![\\w-])${esc}(?![\\w-])`, 'g'), 'this Pokemon')
  }
  // plain ASCII "pokemon" so \w-based patterns work (é is not a word character)
  t = t.toLowerCase().replace(/pokémon/g, 'pokemon').replace(/poké-/g, 'poke-')
  t = t.replace(/\s*\((?:[^()]|\([^()]*\))*\)/g, '') // reminder text
  t = t.replace(/pokemon-(gx|ex)/g, 'pokemon $1')
  t = t.replace(/\b(?:the defending pokemon|your opponent's active pokemon)\b/g, 'foe')
  t = t.replace(/\bthis pokemon's\b/g, "this pokemon's")
  t = t.replace(/(\d)\s*×/g, '$1')
  t = t.replace(/\s+/g, ' ').replace(/ \./g, '.').trim()
  if (t && !/[.]$/.test(t)) t += '.'
  return t
}

/** parse a clause body (a coin branch, a condition's result) with the same rules */
function parseClause(body: string, c: Ctx): Emit[] {
  let t = body.trim()
  if (!t) return []
  if (/^this attack does nothing(?: \(not even damage\))?$/.test(t)) return [cast({ op: 'fizzle' })]
  if (/^(?:this attack|that attack) does nothing/.test(t)) return [cast({ op: 'fizzle' })]
  let m: RegExpMatchArray | null
  if ((m = t.match(/^(?:this attack does (\d+) (?:more damage|damage plus (\d+) more damage)|does (\d+) (?:more damage|damage plus (\d+) more damage))(?:,? and,? (.+))?$/))) {
    const bonus = n(m[2] ?? m[4] ?? (m[1] ?? m[3]))
    const rest = m[5] ? parseClause(m[5], c) : []
    return [pre({ op: 'bonus', amount: bonus }), ...rest]
  }
  if ((m = t.match(/^this attack does (\d+) damage(?: and this pokemon does (\d+) damage to itself| plus this pokemon does (\d+) damage to itself)?$/))) return m[2] || m[3] ? [cast({ op: 'selfDamage', amount: n(m[2] ?? m[3]) })] : []
  if ((m = t.match(/^this attack does (\d+) damage plus (\d+) more damage and does (\d+) damage to this pokemon$/))) return [pre({ op: 'bonus', amount: n(m[2]) }), cast({ op: 'selfDamage', amount: n(m[3]) })]
  if (!/[.]$/.test(t)) t += '.'
  const saved = c.out.leftovers.length
  const mechs = c.out.mechs.length
  const out = consume(t, c)
  if (c.out.leftovers.length === saved) return out
  // "X and Y": try the two halves as clauses of their own
  c.out.leftovers.length = saved
  c.out.mechs.length = mechs
  const body0 = t.slice(0, -1)
  for (let i = body0.indexOf(' and '); i >= 0; i = body0.indexOf(' and ', i + 1)) {
    const left = body0.slice(0, i), right = body0.slice(i + 5)
    const l = consume(left + '.', c)
    const okL = c.out.leftovers.length === saved
    const r = okL ? consume(right + '.', c) : []
    if (okL && c.out.leftovers.length === saved) return [...l, ...r]
    c.out.leftovers.length = saved
    c.out.mechs.length = mechs
  }
  // a clause that didn't parse is one leftover (the whole clause)
  c.out.leftovers.push(body.trim())
  return consume(t, { ...c, out: { ...c.out, leftovers: [], mechs: [], approx: [] } })
}

function consume(text: string, c: Ctx): Emit[] {
  let t = text.trim()
  const out: Emit[] = []
  while (t) {
    let hit = false
    for (const r of RULES) {
      const m = t.match(r.re)
      if (!m) continue
      const got = r.build(m, c)
      if (got === null) continue
      out.push(...got)
      c.out.mechs.push(r.mech)
      if (r.approx) c.out.approx.push(r.mech)
      t = t.slice(m[0].length).trim()
      hit = true
      break
    }
    if (hit) continue
    const end = t.indexOf('. ')
    const sentence = end < 0 ? t : t.slice(0, end + 1)
    c.out.leftovers.push(sentence)
    t = end < 0 ? '' : t.slice(end + 2).trim()
  }
  return out
}

/** parse an attack's rules text (the card's own name is needed to find "this Pokémon") */
export function parseAttackText(text: string | undefined, cardName: string): ParsedText {
  const out: ParsedText = { onCast: [], pre: [], post: [], onImpact: [], wr: true, pierce: false, perUnit: false, noDirect: false, mechs: [], approx: [], leftovers: [] }
  if (!text || !text.trim()) return out
  const c: Ctx = { lastCoins: 0, out }
  for (const e of consume(normalize(text, cardName), c)) {
    if (e.slot === 'cast') out.onCast.push(e.e)
    else if (e.slot === 'pre') out.pre.push(e.e)
    else if (e.slot === 'post') out.post.push(e.e)
    else out.onImpact.push(e.e)
  }
  return out
}
