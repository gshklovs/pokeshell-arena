// Signature-move looks: the Max / G-Max columns, one per element (docs/VFX.md "Signature moves"; the sim side is src/sim/signatures.ts).
// Every Max move is a colossal strike on the aim point: a ~20-tick telegraph, then a huge hit. They share the Dynamax
// accent (a dark-red rune ring on the ground while it winds up, a red shock ring and a red halo when it lands), and each
// element brings its own column: an eruption, a geyser, an ice spike, a tree, a lightning pillar, a psychic storm, a
// pit, a fist, falling blades, a draconic whirlwind. The ground part (area) is under the fighters, the column (air)
// over them. A few hand kits cast a Max look as a beam or a shot: those get a colossal beam / orb of the element.
import { TAU, bolt, cloud, dark, glowDot, hash, hexA, leaf, light, rnd, star, type AreaView, type BeamView, type ShotView, type Vfx } from '../vfxkit'
import type { SigDraw } from './types'

/** the Dynamax energy: dark red */
const DMX = '#e0183a', DMX_DEEP = '#5a0614', DMX_HOT = '#ff5a70'
/** the Max telegraph, ticks (signatures.ts maxShape delay) */
const TELE = 20

/** where a strike is: k 0 -> 1 over the telegraph; since: ticks since it landed; hit: 1 at landing, easing to 0 */
function phase(a: AreaView): { landed: boolean; since: number; k: number; hit: number } {
  const since = -a.land
  return { landed: a.land <= 0, since, k: Math.max(0, Math.min(1, 1 - a.land / TELE)), hit: a.land <= 0 ? Math.max(0, 1 - since / 12) : 0 }
}
const ease = (t: number) => t * t

/** the Dynamax telegraph on the ground: a dark-red disc darkening, a turning ring of rune arcs, a ring closing in, the
 * element's colour as an inner ring; red motes rise off it */
function dynaTele(v: Vfx, a: AreaView, col: string): void {
  const { g, frame } = v
  const { x, y, r } = a
  const { k } = phase(a)
  g.save(); g.translate(x, y)
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, r)
  gr.addColorStop(0, hexA(DMX_DEEP, 0.25 + 0.3 * k)); gr.addColorStop(0.75, hexA(DMX, 0.12 + 0.18 * k)); gr.addColorStop(1, hexA(DMX, 0))
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill()
  g.lineCap = 'round'
  // the rune ring: six arcs turning, notched
  g.rotate(frame * 0.04)
  g.strokeStyle = hexA(DMX_HOT, 0.55 + 0.35 * Math.sin(frame * 0.4)); g.lineWidth = 4
  for (let i = 0; i < 6; i++) { const t = (i / 6) * TAU; g.beginPath(); g.arc(0, 0, r * 0.92, t + 0.1, t + TAU / 6 - 0.1); g.stroke() }
  g.lineWidth = 2
  for (let i = 0; i < 6; i++) { const t = (i / 6) * TAU; g.beginPath(); g.moveTo(Math.cos(t) * r * 0.62, Math.sin(t) * r * 0.62); g.lineTo(Math.cos(t) * r * 0.84, Math.sin(t) * r * 0.84); g.stroke() }
  g.rotate(-frame * 0.1)
  g.strokeStyle = hexA(col, 0.7); g.lineWidth = 3; g.setLineDash([10, 8])
  g.beginPath(); g.arc(0, 0, r * 0.58, 0, TAU); g.stroke()
  g.setLineDash([])
  // the ring closing in on the strike
  g.strokeStyle = hexA(DMX, 0.4 + 0.5 * k); g.lineWidth = 3 + 4 * k
  g.beginPath(); g.arc(0, 0, r * (1.7 - 0.7 * k), 0, TAU); g.stroke()
  g.restore()
  if (frame % 3 === 0) { const t = rnd(0, TAU), rr = rnd(0.2, 0.95) * r; v.spawn({ x: x + Math.cos(t) * rr, y: y + Math.sin(t) * rr, vx: 0, vy: -rnd(1, 2.5), life: 22, color: DMX_HOT, r: 3, kind: 'dot', g: -0.03 }) }
}

/** the Dynamax landing on the ground: a dark scorch, a red shock ring racing out */
function dynaShock(v: Vfx, a: AreaView): void {
  const { g } = v
  const { x, y, r, fade } = a
  const { since } = phase(a)
  g.save()
  g.fillStyle = hexA(DMX_DEEP, 0.35 * fade); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill()
  const p = Math.min(1, since / 9)
  g.strokeStyle = hexA(DMX, 0.9 * (1 - p)); g.lineWidth = 12 * (1 - p) + 2
  g.beginPath(); g.arc(x, y, r * (0.7 + 0.9 * p), 0, TAU); g.stroke()
  g.strokeStyle = hexA('#ffffff', 0.7 * (1 - p)); g.lineWidth = 3
  g.beginPath(); g.arc(x, y, r * (0.7 + 0.9 * p), 0, TAU); g.stroke()
  g.restore()
}

/** the red Dynamax halo behind a column: a soft band of dark-red energy (drawn plain: it has to read on a light floor) */
function dynaHalo(g: CanvasRenderingContext2D, x: number, y: number, w: number, H: number, a: number): void {
  g.save()
  const gr = g.createLinearGradient(x - w, 0, x + w, 0)
  gr.addColorStop(0, hexA(DMX, 0)); gr.addColorStop(0.5, hexA(DMX, 0.28 * a)); gr.addColorStop(1, hexA(DMX, 0))
  g.fillStyle = gr; g.fillRect(x - w, y - H, w * 2, H)
  g.restore()
}

/** radial ground cracks (stable for the id), `k` how far they reach; a lit edge in `glow` if given */
function cracks(g: CanvasRenderingContext2D, a: AreaView, n: number, k: number, ink: string, glow?: string): void {
  g.save(); g.translate(a.x, a.y); g.lineJoin = 'round'; g.lineCap = 'round'
  const path = () => {
    g.beginPath()
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * TAU + hash(a.id, i) * 0.5
      g.moveTo(0, 0)
      for (let j = 1; j <= 4; j++) { const rr = a.r * k * (j / 4) * (0.75 + 0.3 * hash(a.id, i * 7 + j)), tt = t0 + (hash(a.id, i * 13 + j) - 0.5) * 0.5; g.lineTo(Math.cos(tt) * rr, Math.sin(tt) * rr * 0.85) }
    }
  }
  if (glow) { path(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = hexA(glow, 0.55); g.lineWidth = 9; g.stroke(); g.globalCompositeOperation = 'source-over' }
  path(); g.strokeStyle = ink; g.lineWidth = 3.5; g.stroke()
  if (glow) { path(); g.strokeStyle = hexA(light(glow, 0.5), 0.95); g.lineWidth = 1.6; g.stroke() }
  g.restore()
}

// ------------------------------------------------------------------ the columns

