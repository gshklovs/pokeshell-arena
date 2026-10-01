// Regression for "all the pokemons are vibrating in the arena": the drawn position of each fighter, frame by frame,
// through the real page loop (TickLoop: fixed 60 Hz steps, hit-stop, interpolation) at 60, 120, 144 and 165 Hz.
// A fighter standing still must be drawn at exactly the same pixel every frame; a walking one must never step back.
import { describe, expect, it } from 'vitest'
import { step } from '../sim/step'
import { PILOT_KITS, place, testMatch } from '../sim/testing'
import { NO_INPUT, type InputFrame } from '../sim/types'
import { drawnPx, FrameClock, simTime, STEP_MS, TickLoop, walkHop } from './pose'

interface Drawn { x: number; y: number; hop: number }

/** run ~3 s of a match through the page loop at `hz`; player 0 stands still, player 1 walks `walk` for the
 * first 90 ticks, then stands. Every 40th tick asks for a 5-tick hit-stop. Returns each fighter's drawn pose per frame */
function record(hz: number, walk: InputFrame, frames = Math.round(hz * 3)): Drawn[][] {
  const m = testMatch(PILOT_KITS.pikachu, PILOT_KITS.squirtle)
  place(m, 0, 400, 300)
  place(m, 1, 600, 700)
  const loop = new TickLoop(m.s, () => {
    step(m.def, m.s, [NO_INPUT, m.s.tick < 90 ? walk : NO_INPUT])
    return m.s.tick % 40 === 0 ? 5 : 0
  })
  loop.reset(1000)
  const out: Drawn[][] = [[], []]
  for (let i = 1; i <= frames; i++) {
    const alpha = loop.frame(1000 + (i * 1000) / hz)
    m.s.players.forEach((pl, p) => {
      const f = pl.fighter, p0 = loop.prev.fighters[p]
      out[p].push({ x: drawnPx(p0.x, f.x, alpha), y: drawnPx(p0.y, f.y, alpha), hop: walkHop(!!f.moving && !f.dodge, simTime(loop.prev.tick, m.s.tick, alpha), p) })
    })
  }
  return out
}

const RATES = [60, 120, 144, 165]

describe('drawn fighter positions per animation frame', () => {
  for (const hz of RATES) {
    it(`a fighter standing still is drawn at the same pixel every frame at ${hz} Hz`, () => {
      const [still] = record(hz, { mx: 1, my: 0, aim: 0, buttons: 0 })
      for (const d of still) {
        expect(d).toEqual(still[0])
        expect(Number.isInteger(d.x) && Number.isInteger(d.y)).toBe(true)
      }
    })

    it(`a walking fighter's per-frame deltas never reverse sign at ${hz} Hz (hit-stops included)`, () => {
      for (const walk of [{ mx: 1, my: 0 }, { mx: -1, my: 1 }, { mx: 0, my: -1 }] as const) {
        const [, mover] = record(hz, { ...walk, aim: 0, buttons: 0 })
        const sign = { x: 0, y: 0 }
        for (let i = 1; i < mover.length; i++) {
          for (const k of ['x', 'y'] as const) {
            const d = Math.sign(mover[i][k] - mover[i - 1][k])
            if (d && sign[k]) expect(d, `${k} reversed at frame ${i}`).toBe(sign[k])
            if (d) sign[k] = d
          }
          expect(Number.isInteger(mover[i].hop)).toBe(true)
        }
        // it got somewhere, and it stopped: the last second is one pixel
        expect(mover.at(-1)!.x !== mover[0].x || mover.at(-1)!.y !== mover[0].y).toBe(true)
        const tail = mover.slice(-hz)
        for (const d of tail) expect(d).toEqual(tail[0])
      }
    })
  }

  it('the walk hop runs on sim time: the same number of hops per second at 60 and 144 Hz', () => {
    const hops = (hz: number) => {
      const [, mover] = record(hz, { mx: 1, my: 0, aim: 0, buttons: 0 }, Math.round(hz * 1.2))
      // bounces: the hop turning from falling to rising
      let n = 0, dir = 0
      for (let i = 1; i < mover.length; i++) {
        const d = Math.sign(mover[i].hop - mover[i - 1].hop)
        if (d > 0 && dir < 0) n++
        if (d) dir = d
      }
      return n
    }
    expect(Math.abs(hops(60) - hops(144))).toBeLessThanOrEqual(1)
  })
})

describe('the fixed-step clock', () => {
  for (const hz of RATES) {
    it(`runs 60 ticks a second and alpha rises within a tick at ${hz} Hz`, () => {
      const c = new FrameClock()
      c.reset(0)
      let ticks = 0, lastA = -1
      for (let i = 1; i <= hz * 2; i++) {
        const n = c.advance((i * 1000) / hz)
        ticks += n
        const a = c.alpha
        if (n === 0) expect(a).toBeGreaterThanOrEqual(lastA)
        expect(a).toBeGreaterThanOrEqual(0)
        expect(a).toBeLessThan(1)
        lastA = a
      }
      expect(Math.abs(ticks - 120)).toBeLessThanOrEqual(1)
    })
  }

  it('drops the backlog after a long stall instead of spiralling', () => {
    const c = new FrameClock()
    c.reset(0)
    expect(c.advance(10_000)).toBe(5)
    expect(c.advance(10_000 + STEP_MS / 2)).toBe(0)
  })
})
