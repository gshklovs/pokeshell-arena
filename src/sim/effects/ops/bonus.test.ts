import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, testMatch } from '../../testing'

it('bonus: adds to the cast bonus', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  expect(applyEffects(m, [{ op: 'bonus', amount: 60 }, { op: 'bonus', amount: -10 }]).bonus).toBe(50)
})
