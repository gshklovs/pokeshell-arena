// Signature-move looks: the lexicon's own iconic looks, redrawn (Flamethrower, Hydro Pump, Thunderbolt, Solar Beam...) (docs/VFX.md "Signature moves"; the sim side is src/sim/signatures.ts).
// Same look ids as vfx.ts: an entry here replaces its drawer. Each keeps what vfx.ts got right (the palette, the
// particles) and pushes the move toward its name: a roaring jet of flame instead of a wedge, a twin-cannon torrent,
// a thick forked bolt with an orb at its tip, sunlight gathering into a golden beam, and so on.
import { TAU, bolt, cloud, dark, glowDot, hash, hexA, light, pkind, rnd, star, type AreaView, type BeamView, type ConeView, type ShotView, type Vfx, type VfxParticle } from '../vfxkit'
import type { SigDraw } from './types'

const beamGeo = (b: BeamView) => ({ L: Math.hypot(b.x2 - b.x1, b.y2 - b.y1), a: Math.atan2(b.y2 - b.y1, b.x2 - b.x1) })
/** 0 -> 1 over a beam's first ticks: it opens up rather than popping in */
const open = (b: BeamView, n = 3) => Math.min(1, (b.ticks - b.t + 1) / n)
/** a cone's reach and fade (as vfx.ts) */
const coneK = (w: ConeView) => ({ fade: 1 - Math.max(0, w.k - 0.5) / 0.5, reach: w.range * Math.min(1, 0.3 + w.k * 1.6) })

// ------------------------------------------------------------------ flame: Flamethrower

/** Flamethrower: a roaring jet: a white-hot tongue at the mouth, turbulent fireballs tumbling out along the aim and
 * swelling as they go, red at the end and breaking into smoke, embers thrown off */
function flameCone(v: Vfx, el: string, c: string, w: ConeView): void {
  const { g, frame } = v
  const { x, y, aim, arc } = w
  const { fade, reach } = coneK(w)
  const hot = el === 'Fire' ? ['#ffe070', '#ffb02a', '#ff6a1e', '#d0301a', '#5a3a30'] : [light(c, 0.6), light(c, 0.3), c, dark(c, 0.25), dark(c, 0.55)]
  const half = Math.min(arc / 2, 0.34)
  const cx = Math.cos(aim), cy = Math.sin(aim), nx = -cy, ny = cx
  g.save()
  // the body: overlapping flame balls, the far ones first
  const N = 16
  const balls: [number, number][] = []
  for (let i = 0; i < N; i++) balls.push([(frame * 0.075 + i / N) % 1, i])
  balls.sort((p, q) => q[0] - p[0])
  for (const [p, i] of balls) {
    const d = p * reach, wob = Math.sin(frame * 0.45 + i * 2.3) * d * half * 0.45
    const px = x + cx * (d + 14) + nx * wob, py = y + cy * (d + 14) + ny * wob
    const rad = 9 + Math.min(d, reach * 0.8) * Math.tan(half) * 0.85
    const col = hot[Math.min(4, Math.floor(p * 4.6))]
    const gr = g.createRadialGradient(px, py, 0, px, py, rad)
    gr.addColorStop(0, hexA(light(col, 0.35), 0.95 * fade)); gr.addColorStop(0.6, hexA(col, 0.9 * fade * (1 - p * 0.55))); gr.addColorStop(1, hexA(col, 0))
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, rad, 0, TAU); g.fill()
  }
  // the white-hot tongue out of the mouth, licking
  g.globalCompositeOperation = 'lighter'
  const tl = reach * 0.45, tw = 9 + 4 * Math.sin(frame * 0.8)
  g.beginPath(); g.moveTo(x + nx * tw * 0.5, y + ny * tw * 0.5)
  g.quadraticCurveTo(x + cx * tl * 0.5 + nx * tw, y + cy * tl * 0.5 + ny * tw, x + cx * tl + nx * rnd(-6, 6), y + cy * tl + ny * rnd(-6, 6))
  g.quadraticCurveTo(x + cx * tl * 0.5 - nx * tw, y + cy * tl * 0.5 - ny * tw, x - nx * tw * 0.5, y - ny * tw * 0.5)
  g.closePath(); g.fillStyle = hexA(hot[1], 0.85 * fade); g.fill()
  g.restore()
  if (w.k < 0.7) {
    const t = aim + rnd(-1, 1) * half, sp = rnd(0.6, 1) * (w.range / 12)
    v.spawn({ x: x + Math.cos(t) * 30, y: y + Math.sin(t) * 30, vx: Math.cos(t) * sp, vy: Math.sin(t) * sp - 0.5, life: 24, color: hot[1 + (frame % 3)], r: rnd(2, 3.5), kind: el === 'Fire' ? 'ember' : pkind(el), g: -0.04 })
    if (frame % 2 === 0) v.spawn({ x: x + cx * reach, y: y + cy * reach, vx: cx * 0.8, vy: cy * 0.8 - 0.6, life: 34, color: '#4a3a34', r: 12, kind: 'smoke', g: -0.02 })
  }
}

// ------------------------------------------------------------------ water: Hydro Pump, Water Gun

/** a turbulent water tube along +x from 0 to L, half-width hw(x), in the local frame */
function tube(g: CanvasRenderingContext2D, frame: number, L: number, hw: (x: number) => number, col: string, alpha: number, turb: number): void {
  const N = Math.max(8, Math.round(L / 12))
  g.beginPath()
  for (let i = 0; i <= N; i++) { const x = (i / N) * L; g.lineTo(x, -hw(x) * (1 + turb * Math.sin(x * 0.11 - frame * 0.9))) }
  for (let i = N; i >= 0; i--) { const x = (i / N) * L; g.lineTo(x, hw(x) * (1 + turb * Math.sin(x * 0.13 - frame * 0.8 + 2))) }
  g.closePath()
  const gr = g.createLinearGradient(0, -hw(L), 0, hw(L))
  gr.addColorStop(0, hexA(dark(col, 0.35), alpha)); gr.addColorStop(0.5, hexA(light(col, 0.45), alpha)); gr.addColorStop(1, hexA(dark(col, 0.35), alpha))
  g.fillStyle = gr; g.fill()
  g.strokeStyle = hexA('#ffffff', 0.75 * alpha); g.lineWidth = 2; g.stroke()
}

