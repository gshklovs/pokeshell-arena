// Signature-move looks: electric, needles and stings (docs/VFX.md "Signature moves"; the sim side is
// src/sim/signatures.ts). Lightning is drawn fresh every frame (a new zigzag, a new jitter), so it crackles; the
// needles are cold metal and the sting a dripping venom barb.
import { TAU, glowDot, hash, hexA, light, rnd, star } from '../vfxkit'
import type { SigDraw } from './types'

const VOLT = '#ffe94a', VOLT_HOT = '#fff6b0', AMBER = '#b86e00'
// these are electric by name whatever the card's type: always the lightning yellow
const volt = (_el: string, _c: string) => VOLT

/** a closed ring of radius R round (x, y) with every point jittered by up to `jit` of R: a crackling shell */
function jagRing(g: CanvasRenderingContext2D, x: number, y: number, R: number, n: number, jit: number): void {
  g.beginPath()
  for (let i = 0; i < n; i++) { const t = (i / n) * TAU, rr = R * (1 + rnd(-jit, jit)); g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr) }
  g.closePath()
}

/** a jagged bolt from a to b drawn opaque (not additive, which washes out to white on the pale arenas): a dark amber
 * outline, the colour, a white core; a fresh zigzag every frame, one fork */
function zig(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, col: string, w: number, jag = 0.4): void {
  const L = Math.hypot(x2 - x1, y2 - y1)
  const nx = -(y2 - y1) / (L || 1), ny = (x2 - x1) / (L || 1)
  const segs = Math.max(3, Math.round(L / 16))
  const pts: [number, number][] = [[x1, y1]]
  for (let i = 1; i < segs; i++) { const t = i / segs, o = rnd(-1, 1) * L * jag * Math.sin(Math.PI * t) * 0.5; pts.push([x1 + (x2 - x1) * t + nx * o, y1 + (y2 - y1) * t + ny * o]) }
  pts.push([x2, y2])
  const fk = pts[1 + Math.floor(Math.random() * (pts.length - 2))], fa = Math.atan2(y2 - y1, x2 - x1) + rnd(-1, 1), fl = L * rnd(0.2, 0.35)
  const line = () => {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1])
    g.moveTo(fk[0], fk[1]); g.lineTo(fk[0] + Math.cos(fa) * fl * 0.5 + rnd(-4, 4), fk[1] + Math.sin(fa) * fl * 0.5 + rnd(-4, 4)); g.lineTo(fk[0] + Math.cos(fa) * fl, fk[1] + Math.sin(fa) * fl)
  }
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'
  line(); g.strokeStyle = 'rgba(110,60,0,0.55)'; g.lineWidth = w + 3; g.stroke()
  g.strokeStyle = col; g.lineWidth = w; g.stroke()
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = Math.max(1, w * 0.4); g.stroke()
  g.restore()
}

/** a burst of lightning out of (x, y): `n` bolts to about R out, fresh every frame */
function arcs(g: CanvasRenderingContext2D, x: number, y: number, R: number, n: number, col: string, w: number, r0 = 0): void {
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU + rnd(-0.3, 0.3), rr = R * rnd(0.6, 1.05)
    zig(g, x + Math.cos(t) * r0, y + Math.sin(t) * r0, x + Math.cos(t) * rr, y + Math.sin(t) * rr, col, w)
  }
}

// ------------------------------------------------------------------ Electro Ball

/** Electro Ball: a bright yellow sphere swelling as it flies, its outline jittering, little arcs leaping off its
 * surface and sparks orbiting it; it bursts in a starburst of bolts and a spray of sparks */
