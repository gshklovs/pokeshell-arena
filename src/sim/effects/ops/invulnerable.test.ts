import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, testMatch } from '../../testing'

it('invulnerable: the caster ignores attack damage for its ticks', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  applyEffects(m, [{ op: 'invulnerable', ticks: 30 }])
  expect(m.s.players[0].fighter.invuln).toBe(30)
  // player 1 attacks player 0
  const f = m.s.players[1].fighter
  applyEffects({ def: m.def, s: m.s }, [{ op: 'damage', amount: 50 }], { target: 0, x: f.x, y: f.y })
  expect(m.s.players[0].members[0].hp).toBe(100)
})
