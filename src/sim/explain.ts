// Plain-language "in the arena" lines for attacks, generated from the resolved kit (shape + effect ops), for the
// attack sheets (loadout, reveal, the in-battle peek). One sentence per op kind; a nested list (coins, when, chance)
// reads its children. Pure and DOM-free. The explain test fails when an op has no sentence here.
import { STYLE_WHAT, isStyle } from './melee'
import * as R from './rules'
import type { Effect, ResolvedAttack } from './types'

const TILE = 40
const tiles = (px: number) => { const t = Math.round((px / TILE) * 2) / 2; return `${t} tile${t === 1 ? '' : 's'}` }
const secs = (ticks: number) => { const v = ticks / 60; return `${v >= 10 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)} s` }
const pct = (permille: number) => `${Math.round(permille / 10)}%`
const num = (p: Effect, k: string, d = 0) => (typeof p[k] === 'number' ? (p[k] as number) : d)
const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`)
const who = (p: Effect, dflt: 'target' | 'self', foe = 'the foe', me = 'you') => (((p.target as string | undefined) ?? dflt) === 'self' ? me : foe)
const count = (n: number, one: string, many = `${one}s`) => `${n === 15 ? 'all' : n} ${n === 1 ? one : many}`

/** what a `bonusPer` counts */
const PER: Record<string, string> = {
  myEnergy: 'energy you have left after paying', myAttached: 'energy it cost plus the energy you have left', foeEnergy: "energy the foe has", bothEnergy: 'energy you both have',
  myDamage: '10 damage you have taken', foeDamage: '10 damage the foe has taken', myBench: 'Pokémon on your bench (2 in a 1v1)',
  foeBench: "Pokémon on the foe's bench (2 in a 1v1)", bothBench: 'benched Pokémon on both sides (2 each in a 1v1)',
  myPrizes: 'prize you have taken (your KOs; in a 1v1 each sixth of the foe\'s HP)', foePrizes: 'prize the foe has taken',
  turns: 'turn (1.5 s) the fight has lasted', foeStatus: 'condition on the foe', hurt: '10 damage you took in the last 3 s',
  foeRetreat: "point of the foe's retreat cost", myTypes: 'type on your team', myPrizesLeft: 'prize you still need',
}

/** a `when` condition */
function cond(p: Effect): string {
  const n = num(p, 'n', 1)
  switch (p.cond) {
    case 'selfDamaged': return 'you are damaged'
    case 'foeDamaged': return 'the foe is damaged'
    case 'selfHurt': return 'you were hit in the last 3 s'
    case 'allyKo': return 'one of yours was KO\'d in the last 3 s'
    case 'fresh': return 'you came in within the last 3 s'
    case 'foeFresh': return 'the foe came in within the last 3 s'
    case 'foeStatus': return 'the foe has a condition'
    case 'foeAsleep': return 'the foe is asleep'
    case 'foeIs': return `the foe is ${/^[AEIOU]/.test(String(p.kind)) ? 'an' : 'a'} ${p.kind === 'Rule' ? 'rule-box' : p.kind} Pokémon`
    case 'hasEnergy': return n <= 1 ? 'you have energy left' : `you have ${n}+ energy left`
    case 'foeEnergy': return n <= 1 ? 'the foe has energy' : `the foe has ${n}+ energy`
    case 'stadium': return 'you stand on painted ground, grass or lava'
    case 'foeBuffed': return 'the foe has a shield or buff'
    case 'selfBuffed': return 'you have a shield or buff'
    case 'usedVstar': return 'you used your VSTAR power'
    case 'prizesLeft': return `you need ${n} or fewer prizes`
    case 'foePrizesLeft': return `the foe needs ${n} or fewer prizes`
    case 'samePips': return 'you and the foe have the same energy'
    case 'noPips': return 'you have no energy left'
    case 'late': return `the fight has lasted ${secs(n * R.TURN)}`
    default: return String(p.cond)
  }
}

const STATUS: Record<string, [string, string]> = {
  paralyzed: ['paralyzes', `(no moving or attacking for ${secs(R.PARALYZE_TICKS)})`],
  asleep: ['puts to sleep', '(a hit wakes it)'],
  confused: ['confuses', `(its attacks may fail, ${secs(R.CONFUSE_TICKS)})`],
  burned: ['burns', `(${R.BURN_DAMAGE} every ${secs(R.TURN)})`],
  poisoned: ['poisons', `(${R.POISON_DAMAGE} every ${secs(R.TURN)})`],
}

type Say = (p: Effect, list: (l: unknown) => string) => string

/** one sentence per op kind (the explain test checks every registered op has one) */
export const EXPLAIN: Record<string, Say> = {
  benchDamage: (p) => p.side === 'self'
    ? `${Math.trunc(num(p, 'amount') / 20) * 10} to yourself in a 1v1 (${num(p, 'amount')} to your bench in a team)`
    : `splashes ${num(p, 'amount')} (no weakness) on foes within ${tiles(num(p, 'radius', R.SPLASH_RADIUS))} · benched foes in a team`,
  blind: (p) => `blinds ${who(p, 'target')} for ${secs(num(p, 'ticks'))}: its attacks miss ${pct(num(p, 'permille', 500))} of the time`,
  bonus: (p) => `${signed(num(p, 'amount'))} damage`,
  bonusPer: (p) => `${signed(num(p, 'amount'))} per ${PER[p.per as string] ?? p.per}${p.max !== undefined ? ` (up to ${num(p, 'max')})` : ` (at most ${signed(R.BONUS_CAP)})`}`,
  bonusPerEnergy: (p) => `${signed(num(p, 'amount'))} per energy you have left after paying (up to ${num(p, 'max')})`,
  bounty: (p) => `a KO with it refunds ${2 * num(p, 'prizes', 1)} energy`,
  buff: (p) => {
    const a = num(p, 'amount'), t = secs(num(p, 'ticks')), mine = who(p, 'self') === 'you'
    if (p.stat === 'damage') return `${mine ? 'your' : "the foe's"} attacks do ${signed(a)} for ${t}`
    if (p.stat === 'speed') return `${mine ? 'you move' : 'the foe moves'} ${a >= 0 ? 'faster' : 'slower'} (${signed(Math.round(a / 10))}%) for ${t}`
    return a >= 0 ? `${mine ? 'you take' : 'the foe takes'} ${a} less damage for ${t}` : `${mine ? 'you take' : 'the foe takes'} ${-a} more damage for ${t}`
  },
  chain: (p) => `arcs on: another foe within ${tiles(num(p, 'radius', 160))} takes ${pct(num(p, 'permille'))} of it, and a foe in water takes that again`,
  chance: (p, l) => `${pct(num(p, 'permille'))} chance: ${l(p.then) || 'nothing'}${p.else ? `; otherwise ${l(p.else)}` : ''}`,
  cleanse: (p) => `cures ${who(p, 'self')} of every condition`,
  coin: (p, l) => `flip a coin: ${p.heads ? `heads, ${l(p.heads)}` : ''}${p.heads && p.tails ? '; ' : ''}${p.tails ? `tails, ${l(p.tails)}` : ''}`,
  coins: (p, l) => `flip ${num(p, 'count')} coins: ${l(p.perHeads)} per heads`,
  coinsUntilTails: (p, l) => `flip until tails (at most ${num(p, 'max', 10)}): ${l(p.perHeads)} per heads`,
  counters: (p) => `${num(p, 'amount') / 10} damage counters (${num(p, 'amount')}, no weakness or shields) on ${who(p, 'target', 'the foe', 'yourself')}`,
  damage: (p) => {
    const a = num(p, 'amount')
    const wr = p.wr === false || p.wr === 'none' ? ', no weakness or resistance' : p.wr === 'weakness' ? ', ignores resistance' : p.wr === 'resistance' ? ', ignores weakness' : ''
    return `${a > 0 ? `hits for ${a}` : 'hits for the bonus total'}${wr}${p.pierce === true ? ', through shields and defense' : ''}`
  },
  discardEnergy: (p) => (p.target === 'target' ? `the foe loses ${count(num(p, 'count', 1), 'energy', 'energy')}` : `you discard ${count(num(p, 'count', 1), 'energy', 'energy')} after paying`),
  dispel: (p) => `strips shields and buffs from ${who(p, 'target', 'the foe', 'yourself')}`,
  drain: (p) => `heals you ${pct(num(p, 'permille'))} of the damage it deals`,
  energyJam: (p) => `${who(p, 'target', "the foe's", 'your')} energy stops filling for ${secs(num(p, 'ticks'))}`,
  execute: (p) => `KOs the foe outright at ${num(p, 'hp')} HP or less`,
  exhaust: (p) => {
    const t = secs(num(p, 'ticks')), which = (p.which as string | undefined) ?? 'all'
    if (who(p, 'self') === 'you') return which === 'this' ? `this attack is locked for ${t}` : `you can't attack for ${t}`
    return which === 'best' ? `the foe's biggest attack is locked for ${t}` : `the foe can't attack for ${t}`
  },
  fizzle: () => 'the attack does nothing',
  flinch: (p) => `${who(p, 'target', 'the foe reels', 'you reel')} (can't move or attack) for ${secs(num(p, 'ticks'))}${p.interrupt === true ? ', breaking its windup' : ''}`,
  gainEnergy: (p) => `you gain ${count(num(p, 'count', 1), 'energy', 'energy')}`,
  gust: (p) => `${p.mode === 'push' ? 'pushes the foe' : 'yanks the foe'} ${tiles(num(p, 'px', 140))} ${p.mode === 'push' ? 'away' : 'toward you'} (a team: forces a swap)`,
  heal: (p) => (p.target === 'team' ? `heals ${num(p, 'amount')} on your whole team` : `heals ${who(p, 'self', 'the foe', 'you')} ${num(p, 'amount')}`),
  hpCut: (p) => `takes ${pct(num(p, 'permille'))} of the foe's remaining HP (no weakness)`,
  invulnerable: (p) => `you're untouchable for ${secs(num(p, 'ticks'))}`,
  knockback: (p) => `knocks the foe back ${tiles(num(p, 'px'))}`,
  mimic: () => "copies the foe's biggest printed damage",
  paint: (p) => {
    const where = `${tiles(num(p, 'radius'))} around${p.ticks !== undefined ? `, ${secs(num(p, 'ticks'))}` : ''}`
    switch (p.terrain) {
      case 'fire': return `burns the ground (${where})`
      case 'water': return `soaks the ground (${where}; shocks spread through it)`
      case 'shock': return `electrifies the ground (${where})`
      default: return `clears painted ground (${where})`
    }
  },
  pull: (p) => `pulls the foe ${tiles(num(p, 'px'))} toward you`,
  retreat: (p) => `you leap ${tiles(num(p, 'px', 160))} back, swap ready`,
  retreatLock: (p) => `${who(p, 'target', "the foe can't", "you can't")} swap or dodge for ${secs(num(p, 'ticks'))}`,
  selfDamage: (p) => `${R.selfDamageOf(num(p, 'amount'))} damage to yourself`,
  shield: (p) => `${p.amount === undefined ? 'blocks all damage' : `a ${num(p, 'amount')} shield`} on ${who(p, 'self', 'the foe', 'you')} for ${secs(num(p, 'ticks'))}`,
  slow: (p) => `slows ${who(p, 'target', 'the foe', 'you')} ${pct(num(p, 'permille'))} for ${secs(num(p, 'ticks'))}`,
  spendEnergy: (p) => (p.paid ? `counts the energy it cost and spends leftover energy, up to ${num(p, 'max')}: ${signed(num(p, 'amount'))} each` : `spends up to ${num(p, 'max')} leftover energy: ${signed(num(p, 'amount'))} each`),
  status: (p) => { const [v, why] = STATUS[p.status as string] ?? [`${p.status}`, '']; return `${v} ${who(p, 'target', 'the foe', 'you')} ${why}`.trim() },
  thorns: (p) => `for ${secs(num(p, 'ticks'))}, attackers take ${p.amount !== undefined ? num(p, 'amount') : `${pct(num(p, 'permille'))} of the damage they deal`}`,
  when: (p, l) => `if ${cond(p)}: ${p.then ? l(p.then) : 'nothing'}${p.else ? `; otherwise ${l(p.else)}` : ''}`,
}

