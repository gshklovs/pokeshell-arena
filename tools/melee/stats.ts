// Melee stats (docs/MELEE.md section 1): how much of the card pool is melee, and how melee plays in bot-vs-bot 1v1s.
//   npx vite-node tools/melee/stats.ts --pool                      the pool: melee archetypes, resolved shape kinds
//   npx vite-node tools/melee/stats.ts [--per 4] [--tier basic] [--level normal] [--shard i/n --json out.json]
//   npx vite-node tools/melee/stats.ts --merge a.json b.json ...   (node tools/melee/run.mjs shards it)
// A match is the tournament's (tools/kits/tournament.ts playMatch: same-tier foe, a random arena, M2 bots on both
// sides), instrumented: every release is classed melee (a `melee` shape), dash (a `dash` shape) or ranged (the rest),
// and every attack-damage event is credited to the release that caused it (a melee swing while it lives: its strikes,
// a hold and its gnaw or throw; before src/sim/melee.ts a swing resolved on its release tick; a dash while its fighter
// dashes, the rest to ranged). A fighter kept flinched STUNLOCK_TICKS in a row is a stunlock (must stay 0). Reports casts, the share that connect, damage share and
// the win rate of melee-first kits against ranged-first ones. Deterministic: the same flags give the same numbers.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { BotDriver, DIFFICULTY, createBot, type DifficultyName } from '../../src/bots/index'
import { parseArena } from '../../src/sim/arena'
import { parseAttackText } from '../../src/sim/cardtext'
import { resolveKit } from '../../src/sim/kit'
import { archetypeFor } from '../../src/sim/lexicon'
import { randInt, seedRng } from '../../src/sim/rng'
import * as R from '../../src/sim/rules'
import { createState } from '../../src/sim/state'
import { step } from '../../src/sim/step'
import type { ArenaDef, ArenaFile, FighterKit, Kit, MatchDef } from '../../src/sim/types'
import { loadCards, type Card } from '../kits/cards'

const ROOT = resolve(__dirname, '../..')
const args = process.argv.slice(2)
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)

/** the lexicon archetypes that put you in contact range (melee swings, body dashes, close smashes) */
export const MELEE_ARCH = new Set(['jab', 'peck', 'scratch', 'slash', 'blade', 'bite', 'punch', 'uppercut', 'kick', 'chop', 'tail', 'spin', 'flail', 'horn', 'whip', 'grab', 'throw', 'combo', 'counter', 'slam', 'strike', 'hammer', 'stomp', 'tackle', 'quick', 'charge', 'roll', 'leap', 'blink', 'wing', 'jet', 'rage', 'flamecharge'])

