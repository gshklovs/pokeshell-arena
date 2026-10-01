// Melee juice (docs/MELEE.md 3.5, 3.6), render-only: how a close-range swing LOOKS. The sim (src/sim/melee.ts) runs a
// melee attack as a live swing (strikes over active frames after a step-in, holds, throws, a parry window); this
// draws each strike as the move it is named for (a 1-2-3 of punch streaks, three claw rakes, jaws snapping shut and
// holding on, a spear thrust, a lash, a shield then a riposte...), the step-in as speed lines, a hold's tether, and
// the aim / windup telegraph with the step-in arrow, the arc from where the swing happens and the style's glyph.
// Floats and Math.random are fine here: the sim never reads any of it.
import { hexA } from './sprites'

const TAU = Math.PI * 2

/** a live swing as the renderer sees it (design px, radians) */
export interface SwingView {
  /** the attacker now, and where it stood at release (the step-in's speed lines start there) */
  x: number; y: number; sx: number; sy: number
  a: number; range: number; arc: number
  style: string
  age: number; wait: number; every: number; active: number; strike: number; strikes: number
  /** -1 once the swing is over (only fading); landed: strikes that connected */
  live: number; landed: number
  /** the held foe's position (a bite / grab / throw hold), else null */
  held: { x: number; y: number } | null
  color: string
  /** the attack's element: its melee flavour's accent (a Water crest, Fairy hearts, a Lightning flicker...) */
  el: string
  claw: boolean; blade: boolean
  /** drawing time left and total (the fade) */
  t: number; dur: number
}

/** a tapered streak from (x0, y0) to (x1, y1): a point at the tail, round at the head */
function streak(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number): void {
  const a = Math.atan2(y1 - y0, x1 - x0)
  const nx = -Math.sin(a) * w / 2, ny = Math.cos(a) * w / 2
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + nx, y1 + ny); g.arc(x1, y1, w / 2, a + Math.PI / 2, a - Math.PI / 2, true); g.closePath(); g.fill()
}

/** a small starburst (the flash where a blow lands) */
export function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, spikes = 8): void {
  g.beginPath()
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * TAU, rr = i % 2 === 0 ? r : r * 0.38
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  g.closePath(); g.fill()
}

/** an arrow head at (x, y) pointing along a */
function head(g: CanvasRenderingContext2D, x: number, y: number, a: number, s = 12): void {
  g.beginPath()
  g.moveTo(x - Math.cos(a) * s - Math.sin(a) * s * 0.7, y - Math.sin(a) * s + Math.cos(a) * s * 0.7)
  g.lineTo(x, y)
  g.lineTo(x - Math.cos(a) * s + Math.sin(a) * s * 0.7, y - Math.sin(a) * s - Math.cos(a) * s * 0.7)
  g.stroke()
}

