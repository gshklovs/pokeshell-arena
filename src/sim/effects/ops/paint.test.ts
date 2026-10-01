import { expect, it } from 'vitest'
import { FP } from '../../fixed'
import { fixtureKit, testMatch, applyEffects } from '../../testing'
import { COLS } from '../../terrain'

it('paint: floods floor tiles around the point (never walls)', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  applyEffects(m, [{ op: 'paint', terrain: 'water', radius: 60 }], { target: -1, x: 500 * FP, y: 500 * FP })
  expect(m.s.wet[12 * COLS + 12]).toBeGreaterThan(0)
  expect(m.s.wet.filter((v) => v > 0).length).toBeGreaterThanOrEqual(5)
  applyEffects(m, [{ op: 'paint', terrain: 'water', radius: 100 }], { target: -1, x: 20 * FP, y: 20 * FP })
  expect(m.s.wet[0]).toBe(0)
  applyEffects(m, [{ op: 'paint', terrain: 'none', radius: 60 }], { target: -1, x: 500 * FP, y: 500 * FP })
  expect(m.s.wet[12 * COLS + 12]).toBe(0)
})
