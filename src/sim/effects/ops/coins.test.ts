import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, hp, testMatch } from '../../testing'

it('coins: flips count coins and runs perHeads once per heads', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }, { hp: 1000 }))
  applyEffects(m, [{ op: 'coins', count: 4, perHeads: [{ op: 'damage', amount: 20 }] }])
  const heads = m.s.events.filter((e) => e.k === 'coin' && e.heads).length
  expect(m.s.events.filter((e) => e.k === 'coin')).toHaveLength(4)
  expect(hp(m, 1)).toBe(1000 - 20 * heads)
})
