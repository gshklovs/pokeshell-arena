import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, hp, testMatch } from '../../testing'

it('counters: direct damage that ignores weakness and shields', () => {
  const m = testMatch(fixtureKit({ element: 'Fire', shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }, { weaknesses: [{ type: 'Fire', value: '×2' }] }))
  applyEffects(m, [{ op: 'shield', ticks: 90, target: 'target' }, { op: 'counters', amount: 30 }])
  expect(hp(m, 1)).toBe(70)
  applyEffects(m, [{ op: 'counters', amount: 20 }], { target: -1 }) // no target: the first foe
  expect(hp(m, 1)).toBe(50)
  applyEffects(m, [{ op: 'counters', amount: 10, target: 'self' }])
  expect(hp(m, 0)).toBe(90)
})
