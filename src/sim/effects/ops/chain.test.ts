import { expect, it } from 'vitest'
import { COLS } from '../../terrain'
import { applyEffects, fixtureKit, hp, place, testMatch } from '../../testing'

it('chain: a target standing in water takes a share of the hit again; dry, nothing', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }, { hp: 500 }))
  place(m, 1, 900, 540)
  applyEffects(m, [{ op: 'damage', amount: 100 }, { op: 'chain', permille: 300 }])
  expect(hp(m, 1)).toBe(400)
  const tx = Math.floor(900 / 40), ty = Math.floor(540 / 40)
  m.s.wet[ty * COLS + tx] = 200
  applyEffects(m, [{ op: 'damage', amount: 100 }, { op: 'chain', permille: 300 }])
  expect(hp(m, 1)).toBe(270)
})
