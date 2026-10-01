// The terrain grid: solid tiles, props, and the surface layers (wet / shock / fire) with their element reactions
// (docs/SPEC.md section 3). Coordinates in here are sub-pixels unless named tx/ty (tiles).
import { FP } from './fixed'
import * as R from './rules'
import { TILE, type MatchDef, type SimState } from './types'

export const COLS = 48
export const ROWS = 27
export const TILE_FP = 40 * FP

export function tileAt(x: number, y: number): { tx: number; ty: number } {
  return { tx: Math.floor(x / TILE_FP), ty: Math.floor(y / TILE_FP) }
}

export function inGrid(tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS
}

/** blocks shots and beams: walls and unbroken props (deep water, pits and low obstacles `=` do not: shots fly over
 * them) */
export function solid(s: SimState, tx: number, ty: number): boolean {
  if (!inGrid(tx, ty)) return true
  const t = s.tiles[ty * COLS + tx]
  return t === TILE.WALL || t === TILE.PROP
}

/** does a step from tile (ax, ay) to tile (bx, by) cross a wall: the new tile is solid, or the step cuts a corner
 * between two solid tiles that touch diagonally (a seam of walls has no gap a shot fits through) */
export function crossesSolid(s: SimState, ax: number, ay: number, bx: number, by: number): boolean {
  if (solid(s, bx, by)) return true
  return ax !== bx && ay !== by && solid(s, bx, ay) && solid(s, ax, by)
}

/** can a hit reach from (x0, y0) to (x1, y1) (sub-pixels): no wall or prop between them (low obstacles, water and
 * pits don't block). Walked in 4-px steps with the corner rule; the tile the line starts in is skipped, so a lob
 * that lands on top of a wall still bursts around it */
export function inSight(s: SimState, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0, dy = y1 - y0
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (4 * FP)))
  const t0 = tileAt(x0, y0)
  let tx = t0.tx, ty = t0.ty
  for (let i = 1; i <= n; i++) {
    const t = tileAt(x0 + Math.trunc((dx * i) / n), y0 + Math.trunc((dy * i) / n))
    if (t.tx === tx && t.ty === ty) continue
    if (crossesSolid(s, tx, ty, t.tx, t.ty)) return false
    tx = t.tx; ty = t.ty
  }
  return true
}

/** blocks walking (for a fighter with no movement traits: movement.passable has the full rule): walls, props,
 * deep water `~`, pits `_` and low obstacles `=` */
export function blocksMove(s: SimState, tx: number, ty: number): boolean {
  if (!inGrid(tx, ty)) return true
  const t = s.tiles[ty * COLS + tx]
  return t === TILE.WALL || t === TILE.PROP || t === TILE.WATER || t === TILE.PIT || t === TILE.LOW
}

/** deep water, or floor flooded by a Water attack (shallow: walkable) */
export function isWater(s: SimState, i: number): boolean {
  return s.tiles[i] === TILE.WATER || s.wet[i] > 0
}

function circleRect(x: number, y: number, r: number, tx: number, ty: number): boolean {
  const nx = Math.max(tx * TILE_FP, Math.min(x, (tx + 1) * TILE_FP - 1))
  const ny = Math.max(ty * TILE_FP, Math.min(y, (ty + 1) * TILE_FP - 1))
  const dx = x - nx, dy = y - ny
  return dx * dx + dy * dy < r * r
}

/** does a circle (sub-pixel center, px radius) overlap a tile that blocks walking */
export function circleHitsSolid(s: SimState, x: number, y: number, rPx: number): boolean {
  const r = rPx * FP
  const t0 = tileAt(x - r, y - r), t1 = tileAt(x + r, y + r)
  for (let ty = t0.ty; ty <= t1.ty; ty++) {
    for (let tx = t0.tx; tx <= t1.tx; tx++) {
      if (blocksMove(s, tx, ty) && circleRect(x, y, r, tx, ty)) return true
    }
  }
  return false
}

/** does a circle touch a tile matching the test (a fighter hugging electrified water gets shocked) */
export function circleTouches(s: SimState, x: number, y: number, rPx: number, test: (i: number) => boolean): boolean {
  const r = rPx * FP
  const t0 = tileAt(x - r, y - r), t1 = tileAt(x + r, y + r)
  for (let ty = Math.max(0, t0.ty); ty <= Math.min(ROWS - 1, t1.ty); ty++) {
    for (let tx = Math.max(0, t0.tx); tx <= Math.min(COLS - 1, t1.tx); tx++) {
      if (test(ty * COLS + tx) && circleRect(x, y, r, tx, ty)) return true
    }
  }
  return false
}

/** damage a prop tile; true if the tile was a prop (the shot stops there). A multi-tile prop (props.json) shares
 * one HP pool, kept on its root tile, and breaks as a whole */
export function hitProp(def: MatchDef, s: SimState, tx: number, ty: number, dmg: number): boolean {
  if (!inGrid(tx, ty)) return false
  const i = ty * COLS + tx
  if (s.tiles[i] !== TILE.PROP) return false
  const root = def.arena.propGroup[i]
  s.propHp[root] -= Math.max(10, dmg)
  const broken = s.propHp[root] <= 0
  if (broken) {
    for (let j = 0; j < s.tiles.length; j++) {
      if (def.arena.propGroup[j] === root && s.tiles[j] === TILE.PROP) { s.tiles[j] = TILE.FLOOR; s.propHp[j] = 0 }
    }
  }
  s.events.push({ k: 'prop', x: tx * TILE_FP + TILE_FP / 2, y: ty * TILE_FP + TILE_FP / 2, broken })
  return true
}

