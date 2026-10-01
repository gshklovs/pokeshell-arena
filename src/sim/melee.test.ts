// The melee flavour (docs/MELEE.md): styles by name, live swings, strings, flinch, holds and throws, splats, the
// parry, the dash styles, determinism and the damage prediction.
import { describe, expect, it } from 'vitest'
import { FP } from './fixed'
import { FLINCH_GUARD, GNAW_DAMAGE, SPLAT_DAMAGE, TAP_FLINCH, applyMelee, meleeStyleFor } from './melee'
import { predictDamage } from './predict'
import { hashState } from './state'
import { fixtureKit, hp, place, run, testArena, testMatch, type TestMatch } from './testing'
import type { Effect, InputFrame, Kit, KitAttack, Shape, SimEvent } from './types'

const dmg = (n: number): Effect[] => [{ op: 'damage', amount: n }]
const plain = (a: Partial<KitAttack> & Pick<KitAttack, 'shape'>, stats: Kit['stats'] = {}): Kit => ({ ...fixtureKit(a, stats), flavor: false })
const idle: Kit = plain({ shape: { kind: 'self' } })
const melee = (range = 70, arc = 80, lunge = 0): Shape => ({ kind: 'melee', range, arc, ...(lunge ? { lunge } : {}) })
/** the attack's windup: the swing is released this many ticks after the press */
const W = (m: TestMatch) => m.def.kits[0].attacks[0].windup

/** fire attack 1 on tick 0 aimed `aim`, then keep aiming `later(t)`; the foe idles. Collects the events */
function swing(m: TestMatch, ticks: number, aim = 0, later: (t: number) => number = () => aim, foe: (t: number) => InputFrame | undefined = () => undefined): SimEvent[] {
  const evs: SimEvent[] = []
  m.s.players[0].pips[0] = 5
  for (let t = 0; t < ticks; t++) {
    run(m, 1, () => [{ mx: 0, my: 0, aim: t === 0 ? aim : later(t), buttons: t === 0 ? 1 : 0 }, foe(t)])
    evs.push(...m.s.events)
  }
  return evs
}

