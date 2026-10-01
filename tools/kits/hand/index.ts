// The hand-kit specs (docs/KITS.md "Hand kits"): one per Pokémon name, covering every printing's attacks by attack
// name. tools/kits/build.ts turns them into data/kits/<card id>.json. The shape DSL is documented in build.ts.
// A spec never holds card text: the card's own mechanics come from its text through the parser at build time.
import { COLORLESS } from './colorless'
import { DARKNESS } from './darkness'
import { DRAGON } from './dragon'
import { FIGHTING } from './fighting'
import { FIRE } from './fire'
import { GRASS } from './grass'
import { LIGHTNING } from './lightning'
import { METAL } from './metal'
import { PSYCHIC } from './psychic'
import { WATER } from './water'

export interface HandSpec {
  /** the card name, as pokeshell's pack.json has it */
  name: string
  /** more names that share this spec (a line: Charmander, Charmeleon ... are separate specs; alt names are not) */
  also?: string[]
  /** limit to these card ids (when one name has printings that need different specs) */
  only?: string[]
  /** how fighting as it should feel, in a sentence */
  fantasy: string
  /** attack name -> shape DSL, or [shape DSL, a note on the translation] */
  atk: Record<string, string | [string, string]>
  /** numbers the kit overrides, with the reason (kept empty unless a translation needs it) */
  overrides?: Record<string, string>
}

export const HAND: HandSpec[] = [...FIRE, ...WATER, ...GRASS, ...LIGHTNING, ...PSYCHIC, ...FIGHTING, ...DARKNESS, ...METAL, ...DRAGON, ...COLORLESS]
