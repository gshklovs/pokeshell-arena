// The stuck probe (tests and tools only; never shipped as game content): drives one fighter headless through random
// walks and toward random reachable targets on an arena, and counts "stuck" events: an input held for over 0.5 s
// with no progress while the grid says the way is open. `npm run probe:stuck` prints the table; movement.test.ts keeps
// the rate at zero.
import { parseArena } from './arena'
import { resolveKit } from './kit'
import { createState } from './state'
import { step } from './step'
import { blocksMove, COLS, ROWS, TILE_FP, tileAt } from './terrain'
import { FP } from './fixed'
import { fixtureKit } from './testing'
import { feetOf } from './movement'
import { TILE, type ArenaFile, type Dir, type FighterKit, type MatchDef, type SimState } from './types'

export interface ProbeSize { name: string; retreat: number; move?: Record<string, unknown> }
/** small (retreat 0), medium (2), the largest (5: radius capped there), a deep-water crosser and a flier */
export const PROBE_SIZES: ProbeSize[] = [
  { name: 'small', retreat: 0 },
  { name: 'medium', retreat: 2 },
  { name: 'large', retreat: 5 },
  { name: 'crossWater', retreat: 5, move: { crossWater: true } },
  { name: 'flier', retreat: 3, move: { fly: true } },
]

export interface ProbeResult {
  /** stuck events while walking at random (holding a direction the grid says is open) */
  walkStuck: number
  /** stuck events while steering to targets along a tile path */
  seekStuck: number
  targets: number
  reached: number
  /** seconds of held input */
  seconds: number
  /** where each stuck event happened (tile) and how (w = walk, s = seek) */
  where: { tx: number; ty: number; how: 'w' | 's'; x: number; y: number; mx: number; my: number }[]
}

const STUCK_TICKS = 30
const PROGRESS = 2 * FP

function rng(seed: number): () => number {
  let x = seed >>> 0 || 1
  return () => {
    x ^= x << 13; x >>>= 0
    x ^= x >>> 17
    x ^= x << 5; x >>>= 0
    return x
  }
}

function match(arena: ArenaFile, size: ProbeSize): { def: MatchDef; s: SimState } {
  const kit: FighterKit = resolveKit(null, fixtureKit({ shape: { kind: 'self' } }, { retreat: size.retreat }))
  const k = size.move ? ({ ...kit, move: size.move } as FighterKit) : kit
  const def: MatchDef = {
    mode: '1v1', seed: 1, arena: parseArena(arena), kits: [k], raw: true, matchTicks: 1 << 30,
    players: [{ team: 0, name: 'probe', members: [0], energy: ['Colorless'] }],
  }
  const s = createState(def)
  s.phase = 'fight'
  s.phaseT = 0
  // the probe walks lava and water forever: it never loses HP
  s.players[0].members[0].hp = s.players[0].members[0].maxHp = 1 << 20
  return { def, s }
}

/** 4-neighbour tile distances to (tx, ty) over tiles the fighter may stand on */
function field(s: SimState, open: (tx: number, ty: number) => boolean, tx: number, ty: number): Int16Array {
  const d = new Int16Array(COLS * ROWS).fill(-1)
  const q = [ty * COLS + tx]
  d[q[0]] = 0
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % COLS, y = (i - x) / COLS
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || !open(nx, ny)) continue
      const j = ny * COLS + nx
      if (d[j] < 0) { d[j] = d[i] + 1; q.push(j) }
    }
  }
  return d
}

const DIRS: [Dir, Dir][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]