/** one strike's look at local progress k (0 -> 1 over its window); `i` its index, `fin` the finisher */
function drawStrike(g: CanvasRenderingContext2D, v: SwingView, k: number, i: number, fin: boolean, fade: number): void {
  const { x, y, a, range, arc, color } = v
  const grow = Math.min(1, k * 2.4)
  const f2 = k < 0.5 ? fade : fade * Math.max(0, 1 - (k - 0.5) / 0.5)
  const cx = Math.cos(a), cy = Math.sin(a)
  const heavy = fin && v.strikes > 1
  switch (v.style) {
    case 'slash': case 'kick': case 'tail': {
      // a ribbon sweeping across the arc (alternating sides on a string), afterimages trailing its head
      const rev = i % 2 === 1
      const a0 = rev ? a + arc / 2 : a - arc / 2, a1 = rev ? a - arc / 2 : a + arc / 2
      const lanes = v.claw ? [0.62, 0.8, 0.98] : [v.style === 'slash' ? 0.84 : 0.8]
      const width = v.blade ? 12 : v.claw ? 11 : v.style === 'slash' ? 22 : 28
      const h0 = a0 + (a1 - a0) * grow
      for (const [li, lane] of lanes.entries()) {
        const rr = range * lane
        const hh = h0 - (a1 > a0 ? 1 : -1) * li * 0.1
        // a soft glow under the whole swept arc, so the cut reads over bright arena art
        g.strokeStyle = hexA(color, 0.22 * f2); g.lineWidth = width * 2.2
        g.beginPath(); g.arc(v.x, v.y, rr, Math.min(a0, hh), Math.max(a0, hh)); g.stroke()
        for (let j = 5; j >= 0; j--) {
          const back = (j + 1) * 0.16 * (a1 > a0 ? 1 : -1)
          const s0 = a1 > a0 ? Math.max(a0, hh - back) : Math.min(a0, hh - back)
          const s1 = hh - back + (a1 > a0 ? 0.16 : -0.16)
          g.strokeStyle = hexA(color, (0.16 + (5 - j) * 0.12) * f2)
          g.lineWidth = width * (1 - j * 0.1) * (heavy ? 1.3 : 1)
          g.beginPath(); g.arc(x, y, rr, Math.min(s0, s1), Math.max(s0, s1)); g.stroke()
        }
        g.strokeStyle = `rgba(255,255,255,${0.95 * f2})`; g.lineWidth = Math.max(2, width * 0.32)
        g.beginPath(); g.arc(x, y, rr, Math.min(hh, hh - (a1 > a0 ? 0.5 : -0.5)), Math.max(hh, hh - (a1 > a0 ? 0.5 : -0.5))); g.stroke()
      }
      if (v.style !== 'slash') {
        // the sweep's leading edge kicks up dust
        const hx = x + Math.cos(h0) * range * 0.85, hy = y + Math.sin(h0) * range * 0.85
        g.fillStyle = `rgba(255,255,255,${0.5 * f2})`; star(g, hx, hy, 14 * f2 + 4, 6)
      }
      if (v.blade && k < 0.55) { g.fillStyle = `rgba(255,255,255,${0.9 * f2})`; star(g, x + Math.cos(h0) * range * 0.95, y + Math.sin(h0) * range * 0.95, 12, 4) }
      break
    }
    case 'uppercut': case 'chop': {
      // a vertical blow at the tip: rising (uppercut) or falling (chop)
      const tx = x + cx * range * 0.8, ty = y + cy * range * 0.8
      const h = 90 * grow
      g.fillStyle = hexA(color, 0.85 * f2)
      if (v.style === 'uppercut') streak(g, tx, ty + 26, tx, ty + 26 - h, 22)
      else streak(g, tx, ty - 90, tx, ty - 90 + h, 22)
      g.fillStyle = `rgba(255,255,255,${0.9 * f2})`; star(g, tx, v.style === 'uppercut' ? ty - h * 0.6 : ty, 18 * f2 + 4)
      break
    }
    case 'thrust': {
      const tip = range * (0.3 + 0.7 * grow)
      const tx = x + cx * tip, ty = y + cy * tip
      g.fillStyle = hexA(color, 0.3 * f2); streak(g, x + cx * range * 0.05, y + cy * range * 0.05, tx, ty, 20)
      g.fillStyle = hexA(color, 0.9 * f2); streak(g, x + cx * range * 0.1, y + cy * range * 0.1, tx, ty, 11)
      g.fillStyle = `rgba(255,255,255,${f2})`; star(g, tx, ty, 11, 4)
      break
    }
    case 'bite': {
      // jaws snap shut at the tip: two arcs closing, white fangs
      const tx = v.held ? v.held.x : x + cx * range * 0.75, ty = v.held ? v.held.y - 18 : y + cy * range * 0.75
      const open = v.held ? 0 : 0.9 * (1 - grow)
      const R = 30
      for (const side of [-1, 1]) {
        g.strokeStyle = hexA(color, 0.9 * f2); g.lineWidth = 8
        const mid = a + side * (Math.PI / 2 + open)
        g.beginPath(); g.arc(tx, ty, R, mid - 0.9, mid + 0.9); g.stroke()
        g.fillStyle = `rgba(255,255,255,${0.95 * f2})`
        for (let j = -1; j <= 1; j++) {
          const fa = mid + j * 0.45
          const bx = tx + Math.cos(fa) * (R - 2), by = ty + Math.sin(fa) * (R - 2)
          const ix = tx + Math.cos(fa) * (R - 13), iy = ty + Math.sin(fa) * (R - 13)
          g.beginPath(); g.moveTo(bx + Math.cos(fa + 1.57) * 4, by + Math.sin(fa + 1.57) * 4); g.lineTo(bx - Math.cos(fa + 1.57) * 4, by - Math.sin(fa + 1.57) * 4); g.lineTo(ix, iy); g.fill()
        }
      }
      if (!v.held && grow >= 1 && k < 0.6) { g.fillStyle = `rgba(255,255,255,${0.8 * f2})`; star(g, tx, ty, 14, 6) }
      break
    }
    case 'grab': case 'throw': {
      // two hooks closing on the reach (on the held foe while it holds)
      const tx = v.held ? v.held.x : x + cx * range * 0.8, ty = v.held ? v.held.y - 18 : y + cy * range * 0.8
      const open = v.held ? 0.15 : 0.9 * (1 - grow) + 0.2
      g.strokeStyle = hexA(color, 0.9 * f2); g.lineWidth = 9
      for (const side of [-1, 1]) {
        const mid = a + Math.PI + side * (Math.PI / 2 - open)
        g.beginPath(); g.arc(tx, ty, 28, mid - 0.7, mid + 0.7); g.stroke()
      }
      break
    }
    case 'counter': {
      // the riposte: a bright streak from the shield
      const rr = range * 0.55
      g.fillStyle = hexA(color, 0.85 * f2); streak(g, x + cx * rr * 0.4, y + cy * rr * 0.4, x + cx * range * (0.6 + 0.4 * grow), y + cy * range * (0.6 + 0.4 * grow), 18)
      g.fillStyle = `rgba(255,255,255,${0.9 * f2})`; star(g, x + cx * range * (0.6 + 0.4 * grow), y + cy * range * (0.6 + 0.4 * grow), 16)
      break
    }
    case 'whip': {
      // a lash: a curve from the body that snaps straight
      const tx = x + cx * range * grow, ty = y + cy * range * grow
      const bend = 60 * (1 - grow) * (i % 2 ? -1 : 1)
      const mx = x + cx * range * 0.5 * grow - cy * bend, my = y + cy * range * 0.5 * grow + cx * bend
      g.strokeStyle = hexA(color, 0.9 * f2); g.lineWidth = 7
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, tx, ty); g.stroke()
      g.strokeStyle = `rgba(255,255,255,${0.8 * f2})`; g.lineWidth = 2; g.stroke()
      if (grow >= 1) { g.fillStyle = `rgba(255,255,255,${0.9 * f2})`; star(g, tx, ty, 12, 5) }
      break
    }
    case 'spin': {
      // a whirl all around
      const hd = -Math.PI / 2 + TAU * grow + i * Math.PI
      for (let j = 6; j >= 0; j--) {
        g.strokeStyle = hexA(color, (0.12 + (6 - j) * 0.1) * f2); g.lineWidth = 18 - j * 2
        g.beginPath(); g.arc(x, y, range * 0.8, hd - (j + 1) * 0.3, hd - j * 0.3); g.stroke()
      }
      break
    }
    default: {
      // jab, punch, flurry, headbutt, strike: straight blows fanned across the arc, alternating sides
      const spread = Math.min(arc * 0.6, 0.5)
      const off = v.strikes > 1 ? (i % 2 ? 1 : -1) * spread * (0.3 + 0.2 * ((i >> 1) % 2)) : 0
      const ang = a + (fin && v.strikes > 1 ? 0 : off)
      const tip = range * (0.5 + 0.5 * Math.min(1, grow * 1.4))
      const tx = x + Math.cos(ang) * tip, ty = y + Math.sin(ang) * tip
      const w = heavy || v.style === 'headbutt' || (v.style === 'punch' && v.strikes === 1) ? 30 : 20
      g.fillStyle = hexA(color, 0.3 * f2); streak(g, x + Math.cos(ang) * range * 0.1, y + Math.sin(ang) * range * 0.1, tx, ty, w * 1.8)
      g.fillStyle = hexA(color, 0.85 * f2); streak(g, x + Math.cos(ang) * range * 0.18, y + Math.sin(ang) * range * 0.18, tx, ty, w)
      g.fillStyle = `rgba(255,255,255,${0.95 * f2})`; star(g, tx, ty, (w > 20 ? 26 : 16) * (0.6 + 0.4 * f2))
    }
  }
}

