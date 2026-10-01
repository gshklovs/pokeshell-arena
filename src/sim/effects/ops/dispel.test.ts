import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, testMatch } from '../../testing'

it('dispel: strips shields and helpful buffs, keeps debuffs', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  applyEffects(m, [
    { op: 'shield', ticks: 90, target: 'target' },
    { op: 'buff', stat: 'defense', amount: 30, ticks: 90, target: 'target' },
    { op: 'buff', stat: 'damage', amount: -20, ticks: 90, target: 'target' },
  ])
  applyEffects(m, [{ op: 'dispel' }])
  const f = m.s.players[1].fighter
  expect(f.shield).toBeNull()
  expect(f.buffs).toEqual([{ stat: 'damage', amount: -20, t: 90 }])
})
