// Signature moves (docs/MOVES.md "Signature moves"): hand kits fly like their names (adoptShape), a kit can pin its
// shape, Starmie's Psychic and Power Gem are different moves, the new shape features work, and the coverage can't
// quietly slide back to the broad buckets.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAttackText } from './cardtext'
import { TRAJECTORY, parseDamage, resolveKit } from './kit'
import { ARCHETYPES, archetypeFor } from './lexicon'
import { predictDamage } from './predict'
import { SIGNATURES } from './signatures'
import { fixtureKit, hp, place, run, testMatch } from './testing'
import { BTN, type CardData, type Kit, type Shape } from './types'

const root = resolve(__dirname, '../..')
const roster: CardData[] = JSON.parse(readFileSync(resolve(root, 'data/bots/roster.json'), 'utf8')).cards
/** a one-attack hand kit named `name` with this shape (90 HP, one Colorless energy) */
const hand = (name: string, shape: Shape, more: Partial<Kit['attacks'][number]> = {}) =>
  resolveKit(null, { ...fixtureKit({ name, shape, cost: ['Colorless'], damage: '30', onHit: [{ op: 'damage', amount: 30 }], ...more }), flavor: false }).attacks[0]

describe('hand kits take their name\'s trajectory', () => {
  it('a same-kind shape keeps its sizes and gains the path: Thunder Jolt zigzags, Power Gem shatters', () => {
    const tj = hand('Thunder Jolt', { kind: 'projectile', speed: 15, radius: 10, range: 640 })
    expect(tj.look).toBe('bolt')
    expect(tj.shape).toMatchObject({ kind: 'projectile', radius: 10, range: 640, path: 'zigzag' })
    const pg = hand('Power Gem', { kind: 'projectile', speed: 15, radius: 10, range: 700 })
    expect(pg.shape).toMatchObject({ kind: 'projectile', radius: 10, range: 700, split: 5 })
  })
  it('another kind takes the archetype\'s shape: a Tackle swing becomes the body charge, a Super Psy Bolt beam a bolt', () => {
    expect(hand('Tackle', { kind: 'melee', range: 64, arc: 72 }).shape.kind).toBe('dash')
    const b = hand('Super Psy Bolt', { kind: 'beam', length: 600, width: 20 })
    expect(b.shape).toMatchObject({ kind: 'projectile', path: 'zigzag', range: 600 })
  })
  it('keeps the kit\'s shape under a broad bucket, and a dodgeable shot under a beam archetype', () => {
    expect(hand('Beam', { kind: 'projectile', speed: 12, radius: 10, range: 500 }).shape.kind).toBe('projectile')
    expect(hand('Hyper Beam', { kind: 'projectile', speed: 12, radius: 10, range: 500 }).shape.kind).toBe('projectile')
  })
  it('a pinned shape stays the kit\'s own (the look still applies)', () => {
    const a = hand('Tackle', { kind: 'melee', range: 64, arc: 72 }, { pin: 'tuned as a swing' })
    expect(a.shape.kind).toBe('melee')
    expect(a.look).toBe('tackle')
  })
})

describe('Starmie: Psychic and Power Gem', () => {
  const kit = JSON.parse(readFileSync(resolve(root, 'data/kits/swsh9-55.json'), 'utf8')) as Kit
  const fk = resolveKit(null, { ...kit, stats: { hp: 90, types: ['Water'] }, attacks: kit.attacks.map((a) => ({ cost: ['Water', 'Colorless'], damage: '60', ...a })) })
  const [psy, gem] = ['Psychic', 'Power Gem'].map((n) => fk.attacks.find((a) => a.name === n)!)
  it('resolve to different looks and shapes', () => {
    expect(psy.look).toBe('psychic')
    expect(gem.look).toBe('powergem')
    expect(gem.shape.split).toBeGreaterThan(0)
    expect(psy.shape.split).toBeUndefined()
    // Power Gem keeps the kit's balance trim (r10, the notes' fix for a 95-100% Starmie)
    expect(gem.shape.radius).toBe(10)
  })
})