const electroball: SigDraw = {
  shot(v, el, c, s) {
    const { g, frame } = v
    const col = volt(el, c)
    const r = Math.max(9, s.r) * 1.35
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.ellipse(s.x, s.y + r * 1.4, r * 0.9, r * 0.3, 0, 0, TAU); g.fill()
    glowDot(g, s.x, s.y, r * 2.6, col, 0.55)
    const gr = g.createRadialGradient(s.x - r * 0.25, s.y - r * 0.25, 0, s.x, s.y, r)
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, VOLT_HOT); gr.addColorStop(0.8, col); gr.addColorStop(1, '#e09a00')
    g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.y, r, 0, TAU); g.fill()
    g.save()
    // the crackling skin: an amber edge, a white jitter
    jagRing(g, s.x, s.y, r * 1.04, 18, 0.09)
    g.strokeStyle = AMBER; g.lineWidth = 3.5; g.stroke()
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 1.5; g.stroke()
    // sparks orbiting it
    for (let k = 0; k < 3; k++) {
      const t = frame * 0.22 + (k * TAU) / 3 + s.id, px = s.x + Math.cos(t) * r * 1.5, py = s.y + Math.sin(t) * r * 1.5 * 0.7
      g.save(); g.translate(px, py); g.rotate(frame * 0.3 + k); star(g, 5, 4, 0.35); g.fillStyle = VOLT_HOT; g.fill(); g.strokeStyle = AMBER; g.lineWidth = 1.2; g.stroke(); g.restore()
    }
    g.restore()
    // arcs leaping off the surface
    arcs(g, s.x, s.y, r * 2.1, 2, col, 2.2, r * 0.9)
    if (frame % 2 === 0) { const t = rnd(0, TAU); v.spawn({ x: s.x + Math.cos(t) * r, y: s.y + Math.sin(t) * r, vx: Math.cos(t) * 2, vy: Math.sin(t) * 2, life: 10, color: VOLT_HOT, r: 2, kind: 'spark', g: 0 }) }
  },
  impact(v, el, c, i) {
    // the burst: a white flash, a starburst of bolts out to the blast's edge, a ring, sparks
    const { g } = v
    const col = volt(el, c)
    const k = i.t / i.life, a = Math.min(1, 2 * (1 - k))
    glowDot(g, i.x, i.y, i.r * (0.6 + 0.6 * k), VOLT_HOT, 0.85 * a)
    if (i.t < 16) arcs(g, i.x, i.y, i.r * (0.7 + 0.4 * Math.min(1, i.t / 9)), i.t < 8 ? 7 : 4, col, Math.max(1.5, 3.2 - i.t * 0.12))
    g.save()
    jagRing(g, i.x, i.y, i.r * Math.min(1, 0.3 + i.t / 8), 22, 0.06)
    g.strokeStyle = hexA(AMBER, 0.7 * a); g.lineWidth = 6 * (1 - k) + 3; g.stroke()
    g.strokeStyle = hexA(col, a); g.lineWidth = 4 * (1 - k) + 1; g.stroke()
    g.restore()
    if (i.t === 1) for (let n = 0; n < 16; n++) { const t = (n / 16) * TAU; v.spawn({ x: i.x, y: i.y, vx: Math.cos(t) * rnd(3, 6), vy: Math.sin(t) * rnd(3, 6), life: rnd(10, 18), color: n % 2 ? '#ffffff' : col, r: 2.5, kind: 'spark', g: 0 }) }
  },
  impactLife: 26,
}

// ------------------------------------------------------------------ Discharge

/** Discharge: lightning crackling out all around the caster: a charged glow on the ground and a jagged ring racing out
 * (under the fighters), and a crown of bolts forking from the caster out to the ring (over them) */
const discharge: SigDraw = {
  area(v, el, c, a) {
    const { g } = v
    const col = volt(el, c)
    const { x, y, r, fade } = a
    const since = Math.max(0, -a.land), k = Math.min(1, since / 8)
    g.save()
    const gr = g.createRadialGradient(x, y, 0, x, y, r * k + 1)
    gr.addColorStop(0, hexA(VOLT_HOT, 0.45 * fade)); gr.addColorStop(0.7, hexA(col, 0.18 * fade)); gr.addColorStop(1, hexA(col, 0))
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r * k + 1, (r * k + 1) * 0.8, 0, 0, TAU); g.fill()
    g.save(); g.translate(x, y); g.scale(1, 0.8)
    jagRing(g, 0, 0, r * k, 32, 0.05)
    g.restore()
    g.strokeStyle = hexA(AMBER, 0.6 * fade); g.lineWidth = 8 * (1 - k) + 4; g.stroke()
    g.strokeStyle = hexA(col, 0.95 * fade); g.lineWidth = 5 * (1 - k) + 2; g.stroke()
    g.strokeStyle = hexA('#ffffff', 0.8 * fade); g.lineWidth = 1.5; g.stroke()
    g.restore()
    if (since < 4) for (let n = 0; n < 4; n++) { const t = rnd(0, TAU); v.spawn({ x: x + Math.cos(t) * r * k, y: y + Math.sin(t) * r * k * 0.8, vx: Math.cos(t) * 3, vy: Math.sin(t) * 3, life: 12, color: n % 2 ? '#ffffff' : col, r: 2.5, kind: 'spark', g: 0 }) }
  },
  air(v, el, c, a) {
    const { g } = v
    const col = volt(el, c)
    const { x, y, r, fade } = a
    const since = Math.max(0, -a.land), k = Math.min(1, since / 6)
    const cy = y - 24 // out of the caster's body, not its feet
    glowDot(g, x, cy, 60, VOLT_HOT, 0.7 * fade * (since < 6 ? 1 : 0.6))
    const n = since < 8 ? 9 : 5
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU + hash(a.id, i) * 0.6 + rnd(-0.15, 0.15), rr = r * k * rnd(0.75, 1.02)
      zig(g, x + Math.cos(t) * 14, cy + Math.sin(t) * 14, x + Math.cos(t) * rr, y + Math.sin(t) * rr * 0.8, col, Math.max(1.5, 3.5 * fade), 0.35)
    }
  },
}

