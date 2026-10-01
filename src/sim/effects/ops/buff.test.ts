import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, hp, testMatch } from '../../testing'

it('buff: damage adds to attacks, defense reduces them', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  applyEffects(m, [{ op: 'buff', stat: 'damage', amount: 30, ticks: 60 }])
  applyEffects(m, [{ op: 'buff', stat: 'defense', amount: 10, ticks: 60, target: 'target' }])
  applyEffects(m, [{ op: 'damage', amount: 20 }])
  expect(hp(m, 1)).toBe(60)
})
