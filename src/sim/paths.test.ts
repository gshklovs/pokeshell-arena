// Trajectories (shape.path) and the per-fighter movement flags (MoveTraits): one test each.
import { describe, expect, it } from 'vitest'
import { FP } from './fixed'
import { resolveKit } from './kit'
import { paint } from './terrain'
import { fixtureKit, hp, place, run, testArena, testMatch } from './testing'
import { BTN, type ArenaFile, type Kit, type Shape } from './types'

const target = fixtureKit({ shape: { kind: 'self' } }, { hp: 1000 })
/** a plain (flavour-off) Colorless kit whose one attack is `shape`, 40 damage */
const kit = (shape: Shape, types = ['Colorless']): Kit => ({ ...fixtureKit({ shape, damage: '40', onHit: [{ op: 'damage', amount: 40 }] }, { types }), flavor: false })
/** a wall (or other tile) column at tile x, rows 8..18 */
const column = (x: number, ch = '#', from = 8, to = 18): ArenaFile => testArena(Array.from({ length: to - from + 1 }, (_, i) => ({ x, y: from + i, ch })))
/** fire attack 1 once at `aim` from (400, 540) at a target at (tx, ty), run `ticks`; the damage dealt */
function shoot(shape: Shape, tx: number, ty = 540, aim = 0, arena?: ArenaFile, ticks = 150): number {
  const m = testMatch(kit(shape), target, { arena })
  place(m, 0, 400, 540); place(m, 1, tx, ty)
  m.s.players[0].pips = [5]
  run(m, ticks, (t) => [{ mx: 0, my: 0, aim, buttons: t === 0 ? BTN.ATTACK1 : 0 }, undefined])
  return 1000 - hp(m, 1)
}
const proj = (extra: Partial<Shape> = {}): Shape => ({ kind: 'projectile', speed: 12, radius: 10, range: 500, ...extra })

describe('trajectories', () => {
  it('lob: flies over a wall and bursts where it lands', () => {
    const wall = column(15)
    expect(shoot(proj(), 920, 540, 0, wall)).toBe(0) // a straight shot stops at the wall
    expect(shoot(proj({ path: 'lob', blast: 70 }), 920, 540, 0, wall)).toBe(40)
    expect(shoot(proj({ path: 'lob', blast: 70 }), 500)).toBe(0) // it passes over a foe on the way up
    expect(shoot(proj({ path: 'lob', blast: 70 }), 780)).toBe(40) // and comes down on one on the way down
  })
  it('boomerang: hits on the way out and again on the way back, then returns to its owner', () => {
    const m = testMatch(kit(proj({ path: 'boomerang', range: 600 })), target)
    place(m, 0, 400, 540); place(m, 1, 560, 540)
    m.s.players[0].pips = [5]
    run(m, 200, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, undefined])
    expect(1000 - hp(m, 1)).toBe(80)
    expect(m.s.projectiles.length).toBe(0)
  })
  it('bounce: ricochets off a wall into a foe behind the shooter', () => {
    expect(shoot(proj({ range: 1200 }), 800, 540, 128)).toBe(0)
    expect(shoot(proj({ range: 1200, path: 'bounce', bounces: 1 }), 800, 540, 128)).toBe(40)
  })
  it('phase: passes through walls', () => {
    const wall = column(15)
    expect(shoot(proj({ range: 700 }), 800, 540, 0, wall)).toBe(0)
    expect(shoot(proj({ range: 700, path: 'phase' }), 800, 540, 0, wall)).toBe(40)
  })
  it('zigzag / weave / spiral: steer off the straight line, deterministically', () => {
    for (const path of ['zigzag', 'weave', 'spiral']) {
      const ys = (sh: Shape) => {
        const m = testMatch(kit(sh), target)
        place(m, 0, 400, 540); place(m, 1, 1500, 900)
        m.s.players[0].pips = [5]
        const out: number[] = []
        for (let t = 0; t < 30; t++) {
          run(m, 1, () => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, undefined])
          if (m.s.projectiles[0]) out.push(m.s.projectiles[0].y)
        }
        return out
      }
      const straight = ys(proj())
      const curved = ys(proj({ path, amp: 20, period: 6 }))
      expect(new Set(straight).size, path).toBe(1)
      expect(new Set(curved).size, path).toBeGreaterThan(2)
      expect(ys(proj({ path, amp: 20, period: 6 })), path).toEqual(curved)
    }
  })
  it('drift: a storm moves along the aim and stops at a wall', () => {
    const m = testMatch(kit({ kind: 'area', at: 'aim', radius: 80, range: 300, ticks: 300, every: 45, path: 'drift', drift: 3 }), target)
    place(m, 0, 400, 540); place(m, 1, 1500, 900)
    m.s.players[0].pips = [5]
    run(m, 12, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, undefined])
    const x0 = m.s.areas[0].x
    run(m, 30)
    expect(m.s.areas[0].x - x0).toBeGreaterThanOrEqual(80 * FP)
    run(m, 260)
    expect(m.s.areas[0].x).toBeLessThan(1880 * FP) // the right wall stops it
  })
  it('leap: out of reach mid-flight, a burst on landing', () => {
    const leap: Shape = { kind: 'dash', distance: 300, speed: 16, radius: 28, path: 'leap', blast: 80 }
    const dash: Shape = { kind: 'dash', distance: 300, speed: 16, radius: 28 }
    expect(shoot(dash, 560, 540, 0, undefined, 60)).toBe(40) // a plain charge hits on contact
    expect(shoot(leap, 560, 540, 0, undefined, 60)).toBe(0) // the leap sails over
    expect(shoot(leap, 720, 540, 0, undefined, 60)).toBe(40) // and lands on the foe
  })
})