// ------------------------------------------------------------------ Zap Cannon

/** Zap Cannon: a huge, slow ball of lightning inside a heavy crackling shell: a white-hot core, a double jagged shell,
 * a cage of electric rings turning round it, thick arcs lashing out and a ghostly wake; it bursts in a thick shock ring
 * with a wheel of bolts */
const zapcannon: SigDraw = {
  shot(v, el, c, s) {
    const { g, frame } = v
    const col = volt(el, c)
    const r = Math.max(9, s.r) * 1.35 * 1.2
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(s.x, s.y + r * 1.4, r * 1.1, r * 0.35, 0, 0, TAU); g.fill()
    // the wake: afterimages of the ball
    const t = s.trail
    for (let i = 0; i < t.length - 1; i += 3) { const kk = i / t.length; glowDot(g, t[i].x, t[i].y, r * (0.6 + 0.6 * kk), col, 0.35 * kk) }
    glowDot(g, s.x, s.y, r * 2.8, col, 0.55)
    // the churning core
    const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, r)
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35 + 0.1 * Math.sin(frame * 0.5), VOLT_HOT); gr.addColorStop(0.75, col); gr.addColorStop(1, '#e08a00')
    g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.y, r, 0, TAU); g.fill()
    g.save()
    // the cage: three electric rings turning round it
    g.translate(s.x, s.y)
    g.strokeStyle = hexA(AMBER, 0.8); g.lineWidth = 2
    for (let k = 0; k < 3; k++) {
      g.save(); g.rotate((k * Math.PI) / 3 + frame * 0.05)
      g.beginPath(); g.ellipse(0, 0, r * 1.15, r * 1.15 * Math.abs(Math.sin(frame * 0.09 + k * 1.1)) + 2, 0, 0, TAU); g.stroke()
      g.restore()
    }
    // the heavy shell: two jagged rings, thick and bright
    jagRing(g, 0, 0, r * 1.22, 26, 0.08)
    g.strokeStyle = '#6a3a00'; g.lineWidth = 9; g.stroke()
    g.strokeStyle = col; g.lineWidth = 5.5; g.stroke()
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 2; g.stroke()
    jagRing(g, 0, 0, r * 1.45, 22, 0.1)
    g.strokeStyle = hexA(AMBER, 0.8); g.lineWidth = 4; g.stroke()
    g.strokeStyle = hexA(col, 0.9); g.lineWidth = 2; g.stroke()
    g.restore()
    // thick arcs lashing out of the shell
    arcs(g, s.x, s.y, r * 2.4, 3, col, 3, r * 1.2)
    for (let k = 0; k < 2; k++) { const a = rnd(0, TAU); v.spawn({ x: s.x + Math.cos(a) * r * 1.3, y: s.y + Math.sin(a) * r * 1.3, vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5, life: 12, color: k ? '#ffffff' : col, r: 2.5, kind: 'spark', g: 0 }) }
  },
  impact(v, el, c, i) {
    // the detonation: a blinding flash, a thick jagged shock ring rolling out, a wheel of bolts, then a lingering crackle
    const { g } = v
    const col = volt(el, c)
    const k = i.t / i.life, grow = Math.min(1, i.t / 10), a = Math.min(1, 2 * (1 - k))
    glowDot(g, i.x, i.y, i.r * (0.8 + 0.5 * grow), '#ffffff', 0.9 * (1 - k))
    glowDot(g, i.x, i.y, i.r * 1.2, col, 0.5 * a)
    g.save()
    jagRing(g, i.x, i.y, i.r * (0.3 + 0.8 * grow), 30, 0.07)
    g.strokeStyle = hexA('#6a3a00', 0.7 * a); g.lineWidth = 14 * (1 - grow) + 5; g.stroke()
    g.strokeStyle = hexA(col, a); g.lineWidth = 10 * (1 - grow) + 3; g.stroke()
    g.strokeStyle = hexA('#ffffff', 0.9 * a); g.lineWidth = 3 * (1 - grow) + 1; g.stroke()
    g.restore()
    if (i.t < 16) arcs(g, i.x, i.y, i.r * (0.5 + 0.7 * grow), 10, col, 4 - i.t * 0.25)
    else if (Math.random() < 0.5) arcs(g, i.x, i.y, i.r * 0.5, 2, col, 1.5)
    if (i.t === 1) for (let n = 0; n < 20; n++) { const t = (n / 20) * TAU; v.spawn({ x: i.x, y: i.y, vx: Math.cos(t) * rnd(4, 8), vy: Math.sin(t) * rnd(4, 8), life: rnd(12, 22), color: n % 3 ? col : '#ffffff', r: 3, kind: 'spark', g: 0 }) }
  },
  impactLife: 32,
}

