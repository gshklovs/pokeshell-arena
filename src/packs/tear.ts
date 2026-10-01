// The tear gesture as a pure state machine, plus the geometry of the peeling strip (docs/PACK_OPENING.md, §2).
// No DOM here: the scene feeds pointer positions in and reads `progress`, the curl and the leak glow out.
//
//   sealed ──press + drag──▶ dragging ──release before the far end──▶ settling ──spring──▶ sealed
//                              │  ▲ drag back: progress (and the glow) follow the pointer back down
//                              └──┴─ pointer crosses the far end (and the pack has arrived) ──▶ committed
//
// Progress is where the pointer is along the strip, from the edge the tear started at (0) to the far edge (1). It is
// fully reversible while dragging. Only crossing the far end commits; if the pack from pokeshell hasn't arrived yet,
// the tear holds at `hold` (92%) and commits the moment it does, if the pointer is still past the end.

export type TearState = 'sealed' | 'dragging' | 'settling' | 'committed';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export class TearModel {
  state: TearState = 'sealed';
  /** +1 tearing left to right, -1 right to left, 0 not decided yet */
  dir: -1 | 0 | 1 = 0;
  /** the tear as shown: sprung towards `target` */
  progress = 0;
  vel = 0;
  /** where the pointer says the tear should be (0-1) */
  target = 0;
  /** the pointer along the strip, unclamped: >= 1 means past the far end */
  raw = 0;
  /** the pack has arrived: committing is allowed */
  ready = false;
  /** how far the tear goes while the pack is still on its way */
  hold = 0.92;
  /** pixels of sideways movement before a press becomes a tear */
  deadzone = 8;
  private left = 0;
  private width = 1;
  private startX = 0;

  /** a press on the strip; left/width is the pack's box on screen */
  begin(x: number, left: number, width: number) {
    if (this.state === 'committed') return;
    this.state = 'dragging';
    this.left = left; this.width = Math.max(1, width); this.startX = x;
    if (this.dir) this.follow(x);
  }

  /** the pointer moved; true when this move committed the tear */
  move(x: number): boolean {
    if (this.state !== 'dragging') return false;
    if (!this.dir) {
      if (Math.abs(x - this.startX) < this.deadzone) return false;
      this.dir = x > this.startX ? 1 : -1;
    }
    this.follow(x);
    return this.tryCommit();
  }

  private follow(x: number) {
    this.raw = this.dir >= 0 ? (x - this.left) / this.width : (this.left + this.width - x) / this.width;
    this.target = clamp(this.raw, 0, 1);
  }

  /** let go before the far end: the strip springs back closed */
  release() {
    if (this.state !== 'dragging') return;
    this.state = 'settling';
    this.target = 0;
  }

  /** the pack arrived; true when that committed a tear that was waiting past the far end */
  setReady(): boolean {
    this.ready = true;
    return this.state === 'dragging' && this.tryCommit();
  }

  /** drive the tear without a pointer (auto-tear, keyboard, skip): p is the raw position, > 1 to finish */
  drive(p: number): boolean {
    if (this.state === 'committed') return false;
    this.state = 'dragging';
    if (!this.dir) this.dir = 1;
    this.raw = p; this.target = clamp(p, 0, 1);
    return this.tryCommit();
  }

  private tryCommit(): boolean {
    if (this.raw < 1) return false;
    if (!this.ready) { this.target = Math.min(this.target, this.hold); return false; }
    this.commit();
    return true;
  }

  /** force it open (the scene's finish: skip, auto-tear) */
  commit() { this.state = 'committed'; this.target = 1; }

  get committed() { return this.state === 'committed'; }

  /** advance the spring by dt seconds */
  step(dt: number) {
    if (this.state === 'committed') {
      this.progress += (1 - this.progress) * Math.min(1, dt * 24); this.vel = 0;
      return;
    }
    // a stiff, nearly critically damped follow while dragging; a softer, bouncy spring home after a release
    const dragging = this.state === 'dragging';
    const k = dragging ? 620 : 150, c = 2 * Math.sqrt(k) * (dragging ? 0.92 : 0.5);
    let left = Math.min(0.1, Math.max(0, dt));
    while (left > 1e-6) {
      const h = Math.min(1 / 240, left); left -= h;
      this.vel += (k * (this.target - this.progress) - c * this.vel) * h;
      this.progress += this.vel * h;
      if (this.progress < 0) { this.progress = 0; this.vel = -this.vel * 0.25; }
      if (this.progress > 1) { this.progress = 1; this.vel = 0; }
    }
    if (this.state === 'settling' && this.progress < 0.002 && Math.abs(this.vel) < 0.02) {
      this.progress = 0; this.vel = 0; this.state = 'sealed'; this.dir = 0;
    }
  }
}

