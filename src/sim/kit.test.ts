import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { autoKit, effectiveHp, kitOverrides, overrideKeys, parseDamage, resolveKit, validateKit } from './kit'
import type { CardData, Kit } from './types'

const KITS = resolve(__dirname, '../../data/kits')
const files = readdirSync(KITS).filter((f) => f.endsWith('.json'))
const kits = files.map((f) => [f, JSON.parse(readFileSync(join(KITS, f), 'utf8')) as Kit] as const)

/** card data when available: POKEARENA_CARDS = pokeshell's carddata.json, or a folder of <id>.json cards */
function loadCards(): Map<string, CardData> | null {
  const p = process.env.POKEARENA_CARDS
  if (!p || !existsSync(p)) return null
  const m = new Map<string, CardData>()
  if (statSync(p).isDirectory()) {
    for (const f of readdirSync(p)) if (f.endsWith('.json')) { const c = JSON.parse(readFileSync(join(p, f), 'utf8')); m.set(c.id, c) }
  } else {
    // pokeshell's packs/pokemon/carddata.json: {format, cards: {<id>: {hp, attacks, ...}}} (the id is the key)
    const j = JSON.parse(readFileSync(p, 'utf8'))
    const cards = Array.isArray(j) ? j : (j.cards ?? j)
    const list: CardData[] = Array.isArray(cards) ? cards : Object.entries(cards).map(([id, c]) => ({ ...(c as CardData), id }))
    // names and characters are in pack.json next to it (the parser needs a card's own name)
    const packPath = join(p, '..', 'pack.json')
    const pack = existsSync(packPath) ? (JSON.parse(readFileSync(packPath, 'utf8')).cards ?? {}) : {}
    for (const c of list) m.set(c.id, { ...c, name: c.name ?? pack[c.id]?.name, character: c.character ?? pack[c.id]?.character })
  }
  return m
}

const PILOTS = ['base1-58', 'base1-46', 'base1-63', 'base1-44', 'swsh7-7']

describe('kit files (data/kits)', () => {
  it('there are kits', () => expect(files.length).toBeGreaterThanOrEqual(5))
  it('every kit file is valid and named after its card', () => {
    for (const [f, k] of kits) {
      expect(validateKit(k), f).toEqual([])
      expect(f).toBe(`${k.card}.json`)
    }
  })
  it('the pilot kits carry every number (the practice roster works without pokeshell)', () => {
    for (const id of PILOTS) {
      const k = kits.find(([f]) => f === `${id}.json`)?.[1]
      expect(k, id).toBeTruthy()
      expect(() => resolveKit(null, k!)).not.toThrow()
    }
  })
  it('hand kits have a fantasy note', () => {
    const hand = kits.filter(([f]) => !PILOTS.includes(f.replace('.json', '')))
    for (const [f, k] of hand) expect(k.fantasy, f).toBeTruthy()
  })
  const cards = loadCards()
  it.skipIf(!cards)('every Pokémon card with attacks gets a valid, playable auto-kit (POKEARENA_CARDS)', () => {
    let n = 0
    for (const c of cards!.values()) {
      if (!c.hp || !(c.attacks ?? []).length) continue
      const k = autoKit({ ...c, name: c.name ?? c.id })
      expect(validateKit(k), c.id).toEqual([])
      expect(() => resolveKit({ ...c, name: c.name ?? c.id }, null), c.id).not.toThrow()
      n++
    }
    expect(n).toBeGreaterThan(900)
  })
  it.skipIf(!cards)('kit numbers match the real card data, or the override is documented (POKEARENA_CARDS)', () => {
    for (const [, k] of kits) {
      const c = cards!.get(k.card)
      expect(c, `${k.card} is not in the card data`).toBeTruthy()
      // attacks are on the card, in its names
      expect(kitOverrides(k, c!).filter((x) => /not on the card|" vs card "/.test(x)), k.card).toEqual([])
      const keys = overrideKeys(k, c!)
      expect(keys.filter((x) => !(k.overrides ?? {})[x]), `${k.card}: undocumented overrides`).toEqual([])
      expect(Object.keys(k.overrides ?? {}).filter((x) => !keys.includes(x)), `${k.card}: stale override notes`).toEqual([])
    }
  })
  it.skipIf(!cards)('every kit file resolves with its card, and its attacks match the card by name', () => {
    for (const [, k] of kits) {
      const c = cards!.get(k.card)!
      const f = resolveKit({ ...c, name: c.name ?? k.name ?? c.id }, k)
      expect(f.attacks.map((a) => a.name), k.card).toEqual((c.attacks ?? []).map((a) => a.name))
    }
  })
})

