// Before / after tables for docs/KITS.md from two saved tournaments (run.mjs --save):
//   node tools/kits/compare.mjs before.json after.json
// Peer groups are recomputed the same way for both (Basics split at 90 printed HP), so older runs compare.
import { readFileSync } from 'node:fs'

const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')))
const TIERS = ['basic', 'basic+', 'stage1', 'stage2', 'rule', 'vstar', 'vmax']
// older rows have no 'basic+' and carry the printed HP in `hp`; newer ones carry the tier already
// (rows that carry `type` come from the new tiering too)
const tierOf = (r) => (r.tier === 'basic' && r.hp > 90 && !r.printedSplit && r.type === undefined ? 'basic+' : r.tier)
const pct = (v, q) => { const s = [...v].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0 }
const secs = (t) => (t / 60).toFixed(1)
function stats(rows, t) {
  const rs = rows.filter((r) => tierOf(r) === t)
  const ko = rs.flatMap((r) => r.koTicks)
  const wr = rs.filter((r) => r.games >= 6).map((r) => r.wins / r.games)
  const g = rs.reduce((n, r) => n + r.games, 0)
  const to = rs.reduce((n, r) => n + r.timeouts, 0)
  return { n: rs.length, ko: `${secs(pct(ko, 0.1))} / **${secs(pct(ko, 0.5))}** / ${secs(pct(ko, 0.9))}`, wr: `${(100 * pct(wr, 0.1)).toFixed(0)}% / ${(100 * pct(wr, 0.9)).toFixed(0)}%`, to: `${((100 * to) / Math.max(1, g)).toFixed(0)}%`, broken: rs.filter((r) => r.games >= 8 && (r.wins / r.games >= 0.9 || r.wins / r.games <= 0.1)).length, idle: rs.filter((r) => r.games >= 8 && r.best === 0 && r.wins / r.games <= 0.1).length }
}
// the after rows came from the new tiering: mark them so tierOf keeps their tier
for (const r of b) r.printedSplit = true
console.log('| peer group | kits | time to KO p10 / **p50** / p90 (s), before | after | win rate p10 / p90, before | after | kits at >= 90% or <= 10%, before | after | of them with no damaging attack, before | after |')
console.log('|---|---:|---|---|---|---|---:|---:|---:|---:|')
for (const t of TIERS) {
  const x = stats(a, t), y = stats(b, t)
  if (!x.n && !y.n) continue
  console.log(`| ${t} | ${y.n} | ${x.ko} | ${y.ko} | ${x.wr} | ${y.wr} | ${x.broken} | ${y.broken} | ${x.idle} | ${y.idle} |`)
}