/** Hydro Pump: twin cannon jets blasting out side by side and slamming together into one massive torrent, white
 * pressure streaks racing down it, a foaming crash where it lands */
function hydroBeam(v: Vfx, el: string, c: string, b: BeamView): void {
  const { g, frame } = v
  const { L, a } = beamGeo(b)
  const col = el === 'Water' || el === 'Colorless' ? '#3f8fe0' : c
  const w = b.w * open(b), merge = Math.min(L * 0.35, 120)
  g.save(); g.translate(b.x1, b.y1); g.rotate(a)
  // the two cannons' jets converging
  for (const side of [-1, 1]) {
    g.save(); g.translate(0, side * w * 0.55); g.rotate(-side * Math.atan2(w * 0.55, merge))
    tube(g, frame + side * 7, Math.hypot(merge, w * 0.55) + 10, (x) => w * 0.28 * (0.8 + 0.2 * Math.min(1, x / 30)), col, 0.95, 0.12)
    g.restore()
    // the muzzle: a pressure ring
    const p = (frame * 0.12) % 1
    g.strokeStyle = hexA('#e8f6ff', 0.9 * (1 - p)); g.lineWidth = 3
    g.beginPath(); g.ellipse(4 + p * 16, side * w * 0.55, 4 + p * 4, w * 0.3 + p * 8, 0, 0, TAU); g.stroke()
  }
  // the torrent: one wide turbulent body
  g.save(); g.translate(merge, 0)
  tube(g, frame, L - merge, (x) => w * 0.62 * (1 + 0.35 * Math.min(1, x / (L - merge + 1))), col, 0.95, 0.16)
  g.fillStyle = 'rgba(240,250,255,0.85)'
  g.fillRect(0, -w * 0.12, L - merge, w * 0.24)
  // pressure streaks racing along
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.lineCap = 'round'
  g.beginPath()
  for (let i = 0; i < 14; i++) { const p = (frame * 0.09 + i / 14) % 1, py = Math.sin(i * 2.3) * w * 0.5; g.moveTo(p * (L - merge), py); g.lineTo(p * (L - merge) + 34, py) }
  g.stroke()
  g.restore()
  // the crash: a foam burst at the end
  g.translate(L, 0)
  g.fillStyle = 'rgba(245,252,255,0.95)'
  for (let i = 0; i < 7; i++) { const t = (i / 6 - 0.5) * 2.4 + Math.sin(frame * 0.5 + i) * 0.2, rr = w * (0.6 + 0.3 * Math.sin(frame * 0.7 + i * 1.3)); g.beginPath(); g.arc(Math.cos(t) * rr * 0.6, Math.sin(t) * rr, 7 + 4 * Math.sin(frame * 0.6 + i), 0, TAU); g.fill() }
  g.restore()
  for (let k = 0; k < 2; k++) { const t = a + Math.PI + rnd(-1.4, 1.4); v.spawn({ x: b.x2, y: b.y2, vx: Math.cos(t) * rnd(2, 5), vy: Math.sin(t) * rnd(2, 5) - 2, life: rnd(16, 26), color: k ? '#ffffff' : light(col, 0.4), r: rnd(2.5, 5), kind: 'drop', g: 0.2 }) }
}

/** Water Gun: a tight pressurised squirt: a narrow glassy jet with a bright core, pulses of pressure running down it,
 * breaking into a spray of droplets past its end */
function streamBeam(v: Vfx, el: string, c: string, b: BeamView): void {
  const { g, frame } = v
  const { L, a } = beamGeo(b)
  const col = el === 'Water' || el === 'Colorless' ? '#4aa3f0' : c
  const w = Math.min(b.w, 22) * open(b, 2)
  g.save(); g.translate(b.x1, b.y1); g.rotate(a)
  tube(g, frame, L, (x) => w * 0.42 * (0.75 + 0.25 * Math.min(1, x / 40)), col, 0.9, 0.06)
  g.lineCap = 'round'
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = Math.max(2, w * 0.14)
  g.beginPath(); g.moveTo(0, -w * 0.06); g.lineTo(L, -w * 0.06); g.stroke()
  // pressure pulses: bulges running down the jet
  for (let i = 0; i < 4; i++) { const p = (frame * 0.07 + i / 4) % 1; g.fillStyle = hexA(light(col, 0.3), 0.9); g.beginPath(); g.ellipse(p * L, 0, 8, w * 0.46, 0, 0, TAU); g.fill() }
  // droplets breaking off past the end
  for (let i = 0; i < 7; i++) { const p = (frame * 0.08 + i / 7) % 1; g.fillStyle = hexA(i % 2 ? '#ffffff' : light(col, 0.3), 0.9 * (1 - p)); g.beginPath(); g.arc(L + p * 40, (hash(i, 3) - 0.5) * w * 1.6 * p, 3.5 - p * 1.5, 0, TAU); g.fill() }
  g.restore()
  if (frame % 2 === 0) v.spawn({ x: b.x2, y: b.y2, vx: Math.cos(a) * 2 + rnd(-1.5, 1.5), vy: Math.sin(a) * 2 - rnd(0.5, 2), life: 18, color: '#e8f6ff', r: 2.5, kind: 'drop', g: 0.18 })
}

