// Signature-move looks: normal, steel and fighting (docs/VFX.md "Signature moves"; the sim side is src/sim/signatures.ts).
import { TAU, bolt, glowDot, hash, hexA, light, rnd, star } from '../vfxkit'
import type { SigDraw } from './types'

const GOLD = '#ffd24a', GOLD_DARK = '#a8741a'
/** Tri Attack's three: fire, ice and thunder, whatever the element */
const TRI = ['#ff5a2a', '#6fe0ff', '#ffe23a']
const AURA = '#3a86ff', AURA_HI = '#a8e0ff'
const CRIMSON = '#d01a2a'

/** a spinning coin at (0, 0): an ellipse whose width follows the spin, a rim, a stamped square hole, a glint face-on */
function coin(g: CanvasRenderingContext2D, r: number, spin: number): void {
  const w = Math.max(0.12, Math.abs(Math.cos(spin)))
  g.fillStyle = GOLD_DARK; g.beginPath(); g.ellipse(r * 0.12 * Math.sign(Math.cos(spin)), 0, r * w, r, 0, 0, TAU); g.fill()
  const gr = g.createLinearGradient(-r, -r, r, r)
  gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.5, GOLD); gr.addColorStop(1, '#d09a2a')
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, r * w, r, 0, 0, TAU); g.fill()
  g.strokeStyle = GOLD_DARK; g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, 0, r * w * 0.72, r * 0.72, 0, 0, TAU); g.stroke()
  if (w > 0.4) { g.fillStyle = GOLD_DARK; g.fillRect(-r * w * 0.2, -r * 0.2, r * w * 0.4, r * 0.4) }
}

/** a four-point star's path at (x, y) */
function glintPath(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.14, y - r * 0.14); g.lineTo(x + r, y); g.lineTo(x + r * 0.14, y + r * 0.14); g.lineTo(x, y + r); g.lineTo(x - r * 0.14, y + r * 0.14); g.lineTo(x - r, y); g.lineTo(x - r * 0.14, y - r * 0.14); g.closePath()
}

/** a four-point glint (a lens star) at (x, y) */
function glint(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, col = '#ffffff'): void {
  g.save(); g.globalAlpha *= a
  g.fillStyle = col; glintPath(g, x, y, r); g.fill()
  g.restore()
}

/** one of Tri Attack's orbs (k: 0 fire, 1 ice, 2 thunder) of radius r at (0, 0), heading +x */
function triOrb(g: CanvasRenderingContext2D, k: number, r: number, frame: number): void {
  const col = TRI[k]
  glowDot(g, 0, 0, r * 2.4, col, 0.6)
  if (k === 0) {
    // fire: flame tongues streaming back off a hot core
    for (let i = 0; i < 5; i++) {
      const off = (i - 2) * r * 0.3, len = r * rnd(1.8, 2.8)
      g.fillStyle = hexA(i % 2 ? '#ff5a1e' : '#ffa030', 0.8)
      g.beginPath(); g.moveTo(r * 0.3, off - r * 0.5); g.quadraticCurveTo(-len * 0.5, off, -len, off * 1.3); g.quadraticCurveTo(-len * 0.4, off + r * 0.2, r * 0.3, off + r * 0.5); g.fill()
    }
    g.fillStyle = '#ffe08a'; g.beginPath(); g.arc(0, 0, r * 0.75, 0, TAU); g.fill()
  } else if (k === 1) {
    // ice: a faceted hexagonal crystal, turning, with frost spokes
    g.save(); g.rotate(frame * 0.12)
    g.beginPath(); for (let i = 0; i < 6; i++) { const t = (i / 6) * TAU; g.lineTo(Math.cos(t) * r * 0.95, Math.sin(t) * r * 0.95) } g.closePath()
    g.fillStyle = '#d8f8ff'; g.fill(); g.strokeStyle = '#2aa8d8'; g.lineWidth = 2; g.stroke()
    g.beginPath(); for (let i = 0; i < 3; i++) { const t = (i / 3) * Math.PI; g.moveTo(Math.cos(t) * r * 1.5, Math.sin(t) * r * 1.5); g.lineTo(-Math.cos(t) * r * 1.5, -Math.sin(t) * r * 1.5) }
    g.strokeStyle = 'rgba(230,250,255,0.9)'; g.lineWidth = 2; g.stroke()
    g.restore()
  } else {
    // thunder: a yellow ball with arcs jumping off it
    g.fillStyle = '#fff6a0'; g.beginPath(); g.arc(0, 0, r * 0.85, 0, TAU); g.fill()
    g.strokeStyle = '#e0a800'; g.lineWidth = 2; g.stroke()
    for (let i = 0; i < 2; i++) { const t = rnd(0, TAU); bolt(g, Math.cos(t) * r * 0.6, Math.sin(t) * r * 0.6, Math.cos(t) * r * 2, Math.sin(t) * r * 2, '#ffe23a', 2, 0.5, 0) }
  }
}