/** Max Flare: a volcanic eruption: a turbulent column of flame bursting up out of a molten crater, lava flung out */
function fireAir(v: Vfx, a: AreaView): void {
  const { g, frame } = v
  const { x, y, r } = a
  const { landed, since, hit } = phase(a)
  if (!landed) return
  const grow = Math.min(1, (since + 1) / 4), H = 330 * grow, W = r * 0.62, al = Math.max(0.15, hit) * a.fade
  dynaHalo(g, x, y, W * 1.6, H, al)
  g.save()
  const layers: [string, number][] = [['#9a1810', 1], ['#ff5a1e', 0.74], ['#ffb030', 0.48], ['#fff6d0', 0.22]]
  for (let L = 0; L < layers.length; L++) {
    if (L === 3) g.globalCompositeOperation = 'lighter'
    const [col, s] = layers[L]
    g.beginPath()
    const N = 18
    for (let side = -1; side <= 1; side += 2) {
      for (let j = 0; j <= N; j++) {
        const i = side < 0 ? j : N - j, t = i / N
        // wider at the base and in a plume at the top, a lick of turbulence up the sides
        const ww = W * s * (0.85 - 0.35 * t + 0.55 * Math.max(0, t - 0.7) / 0.3) * (1 + 0.22 * Math.sin(t * 11 - frame * 0.7 + side * 1.7 + L))
        g.lineTo(x + side * ww + Math.sin(t * 5 + frame * 0.2) * 8 * t, y - t * H)
      }
    }
    g.closePath(); g.fillStyle = hexA(col, (L === 0 ? 0.8 : 0.9) * al); g.fill()
  }
  g.restore()
  // the plume: smoke and fire balls boiling at the top
  for (let i = 0; i < 5; i++) {
    const t = (i / 5) * TAU + frame * 0.05, px = x + Math.cos(t) * W * 0.8, py = y - H + Math.sin(t) * 18
    glowDot(g, px, py, 34 * grow, i % 2 ? '#ff8a2a' : '#5a3a34', 0.6 * al)
  }
  if (since < 8) for (let k = 0; k < 2; k++) v.spawn({ x: x + rnd(-W, W) * 0.5, y: y - H * rnd(0.5, 1), vx: rnd(-5, 5), vy: -rnd(2, 6), life: rnd(22, 34), color: ['#ffb340', '#ff5a1e'][k], r: rnd(3.5, 6), kind: 'ember', g: 0.28 })
  if (frame % 3 === 0) v.spawn({ x: x + rnd(-W, W) * 0.6, y: y - H, vx: rnd(-0.6, 0.6), vy: -rnd(0.5, 1.2), life: 40, color: '#4a3a34', r: 18, kind: 'smoke', g: -0.02 })
}
function fireArea(v: Vfx, a: AreaView): void {
  const { landed, k } = phase(a)
  if (!landed) {
    dynaTele(v, a, '#ff6a1e')
    // the ground splitting, lava showing through
    cracks(v.g, a, 7, 0.3 + 0.6 * k, '#3a1a10', '#ff6a1e')
    if (v.frame % 2 === 0) v.spawn({ x: a.x + rnd(-a.r, a.r) * 0.6, y: a.y + rnd(-a.r, a.r) * 0.5, vx: 0, vy: -rnd(0.5, 1.5), life: 20, color: '#ffb340', r: 2.5, kind: 'ember', g: -0.03 })
    return
  }
  dynaShock(v, a)
  // the molten crater
  const { g } = v
  g.save()
  const gr = g.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.r * 0.7)
  gr.addColorStop(0, hexA('#fff0a0', 0.9 * a.fade)); gr.addColorStop(0.4, hexA('#ff6a1e', 0.8 * a.fade)); gr.addColorStop(1, hexA('#5a1a10', 0))
  g.fillStyle = gr; g.beginPath(); g.ellipse(a.x, a.y, a.r * 0.7, a.r * 0.5, 0, 0, TAU); g.fill()
  g.restore()
  cracks(g, a, 9, 1, hexA('#2a120a', a.fade), '#ff6a1e')
}

/** Max Geyser: a thick column of water blasting up, a white crown of spray at the top raining back down */
function waterAir(v: Vfx, a: AreaView): void {
  const { g, frame } = v
  const { x, y, r } = a
  const { landed, since, hit } = phase(a)
  if (!landed) return
  const grow = Math.min(1, (since + 1) / 3), H = 320 * grow, W = r * 0.42, al = Math.max(0.2, hit) * a.fade
  dynaHalo(g, x, y, W * 2.2, H, al)
  g.save()
  // the body: a wobbling tube, lighter in the middle
  g.beginPath()
  for (let i = 0; i <= 14; i++) { const t = i / 14; g.lineTo(x - W * (1 - 0.25 * t) * (1 + 0.1 * Math.sin(t * 9 + frame * 0.9)), y - t * H) }
  for (let i = 14; i >= 0; i--) { const t = i / 14; g.lineTo(x + W * (1 - 0.25 * t) * (1 + 0.1 * Math.sin(t * 9 - frame * 0.9 + 2)), y - t * H) }
  g.closePath()
  const gr = g.createLinearGradient(x - W, 0, x + W, 0)
  gr.addColorStop(0, hexA('#1850a8', 0.95 * al)); gr.addColorStop(0.45, hexA('#5ab0f5', 0.95 * al)); gr.addColorStop(1, hexA('#1850a8', 0.95 * al))
  g.fillStyle = gr; g.fill()
  g.strokeStyle = hexA('#ffffff', 0.8 * al); g.lineWidth = 2.5; g.stroke()
  // rushing streaks up the column
  g.strokeStyle = hexA('#ffffff', 0.85 * al); g.lineWidth = 3; g.lineCap = 'round'
  g.beginPath()
  for (let i = 0; i < 9; i++) { const p = (frame * 0.09 + hash(a.id, i)) % 1, px = x + (hash(a.id, i + 20) - 0.5) * W * 1.4; g.moveTo(px, y - p * H); g.lineTo(px, y - Math.min(1, p + 0.12) * H) }
  g.stroke()
  // the crown: foam balls spilling over the top
  g.fillStyle = hexA('#f4fbff', 0.95 * al)
  for (let i = 0; i < 9; i++) { const t = (i / 8) * Math.PI, rr = W * (1.2 + 0.25 * Math.sin(frame * 0.5 + i)); g.beginPath(); g.arc(x - Math.cos(t) * rr, y - H + Math.sin(t) * 10 - 6, 12 + 5 * Math.sin(frame * 0.4 + i * 2), 0, TAU); g.fill() }
  g.restore()
  if (since < 10) for (let k = 0; k < 2; k++) v.spawn({ x: x + rnd(-W, W), y: y - H, vx: rnd(-4, 4), vy: -rnd(1, 4), life: rnd(24, 36), color: k ? '#ffffff' : '#8fd0ff', r: rnd(3, 5), kind: 'drop', g: 0.3 })
}
function waterArea(v: Vfx, a: AreaView): void {
  const { g, frame } = v
  const { landed, k, since } = phase(a)
  if (!landed) {
    dynaTele(v, a, '#4aa3f0')
    // the ground wells up: a dark wet spot, bubbles popping
    g.save(); g.fillStyle = hexA('#1f4f90', 0.2 + 0.3 * k); g.beginPath(); g.ellipse(a.x, a.y, a.r * 0.5 * (0.4 + k), a.r * 0.38 * (0.4 + k), 0, 0, TAU); g.fill()
    g.strokeStyle = 'rgba(220,240,255,0.8)'; g.lineWidth = 2
    for (let i = 0; i < 5; i++) { const p = (frame * 0.05 + i / 5) % 1, t = hash(a.id, i) * TAU, rr = a.r * 0.35 * k * hash(a.id, i + 9); g.beginPath(); g.arc(a.x + Math.cos(t) * rr, a.y + Math.sin(t) * rr * 0.7, 3 + 6 * p, 0, TAU); g.stroke() }
    g.restore()
    return
  }
  dynaShock(v, a)
  // a flooded pool, ripples rolling out
  g.save()
  g.fillStyle = hexA('#2f7fd0', 0.5 * a.fade); g.beginPath(); g.ellipse(a.x, a.y, a.r * 0.85, a.r * 0.62, 0, 0, TAU); g.fill()
  for (let i = 0; i < 3; i++) { const p = ((since * 0.08 + i / 3) % 1); g.strokeStyle = hexA('#e8f6ff', 0.8 * (1 - p) * a.fade); g.lineWidth = 3; g.beginPath(); g.ellipse(a.x, a.y, a.r * (0.4 + 0.6 * p), a.r * (0.3 + 0.45 * p), 0, 0, TAU); g.stroke() }
  g.restore()
}

