import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FP } from './fixed'
import { bodyBlocked, bodyRadiusPx, feetOf, fighterBlocked, footOffsetPx } from './movement'
import * as R from './rules'
import { PROBE_SIZES, probeArena } from './stuckprobe'
import { fixtureKit, place, run, testArena, testMatch, type TestMatch } from './testing'
import { step } from './step'
import type { ArenaFile, InputFrame } from './types'

const ROOT = resolve(__dirname, '../../public/arenas')
const ids = readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
function arena(id: string): ArenaFile {
  const f = JSON.parse(readFileSync(join(ROOT, id, 'arena.json'), 'utf8'))
  const pj = join(ROOT, id, 'props.json')
  if (existsSync(pj)) f.propFrames = JSON.parse(readFileSync(pj, 'utf8')).frames
  return f
}
const kit = (retreat: number) => fixtureKit({ shape: { kind: 'self' } }, { retreat })
const hold = (mx: -1 | 0 | 1, my: -1 | 0 | 1) => (): (InputFrame | undefined)[] => [{ mx, my, aim: 0, buttons: 0 }]
/** a 1v1 with player 1 parked far away (never in the way) */
function solo(marks: { x: number; y: number; ch: string }[], retreat: number): TestMatch {
  const m = testMatch(kit(retreat), kit(0), { arena: testArena(marks) })
  place(m, 1, 1840, 1000)
  return m
}
/** put player 0's feet (the body) at a design-px point */
function placeFeet(m: TestMatch, x: number, y: number): void {
  place(m, 0, x, y - footOffsetPx(m.s.players[0].fighter.r))
}