/** a small heart (the Fairy charm) */
function heart(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.beginPath()
  g.moveTo(x, y + s * 0.8)
  g.bezierCurveTo(x - s * 1.4, y - s * 0.2, x - s * 0.5, y - s * 1.2, x, y - s * 0.35)
  g.bezierCurveTo(x + s * 0.5, y - s * 1.2, x + s * 1.4, y - s * 0.2, x, y + s * 0.8)
  g.fill()
}

/** the per-type melee flavour's accent at a strike's tip (docs/MELEE.md 3.4): a Water crest, a Fire arc, a Lightning
 * flicker, Grass vines, a Psychic ripple, Darkness smoke, Fairy hearts, a Dragon sweep, Metal and Fighting sparks */
function accent(g: CanvasRenderingContext2D, v: SwingView, k: number, fade: number): void {
  const tx = v.x + Math.cos(v.a) * v.range * 0.9, ty = v.y + Math.sin(v.a) * v.range * 0.9
  const f = fade * Math.max(0, 1 - k)
  if (f <= 0.02) return
  g.save()
  switch (v.el) {
    case 'Water': {
      g.strokeStyle = `rgba(190,230,255,${0.9 * f})`; g.lineWidth = 5
      g.beginPath(); g.arc(tx - Math.cos(v.a) * 14, ty - Math.sin(v.a) * 14, 26 + 10 * k, v.a - 0.9, v.a + 0.9); g.stroke()
      break
    }
    case 'Fire': {
      g.strokeStyle = hexA('#ff8a2a', 0.85 * f); g.lineWidth = 8
      g.beginPath(); g.arc(v.x, v.y, v.range * 1.02, v.a - v.arc / 2, v.a + v.arc / 2); g.stroke()
      break
    }
    case 'Lightning': {
      g.strokeStyle = `rgba(255,247,168,${0.95 * f})`; g.lineWidth = 2.5
      g.beginPath()
      for (let j = 0; j < 3; j++) {
        const a0 = Math.random() * TAU
        g.moveTo(tx, ty); g.lineTo(tx + Math.cos(a0) * 14, ty + Math.sin(a0) * 14); g.lineTo(tx + Math.cos(a0 + 0.7) * 26, ty + Math.sin(a0 + 0.7) * 26)
      }
      g.stroke()
      break
    }
    case 'Grass': {
      g.strokeStyle = hexA('#5dbb4f', 0.9 * f); g.lineWidth = 4
      g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo((tx + v.x) / 2 - Math.sin(v.a) * 20, (ty + v.y) / 2 + Math.cos(v.a) * 20, v.x, v.y); g.stroke()
      break
    }
    case 'Psychic': {
      g.strokeStyle = hexA('#ff8ad8', 0.8 * f); g.lineWidth = 3
      for (const rr of [18, 30, 42]) { g.beginPath(); g.arc(tx, ty, rr * (0.6 + 0.6 * k), 0, TAU); g.stroke() }
      break
    }
    case 'Darkness': {
      g.fillStyle = `rgba(40,24,64,${0.55 * f})`
      for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(tx + (j - 1.5) * 10, ty + Math.sin(j) * 8, 12, 0, TAU); g.fill() }
      break
    }
    case 'Fairy': {
      g.fillStyle = hexA('#ff9fd6', 0.95 * f)
      for (let j = 0; j < 3; j++) heart(g, tx + (j - 1) * 16, ty - 10 - k * 24 - (j % 2) * 8, 7)
      break
    }
    case 'Dragon': {
      g.strokeStyle = hexA('#c9a13a', 0.8 * f); g.lineWidth = 6
      g.beginPath(); g.arc(v.x, v.y, v.range * 1.08, v.a - v.arc / 2 - 0.2, v.a + v.arc / 2 + 0.2); g.stroke()
      break
    }
    case 'Metal': case 'Fighting': {
      g.fillStyle = `rgba(255,255,255,${0.9 * f})`
      for (let j = 0; j < 4; j++) { const a0 = v.a + (j - 1.5) * 0.5; g.fillRect(tx + Math.cos(a0) * 16 * (1 + k), ty + Math.sin(a0) * 16 * (1 + k), 3, 3) }
      break
    }
  }
  g.restore()
}

