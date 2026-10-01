// A revealed card you can grab and shake (docs/PACK_OPENING.md, §4): the card chases the pointer through a spring
// (so it lags and overshoots like something with weight), tilts with its velocity, and builds up "energy" when you
// shake it (fast changes of direction) that the aura, the glare and the sparkles feed on. Let go and it springs home,
// unless you flung it off to the side: then the scene sends it to the pile. No DOM here.

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export interface ShakePose {
  x: number; y: number;
  /** rotation in the screen plane, and the 3D tilt, in degrees */
  rz: number; rx: number; ry: number;
  /** 0-1: how hard the card is being shaken (decays when calm) */
  energy: number;
  /** 0-1: speed, for the glare */
  speed: number;
}

export class CardShake {
  x = 0; y = 0; vx = 0; vy = 0;
  /** where the pointer wants the card (offset from home, px) */
  tx = 0; ty = 0;
  held = false;
  energy = 0;
  /** 0-1: scales how far and how wildly the card moves (reduced motion: 0.3) */
  amp: number;
  private ax = 0; private ay = 0;

  constructor(amp = 1) { this.amp = amp; }

  grab() { this.held = true; this.tx = this.x / this.amp; this.ty = this.y / this.amp; }
  /** the pointer's offset from where it grabbed, plus where the card was then */
  drag(dx: number, dy: number) { this.tx = dx; this.ty = dy; }
  release() { this.held = false; this.tx = 0; this.ty = 0; }

  /** true when the card is home and still */
  get resting() { return !this.held && Math.abs(this.x) + Math.abs(this.y) < 0.4 && Math.abs(this.vx) + Math.abs(this.vy) < 4; }

  /** should letting go now fling the card away (to the next one)? `w` is the card's width */
  flingOnRelease(w: number): number {
    const far = Math.abs(this.x) > w * 1.25;
    const thrown = Math.abs(this.x) > w * 0.7 && Math.sign(this.vx) === Math.sign(this.x) && Math.abs(this.vx) > 700;
    return far || thrown ? Math.sign(this.x || this.vx || 1) : 0;
  }

  step(dt: number): ShakePose {
    let left = Math.min(0.05, Math.max(0, dt));
    // held: stiff but under-damped, so the card trails the pointer and swings past it; released: a bouncy spring home
    const k = this.held ? 520 : 210, c = 2 * Math.sqrt(k) * (this.held ? 0.42 : 0.38);
    const tx = this.tx * this.amp, ty = this.ty * this.amp;
    let ax = 0, ay = 0;
    while (left > 1e-6) {
      const h = Math.min(1 / 240, left); left -= h;
      ax = k * (tx - this.x) - c * this.vx; ay = k * (ty - this.y) - c * this.vy;
      this.vx += ax * h; this.vy += ay * h;
      this.x += this.vx * h; this.y += this.vy * h;
    }
    // energy: the jerk of a shake (acceleration flipping direction), not just speed
    const jerk = Math.hypot(ax - this.ax, ay - this.ay);
    this.ax = ax; this.ay = ay;
    if (dt > 0) {
      // below the threshold is just moving it around; above it, shaking
      this.energy = clamp(this.energy + (this.held ? Math.max(0, jerk - 9000) * 0.000006 : 0) * (dt * 60), 0, 1);
      this.energy *= Math.exp(-dt * (this.held ? 0.9 : 2.2));
    }
    const speed = Math.hypot(this.vx, this.vy);
    const a = Math.max(0.25, this.amp);
    return {
      x: this.x, y: this.y,
      rz: clamp(this.vx * 0.012 + this.x * 0.03, -28, 28) * a,
      ry: clamp(this.vx * 0.02, -34, 34) * a,
      rx: clamp(-this.vy * 0.018, -30, 30) * a,
      energy: this.energy,
      speed: clamp(speed / 2400, 0, 1),
    };
  }
}