// ------------------------------------------------------------------ Pin Missile

/** Pin Missile: slim steel darts with coloured tail fins and a needle-bright point, each on a speed streak, braiding
 * toward the foe; each strikes with a sharp little cross-glint */
const pinmissile: SigDraw = {
  shot(v, el, c, s) {
    const { g } = v
    const r = Math.max(9, s.r) * 1.35
    const fin = el === 'Grass' ? '#6cc43a' : el === 'Colorless' ? '#d04a4a' : c
    const cx = Math.cos(s.a), cy = Math.sin(s.a)
    const L = r * 4, T = r * 0.22
    // the streak
    g.save(); g.lineCap = 'round'
    const tl = r * 5
    const gs = g.createLinearGradient(s.x - cx * tl, s.y - cy * tl, s.x, s.y)
    gs.addColorStop(0, 'rgba(255,255,255,0)'); gs.addColorStop(1, 'rgba(255,255,255,0.7)')
    g.strokeStyle = gs; g.lineWidth = r * 0.35
    g.beginPath(); g.moveTo(s.x - cx * tl, s.y - cy * tl); g.lineTo(s.x - cx * L * 0.45, s.y - cy * L * 0.45); g.stroke()
    g.restore()
    g.save(); g.translate(s.x, s.y); g.rotate(s.a)
    g.lineJoin = 'miter'
    // tail fins: a swept pair
    g.fillStyle = fin; g.strokeStyle = '#1e2a14'; g.lineWidth = 1.3
    g.beginPath(); g.moveTo(-L * 0.18, -T); g.lineTo(-L * 0.52, -r * 0.6); g.lineTo(-L * 0.45, -T); g.closePath(); g.fill(); g.stroke()
    g.beginPath(); g.moveTo(-L * 0.18, T); g.lineTo(-L * 0.52, r * 0.6); g.lineTo(-L * 0.45, T); g.closePath(); g.fill(); g.stroke()
    // the shaft: bright steel with a long needle point
    const gr = g.createLinearGradient(0, -T, 0, T)
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#c8d2dc'); gr.addColorStop(1, '#56626e')
    g.fillStyle = gr
    g.beginPath(); g.moveTo(L * 0.55, 0); g.lineTo(L * 0.18, -T); g.lineTo(-L * 0.45, -T); g.lineTo(-L * 0.45, T); g.lineTo(L * 0.18, T); g.closePath(); g.fill()
    g.strokeStyle = '#2a323a'; g.lineWidth = 1.3; g.stroke()
    // a coloured collar behind the point
    g.fillStyle = fin; g.fillRect(L * 0.08, -T, L * 0.07, T * 2)
    g.restore()
  },
  impact(v, el, c, i) {
    // a sharp cross-glint, steel-white with a dark edge so it reads on a pale floor
    const { g } = v
    const k = i.t / i.life, R = 18 * (1 - k * 0.4), a = Math.min(1, 2 * (1 - k))
    g.save(); g.translate(i.x, i.y); g.rotate(0.4 + hash(i.id, 2))
    star(g, R, 4, 0.16)
    g.fillStyle = hexA('#ffffff', 0.95 * a); g.fill()
    g.strokeStyle = hexA(el === 'Grass' ? '#3a7a1e' : c, 0.9 * a); g.lineWidth = 1.5; g.stroke()
    g.restore()
  },
  impactLife: 16,
}

// ------------------------------------------------------------------ Poison Sting

const VENOM = '#b84ae8', VENOM_DARK = '#4a1a66'

/** Poison Sting: a hooked purple barb, dark at the root and glowing magenta at the point, a bead of venom swelling
 * and dripping off it, a violet haze in its wake; it strikes in a splat of venom */
