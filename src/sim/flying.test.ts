import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import flying from '../../data/flying.json'
import { parseArena } from './arena'
import { FP } from './fixed'
import { isFlier } from './flying'
import { resolveKit } from './kit'
import { bodyRadiusPx, feetOf, fighterBlocked, footOffsetPx } from './movement'
import { createState } from './state'
import { step } from './step'
import { fixtureKit, testArena } from './testing'
import { BTN, swapTo, type InputFrame, type Kit, type MatchDef, type SimState } from './types'

const kit = (character: string, retreat = 2): Kit => ({ ...fixtureKit({ shape: { kind: 'self' } }, { retreat }), character })
interface M { def: MatchDef; s: SimState }
/** a match: player 0 has the given members, player 1 a parked dummy */
function match(members: Kit[], marks: { x: number; y: number; ch: string }[]): M {
  const kits = [...members, kit('rattata')].map((k) => resolveKit(null, k))
  const def: MatchDef = {
    mode: '1v1', seed: 1, arena: parseArena(testArena(marks)), kits, raw: true,
    players: [
      { team: 0, name: 'A', members: members.map((_, i) => i), energy: ['Colorless'] },
      { team: 1, name: 'B', members: [members.length], energy: ['Colorless'] },
    ],
  }
  const s = createState(def)
  s.phase = 'fight'; s.phaseT = 0
  s.players[1].fighter.x = 1840 * FP; s.players[1].fighter.y = 1000 * FP
  s.players[0].pips = [10]
  return { def, s }
}
function walkRight(n: number, m: M, extra: Partial<InputFrame> = {}): void {
  for (let t = 0; t < n; t++) step(m.def, m.s, [{ mx: 1, my: 0, aim: 0, buttons: 0, ...extra }])
}
/** a 3-tile band of `ch` down the field at columns 15..17 (x 600..720) */
function band(ch: string): { x: number; y: number; ch: string }[] {
  const out = []
  for (let y = 1; y < 26; y++) for (let x = 15; x <= 17; x++) out.push({ x, y, ch })
  return out
}
function placeFeet(m: M, x: number, y: number): void {
  const f = m.s.players[0].fighter
  f.x = x * FP; f.y = (y - footOffsetPx(f.r)) * FP
}

