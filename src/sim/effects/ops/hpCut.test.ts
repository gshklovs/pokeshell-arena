import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, hp, testMatch } from '../../testing'

it('hpCut: half the remaining HP, rounded up to 10, ignoring weakness', () => {
  const m = testMatch(fixtureKit({ element: 'Fire', shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }, { hp: 130, weaknesses: [{ type: 'Fire', value: '×2' }] }))
  applyEffects(m, [{ op: 'hpCut', permille: 500 }])
  expect(hp(m, 1)).toBe(60) // 65 -> 70
  applyEffects(m, [{ op: 'hpCut', permille: 500 }])
  expect(hp(m, 1)).toBe(30)
})
