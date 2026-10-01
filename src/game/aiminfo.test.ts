// The aim info: badges come from the prediction's dry runs (what the sim really does, with each one's chance), the
// strip from the resolved attack (how it behaves, the X+ math right now, weakness, cost), and nothing touches the state.
import { describe, expect, it } from 'vitest'
import { aimBlocked, predictDamage } from '../sim/predict'
import { createState, hashState } from '../sim/state'
import { fixtureKit, place, testArena, testMatch, type TestMatch } from '../sim/testing'
import type { ArenaFile, Kit, KitAttack, MatchDef } from '../sim/types'
import { resolveKit } from '../sim/kit'
import { parseArena } from '../sim/arena'
import { defaultEnergy } from '../sim/energy'
import { aimInfo, chanceLabel, type AimInfo } from './aiminfo'
import { layoutStrip } from '../render/aimfx'

const foeKit = (stats: Kit['stats'] = {}) => fixtureKit({ shape: { kind: 'self' } }, { hp: 400, ...stats })
const atkKit = (a: Partial<KitAttack> & Pick<KitAttack, 'shape'>, flavor = false) => fixtureKit({ element: 'Fire', windup: 0, ...(flavor ? {} : { flavor: false }), ...a })
const SHOT = { kind: 'projectile', speed: 12, radius: 8, range: 600 } as const

function setup(a: Kit, b: Kit, opts: { arena?: ArenaFile; pips?: number } = {}): TestMatch {
  const m = testMatch(a, b, { balance: true, arena: opts.arena })
  place(m, 0, 800, 540); place(m, 1, 1000, 540)
  m.s.players[0].pips = [opts.pips ?? 5]
  m.s.players[0].fill = [0]
  return m
}

function info(m: TestMatch): AimInfo {
  const p = predictDamage(m.def, m.s, 0, 0, 1)
  return aimInfo(m.def, m.s, 0, 0, p, aimBlocked(m.def, m.s, 0, 0, 1))!
}
const chips = (i: AimInfo) => i.chips.map((c) => c.text)

describe('aim info: badges on the Pokémon', () => {
  it('a coin-flip paralysis is a 50% badge on the foe, with its length', () => {
    const i = info(setup(atkKit({ shape: SHOT, onHit: [{ op: 'damage', amount: 20 }, { op: 'coin', heads: [{ op: 'status', status: 'paralyzed' }] }] }), foeKit()))
    expect(i.foe).toEqual([expect.objectContaining({ text: 'paralyzed · 1.5 s', chance: 0.5 })])
    expect(chanceLabel(i.foe[0].chance)).toBe('50%')
    expect(i.self).toEqual([])
  })

  it('sure conditions, forces and debuffs on the foe', () => {
    const i = info(setup(atkKit({ shape: SHOT, onHit: [{ op: 'damage', amount: 20 }, { op: 'status', status: 'poisoned' }, { op: 'knockback', px: 80 }, { op: 'slow', permille: 250, ticks: 60 }, { op: 'discardEnergy', count: 1, target: 'target' }] }), foeKit()))
    const texts = i.foe.map((b) => b.text)
    expect(texts).toEqual(expect.arrayContaining(['poisoned 10/1.5 s', 'knocked back 2 tiles', 'slowed 25% · 1 s']))
    expect(i.foe.every((b) => b.chance === 1)).toBe(true)
  })

  it("the foe's energy loss, a pull and a flinch", () => {
    const m = setup(atkKit({ shape: SHOT, onHit: [{ op: 'damage', amount: 20 }, { op: 'discardEnergy', count: 1, target: 'target' }, { op: 'pull', px: 80 }, { op: 'flinch', ticks: 20 }] }), foeKit())
    m.s.players[1].pips = [3]
    const texts = info(m).foe.map((b) => b.text)
    expect(texts).toEqual(expect.arrayContaining(['−1 energy', 'pulled in 2 tiles', 'reels · 0.3 s']))
  })

  it('self effects go on your own Pokémon: a heal, recoil, a buff', () => {
    const m = setup(atkKit({ shape: { kind: 'self' }, onCast: [{ op: 'heal', amount: 30 }, { op: 'buff', stat: 'damage', amount: 20, ticks: 90 }] }), foeKit())
    m.s.players[0].members[0].hp -= 50
    expect(info(m).self.map((b) => b.text)).toEqual(expect.arrayContaining(['+30 HP', '+20 damage · 1.5 s']))
    const r = info(setup(atkKit({ shape: SHOT, onHit: [{ op: 'damage', amount: 40 }, { op: 'selfDamage', amount: 20 }] }), foeKit()))
    expect(r.self.map((b) => b.text).join()).toMatch(/^−\d+ HP recoil$/)
  })

  it('a confused caster halves every chance', () => {
    const m = setup(atkKit({ shape: SHOT, onHit: [{ op: 'damage', amount: 20 }, { op: 'status', status: 'burned' }] }), foeKit())
    m.s.players[0].fighter.status.confused = 100
    const i = info(m)
    expect(i.foe[0]).toEqual(expect.objectContaining({ text: 'burned 20/1.5 s', chance: 0.5 }))
    expect(chips(i)).toContain('you are confused: 50% it fails')
  })
})

