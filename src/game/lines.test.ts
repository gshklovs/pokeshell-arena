import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canEvolveInto, isBasicCard } from '../sim/evolution'
import { kitFor, playerSide, rollAnyTeam, rollBotTeam, rollMyTeam, type RosterCard } from './botteams'
import { lineFor, lineText } from './lines'
import type { RosterEntry } from './kits'

const roster: RosterCard[] = JSON.parse(readFileSync(resolve(__dirname, '../../data/bots/roster.json'), 'utf8')).cards
const byId = new Map(roster.map((c) => [c.id, c]))
const own = (...ids: string[]): RosterEntry[] => ids.map((id) => ({ kit: kitFor(byId.get(id)!), shiny: false, owned: true }))
const loan = (c: RosterCard): RosterEntry | null => ({ kit: kitFor(c), shiny: false, owned: false, loaner: true })
const cards = (xs: { kit: { card: string } }[]) => xs.map((e) => e.kit.card)

describe('start lines: a slot enters as the Basic of its line', () => {
  it('a Stage 2 starts as an owned Basic, through an owned Stage 1, preferring the same set', () => {
    const mine = own('base1-4', 'base1-24', 'sm115-8', 'sm115-7', 'base1-46')
    const l = lineFor(mine[0], mine, roster, loan)
    expect(l.start.kit.card).toBe('base1-46') // Base Set Charmander, not the Hidden Fates one
    expect(cards(l.path)).toEqual(['base1-24', 'base1-4'])
    expect(lineText(l)).toBe('Charmander → Charmeleon → Charizard')
    expect([l.start, ...l.path].some((e) => e.loaner)).toBe(false)
  })
  it('a VMAX starts as its V', () => {
    const mine = own('swsh7-95', 'swsh7-94', 'me55-91')
    const l = lineFor(mine[0], mine, roster, loan)
    expect(l.start.kit.name).toBe('Umbreon V')
    expect(l.start.loaner).toBeFalsy()
    expect(cards(l.path)).toEqual(['swsh7-95'])
  })
  it('owning no lower stage: a loaner from every card, the same set first, flagged', () => {
    const mine = own('base1-4')
    const l = lineFor(mine[0], mine, roster, loan)
    expect(l.start.kit.card).toBe('base1-46')
    expect(l.start.loaner).toBe(true)
    expect(l.path[0].kit.card).toBe('base1-24')
    expect(l.path[0].loaner).toBe(true)
    expect(l.path[1].loaner).toBeFalsy()
    expect(lineText(l)).toBe('Charmander (loaner) → Charmeleon (loaner) → Charizard')
    // a VMAX with no V owned borrows the V of its own set
    const v = lineFor(own('swsh7-95')[0], own('swsh7-95'), roster, loan)
    expect(v.start.kit.card).toBe('swsh7-94')
    expect(v.start.loaner).toBe(true)
  })
  it("the 'as-is' policy starts as the lowest owned card instead of borrowing", () => {
    const mine = own('base1-4', 'base1-24')
    const l = lineFor(mine[0], mine, roster, loan, 'as-is')
    expect(l.start.kit.card).toBe('base1-24')
    expect(cards(l.path)).toEqual(['base1-4'])
    expect(lineFor(mine[0], own('base1-4'), roster, loan, 'as-is').path).toEqual([])
  })
  it('a Basic starts as itself', () => {
    const mine = own('base1-46')
    const l = lineFor(mine[0], mine, roster, loan)
    expect(l.start.kit.card).toBe('base1-46')
    expect(l.path).toEqual([])
  })
})

describe('sides: yours and the bots', () => {
  const mine = own('base1-4', 'base1-24', 'base1-46', 'base1-58', 'base1-14', 'swsh7-50', 'swsh7-125', 'me55-69', 'me55-91', 'me55-92', 'sm115-18', 'sm115-23', 'swsh9tg-TG01', 'swsh7-95', 'swsh7-94', 'base1-26', 'base1-18')
  it('a rolled team is deterministic with a seed, and every slot enters as a Basic of its picked card', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const a = rollMyTeam(mine, 4, seed, roster, loan), b = rollMyTeam(mine, 4, seed, roster, loan)
      expect(cards(a.members)).toEqual(cards(b.members))
      expect(a.paths.map(cards)).toEqual(b.paths.map(cards))
      a.picked.forEach((p, i) => {
        const line = [a.members[i], ...a.paths[i]]
        expect(line[line.length - 1].kit.card).toBe(p.kit.card)
        expect(isBasicCard(a.members[i].kit)).toBe(true)
        for (let k = 1; k < line.length; k++) expect(canEvolveInto(line[k - 1].kit, line[k].kit)).toBe(true)
      })
    }
  })
  it('evolution options come from the whole owned collection, more than three per card', () => {
    const side = playerSide(own('swsh7-125'), mine, roster, loan) // Eevee alone
    const names = side.evolutions.map((e) => e.kit.name)
    expect(names).toEqual(expect.arrayContaining(['Espeon', 'Umbreon', 'Umbreon ex', 'Vaporeon', 'Jolteon', 'Flareon']))
    expect(side.evolutions.every((e) => e.owned)).toBe(true)
  })
  it("another slot's line cards are not in the shared pool", () => {
    const side = playerSide(own('base1-4', 'base1-58'), mine, roster, loan) // Charizard, Pikachu
    expect(cards(side.members)).toEqual(['base1-46', 'base1-58'])
    const pool = cards(side.evolutions)
    expect(pool).not.toContain('base1-24')
    expect(pool).not.toContain('base1-4')
    expect(pool).toEqual(expect.arrayContaining(['base1-14', 'swsh7-50'])) // both Raichus you own
  })
  it('bots start on Basics too, from the roster (never a loaner), deterministically', () => {
    let evolved = 0
    for (let seed = 1; seed <= 30; seed++) {
      for (const t of [rollBotTeam(roster, 'expert', 3, seed), rollAnyTeam(roster, 3, seed)]) {
        t.picked.forEach((p, i) => {
          const line = [t.members[i], ...t.paths[i]]
          expect(line[line.length - 1].kit.card).toBe(p.kit.card)
          expect(line.some((e) => e.loaner)).toBe(false)
          if (t.paths[i].length) { evolved++; expect(isBasicCard(t.members[i].kit)).toBe(true) }
        })
      }
      const a = rollBotTeam(roster, 'hard', 3, seed), b = rollBotTeam(roster, 'hard', 3, seed)
      expect(cards(a.members)).toEqual(cards(b.members))
      expect(a.paths.map(cards)).toEqual(b.paths.map(cards))
    }
    expect(evolved).toBeGreaterThan(20)
  })
})