/** a live swing: every strike of it so far (each in its own window), the step-in's speed lines, a hold's tether */
export function drawSwingView(g: CanvasRenderingContext2D, v: SwingView, frame: number): void {
  const fade = v.live < 0 ? Math.max(0, Math.min(1, v.t / 10)) : 1
  g.save()
  g.lineCap = 'round'; g.lineJoin = 'round'
  // the step-in: speed lines from where it stood
  const dx = v.x - v.sx, dy = v.y - v.sy, L = Math.hypot(dx, dy)
  if (L > 8 && v.age < 14) {
    const px = -dy / L, py = dx / L, k = v.age / 14
    g.strokeStyle = `rgba(255,255,255,${0.55 * (1 - k)})`; g.lineWidth = 3
    for (let i = -2; i <= 2; i++) {
      const o = i * 9
      g.beginPath(); g.moveTo(v.sx + px * o - dx * 0.1, v.sy + py * o - dy * 0.1); g.lineTo(v.x + px * o - dx * 0.35, v.y + py * o - dy * 0.35); g.stroke()
    }
  }
  // a counter's parry window: a pulsing shield across the front
  if (v.style === 'counter' && v.wait > 0) {
    const rr = v.range * 0.55, p = 0.6 + 0.4 * Math.sin(frame * 0.5)
    g.strokeStyle = hexA(v.color, 0.9 * p); g.lineWidth = 12
    g.beginPath(); g.arc(v.x, v.y, rr, v.a - v.arc / 2, v.a + v.arc / 2); g.stroke()
    g.strokeStyle = `rgba(255,255,255,${0.85 * p})`; g.lineWidth = 4
    g.beginPath(); g.arc(v.x, v.y, rr, v.a - v.arc / 2, v.a + v.arc / 2); g.stroke()
  }
  // a hold: a strained tether to the held foe
  if (v.held) {
    const hx = v.held.x, hy = v.held.y - 18
    g.strokeStyle = hexA(v.color, 0.8); g.lineWidth = 5; g.setLineDash([8, 6]); g.lineDashOffset = -frame
    g.beginPath(); g.moveTo(v.x, v.y - 18); g.lineTo(hx, hy); g.stroke()
    g.setLineDash([])
  }
  g.globalCompositeOperation = 'lighter'
  const win = v.active + 9
  for (let i = 0; i <= v.strike; i++) {
    const local = v.age - v.wait - i * v.every
    if (local < 0 || local >= win) continue
    drawStrike(g, v, local / win, i, i === v.strikes - 1, fade)
    if (i === v.strikes - 1 && v.landed > 0) accent(g, v, local / win, fade)
  }
  // a hold keeps the jaws / hooks on the foe
  if (v.held && (v.style === 'bite' || v.style === 'grab' || v.style === 'throw')) drawStrike(g, v, 0.4, 0, true, 1)
  g.restore()
}

