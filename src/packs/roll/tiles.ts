// Each set's wrapper for the reel, rasterised once into bitmaps (docs/PACK_ROLL.md, "The strip"). The art is the same
// generator as the pack itself (wrapperSVG: our own design, set colours, motif, title) with our hero card image
// composited into the window; never a scan. Until the SVG has decoded, a quick canvas painting of the same wrapper
// stands in, so the reel can spin from the first frame.
import { PACK_H, PACK_W, wrapperSVG } from '../wrapper';
import type { SetInfo } from '../types';
import type { RollSet } from './types';

export interface TileArt {
  /** at the pack's on-screen size (device px) */
  bright: HTMLCanvasElement;
  /** darker, at 0.6x: what a neighbour is drawn with */
  dim: HTMLCanvasElement;
  /** the SVG art has replaced the stand-in painting */
  final: boolean;
  /** painted from a set that had its art (colours / hero); a bare placeholder is repainted when the art arrives */
  art: boolean;
}

/** the wrapper's classes, inlined: an SVG drawn as an image can't see the page's stylesheet (or its web fonts) */
const SVG_STYLE = `<style>
.pk-w-title{font:800 30px/1 Fredoka,"Segoe UI",system-ui,sans-serif;fill:#fff;stroke:rgba(0,0,0,.45);stroke-width:5px;paint-order:stroke;letter-spacing:.5px}
.pk-w-series{font:700 9px/1 "Cascadia Mono",Consolas,monospace;fill:rgba(255,255,255,.85);letter-spacing:2px}
.pk-w-booster{font:800 17px/1 Fredoka,"Segoe UI",system-ui,sans-serif;fill:#fff;letter-spacing:6px;stroke:rgba(0,0,0,.35);stroke-width:3px;paint-order:stroke}
.pk-w-meta{font:700 8px/1 "Cascadia Mono",Consolas,monospace;fill:rgba(255,255,255,.8);letter-spacing:1px}
.pk-w-q{font:800 20px/1 Fredoka,"Segoe UI",system-ui,sans-serif}
.pk-w-bigq{font:800 118px/1 Fredoka,"Segoe UI",system-ui,sans-serif;stroke:rgba(40,44,60,.35);stroke-width:4px;paint-order:stroke}
</style>`;

/** the wrapper window the hero card sits in (wrapper.ts: x 30, y 140, 190 x 160, r 14) */
const WIN = { x: 30, y: 140, w: 190, h: 160, r: 14 };

export function asSetInfo(s: RollSet | SetInfo): SetInfo {
  return { id: s.id, name: s.name === 'Base' ? 'Base Set' : s.name, series: s.series, packSize: s.packSize, art: s.art, hero: s.hero };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** the crimped outline of a wrapper (same zigzag as wrapper.ts), in wrapper units */
function crimp(g: CanvasRenderingContext2D) {
  const teeth = 25, tw = PACK_W / teeth;
  g.beginPath(); g.moveTo(0, 6);
  for (let i = 0; i < teeth; i++) { g.lineTo((i + 0.5) * tw, 0); g.lineTo((i + 1) * tw, 6); }
  g.lineTo(PACK_W, PACK_H - 6);
  for (let i = teeth; i > 0; i--) { g.lineTo((i - 0.5) * tw, PACK_H); g.lineTo((i - 1) * tw, PACK_H - 6); }
  g.closePath();
}

/** the stand-in: the wrapper's colours, crimp, window and title, painted straight into a canvas */
function paintQuick(set: SetInfo, c: HTMLCanvasElement) {
  const g = c.getContext('2d'); if (!g) return;
  const k = c.width / PACK_W;
  const col = set.art?.colors?.length ? set.art.colors : ['#1b2340', '#3a5bd9', '#9fd0ff'];
  const accent = set.art?.accent ?? '#ffd35a';
  g.save(); g.scale(k, k);
  crimp(g); g.clip();
  const bg = g.createLinearGradient(0, 0, PACK_W, PACK_H);
  bg.addColorStop(0, col[0]); bg.addColorStop(0.55, col[1] ?? col[0]); bg.addColorStop(1, col[0]);
  g.fillStyle = bg; g.fillRect(0, 0, PACK_W, PACK_H);
  g.fillStyle = col[2] ?? col[1] ?? col[0]; g.globalAlpha = 0.8; g.fillRect(0, 0, PACK_W, 32); g.fillRect(0, PACK_H - 32, PACK_W, 32); g.globalAlpha = 1;
  roundRect(g, WIN.x - 4, WIN.y - 4, WIN.w + 8, WIN.h + 8, WIN.r + 3); g.fillStyle = 'rgba(0,0,0,.25)'; g.fill(); g.strokeStyle = accent; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '800 26px Fredoka, "Segoe UI", system-ui, sans-serif';
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.45)';
  const name = set.name.toUpperCase();
  g.strokeText(name, 125, 110, 215); g.fillText(name, 125, 110, 215);
  if (set.art?.motif === 'mystery') { g.font = '800 110px Fredoka, "Segoe UI", sans-serif'; g.fillStyle = accent; g.fillText('?', 125, 262); }
  g.restore();
}

