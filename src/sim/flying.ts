// Which species fly (data/flying.json, built by tools/build_flying.py from PokeAPI: the Flying type, the Levitate
// ability, and a curated list of clear floaters). A species fact, not a card fact: the TCG has no Flying type.
import data from '../../data/flying.json'
import type { MoveTraits } from './types'

const FLYING: Record<string, string> = (data as { flying: Record<string, string> }).flying

/** does this species fly (a `character` id like "charizard" or "giratina-origin")? */
export function isFlier(character: string | undefined | null): boolean {
  return !!character && character in FLYING
}

/** a kit's movement traits with its species' flying folded in (kit traits win where they say something) */
export function withSpecies(move: MoveTraits | undefined, character: string | undefined | null): MoveTraits | undefined {
  if (!isFlier(character)) return move
  return { fly: true, ...(move ?? {}) }
}