/** the melee telegraph (aim preview and windup): the step-in arrow, the arc from where the swing happens (plus the
 * hitbox's forgiveness as a faint outer edge), the style's glyph. `k`: the windup fill (null: aiming) */
export function drawMeleeTelegraph(
  g: CanvasRenderingContext2D, x: number, y: number, a: number, range: number, lunge: number, arc: number, r: number,
  body: string, edge: string, fill: string, k: number | null, style: string, strikes: number, pad: { px: number; arc: number },
): void {
  const cx = Math.cos(a), cy = Math.sin(a)
  const sx = x + cx * lunge, sy = y + cy * lunge
  const wide = arc >= TAU - 0.05
  g.save()
  // the step-in
  if (lunge > 6) {
    g.save(); g.setLineDash([6, 6]); g.lineWidth = 3; g.strokeStyle = edge
    g.beginPath(); g.moveTo(x + cx * r * 0.6, y + cy * r * 0.6); g.lineTo(sx, sy); g.stroke()
    g.setLineDash([]); head(g, sx, sy, a)
    g.restore()
  }
  const wedge = (rr: number, ar: number) => {
    g.beginPath()
    if (wide || ar >= TAU - 0.05) g.arc(sx, sy, rr, 0, TAU)
    else { g.moveTo(sx, sy); g.arc(sx, sy, rr, a - ar / 2, a + ar / 2); g.closePath() }
  }
  // the counter draws a shield, not a wedge
  if (style !== 'counter') {
    wedge(range, arc); g.fillStyle = body; g.fill(); g.stroke()
    if (k !== null) { wedge(Math.max(1, range * k), arc); g.fillStyle = fill; g.fill() }
    // the hitbox's forgiveness: a faint outer edge (a foe touching it is hit)
    g.save(); g.globalAlpha = 0.35; g.setLineDash([3, 7]); g.lineWidth = 1.5; wedge(range + pad.px, Math.min(TAU, arc + 2 * pad.arc)); g.stroke(); g.restore()
  }
  g.setLineDash([]); g.lineWidth = 3; g.strokeStyle = edge; g.fillStyle = edge
  const tx = sx + cx * range * 0.8, ty = sy + cy * range * 0.8
  switch (style) {
    case 'bite':
      for (const side of [-1, 1]) { g.beginPath(); g.arc(tx, ty, 16, a + side * 1.57 - 0.8, a + side * 1.57 + 0.8); g.stroke() }
      for (let j = -1; j <= 1; j++) { const fa = a + 1.57 + j * 0.4; g.beginPath(); g.moveTo(tx + Math.cos(fa) * 16, ty + Math.sin(fa) * 16); g.lineTo(tx + Math.cos(fa) * 8, ty + Math.sin(fa) * 8); g.stroke() }
      break
    case 'grab': case 'throw':
      for (const side of [-1, 1]) { g.beginPath(); g.arc(tx, ty, 16, a + Math.PI + side * 1.2 - 0.7, a + Math.PI + side * 1.2 + 0.7); g.stroke() }
      if (style === 'throw') {
        // the throw goes where you aim during the hold
        g.save(); g.setLineDash([5, 6]); g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + cx * 110, ty + cy * 110); g.stroke(); g.restore()
        head(g, tx + cx * 110, ty + cy * 110, a, 14)
      }
      break
    case 'counter':
      g.lineWidth = 7; g.beginPath(); g.arc(x, y, Math.max(r + 14, range * 0.55), a - arc / 2, a + arc / 2); g.stroke()
      if (k !== null) { g.lineWidth = 3; g.beginPath(); g.arc(x, y, Math.max(r + 14, range * 0.55) + 8, a - (arc / 2) * k, a + (arc / 2) * k); g.stroke() }
      break
    case 'thrust':
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + cx * range, sy + cy * range); g.stroke()
      head(g, sx + cx * range, sy + cy * range, a, 10)
      break
    case 'kick': case 'tail': case 'slash': {
      // the sweep's direction along the arc
      const rr = range * 0.7, e = a + arc / 2 - 0.1
      g.beginPath(); g.arc(sx, sy, rr, a - arc / 2 + 0.1, e); g.stroke()
      head(g, sx + Math.cos(e) * rr, sy + Math.sin(e) * rr, e + Math.PI / 2, 10)
      break
    }
    case 'uppercut': case 'chop': {
      // a chevron: up for a launcher, down for a chop
      const s = style === 'uppercut' ? -1 : 1
      g.beginPath(); g.moveTo(tx - 10, ty - s * 6); g.lineTo(tx, ty + s * 6); g.lineTo(tx + 10, ty - s * 6); g.stroke()
      break
    }
    case 'whip': {
      g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + cx * range * 0.5 - cy * 22, sy + cy * range * 0.5 + cx * 22, sx + cx * range, sy + cy * range); g.stroke()
      break
    }
  }
  if (strikes > 1) {
    // the string: tick marks across the arc and ×N
    for (let i = 0; i < strikes; i++) {
      const ta = a - arc * 0.3 + (arc * 0.6 * (i + 0.5)) / strikes
      g.beginPath(); g.moveTo(sx + Math.cos(ta) * (range - 8), sy + Math.sin(ta) * (range - 8)); g.lineTo(sx + Math.cos(ta) * (range + 6), sy + Math.sin(ta) * (range + 6)); g.stroke()
    }
    g.font = '800 18px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.6)'
    const lx = sx + cx * (range + 22), ly = sy + cy * (range + 22)
    g.strokeText(`×${strikes}`, lx, ly); g.fillText(`×${strikes}`, lx, ly)
  }
  g.restore()
}

