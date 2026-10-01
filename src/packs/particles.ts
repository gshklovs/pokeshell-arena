// A 2D-canvas particle layer over the scene: ambient motes, tear sparks, reveal bursts per effect family.
import type { Fx } from './types';

type Kind = 'mote' | 'spark' | 'glitter' | 'confetti' | 'star' | 'coin' | 'petal' | 'ember' | 'shred' | 'glint' | 'fleck' | 'shard';
interface P {
  kind: Kind; x: number; y: number; vx: number; vy: number; life: number; max: number;
  size: number; rot: number; vr: number; color: string; drag: number; grav: number; tw: number;
  /** a shred's other side (the silver lining) */
  color2?: string;
}

const RAINBOW = ['#ff6fb5', '#ffb86b', '#fff27a', '#7dff9c', '#6fd8ff', '#9f8bff', '#ff8af0'];

export class Particles {
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private ps: P[] = [];
  private raf = 0;
  private last = 0;
  private dpr = 1;
  private w = 0; private h = 0;
  enabled = true;
  motes = true;
  moteColor = 'rgba(255,255,255,.7)';

  constructor(parent: HTMLElement) {
    this.cv = document.createElement('canvas');
    this.cv.className = 'pk-particles';
    parent.appendChild(this.cv);
    this.g = this.cv.getContext('2d')!;
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height;
    this.cv.width = Math.max(1, Math.round(r.width * this.dpr)); this.cv.height = Math.max(1, Math.round(r.height * this.dpr));
  }

  /** the most particles alive at once: bursts past it are dropped, so a frame never has more than this to draw */
  cap = 700;
  get count() { return this.ps.length; }

  private add(p: Partial<P> & { kind: Kind; x: number; y: number }) {
    if (!this.enabled || this.ps.length >= this.cap) return;
    this.ps.push({ vx: 0, vy: 0, life: 0, max: 1, size: 3, rot: Math.random() * 6.28, vr: 0, color: '#fff', drag: 0.98, grav: 0, tw: Math.random() * 6.28, ...p });
  }

