// Fighter movement against the tile grid (docs/SPEC.md section 3 "World"). Integer-only and deterministic.
//
// - The body: fighters collide with tiles as a circle smaller than their hitbox (bodyRadiusPx, capped at
//   rules.BODY_MAX_PX) so every fighter fits a 1-tile (40 px) corridor with room to spare. Hitboxes (Fighter.r) are
//   unchanged; only walls, props and deep water see the body.
// - The body sits at the feet (footOffsetPx below the position), where the sprite stands, not at the hitbox center.
// - Axis-separated moves in <= 4 px sub-steps, each axis stepped up to contact (a binary search), so a blocked axis
//   never cancels the other one: a diagonal into a wall slides along it.
// - Corner nudging: a straight move that only clips a corner (the fighter is up to half a tile off an opening) slides
//   sideways around it, the way a player expects a door or a pillar edge to let them through.
// - unstick(): a body that ends up overlapping a blocking tile (a bigger evolution, a swap-in, a tile turned solid)
//   is moved to the nearest free spot.
//
// The movement-traits hook (the kits' per-type movement flavour): FighterKit.move / Fighter.move is a MoveTraits
// (types.ts). newFighter copies the kit's traits onto the fighter, and everything below reads them from the fighter:
//   - passable(s, tx, ty, traits)     which tiles the body may overlap: deep water `~` too with crossWater / hover
//   - terrainSpeedPermille(...)       the speed multiplier from the tile under the fighter (speedIn.water / .grass,
//                                     hover ignores the shallow-water slowdown)
//   - noKnockback                     not read here: combat.ts decides whether a knockback starts at all
import { FP, icos, idiv, isin, ONE } from './fixed'
import * as R from './rules'
import { COLS, inGrid, ROWS, TILE_FP } from './terrain'
import { TILE, type Fighter, type MoveTraits, type SimState } from './types'

const NONE: MoveTraits = {}
/** the fields of a fighter the body tests read */
export type Body = Pick<Fighter, 'x' | 'y' | 'r' | 'move'>
/** the most a single sub-step moves (px): thinner than any tile, so nothing tunnels */
const SUBSTEP_PX = 4
/** corner nudge: how far off an opening (px) a straight move still slides into it */
export const NUDGE_MAX_PX = 20
const NUDGE_STEP_PX = 2

/** a fighter's movement traits (none unless its kit gave some) */
export function traitsOf(f: Body): MoveTraits {
  return f.move ?? NONE
}

/** the collision body's radius (px) for a fighter of hitbox radius r: 2/3 of it, capped at BODY_MAX_PX */
export function bodyRadiusPx(r: number): number {
  return Math.max(4, Math.min(R.BODY_MAX_PX, idiv(r * 2, 3)))
}

/** how far below the fighter's position (px) its body sits: at the feet, where the renderer stands the sprite
 * (renderer: feet at y + 0.6 r) and draws its shadow. The hitbox (x, y, r) stays where it is; only the walls, props
 * and water see the feet. Without this a fighter walking up stopped with its feet a tile short of a top wall */
export function footOffsetPx(r: number): number {
  return idiv(r * 3, 5)
}

/** the body's center (sub-pixels) for a fighter at (x, y) */
export function feetOf(f: Body, x = f.x, y = f.y): { x: number; y: number } {
  return { x, y: y + footOffsetPx(f.r) * FP }
}

/** may a body with these traits overlap tile (tx, ty)? Walls and unbroken props never; deep water with crossWater,
 * hover or fly; pits and low obstacles `=` with hover or fly; the rest (floor, grass, hazard, shallow water) always.
 * Off the grid never */
export function passable(s: SimState, tx: number, ty: number, t: MoveTraits = NONE): boolean {
  if (!inGrid(tx, ty)) return false
  const k = s.tiles[ty * COLS + tx]
  if (k === TILE.WALL || k === TILE.PROP) return false
  if (k === TILE.WATER) return !!(t.crossWater || t.hover || t.fly)
  if (k === TILE.PIT || k === TILE.LOW) return !!(t.hover || t.fly)
  return true
}

