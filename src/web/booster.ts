// Real booster packs for the web arena: a port of host/src/booster.rs (itself pokeshell's booster model: the same
// slots, outcome weights (rate x served / printed, the unserved share to the base outcome), set choice for a random
// pack (price ^ -priceExponent), shiny roll, effects, hit sizes and reveal order). booster.test.ts checks its tables
// against what `pokeshell pack odds --json` printed (host/tests/fixtures/pokeshell/odds.json), as parity.rs does.

/** uniform draws in [0, 1) */
export type Dice = () => number

/** every draw from the browser's CSPRNG (53 bits), like the host's SecureDice */
export const secureDice: Dice = () => {
  const b = new Uint32Array(2)
  crypto.getRandomValues(b)
  return (b[0] * 2 ** 21 + (b[1] >>> 11)) / 2 ** 53
}

/** reproducible draws for tests (splitmix64, as the host's SeededDice) */
export function seededDice(seed: number): Dice {
  let s = BigInt.asUintN(64, BigInt(seed))
  return () => {
    s = BigInt.asUintN(64, s + 0x9e3779b97f4a7c15n)
    let z = s
    z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n)
    z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn)
    return Number((z ^ (z >> 31n)) >> 11n) / 2 ** 53
  }
}

const below = (d: Dice, n: number) => (n <= 1 ? 0 : Math.min(n - 1, Math.floor(d() * n)))

/** a ULID like pokeshell's pull ids: 48 bits of ms since 1970, 80 random bits, Crockford base32 */
export function newUlid(now = Date.now()): string {
  const C = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  let out = ''
  let ms = now
  for (let i = 0; i < 10; i++) { out = C[ms % 32] + out; ms = Math.floor(ms / 32) }
  const r = new Uint8Array(16)
  crypto.getRandomValues(r)
  for (let i = 0; i < 16; i++) out += C[r[i] & 31]
  return out
}

export interface Card { id: string; character: string; name: string; number: string; tier: number; tierId: string; tierLabel: string; rarity: string; setName: string; cset: string; shinyArt: boolean }
export interface Outcome { label: string; weight: number; pool: number[]; finish: string; fx: string; rate: number; printed: number; base: boolean }
export interface Slot { id: string; count: number; finish: string; outcomes: Outcome[] }
export interface BoosterSet { id: string; name: string; aliases: string[]; price: number; cards: number[]; inPack: number; slots: Slot[]; raw: Record<string, unknown> }
export interface Model {
  pack: string
  shinyChance: number
  priceExponent: number
  cards: Card[]
  byId: Map<string, number>
  characters: Map<string, string>
  tierLabels: string[]
  printedShinyTiers: Set<number>
  sets: BoosterSet[]
}

type J = unknown
const obj = (v: J): Record<string, J> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, J>) : {})

function sOf(v: J): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

/** PowerShell truthiness of a JSON value (`if ($x)`) */
function truthy(v: J): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') return v.length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

/** `@($x)` of strings */
function strs(v: J): string[] {
  if (v === null || v === undefined) return []
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined).map(sOf)
  return [sOf(v)]
}

function num(v: J): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const t = v.trim(); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null }
  if (typeof v === 'boolean') return v ? 1 : 0
  return null
}

export function cardSet(id: string): string {
  const i = id.lastIndexOf('-')
  return i > 0 ? id.slice(0, i) : ''
}

export const roundTo = (x: number, digits: number) => { const k = 10 ** digits; return Math.round(x * k) / k }

/** pokeshell's model from its files: `built` are the served cards, `shinyArt` the ones with shiny art */
export function loadModel(pack: J, boosters: J, built: Set<string>, shinyArt: Set<string>): Model {
  const p = obj(pack)
  const tiers = p.tiers
  if (!Array.isArray(tiers)) throw new Error('pack.json has no tiers')
  const tierIx = new Map(tiers.map((t, i) => [sOf(obj(t).id), i]))
  const tierLabels = tiers.map((t) => sOf(obj(t).label))
  const printedShinyTiers = new Set(tiers.map((t, i) => (obj(t).shiny === 'printed' ? i : -1)).filter((i) => i >= 0))
  const raw = obj(p.cards)
  const cards: Card[] = []
  const byId = new Map<string, number>()
  const characters = new Map<string, string>()
  for (const [id, cv] of Object.entries(raw)) {
    const c = obj(cv)
    const tierId = sOf(c.tier)
    const tier = tierIx.get(tierId)
    if (tier === undefined) throw new Error(`card ${id}: no tier '${tierId}' in pack.json`)
    characters.set(id, sOf(c.character))
    if (!built.has(id)) continue
    byId.set(id, cards.length)
    cards.push({ id, character: sOf(c.character), name: sOf(c.name), number: sOf(c.number), tier, tierId, tierLabel: tierLabels[tier], rarity: sOf(c.rarity), setName: sOf(c.set), cset: cardSet(id), shinyArt: shinyArt.has(id) })
  }
  const bsets = obj(boosters).sets
  if (!Array.isArray(bsets)) throw new Error('boosters.json has no sets')
  const sets = bsets.map((s) => setModel(obj(s), cards, raw))
  return { pack: typeof p.id === 'string' ? p.id : 'pokemon', shinyChance: num(p.shiny_chance) ?? 0, priceExponent: num(obj(boosters).priceExponent) ?? 1, cards, byId, characters, tierLabels, printedShinyTiers, sets }
}

