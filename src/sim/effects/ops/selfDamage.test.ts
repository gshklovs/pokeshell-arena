import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, hp, testMatch } from '../../testing'
import { validateEffects } from '../registry'

it('selfDamage: hurts the caster, no weakness', () => {
  const m = testMatch(fixtureKit({ element: 'Fire', shape: { kind: 'self' } }, { weaknesses: [{ type: 'Fire', value: '×2' }] }), fixtureKit({ shape: { kind: 'self' } }))
  applyEffects(m, [{ op: 'selfDamage', amount: 10 }])
  expect(hp(m, 0)).toBe(90)
  expect(hp(m, 1)).toBe(100)
  expect(validateEffects([{ op: 'selfDamage', amount: 0 }], 'x')).toHaveLength(1)
})