/** a crystal of ice from its tip (0, 0) up `L` long and `w` wide: faceted, light and shaded halves */
function crystal(g: CanvasRenderingContext2D, L: number, w: number, al: number): void {
  g.beginPath(); g.moveTo(0, 0); g.lineTo(-w, -L * 0.3); g.lineTo(-w * 0.75, -L); g.lineTo(0, -L * 1.08); g.lineTo(0, 0); g.closePath()
  g.fillStyle = hexA('#e8f8ff', 0.95 * al); g.fill()
  g.beginPath(); g.moveTo(0, 0); g.lineTo(w, -L * 0.3); g.lineTo(w * 0.75, -L); g.lineTo(0, -L * 1.08); g.closePath()
  g.fillStyle = hexA('#7cc8f0', 0.95 * al); g.fill()
  g.beginPath(); g.moveTo(0, 0); g.lineTo(-w, -L * 0.3); g.lineTo(-w * 0.75, -L); g.lineTo(0, -L * 1.08); g.lineTo(w * 0.75, -L); g.lineTo(w, -L * 0.3); g.closePath()
  g.strokeStyle = hexA('#2a6a9a', 0.9 * al); g.lineWidth = 2.5; g.stroke()
  g.strokeStyle = hexA('#ffffff', 0.9 * al); g.lineWidth = 2
  g.beginPath(); g.moveTo(-w * 0.45, -L * 0.25); g.lineTo(-w * 0.35, -L * 0.9); g.stroke()
}

/** Max Hailstorm: a colossal spike of ice hanging in the air, crashing down point first, planted in a star of frost */
function iceAir(v: Vfx, a: AreaView): void {
  const { g, frame } = v
  const { x, y, r } = a
  const { landed, since, k, hit } = phase(a)
  const L = 250, w = r * 0.32
  if (!landed) {
    // it hangs high, then drops: point down, a frosty glow round it
    const drop = k < 0.45 ? 0 : ease((k - 0.45) / 0.55)
    const tip = y - 110 + 120 * drop
    g.save(); g.translate(x, tip)
    glowDot(g, 0, -L * 0.5, w * 3, '#bfe8ff', 0.5)
    crystal(g, L, w, 0.35 + 0.65 * k)
    g.restore()
    if (drop > 0 && frame % 2 === 0) v.spawn({ x: x + rnd(-w, w), y: tip - rnd(0, L), vx: 0, vy: -2, life: 14, color: '#ffffff', r: 2.5, kind: 'star', g: 0 })
    return
  }
  // planted: the spike jutting up out of the ground (its point buried), smaller spikes burst out round it
  const al = a.fade, sh = Math.max(0, 1 - since / 4)
  dynaHalo(g, x, y, w * 2.5, L, Math.max(0.2, hit) * al)
  g.save(); g.translate(x + rnd(-3, 3) * sh, y + 6)
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * TAU + hash(a.id, i) * 0.6, rr = r * 0.62
    g.save(); g.translate(Math.cos(t) * rr, Math.sin(t) * rr * 0.7); g.rotate(Math.cos(t) * 0.5); crystal(g, 60 + 30 * hash(a.id, i + 5), 14, al); g.restore()
  }
  g.rotate(0.06); crystal(g, L, w, al)
  g.restore()
  if (since < 2) for (let i = 0; i < 12; i++) { const t = rnd(0, TAU); v.spawn({ x, y, vx: Math.cos(t) * rnd(3, 7), vy: Math.sin(t) * rnd(2, 5) - 3, life: 28, color: i % 2 ? '#ffffff' : '#a8e0ff', r: rnd(3, 6), kind: 'shard', g: 0.25 }) }
}
function iceArea(v: Vfx, a: AreaView): void {
  const { g } = v
  const { landed, k } = phase(a)
  if (!landed) {
    dynaTele(v, a, '#a8e0ff')
    // the spike's shadow sharpening as it falls
    g.save(); g.fillStyle = `rgba(20,40,70,${0.15 + 0.3 * k})`; g.beginPath(); g.ellipse(a.x, a.y, a.r * 0.35 * (0.5 + k), a.r * 0.18 * (0.5 + k), 0, 0, TAU); g.fill(); g.restore()
    return
  }
  dynaShock(v, a)
  // a star of frost across the ground
  g.save(); g.translate(a.x, a.y)
  g.fillStyle = hexA('#e8f8ff', 0.55 * a.fade)
  g.beginPath(); for (let i = 0; i < 16; i++) { const t = (i / 16) * TAU, rr = i % 2 ? a.r * 0.4 : a.r * (0.8 + 0.25 * hash(a.id, i)); g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr * 0.8) } g.closePath(); g.fill()
  g.strokeStyle = hexA('#7cc8f0', 0.8 * a.fade); g.lineWidth = 2; g.stroke()
  g.restore()
}

