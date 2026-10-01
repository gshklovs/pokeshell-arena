// The balance harness: a headless bot-vs-bot tournament over many seeded 1v1 matches (docs/KITS.md "Balance").
//   npx vite-node tools/kits/tournament.ts [--per 8] [--mixed] [--cards <regex>] [--tier basic] [--hand]
//                                          [--level normal] [--json out.json]     (node tools/kits/run.mjs shards it)
// Every card with attacks gets a fighter (its hand kit if there is one, else its auto-kit) and plays `per` matches.
//   default:  against opponents of its own tier (Basics fight Basics, VMAX fight VMAX): win rates inside a tier say
//             which kits are broken, since raw HP stands and cross-tier results mostly measure HP;
//   --mixed:  against anyone, which checks the tiers still order (a VMAX should beat a Basic).
// Both sides are the M2 bots (createBot) at one level, on the one energy meter. It reports time to KO (p10/p50/p90),
// win rates, the top and bottom kits with the features that explain them (HP, retreat, damage per pip, reach,
// shapes), and degenerate loops: stunlock (the foe unable to act for a large share of the fight), infinite heal
// (healing more than its max HP), timeouts. Deterministic: the same flags give the same report.
// Calibration flags (never change the game): --fill F (a meter of one pip per F ticks), --start N (pips at the
// start), --cd base,perPip,per10dmg (another default-cooldown formula), --rc N (every attack's recovery).
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { reach } from '../../src/bots/brain'
import { BotDriver, DIFFICULTY, createBot, type DifficultyName } from '../../src/bots/index'
import { parseArena } from '../../src/sim/arena'
import { costPips } from '../../src/sim/energy'
import { resolveKit } from '../../src/sim/kit'
import { randInt, seedRng } from '../../src/sim/rng'
import * as R from '../../src/sim/rules'
import { createState } from '../../src/sim/state'
import { step } from '../../src/sim/step'
import type { ArenaDef, ArenaFile, FighterKit, Kit, MatchDef } from '../../src/sim/types'
import { loadCards, type Card } from './cards'

const ROOT = resolve(__dirname, '../..')
const args = process.argv.slice(2)
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const PER = parseInt(opt('--per', '8'), 10)
const FILTER = args.includes('--cards') ? new RegExp(opt('--cards', '.'), 'i') : null
const MAX_TICKS = parseInt(opt('--ticks', String(90 * 60)), 10)
/** both sides play at this M2 bot level (createBot) */
const LEVEL = opt('--level', 'normal') as DifficultyName
const MIXED = args.includes('--mixed')
const FILL = parseInt(opt('--fill', '0'), 10)
const START = args.includes('--start') ? parseInt(opt('--start', '3'), 10) : -1

// ------------------------------------------------------------------ fighters
function kitFiles(): Map<string, Kit> {
  const m = new Map<string, Kit>()
  const dir = join(ROOT, 'data/kits')
  for (const f of readdirSync(dir)) if (f.endsWith('.json')) { const k = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Kit; m.set(k.card, k) }
  return m
}

/** peer groups: by prize value and stage, with Basics split by printed HP (a 130-HP legendary Basic and a 50-HP
 * common are different weight classes) */
export type Tier = 'basic' | 'basic+' | 'stage1' | 'stage2' | 'rule' | 'vstar' | 'vmax'
export const TIERS: Tier[] = ['basic', 'basic+', 'stage1', 'stage2', 'rule', 'vstar', 'vmax']
export function tierOf(k: FighterKit): Tier {
  const s = new Set(k.subtypes)
  if (s.has('VMAX') || s.has('TAG TEAM')) return 'vmax'
  if (s.has('VSTAR')) return 'vstar'
  if (k.subtypes.some((x) => ['V', 'GX', 'EX', 'ex', 'V-UNION', 'Radiant'].includes(x))) return 'rule'
  if (s.has('Stage 2')) return 'stage2'
  if (s.has('Stage 1')) return 'stage1'
  return (k.printedHp ?? k.hp) > 90 ? 'basic+' : 'basic'
}