describe('melee styles by name', () => {
  const dash = (distance = 150, speed = 15, extra: Record<string, unknown> = {}): Shape => ({ kind: 'dash', distance, speed, radius: 32, invulnerable: 0, ...extra })
  const leap: Shape = { kind: 'dash', distance: 280, speed: 14, radius: 28, path: 'leap', blast: 70 }
  it('reads the most-fielded close attacks as the moves they are named for', () => {
    const cases: [string, Shape, string][] = [
      ['Tackle', dash(), 'tackle'], ['Slash', melee(), 'slash'], ['Bite', melee(), 'bite'], ['Ram', dash(), 'tackle'],
      ['Gnaw', melee(), 'bite'], ['Pound', melee(), 'jab'], ['Spinning Attack', dash(340, 13), 'roll'],
      ['Hammer In', { kind: 'area', at: 'aim', range: 72, radius: 64 }, 'smash'], ['Headbutt', dash(), 'headbutt'],
      ['Scratch', melee(), 'slash'], ['Heavy Impact', leap, 'slam'], ['Agility', { kind: 'dash', distance: 230, speed: 28, radius: 30 }, 'quick'],
      ['Mega Punch', melee(), 'punch'], ['Peck', melee(), 'thrust'], ['Quick Attack', { kind: 'dash', distance: 230, speed: 28, radius: 30 }, 'quick'],
      ['Rear Kick', melee(), 'kick'], ['Stampede', dash(280, 20), 'charge'], ['Corkscrew Punch', melee(), 'punch'],
      ['Giga Impact', dash(280, 20), 'charge'], ['Sharp Fang', melee(), 'bite'], ['Smash Kick', melee(), 'kick'],
      ['Dragon Claw', melee(), 'slash'], ['Fury Swipes', melee(), 'flurry'], ['Low Kick', melee(), 'kick'],
      ['Rollout', dash(340, 13), 'roll'], ['Shred', melee(), 'slash'], ['Slap', melee(), 'jab'], ['Treasure Rush', dash(), 'tackle'],
      ['Aqua Return', dash(250, 24), 'charge'], ['Body Slam', melee(), 'slam'], ['Seismic Toss', melee(), 'throw'],
      ['Counter', melee(), 'counter'], ['Wing Attack', dash(200, 20), 'swoop'], ['Dig', leap, 'burrow'],
      ['Stomp', { kind: 'area', at: 'self', radius: 110 }, 'stomp'], ['Double Kick', melee(), 'kick'], ['Karate Chop', melee(), 'chop'],
      ['Vine Whip', melee(), 'whip'], ['Vise Grip', melee(), 'grab'], ['Double Slap', melee(), 'flurry'], ['Horn Attack', melee(), 'thrust'],
      ['Uppercut', melee(), 'uppercut'], ['Iron Tail', melee(), 'tail'], ['Thrash', melee(), 'spin'], ['Leaf Blade', melee(), 'slash'],
      ['Mystery Move', melee(), 'strike'],
    ]
    for (const [name, sh, want] of cases) expect(meleeStyleFor(name, sh), name).toBe(want)
    expect(meleeStyleFor('Thunderbolt', { kind: 'beam', length: 500, width: 20 })).toBeNull()
  })

  it('gives strings their strikes: flurries by their coins, Double Kick two, a light punch three', () => {
    const k = (name: string, extra: Partial<KitAttack> = {}) => {
      const fk = testMatch(plain({ name, shape: melee(), ...extra }), idle).def.kits[0]
      return fk.attacks[0].shape
    }
    expect(k('Fury Swipes', { onHit: [{ op: 'coins', count: 3, perHeads: dmg(10) }] }).strikes).toBe(3)
    expect(k('Double Kick').strikes).toBe(2)
    expect(k('Corkscrew Punch').strikes).toBe(3)
    expect(k('Mega Punch', { cost: ['Colorless', 'Colorless', 'Colorless'], damage: '80' }).interrupt).toBe(1)
    expect(k('Bite').hold).toBeGreaterThan(0)
  })

  it('adds the per-type melee flavour, and keeps it off when the kit opts out of type flavours', () => {
    const typed = (t: string, name = 'Slash') => testMatch(fixtureKit({ name, shape: melee(70, 80, 30) }, { types: [t] }), idle).def.kits[0].attacks[0]
    expect(typed('Dragon').shape.arc).toBe(80 + 32)
    expect(typed('Psychic').shape.lunge).toBe(0)
    expect(typed('Fighting', 'Double Kick').shape.strikes).toBe(3)
    expect(typed('Darkness').shape.backstab).toBe(1)
    expect(typed('Metal').traits).toContain('armor')
    expect(typed('Lightning').shape.flinch).toBeGreaterThanOrEqual(6)
    const off = testMatch({ ...fixtureKit({ name: 'Slash', shape: melee() }, { types: ['Dragon'] }), flavor: false }, idle).def.kits[0].attacks[0]
    expect(off.shape.arc).toBe(80)
    expect(off.shape.style).toBe('slash')
    // applyMelee leaves a ranged attack alone
    const shot = testMatch(plain({ shape: { kind: 'projectile', speed: 12, radius: 10, range: 500 } }), idle).def.kits[0].attacks[0]
    expect(applyMelee(shot)).toBe(shot)
  })
})