/** Max Overgrowth: a giant tree bursting up out of the ground: a trunk heaving up, branches, a canopy unfurling */
function leafAir(v: Vfx, a: AreaView): void {
  const { g, frame } = v
  const { x, y, r } = a
  const { landed, since, hit } = phase(a)
  if (!landed) return
  const grow = 1 - Math.pow(1 - Math.min(1, (since + 1) / 6), 3), H = 210 * grow, al = a.fade
  dynaHalo(g, x, y, r, H + 60, Math.max(0.2, hit) * al)
  g.save(); g.globalAlpha = al; g.lineCap = 'round'; g.lineJoin = 'round'
  // the trunk: a tapered, gnarled column
  const tw = r * 0.28
  g.beginPath(); g.moveTo(x - tw, y); g.bezierCurveTo(x - tw * 0.6, y - H * 0.4, x - tw * 0.7, y - H * 0.7, x - tw * 0.35, y - H)
  g.lineTo(x + tw * 0.35, y - H); g.bezierCurveTo(x + tw * 0.5, y - H * 0.6, x + tw * 0.6, y - H * 0.3, x + tw, y); g.closePath()
  const gr = g.createLinearGradient(x - tw, 0, x + tw, 0); gr.addColorStop(0, '#8a5a30'); gr.addColorStop(0.5, '#6a4222'); gr.addColorStop(1, '#3e2612')
  g.fillStyle = gr; g.fill(); g.strokeStyle = '#2a180a'; g.lineWidth = 2.5; g.stroke()
  // branches
  g.strokeStyle = '#5a3a1c'
  for (let i = 0; i < 4; i++) { const side = i % 2 ? 1 : -1, by = y - H * (0.55 + 0.1 * i), bl = r * 0.55 * grow; g.lineWidth = 9 - i; g.beginPath(); g.moveTo(x + side * tw * 0.3, by); g.quadraticCurveTo(x + side * bl * 0.6, by - 10, x + side * bl, by - 38); g.stroke() }
  // the canopy: clumps of leaves, dark to light
  const cy = y - H - 10
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * TAU + hash(a.id, i), rr = r * 0.55 * grow * (0.6 + 0.4 * hash(a.id, i + 3)), sw = Math.sin(frame * 0.12 + i) * 3
      g.fillStyle = pass ? '#7ed957' : '#2f7a2a'
      g.beginPath(); g.arc(x + Math.cos(t) * rr + sw, cy + Math.sin(t) * rr * 0.55 - pass * 8, r * (pass ? 0.24 : 0.3) * grow, 0, TAU); g.fill()
    }
  }
  g.fillStyle = '#4caa3a'; g.beginPath(); g.arc(x, cy - 10, r * 0.34 * grow, 0, TAU); g.fill()
  g.restore()
  if (frame % 2 === 0) v.spawn({ x: x + rnd(-r, r) * 0.6, y: cy + rnd(-20, 20), vx: rnd(-2.5, 2.5), vy: rnd(-2, 0), life: 40, color: ['#7ed957', '#4caa3a'][frame % 2], r: 4, kind: 'leaf', g: 0.06 })
}
function leafArea(v: Vfx, a: AreaView): void {
  const { g, frame } = v
  const { landed, k, since } = phase(a)
  if (!landed) {
    dynaTele(v, a, '#5dbb4f')
    cracks(g, a, 6, 0.3 + 0.5 * k, '#3a2a14', '#7ed957')
    // sprouts poking up
    g.save(); g.strokeStyle = '#5dbb4f'; g.lineWidth = 3; g.lineCap = 'round'
    for (let i = 0; i < 5; i++) { const t = hash(a.id, i + 40) * TAU, rr = a.r * 0.6 * hash(a.id, i + 50), px = a.x + Math.cos(t) * rr, py = a.y + Math.sin(t) * rr * 0.7, h = 14 * k + Math.sin(frame * 0.3 + i) * 2; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + 4, py - h * 0.6, px + 2, py - h); g.stroke() }
    g.restore()
    return
  }
  dynaShock(v, a)
  // roots heaving out through the ground, an earth mound round the trunk
  g.save(); g.translate(a.x, a.y); g.lineCap = 'round'
  g.fillStyle = hexA('#5a4028', 0.8 * a.fade); g.beginPath(); g.ellipse(0, 0, a.r * 0.45, a.r * 0.25, 0, 0, TAU); g.fill()
  const reach = Math.min(1, (since + 2) / 6)
  g.strokeStyle = hexA('#5a3a1c', a.fade)
  for (let i = 0; i < 7; i++) {
    const t = (i / 7) * TAU + hash(a.id, i), R = a.r * reach * (0.7 + 0.3 * hash(a.id, i + 7))
    g.lineWidth = 10; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(t + 0.3) * R * 0.5, Math.sin(t + 0.3) * R * 0.4, Math.cos(t) * R, Math.sin(t) * R * 0.8); g.stroke()
  }
  g.restore()
}

/** Max Lightning: a storm cloud gathering and crackling, then a pillar of bundled bolts slamming down */
function boltAir(v: Vfx, a: AreaView): void {
  const { g } = v
  const { x, y, r } = a
  const { landed, since, k } = phase(a)
  const top = y - 230
  // the cloud, a red Dynamax glow in its belly
  if (!landed || since < 12) {
    const al = landed ? a.fade : 0.4 + 0.6 * k
    glowDot(g, x, top + 10, r * 1.2, DMX, 0.45 * al)
    cloud(g, x, top, r * 1.25, a.id, '#2a2d3e', 0.85 * al)
    cloud(g, x + 10, top + 14, r * 0.95, a.id + 1, '#454a60', 0.7 * al)
  }
  if (!landed) {
    if (Math.random() < 0.15 + 0.3 * k) bolt(g, x + rnd(-r, r) * 0.7, top + 10, x + rnd(-r, r) * 0.8, top + rnd(30, 60), '#fff27a', 2, 0.35, 0)
    return
  }
  if (since < 12) {
    const p = since / 12
    g.save(); g.globalCompositeOperation = 'lighter'
    const gr = g.createLinearGradient(x - r * 0.5, 0, x + r * 0.5, 0)
    gr.addColorStop(0, hexA('#ffe94a', 0)); gr.addColorStop(0.5, hexA('#fffbd0', 0.8 * (1 - p))); gr.addColorStop(1, hexA('#ffe94a', 0))
    g.fillStyle = gr; g.fillRect(x - r * 0.5, top + 10, r, y - top - 10)
    g.restore()
    const w = 16 * (1 - p) + 3
    bolt(g, x + rnd(-8, 8), top + 10, x, y, '#ffe94a', w, 0.12, 3)
    bolt(g, x + rnd(-r, r) * 0.4, top + 20, x + rnd(-r, r) * 0.3, y + rnd(-10, 10), DMX_HOT, w * 0.4, 0.2, 1)
    if (since < 5) bolt(g, x + rnd(-r, r) * 0.5, top + 10, x + rnd(-r, r) * 0.4, y, '#fff6a0', w * 0.5, 0.2, 1)
  }
}
function boltArea(v: Vfx, a: AreaView): void {
  const { g } = v
  const { landed, since, k } = phase(a)
  if (!landed) {
    dynaTele(v, a, '#f7d038')
    if (Math.random() < 0.25 * k) { const t = rnd(0, TAU); bolt(g, a.x, a.y, a.x + Math.cos(t) * a.r * 0.7, a.y + Math.sin(t) * a.r * 0.5, '#ffe94a', 1.5, 0.4, 0) }
    return
  }
  dynaShock(v, a)
  if (since < 10) glowDot(g, a.x, a.y, a.r * 1.4, '#fffbd0', 0.8 * (1 - since / 10))
  // arcs skittering over the scorched ground
  if (since < 12) for (let i = 0; i < 3; i++) { const t = rnd(0, TAU); bolt(g, a.x, a.y, a.x + Math.cos(t) * a.r, a.y + Math.sin(t) * a.r * 0.8, '#ffe94a', 2.5, 0.35, 0) }
  if (since < 2) for (let i = 0; i < 10; i++) { const t = rnd(0, TAU); v.spawn({ x: a.x, y: a.y, vx: Math.cos(t) * 6, vy: Math.sin(t) * 6, life: 16, color: '#fff6a0', r: 3, kind: 'spark', g: 0 }) }
}

