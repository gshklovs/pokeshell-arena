import { expect, it } from 'vitest'
import { makeCtx } from '../../shapes'
import { applyEffects, fixtureKit, hp, testMatch, type TestMatch } from '../../testing'
import { validateEffects } from '../registry'

/** player 1 attacks player 0 */
function hitBack(m: TestMatch, amount: number): void {
  const f = m.s.players[1].fighter
  makeCtx(m.def, m.s, { player: 1, attack: 0, element: 'Colorless', bonus: 0 }, 0, f.x, f.y).run([{ op: 'damage', amount }])
}

it('thorns: an attacker that deals damage takes counters back (flat or a share)', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  applyEffects(m, [{ op: 'thorns', amount: 30, ticks: 90 }])
  hitBack(m, 10)
  expect(hp(m, 0)).toBe(90)
  expect(hp(m, 1)).toBe(70)
  const m2 = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  applyEffects(m2, [{ op: 'thorns', permille: 1000, ticks: 90 }])
  hitBack(m2, 40)
  expect(hp(m2, 1)).toBe(60)
  expect(validateEffects([{ op: 'thorns', ticks: 90 }], 'x')).toHaveLength(1)
})
