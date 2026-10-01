// Regression for "all the pokemons are vibrating in the arena": a bot's walk direction must not flip-flop.
// Its choices sit on thresholds (the range band, flow-field tile edges, the dodge side of a shot's line, the
// look-ahead's scores), and without hysteresis they flipped it back and forth every tick or few ticks.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { step } from '../sim/step'
import { PILOT_KITS, testMatch } from '../sim/testing'
import { BTN, type Kit } from '../sim/types'
import { BotDriver, DIFFICULTY, type DifficultyName } from './bot'
import { createBot } from './index'
import { MIN_HOLD } from './smart'

const arena = (id: string) => JSON.parse(readFileSync(resolve(__dirname, '../../public/arenas', id, 'arena.json'), 'utf8'))

/** walk-direction reversals (an axis going +1 -> -1 or back between ticks) within MIN_HOLD ticks of the previous
 * change of direction, dodge rolls excepted */
function flipFlops(level: DifficultyName, a: Kit, b: Kit, arenaId: string, ticks: number): { fast: number; ticks: number } {
  const m = testMatch(a, b, { arena: arena(arenaId), seed: 7 })
  const d = [0, 1].map((p) => new BotDriver(createBot(level), m.def, p, DIFFICULTY[level], 3 + p))
  const last = [{ mx: 0, my: 0, at: -99 }, { mx: 0, my: 0, at: -99 }]
  let fast = 0, t = 0
  for (; t < ticks && m.s.phase !== 'over'; t++) {
    const ins = d.map((b) => b.input(m.s))
    ins.forEach((inp, p) => {
      const h = last[p]
      if (inp.mx === h.mx && inp.my === h.my) return
      const reverses = (inp.mx && h.mx && inp.mx !== h.mx) || (inp.my && h.my && inp.my !== h.my)
      if (reverses && t - h.at < MIN_HOLD && !(inp.buttons & BTN.DODGE) && !m.s.players[p].fighter.knock) fast++
      last[p] = { mx: inp.mx, my: inp.my, at: t }
    })
    step(m.def, m.s, ins)
  }
  return { fast, ticks: t }
}

for (const level of ['easy', 'normal', 'hard', 'expert'] as const) {
  it(`${level} bots don't flip-flop their walk direction`, { timeout: 60_000 }, () => {
    let fast = 0, ticks = 0
    for (const [a, b, id] of [[PILOT_KITS.squirtle, PILOT_KITS.bulbasaur, 'growlithe-meadow'], [PILOT_KITS.leafeon, PILOT_KITS.charmander, 'glastrier-ice-field']] as const) {
      const r = flipFlops(level, a, b, id, level === 'expert' ? 900 : 1800)
      fast += r.fast; ticks += r.ticks
    }
    // a blocked way, a dodge or a stun can still turn it around at once (under 1% of ticks); before the hysteresis
    // it was 3-7% of ticks
    expect(fast / ticks, `${fast} fast reversals in ${ticks} ticks`).toBeLessThan(0.01)
  })
}
