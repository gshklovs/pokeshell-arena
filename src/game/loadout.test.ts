import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { collectionRoster, type CollectionCard } from './kits'
import { defaultLoadout, savePrefs, sorted } from './loadout'

const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../tests/fixtures/collection.json'), 'utf8')) as { cards: CollectionCard[] }
const at = (id: string, t: string | null) => ({ ...fixture.cards.find((c) => c.card === id)!, lastCaught: t })

afterEach(() => { vi.unstubAllGlobals() })

it('sort "last pulled": newest pull first, cards with no known pull time last', () => {
  const roster = collectionRoster([at('base1-58', '2026-09-29T10:00:00'), at('base1-63', null), at('swsh7-7', '2026-09-30T07:59:59')])
  const ids = sorted({ search: '', type: '', sort: 'pulled' }, roster).map((e) => e.kit.card)
  expect(ids).toEqual(['swsh7-7', 'base1-58', 'base1-63'])
  // the filters still apply
  expect(sorted({ search: 'leafeon', type: '', sort: 'pulled' }, roster).map((e) => e.kit.card)).toEqual(['swsh7-7'])
})

it('sort "last pulled" with no times at all falls back to card order', () => {
  const roster = collectionRoster([at('swsh7-7', null), at('base1-63', null), at('base1-58', null)])
  expect(sorted({ search: '', type: '', sort: 'pulled' }, roster).map((e) => e.kit.card)).toEqual(['base1-58', 'base1-63', 'swsh7-7'])
})

it('the chosen sort is remembered across visits; an unknown one is ignored', () => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) } })
  const roster = collectionRoster(fixture.cards)
  const st = defaultLoadout(roster)
  expect(st.sort).toBe('hp')
  st.sort = 'pulled'
  savePrefs(st)
  expect(defaultLoadout(roster).sort).toBe('pulled')
  mem.set('pokearena.loadout', JSON.stringify({ sort: 'bogus' }))
  expect(defaultLoadout(roster).sort).toBe('hp')
})

it('no localStorage (private window, blocked storage): defaults, no throw', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
  const st = defaultLoadout([])
  expect(st.sort).toBe('hp')
  expect(() => savePrefs(st)).not.toThrow()
})
