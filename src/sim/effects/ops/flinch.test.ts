import { expect, it } from 'vitest'
import { FLINCH_GUARD } from '../../melee'
import { applyEffects, fixtureKit, place, run, testMatch } from '../../testing'
import { validateEffects } from '../registry'

it('flinch: the target stops walking for its ticks, then is immune for a while', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  place(m, 1, 900, 540)
  applyEffects(m, [{ op: 'flinch', ticks: 20 }])
  const walk = () => [undefined, { mx: -1 as const, my: 0 as const, aim: 128, buttons: 0 }]
  const x0 = m.s.players[1].fighter.x
  run(m, 18, walk)
  expect(m.s.players[1].fighter.x).toBe(x0)
  run(m, 10, walk)
  expect(m.s.players[1].fighter.x).toBeLessThan(x0)
  // just out of a flinch: a new one doesn't take
  applyEffects(m, [{ op: 'flinch', ticks: 20 }])
  expect(m.s.players[1].fighter.flinch ?? 0).toBe(0)
  run(m, FLINCH_GUARD)
  applyEffects(m, [{ op: 'flinch', ticks: 20 }])
  expect(m.s.players[1].fighter.flinch).toBe(20)
  expect(validateEffects([{ op: 'flinch', ticks: 0 }], 'x')).toHaveLength(1)
})

it('flinch: an interrupt breaks a windup (the energy stays spent); armour shrugs it off', () => {
  const slow = fixtureKit({ shape: { kind: 'self' }, windup: 30 })
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), slow)
  m.s.players[1].pips[0] = 3
  run(m, 1, () => [undefined, { mx: 0, my: 0, aim: 128, buttons: 1 }])
  expect(m.s.players[1].fighter.cast).not.toBeNull()
  const pips = m.s.players[1].pips[0]
  applyEffects(m, [{ op: 'flinch', ticks: 10, interrupt: true }])
  expect(m.s.players[1].fighter.cast).toBeNull()
  expect(m.s.players[1].pips[0]).toBe(pips)
  // a Fighting windup is armoured
  const fighter = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' }, windup: 30 }, { types: ['Fighting'] }))
  fighter.s.players[1].pips[0] = 3
  run(fighter, 1, () => [undefined, { mx: 0, my: 0, aim: 128, buttons: 1 }])
  applyEffects(fighter, [{ op: 'flinch', ticks: 10, interrupt: true }])
  expect(fighter.s.players[1].fighter.cast).not.toBeNull()
  expect(fighter.s.players[1].fighter.flinch ?? 0).toBe(0)
})