/** a dash style's glyph on its capsule (x, y the dasher; len the capsule; a the heading): a tackle's recoil arrow, a
 * headbutt's star, a charge's speed lines */
export function drawDashGlyph(g: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, w: number, style: string, edge: string): void {
  const cx = Math.cos(a), cy = Math.sin(a)
  const ex = x + cx * len, ey = y + cy * len
  g.save()
  g.setLineDash([]); g.strokeStyle = edge; g.fillStyle = edge; g.lineWidth = 3
  if (style === 'tackle') {
    // the bonk: it stops on the foe and bounces back
    const bx = ex - cx * 18, by = ey - cy * 18
    g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - cx * 40, by - cy * 40); g.stroke()
    head(g, bx - cx * 40, by - cy * 40, a + Math.PI, 10)
  } else if (style === 'headbutt') {
    star(g, ex - cx * 8, ey - cy * 8, 12, 5)
  } else if (style === 'charge' || style === 'roll') {
    for (const o of [-1, 0, 1]) {
      const px = -cy * o * (w * 0.3), py = cx * o * (w * 0.3)
      g.beginPath(); g.moveTo(x + cx * len * 0.25 + px, y + cy * len * 0.25 + py); g.lineTo(x + cx * len * 0.6 + px, y + cy * len * 0.6 + py); g.stroke()
    }
  }
  g.restore()
}

