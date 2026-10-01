// Test helpers: tiny matches built in code (tests only; never shipped as game content).
import { parseArena } from './arena'
import { defaultEnergy } from './energy'
import { resolveKit } from './kit'
import { createState } from './state'
import { step } from './step'
import type { ArenaFile, Effect, EnergyType, FighterKit, InputFrame, Kit, KitAttack, MatchDef, SimState } from './types'
import type { CastInfo } from './effects/define'
import { FP } from './fixed'
import { makeCtx } from './shapes'

import pikachu from '../../data/kits/base1-58.json'
import charmander from '../../data/kits/base1-46.json'
import squirtle from '../../data/kits/base1-63.json'
import bulbasaur from '../../data/kits/base1-44.json'
import leafeon from '../../data/kits/swsh7-7.json'

export const PILOT_KITS = { pikachu, charmander, squirtle, bulbasaur, leafeon } as unknown as Record<string, Kit>

/** a 48x27 arena: a wall ring, open floor, with optional overrides {x, y, ch} or whole rows */
export function testArena(marks: { x: number; y: number; ch: string }[] = []): ArenaFile {
  const rows: string[][] = []
  for (let y = 0; y < 27; y++) {
    rows.push([...(y === 0 || y === 26 ? '#'.repeat(48) : '#' + '.'.repeat(46) + '#')])
  }
  for (const m of marks) rows[m.y][m.x] = m.ch
  return {
    version: 1, id: 'test', name: 'Test', size: { w: 1920, h: 1080 }, tile: 40,
    grid: rows.map((r) => r.join('')),
    spawns: [{ team: 0, x: 400, y: 540 }, { team: 1, x: 1520, y: 540 }],
  }
}

/** a fixture kit: one attack with the given shape and effects (not a card; tests only) */
export function fixtureKit(attack: Partial<KitAttack> & Pick<KitAttack, 'shape'>, stats: Kit['stats'] = {}): Kit {
  return {
    version: 1, card: 'test-1', name: 'Fixture', character: 'fixture',
    stats: { hp: 100, types: ['Colorless'], subtypes: ['Basic'], weaknesses: [], resistances: [], retreat: 1, ...stats },
    attacks: [{ name: 'Test', cost: ['Colorless'], damage: '10', windup: 0, recovery: 0, cooldown: 0, ...attack }],
  }
}

export interface TestMatch { def: MatchDef; s: SimState }

/** a 1v1 in the fight phase (countdown skipped) */
export function testMatch(a: Kit, b: Kit, opts: { arena?: ArenaFile; seed?: number; energy?: EnergyType[][]; balance?: boolean } = {}): TestMatch {
  // mechanics tests work on the printed numbers: no balance curves unless `balance` (docs/KITS.md "Balance")
  const raw = !opts.balance
  const kits: FighterKit[] = [resolveKit(null, a), resolveKit(null, b)].map((k) => (raw ? { ...k, hp: k.printedHp ?? k.hp } : k))
  const def: MatchDef = {
    mode: '1v1', seed: opts.seed ?? 1, arena: parseArena(opts.arena ?? testArena()), kits, raw,
    players: [
      { team: 0, name: 'A', members: [0], energy: opts.energy?.[0] ?? defaultEnergy([kits[0]]) },
      { team: 1, name: 'B', members: [1], energy: opts.energy?.[1] ?? defaultEnergy([kits[1]]) },
    ],
  }
  const s = createState(def)
  s.phase = 'fight'
  s.phaseT = 0
  return { def, s }
}

/** put player p's fighter at a design-px position */
export function place(m: TestMatch, p: number, x: number, y: number): void {
  m.s.players[p].fighter.x = x * FP
  m.s.players[p].fighter.y = y * FP
}

export function run(m: TestMatch, ticks: number, inputs: (tick: number) => (InputFrame | undefined)[] = () => []): void {
  for (let i = 0; i < ticks; i++) step(m.def, m.s, inputs(i))
}

/** press attack 1 on the first tick, aiming `aim`, then idle (holding aim) */
export function fire(aim: number, buttons = 1): (t: number) => (InputFrame | undefined)[] {
  return (t) => [{ mx: 0, my: 0, aim, buttons: t === 0 ? buttons : 0 }, { mx: 0, my: 0, aim: 128, buttons: 0 }]
}

/** run one effect list as player 0's attack 0 hitting player 1 (target -1 for onCast/onImpact); returns the cast */
export function applyEffects(m: TestMatch, effects: Effect[], opts: { target?: number; x?: number; y?: number; element?: EnergyType } = {}): CastInfo {
  const f = m.s.players[0].fighter
  const cast: CastInfo = { player: 0, attack: 0, element: opts.element ?? m.def.kits[0].attacks[0].element, bonus: 0 }
  const ctx = makeCtx(m.def, m.s, cast, opts.target ?? 1, opts.x ?? f.x, opts.y ?? f.y)
  ctx.run(effects)
  return cast
}

export function hp(m: TestMatch, p: number): number {
  const pl = m.s.players[p]
  return pl.members[Math.max(0, pl.active)].hp
}
