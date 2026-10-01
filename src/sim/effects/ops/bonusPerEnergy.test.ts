import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, testMatch } from '../../testing'

it('bonusPerEnergy: +amount per unspent pip, up to max', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  m.s.players[0].pips = [3]
  expect(applyEffects(m, [{ op: 'bonusPerEnergy', type: 'Water', amount: 10, max: 2 }]).bonus).toBe(20)
  expect(applyEffects(m, [{ op: 'bonusPerEnergy', amount: 10, max: 5 }]).bonus).toBe(30)
})
