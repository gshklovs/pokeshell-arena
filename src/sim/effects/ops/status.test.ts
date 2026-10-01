import { expect, it } from 'vitest'
import { PARALYZE_TICKS, POISON_DAMAGE, TURN } from '../../rules'
import { applyEffects, fixtureKit, hp, run, testMatch } from '../../testing'
import { validateEffects } from '../registry'

const pair = () => testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))

it('status: paralyzed lasts a TURN; asleep/confused/paralyzed replace each other', () => {
  const m = pair()
  applyEffects(m, [{ op: 'status', status: 'asleep' }, { op: 'status', status: 'paralyzed' }])
  const st = m.s.players[1].fighter.status
  expect(st.asleep).toBe(0)
  expect(st.paralyzed).toBe(PARALYZE_TICKS)
  run(m, PARALYZE_TICKS)
  expect(st.paralyzed).toBe(0)
})
it('status: poison deals damage every TURN', () => {
  const m = pair()
  applyEffects(m, [{ op: 'status', status: 'poisoned' }])
  run(m, TURN)
  expect(hp(m, 1)).toBe(100 - POISON_DAMAGE)
})
it('status: validates the condition', () => {
  expect(validateEffects([{ op: 'status', status: 'frozen' }], 'x')).toHaveLength(1)
})
