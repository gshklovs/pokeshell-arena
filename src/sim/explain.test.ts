// The "in the arena" explainer has a sentence for every effect op, and reads every kit's effects without a gap.
import { describe, expect, it } from 'vitest'
import { opNames, validateEffects } from './effects/registry'
import { EXPLAIN, explainAttack, explainEffect, explainEffects } from './explain'
import { resolveKit } from './kit'
import type { Effect, Kit } from './types'

const kits = import.meta.glob<Kit>('/data/kits/*.json', { eager: true, import: 'default' })

/** one valid example of every op (validated below, so these stay in step with the ops' params) */
const SAMPLES: Record<string, Effect> = {
  benchDamage: { op: 'benchDamage', amount: 20 },
  blind: { op: 'blind', ticks: 90 },
  bonus: { op: 'bonus', amount: 30 },
  chain: { op: 'chain', permille: 300 },
  bonusPer: { op: 'bonusPer', per: 'myEnergy', amount: 10, max: 5 },
  bonusPerEnergy: { op: 'bonusPerEnergy', amount: 10, max: 2 },
  bounty: { op: 'bounty', prizes: 1 },
  buff: { op: 'buff', stat: 'defense', amount: 20, ticks: 90 },
  chance: { op: 'chance', permille: 300, then: [{ op: 'status', status: 'paralyzed' }] },
  cleanse: { op: 'cleanse' },
  coin: { op: 'coin', heads: [{ op: 'status', status: 'paralyzed' }] },
  coins: { op: 'coins', count: 2, perHeads: [{ op: 'bonus', amount: 30 }] },
  coinsUntilTails: { op: 'coinsUntilTails', perHeads: [{ op: 'bonus', amount: 20 }] },
  counters: { op: 'counters', amount: 30 },
  damage: { op: 'damage', amount: 30 },
  discardEnergy: { op: 'discardEnergy', count: 1 },
  dispel: { op: 'dispel' },
  drain: { op: 'drain', permille: 500 },
  energyJam: { op: 'energyJam', ticks: 90 },
  execute: { op: 'execute', hp: 30 },
  exhaust: { op: 'exhaust', ticks: 90 },
  fizzle: { op: 'fizzle' },
  flinch: { op: 'flinch', ticks: 12, interrupt: true },
  gainEnergy: { op: 'gainEnergy', count: 1 },
  gust: { op: 'gust' },
  heal: { op: 'heal', amount: 30 },
  hpCut: { op: 'hpCut', permille: 500 },
  invulnerable: { op: 'invulnerable', ticks: 60 },
  knockback: { op: 'knockback', px: 80 },
  mimic: { op: 'mimic' },
  paint: { op: 'paint', terrain: 'fire', radius: 80 },
  pull: { op: 'pull', px: 80 },
  retreat: { op: 'retreat' },
  retreatLock: { op: 'retreatLock', ticks: 90 },
  selfDamage: { op: 'selfDamage', amount: 10 },
  shield: { op: 'shield', ticks: 90 },
  slow: { op: 'slow', permille: 300, ticks: 90 },
  spendEnergy: { op: 'spendEnergy', max: 3, amount: 20 },
  status: { op: 'status', status: 'burned' },
  thorns: { op: 'thorns', amount: 20, ticks: 90 },
  when: { op: 'when', cond: 'foeDamaged', then: [{ op: 'bonus', amount: 30 }] },
}

describe('the attack explainer', () => {
  it('has a sentence for every op kind', () => {
    for (const op of opNames()) {
      expect(EXPLAIN[op], `no sentence for op "${op}" (add one to src/sim/explain.ts)`).toBeTypeOf('function')
      const e = SAMPLES[op]
      expect(e, `no sample for op "${op}" in explain.test.ts`).toBeTruthy()
      expect(validateEffects([e], op)).toEqual([])
      const text = explainEffect(e)
      expect(text.length, op).toBeGreaterThan(5)
      expect(text, op).not.toMatch(/undefined|NaN|no description/)
    }
  })

  it('reads the damage-scaling ops the way a player would', () => {
    expect(explainEffect({ op: 'bonusPerEnergy', amount: 10, max: 5 })).toBe('+10 per energy you have left after paying (up to 5)')
    expect(explainEffect(SAMPLES.coins)).toBe('flip 2 coins: +30 damage per heads')
    expect(explainEffect({ op: 'paint', terrain: 'fire', radius: 80 })).toMatch(/^burns the ground/)
    expect(explainEffects([{ op: 'damage', amount: 30 }, SAMPLES.coin])).toBe('hits for 30, flip a coin: heads, paralyzes the foe (no moving or attacking for 1.5 s)')
  })

  it('explains every attack of every kit with no gaps', () => {
    let n = 0
    for (const [path, k] of Object.entries(kits)) {
      // kits leave the numbers to the card: stand-ins for the ones a card would give
      const fk = resolveKit(null, { ...k, stats: { hp: 100, ...k.stats }, attacks: k.attacks.map((a) => ({ cost: ['Colorless'], ...a })) })
      for (const a of fk.attacks) {
        const x = explainAttack(a)
        const all = [x.shape, ...x.does, x.curve].join(' | ')
        expect(all, `${path} ${a.name}`).not.toMatch(/undefined|NaN|no description/)
        expect(x.shape, `${path} ${a.name}`).toMatch(/cooldown/)
        n++
      }
    }
    expect(n).toBeGreaterThan(500)
  })
})
