// The bots by difficulty (docs/SPEC.md section 11): createBot(level) + the harness (BotDriver) that enforces
// reaction delay and aim error.
import { DIFFICULTY, type Bot, type DifficultyName } from './bot'
import { SKILLS, SmartBot } from './smart'

export { BOT_LEVELS, BotDriver, DIFFICULTY, type Bot, type BotView, type Difficulty, type DifficultyName } from './bot'
export { SmartBot, SKILLS } from './smart'

export function createBot(level: DifficultyName): Bot {
  return new SmartBot(DIFFICULTY[level], SKILLS[level])
}
