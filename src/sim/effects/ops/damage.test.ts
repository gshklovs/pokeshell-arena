import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, hp, testMatch } from '../../testing'
import { validateEffects } from '../registry'
import { WEAKNESS_PER_TIMES } from '../../rules'

/** a printed "×2" weakness in the arena (rules.WEAKNESS_PER_TIMES) */
const weak2 = (n: number) => Math.trunc((n * (1000 + WEAKNESS_PER_TIMES)) / 1000)

const pair = (weak = false) => testMatch(fixtureKit({ element: 'Fire', shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }, { weaknesses: weak ? [{ type: 'Fire', value: '×2' }] : [] }))

it('damage: attack damage, weakness applies unless wr is false', () => {
  const m = pair(true)
  applyEffects(m, [{ op: 'damage', amount: 20 }])
  expect(hp(m, 1)).toBe(100 - weak2(20))
  applyEffects(m, [{ op: 'damage', amount: 20, wr: false }])
  expect(hp(m, 1)).toBe(80 - weak2(20))
})
it('damage: a cast bonus adds before weakness', () => {
  const m = pair(true)
  applyEffects(m, [{ op: 'bonus', amount: 10 }, { op: 'damage', amount: 20 }])
  expect(hp(m, 1)).toBe(100 - weak2(30))
})
it('damage: wr can apply only weakness or only resistance; pierce ignores shields and defense', () => {
  const m = testMatch(fixtureKit({ element: 'Fire', shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }, { hp: 500, weaknesses: [{ type: 'Fire', value: '×2' }], resistances: [{ type: 'Fire', value: '-30' }] }))
  applyEffects(m, [{ op: 'damage', amount: 50, wr: 'weakness' }])
  const left = 500 - weak2(50)
  expect(hp(m, 1)).toBe(left)
  applyEffects(m, [{ op: 'damage', amount: 50, wr: 'resistance' }])
  expect(hp(m, 1)).toBe(left - 20)
  applyEffects(m, [{ op: 'shield', ticks: 90, target: 'target' }, { op: 'buff', stat: 'defense', amount: 20, ticks: 90, target: 'target' }])
  applyEffects(m, [{ op: 'damage', amount: 50, wr: false }])
  expect(hp(m, 1)).toBe(left - 20)
  applyEffects(m, [{ op: 'damage', amount: 50, wr: false, pierce: true }])
  expect(hp(m, 1)).toBe(left - 70)
  expect(validateEffects([{ op: 'damage', amount: 1, wr: 'sometimes' }], 'x')).toHaveLength(1)
})
it('damage: validates amount', () => {
  expect(validateEffects([{ op: 'damage' }], 'x')).toHaveLength(1)
  expect(validateEffects([{ op: 'damage', amount: 1.5 }], 'x')).toHaveLength(1)
  expect(validateEffects([{ op: 'damage', amount: 30 }], 'x')).toEqual([])
})
