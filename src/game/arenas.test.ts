import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { parseArena, validateArena } from '../sim/arena'
import { createState } from '../sim/state'
import { circleHitsSolid } from '../sim/terrain'
import { FP } from '../sim/fixed'
import { TILE } from '../sim/types'

const ROOT = resolve(__dirname, '../../public/arenas')
const dirs = readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)

it('index.json lists exactly the arena folders', () => {
  const idx = JSON.parse(readFileSync(join(ROOT, 'index.json'), 'utf8'))
  expect(idx.version).toBe(1)
  expect([...idx.arenas].sort()).toEqual([...dirs].sort())
})

for (const id of dirs) {
  it(`${id}: valid, spawns clear of walls, props.json frames cover its o cells`, () => {
    const f = JSON.parse(readFileSync(join(ROOT, id, 'arena.json'), 'utf8'))
    const pj = join(ROOT, id, 'props.json')
    if (existsSync(pj)) f.propFrames = JSON.parse(readFileSync(pj, 'utf8')).frames
    const { errors } = validateArena(f)
    expect(errors).toEqual([])
    expect(f.id).toBe(id)
    const a = parseArena(f)
    const s = createState({ mode: '1v1', seed: 1, arena: a, kits: [], players: [] })
    for (const sp of a.spawns) expect(circleHitsSolid(s, sp.x * FP, sp.y * FP, 22), `${id} spawn ${sp.x},${sp.y}`).toBe(false)
    for (const fr of f.propFrames ?? []) for (const [tx, ty] of fr.tiles) expect(a.tiles[ty * 48 + tx]).toBe(TILE.PROP)
  })
}
