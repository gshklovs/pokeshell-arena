// The move lexicon covers every fielded attack (docs/MOVES.md): the bot roster (data/bots/roster.json, every card a
// bot can field), the collection fixture, and with POKEARENA_CARDS the whole card pool. None is left on the bare
// type default (the allowlist below is empty and must stay justified if it ever grows).
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { autoKit } from './autokit'
import { parseAttackText } from './cardtext'
import { validateKit } from './kit'
import { ARCHETYPES, archetypeFor, lexShape } from './lexicon'
import type { CardData } from './types'

const root = resolve(__dirname, '../..')
const roster: CardData[] = JSON.parse(readFileSync(resolve(root, 'data/bots/roster.json'), 'utf8')).cards
const fixture: CardData[] = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/collection.json'), 'utf8')).cards.flatMap((c: { data?: CardData }) => (c.data ? [c.data] : []))
/** attacks allowed on the bare type default, each with its reason */
const ALLOW: Record<string, string> = {}
const dmg = (d: string | undefined) => parseInt(/\d+/.exec(d ?? '')?.[0] ?? '0', 10)

function leftovers(cards: CardData[]): string[] {
  const out: string[] = []
  for (const c of cards) for (const a of c.attacks ?? []) {
    if (!archetypeFor(a.name, parseAttackText(a.text, c.name ?? 'X'), dmg(a.damage)) && !ALLOW[a.name]) out.push(`${c.name}: ${a.name}`)
  }
  return out
}

describe('the move lexicon', () => {
  it('every attack a bot or the fixture collection can field gets a deliberate archetype', () => {
    expect(roster.length).toBeGreaterThan(1000)
    expect(leftovers([...roster, ...fixture])).toEqual([])
  })
  it('every attack in the card pool does too (POKEARENA_CARDS)', () => {
    const path = process.env.POKEARENA_CARDS
    if (!path || !existsSync(path)) return
    const cards = Object.entries(JSON.parse(readFileSync(path, 'utf8')).cards as Record<string, CardData>).map(([id, c]) => ({ ...c, id }))
    expect(leftovers(cards)).toEqual([])
  })
  it('reads like the move: Earthquake rings you, Thunder falls from the sky, Hydro Pump is a shoving jet, Dig is untouchable', () => {
    const p = parseAttackText(undefined, 'X')
    const kind = (n: string, d = 60, c = 2) => { const l = lexShape(n, p, c, d, 'Colorless')!; return [l.id, l.shape.kind, l.shape.path ?? l.shape.at ?? ''].join(' ') }
    expect(kind('Earthquake')).toBe('quake area self')
    expect(kind('Thunder', 110, 3)).toBe('thunder area aim')
    expect(kind('Hydro Pump')).toBe('hydro beam ')
    expect(kind('Dig')).toBe('leap dash leap')
    expect(kind('Rock Throw')).toBe('lob projectile lob')
    expect(kind('Leaf Boomerang')).toBe('boomerang projectile boomerang')
    expect(kind('Shadow Ball')).toBe('shadowball projectile ')
    expect(kind('Vine Whip')).toBe('whip melee ')
    expect(kind('G-Max Befuddle', 120, 3)).toBe('max area aim')
    expect(kind('Hurricane')).toBe('hazard area drift')
  })
  it('an attack that hits is never a self move, and a self move never hits', () => {
    const p = parseAttackText(undefined, 'X')
    expect(archetypeFor('Growth', p, 30)?.id).not.toBe('aura')
    expect(archetypeFor('Thunderbolt', p, 0)?.id).toBe('aura')
  })
  it('every archetype builds a valid shape at every size', () => {
    for (const a of Object.values(ARCHETYPES)) for (const c of [0, 1, 3, 5]) for (const d of [0, 40, 250]) {
      const card: CardData = { id: 't-1', name: 'T', hp: 100, types: ['Colorless'], attacks: [{ name: 'X', cost: Array(c).fill('Colorless'), damage: String(d) }] }
      const k = { ...autoKit(card), attacks: [{ name: 'X', shape: a.shape(c, d, 'Colorless') }] }
      expect(validateKit(k), `${a.id} c${c} d${d}`).toEqual([])
    }
  })
})