/** Water Gun as a shot: a squirt of water: a glassy droplet leading a tapered streak, drips shed behind */
function streamShot(v: Vfx, el: string, c: string, s: ShotView): void {
  const { g, frame } = v
  const col = el === 'Water' || el === 'Colorless' ? '#4aa3f0' : c
  const r = Math.max(9, s.r) * (s.kid ? 0.8 : 1.2)
  g.save(); g.translate(s.x, s.y); g.rotate(s.a)
  const gr = g.createLinearGradient(-r * 5, 0, 0, 0); gr.addColorStop(0, hexA(col, 0)); gr.addColorStop(1, hexA(light(col, 0.3), 0.9))
  g.fillStyle = gr; g.beginPath(); g.moveTo(-r * 5, 0); g.quadraticCurveTo(-r * 2, -r * 0.7, 0, -r * 0.8); g.lineTo(0, r * 0.8); g.quadraticCurveTo(-r * 2, r * 0.7, -r * 5, 0); g.fill()
  // the droplet: a teardrop pointing forward
  g.beginPath(); g.arc(0, 0, r, Math.PI * 0.5, Math.PI * 1.5); g.quadraticCurveTo(r * 1.2, -r * 0.7, r * 1.6, 0); g.quadraticCurveTo(r * 1.2, r * 0.7, 0, r); g.closePath()
  const dg = g.createRadialGradient(r * 0.2, -r * 0.3, 0, 0, 0, r * 1.4); dg.addColorStop(0, '#f4fbff'); dg.addColorStop(0.5, light(col, 0.25)); dg.addColorStop(1, dark(col, 0.2))
  g.fillStyle = dg; g.fill(); g.strokeStyle = hexA(dark(col, 0.4), 0.9); g.lineWidth = 1.5; g.stroke()
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(r * 0.2, -r * 0.4, r * 0.35, r * 0.16, 0, 0, TAU); g.fill()
  g.restore()
  if (frame % 2 === 0) v.spawn({ x: s.x - Math.cos(s.a) * r * 2, y: s.y - Math.sin(s.a) * r * 2, vx: rnd(-0.6, 0.6), vy: rnd(0, 0.8), life: 16, color: light(col, 0.3), r: 2.5, kind: 'drop', g: 0.15 })
}

// ------------------------------------------------------------------ electric: Thunderbolt, Thunder

/** a crackling electric orb at (x, y): a white-hot core, a yellow shell, little arcs jumping off it */
function eOrb(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  glowDot(g, x, y, r * 2.4, col, 0.7)
  const gr = g.createRadialGradient(x, y, 0, x, y, r)
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#fffbd0'); gr.addColorStop(1, hexA(col, 0.9))
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * rnd(0.9, 1.1), 0, TAU); g.fill()
  for (let k = 0; k < 3; k++) { const t = rnd(0, TAU); bolt(g, x + Math.cos(t) * r * 0.6, y + Math.sin(t) * r * 0.6, x + Math.cos(t) * r * 2.2, y + Math.sin(t) * r * 2.2, col, 2, 0.5, 0) }
}

/** a forked bolt from a to b drawn to read on a light floor: a dark amber outline, the colour, a white core; `jag`
 * how far it zigzags, `forks` short branches off it */
function thickBolt(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, col: string, w: number, jag: number, forks: number): void {
  const L = Math.hypot(x2 - x1, y2 - y1), nx = -(y2 - y1) / (L || 1), ny = (x2 - x1) / (L || 1)
  const segs = Math.max(4, Math.round(L / 26))
  const pts: [number, number][] = [[x1, y1]]
  for (let i = 1; i < segs; i++) { const t = i / segs, o = (i % 2 ? 1 : -1) * rnd(0.4, 1) * L * jag * Math.sin(Math.PI * t) * 0.5; pts.push([x1 + (x2 - x1) * t + nx * o, y1 + (y2 - y1) * t + ny * o]) }
  pts.push([x2, y2])
  const paths: [number, number][][] = [pts]
  for (let f = 0; f < forks; f++) {
    const i = 1 + Math.floor(Math.random() * (pts.length - 2)), [bx, by] = pts[i], side = Math.random() < 0.5 ? 1 : -1, bl = L * rnd(0.1, 0.18)
    const ax = (x2 - x1) / (L || 1), ay = (y2 - y1) / (L || 1)
    paths.push([[bx, by], [bx + ax * bl * 0.5 + nx * side * bl * 0.5, by + ay * bl * 0.5 + ny * side * bl * 0.5], [bx + ax * bl + nx * side * bl * 0.3, by + ay * bl + ny * side * bl * 0.3]])
  }
  g.save(); g.lineCap = 'round'; g.lineJoin = 'miter'
  const pass = (stroke: string, lw: number) => { g.strokeStyle = stroke; for (const [k, pp] of paths.entries()) { g.lineWidth = k ? lw * 0.5 : lw; g.beginPath(); for (const q of pp) g.lineTo(q[0], q[1]); g.stroke() } }
  g.globalCompositeOperation = 'lighter'; pass(hexA(col, 0.25), w * 3)
  g.globalCompositeOperation = 'source-over'
  pass(hexA('#6a4200', 0.75), w * 1.5); pass(col, w); pass('#ffffff', Math.max(1.5, w * 0.35))
  g.restore()
}

/** Thunderbolt: a thick forked bolt (a fresh zigzag every frame) with a second strand twisting round it, a glow
 * down its length, and a crackling electric orb at its tip */
function zapBeam(v: Vfx, el: string, c: string, b: BeamView): void {
  const { g, frame } = v
  const col = el === 'Lightning' ? '#ffe94a' : c
  const { L, a } = beamGeo(b)
  const w = Math.max(6, b.w * 0.6)
  g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'
  g.strokeStyle = hexA(col, 0.12); g.lineWidth = w * 4
  g.beginPath(); g.moveTo(b.x1, b.y1); g.lineTo(b.x2, b.y2); g.stroke()
  g.restore()
  thickBolt(g, b.x1, b.y1, b.x2, b.y2, col, w, 0.13, 3)
  thickBolt(g, b.x1, b.y1, b.x2, b.y2, light(col, 0.3), w * 0.35, 0.2, 0)
  eOrb(g, b.x2, b.y2, Math.max(12, b.w * 0.8), col)
  glowDot(g, b.x1 + Math.cos(a) * 14, b.y1 + Math.sin(a) * 14, w * 2.2, '#fffbd0', 0.7)
  if (frame % 2 === 0) { const t = Math.random() * L; v.spawn({ x: b.x1 + Math.cos(a) * t, y: b.y1 + Math.sin(a) * t, vx: rnd(-3, 3), vy: rnd(-3, 3), life: 10, color: '#fff6a0', r: 2.5, kind: 'spark', g: 0 }) }
}

