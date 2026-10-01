// Full elimination fought in the arena (see also elimination.test.ts) (docs/SPEC.md section 7, rules.BENCH_CAN_KO): bench damage chips benched
// Pokémon but never knocks one out, so a team match ends only when every enemy has been beaten on the field.
import { describe, expect, it } from 'vitest'
import { hurt } from './combat'
import { defaultEnergy } from './energy'
import { resolveKit } from './kit'
import { parseArena } from './arena'
import * as R from './rules'
import { createState } from './state'
import { step } from './step'
import { applyEffects, fixtureKit, testArena } from './testing'
import type { MatchDef, SimEvent, SimState } from './types'

function team3(): { def: MatchDef; s: SimState } {
  const kits = [resolveKit(null, fixtureKit({ shape: { kind: 'self' } })), resolveKit(null, fixtureKit({ shape: { kind: 'self' } }, { hp: 60 }))].map((k) => ({ ...k, hp: k.printedHp ?? k.hp }))
  const def: MatchDef = {
    mode: 'team', seed: 3, arena: parseArena(testArena()), kits,
    players: [
      { team: 0, name: 'A', members: [0, 0, 0], energy: defaultEnergy([kits[0]]) },
      { team: 1, name: 'B', members: [1, 1, 1], energy: defaultEnergy([kits[1]]) },
    ],
  }
  const s = createState(def)
  s.phase = 'fight'
  s.phaseT = 0
  return { def, s }
}

/** step until player 1 has an active Pokémon again (the KO replacement), collecting events */
function untilReplaced(def: MatchDef, s: SimState, evs: SimEvent[]): void {
  for (let i = 0; i < R.KO_REPLACE_TICKS + 5 && s.players[1].active < 0; i++) { step(def, s, []); evs.push(...s.events) }
}

describe('full elimination in the arena', () => {
  it('BENCH_CAN_KO is off by default', () => {
    expect(R.BENCH_CAN_KO).toBe(false)
  })

  it('bench damage that would KO a benched member leaves it at 10 HP', () => {
    const { def, s } = team3()
    applyEffects({ def, s }, [{ op: 'benchDamage', amount: 500 }])
    step(def, s, [])
    expect(s.players[1].members.map((m) => m.hp)).toEqual([60, R.BENCH_FLOOR_HP, R.BENCH_FLOOR_HP])
    expect(s.players[1].members.some((m) => m.ko)).toBe(false)
    expect(s.players[0].kos).toBe(0)
  })

  it('a 3v3 does not end until all three enemies are KO\'d in the arena, and every KO event says where', () => {
    const { def, s } = team3()
    const evs: SimEvent[] = []
    for (let n = 0; n < 3; n++) {
      // wreck the bench every time: it never takes a Pokémon out
      s.events = []
      applyEffects({ def, s }, [{ op: 'benchDamage', amount: 500 }])
      evs.push(...s.events)
      step(def, s, []); evs.push(...s.events)
      expect(s.phase).toBe('fight')
      hurt(s, 1, 10000)
      step(def, s, []); evs.push(...s.events)
      if (n < 2) {
        expect(s.phase).toBe('fight')
        expect(s.players[1].members.filter((m) => m.ko).length).toBe(n + 1)
        untilReplaced(def, s, evs)
        expect(s.players[1].active).toBeGreaterThanOrEqual(0)
      }
    }
    expect(s.phase).toBe('over')
    expect(s.winner).toBe(0)
    const kos = evs.filter((e) => e.k === 'ko')
    expect(kos).toHaveLength(3)
    expect(kos.every((e) => e.k === 'ko' && e.where === 'active')).toBe(true)
    // the benched chip shows up as bench events
    expect(evs.some((e) => e.k === 'bench')).toBe(true)
  })
})
