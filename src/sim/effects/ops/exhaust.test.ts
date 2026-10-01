import { expect, it } from 'vitest'
import { TURN } from '../../rules'
import { resolveKit } from '../../kit'
import { applyEffects, fixtureKit, testMatch } from '../../testing'
import type { Kit } from '../../types'

const two: Kit = {
  ...fixtureKit({ shape: { kind: 'self' } }),
  attacks: [
    { name: 'Cheap', cost: ['Colorless'], damage: '10', shape: { kind: 'self' } },
    { name: 'Big', cost: ['Colorless', 'Colorless', 'Colorless'], damage: '90', shape: { kind: 'self' } },
  ],
}

it('exhaust: self all / this, target best', () => {
  const m = testMatch(two, two)
  expect(resolveKit(null, two).attacks).toHaveLength(2)
  applyEffects(m, [{ op: 'exhaust', ticks: TURN }])
  expect(m.s.players[0].fighter.cooldowns).toEqual([TURN, TURN])
  applyEffects(m, [{ op: 'exhaust', ticks: TURN, target: 'target', which: 'best' }])
  expect(m.s.players[1].fighter.cooldowns).toEqual([0, TURN])
  const m2 = testMatch(two, two)
  applyEffects(m2, [{ op: 'exhaust', ticks: 50, which: 'this' }]) // the cast is attack 0
  expect(m2.s.players[0].fighter.cooldowns).toEqual([50, 0])
})
