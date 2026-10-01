// The difficulty ladder: each level beats the one below it more often than not, headless, bot vs bot, on real
// arenas with the pilot kits: 1v1, team mode, and team mode with evolutions. Every match is played in both
// seatings (each level gets each side and each team once).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { PILOT_KITS as K } from '../sim/testing'
import type { ArenaFile, Kit } from '../sim/types'
import type { DifficultyName } from './bot'
import { runPairing, type LadderMatch, type Pairing } from './ladder'

const ARENAS = resolve(__dirname, '../../public/arenas')
const arena = (id: string): ArenaFile => JSON.parse(readFileSync(resolve(ARENAS, id, 'arena.json'), 'utf8'))

/** Stage 1 evolutions of the pilot Basics, as test fixtures (Base Set numbers; shapes are ours) */
function stage1(card: string, name: string, from: string, type: string, hp: number, weak: string, attacks: Kit['attacks']): Kit {
  return {
    version: 1, card, name, character: name.toLowerCase(),
    stats: { hp, types: [type], subtypes: ['Stage 1'], evolvesFrom: from, weaknesses: [{ type: weak, value: '×2' }], resistances: [], retreat: 1 },
    attacks,
  }
}
const dmg = (n: number) => [{ op: 'damage', amount: n }]
const EVO = {
  raichu: stage1('base1-14', 'Raichu', 'Pikachu', 'Lightning', 80, 'Fighting', [
    { name: 'Agility', cost: ['Lightning', 'Colorless', 'Colorless'], damage: '20', shape: { kind: 'projectile', speed: 16, radius: 10, range: 640 }, onHit: dmg(20) },
    { name: 'Thunder', cost: ['Lightning', 'Lightning', 'Lightning', 'Colorless'], damage: '60', shape: { kind: 'beam', length: 620, width: 22 }, windup: 14, onHit: dmg(60) },
  ]),
  charmeleon: stage1('base1-24', 'Charmeleon', 'Charmander', 'Fire', 80, 'Water', [
    { name: 'Slash', cost: ['Colorless', 'Colorless'], damage: '30', shape: { kind: 'melee', range: 70, arc: 80, lunge: 30 }, onHit: dmg(30) },
    { name: 'Flamethrower', cost: ['Fire', 'Fire', 'Colorless'], damage: '50', shape: { kind: 'cone', range: 220, arc: 50 }, windup: 12, onHit: dmg(50) },
  ]),
  wartortle: stage1('base1-42', 'Wartortle', 'Squirtle', 'Water', 70, 'Lightning', [
    { name: 'Bite', cost: ['Water', 'Colorless', 'Colorless'], damage: '40', shape: { kind: 'melee', range: 66, arc: 70, lunge: 40 }, onHit: dmg(40) },
  ]),
  ivysaur: stage1('base1-30', 'Ivysaur', 'Bulbasaur', 'Grass', 60, 'Fire', [
    { name: 'Vine Whip', cost: ['Grass', 'Colorless', 'Colorless'], damage: '30', shape: { kind: 'beam', length: 360, width: 18 }, onHit: dmg(30) },
  ]),
} as Record<string, Kit>

const ONE_V_ONE: [keyof typeof K, keyof typeof K][] = [
  ['pikachu', 'squirtle'], ['charmander', 'bulbasaur'], ['squirtle', 'charmander'], ['bulbasaur', 'pikachu'],
  ['pikachu', 'charmander'], ['squirtle', 'bulbasaur'], ['leafeon', 'charmander'], ['pikachu', 'leafeon'],
]
const ARENA_IDS = ['growlithe-meadow', 'lapras-lagoon', 'zarude-jungle', 'magmar-volcano', 'herdier-temple', 'sableye-crystal-cave']

function matches(n1v1: number, nTeam: number, seed0: number): LadderMatch[] {
  const out: LadderMatch[] = []
  for (let i = 0; i < n1v1; i++) {
    const [a, b] = ONE_V_ONE[i % ONE_V_ONE.length]
    out.push({ arena: arena(ARENA_IDS[i % ARENA_IDS.length]), a: [K[a]], b: [K[b]], seed: seed0 + i })
  }
  for (let i = 0; i < nTeam; i++) {
    const evo = i % 2 === 1
    out.push({
      arena: arena(ARENA_IDS[(i + 2) % ARENA_IDS.length]),
      a: [K.pikachu, K.charmander, K.squirtle], b: [K.bulbasaur, K.squirtle, K.pikachu],
      aEvo: evo ? [EVO.raichu, EVO.charmeleon, EVO.wartortle] : undefined,
      bEvo: evo ? [EVO.ivysaur, EVO.wartortle, EVO.raichu] : undefined,
      seed: seed0 + 100 + i,
    })
  }
  return out
}

const table: string[] = []
/** runPairing, one match at a time with a yield between (each match is a long synchronous run, and vitest's worker
 * must answer its heartbeat) */
async function pair(hi: DifficultyName, lo: DifficultyName, ms: LadderMatch[]): Promise<Pairing> {
  const r: Pairing = { wins: 0, losses: 0, draws: 0, ticks: 0, matches: 0 }
  for (const m of ms) {
    const p = runPairing([m], hi, lo)
    r.wins += p.wins; r.losses += p.losses; r.draws += p.draws; r.ticks += p.ticks; r.matches += p.matches
    await new Promise((res) => setTimeout(res, 0))
  }
  table.push(`${hi.padEnd(6)} vs ${lo.padEnd(6)}  ${String(r.wins).padStart(2)}-${String(r.losses).padStart(2)} (${r.draws} draws, ${r.matches} matches)`)
  return r
}

it('each difficulty level beats the one below it more often than not', async () => {
  const ladder: [DifficultyName, DifficultyName, number, number][] = [
    ['normal', 'easy', 8, 4], ['hard', 'normal', 8, 4], ['expert', 'hard', 8, 4],
  ]
  const results: (readonly [DifficultyName, DifficultyName, Pairing])[] = []
  for (const [k, [hi, lo, n1, nt]] of ladder.entries()) results.push([hi, lo, await pair(hi, lo, matches(n1, nt, 11 + k * 1000))] as const)
  console.log(`bot ladder (wins-losses for the higher level):\n  ${table.join('\n  ')}`)
  for (const [hi, lo, r] of results) expect(r.wins, `${hi} vs ${lo}: ${r.wins}-${r.losses}`).toBeGreaterThan(r.losses)
}, 600_000) // ~2.5 min alone at the balance-pass pacing (one pip per TURN); room for a busy machine
