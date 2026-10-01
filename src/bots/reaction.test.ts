// Human reactions (the user: "how does the bot know to dodge the second i click my attack?"): a bot answers a new
// shot or windup no sooner than its difficulty's reaction floor, and a shot that lands inside that window hits even
// Expert. The probe: the same match twice, the scripted foe attacking at T0 in one and idle in the other; the bot's
// first different input is its first response to the attack.
import { expect, it } from 'vitest'
import { FP, iatan2, idiv } from '../sim/fixed'
import { step } from '../sim/step'
import { fixtureKit, place, testMatch } from '../sim/testing'
import { BTN, type InputFrame, type Kit, type KitAttack } from '../sim/types'
import { BOT_LEVELS, BotDriver, DIFFICULTY, type DifficultyName } from './bot'
import { createBot } from './index'

const T0 = 90
/** the bot's own kit: a slow, long-cooldown shot so it keeps busy without flooding the field */
const BOT_KIT = fixtureKit({ shape: { kind: 'projectile', speed: 8, radius: 8, range: 500 }, cooldown: 90 }, { hp: 400 })

interface Run { frames: InputFrame[]; hits: number }

/** the bot (player 0) against a foe (player 1) that stands `gap` px away and presses attack 1 at T0 when `attack`,
 * aimed where the bot is heading (a human leading a moving target) */
function probe(level: DifficultyName, foeKit: Kit, gap: number, seed: number, attack: boolean, ticks = T0 + 90): Run {
  const m = testMatch(BOT_KIT, foeKit, { seed })
  place(m, 0, 900, 540)
  place(m, 1, 900 + gap, 540)
  m.s.players[1].pips = m.s.players[1].pips.map(() => 10)
  const d = new BotDriver(createBot(level), m.def, 0, DIFFICULTY[level], seed)
  const frames: InputFrame[] = []
  let hits = 0, px = 0, py = 0
  for (let t = 0; t < ticks && m.s.phase === 'fight'; t++) {
    const me = m.s.players[0].fighter, e = m.s.players[1].fighter
    // until the press the foe keeps its distance (it follows the bot's kiting), on the arena's open side
    if (t <= T0) { e.x = me.x + (me.x < 960 * FP ? gap : -gap) * FP; e.y = me.y }
    const lead = 10
    const aim = iatan2(me.y + (me.y - py) * lead - e.y, me.x + (me.x - px) * lead - e.x)
    px = me.x; py = me.y
    const f = d.input(m.s)
    frames.push(f)
    step(m.def, m.s, [f, { mx: 0, my: 0, aim, buttons: attack && t === T0 ? BTN.ATTACK1 : 0 }])
    for (const ev of m.s.events) if (ev.k === 'dmg' && ev.p === 0 && ev.src === 1 && t >= T0) hits++
  }
  return { frames, hits }
}

/** ticks from the foe's press to the bot's first different input, or -1 when it never differs */
function response(level: DifficultyName, foeKit: Kit, gap: number, seed: number): number {
  const a = probe(level, foeKit, gap, seed, true, T0 + 150), b = probe(level, foeKit, gap, seed, false, T0 + 150)
  for (let t = 0; t < a.frames.length; t++) {
    const x = a.frames[t], y = b.frames[t]
    if (x.mx !== y.mx || x.my !== y.my || x.aim !== y.aim || x.buttons !== y.buttons) return t - T0
  }
  return -1
}

const HIT = [{ op: 'damage', amount: 10 }]
const SHOT = fixtureKit({ shape: { kind: 'projectile', speed: 9, radius: 12, range: 900 }, cooldown: 200, onHit: HIT })
const CONE = fixtureKit({ shape: { kind: 'cone', range: 220, arc: 60 }, windup: 24, cooldown: 200, damage: '40', onHit: [{ op: 'damage', amount: 40 }] } as Partial<KitAttack> & Pick<KitAttack, 'shape'>)

it('reaction floors are human: Expert 200 ms or more, each level slower than the one above it', () => {
  expect(DIFFICULTY.expert.reactionTicks).toBeGreaterThanOrEqual(12)
  for (let i = 1; i < BOT_LEVELS.length; i++) expect(DIFFICULTY[BOT_LEVELS[i]].reactionTicks).toBeLessThan(DIFFICULTY[BOT_LEVELS[i - 1]].reactionTicks)
})

for (const level of BOT_LEVELS) {
  it(`${level}: the first response to a new shot or windup comes no sooner than its reaction floor`, () => {
    const floor = DIFFICULTY[level].reactionTicks
    const seen: number[] = []
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const [kit, gap] of [[SHOT, 360], [CONE, 170]] as const) {
        const r = response(level, kit, gap, seed)
        if (r >= 0) { expect(r, `${level} seed ${seed}`).toBeGreaterThanOrEqual(floor); seen.push(r) }
      }
    }
    // it does respond (the probe isn't vacuous): hard and expert walk or roll out of the way
    if (level === 'hard' || level === 'expert') expect(seen.length).toBeGreaterThan(3)
  }, 120_000) // Expert's look-ahead makes each probe slow
}

it('a fast shot fired from inside the reaction window hits even Expert', () => {
  const fast = fixtureKit({ shape: { kind: 'projectile', speed: 18, radius: 12, range: 400 }, cooldown: 200, onHit: HIT })
  let hit = 0, n = 0
  // from the press the shot lands within ~6-11 ticks (4 of windup, the rest in flight): under Expert's 12-tick floor.
  // The old Expert (5 ticks, its delay projected away) rolled out of every one of these from 190 px
  for (const gap of [150, 170, 190]) {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      n++
      if (probe('expert', fast, gap, seed, true, T0 + 40).hits > 0) hit++
    }
  }
  expect(hit).toBe(n)
}, 120_000)

it('Expert still dodges most shots it sees coming from range (the reaction floor leaves it time)', () => {
  let hit = 0
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
  for (const seed of seeds) if (probe('expert', SHOT, 520, seed, true, T0 + 120).hits > 0) hit++
  expect(hit).toBeLessThan(idiv(seeds.length * 3, 4))
}, 120_000)
