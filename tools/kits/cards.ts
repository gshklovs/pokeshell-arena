// Card data for the maintainer tools: pokeshell's packs/pokemon/carddata.json ($env:POKEARENA_CARDS, else the
// sibling pokeshell checkout), with names and rarities from pack.json next to it. Read at run time only: no card
// text is ever written into this repo.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { CardData } from '../../src/sim/types'

export interface Card extends CardData {
  rarity?: string
  set?: string
}

export function cardsPath(): string {
  const env = process.env.POKEARENA_CARDS
  if (env && existsSync(env)) return env
  const guess = resolve(__dirname, '../../../pokeshell/packs/pokemon/carddata.json')
  if (existsSync(guess)) return guess
  const guess2 = resolve(process.cwd(), '../pokeshell/packs/pokemon/carddata.json')
  if (existsSync(guess2)) return guess2
  throw new Error('card data not found: set POKEARENA_CARDS to pokeshell\'s packs/pokemon/carddata.json')
}

/** every card with its id, name and character (Pokémon with attacks only, unless `all`) */
export function loadCards(all = false): Card[] {
  const p = cardsPath()
  const j = JSON.parse(readFileSync(p, 'utf8'))
  const packPath = join(dirname(p), 'pack.json')
  const pack = existsSync(packPath) ? JSON.parse(readFileSync(packPath, 'utf8')).cards ?? {} : {}
  const out: Card[] = []
  for (const [id, c] of Object.entries<CardData>(j.cards ?? j)) {
    const meta = pack[id] ?? {}
    const card: Card = { ...c, id, name: meta.name ?? c.name ?? id, character: meta.character ?? c.character, rarity: meta.rarity, set: meta.set }
    if (!all && (!card.hp || !(card.attacks ?? []).length)) continue
    out.push(card)
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1))
}
