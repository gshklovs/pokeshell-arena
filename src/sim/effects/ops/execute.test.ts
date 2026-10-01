import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, hp, testMatch } from '../../testing'

it('execute: KOs the target at or below the HP line, else nothing', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  applyEffects(m, [{ op: 'execute', hp: 30 }])
  expect(hp(m, 1)).toBe(100)
  m.s.players[1].members[0].hp = 30
  applyEffects(m, [{ op: 'execute', hp: 30 }])
  expect(hp(m, 1)).toBe(0)
})
