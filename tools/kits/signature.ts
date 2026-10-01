// The signature-move report (docs/MOVES.md "Signature moves"): how many attacks in the pool are drawn and shaped by a
// specific archetype rather than a broad bucket, and how many hand-kit attacks carry their archetype's trajectory.
//   npx vite-node tools/kits/signature.ts [--changed] [--pick] [--names]
//   --changed  hand-kit attacks whose shape kind the adoption changed, with the kit's notes (for review)
//   --pick     one card per signature look for tools/move_shots.mjs --sheet sig
//   --names    every attack name a signature claims, by look
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseAttackText } from '../../src/sim/cardtext'
import { TRAJECTORY, parseDamage, resolveKit } from '../../src/sim/kit'
import { ARCHETYPES, archetypeFor } from '../../src/sim/lexicon'
import { SIGNATURES } from '../../src/sim/signatures'
import type { Kit } from '../../src/sim/types'
import { loadCards } from './cards'

const root = resolve(__dirname, '../..')
const arg = (k: string) => process.argv.includes(k)
const cards = loadCards()
const sigIds = new Set(SIGNATURES.map((g) => g.id))
/** the pick prefers the move a signature is named for: its first whole name most */
const nameScore = (look: string, name: string) => { const i = SIGNATURES.find((g) => g.id === look)?.names.indexOf(name.toLowerCase().replace(/[-\s]?gx$/, '')) ?? -1; return i < 0 ? 0 : 40 - 2 * i }

// ------------------------------------------------------------------ 1. the pool: specific vs generic looks
let total = 0, self = 0, specific = 0, generic = 0, signature = 0
const sigNames = new Map<string, Set<string>>()
for (const c of cards) for (const a of c.attacks ?? []) {
  total++
  const r = archetypeFor(a.name, parseAttackText(a.text, c.name), parseDamage(a.damage))
  if (!r || r.id === 'aura' || r.id === 'field') { self++; continue }
  // specific: a deliberate pick by name (a signature, a hand-picked name, a keyword rule) of a non-bucket archetype;
  // generic: a broad bucket, a coarse stem, or only the attack's text
  const isSpecific = !ARCHETYPES[r.id].generic && (r.source === 'signature' || r.source === 'names' || r.source === 'name')
  if (isSpecific) specific++; else generic++
  if (r.source === 'signature') { signature++; const s = sigNames.get(r.id) ?? new Set(); s.add(a.name); sigNames.set(r.id, s) }
}
const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`
console.log(`pool: ${total} attacks; ${specific} specific look (${pct(specific, total)}), ${generic} generic (${pct(generic, total)}), ${self} self moves (no attack to draw)`)
console.log(`  of the ${total - self} that hit: ${pct(specific, total - self)} specific; ${signature} attacks (${[...sigNames.values()].reduce((n, s) => n + s.size, 0)} names) take a signature move (${sigIds.size} signatures)`)

// ------------------------------------------------------------------ 2. hand kits: does the resolved shape fly like its archetype
let kitAttacks = 0, carries = 0, pinned = 0, bucket = 0, kept = 0
const changed: string[] = []
const pick = new Map<string, { id: string; i: number; label: string; score: number }>()
for (const c of cards) {
  const kp = resolve(root, 'data/kits', `${c.id}.json`)
  const kit = existsSync(kp) ? (JSON.parse(readFileSync(kp, 'utf8')) as Kit) : null
  let fk
  try { fk = resolveKit(c, kit) } catch { continue }
  fk.attacks.forEach((a, i) => {
    const look = a.look
    if (look) {
      // the screenshot pick: the attack named for it (its words in the name), cheap, the shape of its own kind
      const ar = ARCHETYPES[look].shape(a.cost.length, a.baseDamage, a.element)
      const score = (ar.kind === a.shape.kind ? 100 : 0) + nameScore(look, a.name) - a.cost.length * 3 + (kit ? 0 : 5)
      const cur = pick.get(look)
      if (!cur || score > cur.score) pick.set(look, { id: c.id, i, label: `${a.name}`, score })
    }
    if (!kit) return
    kitAttacks++
    const ka = kit.attacks[i]
    if (!look) return
    const ar = ARCHETYPES[look]
    const lex = ar.shape(a.cost.length, a.baseDamage, a.element)
    const same = lex.kind === a.shape.kind && TRAJECTORY.every((k) => lex[k] === undefined || a.shape[k] !== undefined)
    if (same) carries++
    else if (ka?.pin) pinned++
    else if (ar.generic) bucket++
    else kept++
    if (ka && ka.shape.kind !== a.shape.kind) changed.push(`${c.id} ${c.name}: ${a.name} ${ka.shape.kind} -> ${a.shape.kind} (${look})${kit.notes?.includes(a.name) ? `  NOTE: ${kit.notes}` : ''}`)
  })
}
console.log(`hand kits: ${kitAttacks} attacks; ${carries} carry their archetype's trajectory (${pct(carries, kitAttacks)}); ${pinned} pinned by the kit, ${bucket} under a broad bucket (kept), ${kept} kept on purpose (a shot under a beam archetype, a Max move)`)
if (arg('--changed')) for (const l of changed) console.log(`  ${l}`)
if (arg('--names')) for (const [id, s] of sigNames) console.log(`  ${id}: ${[...s].join(', ')}`)
// --pick [looks]: [look, family, card, attack index, label] as JSON for tools/sig_shots.mjs: every signature, plus the
// lexicon looks named (comma-separated: the ones sig/iconic.ts redraws)
if (arg('--pick')) {
  const extra = (process.argv[process.argv.indexOf('--pick') + 1] ?? '').split(',').filter((x) => x && !x.startsWith('--'))
  const rows = [...SIGNATURES.map((g) => [g.id, g.family]), ...extra.map((x) => [x, 'iconic'])]
    .map(([id, fam]) => { const p = pick.get(id); return p ? [id, fam, p.id, p.i, p.label] : null }).filter(Boolean)
  console.log(JSON.stringify(rows))
}
