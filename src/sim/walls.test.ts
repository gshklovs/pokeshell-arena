// Shots and walls: only a `phase` shot goes through a `#` wall or an `o` prop. A homing shot (the Psychic flavour,
// Lunar Blast's moon) stops at them too, and so does everything a shot brings with it: a grown radius, a wave's
// band, an impact blast, split shards, a fused burst, a splash. A low obstacle `=` is flown over; a lob flies over
// everything. Every kit attack that resolves to homing is fired at a foe behind a wall and must never hit it.
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseArena } from './arena'
import { defaultEnergy } from './energy'
import { resolveKit } from './kit'
import { createState } from './state'
import { step } from './step'
import { fixtureKit, hp, place, run, testArena, testMatch, type TestMatch } from './testing'
import { FP } from './fixed'
import { BTN, type ArenaFile, type CardData, type FighterKit, type Kit, type MatchDef, type Shape } from './types'

const root = resolve(__dirname, '../..')
const target = fixtureKit({ shape: { kind: 'self' } }, { hp: 1000 })
const kit = (shape: Shape, more: Partial<Kit['attacks'][number]> = {}): Kit =>
  ({ ...fixtureKit({ shape, damage: '40', onHit: [{ op: 'damage', amount: 40 }], ...more }), flavor: false })
const proj = (extra: Partial<Shape> = {}): Shape => ({ kind: 'projectile', speed: 12, radius: 10, range: 700, ...extra })
/** a column of tile `ch` at tile x (x px 40x..40x+39), rows from..to */
const column = (x: number, ch = '#', from = 1, to = 25): ArenaFile => testArena(Array.from({ length: to - from + 1 }, (_, i) => ({ x, y: from + i, ch })))
/** a row of tile `ch` at tile y, columns from..to */
const row = (y: number, from: number, to: number, ch = '#'): ArenaFile => testArena(Array.from({ length: to - from + 1 }, (_, i) => ({ x: from + i, y, ch })))

/** fire attack 1 once from (sx, sy) at `aim`, at a foe at (tx, ty), run `ticks`; the damage dealt */
function shoot(k: Kit, tx: number, ty = 540, o: { arena?: ArenaFile; aim?: number; sx?: number; sy?: number; ticks?: number } = {}): number {
  const m = testMatch(k, target, { arena: o.arena })
  place(m, 0, o.sx ?? 400, o.sy ?? 540); place(m, 1, tx, ty)
  m.s.players[0].pips = [5]
  run(m, o.ticks ?? 200, (t) => [{ mx: 0, my: 0, aim: o.aim ?? 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, undefined])
  return 1000 - hp(m, 1)
}

// the wall column at tile 15 is x 600..639: a foe just behind it, its body touching the far face
const WALL = column(15)
const BEHIND = 665

describe('shots stop at # walls and o props', () => {
  it('a plain shot and a homing shot hit in the open, never behind a wall', () => {
    expect(shoot(kit(proj()), BEHIND)).toBe(40)
    expect(shoot(kit(proj({ homing: 4 })), BEHIND)).toBe(40)
    expect(shoot(kit(proj()), BEHIND, 540, { arena: WALL })).toBe(0)
    expect(shoot(kit(proj({ homing: 4 })), BEHIND, 540, { arena: WALL })).toBe(0)
    expect(shoot(kit(proj({ homing: 4 })), BEHIND, 540, { arena: column(15, 'o') })).toBe(0)
  })
  it('a homing shot that turns into a wall stops there (it never bends around through it)', () => {
    // a wall row between the shooter's line and a foe below-right: the shot leaves level and bends down into it
    const shelf = row(15, 12, 30)
    expect(shoot(kit(proj({ homing: 6, range: 900 })), 800, 680, { arena: testArena() })).toBe(40)
    expect(shoot(kit(proj({ homing: 6, range: 900 })), 800, 680, { arena: shelf })).toBe(0)
  })
  it('a low obstacle = is flown over, homing or not', () => {
    expect(shoot(kit(proj()), BEHIND, 540, { arena: column(15, '=') })).toBe(40)
    expect(shoot(kit(proj({ homing: 4 })), BEHIND, 540, { arena: column(15, '=') })).toBe(40)
    expect(shoot(kit(proj({ blast: 80 })), BEHIND, 540, { arena: column(15, '=') })).toBe(40)
  })
  it('a grown shot never reaches through a wall: a swollen moon gliding past a wall end', () => {
    // a big shot flying along a one-tile wall row, just above it: the foe hides under the row
    const shelf = row(14, 1, 30) // y 560..599
    const moon = kit(proj({ radius: 24, grow: 8, growMax: 40, range: 900 }))
    expect(shoot(moon, 1100, 622)).toBe(40) // open: its swollen edge catches the foe
    expect(shoot(moon, 1100, 622, { arena: shelf })).toBe(0)
  })
  it('a wave\'s band never reaches through a wall', () => {
    const wave = proj({ speed: 8, radius: 16, wall: 70, range: 700, pierce: 9 })
    expect(shoot(kit(wave), 800, 600)).toBe(40)
    expect(shoot(kit(wave), 800, 625, { arena: row(14, 1, 30) })).toBe(0)
  })
  it('a shot squeezes through no diagonal seam of two walls touching at a corner', () => {
    // walls at (16, 13) and (15, 14) meet at (640, 560); the shot flies down-right through that corner
    const seam = testArena([{ x: 16, y: 13, ch: '#' }, { x: 15, y: 14, ch: '#' }])
    expect(shoot(kit(proj({ range: 900 })), 760, 680, { sx: 400, sy: 320, aim: 32, ticks: 120 })).toBe(40)
    expect(shoot(kit(proj({ range: 900 })), 760, 680, { arena: seam, sx: 400, sy: 320, aim: 32, ticks: 120 })).toBe(0)
  })
  it('a shot never starts on the far side of a wall its caster hugs', () => {
    // a 60-px shot from a fighter against a wall: its spawn point (body + radius ahead) would be past the tile
    const m = testMatch(kit(proj({ radius: 60 })), target, { arena: WALL })
    const r = m.s.players[0].fighter.r
    place(m, 0, 600 - r - 1, 540); place(m, 1, 720, 540)
    m.s.players[0].pips = [5]
    run(m, 120, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTN.ATTACK1 : 0 }, undefined])
    expect(1000 - hp(m, 1)).toBe(0)
  })
})

