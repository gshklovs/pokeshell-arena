// Teams for bot matches (docs/SPEC.md section 11). Two modes, the user's words: "random decks (of your cards) and bot
// gets all cards, or you choose and bot chooses (rolls good cards for bot)".
//   - Random: your team is rolled from YOUR caught cards; the bot's from ALL cards (data/bots/roster.json).
//   - Choose: you pick your team; the bot rolls good cards from all cards, weighted toward strong ones by the
//     difficulty (easy modest, expert premium V / VMAX / ex).
// Every roll is seeded: the same seed gives the same teams. Each bot also gets the next-stage cards of its team from
// the roster, so bots evolve too. Every slot, yours and the bots', enters as the Basic of the picked card's line and
// evolves toward it (src/game/lines.ts).
import type { DifficultyName } from '../bots/bot'
import { resolveKit } from '../sim/kit'
import { randInt, seedRng, type HasRng } from '../sim/rng'
import { canEvolveInto, type EvoCard } from '../sim/evolution'
import { EVO_OPTIONS_MAX } from '../sim/rules'
import type { CardData, FighterKit } from '../sim/types'
import { KITS } from './kits'
import { startLines, type LineEntry } from './lines'

export interface RosterCard extends CardData { character: string }
export type DeckMode = 'random' | 'choose'

const RULE_BOX = ['V', 'VMAX', 'VSTAR', 'GX', 'EX', 'ex', 'TAG TEAM', 'V-UNION']

export function isRuleBox(c: { subtypes?: string[] }): boolean {
  return (c.subtypes ?? []).some((s) => RULE_BOX.includes(s))
}

function maxDamage(c: CardData): number {
  let n = 0
  for (const a of c.attacks ?? []) { const m = /\d+/.exec(a.damage ?? ''); if (m) n = Math.max(n, parseInt(m[0], 10)) }
  return n
}

/** how strong a card is on its own: its HP plus twice its biggest printed damage (a raw, deliberate card choice) */
export function cardScore(c: CardData): number {
  return Number(c.hp) + 2 * maxDamage(c)
}

/** where on the strength scale (0 weakest .. 1000 strongest percentile) each difficulty rolls, and how wide */
export const ROLL_TARGET: Record<DifficultyName, { center: number; width: number; ruleBox: number }> = {
  easy: { center: 250, width: 220, ruleBox: 1 },
  normal: { center: 500, width: 220, ruleBox: 2 },
  hard: { center: 750, width: 200, ruleBox: 4 },
  expert: { center: 950, width: 150, ruleBox: 12 },
}

let rosterCache: RosterCard[] | null = null

/** the bot roster (a lazy chunk: ~400 KB of card numbers) */
export async function loadBotRoster(): Promise<RosterCard[]> {
  if (!rosterCache) {
    const m = await import('../../data/bots/roster.json')
    rosterCache = ((m.default ?? m) as unknown as { cards: RosterCard[] }).cards
  }
  return rosterCache
}

export function kitFor(c: RosterCard): FighterKit {
  return resolveKit(c, KITS.get(c.id) ?? null)
}

export interface BotEntry { kit: FighterKit; shiny: boolean; owned: boolean; loaner?: boolean }

/** one side of a match (docs/SPEC.md section 6, "start lines"): the cards picked or rolled for its slots, what each
 * slot enters as (a Basic), the steps from there to the picked card, and the other owned cards it may evolve into */
export interface Side<T> {
  /** the chosen / rolled cards, by slot */
  picked: T[]
  /** what each slot enters the match as: the Basic of the picked card's line */
  members: T[]
  /** per slot: the cards after `members[i]` up to `picked[i]` (empty for a Basic) */
  paths: T[][]
  /** other cards the team may evolve into mid-match (not on any slot's line) */
  evolutions: T[]
}
export type BotTeam = Side<BotEntry>

/** the cards that evolve from a team (and from those), from a card list: what the team can evolve into. Follows
 * canEvolveInto (normalised names, the species of regular stages, VMAX / VSTAR only from their V), two stages deep,
 * at most `perStage` per card, never a team card or one in `exclude` (card ids) */
export function evolutionPool<T extends { kit: FighterKit }>(team: readonly T[], cards: readonly T[], perStage = 3, exclude: Iterable<string> = []): T[] {
  const out: T[] = []
  const have = new Set([...team.map((e) => e.kit.card), ...exclude])
  let frontier: FighterKit[] = team.map((e) => e.kit)
  for (let depth = 0; depth < 2 && frontier.length; depth++) {
    const next: FighterKit[] = []
    for (const from of frontier) {
      let n = 0
      for (const c of cards) {
        if (n >= perStage || have.has(c.kit.card) || !canEvolveInto(from, c.kit)) continue
        have.add(c.kit.card); out.push(c); next.push(c.kit); n++
      }
    }
    frontier = next
  }
  return out
}

/** your side from the cards picked for it: each slot starts as the Basic of its line (an owned one, else a loaner
 * from every card), and every owned card that evolves from the team's lines comes along (up to EVO_OPTIONS_MAX per
 * card) */
export function playerSide<T extends LineEntry>(picked: readonly T[], owned: readonly T[], all: readonly RosterCard[], loan: (c: RosterCard) => T | null): Side<T> {
  const lines = startLines(picked, owned, all, loan)
  const members = lines.map((l) => l.start), paths = lines.map((l) => l.path)
  const lineCards = [...members, ...paths.flat()]
  return { picked: [...picked], members, paths, evolutions: evolutionPool(lineCards, owned, EVO_OPTIONS_MAX) }
}