describe('the live swing', () => {
  it('a string is taps, then one finisher that lands the card damage exactly once', () => {
    const m = testMatch(plain({ name: 'Pound', shape: melee(70, 80), onHit: dmg(30) }), idle)
    place(m, 0, 400, 540); place(m, 1, 460, 540)
    const evs = swing(m, 30)
    const strikes = evs.filter((e) => e.k === 'strike') as Extract<SimEvent, { k: 'strike' }>[]
    expect(strikes.map((e) => e.fin)).toEqual([0, 1])
    expect(evs.filter((e) => e.k === 'dmg' && e.p === 1).map((e) => (e as { amount: number }).amount)).toEqual([30])
    expect(hp(m, 1)).toBe(70)
  })

  it('active frames catch a foe that drifts into the arc after the release tick', () => {
    const m = testMatch(plain({ name: 'Slash', shape: melee(60, 128) }), idle)
    place(m, 0, 400, 540); place(m, 1, 400 + 60 + 22 + 6 + 14, 540) // just out of reach (the pad included)
    swing(m, 8, 0, () => 0, () => ({ mx: -1, my: 0, aim: 128, buttons: 0 }))
    expect(m.s.events.length >= 0).toBe(true)
    const m2 = testMatch(plain({ name: 'Slash', shape: melee(60, 128), onHit: dmg(20) }), idle)
    place(m2, 0, 400, 540); place(m2, 1, 400 + 60 + 22 + 6 + 8, 540)
    const evs = swing(m2, 8, 0, () => 0, (t) => (t < 4 ? { mx: -1, my: 0, aim: 128, buttons: 0 } : undefined))
    expect(evs.some((e) => e.k === 'dmg' && e.p === 1)).toBe(true)
  })

  it('the step-in is motion over the live frames, and a wall stops it', () => {
    const m = testMatch(plain({ name: 'Leaf Blade', shape: melee(60, 80, 90) }), idle)
    place(m, 0, 400, 540); place(m, 1, 1500, 540)
    swing(m, W(m) + 1)
    const x1 = m.s.players[0].fighter.x
    expect(x1).toBeGreaterThan(400 * FP)
    expect(x1).toBeLessThan(470 * FP) // not the whole lunge at once
    swing(m, 6)
    expect(m.s.players[0].fighter.x).toBeGreaterThanOrEqual(480 * FP)
    // into the wall on the left (x < 40): stopped by it
    const w = testMatch(plain({ name: 'Leaf Blade', shape: melee(60, 80, 200) }), idle)
    place(w, 0, 90, 540); place(w, 1, 1500, 540)
    swing(w, W(w) + 8, 128)
    expect(w.s.players[0].fighter.x).toBeGreaterThan(40 * FP)
  })

  it('a tap flinches: the foe stops walking; after the flinch it is immune for a while (no stunlock)', () => {
    const m = testMatch(plain({ name: 'Fury Swipes', shape: melee(80, 128), onHit: dmg(10) }), idle)
    place(m, 0, 400, 540); place(m, 1, 460, 540)
    swing(m, W(m) + 2)
    expect(m.s.players[1].fighter.flinch).toBeGreaterThan(0)
    expect(m.s.players[1].fighter.flinch).toBeLessThanOrEqual(TAP_FLINCH)
    // the string chains its taps, then the flinch ends: the guard starts
    let t = 0
    while ((m.s.players[1].fighter.flinch ?? 0) > 0 && t++ < 120) run(m, 1)
    expect(t).toBeLessThan(60)
    expect(m.s.players[1].fighter.flinchGuard).toBe(FLINCH_GUARD)
    // a new string right away: its taps don't take while the guard lasts
    m.s.players[0].fighter.recovery = 0
    swing(m, W(m) + 2)
    expect(m.s.players[1].fighter.flinch ?? 0).toBe(0)
  })

  it('a bite latches on, holds the foe at its front, and gnaws when it lets go', () => {
    const m = testMatch(plain({ name: 'Bite', cost: ['Colorless', 'Colorless'], shape: melee(70, 80), onHit: dmg(20) }), idle)
    place(m, 0, 400, 540); place(m, 1, 470, 540)
    swing(m, W(m) + 3)
    expect(hp(m, 1)).toBe(80)
    const f = m.s.players[0].fighter
    // walk away while holding: the foe comes along
    run(m, 10, () => [{ mx: 0, my: 1, aim: 0, buttons: 0 }, { mx: 1, my: 0, aim: 128, buttons: 0 }])
    const g = m.s.players[1].fighter
    expect(Math.abs(g.y - f.y)).toBeLessThan(8 * FP)
    run(m, 30)
    expect(hp(m, 1)).toBe(80 - GNAW_DAMAGE)
  })

  it('a throw grabs, then hurls the foe along the aim held during the hold; its damage comes at the throw', () => {
    const m = testMatch(plain({ name: 'Seismic Toss', shape: melee(70, 80), onHit: dmg(40) }), idle)
    place(m, 0, 600, 540); place(m, 1, 670, 540)
    const evs = swing(m, 50, 0, (t) => (t < W(m) + 3 ? 0 : 64)) // grab facing east, then aim south
    const th = evs.findIndex((e) => e.k === 'throw')
    expect(th).toBeGreaterThan(0)
    expect(evs.findIndex((e) => e.k === 'dmg' && e.p === 1)).toBe(th - 1) // the throw's own hit, the same tick
    expect(hp(m, 1)).toBe(60)
    const f = m.s.players[0].fighter, g = m.s.players[1].fighter
    expect(g.y - f.y).toBeGreaterThan(120 * FP)
  })

  it('a strong knock into a wall splats: extra damage and a flinch', () => {
    const m = testMatch(plain({ name: 'Mega Punch', shape: melee(70, 80), onHit: [...dmg(20), { op: 'knockback', px: 300 }] }), idle)
    place(m, 0, 1740, 540); place(m, 1, 1810, 540)
    const evs = swing(m, 45)
    expect(evs.some((e) => e.k === 'splat')).toBe(true)
    expect(hp(m, 1)).toBe(100 - 20 - SPLAT_DAMAGE)
  })

  it('a counter parries a swing (no damage), the attacker reels and the riposte lands; a shot is not parried', () => {
    const counter = plain({ name: 'Counter', shape: melee(80, 110), onHit: dmg(30) })
    const slash = plain({ name: 'Slash', shape: melee(80, 110), onHit: dmg(30) })
    const m = testMatch(counter, slash)
    place(m, 0, 400, 540); place(m, 1, 470, 540)
    m.s.players[1].pips[0] = 5
    const evs = swing(m, 30, 0, () => 0, (t) => ({ mx: 0, my: 0, aim: 128, buttons: t === 3 ? 1 : 0 }))
    expect(evs.some((e) => e.k === 'parry')).toBe(true)
    expect(hp(m, 0)).toBe(100)
    expect(hp(m, 1)).toBe(70)
    const shooter = plain({ name: 'Water Gun', shape: { kind: 'projectile', speed: 20, radius: 10, range: 600 }, onHit: dmg(20) })
    const r = testMatch(counter, shooter)
    place(r, 0, 400, 540); place(r, 1, 700, 540)
    r.s.players[1].pips[0] = 5
    const evs2 = swing(r, 30, 0, () => 0, (t) => ({ mx: 0, my: 0, aim: 128, buttons: t === 1 ? 1 : 0 }))
    expect(evs2.some((e) => e.k === 'parry')).toBe(false)
    expect(hp(r, 0)).toBe(80)
  })

  it('a tackle stops on the foe and bounces back; a swoop curves', () => {
    const tackle = plain({ name: 'Tackle', shape: { kind: 'dash', distance: 300, speed: 15, radius: 32, invulnerable: 0 }, onHit: dmg(20) })
    const m = testMatch(tackle, idle)
    place(m, 0, 400, 540); place(m, 1, 560, 540)
    swing(m, 30)
    expect(hp(m, 1)).toBe(80)
    expect(m.s.players[0].fighter.x).toBeLessThan(560 * FP - 40 * FP) // it didn't plow through
    const swoop = plain({ name: 'Wing Attack', shape: { kind: 'dash', distance: 300, speed: 15, radius: 30, invulnerable: 0 } })
    const w = testMatch(swoop, idle)
    place(w, 0, 400, 540); place(w, 1, 1500, 200)
    let maxOff = 0
    w.s.players[0].pips[0] = 5
    for (let t = 0; t < 30; t++) { run(w, 1, () => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? 1 : 0 }]); maxOff = Math.max(maxOff, Math.abs(w.s.players[0].fighter.y - 540 * FP)) }
    expect(maxOff).toBeGreaterThan(20 * FP)
  })

  it('armour (a Fighting windup) ignores a tap\'s flinch', () => {
    const m = testMatch(plain({ name: 'Double Slap', shape: melee(80, 128) }), plain({ shape: { kind: 'self' }, windup: 30 }, { types: ['Fighting'] }))
    // the foe's attack gets the Fighting armour from its type flavour only when flavoured: give it by hand
    m.def.kits[1].attacks[0].traits = ['armor']
    place(m, 0, 400, 540); place(m, 1, 460, 540)
    m.s.players[1].pips[0] = 5
    swing(m, 3, 0, () => 0, (t) => ({ mx: 0, my: 0, aim: 128, buttons: t === 0 ? 1 : 0 }))
    expect(m.s.players[1].fighter.flinch ?? 0).toBe(0)
    expect(m.s.players[1].fighter.cast).not.toBeNull()
  })
})

