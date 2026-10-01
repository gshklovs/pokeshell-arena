// A fighter with no input stands perfectly still in the sim: on open floor, touching a wall, in a corner and
// pressed against another idle fighter (regression for "all the pokemons are vibrating in the arena").
import { describe, expect, it } from 'vitest'
import { FP } from './fixed'
import { bodyRadiusPx, fighterBlocked, footOffsetPx } from './movement'
import { step } from './step'
import { PILOT_KITS, place, testMatch, type TestMatch } from './testing'
import { NO_INPUT } from './types'

function positions(m: TestMatch): string {
  return m.s.players.map((p) => `${p.fighter.x},${p.fighter.y}`).join(' ')
}

/** 600 idle ticks leave every position identical. With `settle`, an overlap is first pushed apart (a few ticks, a
 * fighter against a wall slides out over more): that has to be one-way, never back and forth */
function expectStill(m: TestMatch, settle = false): void {
  if (settle) {
    const last = m.s.players.map(() => [0, 0])
    let t = 0
    for (let prev = ''; t < 120 && positions(m) !== prev; t++) {
      prev = positions(m)
      const before = m.s.players.map((p) => [p.fighter.x, p.fighter.y])
      step(m.def, m.s, [NO_INPUT, NO_INPUT])
      m.s.players.forEach((p, i) => {
        const d = [Math.sign(p.fighter.x - before[i][0]), Math.sign(p.fighter.y - before[i][1])]
        for (const k of [0, 1]) {
          if (d[k] && last[i][k]) expect(d[k], `settling reversed at tick ${t}`).toBe(last[i][k])
          if (d[k]) last[i][k] = d[k]
        }
      })
    }
    expect(t).toBeLessThan(120)
  }
  const at = positions(m)
  for (let t = 0; t < 600; t++) {
    step(m.def, m.s, [NO_INPUT, NO_INPUT])
    expect(positions(m), `tick ${t}`).toBe(at)
    for (const p of m.s.players) expect(p.fighter.moving).toBe(0)
  }
}

describe('a fighter with zero input keeps an identical position over 600 ticks', () => {
  it('on open floor', () => {
    expectStill(testMatch(PILOT_KITS.pikachu, PILOT_KITS.squirtle))
  })

  it('touching a wall, and in a corner', () => {
    const m = testMatch(PILOT_KITS.pikachu, PILOT_KITS.squirtle)
    // the walls see the collision body: a circle of bodyRadiusPx at the feet (movement.ts)
    const b0 = bodyRadiusPx(m.s.players[0].fighter.r), b1 = bodyRadiusPx(m.s.players[1].fighter.r)
    const foot1 = footOffsetPx(m.s.players[1].fighter.r)
    place(m, 0, 40 + b0, 540)                  // flush against the left wall ring
    place(m, 1, 1880 - b1, 1040 - b1 - foot1)  // in the bottom-right corner
    expect(fighterBlocked(m.s, m.s.players[1].fighter)).toBe(false)
    expect(fighterBlocked(m.s, m.s.players[1].fighter, m.s.players[1].fighter.x + 1)).toBe(true)
    expectStill(m)
  })

  it('pressed against another idle fighter (and against one next to a wall)', () => {
    for (const [x0, x1] of [[900, 910], [900, 900 + 1], [60, 70]]) {
      const m = testMatch(PILOT_KITS.charmander, PILOT_KITS.bulbasaur)
      place(m, 0, x0, 540)
      place(m, 1, x1, 540)
      expectStill(m, true)
      const a = m.s.players[0].fighter, b = m.s.players[1].fighter
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual((a.r + b.r) * FP)
    }
  })
})
