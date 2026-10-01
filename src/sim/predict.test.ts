// The aim prediction is a dry run of the real pipeline: it never touches the state, it matches what the attack then
// really does (weakness, resistance, the damage curve, energy counts), and coin-flip ranges bound every outcome.
import { describe, expect, it } from 'vitest'
import { iatan2 } from './fixed'
import { aimTarget, predictDamage } from './predict'
import * as R from './rules'
import { hashState } from './state'
import { fixtureKit, place, run, testMatch, type TestMatch } from './testing'
import type { Effect, InputFrame, Kit, KitAttack } from './types'

const foeKit = (stats: Kit['stats'] = {}) => fixtureKit({ shape: { kind: 'self' } }, { hp: 400, ...stats })
// the prediction's math, not the type flavours (flavors.test.ts): the attack opts out
const atkKit = (a: Partial<KitAttack> & Pick<KitAttack, 'shape'>) => fixtureKit({ element: 'Fire', windup: 0, flavor: false, ...a })

/** player 0 fires attack 1 at player 1 (standing 200 px to its right); the damage player 1 takes */
function fireAt(m: TestMatch): number {
  const f = m.s.players[0].fighter, t = m.s.players[1].fighter
  const aim = iatan2(t.y - f.y, t.x - f.x) & 255
  const before = m.s.players[1].members[0].hp
  let dealt = 0
  const input = (k: number): InputFrame[] => [{ mx: 0, my: 0, aim, buttons: k === 0 ? 1 : 0 }, { mx: 0, my: 0, aim: 128, buttons: 0 }]
  for (let k = 0; k < 240; k++) {
    run(m, 1, () => input(k))
    for (const e of m.s.events) if (e.k === 'dmg' && e.p === 1) dealt += e.amount
  }
  expect(before - m.s.players[1].members[0].hp).toBe(Math.min(before, dealt))
  return dealt
}

function setup(a: Kit, b: Kit, pips = 5, seed = 1): TestMatch {
  const m = testMatch(a, b, { balance: true, seed })
  place(m, 0, 800, 540); place(m, 1, 1000, 540)
  m.s.players[0].pips = [pips]
  m.s.players[0].fill = [0]
  return m
}

const SHAPES: KitAttack['shape'][] = [
  { kind: 'beam', length: 500, width: 20 },
  { kind: 'projectile', speed: 12, radius: 8, range: 600 },
  { kind: 'cone', range: 260, arc: 64 },
  { kind: 'melee', range: 240 },
  { kind: 'dash', distance: 240, speed: 16 },
  { kind: 'area', radius: 260 },
  { kind: 'area', radius: 60, at: 'aim', range: 200 },
]