/** Thunderbolt as a shot: a crackling orb dragging a jagged bolt along the path it took */
function zapShot(v: Vfx, el: string, c: string, s: ShotView): void {
  const { g, frame } = v
  const col = el === 'Lightning' ? '#ffe94a' : c
  const r = Math.max(9, s.r) * (s.kid ? 0.7 : 1.1)
  const t = s.trail, tail = t[Math.max(0, t.length - 8)] ?? { x: s.x - Math.cos(s.a) * 50, y: s.y - Math.sin(s.a) * 50 }
  thickBolt(g, tail.x, tail.y, s.x, s.y, col, Math.max(3, r * 0.45), 0.3, 1)
  eOrb(g, s.x, s.y, r, col)
  if (frame % 2 === 0) v.spawn({ x: s.x, y: s.y, vx: rnd(-2.5, 2.5), vy: rnd(-2.5, 2.5), life: 10, color: '#fff6a0', r: 2, kind: 'spark', g: 0 })
}

/** Thunder, on the ground: the telegraph (a shadow darkening under the gathering storm, static crawling over it), then
 * a white flash and a scorch with arcs skittering out */
function thunderArea(v: Vfx, el: string, c: string, a: AreaView): void {
  const { g, frame } = v
  const { x, y, r } = a
  const col = el === 'Lightning' ? '#ffe94a' : c
  if (a.land > 0) {
    const k = Math.max(0, Math.min(1, 1 - a.land / 30))
    g.save()
    g.fillStyle = `rgba(20,24,40,${0.12 + 0.25 * k})`; g.beginPath(); g.arc(x, y, r * (0.5 + 0.5 * k), 0, TAU); g.fill()
    g.strokeStyle = hexA(col, 0.5 + 0.4 * Math.sin(frame * 0.5)); g.lineWidth = 3; g.setLineDash([12, 8]); g.lineDashOffset = -frame
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke()
    g.restore()
    if (Math.random() < 0.2 * k) { const t = rnd(0, TAU); bolt(g, x + Math.cos(t) * r * 0.3, y + Math.sin(t) * r * 0.3, x + Math.cos(t) * r * 0.9, y + Math.sin(t) * r * 0.9, col, 1.5, 0.4, 0) }
    return
  }
  const since = -a.land
  if (since < 10) glowDot(g, x, y, r * 1.6, '#fffbd0', 0.9 * (1 - since / 10))
  g.save()
  g.fillStyle = `rgba(30,24,20,${0.35 * a.fade})`; g.beginPath(); g.ellipse(x, y, r * 0.55, r * 0.4, 0, 0, TAU); g.fill()
  g.strokeStyle = hexA(col, 0.8 * a.fade); g.lineWidth = 4
  g.beginPath(); g.arc(x, y, r * Math.min(1, 0.4 + since / 10), 0, TAU); g.stroke()
  g.restore()
  if (since < 10) for (let i = 0; i < 3; i++) { const t = rnd(0, TAU); bolt(g, x, y, x + Math.cos(t) * r, y + Math.sin(t) * r * 0.8, col, 2.5, 0.4, 0) }
  if (since < 2) for (let k = 0; k < 8; k++) { const t = rnd(0, TAU); v.spawn({ x, y, vx: Math.cos(t) * 6, vy: Math.sin(t) * 6, life: 16, color: '#fff6a0', r: 3, kind: 'spark', g: 0 }) }
}

/** Thunder, in the air: a heavy storm cloud gathering and flickering from inside, then one huge forked bolt out of it */
function thunderAir(v: Vfx, el: string, c: string, a: AreaView): void {
  const { g } = v
  const { x, y, r } = a
  const col = el === 'Lightning' ? '#ffe94a' : c
  const top = y - 200
  const k = a.land > 0 ? Math.max(0.3, Math.min(1, 1 - a.land / 30)) : a.fade
  // flicker inside the cloud, then the cloud: a dark underside, a lighter top
  if (Math.random() < 0.25) glowDot(g, x + rnd(-r, r) * 0.6, top, r * 0.8, '#fff6c0', 0.6 * k)
  cloud(g, x, top - 10, r * 1.3, a.id, '#5a6078', 0.85 * k)
  cloud(g, x + 8, top + 12, r * 1.1, a.id + 7, '#262a3a', 0.9 * k)
  if (a.land > 0) {
    if (Math.random() < 0.12) bolt(g, x + rnd(-r, r) * 0.7, top + 16, x + rnd(-r, r) * 0.8, top + rnd(40, 70), '#fff6a0', 2, 0.3, 0)
    return
  }
  const since = -a.land
  if (since < 10) {
    const w = 18 - since * 1.4
    g.save(); g.globalCompositeOperation = 'lighter'
    const gr = g.createLinearGradient(x - r * 0.4, 0, x + r * 0.4, 0)
    gr.addColorStop(0, hexA(col, 0)); gr.addColorStop(0.5, hexA('#fffbd0', 0.5 * (1 - since / 10))); gr.addColorStop(1, hexA(col, 0))
    g.fillStyle = gr; g.fillRect(x - r * 0.4, top + 16, r * 0.8, y - top - 16)
    g.restore()
    thickBolt(g, x + rnd(-10, 10), top + 16, x, y, col, w, 0.16, 4)
    if (since < 5) bolt(g, x + rnd(-r, r) * 0.5, top + 20, x + rnd(-r, r) * 0.4, y + rnd(-r, r) * 0.3, col, w * 0.4, 0.25, 1)
  }
}

// ------------------------------------------------------------------ light: Solar Beam, Hyper Beam

/** Solar Beam: sunlight gathering: a sun blazing at the mouth with rays turning round it and motes of light drawn in,
 * then a thick golden beam opening out of it, light shafts glinting along it, a sunburst where it lands */
