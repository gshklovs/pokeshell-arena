import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { collectionRoster, KITS, type CollectionCard } from './kits'

// the shape of `pokeshell collection --json` (a real run on a temp state, card text stripped)
const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../tests/fixtures/collection.json'), 'utf8')) as { cards: CollectionCard[] }

it('the bundled kits load (the pilot kits among them)', () => {
  for (const id of ['base1-58', 'base1-46', 'base1-63', 'base1-44', 'swsh7-7']) expect(KITS.has(id)).toBe(true)
})

it("pokeshell's collection -> fighters: caught cards with data, their kit if there is one, shiny carried", () => {
  const r = collectionRoster(fixture.cards)
  expect(r.map((e) => e.kit.card)).toEqual(['base1-58', 'base1-63', 'swsh7-7'])
  expect(r.every((e) => e.owned)).toBe(true)
  expect(r.find((e) => e.kit.card === 'base1-63')!.shiny).toBe(true)
  const leafeon = r.find((e) => e.kit.card === 'swsh7-7')!.kit
  expect(leafeon.name).toBe('Leafeon V')
  expect(leafeon.printedHp).toBe(200) // the arena HP is the balance curve of it (sim/kit.ts effectiveHp)
  expect(leafeon.subtypes).toContain('V')
  expect(leafeon.attacks[0].shape.kind).toBe('melee') // from data/kits, not the auto-kit
})

it('a caught card without a kit gets an auto-kit from its data', () => {
  const c = structuredClone(fixture.cards[0])
  c.card = 'base1-999-test'
  const [e] = collectionRoster([c])
  expect(KITS.has('base1-999-test')).toBe(false)
  expect(e.kit.source).toBe('auto')
  expect(e.kit.name).toBe('Pikachu')
  expect(e.kit.attacks.map((a) => a.cost.length)).toEqual([1, 2])
})

it("a card's pull time is its latest lastCaught (duplicates across packs too); unknown when pokeshell has none", () => {
  const [pika, , leaf] = fixture.cards.filter((c) => c.caught !== false && c.data)
  const again = { ...structuredClone(pika), pack: 'other', lastCaught: '2026-09-30T08:00:00' }
  const old = { ...structuredClone(leaf) }
  delete old.lastCaught
  const r = collectionRoster([pika, again, old])
  expect(r.find((e) => e.kit.card === pika.card)!.pulled).toBe('2026-09-30T08:00:00')
  expect(r.find((e) => e.kit.card === leaf.card)!.pulled).toBeUndefined()
  expect(collectionRoster(fixture.cards).find((e) => e.kit.card === 'swsh7-7')!.pulled).toBe('2026-09-29T10:06:00')
})