describe('movement', () => {
  it('the body cap fits a 1-tile corridor and matches validate.py', () => {
    for (let retreat = 0; retreat <= 8; retreat++) expect(2 * bodyRadiusPx(R.radiusPx(retreat))).toBeLessThan(40)
    expect(bodyRadiusPx(R.radiusPx(5))).toBe(R.BODY_MAX_PX)
    const py = readFileSync(resolve(__dirname, '../../tools/arenas/validate.py'), 'utf8')
    expect(Number(/^BODY_R = (\d+)/m.exec(py)?.[1])).toBe(R.BODY_MAX_PX)
  })

  it('stuck rate is 0 for every size on every arena (random walks + seeks to reachable targets)', () => {
    for (const id of ids) {
      const f = arena(id)
      for (const size of PROBE_SIZES) {
        const r = probeArena(f, size, { seed: 7, walkTicks: 1800, targets: 10, seekTicks: 900 })
        expect(r.walkStuck + r.seekStuck, `${id} ${size.name} ${JSON.stringify(r.where.slice(0, 4))}`).toBe(0)
        expect(r.reached, `${id} ${size.name} targets reached`).toBe(r.targets)
      }
    }
  }, 120_000)

  it('the walkable top rows are reachable: walking up, every size gets its feet into the top tile', () => {
    const W = new Set(['.', '"', '^'])
    for (const id of ids) {
      const f = arena(id)
      for (const retreat of [0, 2, 5]) {
        const m = testMatch(kit(retreat), kit(0), { arena: f })
        // both sides immortal: the parked foe lands in a corner (unstick) and may stand in lava
        for (const pl of m.s.players) pl.members[0].hp = 1 << 20
        const fr = m.s.players[0].fighter
        const miss: string[] = []
        for (let r = 1; r < 26; r++) for (let c = 1; c < 47; c++) {
          // a top-edge tile: open, wall (or water) right above, open below
          if (!W.has(f.grid[r][c]) || W.has(f.grid[r - 1][c]) || f.grid[r - 1][c] === 'o' || !W.has(f.grid[r + 1][c])) continue
          place(m, 1, 1 << 20, 1 << 20)
          placeFeet(m, c * 40 + 20, (r + 1) * 40 + 20)
          fr.knock = null; fr.dodge = null
          run(m, 45, hold(0, -1))
          if (Math.floor(feetOf(fr).y / FP / 40) !== r) miss.push(`${c},${r}`)
        }
        expect(miss, `${id} retreat ${retreat}`).toEqual([])
      }
    }
  }, 120_000)

  it('the largest fighter walks a 1-tile corridor, entering it off-centre (corner nudge)', () => {
    // a horizontal corridor at row 13 (y 520..560) from x 600 to 1200
    const marks = []
    for (let x = 15; x < 30; x++) { marks.push({ x, y: 12, ch: '#' }, { x, y: 14, ch: '#' }) }
    for (const off of [-14, -6, 0, 9, 15]) {
      const m = solo(marks, 5)
      placeFeet(m, 520, 540 + off)
      run(m, 240, hold(1, 0))
      expect(m.s.players[0].fighter.x, `offset ${off}`).toBeGreaterThan(1220 * FP)
    }
  })

  it('sliding along a wall at 45 degrees keeps moving', () => {
    const marks = []
    for (let x = 1; x < 47; x++) marks.push({ x, y: 10, ch: '#' })
    for (const mx of [1, -1] as const) {
      const m = solo(marks, 3)
      placeFeet(m, 960, 360)
      run(m, 20, hold(mx, 1)) // into the wall below, diagonally
      const f = m.s.players[0].fighter
      const x0 = f.x, y0 = feetOf(f).y
      run(m, 30, hold(mx, 1))
      expect(Math.abs(f.x - x0)).toBeGreaterThan(30 * 2.5 * FP) // the diagonal's x part: 225 px/s x 0.707 = 2.65 px/tick
      expect(feetOf(f).y).toBe(y0) // pressed on it, not through it
      expect(feetOf(f).y).toBeLessThanOrEqual((400 - bodyRadiusPx(f.r)) * FP)
    }
  })

  it('rounds a pillar corner met head-on diagonally', () => {
    const m = solo([{ x: 20, y: 10, ch: '#' }], 2)
    const f = m.s.players[0].fighter
    const r = bodyRadiusPx(f.r)
    // the body touching the pillar's top-left corner (800, 400) along the diagonal
    const d = Math.ceil(r / Math.SQRT2) + 1
    placeFeet(m, 800 - d, 400 - d)
    run(m, 60, hold(1, 1))
    expect(Math.abs(f.x - (800 - d) * FP) + Math.abs(feetOf(f).y - (400 - d) * FP)).toBeGreaterThan(40 * FP)
  })

  it('no position inside a wall after knockback or a dodge, from every angle into corners', () => {
    const marks = [{ x: 20, y: 10, ch: '#' }, { x: 21, y: 10, ch: '#' }, { x: 20, y: 11, ch: '#' }, { x: 24, y: 14, ch: '~' }, { x: 25, y: 14, ch: 'o' }]
    for (let a = 0; a < 16; a++) {
      for (const retreat of [0, 5]) {
        const m = solo(marks, retreat)
        const f = m.s.players[0].fighter
        const ang = (a * Math.PI) / 8
        placeFeet(m, 860 - Math.round(Math.cos(ang) * 70), 440 - Math.round(Math.sin(ang) * 70))
        f.knock = { vx: Math.round(Math.cos(ang) * 40 * FP), vy: Math.round(Math.sin(ang) * 40 * FP), t: 12 }
        for (let t = 0; t < 14; t++) { step(m.def, m.s, [undefined]); expect(fighterBlocked(m.s, f), `knock angle ${a} tick ${t}`).toBe(false) }
        const d = solo(marks, retreat)
        const g = d.s.players[0].fighter
        placeFeet(d, 960 - Math.round(Math.cos(ang) * 60), 580 - Math.round(Math.sin(ang) * 60))
        g.dodge = { t: 12, dx: Math.round(Math.cos(ang) * 30 * FP), dy: Math.round(Math.sin(ang) * 30 * FP) }
        for (let t = 0; t < 14; t++) { step(d.def, d.s, [undefined]); expect(fighterBlocked(d.s, g), `dodge angle ${a} tick ${t}`).toBe(false) }
      }
    }
  })

  it('a body left overlapping a wall is pushed out before it moves', () => {
    const m = solo([{ x: 20, y: 10, ch: '#' }], 5)
    placeFeet(m, 805, 405) // inside the wall tile
    step(m.def, m.s, [undefined])
    expect(fighterBlocked(m.s, m.s.players[0].fighter)).toBe(false)
  })

  it('fighter push-apart never pushes into a wall, and the pinned one is not stuck overlapping', () => {
    const marks = []
    for (let y = 1; y < 26; y++) marks.push({ x: 20, y, ch: '#' })
    const m = testMatch(kit(5), kit(5), { arena: testArena(marks) })
    const a = m.s.players[0].fighter, b = m.s.players[1].fighter
    const r = bodyRadiusPx(a.r)
    placeFeet(m, 800 - r - 1, 540) // a against the wall's left face... the wall is at x 800..840
    place(m, 1, 800 - r - 10, 540 - footOffsetPx(b.r)) // b overlapping a from the left
    for (let t = 0; t < 30; t++) {
      step(m.def, m.s, [{ mx: 1, my: 0, aim: 0, buttons: 0 }, { mx: 1, my: 0, aim: 0, buttons: 0 }])
      expect(fighterBlocked(m.s, a)).toBe(false)
      expect(fighterBlocked(m.s, b)).toBe(false)
    }
    // b pushed off: they end about a hitbox apart (b keeps walking into a, so allow the push-in of one tick)
    expect(a.x - b.x).toBeGreaterThan((a.r + b.r - 8) * FP)
  })

  it('crossWater walks deep water; a plain fighter stops at the shore', () => {
    const marks = []
    for (let y = 1; y < 26; y++) marks.push({ x: 15, y, ch: '~' }, { x: 16, y, ch: '~' })
    for (const cross of [false, true]) {
      const m = testMatch(kit(2), kit(0), { arena: testArena(marks) })
      if (cross) m.s.players[0].fighter.move = { crossWater: true }
      place(m, 1, 1840, 1000)
      placeFeet(m, 500, 540)
      run(m, 180, hold(1, 0))
      const x = m.s.players[0].fighter.x / FP
      if (cross) expect(x).toBeGreaterThan(700)
      else expect(x).toBeLessThanOrEqual(600 - bodyRadiusPx(m.s.players[0].fighter.r))
    }
  })

  it('bodyBlocked is exact at a tile edge (strict circle-vs-rect)', () => {
    const m = solo([{ x: 20, y: 10, ch: '#' }], 0)
    expect(bodyBlocked(m.s, (800 - 16) * FP, 420 * FP, 16)).toBe(false)
    expect(bodyBlocked(m.s, (800 - 16) * FP + 1, 420 * FP, 16)).toBe(true)
  })
})
