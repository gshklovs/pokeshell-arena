// The elimination probe (tools only): headless bot-vs-bot TEAM matches (3v3 and 6v6, mixed bot levels, fixed seeds)
// that count every knockout by where it happened, to check that a win means beating every enemy in the arena:
//   active     the Pokémon on the field
//   bench-new  a benched Pokémon that never came in (bench damage KO'd it before it was ever fought)
//   bench-seen a benched Pokémon that had been on the field before
// and per match how many of the loser's Pokémon the winner actually faced on the field.
//   npx vite-node tools/elim/probe.ts [--n 300] [--seed 1] [--from 0] [--to N] [--json out.json]
//   npx vite-node tools/elim/probe.ts --merge shard0.json shard1.json ...   (one report over shards)
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { BOT_LEVELS, BotDriver, DIFFICULTY, createBot, type DifficultyName } from '../../src/bots/index'
import { rollBotTeam, type BotTeam, type RosterCard } from '../../src/game/botteams'
import { parseArena } from '../../src/sim/arena'
import * as R from '../../src/sim/rules'
import { createState } from '../../src/sim/state'
import { step } from '../../src/sim/step'
import type { ArenaDef, ArenaFile, MatchDef } from '../../src/sim/types'

const ROOT = resolve(__dirname, '../..')
const args = process.argv.slice(2)
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const N = parseInt(opt('--n', '300'), 10)
const SEED = parseInt(opt('--seed', '1'), 10)
const FROM = parseInt(opt('--from', '0'), 10)
const TO = parseInt(opt('--to', String(N)), 10)

function arenas(): ArenaDef[] {
  const ids: string[] = JSON.parse(readFileSync(join(ROOT, 'public/arenas/index.json'), 'utf8')).arenas
  return ids.map((id) => {
    const f = JSON.parse(readFileSync(join(ROOT, 'public/arenas', id, 'arena.json'), 'utf8')) as ArenaFile
    const pj = join(ROOT, 'public/arenas', id, 'props.json')
    if (existsSync(pj)) f.propFrames = JSON.parse(readFileSync(pj, 'utf8')).frames
    return parseArena(f)
  })
}

/** a team MatchDef laid out as MatchRunner does (members, evolutions, then each slot's line cards) */
export function teamDef(a: BotTeam, b: BotTeam, arena: ArenaDef, seed: number): MatchDef {
  const kits = [...a.members, ...b.members, ...a.evolutions, ...b.evolutions, ...a.paths.flat(), ...b.paths.flat()].map((e) => e.kit)
  const idx = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i)
  const nA = a.members.length, nB = b.members.length
  let at = nA + nB + a.evolutions.length + b.evolutions.length
  const place = (paths: unknown[][]) => paths.map((p) => p.map(() => at++))
  const pA = place(a.paths), pB = place(b.paths)
  return {
    mode: 'team', seed, arena, kits,
    players: [
      { team: 0, name: 'A', members: idx(0, nA), energy: [], evolutions: idx(nA + nB, a.evolutions.length), paths: pA },
      { team: 1, name: 'B', members: idx(nA, nB), energy: [], evolutions: idx(nA + nB + a.evolutions.length, b.evolutions.length), paths: pB },
    ],
  }
}

export interface ProbeMatch {
  i: number; size: number; levels: [DifficultyName, DifficultyName]
  winner: number; ticks: number; timeout: boolean
  ko: { active: number; benchNew: number; benchSeen: number }
  /** the loser's Pokémon that were ever on the field (what the winner had to face) */
  faced: number
}