function setModel(s: Record<string, J>, cards: Card[], raw: Record<string, J>): BoosterSet {
  const cardSets = strs(s.cardSets)
  const want = new Set(cardSets)
  const mine = cards.map((_, i) => i).filter((i) => want.has(cards[i].cset))
  const inPack = Object.keys(raw).filter((id) => want.has(cardSet(id))).length
  const slots: Slot[] = []
  for (const slv of Array.isArray(s.slots) ? s.slots : []) {
    const sl = obj(slv)
    const c = num(sl.count)
    const count = Math.trunc(c !== null && c !== 0 ? c : 1)
    const finish = truthy(sl.finish) ? sOf(sl.finish) : 'normal'
    const outcomes: Outcome[] = []
    let missing = 0
    let baseAt = -1
    const picks = Array.isArray(sl.pick) ? sl.pick : sl.pick === null || sl.pick === undefined ? [] : [sl.pick]
    for (const pkv of picks) {
      const pk = obj(pkv)
      const ids = truthy(pk.ids) ? new Set(strs(pk.ids)) : null
      const inSets = truthy(pk.sets) ? new Set(strs(pk.sets)) : new Set(cardSets)
      const rar = truthy(pk.rarity) ? new Set(strs(pk.rarity)) : null
      const exc = truthy(pk.exclude) ? new Set(strs(pk.exclude)) : null
      // every card we serve is a Pokemon card: an outcome of another supertype has no pool
      const noPok = truthy(pk.supertype) && sOf(pk.supertype) !== 'Pok'
      const pool = noPok ? [] : mine.filter((i) => {
        const cd = cards[i]
        if (ids) return ids.has(cd.id)
        return inSets.has(cd.cset) && !(exc?.has(cd.id)) && (!rar || rar.has(cd.rarity))
      })
      const rate = pk.rate === null || pk.rate === undefined ? 1 : num(pk.rate) ?? 0
      const printed = truthy(pk.printed) ? Math.trunc(num(pk.printed) ?? 0) : 0
      const share = printed > 0 ? Math.min(1, pool.length / printed) : pool.length ? 1 : 0
      const base = truthy(pk.base)
      let w = rate
      if (base && baseAt < 0) baseAt = outcomes.length
      else { w = rate * share; missing += rate - w } // the printed cards we don't serve: their share goes to the base
      outcomes.push({ label: sOf(pk.label), weight: w, pool, finish: sOf(pk.finish), fx: sOf(pk.fx), rate, printed, base })
    }
    if (baseAt >= 0 && outcomes[baseAt].pool.length) outcomes[baseAt].weight += missing
    slots.push({ id: sOf(sl.id), count, finish, outcomes })
  }
  return {
    id: sOf(s.id), name: sOf(s.name), aliases: strs(s.aliases).filter(Boolean).map((a) => a.toLowerCase()),
    price: truthy(s.price) ? num(s.price) ?? 0 : 0, cards: mine, inPack, slots, raw: s,
  }
}

export const openable = (s: BoosterSet) => s.cards.length > 0
const live = (o: Outcome) => o.weight > 0 && o.pool.length > 0

/** the outcome's probability once empty outcomes are dropped (BoosterSlot.Probability) */
export function probability(sl: Slot, o: number): number {
  const total = sl.outcomes.filter(live).reduce((a, x) => a + x.weight, 0)
  const x = sl.outcomes[o]
  return total > 0 && live(x) ? x.weight / total : 0
}

/** each set's chance to be the one a random pack opens: price ^ -k over the openable priced sets */
export function setChances(m: Model): number[] {
  const w = m.sets.map((s) => (openable(s) && s.price > 0 ? s.price ** -m.priceExponent : 0))
  const total = w.reduce((a, x) => a + x, 0)
  return w.map((x) => (total > 0 ? x / total : 0))
}

/** the set a random pack opens: one draw by setChances; null when no set can be */
export function pickSet(m: Model, d: Dice): number | null {
  const ch = setChances(m)
  let r = d()
  let last: number | null = null
  for (let i = 0; i < ch.length; i++) {
    if (ch[i] <= 0) continue
    last = i
    r -= ch[i]
    if (r < 0) return i
  }
  return last
}