describe('what a shot brings with it stops at walls too', () => {
  it('an impact blast hits only what the blast centre can see', () => {
    expect(shoot(kit(proj({ blast: 80 })), BEHIND, 540, { arena: WALL })).toBe(0)
    // the blast still catches a foe beside the impact point on the open side
    expect(shoot(kit(proj({ blast: 80 })), 560, 610, { arena: column(15, '#', 1, 13) })).toBe(40)
  })
  it('split shards never pass the wall the shot broke on', () => {
    expect(shoot(kit(proj({ split: 8, splitSpread: 0, splitRange: 150 })), BEHIND, 540, { arena: WALL })).toBe(0)
    expect(shoot(kit(proj({ split: 5, splitSpread: 30, splitRange: 150 })), BEHIND, 540, { arena: WALL })).toBe(0)
  })
  it('a fused shot\'s burst never reaches through the wall it stuck to', () => {
    expect(shoot(kit(proj({ fuse: 20, blast: 90 })), BEHIND, 540, { arena: WALL })).toBe(0)
    expect(shoot(kit(proj({ fuse: 20, blast: 90 })), 560, 540)).toBe(40) // in the open it bursts on the foe
  })
  it('an impact splash (benchDamage in a 1v1) never reaches through a wall', () => {
    const splash = kit(proj(), { onHit: [], onImpact: [{ op: 'benchDamage', amount: 30, radius: 120 }] })
    expect(shoot(splash, BEHIND, 540, { arena: WALL })).toBe(0)
  })
  it('a lob still flies over a wall and bursts on the far side', () => {
    expect(shoot(kit(proj({ path: 'lob', blast: 70, range: 520 })), 920, 540, { arena: WALL })).toBe(40)
  })
  it('a phase shot still passes through walls (it is named for it)', () => {
    expect(shoot(kit(proj({ path: 'phase' })), 800, 540, { arena: WALL })).toBe(40)
  })
})

// ------------------------------------------------------------------ every homing attack in the game
const roster: CardData[] = JSON.parse(readFileSync(resolve(root, 'data/bots/roster.json'), 'utf8')).cards
const cards = new Map(roster.map((c) => [c.id, c]))
const kits = new Map<string, Kit>()
for (const f of readdirSync(resolve(root, 'data/kits'))) {
  if (!f.endsWith('.json')) continue
  const k = JSON.parse(readFileSync(resolve(root, 'data/kits', f), 'utf8')) as Kit
  kits.set(k.card, k)
}
/** every fighter the game can field from the roster: its hand kit, else its auto-kit */
function fighters(): FighterKit[] {
  const out: FighterKit[] = []
  const ids = new Set([...cards.keys(), ...kits.keys()])
  for (const id of ids) {
    try { out.push(resolveKit(cards.get(id) ?? null, kits.get(id) ?? null)) } catch { /* no card data and no numbers */ }
  }
  return out
}
const homing = fighters().flatMap((fk) => fk.attacks.map((a, i) => ({ fk, a, i })).filter(({ a }) => a.shape.kind === 'projectile' && (a.shape.homing as number) > 0))

