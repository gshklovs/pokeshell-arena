// Win rate and time to KO by the Pokémon's type, for one or more saved tournaments (run.mjs --save):
//   node tools/kits/bytype.mjs label=rows.json [label2=rows2.json ...]
// The type comes from the row (newer runs) or from the card data (POKEARENA_CARDS) for older ones.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const cardsPath = process.env.POKEARENA_CARDS ?? resolve(import.meta.dirname, '../../../pokeshell/packs/pokemon/carddata.json')
const cards = existsSync(cardsPath) ? JSON.parse(readFileSync(cardsPath, 'utf8')).cards : {}
const runs = process.argv.slice(2).filter((a) => !a.startsWith('--')).map((a) => { const [label, file] = a.split('='); return { label, rows: JSON.parse(readFileSync(file, 'utf8')) } })
const TYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Fairy', 'Dragon', 'Colorless']
const typeOf = (r) => r.type ?? cards[r.card.split(' ')[0]]?.types?.[0] ?? 'Colorless'
const median = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const head = runs.map((r) => `${r.label}: win / median KO`).join(' | ')
console.log(`| type | kits | ${head} |`)
console.log(`|---|---:|${runs.map(() => '---').join('|')}|`)
for (const t of TYPES) {
  const cells = runs.map(({ rows }) => {
    const rs = rows.filter((r) => typeOf(r) === t)
    const g = rs.reduce((n, r) => n + r.games, 0), w = rs.reduce((n, r) => n + r.wins, 0)
    return g ? `${((100 * w) / g).toFixed(1)}% / ${(median(rs.flatMap((r) => r.koTicks)) / 60).toFixed(1)} s` : '-'
  })
  const n = runs[runs.length - 1].rows.filter((r) => typeOf(r) === t).length
  console.log(`| ${t} | ${n} | ${cells.join(' | ')} |`)
}
// --chart: the last run's win rate by how the foe takes the type (rows from a tournament that records `chart`)
if (process.argv.includes('--chart')) {
  const { rows } = runs[runs.length - 1]
  console.log('\n| type | vs a foe weak to it | neutral | vs a foe that resists it |\n|---|---:|---:|---:|')
  for (const t of TYPES) {
    const acc = { weak: [0, 0], neutral: [0, 0], resist: [0, 0] }
    for (const r of rows) if (typeOf(r) === t) for (const [k, v] of Object.entries(r.chart ?? {})) { acc[k][0] += v[0]; acc[k][1] += v[1] }
    const f = ([w, g]) => (g ? `${((100 * w) / g).toFixed(0)}% (${g})` : '-')
    console.log(`| ${t} | ${f(acc.weak)} | ${f(acc.neutral)} | ${f(acc.resist)} |`)
  }
}