/** a triangle of radius R at (0, 0), point up */
function tri(g: CanvasRenderingContext2D, R: number): void {
  g.beginPath(); for (let i = 0; i < 3; i++) { const t = -Math.PI / 2 + (i * TAU) / 3; g.lineTo(Math.cos(t) * R, Math.sin(t) * R) } g.closePath()
}

export const FORCE: Record<string, SigDraw> = {
  payday: {
    // a spray of spinning gold coins, glinting, gold sparkles trailing
    shot: (v, el, c, s) => {
      const { g, frame } = v
      const r = Math.max(9, s.r) * 1.6
      const spin = frame * 0.45 + s.id * 1.3
      g.save(); g.translate(s.x, s.y)
      glowDot(g, 0, 0, r * 2, GOLD, 0.35)
      g.rotate(Math.sin(s.id) * 0.4)
      coin(g, r, spin)
      g.restore()
      if (Math.abs(Math.cos(spin)) > 0.9) { g.save(); g.globalCompositeOperation = 'lighter'; glint(g, s.x - r * 0.3, s.y - r * 0.4, r * 1.3, 0.95); g.restore() }
      if (frame % 3 === 0) v.spawn({ x: s.x, y: s.y, vx: -Math.cos(s.a) * 1.2 + rnd(-0.5, 0.5), vy: -Math.sin(s.a) * 1.2 + rnd(-0.5, 0.5), life: 18, color: '#fff3b0', r: 2.5, kind: 'star', g: 0 })
      void el; void c
    },
    // coins bouncing off in every direction, a "cha-ching" glint
    impact: (v, el, c, i) => {
      const { g } = v
      const k = i.t / i.life
      g.save()
      for (let n = 0; n < 6; n++) {
        const t = hash(i.id, n) * TAU, sp = 2.5 + 2.5 * hash(i.id, n + 10), T = i.t
        const px = i.x + Math.cos(t) * sp * T, hop = Math.abs(Math.sin((T / 14) * Math.PI + n)) * 26 * (1 - k)
        const py = i.y - 12 + Math.sin(t) * sp * T * 0.5 - hop
        g.save(); g.translate(px, py); g.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4
        coin(g, 7, T * 0.5 + n); g.restore()
      }
      g.globalCompositeOperation = 'lighter'
      if (k < 0.5) glint(g, i.x, i.y - 18, 30 * (1 - k * 2) + 6, 1 - k * 2, '#fff3b0')
      g.restore()
      if (i.t === 1) for (let n = 0; n < 8; n++) { const t = rnd(0, TAU); v.spawn({ x: i.x, y: i.y - 12, vx: Math.cos(t) * 4, vy: Math.sin(t) * 4 - 1, life: 18, color: n % 2 ? GOLD : '#fff3b0', r: 3, kind: 'star', g: 0.05 }) }
      void el; void c
    },
    impactLife: 30,
  },

  triattack: {
    // three braided orbs, fire, ice and thunder, each with a thin turning triangle round it
    shot: (v, el, c, s) => {
      const { g, frame } = v
      const r = Math.max(9, s.r) * 1.5
      const k = ((s.id % 3) + 3) % 3
      g.save(); g.translate(s.x, s.y)
      g.save(); g.rotate(frame * 0.15 + k); tri(g, r * 2); g.strokeStyle = hexA(light(TRI[k], 0.4), 0.7); g.lineWidth = 1.8; g.stroke(); g.restore()
      g.rotate(s.a)
      triOrb(g, k, r, frame)
      g.restore()
      if (frame % 3 === 0) v.spawn({ x: s.x, y: s.y, vx: rnd(-0.6, 0.6), vy: rnd(-0.6, 0.6), life: 16, color: TRI[k], r: 2.5, kind: k === 0 ? 'ember' : k === 1 ? 'star' : 'spark', g: 0 })
      void el; void c
    },
    // Trinity Nova: a great triangle of the three powers turning over the spot, an orb at each corner, the ring
    // between them flashing through red, cyan and yellow
    area: (v, el, c, a) => {
      const { g, frame } = v
      const { x, y, r } = a
      g.save(); g.translate(x, y)
      if (a.land > 0) {
        g.strokeStyle = hexA(TRI[Math.floor(frame / 4) % 3], 0.8); g.lineWidth = 3; g.setLineDash([10, 8]); g.lineDashOffset = -frame
        g.beginPath(); g.ellipse(0, 0, r, r * 0.8, 0, 0, TAU); g.stroke(); g.setLineDash([])
        g.scale(1, 0.8); g.rotate(frame * 0.05); tri(g, r * 0.9); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.stroke()
        g.restore()
        return
      }
      g.scale(1, 0.8)
      g.globalCompositeOperation = 'lighter'
      glowDot(g, 0, 0, r, TRI[Math.floor(frame / 3) % 3], 0.35 * a.fade)
      g.rotate(frame * 0.06)
      tri(g, r * 0.95)
      g.strokeStyle = hexA('#ffffff', 0.9 * a.fade); g.lineWidth = 4; g.stroke()
      for (let i = 0; i < 3; i++) {
        const t = -Math.PI / 2 + (i * TAU) / 3, t2 = t + TAU / 3
        g.strokeStyle = hexA(TRI[i], 0.8 * a.fade); g.lineWidth = 10
        g.beginPath(); g.moveTo(Math.cos(t) * r * 0.95, Math.sin(t) * r * 0.95); g.lineTo(Math.cos(t2) * r * 0.95, Math.sin(t2) * r * 0.95); g.stroke()
      }
      g.globalCompositeOperation = 'source-over'
      for (let i = 0; i < 3; i++) {
        const t = -Math.PI / 2 + (i * TAU) / 3
        g.save(); g.translate(Math.cos(t) * r * 0.95, Math.sin(t) * r * 0.95); g.globalAlpha = a.fade; triOrb(g, i, 13, frame); g.restore()
      }
      g.restore()
      if (frame % 2 === 0) { const i = frame % 3, t = rnd(0, TAU); v.spawn({ x: x + Math.cos(t) * r * 0.6, y: y + Math.sin(t) * r * 0.5, vx: Math.cos(t) * 2, vy: Math.sin(t) * 2 - 1, life: 18, color: TRI[i], r: 3, kind: i === 0 ? 'ember' : i === 1 ? 'star' : 'spark', g: 0 }) }
      void el; void c
    },
    // a three-colour triangle flash where it lands, the three powers bursting at its corners
    impact: (v, el, c, i) => {
      const { g } = v
      const k = i.t / i.life, R = 22 + 30 * k
      g.save(); g.translate(i.x, i.y - 16); g.globalCompositeOperation = 'lighter'
      g.rotate(k * 1.2)
      for (let n = 0; n < 3; n++) {
        const t = -Math.PI / 2 + (n * TAU) / 3
        glowDot(g, Math.cos(t) * R, Math.sin(t) * R, 18 * (1 - k) + 6, TRI[n], 0.9 * (1 - k))
      }
      tri(g, R); g.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`; g.lineWidth = 3; g.stroke()
      g.restore()
      void el; void c; void v
    },
    impactLife: 24,
  },

  flashcannon: {
    // a blinding silver-white beam: a steel-blue sheath, a white-hot core, glints racing along it, a lens flare at
    // the muzzle (a star, an anamorphic streak and ghost rings along the line) and a white flash where it strikes
    beam: (v, el, c, b) => {
      const { g, frame } = v
      const { x1, y1, x2, y2, w } = b
      const L = Math.hypot(x2 - x1, y2 - y1), a = Math.atan2(y2 - y1, x2 - x1)
      const life = b.ticks > 0 ? b.t / b.ticks : 1
      const bright = Math.min(1, 0.7 + life) * rnd(0.94, 1.06)
      const W = w * bright
      g.save(); g.translate(x1, y1); g.rotate(a); g.lineCap = 'round'
      // the body: a polished steel sheath (dark edges, a silver sheen) round a white-hot core, drawn solid so it
      // reads as metal-bright light on a pale floor too
      const gr = g.createLinearGradient(0, -W * 0.7, 0, W * 0.7)
      gr.addColorStop(0, '#4a5e78'); gr.addColorStop(0.18, '#a8bcd4'); gr.addColorStop(0.36, '#ffffff'); gr.addColorStop(0.64, '#ffffff'); gr.addColorStop(0.82, '#9fb4cc'); gr.addColorStop(1, '#3e5068')
      g.globalAlpha = 0.35; g.fillStyle = '#c8d8ec'; g.fillRect(0, -W * 1.1, L, W * 2.2); g.globalAlpha = 1
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -W * 0.35); g.lineTo(L, -W * 0.7); g.lineTo(L, W * 0.7); g.lineTo(0, W * 0.35); g.closePath(); g.fill()
      // sheen bands racing along the metal
      g.fillStyle = 'rgba(255,255,255,0.8)'
      for (let i = 0; i < 4; i++) { const p = (frame * 0.07 + i / 4) % 1, px = p * L, hw = W * (0.35 + 0.35 * p); g.beginPath(); g.moveTo(px, -hw); g.lineTo(px + 18, -hw); g.lineTo(px + 6, hw); g.lineTo(px - 12, hw); g.closePath(); g.fill() }
      g.globalCompositeOperation = 'lighter'
      // glints running down the beam
      for (let i = 0; i < 6; i++) { const p = (frame * 0.09 + i / 6) % 1; glint(g, p * L, (hash(b.id, i) - 0.5) * W * 0.8, W * 0.8, 0.9 * (1 - p * 0.4)) }
      g.globalCompositeOperation = 'source-over'
      // lens-flare ghosts along the line: pastel rings
      const ghosts = ['#6f9fe0', '#e0a860', '#a070e0']
      for (let i = 0; i < 3; i++) { g.strokeStyle = hexA(ghosts[i], 0.7 * bright); g.lineWidth = 2.5; g.beginPath(); g.arc(L * (0.2 + 0.14 * i), 0, W * (0.45 + 0.3 * i), 0, TAU); g.stroke() }
      // the muzzle flare: a white star with a steel rim, a short streak across the beam
      g.fillStyle = hexA('#dfeaff', 0.85 * bright); g.beginPath(); g.ellipse(14, 0, W * 0.22, W * 2.2, 0, 0, TAU); g.fill()
      g.save(); g.rotate(frame * 0.05); g.strokeStyle = '#5a7090'; g.lineWidth = 3; glintPath(g, 14, 0, W * 1.7); g.stroke(); glint(g, 14, 0, W * 1.7, 1); g.restore()
      g.globalCompositeOperation = 'lighter'
      glowDot(g, 14, 0, W * 1.6, '#ffffff', 0.8 * bright)
      // the far end: a hard white flash
      glowDot(g, L, 0, W * 1.6, '#ffffff', 0.9 * bright)
      glint(g, L, 0, W * 1.4, 0.9)
      g.restore()
      if (frame % 2 === 0) v.spawn({ x: x2, y: y2, vx: Math.cos(a) * 2 + rnd(-2.5, 2.5), vy: Math.sin(a) * 2 + rnd(-2.5, 2.5), life: 14, color: '#f0f4ff', r: 2.5, kind: 'spark', g: 0 })
      void el; void c
    },
    // a blinding white burst with a cross flare
    impact: (v, el, c, i) => {
      const { g } = v
      const k = i.t / i.life
      g.save()
      g.strokeStyle = hexA('#5a7090', 0.8 * (1 - k)); g.lineWidth = 3; glintPath(g, i.x, i.y - 16, 60 * (1 - k * 0.6)); g.stroke()
      g.strokeStyle = hexA('#a8bcd4', 0.9 * (1 - k)); g.lineWidth = 4 * (1 - k) + 1; g.beginPath(); g.arc(i.x, i.y - 16, 16 + 40 * k, 0, TAU); g.stroke()
      g.globalCompositeOperation = 'lighter'
      glowDot(g, i.x, i.y - 16, 50 * (1 - k) + 16, '#ffffff', 0.85 * (1 - k))
      glint(g, i.x, i.y - 16, 60 * (1 - k * 0.6), 1 - k)
      g.restore()
      void el; void c; void v
    },
    impactLife: 24,
  },

  aurasphere: {
    // a blue aura sphere: a deep blue core with a pale heart, a flickering corona of spirit-flame tongues licking
    // outward and back along its flight, blue sparks shed
    shot: (v, el, c, s) => {
      const { g, frame } = v
      const r = Math.max(9, s.r) * 1.2
      g.save(); g.translate(s.x, s.y); g.rotate(s.a)
      glowDot(g, 0, 0, r * 2.4, AURA, 0.45)
      // the corona: flame tongues all round, the ones at the back drawn out long; an outer layer in deep blue with
      // a pale inner layer over it, so it reads on a pale floor as well as a dark one
      for (const [layer, col, a, k] of [[0, '#1f52d8', 0.75, 1], [1, AURA_HI, 0.85, 0.72]] as const) {
        g.beginPath()
        for (let i = 0; i < 14; i++) {
          const t = (i / 14) * TAU + frame * 0.1 + layer * 0.2, back = Math.max(0, -Math.cos(t))
          const len = r * k * (1.35 + 0.35 * Math.random() + 1.6 * back)
          const tt = t + back * Math.sign(Math.sin(t)) * 0.3
          g.moveTo(Math.cos(t - 0.22) * r * 0.9, Math.sin(t - 0.22) * r * 0.9)
          g.quadraticCurveTo(Math.cos(tt) * len * 0.8, Math.sin(tt) * len * 0.8 + 3, Math.cos(tt) * len, Math.sin(tt) * len)
          g.quadraticCurveTo(Math.cos(tt) * len * 0.7, Math.sin(tt) * len * 0.7 - 3, Math.cos(t + 0.22) * r * 0.9, Math.sin(t + 0.22) * r * 0.9)
        }
        g.fillStyle = hexA(col, a); g.fill()
      }
      const gr = g.createRadialGradient(r * 0.15, -r * 0.1, 0, 0, 0, r)
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, AURA_HI); gr.addColorStop(0.8, AURA); gr.addColorStop(1, '#1a3aa8')
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill()
      g.strokeStyle = hexA(AURA_HI, 0.9); g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * 1.02, -1.2 + frame * 0.2, 0.4 + frame * 0.2); g.stroke()
      g.restore()
      if (frame % 2 === 0) v.spawn({ x: s.x - Math.cos(s.a) * r, y: s.y - Math.sin(s.a) * r, vx: -Math.cos(s.a) * 2 + rnd(-1, 1), vy: -Math.sin(s.a) * 2 + rnd(-1, 1), life: 16, color: frame % 4 ? AURA_HI : AURA, r: 2.5, kind: 'spark', g: -0.02 })
      void el; void c
    },
    // the burst: a blue shock ring, spirit flames flaring out, a pale flash
    impact: (v, el, c, i) => {
      const { g } = v
      const k = i.t / i.life, R = i.r * (0.35 + 0.8 * k)
      g.save(); g.translate(i.x, i.y - 12); g.globalCompositeOperation = 'lighter'
      glowDot(g, 0, 0, R * 1.1, AURA, 0.8 * (1 - k))
      g.fillStyle = hexA(AURA_HI, 0.7 * (1 - k))
      for (let n = 0; n < 10; n++) {
        const t = (n / 10) * TAU + hash(i.id, n) * 0.5, L = R * (1 + 0.4 * hash(i.id, n + 5))
        g.beginPath(); g.moveTo(Math.cos(t - 0.15) * R * 0.4, Math.sin(t - 0.15) * R * 0.4); g.lineTo(Math.cos(t) * L, Math.sin(t) * L); g.lineTo(Math.cos(t + 0.15) * R * 0.4, Math.sin(t + 0.15) * R * 0.4); g.fill()
      }
      g.strokeStyle = hexA('#ffffff', 0.9 * (1 - k)); g.lineWidth = 5 * (1 - k) + 1; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke()
      g.restore()
      if (i.t === 1) for (let n = 0; n < 12; n++) { const t = rnd(0, TAU); v.spawn({ x: i.x, y: i.y - 12, vx: Math.cos(t) * 5, vy: Math.sin(t) * 5, life: 18, color: n % 2 ? AURA : AURA_HI, r: 3, kind: 'spark', g: 0 }) }
      void el; void c
    },
    impactLife: 30,
  },

  revengeblast: {
    // a crimson orb of vengeance: a black heart in a blood-red shell, a jagged aura of spikes that snap in and out,
    // dark red smoke trailing; it swells as it flies (the sim's grow)
    shot: (v, el, c, s) => {
      const { g, frame } = v
      const r = Math.max(9, s.r) * 1.2
      g.save(); g.translate(s.x, s.y); g.rotate(s.a)
      glowDot(g, 0, 0, r * 2.4, CRIMSON, 0.55)
      // the jagged aura: a spiky star outline, fresh each frame
      g.beginPath()
      const N = 13
      for (let i = 0; i < N * 2; i++) { const t = (i / (N * 2)) * TAU, rr = i % 2 ? r * 1.05 : r * (1.45 + 0.5 * Math.random()) * (Math.cos(t) < 0 ? 1.25 : 1); g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) }
      g.closePath(); g.fillStyle = hexA('#5a0010', 0.8); g.fill(); g.strokeStyle = hexA('#ff3a3a', 0.9); g.lineWidth = 1.8; g.stroke()
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r)
      gr.addColorStop(0, '#12000a'); gr.addColorStop(0.45, '#40000c'); gr.addColorStop(0.8, CRIMSON); gr.addColorStop(1, '#ff6060')
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill()
      // a glaring slit in the dark heart
      g.fillStyle = `rgba(255,90,90,${0.7 + 0.3 * Math.sin(frame * 0.4)})`; g.beginPath(); g.ellipse(0, 0, r * 0.45, r * 0.1, 0, 0, TAU); g.fill()
      g.restore()
      if (frame % 2 === 0) v.spawn({ x: s.x - Math.cos(s.a) * r, y: s.y - Math.sin(s.a) * r, vx: rnd(-0.4, 0.4), vy: rnd(-0.6, 0), life: 26, color: frame % 4 ? '#3a0008' : '#8a1020', r: r * 0.45, kind: 'smoke', g: -0.01 })
      void el; void c
    },
    // hand kits may cast it as a beam: a crimson ray, black at the heart, spikes crackling off it
    beam: (v, el, c, b) => {
      const { g, frame } = v
      const { x1, y1, x2, y2, w } = b
      const L = Math.hypot(x2 - x1, y2 - y1), a = Math.atan2(y2 - y1, x2 - x1)
      g.save(); g.translate(x1, y1); g.rotate(a); g.lineCap = 'round'
      const line = (col: string, lw: number) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(0, 0); g.lineTo(L, 0); g.stroke() }
      line(hexA(CRIMSON, 0.35), w * 2.2); line(hexA(CRIMSON, 0.95), w); line('#1a0008', w * 0.4)
      g.strokeStyle = hexA('#ff4a4a', 0.9); g.lineWidth = 2
      g.beginPath()
      for (let i = 0; i < 10; i++) { const px = ((frame * 0.04 + i / 10) % 1) * L, side = i % 2 ? 1 : -1; g.moveTo(px, side * w * 0.5); g.lineTo(px - 6, side * w * (1.1 + 0.5 * Math.random())); g.lineTo(px - 12, side * w * 0.5) }
      g.stroke()
      g.restore()
      glowDot(g, x2, y2, w * 1.8, CRIMSON, 0.8)
      void el; void c
    },
    // the burst: a crimson shock, black cracks of spite radiating, red shards
    impact: (v, el, c, i) => {
      const { g } = v
      const k = i.t / i.life, R = i.r * (0.4 + 0.75 * k)
      g.save(); g.translate(i.x, i.y - 12)
      glowDot(g, 0, 0, R * 1.2, CRIMSON, 0.85 * (1 - k))
      g.strokeStyle = hexA('#1a0008', 0.9 * (1 - k)); g.lineWidth = 3; g.lineJoin = 'miter'
      for (let n = 0; n < 8; n++) {
        const t = (n / 8) * TAU + hash(i.id, n)
        g.beginPath(); g.moveTo(0, 0)
        for (let j = 1; j <= 3; j++) { const rr = R * (j / 3), tt = t + (hash(i.id, n * 5 + j) - 0.5) * 0.7; g.lineTo(Math.cos(tt) * rr, Math.sin(tt) * rr) }
        g.stroke()
      }
      g.strokeStyle = hexA('#ff4a4a', 0.9 * (1 - k)); g.lineWidth = 5 * (1 - k) + 1; g.save(); star(g, R, 8, 0.7); g.stroke(); g.restore()
      g.restore()
      if (i.t === 1) for (let n = 0; n < 12; n++) { const t = rnd(0, TAU); v.spawn({ x: i.x, y: i.y - 12, vx: Math.cos(t) * rnd(3, 6), vy: Math.sin(t) * rnd(3, 6), life: 20, color: n % 3 ? CRIMSON : '#2a0008', r: 3.5, kind: 'shard', g: 0.1 }) }
      void el; void c
    },
    impactLife: 30,
  },

  hypervoice: {
    // a wall of sound: three bold, dark-outlined arcs rolling forward across the band one after another, vibration
    // ticks off the front, the band trembling
    shot: (v, el, c, s) => {
      const { g, frame } = v
      const W = s.wall || s.r * 2.5, D = s.r
      const col = el === 'Colorless' ? '#ff7ad0' : light(c, 0.15)
      g.save(); g.translate(s.x + rnd(-1.5, 1.5), s.y + rnd(-1.5, 1.5)); g.rotate(s.a)
      g.lineCap = 'round'
      const R = W * 1.7, span = Math.asin(Math.min(1, W / R))
      // four arcs, each swelling bolder and brighter as it rolls up to the front, where it breaks and a new one
      // starts at the back
      for (let k = 0; k < 4; k++) {
        const p = (frame * 0.06 + k / 4) % 1
        const cx = D - (1 - p) * D * 5 - R, a = (0.35 + 0.65 * p) * Math.min(1, (1 - p) * 8)
        g.beginPath(); g.arc(cx, 0, R, -span, span)
        g.strokeStyle = `rgba(30,16,40,${0.55 * a})`; g.lineWidth = 8 + 9 * p; g.stroke()
        g.strokeStyle = hexA(col, a); g.lineWidth = 4 + 7 * p; g.stroke()
        if (p > 0.6) { g.strokeStyle = hexA('#ffffff', a); g.lineWidth = 2 + 2 * p; g.stroke() }
      }
      // vibration ticks just ahead of the front
      g.strokeStyle = 'rgba(30,16,40,0.7)'; g.lineWidth = 3
      for (let i = 0; i < 6; i++) {
        const t = -span * 0.9 + ((i + 0.5) / 6) * span * 1.8, jit = Math.random() * 6
        const bx = D - R + R * Math.cos(t), by = R * Math.sin(t)
        g.beginPath(); g.moveTo(bx + 8 + jit, by); g.lineTo(bx + 18 + jit, by); g.stroke()
      }
      g.restore()
      void v
    },
    // a boom: two bold rings bursting out of the hit
    impact: (v, el, c, i) => {
      const { g } = v
      const k = i.t / i.life
      const col = el === 'Colorless' ? '#ff7ad0' : light(c, 0.15)
      g.save(); g.translate(i.x, i.y - 16)
      for (const d of [0, 0.3]) {
        const p = Math.max(0, k - d) / (1 - d)
        if (p <= 0 || p >= 1) continue
        g.beginPath(); g.arc(0, 0, 14 + 46 * p, 0, TAU)
        g.strokeStyle = `rgba(30,16,40,${0.5 * (1 - p)})`; g.lineWidth = 12 * (1 - p) + 3; g.stroke()
        g.strokeStyle = hexA(d ? col : '#ffffff', 1 - p); g.lineWidth = 7 * (1 - p) + 1.5; g.stroke()
      }
      g.restore()
      void v
    },
    impactLife: 26,
  },
}
