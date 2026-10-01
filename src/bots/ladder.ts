// Headless bot-vs-bot matches: run a pairing of two difficulty levels over seeds, arenas and mirrored sides, and
// count who wins. Used by ladder.test.ts (each level must beat the one below it) and handy for tuning.
import { parseArena } from '../sim/arena'
import { defaultEnergy } from '../sim/energy'
import { resolveKit } from '../sim/kit'
import { createState } from '../sim/state'
import { step } from '../sim/step'
import type { ArenaFile, FighterKit, Kit, MatchDef, SimEvent } from '../sim/types'
import { BotDriver, DIFFICULTY, type DifficultyName } from './bot'
import { createBot } from './index'

export interface Pairing { wins: number; losses: number; draws: number; ticks: number; matches: number }

export interface LadderMatch {
  arena: ArenaFile
  /** each side's team (1 kit = a 1v1) */
  a: Kit[]
  b: Kit[]
  /** owned evolution cards each side may evolve into mid-match */
  aEvo?: Kit[]
  bEvo?: Kit[]
  /** per team member: its start line, the kits after the one it enters as (docs/SPEC.md section 6) */
  aPaths?: Kit[][]
  bPaths?: Kit[][]
  seed: number
}

/** one match; `hi` plays side 0 when `hiFirst`, else side 1. Returns the winning level's side result for `hi` */
export function playMatch(m: LadderMatch, hi: DifficultyName, lo: DifficultyName, hiFirst: boolean, maxTicks = 60 * 120, onEvent?: (e: SimEvent) => void): { result: 1 | 0 | -1; ticks: number } {
  const aEvo = m.aEvo ?? [], bEvo = m.bEvo ?? []
  const aP = m.a.map((_, i) => m.aPaths?.[i] ?? []), bP = m.b.map((_, i) => m.bPaths?.[i] ?? [])
  const kits: FighterKit[] = [...m.a, ...m.b, ...aEvo, ...bEvo, ...aP.flat(), ...bP.flat()].map((k) => resolveKit(null, k))
  const na = m.a.length, nb = m.b.length
  let at = na + nb + aEvo.length + bEvo.length
  const paths0 = aP.map((p) => p.map(() => at++)), paths1 = bP.map((p) => p.map(() => at++))
  const team0 = kits.slice(0, na), team1 = kits.slice(na, na + nb)
  const evo0 = aEvo.map((_, i) => na + nb + i), evo1 = bEvo.map((_, i) => na + nb + aEvo.length + i)
  const def: MatchDef = {
    mode: na > 1 ? 'team' : '1v1', seed: m.seed, arena: parseArena(m.arena), kits, matchTicks: maxTicks,
    players: [
      { team: 0, name: 'A', members: team0.map((_, i) => i), energy: defaultEnergy(team0), evolutions: evo0, paths: paths0 },
      { team: 1, name: 'B', members: team1.map((_, i) => na + i), energy: defaultEnergy(team1), evolutions: evo1, paths: paths1 },
    ],
  }
  const s = createState(def)
  s.phase = 'fight'
  s.phaseT = 0
  const lv: DifficultyName[] = hiFirst ? [hi, lo] : [lo, hi]
  const d = lv.map((l, p) => new BotDriver(createBot(l), def, p, DIFFICULTY[l], m.seed * 31 + p * 7 + 1))
  let t = 0
  for (; t < maxTicks + 10 && (s.phase as string) !== 'over'; t++) {
    step(def, s, [d[0].input(s), d[1].input(s)])
    if (onEvent) for (const e of s.events) onEvent(e)
  }
  const hiSide = hiFirst ? 0 : 1
  const result = s.winner === 2 || s.winner < 0 ? 0 : s.winner === hiSide ? 1 : -1
  return { result, ticks: t }
}

/** every match in both seatings (the same kits on each side, sides swapped) */
export function runPairing(matches: LadderMatch[], hi: DifficultyName, lo: DifficultyName, maxTicks?: number): Pairing {
  const out: Pairing = { wins: 0, losses: 0, draws: 0, ticks: 0, matches: 0 }
  for (const m of matches) {
    for (const hiFirst of [true, false]) {
      const r = playMatch(m, hi, lo, hiFirst, maxTicks)
      out.matches++
      out.ticks += r.ticks
      if (r.result > 0) out.wins++
      else if (r.result < 0) out.losses++
      else out.draws++
    }
  }
  return out
}
