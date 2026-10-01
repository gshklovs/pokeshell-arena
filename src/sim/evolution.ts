// Which card may evolve into which (docs/SPEC.md section 6): the TCG's evolvesFrom link, read the way a player reads
// it. Pure and deterministic, shared by the sim (evolveOptions), the team builders (evolution pools, start lines)
// and the screens.
//   - Names are compared normalised: case, accents (Flabébé), punctuation (Farfetch'd, Mr. Mime, Porygon-Z), the
//     gender signs (Nidoran ♀) and spacing don't matter.
//   - A regular Stage 1 / Stage 2 evolves from any card of the species its evolvesFrom names, whatever the set, form
//     or prefix: a Basic Zigzagoon may take a Linoone whose card says "Galarian Zigzagoon", a Charmeleon a Dark
//     Charizard. A Basic evolves into any owned Stage 1 of the next species; a Stage 1 into Stage 2.
//   - VMAX / VSTAR (and Mega, V-UNION) evolve only from the exact card they name: Umbreon VMAX from Umbreon V, never
//     from a plain Umbreon (the TCG rule; see NO_V_SHORTCUT).
//   - Rule-box cards (V, GX, ex, Radiant, ...) evolve only by that exact link (V -> VMAX), never into regular stages.
//   - A Neo-era Baby (subtype Baby) evolves into its Basic (Magby -> Magmar), as the Baby rule says.

export interface EvoCard {
  name: string
  evolvesFrom?: string | null
  subtypes?: readonly string[]
}

/** rule-box and special cards: they evolve only by an exact evolvesFrom link, never into a regular stage */
const RULE = ['V', 'VMAX', 'VSTAR', 'GX', 'EX', 'ex', 'TAG TEAM', 'V-UNION', 'Radiant', 'MEGA', 'BREAK', 'LEGEND', 'Prism Star', 'Level-Up', 'LEVEL-UP']
/** cards that evolve only from the exact card they name (the V, the EX) */
const EXACT_ONLY = ['VMAX', 'VSTAR', 'MEGA', 'V-UNION']
/** the stages nothing evolves out of */
const TOP = ['Stage 2', 'VMAX', 'VSTAR', 'MEGA', 'BREAK', 'LEGEND', 'TAG TEAM', 'V-UNION', 'Radiant', 'GX', 'EX', 'ex', 'Prism Star', 'Level-Up', 'LEVEL-UP']

/** false: a plain Umbreon may NOT evolve into Umbreon VMAX (the TCG: VMAX evolves from the V). An open question for
 * the user; flip it to let a plain card of the species take a VMAX / VSTAR directly */
export const NO_V_SHORTCUT = true

/** Neo Babies and the Basic each one grows into (the cards have no evolvesFrom for this) */
const BABY: Record<string, readonly string[]> = {
  pichu: ['pikachu'], cleffa: ['clefairy'], igglybuff: ['jigglypuff'], tyrogue: ['hitmonlee', 'hitmonchan', 'hitmontop'],
  smoochum: ['jynx'], elekid: ['electabuzz'], magby: ['magmar'], azurill: ['marill'], wynaut: ['wobbuffet'],
  budew: ['roselia'], chingling: ['chimecho'], bonsly: ['sudowoodo'], 'mime jr': ['mr mime'], happiny: ['chansey'],
  munchlax: ['snorlax'], mantyke: ['mantine'],
}

/** a card name for comparing: lower case, no accents, no punctuation, single spaces ("Nidoran ♀" -> "nidoran f") */
const normMemo = new Map<string, string>()
const speciesMemo = new Map<string, string>()

export function normName(s: string | null | undefined): string {
  const key = s ?? ''
  let out = normMemo.get(key)
  if (out === undefined) { out = normalise(key); normMemo.set(key, out) }
  return out
}

function normalise(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/♀/g, ' f ').replace(/♂/g, ' m ').replace(/δ/g, ' delta ').replace(/[☆★]/g, ' star ').replace(/◇/g, ' prism ')
    .replace(/['’`.:]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const PREFIX = /^(?:(?:galarian|alolan|hisuian|paldean|dark|light|shining|radiant|origin forme|rapid strike|single strike|fusion strike|ultra|m|mega|special delivery|flying|surfing|detective|ash|bloodmoon|white striped)\s+)+/
const SUFFIX = /(?:\s+(?:v|vmax|vstar|v union|gx|ex|break|lv x|lvx|delta|star|prism|prime|legend|tag team|sp|g|gl|fb|c|4|e))+$/

/** the species a card name is of: the normalised name without owner, region, prefix and rule-box suffix
 * ("Team Rocket's Mewtwo" / "Galarian Zigzagoon" / "Lycanroc VMAX" / "Charizard-GX" -> "mewtwo" / "zigzagoon" /
 * "lycanroc" / "charizard") */
export function speciesKey(name: string | null | undefined): string {
  const key = name ?? ''
  let out = speciesMemo.get(key)
  if (out === undefined) { out = species(key); speciesMemo.set(key, out) }
  return out
}

function species(name: string): string {
  let s = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  s = s.replace(/\(.*?\)/g, ' ').replace(/^.*?['’]s\s+/, '') // "(Sandy Cloak)", "Blaine's "
  s = normName(s)
  s = s.replace(PREFIX, '').replace(SUFFIX, '').trim()
  return s
}

const has = (c: EvoCard, list: readonly string[]) => (c.subtypes ?? []).some((t) => list.includes(t))

/** a rule-box or special card (V, VMAX, GX, ex, Radiant, ...) */
export function isRuleCard(c: EvoCard): boolean {
  return has(c, RULE)
}

/** a card that starts a line: a Basic (V cards are Basics) or a Baby */
export function isBasicCard(c: EvoCard): boolean {
  const st = c.subtypes ?? []
  if (st.includes('Basic') || st.includes('Baby')) return true
  return !c.evolvesFrom && !has(c, ['Stage 1', 'Stage 2', ...EXACT_ONLY, 'BREAK', 'Level-Up', 'LEVEL-UP'])
}

/** may a Pokémon that is `from` evolve into `to`? (the rules at the top of this file) */
export function canEvolveInto(from: EvoCard, to: EvoCard): boolean {
  if (!to.evolvesFrom) {
    // the Baby rule: a Baby grows into its Basic
    if (!(from.subtypes ?? []).includes('Baby') || isRuleCard(to) || !isBasicCard(to)) return false
    return (BABY[speciesKey(from.name)] ?? []).includes(speciesKey(to.name))
  }
  if (normName(to.evolvesFrom) === normName(from.name)) return true
  if (has(to, EXACT_ONLY)) {
    if (NO_V_SHORTCUT) return false
    return !isRuleCard(from) && speciesKey(to.name) === speciesKey(from.name)
  }
  if (isRuleCard(from)) return false
  const sp = speciesKey(to.evolvesFrom)
  return sp !== '' && sp === speciesKey(from.name)
}

/** the top of a line: nothing evolves out of it (Stage 2, VMAX, VSTAR, and rule-box cards other than a Basic V);
 * with `all` (every card there is), also a card no card at all evolves from (Hypno, Mewtwo) */
export function isTopStage(c: EvoCard, all?: readonly EvoCard[]): boolean {
  if (has(c, TOP)) return true
  return !!all && !all.some((x) => canEvolveInto(c, x))
}
