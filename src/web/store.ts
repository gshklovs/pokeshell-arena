// The web arena's state: what the standalone host keeps in its state folder (tokens.log, pulls.log, matches.jsonl,
// teams.json; docs/SPEC.md section 10), kept in this browser instead, as one JSON document under one key. Every change
// reads it, changes it and writes it back in one synchronous step, so two tabs can't interleave inside a change.
// Without storage (a private window that refuses it) it lives in memory for the page's life.
import type { TeamsFile } from '../game/teams'

/** where the document is kept: localStorage, or memory */
export interface Kv { get(k: string): string | null; set(k: string, v: string): void; remove(k: string): void }

export function memoryKv(): Kv {
  const m = new Map<string, string>()
  return { get: (k) => m.get(k) ?? null, set: (k, v) => { m.set(k, v) }, remove: (k) => { m.delete(k) } }
}

/** localStorage when it works (it throws in some private windows), else memory */
export function browserKv(): Kv {
  try {
    const ls = globalThis.localStorage
    const probe = 'pokearena.web.probe'
    ls.setItem(probe, '1')
    ls.removeItem(probe)
    return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v), remove: (k) => ls.removeItem(k) }
  } catch {
    return memoryKv()
  }
}

export const STATE_KEY = 'pokearena.web.v1'

/** a wallet line (tokens.log): +n granted, -1 a pack opened */
export interface TokenLine { time: string; delta: number; reason: string; id: string; kind?: 'starter'; set?: string; pack?: string; random?: boolean }
/** a caught card (pulls.log, counted) */
export interface Caught { count: number; shiny: number; first: string; last: string }
/** a recorded match result (matches.jsonl, the fields the page and the progress need) */
export interface MatchLine { matchId: string; time: string; mode: string; difficulty: string; won: boolean; forfeit?: boolean; points: number; granted: number; arena?: unknown; team?: unknown; opponent?: unknown }

export interface WebState {
  version: 1
  created: string
  /** the wallet's balance (the sum of every token line) */
  balance: number
  /** when the starter packs were granted (the record that they were: once per browser) */
  starterAt: string | null
  /** the latest wallet lines, newest last (at most RECENT) */
  tokens: TokenLine[]
  /** every card pulled, by card id */
  cards: Record<string, Caught>
  pulls: number
  /** the tokens toward the next pack: every result's points minus 10 per pack it granted */
  progress: number
  /** the latest results, newest last (at most MATCHES): what makes a replayed result count once */
  matches: MatchLine[]
  teams: TeamsFile | null
}

export const RECENT = 50
export const MATCHES = 500

/** local time as YYYY-MM-DDTHH:MM:SS, like pokeshell's logs */
export function nowLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function emptyState(): WebState {
  return { version: 1, created: nowLocal(), balance: 0, starterAt: null, tokens: [], cards: {}, pulls: 0, progress: 0, matches: [], teams: null }
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** a stored document, or a fresh one when it's missing or unreadable (a broken one is kept aside, not lost) */
function parse(text: string | null, kv: Kv): WebState {
  if (!text) return emptyState()
  try {
    const j = JSON.parse(text) as Partial<WebState>
    if (j && j.version === 1 && isNum(j.balance) && j.cards && typeof j.cards === 'object') {
      return {
        ...emptyState(), ...j,
        tokens: Array.isArray(j.tokens) ? j.tokens : [],
        matches: Array.isArray(j.matches) ? j.matches : [],
        progress: isNum(j.progress) ? j.progress : 0,
        pulls: isNum(j.pulls) ? j.pulls : 0,
      }
    }
  } catch { /* below */ }
  try { kv.set(`${STATE_KEY}.broken.${Date.now()}`, text) } catch { /* full: drop it */ }
  return emptyState()
}

export class Store {
  constructor(readonly kv: Kv = browserKv()) {}

  read(): WebState {
    return parse(this.kv.get(STATE_KEY), this.kv)
  }

  /** read, change, write back; `f`'s answer is returned. A write that fails (storage full) throws */
  change<T>(f: (s: WebState) => T): T {
    const s = this.read()
    const out = f(s)
    this.kv.set(STATE_KEY, JSON.stringify(s))
    return out
  }

  /** start over: the collection, wallet and results are forgotten (the next start grants the starter packs again) */
  reset(): void {
    this.kv.remove(STATE_KEY)
  }
}
