// The reel's motion as a pure model (docs/PACK_ROLL.md, "The timeline"): wind-up, launch, cruise for as long as the
// host takes, lock onto the rolled set beyond the visible edge, settle with a deceleration that matches the cruise
// speed, a notch bounce, or an interrupt that snaps (or vanishes) at once. Positions are in tiles: tile i is centred
// under the pointer when x == i. Times are ms since the roll started. No DOM.
import { Strip, hash01 } from './strip';
import { isRareOdds, type RollSet } from './types';

export interface ReelConfig {
  /** cruise speed, tiles per second */
  cruise: number;
  /** the pull-back before the launch, ms */
  windup: number;
  /** how far it pulls back, tiles */
  pullback: number;
  /** from rest to cruise, ms */
  launch: number;
  /** the settle once the result is in: a common pack, a vintage one (ms) */
  settle: number;
  rareSettle: number;
  /** the landing tile is at least this far ahead when it's chosen (tiles): never on screen before */
  lead: number;
  /** tiles further than this from the centre are not drawn */
  fade: number;
  /** the notch bounce after landing, ms and tiles */
  bounce: number;
  bounceAmp: number;
  /** reduced motion: a new wrapper every `step` ms, cross-faded over `xfade` ms */
  step: number;
  xfade: number;
  /** how far from the tile's centre it may stop (tiles, either way; < 0.5 so the marker is always on the rolled set) */
  edge: number;
  /** the settle's ease-out exponent: common, vintage */
  k: number; rareK: number;
}

/**
 * v2 (case-opening strip): half of v1's time end to end. v1 was a 0.12 s pull-back + 0.3 s launch, a 0.8 s / 1.35 s
 * settle and a 0.45 s exit (host answering at once: 1.67 s common, 2.22 s vintage); v2 launches in 0.18 s with no
 * pull-back, settles in 0.4 s / 0.68 s and exits in 0.2 s (0.78 s / 1.06 s). The window shows 2.2 tiles each side,
 * so the landing (2.4 tiles ahead, plus up to `edge`: it stops inside the wrapper, sometimes near its edge) is still never seen before it is chosen.
 */
export const REEL: ReelConfig = {
  cruise: 22, windup: 0, pullback: 0, launch: 180, settle: 400, rareSettle: 680,
  lead: 2.4, fade: 2.2, bounce: 0, bounceAmp: 0, step: 420, xfade: 110, edge: 0.3, k: 4, rareK: 5.5,
};

export type ReelPhase = 'spinning' | 'settling' | 'landed' | 'interrupted' | 'failed';

export interface ReelEvent {
  type: 'start' | 'tick' | 'lock' | 'tease' | 'land' | 'interrupt' | 'fail';
  index?: number;
  set?: RollSet;
  speed?: number;
  rare?: boolean;
  snapped?: boolean;
}

export interface Landing {
  index: number;
  set: RollSet;
  rare: boolean;
  oneIn: number | null;
  /** where it stops: index + a seeded offset within ±edge (sometimes near a tile's edge; always on this tile) */
  target: number;
  /** the settle curve: x = x0 + (target - x0) * (1 - (1 - u)^k), u = (t - t0) / dur */
  t0: number; x0: number; dur: number; k: number;
}