function kitFiles(): Map<string, Kit> {
  const m = new Map<string, Kit>()
  const dir = join(ROOT, 'data/kits')
  for (const f of readdirSync(dir)) if (f.endsWith('.json')) { const k = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Kit; m.set(k.card, k) }
  return m
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
function tierOf(k: FighterKit): string {
  const s = new Set(k.subtypes)
  if (s.has('VMAX') || s.has('TAG TEAM')) return 'vmax'
  if (s.has('VSTAR')) return 'vstar'
  if (k.subtypes.some((x) => ['V', 'GX', 'EX', 'ex', 'V-UNION', 'Radiant'].includes(x))) return 'rule'
  if (s.has('Stage 2')) return 'stage2'
  if (s.has('Stage 1')) return 'stage1'
  return (k.printedHp ?? k.hp) > 90 ? 'basic+' : 'basic'
}
type Cls = 'melee' | 'dash' | 'ranged'
const clsOf = (kind: string): Cls => (kind === 'melee' ? 'melee' : kind === 'dash' ? 'dash' : 'ranged')
/** a kit's main attack (its biggest damage) decides whether it is melee-first */
function primary(k: FighterKit): Cls {
  let best = -1, c: Cls = 'ranged'
  for (const a of k.attacks) if (a.baseDamage > best) { best = a.baseDamage; c = clsOf(a.shape.kind) }
  return c
}

// ------------------------------------------------------------------ the pool
function pool(): void {
  const cards = loadCards()
  const kits = kitFiles()
  const byArch = new Map<string, number>()
  let total = 0, melee = 0
  const kinds = new Map<string, number>()
  for (const c of cards) {
    let fk: FighterKit | null = null
    try { fk = resolveKit(c, kits.get(c.id) ?? null) } catch { /* no HP */ }
    for (const [i, a] of (c.attacks ?? []).entries()) {
      total++
      const d = parseInt(/\d+/.exec(a.damage ?? '')?.[0] ?? '0', 10)
      const arch = archetypeFor(a.name, parseAttackText(a.text, c.name), d)?.id ?? '-'
      byArch.set(arch, (byArch.get(arch) ?? 0) + 1)
      if (MELEE_ARCH.has(arch)) melee++
      const k = fk?.attacks[i]?.shape.kind ?? '?'
      kinds.set(k, (kinds.get(k) ?? 0) + 1)
    }
  }
  console.log(`${total} attacks; ${melee} (${((100 * melee) / total).toFixed(0)}%) resolve to a melee-ish archetype`)
  console.log([...byArch].filter(([a]) => MELEE_ARCH.has(a)).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join(', '))
  console.log('resolved shape kinds:', [...kinds].sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join(', '))
}

// ------------------------------------------------------------------ matches
interface Tally { casts: number; hits: number; dmg: number }
export interface Rows {
  matches: number
  /** per class: releases, releases that dealt damage, damage */
  cls: Record<Cls, Tally>
  /** per archetype (melee-ish only) */
  arch: Record<string, Tally>
  /** melee-first vs ranged-first (both sides differ): [melee-first wins, games] */
  mvr: [number, number]
  /** per primary class: [wins, games] */
  prim: Record<Cls, [number, number]>
  ticks: number[]
  /** fighters kept flinched STUNLOCK_TICKS ticks in a row */
  stunlocks?: number
  /** the longest flinch streak seen, ticks */
  longest?: number
}
const mel = await import('../../src/sim/melee').catch(() => null)
{
  // the landing levers (src/sim/melee.ts LANDING), overridable to measure each: --track 0|1 --pad px,arc --magnet n
  const o = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : null)
  if (mel) {
    if (o('--track') !== null) mel.LANDING.track = o('--track') === '1'
    if (o('--pad') !== null) { const [a, b] = o('--pad')!.split(',').map(Number); mel.LANDING.padPx = a; mel.LANDING.padArc = b }
    if (o('--magnet') !== null) mel.LANDING.magnet = Number(o('--magnet'))
  }
}
const STUN = mel?.STUNLOCK_TICKS ?? 60
const empty = (): Rows => ({ stunlocks: 0, longest: 0, matches: 0, cls: { melee: { casts: 0, hits: 0, dmg: 0 }, dash: { casts: 0, hits: 0, dmg: 0 }, ranged: { casts: 0, hits: 0, dmg: 0 } }, arch: {}, mvr: [0, 0], prim: { melee: [0, 0], dash: [0, 0], ranged: [0, 0] }, ticks: [] })

