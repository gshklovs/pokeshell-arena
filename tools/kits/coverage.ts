// Mechanics coverage: clusters every attack's text into mechanic patterns with the card-text parser and reports how
// much maps to effect ops. `npx vite-node tools/kits/coverage.ts [--leftovers] [--md]`
//   --leftovers  print each unmapped clause with its card (maintainers only: card text, never commit it)
//   --md         print the markdown tables for docs/KITS.md (mechanic ids and counts, no card text)
import { parseAttackText } from '../../src/sim/cardtext'
import { loadCards } from './cards'

const cards = loadCards()
const byMech = new Map<string, { attacks: number; approx: number }>()
let total = 0, withText = 0, full = 0, fullOps = 0, flavorOnly = 0, partial = 0, none = 0, approxAttacks = 0
const leftovers: { id: string; name: string; attack: string; clause: string }[] = []
const leftoverByCard = new Map<string, string[]>()
for (const c of cards) {
  for (const a of c.attacks ?? []) {
    total++
    if (!a.text || !a.text.trim()) continue
    withText++
    const r = parseAttackText(a.text, c.name)
    const mechs = [...new Set(r.mechs)]
    for (const m of mechs) {
      const e = byMech.get(m) ?? { attacks: 0, approx: 0 }
      e.attacks++
      if (r.approx.includes(m)) e.approx++
      byMech.set(m, e)
    }
    const ops = r.onCast.length + r.pre.length + r.post.length + r.onImpact.length + (r.wr !== true || r.pierce ? 1 : 0)
    if (r.approx.length) approxAttacks++
    if (!r.leftovers.length) {
      full++
      if (ops > 0) fullOps++
      else flavorOnly++
    } else if (mechs.length) partial++
    else none++
    for (const l of r.leftovers) {
      leftovers.push({ id: c.id, name: c.name, attack: a.name, clause: l })
      const k = `${c.id} ${a.name}`
      leftoverByCard.set(k, [...(leftoverByCard.get(k) ?? []), l])
    }
  }
}
const pct = (x: number, of: number) => `${((100 * x) / Math.max(1, of)).toFixed(1)}%`
const args = process.argv.slice(2)
if (args.includes('--dump')) {
  // --dump <every> [regex]: every Nth attack with text (or those whose text matches), its text and effects
  const every = parseInt(args[args.indexOf('--dump') + 1] ?? '25', 10) || 25
  const filter = args[args.indexOf('--dump') + 2] ? new RegExp(args[args.indexOf('--dump') + 2], 'i') : null
  let i = 0
  for (const c of cards) for (const a of c.attacks ?? []) {
    if (!a.text) continue
    if (filter ? !filter.test(a.text) && !filter.test(c.name) : i++ % every !== 0) continue
    const r = parseAttackText(a.text, c.name)
    const j = (x: unknown) => JSON.stringify(x)
    console.log(`\n${c.id} ${c.name} / ${a.name} [${(a.cost ?? []).length}] ${a.damage}\n  ${a.text}\n  cast ${j(r.onCast)}\n  pre ${j(r.pre)}  post ${j(r.post)}${r.onImpact.length ? '  impact ' + j(r.onImpact) : ''}  ${r.wr !== true ? 'wr=' + r.wr : ''}${r.pierce ? ' pierce' : ''}${r.perUnit ? ' perUnit' : ''}${r.noDirect ? ' noDirect' : ''}`)
  }
} else if (args.includes('--leftovers')) {
  for (const l of leftovers) console.log(`${l.id}\t${l.name}\t${l.attack}\t${l.clause}`)
} else if (args.includes('--md')) {
  console.log(`| | attacks | share |\n|---|---:|---:|`)
  console.log(`| all attacks on ${cards.length} Pokémon cards | ${total} | 100% |`)
  console.log(`| no text (damage only: maps trivially) | ${total - withText} | ${pct(total - withText, total)} |`)
  console.log(`| with text | ${withText} | ${pct(withText, total)} |`)
  console.log(`| with text, fully mapped | ${full} | ${pct(full, withText)} of text |`)
  console.log(`| of which to effect ops | ${fullOps} | ${pct(fullOps, withText)} of text |`)
  console.log(`| of which flavor only (no arena meaning, on purpose) | ${flavorOnly} | ${pct(flavorOnly, withText)} of text |`)
  console.log(`| with text, partly mapped | ${partial} | ${pct(partial, withText)} of text |`)
  console.log(`| with text, not mapped | ${none} | ${pct(none, withText)} of text |`)
  console.log(`| mapped with an approximation somewhere | ${approxAttacks} | ${pct(approxAttacks, withText)} of text |`)
  console.log(`| **all attacks mapped (incl. no text)** | ${total - withText + full} | **${pct(total - withText + full, total)}** |`)
  console.log('')
  console.log('| mechanic | attacks | approximated |\n|---|---:|---:|')
  for (const [m, e] of [...byMech.entries()].sort((a, b) => b[1].attacks - a[1].attacks)) console.log(`| \`${m}\` | ${e.attacks} | ${e.approx} |`)
  console.log('')
  console.log('Leftovers (card id, attack: what is not translated):')
  for (const [k] of leftoverByCard) console.log(`- ${k}`)
} else {
  console.log(`${cards.length} Pokémon cards, ${total} attacks, ${withText} with text`)
  console.log(`fully mapped: ${full}/${withText} = ${pct(full, withText)} of text (${fullOps} to ops, ${flavorOnly} flavor only); partial ${partial}, none ${none}`)
  console.log(`all attacks mapped (incl. no text): ${pct(total - withText + full, total)}; approximations in ${approxAttacks}`)
  console.log(`leftover clauses: ${leftovers.length}`)
  for (const [m, e] of [...byMech.entries()].sort((a, b) => b[1].attacks - a[1].attacks)) console.log(`  ${m.padEnd(16)} ${String(e.attacks).padStart(4)}  (${e.approx} approx)`)
}
