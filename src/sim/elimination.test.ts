// Matches are won by full team elimination (no prizes): the user's call.
import { expect, it } from 'vitest'
import { parseArena } from './arena'
import { resolveKit } from './kit'
import { MATCH_TICKS } from './rules'
import { createState } from './state'
import { step } from './step'
import { fixtureKit, testArena } from './testing'
import type { MatchDef } from './types'

const self = { shape: { kind: 'self' as const } }
const vmax = resolveKit(null, fixtureKit(self, { hp: 330, subtypes: ['VMAX'] }))
const basic = resolveKit(null, fixtureKit(self, { hp: 60, subtypes: ['Basic'] }))

function teamMatch(): { def: MatchDef; s: ReturnType<typeof createState> } {
  const def: MatchDef = {
    mode: 'team', seed: 1, arena: parseArena(testArena()), kits: [basic, vmax],
    players: [
      { team: 0, name: 'You', members: [0, 0, 0], energy: [] },
      { team: 1, name: 'Bot', members: [1, 0, 0], energy: [] },
    ],
  }
  const s = createState(def)
  s.phase = 'fight'
  return { def, s }
}

it("KO'ing a VMAX (3 prizes in the TCG) in a 3v3 doesn't end the match while a bot Pokémon is left", () => {
  const { def, s } = teamMatch()
  s.players[1].members[0].hp = 0 // the VMAX goes down
  step(def, s, [])
  expect(s.players[1].members[0].ko).toBe(true)
  expect(s.players[0].kos).toBe(1)
  expect(s.phase).toBe('fight')
  s.players[1].members[1].hp = 0
  step(def, s, [])
  expect(s.phase).toBe('fight')
  s.players[1].members[2].hp = 0 // the last one
  step(def, s, [])
  expect(s.players[0].kos).toBe(3)
  expect(s.phase).toBe('over')
  expect(s.winner).toBe(0)
})

it('the time cap goes to the team with more of its total HP left (as a share), else a draw', () => {
  const { def, s } = teamMatch()
  s.players[0].members[0].hp = 10 // You: a lot of damage on one Pokémon, none KO'd
  s.players[1].members[1].hp = 0 // Bot: one KO'd Basic
  s.phaseT = (def.matchTicks ?? MATCH_TICKS) - 1
  step(def, s, [])
  expect(s.phase).toBe('over')
  // arena HP (the balance curve): You 150 / 210 left (71%); Bot 320 / 390 (82%): the bot's team is in better shape
  expect(s.winner).toBe(1)
})