/** Max Mindstorm: a psychic storm: a twisting tornado of pink and violet rings, stars orbiting in it */
function psyAir(v: Vfx, a: AreaView): void {
  const { g, frame } = v
  const { x, y, r } = a
  const { landed, since, hit } = phase(a)
  if (!landed) return
  const grow = Math.min(1, (since + 1) / 4), H = 300 * grow, al = a.fade
  dynaHalo(g, x, y, r, H, Math.max(0.2, hit) * al)
  g.save(); g.lineCap = 'round'
  const N = 12
  for (let i = 0; i < N; i++) {
    const t = i / N, py = y - t * H, rw = r * (0.25 + 0.75 * t) * (1 + 0.08 * Math.sin(frame * 0.3 + i)), sway = Math.sin(t * 4 + frame * 0.12) * 16 * t
    const sp = frame * 0.25 + i * 0.7
    g.strokeStyle = hexA(i % 2 ? '#e0409a' : '#8a3ac0', 0.9 * al); g.lineWidth = 7 - t * 3
    g.beginPath(); g.ellipse(x + sway, py, rw, rw * 0.22, 0, sp % TAU, (sp % TAU) + 4.2); g.stroke()
    g.strokeStyle = hexA('#ffd0f0', 0.8 * al); g.lineWidth = 2
    g.beginPath(); g.ellipse(x + sway, py, rw, rw * 0.22, 0, sp % TAU + 0.6, (sp % TAU) + 2.4); g.stroke()
  }
  // the eye: a bright core up the middle
  g.globalCompositeOperation = 'lighter'
  const gr = g.createLinearGradient(0, y, 0, y - H)
  gr.addColorStop(0, hexA('#ffffff', 0.7 * al)); gr.addColorStop(1, hexA('#ff9fd6', 0))
  g.fillStyle = gr; g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x + 12, y); g.lineTo(x + 30, y - H); g.lineTo(x - 30, y - H); g.closePath(); g.fill()
  // stars orbiting up the funnel
  for (let i = 0; i < 6; i++) {
    const p = (frame * 0.02 + i / 6) % 1, t = frame * 0.2 + i * 2, rw = r * (0.25 + 0.75 * p)
    g.save(); g.translate(x + Math.cos(t) * rw, y - p * H + Math.sin(t) * rw * 0.22); g.rotate(frame * 0.2); star(g, 8, 4, 0.4); g.fillStyle = hexA('#fff0fa', al); g.fill(); g.restore()
  }
  g.restore()
}
function psyArea(v: Vfx, a: AreaView): void {
  const { g, frame } = v
  const { landed } = phase(a)
  if (!landed) {
    dynaTele(v, a, '#ff7ad0')
    if (frame % 3 === 0) { const t = rnd(0, TAU); v.spawn({ x: a.x + Math.cos(t) * a.r, y: a.y + Math.sin(t) * a.r * 0.8, vx: -Math.cos(t) * 3, vy: -Math.sin(t) * 2.5, life: 22, color: '#ffb0e0', r: 3, kind: 'star', g: 0 }) }
    return
  }
  dynaShock(v, a)
  // a pink spiral whirling on the ground under the storm
  g.save(); g.translate(a.x, a.y); g.rotate(frame * 0.12); g.lineCap = 'round'
  for (let k = 0; k < 3; k++) {
    g.rotate(TAU / 3); g.beginPath()
    for (let i = 0; i <= 16; i++) { const t = i / 16, rr = a.r * (0.1 + 0.9 * t), an = t * 3; g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr * 0.8) }
    g.strokeStyle = hexA(k % 2 ? '#ff7ad0' : '#b36ee0', 0.8 * a.fade); g.lineWidth = 6; g.stroke()
  }
  g.restore()
}

/** Max Darkness: a pit of darkness yawning open underfoot, red eyes glinting in it, shadow tendrils clawing up */
function darkArea(v: Vfx, a: AreaView): void {
  const { g, frame } = v
  const { landed, k, since } = phase(a)
  if (!landed) dynaTele(v, a, '#7a5ab0')
  const open = landed ? Math.max(0.2, 1 - Math.max(0, since - 6) / 10) : 0.25 + 0.55 * k
  const R = a.r * open, al = landed ? a.fade : 1
  g.save(); g.translate(a.x, a.y)
  // the rim glow, then the void swirling
  g.fillStyle = hexA(DMX, 0.55 * al); g.beginPath(); g.ellipse(0, 0, R * 1.08 + 4, R * 0.62 + 4, 0, 0, TAU); g.fill()
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, R)
  gr.addColorStop(0, `rgba(0,0,0,${0.98 * al})`); gr.addColorStop(0.7, `rgba(14,6,26,${0.95 * al})`); gr.addColorStop(1, hexA('#4a2a70', 0.9 * al))
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, R, R * 0.58, 0, 0, TAU); g.fill()
  g.strokeStyle = hexA('#7a5ab0', 0.6 * al); g.lineWidth = 3
  for (let i = 0; i < 3; i++) { const s = frame * 0.06 + i * 2.1; g.beginPath(); g.ellipse(0, 0, R * (0.35 + 0.2 * i), R * (0.2 + 0.11 * i), 0, s, s + 2.2); g.stroke() }
  // a pair of red eyes deep in it
  if (open > 0.5) { g.fillStyle = hexA('#ff3050', al * (0.6 + 0.4 * Math.sin(frame * 0.3))); g.beginPath(); g.ellipse(-R * 0.18, -R * 0.05, R * 0.08, R * 0.035, 0.25, 0, TAU); g.ellipse(R * 0.18, -R * 0.05, R * 0.08, R * 0.035, -0.25, 0, TAU); g.fill() }
  g.restore()
  if (landed && since < 3) dynaShock(v, a)
}
function darkAir(v: Vfx, a: AreaView): void {
  const { g, frame } = v
  const { x, y, r } = a
  const { landed, since, hit } = phase(a)
  if (!landed) return
  const grow = Math.min(1, (since + 1) / 5), al = a.fade
  dynaHalo(g, x, y, r * 0.9, 240 * grow, Math.max(0.15, hit) * al)
  // tendrils of shadow clawing up out of the rim
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'
  for (let i = 0; i < 7; i++) {
    const t = (i / 7) * TAU + hash(a.id, i), bx = x + Math.cos(t) * r * 0.8, by = y + Math.sin(t) * r * 0.45, h = (130 + 90 * hash(a.id, i + 3)) * grow
    const path = () => { g.beginPath(); g.moveTo(bx, by); for (let j = 1; j <= 8; j++) { const u = j / 8; g.lineTo(bx + Math.sin(u * 5 + frame * 0.2 + i) * 16 * u - Math.cos(t) * u * r * 0.3, by - u * h) } }
    path(); g.strokeStyle = hexA('#1a0c28', 0.9 * al); g.lineWidth = 16; g.stroke()
    path(); g.strokeStyle = hexA('#7a5ab0', 0.7 * al); g.lineWidth = 4; g.stroke()
  }
  g.restore()
  if (frame % 2 === 0) v.spawn({ x: x + rnd(-r, r) * 0.6, y: y + rnd(-10, 10), vx: rnd(-0.4, 0.4), vy: -rnd(1, 2.2), life: 36, color: '#241436', r: 14, kind: 'smoke', g: -0.02 })
}

