// Bot navigation over the tile grid: a BFS distance field toward a target, and line of sight for shots.
import { FP, iatan2 } from '../sim/fixed'
import { blocksMove, COLS, ROWS, solid, TILE_FP, tileAt } from '../sim/terrain'
import type { SimState } from '../sim/types'

const N8: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]

/** a tile a fighter can stand on with room to spare (1-wide gaps are too narrow for a 44 px fighter) */
function roomy(s: SimState, tx: number, ty: number): boolean {
  if (blocksMove(s, tx, ty)) return false
  const lr = blocksMove(s, tx - 1, ty) && blocksMove(s, tx + 1, ty)
  const ud = blocksMove(s, tx, ty - 1) && blocksMove(s, tx, ty + 1)
  return !lr && !ud
}

/** steps from every tile to the target tile (-1 = unreachable) */
export function flowField(s: SimState, tx: number, ty: number): Int16Array {
  const d = new Int16Array(COLS * ROWS).fill(-1)
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return d
  const q: number[] = [ty * COLS + tx]
  d[q[0]] = 0
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % COLS, y = (i - x) / COLS
    for (const [dx, dy] of N8) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
      const j = ny * COLS + nx
      if (d[j] >= 0 || !roomy(s, nx, ny)) continue
      if (dx && dy && (blocksMove(s, x + dx, y) || blocksMove(s, x, y + dy))) continue // no corner cutting
      d[j] = d[i] + 1
      q.push(j)
    }
  }
  return d
}

/** the angle toward the neighbouring tile closest to the target, or null (already there / no path) */
export function followField(s: SimState, d: Int16Array, x: number, y: number): number | null {
  const { tx, ty } = tileAt(x, y)
  const here = d[ty * COLS + tx]
  let best = -1, bestD = here < 0 ? 32767 : here
  for (const [dx, dy] of N8) {
    const nx = tx + dx, ny = ty + dy
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
    const v = d[ny * COLS + nx]
    if (v >= 0 && v < bestD) { bestD = v; best = ny * COLS + nx }
  }
  if (best < 0) return null
  const cx = (best % COLS) * TILE_FP + TILE_FP / 2, cy = Math.floor(best / COLS) * TILE_FP + TILE_FP / 2
  return iatan2(cy - y, cx - x)
}

/** can a shot fly from a to b (walls and props block, water doesn't) */
export function lineOfSight(s: SimState, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0, dy = y1 - y0
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (16 * FP)))
  for (let k = 1; k < steps; k++) {
    const t = tileAt(x0 + Math.trunc((dx * k) / steps), y0 + Math.trunc((dy * k) / steps))
    if (solid(s, t.tx, t.ty)) return false
  }
  return true
}