function solarBeam(v: Vfx, _el: string, _c: string, b: BeamView): void {
  const { g, frame } = v
  const { L, a } = beamGeo(b)
  const o = open(b, 5), w = b.w * o
  const sx = b.x1 + Math.cos(a) * 16, sy = b.y1 + Math.sin(a) * 16
  // the sun, rays turning, motes streaming in
  g.save(); g.translate(sx, sy)
  glowDot(g, 0, 0, b.w * 3.2, '#ffd23a', 0.55)
  g.rotate(frame * 0.05)
  star(g, b.w * 2.1, 12, 0.45); g.fillStyle = hexA('#ffe27a', 0.65); g.fill()
  g.rotate(-frame * 0.1)
  star(g, b.w * 1.4, 8, 0.5); g.fillStyle = hexA('#fff6c0', 0.8); g.fill()
  for (let i = 0; i < 10; i++) {
    const p = (frame * 0.05 + i / 10) % 1, t = hash(i, 11) * TAU, R = b.w * 4.5 * (1 - p)
    g.fillStyle = hexA('#fff27a', 0.9 * p); g.beginPath(); g.arc(Math.cos(t) * R, Math.sin(t) * R, 2.5 + 2 * p, 0, TAU); g.fill()
  }
  g.restore()
  // the beam
  g.save(); g.translate(b.x1, b.y1); g.rotate(a)
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'
  const fl = rnd(0.94, 1.06)
  g.strokeStyle = hexA('#ffb020', 0.35); g.lineWidth = w * 2.6 * fl; g.beginPath(); g.moveTo(0, 0); g.lineTo(L, 0); g.stroke()
  g.strokeStyle = hexA('#ffd23a', 0.9); g.lineWidth = w * 1.2 * fl; g.stroke()
  g.strokeStyle = hexA('#fff3b0', 0.9); g.lineWidth = w * 0.4 * fl; g.stroke()
  // light shafts: bright diamonds gliding down it
  for (let i = 0; i < 6; i++) { const p = (frame * 0.06 + i / 6) % 1; g.save(); g.translate(p * L, Math.sin(i * 2.1) * w * 0.35); star(g, 7, 4, 0.25); g.fillStyle = 'rgba(255,255,230,0.95)'; g.fill(); g.restore() }
  g.restore()
  // the sunburst where it lands
  g.save(); g.translate(b.x2, b.y2); g.rotate(-frame * 0.08)
  glowDot(g, 0, 0, b.w * 2.2, '#ffe27a', 0.8)
  star(g, b.w * 1.6, 8, 0.4); g.fillStyle = hexA('#fff6c0', 0.7); g.fill()
  g.restore()
  if (frame % 2 === 0) { const t = Math.random(); v.spawn({ x: b.x1 + (b.x2 - b.x1) * t, y: b.y1 + (b.y2 - b.y1) * t, vx: rnd(-1, 1), vy: rnd(-1.5, -0.3), life: 26, color: '#fff27a', r: 3, kind: 'star', g: -0.02 }) }
}

/** Hyper Beam: an enormous orange-white beam: a wide type-tinted aura, an orange body, a white-hot core, shockwave
 * rings bursting off the mouth and riding down the beam, a flare where it lands */
function hyperBeam(v: Vfx, _el: string, c: string, b: BeamView): void {
  const { g, frame } = v
  const { L, a } = beamGeo(b)
  const w = b.w * 1.25 * open(b, 3)
  const fl = rnd(0.92, 1.08)
  g.save(); g.translate(b.x1, b.y1); g.rotate(a)
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'
  g.strokeStyle = hexA(c, 0.25); g.lineWidth = w * 3.6 * fl; g.beginPath(); g.moveTo(0, 0); g.lineTo(L, 0); g.stroke()
  g.globalCompositeOperation = 'source-over'
  g.strokeStyle = hexA('#e0501a', 0.55); g.lineWidth = w * 2.2 * fl; g.stroke()
  g.strokeStyle = hexA('#ff8a1e', 0.95); g.lineWidth = w * 1.6 * fl; g.stroke()
  g.strokeStyle = hexA('#ffc060', 1); g.lineWidth = w * 1.05 * fl; g.stroke()
  g.strokeStyle = hexA('#fff8e8', 1); g.lineWidth = w * 0.55 * fl; g.stroke()
  // shockwave rings: one bursting off the mouth, more riding the beam
  for (let i = 0; i < 5; i++) {
    const p = (frame * 0.07 + i / 5) % 1
    g.strokeStyle = hexA(i % 2 ? '#fff4d8' : '#ffb347', 0.85 * (1 - p * 0.7)); g.lineWidth = 4 - p * 2
    g.beginPath(); g.ellipse(p * L, 0, 7 + p * 4, w * (0.9 + 0.5 * p), 0, 0, TAU); g.stroke()
  }
  const p0 = (frame * 0.12) % 1
  g.strokeStyle = hexA('#ffffff', 0.9 * (1 - p0)); g.lineWidth = 5
  g.beginPath(); g.ellipse(10, 0, 10 + p0 * 14, w * (1 + p0 * 1.4), 0, 0, TAU); g.stroke()
  g.restore()
  glowDot(g, b.x1 + Math.cos(a) * 16, b.y1 + Math.sin(a) * 16, w * 2, '#fff4d8', 0.9)
  glowDot(g, b.x2, b.y2, w * 2.6, '#ffb347', 0.85)
  glowDot(g, b.x2, b.y2, w * 1.2, '#ffffff', 0.9)
  for (let k = 0; k < 2; k++) { const t = a + Math.PI + rnd(-1.5, 1.5); v.spawn({ x: b.x2, y: b.y2, vx: Math.cos(t) * rnd(3, 6), vy: Math.sin(t) * rnd(3, 6), life: 16, color: k ? '#ffffff' : '#ffb347', r: 3, kind: 'spark', g: 0 }) }
}

// ------------------------------------------------------------------ Ember, Razor Leaf, Bubble, Horn Attack

/** a little flame flake at (0, 0) pointing along +x (its tail streaming back), `s` its size */
function flake(g: CanvasRenderingContext2D, s: number, outer: string, inner: string): void {
  g.beginPath(); g.moveTo(s, 0); g.quadraticCurveTo(s * 0.2, -s * 0.9, -s * 1.8, rnd(-0.3, 0.3) * s); g.quadraticCurveTo(s * 0.2, s * 0.9, s, 0); g.fillStyle = outer; g.fill()
  g.beginPath(); g.arc(s * 0.2, 0, s * 0.45, 0, TAU); g.fillStyle = inner; g.fill()
}

/** Ember: a few little embers fluttering along together: flickering flame flakes that dance round each other, sparks
 * popping off */
