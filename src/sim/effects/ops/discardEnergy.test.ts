import { expect, it } from 'vitest'
import { ENERGY_START } from '../../rules'
import { applyEffects, fixtureKit, testMatch } from '../../testing'
import { pipTotal } from '../pips'

const pair = () => testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))

it('discardEnergy: removes the caster\'s pips (the type is ignored: one meter), all with a big count', () => {
  const m = pair()
  m.s.players[0].pips = [9]
  applyEffects(m, [{ op: 'discardEnergy', type: 'Fire', count: 1 }])
  expect(pipTotal(m.s, 0)).toBe(8)
  applyEffects(m, [{ op: 'discardEnergy', count: 15 }])
  expect(pipTotal(m.s, 0)).toBe(0)
})
it('discardEnergy: target strips the opponent\'s pips', () => {
  const m = pair()
  m.s.players[1].pips = [3]
  applyEffects(m, [{ op: 'discardEnergy', count: 2, target: 'target' }])
  expect(pipTotal(m.s, 1)).toBe(1)
  expect(pipTotal(m.s, 0)).toBe(ENERGY_START) // the caster keeps its own
})