/** a bot's side: bots own every card, so each slot's line comes from the roster (never a loaner) */
export function botSideOf(roster: readonly RosterCard[], picked: BotEntry[]): BotTeam {
  const lines = startLines(picked, [], roster, entry, 'loaner')
  const clean = (e: BotEntry): BotEntry => (e.loaner ? { kit: e.kit, shiny: e.shiny, owned: false } : e)
  const members = lines.map((l) => clean(l.start)), paths = lines.map((l) => l.path.map(clean))
  return { picked, members, paths, evolutions: botEvolutions(roster, [...members, ...paths.flat()]) }
}

function entry(c: RosterCard): BotEntry | null {
  try { return { kit: kitFor(c), shiny: false, owned: false } } catch { return null }
}

/** pick `size` items by weight (integers), without two of the same name; types spread out while the pool allows */
function weightedPick<T>(h: HasRng, items: readonly T[], weight: (x: T) => number, name: (x: T) => string, type: (x: T) => string, size: number): T[] {
  const left = items.map((x) => ({ x, w: Math.max(0, Math.round(weight(x))) })).filter((e) => e.w > 0)
  const out: T[] = []
  const names = new Set<string>()
  const types = new Map<string, number>()
  for (let tries = 0; out.length < size && left.length && tries < 1000; tries++) {
    const typeCap = 1 + Math.floor(tries / 40) // mixed teams, unless the pool is thin
    const total = left.reduce((n, e) => n + e.w, 0)
    let r = randInt(h, total), i = 0
    while (r >= left[i].w) { r -= left[i].w; i++ }
    const e = left[i]
    if (names.has(name(e.x))) { left.splice(i, 1); continue }
    if ((types.get(type(e.x)) ?? 0) >= typeCap) continue
    left.splice(i, 1)
    out.push(e.x); names.add(name(e.x)); types.set(type(e.x), (types.get(type(e.x)) ?? 0) + 1)
  }
  return out
}

/** a card's roll weight for a difficulty: a bell around its target percentile of the strength scale, x ruleBox bonus */
export function rollWeights(roster: readonly RosterCard[], level: DifficultyName): Map<string, number> {
  const t = ROLL_TARGET[level]
  const sorted = roster.map((c) => ({ id: c.id, s: cardScore(c), rb: isRuleBox(c) })).sort((a, b) => a.s - b.s || (a.id < b.id ? -1 : 1))
  const w = new Map<string, number>()
  sorted.forEach((c, i) => {
    const pct = sorted.length > 1 ? Math.round((i * 1000) / (sorted.length - 1)) : 500
    const d = (pct - t.center) / t.width
    w.set(c.id, Math.round(1000 * Math.exp(-d * d) * (c.rb ? t.ruleBox : 1)) + 1)
  })
  return w
}

function toEntries(h: HasRng, cards: RosterCard[]): BotEntry[] {
  const out: BotEntry[] = []
  for (const c of cards) { try { out.push({ kit: kitFor(c), shiny: randInt(h, 64) === 0, owned: false }) } catch { /* a card without numbers */ } }
  return out
}

/** the roster's next-stage cards of a team (bots own every card, like a deck built for the fight) */
function botEvolutions(roster: readonly RosterCard[], team: BotEntry[]): BotEntry[] {
  const lineIds = new Set(team.map((e) => e.kit.card))
  const cand: BotEntry[] = []
  let frontier: EvoCard[] = team.map((e) => e.kit)
  const seen = new Set<string>()
  for (let depth = 0; depth < 2 && frontier.length; depth++) {
    const next: EvoCard[] = []
    for (const c of roster) {
      if (!c.evolvesFrom || seen.has(c.id) || lineIds.has(c.id) || !frontier.some((f) => canEvolveInto(f, c))) continue
      const e = entry(c)
      if (e) { cand.push(e); seen.add(c.id); next.push(c) }
    }
    frontier = next
  }
  return evolutionPool(team, cand, 2)
}

/** Choose mode: the bot rolls good cards from all cards, weighted by the difficulty */
export function rollBotTeam(roster: readonly RosterCard[], level: DifficultyName, size: number, seed: number): BotTeam {
  const h = { rng: seedRng(seed ^ 0x7ea3b) }
  const w = rollWeights(roster, level)
  const picked = weightedPick(h, roster, (c) => w.get(c.id) ?? 0, (c) => c.name, (c) => c.types?.[0] ?? 'Colorless', size)
  return botSideOf(roster, toEntries(h, picked))
}

/** Random mode, the bot's side: any cards at all, uniformly */
export function rollAnyTeam(roster: readonly RosterCard[], size: number, seed: number): BotTeam {
  const h = { rng: seedRng(seed ^ 0x4a11c) }
  const picked = weightedPick(h, roster, () => 1, (c) => c.name, (c) => c.types?.[0] ?? 'Colorless', size)
  return botSideOf(roster, toEntries(h, picked))
}

/** Random mode, your side: a team rolled from your own caught cards only (then their start lines, and the
 * evolutions you own for it, as playerSide) */
export function rollMyTeam<T extends LineEntry>(owned: readonly T[], size: number, seed: number, all: readonly RosterCard[] = [], loan: (c: RosterCard) => T | null = () => null): Side<T> {
  const h = { rng: seedRng(seed ^ 0x3e7d) }
  const picked = weightedPick(h, owned, () => 1, (e) => e.kit.card, (e) => e.kit.types[0] ?? 'Colorless', Math.min(size, owned.length))
  return playerSide(picked, owned, all, loan)
}