const smooth = (u: number) => u * u * (3 - 2 * u);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export class ReelModel {
  x = 0;
  /** tiles per second */
  v = 0;
  phase: ReelPhase = 'spinning';
  landing: Landing | null = null;
  /** when it stopped (landed, interrupted or failed), ms */
  stoppedAt = -1;
  readonly cfg: ReelConfig;
  private overrides = new Map<number, RollSet>();
  private pending: { set: RollSet; oneIn: number | null; at: number } | null = null;
  private tickIdx = 0;
  private started = false;
  private teased = false;
  private landedEmitted = false;

  /** tiles from here on come from `strip`; the ones before stay on the strip they were first seen with */
  private stripFrom = -Infinity;
  private earlier: Strip | null = null;

  constructor(public strip: Strip, start: RollSet, readonly reduced = false, cfg: Partial<ReelConfig> = {}) {
    this.cfg = { ...REEL, ...cfg };
    this.overrides.set(0, start);
  }

  /** the set on tile i: the start tile, the landing, or the strip */
  setAt(i: number): RollSet | null {
    return this.overrides.get(i) ?? (i < this.stripFrom && this.earlier ? this.earlier.at(i) : this.strip.at(i));
  }

  /**
   * The real draw arrived (the sets list was late): tiles beyond the visible edge come from it, so no tile ever
   * changes while it's on screen. A landing already locked keeps its tile.
   */
  useStrip(strip: Strip) {
    // before the reel has moved (the list was cached: it lands a microtask after the start) nothing has really been
    // seen yet but the start tile, so the whole strip becomes real
    if (!this.started) { this.strip = strip; return; }
    this.earlier = this.earlier ?? this.strip;
    this.stripFrom = Math.floor(this.x + this.cfg.fade) + 1;
    this.strip = strip;
  }

  /** the landing's set gained its art / chance (same id): swap the tile's data, not its identity */
  upgradeLanding(set: RollSet) {
    if (this.pending && this.pending.set.id === set.id) this.pending.set = set;
    if (this.landing && this.landing.set.id === set.id) { this.landing.set = set; this.overrides.set(this.landing.index, set); }
  }

  /** when the launch reaches the cruise speed (a result can't start the settle before this) */
  get cruiseAt() { return this.reduced ? 0 : this.cfg.windup + this.cfg.launch; }

  get active() { return this.phase === 'spinning' || this.phase === 'settling'; }

  /** the host's answer is in (the reel may still be waiting for the cruise before it locks) */
  get resolved() { return !!this.pending; }

  /** the position while nothing is known: pull back, launch, cruise (reduced: hold, cross-fade, hold ...) */
  spinX(t: number): number {
    const c = this.cfg;
    if (this.reduced) {
      const n = Math.floor(t / c.step), f = (t - n * c.step - (c.step - c.xfade)) / c.xfade;
      return n + smooth(clamp(f, 0, 1));
    }
    if (t <= 0) return 0;
    if (t < c.windup) return -c.pullback * smooth(t / c.windup);
    const tau = (t - c.windup) / 1000, L = c.launch / 1000;
    if (tau < L) return -c.pullback + 0.5 * (c.cruise / L) * tau * tau;
    return -c.pullback + 0.5 * c.cruise * L + c.cruise * (tau - L);
  }

  /** the host answered: the reel will settle on this set */
  resolve(set: RollSet, oneIn: number | null | undefined, t: number) {
    if (!this.active || this.pending) return;
    this.pending = { set, oneIn: oneIn ?? set.oneIn ?? null, at: t };
  }

  /** the host failed: stop where it is */
  fail(t: number): ReelEvent[] {
    if (!this.active) return [];
    this.phase = 'failed'; this.stoppedAt = t; this.v = 0;
    return [{ type: 'fail' }];
  }

  /**
   * The player grabbed the pack. With a result, snap onto it (the next tile becomes the landing if it wasn't locked
   * yet, and the reel jumps there); without one, stop where it is. Synchronous: the caller resolves `settled` next.
   */
  interrupt(t: number): ReelEvent[] {
    if (!this.active) return [];
    if (this.pending && !this.landing) this.lockAt(t, Math.round(this.x) + 1);
    this.phase = 'interrupted'; this.stoppedAt = t; this.v = 0;
    if (this.landing) {
      this.x = this.landing.index;
      return [{ type: 'interrupt', snapped: true, set: this.landing.set, index: this.landing.index, rare: this.landing.rare }];
    }
    return [{ type: 'interrupt', snapped: false }];
  }

  private lockAt(t: number, index: number, x0 = this.x, v0 = this.cfg.cruise) {
    const p = this.pending!;
    const c = this.cfg, rare = isRareOdds(p.oneIn);
    const dur = this.reduced ? c.xfade * 1.4 : rare ? c.rareSettle : c.settle;
    const off = this.reduced ? 0 : (hash01(this.strip.seed ^ 0x5bd1e995, index) * 2 - 1) * c.edge;
    const target = index + off;
    const D = target - x0;
    // the suspense is in the shape: a steep ease-out (k = 4, a vintage 5.5) spends the first third of the time on most
    // of the distance and the rest crawling the last tile under the marker. It starts at or above the cruise speed
    // (never a visible brake at the lock): a longer landing distance only makes that first rush faster.
    let k = this.reduced ? 1 : rare ? c.rareK : c.k;
    if (!this.reduced && (k * D) / (dur / 1000) < v0 * 0.9) k = (v0 * 0.9 * dur / 1000) / Math.max(1e-3, D);
    this.overrides.set(index, p.set);
    this.landing = { index, set: p.set, rare, oneIn: p.oneIn, target, t0: t, x0, dur, k };
  }

  /** advance to time t (ms since the roll started); returns what happened on the way */
  update(t: number): ReelEvent[] {
    const ev: ReelEvent[] = [];
    const c = this.cfg;
    if (!this.started && (this.reduced || t >= c.windup)) { this.started = true; if (this.active) ev.push({ type: 'start' }); }
    if (this.phase === 'spinning') {
      const lockT = this.pending ? Math.max(this.pending.at, this.cruiseAt) : Infinity;
      if (t >= lockT) {
        const x0 = this.spinX(lockT);
        const index = this.reduced ? Math.floor(x0) + 1 : Math.ceil(x0 + c.lead + c.edge);
        this.lockAt(lockT, index, x0);
        this.phase = 'settling';
        ev.push({ type: 'lock', set: this.landing!.set, index, rare: this.landing!.rare });
      } else {
        this.x = this.spinX(t);
        this.v = this.reduced || t < c.windup ? 0 : t < this.cruiseAt ? c.cruise * (t - c.windup) / c.launch : c.cruise;
      }
    }
    if (this.phase === 'settling') {
      const L = this.landing!;
      const u = clamp((t - L.t0) / L.dur, 0, 1), D = L.target - L.x0;
      if (this.reduced) { this.x = L.x0 + D * smooth(u); this.v = 0; }
      else { this.x = L.x0 + D * (1 - Math.pow(1 - u, L.k)); this.v = u < 1 ? (L.k * D / (L.dur / 1000)) * Math.pow(1 - u, L.k - 1) : 0; }
      if (L.rare && !this.teased && L.index - this.x < c.fade + 0.3) { this.teased = true; ev.push({ type: 'tease', set: L.set, index: L.index, rare: true }); }
      if (u >= 1) { this.x = L.target; this.v = 0; this.phase = 'landed'; this.stoppedAt = L.t0 + L.dur; }
    }
    if (this.phase === 'landed' && !this.reduced) {
      const b = (t - this.stoppedAt) / c.bounce;
      this.x = this.landing!.target + (b < 1 ? c.bounceAmp * Math.sin(Math.PI * b) * (1 - b) : 0);
    }
    // the ratchet: one tick per tile crossing the pointer (at most one per update: a frame can only show one)
    const ti = Math.floor(this.x + 0.5);
    if (ti > this.tickIdx) {
      this.tickIdx = ti;
      if (this.phase === 'spinning' || this.phase === 'settling' || this.phase === 'landed') {
        const s = this.setAt(ti);
        ev.push({ type: 'tick', index: ti, set: s ?? undefined, speed: clamp(this.v / c.cruise, 0, 1), rare: isRareOdds(s?.oneIn) });
      }
    }
    if (this.phase === 'landed' && !this.landedEmitted) {
      this.landedEmitted = true;
      ev.push({ type: 'land', set: this.landing!.set, index: this.landing!.index, rare: this.landing!.rare });
    }
    return ev;
  }
}
