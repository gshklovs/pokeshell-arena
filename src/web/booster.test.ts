// The TS booster port against pokeshell's own tables (host/tests/fixtures/pokeshell/, as host/src/parity.rs checks the
// Rust port), and against the data the web build ships (data/pokeshell/).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findSet, loadModel, newUlid, oddsRandom, oddsSet, openPack, pickSet, seededDice, setsListing, type Model } from './booster'

const root = join(import.meta.dirname, '..', '..')
const fx = (name: string) => JSON.parse(readFileSync(join(root, 'host', 'tests', 'fixtures', 'pokeshell', name), 'utf8').replace(/^﻿/, ''))

function model(dir?: string): Model {
  const read = dir ? (n: string) => JSON.parse(readFileSync(join(root, dir, n), 'utf8').replace(/^﻿/, '')) : fx
  const built = read('built.json')
  return loadModel(read('pack.json'), read('boosters.json'), new Set(built.built), new Set(built.shinyArt))
}

/** pokeshell rounds to even: a value may differ by one unit in the last place */
const close = (a: unknown, b: unknown, unit: number) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= unit * 1.000001 : a === b

describe('booster port: pokeshell parity', () => {
  const m = model()
  const odds = fx('odds.json')

  it('random-pack set odds', () => {
    const got = oddsRandom(m) as { priceExponent: number; sets: Record<string, unknown>[] }
    const want = odds.random
    expect(got.priceExponent).toBe(want.priceExponent)
    expect(got.sets.length).toBe(want.sets.length)
    got.sets.forEach((g, i) => {
      const w = want.sets[i]
      expect(g.set).toBe(w.set)
      expect(g.openable).toBe(w.openable)
      expect(close(g.price, w.price, 0), `${w.set} price`).toBe(true)
      expect(close(g.chance, w.chance, 1e-6), `${w.set} chance ${g.chance} vs ${w.chance}`).toBe(true)
      expect(close(g.oneIn, w.oneIn, 0.1), `${w.set} oneIn`).toBe(true)
    })
  })

  it("every set's slot odds", () => {
    let checked = 0
    m.sets.forEach((s, i) => {
      const want = odds.odds[s.id]
      expect(want, s.id).toBeTruthy()
      const got = oddsSet(m, i) as { cards: number; outcomes: Record<string, unknown>[] }
      expect(got.cards, `${s.id} cards`).toBe(want.cards)
      expect(got.outcomes.length).toBe(want.outcomes.length)
      got.outcomes.forEach((g, k) => {
        const w = want.outcomes[k]
        for (const key of ['slot', 'count', 'outcome', 'printed', 'served', 'base']) expect(g[key], `${s.id} ${w.slot}/${w.outcome} ${key}`).toBe(w[key])
        expect(close(g.probability, w.probability, 1e-6), `${s.id} ${w.slot}/${w.outcome} probability`).toBe(true)
        expect(close(g.oneIn, w.oneIn, 0.1)).toBe(true)
        checked++
      })
    })
    expect(checked).toBeGreaterThan(50)
  })

  it('the sets listing', () => {
    const got = setsListing(m, 0) as { sets: Record<string, unknown>[] }
    const want = odds.sets.sets
    expect(got.sets.length).toBe(want.length)
    got.sets.forEach((g, i) => {
      const w = want[i]
      for (const k of ['id', 'name', 'series', 'released', 'cards', 'inPack', 'printed', 'packSize', 'realPackSize', 'openable', 'hero', 'slots', 'art']) {
        expect(g[k], `${w.id}: ${k}`).toEqual(w[k])
      }
      expect(close(g.chance, w.chance, 1e-6)).toBe(true)
      const go = g.odds as { tier: string; weight: number }[]
      expect(go.map((o) => o.tier)).toEqual(w.odds.map((o: { tier: string }) => o.tier))
      go.forEach((o, k) => expect(close(o.weight, w.odds[k].weight, 1e-5), `${w.id} ${o.tier}`).toBe(true))
    })
  })

  it('rolls land on the probabilities (the set roll, and one set\'s slots)', () => {
    const d = seededDice(0x5eed)
    const ch = (oddsRandom(m) as { sets: { chance: number }[] }).sets.map((s) => s.chance)
    const n = 40000
    const hits = new Array(ch.length).fill(0)
    for (let i = 0; i < n; i++) hits[pickSet(m, d)!]++
    ch.forEach((p, i) => {
      const sd = Math.sqrt((p * (1 - p)) / n)
      expect(Math.abs(hits[i] / n - p), `set ${i}`).toBeLessThanOrEqual(4.5 * sd + 1e-9)
    })
    const si = findSet(m, 'swsh7')
    const caught = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const p = openPack(m, si, d, caught)
      const key = (o: { hit: number; shiny: boolean }) => o.hit + (o.shiny ? 0.5 : 0)
      for (let k = 1; k < p.length; k++) expect(key(p[k - 1])).toBeLessThanOrEqual(key(p[k]))
      expect(p.every((o) => !o.shiny || m.cards[o.card].shinyArt)).toBe(true)
    }
    expect(caught.size).toBeGreaterThan(50)
  })

  it('ULIDs', () => {
    const a = newUlid()
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(newUlid()).not.toBe(a)
  })
})

describe('the shipped web data', () => {
  it('is the fixture pokeshell data, and every set rolls', () => {
    const w = model('data/pokeshell')
    const f = model()
    expect(w.cards.length).toBe(f.cards.length)
    expect(w.sets.map((s) => s.id)).toEqual(f.sets.map((s) => s.id))
    const d = seededDice(1)
    for (let i = 0; i < w.sets.length; i++) if (w.sets[i].cards.length) expect(openPack(w, i, d, new Set()).length).toBeGreaterThan(0)
  })
})
