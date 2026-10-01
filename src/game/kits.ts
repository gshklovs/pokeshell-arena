// The kits bundled from data/kits, and your roster: the cards you caught in pokeshell (`collection --json`), each
// with its kit, else an auto-kit. You battle only with cards you own (docs/SPEC.md section 6).
import { resolveKit, validateKit } from '../sim/kit'
import type { CardData, FighterKit, Kit } from '../sim/types'

const files = import.meta.glob<Kit>('/data/kits/*.json', { eager: true, import: 'default' })

/** every kit file by card id (invalid ones are reported and skipped) */
export const KITS: ReadonlyMap<string, Kit> = (() => {
  const m = new Map<string, Kit>()
  for (const path of Object.keys(files).sort()) {
    const k = files[path]
    const errs = validateKit(k)
    if (errs.length) { console.warn(`kit ${path}:`, errs); continue }
    m.set(k.card, k)
  }
  return m
})()

export interface RosterEntry {
  kit: FighterKit
  shiny: boolean
  owned: boolean
  /** a lower stage borrowed from every card for a start line (src/game/lines.ts): not the player's */
  loaner?: boolean
  /** the card face from pokeshell's web export, served by the host at /pokeshell/img/ (docs/SPEC.md section 2) */
  face?: string
  /** when the player last pulled the card (pokeshell's `lastCaught`, local time 'yyyy-MM-ddTHH:mm:ss'), for the loadout's "last pulled" sort */
  pulled?: string
}

/** a pokeshell collection card (docs/SPEC.md section 2) */
export interface CollectionCard {
  card: string
  character?: string
  name?: string
  set?: string
  number?: string
  rarity?: string
  tier?: string
  count?: number
  shiny?: boolean
  caught?: boolean
  /** the latest pull of the card (local time 'yyyy-MM-ddTHH:mm:ss'); missing from older pokeshells */
  lastCaught?: string | null
  /** the text half's gameplay fields (no id/name: those are on the entry) */
  data?: Omit<CardData, 'id' | 'name'> & Partial<Pick<CardData, 'id' | 'name'>> | null
  /** paths pokeshell knows for the card's art; `img` is relative to <pokeshell state>/web/img (-> /pokeshell/img/) */
  art?: { ans?: string | null; ansShiny?: string | null; png?: string | null; pngShiny?: string | null; img?: string | null; imgShiny?: string | null }
}

/** caught Pokémon cards with gameplay data -> fighters (their kit if there is one, else an auto-kit) */
export function collectionRoster(cards: CollectionCard[]): RosterEntry[] {
  const out: RosterEntry[] = []
  const seen = new Set<string>()
  // the card's latest pull across its entries (the same card can come from more than one pack)
  const pulled = new Map<string, string>()
  for (const c of cards) {
    if (c.caught === false || typeof c.lastCaught !== 'string' || !c.lastCaught) continue
    const t = pulled.get(c.card)
    if (!t || c.lastCaught > t) pulled.set(c.card, c.lastCaught)
  }
  for (const c of cards) {
    if (c.caught === false || !c.data || seen.has(c.card)) continue
    if (!c.data.hp || !(c.data.attacks ?? []).length) continue // trainers, energy, attack-less cards
    seen.add(c.card)
    try {
      // pokeshell's `data` has no id / name / character: they are on the card entry
      const data = { ...c.data, id: c.data.id ?? c.card, name: c.data.name ?? c.name ?? c.card, character: c.data.character ?? c.character }
      const img = (c.shiny ? c.art?.imgShiny : null) ?? c.art?.img
      const face = img ? `/pokeshell/img/${img.replace(/\\/g, '/').replace(/^\/+/, '')}` : undefined
      out.push({ kit: resolveKit(data, KITS.get(c.card) ?? null), shiny: !!c.shiny, owned: true, face, pulled: pulled.get(c.card) })
    } catch (e) {
      console.warn(`card ${c.card}:`, e)
    }
  }
  return out
}
