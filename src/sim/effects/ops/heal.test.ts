import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, hp, testMatch } from '../../testing'
import { validateEffects } from '../registry'

it('heal: removes damage from the caster (default) or the target, capped at max HP', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  m.s.players[0].members[0].hp = 50
  m.s.players[1].members[0].hp = 95
  applyEffects(m, [{ op: 'heal', amount: 10 }, { op: 'heal', amount: 10, target: 'target' }])
  expect(hp(m, 0)).toBe(60)
  expect(hp(m, 1)).toBe(100)
  expect(validateEffects([{ op: 'heal', amount: 10, target: 'bench' }], 'x')).toHaveLength(1)
})
it('heal: team heals the active and the bench', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  m.s.players[0].members[0].hp = 50
  applyEffects(m, [{ op: 'heal', amount: 30, target: 'team' }])
  expect(hp(m, 0)).toBe(80)
})
