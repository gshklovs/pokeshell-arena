import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, testMatch } from '../../testing'
import { pipTotal } from '../pips'

it('spendEnergy: discards up to max pips, +amount each', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  m.s.players[0].pips = [2]
  expect(applyEffects(m, [{ op: 'spendEnergy', type: 'Fire', max: 3, amount: 50 }]).bonus).toBe(100)
  expect(pipTotal(m.s, 0)).toBe(0)
})
