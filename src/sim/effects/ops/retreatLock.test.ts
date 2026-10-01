import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, testMatch } from '../../testing'

it("retreatLock: the target can't swap or dodge for its ticks", () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  applyEffects(m, [{ op: 'retreatLock', ticks: 90 }])
  expect(m.s.players[1].swapCd).toBe(90)
  expect(m.s.players[1].fighter.dodgeCd).toBe(90)
  expect(m.s.players[0].swapCd).toBe(0)
})