/** the features that explain a kit's results */
export function features(k: FighterKit): { hp: number; retreat: number; dpp: number; best: number; reach: number; shapes: string; type: string } {
  let dpp = 0, best = 0, far = 0
  for (const a of k.attacks) {
    const pips = Math.max(1, costPips(a.cost))
    dpp = Math.max(dpp, Math.round(a.baseDamage / pips))
    best = Math.max(best, a.baseDamage)
    far = Math.max(far, reach(a.shape))
  }
  return { hp: k.hp, retreat: k.retreat, dpp, best, reach: far, shapes: k.attacks.map((a) => a.shape.kind).join('+'), type: k.types[0] ?? 'Colorless' }
}

function arenas(): ArenaDef[] {
  const ids: string[] = JSON.parse(readFileSync(join(ROOT, 'public/arenas/index.json'), 'utf8')).arenas
  return ids.map((id) => {
    const f = JSON.parse(readFileSync(join(ROOT, 'public/arenas', id, 'arena.json'), 'utf8')) as ArenaFile
    const pj = join(ROOT, 'public/arenas', id, 'props.json')
    if (existsSync(pj)) f.propFrames = JSON.parse(readFileSync(pj, 'utf8')).frames
    return parseArena(f)
  })
}

// ------------------------------------------------------------------ one match
export interface MatchStats {
  winner: number
  ticks: number
  timeout: boolean
  dealt: [number, number]
  healed: [number, number]
  stunned: [number, number]
}

export function playMatch(a: FighterKit, b: FighterKit, arena: ArenaDef, seed: number, maxTicks = MAX_TICKS): MatchStats {
  const def: MatchDef = {
    mode: '1v1', seed, arena, kits: [a, b], matchTicks: maxTicks,
    players: [
      { team: 0, name: 'A', members: [0], energy: ['Colorless'] },
      { team: 1, name: 'B', members: [1], energy: ['Colorless'] },
    ],
  }
  const s = createState(def)
  if (START >= 0) for (const pl of s.players) pl.pips[0] = START
  const d0 = new BotDriver(createBot(LEVEL), def, 0, DIFFICULTY[LEVEL], seed * 7 + 1)
  const d1 = new BotDriver(createBot(LEVEL), def, 1, DIFFICULTY[LEVEL], seed * 7 + 2)
  const st: MatchStats = { winner: 2, ticks: 0, timeout: false, dealt: [0, 0], healed: [0, 0], stunned: [0, 0] }
  const acc = [0, 0]
  for (let t = 0; t < maxTicks + R.COUNTDOWN_TICKS + 10 && s.phase !== 'over'; t++) {
    // --fill F: emulate a meter that fills one pip per F ticks: hold back the sim's own fill
    if (FILL > R.ENERGY_FILL && s.phase === 'fight') {
      for (let p = 0; p < 2; p++) {
        acc[p] += R.ENERGY_FILL
        if (acc[p] >= FILL) acc[p] -= FILL
        else if (s.players[p].pips[0] < R.ENERGY_CAP) s.players[p].fill[0]--
      }
    }
    step(def, s, [d0.input(s), d1.input(s)])
    for (const e of s.events) {
      // attack damage (it has a source); burn, poison, counters and terrain don't count toward dmg/s
      if (e.k === 'dmg' && e.src !== undefined && e.src >= 0 && e.src !== e.p) st.dealt[e.src] += e.amount
      else if (e.k === 'heal') st.healed[e.p] += e.amount
    }
    if (s.phase === 'fight') for (let p = 0; p < 2; p++) { const f = s.players[p].fighter; if (f.status.paralyzed > 0 || f.status.asleep > 0) st.stunned[p]++ }
  }
  st.winner = s.winner
  st.ticks = s.fightT || s.phaseT
  st.timeout = st.ticks >= maxTicks
  return st
}

