// Collider audit table (src/sim/colliders.ts) for every arena: `npx vite-node tools/colliders/audit.ts [tag]`.
// Writes shots/colliders/audit-<tag>.json, which tools/colliders/render.py <tag> marks on the sheets.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArena } from '../../src/sim/arena'
import { auditColliders } from '../../src/sim/colliders'

const ROOT = resolve(__dirname, '../../public/arenas')
const OUT = resolve(__dirname, '../../shots/colliders')
const tag = process.argv[2] ?? 'before'
const ids: string[] = JSON.parse(readFileSync(join(ROOT, 'index.json'), 'utf8')).arenas
const all: Record<string, unknown> = {}
for (const id of ids) {
  const f = JSON.parse(readFileSync(join(ROOT, id, 'arena.json'), 'utf8'))
  const pj = join(ROOT, id, 'props.json')
  if (existsSync(pj)) f.propFrames = JSON.parse(readFileSync(pj, 'utf8')).frames
  const r = auditColliders(parseArena(f))
  all[id] = { ...r, shotStops: r.shotStops.map(([x, y]) => [x, y]) }
  const b = r.bounds
  console.log(`${id.padEnd(24)} unreachable ${String(r.unreachable.length).padStart(3)}  cutOff ${r.cutOff.length}  flierUnreach ${String(r.flierUnreachable.length).padStart(3)}  shotStops ${String(r.shotStops.length).padStart(3)} odd ${r.oddStops.length}  reach rows ${b.top}-${b.bottom} cols ${b.left}-${b.right}`)
  if (r.unreachable.length) console.log(`   unreachable: ${r.unreachable.map(([x, y]) => `${x},${y}`).join(' ')}`)
}
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, `audit-${tag}.json`), JSON.stringify(all))
