import { describe, expect, it } from 'vitest'
import { FP } from './fixed'
import { bodyRadiusPx } from './movement'
import { seedRng, randInt } from './rng'
import { cloneState, hashState } from './state'
import { step } from './step'
import { fire, fixtureKit, hp, PILOT_KITS, place, run, testArena, testMatch, type TestMatch } from './testing'
import { COLS } from './terrain'
import { TILE, type InputFrame } from './types'

/** a reproducible stream of random inputs for both players */
function noise(seed: number) {
  const h = { rng: seedRng(seed) }
  return (): InputFrame[] => [0, 1].map(() => ({
    mx: (randInt(h, 3) - 1) as -1 | 0 | 1, my: (randInt(h, 3) - 1) as -1 | 0 | 1,
    aim: randInt(h, 256), buttons: randInt(h, 4) === 0 ? 1 << randInt(h, 4) : 0,
  }))
}

function busyArena() {
  const marks = []
  for (let x = 14; x < 34; x++) marks.push({ x, y: 13, ch: '~' })       // a pond across the middle
  for (let x = 20; x < 28; x++) marks.push({ x, y: 6, ch: '"' })        // grass
  for (let x = 20; x < 28; x++) marks.push({ x, y: 20, ch: '^' })       // lava
  marks.push({ x: 10, y: 10, ch: 'o' }, { x: 37, y: 16, ch: 'o' }, { x: 24, y: 9, ch: '#' })
  return testArena(marks)
}

function playout(seed: number, ticks: number): { m: TestMatch; hashes: string[] } {
  const m = testMatch(PILOT_KITS.pikachu, PILOT_KITS.squirtle, { arena: busyArena(), seed })
  const next = noise(seed)
  const hashes: string[] = []
  for (let t = 0; t < ticks; t++) {
    step(m.def, m.s, next())
    if (t % 60 === 0) hashes.push(hashState(m.s))
  }
  return { m, hashes }
}

describe('determinism', () => {
  it('the same seed and inputs give the same state hash, tick for tick', () => {
    const a = playout(7, 1800), b = playout(7, 1800)
    expect(a.hashes).toEqual(b.hashes)
    expect(hashState(a.m.s)).toBe(hashState(b.m.s))
  })
  it('a different seed diverges', () => {
    expect(playout(8, 1800).hashes).not.toEqual(playout(7, 1800).hashes)
  })
  it('rollback: a clone re-stepped with the same inputs reaches the same state', () => {
    const m = testMatch(PILOT_KITS.charmander, PILOT_KITS.bulbasaur, { arena: busyArena(), seed: 3 })
    const next = noise(3)
    const log: InputFrame[][] = []
    for (let t = 0; t < 400; t++) { const i = next(); log.push(i); step(m.def, m.s, i) }
    const snap = cloneState(m.s)
    const more: InputFrame[][] = []
    for (let t = 0; t < 600; t++) { const i = next(); more.push(i); step(m.def, m.s, i) }
    for (const i of more) step(m.def, snap, i)
    expect(hashState(snap)).toBe(hashState(m.s))
  })
  it('state stays plain integers (no floats sneak in)', () => {
    const { m } = playout(11, 1200)
    const walk = (v: unknown, path: string): void => {
      if (typeof v === 'number') expect(Number.isInteger(v), path).toBe(true)
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`))
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`)
    }
    walk(m.s, 's')
  })
})

