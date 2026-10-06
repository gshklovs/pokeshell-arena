// The web arena's "host": the arena-host's /api routes (docs/SPEC.md section 9) answered in the browser, the way the
// standalone host answers them (host/src/main.rs, standalone.rs, state.rs): its own wallet with 3 starter packs, real
// boosters (booster.ts), the collection in pokeshell's `collection --json` shape, match results that earn tokens (10 to
// a pack), saved teams. The state is the browser's (store.ts), so nothing needs a server: a static site plays it.
import { validTeamsProblems } from './teams'
import { cardJson, findSet, loadModel, newUlid, openable, oddsRandom, oddsSet, openPack, pickSet, roundTo, secureDice, setChances, setsListing, cardSet, type Dice, type Model } from './booster'
import { nowLocal, RECENT, MATCHES, Store, type TokenLine, type WebState } from './store'

export const STARTER_PACKS = 3
export const STARTER_REASON = 'starter packs: welcome to pokeshell arena'
export const POINTS_PER_PACK = 10
const VERSION = '0.1.0-web'

/** pokeshell's card and booster data (data/pokeshell/: pack.json, boosters.json, built.json, carddata.json) */
export interface GameData { pack: unknown; boosters: unknown; built: { built: string[]; shinyArt: string[] }; carddata: { cards: Record<string, unknown> } }

export interface Answer { status: number; body: unknown }

export interface BackendOpts {
  store?: Store
  /** the game data, else data/pokeshell/ (loaded on first use) */
  data?: () => Promise<GameData>
  dice?: Dice
  /** the card faces are served at /pokeshell/img/ (the art build): collection entries say so (art.img) */
  faces?: boolean
}

// lazy chunks, not type-checked: carddata.json alone is 700 KB
const files = import.meta.glob<unknown>('/data/pokeshell/*.json', { import: 'default' })

/** the data this checkout ships (data/pokeshell/: tools/web/sync-data.mjs refreshes it) */
export async function bundledData(): Promise<GameData> {
  const get = (name: string) => {
    const f = files[`/data/pokeshell/${name}.json`]
    if (!f) throw new Error(`no data/pokeshell/${name}.json in this build`)
    return f()
  }
  const [pack, boosters, built, carddata] = await Promise.all(['pack', 'boosters', 'built', 'carddata'].map(get))
  return { pack, boosters, built: built as GameData['built'], carddata: carddata as GameData['carddata'] }
}

/** the tokens a match result earns toward the next pack: a win in 1v1 1, in team 2, +1 on hard, +2 on expert */
export function pointsFor(mode: string, difficulty: string, won: boolean): number {
  if (!won) return 0
  return (mode === 'team' ? 2 : 1) + (difficulty === 'hard' ? 1 : difficulty === 'expert' ? 2 : 0)
}

const isId = (s: unknown, max: number): s is string => typeof s === 'string' && s.length > 0 && s.length <= max && /^[A-Za-z0-9._-]+$/.test(s)
const ok = (body: unknown): Answer => ({ status: 200, body })
const err = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): Answer => ({ status, body: { error, message, ...extra } })
const clean = (s: string) => s.replace(/[\t\r\n]/g, ' ').trim() || '-'

export class Backend {
  readonly store: Store
  private model: Promise<{ m: Model; data: GameData }> | null = null
  private readonly loadData: () => Promise<GameData>
  private readonly dice: Dice
  private readonly faces: boolean

  constructor(o: BackendOpts = {}) {
    this.store = o.store ?? new Store()
    this.loadData = o.data ?? bundledData
    this.dice = o.dice ?? secureDice
    this.faces = !!o.faces
  }

  private game() {
    this.model ??= this.loadData().then((data) => ({
      data,
      m: loadModel(data.pack, data.boosters, new Set(data.built.built), new Set(data.built.shinyArt)),
    }))
    return this.model
  }

  /** the starter packs: STARTER_PACKS tokens, once per browser state (starterAt is the record) */
  ensureStarter(): boolean {
    return this.store.change((s) => {
      if (s.starterAt) return false
      addTokens(s, STARTER_PACKS, STARTER_REASON, { kind: 'starter' })
      s.starterAt = s.tokens[s.tokens.length - 1].time
      return true
    })
  }

  private starterJson(s: WebState) {
    return { packs: STARTER_PACKS, granted: !!s.starterAt, at: s.starterAt }
  }

