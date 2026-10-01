// The move lexicon's coverage: every attack in the card data -> its archetype and where it came from (the name's
// keywords, a known whole name, its text, or the bare type default).
//   npx vite-node tools/kits/lexicon.ts [--leftovers] [--sample 30] [--md]
import { parseAttackText } from '../../src/sim/cardtext'
import { ARCHETYPES, archetypeFor } from '../../src/sim/lexicon'
import { parseDamage } from '../../src/sim/kit'
import { loadCards } from './cards'

const args = process.argv.slice(2)
const rows: { id: string; name: string; attack: string; arch: string; source: string; cost: number; dmg: string }[] = []
for (const c of loadCards()) {
  for (const a of c.attacks ?? []) {
    const p = parseAttackText(a.text, c.name)
    const r = archetypeFor(a.name, p, parseDamage(a.damage) || 0)
    rows.push({ id: c.id, name: c.name, attack: a.name, arch: r?.id ?? '(type default)', source: r?.source ?? 'type', cost: (a.cost ?? []).length, dmg: a.damage ?? '' })
  }
}
const n = rows.length
const by = (k: 'arch' | 'source') => { const m = new Map<string, number>(); for (const r of rows) m.set(r[k], (m.get(r[k]) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]) }
const pct = (x: number) => `${((100 * x) / n).toFixed(1)}%`
const bare = rows.filter((r) => r.source === 'type')
if (args.includes('--leftovers')) {
  console.log([...new Set(bare.map((r) => r.attack))].sort().join('\n'))
} else {
  console.log(`${n} attacks; ${Object.keys(ARCHETYPES).length} archetypes; ${n - bare.length} (${pct(n - bare.length)}) get a deliberate behaviour, ${bare.length} (${pct(bare.length)}) the bare type default`)
  console.log('\n| source | attacks | share |\n|---|---:|---:|')
  for (const [k, v] of by('source')) console.log(`| ${k} | ${v} | ${pct(v)} |`)
  console.log('\n| archetype | attacks | what |\n|---|---:|---|')
  for (const [k, v] of by('arch')) console.log(`| \`${k}\` | ${v} | ${ARCHETYPES[k]?.what ?? 'the type\'s own shape'} |`)
  const sample = parseInt(args[args.indexOf('--sample') + 1] ?? '0', 10)
  if (args.includes('--sample')) {
    console.log('\n| card | attack | energy | damage | became | from |\n|---|---|---:|---|---|---|')
    // spread over the data, one per archetype first, then a second of each
    const seen = new Map<string, number>()
    const step = Math.max(1, Math.floor(n / (sample * 3)))
    let shown = 0
    for (let pass = 1; pass <= 2 && shown < sample; pass++) for (let i = pass - 1; i < n && shown < sample; i += step) {
      const r = rows[i]
      if ((seen.get(r.arch) ?? 0) >= pass) continue
      seen.set(r.arch, pass)
      shown++
      console.log(`| ${r.name} | ${r.attack} | ${r.cost} | ${r.dmg || '-'} | \`${r.arch}\` | ${r.source} |`)
    }
  }
}
