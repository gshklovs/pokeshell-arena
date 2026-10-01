import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, testMatch } from '../../testing'

it('coinsUntilTails: runs perHeads once per heads, stops at the first tails or max', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  let total = 0
  for (let i = 0; i < 100; i++) {
    const c = applyEffects(m, [{ op: 'coinsUntilTails', max: 5, perHeads: [{ op: 'bonus', amount: 10 }] }])
    const flips = m.s.events.filter((e) => e.k === 'coin')
    const heads = flips.filter((e) => e.k === 'coin' && e.heads).length
    expect(c.bonus).toBe(10 * heads)
    expect(heads).toBeLessThanOrEqual(5)
    if (heads < 5) expect(flips.length).toBe(heads + 1)
    total += heads
    m.s.events = []
  }
  expect(total).toBeGreaterThan(50) // about 1 per try on average
  expect(total).toBeLessThan(160)
})
