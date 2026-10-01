// arena.json -> ArenaDef, and its validator (docs/SPEC.md section 8).
import { PROP_HP } from './rules'
import { TILE, type ArenaDef, type ArenaFile } from './types'

const CHAR_TILE: Record<string, number> = {
  '.': TILE.FLOOR, '#': TILE.WALL, '~': TILE.WATER, '"': TILE.GRASS, '^': TILE.HAZARD, o: TILE.PROP, _: TILE.PIT, '=': TILE.LOW,
}

export interface ArenaCheck { errors: string[]; warnings: string[] }

/** every problem in an arena file at once (errors make it unplayable, warnings don't) */
export function validateArena(a: unknown): ArenaCheck {
  const errors: string[] = []
  const warnings: string[] = []
  const f = a as ArenaFile
  if (!f || typeof f !== 'object') return { errors: ['not an object'], warnings }
  if (typeof f.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(f.id)) errors.push('id: lowercase letters, digits and dashes')
  if (typeof f.name !== 'string' || !f.name) errors.push('name: missing')
  if (f.version !== undefined && f.version !== 1) errors.push(`version: ${f.version} is not supported (1)`)
  const tile = f.tile
  if (tile !== 40) errors.push(`tile: ${tile} (must be 40)`)
  const w = f.size?.w, h = f.size?.h
  if (w !== 1920 || h !== 1080) errors.push(`size: ${w}x${h} (must be 1920x1080)`)
  const cols = 48, rows = 27
  if (!Array.isArray(f.grid)) errors.push('grid: missing')
  else {
    if (f.grid.length !== rows) errors.push(`grid: ${f.grid.length} rows (must be ${rows})`)
    const odd = new Set<string>()
    f.grid.forEach((row, y) => {
      if (typeof row !== 'string') { errors.push(`grid[${y}]: not a string`); return }
      if ([...row].length !== cols) errors.push(`grid[${y}]: ${[...row].length} chars (must be ${cols})`)
      for (const ch of row) if (!(ch in CHAR_TILE)) odd.add(ch)
      if ((y === 0 || y === rows - 1) && /[^#]/.test(row)) warnings.push(`grid[${y}]: the outer ring should be walls`)
      else if (row[0] !== '#' || row[row.length - 1] !== '#') warnings.push(`grid[${y}]: the outer ring should be walls`)
    })
    if (odd.size) warnings.push(`grid: unknown chars ${[...odd].map((c) => JSON.stringify(c)).join(' ')} load as floor`)
  }
  if (!Array.isArray(f.spawns)) errors.push('spawns: missing')
  else {
    for (const team of [0, 1]) if (!f.spawns.some((s) => s.team === team)) errors.push(`spawns: none for team ${team}`)
    f.spawns.forEach((s, i) => {
      if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) { errors.push(`spawns[${i}]: x, y must be integers (px)`); return }
      const tx = Math.floor(s.x / 40), ty = Math.floor(s.y / 40)
      const ch = Array.isArray(f.grid) ? f.grid[ty]?.[tx] : undefined
      if (ch === undefined) errors.push(`spawns[${i}]: outside the grid`)
      else if (ch === '#' || ch === 'o' || ch === '_' || ch === '~' || ch === '=') errors.push(`spawns[${i}]: on a ${ch === '#' ? 'wall' : ch === 'o' ? 'prop' : ch === '_' ? 'pit' : ch === '=' ? 'low obstacle' : 'deep water'} tile (${tx},${ty})`)
    })
  }
  if (f.props !== undefined) {
    if (!Array.isArray(f.props)) errors.push('props: must be a list')
    else f.props.forEach((p, i) => {
      if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) errors.push(`props[${i}]: x, y must be integer tiles`)
      else if (Array.isArray(f.grid) && f.grid[p.y]?.[p.x] !== 'o') warnings.push(`props[${i}]: tile (${p.x},${p.y}) is not an 'o'`)
      if (p.hp !== undefined && !(Number.isInteger(p.hp) && p.hp > 0)) errors.push(`props[${i}]: hp must be a positive integer`)
    })
  }
  return { errors, warnings }
}

/** a validated arena file -> the sim's ArenaDef (throws with every error) */
export function parseArena(f: ArenaFile): ArenaDef {
  const { errors } = validateArena(f)
  if (errors.length) throw new Error(`arena ${f?.id ?? '?'}: ${errors.join('; ')}`)
  const cols = 48, rows = 27
  const tiles: number[] = []
  const propHp: number[] = []
  for (let y = 0; y < rows; y++) {
    const row = [...f.grid[y]]
    for (let x = 0; x < cols; x++) {
      const t = CHAR_TILE[row[x]] ?? TILE.FLOOR
      tiles.push(t)
      propHp.push(t === TILE.PROP ? PROP_HP : 0)
    }
  }
  for (const p of f.props ?? []) {
    const i = p.y * cols + p.x
    if (tiles[i] === TILE.PROP && p.hp) propHp[i] = p.hp
  }
  const propGroup = tiles.map((t, i) => (t === TILE.PROP ? i : -1))
  // a props.json frame covering several `o` cells is one prop: one HP pool (30 per cell unless `hp`) on its root
  for (const fr of f.propFrames ?? []) {
    const cells = (fr.tiles ?? []).map(([tx, ty]) => ty * cols + tx).filter((i) => tiles[i] === TILE.PROP)
    if (!cells.length) continue
    const root = Math.min(...cells)
    for (const i of cells) { propGroup[i] = root; propHp[i] = 0 }
    propHp[root] = fr.hp ?? PROP_HP * cells.length
  }
  return { id: f.id, name: f.name, cols, rows, tile: 40, tiles, propHp, propGroup, spawns: f.spawns.map((s) => ({ ...s })), file: f }
}
