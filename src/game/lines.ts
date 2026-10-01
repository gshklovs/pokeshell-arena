// Start lines (docs/SPEC.md section 6): every team slot enters the match as the Basic of its line, and the card that
// was chosen or rolled for the slot is what it evolves toward with the evolve charge. Charizard enters as Charmander,
// then Charmeleon, then Charizard; a VMAX enters as its V. The same for you and the bots, in every mode.
//   - Which lower stage: one the player OWNS first (the same set as the slot's card, then the same era, then any);
//   - owning none, a loaner: the most fitting real card of that stage from every card (same set first), flagged
//     `loaner` so the screens say so. NO_BASIC_OWNED switches this to "start as the lowest owned card instead".
// Deterministic: no randomness, ties go to the lowest card number.
import { canEvolveInto, isBasicCard, type EvoCard } from '../sim/evolution'
import type { FighterKit } from '../sim/types'

/** owning no lower stage of a picked card: 'loaner' borrows one from every card (the default), 'as-is' starts the
 * slot as the lowest card of the line the player owns (the picked card itself when they own none). An open question
 * for the user */
export const NO_BASIC_OWNED: 'loaner' | 'as-is' = 'loaner'

export interface LineEntry { kit: FighterKit; shiny: boolean; owned: boolean; loaner?: boolean }

/** one slot: the card it enters as, then the steps to the picked card (empty when the picked card is a Basic) */
export interface SlotLine<T> { start: T; path: T[] }

/** a card of every card there is (the bot roster), turned into an entry only when it's borrowed */
export interface AnyCard extends EvoCard { id: string }

const setOf = (id: string) => id.replace(/-[^-]+$/, '')
const eraOf = (id: string) => /^[a-z]+/.exec(setOf(id))?.[0] ?? ''
/** 0 the same set as the picked card, 1 the same era, 2 anything */
const nearness = (id: string, ref: string) => (setOf(id) === setOf(ref) ? 0 : eraOf(id) === eraOf(ref) ? 1 : 2)
const kitCard = (k: FighterKit): EvoCard => ({ name: k.name, evolvesFrom: k.evolvesFrom, subtypes: k.subtypes })

function best<X>(xs: readonly X[], id: (x: X) => string, ref: string): X | undefined {
  // the nearest set first, then the lowest card number (a regular print before a secret rare)
  let out: X | undefined, near = 9
  for (const x of xs) {
    const n = nearness(id(x), ref)
    if (out === undefined || n < near || (n === near && id(x).localeCompare(id(out), 'en', { numeric: true }) < 0)) { out = x; near = n }
  }
  return out
}

/** the line a picked card enters the match through: walk down from it, owned cards first, a loaner when nothing
 * owned fits (policy), until a Basic */
export function lineFor<T extends LineEntry, C extends AnyCard>(target: T, owned: readonly T[], all: readonly C[], loan: (c: C) => T | null, policy = NO_BASIC_OWNED): SlotLine<T> {
  const chain: T[] = [target]
  let cur = target
  for (let depth = 0; depth < 3 && !isBasicCard(kitCard(cur.kit)); depth++) {
    const want = kitCard(cur.kit)
    let pre = best(owned.filter((e) => e.kit.card !== cur.kit.card && canEvolveInto(kitCard(e.kit), want)), (e) => e.kit.card, target.kit.card)
    if (!pre && policy === 'loaner') {
      const c = best(all.filter((x) => x.id !== cur.kit.card && canEvolveInto(x, want)), (x) => x.id, target.kit.card)
      const e = c ? loan(c) : null
      if (e) pre = { ...e, loaner: true, owned: false }
    }
    if (!pre) break
    chain.unshift(pre)
    cur = pre
  }
  return { start: chain[0], path: chain.slice(1) }
}

/** a whole team's start lines */
export function startLines<T extends LineEntry, C extends AnyCard>(team: readonly T[], owned: readonly T[], all: readonly C[], loan: (c: C) => T | null, policy = NO_BASIC_OWNED): SlotLine<T>[] {
  return team.map((e) => lineFor(e, owned, all, loan, policy))
}

/** "Charmander → Charmeleon → Charizard" (loaners marked) */
export function lineText(l: SlotLine<{ kit: FighterKit; loaner?: boolean }>): string {
  return [l.start, ...l.path].map((e) => `${e.kit.name}${e.loaner ? ' (loaner)' : ''}`).join(' → ')
}
