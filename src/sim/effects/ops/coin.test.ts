import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, hp, testMatch } from '../../testing'
import { validateEffects } from '../registry'

it('coin: runs heads or tails from the sim PRNG, roughly half each, and logs the flip', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }, { hp: 10000 }))
  for (let i = 0; i < 200; i++) applyEffects(m, [{ op: 'coin', heads: [{ op: 'damage', amount: 10 }], tails: [] }])
  const heads = (10000 - hp(m, 1)) / 10
  expect(heads).toBeGreaterThan(70)
  expect(heads).toBeLessThan(130)
  expect(m.s.events.filter((e) => e.k === 'coin')).toHaveLength(200)
})
it('coin: validates nested lists', () => {
  expect(validateEffects([{ op: 'coin' }], 'x')).toHaveLength(1)
  expect(validateEffects([{ op: 'coin', heads: [{ op: 'nope' }] }], 'x')[0]).toContain('heads[0]')
})