/** the tile indexes whose centers lie within radius px of a point (at least the tile under it) */
export function tilesInRadius(x: number, y: number, rPx: number): number[] {
  const r = rPx * FP
  const out: number[] = []
  const t0 = tileAt(x - r, y - r), t1 = tileAt(x + r, y + r)
  for (let ty = Math.max(0, t0.ty); ty <= Math.min(ROWS - 1, t1.ty); ty++) {
    for (let tx = Math.max(0, t0.tx); tx <= Math.min(COLS - 1, t1.tx); tx++) {
      const cx = tx * TILE_FP + TILE_FP / 2, cy = ty * TILE_FP + TILE_FP / 2
      const dx = cx - x, dy = cy - y
      if (dx * dx + dy * dy <= r * r) out.push(ty * COLS + tx)
    }
  }
  const c = tileAt(x, y)
  if (inGrid(c.tx, c.ty) && !out.includes(c.ty * COLS + c.tx)) out.unshift(c.ty * COLS + c.tx)
  return out
}

export type Paint = 'water' | 'fire' | 'shock' | 'none'

/** paint surfaces around a point (the `paint` op) */
export function paint(s: SimState, x: number, y: number, rPx: number, what: Paint, ticks?: number): void {
  for (const i of tilesInRadius(x, y, rPx)) {
    const t = s.tiles[i]
    if (t === TILE.WALL || t === TILE.PROP || t === TILE.PIT || t === TILE.LOW) continue
    if (what === 'water') { s.wet[i] = ticks ?? R.WET_TICKS; s.fire[i] = 0 }
    else if (what === 'fire') { if (!isWater(s, i)) s.fire[i] = ticks ?? R.FIRE_TICKS }
    else if (what === 'shock') { if (isWater(s, i)) s.shock[i] = ticks ?? R.SHOCK_TICKS }
    else { s.wet[i] = 0; s.fire[i] = 0; s.shock[i] = 0 }
  }
}

/** electrify the water connected to the tiles near a point, within SHOCK_RANGE_TILES of it */
export function electrify(s: SimState, x: number, y: number, rPx: number): number {
  const seeds = tilesInRadius(x, y, Math.max(rPx, 30)).filter((i) => isWater(s, i))
  if (!seeds.length) return 0
  const c = tileAt(x, y)
  const seen = new Set<number>(seeds)
  const queue = seeds.slice()
  let n = 0
  while (queue.length) {
    const i = queue.shift()!
    s.shock[i] = R.SHOCK_TICKS
    n++
    const tx = i % COLS, ty = (i - tx) / COLS
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = tx + dx, ny = ty + dy
      if (!inGrid(nx, ny) || Math.abs(nx - c.tx) > R.SHOCK_RANGE_TILES || Math.abs(ny - c.ty) > R.SHOCK_RANGE_TILES) continue
      const j = ny * COLS + nx
      if (!seen.has(j) && isWater(s, j)) { seen.add(j); queue.push(j) }
    }
  }
  return n
}

/** the built-in element reactions on an impact (no kit work): Lightning x water, Fire x grass / water, Water x fire */
export function react(s: SimState, element: string, x: number, y: number, rPx: number): void {
  if (element === 'Lightning') {
    if (electrify(s, x, y, rPx) > 0) s.events.push({ k: 'react', x, y, what: 'shock' })
  } else if (element === 'Fire') {
    let lit = false, steam = false
    for (const i of tilesInRadius(x, y, rPx)) {
      if (s.wet[i] > 0) { s.wet[i] = 0; s.shock[i] = 0; steam = true }
      else if (s.tiles[i] === TILE.GRASS && s.fire[i] === 0) { s.fire[i] = R.FIRE_TICKS; lit = true }
    }
    if (lit) s.events.push({ k: 'react', x, y, what: 'ignite' })
    if (steam) s.events.push({ k: 'react', x, y, what: 'steam' })
  } else if (element === 'Water') {
    let out = false
    for (const i of tilesInRadius(x, y, rPx)) if (s.fire[i] > 0) { s.fire[i] = 0; out = true }
    if (out) s.events.push({ k: 'react', x, y, what: 'douse' })
  }
}

/** one tick of the surfaces: timers run down, fire spreads through grass and burns it to floor */
export function tickTerrain(_def: MatchDef, s: SimState): void {
  const spread = s.tick % R.FIRE_SPREAD_EVERY === 0
  const ignite: number[] = []
  for (let i = 0; i < s.tiles.length; i++) {
    if (s.wet[i] > 0) s.wet[i]--
    if (s.shock[i] > 0) s.shock[i]--
    if (s.fire[i] > 0) {
      if (spread) {
        const tx = i % COLS, ty = (i - tx) / COLS
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = tx + dx, ny = ty + dy
          if (!inGrid(nx, ny)) continue
          const j = ny * COLS + nx
          if (s.tiles[j] === TILE.GRASS && s.fire[j] === 0 && s.wet[j] === 0) ignite.push(j)
        }
      }
      if (--s.fire[i] === 0 && s.tiles[i] === TILE.GRASS) s.tiles[i] = TILE.FLOOR
    }
  }
  for (const j of ignite) if (s.fire[j] === 0 && s.tiles[j] === TILE.GRASS) s.fire[j] = R.FIRE_TICKS
}