describe('aim info: the strip', () => {
  it('the X+ math in gold, with what it adds right now', () => {
    const m = setup(atkKit({ shape: SHOT, damage: '30+', onCast: [{ op: 'bonusPer', per: 'foeEnergy', amount: 30 }], onHit: [{ op: 'damage', amount: 30 }] }), foeKit())
    m.s.players[1].pips = [2]
    const c = info(m).chips.find((x) => x.text.startsWith('bonus:'))!
    expect(c).toEqual({ text: 'bonus: +30 per energy the foe has (now +60)', tone: 'bonus' })
    // a conditional bonus says whether it holds now
    const w = setup(atkKit({ shape: SHOT, onHit: [{ op: 'when', cond: 'foeDamaged', then: [{ op: 'bonus', amount: 40 }] }, { op: 'damage', amount: 30 }] }), foeKit())
    expect(chips(info(w))).toContain('if the foe is damaged: +40 damage (not now)')
    w.s.players[1].members[0].hp -= 20
    expect(chips(info(w))).toContain('if the foe is damaged: +40 damage (now +40)')
  })

  it('homing, lob, split, phase and a volley', () => {
    expect(chips(info(setup(atkKit({ element: 'Psychic', shape: SHOT, onHit: [{ op: 'damage', amount: 30 }] }, true), foeKit())))).toContain('homing')
    expect(chips(info(setup(atkKit({ shape: { ...SHOT, path: 'lob', blast: 60 } }), foeKit())))).toEqual(expect.arrayContaining(['lob: over walls, lands at the circle', 'bursts 1.5 tiles around']))
    expect(chips(info(setup(atkKit({ shape: { ...SHOT, split: 5 } }), foeKit())))).toContain('splits into 5 shards')
    expect(chips(info(setup(atkKit({ shape: { ...SHOT, path: 'phase' } }), foeKit())))).toContain('through walls')
    expect(chips(info(setup(atkKit({ shape: { ...SHOT, count: 3, spread: 8 } }), foeKit())))).toContain('3-shot volley, hits once')
    expect(chips(info(setup(atkKit({ shape: { ...SHOT, fuse: 30, stick: 1, blast: 60 } }), foeKit())))).toContain('sticks to the foe, bursts after 0.5 s')
    expect(chips(info(setup(atkKit({ shape: { ...SHOT, pierce: 1 } }), foeKit())))).toContain('pierces the first target')
  })

  it('weakness and resistance as the card prints them, cost and once per match', () => {
    const weak = info(setup(atkKit({ shape: SHOT, onHit: [{ op: 'damage', amount: 30 }] }), foeKit({ weaknesses: [{ type: 'Fire', value: '×2' }] })))
    expect(weak.chips).toContainEqual({ text: '×2 weakness', tone: 'good' })
    const res = info(setup(atkKit({ shape: SHOT, onHit: [{ op: 'damage', amount: 30 }] }), foeKit({ resistances: [{ type: 'Fire', value: '-30' }] })))
    expect(res.chips).toContainEqual({ text: 'resisted −30', tone: 'warn' })
    const gx = info(setup(atkKit({ shape: SHOT, cost: ['Fire', 'Fire', 'Fire'], oncePerMatch: 'gx', onHit: [{ op: 'damage', amount: 30 }] }), foeKit(), { pips: 2 }))
    expect(gx.chips).toContainEqual({ text: 'costs 3 energy, you have 2', tone: 'warn' })
    expect(chips(gx)).toContain('once per match (GX)')
  })

  it('a melee throw and a parry', () => {
    expect(chips(info(setup(atkKit({ name: 'Seismic Toss', shape: { kind: 'melee', range: 64, style: 'throw' }, onHit: [{ op: 'damage', amount: 30 }] }), foeKit())))).toContain('grab → throw')
  })

  it('a wall between dims the shot ("blocked by wall"); a lob or a phase shot is never blocked', () => {
    const marks = Array.from({ length: 9 }, (_, k) => ({ x: 22, y: 9 + k, ch: '#' }))
    const arena = testArena(marks)
    const shot = info(setup(atkKit({ shape: SHOT, onHit: [{ op: 'damage', amount: 30 }] }), foeKit(), { arena }))
    expect(shot.blocked).toBe(true)
    expect(shot.chips[0]).toEqual({ text: 'blocked by wall', tone: 'warn' })
    expect(info(setup(atkKit({ shape: { ...SHOT, path: 'lob' } }), foeKit(), { arena })).blocked).toBe(false)
    expect(info(setup(atkKit({ shape: { ...SHOT, path: 'phase' } }), foeKit(), { arena })).blocked).toBe(false)
    expect(info(setup(atkKit({ shape: SHOT }), foeKit())).blocked).toBe(false)
  })

  it('is render-only: the state and the sim RNG never move', () => {
    const m = setup(atkKit({ shape: SHOT, onCast: [{ op: 'bonusPer', per: 'foeEnergy', amount: 30 }], onHit: [{ op: 'damage', amount: 20 }, { op: 'coin', heads: [{ op: 'status', status: 'asleep' }] }, { op: 'heal', amount: 10 }] }), foeKit())
    const hash = hashState(m.s), rng = m.s.rng
    info(m)
    expect(hashState(m.s)).toBe(hash)
    expect(m.s.rng).toBe(rng)
    expect(m.s.events).toEqual([])
  })

  it('lays the chips out in at most two rows', () => {
    const pos = layoutStrip([300, 300, 300, 300, 300, 300], 80, 800)
    expect(pos.map((p) => p.row)).toEqual([0, 0, 1, 1])
    expect(pos[0].x).toBe(86)
  })
})