/** a set by id or alias, else its exact name, else a word of its name; throws a message when none or several match */
export function findSet(m: Model, want: string): number {
  const w = want.trim().toLowerCase()
  const pass = (f: (s: BoosterSet) => boolean) => m.sets.map((s, i) => (f(s) ? i : -1)).filter((i) => i >= 0)
  let hit = pass((s) => s.id.toLowerCase() === w || s.aliases.includes(w))
  if (!hit.length) hit = pass((s) => s.name.toLowerCase() === w)
  if (!hit.length) hit = pass((s) => s.name.toLowerCase().includes(w))
  if (hit.length === 1) return hit[0]
  if (!hit.length) throw new Error(`no booster '${want}' (sets: ${m.sets.map((s) => s.id).join(', ')})`)
  throw new Error(`'${want}' matches several sets: ${hit.map((i) => `${m.sets[i].id} (${m.sets[i].name})`).join(', ')}`)
}

interface Pick { slot: number; outcome: number; card: number; finish: string }

/** one pack: every slot in order, `count` different cards each (Booster.Roll) */
export function roll(slots: Slot[], d: Dice): Pick[] {
  const picks: Pick[] = []
  slots.forEach((slot, s) => {
    const used: number[] = []
    for (let k = 0; k < slot.count; k++) {
      const o = pickOutcome(slot, d)
      if (o === null) break // nothing we serve fills it: one card fewer
      const oc = slot.outcomes[o]
      const card = pickCard(oc.pool, used, d)
      used.push(card)
      picks.push({ slot: s, outcome: o, card, finish: oc.finish || slot.finish })
    }
  })
  return picks
}

function pickOutcome(slot: Slot, d: Dice): number | null {
  const total = slot.outcomes.filter(live).reduce((a, o) => a + o.weight, 0)
  if (total <= 0) return null
  let r = d() * total
  let last: number | null = null
  for (let i = 0; i < slot.outcomes.length; i++) {
    const o = slot.outcomes[i]
    if (!live(o)) continue
    last = i
    r -= o.weight
    if (r < 0) return i
  }
  return last // floating-point edge: the last live outcome
}

function pickCard(pool: number[], used: number[], d: Dice): number {
  if (!used.length) return pool[below(d, pool.length)]
  const left = pool.filter((c) => !used.includes(c))
  if (!left.length) return pool[below(d, pool.length)]
  return left[below(d, left.length)]
}

/** the effect family a tier shows (Booster.Fx); a tier not listed is "holo" */
export function tierFx(tier: string): string {
  switch (tier) {
    case 'common': case 'uncommon': case 'rare': return 'plain'
    case 'rare-ultra': case 'ultra-rare': case 'illustration-rare': return 'full-art'
    case 'special-illustration-rare': return 'alt-art'
    case 'rare-rainbow': case 'shiny-ultra-rare': return 'rainbow'
    case 'rare-secret': case 'hyper-rare': return 'gold'
    case 'radiant-rare': case 'amazing-rare': case 'rare-shining': return 'radiant'
    case 'rare-shiny': case 'rare-shiny-gx': case 'shiny-rare': return 'shiny'
    default: return 'holo'
  }
}

/** how big the reveal is for an effect family (Booster.Hit) */
export function fxHit(fx: string): number {
  switch (fx) {
    case 'reverse': return 1
    case 'holo': return 2
    case 'full-art': case 'radiant': case 'shiny': return 3
    case 'alt-art': case 'rainbow': return 4
    case 'gold': return 5
    default: return 0
  }
}

export interface CardOut { card: number; slotId: string; outcome: string; finish: string; fx: string; hit: number; shiny: boolean; isNew: boolean; oneIn: number; image: string; order: number }

/** one pack of set `s`: the roll, each card's shiny roll, effect and reveal size, NEW against `caught` (updated), in
 * reveal order, rarest last (Booster.Open) */
export function openPack(m: Model, s: number, d: Dice, caught: Set<string>): CardOut[] {
  const set = m.sets[s]
  const outs: CardOut[] = roll(set.slots, d).map((p, n) => {
    const c = m.cards[p.card]
    const sl = set.slots[p.slot]
    const oc = sl.outcomes[p.outcome]
    const r = d() // always drawn
    const shiny = r < m.shinyChance && !m.printedShinyTiers.has(c.tier) && c.shinyArt
    let fx = oc.fx || tierFx(c.tierId)
    if (p.finish !== 'normal' && fx === 'plain') fx = 'reverse' // a foil print of a non-foil card
    let hit = fxHit(fx)
    if (fx === 'plain' && c.tierId === 'rare') hit = 1 // the rare slot's floor still comes last
    if (shiny) hit = Math.min(5, hit + 1)
    const prob = probability(sl, p.outcome)
    const isNew = !caught.has(c.id) // a second copy in the same pack isn't new
    caught.add(c.id)
    return {
      card: p.card, slotId: sl.id, outcome: oc.label, finish: p.finish, fx, hit, shiny, isNew,
      oneIn: prob > 0 ? roundTo(1 / prob, 1) : 0, image: `img/${m.pack}/${c.character}/${c.id}${shiny ? '-shiny' : ''}.png`, order: n,
    }
  })
  const key = (o: CardOut) => o.hit + (o.shiny ? 0.5 : 0)
  return outs.sort((a, b) => key(a) - key(b) || a.oneIn - b.oneIn || a.order - b.order)
}