/** an effect list as one phrase ("hits for 30, flip a coin: heads, paralyzes the foe") */
export function explainEffects(list: unknown): string {
  if (!Array.isArray(list)) return ''
  return (list as Effect[]).map(explainEffect).filter(Boolean).join(', ')
}

export function explainEffect(e: Effect): string {
  const say = EXPLAIN[e.op]
  return say ? say(e, explainEffects) : `${e.op} (no description yet)`
}

/** a trajectory (shape.path, docs/MOVES.md), as a trailing phrase */
const PATH: Record<string, string> = {
  lob: ', lobbed over walls (bursts where it lands)', boomerang: ', flies out and comes back', zigzag: ', zigzags',
  weave: ', weaves', spiral: ', corkscrews', bounce: ', ricochets off walls', phase: ', passes through walls',
  drift: ', drifts along the aim', leap: ', airborne (untouchable), crashes down where it lands', helix: ', braided around the aim line',
}

/** what a shot does where it ends and on the way (docs/MOVES.md "Signature moves"), as trailing phrases */
function extrasPhrase(atk: ResolvedAttack): string {
  const sh = atk.shape
  const n = (k: string, d = 0) => (typeof sh[k] === 'number' ? (sh[k] as number) : d)
  const bits: string[] = []
  if (sh.kind === 'projectile') {
    if (n('grow') > 0) bits.push(`swells as it flies (+${tiles(n('growMax', 8) * 2)} wide)`)
    if (n('fuse') > 0) bits.push(`${n('stick') > 0 ? 'clings to the foe it hits' : 'sticks where it lands'} and bursts ${secs(n('fuse'))} later (${tiles(n('blast', 60))} radius)`)
    else if (n('blast') > 0) bits.push(`bursts ${tiles(n('blast'))} around where it lands`)
    if (n('split') > 0) bits.push(`shatters into ${n('split')} shards (${pct(n('splitPower', 500))} damage each) where it ends`)
  }
  if (sh.kind === 'area' && n('count', 1) > 1 && n('scatter') > 0) bits.push(`${n('count')} impacts scattered ${tiles(n('scatter'))} around the aim point`)
  return bits.length ? `, ${bits.join(', ')}` : ''
}

