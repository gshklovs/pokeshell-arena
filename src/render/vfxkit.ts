// The archetype drawers' shared kit (docs/VFX.md): the handle a drawer gets, the views of each live shape, and the
// Canvas2D helpers (colour mixing, bolts, stars, leaves, glows, clouds). Render-only; vfx.ts and the signature-move
// drawers (sig/*.ts) both draw with it.
import { hexA } from './sprites'

export { hexA }
export const TAU = Math.PI * 2

export type VfxParticle = { x: number; y: number; vx?: number; vy?: number; life: number; color: string; r?: number; kind?: 'dot' | 'spark' | 'ember' | 'drop' | 'leaf' | 'star' | 'smoke' | 'shard'; g?: number; rot?: number; vr?: number }
export interface Vfx {
  g: CanvasRenderingContext2D
  frame: number
  spawn: (p: VfxParticle) => void
}

export const rnd = (a: number, b: number) => a + Math.random() * (b - a)
/** a stable pseudo-random in [0, 1) from an id and a salt (a crack pattern, a cloud's puffs) */
export function hash(id: number, k: number): number {
  let h = (id * 374761393 + k * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
/** a colour mixed toward white (k 0..1) */
export function light(hex: string, k: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const m = (c: number) => Math.round(c + (255 - c) * k)
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => m(c).toString(16).padStart(2, '0')).join('')}`
}
/** a colour mixed toward black */
export function dark(hex: string, k: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const m = (c: number) => Math.round(c * (1 - k))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => m(c).toString(16).padStart(2, '0')).join('')}`
}
/** the element's particle kind */
export function pkind(el: string): VfxParticle['kind'] {
  switch (el) {
    case 'Fire': return 'ember'
    case 'Water': return 'drop'
    case 'Lightning': case 'Metal': return 'spark'
    case 'Grass': return 'leaf'
    case 'Psychic': case 'Fairy': return 'star'
    case 'Fighting': return 'shard'
    case 'Darkness': return 'smoke'
    default: return 'dot'
  }
}

/** a jagged bolt from a to b (a fresh zigzag every frame), with a glow and a white core */
export function bolt(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, w: number, jag = 0.18, branches = 1): void {
  const L = Math.hypot(x2 - x1, y2 - y1)
  const nx = -(y2 - y1) / (L || 1), ny = (x2 - x1) / (L || 1)
  const segs = Math.max(3, Math.round(L / 22))
  const pts: [number, number][] = [[x1, y1]]
  for (let i = 1; i < segs; i++) {
    const t = i / segs, o = rnd(-1, 1) * L * jag * Math.sin(Math.PI * t) * 0.5
    pts.push([x1 + (x2 - x1) * t + nx * o, y1 + (y2 - y1) * t + ny * o])
  }
  pts.push([x2, y2])
  const line = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]) }
  g.save()
  g.lineCap = 'round'; g.lineJoin = 'round'
  g.globalCompositeOperation = 'lighter'
  line(); g.strokeStyle = hexA(color, 0.35); g.lineWidth = w * 3; g.stroke()
  line(); g.strokeStyle = hexA(color, 0.95); g.lineWidth = w; g.stroke()
  line(); g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = Math.max(1.5, w * 0.4); g.stroke()
  // a fork or two off the main bolt
  for (let b = 0; b < branches; b++) {
    const i = 1 + Math.floor(Math.random() * (pts.length - 2))
    const [bx, by] = pts[i], a = Math.atan2(y2 - y1, x2 - x1) + rnd(-1, 1) * 0.9
    const bl = L * rnd(0.12, 0.25)
    g.beginPath(); g.moveTo(bx, by)
    g.lineTo(bx + Math.cos(a) * bl * 0.5 + rnd(-6, 6), by + Math.sin(a) * bl * 0.5 + rnd(-6, 6))
    g.lineTo(bx + Math.cos(a) * bl, by + Math.sin(a) * bl)
    g.strokeStyle = hexA(color, 0.8); g.lineWidth = Math.max(1.5, w * 0.5); g.stroke()
  }
  g.restore()
}

export function star(g: CanvasRenderingContext2D, r: number, points = 5, inner = 0.45): void {
  g.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r, a = (i * Math.PI) / points - Math.PI / 2
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  g.closePath()
}

export function leaf(g: CanvasRenderingContext2D, r: number, fill: string): void {
  g.beginPath()
  g.moveTo(-r, 0); g.quadraticCurveTo(0, -r * 0.62, r, 0); g.quadraticCurveTo(0, r * 0.62, -r, 0)
  g.fillStyle = fill; g.fill()
  g.strokeStyle = 'rgba(20,60,20,0.55)'; g.lineWidth = 1.2
  g.beginPath(); g.moveTo(-r * 0.8, 0); g.lineTo(r * 0.85, 0); g.stroke()
}

export function glowDot(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a = 0.7): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r)
  gr.addColorStop(0, hexA(color, a)); gr.addColorStop(1, hexA(color, 0))
  g.fillStyle = gr
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill()
}

/** a cloud of puffs at (x, y) about r wide, stable for an id */
export function cloud(g: CanvasRenderingContext2D, x: number, y: number, r: number, id: number, col: string, a: number): void {
  g.save()
  for (let i = 0; i < 7; i++) {
    const px = x + (hash(id, i + 90) * 2 - 1) * r * 0.75, py = y + (hash(id, i + 60) * 2 - 1) * r * 0.2
    g.fillStyle = hexA(col, a); g.beginPath(); g.arc(px, py, r * (0.3 + 0.2 * hash(id, i + 30)), 0, TAU); g.fill()
  }
  g.restore()
}

export interface ShotView {
  id: number
  /** drawn position, px (a lob already lifted) */
  x: number
  y: number
  /** heading, radians */
  a: number
  /** hit radius (a wall's depth), px */
  r: number
  /** a wall's half-width, px (0: not a wall) */
  wall: number
  age: number
  /** recent drawn positions, oldest first */
  trail: { x: number; y: number }[]
  /** a shard a split shot broke into (shape.split): drawn small */
  kid: boolean
  /** the volley's size (shape.count) */
  count: number
}

/** `t`: ticks left to show (of `ticks`); `id`: stable for this beam */
export interface BeamView { id: number; x1: number; y1: number; x2: number; y2: number; w: number; t: number; ticks: number }

/** `land`: ticks until it lands (then minus the ticks since); `fuse`: > 0 when this is a fused shot stuck where it
 * landed (shape.fuse), its fuse in ticks; `count` the impacts of a line / scatter (shape.count), `i` this one's index */
export interface AreaView { id: number; x: number; y: number; r: number; t: number; land: number; fade: number; ticks: number; fuse: number }

export interface ConeView { x: number; y: number; aim: number; range: number; arc: number; k: number }
