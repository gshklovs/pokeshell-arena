// Organic terrain surfaces (render-only): the sim's per-tile wet / shock / fire timers become soft-edged blobs
// instead of 40 px squares. Each layer is a 48x27 mask (one pixel per tile), upscaled with smoothing and blur and
// then thresholded into a quarter-res mask (480x270), rebuilt only when the quantised mask changes. Per frame we
// fill the mask with animated water caustics, a flickering shock glow with jagged arcs, or fire glow with flame
// tongues, and scorch marks where grass burned.
import { COLS, ROWS } from '../sim/terrain'
import { TILE, type SimState } from '../sim/types'

const W = 1920, H = 1080, T = 40
const QW = 480, QH = 270 // quarter res

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}

/** a soft blob mask of a tile predicate, cached on a key */
class Blob {
  readonly small = canvas(COLS, ROWS)
  readonly fill = canvas(QW, QH)
  readonly rim = canvas(QW, QH)
  private tmp = canvas(QW, QH)
  key = ''
  any = false

  /** level(i): 0..1 per tile. `blur` in quarter-res px. Returns true if rebuilt */
  update(n: number, level: (i: number) => number, blur = 5, lo = 0.36, band = 0.1): boolean {
    let key = ''
    let any = false
    const lv = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      const q = Math.round(Math.max(0, Math.min(1, level(i))) * 4)
      lv[i] = q
      if (q) any = true
    }
    // a cheap key: run-length of the levels
    let run = 0, cur = lv[0]
    const parts: string[] = []
    for (let i = 0; i < n; i++) {
      if (lv[i] === cur) run++
      else { parts.push(cur + ':' + run); cur = lv[i]; run = 1 }
    }
    parts.push(cur + ':' + run)
    key = parts.join(',')
    if (key === this.key) return false
    this.key = key
    this.any = any
    const sg = this.small.getContext('2d')!
    const img = sg.createImageData(COLS, ROWS)
    for (let i = 0; i < n; i++) { img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = lv[i] * 63.75 }
    sg.putImageData(img, 0, 0)
    for (const c of [this.fill, this.rim]) c.getContext('2d')!.clearRect(0, 0, QW, QH)
    if (!any) return true
    const tg = this.tmp.getContext('2d', { willReadFrequently: true })!
    tg.clearRect(0, 0, QW, QH)
    tg.imageSmoothingEnabled = true
    tg.filter = `blur(${blur}px)`
    tg.drawImage(this.small, 0, 0, QW, QH)
    tg.filter = 'none'
    const src = tg.getImageData(0, 0, QW, QH)
    const fillImg = new ImageData(QW, QH), rimImg = new ImageData(QW, QH)
    for (let p = 0; p < QW * QH; p++) {
      const a = src.data[p * 4 + 3] / 255
      const f = Math.max(0, Math.min(1, (a - lo) / 0.08))
      const r = a > lo - band && a < lo + 0.06 ? 1 - Math.abs(a - (lo - band / 3)) / band : 0
      const o = p * 4
      fillImg.data[o] = fillImg.data[o + 1] = fillImg.data[o + 2] = 255; fillImg.data[o + 3] = f * 255
      rimImg.data[o] = rimImg.data[o + 1] = rimImg.data[o + 2] = 255; rimImg.data[o + 3] = Math.max(0, r) * 255
    }
    this.fill.getContext('2d')!.putImageData(fillImg, 0, 0)
    this.rim.getContext('2d')!.putImageData(rimImg, 0, 0)
    return true
  }
}

/** fill a mask with a colour on a scratch canvas and return it */
function tinted(scratch: HTMLCanvasElement, mask: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const g = scratch.getContext('2d')!
  g.globalCompositeOperation = 'source-over'
  g.clearRect(0, 0, scratch.width, scratch.height)
  g.drawImage(mask, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, scratch.width, scratch.height)
  g.globalCompositeOperation = 'source-over'
  return scratch
}

export interface FireSpot { x: number; y: number }

export class TerrainFx {
  private water = new Blob()
  private shock = new Blob()
  private fire = new Blob()
  private scorch = new Blob()
  private work = canvas(QW, QH)
  private work2 = canvas(QW, QH)
  private arcs: { pts: [number, number][]; t: number }[] = []
  /** burning tile centres this frame (the renderer spawns embers from them) */
  fireSpots: FireSpot[] = []
  shockSpots: FireSpot[] = []