/** the shape, as a short phrase */
export function explainShape(atk: ResolvedAttack): string {
  const traj = (PATH[atk.shape.path as string] ?? '') + (typeof atk.shape.homing === 'number' && atk.shape.homing > 0 ? ', curves gently toward the foe' : '')
  return shapePhrase(atk) + traj + extrasPhrase(atk) + meleePhrase(atk)
}

/** a melee style (melee.ts, docs/MELEE.md), as a trailing phrase: how the close attack plays */
function meleePhrase(atk: ResolvedAttack): string {
  const sh = atk.shape
  if (!isStyle(sh.style)) return ''
  const n = (k: string, d = 0) => (typeof sh[k] === 'number' ? (sh[k] as number) : d)
  const bits = [STYLE_WHAT[sh.style]]
  if (n('strikes', 1) > 1 && sh.style !== 'jab' && sh.style !== 'spin') bits.push(`${n('strikes')} strikes, the last lands the damage`)
  if (n('hold') > 0) bits.push(`holds the foe ${secs(n('hold'))}`)
  if (n('gnaw') > 0) bits.push(`+${n('gnaw')} when it lets go`)
  if (n('parry') > 0) bits.push(`a ${secs(n('parry'))} parry window`)
  if (n('flinch') > 0) bits.push(`the foe reels ${secs(n('flinch'))}${n('interrupt') ? ', breaking its windup' : ''}`)
  if (n('backstab')) bits.push('backstabs reel the foe')
  if (n('burnarc')) bits.push('scorches past its tip')
  return ` · ${bits.join(', ')}`
}

