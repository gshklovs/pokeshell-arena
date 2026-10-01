// List card designs for kit authoring: cards with the same name and the same attacks (reprints, alt arts) share one
// design. `npx vite-node tools/kits/list.ts [name regex] [--rule]` prints, per design: its card ids, HP, type,
// retreat, and each attack as name [energy] damage {mechanics the parser found} (no card text).
import { parseAttackText } from '../../src/sim/cardtext'
import { loadCards, type Card } from './cards'

const args = process.argv.slice(2)
const re = args.find((a) => !a.startsWith('--'))
const filter = re ? new RegExp(re, 'i') : null
const RULE = ['V', 'VMAX', 'VSTAR', 'GX', 'EX', 'ex', 'Radiant', 'TAG TEAM', 'V-UNION']

export function designKey(c: Card): string {
  return `${c.name}|${c.hp}|${(c.attacks ?? []).map((a) => `${a.name}:${(a.cost ?? []).length}:${a.damage}`).join(';')}`
}

const designs = new Map<string, Card[]>()
for (const c of loadCards()) {
  if (filter && !filter.test(c.name) && !filter.test(c.id)) continue
  if (args.includes('--rule') && !(c.subtypes ?? []).some((s) => RULE.includes(s))) continue
  if (args.includes('--plain') && (c.subtypes ?? []).some((s) => RULE.includes(s))) continue
  const k = designKey(c)
  designs.set(k, [...(designs.get(k) ?? []), c])
}
for (const cs of designs.values()) {
  const c = cs[0]
  console.log(`${c.name} (${cs.map((x) => x.id).join(' ')}) ${c.hp} ${(c.types ?? []).join('/')} [${(c.subtypes ?? []).join(' ')}] retreat ${(c.retreatCost ?? []).length}`)
  for (const a of c.attacks ?? []) {
    const p = parseAttackText(a.text, c.name)
    console.log(`   ${a.name} [${(a.cost ?? []).length}${(a.cost ?? []).filter((x) => x !== 'Colorless').map((x) => x[0]).join('')}] ${a.damage || '-'} {${[...new Set(p.mechs)].join(',')}}`)
  }
}
console.error(`${designs.size} designs`)