/** the points of a swoop's curved run (heading turns `turn` rad a tick for `t` ticks, starting half the turn back) */
export function swoopPath(x: number, y: number, a: number, speed: number, t: number, turn: number): { x: number; y: number }[] {
  const pts = [{ x, y }]
  let h = a - (turn * t) / 2, px = x, py = y
  for (let i = 0; i < t; i++) { h += turn; px += Math.cos(h) * speed; py += Math.sin(h) * speed; pts.push({ x: px, y: py }) }
  return pts
}

/** a landing glyph for a leap style: a slam's double shockwave ring, a burrow's mound, a stomp's small ring */
export function drawLandGlyph(g: CanvasRenderingContext2D, x: number, y: number, r: number, style: string, edge: string): void {
  g.save()
  g.setLineDash([]); g.strokeStyle = edge; g.lineWidth = 2
  if (style === 'slam') { g.beginPath(); g.arc(x, y, r * 0.65, 0, TAU); g.stroke(); g.beginPath(); g.arc(x, y, r + 8, 0, TAU); g.stroke() }
  else if (style === 'burrow') { g.beginPath(); g.ellipse(x, y + 4, 18, 8, 0, Math.PI, TAU); g.stroke(); g.beginPath(); g.moveTo(x - 22, y + 4); g.lineTo(x + 22, y + 4); g.stroke() }
  else if (style === 'stomp') { g.beginPath(); g.arc(x, y, r * 0.5, 0, TAU); g.stroke() }
  g.restore()
}

