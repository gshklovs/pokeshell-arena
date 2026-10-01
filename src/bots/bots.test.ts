import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { hashState } from '../sim/state'
import { step } from '../sim/step'
import { PILOT_KITS, testMatch } from '../sim/testing'
import { BotDriver, DIFFICULTY } from './bot'
import { DumbBot } from './dumb'
import { playMatch } from './ladder'
import type { Kit } from '../sim/types'
import type { Bot } from './bot'

const meadow = JSON.parse(readFileSync(resolve(__dirname, '../../public/arenas/growlithe-meadow/arena.json'), 'utf8'))

function botMatch(seed: number, a = PILOT_KITS.pikachu, b = PILOT_KITS.charmander) {
  const m = testMatch(a, b, { arena: meadow, seed })
  const d0 = new BotDriver(new DumbBot(DIFFICULTY.hard), m.def, 0, DIFFICULTY.hard, seed)
  const d1 = new BotDriver(new DumbBot(DIFFICULTY.normal), m.def, 1, DIFFICULTY.normal, seed + 1)
  let t = 0
  for (; t < 60 * 90 && m.s.phase !== 'over'; t++) step(m.def, m.s, [d0.input(m.s), d1.input(m.s)])
  return { m, t }
}

it('two bots fight a match to a finish on a real arena', () => {
  const { m, t } = botMatch(5)
  expect(m.s.phase).toBe('over')
  expect(t).toBeLessThan(60 * 90)
})

it('a bot match is reproducible from its seed', () => {
  expect(hashState(botMatch(9).m.s)).toBe(hashState(botMatch(9).m.s))
})

const ARENAS = resolve(__dirname, '../../public/arenas')
const ids: string[] = JSON.parse(readFileSync(resolve(ARENAS, 'index.json'), 'utf8')).arenas
for (const id of ids) {
  // 60 s: the meter fills a pip per ENERGY_FILL (140 ticks) and paid attacks are the only pacing (the timing model);
  // easy bots miss a lot (glastrier-ice-field: the first hit lands at ~50 s)
  it(`easy bots find each other and trade hits within 60 s on ${id}`, () => {
    const f = JSON.parse(readFileSync(resolve(ARENAS, id, 'arena.json'), 'utf8'))
    const m = testMatch(PILOT_KITS.charmander, PILOT_KITS.squirtle, { arena: f, seed: 3 })
    const d0 = new BotDriver(new DumbBot(DIFFICULTY.easy), m.def, 0, DIFFICULTY.easy, 1)
    const d1 = new BotDriver(new DumbBot(DIFFICULTY.easy), m.def, 1, DIFFICULTY.easy, 2)
    for (let t = 0; t < 60 * 60 && m.s.phase !== 'over'; t++) step(m.def, m.s, [d0.input(m.s), d1.input(m.s)])
    const hp = m.s.players.map((p) => p.members[0].hp)
    expect(hp[0] < 50 || hp[1] < 40, `hp ${hp}`).toBe(true)
  })
}

it('the harness enforces the reaction delay and the aim error (bots cannot skip them)', () => {
  const seen: number[] = []
  const probe: Bot = { reset() {}, think(v) { seen.push(v.tick - v.state.tick); return { mx: 0, my: 0, aim: 0, buttons: 0 } } }
  const m = testMatch(PILOT_KITS.pikachu, PILOT_KITS.charmander, { arena: meadow, seed: 1 })
  const d = new BotDriver(probe, m.def, 0, DIFFICULTY.normal, 3)
  const aims = new Set<number>()
  for (let t = 0; t < 400; t++) { aims.add(d.input(m.s).aim); step(m.def, m.s, []) }
  expect(Math.max(...seen)).toBe(DIFFICULTY.normal.reactionTicks)
  const err = Math.round((DIFFICULTY.normal.aimErrorDeg * 256) / 360)
  expect(aims.size).toBeGreaterThan(3)
  for (const a of aims) expect(Math.min(a, 256 - a)).toBeLessThanOrEqual(err)
})

it('team mode: bots send in replacements after KOs, swap, evolve, and finish the match', async () => {
  const evo: Kit = {
    version: 1, card: 'base1-14', name: 'Raichu', character: 'raichu',
    stats: { hp: 80, types: ['Lightning'], subtypes: ['Stage 1'], evolvesFrom: 'Pikachu', weaknesses: [{ type: 'Fighting', value: '×2' }], resistances: [], retreat: 1 },
    attacks: [{ name: 'Thunder', cost: ['Lightning', 'Lightning', 'Colorless'], damage: '60', shape: { kind: 'projectile', speed: 15, radius: 12, range: 600 }, onHit: [{ op: 'damage', amount: 60 }] }],
  }
  const events = new Set<string>()
  let decided = 0
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const r = playMatch({
      arena: meadow, a: [PILOT_KITS.pikachu, PILOT_KITS.squirtle, PILOT_KITS.charmander], b: [PILOT_KITS.bulbasaur, PILOT_KITS.pikachu, PILOT_KITS.squirtle],
      aEvo: [evo], bEvo: [evo], seed,
    }, 'hard', 'expert', seed % 2 === 0, 60 * 150, (e) => events.add(e.k))
    if (r.result !== 0) decided++
    // yield between matches: each is a long synchronous run, and vitest's worker must stay responsive
    await new Promise((res) => setTimeout(res, 0))
  }
  expect(decided).toBe(6)
  expect([...events]).toEqual(expect.arrayContaining(['ko', 'swap', 'evolve']))
}, 240_000)

it('bots use their attacks (damage happens)', () => {
  const { m } = botMatch(21, PILOT_KITS.squirtle, PILOT_KITS.bulbasaur)
  const hp = m.s.players.map((p) => p.members[0].hp)
  expect(hp[0] < 40 || hp[1] < 40).toBe(true)
})
