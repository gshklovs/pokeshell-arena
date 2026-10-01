import { describe, expect, it } from 'vitest'
import { parseArena } from './arena'
import { resolveKit } from './kit'
import * as R from './rules'
import { createState, hashState } from './state'
import { evolveOptions, evolveStatus, step } from './step'
import { fixtureKit, testArena } from './testing'
import { BTN, evolveTo, type FighterKit, type InputFrame, type Kit, type MatchDef, type SimState } from './types'

// an evolution line built from fixtures (tests only): Basic "Mon" -> Stage 1 "Mon Two" or "Mon Other", and a foe
// with lots of HP
// a mechanics test: printed HP, no balance curves (MatchDef.raw)
const named = (k: Kit, name: string, hp: number, evolvesFrom: string | null, card: string): FighterKit =>
  ({ ...resolveKit(null, { ...k, card, name, stats: { ...k.stats, hp, evolvesFrom } }), hp })
const shot = fixtureKit({ shape: { kind: 'projectile', speed: 20, radius: 10, range: 900 }, onHit: [{ op: 'damage', amount: 20 }] })
const basic = named(shot, 'Mon', 60, null, 'test-1')
const stage1 = named(shot, 'Mon Two', 100, 'Mon', 'test-2')
const other = named(shot, 'Mon Other', 90, 'Mon', 'test-3')
const foe = named(fixtureKit({ shape: { kind: 'self' } }), 'Wall', 500, null, 'test-9')

function match(evolutions: number[]): { def: MatchDef; s: SimState } {
  const def: MatchDef = {
    mode: 'team', seed: 3, arena: parseArena(testArena()), kits: [basic, stage1, other, foe, basic], raw: true,
    players: [
      { team: 0, name: 'A', members: [0, 4], energy: [], evolutions },
      { team: 1, name: 'B', members: [3], energy: [] },
    ],
  }
  const s = createState(def)
  s.phase = 'fight'
  s.phaseT = 0
  s.players[0].fighter.x = 400 * 256; s.players[0].fighter.y = 540 * 256
  s.players[1].fighter.x = 800 * 256; s.players[1].fighter.y = 540 * 256
  return { def, s }
}

const idle = (buttons = 0): InputFrame[] => [{ mx: 0, my: 0, aim: 0, buttons }, { mx: 0, my: 0, aim: 128, buttons: 0 }]

describe('evolving mid-match', () => {
  it('attack damage and KOs fill the charge; options appear only when it is full', () => {
    const m = match([1, 2])
    expect(evolveOptions(m.def, m.s, 0)).toEqual([])
    expect(evolveOptions(m.def, m.s, 0, false)).toEqual([1, 2])
    m.s.players[0].pips = [10]
    for (let k = 0; k < 3; k++) {
      step(m.def, m.s, idle(BTN.ATTACK1))
      for (let t = 0; t < 40; t++) step(m.def, m.s, idle())
    }
    expect(m.s.players[0].evo).toBe(R.EVO_MAX) // 3 hits x 20 = 60
    expect(evolveOptions(m.def, m.s, 0)).toEqual([1, 2])
  })
  it('evolving keeps the damage taken, clears conditions, gives invulnerability, resets the charge', () => {
    const m = match([1, 2])
    const me = m.s.players[0]
    me.evo = R.EVO_MAX
    me.members[0].hp = 35 // 25 damage taken
    me.fighter.status.poisoned = 100
    step(m.def, m.s, idle(evolveTo(2))) // option 2: Mon Other
    expect(m.s.events.some((e) => e.k === 'evolve' && e.to === 2 && e.from === 0)).toBe(true)
    expect(me.members[0].kit).toBe(2)
    expect(me.members[0].maxHp).toBe(90)
    expect(me.members[0].hp).toBe(65)
    expect(me.fighter.status.poisoned).toBe(0)
    expect(me.fighter.invuln).toBeGreaterThan(0)
    expect(me.evo).toBeLessThanOrEqual(1) // emptied (the passive creep may add its point on the same tick)
    // one card evolves one Pokémon: the bench Mon (member 1) can only take the card that's left
    me.evo = R.EVO_MAX
    me.active = 1
    expect(evolveOptions(m.def, m.s, 0)).toEqual([1])
  })
  it("no evolution owned, or the charge isn't full: the press fizzles", () => {
    const m = match([])
    m.s.players[0].evo = R.EVO_MAX
    step(m.def, m.s, idle(BTN.EVOLVE))
    expect(m.s.players[0].members[0].kit).toBe(0)
    expect(m.s.events.some((e) => e.k === 'fizzle')).toBe(true)
  })
  it('a KO charges the taker', () => {
    const m = match([1])
    m.s.players[1].members[0].hp = 10
    m.s.players[0].pips = [10]
    step(m.def, m.s, idle(BTN.ATTACK1))
    for (let t = 0; t < 40; t++) step(m.def, m.s, idle())
    // 10 damage + the KO, plus the passive creep while the fight ran (1 point per EVO_PASSIVE_TICKS)
    expect(m.s.players[0].evo).toBeGreaterThanOrEqual(10 + R.EVO_KO)
    expect(m.s.players[0].evo).toBeLessThanOrEqual(10 + R.EVO_KO + Math.ceil(41 / R.EVO_PASSIVE_TICKS))
  })
  it('is deterministic', () => {
    const play = () => {
      const m = match([1, 2])
      for (let t = 0; t < 900; t++) step(m.def, m.s, idle(t % 17 === 0 ? BTN.ATTACK1 : t % 29 === 0 ? BTN.EVOLVE : 0))
      return hashState(m.s)
    }
    expect(play()).toBe(play())
  })
})

