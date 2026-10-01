// Saved loadouts: teams.json in the arena state, through the host (docs/SPEC.md sections 9, 10). Without a host they
// live in this browser's localStorage, so practice mode keeps them too.
import { ENERGY_TYPES, type EnergyType } from '../sim/types'
import { api } from './api'

export interface TeamMember { card: string; shiny?: boolean }
/** `energy` is legacy (v1's three typed meters): kept in older files, no longer written */
export interface SavedTeam { id: string; name: string; mode: '1v1' | 'team'; members: TeamMember[]; energy?: EnergyType[] }
export interface TeamsFile { version: 1; selected: string | null; teams: SavedTeam[] }

export const TEAM_MIN = 3
export const TEAM_MAX = 6
const LOCAL = 'pokearena.teams'

export function emptyTeams(): TeamsFile {
  return { version: 1, selected: null, teams: [] }
}

const ID = /^[A-Za-z0-9._-]{1,40}$/

/** the problems the host would refuse (docs/SPEC.md section 10), so the page can say them before saving */
export function teamProblems(t: SavedTeam): string[] {
  const e: string[] = []
  if (!ID.test(t.id)) e.push('id: letters, digits, - _ .')
  if (t.mode !== '1v1' && t.mode !== 'team') e.push('mode: 1v1 or team')
  const n = t.members.length
  if (t.mode === 'team' && (n < TEAM_MIN || n > TEAM_MAX)) e.push(`a team has ${TEAM_MIN} to ${TEAM_MAX} Pokémon`)
  if (t.mode === '1v1' && n !== 1) e.push('a 1v1 loadout has one Pokémon')
  for (const m of t.members) if (!ID.test(m.card)) e.push(`${m.card}: not a card id`)
  if (t.energy && (t.energy.length !== 3 || !t.energy.every((x) => (ENERGY_TYPES as string[]).includes(x)))) e.push('energy: three types')
  return e
}

/** a fresh id for a new team (host ids are letters, digits, - _ .) */
export function newTeamId(f: TeamsFile): string {
  for (let i = f.teams.length + 1; ; i++) { const id = `team-${i}`; if (!f.teams.some((t) => t.id === id)) return id }
}

function sane(j: unknown): TeamsFile {
  const f = j as Partial<TeamsFile> | null
  if (!f || f.version !== 1 || !Array.isArray(f.teams)) return emptyTeams()
  const teams = f.teams.filter((t) => t && typeof t.id === 'string' && Array.isArray(t.members))
  const selected = typeof f.selected === 'string' && teams.some((t) => t.id === f.selected) ? f.selected : null
  return { version: 1, selected, teams: teams.map((t) => ({ ...t, name: t.name || t.id })) }
}

function localGet(): TeamsFile {
  try { return sane(JSON.parse(localStorage.getItem(LOCAL) ?? 'null')) } catch { return emptyTeams() }
}

function localPut(f: TeamsFile): void {
  try { localStorage.setItem(LOCAL, JSON.stringify(f)) } catch { /* private window: not kept */ }
}

export async function loadTeams(host: boolean): Promise<TeamsFile> {
  if (!host) return localGet()
  try { return sane(await api.teams()) } catch { return localGet() }
}

/** save the file; with a host, a refusal comes back as the host's problems */
export async function saveTeams(f: TeamsFile, host: boolean): Promise<{ ok: boolean; message?: string }> {
  localPut(f)
  if (!host) return { ok: true }
  try {
    await api.saveTeams(f)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as { message?: string }).message ?? 'could not save' }
  }
}
