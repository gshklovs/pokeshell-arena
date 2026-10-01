import { describe, expect, it } from 'vitest'
import { canPay, costPips, discard, fillMeters, gain, planPayment } from './energy'
import { ENERGY_CAP, ENERGY_FILL, ENERGY_START } from './rules'
import { fixtureKit, testMatch } from './testing'

describe('the energy meter (one, untyped)', () => {
  it('an attack costs its energy count, whatever the types', () => {
    expect(costPips(['Lightning', 'Colorless'])).toBe(2)
    expect(costPips(['Fire', 'Water', 'Lightning'])).toBe(3)
    expect(costPips(['Free'])).toBe(0)
    expect(canPay(['Lightning', 'Colorless'], [], [2])).toBe(true)
    expect(canPay(['Fire', 'Fire', 'Fire', 'Fire'], [], [3])).toBe(false)
    expect(planPayment(['Fire', 'Water', 'Lightning'], [], [5])).toEqual([3])
    expect(planPayment([], [], [0])).toEqual([0])
  })
  it('a match starts every player on one meter, which fills one pip per ENERGY_FILL ticks up to the cap', () => {
    const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
    const pl = m.s.players[0]
    expect(pl.pips).toEqual([ENERGY_START])
    for (let t = 0; t < ENERGY_FILL; t++) fillMeters(pl)
    expect(pl.pips).toEqual([ENERGY_START + 1])
    for (let t = 0; t < ENERGY_FILL * 20; t++) fillMeters(pl)
    expect(pl.pips).toEqual([ENERGY_CAP])
  })
  it('discard and gain take any type on the single meter', () => {
    const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
    const pl = m.s.players[0]
    pl.pips = [4]
    expect(discard(pl, [], 'Fire', 1)).toBe(1)
    expect(gain(pl, [], 'Water', 99)).toBe(ENERGY_CAP - 3)
    expect(pl.pips).toEqual([ENERGY_CAP])
  })
})
