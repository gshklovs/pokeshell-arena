import { expect, it } from 'vitest'
import { FP } from '../../fixed'
import { applyEffects, fixtureKit, place, run, testMatch } from '../../testing'

it('retreat: the caster leaps back from its aim, briefly invulnerable, swap ready', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  place(m, 0, 900, 540)
  m.s.players[0].fighter.aim = 0 // facing right: the leap goes left
  m.s.players[0].swapCd = 40
  applyEffects(m, [{ op: 'retreat', px: 160 }])
  expect(m.s.players[0].fighter.invuln).toBeGreaterThan(0)
  expect(m.s.players[0].swapCd).toBe(0)
  run(m, 12, () => [{ mx: 0, my: 0, aim: 0, buttons: 0 }])
  expect(m.s.players[0].fighter.x).toBeLessThanOrEqual(745 * FP)
})
