import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, hp, testMatch } from '../../testing'

it('shield: absorbs attack damage up to its amount, not self damage', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  applyEffects(m, [{ op: 'shield', amount: 30, ticks: 90, target: 'target' }])
  applyEffects(m, [{ op: 'damage', amount: 20 }])
  expect(hp(m, 1)).toBe(100)
  applyEffects(m, [{ op: 'damage', amount: 20 }])
  expect(hp(m, 1)).toBe(90)
  // an unlimited shield (Withdraw) on the caster
  applyEffects(m, [{ op: 'shield', ticks: 90 }])
  expect(m.s.players[0].fighter.shield?.t).toBe(90)
})
