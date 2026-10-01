import { expect, it } from 'vitest'
import { ENERGY_FILL, TURN } from '../../rules'
import { applyEffects, fixtureKit, run, testMatch } from '../../testing'
import { pipTotal } from '../pips'

it("energyJam: the target's next pip comes later", () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  const before = [pipTotal(m.s, 0), pipTotal(m.s, 1)]
  applyEffects(m, [{ op: 'energyJam', ticks: 60 }])
  expect(m.s.players[1].fill.every((f) => f === -60)).toBe(true)
  run(m, ENERGY_FILL)
  expect(pipTotal(m.s, 0)).toBeGreaterThan(before[0])
  expect(pipTotal(m.s, 1)).toBe(before[1])
  applyEffects(m, [{ op: 'energyJam', ticks: 3 * TURN }, { op: 'energyJam', ticks: 3 * TURN }])
  expect(Math.min(...m.s.players[1].fill)).toBe(-3 * TURN)
})
