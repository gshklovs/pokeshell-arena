import { expect, it } from 'vitest'
import { defaultEnergy } from '../../energy'
import { FP } from '../../fixed'
import { resolveKit } from '../../kit'
import { parseArena } from '../../arena'
import { createState } from '../../state'
import { applyEffects, fixtureKit, place, run, testArena, testMatch } from '../../testing'
import type { MatchDef } from '../../types'

it('gust: a 1v1 pulls the target toward the caster (push shoves it away)', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  place(m, 0, 600, 540); place(m, 1, 1000, 540)
  applyEffects(m, [{ op: 'gust', px: 200 }])
  run(m, 12)
  expect(m.s.players[1].fighter.x).toBeLessThanOrEqual(805 * FP)
  applyEffects(m, [{ op: 'gust', mode: 'push', px: 100 }])
  run(m, 12)
  expect(m.s.players[1].fighter.x).toBeGreaterThanOrEqual(895 * FP)
})

it("gust: team mode drags in the opponent's most damaged benched Pokémon", () => {
  const kits = [resolveKit(null, fixtureKit({ shape: { kind: 'self' } })), resolveKit(null, fixtureKit({ shape: { kind: 'self' } }, { hp: 60 }))]
  const def: MatchDef = {
    mode: 'team', seed: 1, arena: parseArena(testArena()), kits,
    players: [
      { team: 0, name: 'A', members: [0, 0], energy: defaultEnergy([kits[0]]) },
      { team: 1, name: 'B', members: [1, 1, 1], energy: defaultEnergy([kits[1]]) },
    ],
  }
  const s = createState(def)
  s.phase = 'fight'
  s.players[1].members[2].hp = 20
  applyEffects({ def, s }, [{ op: 'gust' }])
  expect(s.players[1].active).toBe(2)
  expect(s.events.some((e) => e.k === 'swap' && e.p === 1)).toBe(true)
})