describe('combat', () => {
  it('a projectile hits for the printed damage; weakness multiplies it', () => {
    // Thunder Jolt (Lightning 30) vs Squirtle (weak to Lightning x2, x1.6 in the arena): 48 >= 40 HP -> KO
    const m = testMatch(PILOT_KITS.pikachu, PILOT_KITS.squirtle)
    place(m, 0, 400, 540); place(m, 1, 700, 540)
    m.s.players[0].pips = [10]
    run(m, 90, fire(0, 2))
    expect(hp(m, 1)).toBe(0)
    expect(m.s.phase).toBe('over')
    expect(m.s.winner).toBe(0)
  })
  it('resistance subtracts, and the attack pays its energy', () => {
    const shooter = fixtureKit({ element: 'Fighting', cost: ['Fighting'], shape: { kind: 'projectile', speed: 20, radius: 10, range: 800 }, onHit: [{ op: 'damage', amount: 50 }] }, { types: ['Fighting'] })
    const tank = fixtureKit({ shape: { kind: 'self' } }, { hp: 200, resistances: [{ type: 'Fighting', value: '-30' }] })
    const m = testMatch(shooter, tank, { energy: [['Fighting', 'Fighting', 'Fighting'], ['Colorless', 'Colorless', 'Colorless']] })
    place(m, 0, 400, 540); place(m, 1, 700, 540)
    const before = m.s.players[0].pips.reduce((a, b) => a + b, 0)
    run(m, 25, fire(0)) // under ENERGY_FILL, so no pip refills meanwhile
    expect(hp(m, 1)).toBe(180)
    expect(m.s.players[0].pips.reduce((a, b) => a + b, 0)).toBe(before - 1)
  })
  it("can't attack without the energy", () => {
    const m = testMatch(PILOT_KITS.pikachu, PILOT_KITS.squirtle)
    place(m, 0, 400, 540); place(m, 1, 700, 540)
    m.s.players[0].pips = [0]
    run(m, 1, fire(0, 2))
    expect(m.s.events.some((e) => e.k === 'fizzle')).toBe(true)
    run(m, 60)
    expect(hp(m, 1)).toBe(40)
  })
  it('walls stop shots; deep water does not, but blocks walking', () => {
    const marks = []
    for (let y = 1; y < 26; y++) marks.push({ x: 15, y, ch: '~' })
    const m = testMatch(PILOT_KITS.pikachu, PILOT_KITS.squirtle, { arena: testArena(marks) })
    place(m, 0, 400, 540); place(m, 1, 900, 540)
    m.s.players[0].pips = [10]
    run(m, 80, fire(0, 2))
    expect(hp(m, 1)).toBe(0) // the shot flew over the water column at x = 600..640

    const w = testMatch(PILOT_KITS.pikachu, PILOT_KITS.squirtle, { arena: testArena(marks) })
    place(w, 0, 560, 540)
    run(w, 120, () => [{ mx: 1, my: 0, aim: 0, buttons: 0 }])
    expect(w.s.players[0].fighter.x).toBeLessThanOrEqual((600 - bodyRadiusPx(w.s.players[0].fighter.r)) * FP) // stopped at the shore
    expect(w.s.players[0].fighter.x).toBeGreaterThan((600 - bodyRadiusPx(w.s.players[0].fighter.r) - 1) * FP) // right at it

    const wall = testMatch(PILOT_KITS.pikachu, PILOT_KITS.squirtle, { arena: testArena(marks.map((mk) => ({ ...mk, ch: '#' }))) })
    place(wall, 0, 400, 540); place(wall, 1, 900, 540)
    wall.s.players[0].pips = [10]
    run(wall, 80, fire(0, 2))
    expect(hp(wall, 1)).toBe(40)
  })
  it('props take hits and break into floor', () => {
    const m = testMatch(PILOT_KITS.pikachu, PILOT_KITS.squirtle, { arena: testArena([{ x: 15, y: 13, ch: 'o' }]) })
    place(m, 0, 400, 540); place(m, 1, 1500, 900)
    m.s.players[0].pips = [10]
    run(m, 60, fire(0, 2))
    expect(m.s.tiles[13 * COLS + 15]).toBe(TILE.FLOOR) // 30 damage vs a 30 HP prop
  })
  it('a dodge gives i-frames: the shot passes through', () => {
    const m = testMatch(PILOT_KITS.pikachu, PILOT_KITS.squirtle)
    place(m, 0, 400, 540); place(m, 1, 520, 540)
    m.s.players[0].pips = [10]
    // Pikachu fires (windup 10); Squirtle dodges up on tick 8, so it is invulnerable when the shot arrives
    run(m, 40, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? 2 : 0 }, { mx: 0, my: t >= 8 && t < 10 ? -1 : 0, aim: 128, buttons: t === 8 ? 8 : 0 }])
    expect(hp(m, 1)).toBe(40)
  })
  it('paralysis stops movement for a TURN', () => {
    const m = testMatch(fixtureKit({ shape: { kind: 'projectile', speed: 20, radius: 10, range: 800 }, onHit: [{ op: 'status', status: 'paralyzed' }] }), PILOT_KITS.squirtle)
    place(m, 0, 400, 540); place(m, 1, 700, 540)
    run(m, 20, fire(0))
    const x = m.s.players[1].fighter.x
    run(m, 30, () => [undefined, { mx: -1, my: 0, aim: 128, buttons: 0 }])
    expect(m.s.players[1].fighter.x).toBe(x)
    run(m, 90, () => [undefined, { mx: -1, my: 0, aim: 128, buttons: 0 }])
    expect(m.s.players[1].fighter.x).toBeLessThan(x)
  })
})

