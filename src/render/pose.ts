// Where a fighter is drawn, as pure functions (tested headless in pose.test.ts). The rules that keep the pixel-art
// fighters still on screen at any refresh rate:
//   - interpolate in sub-pixels, round to a whole canvas pixel once, at the end;
//   - the sprite stays at its whole-number scale (docs/SPEC.md section 12): no continuous "breathing" scale, which
//     re-samples the nearest-neighbour art every frame and makes a fighter standing still shimmer;
//   - body motion (the walk hop) runs on sim time (tick + alpha), not on a count of animation frames, so a 144 Hz
//     monitor doesn't play it 2.4x faster, and it is whole pixels.
import { FP } from '../sim/fixed'
import type { SimState } from '../sim/types'

export const STEP_MS = 1000 / 60
/** the page loop runs at most this many sim steps per animation frame */
export const MAX_STEPS = 5

/** the page loop's fixed-step clock: feed it each animation frame's timestamp, run the ticks it returns, then draw
 * with `alpha` (how far past the last tick the frame is) */
export class FrameClock {
  private acc = 0
  private last = -1
  /** the ticks to run this frame (the remainder is dropped when it falls MAX_STEPS behind) */
  advance(t: number, paused = false): number {
    if (this.last < 0) this.last = t
    this.acc += Math.min(250, Math.max(0, t - this.last))
    this.last = t
    if (paused) { this.acc = 0; return 0 }
    let n = 0
    while (this.acc >= STEP_MS && n < MAX_STEPS) { this.acc -= STEP_MS; n++ }
    if (n === MAX_STEPS) this.acc = 0
    return n
  }
  reset(t: number): void { this.last = t; this.acc = 0 }
  get alpha(): number { return Math.min(1, this.acc / STEP_MS) }
}

/** one axis of a fighter's drawn position: lerp in sub-pixels, then one round to a whole canvas pixel */
export function drawnPx(prev: number, cur: number, alpha: number): number {
  return Math.round((prev + (cur - prev) * alpha) / FP)
}

/** sim time of a drawn frame, between the snapshot's tick and the current one (equal while hit-stop holds, so
 * the time never runs backwards when the hold ends) */
export function simTime(prevTick: number, tick: number, alpha: number): number {
  return prevTick + (tick - prevTick) * alpha
}

/** the walk hop in whole canvas pixels (0 standing still), on sim time */
export function walkHop(moving: boolean, time: number, p: number): number {
  return moving ? Math.round(Math.abs(Math.sin(time * 0.32 + p)) * 7) : 0
}

/** the positions the renderer interpolates from (the tick before the one shown) */
export interface Snapshot { tick: number; fighters: { x: number; y: number; on: boolean }[]; shots: Map<number, { x: number; y: number }> }

export function snapshot(s: SimState): Snapshot {
  return {
    tick: s.tick,
    fighters: s.players.map((p) => ({ x: p.fighter.x, y: p.fighter.y, on: p.active >= 0 })),
    shots: new Map(s.projectiles.map((pr) => [pr.id, { x: pr.x, y: pr.y }])),
  }
}

/** the page loop minus the drawing: runs the due ticks each animation frame, holds hit-stop (render-only: the sim
 * never sees it) and pause, and keeps `prev` one tick behind what is shown so interpolation never steps back */
export class TickLoop {
  prev: Snapshot
  /** sim ticks still held back by hit-stop */
  freeze = 0
  private clock = new FrameClock()
  /** `advance` runs one sim tick and returns the hit-stop ticks it asks for */
  constructor(readonly s: SimState, readonly advance: () => number) { this.prev = snapshot(s) }
  reset(t: number): void { this.clock.reset(t) }
  /** one sim tick now (also for tests and the screenshot tool) */
  tick(): void {
    this.prev = snapshot(this.s)
    this.freeze += this.advance()
  }
  /** one animation frame at time t (ms): returns the alpha to draw prev -> s with */
  frame(t: number, paused = false): number {
    const n = this.clock.advance(t, paused)
    for (let i = 0; i < n; i++) {
      // a held tick shows the current state: interpolation resumes from there, not from the tick before it
      // (that drew the fighters a step back on the first frame after every hit-stop)
      if (this.freeze > 0) { this.freeze--; this.prev = snapshot(this.s) }
      else this.tick()
    }
    if (paused) this.prev = snapshot(this.s)
    return this.freeze > 0 || paused ? 1 : this.clock.alpha
  }
}
