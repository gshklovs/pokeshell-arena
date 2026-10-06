// teams.json validation, as the host does it (host/src/state.rs validate_teams): every problem in the document
import { ENERGY_TYPES } from '../sim/types'

const isId = (s: unknown, max: number) => typeof s === 'string' && s.length > 0 && s.length <= max && /^[A-Za-z0-9._-]+$/.test(s)

export function validTeamsProblems(v: unknown): string[] {
  const e: string[] = []
  const f = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  if (f.version !== 1) e.push('version: must be 1')
  const teams = f.teams
  if (!Array.isArray(teams)) { e.push('teams: must be a list'); return e }
  if (teams.length > 50) e.push('teams: at most 50')
  teams.forEach((tv, i) => {
    const t = (tv && typeof tv === 'object' ? tv : {}) as Record<string, unknown>
    const at = `teams[${i}]`
    if (!isId(t.id, 40)) e.push(`${at}.id: letters, digits, - _ .`)
    if (t.mode !== '1v1' && t.mode !== 'team') e.push(`${at}.mode: "1v1" or "team"`)
    const m = t.members
    if (Array.isArray(m) && m.length > 0 && m.length <= 6) {
      m.forEach((mem, k) => { if (!isId((mem as { card?: unknown } | null)?.card, 40)) e.push(`${at}.members[${k}].card: a card id`) })
    } else e.push(`${at}.members: 1 to 6 cards`)
    // energy is optional since the single meter; older files carry three types, still validated as such
    const en = t.energy
    if (en !== undefined && en !== null && !(Array.isArray(en) && en.length === 3 && en.every((x) => (ENERGY_TYPES as readonly string[]).includes(x as string)))) {
      e.push(`${at}.energy: three energy types, or absent`)
    }
  })
  const sel = f.selected
  if (sel !== undefined && sel !== null && !(typeof sel === 'string' && teams.some((t) => (t as { id?: unknown } | null)?.id === sel))) {
    e.push('selected: must name one of the teams (or be null)')
  }
  return e
}