  constructor(private readonly baseTiles: number[]) {}

  update(s: SimState): void {
    const n = s.tiles.length
    this.water.update(n, (i) => (s.wet[i] > 0 ? Math.min(1, 0.35 + s.wet[i] / 90) : 0))
    this.shock.update(n, (i) => (s.shock[i] > 0 ? Math.min(1, 0.4 + s.shock[i] / 40) : 0), 4)
    this.fire.update(n, (i) => (s.fire[i] > 0 ? Math.min(1, 0.4 + s.fire[i] / 50) : 0), 5)
    this.scorch.update(n, (i) => (this.baseTiles[i] === TILE.GRASS && s.tiles[i] === TILE.FLOOR ? 1 : 0), 6, 0.3)
    this.fireSpots = []
    this.shockSpots = []
    for (let i = 0; i < n; i++) {
      if (s.fire[i] > 0) this.fireSpots.push({ x: (i % COLS) * T + T / 2, y: Math.floor(i / COLS) * T + T / 2 })
      else if (s.shock[i] > 0) this.shockSpots.push({ x: (i % COLS) * T + T / 2, y: Math.floor(i / COLS) * T + T / 2 })
    }
  }

  /** scorch + water + shock + fire glow, under the fighters */
  draw(g: CanvasRenderingContext2D, frame: number): void {
    g.save()
    g.imageSmoothingEnabled = true
    if (this.scorch.any) {
      g.globalAlpha = 0.62
      g.drawImage(tinted(this.work, this.scorch.fill, '#2a1a0c'), 0, 0, W, H)
      g.globalAlpha = 0.35
      g.drawImage(tinted(this.work, this.scorch.rim, '#1a0f06'), 0, 0, W, H)
      g.globalAlpha = 1
    }
    if (this.water.any) this.drawWater(g, frame)
    if (this.shock.any) this.drawShock(g, frame)
    if (this.fire.any) this.drawFireGlow(g, frame)
    g.restore()
  }

  private drawWater(g: CanvasRenderingContext2D, frame: number): void {
    // foam rim
    g.globalAlpha = 0.4
    g.drawImage(tinted(this.work, this.water.rim, '#dff3ff'), 0, 0, W, H)
    // body with moving caustics, drawn at quarter res then upscaled
    const w = this.work2.getContext('2d')!
    w.globalCompositeOperation = 'source-over'
    w.clearRect(0, 0, QW, QH)
    w.drawImage(this.water.fill, 0, 0)
    w.globalCompositeOperation = 'source-in'
    const grad = w.createLinearGradient(0, 0, QW, QH)
    grad.addColorStop(0, 'rgba(56,140,235,0.62)')
    grad.addColorStop(1, 'rgba(40,110,210,0.62)')
    w.fillStyle = grad
    w.fillRect(0, 0, QW, QH)
    w.globalCompositeOperation = 'source-atop'
    w.strokeStyle = 'rgba(210,240,255,0.55)'
    w.lineWidth = 1.2
    const t = frame * 0.03
    for (let k = 0; k < 34; k++) {
      const y0 = (k * 8.3 + Math.sin(t + k) * 3) % QH
      w.beginPath()
      for (let x = 0; x <= QW; x += 6) {
        const y = y0 + Math.sin(x * 0.05 + t * 2 + k * 1.7) * 2.2 + Math.sin(x * 0.013 - t + k) * 3
        if (x === 0) w.moveTo(x, y); else w.lineTo(x, y)
      }
      w.setLineDash([4 + (k % 5) * 3, 10 + (k % 3) * 6])
      w.lineDashOffset = -frame * (0.25 + (k % 4) * 0.1)
      w.stroke()
    }
    w.setLineDash([])
    w.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    g.drawImage(this.work2, 0, 0, W, H)
  }

