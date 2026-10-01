// The reel, drawn into one canvas over the scene (docs/PACK_ROLL.md, "What it looks like"): a case-opening strip of
// wrappers on rarity plates scrolling under a fixed centre marker, a motion ghost at speed, the landing flash, the
// landed wrapper growing into the pack, and the gold rays and sparks of a vintage landing. Per frame it is drawImage /
// fillRect of bitmaps cached at the device's resolution (the plates, the band, the marker): crisp edges, no filters.
import type { ReelModel } from './reel';
import type { TileCache } from './tiles';
import { TIER_COLOURS, rollTier, type RollSet, type RollTier } from './types';

export interface Geometry {
  /** the canvas's css size */
  w: number; h: number;
  /** the pack's box (where the landed wrapper ends up), css px, relative to the canvas */
  cx: number; cy: number; tw: number; th: number;
}

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; col: string }

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (u: number) => u * u * (3 - 2 * u);
/** a wrapper in the strip, as a share of the pack's width */
export const TILE = 0.56;
/** how long a vintage landing's rays burn, ms */
export const RAYS_MS = 900;

/** "1 in 61", "1 in 4.7" (game/packs.ts oneInText, repeated here to keep the module free of the game) */
export function oneIn(n: number | null | undefined): string {
  if (!n || !isFinite(n)) return '';
  return `1 in ${n >= 10 ? Math.round(n) : Math.round(n * 10) / 10}`;
}

/** the strip's measures for a pack `tw` wide: the wrapper, its plate, the step from one tile to the next (css px) */
export function stripLayout(tw: number) {
  const w = tw * TILE, h = w * 1.6;
  const pw = w * 1.16, ph = h * 1.13;
  return { w, h, pw, ph, step: pw + Math.max(5, tw * 0.035) };
}

/** a tile d tiles from the marker: its x offset (css px) and alpha (fading out at the window's ends) */
export function stripAt(d: number, tw: number, fade: number) {
  const { step } = stripLayout(tw);
  return { x: d * step, alpha: clamp((fade - Math.abs(d)) / 0.55, 0, 1) };
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c;
}

export class Renderer {
  private g: CanvasRenderingContext2D;
  private geo: Geometry = { w: 1, h: 1, cx: 0, cy: 0, tw: 1, th: 1.6 };
  private dpr = 1;
  private rays: HTMLCanvasElement;
  private plates = new Map<RollTier, HTMLCanvasElement>();
  private band: HTMLCanvasElement | null = null;
  private marker: HTMLCanvasElement | null = null;
  private flashAt = -1;
  private fanfareAt = -1;
  private sparks: Spark[] = [];
  private exit: { at: number; dur: number } | null = null;
  private lastT = 0;

  constructor(private cv: HTMLCanvasElement, private tiles: TileCache, private reduced: boolean, private fade = 2.2) {
    this.g = cv.getContext('2d')!;
    this.rays = this.paintRays();
  }

  /**
   * `geo` in the container's css px. The canvas is only the reel's band (2.1 pack heights, or the container), not
   * the whole scene: fewer pixels to clear and composite every frame. The plates, band and marker are repainted at
   * this size and resolution, so they stay pixel-sharp.
   */
  resize(geo: Geometry, dpr: number) {
    const bandH = Math.min(geo.h, geo.th * 2.1);
    const top = clamp(geo.cy - bandH / 2, 0, Math.max(0, geo.h - bandH));
    this.geo = { ...geo, h: bandH, cy: geo.cy - top };
    this.dpr = dpr;
    const W = Math.max(1, Math.round(geo.w * dpr)), H = Math.max(1, Math.round(bandH * dpr));
    if (this.cv.width !== W) this.cv.width = W;
    if (this.cv.height !== H) this.cv.height = H;
    this.cv.style.top = `${top}px`; this.cv.style.height = `${bandH}px`;
    this.plates.clear();
    this.band = this.paintBand();
    this.marker = this.paintMarker();
  }

  /** a tile crossed the marker (the marker itself never moves: the sound is the feedback) */
  tick(_speed: number) { /* fixed marker */ }