// ------------------------------------------------------------------ the tournament
export interface KitRow {
  card: string
  name: string
  tier: Tier
  source: 'kit' | 'auto'
  hp: number
  retreat: number
  dpp: number
  best: number
  reach: number
  shapes: string
  type: string
  games: number
  wins: number
  draws: number
  /** fight length of every match it played that ended in a KO (either side) */
  koTicks: number[]
  timeouts: number
  /** sums over games (the report divides by games) */
  stunSum: number
  healSum: number
  dpsSum: number
  /** wins against each foe tier: {tier: [wins, games]} */
  vs: Record<string, [number, number]>
  /** wins by how the foe takes this kit's type: {weak | resist | neutral: [wins, games]} (the type chart's share) */
  chart?: Record<string, [number, number]>
}

/** the matches for fighters [shard::shards] (each fighter's `per` matches); rows for both sides of every match */
export function tournament(fighters: FighterKit[], per: number, seed = 1, shard = 0, shards = 1, mixed = false): KitRow[] {
  const arenaList = arenas()
  const byTier = new Map<Tier, FighterKit[]>()
  for (const f of fighters) { const t = tierOf(f); byTier.set(t, [...(byTier.get(t) ?? []), f]) }
  const rows = new Map<string, KitRow>()
  const row = (k: FighterKit) => {
    let r = rows.get(k.card)
    if (!r) {
      r = { card: k.card, name: k.name, tier: tierOf(k), source: k.source, ...features(k), games: 0, wins: 0, draws: 0, koTicks: [], timeouts: 0, stunSum: 0, healSum: 0, dpsSum: 0, vs: {} }
      rows.set(k.card, r)
    }
    return r
  }
  fighters.forEach((f, fi) => {
    if (fi % shards !== shard) return
    // each fighter's own PRNG stream: shards give the same matches as one run
    const h = { rng: seedRng(seed * 7919 + fi) }
    const pool = (mixed ? fighters : byTier.get(tierOf(f)) ?? []).filter((x) => x.card !== f.card)
    if (!pool.length) return
    for (let i = 0; i < per; i++) {
      const foe = pool[randInt(h, pool.length)]
      const arena = arenaList[randInt(h, arenaList.length)]
      const ms = seed * 100003 + fi * 97 + i
      const flip = i % 2 === 1
      const st = flip ? playMatch(foe, f, arena, ms) : playMatch(f, foe, arena, ms)
      const me = flip ? 1 : 0
      for (const [k, side, other] of [[f, me, foe], [foe, 1 - me, f]] as const) {
        const r = row(k)
        r.games++
        const won = st.winner === side
        if (won) r.wins++
        else if (st.winner === 2) r.draws++
        if (!st.timeout && st.winner !== 2) r.koTicks.push(st.ticks)
        if (st.timeout) r.timeouts++
        r.stunSum += st.stunned[1 - side] / Math.max(1, st.ticks)
        r.healSum += st.healed[side] / k.hp
        r.dpsSum += (st.dealt[side] * 60) / Math.max(1, st.ticks)
        const t = tierOf(other)
        const v = r.vs[t] ?? [0, 0]
        v[0] += won ? 1 : 0
        v[1]++
        r.vs[t] = v
        const my = k.types[0] ?? 'Colorless'
        const how = other.weaknesses.some((w) => w.type === my) ? 'weak' : other.resistances.some((w) => w.type === my) ? 'resist' : 'neutral'
        const ch = (r.chart ??= {})
        const c = ch[how] ?? [0, 0]
        c[0] += won ? 1 : 0
        c[1]++
        ch[how] = c
      }
    }
  })
  return [...rows.values()]
}

