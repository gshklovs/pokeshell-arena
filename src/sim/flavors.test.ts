// Type flavours: one test per trait, plus the timing model (no cooldown on energy attacks) and the opt-out.
import { describe, expect, it } from 'vitest'
import { resolveKit } from './kit'
import * as R from './rules'
import { makeCtx } from './shapes'
import { step } from './step'
import { COLS } from './terrain'
import { fixtureKit, hp, place, run, testMatch } from './testing'
import type { Effect, Kit, KitAttack, ResolvedAttack } from './types'

const shot = { kind: 'projectile' as const, speed: 12, radius: 10, range: 900 }
const kitOf = (element: string, attack: Partial<KitAttack> = {}, stats: Kit['stats'] = {}): Kit =>
  fixtureKit({ element, shape: shot, damage: '40', onHit: [{ op: 'damage', amount: 40 }], ...attack }, { types: [element], ...stats })
const atk = (element: string, attack: Partial<KitAttack> = {}): ResolvedAttack => resolveKit(null, kitOf(element, attack)).attacks[0]
const ops = (l: Effect[]) => l.map((e) => e.op)
const target = fixtureKit({ shape: { kind: 'self' } }, { hp: 1000 })

describe('type flavours', () => {
  it('Psychic: gentle homing curves a shot aimed beside the foe into it; slower, 10% less damage', () => {
    const a = atk('Psychic')
    expect(a.shape.homing).toBe(R.PSY_HOMING)
    expect(a.shape.speed).toBeLessThan(atk('Colorless').shape.speed as number)
    expect(a.onHit[0]).toEqual({ op: 'bonus', amount: -4 })
    const hitWith = (element: string) => {
      const m = testMatch(kitOf(element), target)
      place(m, 0, 400, 540); place(m, 1, 900, 540)
      m.s.players[0].pips = [5]
      run(m, 120, (t) => [{ mx: 0, my: 0, aim: 12, buttons: t === 0 ? 1 : 0 }, undefined]) // ~17 degrees off
      return 1000 - hp(m, 1)
    }
    expect(hitWith('Colorless')).toBe(0) // straight: it misses
    expect(hitWith('Psychic')).toBe(36) // it curves in, 40 - 10%
  })
  it('Fire: a shot leaves a burning trail', () => {
    const m = testMatch(kitOf('Fire'), target)
    place(m, 0, 400, 540); place(m, 1, 1500, 900)
    m.s.players[0].pips = [5]
    run(m, 30, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? 1 : 0 }, undefined])
    const row = Math.floor(540 / 40)
    expect(m.s.fire.slice(row * COLS + 12, row * COLS + 20).filter((v) => v > 0).length).toBeGreaterThan(3)
  })
  it('Water: pushes back and floods where it lands', () => {
    const a = atk('Water')
    expect(ops(a.onHit)).toContain('knockback')
    expect(a.onImpact.some((e) => e.op === 'paint' && e.terrain === 'water')).toBe(true)
  })
  it('Lightning: faster shots, a quicker recovery, and it arcs through water', () => {
    const a = atk('Lightning'), c = atk('Colorless')
    expect(a.shape.speed).toBeGreaterThan(c.shape.speed as number)
    expect(a.recovery).toBeLessThan(atk('Metal').recovery)
    expect(ops(a.onHit)).toContain('chain')
  })
  it('Grass: roots and drains', () => {
    const m = testMatch(kitOf('Grass', { shape: { kind: 'self' } }), target)
    m.s.players[0].members[0].hp = 50
    const a = atk('Grass')
    makeCtx(m.def, m.s, { player: 0, attack: 0, element: 'Grass', bonus: 0 }, 1, 0, 0).run(a.onHit)
    expect(m.s.players[1].fighter.slow?.permille).toBe(250)
    expect(hp(m, 0)).toBe(60)
  })
  it("Fighting: armour while winding up (less damage, no knockback)", () => {
    const fighter = kitOf('Fighting', { shape: { kind: 'melee', range: 70 }, windup: 30 })
    const m = testMatch(fighter, target)
    place(m, 0, 900, 540); place(m, 1, 960, 540)
    m.s.players[0].pips = [5]
    step(m.def, m.s, [{ mx: 0, my: 0, aim: 0, buttons: 1 }, undefined])
    expect(m.s.players[0].fighter.cast).not.toBeNull()
    const x0 = m.s.players[0].fighter.x
    makeCtx(m.def, m.s, { player: 1, attack: 0, element: 'Colorless', bonus: 0 }, 0, 0, 0).run([{ op: 'damage', amount: 40 }, { op: 'knockback', px: 200 }])
    expect(hp(m, 0)).toBe(100 - 30)
    run(m, 10)
    expect(m.s.players[0].fighter.x).toBe(x0)
  })
  it('Darkness: ambush does 30% more from behind', () => {
    const m = testMatch(kitOf('Darkness', { shape: { kind: 'self' } }), target)
    place(m, 0, 800, 540); place(m, 1, 900, 540)
    m.s.players[1].fighter.aim = 0 // the foe faces away (+x), the attacker is behind it
    makeCtx(m.def, m.s, { player: 0, attack: 0, element: 'Darkness', bonus: 0 }, 1, 0, 0).run([{ op: 'damage', amount: 40 }])
    expect(hp(m, 1)).toBe(1000 - 52)
    m.s.players[1].fighter.aim = 128 // facing the attacker
    makeCtx(m.def, m.s, { player: 0, attack: 0, element: 'Darkness', bonus: 0 }, 1, 0, 0).run([{ op: 'damage', amount: 40 }])
    expect(hp(m, 1)).toBe(1000 - 52 - 40)
  })
  it('Metal: heavy (slower, heavier recovery), braces after casting, breaks props twice as fast', () => {
    const a = atk('Metal'), c = atk('Colorless')
    expect(a.shape.speed).toBeLessThan(c.shape.speed as number)
    expect(a.recovery).toBeGreaterThan(c.recovery)
    expect(a.onCast).toContainEqual({ op: 'buff', stat: 'defense', amount: 20, ticks: 60 })
    expect(a.shape.propDamage).toBe(2000)
  })
  it('Dragon: shots pierce the first target; beams are wider', () => {
    expect(atk('Dragon').shape.pierce).toBe(1)
    expect(atk('Dragon', { shape: { kind: 'beam', length: 500, width: 20 } }).shape.width).toBe(26)
  })
  it("Fairy: charm weakens the target's next attacks", () => {
    expect(atk('Fairy').onHit).toContainEqual({ op: 'buff', stat: 'damage', amount: -20, ticks: R.TURN, target: 'target' })
  })
  it('Colorless: reliable, a quicker windup', () => {
    const plain = resolveKit(null, { ...kitOf('Colorless', { windup: 20 }), flavor: false }).attacks[0]
    expect(atk('Colorless', { windup: 20 }).windup).toBe(plain.windup - 2)
  })
  it('a kit or an attack can opt out', () => {
    const off = resolveKit(null, kitOf('Psychic', { flavor: false })).attacks[0]
    expect(off.shape.homing).toBeUndefined()
    expect(off.traits).toEqual([])
  })
})