// start lines (docs/SPEC.md section 6): a slot picked as a Stage 2 enters as its Basic and evolves toward it
const staged = (name: string, hp: number, evolvesFrom: string | null, stage: string, card: string): FighterKit =>
  ({ ...resolveKit(null, { ...shot, card, name, stats: { ...shot.stats, hp, evolvesFrom, subtypes: [stage] } }), hp })
const charmander = staged('Charmander', 50, null, 'Basic', 'l-1')
const charmeleon = staged('Charmeleon', 80, 'Charmander', 'Stage 1', 'l-2')
const charizard = staged('Charizard', 120, 'Charmeleon', 'Stage 2', 'l-3')
const darkMeleon = staged('Dark Charmeleon', 70, 'Charmander', 'Stage 1', 'l-4')
const hypno = staged('Hypno', 90, 'Drowzee', 'Stage 1', 'l-5')

/** kits: 0 Charmander (member), 1 foe, 2 Dark Charmeleon (an owned evolution), 3 Charmeleon + 4 Charizard (the
 * slot's line), 5 Hypno (a member with nothing owned) */
function lineMatch(evolutions = [2]): { def: MatchDef; s: SimState } {
  const def: MatchDef = {
    mode: 'team', seed: 5, arena: parseArena(testArena()), kits: [charmander, foe, darkMeleon, charmeleon, charizard, hypno], raw: true,
    players: [
      { team: 0, name: 'A', members: [0, 5], energy: [], evolutions, paths: [[3, 4], []] },
      { team: 1, name: 'B', members: [1], energy: [] },
    ],
    topKits: [4, 5],
  }
  const s = createState(def)
  s.phase = 'fight'
  s.phaseT = 0
  s.players[0].fighter.x = 400 * 256; s.players[0].fighter.y = 540 * 256
  s.players[1].fighter.x = 800 * 256; s.players[1].fighter.y = 540 * 256
  return { def, s }
}

describe('start lines in the sim', () => {
  it('the charge creeps up on its own in the fight', () => {
    const m = lineMatch()
    for (let t = 0; t < R.EVO_PASSIVE_TICKS * 10; t++) step(m.def, m.s, idle())
    expect(m.s.players[0].evo).toBe(10)
  })
  it("the slot's next step is option 1, other owned evolutions stay on Tab, two evolves reach the picked card", () => {
    const m = lineMatch()
    const me = m.s.players[0]
    expect(evolveOptions(m.def, m.s, 0, false)).toEqual([3, 2]) // Charmeleon first, Dark Charmeleon second
    me.evo = R.EVO_MAX
    step(m.def, m.s, idle(BTN.EVOLVE))
    expect(me.members[0].kit).toBe(3)
    expect(evolveOptions(m.def, m.s, 0, false)).toEqual([4])
    me.evo = R.EVO_MAX
    step(m.def, m.s, idle()) // F is a press: let go of it first
    step(m.def, m.s, idle(BTN.EVOLVE))
    expect(me.members[0].kit).toBe(4) // Charizard, the card picked for the slot
    expect(evolveStatus(m.def, m.s, 0).reason).toBe('top stage')
  })
  it('leaving the line through Tab still finds the way back when the card allows it', () => {
    const m = lineMatch()
    const me = m.s.players[0]
    me.evo = R.EVO_MAX
    step(m.def, m.s, idle(evolveTo(2))) // Dark Charmeleon
    expect(me.members[0].kit).toBe(2)
    expect(evolveOptions(m.def, m.s, 0, false)).toEqual([4]) // Charizard evolves from any Charmeleon
  })
  it('the reason strings', () => {
    const m = lineMatch([])
    const me = m.s.players[0]
    me.evo = 40
    expect(evolveStatus(m.def, m.s, 0)).toEqual({ ready: false, options: [3], reason: `charge 40/${R.EVO_MAX}` })
    me.evo = R.EVO_MAX
    expect(evolveStatus(m.def, m.s, 0)).toEqual({ ready: true, options: [3], reason: 'ready' })
    me.active = 1 // Hypno: nothing evolves out of it
    expect(evolveStatus(m.def, m.s, 0).reason).toBe('top stage')
    m.def.topKits = []
    expect(evolveStatus(m.def, m.s, 0).reason).toBe('no owned evolution')
    // a second Charmander, when the one Charmeleon it could take was spent this match
    const n = lineMatch([3])
    n.def.players[0].paths = []
    n.def.players[0].members = [0, 0]
    const s2 = createState(n.def)
    s2.phase = 'fight'
    s2.players[0].evo = R.EVO_MAX
    step(n.def, s2, idle(BTN.EVOLVE))
    expect(s2.players[0].members[0].kit).toBe(3)
    s2.players[0].active = 1
    expect(evolveStatus(n.def, s2, 0).reason).toBe('already evolved this match')
    // the press says why too
    s2.players[0].evo = R.EVO_MAX
    step(n.def, s2, idle())
    step(n.def, s2, idle(BTN.EVOLVE))
    expect(s2.events.some((e) => e.k === 'fizzle' && e.why === 'already evolved this match')).toBe(true)
  })
})
