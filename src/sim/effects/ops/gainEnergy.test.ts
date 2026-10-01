import { expect, it } from 'vitest'
import { ENERGY_CAP } from '../../rules'
import { applyEffects, fixtureKit, testMatch } from '../../testing'
import { pipTotal } from '../pips'

it('gainEnergy: adds pips to the caster, capped (the type is ignored: one meter)', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  m.s.players[0].pips = [1]
  applyEffects(m, [{ op: 'gainEnergy', type: 'Grass', count: 3 }])
  expect(pipTotal(m.s, 0)).toBe(4)
  applyEffects(m, [{ op: 'gainEnergy', count: 99 }])
  expect(pipTotal(m.s, 0)).toBe(ENERGY_CAP)
})