/** a match of this fighter against a big dummy, both raw (printed HP) */
function duel(fk: FighterKit, arena: ArenaFile): TestMatch {
  const dummy = { ...resolveKit(null, target), hp: 1000 }
  const kitsArr = [{ ...fk, hp: fk.printedHp ?? fk.hp }, dummy]
  const def: MatchDef = {
    mode: '1v1', seed: 1, arena: parseArena(arena), kits: kitsArr, raw: true,
    players: [{ team: 0, name: 'A', members: [0], energy: defaultEnergy([kitsArr[0]]) }, { team: 1, name: 'B', members: [1], energy: defaultEnergy([kitsArr[1]]) }],
  }
  const s = createState(def)
  s.phase = 'fight'; s.phaseT = 0
  return { def, s }
}
const BTNS = [BTN.ATTACK1, BTN.ATTACK2, BTN.ATTACK3]
function fireAt(fk: FighterKit, i: number, arena: ArenaFile, tx: number, ty: number): number {
  const m = duel(fk, arena)
  place(m, 0, 400, 540); place(m, 1, tx, ty)
  m.s.players[0].pips = [9]
  for (let t = 0; t < 260; t++) step(m.def, m.s, [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTNS[i] : 0 }, undefined])
  return 1000 - hp(m, 1)
}

describe('every attack that resolves to homing', () => {
  it('there are homing attacks to check (the Psychic flavour, Lunar Blast)', () => {
    expect(homing.length).toBeGreaterThan(20)
    const lunar = homing.find(({ fk, a }) => fk.card === 'me55-80' && a.name === 'Lunar Blast')
    expect(lunar, 'Lunala\'s Lunar Blast homes').toBeTruthy()
    expect(lunar!.a.shape).toMatchObject({ kind: 'projectile', grow: 2 })
    expect((lunar!.a.shape.blast as number) > 0).toBe(true)
  })
  it('none ever hits a foe behind a # wall, or an o prop, from any angle off the line', () => {
    // a full-height wall: the foe sits just behind it, level with the shooter and off to either side
    const fails: string[] = []
    let open = 0
    for (const { fk, a, i } of homing) {
      for (const ty of [540, 470, 610]) {
        if (fireAt(fk, i, WALL, BEHIND, ty) > 0) fails.push(`${fk.card} ${fk.name}: ${a.name} (foe at y ${ty})`)
      }
      if (fireAt(fk, i, column(15, 'o'), BEHIND, 540) > 0) fails.push(`${fk.card} ${fk.name}: ${a.name} (through a prop)`)
      if (fireAt(fk, i, testArena(), BEHIND, 540) > 0) open++
    }
    expect(fails).toEqual([])
    // the same shots do land in the open (the walls are what stopped them)
    expect(open).toBeGreaterThan(homing.length * 0.8)
  })
  it('Lunar Blast: blocked by a wall, a prop and by a wall it bends into, lands in the open and over a low obstacle', () => {
    const { fk, i } = homing.find(({ fk, a }) => fk.card === 'me55-80' && a.name === 'Lunar Blast')!
    expect(fireAt(fk, i, testArena(), BEHIND, 540)).toBeGreaterThan(0)
    expect(fireAt(fk, i, column(15, '='), BEHIND, 540)).toBeGreaterThan(0)
    expect(fireAt(fk, i, WALL, BEHIND, 540)).toBe(0)
    expect(fireAt(fk, i, column(15, 'o'), BEHIND, 540)).toBe(0)
    expect(fireAt(fk, i, row(14, 1, 30), 760, 640)).toBe(0)
  })
})

describe('Lunar Blast is dodgeable (its homing is gentle)', () => {
  /** Lunala fires Lunar Blast at the dummy 360 px off, which rolls sideways when the moon is `when` px off (0: never) */
  function dodge(when: number): number {
    const { fk, i } = homing.find(({ fk, a }) => fk.card === 'me55-80' && a.name === 'Lunar Blast')!
    const m = duel(fk, testArena())
    place(m, 0, 400, 540); place(m, 1, 760, 540)
    m.s.players[0].pips = [9]
    let rolled = false
    for (let t = 0; t < 260; t++) {
      const pr = m.s.projectiles[0], g = m.s.players[1].fighter
      const go = !rolled && when > 0 && !!pr && Math.hypot(pr.x - g.x, pr.y - g.y) <= when * FP
      if (go) rolled = true
      step(m.def, m.s, [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? BTNS[i] : 0 }, { mx: 0, my: go ? 1 : 0, aim: 128, buttons: go ? BTN.DODGE : 0 }])
    }
    return 1000 - hp(m, 1)
  }
  it('standing still it lands; a sidestep roll as it closes in avoids it (moon, blast and all)', () => {
    expect(dodge(0)).toBeGreaterThan(0)
    // from just before it touches (55 px, centre to centre) to well ahead of it
    for (const when of [55, 80, 120, 200]) expect(dodge(when), `roll at ${when} px`).toBe(0)
  })
})