  /** sparks from the tear line (x0..x1 at y), coloured by the pack's best card */
  tearSparks(x0: number, x1: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.random() * (x1 - x0);
      this.add({ kind: 'spark', x, y, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 160, max: 0.35 + Math.random() * 0.45, size: 0.5 + Math.random() * 0.8, color, drag: 0.93, grav: 380 });
    }
  }

  /**
   * fine light rising out of an opening (x0..x1 at y): hairline four-point glints that twinkle and drift up, or,
   * for gold, real flecks of gold leaf that turn and catch the light as they fall
   */
  glints(x0: number, x1: number, y: number, colors: string[], n: number, gold = false) {
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.random() * (x1 - x0), color = colors[(Math.random() * colors.length) | 0];
      if (gold) this.add({ kind: 'fleck', x, y, vx: (Math.random() - 0.5) * 70, vy: -90 - Math.random() * 150, max: 0.9 + Math.random() * 0.9, size: 0.8 + Math.random() * 1.6, color, drag: 0.95, grav: 150, vr: (Math.random() - 0.5) * 14, tw: Math.random() * 6.28 });
      else this.add({ kind: 'glint', x, y, vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 90, max: 0.6 + Math.random() * 0.8, size: 2 + Math.random() * 3.2, color, drag: 0.96, grav: -10 });
    }
  }

  /**
   * foil shreds torn off along the edge (x0..x1 at y): tiny two-sided flakes, print colour on one side and the silver
   * lining on the other, that flutter and fall. `dir` pushes them along the tear.
   */
  shreds(x0: number, x1: number, y: number, color: string, n: number, dir = 0) {
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.random() * (x1 - x0);
      this.add({ kind: 'shred', x, y: y + (Math.random() - 0.5) * 4, vx: dir * (40 + Math.random() * 120) + (Math.random() - 0.5) * 140, vy: -60 - Math.random() * 220,
        max: 0.7 + Math.random() * 0.9, size: 1.2 + Math.random() * 2.4, color, color2: '#e9edf4', drag: 0.94, grav: 520, vr: (Math.random() - 0.5) * 30, tw: Math.random() * 6.28 });
    }
  }

  /** sparkles around a card's edge (a w x h box centred at x, y, turned by rot radians): the aura of a held card */
  edgeSparkles(x: number, y: number, w: number, h: number, rot: number, colors: string[], n: number, speed = 60) {
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      // a point on the perimeter, then pushed a touch outwards
      const t = Math.random() * 2 * (w + h);
      let px: number, py: number, nx: number, ny: number;
      if (t < w) { px = t - w / 2; py = -h / 2; nx = 0; ny = -1; }
      else if (t < w + h) { px = w / 2; py = t - w - h / 2; nx = 1; ny = 0; }
      else if (t < 2 * w + h) { px = t - w - h - w / 2; py = h / 2; nx = 0; ny = 1; }
      else { px = -w / 2; py = t - 2 * w - h - h / 2; nx = -1; ny = 0; }
      const wx = x + px * c - py * s, wy = y + px * s + py * c;
      const vx = (nx * c - ny * s) * speed * (0.4 + Math.random()), vy = (nx * s + ny * c) * speed * (0.4 + Math.random()) - 20;
      const gold = colors.includes('#ffe07a');
      const kind: Kind = gold && Math.random() < 0.45 ? 'fleck' : Math.random() < 0.5 ? 'glint' : Math.random() < 0.5 ? 'spark' : 'glitter';
      this.add({ kind, x: wx, y: wy, vx, vy, max: 0.45 + Math.random() * 0.7, size: kind === 'glint' ? 2.5 + Math.random() * 4 : kind === 'fleck' ? 0.8 + Math.random() * 1.5 : 0.5 + Math.random() * 1.1, vr: (Math.random() - 0.5) * 12,
        color: colors[(Math.random() * colors.length) | 0], drag: 0.93, grav: kind === 'glitter' ? 60 : 0 });
    }
  }

  /** the reveal burst at (x, y): its shape depends on the effect family, its size on intensity (0-1) */
  burst(x: number, y: number, fx: Fx, intensity: number, shiny = false) {
    const k = Math.max(0.2, intensity);
    const ring = (n: number, speed: number, kind: Kind, colors: string[], size: [number, number], life: [number, number], grav = 0) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.9);
        this.add({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, max: life[0] + Math.random() * (life[1] - life[0]),
          size: size[0] + Math.random() * (size[1] - size[0]), color: colors[(Math.random() * colors.length) | 0], drag: 0.955, grav, vr: (Math.random() - 0.5) * 12 });
      }
    };
    switch (fx) {
      case 'plain': ring(10 * k, 180, 'glitter', ['#ffffff'], [1, 2], [0.3, 0.6]); break;
      case 'reverse': ring(26, 260, 'glitter', ['#ffffff', '#dbe6ff', '#b9c8e8'], [1, 2.4], [0.4, 0.9]); break;
      case 'holo': ring(46, 420, 'spark', ['#ffffff', '#9fe7ff', '#6fa8ff'], [1.2, 2.4], [0.5, 1.1]); ring(30, 200, 'glitter', ['#e8fbff'], [1, 2.4], [0.8, 1.4]); break;
      case 'full-art': ring(80, 560, 'spark', ['#ffffff', '#d8c8ff', '#9ff3ff', '#ffd1f2'], [1.4, 3], [0.6, 1.3]); ring(40, 240, 'star', ['#ffffff', '#efe6ff'], [4, 9], [0.8, 1.6]); break;
      case 'radiant': ring(90, 640, 'spark', ['#fff7c2', '#ffb347', '#ffffff'], [1.6, 3.2], [0.6, 1.2]); ring(30, 260, 'ember', ['#ffcf6b', '#ff8a3d'], [2, 4], [1, 1.8], -40); break;
      case 'shiny': ring(50, 360, 'star', ['#ffffff', '#e9e1ff', '#c6b6ff'], [4, 10], [0.9, 1.8]); ring(40, 220, 'glitter', ['#ffffff'], [1, 2.4], [1, 1.6]); break;
      case 'alt-art': ring(60, 300, 'petal', ['#ffd6ec', '#fff2c8', '#c9f5ea', '#e6dcff'], [4, 8], [1.4, 2.6], 30); ring(40, 180, 'mote', ['rgba(255,240,250,.9)'], [2, 5], [1.2, 2.2], -20); break;
      case 'rainbow': ring(150, 700, 'confetti', RAINBOW, [3, 7], [1, 2], 260); ring(60, 460, 'spark', RAINBOW, [1.4, 3], [0.6, 1.2]); break;
      case 'gold': ring(120, 760, 'coin', ['#ffe07a', '#f5c542', '#fff3b0', '#d9a21e'], [4, 8], [1.2, 2.2], 520); ring(90, 520, 'spark', ['#fff6c8', '#ffd35a', '#ffffff'], [1.6, 3.4], [0.6, 1.4]); ring(50, 240, 'glitter', ['#fff8d8'], [1.4, 3], [1, 2]); break;
    }
    if (shiny) ring(30, 300, 'star', ['#ffffff', '#fffbe0'], [5, 11], [1, 1.9]);
  }

  /** the reveal's shards: thin bright slivers of light flying out of (x, y), pointed along their flight */
  shards(x: number, y: number, colors: string[], n: number, speed = 900) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.75);
      this.add({ kind: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, max: 0.45 + Math.random() * 0.5, size: 0.6 + Math.random() * 1.1,
        color: colors[(Math.random() * colors.length) | 0], drag: 0.9, grav: 0 });
    }
  }

  /** fine glitter drifting down the whole screen (the gold / SIR reveal): gold leaf for gold, hairline glints else */
  glitterRain(colors: string[], n: number, gold = false) {
    for (let i = 0; i < n; i++) {
      this.add({ kind: gold && Math.random() < 0.6 ? 'fleck' : 'glint', x: Math.random() * this.w, y: -10 - Math.random() * this.h * 0.4, vx: (Math.random() - 0.5) * 30,
        vy: 40 + Math.random() * 70, max: 2.6 + Math.random() * 2, size: gold ? 0.9 + Math.random() * 1.6 : 1.8 + Math.random() * 3, color: colors[(Math.random() * colors.length) | 0],
        drag: 0.995, grav: 12, vr: (Math.random() - 0.5) * 8, tw: Math.random() * 6.28 });
    }
  }

  /** gentle glitter falling from the top (the summary's confetti for a big pack) */
  rain(color: string[], n: number) {
    for (let i = 0; i < n; i++) this.add({ kind: 'confetti', x: Math.random() * this.w, y: -10 - Math.random() * this.h * 0.5, vx: (Math.random() - 0.5) * 40, vy: 60 + Math.random() * 90, max: 4 + Math.random() * 2, size: 3 + Math.random() * 4, color: color[(Math.random() * color.length) | 0], drag: 0.995, grav: 20, vr: (Math.random() - 0.5) * 8 });
  }

  clear() { this.ps.length = 0; }

  private spawnMotes(dt: number) {
    if (!this.motes || !this.enabled) return;
    if (Math.random() < dt * 9) this.add({ kind: 'mote', x: Math.random() * this.w, y: this.h + 10, vx: (Math.random() - 0.5) * 8, vy: -8 - Math.random() * 18, max: 7 + Math.random() * 6, size: 0.8 + Math.random() * 2.2, color: this.moteColor, drag: 1, grav: 0 });
  }

  private loop(now: number) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000); this.last = now;
    this.spawnMotes(dt);
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    g.globalCompositeOperation = 'lighter';
    let j = 0;
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      p.life += dt;
      if (p.life >= p.max || p.y > this.h + 60) continue;
      p.vx *= Math.pow(p.drag, dt * 60); p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.tw += dt * 10;
      const f = 1 - p.life / p.max;
      const a = p.kind === 'mote' ? Math.min(1, p.life / 1.5) * Math.min(1, f * 3) * 0.55 : Math.min(1, f * 2.2);
      g.globalAlpha = Math.max(0, a);
      g.fillStyle = p.color; g.strokeStyle = p.color;
      switch (p.kind) {
        case 'mote': case 'ember': g.beginPath(); g.arc(p.x, p.y, p.size, 0, 6.283); g.fill(); break;
        case 'spark': {
          g.lineWidth = p.size; g.lineCap = 'round'; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); g.stroke(); break;
        }
        case 'glitter': { const s = p.size * (0.6 + 0.4 * Math.sin(p.tw)); g.fillRect(p.x - s, p.y - s, s * 2, s * 2); break; }
        case 'star': {
          const s = p.size * (0.55 + 0.45 * Math.sin(p.tw * 0.8)) * f;
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot * 0.2);
          g.beginPath(); g.moveTo(0, -s); g.quadraticCurveTo(0, 0, s, 0); g.quadraticCurveTo(0, 0, 0, s); g.quadraticCurveTo(0, 0, -s, 0); g.quadraticCurveTo(0, 0, 0, -s); g.fill();
          g.restore(); break;
        }
        case 'confetti': case 'petal': {
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.abs(Math.cos(p.tw * 0.3)) + 0.15);
          g.globalCompositeOperation = 'source-over';
          if (p.kind === 'petal') { g.beginPath(); g.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, 6.283); g.fill(); }
          else g.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
          g.restore(); g.globalCompositeOperation = 'lighter'; break;
        }
        case 'shred': {
          // a flake turning over: the visible side flips between the print and the silver lining
          const flip = Math.cos(p.tw * 0.9);
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot * 0.25); g.scale(Math.abs(flip) * 0.9 + 0.1, 1);
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = flip > 0 ? p.color : (p.color2 ?? '#dfe4ec');
          const z = p.size;
          g.beginPath(); g.moveTo(-z, -z * 0.6); g.lineTo(z * 0.9, -z * 0.8); g.lineTo(z * 0.6, z * 0.7); g.lineTo(-z * 0.8, z * 0.5); g.closePath(); g.fill();
          if (flip < -0.6) { g.globalAlpha *= 0.9; g.fillStyle = '#ffffff'; g.fillRect(-z * 0.3, -z * 0.3, z * 0.5, z * 0.3); }
          g.restore(); g.globalCompositeOperation = 'lighter'; break;
        }
        case 'shard': {
          // a sliver: long and thin, sharp at the front, fading at the tail
          const len = 6 + Math.hypot(p.vx, p.vy) * 0.03, ang = Math.atan2(p.vy, p.vx), w = p.size;
          g.save(); g.translate(p.x, p.y); g.rotate(ang);
          g.beginPath(); g.moveTo(len * 0.35, 0); g.lineTo(-len, -w); g.lineTo(-len, w); g.closePath(); g.fill();
          g.restore(); break;
        }
        case 'glint': {
          // a hairline four-point star: two crossed tapered lines, the long one vertical, twinkling
          const s = p.size * (0.35 + 0.65 * Math.abs(Math.sin(p.tw * 0.9))) * Math.min(1, f * 2);
          const hw = Math.max(0.25, s * 0.09);
          g.beginPath(); g.moveTo(p.x, p.y - s); g.lineTo(p.x + hw, p.y); g.lineTo(p.x, p.y + s); g.lineTo(p.x - hw, p.y); g.closePath();
          g.moveTo(p.x - s * 0.6, p.y); g.lineTo(p.x, p.y + hw); g.lineTo(p.x + s * 0.6, p.y); g.lineTo(p.x, p.y - hw); g.closePath(); g.fill();
          g.fillStyle = '#ffffff'; g.fillRect(p.x - hw, p.y - hw, hw * 2, hw * 2);
          break;
        }
        case 'fleck': {
          // gold leaf: a tiny irregular quad turning over; it flashes white when it faces the light
          const turn = Math.cos(p.tw * 1.3);
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.abs(turn) * 0.85 + 0.15);
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = turn > 0.82 ? '#fffbe8' : p.color;
          const z = p.size;
          g.beginPath(); g.moveTo(-z, -z * 0.5); g.lineTo(z * 0.8, -z * 0.7); g.lineTo(z, z * 0.4); g.lineTo(-z * 0.6, z * 0.6); g.closePath(); g.fill();
          g.restore(); g.globalCompositeOperation = 'lighter'; break;
        }
        case 'coin': {
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot * 0.3); g.scale(Math.abs(Math.cos(p.tw * 0.5)) + 0.08, 1);
          g.globalCompositeOperation = 'source-over';
          g.beginPath(); g.arc(0, 0, p.size, 0, 6.283); g.fill();
          g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(-p.size * 0.3, -p.size * 0.3, p.size * 0.35, 0, 6.283); g.fill();
          g.restore(); g.globalCompositeOperation = 'lighter'; break;
        }
      }
      this.ps[j++] = p;
    }
    this.ps.length = j;
    g.globalAlpha = 1;
  }

  destroy() { cancelAnimationFrame(this.raf); this.cv.remove(); }
}