/**
 * The part of the strip that is torn, in 0..1 across the pack: from the edge the tear started at up to the tear front
 * (the pointer, through the light spring). Everything ahead of it is sealed: no cut, no mouth, no light. Dragging back
 * shrinks it, so the rip mends behind the retreating pointer.
 */
export function cutSpan(progress: number, dir: -1 | 0 | 1): [number, number] {
  const p = clamp(progress, 0, 1);
  return dir < 0 ? [1 - p, 1] : [0, p];
}

/** the light leaking out of the tear: grows with progress and with how big the pack's best card is (0-1) */
export function leakGlow(progress: number, intensity: number) {
  const p = clamp(progress, 0, 1), i = clamp(intensity, 0, 1);
  return {
    alpha: p <= 0 ? 0 : Math.min(1, Math.pow(p, 0.7) * (0.38 + 0.62 * i)),
    /** width of the glow, as a fraction of its full width */
    sx: 0.12 + 0.88 * p,
    /** height of the glow plume */
    sy: 0.2 + p * (0.45 + 0.95 * i),
    /** the light rays above the opening (only the bigger hits) */
    rays: i >= 0.75 ? Math.max(0, (p - 0.25) / 0.75) * i : 0,
  };
}

/** one segment of the peeling strip, relative to the one before it (degrees) */
export interface Seg { rz: number; ry: number; rx: number; torn: number }

const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * The strip as a chain of `n` segments, from the hinge (the untorn end) to the free end. Each gets a rotation relative
 * to the one before it, so the chain bends: a fold at the tear front (spread over ~2 segments), then a steady curl
 * (the foil rolls towards the viewer and upwards), plus a little crinkle per segment. `lift` (-1..1) is the pointer
 * above (+) or below (-) the strip; `jitter` is a per-segment random in -1..1. Mirrored by the scene for dir = -1.
 */
export function curlChain(progress: number, n: number, lift = 0, jitter: number[] = [], curlBoost = 0): Seg[] {
  const p = clamp(progress, 0, 1);
  const t = p * n; // torn length in segments
  // the fold lifts the strip off the pack (more when the pointer pulls upwards); the curl bends it into an arc that
  // rolls slightly towards the viewer. Kept under ~110 deg in total so the strip leans back, never flips over.
  const fold = clamp(14 + 40 * p + lift * 28, 4, 82);
  const foldY = 10 + 16 * p;
  const cz = 1.35 + curlBoost * 3, cy = (1.4 + 1.2 * p) * (1 + curlBoost * 2);
  const out: Seg[] = [];
  for (let k = 0; k < n; k++) {
    // e: how far past the tear front the free-end side of this segment is, in segments
    const e = k + 1 + t - n;
    const torn = clamp(e, 0, 1);
    // the fold is spread over ~6 segments (in-plane bends of a few degrees each, so the joints stay closed)
    const g = smooth(0, 6, e) - smooth(0, 6, e - 1);
    const j = jitter[k] ?? 0;
    out.push({
      rz: fold * g + cz * torn,
      ry: foldY * g + cy * torn,
      rx: j * 4 * torn,
      torn,
    });
  }
  return out;
}