describe('aim info: the bench', () => {
  function team(onHit: KitAttack['onHit']): TestMatch {
    const kits = [resolveKit(null, atkKit({ shape: SHOT, onHit })), resolveKit(null, foeKit())]
    const def: MatchDef = {
      mode: 'team', seed: 1, arena: parseArena(testArena()), kits,
      players: [
        { team: 0, name: 'A', members: [0, 0], energy: defaultEnergy([kits[0]]) },
        { team: 1, name: 'B', members: [1, 1, 1], energy: defaultEnergy([kits[1]]) },
      ],
    }
    const m = { def, s: createState(def) }
    m.s.phase = 'fight'
    place(m, 0, 800, 540); place(m, 1, 1000, 540)
    m.s.players[0].pips = [5]
    return m
  }

  it('bench damage marks each benched foe; a gust marks the one it drags in', () => {
    const b = info(team([{ op: 'damage', amount: 20 }, { op: 'benchDamage', amount: 20 }]))
    expect(b.bench).toEqual([
      expect.objectContaining({ p: 1, member: 1, text: '−20', chance: 1 }),
      expect.objectContaining({ p: 1, member: 2, text: '−20', chance: 1 }),
    ])
    const m = team([{ op: 'damage', amount: 20 }, { op: 'gust' }])
    m.s.players[1].members[2].hp = 100
    const g = info(m)
    expect(g.bench).toEqual([expect.objectContaining({ p: 1, member: 2, text: 'forced in' })])
    expect(g.foe).toEqual([])
  })
})