describe('wall shots (shape.wall: a wave, a ripple)', () => {
  it('a wave is a wide band across its path, not a ball: it catches a foe off its line that a ball of its depth misses', () => {
    const wave = proj({ speed: 8, radius: 16, wall: 70, range: 600, pierce: 9 })
    expect(shoot(proj({ speed: 8, radius: 16, range: 600 }), 800, 600)).toBe(0) // 60 px off the line
    expect(shoot(wave, 800, 600)).toBe(40)
    expect(shoot(wave, 800, 480)).toBe(40) // either side
    expect(shoot(wave, 800, 700)).toBe(0) // past its end
  })
  it('a hand-authored shot named for a wave takes the wave archetype width (and its look)', () => {
    const fk = resolveKit(null, { ...fixtureKit({ name: 'Wave Splash', shape: proj() }), flavor: false })
    expect(fk.attacks[0].look).toBe('wave')
    expect(fk.attacks[0].shape.wall).toBeGreaterThanOrEqual(50)
    expect(resolveKit(null, fixtureKit({ shape: proj() })).attacks[0].shape.wall).toBeUndefined()
  })
})

describe('volleys, detonations, rock slides, dashes', () => {
  it('a volley is one attack: a point-blank fan hits a target once', () => {
    expect(shoot(proj({ count: 3, spread: 4 }), 470)).toBe(40)
  })
  it('a detonating shot (blast) hits a second foe near where it lands; the direct target only once', () => {
    const m = testMatch(kit(proj({ range: 1600, blast: 90 })), target)
    // a 2v1 isn't in the fixtures: check the burst on a wall instead (the foe beside the impact point)
    place(m, 0, 400, 540); place(m, 1, 1840, 600)
    m.s.players[0].pips = [5]
    run(m, 200, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, undefined])
    expect(1000 - hp(m, 1)).toBe(40)
    expect(shoot(proj({ range: 900, blast: 90 }), 900)).toBe(40) // a direct hit: not twice
  })
  it('a rock slide lands a line of impacts ending at the aim point, one after another', () => {
    const m = testMatch(kit({ kind: 'area', at: 'aim', range: 380, radius: 58, count: 3, delay: 18, stagger: 8 }), target)
    place(m, 0, 400, 540); place(m, 1, 1500, 900)
    m.s.players[0].pips = [5]
    run(m, 12, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, undefined])
    const xs = m.s.areas.map((a) => a.x / FP)
    expect(xs.length).toBe(3)
    expect(xs[2] - xs[1]).toBeGreaterThanOrEqual(2 * 58)
    expect(m.s.areas.map((a) => a.next)).toEqual([...m.s.areas.map((a) => a.next)].sort((a, b) => a - b))
  })
  it("a dash carries its on-cast bonus (energy, coins) into the hit", () => {
    const k: Kit = { ...fixtureKit({ shape: { kind: 'dash', distance: 300, speed: 16, radius: 28 }, onCast: [{ op: 'bonus', amount: 30 }], onHit: [{ op: 'damage', amount: 40 }] }), flavor: false }
    const m = testMatch(k, target)
    place(m, 0, 400, 540); place(m, 1, 560, 540)
    m.s.players[0].pips = [5]
    run(m, 60, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, undefined])
    expect(1000 - hp(m, 1)).toBe(70)
  })
})