/** a flavour-off kit with one 40-damage attack of this shape */
const shooter = (shape: Shape): Kit => ({ ...fixtureKit({ shape, damage: '40', onHit: [{ op: 'damage', amount: 40 }] }), flavor: false })
const target = fixtureKit({ shape: { kind: 'self' } }, { hp: 1000 })
const proj = (extra: Partial<Shape> = {}): Shape => ({ kind: 'projectile', speed: 12, radius: 10, range: 500, ...extra })
function shoot(shape: Shape, fx: number, fy = 540, ticks = 150): { dmg: number; m: ReturnType<typeof testMatch> } {
  const m = testMatch(shooter(shape), target)
  place(m, 0, 400, 540); place(m, 1, fx, fy)
  m.s.players[0].pips = [5]
  run(m, ticks, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, undefined])
  return { dmg: 1000 - hp(m, 1), m }
}

describe('shape features', () => {
  it('split: a shot shatters into shards that never re-hit its target, but can catch a foe beside it', () => {
    expect(shoot(proj({ split: 5, splitSpread: 14, splitRange: 150 }), 700).dmg).toBe(40)
    // a foe just past the end of its range, off the line: only a shard reaches it, for its share
    const side = shoot(proj({ range: 300, split: 5, splitSpread: 20, splitRange: 150, splitPower: 500 }), 780, 580).dmg
    expect(side).toBeGreaterThan(0)
    expect(side).toBeLessThan(40)
  })
  it('fuse: a shot sticks and bursts a beat later, and a foe that walks off in time takes nothing', () => {
    const m = testMatch(shooter(proj({ fuse: 30, blast: 60 })), target)
    place(m, 0, 400, 540); place(m, 1, 600, 540)
    m.s.players[0].pips = [5]
    run(m, 30, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, undefined])
    expect(hp(m, 1)).toBe(1000) // stuck, not yet burst
    expect(m.s.areas.length).toBe(1)
    run(m, 60, () => [undefined, undefined])
    expect(1000 - hp(m, 1)).toBe(40)
    // the same, but the foe steps away in time
    const w = testMatch(shooter(proj({ fuse: 40, blast: 60 })), target)
    place(w, 0, 400, 540); place(w, 1, 600, 540)
    w.s.players[0].pips = [5]
    run(w, 100, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, t > 20 ? { mx: 0, my: 1, aim: 0, buttons: 0 } : undefined])
    expect(hp(w, 1)).toBe(1000)
    // `stick`: it clings to the foe it touched, so stepping away doesn't help (a dodge at the burst would)
    const k = testMatch(shooter(proj({ fuse: 40, blast: 60, stick: 1 })), target)
    place(k, 0, 400, 540); place(k, 1, 600, 540)
    k.s.players[0].pips = [5]
    run(k, 100, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, t > 20 ? { mx: 0, my: 1, aim: 0, buttons: 0 } : undefined])
    expect(1000 - hp(k, 1)).toBe(40)
  })
  it('grow: a shot swells as it flies', () => {
    const m = testMatch(shooter(proj({ grow: 2, growMax: 8, range: 1400, speed: 8 })), target)
    place(m, 0, 200, 300); place(m, 1, 1500, 900)
    m.s.players[0].pips = [5]
    run(m, 20, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, undefined])
    const r0 = m.s.projectiles[0].r
    run(m, 60, () => [undefined, undefined])
    expect(r0).toBeLessThan(18)
    expect(m.s.projectiles[0].r).toBe(18)
  })
  it('helix: a braided volley swings both ways about the aim line and still lands one hit', () => {
    const m = testMatch(shooter(proj({ count: 2, spread: 0, path: 'helix', amp: 14, period: 8 })), target)
    place(m, 0, 400, 300); place(m, 1, 1500, 900)
    m.s.players[0].pips = [5]
    run(m, 12, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, undefined])
    const ys = m.s.projectiles.map((p) => p.y)
    expect(Math.min(...ys)).toBeLessThan(300 * 256)
    expect(Math.max(...ys)).toBeGreaterThan(300 * 256)
    expect(shoot(proj({ count: 3, spread: 0, path: 'helix', amp: 14, period: 8 }), 700).dmg).toBe(40)
  })
  it('scatter: aimed impacts land around the aim point, the first on it', () => {
    const m = testMatch(shooter({ kind: 'area', at: 'aim', range: 300, radius: 40, count: 4, scatter: 80, delay: 10, stagger: 5 }), target)
    place(m, 0, 400, 540); place(m, 1, 1500, 900)
    m.s.players[0].pips = [5]
    for (let t = 0; t < 40 && !m.s.areas.length; t++) run(m, 1, () => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, undefined])
    const at = m.s.areas.map((a) => [Math.round(a.x / 256), Math.round(a.y / 256)])
    expect(at.length).toBe(4)
    const [hx, hy] = at[0]
    expect(Math.abs(hx - 700)).toBeLessThanOrEqual(8) // the aim point (marched in 8 px steps)
    expect(hy).toBe(540)
    // at least a line's spacing out (2 x (radius + 24)): one fighter is never under two
    for (const [x, y] of at.slice(1)) expect(Math.round(Math.hypot(x - hx, y - hy))).toBeGreaterThanOrEqual(127)
  })
  it('the damage preview dry-runs the new features: a split shot, a fused shot, a scatter', () => {
    for (const shape of [proj({ split: 5, splitSpread: 14 }), proj({ fuse: 20, blast: 60 }), { kind: 'area', at: 'aim', range: 300, radius: 50, count: 3, scatter: 70, delay: 10 } as Shape]) {
      const m = testMatch({ ...shooter(shape), flavor: false }, target)
      place(m, 0, 400, 540); place(m, 1, 650, 540)
      m.s.players[0].pips = [5]
      expect(predictDamage(m.def, m.s, 0, 0, 1)?.max, JSON.stringify(shape)).toBe(40)
    }
  })
})

