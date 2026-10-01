import { expect, it } from 'vitest'
import { fire, fixtureKit, hp, place, run, testMatch } from '../../testing'

it('fizzle: in onCast the attack spawns nothing (energy paid, nothing hits)', () => {
  const shot = (onCast: never[]) => {
    const m = testMatch(fixtureKit({ shape: { kind: 'projectile', speed: 20, radius: 10, range: 800 }, onCast, onHit: [{ op: 'damage', amount: 30 }] }), fixtureKit({ shape: { kind: 'self' } }))
    place(m, 0, 400, 540); place(m, 1, 700, 540)
    run(m, 40, fire(0))
    return m
  }
  expect(hp(shot([]), 1)).toBe(70)
  const m = shot([{ op: 'fizzle' }] as never[])
  expect(hp(m, 1)).toBe(100)
  expect(m.s.projectiles).toHaveLength(0)
})