/** an impact frame: radial speed lines around a heavy hit, stark for a few frames */
export function drawImpact(g: CanvasRenderingContext2D, x: number, y: number, t: number, life: number, dir: number, color: string): void {
  const k = t / life
  g.save()
  g.globalCompositeOperation = 'lighter'
  const lines = 16
  for (let i = 0; i < lines; i++) {
    const a = (i / lines) * TAU + dir * 0.3 + (i % 2) * 0.1
    const r0 = 26 + k * 40, r1 = r0 + 60 + (i % 3) * 24
    g.strokeStyle = i % 3 === 0 ? hexA(color, 0.8 * (1 - k)) : `rgba(255,255,255,${0.85 * (1 - k)})`
    g.lineWidth = i % 2 ? 3 : 5
    g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); g.stroke()
  }
  g.fillStyle = `rgba(255,255,255,${0.8 * (1 - k)})`
  star(g, x, y, 34 * (1 - k * 0.5), 10)
  g.restore()
}

/** a hit-confirm: bright corner brackets closing on the target */
export function drawConfirm(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, life: number, color: string): void {
  const k = t / life
  const pad = 22 * (1 - Math.min(1, k * 3)) + 4
  const L = 18
  const x0 = x - w / 2 - pad, x1 = x + w / 2 + pad, y0 = y - h - pad, y1 = y + pad
  g.save()
  g.strokeStyle = hexA(color, 1 - k); g.lineWidth = 4; g.lineCap = 'round'
  for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]] as const) {
    g.beginPath(); g.moveTo(cx + sx * L, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * L); g.stroke()
  }
  g.restore()
}

/** a flinched fighter reels: little stars circling over its head */
export function drawReel(g: CanvasRenderingContext2D, x: number, top: number, frame: number, k: number): void {
  g.save()
  for (let i = 0; i < 3; i++) {
    const a = frame * 0.2 + (i * TAU) / 3
    g.fillStyle = `rgba(255,236,140,${0.9 * Math.min(1, k)})`
    star(g, x + Math.cos(a) * 20, top + 2 + Math.sin(a) * 6, 6, 5)
  }
  g.restore()
}

/** a burrowing fighter: a mound of earth moving underground */
export function drawMound(g: CanvasRenderingContext2D, x: number, y: number, r: number, frame: number): void {
  g.save()
  // a dust ring around the mound, then the mound itself (light earth, outlined, so it reads on dark ground too)
  g.strokeStyle = `rgba(230,210,170,${0.45 + 0.2 * Math.sin(frame * 0.4)})`; g.lineWidth = 3
  g.beginPath(); g.ellipse(x, y + r * 0.45, r * 1.7, r * 0.7, 0, 0, TAU); g.stroke()
  g.fillStyle = 'rgba(176,132,84,0.95)'; g.strokeStyle = 'rgba(40,26,12,0.9)'; g.lineWidth = 2
  g.beginPath(); g.ellipse(x, y + r * 0.45, r * 1.25, r * 0.7, 0, Math.PI, TAU); g.closePath(); g.fill(); g.stroke()
  g.fillStyle = 'rgba(120,86,50,0.95)'
  for (let i = 0; i < 6; i++) { const a = frame * 0.3 + i * 1.1; g.beginPath(); g.arc(x + Math.cos(a) * r * 1.3, y + r * 0.45 + Math.sin(a) * 4, 3.5, 0, TAU); g.fill() }
  g.restore()
}