function shapePhrase(atk: ResolvedAttack): string {
  const sh = atk.shape
  const n = (k: string, d: number) => (typeof sh[k] === 'number' ? (sh[k] as number) : d)
  switch (sh.kind) {
    case 'projectile': {
      const c = n('count', 1)
      const what = n('wall', 0) > 0 ? `a wall ${tiles(2 * n('wall', 0))} wide rolling forward` : c > 1 ? `${c} shots` : 'a shot'
      return `${what}, ${tiles(n('range', 600))}${n('pierce', 0) > 0 ? `, passes through ${n('pierce', 0)}` : ''}`
    }
    case 'beam': return `a beam, ${tiles(n('length', 500))} long`
    case 'cone': return `a cone, ${tiles(n('range', 160))}`
    case 'melee': return `a melee swipe, ${tiles(n('range', 64) + n('lunge', 0))}${n('lunge', 0) ? ' with a lunge' : ''}`
    case 'area': {
      const ticks = Math.max(1, n('ticks', 1)), every = Math.max(1, n('every', 30))
      const pulses = ticks > every ? `, hits every ${secs(every)} for ${secs(ticks)}` : ''
      return `an area, ${tiles(n('radius', 80))} radius ${sh.at === 'aim' ? `at the aim point (up to ${tiles(n('range', 300))}, lands after ${secs(n('delay', R.AREA_TELEGRAPH))})` : 'around you'}${pulses}`
    }
    case 'terrain': return `ground ${tiles(n('radius', 80))} radius ${sh.at === 'aim' ? 'at the aim point' : 'around you'}`
    case 'self': return 'on yourself'
    case 'dash': return `a dash, ${tiles(n('distance', 200))}${sh.invulnerable !== 0 ? ', untouchable while dashing' : ''}`
    case 'summon': return 'a summon (not in the arena yet)'
    default: return String(sh.kind)
  }
}

