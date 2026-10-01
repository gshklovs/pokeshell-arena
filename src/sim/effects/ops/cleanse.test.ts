import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, testMatch } from '../../testing'

it('cleanse: clears every special condition', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  applyEffects(m, [{ op: 'status', status: 'poisoned' }, { op: 'status', status: 'confused' }])
  applyEffects(m, [{ op: 'status', status: 'burned', target: 'self' }])
  applyEffects(m, [{ op: 'cleanse', target: 'target' }, { op: 'cleanse' }])
  for (const p of [0, 1]) {
    const st = m.s.players[p].fighter.status
    expect(st.poisoned + st.confused + st.burned + st.asleep + st.paralyzed).toBe(0)
  }
})
