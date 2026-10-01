// Full elimination, legible (render-side bookkeeping from sim events; never feeds back into the sim): which Pokémon
// each side has had on the field, and how each one went down (who knocked it out, and where). The HUD's team strip
// draws unseen members as silhouettes from `seen`, the KO banner counts from the sim state, and the result screen lists
// every enemy with its outcome (enemyOutcomes).
import { COUNTDOWN_TICKS } from '../sim/rules'
import type { MatchDef, SimEvent, SimState } from '../sim/types'

export interface KoRecord {
  p: number
  member: number
  /** the kit it was when it went down (an evolved card's name) */
  kit: number
  tick: number
  where: 'active' | 'bench'
  /** who knocked it out: the attacker's player and the kit it had on the field; null for damage counters, status, terrain */
  by: { p: number; kit: number } | null
}

export class ElimLog {
  /** seen[p][member]: that member has been on the field this match */
  readonly seen: boolean[][]
  readonly kos: KoRecord[] = []
  /** per player: who dealt the last damage to its active (-1: not an opponent's attack) */
  private lastHit: number[] = []

  constructor(s: SimState) {
    this.seen = s.players.map((pl) => pl.members.map((_, i) => i === pl.active))
  }

  /** one sim tick's events (call after step) */
  feed(s: SimState, events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.k === 'swap') { this.seen[e.p][e.member] = true; this.lastHit[e.p] = -1 }
      // the last damage on a player's active: an opponent's attack, or -1 (status, terrain, counters, recoil)
      else if (e.k === 'dmg') this.lastHit[e.p] = (e.src ?? -1) >= 0 && e.src !== e.p ? e.src! : -1
      else if (e.k === 'ko') {
        const src = e.where === 'active' ? this.lastHit[e.p] ?? -1 : -1
        this.lastHit[e.p] = -1
        const att = src >= 0 ? s.players[src] : null
        const by = att && att.active >= 0 ? { p: src, kit: att.members[att.active].kit } : null
        this.kos.push({ p: e.p, member: e.member, kit: s.players[e.p].members[e.member].kit, tick: s.tick, where: e.where, by })
      }
    }
  }
}

export type Outcome = 'ko' | 'standing' | 'unseen'

export interface EnemyOutcome {
  member: number
  name: string
  outcome: Outcome
  hp: number
  maxHp: number
  /** "KO'd by Pikachu at 1:23", "still standing at 40/120 HP when time ran out", ... */
  text: string
}

function clock(ticks: number): string {
  const secs = Math.floor(ticks / 60)
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

/** every member of player p's side and how it ended: KO'd (by whom, when, where), or still standing (time ran out, or
 * the match was quit / lost first), or never sent in. `fightStart`: the tick the fight began (for the clock) */
export function enemyOutcomes(def: MatchDef, s: SimState, log: ElimLog, p: number, fightStart = COUNTDOWN_TICKS): EnemyOutcome[] {
  const pl = s.players[p]
  const timeUp = s.phase === 'over' && pl.members.some((m) => !m.ko) && s.players.some((o) => o.team !== pl.team && o.members.some((m) => !m.ko))
  const why = timeUp ? 'when time ran out' : 'at the end'
  return pl.members.map((m, i) => {
    const name = def.kits[m.kit]?.name ?? '?'
    const ko = log.kos.find((k) => k.p === p && k.member === i)
    if (m.ko) {
      const at = ko ? ` at ${clock(Math.max(0, ko.tick - fightStart))}` : ''
      const by = ko?.where === 'bench' ? 'on the bench (bench damage)' : ko?.by ? `by ${def.kits[ko.by.kit]?.name ?? '?'}` : 'by damage counters, status or terrain'
      return { member: i, name, outcome: 'ko', hp: 0, maxHp: m.maxHp, text: `KO'd ${by}${at}` }
    }
    if (!log.seen[p]?.[i]) return { member: i, name, outcome: 'unseen', hp: m.hp, maxHp: m.maxHp, text: `never came in (${m.hp}/${m.maxHp} HP ${why})` }
    return { member: i, name, outcome: 'standing', hp: m.hp, maxHp: m.maxHp, text: `still standing at ${m.hp}/${m.maxHp} HP ${why}` }
  })
}
