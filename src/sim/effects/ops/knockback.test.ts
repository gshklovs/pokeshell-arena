import { expect, it } from 'vitest'
import { FP } from '../../fixed'
import { applyEffects, fixtureKit, place, run, testMatch } from '../../testing'
import { validateEffects } from '../registry'

it('knockback: pushes the target away from the caster', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  place(m, 0, 800, 540); place(m, 1, 900, 540)
  applyEffects(m, [{ op: 'knockback', px: 80 }])
  run(m, 10)
  expect(m.s.players[1].fighter.x).toBeGreaterThanOrEqual(975 * FP)
  expect(validateEffects([{ op: 'knockback', px: 0 }], 'x')).toHaveLength(1)
})