function fanShot(v: Vfx, el: string, c: string, s: ShotView): void {
  const { g, frame } = v
  const fire = el === 'Fire' || el === 'Colorless'
  const outer = fire ? '#ff6a1e' : c, inner = fire ? '#fff0a0' : light(c, 0.6)
  const base = Math.max(9, s.r) * (s.kid ? 0.45 : 0.62)
  const n = s.kid ? 1 : 3
  g.save(); g.translate(s.x, s.y); g.rotate(s.a)
  glowDot(g, 0, 0, base * 3.2, fire ? '#ff8a2a' : c, 0.35)
  g.globalCompositeOperation = 'lighter'
  for (let i = 0; i < n; i++) {
    const t = frame * 0.35 + s.id + (i * TAU) / n
    g.save(); g.translate(n > 1 ? Math.cos(t) * base * 0.9 - i * base * 0.6 : 0, n > 1 ? Math.sin(t) * base * 1.3 : 0)
    flake(g, base * (i === 0 ? 1.15 : 0.8) * rnd(0.8, 1.15), hexA(outer, 0.9), hexA(inner, 0.95))
    g.restore()
  }
  g.restore()
  if (frame % 2 === 0) v.spawn({ x: s.x, y: s.y, vx: -Math.cos(s.a) * 1.5 + rnd(-1, 1), vy: -Math.sin(s.a) * 1.5 + rnd(-1.5, 0.3), life: rnd(8, 14), color: fire ? '#ffcf4a' : light(c, 0.4), r: 1.8, kind: 'spark', g: -0.02 })
}

/** Razor Leaf: a spinning leaf with a sharp point and a bright cutting edge, blurred by its own spin, a whoosh of cut
 * air round it */
function leavesShot(v: Vfx, el: string, c: string, s: ShotView): void {
  const { g, frame } = v
  const r = Math.max(9, s.r) * (s.kid ? 1 : 1.8)
  const fill = el === 'Grass' || el === 'Colorless' ? '#6fce4a' : light(c, 0.3)
  const spin = frame * 0.6 + s.id
  const blade = (alpha: number) => {
    g.globalAlpha = alpha
    g.beginPath(); g.moveTo(-r, 0); g.bezierCurveTo(-r * 0.4, -r * 0.72, r * 0.5, -r * 0.55, r * 1.1, 0); g.bezierCurveTo(r * 0.5, r * 0.42, -r * 0.4, r * 0.5, -r, 0)
    const gr = g.createLinearGradient(0, -r * 0.6, 0, r * 0.5); gr.addColorStop(0, light(fill, 0.35)); gr.addColorStop(1, dark(fill, 0.35))
    g.fillStyle = gr; g.fill()
    g.strokeStyle = dark(fill, 0.55); g.lineWidth = 1.5; g.stroke()
    // the cutting edge, glinting
    g.beginPath(); g.moveTo(-r * 0.7, -r * 0.35); g.bezierCurveTo(-r * 0.2, -r * 0.62, r * 0.5, -r * 0.5, r * 1.1, 0)
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 2; g.stroke()
    g.beginPath(); g.moveTo(-r * 0.9, 0); g.lineTo(r * 0.9, 0); g.strokeStyle = hexA(dark(fill, 0.5), 0.7); g.lineWidth = 1.2; g.stroke()
  }
  g.save(); g.translate(s.x, s.y)
  // the whoosh: a pale ring of cut air, then two ghosts of the spin and the leaf itself
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * 1.25, spin, spin + 2.2); g.stroke()
  g.rotate(spin - 0.6); blade(0.15)
  g.rotate(0.3); blade(0.4)
  g.rotate(0.3); blade(1)
  g.restore()
  if (frame % 6 === 0 && !s.kid) v.spawn({ x: s.x, y: s.y, vx: rnd(-0.6, 0.6), vy: rnd(-0.6, 0.6), life: 20, color: '#ffffff', r: 2, kind: 'spark', g: 0 })
}

/** Bubble: a wobbling soap bubble with a rainbow sheen round its rim and a window highlight, little bubbles trailing */
function bubbleShot(v: Vfx, el: string, c: string, s: ShotView): void {
  const { g, frame } = v
  const col = el === 'Water' || el === 'Colorless' ? '#4aa3f0' : c
  const r = Math.max(9, s.r) * (s.kid ? 0.9 : 1.5)
  const wob = 1 + Math.sin(frame * 0.3 + s.id) * 0.08
  // trailing little bubbles along the path
  const t = s.trail
  g.save()
  for (let i = 1; i <= 2; i++) {
    const p = t[Math.max(0, t.length - 1 - i * 4)]
    if (!p) continue
    g.strokeStyle = hexA(light(col, 0.3), 0.8); g.lineWidth = 1.5
    g.beginPath(); g.arc(p.x + Math.sin(frame * 0.3 + i) * 3, p.y - i * 2, r * (0.35 - i * 0.08), 0, TAU); g.stroke()
  }
  g.translate(s.x, s.y); g.scale(wob, 1 / wob)
  const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r)
  gr.addColorStop(0, 'rgba(255,255,255,0.2)'); gr.addColorStop(0.7, hexA(light(col, 0.3), 0.4)); gr.addColorStop(1, hexA(col, 0.9))
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill()
  // the sheen: arcs of pink, gold and cyan turning round the rim
  const rot = frame * 0.06 + s.id
  const sheen = ['#ff8ad8', '#ffe27a', '#7af0ff']
  g.lineWidth = 3; g.lineCap = 'round'
  for (let i = 0; i < 3; i++) { g.strokeStyle = hexA(sheen[i], 0.95); g.beginPath(); g.arc(0, 0, r * 0.9, rot + i * 2.1, rot + i * 2.1 + 1.2); g.stroke() }
  g.strokeStyle = hexA(dark(col, 0.2), 0.9); g.lineWidth = 1.8; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke()
  // a window highlight and a glint
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(-r * 0.38, -r * 0.42, r * 0.3, r * 0.16, -0.7, 0, TAU); g.fill()
  g.beginPath(); g.arc(r * 0.42, r * 0.36, r * 0.09, 0, TAU); g.fill()
  g.restore()
}

