import { expect, it } from 'vitest'
import { defaultEnergy } from '../../energy'
import { resolveKit } from '../../kit'
import { parseArena } from '../../arena'
import { createState } from '../../state'
import { step } from '../../step'
import { FP } from '../../fixed'
import { BENCH_CAN_KO, BENCH_FLOOR_HP } from '../../rules'
import { fixtureKit, testArena, applyEffects, hp, place, testMatch } from '../../testing'
import type { MatchDef } from '../../types'

it('benchDamage: hits the benched Pokémon only; it never KOs one off the field (floors at 10 HP, BENCH_CAN_KO false)', () => {
  // a mechanics test: printed HP (no balance curve)
  const kits = [resolveKit(null, fixtureKit({ shape: { kind: 'self' } })), resolveKit(null, fixtureKit({ shape: { kind: 'self' } }, { hp: 30 }))].map((k) => ({ ...k, hp: k.printedHp ?? k.hp }))
  const def: MatchDef = {
    mode: 'team', seed: 1, arena: parseArena(testArena()), kits,
    players: [
      { team: 0, name: 'A', members: [0, 0, 0], energy: defaultEnergy([kits[0]]) },
      { team: 1, name: 'B', members: [1, 1, 1], energy: defaultEnergy([kits[1]]) },
    ],
  }
  const s = createState(def)
  s.phase = 'fight'
  applyEffects({ def, s }, [{ op: 'benchDamage', amount: 20, count: 1 }])
  expect(s.players[1].members.map((m) => m.hp)).toEqual([30, 10, 30])
  applyEffects({ def, s }, [{ op: 'benchDamage', amount: 20 }])
  // member 1 (10 HP) would go to 0: it stays at 10; member 2 takes the chip down to 10
  expect(s.players[1].members.map((m) => m.hp)).toEqual([30, 10, 10])
  expect(s.events.filter((e) => e.k === 'bench')).toEqual([
    { k: 'bench', p: 1, member: 1, amount: 20 }, { k: 'bench', p: 1, member: 2, amount: 20 },
  ])
  applyEffects({ def, s }, [{ op: 'benchDamage', amount: 200 }])
  step(def, s, [])
  expect(s.players[1].members.map((m) => m.hp)).toEqual([30, 10, 10])
  expect(s.players[1].members.map((m) => m.ko)).toEqual([false, false, false])
  expect(s.players[0].kos).toBe(0)
  expect(BENCH_CAN_KO).toBe(false)
  expect(BENCH_FLOOR_HP).toBe(10)
  applyEffects({ def, s }, [{ op: 'benchDamage', amount: 10, side: 'self' }])
  expect(s.players[0].members.map((m) => m.hp)).toEqual([100, 90, 90])
})

it('benchDamage: a 1v1 has no bench, so it splashes foes near the point (own-bench damage lands on the caster at half)', () => {
  const m = testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }))
  place(m, 0, 400, 540); place(m, 1, 900, 540)
  applyEffects(m, [{ op: 'benchDamage', amount: 20 }], { target: -1, x: 400 * FP, y: 540 * FP }) // far from the foe
  expect(hp(m, 1)).toBe(100)
  applyEffects(m, [{ op: 'benchDamage', amount: 20 }], { target: -1, x: 850 * FP, y: 540 * FP })
  expect(hp(m, 1)).toBe(80)
  applyEffects(m, [{ op: 'benchDamage', amount: 20, side: 'self' }])
  expect(hp(m, 0)).toBe(90)
})