describe('the timing model', () => {
  it('an energy attack has no cooldown and a recovery that grows with damage; a 0-cost one keeps a cooldown', () => {
    const cheap = resolveKit(null, fixtureKit({ shape: { kind: 'self' }, damage: '30', cost: ['Colorless'], flavor: false })).attacks[0]
    const big = resolveKit(null, fixtureKit({ shape: { kind: 'self' }, damage: '240', cost: ['Colorless', 'Colorless', 'Colorless'], flavor: false })).attacks[0]
    const free = resolveKit(null, fixtureKit({ shape: { kind: 'self' }, damage: '10', cost: [], cooldown: undefined, flavor: false })).attacks[0]
    expect(cheap.cooldown).toBe(0)
    expect(big.cooldown).toBe(0)
    expect(big.recovery).toBeGreaterThan(cheap.recovery)
    expect(big.recovery).toBeLessThanOrEqual(R.RECOVERY_MAX)
    expect(free.cooldown).toBe(R.ZERO_COST_COOLDOWN)
  })
  it('a Pokémon with no damaging attack fills its evolve charge faster with time (it earns none by damage)', () => {
    // everyone's charge creeps up (EVO_PASSIVE_TICKS); a no-damage Pokémon gets 1 more every EVO_IDLE_EVERY
    const m = testMatch(fixtureKit({ shape: { kind: 'self' }, damage: '' }), target)
    run(m, R.EVO_IDLE_EVERY * 10)
    const m2 = testMatch(fixtureKit({ shape: { kind: 'self' } }), target)
    run(m2, R.EVO_IDLE_EVERY * 10)
    expect(m.s.players[0].evo - m2.s.players[0].evo).toBeGreaterThanOrEqual(9)
  })
})