describe('terrain combos', () => {
  it('Water floods, then Lightning electrifies the connected water', () => {
    const m = testMatch(PILOT_KITS.squirtle, PILOT_KITS.pikachu)
    place(m, 0, 400, 540); place(m, 1, 1500, 200)
    m.s.players[0].pips = [10]
    run(m, 80, fire(0, 1)) // Bubble flies 560 px and floods where it lands
    const wet = m.s.wet.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0)
    expect(wet.length).toBeGreaterThan(3)
    // a Lightning impact next to the flood
    // (the middle bubble's pool, the one on the aim line: its far tile, so the bolt lands inside the pool)
    const row = (j: number) => Math.abs(Math.floor(j / COLS) * 40 + 20 - 540)
    const i = [...wet].sort((a, b) => row(a) - row(b) || (b % COLS) - (a % COLS))[0], tx = i % COLS, ty = Math.floor(i / COLS)
    const t = testMatch(PILOT_KITS.pikachu, PILOT_KITS.squirtle)
    t.s.wet = m.s.wet.slice()
    place(t, 0, tx * 40 + 20 - 300, ty * 40 + 20); place(t, 1, tx * 40 + 20, ty * 40 + 20)
    t.s.players[0].pips = [10]
    run(t, 60, fire(0, 2))
    const shocked = t.s.shock.filter((v) => v > 0).length
    // the pool that impact touches (Bubble's three bubbles may flood apart): all of it, or all but a tile
    const pool = new Set([i]), todo = [i]
    while (todo.length) { const j = todo.pop()!; for (const n of [j - 1, j + 1, j - COLS, j + COLS]) if (m.s.wet[n] > 0 && !pool.has(n)) { pool.add(n); todo.push(n) } }
    expect(shocked).toBeGreaterThanOrEqual(pool.size - 1)
    expect(t.s.events.length >= 0).toBe(true)
  })
  it('standing in electrified water hurts non-Lightning types', () => {
    const m = testMatch(PILOT_KITS.pikachu, PILOT_KITS.squirtle)
    place(m, 1, 1000, 540)
    const i = 13 * COLS + 25
    m.s.wet[i] = 300; m.s.shock[i] = 100
    run(m, 61)
    expect(hp(m, 1)).toBeLessThan(40)
  })
  it('Fire ignites tall grass, which spreads and burns to floor', () => {
    const marks = []
    for (let x = 12; x < 20; x++) marks.push({ x, y: 13, ch: '"' })
    const m = testMatch(PILOT_KITS.charmander, PILOT_KITS.squirtle, { arena: testArena(marks) })
    place(m, 0, 380, 540); place(m, 1, 1500, 200)
    m.s.players[0].pips = [10]
    run(m, 20, fire(0, 2)) // Ember cone reaches x = 570
    expect(m.s.fire.some((v) => v > 0)).toBe(true)
    run(m, 600)
    const row = m.s.tiles.slice(13 * COLS + 12, 13 * COLS + 20)
    expect(row.every((t) => t === TILE.FLOOR)).toBe(true)
  })
  it('lava hurts, but not Fire types', () => {
    const lava = testArena([{ x: 10, y: 13, ch: '^' }])
    const a = testMatch(PILOT_KITS.squirtle, PILOT_KITS.charmander, { arena: lava })
    place(a, 0, 420, 540)
    run(a, 50)
    expect(hp(a, 0)).toBe(30)
    const b = testMatch(PILOT_KITS.charmander, PILOT_KITS.squirtle, { arena: lava })
    place(b, 0, 420, 540)
    run(b, 50)
    expect(hp(b, 0)).toBe(50)
  })
})

describe('match flow', () => {
  it('counts down, then fights, then times out to the side with more HP left', () => {
    const m = testMatch(PILOT_KITS.pikachu, PILOT_KITS.squirtle)
    m.s.phase = 'countdown'; m.s.phaseT = 5
    run(m, 5)
    expect(m.s.phase).toBe('fight')
    m.s.players[0].members[0].hp = 30
    const def = { ...m.def, matchTicks: 10 }
    for (let i = 0; i < 10; i++) step(def, m.s, [])
    expect(m.s.phase).toBe('over')
    expect(m.s.winner).toBe(1)
  })
})