/** a bubble popping: a thin ring breaking into dashes, droplets flung off */
function bubbleImpact(v: Vfx, el: string, c: string, i: { x: number; y: number; t: number; life: number }): void {
  const { g } = v
  const col = el === 'Water' || el === 'Colorless' ? '#4aa3f0' : c
  const p = i.t / i.life
  g.save(); g.strokeStyle = hexA(light(col, 0.4), 0.9 * (1 - p)); g.lineWidth = 2.5; g.setLineDash([6, 7]); g.lineDashOffset = -i.t * 2
  g.beginPath(); g.arc(i.x, i.y, 12 + p * 30, 0, TAU); g.stroke(); g.restore()
  if (i.t === 1) for (let k = 0; k < 8; k++) { const t = (k / 8) * TAU; v.spawn({ x: i.x, y: i.y, vx: Math.cos(t) * 3, vy: Math.sin(t) * 3 - 1, life: 16, color: k % 2 ? '#ffffff' : light(col, 0.4), r: 2.5, kind: 'drop', g: 0.15 }) }
}

/** Horn Attack: a driving horn: a ridged ivory cone point first, speed lines streaming off it, a glint at the tip */
function lanceShot(v: Vfx, el: string, c: string, s: ShotView): void {
  const { g, frame } = v
  const r = Math.max(9, s.r) * (s.kid ? 0.9 : 1.7)
  const L = r * 3.2
  glowDot(g, s.x, s.y, r * 2.4, light(c, 0.3), 0.45)
  g.save(); g.translate(s.x, s.y); g.rotate(s.a)
  // speed lines in the type colour
  g.lineCap = 'round'
  for (let i = -1; i <= 1; i++) {
    const len = r * (4 + 2 * Math.abs(Math.sin(frame * 0.4 + i))), yy = i * r * 0.55
    const gr = g.createLinearGradient(-L * 0.4 - len, 0, -L * 0.4, 0); gr.addColorStop(0, hexA(c, 0)); gr.addColorStop(1, hexA(light(c, 0.3), 0.85))
    g.strokeStyle = gr; g.lineWidth = i === 0 ? 4 : 2.5; g.beginPath(); g.moveTo(-L * 0.4 - len, yy); g.lineTo(-L * 0.4, yy); g.stroke()
  }
  // the horn: a curved cone, ivory to bone
  g.beginPath(); g.moveTo(L * 0.6, 0); g.quadraticCurveTo(0, -r * 0.35, -L * 0.4, -r * 0.62); g.lineTo(-L * 0.4, r * 0.62); g.quadraticCurveTo(0, r * 0.3, L * 0.6, 0); g.closePath()
  const gr = g.createLinearGradient(0, -r * 0.6, 0, r * 0.6); gr.addColorStop(0, '#fffaf0'); gr.addColorStop(0.5, '#e8dcc0'); gr.addColorStop(1, '#a8987a')
  g.fillStyle = gr; g.fill(); g.strokeStyle = '#6a5a40'; g.lineWidth = 1.8; g.stroke()
  // spiral ridges round it
  g.strokeStyle = 'rgba(110,90,60,0.6)'; g.lineWidth = 1.4
  for (let k = 0; k < 4; k++) { const xx = -L * 0.3 + k * L * 0.2, hh = r * 0.55 * (1 - (k * 0.2)); g.beginPath(); g.moveTo(xx, -hh); g.quadraticCurveTo(xx + r * 0.25, 0, xx + r * 0.1, hh); g.stroke() }
  // the base: a band in the type colour
  g.fillStyle = c; g.fillRect(-L * 0.46, -r * 0.66, r * 0.28, r * 1.32)
  g.restore()
  // the glint at the tip
  const tx = s.x + Math.cos(s.a) * L * 0.6, ty = s.y + Math.sin(s.a) * L * 0.6
  g.save(); g.translate(tx, ty); g.rotate(frame * 0.2); star(g, 6 + 2 * Math.sin(frame * 0.6), 4, 0.25); g.fillStyle = '#ffffff'; g.fill(); g.restore()
}

/** a horn's strike: a four-point glint flashing and a short crack of lines */
function lanceImpact(v: Vfx, _el: string, c: string, i: { x: number; y: number; t: number; life: number; id: number }): void {
  const { g } = v
  const p = i.t / i.life
  g.save(); g.translate(i.x, i.y); g.rotate(0.3)
  g.globalCompositeOperation = 'lighter'
  glowDot(g, 0, 0, 34 * (1 - p), light(c, 0.3), 0.7)
  star(g, 30 * (1 - p * 0.5), 4, 0.15); g.fillStyle = hexA('#ffffff', 1 - p); g.fill()
  g.restore()
}

// ------------------------------------------------------------------ Earthquake, Gust

/** Earthquake: the ground cracking and heaving: slabs of ground between deep lit cracks jolting up and down, rings of
 * dust rolling out, rocks thrown up at the first jolt */
