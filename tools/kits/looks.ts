// How every attack in the pool is drawn (docs/VFX.md): the archetype its name reads as ("look"), on the shape kind
// its kit gives it. The renderer draws a look on any kind; the table shows where the two disagree.
//   npx vite-node tools/kits/looks.ts [--examples] [--pick]
//   --pick: one card per look for tools/move_shots.mjs --sheet vfx (an auto-kit card whose shape kind agrees)
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveKit } from '../../src/sim/kit'
import { ARCHETYPES, archetypeKind } from '../../src/sim/lexicon'
import type { Kit } from '../../src/sim/types'
import { loadCards } from './cards'

const root = resolve(__dirname, '../..')
const per = new Map<string, { n: number; agree: number; kinds: Map<string, number>; ex: string[]; pick?: { id: string; i: number; name: string; score: number } }>()
let n = 0, looked = 0, agree = 0
for (const c of loadCards()) {
  const kp = resolve(root, 'data/kits', `${c.id}.json`)
  const kit = existsSync(kp) ? (JSON.parse(readFileSync(kp, 'utf8')) as Kit) : null
  let fk
  try { fk = resolveKit(c, kit) } catch { continue }
  fk.attacks.forEach((a, i) => {
    n++
    const id = a.look ?? '(none)'
    const e = per.get(id) ?? { n: 0, agree: 0, kinds: new Map(), ex: [] }
    e.n++
    e.kinds.set(a.shape.kind, (e.kinds.get(a.shape.kind) ?? 0) + 1)
    const same = !!a.look && archetypeKind(a.look) === a.shape.kind
    if (a.look) looked++
    if (same) { agree++; e.agree++ }
    if (e.ex.length < 4) e.ex.push(`${c.id}#${i} ${c.name}: ${a.name} [${a.element}, ${a.shape.kind}${kit ? ', hand' : ''}]`)
    // the screenshot pick: the shape kind agrees, cheap, an auto kit first, the name says it outright
    const score = (same ? 100 : 0) + (kit ? 0 : 20) - a.cost.length * 3 + (a.name.toLowerCase().includes(id) ? 5 : 0)
    if (!e.pick || score > e.pick.score) e.pick = { id: c.id, i, name: `${c.name}: ${a.name}`, score }
    per.set(id, e)
  })
}
const rows = [...per.entries()].sort((a, b) => b[1].n - a[1].n)
if (process.argv.includes('--pick')) {
  for (const [k, v] of rows) if (k !== '(none)') console.log(`  ['${k}', '${v.pick!.id}', ${v.pick!.i}], // ${v.pick!.name}`)
} else {
  console.log(`${n} attacks: ${looked} have a look, ${agree} on the archetype's own shape kind; ${Object.keys(ARCHETYPES).length} archetypes`)
  for (const [k, v] of rows) {
    const kinds = [...v.kinds.entries()].map(([kk, c]) => `${kk} ${c}`).join(', ')
    console.log(`${k.padEnd(12)} ${String(v.n).padStart(4)}  (${kinds})${process.argv.includes('--examples') ? '\n    ' + v.ex.join('\n    ') : ''}`)
  }
}
