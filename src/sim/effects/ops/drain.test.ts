import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, hp, testMatch } from '../../testing'

it('drain: heals a share of the damage just dealt, rounded up to 10', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  m.s.players[0].members[0].hp = 20
  applyEffects(m, [{ op: 'damage', amount: 50 }, { op: 'drain', permille: 500 }])
  expect(hp(m, 1)).toBe(50)
  expect(hp(m, 0)).toBe(50) // 25 -> 30
  applyEffects(m, [{ op: 'shield', ticks: 60, target: 'target' }, { op: 'damage', amount: 50 }, { op: 'drain', permille: 1000 }])
  expect(hp(m, 0)).toBe(50) // nothing dealt, nothing healed
})
