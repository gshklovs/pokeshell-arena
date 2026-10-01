// The collider audit (tests and tools only; never shipped as game content): what an arena's grid lets a body reach
// and a shot cross, measured with the sim's own body test (movement.bodyBlocked) and shot rule (terrain.solid).
// tools/colliders/audit.ts prints it per arena and src/game/colliders.test.ts keeps it clean.
//
// - reach: a flood fill over feet positions on a 4 px lattice, a position being free when the body circle there
//   overlaps nothing it may not (the exact movement test, so narrow and diagonal-only gaps count as closed). A tile is
//   reached when some free reached position has its feet inside it.
// - shots: a point marched in 8 px steps (the beam march; projectiles test the same point-in-solid-tile rule) from
//   reachable tiles in every direction; every tile that stops one is listed.
import { FP } from './fixed'
import { bodyBlocked, bodyRadiusPx } from './movement'
import * as R from './rules'
import { COLS, ROWS, solid, TILE_FP } from './terrain'
import { TILE, type ArenaDef, type MoveTraits, type SimState } from './types'

/** the lattice step of the reach fill (px) */
const LATTICE_PX = 4

/** a SimState with just the arena's tiles (the only field the body and shot tests read) */
export function tilesState(a: ArenaDef): SimState {
  return { tiles: a.tiles.slice() } as unknown as SimState
}

/** the tiles (index -> 1) whose area some reachable body position has its feet in, from the given feet points */
export function reach(s: SimState, from: { x: number; y: number }[], bodyPx: number, t: MoveTraits = {}): Uint8Array {
  const W = COLS * 40 / LATTICE_PX, H = ROWS * 40 / LATTICE_PX
  const seen = new Uint8Array(W * H)
  const out = new Uint8Array(COLS * ROWS)
  const free = (i: number) => !bodyBlocked(s, (i % W) * LATTICE_PX * FP + 2 * FP, Math.floor(i / W) * LATTICE_PX * FP + 2 * FP, bodyPx, t)
  const q: number[] = []
  for (const p of from) {
    const i = Math.floor(p.y / LATTICE_PX) * W + Math.floor(p.x / LATTICE_PX)
    if (!seen[i] && free(i)) { seen[i] = 1; q.push(i) }
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i - x) / W
    out[Math.floor((y * LATTICE_PX + 2) / 40) * COLS + Math.floor((x * LATTICE_PX + 2) / 40)] = 1
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const j = ny * W + nx
      if (seen[j]) continue
      seen[j] = 1
      if (free(j)) q.push(j)
    }
  }
  return out
}

/** the feet points of an arena's spawns for a fighter of hitbox radius r (px) */
export function spawnFeet(a: ArenaDef, r: number): { x: number; y: number }[] {
  return a.spawns.map((sp) => ({ x: sp.x, y: sp.y + Math.trunc((r * 3) / 5) }))
}

/** the tiles that stop shots marched from every reached tile (every 16th of a turn): [tx, ty, char] */
export function shotStops(s: SimState, reached: Uint8Array, dirs = 16): Map<number, number> {
  const stops = new Map<number, number>()
  for (let i = 0; i < reached.length; i++) {
    if (!reached[i]) continue
    const x0 = (i % COLS) * 40 + 20, y0 = Math.floor(i / COLS) * 40 + 20
    for (let k = 0; k < dirs; k++) {
      const a = (k / dirs) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a)
      for (let d = 8; d < 2400; d += 8) {
        const x = Math.floor(((x0 + cx * d) * FP) / TILE_FP), y = Math.floor(((y0 + cy * d) * FP) / TILE_FP)
        if (!solid(s, x, y)) continue
        if (x >= 0 && y >= 0 && x < COLS && y < ROWS) stops.set(y * COLS + x, (stops.get(y * COLS + x) ?? 0) + 1)
        break
      }
    }
  }
  return stops
}

export interface ColliderReport {
  /** walkable tiles (floor, grass, hazard) no walker reaches from any spawn: [tx, ty] */
  unreachable: [number, number][]
  /** spawns that can't reach every other spawn (index) */
  cutOff: number[]
  /** tiles a flier may enter (walkable, water, pit, low) that no flier reaches */
  flierUnreachable: [number, number][]
  /** tiles that stopped test shots, with how many: [tx, ty, count] */
  shotStops: [number, number, number][]
  /** of those, the ones that aren't walls or props (must be none: the shot rule is terrain.solid) */
  oddStops: [number, number][]
  /** the topmost / bottommost / leftmost / rightmost reached tile */
  bounds: { top: number; bottom: number; left: number; right: number }
}

const WALKABLE = new Set<number>([TILE.FLOOR, TILE.GRASS, TILE.HAZARD])

/** the whole audit for one arena, for the largest body (the worst case: every smaller one reaches at least as much) */
export function auditColliders(a: ArenaDef): ColliderReport {
  const s = tilesState(a)
  const r = R.radiusPx(5)
  const body = bodyRadiusPx(r)
  const feet = spawnFeet(a, r)
  const walk = reach(s, feet, body)
  const unreachable: [number, number][] = []
  for (let i = 0; i < walk.length; i++) if (WALKABLE.has(a.tiles[i]) && !walk[i]) unreachable.push([i % COLS, Math.floor(i / COLS)])
  const cutOff: number[] = []
  const tileOf = (p: { x: number; y: number }) => Math.floor(p.y / 40) * COLS + Math.floor(p.x / 40)
  feet.forEach((p, k) => {
    const mine = reach(s, [p], body)
    if (feet.some((q) => !mine[tileOf(q)])) cutOff.push(k)
  })
  const fly = reach(s, feet, body, { fly: true })
  const flierUnreachable: [number, number][] = []
  for (let i = 0; i < fly.length; i++) {
    const k = a.tiles[i]
    if ((WALKABLE.has(k) || k === TILE.WATER || k === TILE.PIT || k === TILE.LOW) && !fly[i]) flierUnreachable.push([i % COLS, Math.floor(i / COLS)])
  }
  const stops = shotStops(s, walk)
  const shot: [number, number, number][] = [...stops].map(([i, n]) => [i % COLS, Math.floor(i / COLS), n])
  const oddStops = shot.filter(([x, y]) => a.tiles[y * COLS + x] !== TILE.WALL && a.tiles[y * COLS + x] !== TILE.PROP).map(([x, y]) => [x, y] as [number, number])
  let top = ROWS, bottom = -1, left = COLS, right = -1
  for (let i = 0; i < walk.length; i++) {
    if (!walk[i]) continue
    const x = i % COLS, y = Math.floor(i / COLS)
    top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x)
  }
  return { unreachable, cutOff, flierUnreachable, shotStops: shot, oddStops, bounds: { top, bottom, left, right } }
}
