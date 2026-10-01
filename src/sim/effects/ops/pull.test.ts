import { expect, it } from 'vitest'
import { FP } from '../../fixed'
import { applyEffects, fixtureKit, place, run, testMatch } from '../../testing'

it('pull: drags the target toward the caster', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  place(m, 0, 600, 540); place(m, 1, 900, 540)
  applyEffects(m, [{ op: 'pull', px: 100 }])
  run(m, 10)
  expect(m.s.players[1].fighter.x).toBeLessThanOrEqual(805 * FP)
})
