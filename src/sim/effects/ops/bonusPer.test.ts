import { expect, it } from 'vitest'
import { BONUS_CAP, VIRTUAL_BENCH } from '../../rules'
import { applyEffects, fixtureKit, testMatch } from '../../testing'

const pair = () => testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }, { retreat: 3 }))

it('bonusPer: counts pips, damage counters, retreat, with max and a negative amount', () => {
  const m = pair()
  m.s.players[1].pips = [5]
  expect(applyEffects(m, [{ op: 'bonusPer', per: 'foeEnergy', amount: 20 }]).bonus).toBe(100)
  expect(applyEffects(m, [{ op: 'bonusPer', per: 'foeEnergy', amount: 20, max: 2 }]).bonus).toBe(40)
  m.s.players[0].members[0].hp = 60
  expect(applyEffects(m, [{ op: 'bonusPer', per: 'myDamage', amount: 10 }]).bonus).toBe(40)
  expect(applyEffects(m, [{ op: 'bonusPer', per: 'myDamage', amount: -10 }]).bonus).toBe(-40)
  expect(applyEffects(m, [{ op: 'bonusPer', per: 'foeRetreat', amount: 30 }]).bonus).toBe(90)
})
it('bonusPer: a 1v1 counts a virtual bench and prizes from HP lost; no max caps the total', () => {
  const m = pair()
  expect(applyEffects(m, [{ op: 'bonusPer', per: 'bothBench', amount: 10 }]).bonus).toBe(20 * VIRTUAL_BENCH)
  m.s.players[1].members[0].hp = 50 // half the foe's HP: 3 of 6 prizes
  expect(applyEffects(m, [{ op: 'bonusPer', per: 'myPrizes', amount: 10 }]).bonus).toBe(30)
  m.s.players[1].pips = [10]
  expect(applyEffects(m, [{ op: 'bonusPer', per: 'foeEnergy', amount: 100 }]).bonus).toBe(BONUS_CAP)
})