export interface AttackExplained {
  /** "a beam, 16 tiles long · 0.3 s windup · 3.2 s cooldown" */
  shape: string
  /** what it does, in order: when cast, on hit, where it lands */
  does: string[]
  /** the balance curve on a big printed number ("120 → 100 in the arena"), else '' */
  curve: string
}

/** the "in the arena" explanation of an attack */
export function explainAttack(atk: ResolvedAttack): AttackExplained {
  // the timing model: a paid attack has no cooldown (the energy meter paces it), only a short recovery
  const cd = atk.cooldown > 0 ? `${secs(atk.cooldown)} cooldown` : `no cooldown · ${secs(atk.recovery)} recovery`
  const timing = `${secs(atk.windup)} windup · ${cd}${atk.oncePerMatch ? ` · once per match (${atk.oncePerMatch.toUpperCase()})` : ''}`
  const does: string[] = []
  const cast = explainEffects(atk.onCast), hit = explainEffects(atk.onHit), land = explainEffects(atk.onImpact)
  if (cast) does.push(`when cast: ${cast}`)
  if (hit) does.push(`on hit: ${hit}`)
  if (land) does.push(`where it lands: ${land}`)
  if (!does.length) does.push('no damage or effect')
  const base = atk.baseDamage
  const eff = base > 0 ? R.curve(R.DAMAGE_CURVE, base) : 0
  return { shape: `${explainShape(atk)} · ${timing}`, does, curve: eff && eff !== base ? `${base} hits for ${eff} in the arena (big hits are softened)` : '' }
}