  private drawShock(g: CanvasRenderingContext2D, frame: number): void {
    const flick = frame % 6 < 3 ? 0.42 : 0.24
    g.globalAlpha = flick
    g.drawImage(tinted(this.work, this.shock.fill, 'rgba(255,226,60,0.8)'), 0, 0, W, H)
    g.globalCompositeOperation = 'lighter'
    g.globalAlpha = 0.5
    g.drawImage(tinted(this.work, this.shock.rim, '#ffe860'), 0, 0, W, H)
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    // jagged arcs between nearby shocked tiles
    if (frame % 3 === 0) {
      const spots = this.shockSpots
      const n = Math.min(18, Math.ceil(spots.length / 3))
      for (let k = 0; k < n && spots.length; k++) {
        const a = spots[(Math.random() * spots.length) | 0]
        const ang = Math.random() * Math.PI * 2, len = 30 + Math.random() * 50
        const pts: [number, number][] = [[a.x + (Math.random() - 0.5) * 30, a.y + (Math.random() - 0.5) * 30]]
        for (let j = 1; j <= 5; j++) {
          const d = (len * j) / 5
          pts.push([pts[0][0] + Math.cos(ang) * d + (Math.random() - 0.5) * 16, pts[0][1] + Math.sin(ang) * d + (Math.random() - 0.5) * 16])
        }
        this.arcs.push({ pts, t: 4 })
      }
    }
    this.arcs = this.arcs.filter((a) => a.t-- > 0)
    g.lineJoin = 'round'
    for (const a of this.arcs) {
      g.beginPath()
      a.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.strokeStyle = 'rgba(255,230,80,0.45)'; g.lineWidth = 6; g.stroke()
      g.strokeStyle = 'rgba(255,255,240,0.95)'; g.lineWidth = 2; g.stroke()
    }
  }

  private drawFireGlow(g: CanvasRenderingContext2D, frame: number): void {
    const pulse = 0.32 + 0.1 * Math.sin(frame * 0.3)
    g.globalAlpha = 0.5
    g.drawImage(tinted(this.work, this.fire.fill, '#3a1606'), 0, 0, W, H)
    g.globalCompositeOperation = 'lighter'
    g.globalAlpha = pulse
    g.drawImage(tinted(this.work, this.fire.fill, 'rgba(255,100,20,0.8)'), 0, 0, W, H)
    g.globalAlpha = 0.35
    g.drawImage(tinted(this.work, this.fire.rim, '#ff9030'), 0, 0, W, H)
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
  }

  /** flame tongues over the burning tiles (drawn above props, under fighters): one or two soft flickering flames per
   * tile at jittered spots and heights, with a hot core, so a burning patch reads as fire, not a picket fence */
  drawFlames(g: CanvasRenderingContext2D, frame: number): void {
    const spots = this.fireSpots
    if (!spots.length) return
    g.save()
    g.globalCompositeOperation = 'lighter'
    const step = spots.length > 120 ? 2 : 1
    for (let k = 0; k < spots.length; k += step) {
      const s = spots[k]
      const seed = (s.x * 7 + s.y * 13) % 97
      const n = seed % 3 === 0 ? 2 : 1
      for (let j = 0; j < n; j++) {
        const sd = seed + j * 37
        const jx = ((sd * 17) % 28) - 14, jy = ((sd * 29) % 20) - 10
        const flick = Math.sin(frame * 0.23 + sd) * 0.5 + Math.sin(frame * 0.41 + sd * 1.3) * 0.5
        const h = 20 + (sd % 18) + 8 * flick
        const w = 8 + (sd % 6)
        const x = s.x + jx, y = s.y + jy + 14
        const sway = Math.sin(frame * 0.15 + sd) * 5
        const outer = g.createRadialGradient(x, y - h * 0.3, 1, x, y - h * 0.3, h)
        outer.addColorStop(0, 'rgba(255,200,80,0.55)'); outer.addColorStop(0.6, 'rgba(255,90,20,0.35)'); outer.addColorStop(1, 'rgba(255,60,10,0)')
        g.fillStyle = outer
        g.beginPath()
        g.moveTo(x - w, y)
        g.bezierCurveTo(x - w * 1.1, y - h * 0.45, x - w * 0.3 + sway * 0.5, y - h * 0.7, x + sway, y - h)
        g.bezierCurveTo(x + w * 0.3 + sway * 0.5, y - h * 0.7, x + w * 1.1, y - h * 0.45, x + w, y)
        g.quadraticCurveTo(x, y + w * 0.6, x - w, y)
        g.fill()
        g.fillStyle = 'rgba(255,245,190,0.5)'
        g.beginPath(); g.ellipse(x + sway * 0.3, y - h * 0.22, w * 0.38, h * 0.26, 0, 0, Math.PI * 2); g.fill()
      }
    }
    g.restore()
  }
}
