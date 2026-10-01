import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, hp, testMatch } from '../../testing'

it('chance: 0 permille never, 1000 always', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  applyEffects(m, [{ op: 'chance', permille: 0, then: [{ op: 'damage', amount: 10 }], else: [{ op: 'damage', amount: 1 }] }])
  applyEffects(m, [{ op: 'chance', permille: 1000, then: [{ op: 'damage', amount: 10 }] }])
  expect(hp(m, 1)).toBe(89)
})
