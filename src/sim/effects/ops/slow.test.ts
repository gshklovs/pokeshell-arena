import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, place, run, testMatch } from '../../testing'

it('slow: halves move speed for its ticks', () => {
  const walk = (slowed: boolean) => {
    const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
    place(m, 1, 900, 540)
    if (slowed) applyEffects(m, [{ op: 'slow', permille: 500, ticks: 60 }])
    const x0 = m.s.players[1].fighter.x
    run(m, 30, () => [undefined, { mx: -1, my: 0, aim: 128, buttons: 0 }])
    return x0 - m.s.players[1].fighter.x
  }
  const full = walk(false), half = walk(true)
  expect(Math.abs(half * 2 - full)).toBeLessThan(full / 10)
})