/** run the probe: `walkTicks` of random walking, then `targets` seeks of up to `seekTicks` each */
export function probeArena(arena: ArenaFile, size: ProbeSize, opts: { seed?: number; walkTicks?: number; targets?: number; seekTicks?: number } = {}): ProbeResult {
  const { def, s } = match(arena, size)
  const next = rng(opts.seed ?? 12345)
  const water = !!(size.move?.crossWater || size.move?.fly), pit = !!size.move?.fly
  const open = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false
    const k = s.tiles[ty * COLS + tx]
    if ((water && k === TILE.WATER) || (pit && (k === TILE.PIT || k === TILE.LOW))) return true
    return !blocksMove(s, tx, ty)
  }
  const f = () => s.players[0].fighter
  const out: ProbeResult = { walkStuck: 0, seekStuck: 0, targets: 0, reached: 0, seconds: 0, where: [] }
  const reach = (() => { const t = tileAt(feetOf(f()).x, feetOf(f()).y); return field(s, open, t.tx, t.ty) })()
  const cells: number[] = []
  for (let i = 0; i < reach.length; i++) if (reach[i] > 0) cells.push(i)
  let held = 0

  // random walk: a direction held for 0.3-1.5 s; stuck = no progress for 0.5 s while the tile ahead is open
  let dir: [Dir, Dir] = [1, 0], hold = 0
  let ax = f().x, ay = f().y, since = 0, flagged = false
  for (let t = 0; t < (opts.walkTicks ?? 3600); t++) {
    if (hold-- <= 0) { dir = DIRS[next() % 8]; hold = 18 + (next() % 72); ax = f().x; ay = f().y; since = 0; flagged = false }
    step(def, s, [{ mx: dir[0], my: dir[1], aim: 0, buttons: 0 }])
    held++
    const fi = f()
    if (Math.abs(fi.x - ax) > PROGRESS || Math.abs(fi.y - ay) > PROGRESS) { ax = fi.x; ay = fi.y; since = 0; flagged = false; continue }
    if (++since < STUCK_TICKS || flagged) continue
    const { tx, ty } = tileAt(feetOf(fi).x, feetOf(fi).y)
    const [mx, my] = dir
    const ahead = mx && my ? open(tx + mx, ty) || open(tx, ty + my) : open(tx + mx, ty + my)
    if (ahead) { out.walkStuck++; out.where.push({ tx, ty, how: 'w', x: fi.x / FP, y: fi.y / FP, mx, my }); flagged = true }
  }

  // seeks: the next tile on a 4-neighbour path, steered at with 8-way input like a player would
  for (let k = 0; k < (opts.targets ?? 30) && cells.length; k++) {
    const goal = cells[next() % cells.length]
    const gx = goal % COLS, gy = (goal - gx) / COLS
    const d = field(s, open, gx, gy)
    out.targets++
    let px = f().x, py = f().y, stall = 0
    for (let t = 0; t < (opts.seekTicks ?? 900); t++) {
      const { tx, ty } = tileAt(feetOf(f()).x, feetOf(f()).y)
      const here = d[ty * COLS + tx]
      if (here === 0) {
        const cx = tx * TILE_FP + TILE_FP / 2, cy = ty * TILE_FP + TILE_FP / 2
        if (Math.abs(f().x - cx) < 8 * FP && Math.abs(feetOf(f()).y - cy) < 8 * FP) { out.reached++; break }
      }
      if (here < 0) break // off the field the target is reachable from (should not happen)
      let wx = tx, wy = ty
      if (here > 0) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = tx + dx, ny = ty + dy
          if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && d[ny * COLS + nx] === here - 1) { wx = nx; wy = ny; break }
        }
      }
      const cx = wx * TILE_FP + TILE_FP / 2, cy = wy * TILE_FP + TILE_FP / 2
      const ex = cx - f().x, ey = cy - feetOf(f()).y
      const mx = (Math.abs(ex) > 3 * FP ? Math.sign(ex) : 0) as Dir, my = (Math.abs(ey) > 3 * FP ? Math.sign(ey) : 0) as Dir
      step(def, s, [{ mx, my, aim: 0, buttons: 0 }])
      held++
      if (Math.abs(f().x - px) > PROGRESS || Math.abs(f().y - py) > PROGRESS) { px = f().x; py = f().y; stall = 0; continue }
      if (++stall >= STUCK_TICKS) { out.seekStuck++; out.where.push({ tx, ty, how: 's', x: f().x / FP, y: f().y / FP, mx, my }); break }
    }
  }
  out.seconds = Math.round(held / 60)
  return out
}