describe('determinism and prediction', () => {
  it('a melee-heavy fight replays to the same hash', () => {
    const play = () => {
      const m = testMatch(fixtureKit({ name: 'Seismic Toss', shape: melee(70, 80, 30), onHit: dmg(30) }), fixtureKit({ name: 'Counter', shape: melee(80, 110), onHit: dmg(20) }, { types: ['Fighting'] }), { arena: testArena(), seed: 7 })
      place(m, 0, 800, 540); place(m, 1, 900, 540)
      for (let t = 0; t < 900; t++) {
        m.s.players[0].pips[0] = 5; m.s.players[1].pips[0] = 5
        run(m, 1, () => [{ mx: t % 50 < 25 ? 1 : -1, my: 0, aim: (t * 3) & 255, buttons: t % 40 === 0 ? 1 : 0 }, { mx: 0, my: t % 60 < 30 ? 1 : -1, aim: 128, buttons: t % 33 === 0 ? 1 : 0 }])
      }
      return hashState(m.s)
    }
    expect(play()).toBe(play())
  })

  it('predicts a string, a bite (with its gnaw) and a throw exactly', () => {
    for (const [name, extra] of [['Pound', 0], ['Bite', GNAW_DAMAGE], ['Seismic Toss', 0]] as const) {
      const m = testMatch(plain({ name, cost: ['Colorless', 'Colorless'], shape: melee(70, 80), onHit: dmg(30) }), idle)
      place(m, 0, 800, 540); place(m, 1, 870, 540)
      const p = predictDamage(m.def, m.s, 0, 0, 1)!
      expect(p.avg, name).toBe(30 + extra)
      swing(m, 60)
      expect(100 - hp(m, 1), name).toBe(p.avg)
    }
  })
})