  /** one request: the same routes and answers as arena-host in standalone mode */
  async handle(method: string, url: string, body?: unknown): Promise<Answer> {
    const path = url.split(/[?#]/)[0]
    const q = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '')
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const route = `${method.toUpperCase()} ${path}`
    switch (route) {
      case 'GET /api/health': {
        this.ensureStarter()
        const s = this.store.read()
        return ok({ ok: true, version: VERSION, api: 1, state: 'this browser', mode: 'standalone', bundled: true, web: true, starter: this.starterJson(s), pokeshell: { found: false } })
      }
      case 'GET /api/wallet': {
        const s = this.store.read()
        return ok({ tokens: s.balance, recent: s.tokens.map(tokenJson), progress: { points: Math.max(0, s.progress), perPack: POINTS_PER_PACK }, starter: this.starterJson(s) })
      }
      case 'GET /api/collection': return ok(await this.collection())
      case 'GET /api/sets': {
        const { m } = await this.game()
        return ok(setsListing(m, this.store.read().balance))
      }
      case 'GET /api/pack/odds': {
        const { m } = await this.game()
        const set = q.get('set')
        if (!set || set === 'random') return ok(oddsRandom(m))
        if (!isId(set, 32)) return err(400, 'bad_set', 'set: a set id like "swsh7"')
        try { return ok(oddsSet(m, findSet(m, set))) } catch (e) { return err(404, 'no_set', (e as Error).message) }
      }
      case 'GET /api/teams': return ok(this.store.read().teams ?? { version: 1, selected: null, teams: [] })
      case 'PUT /api/teams': {
        const problems = validTeamsProblems(body)
        if (problems.length) return err(400, 'bad_teams', problems.join('; '), { problems })
        this.store.change((s) => { s.teams = JSON.parse(JSON.stringify(body)) })
        return ok(body)
      }
      case 'POST /api/match/result': return this.matchResult(b)
      case 'POST /api/pack/open': return this.packOpen(b)
      case 'POST /api/heartbeat': return ok({ ok: true })
    }
    return err(404, 'no_route', `${method} ${path}`)
  }

  private matchResult(b: Record<string, unknown>): Answer {
    const id = b.matchId
    if (!isId(id, 64)) return err(400, 'bad_match', 'matchId: 1-64 letters, digits, - _ .')
    const mode = b.mode
    if (mode !== '1v1' && mode !== 'team') return err(400, 'bad_match', 'mode: "1v1" or "team"')
    const diff = b.difficulty
    if (typeof diff !== 'string' || !['easy', 'normal', 'hard', 'expert'].includes(diff)) return err(400, 'bad_match', 'difficulty: easy, normal, hard or expert')
    if (typeof b.won !== 'boolean') return err(400, 'bad_match', 'won: true or false')
    const forfeit = b.forfeit === true
    const won = b.won && !forfeit // a forfeit is always a loss
    return this.store.change((s) => {
      const progress = (p: number) => ({ points: Math.max(0, p), perPack: POINTS_PER_PACK })
      if (s.matches.some((x) => x.matchId === id)) return ok({ granted: 0, tokens: s.balance, duplicate: true, points: 0, progress: progress(s.progress) })
      const points = pointsFor(mode, diff, won)
      const want = Math.floor((s.progress + points) / POINTS_PER_PACK)
      if (want > 0) addTokens(s, want, `arena win ${id}`)
      s.progress += points - want * POINTS_PER_PACK
      s.matches.push({
        matchId: id, time: nowLocal(), mode, difficulty: diff, won, ...(forfeit ? { forfeit: true } : {}), points, granted: want,
        arena: b.arena ?? null, team: Array.isArray(b.team) ? b.team.slice(0, 6) : [], opponent: Array.isArray(b.opponent) ? b.opponent.slice(0, 6) : [],
      })
      if (s.matches.length > MATCHES) s.matches.splice(0, s.matches.length - MATCHES)
      return ok({ granted: want, tokens: s.balance, points, progress: progress(s.progress) })
    })
  }

  private async packOpen(b: Record<string, unknown>): Promise<Answer> {
    const random = b.random === true || b.set === 'random'
    if (!random && !isId(b.set, 32)) return err(400, 'bad_set', 'set: a set id like "swsh7", or "random" (or random: true)')
    const { m } = await this.game()
    let chosen: number | null = null
    if (!random) {
      try { chosen = findSet(m, b.set as string) } catch (e) { return err(400, 'bad_set', (e as Error).message) }
      if (!openable(m.sets[chosen])) return err(400, 'bad_set', `no cards of ${m.sets[chosen].name} are served, so it can't be opened`)
    }
    return this.store.change((s) => {
      if (s.balance < 1) return { status: 402, body: { error: 'no_tokens', message: `no pack tokens (balance ${s.balance}): win a battle to earn a pack`, tokens: s.balance } }
      const si = chosen ?? pickSet(m, this.dice) // the set is the first draw, then the pack
      if (si === null) return { status: 409, body: { error: 'no_sets', message: 'no set can be opened at random', tokens: s.balance } }
      const caught = new Set(Object.keys(s.cards))
      const picks = openPack(m, si, this.dice, caught)
      const packId = newUlid()
      const stamp = nowLocal()
      const bs = m.sets[si]
      const cards = picks.map((p) => {
        const c = m.cards[p.card]
        const e = (s.cards[c.id] ??= { count: 0, shiny: 0, first: stamp, last: stamp })
        e.count++
        if (p.shiny) e.shiny++
        e.last = stamp
        s.pulls++
        return cardJson(m, p, newUlid())
      })
      addTokens(s, -1, `opened ${bs.id}`, { set: bs.id, pack: packId, ...(random ? { random: true } : {}) })
      const chance = setChances(m)[si]
      return ok({
        set: bs.id, setName: bs.name, setChance: roundTo(chance, 6), setOneIn: chance > 0 ? roundTo(1 / chance, 1) : null,
        setPrice: bs.price > 0 ? bs.price : null, random, packId, secure: this.dice === secureDice, cards, spent: 1, tokens: s.balance,
        imageBase: '/pokeshell/',
      })
    })
  }

  /** `pokeshell collection --json`: every caught card with its pull times, counts, art paths and gameplay data */
  private async collection() {
    const { m, data } = await this.game()
    const s = this.store.read()
    const rawCards = (data.pack as { cards: Record<string, Record<string, unknown>> }).cards
    const shinyArt = new Set(data.built.shinyArt)
    let pulls = 0, shinies = 0
    const cards = Object.entries(s.cards).flatMap(([id, e]) => {
      const ci = m.byId.get(id)
      if (ci === undefined) return [] // a card this data doesn't serve: hidden
      const c = m.cards[ci]
      const raw = rawCards[id] ?? {}
      pulls += e.count
      shinies += e.shiny
      const rel = `${m.pack}/${c.character}/${id}`
      return [{
        card: id, pack: m.pack, character: c.character, name: raw.name ?? null, set: cardSet(id), setName: raw.set ?? null,
        number: raw.number ?? null, rarity: raw.rarity ?? null, tier: c.tierId, tierLabel: m.tierLabels[c.tier], tierRank: c.tier,
        caught: true, count: e.count, shinyCount: e.shiny, shiny: e.shiny > 0, new: false, firstCaught: e.first, lastCaught: e.last,
        art: { ans: null, ansShiny: null, png: null, pngShiny: null, img: this.faces ? `${rel}.png` : null, imgShiny: this.faces && shinyArt.has(id) ? `${rel}-shiny.png` : null },
        data: data.carddata.cards[id] ?? null,
      }]
    })
    return {
      api: 1, version: VERSION, state: 'this browser', pack: null, standalone: true, web: true,
      counts: { caught: cards.length, seen: 0, pulls, shiny: shinies }, cards, seen: [],
    }
  }
}

function addTokens(s: WebState, delta: number, reason: string, extra: Partial<TokenLine> = {}): void {
  s.balance += delta
  s.tokens.push({ time: nowLocal(), delta, reason: clean(reason), id: newUlid(), ...extra })
  if (s.tokens.length > RECENT) s.tokens.splice(0, s.tokens.length - RECENT)
}

function tokenJson(t: TokenLine) {
  return { time: t.time, delta: t.delta, reason: t.reason, id: t.id, set: t.set ?? null, pack: t.pack ?? null }
}

let shared: Backend | null = null
/** the page's backend (one per page) */
export function webBackend(faces: boolean): Backend {
  shared ??= new Backend({ faces })
  return shared
}
