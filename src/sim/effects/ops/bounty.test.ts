import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, testMatch } from '../../testing'
import { pipTotal } from '../pips'

it('bounty: a KO by this damage pays 2 pips per extra prize (no prizes in the arena)', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  m.s.players[0].pips = [0]
  applyEffects(m, [{ op: 'damage', amount: 50 }, { op: 'bounty', prizes: 1 }])
  expect(pipTotal(m.s, 0)).toBe(0)
  applyEffects(m, [{ op: 'damage', amount: 50 }, { op: 'bounty', prizes: 1 }])
  expect(pipTotal(m.s, 0)).toBe(2)
})
