import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BOT_LEVELS } from '../bots/bot'
import { resolveKit } from '../sim/kit'
import { cardScore, evolutionPool, isRuleBox, rollAnyTeam, rollBotTeam, rollMyTeam, type RosterCard } from './botteams'
import { canEvolveInto } from '../sim/evolution'
import { collectionRoster, type CollectionCard } from './kits'

const roster: RosterCard[] = JSON.parse(readFileSync(resolve(__dirname, '../../data/bots/roster.json'), 'utf8')).cards
const byId = new Map(roster.map((c) => [c.id, c]))
/** the cards picked or rolled for the slots (what they enter as is `members`: the Basics of their lines) */
const ids = (t: { picked: { kit: { card: string } }[] }) => t.picked.map((e) => e.kit.card)

/** a caught collection of real cards, in the shape of `pokeshell collection --json` */
function collection(cards: string[]): CollectionCard[] {
  return cards.map((id) => {
    const c = byId.get(id)!
    return { card: id, character: c.character, name: c.name, caught: true, data: { ...c } }
  })
}
const OWNED = ['base1-46', 'base1-24', 'base1-4', 'base1-63', 'base1-42', 'base1-58', 'base1-14', 'base1-44', 'swsh7-7', 'swsh7-8']

describe('the bot roster', () => {
  it('is real card numbers only (no rules text) and every card resolves to a fighter', () => {
    expect(roster.length).toBeGreaterThan(500)
    for (const c of roster) {
      expect(JSON.stringify(c)).not.toContain('"text"')
      expect(() => resolveKit(c, null)).not.toThrow()
    }
  })
})

describe('Random mode: your team from your cards, the bot from all cards', () => {
  const mine = collectionRoster(collection(OWNED))
  it('only ever gives you cards you own, distinct, the size asked (capped by what you own)', () => {
    const owned = new Set(OWNED)
    for (let seed = 1; seed <= 60; seed++) {
      for (const size of [1, 3, 6]) {
        const t = rollMyTeam(mine, size, seed)
        expect(t.members).toHaveLength(size)
        expect(t.picked).toHaveLength(size)
        expect(new Set(ids(t)).size).toBe(size)
        for (const id of ids(t)) expect(owned.has(id)).toBe(true)
        for (const e of t.evolutions) expect(owned.has(e.kit.card)).toBe(true)
      }
    }
    expect(rollMyTeam(mine.slice(0, 2), 6, 1).members).toHaveLength(2)
  })
  it('is deterministic with a seed, and different seeds roll different teams', () => {
    expect(ids(rollMyTeam(mine, 3, 42))).toEqual(ids(rollMyTeam(mine, 3, 42)))
    expect(ids(rollAnyTeam(roster, 3, 42))).toEqual(ids(rollAnyTeam(roster, 3, 42)))
    const seen = new Set<string>()
    for (let seed = 1; seed <= 20; seed++) seen.add(ids(rollMyTeam(mine, 3, seed)).join())
    expect(seen.size).toBeGreaterThan(10)
  })
  it('the bot rolls from all cards (not just yours)', () => {
    const owned = new Set(OWNED)
    let outside = 0
    for (let seed = 1; seed <= 20; seed++) for (const id of ids(rollAnyTeam(roster, 3, seed))) if (!owned.has(id)) outside++
    expect(outside).toBeGreaterThan(50)
  })
})

describe('Choose mode: the bot rolls good cards, weighted by the difficulty', () => {
  for (const level of BOT_LEVELS) {
    it(`${level}: a full team of distinct cards, reproducible from the seed`, () => {
      for (const size of [1, 3, 6]) {
        const t = rollBotTeam(roster, level, size, 11)
        expect(t.members).toHaveLength(size)
        expect(new Set(t.picked.map((e) => e.kit.name)).size).toBe(size)
        expect(ids(rollBotTeam(roster, level, size, 11))).toEqual(ids(t))
      }
    })
  }
  it('harder levels roll stronger cards, and expert rolls mostly premium V / VMAX / ex', () => {
    const stats = BOT_LEVELS.map((level) => {
      let score = 0, rule = 0, n = 0
      for (let seed = 1; seed <= 40; seed++) for (const id of ids(rollBotTeam(roster, level, 3, seed))) { const c = byId.get(id)!; score += cardScore(c); rule += isRuleBox(c) ? 1 : 0; n++ }
      return { score: score / n, rule: rule / n }
    })
    for (let i = 1; i < stats.length; i++) expect(stats[i].score, `${BOT_LEVELS[i]}: ${JSON.stringify(stats)}`).toBeGreaterThan(stats[i - 1].score)
    expect(stats[0].rule).toBeLessThan(0.15) // easy: modest
    expect(stats[3].rule).toBeGreaterThan(0.6) // expert: premium
  })
  it('bots get the next-stage cards of their team to evolve into', () => {
    let found = 0
    for (let seed = 1; seed <= 30; seed++) {
      const t = rollBotTeam(roster, 'easy', 3, seed)
      const line = [...t.members, ...t.paths.flat()]
      for (const e of t.evolutions) {
        found++
        expect(line.some((x) => canEvolveInto(x.kit, e.kit)) || t.evolutions.some((x) => canEvolveInto(x.kit, e.kit))).toBe(true)
      }
    }
    expect(found).toBeGreaterThan(10)
  })
})

it('evolutionPool follows evolvesFrom by name, two stages deep', () => {
  const card = (id: string, name: string, from: string | null) => ({ kit: resolveKit({ id, name, hp: 50, evolvesFrom: from, attacks: [{ name: 'Hit', cost: ['Colorless'], damage: '10' }] }, null) })
  const a = card('t-1', 'Charmander', null), b = card('t-2', 'Charmeleon', 'Charmander'), c = card('t-3', 'Charizard', 'Charmeleon'), d = card('t-4', 'Wartortle', 'Squirtle')
  expect(evolutionPool([a], [d, c, b]).map((e) => e.kit.card)).toEqual(['t-2', 't-3'])
  expect(evolutionPool([a, b], [b, c]).map((e) => e.kit.card)).toEqual(['t-3'])
})