export function playTeam(def: MatchDef, levels: [DifficultyName, DifficultyName], seed: number): Omit<ProbeMatch, 'i' | 'size' | 'levels'> {
  const s = createState(def)
  const d = [0, 1].map((p) => new BotDriver(createBot(levels[p]), def, p, DIFFICULTY[levels[p]], seed * 7 + 1 + p))
  const seen = s.players.map((pl) => pl.members.map((_, i) => i === pl.active))
  const ko = { active: 0, benchNew: 0, benchSeen: 0 }
  const max = (def.matchTicks ?? R.MATCH_TICKS) + R.COUNTDOWN_TICKS + 10
  for (let t = 0; t < max && s.phase !== 'over'; t++) {
    // the active before this tick: a KO this tick is "active" when the member was the one on the field
    const before = s.players.map((pl) => pl.active)
    step(def, s, [d[0].input(s), d[1].input(s)])
    // a Pokémon swapped in this tick and KO'd in the same tick was on the field too
    const cameIn = s.players.map(() => new Set<number>())
    for (const e of s.events) {
      if (e.k === 'swap') { seen[e.p][e.member] = true; cameIn[e.p].add(e.member) }
      else if (e.k === 'ko') {
        if (e.member === before[e.p] || cameIn[e.p].has(e.member)) ko.active++
        else if (seen[e.p][e.member]) ko.benchSeen++
        else ko.benchNew++
      }
    }
  }
  const loser = s.winner === 0 ? 1 : s.winner === 1 ? 0 : -1
  const ticks = s.fightT || s.phaseT
  return { winner: s.winner, ticks, timeout: ticks >= (def.matchTicks ?? R.MATCH_TICKS), ko, faced: loser >= 0 ? seen[loser].filter(Boolean).length : -1 }
}

// run as a script (vite-node hides the file from argv: a tool that imports this sets ELIM_PROBE_LIB=1)
const isMain = !process.env.VITEST && !process.env.ELIM_PROBE_LIB
if (isMain && args.includes('--merge')) {
  // --merge a.json b.json ...: one report over shard outputs
  report(args.slice(args.indexOf('--merge') + 1).flatMap((p) => JSON.parse(readFileSync(p, 'utf8')) as ProbeMatch[]).sort((a, b) => a.i - b.i))
} else if (isMain) {
  const roster = (JSON.parse(readFileSync(join(ROOT, 'data/bots/roster.json'), 'utf8')) as { cards: RosterCard[] }).cards
  const arenaList = arenas()
  const out: ProbeMatch[] = []
  const t0 = Date.now()
  for (let i = FROM; i < Math.min(TO, N); i++) {
    const size = i % 2 === 0 ? 3 : 6
    const ms = SEED * 100003 + i
    const levels: [DifficultyName, DifficultyName] = [BOT_LEVELS[i % 4], BOT_LEVELS[Math.floor(i / 4) % 4]]
    const a = rollBotTeam(roster, levels[0], size, ms * 3 + 1)
    const b = rollBotTeam(roster, levels[1], size, ms * 3 + 2)
    const def = teamDef(a, b, arenaList[i % arenaList.length], ms)
    const r = playTeam(def, levels, ms)
    out.push({ i, size, levels, ...r })
    if ((i + 1) % 25 === 0) console.error(`${i + 1}/${N} ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  }
  const json = opt('--json', '')
  if (json) writeFileSync(json, JSON.stringify(out))
  report(out)
}

export function report(out: ProbeMatch[]): void {
  for (const size of [3, 6, 0]) {
    const ms = out.filter((m) => size === 0 || m.size === size)
    if (!ms.length) continue
    const sum = (f: (m: ProbeMatch) => number) => ms.reduce((n, m) => n + f(m), 0)
    const decided = ms.filter((m) => m.winner === 0 || m.winner === 1)
    const elim = decided.filter((m) => !m.timeout)
    const hist = new Map<number, number>()
    for (const m of elim) hist.set(m.faced, (hist.get(m.faced) ?? 0) + 1)
    const withOff = ms.filter((m) => m.ko.benchNew + m.ko.benchSeen > 0).length
    console.log(`\n${size ? `${size}v${size}` : 'all'}: ${ms.length} matches, ${elim.length} eliminations, ${decided.length - elim.length} time wins, ${ms.length - decided.length} draws`)
    console.log(`  KOs  active ${sum((m) => m.ko.active)}  bench (never in) ${sum((m) => m.ko.benchNew)}  bench (had been in) ${sum((m) => m.ko.benchSeen)}`)
    console.log(`  matches with an off-field KO: ${withOff}`)
    console.log(`  eliminations by enemies faced on the field: ${[...hist].sort((x, y) => x[0] - y[0]).map(([k, v]) => `${k}:${v}`).join('  ')}`)
    if (size) console.log(`  eliminations where the winner faced fewer than ${size}: ${elim.filter((m) => m.faced < size).length}`)
  }
}