/** does a body circle (sub-pixel center, px radius) overlap a tile it may not? Exact integer circle-vs-rect */
export function bodyBlocked(s: SimState, x: number, y: number, rPx: number, t: MoveTraits = NONE): boolean {
  const r = rPx * FP
  const tx0 = Math.floor((x - r) / TILE_FP), tx1 = Math.floor((x + r) / TILE_FP)
  const ty0 = Math.floor((y - r) / TILE_FP), ty1 = Math.floor((y + r) / TILE_FP)
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (passable(s, tx, ty, t)) continue
      const nx = Math.max(tx * TILE_FP, Math.min(x, (tx + 1) * TILE_FP - 1))
      const ny = Math.max(ty * TILE_FP, Math.min(y, (ty + 1) * TILE_FP - 1))
      const dx = x - nx, dy = y - ny
      if (dx * dx + dy * dy < r * r) return true
    }
  }
  return false
}

/** is this fighter's body overlapping something it may not (a bug unless unstick() runs next) */
export function fighterBlocked(s: SimState, f: Body, x = f.x, y = f.y): boolean {
  return bodyBlocked(s, x, y + footOffsetPx(f.r) * FP, bodyRadiusPx(f.r), traitsOf(f))
}

/** the body test for a fighter at (x, y): its feet circle */
function hit(s: SimState, f: Fighter, x: number, y: number, r: number, t: MoveTraits): boolean {
  return bodyBlocked(s, x, y + footOffsetPx(f.r) * FP, r, t)
}

/** the speed multiplier (permille) from the tile under the fighter: water (deep or shallow) slows non-Water types
 * to WATER_SLOW, speeds Water types to WATER_FAST, unless the traits say otherwise; grass is 1000 unless
 * speedIn.grass */
export function terrainSpeedPermille(s: SimState, f: Fighter, waterType: boolean): number {
  const t = traitsOf(f)
  const ft = feetOf(f)
  const i = Math.floor(ft.y / TILE_FP) * COLS + Math.floor(ft.x / TILE_FP)
  if (s.tiles[i] === TILE.WATER || s.wet[i] > 0) return t.speedIn?.water ?? (waterType ? R.WATER_FAST : t.hover || t.fly ? 1000 : R.WATER_SLOW)
  if (s.tiles[i] === TILE.GRASS && s.fire[i] === 0) return t.speedIn?.grass ?? 1000
  return 1000
}

/** move one axis by d sub-pixels up to contact; returns how far it went */
function axis(s: SimState, f: Fighter, r: number, t: MoveTraits, d: number, onX: boolean): number {
  if (!d) return 0
  const free = (k: number) => !hit(s, f, onX ? f.x + k : f.x, onX ? f.y : f.y + k, r, t)
  let go = d
  if (!free(d)) {
    // the furthest free point along the step (free at 0: the body is never left overlapping)
    let lo = 0, hi = Math.abs(d)
    const sg = Math.sign(d)
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (free(sg * mid)) lo = mid; else hi = mid
    }
    go = sg * lo
  }
  if (onX) f.x += go; else f.y += go
  return go
}

/** the nearest opening sideways (signed px, 0 = none within NUDGE_MAX_PX) for a step d along one axis that is
 * blocked: the spot shifted sideways is free, and so is the step from there */
function opening(s: SimState, f: Fighter, r: number, t: MoveTraits, d: number, onX: boolean): number {
  for (let off = NUDGE_STEP_PX; off <= NUDGE_MAX_PX; off += NUDGE_STEP_PX) {
    for (const sg of [-1, 1]) {
      const o = sg * off * FP
      const ox = onX ? f.x : f.x + o, oy = onX ? f.y + o : f.y
      if (hit(s, f, ox, oy, r, t)) continue
      if (hit(s, f, onX ? ox + d : ox, onX ? oy : oy + d, r, t)) continue
      return sg * off
    }
  }
  return 0
}

/** the corner nudge: slide sideways toward the opening (by up to the step's length), then take the blocked step
 * again (so a diagonal's other axis can't undo the nudge before it pays off). Returns true if it moved */
