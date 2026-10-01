// The bot contract (docs/SPEC.md section 11). A bot is an input producer: it sees a (delayed) read-only state and
// returns an InputFrame. The harness (BotDriver), not the bot, enforces the handicaps: reaction time (the bot sees
// the state from `reactionTicks` ago) and aim error (the driver turns the bot's aim by a seeded error).
import { deg, wrapAngle } from '../sim/fixed'
import { randInt, seedRng } from '../sim/rng'
import { cloneState } from '../sim/state'
import type { InputFrame, MatchDef, SimState } from '../sim/types'

export interface BotView {
  /** the current tick (the state below is older: tick - state.tick = the reaction delay) */
  tick: number
  me: number
  /** read-only, and `reactionTicks` old */
  state: SimState
  def: MatchDef
}

export interface Bot {
  reset(def: MatchDef, player: number, seed: number): void
  think(view: BotView): InputFrame
}

export interface Difficulty {
  /** the reaction floor: the bot sees the state from this many ticks ago (60 Hz; humans take ~200-250 ms to react
   * to something new on screen, good players ~150-180 ms) */
  reactionTicks: number
  aimErrorDeg: number
  /** permille: how often it tries to roll out of a shot or windup it has noticed */
  dodgePermille: number
  /** permille: how often it closes in instead of keeping its range */
  aggression: number
  /** extra ticks (0..this, seeded per event) before it notices a new shot or windup: on top of reactionTicks, so a
   * reaction is never clockwork */
  reactionJitter: number
  /** permille: a dodge (or sidestep) goes the wrong way: across the shot's line or straight back along it */
  wrongDodgePermille: number
  /** ticks of error (+-, seeded per event) in its dodge and parry timing */
  timingErr: number
}

export type DifficultyName = 'easy' | 'normal' | 'hard' | 'expert'
export const BOT_LEVELS: DifficultyName[] = ['easy', 'normal', 'hard', 'expert']
/** the reactions are human (the user: "it feels impossible if he moves the same tick i move"): an event reaches a
 * bot reactionTicks + 0..reactionJitter ticks after it happens, Expert 12-15 (200-250 ms), Hard 15-18, Normal
 * 20-24, Easy 30-36. Expert is hard through its decisions (skills in smart.ts), not its reflexes */
export const DIFFICULTY: Record<DifficultyName, Difficulty> = {
  easy: { reactionTicks: 30, aimErrorDeg: 20, dodgePermille: 100, aggression: 400, reactionJitter: 6, wrongDodgePermille: 350, timingErr: 8 },
  normal: { reactionTicks: 20, aimErrorDeg: 10, dodgePermille: 300, aggression: 600, reactionJitter: 4, wrongDodgePermille: 250, timingErr: 6 },
  hard: { reactionTicks: 15, aimErrorDeg: 3, dodgePermille: 600, aggression: 800, reactionJitter: 3, wrongDodgePermille: 150, timingErr: 4 },
  expert: { reactionTicks: 12, aimErrorDeg: 2, dodgePermille: 700, aggression: 850, reactionJitter: 3, wrongDodgePermille: 100, timingErr: 3 },
}

/** ticks between aim-error re-rolls */
export const AIM_ERROR_EVERY = 20

/** runs a bot with its handicaps: think() sees the state from reactionTicks ago, and its aim gets a seeded error */
export class BotDriver {
  private ring: SimState[] = []
  private h: { rng: number }
  private aimOff = 0
  private n = 0
  constructor(readonly bot: Bot, readonly def: MatchDef, readonly player: number, readonly diff: Difficulty, seed: number) {
    bot.reset(def, player, seed)
    this.h = { rng: seedRng((seed ^ 0x0a1e77) + player) }
  }
  /** call once per tick, before step(), with the current state */
  input(s: SimState): InputFrame {
    this.ring.push(cloneState(s))
    while (this.ring.length > this.diff.reactionTicks + 1) this.ring.shift()
    const seen = this.ring[0]
    const f = this.bot.think({ tick: s.tick, me: this.player, state: seen, def: this.def })
    if (this.n++ % AIM_ERROR_EVERY === 0) {
      const err = deg(this.diff.aimErrorDeg)
      this.aimOff = randInt(this.h, 2 * err + 1) - err
    }
    return { mx: f.mx, my: f.my, aim: wrapAngle(f.aim + this.aimOff), buttons: f.buttons }
  }
}