/** a giant fist, fingers curled toward us and knuckles down, at (x, y) (its knuckle line), `s` scale */
function fist(g: CanvasRenderingContext2D, x: number, y: number, s: number, c: string, al: number): void {
  g.save(); g.translate(x, y); g.scale(s, s); g.globalAlpha = al
  const skin = light(c, 0.12), ink = dark(c, 0.65)
  g.lineWidth = 4; g.strokeStyle = ink; g.lineJoin = 'round'
  // the forearm going up, a red Dynamax band at the wrist
  g.fillStyle = dark(c, 0.3); g.fillRect(-40, -220, 80, 130); g.strokeRect(-40, -220, 80, 130)
  g.fillStyle = DMX; g.fillRect(-46, -112, 92, 18)
  // the back of the hand
  g.beginPath(); g.roundRect(-62, -98, 124, 64, 20); g.fillStyle = skin; g.fill(); g.stroke()
  // four curled fingers side by side, knuckles at the bottom
  for (let i = 0; i < 4; i++) {
    g.beginPath(); g.roundRect(-62 + i * 31, -50, 31, 50, 13)
    g.fillStyle = i % 2 ? light(c, 0.22) : light(c, 0.3); g.fill(); g.stroke()
  }
  // the thumb folded across the fingers
  g.beginPath(); g.roundRect(-66, -62, 78, 26, 13); g.fillStyle = light(c, 0.05); g.fill(); g.stroke()
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.ellipse(-20, -84, 30, 7, 0, 0, TAU); g.fill()
  g.restore()
}

/** Max Knuckle: a colossal fist looming overhead, then smashing down into a cratered, cracking ground */
function fistAir(v: Vfx, el: string, c: string, a: AreaView): void {
  const { g } = v
  const { x, y } = a
  const { landed, since, k } = phase(a)
  const col = el === 'Fighting' || el === 'Colorless' ? '#d0803e' : c
  const s = a.r / 120
  if (!landed) {
    const drop = k < 0.55 ? 0 : ease((k - 0.55) / 0.45)
    const fy = y - 190 + 190 * drop
    glowDot(g, x, fy - 50 * s, 120 * s, DMX, 0.55)
    fist(g, x, fy, s * (0.9 + 0.25 * k), col, 0.6 + 0.4 * k)
    return
  }
  if (since < 8) {
    fist(g, x + rnd(-3, 3), y + 8, s * 1.15, col, Math.min(1, 1.6 - since / 5))
    if (since < 4) glowDot(g, x, y, a.r * 1.3, '#fff0d0', 0.7 * (1 - since / 4))
  }
}
function fistArea(v: Vfx, el: string, c: string, a: AreaView): void {
  const { g } = v
  const { landed, since, k } = phase(a)
  if (!landed) {
    dynaTele(v, a, el === 'Fighting' ? '#d0803e' : c)
    // the fist's shadow darkening under it
    g.save(); g.fillStyle = `rgba(0,0,0,${0.12 + 0.35 * k})`; g.beginPath(); g.ellipse(a.x, a.y, a.r * 0.6 * (0.5 + 0.5 * k), a.r * 0.3 * (0.5 + 0.5 * k), 0, 0, TAU); g.fill(); g.restore()
    return
  }
  dynaShock(v, a)
  // the crater: a sunken bowl, cracks radiating
  g.save()
  g.fillStyle = hexA('#3a2a1c', 0.55 * a.fade); g.beginPath(); g.ellipse(a.x, a.y, a.r * 0.65, a.r * 0.45, 0, 0, TAU); g.fill()
  g.restore()
  cracks(g, a, 10, Math.min(1, (since + 3) / 6), hexA('#2a1a0e', a.fade))
  if (since < 2) for (let i = 0; i < 14; i++) { const t = rnd(0, TAU); v.spawn({ x: a.x + Math.cos(t) * 30, y: a.y + Math.sin(t) * 20, vx: Math.cos(t) * rnd(3, 7), vy: Math.sin(t) * rnd(2, 4) - rnd(2, 5), life: 30, color: ['#9a8a74', '#6a5a48', '#c8b89c'][i % 3], r: rnd(3, 7), kind: 'shard', g: 0.3 }) }
  if (since < 6 && v.frame % 2 === 0) { const t = rnd(0, TAU); v.spawn({ x: a.x + Math.cos(t) * a.r * 0.8, y: a.y + Math.sin(t) * a.r * 0.6, vx: Math.cos(t) * 1.5, vy: -rnd(0.5, 1.5), life: 34, color: '#b8a080', r: 12, kind: 'smoke', g: -0.01 }) }
}

/** a steel blade point down, its tip at (0, 0), L long: a silver gradient, a white edge */
function blade(g: CanvasRenderingContext2D, L: number, w: number, al: number): void {
  g.beginPath(); g.moveTo(0, 0); g.lineTo(-w, -L * 0.22); g.lineTo(-w * 0.8, -L); g.lineTo(w * 0.8, -L); g.lineTo(w, -L * 0.22); g.closePath()
  const gr = g.createLinearGradient(-w, 0, w, 0); gr.addColorStop(0, hexA('#6a7a88', al)); gr.addColorStop(0.45, hexA('#f4f8ff', al)); gr.addColorStop(0.55, hexA('#b8c6d2', al)); gr.addColorStop(1, hexA('#4a5866', al))
  g.fillStyle = gr; g.fill(); g.strokeStyle = hexA('#2a3440', al); g.lineWidth = 2; g.stroke()
  g.strokeStyle = hexA('#ffffff', al * 0.9); g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -L * 0.95); g.stroke()
  // a guard of red Dynamax steel
  g.fillStyle = hexA(DMX, al); g.fillRect(-w * 1.6, -L - 8, w * 3.2, 8)
}

/** Max Steelspike: a ring of colossal steel blades hanging overhead, dropping point first, left standing in the ground */
function steelAir(v: Vfx, a: AreaView): void {
  const { g, frame } = v
  const { x, y, r } = a
  const { landed, since, k } = phase(a)
  const n = 5, L = 150
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU + 0.4, rr = i === 0 ? 0 : r * 0.55, bx = x + Math.cos(t) * rr * (i ? 1 : 0), by = y + Math.sin(t) * rr * 0.6 * (i ? 1 : 0)
    const tilt = (hash(a.id, i) - 0.5) * 0.35
    g.save()
    if (!landed) {
      const lag = i * 0.05, drop = k < 0.5 + lag ? 0 : ease(Math.min(1, (k - 0.5 - lag) / (0.5 - lag)))
      g.translate(bx, by - 200 * (1 - drop) + Math.sin(frame * 0.15 + i) * 4 * (1 - drop)); g.rotate(tilt * (1 - drop))
      blade(g, L * (i ? 0.8 : 1), 13, 0.5 + 0.5 * k)
      if (Math.random() < 0.1) { g.save(); g.translate(0, -L * 0.5); star(g, 9, 4, 0.2); g.fillStyle = '#ffffff'; g.fill(); g.restore() }
    } else {
      // stuck in the ground: the tip buried, a quiver on landing
      g.translate(bx + (since < 4 ? rnd(-2, 2) : 0), by + 22); g.rotate(tilt * 0.5)
      blade(g, L * (i ? 0.8 : 1), 13, a.fade)
    }
    g.restore()
  }
  if (landed && since < 2) for (let i = 0; i < 12; i++) { const t = rnd(0, TAU); v.spawn({ x: x + rnd(-r, r) * 0.5, y, vx: Math.cos(t) * rnd(3, 7), vy: -rnd(1, 5), life: 18, color: i % 2 ? '#ffffff' : '#ffe0a0', r: 2.5, kind: 'spark', g: 0.15 }) }
}
function steelArea(v: Vfx, a: AreaView): void {
  const { g } = v
  const { landed, k } = phase(a)
  if (!landed) {
    dynaTele(v, a, '#b8c6d2')
    // the blades' shadows sharpening under them
    g.save(); g.fillStyle = `rgba(0,0,0,${0.1 + 0.3 * k})`
    for (let i = 0; i < 5; i++) { const t = (i / 5) * TAU + 0.4, rr = i ? a.r * 0.55 : 0; g.beginPath(); g.ellipse(a.x + Math.cos(t) * rr, a.y + Math.sin(t) * rr * 0.6, 16, 6, 0, 0, TAU); g.fill() }
    g.restore()
    return
  }
  dynaShock(v, a)
  cracks(g, a, 8, 0.8, hexA('#2a2a30', a.fade * 0.8))
}

