// Win rate by move archetype (the lexicon's, docs/MOVES.md) for a saved tournament (run.mjs --save rows.json): which
// archetypes win or lose their tier's matches, and how many of their kits sit at the extremes.
//   npx vite-node tools/kits/byarch.ts rows.json [--min 3] [--all]
// Each kit is counted under the archetype of its strongest attack (the one the bots lean on; --all counts every
// attack's archetype). Hand kits are counted too: the lexicon names their attack even when the spec gave the shape.
import { readFileSync } from 'node:fs'
import { parseAttackText } from '../../src/sim/cardtext'
import { archetypeFor } from '../../src/sim/lexicon'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseDamage, resolveKit } from '../../src/sim/kit'
import type { Kit } from '../../src/sim/types'
import { loadCards } from './cards'

const args = process.argv.slice(2)
const rows: { card: string; games: number; wins: number; source: string; tier: string }[] = JSON.parse(readFileSync(args[0], 'utf8'))
const min = args.includes('--min') ? parseInt(args[args.indexOf('--min') + 1], 10) : 3
const all = args.includes('--all')
// --kind: group by the resolved shape of the kit's strongest attack (kind, where it lands, its path) instead
const byKind = args.includes('--kind')
const kits = new Map<string, Kit>()
if (byKind) {
  const dir = resolve(__dirname, '../../data/kits')
  for (const f of readdirSync(dir)) if (f.endsWith('.json')) { const k = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Kit; kits.set(k.card, k) }
}
function kindOf(c: ReturnType<typeof loadCards>[number]): string {
  const fk = resolveKit(c, kits.get(c.id) ?? null)
  const a = [...fk.attacks].sort((x, y) => y.baseDamage - x.baseDamage)[0]
  if (!a || a.baseDamage === 0) return '(no damage)'
  const sh = a.shape
  return `${sh.kind}${sh.at ? '@' + sh.at : ''}${sh.path ? '~' + sh.path : ''}${sh.kind === 'area' && sh.ticks ? ' lingering' : ''}${sh.blast ? ' +blast' : ''}`
}
const cards = new Map(loadCards().map((c) => [c.id, c]))
const acc = new Map<string, { kits: number; games: number; wins: number; hi: number; lo: number; hand: number }>()
for (const r of rows) {
  const c = cards.get(r.card)
  if (!c || r.games < 6) continue
  const attacks = (c.attacks ?? []).map((a) => ({ a, d: parseDamage(a.damage) || 0 }))
  const picked = all ? attacks : [...attacks].sort((x, y) => y.d - x.d).slice(0, 1)
  const ids = byKind ? new Set([kindOf(c)]) : new Set(picked.map(({ a, d }) => archetypeFor(a.name, parseAttackText(a.text, c.name), d)?.id ?? '(type)'))
  const wr = r.wins / r.games
  for (const id of ids) {
    const o = acc.get(id) ?? { kits: 0, games: 0, wins: 0, hi: 0, lo: 0, hand: 0 }
    o.kits++; o.games += r.games; o.wins += r.wins
    if (wr >= 0.85) o.hi++
    if (wr <= 0.15) o.lo++
    if (r.source === 'kit') o.hand++
    acc.set(id, o)
  }
}
console.log(`| archetype | kits (hand) | win | at >= 85% | at <= 15% |\n|---|---:|---:|---:|---:|`)
for (const [id, o] of [...acc.entries()].filter(([, o]) => o.kits >= min).sort((a, b) => b[1].wins / b[1].games - a[1].wins / a[1].games)) {
  console.log(`| \`${id}\` | ${o.kits} (${o.hand}) | ${((100 * o.wins) / o.games).toFixed(0)}% | ${o.hi} | ${o.lo} |`)
}
