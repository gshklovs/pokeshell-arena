// Why a kit over- or under-performs: rank the kits of a saved tournament (run.mjs --save rows.json) and name the
// features furthest from their tier's median (HP, best damage, damage per pip, reach, dmg/s, foe stunned, heal).
//   node tools/kits/diagnose.mjs rows.json [--top 10] [--card <id or name regex>]
import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
let rows = JSON.parse(readFileSync(argv[0], 'utf8'))
// --designs: pool reprints (same name, HP, best damage, shapes: the same kit) so each verdict rests on more games
if (argv.includes('--designs')) {
  const m = new Map()
  for (const r of rows) {
    const k = `${r.name}|${r.hp}|${r.best}|${r.shapes}`
    const o = m.get(k)
    if (!o) { m.set(k, { ...r, koTicks: [...r.koTicks], prints: 1 }); continue }
    o.games += r.games; o.wins += r.wins; o.draws += r.draws; o.timeouts += r.timeouts; o.prints++
    o.koTicks.push(...r.koTicks); o.stunSum += r.stunSum; o.healSum += r.healSum; o.dpsSum += r.dpsSum
    o.card += ` ${r.card}`
  }
  rows = [...m.values()]
}
const minGames = argv.includes('--designs') ? 12 : 6
rows = rows.filter((r) => r.games >= minGames)
if (argv.includes('--summary')) {
  const hi = rows.filter((r) => r.wins / r.games >= 0.85), lo = rows.filter((r) => r.wins / r.games <= 0.15)
  console.log(`${rows.length} ${argv.includes('--designs') ? 'designs' : 'kits'} with >= ${minGames} games: ${hi.length} at >= 85%, ${lo.length} at <= 15% (${lo.filter((r) => r.best === 0).length} of them deal no damage)`)
  process.exit(0)
}
const top = argv.includes('--top') ? parseInt(argv[argv.indexOf('--top') + 1], 10) : 10
const only = argv.includes('--card') ? new RegExp(argv[argv.indexOf('--card') + 1], 'i') : null

const median = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0 }
const FEATS = [
  ['hp', 'HP', (r) => r.hp],
  ['best', 'best damage', (r) => r.best],
  ['dpp', 'damage per pip', (r) => r.dpp],
  ['reach', 'reach', (r) => r.reach],
  ['dps', 'dmg/s landed', (r) => r.dpsSum / r.games],
  ['stun', 'foe stunned', (r) => r.stunSum / r.games],
  ['heal', 'healing', (r) => r.healSum / r.games],
]
const med = {}
for (const t of new Set(rows.map((r) => r.tier))) {
  const rs = rows.filter((r) => r.tier === t)
  med[t] = Object.fromEntries(FEATS.map(([k, , f]) => [k, median(rs.map(f))]))
}
function reason(r, up) {
  const m = med[r.tier]
  const scored = FEATS.map(([k, label, f]) => {
    const v = f(r), base = m[k]
    const rel = base > 0 ? v / base : v > 0 ? 3 : 1
    return { label, v, base, rel }
  }).filter((x) => (up ? x.rel > 1.25 : x.rel < 0.8)).sort((a, b) => (up ? b.rel - a.rel : a.rel - b.rel))
  const shape = r.shapes.includes('area') ? 'lands areas on the aim point (hard to dodge)' : r.shapes.includes('beam') ? 'has instant beams' : ''
  const parts = scored.slice(0, 3).map((x) => `${x.label} ${typeof x.v === 'number' && x.v < 1 && x.v > 0 ? x.v.toFixed(2) : Math.round(x.v * 10) / 10} vs tier ${Math.round(x.base * 100) / 100}`)
  if (up && shape) parts.push(shape)
  if (!up && r.best === 0) parts.push('no damage number: either a support card with no damaging attack, or (before the pass) text-driven damage the bots ignored')
  return parts.join('; ') || 'near the tier median on every feature (matchups / variance)'
}
const ranked = rows.filter((r) => !only || only.test(r.card) || only.test(r.name)).sort((a, b) => b.wins / b.games - a.wins / a.games || b.dpsSum / b.games - a.dpsSum / a.games)
const line = (r, up) => `| ${r.card} | ${r.name} | ${r.tier} | ${r.games} | ${((100 * r.wins) / r.games).toFixed(0)}% | ${reason(r, up)} |`
console.log('| card | name | tier | games | win | why |\n|---|---|---|---:|---:|---|')
if (only) for (const r of ranked) console.log(line(r, r.wins / r.games >= 0.5))
else {
  for (const r of ranked.slice(0, top)) console.log(line(r, true))
  console.log('| | | | | | |')
  for (const r of ranked.slice(-top).reverse()) console.log(line(r, false))
}