/** Max Wyrmwind: a draconic whirlwind: a tornado of violet wind streaks and red Dynamax gusts, dragon-scale motes */
function dragonAir(v: Vfx, a: AreaView): void {
  const { g, frame } = v
  const { x, y, r } = a
  const { landed, since, hit } = phase(a)
  if (!landed) return
  const grow = Math.min(1, (since + 1) / 4), H = 300 * grow, al = a.fade
  dynaHalo(g, x, y, r, H, Math.max(0.2, hit) * al)
  g.save(); g.lineCap = 'round'
  // a funnel body
  g.beginPath(); g.moveTo(x - r * 0.2, y); g.lineTo(x - r * 0.95, y - H); g.lineTo(x + r * 0.95, y - H); g.lineTo(x + r * 0.2, y); g.closePath()
  const gr = g.createLinearGradient(x - r, 0, x + r, 0); gr.addColorStop(0, hexA('#2a1a5a', 0.1 * al)); gr.addColorStop(0.5, hexA('#6a4ad0', 0.45 * al)); gr.addColorStop(1, hexA('#2a1a5a', 0.1 * al))
  g.fillStyle = gr; g.fill()
  // wind streaks wrapping round it: bands sweeping across the front
  for (let i = 0; i < 10; i++) {
    const t = i / 10, py = y - t * H - 8, rw = r * (0.2 + 0.75 * t), ph = (frame * 0.18 + i * 1.3) % TAU
    g.strokeStyle = hexA(i % 3 === 0 ? DMX_HOT : i % 2 ? '#b8a0ff' : '#7a5af0', 0.9 * al); g.lineWidth = 6 - 3 * t
    g.beginPath(); g.ellipse(x, py, rw, rw * 0.28, 0, ph, ph + 2.4); g.stroke()
  }
  g.restore()
  if (frame % 2 === 0) { const t = rnd(0, TAU), p = Math.random(); v.spawn({ x: x + Math.cos(t) * r * (0.2 + 0.7 * p), y: y - p * H, vx: -Math.sin(t) * 4, vy: -1, life: 24, color: ['#b8a0ff', DMX_HOT][frame % 2], r: 3.5, kind: 'shard', g: 0 }) }
}
function dragonArea(v: Vfx, a: AreaView): void {
  const { g, frame } = v
  const { landed } = phase(a)
  if (!landed) { dynaTele(v, a, '#7a5af0'); return }
  dynaShock(v, a)
  g.save(); g.translate(a.x, a.y); g.rotate(-frame * 0.15); g.lineCap = 'round'
  for (let i = 0; i < 6; i++) { g.rotate(TAU / 6); g.strokeStyle = hexA(i % 2 ? '#7a5af0' : '#b8a0ff', 0.75 * a.fade); g.lineWidth = 5; g.beginPath(); g.arc(0, 0, a.r * 0.75, 0, 0.8); g.stroke() }
  g.restore()
}

// ------------------------------------------------------------------ Max looks cast as a beam or a shot

/** a colossal beam along b in the local frame (x along, y across): the draw callback, a red Dynamax fringe round it */
function dynaBeam(v: Vfx, b: BeamView, body: (g: CanvasRenderingContext2D, L: number, w: number) => void): void {
  const { g } = v
  const L = Math.hypot(b.x2 - b.x1, b.y2 - b.y1), an = Math.atan2(b.y2 - b.y1, b.x2 - b.x1)
  const w = b.w * 1.4 * Math.min(1, (b.ticks - b.t + 1) / 3)
  g.save(); g.translate(b.x1, b.y1); g.rotate(an)
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'
  g.strokeStyle = hexA(DMX, 0.35); g.lineWidth = w * 2.4 * rnd(0.92, 1.08)
  g.beginPath(); g.moveTo(0, 0); g.lineTo(L, 0); g.stroke()
  g.globalCompositeOperation = 'source-over'
  body(g, L, w)
  g.restore()
}

/** Max Geyser as a beam: a colossal torrent, foam on its edges */
function waterBeam(v: Vfx, _el: string, _c: string, b: BeamView): void {
  const { frame } = v
  dynaBeam(v, b, (g, L, w) => {
    const N = Math.max(8, Math.round(L / 16))
    g.beginPath()
    for (let i = 0; i <= N; i++) { const x = (i / N) * L; g.lineTo(x, -(w / 2) * (0.6 + 0.4 * Math.min(1, x / 80)) * (1 + 0.15 * Math.sin(x * 0.08 - frame * 0.9))) }
    for (let i = N; i >= 0; i--) { const x = (i / N) * L; g.lineTo(x, (w / 2) * (0.6 + 0.4 * Math.min(1, x / 80)) * (1 + 0.15 * Math.sin(x * 0.08 - frame * 0.9 + 2))) }
    g.closePath()
    const gr = g.createLinearGradient(0, -w / 2, 0, w / 2); gr.addColorStop(0, '#1f5fb0'); gr.addColorStop(0.5, '#9ad6ff'); gr.addColorStop(1, '#1f5fb0')
    g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.stroke()
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; g.lineCap = 'round'
    g.beginPath()
    for (let i = 0; i < 12; i++) { const p = (frame * 0.06 + i / 12) % 1, py = Math.sin(i * 2.7) * w * 0.3; g.moveTo(p * L, py); g.lineTo(p * L + 28, py) }
    g.stroke()
    g.fillStyle = 'rgba(245,252,255,0.95)'
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(L + rnd(-6, 10), rnd(-w, w) * 0.6, rnd(6, 12), 0, TAU); g.fill() }
  })
  if (frame % 2 === 0) for (let k = 0; k < 2; k++) v.spawn({ x: b.x2, y: b.y2, vx: rnd(-3, 3), vy: -rnd(1, 4), life: 22, color: k ? '#ffffff' : '#8fd0ff', r: 4, kind: 'drop', g: 0.25 })
}