export function mergeRows(parts: KitRow[][]): KitRow[] {
  const m = new Map<string, KitRow>()
  for (const rs of parts) for (const r of rs) {
    const o = m.get(r.card)
    if (!o) { m.set(r.card, { ...r, koTicks: [...r.koTicks], vs: Object.fromEntries(Object.entries(r.vs).map(([k, v]) => [k, [...v] as [number, number]])), chart: Object.fromEntries(Object.entries(r.chart ?? {}).map(([k, v]) => [k, [...v] as [number, number]])) }); continue }
    o.games += r.games; o.wins += r.wins; o.draws += r.draws; o.timeouts += r.timeouts
    o.koTicks.push(...r.koTicks); o.stunSum += r.stunSum; o.healSum += r.healSum; o.dpsSum += r.dpsSum
    for (const [k, v] of Object.entries(r.vs)) { const w = o.vs[k] ?? [0, 0]; w[0] += v[0]; w[1] += v[1]; o.vs[k] = w }
    for (const [k, v] of Object.entries(r.chart ?? {})) { o.chart ??= {}; const w = o.chart[k] ?? [0, 0]; w[0] += v[0]; w[1] += v[1]; o.chart[k] = w }
  }
  return [...m.values()].sort((a, b) => (a.card < b.card ? -1 : 1))
}

function pct(v: number[], q: number): number {
  if (!v.length) return 0
  const s = [...v].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}
const secs = (t: number) => `${(t / 60).toFixed(1)}`

export function fighterPool(cards: Card[], kits: Map<string, Kit>, onlyHand = false): FighterKit[] {
  const out: FighterKit[] = []
  for (const c of cards) {
    const k = kits.get(c.id) ?? null
    if (onlyHand && !k) continue
    try { out.push(resolveKit(c, k)) } catch (e) { console.warn(c.id, String(e)) }
  }
  return out
}

/** the markdown report: per-tier time to KO and win spread, the tier matrix (mixed), top / bottom kits, flags */
export function report(rows: KitRow[], header: string, mixed: boolean, top = 10): string {
  const out: string[] = [header, '']
  const tiers = TIERS.filter((t) => rows.some((r) => r.tier === t))
  out.push('| tier | fighters | time to KO p10 / p50 / p90 (s) | timeouts | win rate p10 / p50 / p90 | stunlock | heal > max HP |')
  out.push('|---|---:|---|---:|---|---:|---:|')
  for (const t of tiers) {
    const rs = rows.filter((r) => r.tier === t)
    // a match's KO time is in both players' rows: count each once per row side (fine for percentiles)
    const ko = rs.flatMap((r) => r.koTicks)
    const wr = rs.map((r) => r.wins / Math.max(1, r.games))
    const to = rs.reduce((n, r) => n + r.timeouts, 0)
    const g = rs.reduce((n, r) => n + r.games, 0)
    out.push(`| ${t} | ${rs.length} | ${secs(pct(ko, 0.1))} / ${secs(pct(ko, 0.5))} / ${secs(pct(ko, 0.9))} | ${((100 * to) / Math.max(1, g)).toFixed(0)}% | ${(100 * pct(wr, 0.1)).toFixed(0)}% / ${(100 * pct(wr, 0.5)).toFixed(0)}% / ${(100 * pct(wr, 0.9)).toFixed(0)}% | ${rs.filter((r) => r.stunSum / r.games > 0.35).length} | ${rs.filter((r) => r.healSum / r.games > 1).length} |`)
  }
  if (mixed) {
    out.push('', 'Win rate of the row tier against the column tier (mixed opponents):', '')
    out.push(`| | ${tiers.join(' | ')} |`)
    out.push(`|---|${tiers.map(() => '---:').join('|')}|`)
    for (const a of tiers) {
      const cells = tiers.map((b) => {
        let w = 0, g = 0
        for (const r of rows) if (r.tier === a && r.vs[b]) { w += r.vs[b][0]; g += r.vs[b][1] }
        return g ? `${((100 * w) / g).toFixed(0)}% (${g})` : '-'
      })
      out.push(`| ${a} | ${cells.join(' | ')} |`)
    }
  }
  const ranked = rows.filter((r) => r.games >= 6).sort((a, b) => b.wins / b.games - a.wins / a.games || b.dpsSum / b.games - a.dpsSum / a.games)
  const line = (r: KitRow) => `| ${r.card} | ${r.name} | ${r.tier} | ${r.source} | ${r.games} | ${((100 * r.wins) / r.games).toFixed(0)}% | ${r.hp} | ${r.retreat} | ${r.best} | ${r.dpp} | ${r.reach} | ${r.shapes} | ${(r.dpsSum / r.games).toFixed(1)} | ${((100 * r.stunSum) / r.games).toFixed(0)}% |`
  const head = ['| card | name | tier | kit | games | win | HP | retreat | best dmg | dmg/pip | reach | shapes | dmg/s | foe stunned |', '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|']
  out.push('', `Top ${top}:`, '', ...head, ...ranked.slice(0, top).map(line))
  out.push('', `Bottom ${top}:`, '', ...head, ...ranked.slice(-top).reverse().map(line))
  const flagged = rows.filter((r) => r.games >= 6 && (r.stunSum / r.games > 0.35 || r.healSum / r.games > 1))
  out.push('', `Degenerate-loop flags (${flagged.length}): the foe stunned > 35% of the fight, or healing > max HP per match.`)
  if (flagged.length) out.push('', ...head, ...flagged.map(line))
  return out.join('\n')
}