function play(rows: Rows, a: FighterKit, b: FighterKit, archOf: Map<string, string>, arena: ArenaDef, seed: number, level: DifficultyName): void {
  const def: MatchDef = { mode: '1v1', seed, arena, kits: [a, b], matchTicks: 90 * 60, players: [
    { team: 0, name: 'A', members: [0], energy: ['Colorless'] }, { team: 1, name: 'B', members: [1], energy: ['Colorless'] }] }
  const s = createState(def)
  const d0 = new BotDriver(createBot(level), def, 0, DIFFICULTY[level], seed * 7 + 1)
  const d1 = new BotDriver(createBot(level), def, 1, DIFFICULTY[level], seed * 7 + 2)
  const kits = [a, b]
  // the open release per side: its class, archetype, and whether it dealt damage yet
  const open: ({ cls: Cls; arch: string; hit: boolean; until: number } | null)[] = [null, null]
  const streak = [0, 0]
  for (let t = 0; t < 90 * 60 + R.COUNTDOWN_TICKS + 10 && s.phase !== 'over'; t++) {
    const releasing = s.players.map((pl) => (pl.active >= 0 && pl.fighter.cast && pl.fighter.cast.t === 1 ? pl.fighter.cast.attack : -1))
    step(def, s, [d0.input(s), d1.input(s)])
    for (let p = 0; p < 2; p++) {
      if (releasing[p] < 0 || s.players[p].active < 0) continue
      const atk = kits[p].attacks[releasing[p]]
      if (!atk) continue
      const cls = clsOf(atk.shape.kind)
      const arch = archOf.get(`${kits[p].card}|${releasing[p]}`) ?? '-'
      rows.cls[cls].casts++
      if (cls !== 'ranged' && MELEE_ARCH.has(arch)) { rows.arch[arch] ??= { casts: 0, hits: 0, dmg: 0 }; rows.arch[arch].casts++ }
      // a live swing (melee.ts) lives `dur` ticks: its strikes, a hold, a gnaw or a throw
      const sw = (s.swings as { id: number; owner: number; dur?: number }[]).filter((w) => w.owner === p).sort((x, y) => y.id - x.id)[0]
      open[p] = { cls, arch, hit: false, until: cls === 'melee' ? s.tick + (sw?.dur ?? 0) : cls === 'dash' ? s.tick + 60 : s.tick + 120 }
    }
    for (let p = 0; p < 2; p++) {
      const fl = s.players[p].active >= 0 ? ((s.players[p].fighter as { flinch?: number }).flinch ?? 0) : 0
      streak[p] = fl > 0 ? streak[p] + 1 : 0
      if (streak[p] === STUN) rows.stunlocks = (rows.stunlocks ?? 0) + 1
      rows.longest = Math.max(rows.longest ?? 0, streak[p])
    }
    for (const e of s.events) {
      if (e.k !== 'dmg' || e.src === undefined || e.src < 0 || e.src === e.p) continue
      const o = open[e.src]
      const f = s.players[e.src].fighter
      const cls: Cls = o && o.cls === 'melee' && s.tick <= o.until ? 'melee' : f.dash ? 'dash' : o && o.cls === 'dash' && s.tick <= o.until ? 'dash' : 'ranged'
      rows.cls[cls].dmg += e.amount
      if (o && o.cls === cls && !o.hit) { o.hit = true; rows.cls[cls].hits++; if (cls !== 'ranged' && rows.arch[o.arch]) rows.arch[o.arch].hits++ }
      if (o && o.cls === cls && cls !== 'ranged' && rows.arch[o.arch]) rows.arch[o.arch].dmg += e.amount
    }
  }
  rows.matches++
  rows.ticks.push(s.fightT || s.phaseT)
  const pa = primary(a), pb = primary(b)
  for (const [side, pc] of [[0, pa], [1, pb]] as const) { rows.prim[pc][1]++; if (s.winner === side) rows.prim[pc][0]++ }
  const ma = pa !== 'ranged', mb = pb !== 'ranged'
  if (ma !== mb) { rows.mvr[1]++; if (s.winner === (ma ? 0 : 1)) rows.mvr[0]++ }
}

function merge(parts: Rows[]): Rows {
  const r = empty()
  for (const p of parts) {
    r.matches += p.matches; r.ticks.push(...p.ticks)
    for (const c of ['melee', 'dash', 'ranged'] as Cls[]) { for (const k of ['casts', 'hits', 'dmg'] as const) r.cls[c][k] += p.cls[c][k]; r.prim[c][0] += p.prim[c][0]; r.prim[c][1] += p.prim[c][1] }
    for (const [a, t] of Object.entries(p.arch)) { r.arch[a] ??= { casts: 0, hits: 0, dmg: 0 }; r.arch[a].casts += t.casts; r.arch[a].hits += t.hits; r.arch[a].dmg += t.dmg }
    r.mvr[0] += p.mvr[0]; r.mvr[1] += p.mvr[1]
    r.stunlocks = (r.stunlocks ?? 0) + (p.stunlocks ?? 0); r.longest = Math.max(r.longest ?? 0, p.longest ?? 0)
  }
  return r
}