/** Max Overgrowth as a beam: a colossal thorned vine lashing out, leaves bursting off it */
function leafBeam(v: Vfx, _el: string, _c: string, b: BeamView): void {
  const { frame } = v
  dynaBeam(v, b, (g, L, w) => {
    const yv = (x: number) => Math.sin(x * 0.03 - frame * 0.25) * w * 0.25 * Math.min(1, x / 60)
    const path = () => { g.beginPath(); for (let i = 0; i <= 30; i++) { const x = (i / 30) * L; g.lineTo(x, yv(x)) } }
    g.lineCap = 'round'; g.lineJoin = 'round'
    path(); g.strokeStyle = '#1e4a1a'; g.lineWidth = w * 0.7; g.stroke()
    path(); g.strokeStyle = '#4caa3a'; g.lineWidth = w * 0.5; g.stroke()
    path(); g.strokeStyle = 'rgba(190,255,150,0.6)'; g.lineWidth = w * 0.12; g.stroke()
    // thorns and leaves along it
    for (let i = 1; i < 12; i++) {
      const x = (i / 12) * L, side = i % 2 ? 1 : -1
      g.fillStyle = '#2a5a1e'; g.beginPath(); g.moveTo(x - 7, yv(x) + side * w * 0.22); g.lineTo(x + 6, yv(x) + side * w * 0.5); g.lineTo(x + 5, yv(x) + side * w * 0.2); g.fill()
      if (i % 3 === 0) { g.save(); g.translate(x, yv(x) - side * w * 0.3); g.rotate(-side * 0.8 + Math.sin(frame * 0.2 + i) * 0.2); leaf(g, 14, '#7ed957'); g.restore() }
    }
  })
  if (frame % 2 === 0) { const t = Math.random(); v.spawn({ x: b.x1 + (b.x2 - b.x1) * t, y: b.y1 + (b.y2 - b.y1) * t, vx: rnd(-2, 2), vy: rnd(-2, 0), life: 34, color: '#7ed957', r: 4, kind: 'leaf', g: 0.05 }) }
}

/** Max Steelspike as a beam: a silver lance of light, steel blades flying along it */
function steelBeam(v: Vfx, _el: string, _c: string, b: BeamView): void {
  const { frame } = v
  dynaBeam(v, b, (g, L, w) => {
    g.globalCompositeOperation = 'lighter'
    g.strokeStyle = hexA('#b8c6d2', 0.7); g.lineWidth = w * 0.8; g.beginPath(); g.moveTo(0, 0); g.lineTo(L, 0); g.stroke()
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = w * 0.25; g.stroke()
    g.globalCompositeOperation = 'source-over'
    for (let i = 0; i < 5; i++) {
      const p = (frame * 0.05 + i / 5) % 1
      g.save(); g.translate(p * L, Math.sin(i * 2.2) * w * 0.3); g.rotate(-Math.PI / 2); blade(g, 46, 7, 1); g.restore()
    }
  })
}

/** Max Wyrmwind as a beam: a whirlwind driven down the line: violet streaks spiralling round a dark core, red gusts,
 * a dragon's horned maw of wind at its head */
function dragonBeam(v: Vfx, _el: string, _c: string, b: BeamView): void {
  const { frame } = v
  dynaBeam(v, b, (g, L, w) => {
    const gr = g.createLinearGradient(0, -w / 2, 0, w / 2); gr.addColorStop(0, hexA('#2a1a5a', 0.2)); gr.addColorStop(0.5, hexA('#6a4ad0', 0.8)); gr.addColorStop(1, hexA('#2a1a5a', 0.2))
    g.fillStyle = gr; g.fillRect(0, -w / 2, L, w)
    g.lineCap = 'round'
    // two spirals twisting along it, and a red one
    for (let s = 0; s < 3; s++) {
      g.beginPath()
      for (let i = 0; i <= 60; i++) { const x = (i / 60) * L, ph = x * 0.05 - frame * 0.5 + (s * TAU) / 3; g.lineTo(x, Math.sin(ph) * w * 0.55) }
      g.strokeStyle = s === 2 ? hexA(DMX_HOT, 0.85) : s ? '#b8a0ff' : '#e8e0ff'; g.lineWidth = s === 2 ? 3 : 4; g.stroke()
    }
    // the maw: two horns of wind sweeping back from the head
    g.translate(L, 0)
    g.fillStyle = hexA('#7a5af0', 0.9)
    for (const side of [-1, 1]) { g.beginPath(); g.moveTo(10, 0); g.quadraticCurveTo(-10, side * w * 0.8, -50, side * w * 1.2); g.quadraticCurveTo(-20, side * w * 0.5, -30, 0); g.closePath(); g.fill() }
    glowDot(g, 0, 0, w * 0.9, '#e8e0ff', 0.8)
  })
  if (frame % 2 === 0) { const t = Math.random(); v.spawn({ x: b.x1 + (b.x2 - b.x1) * t, y: b.y1 + (b.y2 - b.y1) * t, vx: rnd(-2, 2), vy: rnd(-2, 2), life: 20, color: '#b8a0ff', r: 3, kind: 'shard', g: 0 }) }
}

/** Max Geyser as a shot: a colossal ball of churning water with a red Dynamax rim */
function waterShot(v: Vfx, _el: string, _c: string, s: ShotView): void {
  const { g, frame } = v
  const r = Math.max(9, s.r) * (s.kid ? 1 : 2.1)
  g.save()
  glowDot(g, s.x, s.y, r * 1.8, DMX, 0.4)
  const gr = g.createRadialGradient(s.x - r * 0.3, s.y - r * 0.35, r * 0.1, s.x, s.y, r)
  gr.addColorStop(0, '#e8f8ff'); gr.addColorStop(0.5, '#6ab8f5'); gr.addColorStop(1, '#1f5fb0')
  g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.y, r, 0, TAU); g.fill()
  g.translate(s.x, s.y); g.rotate(frame * 0.2)
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.lineCap = 'round'
  for (let k = 0; k < 3; k++) { g.rotate(TAU / 3); g.beginPath(); g.arc(0, 0, r * 0.65, 0, 1.2); g.stroke() }
  g.strokeStyle = hexA(DMX, 0.9); g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, r + 2, 0, TAU); g.stroke()
  g.restore()
  if (frame % 2 === 0) v.spawn({ x: s.x - Math.cos(s.a) * r, y: s.y - Math.sin(s.a) * r, vx: rnd(-1, 1), vy: rnd(-1, 1), life: 18, color: '#bfe6ff', r: 3, kind: 'drop', g: 0.15 })
}

const area = (ground: (v: Vfx, a: AreaView) => void, air: (v: Vfx, a: AreaView) => void): SigDraw => ({
  area: (v, _el, _c, a) => ground(v, a), air: (v, _el, _c, a) => air(v, a),
})

export const MAX: Record<string, SigDraw> = {
  maxfire: area(fireArea, fireAir),
  maxwater: { ...area(waterArea, waterAir), beam: waterBeam, shot: waterShot },
  maxice: area(iceArea, iceAir),
  maxleaf: { ...area(leafArea, leafAir), beam: leafBeam },
  maxbolt: area(boltArea, boltAir),
  maxpsy: area(psyArea, psyAir),
  maxdark: area(darkArea, darkAir),
  maxfist: { area: fistArea, air: fistAir },
  maxsteel: { ...area(steelArea, steelAir), beam: steelBeam },
  maxdragon: { ...area(dragonArea, dragonAir), beam: dragonBeam },
}