describe('resolveKit and autoKit', () => {
  const card: CardData = {
    id: 'fixture-1', name: 'Fixturemon', hp: '120', types: ['Water'], subtypes: ['Basic', 'V'],
    attacks: [
      { name: 'Splash', cost: ['Water'], damage: '20' },
      { name: 'Big Wave', cost: ['Water', 'Water', 'Colorless'], damage: '90+', text: '' },
    ],
    weaknesses: [{ type: 'Lightning', value: '×2' }], retreatCost: ['Colorless', 'Colorless'],
  }
  it('an auto-kit uses the card numbers and a shape per type and order', () => {
    const k = resolveKit(card, null)
    expect(k.source).toBe('auto')
    expect(k.hp).toBe(120)
    expect(k.retreat).toBe(2)
    expect(k.subtypes).toContain('V')
    // shapes follow the move lexicon first (a Splash is flailing about, a Big Wave a wide wall of water that rolls
    // through everything), then the type
    expect(k.attacks.map((a) => a.shape.kind)).toEqual(['melee', 'projectile'])
    expect(k.attacks[1].shape.pierce).toBeGreaterThanOrEqual(5)
    const plain = resolveKit({ ...card, attacks: [{ name: 'Qwop', cost: ['Water'], damage: '20' }, { name: 'Zorp', cost: ['Water', 'Water', 'Colorless'], damage: '90' }] }, null)
    expect(plain.attacks.map((a) => a.shape.kind)).toEqual(['projectile', 'beam'])
    expect(k.attacks[1].baseDamage).toBe(90)
    expect(k.attacks[0].element).toBe('Water')
    expect(validateKit(autoKit(card))).toEqual([])
  })
  it('a kit overrides only what it gives; attacks match by name', () => {
    const kit: Kit = { version: 1, card: 'fixture-1', attacks: [{ name: 'Big Wave', shape: { kind: 'cone', range: 100, arc: 40 } }] }
    const k = resolveKit(card, kit)
    expect(k.hp).toBe(120)
    expect(k.attacks[0].cost).toEqual(['Water', 'Water', 'Colorless'])
    expect(k.attacks[0].damage).toBe('90+')
    expect(resolveKit(card, { ...kit, stats: { hp: 999 } }).printedHp).toBe(999)
    expect(resolveKit(card, { ...kit, stats: { hp: 999 } }).hp).toBe(effectiveHp(999))
    expect(kitOverrides({ ...kit, stats: { hp: 999 } }, card)).toEqual(['hp 999 vs card 120'])
  })
  it('without card data a kit must carry its numbers', () => {
    expect(() => resolveKit(null, { version: 1, card: 'fixture-1', attacks: [{ name: 'X', shape: { kind: 'self' } }] })).toThrow(/HP/)
  })
  it('validateKit reports unknown ops, shapes and bad params', () => {
    const bad = { version: 1, card: 'x-1', attacks: [{ name: 'A', shape: { kind: 'laser' }, onHit: [{ op: 'nope' }, { op: 'damage' }] }] }
    const errs = validateKit(bad)
    expect(errs.some((e) => e.includes('laser'))).toBe(true)
    expect(errs.some((e) => e.includes('unknown op "nope"'))).toBe(true)
    expect(errs.some((e) => e.includes('damage.amount: missing'))).toBe(true)
  })
  it('damage strings', () => {
    expect(parseDamage('90+')).toBe(90)
    expect(parseDamage('30×')).toBe(30)
    expect(parseDamage('')).toBe(0)
  })
})