describe('predictDamage', () => {
  it('never changes the state or advances the sim RNG', () => {
    const m = setup(atkKit({ shape: SHAPES[0], onCast: [{ op: 'coins', count: 3, perHeads: [{ op: 'bonus', amount: 30 }] }], onHit: [{ op: 'damage', amount: 20 }, { op: 'status', status: 'burned' }, { op: 'knockback', px: 80 }], onImpact: [{ op: 'paint', terrain: 'fire', radius: 80 }] }), foeKit())
    m.s.players[1].fighter.shield = { amount: 20, t: 100 }
    const hash = hashState(m.s), rng = m.s.rng
    const p = predictDamage(m.def, m.s, 0, 0, 1)!
    expect(p.max).toBeGreaterThan(p.min)
    expect(m.s.rng).toBe(rng)
    expect(hashState(m.s)).toBe(hash)
    expect(m.s.events).toEqual([])
  })

  it('equals the real damage of a deterministic attack for every shape, with weakness, resistance and the curve', () => {
    const effects: Effect[][] = [
      [{ op: 'damage', amount: 30 }],
      [{ op: 'damage', amount: 120 }],
      [{ op: 'bonusPer', per: 'foeDamage', amount: 10, max: 6 }, { op: 'damage', amount: 50 }],
    ]
    const foes: Kit['stats'][] = [{}, { weaknesses: [{ type: 'Fire', value: '×2' }] }, { resistances: [{ type: 'Fire', value: '-30' }] }, { weaknesses: [{ type: 'Fire', value: '+20' }] }]
    for (const shape of SHAPES) {
      for (const onHit of effects) {
        for (const stats of foes) {
          const m = setup(atkKit({ shape, onHit, onCast: [{ op: 'bonusPerEnergy', amount: 10, max: 3 }] }), foeKit(stats))
          m.s.players[1].members[0].hp -= 40 // two damage counters for foeDamage
          const p = predictDamage(m.def, m.s, 0, 0, 1)!
          const got = fireAt(m)
          const what = `${shape.kind} ${JSON.stringify(onHit)} ${JSON.stringify(stats)}`
          expect(p.chance, what).toBe(false)
          expect(p.min, what).toBe(p.max)
          expect(p.min, what).toBe(got)
          expect(p.avg, what).toBe(got)
          if (got > 0) expect(p.eff, what).toBe(stats?.weaknesses ? 1 : stats?.resistances ? -1 : 0)
        }
      }
    }
  })

  it('counts every pulse of a lingering area', () => {
    const m = setup(atkKit({ shape: { kind: 'area', radius: 200, ticks: 90, every: 30 }, onHit: [{ op: 'damage', amount: 10 }] }), foeKit())
    const p = predictDamage(m.def, m.s, 0, 0, 1)!
    expect(p.hits).toBeGreaterThan(1)
    expect(p.min).toBe(fireAt(m))
  })

  it('bounds the real outcome of coin-flip attacks, and averages them exactly', () => {
    const kits: [string, KitAttack['onCast'], KitAttack['onHit']][] = [
      ['2 coins, 30 each', [{ op: 'coins', count: 2, perHeads: [{ op: 'bonus', amount: 30 }] }], [{ op: 'damage', amount: 0 }]],
      ['heads +40', [{ op: 'coin', heads: [{ op: 'bonus', amount: 40 }] }], [{ op: 'damage', amount: 30 }]],
      ['tails fizzles', [{ op: 'coin', tails: [{ op: 'fizzle' }] }], [{ op: 'damage', amount: 60 }]],
      ['until tails', [{ op: 'coinsUntilTails', perHeads: [{ op: 'bonus', amount: 20 }] }], [{ op: 'damage', amount: 10 }]],
      ['a roll', [], [{ op: 'chance', permille: 300, then: [{ op: 'damage', amount: 80 }], else: [{ op: 'damage', amount: 20 }] }]],
    ]
    for (const [name, onCast, onHit] of kits) {
      const base = setup(atkKit({ shape: SHAPES[0], onCast, onHit }), foeKit())
      const p = predictDamage(base.def, base.s, 0, 0, 1)!
      expect(p.chance, name).toBe(true)
      const seen = new Set<number>()
      let sum = 0
      const N = 200
      for (let seed = 1; seed <= N; seed++) {
        const m = setup(atkKit({ shape: SHAPES[0], onCast, onHit }), foeKit(), 5, seed)
        const got = fireAt(m)
        seen.add(got)
        sum += got
        expect(got, `${name} seed ${seed}`).toBeGreaterThanOrEqual(p.min)
        expect(got, `${name} seed ${seed}`).toBeLessThanOrEqual(p.max)
      }
      expect(seen.has(p.min), name).toBe(true)
      if (name !== 'until tails') expect(seen.has(p.max), name).toBe(true)
      expect(Math.abs(sum / N - p.avg), name).toBeLessThan(Math.max(8, p.avg * 0.2))
    }
    // two coins at 30 a heads, exactly: 0 / 30 / 60 with 1/4, 1/2, 1/4 (through the damage curve)
    const m = setup(atkKit({ shape: SHAPES[0], onCast: kits[0][1], onHit: kits[0][2] }), foeKit())
    const p = predictDamage(m.def, m.s, 0, 0, 1)!
    const c60 = R.curve(R.DAMAGE_CURVE, 60), c30 = R.curve(R.DAMAGE_CURVE, 30)
    expect([p.min, p.max, p.avg]).toEqual([0, c60, Math.round(c30 / 2 + c60 / 4)])
  })

  it('a confused caster may fail: the range starts at 0', () => {
    const m = setup(atkKit({ shape: SHAPES[0], onHit: [{ op: 'damage', amount: 40 }] }), foeKit())
    m.s.players[0].fighter.status.confused = 100
    const p = predictDamage(m.def, m.s, 0, 0, 1)!
    expect([p.min, p.max, p.avg, p.chance]).toEqual([0, 40, 20, true])
  })

  it('says when the hit would KO', () => {
    const m = setup(atkKit({ shape: SHAPES[0], onHit: [{ op: 'damage', amount: 40 }] }), foeKit())
    m.s.players[1].members[0].hp = 30
    expect(predictDamage(m.def, m.s, 0, 0, 1)!.ko).toBe('always')
  })
})

describe('aimTarget', () => {
  it('picks the foe on the aim path, else the nearest foe (off the path)', () => {
    const m = setup(atkKit({ shape: SHAPES[0], onHit: [{ op: 'damage', amount: 10 }] }), foeKit())
    expect(aimTarget(m.def, m.s, 0, 0, 0)).toEqual({ target: 1, onPath: true })
    expect(aimTarget(m.def, m.s, 0, 0, 128)).toEqual({ target: 1, onPath: false })
    expect(aimTarget(m.def, m.s, 0, 0, 64)).toEqual({ target: 1, onPath: false })
  })
})