const poisonsting: SigDraw = {
  shot(v, _el, _c, s) {
    const { g, frame } = v
    const r = Math.max(9, s.r) * 1.35 * 1.4
    const L = r * 2.6
    const cx = Math.cos(s.a), cy = Math.sin(s.a)
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.ellipse(s.x, s.y + r * 1.2, r * 0.9, r * 0.28, 0, 0, TAU); g.fill()
    // the toxic haze behind it
    const t = s.trail
    for (let i = 0; i < t.length; i += 2) { const k = i / t.length; glowDot(g, t[i].x, t[i].y, r * 0.8 * k, VENOM, 0.35 * k) }
    g.save(); g.translate(s.x, s.y); g.rotate(s.a)
    glowDot(g, L * 0.45, 0, r * 0.9, '#ff7ae8', 0.6)
    // the barb: a curved stinger with a hook on its back edge
    g.beginPath()
    g.moveTo(L * 0.6, 0)
    g.quadraticCurveTo(L * 0.1, -r * 0.2, -L * 0.35, -r * 0.55)
    g.lineTo(-L * 0.2, -r * 0.1)
    g.lineTo(-L * 0.45, r * 0.05)
    g.quadraticCurveTo(-L * 0.1, r * 0.45, L * 0.15, r * 0.3)
    g.lineTo(L * 0.05, r * 0.5) // the hook
    g.lineTo(L * 0.28, r * 0.18)
    g.closePath()
    const gr = g.createLinearGradient(-L * 0.45, 0, L * 0.6, 0)
    gr.addColorStop(0, VENOM_DARK); gr.addColorStop(0.55, '#8a3ac0'); gr.addColorStop(1, '#ff9af0')
    g.fillStyle = gr; g.fill()
    g.strokeStyle = '#2a0a3a'; g.lineWidth = 1.5; g.lineJoin = 'miter'; g.stroke()
    g.strokeStyle = 'rgba(255,220,255,0.7)'; g.lineWidth = 1.2
    g.beginPath(); g.moveTo(-L * 0.25, -r * 0.3); g.quadraticCurveTo(L * 0.1, -r * 0.1, L * 0.5, 0); g.stroke()
    // a bead of venom swelling under the point, dropping off and re-forming
    const p = (frame * 0.06 + s.id * 0.37) % 1
    g.fillStyle = hexA(light(VENOM, 0.2), 0.95)
    g.beginPath(); g.ellipse(L * 0.2, r * 0.3 + p * r * 0.5, r * 0.16 + p * r * 0.08, r * 0.2 + p * r * 0.2, 0, 0, TAU); g.fill()
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(L * 0.17, r * 0.25 + p * r * 0.5, r * 0.05, 0, TAU); g.fill()
    g.restore()
    if (frame % 3 === 0) v.spawn({ x: s.x - cx * r * 0.2, y: s.y - cy * r * 0.2 + r * 0.4, vx: -cx * 0.5, vy: 0.4, life: 22, color: VENOM, r: 2.5, kind: 'drop', g: 0.15 })
  },
  impact(v, _el, _c, i) {
    // a splat of venom: a lobed purple blot that soaks in and fades, drops flung out
    const { g } = v
    const k = Math.max(0, i.t / i.life * 2 - 1), R = 14 + 12 * Math.min(1, i.t / 4)
    g.save(); g.translate(i.x, i.y)
    g.beginPath()
    for (let n = 0; n <= 16; n++) { const t = (n / 16) * TAU, rr = R * (0.75 + 0.45 * hash(i.id, n % 16)); g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr * 0.75) }
    g.closePath()
    g.fillStyle = hexA(VENOM, 0.7 * (1 - k)); g.fill()
    g.strokeStyle = hexA(VENOM_DARK, 0.8 * (1 - k)); g.lineWidth = 2; g.stroke()
    g.fillStyle = hexA('#ffc8f8', 0.7 * (1 - k)); g.beginPath(); g.arc(-R * 0.25, -R * 0.2, R * 0.18, 0, TAU); g.fill()
    g.restore()
    if (i.t === 1) for (let n = 0; n < 8; n++) { const t = rnd(0, TAU); v.spawn({ x: i.x, y: i.y, vx: Math.cos(t) * rnd(1.5, 3.5), vy: Math.sin(t) * rnd(1.5, 3.5) - 1.5, life: rnd(14, 22), color: n % 2 ? VENOM : '#e08af8', r: rnd(2, 3.5), kind: 'drop', g: 0.2 }) }
  },
  impactLife: 30,
}

export const ELECTRIC: Record<string, SigDraw> = { electroball, discharge, zapcannon, pinmissile, poisonsting }
