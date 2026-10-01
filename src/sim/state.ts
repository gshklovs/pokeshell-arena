// Creating, cloning and hashing SimState. State is plain data, so clone = JSON round trip and the hash is FNV-1a
// over its canonical JSON (creation code fixes the key order).
import { FP } from './fixed'
import { withSpecies } from './flying'
import { seedRng } from './rng'
import * as R from './rules'
import type { Dir, Fighter, FighterKit, MatchDef, SimState } from './types'

export function newFighter(kit: FighterKit, x: number, y: number, facing: Dir, tick = 0): Fighter {
  // the kit's movement traits plus its species' flying (data/flying.json)
  const move = withSpecies(kit.move, kit.character)
  return {
    x, y, r: R.radiusPx(kit.retreat), aim: facing > 0 ? 0 : 128, facing, moving: 0,
    cast: null, recovery: 0, cooldowns: kit.attacks.map(() => 0),
    dodge: null, dash: null, dodgeCd: 0, invuln: 0, knock: null, slow: null, shield: null, buffs: [],
    status: { paralyzed: 0, asleep: 0, confused: 0, burned: 0, poisoned: 0, turnTimer: 0 },
    terrainTimer: 0, inShock: false, enteredAt: tick, hurtAt: -1, hurtAmt: 0,
    ...(move ? { move: { ...move, ...(move.speedIn ? { speedIn: { ...move.speedIn } } : {}) } } : {}),
  }
}

export function spawnPoint(def: MatchDef, team: number, n = 0): { x: number; y: number } {
  const list = def.arena.spawns.filter((s) => s.team === team)
  const sp = list[n % Math.max(1, list.length)] ?? { x: 960, y: 540 }
  return { x: sp.x * FP, y: sp.y * FP }
}

export function createState(def: MatchDef): SimState {
  const a = def.arena
  const players = def.players.map((pd, i) => {
    const kit = def.kits[pd.members[0]]
    const sp = spawnPoint(def, pd.team, i)
    const facing: Dir = sp.x < (a.cols * 40 * FP) / 2 ? 1 : -1
    return {
      team: pd.team,
      prevButtons: 0,
      active: 0,
      members: pd.members.map((k) => ({ kit: k, hp: def.kits[k].hp, maxHp: def.kits[k].hp, ko: false })),
      fighter: newFighter(kit, sp.x, sp.y, facing),
      pips: [R.ENERGY_START],
      fill: [0],
      kos: 0,
      swapCd: 0,
      replaceT: 0,
      usedOnce: [] as string[],
      evo: 0,
      evoUsed: [] as number[],
      koAt: -1,
    }
  })
  const n = a.tiles.length
  return {
    tick: 0,
    rng: seedRng(def.seed),
    phase: 'countdown',
    phaseT: R.COUNTDOWN_TICKS,
    winner: -1,
    fightT: 0,
    nextId: 1,
    players,
    projectiles: [],
    beams: [],
    areas: [],
    swings: [],
    tiles: a.tiles.slice(),
    propHp: a.propHp.slice(),
    wet: new Array<number>(n).fill(0),
    shock: new Array<number>(n).fill(0),
    fire: new Array<number>(n).fill(0),
    events: [],
  }
}

export function cloneState(s: SimState): SimState {
  return JSON.parse(JSON.stringify(s)) as SimState
}

/** FNV-1a (32-bit) over the state's JSON, as 8 hex digits */
export function hashState(s: SimState): string {
  const str = JSON.stringify(s)
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