function quakeArea(v: Vfx, el: string, c: string, a: AreaView): void {
  const { g, frame } = v
  const { x, y, r, fade } = a
  if (a.land > 0) {
    const k = Math.max(0, Math.min(1, 1 - a.land / 30))
    g.save(); g.fillStyle = `rgba(60,40,20,${0.1 + 0.2 * k})`; g.beginPath(); g.arc(x, y, r * (0.4 + 0.6 * k), 0, TAU); g.fill()
    g.strokeStyle = hexA(c, 0.5 + 0.4 * Math.sin(frame * 0.5)); g.lineWidth = 3; g.setLineDash([12, 8]); g.lineDashOffset = -frame
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.restore()
    return
  }
  const since = -a.land
  const k = Math.min(1, (since + 2) / 8)
  const n = 7
  const angle = (i: number) => (i / n) * TAU + hash(a.id, i) * 0.5
  g.save(); g.translate(x, y); g.lineJoin = 'round'
  // the slabs: wedges between the cracks, each jolting on its own beat
  for (let i = 0; i < n; i++) {
    const t0 = angle(i) + 0.05, t1 = angle(i + 1) - 0.05 + (i === n - 1 ? TAU : 0)
    const heave = Math.sin(since * 1.3 + i * 2.1) * 9 * Math.max(0, 1 - since / 30) * fade
    const r0 = r * 0.16, r1 = r * k * 0.92
    g.save(); g.translate(0, -Math.abs(heave))
    g.beginPath(); g.arc(0, 0, r1, t0, t1); g.arc(0, 0, r0, t1, t0, true); g.closePath()
    g.fillStyle = hexA(['#a8845a', '#8a6a44', '#b8946a'][i % 3], 0.8 * fade); g.fill()
    g.strokeStyle = hexA('#e8d0a8', 0.8 * fade); g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r1, t0, t1); g.stroke()
    g.restore()
    // the slab's shadow side under its lip
    g.strokeStyle = `rgba(40,24,12,${0.6 * fade})`; g.lineWidth = Math.abs(heave) + 1; g.beginPath(); g.arc(0, 2, r1, t0, t1); g.stroke()
  }
  // the cracks: deep, jagged, the same every frame
  g.strokeStyle = `rgba(36,22,12,${0.9 * fade})`; g.lineWidth = 5; g.lineCap = 'round'
  g.beginPath()
  for (let i = 0; i < n; i++) {
    const t0 = angle(i)
    g.moveTo(0, 0)
    for (let j = 1; j <= 4; j++) { const rr = r * k * (j / 4), tt = t0 + (hash(a.id, i * 13 + j) - 0.5) * 0.35; g.lineTo(Math.cos(tt) * rr, Math.sin(tt) * rr) }
  }
  g.stroke()
  g.fillStyle = `rgba(36,22,12,${0.8 * fade})`; g.beginPath(); g.arc(0, 0, r * 0.16, 0, TAU); g.fill()
  // rings of dust rolling out
  for (let i = 0; i < 2; i++) {
    const p = Math.min(1, ((since + i * 5) % 14) / 14)
    g.strokeStyle = hexA(el === 'Fighting' ? '#d0a070' : light(c, 0.3), 0.7 * (1 - p) * fade); g.lineWidth = 8 * (1 - p) + 2
    g.beginPath(); g.arc(0, 0, r * (0.3 + 0.9 * p), 0, TAU); g.stroke()
  }
  g.restore()
  if (since < 2) for (let j = 0; j < 8; j++) { const t = rnd(0, TAU), rr = rnd(0.2, 0.8) * r; v.spawn({ x: x + Math.cos(t) * rr, y: y + Math.sin(t) * rr, vx: Math.cos(t) * rnd(1, 3), vy: -rnd(3, 6), life: 26, color: ['#9a8a74', '#6a5a48', '#c8b89c'][j % 3], r: rnd(3, 6), kind: 'shard', g: 0.3 }) }
  if (frame % 2 === 0 && since < 20) { const t = rnd(0, TAU); v.spawn({ x: x + Math.cos(t) * r * k, y: y + Math.sin(t) * r * k, vx: Math.cos(t) * 1.2, vy: -rnd(0.5, 1.5), life: 30, color: '#b8a080', r: 9, kind: 'smoke', g: -0.01 }) }
}

/** Gust: swirling wind: little whirlwinds spinning out through the cone, curling streaks of air sweeping past them,
 * leaves and dust caught up */
function gustCone(v: Vfx, el: string, c: string, w: ConeView): void {
  const { g, frame } = v
  const { x, y, aim, arc } = w
  const { fade, reach } = coneK(w)
  const col = el === 'Colorless' || el === 'Grass' ? '#e8f4f8' : light(c, 0.45)
  const ink = el === 'Colorless' || el === 'Grass' ? '#5a8098' : dark(c, 0.15)
  g.save(); g.lineCap = 'round'
  // curling streaks sweeping out
  for (let i = 0; i < 5; i++) {
    const t = aim + ((i + 0.5) / 5 - 0.5) * arc * 0.9, p = (w.k * 1.4 + i * 0.13) % 1, r0 = reach * (0.15 + 0.6 * p), r1 = Math.min(reach, r0 + reach * 0.4)
    g.strokeStyle = hexA(ink, 0.7 * fade); g.lineWidth = 3
    g.beginPath(); g.moveTo(x + Math.cos(t) * r0, y + Math.sin(t) * r0)
    g.quadraticCurveTo(x + Math.cos(t + 0.25) * (r0 + r1) / 2, y + Math.sin(t + 0.25) * (r0 + r1) / 2, x + Math.cos(t - 0.05) * r1, y + Math.sin(t - 0.05) * r1)
    g.stroke()
  }
  // whirlwinds: spirals turning as they travel out
  for (let i = 0; i < 3; i++) {
    const t = aim + (i - 1) * arc * 0.28, d = reach * (0.35 + 0.22 * i + 0.1 * Math.sin(frame * 0.1 + i))
    const px = x + Math.cos(t) * d, py = y + Math.sin(t) * d, R = 14 + d * 0.12
    g.save(); g.translate(px, py); g.rotate(-frame * 0.35 - i)
    for (const [ww, cc] of [[6, ink], [2.5, col]] as [number, string][]) {
      g.beginPath()
      for (let j = 0; j <= 24; j++) { const u = j / 24, an = u * TAU * 1.6, rr = R * (0.15 + 0.85 * u); g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr * 0.75) }
      g.strokeStyle = hexA(cc, 0.9 * fade); g.lineWidth = ww; g.stroke()
    }
    g.restore()
  }
  g.restore()
  if (w.k < 0.6 && frame % 2 === 0) {
    const t = aim + rnd(-0.5, 0.5) * arc, sp = rnd(0.6, 1) * (w.range / 12)
    const p: VfxParticle = { x: x + Math.cos(t) * 20, y: y + Math.sin(t) * 20, vx: Math.cos(t) * sp, vy: Math.sin(t) * sp, life: 26, color: el === 'Grass' ? '#9be870' : '#ffffff', r: 3, kind: el === 'Grass' ? 'leaf' : 'dot', g: 0 }
    v.spawn(p)
  }
}

export const ICONIC: Record<string, SigDraw> = {
  flame: { cone: flameCone },
  hydro: { beam: hydroBeam },
  zap: { beam: zapBeam, shot: zapShot },
  stream: { beam: streamBeam, shot: streamShot },
  solar: { beam: solarBeam },
  hyperbeam: { beam: hyperBeam },
  fan: { shot: fanShot },
  thunder: { area: thunderArea, air: thunderAir },
  quake: { area: quakeArea },
  leaves: { shot: leavesShot },
  bubble: { shot: bubbleShot, impact: bubbleImpact, impactLife: 16 },
  gust: { cone: gustCone },
  lance: { shot: lanceShot, impact: lanceImpact, impactLife: 14 },
}