describe('fliers', () => {
  it('the species list: Flying types, Levitate and curated floaters fly; ground species do not', () => {
    for (const c of ['charizard', 'pidgeot', 'gyarados', 'rayquaza', 'lugia', 'noivern', 'gastly', 'haunter', 'gengar',
      'koffing', 'weezing', 'unown', 'bronzor', 'bronzong', 'rotom', 'latias', 'cresselia', 'giratina-origin', 'hydreigon',
      'eternatus', 'tornadus', 'vivillon-poke-ball']) expect(isFlier(c), c).toBe(true)
    for (const c of ['charmander', 'snorlax', 'pikachu', 'giratina', 'squirtle', 'onix']) expect(isFlier(c), c).toBe(false)
  })

  it('the list covers every species this repo knows, and pokeshell carddata when it is checked out', () => {
    const known = new Set(flying.species)
    const names = new Set<string>()
    const kits = resolve(__dirname, '../../data/kits')
    for (const f of readdirSync(kits)) { const c = JSON.parse(readFileSync(join(kits, f), 'utf8')).character; if (c) names.add(c) }
    for (const c of JSON.parse(readFileSync(resolve(__dirname, '../../data/bots/roster.json'), 'utf8')).cards) if (c.character) names.add(c.character)
    const shell = process.env.POKESHELL_REPO ?? resolve(__dirname, '../../../pokeshell')
    const pack = join(shell, 'packs/pokemon/pack.json'), cdata = join(shell, 'packs/pokemon/carddata.json')
    if (existsSync(pack) && existsSync(cdata)) {
      const cards = JSON.parse(readFileSync(pack, 'utf8')).cards
      for (const id of Object.keys(JSON.parse(readFileSync(cdata, 'utf8')).cards)) if (cards[id]?.character) names.add(cards[id].character)
    }
    expect([...names].filter((n) => !known.has(n))).toEqual([])
    expect(flying.unknown).toEqual([])
  })

  for (const [what, ch] of [['deep water', '~'], ['the void', '_']] as const) {
    it(`a flier crosses ${what}; a non-flier stops at its edge`, () => {
      const fl = match([kit('charizard')], band(ch))
      expect(fl.s.players[0].fighter.move?.fly).toBe(true)
      placeFeet(fl, 500, 540)
      walkRight(120, fl)
      expect(fl.s.players[0].fighter.x).toBeGreaterThan(760 * FP)
      const gr = match([kit('charmander')], band(ch))
      expect(gr.s.players[0].fighter.move).toBeUndefined()
      placeFeet(gr, 500, 540)
      walkRight(120, gr)
      expect(gr.s.players[0].fighter.x).toBeLessThanOrEqual((600 - bodyRadiusPx(gr.s.players[0].fighter.r)) * FP)
    })
  }

  it('a flier ignores the slow of created water (flooded shallows); a ground fighter is slowed', () => {
    const run = (character: string) => {
      const m = match([kit(character)], [])
      for (let x = 10; x < 40; x++) for (let y = 10; y < 17; y++) m.s.wet[y * 48 + x] = 1000
      placeFeet(m, 500, 540)
      const x0 = m.s.players[0].fighter.x
      walkRight(60, m)
      return m.s.players[0].fighter.x - x0
    }
    const fly = run('pidgeot'), walk = run('rattata')
    expect(walk).toBeLessThan(fly * 0.8)
    expect(fly).toBeGreaterThan(240 * FP) // retreat 2: 250 px/s for a second, less the tick rounding
  })

  it('landing: swapping a flier over the void for a non-flier puts it on the nearest floor', () => {
    const m = match([kit('charizard'), kit('snorlax', 4)], band('_'))
    placeFeet(m, 700, 540) // over the void, near its right edge (floor from x 720)
    step(m.def, m.s, [{ mx: 0, my: 0, aim: 0, buttons: swapTo(2) }])
    const f = m.s.players[0].fighter
    expect(m.s.players[0].active).toBe(1)
    expect(fighterBlocked(m.s, f)).toBe(false)
    expect(feetOf(f).x).toBeGreaterThanOrEqual((720 + bodyRadiusPx(f.r)) * FP)
    expect(feetOf(f).x).toBeLessThan(780 * FP) // the nearest floor, not the spawn point (x 400)
    expect(Math.abs(feetOf(f).y - 540 * FP)).toBeLessThan(8 * FP)
  })

  it('landing: a flier over deep water evolving into a non-flier comes down on the nearest floor', () => {
    const m = match([kit('charizard')], band('~'))
    // the evolution: a non-flier that evolves from the fixture (kit index 2, after the dummy)
    const evo = resolveKit(null, { ...kit('snorlax', 4), stats: { ...kit('snorlax', 4).stats, evolvesFrom: 'Fixture' } })
    m.def.kits.push(evo)
    m.def.players[0].evolutions = [m.def.kits.length - 1]
    m.s.players[0].evo = 1 << 20
    placeFeet(m, 620, 300)
    step(m.def, m.s, [{ mx: 0, my: 0, aim: 0, buttons: BTN.EVOLVE }])
    const f = m.s.players[0].fighter
    expect(m.s.players[0].members[0].kit).toBe(m.def.kits.length - 1)
    expect(f.move).toBeUndefined()
    expect(fighterBlocked(m.s, f)).toBe(false)
    expect(feetOf(f).x).toBeLessThan(600 * FP) // the near shore (x < 600), not across
    expect(feetOf(f).x).toBeGreaterThan(540 * FP)
  })
})