describe('movement flags', () => {
  const walker = (types: string[], extra: Partial<Kit> = {}): Kit => ({ ...kit({ kind: 'self' }, types), ...extra })
  it('blink (Psychic, Darkness): the dodge teleports the whole roll at once', () => {
    const x1 = (types: string[]) => {
      const m = testMatch(walker(types), target)
      place(m, 0, 400, 540)
      run(m, 1, () => [{ mx: 1, my: 0, aim: 0, buttons: BTN.DODGE }, undefined])
      return { dx: m.s.players[0].fighter.x - 400 * FP, rolling: m.s.players[0].fighter.dodge !== null }
    }
    const roll = x1(['Colorless']), blink = x1(['Psychic'])
    expect(roll.rolling).toBe(true)
    expect(blink.rolling).toBe(false)
    expect(blink.dx).toBeGreaterThan(roll.dx * 5)
  })
  it('crossWater (the move hook; fliers are the species list in arena main): passes deep water that blocks walkers', () => {
    const lake = column(12, '~', 1, 25)
    const endX = (k: Kit) => {
      const m = testMatch(k, target, { arena: lake })
      place(m, 0, 400, 540); place(m, 1, 1500, 900)
      run(m, 150, () => [{ mx: 1, my: 0, aim: 0, buttons: 0 }, undefined])
      return m.s.players[0].fighter.x / FP
    }
    expect(endX(walker(['Colorless']))).toBeLessThan(480)
    expect(endX(walker(['Dragon']))).toBeLessThan(480) // no type flies by default
    expect(endX(walker(['Colorless'], { move: { crossWater: true } }))).toBeGreaterThan(560)
  })
  it('tile speeds: Water wades fast, a hoverer skims at full speed, others slow down in the wet', () => {
    const dist = (types: string[]) => {
      const m = testMatch(walker(types), target)
      place(m, 0, 400, 540); place(m, 1, 1500, 900)
      paint(m.s, 700 * FP, 540 * FP, 400, 'water')
      run(m, 40, () => [{ mx: 1, my: 0, aim: 0, buttons: 0 }, undefined])
      return m.s.players[0].fighter.x - 400 * FP
    }
    const dry = (() => {
      const m = testMatch(walker(['Colorless']), target)
      place(m, 0, 400, 540); place(m, 1, 1500, 900)
      run(m, 40, () => [{ mx: 1, my: 0, aim: 0, buttons: 0 }, undefined])
      return m.s.players[0].fighter.x - 400 * FP
    })()
    expect(dist(['Colorless'])).toBeLessThan(dry)
    expect(dist(['Psychic'])).toBe(dry)
    expect(dist(['Water'])).toBeGreaterThan(dry)
  })
  it('noKnockback (Metal): not knocked back', () => {
    const pushed = (types: string[]) => {
      const shover: Kit = { ...fixtureKit({ shape: { kind: 'melee', range: 90, arc: 90 }, onHit: [{ op: 'knockback', px: 150 }] }), flavor: false }
      const m = testMatch(shover, walker(types))
      place(m, 0, 900, 540); place(m, 1, 960, 540)
      m.s.players[0].pips = [5]
      run(m, 30, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, undefined])
      return m.s.players[1].fighter.x - 960 * FP
    }
    expect(pushed(['Colorless'])).toBeGreaterThan(50 * FP)
    expect(pushed(['Metal'])).toBe(0)
  })
  it('a kit can override its type\'s movement flags', () => {
    const m = testMatch(walker(['Psychic'], { move: { dodge: 'roll' } }), target)
    place(m, 0, 400, 540)
    run(m, 1, () => [{ mx: 1, my: 0, aim: 0, buttons: BTN.DODGE }, undefined])
    expect(m.s.players[0].fighter.dodge).not.toBeNull() // a plain roll, not the Psychic blink
  })
})
