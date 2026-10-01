// The arena-host client (docs/SPEC.md section 9). Every call degrades: without a host the game is practice-only.
import type { CollectionCard } from './kits'
import type { TeamsFile } from './teams'

/** the standalone arena's welcome packs: granted once per state, the first time it starts */
export interface Starter { packs: number; granted: boolean; at?: string | null }

/** the tokens toward the next pack: wins earn tokens, `perPack` (10) of them make a pack (docs/SPEC.md section 9) */
export interface Progress { points: number; perPack: number }

export interface Health {
  ok: boolean
  version: string
  api: number
  state: string
  /** "standalone": the downloadable arena (its own wallet and packs, no pokeshell; docs/RELEASE.md); missing from older hosts */
  mode?: 'pokeshell' | 'standalone'
  /** the downloadable build (the game data is embedded in the host) */
  bundled?: boolean
  starter?: Starter
  pokeshell: { found: boolean; script?: string; home?: string; version?: string }
}

export interface ApiError { status: number; error: string; message: string; need?: string }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await r.text()
  let j: unknown = null
  try { j = JSON.parse(text) } catch { /* not JSON */ }
  if (!r.ok || j === null) {
    const e = (j ?? {}) as Partial<ApiError>
    throw { status: r.status, error: e.error ?? 'bad_response', message: e.message ?? text.slice(0, 200), need: e.need } as ApiError
  }
  return j as T
}

export const api = {
  health: () => call<Health>('GET', '/api/health'),
  /** the pack-token wallet: pokeshell's (pokeshell pack tokens --json), or the standalone arena's own */
  wallet: () => call<{ tokens: number; recent?: unknown[]; progress?: Progress; starter?: Starter }>('GET', '/api/wallet'),
  collection: () => call<{ cards: CollectionCard[] }>('GET', '/api/collection'),
  sets: () => call<{ sets: unknown[] }>('GET', '/api/sets'),
  /** `granted`: packs the result completed, `tokens`: packs to open (the wallet), `points`: the tokens it earned toward
   * the next pack, `progress`: where that stands now */
  matchResult: (r: MatchResult) => call<{ granted: number; tokens: number | null; points?: number; progress?: Progress; error?: string; message?: string; duplicate?: boolean }>('POST', '/api/match/result', r),
  /** pokeshell pack open <set> --json, plus imageBase (card image URL = imageBase + card.image) */
  openPack: (set: string) => call<{ set: string; cards: unknown[]; tokens: number; imageBase?: string }>('POST', '/api/pack/open', { set }),
  /** pokeshell pack open random --json: the set rolled by pack price, then the pack (what spending a token does) */
  openRandomPack: () => call<{ set: string; setName?: string; setOneIn?: number | null; cards: unknown[]; tokens: number; imageBase?: string }>('POST', '/api/pack/open', { random: true }),
  heartbeat: () => call<{ ok: boolean }>('POST', '/api/heartbeat', {}),
  teams: () => call<TeamsFile>('GET', '/api/teams'),
  saveTeams: (t: TeamsFile) => call<unknown>('PUT', '/api/teams', t),
}

export interface MatchResult {
  matchId: string
  mode: '1v1' | 'team'
  difficulty: 'easy' | 'normal' | 'hard' | 'expert'
  won: boolean
  /** you quit the match: a loss, recorded as a forfeit, no pack tokens */
  forfeit?: boolean
  prizes: number
  ticks: number
  seed: number
  arena: string
  team: string[]
  opponent: string[]
}

/** probe the host once (short timeout); null = no host (dev server or static file) */
export async function probeHost(): Promise<Health | null> {
  try {
    const t = new Promise<null>((res) => setTimeout(() => res(null), 1500))
    return (await Promise.race([api.health(), t])) ?? null
  } catch {
    return null
  }
}

/** keep the host alive while a page is open (it exits a while after the last heartbeat); `onLost` once it stops
 * answering (it exited: relaunching the arena starts it again) */
export function startHeartbeat(onLost?: () => void): void {
  let lost = false
  const beat = () => {
    api.heartbeat().then(() => { lost = false }).catch((e: Partial<ApiError>) => {
      // a network failure (no status), not an error answer: the host is gone
      if (!lost && !e?.status) { lost = true; onLost?.() }
    })
  }
  setInterval(beat, 5000)
  // a background tab's timers are throttled: beat as soon as it is shown again
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') beat() })
  beat()
}
