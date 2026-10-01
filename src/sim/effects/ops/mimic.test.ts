import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, hp, testMatch } from '../../testing'
import type { Kit } from '../../types'

it("mimic: hits for the target's hardest-hitting printed attack", () => {
  const foe: Kit = {
    ...fixtureKit({ shape: { kind: 'self' } }, { hp: 200 }),
    attacks: [
      { name: 'Small', cost: ['Colorless'], damage: '20', shape: { kind: 'self' } },
      { name: 'Big', cost: ['Colorless', 'Colorless'], damage: '120+', shape: { kind: 'self' } },
    ],
  }
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), foe)
  applyEffects(m, [{ op: 'mimic' }])
  expect(hp(m, 1)).toBe(80)
})
