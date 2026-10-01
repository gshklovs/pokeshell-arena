// Stuck-rate table: every arena x every probe size (src/sim/stuckprobe.ts). `npm run probe:stuck [-- out.json]`
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PROBE_SIZES, probeArena } from '../../src/sim/stuckprobe'

const ROOT = resolve(__dirname, '../../public/arenas')
const ids = readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
const rows: Record<string, unknown>[] = []
let tot = { stuck: 0, sec: 0 }
const bySize: Record<string, { stuck: number; sec: number; targets: number; reached: number }> = {}
for (const id of ids) {
  const f = JSON.parse(readFileSync(join(ROOT, id, 'arena.json'), 'utf8'))
  const pj = join(ROOT, id, 'props.json')
  if (existsSync(pj)) f.propFrames = JSON.parse(readFileSync(pj, 'utf8')).frames
  const cells: string[] = []
  for (const size of PROBE_SIZES) {
    let stuck = 0, sec = 0, targets = 0, reached = 0
    const where: string[] = []
    for (const seed of [11, 22, 33]) {
      const r = probeArena(f, size, { seed, walkTicks: 3600, targets: 25, seekTicks: 900 })
      stuck += r.walkStuck + r.seekStuck; sec += r.seconds; targets += r.targets; reached += r.reached
      where.push(...r.where.map((w) => `${w.how}${w.tx},${w.ty}`))
    }
    const b = (bySize[size.name] ??= { stuck: 0, sec: 0, targets: 0, reached: 0 })
    b.stuck += stuck; b.sec += sec; b.targets += targets; b.reached += reached
    tot.stuck += stuck; tot.sec += sec
    const perMin = (stuck * 60) / Math.max(1, sec)
    cells.push(`${size.name}=${perMin.toFixed(2)}/min (${stuck}, ${reached}/${targets})`)
    rows.push({ arena: id, size: size.name, stuck, seconds: sec, perMin: +perMin.toFixed(3), targets, reached, where: [...new Set(where)] })
  }
  console.log(`${id.padEnd(24)} ${cells.join('  ')}`)
}
for (const [k, b] of Object.entries(bySize)) console.log(`size ${k.padEnd(11)} ${(b.stuck * 60 / b.sec).toFixed(2)}/min  stuck ${b.stuck} in ${b.sec}s  targets reached ${b.reached}/${b.targets}`)
console.log(`all: ${(tot.stuck * 60 / tot.sec).toFixed(2)} stuck/min (${tot.stuck} in ${tot.sec}s)`)
const out = process.argv[2]
if (out) writeFileSync(out, JSON.stringify(rows, null, 1))