function report(r: Rows): string {
  const pc = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(0)}%`
  const dmgAll = r.cls.melee.dmg + r.cls.dash.dmg + r.cls.ranged.dmg
  const t = [...r.ticks].sort((a, b) => a - b)
  const out = [`${r.matches} matches; fight p50 ${(t[Math.floor(t.length / 2)] / 60).toFixed(1)} s; timeouts ${t.filter((x) => x >= 90 * 60 - 1).length}; stunlocks ${r.stunlocks ?? 0} (longest flinch streak ${r.longest ?? 0} ticks)`, '',
    '| class | releases | connect | damage share | dmg per release |', '|---|---:|---:|---:|---:|']
  for (const c of ['melee', 'dash', 'ranged'] as Cls[]) out.push(`| ${c} | ${r.cls[c].casts} | ${pc(r.cls[c].hits, r.cls[c].casts)} | ${pc(r.cls[c].dmg, dmgAll)} | ${(r.cls[c].dmg / Math.max(1, r.cls[c].casts)).toFixed(1)} |`)
  out.push('', '| primary attack | win rate | games |', '|---|---:|---:|')
  for (const c of ['melee', 'dash', 'ranged'] as Cls[]) out.push(`| ${c} | ${pc(r.prim[c][0], r.prim[c][1])} | ${r.prim[c][1]} |`)
  out.push('', `melee/dash-first vs ranged-first: ${pc(r.mvr[0], r.mvr[1])} of ${r.mvr[1]}`, '', '| archetype | releases | connect | dmg per release |', '|---|---:|---:|---:|')
  for (const [a, x] of Object.entries(r.arch).sort((a, b) => b[1].casts - a[1].casts)) out.push(`| ${a} | ${x.casts} | ${pc(x.hits, x.casts)} | ${(x.dmg / Math.max(1, x.casts)).toFixed(1)} |`)
  return out.join('\n')
}

// ------------------------------------------------------------------ the most-fielded melee attacks
/** the melee-ish attacks the bot roster and the collection fixture field most, with a card that fields each */
function fielded(top: number): void {
  const roster: Card[] = JSON.parse(readFileSync(join(ROOT, 'data/bots/roster.json'), 'utf8')).cards
  const fixture: Card[] = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/collection.json'), 'utf8')).cards.flatMap((c: { data?: Card }) => (c.data ? [c.data] : []))
  const kits = kitFiles()
  const byId = new Map(loadCards().map((c) => [c.id, c]))
  const count = new Map<string, { n: number; ex: string; arch: string; kind: string; dmg: string; cost: number; type: string }>()
  for (const c of [...roster, ...fixture]) {
    const card = byId.get(c.id) ?? c
    let fk: FighterKit | null = null
    try { fk = resolveKit(card, kits.get(card.id) ?? null) } catch { continue }
    for (const [i, a] of (card.attacks ?? []).entries()) {
      const d = parseInt(/\d+/.exec(a.damage ?? '')?.[0] ?? '0', 10)
      const arch = archetypeFor(a.name, parseAttackText(a.text, card.name), d)?.id ?? '-'
      const kind = fk.attacks[i]?.shape.kind ?? '?'
      if (!MELEE_ARCH.has(arch) && kind !== 'melee' && kind !== 'dash') continue
      const o = count.get(a.name) ?? { n: 0, ex: card.id, arch, kind, dmg: a.damage ?? '', cost: (a.cost ?? []).length, type: fk.attacks[i]?.element ?? '?' }
      o.n++
      count.set(a.name, o)
    }
  }
  console.log('| attack | fielded | e.g. | type | cost | dmg | archetype | resolved kind |\n|---|---:|---|---|---:|---|---|---|')
  for (const [name, o] of [...count].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0])).slice(0, top)) console.log(`| ${name} | ${o.n} | ${o.ex} | ${o.type} | ${o.cost} | ${o.dmg} | ${o.arch} | ${o.kind} |`)
}

if (args.includes('--pool')) pool()
else if (args.includes('--fielded')) fielded(parseInt(opt('--fielded', '30'), 10))
else if (args.includes('--merge')) {
  const files = args.slice(args.indexOf('--merge') + 1).filter((a) => a.endsWith('.json'))
  console.log(report(merge(files.map((f) => JSON.parse(readFileSync(f, 'utf8')) as Rows))))
} else {
  const per = parseInt(opt('--per', '4'), 10)
  const level = opt('--level', 'normal') as DifficultyName
  const want = opt('--tier', 'basic,basic+,stage1').split(',')
  const [shard, shards] = opt('--shard', '0/1').split('/').map((x) => parseInt(x, 10))
  const cards: Card[] = loadCards()
  const kits = kitFiles()
  const fighters: FighterKit[] = []
  const archOf = new Map<string, string>()
  for (const c of cards) {
    try {
      const fk = resolveKit(c, kits.get(c.id) ?? null)
      if (!want.includes(tierOf(fk))) continue
      fighters.push(fk)
      fk.attacks.forEach((a, i) => { const ca = c.attacks?.find((x) => x.name === a.name) ?? c.attacks?.[i]; archOf.set(`${c.id}|${i}`, archetypeFor(a.name, parseAttackText(ca?.text, c.name), a.baseDamage)?.id ?? '-') })
    } catch { /* no HP */ }
  }
  const al = arenas()
  const rows = empty()
  fighters.forEach((f, fi) => {
    if (fi % shards !== shard) return
    const h = { rng: seedRng(7919 + fi) }
    const peers = fighters.filter((x) => x.card !== f.card && tierOf(x) === tierOf(f))
    for (let i = 0; i < per && peers.length; i++) {
      const foe = peers[randInt(h, peers.length)]
      const arena = al[randInt(h, al.length)]
      const ms = 100003 + fi * 97 + i
      if (i % 2) play(rows, foe, f, archOf, arena, ms, level)
      else play(rows, f, foe, archOf, arena, ms, level)
    }
  })
  if (args.includes('--json')) writeFileSync(opt('--json', 'melee.json'), JSON.stringify(rows))
  else console.log(report(rows))
}