function nudge(s: SimState, f: Fighter, r: number, t: MoveTraits, d: number, onX: boolean, off: number): boolean {
  if (!off) return false
  const side = Math.sign(off) * Math.min(Math.abs(d), Math.abs(off) * FP)
  if (axis(s, f, r, t, side, !onX) === 0) return false
  axis(s, f, r, t, d, onX)
  return true
}

/** move a fighter by (dx, dy) sub-pixels against the grid: sub-stepped, axis-separated, up to contact, with corner
 * nudging when `nudgeCorners` (walking, dodges, knockback; not the fighter push-apart) */
export function moveBody(s: SimState, f: Fighter, dx: number, dy: number, nudgeCorners = true): void {
  const t = traitsOf(f)
  const r = bodyRadiusPx(f.r)
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (SUBSTEP_PX * FP)))
  const sx = idiv(dx, n), sy = idiv(dy, n)
  for (let i = 0; i < n; i++) {
    const mx = axis(s, f, r, t, sx, true)
    const my = axis(s, f, r, t, sy, false)
    if (!nudgeCorners) continue
    if (sx && !sy && mx !== sx) nudge(s, f, r, t, sx, true, opening(s, f, r, t, sx, true))
    else if (sy && !sx && my !== sy) nudge(s, f, r, t, sy, false, opening(s, f, r, t, sy, false))
    else if (sx && sy && mx === 0 && my === 0) {
      // a diagonal slides along its free axis on its own; it only needs help when it meets a corner point head-on
      // (both axes blocked): round the corner on the axis with the nearer opening (x on a tie)
      const ox = opening(s, f, r, t, sx, true), oy = opening(s, f, r, t, sy, false)
      if (ox && (!oy || Math.abs(ox) <= Math.abs(oy))) nudge(s, f, r, t, sx, true, ox)
      else nudge(s, f, r, t, sy, false, oy)
    }
  }
}

/** push a body that overlaps a blocking tile out to the nearest free spot: rings of 2 px in 16 directions up to 2
 * tiles, else the nearest tile (4-neighbour search over the grid) its feet can stand in the middle of. This is also
 * the landing rule: a non-flier that comes onto the field over water or a pit (evolving or swapping out of a flier)
 * lands on the nearest floor. Returns true if it had to move */
export function unstick(s: SimState, f: Fighter): boolean {
  if (!fighterBlocked(s, f)) return false
  for (let d = 2; d <= 80; d += 2) {
    for (let a = 0; a < 256; a += 16) {
      const x = f.x + idiv(icos(a) * d * FP, ONE), y = f.y + idiv(isin(a) * d * FP, ONE)
      if (!fighterBlocked(s, f, x, y)) { f.x = x; f.y = y; return true }
    }
  }
  const foot = footOffsetPx(f.r) * FP
  const cx = Math.min(COLS - 1, Math.max(0, Math.floor(f.x / TILE_FP)))
  const cy = Math.min(ROWS - 1, Math.max(0, Math.floor((f.y + foot) / TILE_FP)))
  const seen = new Uint8Array(COLS * ROWS)
  const q = [cy * COLS + cx]
  seen[q[0]] = 1
  for (let h = 0; h < q.length; h++) {
    const i = q[h], tx = i % COLS, ty = (i - tx) / COLS
    const x = tx * TILE_FP + TILE_FP / 2, y = ty * TILE_FP + TILE_FP / 2 - foot
    if (!fighterBlocked(s, f, x, y)) { f.x = x; f.y = y; return true }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx, ny = ty + dy
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || seen[ny * COLS + nx]) continue
      seen[ny * COLS + nx] = 1
      q.push(ny * COLS + nx)
    }
  }
  return false
}

/** is the fighter airborne: a flier (or hover) whose feet are over deep water, a pit or a low obstacle (the renderer
 * lifts it) */
export function airborne(s: SimState, f: Body): boolean {
  const t = traitsOf(f)
  if (!t.fly && !t.hover) return false
  const ft = feetOf(f)
  const tx = Math.floor(ft.x / TILE_FP), ty = Math.floor(ft.y / TILE_FP)
  if (!inGrid(tx, ty)) return false
  const k = s.tiles[ty * COLS + tx]
  return k === TILE.WATER || k === TILE.PIT || k === TILE.LOW || s.wet[ty * COLS + tx] > 0
}