/** a card as `pokeshell pack open --json` reports it */
export function cardJson(m: Model, o: CardOut, pullId: string): Record<string, unknown> {
  const c = m.cards[o.card]
  return {
    id: c.id, name: c.name, number: c.number, rarity: c.rarity, tier: c.tierId, tierLabel: c.tierLabel,
    slot: o.slotId, outcome: o.outcome, finish: o.finish, fx: o.fx, hit: o.hit, shiny: o.shiny,
    isNew: o.isNew, oneIn: o.oneIn, character: c.character, setName: c.setName, image: o.image,
    pullId, card: c.id, pull: pullId, png: null,
  }
}

const optNum = (x: number) => (x > 0 ? x : null)

/** `pokeshell pack odds random --json` */
export function oddsRandom(m: Model): Record<string, unknown> {
  const ch = setChances(m)
  return {
    set: 'random', priceExponent: m.priceExponent,
    sets: m.sets.map((s, i) => ({
      set: s.id, name: s.name, price: optNum(s.price), priceSource: s.raw.priceSource ?? null, openable: openable(s),
      chance: roundTo(ch[i], 6), oneIn: ch[i] > 0 ? roundTo(1 / ch[i], 1) : null,
    })),
  }
}

/** `pokeshell pack odds <set> --json` */
export function oddsSet(m: Model, s: number): Record<string, unknown> {
  const set = m.sets[s]
  const rows: unknown[] = []
  for (const sl of set.slots) {
    sl.outcomes.forEach((oc, o) => {
      const pr = probability(sl, o)
      rows.push({ slot: sl.id, count: sl.count, outcome: oc.label, rate: oc.rate, printed: oc.printed, served: oc.pool.length, base: oc.base, probability: roundTo(pr, 6), oneIn: pr > 0 ? roundTo(1 / pr, 1) : null })
    })
  }
  return { set: set.id, name: set.name, cards: set.cards.length, outcomes: rows }
}

/** `pokeshell pack sets --json`: each set's served cards, pack size, price, chance, the expected cards of each tier in
 * one pack, its art and hero image */
export function setsListing(m: Model, tokens: number): Record<string, unknown> {
  const ch = setChances(m)
  const sets = m.sets.map((s, i) => {
    const odds: [string, number][] = []
    let size = 0
    if (openable(s)) {
      for (const sl of s.slots) {
        let isLive = false
        sl.outcomes.forEach((oc, o) => {
          const pr = probability(sl, o)
          if (pr <= 0) return
          isLive = true
          for (const ci of oc.pool) {
            const t = m.cards[ci].tierId
            const add = (sl.count * pr) / oc.pool.length
            const e = odds.find(([k]) => k === t)
            if (e) e[1] += add
            else odds.push([t, add])
          }
        })
        if (isLive) size += sl.count
      }
    }
    const raw = s.raw
    const heroId = obj(raw.art).hero
    const heroChar = typeof heroId === 'string' ? m.characters.get(heroId) : undefined
    return {
      id: s.id, name: s.name, series: raw.series ?? null, released: raw.released ?? null, cardSets: strs(raw.cardSets),
      cards: s.cards.length, inPack: s.inPack, printed: Math.trunc(num(raw.printed) ?? 0), packSize: size,
      realPackSize: Math.trunc(num(raw.realPackSize) ?? 0), openable: openable(s), price: optNum(s.price), priceSource: raw.priceSource ?? null,
      chance: roundTo(ch[i], 6), oneIn: ch[i] > 0 ? roundTo(1 / ch[i], 1) : null,
      odds: odds.map(([tier, w]) => ({ tier, weight: roundTo(w, 5) })),
      art: raw.art ?? null, hero: heroChar !== undefined ? `img/${m.pack}/${heroChar}/${heroId}.png` : null,
      slots: s.slots.map((sl) => ({ id: sl.id, count: sl.count, finish: sl.finish })),
    }
  })
  return { pack: m.pack, tokens, priceExponent: m.priceExponent, sets }
}