describe('coverage (docs/MOVES.md "Signature moves")', () => {
  // the bot roster: every card a bot can field (in the repo, no pokeshell needed)
  const rows = roster.flatMap((c) => (c.attacks ?? []).map((a) => ({ c, a, r: archetypeFor(a.name, parseAttackText(a.text, c.name ?? 'X'), parseDamage(a.damage)) })))
  const hits = rows.filter((x) => x.r && x.r.id !== 'aura' && x.r.id !== 'field')
  it('most attacks that hit have a specific look, not a broad bucket', () => {
    const specific = hits.filter((x) => !ARCHETYPES[x.r!.id].generic && x.r!.source !== 'stem' && x.r!.source !== 'text').length
    expect(specific / hits.length).toBeGreaterThan(0.85)
  })
  it('the signature moves claim at least 150 attack names and 300 attacks', () => {
    const sig = hits.filter((x) => x.r!.source === 'signature')
    expect(new Set(sig.map((x) => x.a.name)).size).toBeGreaterThanOrEqual(150)
    expect(sig.length).toBeGreaterThanOrEqual(280)
    expect(SIGNATURES.length).toBeGreaterThanOrEqual(50)
  })
  it('nearly every hand-kit attack flies like its archetype (pinned, bucketed or kept on purpose otherwise)', () => {
    const byId = new Map(roster.map((c) => [c.id, c]))
    let n = 0, carry = 0
    for (const c of roster) {
      const p = resolve(root, 'data/kits', `${c.id}.json`)
      if (!existsSync(p)) continue
      const fk = resolveKit(byId.get(c.id)!, JSON.parse(readFileSync(p, 'utf8')) as Kit)
      for (const a of fk.attacks) {
        n++
        if (!a.look) continue
        const lex = ARCHETYPES[a.look].shape(a.cost.length, a.baseDamage, a.element)
        if (lex.kind === a.shape.kind && TRAJECTORY.every((k) => lex[k] === undefined || a.shape[k] !== undefined)) carry++
      }
    }
    expect(n).toBeGreaterThan(400)
    expect(carry / n).toBeGreaterThan(0.85)
  })
})