// ------------------------------------------------------------------ main
//   --shard i/n   run only fighters i, i+n, ... (several processes in parallel), with --json to save the rows
//   --merge a.json b.json ...   merge saved shards and print the report
{
  const top = parseInt(opt('--top', '10'), 10)
  if (args.includes('--merge')) {
    const files = args.slice(args.indexOf('--merge') + 1).filter((a, i, all) => a.endsWith('.json') && all[i - 1] !== '--out')
    const rows = mergeRows(files.map((f) => JSON.parse(readFileSync(f, 'utf8')) as KitRow[]))
    if (args.includes('--out')) writeFileSync(opt('--out', 'merged.json'), JSON.stringify(rows))
    const games = rows.reduce((n, r) => n + r.games, 0) / 2
    console.log(report(rows, `${rows.length} fighters, ${games} matches (${MIXED ? 'mixed opponents' : 'same tier'}, ${LEVEL} bots)`, MIXED, top))
  } else {
    const cards = loadCards().filter((c) => !FILTER || FILTER.test(c.id) || FILTER.test(c.name))
    let fighters = fighterPool(cards, kitFiles(), args.includes('--hand'))
    if (args.includes('--tier')) { const want = opt('--tier', 'basic').split(','); fighters = fighters.filter((f) => want.includes(tierOf(f))) }
    if (args.includes('--cd')) {
      const [b, pp, pd] = opt('--cd', '20,8,0').split(',').map((x) => parseInt(x, 10))
      fighters = fighters.map((f) => ({ ...f, attacks: f.attacks.map((a) => ({ ...a, cooldown: b + pp * costPips(a.cost) + Math.trunc((pd * a.baseDamage) / 10) })) }))
    }
    if (args.includes('--rc')) {
      const rc = parseInt(opt('--rc', '8'), 10)
      fighters = fighters.map((f) => ({ ...f, attacks: f.attacks.map((a) => ({ ...a, recovery: rc })) }))
    }
    const [shard, shards] = opt('--shard', '0/1').split('/').map((x) => parseInt(x, 10))
    const t0 = Date.now()
    const rows = tournament(fighters, PER, parseInt(opt('--seed', '1'), 10), shard, shards, MIXED)
    const games = rows.reduce((n, r) => n + r.games, 0) / 2
    if (args.includes('--json')) writeFileSync(opt('--json', 'tournament.json'), JSON.stringify(rows))
    console.log(report(rows, `${fighters.length} fighters, ${games} matches (${PER} per fighter, ${MIXED ? 'mixed opponents' : 'same tier'}, ${LEVEL} bots), ${((Date.now() - t0) / 1000).toFixed(0)} s`, MIXED, top))
  }
}