function dimOf(src: HTMLCanvasElement, into?: HTMLCanvasElement) {
  const d = into ?? canvas(src.width * 0.6, src.height * 0.6);
  const g = d.getContext('2d'); if (!g) return d;
  g.clearRect(0, 0, d.width, d.height);
  g.drawImage(src, 0, 0, d.width, d.height);
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(6,5,16,.5)'; g.fillRect(0, 0, d.width, d.height);
  g.globalCompositeOperation = 'source-over';
  return d;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im); im.onerror = () => rej(new Error(`image ${src.slice(0, 60)}`));
    im.src = src;
  });
}

export class TileCache {
  private map = new Map<string, TileArt>();
  private urls: string[] = [];
  private dead = false;

  /** `width`: the bright bitmap's width in device px (the pack's css width x DPR, capped) */
  constructor(private width: number, private imageBase = '', private onReady?: () => void) {}

  get(s: RollSet | SetInfo): TileArt {
    let a = this.map.get(s.id);
    const hasArt = !!(s.art?.colors?.length || s.hero);
    if (a && (a.art || !hasArt)) return a;
    const set = asSetInfo(s);
    const bright = canvas(this.width, this.width * (PACK_H / PACK_W));
    paintQuick(set, bright);
    a = { bright, dim: dimOf(bright), final: false, art: hasArt };
    this.map.set(s.id, a);
    void this.upgrade(set, a);
    return a;
  }

  /** warm the cache (the sets are known before the reel needs them) */
  prime(sets: (RollSet | SetInfo)[]) { for (const s of sets) this.get(s); }

  private async upgrade(set: SetInfo, a: TileArt) {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return;
    try {
      const svg = wrapperSVG(set, '', set.packSize ?? 10)
        .replace('<svg ', `<svg width="${PACK_W}" height="${PACK_H}" `)
        .replace(/(<svg[^>]*>)/, `$1${SVG_STYLE}`);
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      this.urls.push(url);
      const [im, hero] = await Promise.all([
        loadImage(url),
        set.hero ? loadImage(this.imageBase + set.hero).catch(() => null) : Promise.resolve(null),
      ]);
      if (this.dead) return;
      const c = canvas(a.bright.width, a.bright.height), g = c.getContext('2d'); if (!g) return;
      const k = c.width / PACK_W;
      g.drawImage(im, 0, 0, c.width, c.height);
      if (hero && hero.naturalWidth) {
        g.save(); g.scale(k, k);
        roundRect(g, WIN.x, WIN.y, WIN.w, WIN.h, WIN.r); g.clip();
        // preserveAspectRatio slice, pixelated: the card art is 1 px per art pixel
        const s = Math.max(WIN.w / hero.naturalWidth, WIN.h / hero.naturalHeight);
        const w = hero.naturalWidth * s, h = hero.naturalHeight * s;
        g.imageSmoothingEnabled = false;
        g.drawImage(hero, WIN.x + (WIN.w - w) / 2, WIN.y + (WIN.h - h) / 2, w, h);
        g.restore();
        g.save(); g.scale(k, k); roundRect(g, WIN.x, WIN.y, WIN.w, WIN.h, WIN.r); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.stroke(); g.restore();
      }
      // swap in place: the renderer holds the TileArt, not the canvases
      a.bright = c; a.dim = dimOf(c); a.final = true;
      this.onReady?.();
    } catch { /* keep the stand-in */ }
  }

  destroy() {
    this.dead = true;
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.map.clear();
  }
}