  land(t: number, rare: boolean) {
    this.flashAt = t;
    if (rare && !this.reduced) {
      this.fanfareAt = t;
      const { cx, cy, tw } = this.geo;
      for (let i = 0; i < 80; i++) {
        const a = Math.random() * Math.PI * 2, sp = 260 + Math.random() * 560;
        this.sparks.push({ x: cx + Math.cos(a) * tw * 0.2, y: cy + Math.sin(a) * tw * 0.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 140, life: 0, max: 0.35 + Math.random() * 0.45, size: 1.5 + Math.random() * 2.5, col: ['#ffe07a', '#ffd35a', '#fff4c2', '#ff8a5a'][i % 4] });
      }
    }
  }

  /** start the exit: the neighbours and the band fade, the landed wrapper grows into the pack and dissolves */
  leave(t: number, dur: number) { if (!this.exit) this.exit = { at: t, dur }; }

  /** the exit has finished (and the sparks and rays with it) */
  gone(t: number) { return !!this.exit && t - this.exit.at >= this.exit.dur && !this.sparks.length && (this.fanfareAt < 0 || t - this.fanfareAt > RAYS_MS); }

  draw(t: number, m: ReelModel) {
    const g = this.g, { w, h, cx, cy, th } = this.geo, dpr = this.dpr;
    const dt = clamp((t - this.lastT) / 1000, 0, 0.05); this.lastT = t;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const ex = this.exit ? clamp((t - this.exit.at) / this.exit.dur, 0, 1) : 0;

    // the vintage landing's rays, behind everything
    if (this.fanfareAt >= 0) {
      const f = (t - this.fanfareAt) / RAYS_MS;
      if (f < 1) {
        const a = Math.min(1, f * 8) * (1 - smooth(clamp((f - 0.35) / 0.65, 0, 1)));
        const s = th * (1.3 + f * 0.6);
        g.save(); g.translate(cx, cy); g.rotate(t / 1300); g.globalAlpha = a * 0.85; g.globalCompositeOperation = 'lighter';
        g.drawImage(this.rays, -s, -s, s * 2, s * 2); g.restore();
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
    }

    if (this.reduced) this.drawReduced(m, ex);
    else this.drawStrip(t, m, ex);

    if (this.sparks.length) {
      g.globalCompositeOperation = 'lighter';
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const p = this.sparks[i];
        p.life += dt; if (p.life >= p.max) { this.sparks.splice(i, 1); continue; }
        p.vx *= 1 - 2 * dt; p.vy = p.vy * (1 - 2 * dt) + 420 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        g.globalAlpha = 1 - p.life / p.max; g.fillStyle = p.col;
        g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
  }

  private drawStrip(t: number, m: ReelModel, ex: number) {
    const g = this.g, { cx, cy, tw, th } = this.geo, fade = this.fade;
    const L = stripLayout(tw);
    const speed = clamp(m.v / m.cfg.cruise, 0, 1.5);
    const out = 1 - ex;
    // the strip's window: a dark band with crisp rules, fading at its ends
    if (this.band && out > 0.01) {
      g.globalAlpha = out;
      g.drawImage(this.band, cx - this.band.width / this.dpr / 2, cy - this.band.height / this.dpr / 2, this.band.width / this.dpr, this.band.height / this.dpr);
    }
    const x = m.x, land = m.landing;
    const lo = Math.floor(x - fade - 1), hi = Math.ceil(x + fade + 1);
    const labels = speed < 0.4;
    let landed: { set: RollSet; px: number } | null = null;
    for (let i = lo; i <= hi; i++) {
      const set = m.setAt(i); if (!set) continue;
      const d = i - x, at = stripAt(d, tw, fade);
      const px = cx + at.x;
      const isLanding = !!land && i === land.index;
      if (isLanding && ex > 0) { landed = { set, px }; continue; }
      const alpha = at.alpha * out;
      if (alpha <= 0.01) continue;
      const tier = rollTier(set.oneIn);
      // the plate: the set's rarity, crisp; the locked vintage landing burns a little brighter (the subtle tease)
      g.globalAlpha = alpha;
      const plate = this.plate(tier);
      g.drawImage(plate, px - L.pw / 2, cy - L.ph / 2, L.pw, L.ph);
      if (isLanding && land!.rare) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = alpha * (0.35 + 0.25 * Math.sin(t / 90));
        g.drawImage(plate, px - L.pw / 2, cy - L.ph / 2, L.pw, L.ph);
        g.globalCompositeOperation = 'source-over';
      }
      const art = this.tiles.get(set);
      const ty = cy - L.ph / 2 + (L.ph - L.h) * 0.3;
      if (speed > 0.35) {
        g.globalAlpha = alpha * 0.28 * Math.min(1, speed);
        g.drawImage(art.dim, px + 0.18 * speed * L.step - L.w / 2, ty, L.w, L.h);
      }
      g.globalAlpha = alpha;
      g.drawImage(art.bright, px - L.w / 2, ty, L.w, L.h);
      if (labels) {
        const txt = oneIn(set.oneIn);
        if (txt) {
          g.globalAlpha = alpha * clamp((0.4 - speed) / 0.2, 0, 1) * 0.9;
          g.font = `700 ${Math.round(clamp(tw * 0.04, 9, 12))}px "Cascadia Mono", Consolas, ui-monospace, monospace`;
          g.textAlign = 'center'; g.textBaseline = 'top';
          g.fillStyle = TIER_COLOURS[tier].rim;
          g.fillText(txt, px, cy + L.ph / 2 + 6);
        }
      }
    }
    // the fixed marker: never moves, never wobbles
    if (this.marker && out > 0.01) {
      g.globalAlpha = out;
      const mw = this.marker.width / this.dpr, mh = this.marker.height / this.dpr;
      g.drawImage(this.marker, cx - mw / 2, cy - mh / 2, mw, mh);
    }
    // the landed wrapper grows from its slot into the pack's box, then dissolves into the real pack under it
    if (landed) {
      const k = smooth(clamp(ex / 0.6, 0, 1));
      const w = L.w + (tw - L.w) * k, hh = L.h + (th - L.h) * k;
      const px = landed.px + (cx - landed.px) * k;
      const ty0 = cy - L.ph / 2 + (L.ph - L.h) * 0.3, ty = ty0 + (cy - th / 2 - ty0) * k;
      g.globalAlpha = 1 - smooth(clamp((ex - 0.55) / 0.45, 0, 1));
      g.drawImage(this.tiles.get(landed.set).bright, px - w / 2, ty, w, hh);
    }
    // the flash on landing, over the landed wrapper where it sits
    if (this.flashAt >= 0 && land && !landed) {
      const f = (t - this.flashAt) / (land.rare ? 300 : 180);
      if (f < 1) {
        const px = cx + stripAt(land.index - x, tw, fade).x;
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = (1 - f) * (land.rare ? 0.7 : 0.45);
        g.drawImage(this.tiles.get(land.set).bright, px - L.w / 2, cy - L.ph / 2 + (L.ph - L.h) * 0.3, L.w, L.h);
        g.globalCompositeOperation = 'source-over';
      }
    }
    g.globalAlpha = 1;
  }

  /** reduced motion: the pack's box only, cross-fading from wrapper to wrapper */
  private drawReduced(m: ReelModel, ex: number) {
    const g = this.g, { cx, cy, tw, th } = this.geo;
    const n = Math.floor(m.x), f = m.x - n;
    const a = this.tiles.get(m.setAt(n)!), b = m.setAt(n + 1);
    const out = 1 - smooth(clamp((ex - 0.2) / 0.8, 0, 1));
    g.globalAlpha = out; g.drawImage(a.bright, cx - tw / 2, cy - th / 2, tw, th);
    if (f > 0.001 && b) { g.globalAlpha = out * f; g.drawImage(this.tiles.get(b).bright, cx - tw / 2, cy - th / 2, tw, th); }
    g.globalAlpha = 1;
  }

  /** a rarity plate at device resolution: a deep gradient in the tier's colours, a crisp rim, a lit top edge, the
   *  rarity bar along the bottom, and (vintage) a scatter of fine gold flecks */
  private plate(tier: RollTier): HTMLCanvasElement {
    let c = this.plates.get(tier);
    if (c) return c;
    const L = stripLayout(this.geo.tw), k = this.dpr;
    c = canvas(L.pw * k, L.ph * k);
    const g = c.getContext('2d');
    if (g) {
      const col = TIER_COLOURS[tier];
      g.scale(k, k);
      const w = L.pw, h = L.ph, r = Math.max(4, w * 0.06);
      rr(g, 0.5, 0.5, w - 1, h - 1, r);
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, 'rgba(10,12,22,.92)'); bg.addColorStop(0.55, col.deep); bg.addColorStop(1, col.b);
      g.fillStyle = bg; g.fill();
      // the aura: a clean elliptical light behind the wrapper, in the tier's colour
      g.save(); rr(g, 0.5, 0.5, w - 1, h - 1, r); g.clip();
      const glow = g.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, w * 0.62);
      glow.addColorStop(0, col.glow); glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow; g.fillRect(0, 0, w, h);
      if (tier === 'vintage') {
        let s = 7;
        const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 46; i++) { g.fillStyle = i % 3 ? 'rgba(255,233,160,.85)' : 'rgba(255,255,255,.9)'; const z = 0.6 + rnd() * 1.2; g.fillRect(rnd() * w, rnd() * h, z, z); }
      }
      // the rarity bar
      const bar = Math.max(3, h * 0.022);
      const bg2 = g.createLinearGradient(0, 0, w, 0);
      bg2.addColorStop(0, col.b); bg2.addColorStop(0.5, col.a); bg2.addColorStop(1, col.b);
      g.fillStyle = bg2; g.fillRect(0, h - bar, w, bar);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(r, 1, w - 2 * r, 1);
      g.restore();
      rr(g, 0.75, 0.75, w - 1.5, h - 1.5, r);
      g.lineWidth = 1.5; g.strokeStyle = col.rim; g.globalAlpha = 0.8; g.stroke(); g.globalAlpha = 1;
    }
    this.plates.set(tier, c);
    return c;
  }

  /** the strip's window: dark, with thin rules top and bottom, fading out at both ends (one bitmap per size) */
  private paintBand(): HTMLCanvasElement {
    const L = stripLayout(this.geo.tw), k = this.dpr;
    const w = Math.min(this.geo.w, (this.fade + 0.5) * 2 * L.step), h = L.ph + 22;
    const c = canvas(w * k, h * k), g = c.getContext('2d');
    if (g) {
      g.scale(k, k);
      g.fillStyle = 'rgba(6,7,14,.62)'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1);
      g.globalCompositeOperation = 'destination-in';
      const f = g.createLinearGradient(0, 0, w, 0);
      f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(0.12, 'rgba(0,0,0,1)'); f.addColorStop(0.88, 'rgba(0,0,0,1)'); f.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = f; g.fillRect(0, 0, w, h);
    }
    return c;
  }

  /** the fixed marker: a glowing line through the window's centre with a notch at each end */
  private paintMarker(): HTMLCanvasElement {
    const L = stripLayout(this.geo.tw), k = this.dpr;
    const h = L.ph + 40, w = 28;
    const c = canvas(w * k, h * k), g = c.getContext('2d');
    if (g) {
      g.scale(k, k);
      const mid = w / 2;
      const glow = g.createLinearGradient(0, 0, w, 0);
      glow.addColorStop(0, 'rgba(255,214,110,0)'); glow.addColorStop(0.5, 'rgba(255,214,110,.35)'); glow.addColorStop(1, 'rgba(255,214,110,0)');
      g.fillStyle = glow; g.fillRect(mid - 6, 8, 12, h - 16);
      g.fillStyle = 'rgba(20,14,2,.8)'; g.fillRect(mid - 1.75, 8, 3.5, h - 16);
      g.fillStyle = '#ffe9a8'; g.fillRect(mid - 1, 8, 2, h - 16);
      const notch = (y: number, dir: 1 | -1) => {
        g.beginPath(); g.moveTo(mid - 8, y); g.lineTo(mid + 8, y); g.lineTo(mid, y + dir * 11); g.closePath();
        g.fillStyle = '#ffd35a'; g.fill(); g.lineWidth = 1.25; g.strokeStyle = 'rgba(40,26,2,.9)'; g.stroke();
      };
      notch(1, 1); notch(h - 1, -1);
    }
    return c;
  }

  private paintRays() {
    const c = canvas(512, 512);
    const g = c.getContext('2d');
    if (g) {
      g.translate(256, 256);
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, wdt = 0.07 + (i % 3) * 0.02;
        const r = g.createLinearGradient(0, 0, Math.cos(a) * 256, Math.sin(a) * 256);
        r.addColorStop(0, 'rgba(255,230,140,.75)'); r.addColorStop(1, 'rgba(255,200,80,0)');
        g.fillStyle = r;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a - wdt) * 256, Math.sin(a - wdt) * 256); g.lineTo(Math.cos(a + wdt) * 256, Math.sin(a + wdt) * 256); g.closePath(); g.fill();
      }
      const core = g.createRadialGradient(0, 0, 0, 0, 0, 200);
      core.addColorStop(0, 'rgba(255,244,194,.6)'); core.addColorStop(1, 'rgba(255,211,90,0)');
      g.fillStyle = core; g.fillRect(-256, -256, 512, 512);
    }
    return c;
  }
}
