// Signature-move looks: fire (docs/VFX.md "Signature moves"; the sim side is src/sim/signatures.ts).
import { TAU, glowDot, hash, hexA, rnd, star, type ShotView, type Vfx } from '../vfxkit'
import type { SigDraw } from './types'

const FLAME = ['#c0301a', '#ff5a1e', '#ffa030', '#ffe070', '#fffbe0']
const RAINBOW = ['#ff4a5a', '#ffa640', '#ffe94a', '#6fe06a', '#4ab0ff', '#a06aff']
const SPARKS = ['#ffc21a', '#ff3ac0', '#1ac8ff', '#3ad84a', '#ff3a3a', '#a05aff']

/** a tapered flame tongue from the origin out along +x: length L, half-width w, `wob` bends its tip */
function tongue(g: CanvasRenderingContext2D, L: number, w: number, wob: number): void {
  g.beginPath(); g.moveTo(0, -w)
  g.quadraticCurveTo(L * 0.55, -w * 0.95 + wob, L, wob * 1.4)
  g.quadraticCurveTo(L * 0.55, w * 0.95 + wob, 0, w)
  g.closePath()
}

/** layered flame tongues (red outside, white-hot inside) along +x */
function flameArm(g: CanvasRenderingContext2D, L: number, w: number, wob: number, alpha: number): void {
  const layers: [number, number, string][] = [[1, 1, FLAME[0]], [0.9, 0.78, FLAME[1]], [0.75, 0.55, FLAME[2]], [0.55, 0.32, FLAME[3]]]
  for (const [kl, kw, col] of layers) { tongue(g, L * kl, w * kw, wob * kl); g.fillStyle = hexA(col, alpha * (kl === 1 ? 0.85 : 0.95)); g.fill() }
}

/** a comet of fire: tongues streaming back from a hot core (the shared body of the fire shots) */
function fireCore(v: Vfx, s: ShotView, r: number, core = '#fffbe0'): void {
  const { g } = v
  g.save(); g.translate(s.x, s.y); g.rotate(s.a + Math.PI)
  for (let i = 0; i < 5; i++) { g.save(); g.rotate((i - 2) * 0.22); flameArm(g, r * rnd(2.2, 3.2), r * 0.62, rnd(-1, 1) * r * 0.3, 0.8); g.restore() }
  g.restore()
  const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 1.2)
  gr.addColorStop(0, core); gr.addColorStop(0.4, FLAME[3]); gr.addColorStop(0.75, FLAME[1]); gr.addColorStop(1, hexA(FLAME[0], 0))
  g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.y, r * 1.2, 0, TAU); g.fill()
}

const shadow = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => { g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(x, y + r * 1.1, r * 0.9, r * 0.35, 0, 0, TAU); g.fill() }

export const FIRE: Record<string, SigDraw> = {
  fireblast: {
    // a big fireball with the five-armed star of Fire Blast already wheeling inside its glow
    shot: (v, el, c, s) => {
      const { g, frame } = v
      const r = Math.max(9, s.r) * 1.35 * (s.kid ? 0.5 : 1)
      shadow(g, s.x, s.y, r)
      fireCore(v, s, r)
      g.save(); g.translate(s.x, s.y); g.rotate(frame * 0.12 + s.id)
      g.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 5; i++) { g.save(); g.rotate((i * TAU) / 5); flameArm(g, r * 1.55, r * 0.34, Math.sin(frame * 0.6 + i) * r * 0.12, 0.55); g.restore() }
      g.restore()
      glowDot(g, s.x, s.y, r * 2.4, el === 'Fire' ? '#ff8a2a' : c, 0.45)
      if (frame % 1 === 0) v.spawn({ x: s.x - Math.cos(s.a) * r, y: s.y - Math.sin(s.a) * r, vx: -Math.cos(s.a) * 1.5 + rnd(-0.8, 0.8), vy: -Math.sin(s.a) * 1.5 + rnd(-1, 0.2), life: rnd(14, 24), color: FLAME[1 + (frame % 3)], r: rnd(2, 4), kind: 'ember', g: -0.05 })
      if (frame % 4 === 0) v.spawn({ x: s.x - Math.cos(s.a) * r * 1.6, y: s.y - Math.sin(s.a) * r * 1.6, vx: rnd(-0.3, 0.3), vy: rnd(-0.8, -0.2), life: 30, color: '#5a4a44', r: r * 0.5, kind: 'smoke', g: -0.02 })
    },
    // the 大: five great flame arms (a head, two arms, two legs) flaring out of the blast and burning down
    impact: (v, _el, _c, i) => {
      const { g, frame } = v
      const grow = Math.min(1, i.t / 5), k = 1 - Math.pow(1 - grow, 3)
      const fade = i.t < i.life * 0.55 ? 1 : 1 - (i.t - i.life * 0.55) / (i.life * 0.45)
      const R = Math.max(60, i.r) * 1.15
      const arms: [number, number, number][] = [[-Math.PI / 2, 0.85, 0.36], [-0.16, 1, 0.32], [Math.PI + 0.16, 1, 0.32], [Math.PI / 2 - 0.55, 1.12, 0.34], [Math.PI / 2 + 0.55, 1.12, 0.34]]
      g.save(); g.translate(i.x, i.y)
      glowDot(g, 0, 0, R * 1.2 * k, '#ff8a2a', 0.55 * fade)
      arms.forEach(([an, len, wid], n) => {
        g.save(); g.rotate(an)
        flameArm(g, R * len * k, R * wid * (0.8 + 0.2 * k), Math.sin(frame * 0.7 + n * 1.7) * R * 0.05, fade)
        g.restore()
      })
      g.globalCompositeOperation = 'lighter'
      glowDot(g, 0, 0, R * 0.45, '#fffbe0', 0.9 * fade)
      g.restore()
      if (i.t === 1) for (let n = 0; n < 18; n++) {
        const [an] = arms[n % 5], sp = rnd(3, 7)
        v.spawn({ x: i.x, y: i.y, vx: Math.cos(an + rnd(-0.2, 0.2)) * sp, vy: Math.sin(an + rnd(-0.2, 0.2)) * sp, life: rnd(20, 34), color: FLAME[1 + (n % 3)], r: rnd(2.5, 4.5), kind: 'ember', g: -0.04 })
      }
    },
    impactLife: 40,
  },

  willowisp: {
    // a blue ghost-fire wisp: a flickering teardrop flame, its tip licking back and up, a violet rim and a pale heart
    shot: (v, _el, _c, s) => {
      const { g, frame } = v
      const r = Math.max(9, s.r) * 1.6 * (s.kid ? 0.55 : 1)
      const t = s.trail
      g.save()
      for (let i = 0; i < t.length; i += 2) { const k = i / t.length; glowDot(g, t[i].x, t[i].y - (1 - k) * 8, r * (0.3 + 0.6 * k), '#3a5aff', 0.35 * k) }
      g.restore()
      g.save(); g.translate(s.x, s.y)
      // the flame's tail leans back along the path and rises, like a candle carried fast
      const back = s.a + Math.PI, up = -Math.PI / 2
      const lean = Math.atan2(Math.sin(back) + Math.sin(up) * 0.8, Math.cos(back) + Math.cos(up) * 0.8)
      g.rotate(lean)
      const wob = Math.sin(frame * 0.5 + s.id * 2.1) * r * 0.35
      glowDot(g, 0, 0, r * 2.2, '#4a6cff', 0.4)
      tongue(g, r * 2.9, r * 0.95, wob); g.fillStyle = hexA('#2a2a9a', 0.85); g.fill()
      g.beginPath(); g.arc(0, 0, r * 0.95, 0, TAU); g.fill()
      tongue(g, r * 2.4, r * 0.75, wob * 0.8); g.fillStyle = hexA('#3a6cff', 0.95); g.fill()
      g.beginPath(); g.arc(0, 0, r * 0.78, 0, TAU); g.fill()
      tongue(g, r * 1.6, r * 0.5, wob * 0.5); g.fillStyle = hexA('#7fd8ff', 0.95); g.fill()
      g.beginPath(); g.arc(0, 0, r * 0.45 * rnd(0.9, 1.1), 0, TAU); g.fillStyle = '#f0fbff'; g.fill()
      g.restore()
      if (frame % 3 === 0) v.spawn({ x: s.x + rnd(-r, r) * 0.5, y: s.y, vx: rnd(-0.4, 0.4), vy: rnd(-1.4, -0.6), life: rnd(16, 26), color: ['#7fd0ff', '#8a6aff', '#4a8cff'][frame % 3], r: rnd(2, 3.5), kind: 'ember', g: -0.03 })
    },
    // the wisp catches: a small crown of blue flames leaping up round the spot
    impact: (v, _el, _c, i) => {
      const { g, frame } = v
      const k = Math.min(1, i.t / 5), fade = 1 - i.t / i.life
      g.save(); g.translate(i.x, i.y)
      glowDot(g, 0, 0, 44 * k, '#4a6cff', 0.45 * fade)
      for (let n = 0; n < 5; n++) {
        const px = (n - 2) * 11, h = 34 * k * (0.7 + 0.3 * Math.sin(frame * 0.5 + n * 2)) * (n === 2 ? 1.3 : 1)
        g.save(); g.translate(px, 6); g.rotate(-Math.PI / 2 + (n - 2) * 0.18)
        tongue(g, h, 8, Math.sin(frame * 0.6 + n) * 3); g.fillStyle = hexA('#2a2a9a', 0.85 * fade); g.fill()
        tongue(g, h * 0.85, 6, Math.sin(frame * 0.6 + n) * 2.5); g.fillStyle = hexA('#3a6cff', 0.95 * fade); g.fill()
        tongue(g, h * 0.5, 3.5, 0); g.fillStyle = hexA('#bfeaff', fade); g.fill()
        g.restore()
      }
      g.restore()
      if (i.t === 1) for (let n = 0; n < 8; n++) v.spawn({ x: i.x + rnd(-16, 16), y: i.y, vx: rnd(-1, 1), vy: rnd(-3, -1), life: rnd(18, 28), color: n % 2 ? '#7fd0ff' : '#8a6aff', r: 3, kind: 'ember', g: -0.04 })
    },
    impactLife: 24,
  },

  fireworks: {
    // a rocket: a striped body and nose cone streaking on a hissing spark trail; its shards are the burst's coloured
    // sparks, each a bright star dragging a fading streak
    shot: (v, _el, _c, s) => {
      const { g, frame } = v
      const cx = Math.cos(s.a), cy = Math.sin(s.a)
      if (s.kid) {
        const col = SPARKS[Math.floor(hash(s.id, 3) * SPARKS.length)]
        const t = s.trail, tail = t[Math.max(0, t.length - 6)] ?? { x: s.x - cx * 30, y: s.y - cy * 30 }
        g.save(); g.lineCap = 'round'
        const gr = g.createLinearGradient(tail.x, tail.y, s.x, s.y)
        gr.addColorStop(0, hexA(col, 0)); gr.addColorStop(1, hexA(col, 1))
        g.strokeStyle = gr; g.lineWidth = 4.5; g.beginPath(); g.moveTo(tail.x, tail.y); g.lineTo(s.x, s.y); g.stroke()
        glowDot(g, s.x, s.y, 13 * rnd(0.8, 1.2), col, 0.55)
        g.translate(s.x, s.y); g.rotate(s.age * 0.4); star(g, 6.5, 4, 0.35); g.fillStyle = col; g.fill()
        g.strokeStyle = 'rgba(40,20,40,0.5)'; g.lineWidth = 1; g.stroke()
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 2.2, 0, TAU); g.fill()
        g.restore()
        if (Math.random() < 0.25) v.spawn({ x: s.x, y: s.y, vx: rnd(-0.5, 0.5), vy: rnd(-0.2, 0.6), life: rnd(8, 14), color: col, r: 1.8, kind: 'spark', g: 0.05 })
        return
      }
      const r = Math.max(9, s.r) * 1.7
      // the smoky, sparkling exhaust
      const t = s.trail
      g.save(); g.lineCap = 'round'
      for (let i = 1; i < t.length; i++) { const k = i / t.length; g.strokeStyle = `rgba(200,190,180,${0.28 * k})`; g.lineWidth = 3 + 5 * k; g.beginPath(); g.moveTo(t[i - 1].x, t[i - 1].y); g.lineTo(t[i].x, t[i].y); g.stroke() }
      g.restore()
      g.save(); g.translate(s.x, s.y); g.rotate(s.a)
      g.globalCompositeOperation = 'lighter'
      tongue(g, -r * rnd(1.6, 2.4), r * 0.32, 0); g.fillStyle = hexA('#ffd24a', 0.9); g.fill()
      glowDot(g, -r * 0.9, 0, r * 1.1, '#ffb340', 0.7)
      g.globalCompositeOperation = 'source-over'
      // body, stripes, nose cone, fins
      const L = r * 1.5, W = r * 0.36
      g.fillStyle = '#f4efe6'; g.fillRect(-L * 0.6, -W, L, W * 2)
      g.fillStyle = '#e0303a'; for (const p of [-0.45, -0.1, 0.25]) g.fillRect(-L * 0.6 + L * (p + 0.6) * 0.95, -W, L * 0.12, W * 2)
      g.beginPath(); g.moveTo(L * 0.4, -W); g.lineTo(L * 0.85, 0); g.lineTo(L * 0.4, W); g.closePath(); g.fillStyle = '#e0303a'; g.fill()
      g.beginPath(); g.moveTo(-L * 0.6, -W); g.lineTo(-L * 0.8, -W * 1.9); g.lineTo(-L * 0.35, -W); g.moveTo(-L * 0.6, W); g.lineTo(-L * 0.8, W * 1.9); g.lineTo(-L * 0.35, W); g.fillStyle = '#3a5ad0'; g.fill()
      g.strokeStyle = 'rgba(40,20,20,0.6)'; g.lineWidth = 1.2; g.strokeRect(-L * 0.6, -W, L, W * 2)
      g.restore()
      if (frame % 1 === 0) v.spawn({ x: s.x - cx * r * 1.4, y: s.y - cy * r * 1.4, vx: -cx * 2 + rnd(-1.5, 1.5), vy: -cy * 2 + rnd(-1.5, 1.5), life: rnd(8, 16), color: frame % 2 ? '#fff4a0' : '#ffb340', r: 2, kind: 'spark', g: 0.06 })
    },
    // a spark's pop: a crackle of glitter in its colour (the parent's is the starburst's white flash)
    impact: (v, _el, _c, i) => {
      const { g } = v
      const fade = 1 - i.t / i.life
      g.save(); g.translate(i.x, i.y)
      const col = SPARKS[Math.floor(hash(i.id, 5) * SPARKS.length)]
      glowDot(g, 0, 0, 26 * (0.5 + 0.5 * fade), col, 0.5 * fade)
      g.strokeStyle = hexA(col, fade); g.lineWidth = 2.5; g.lineCap = 'round'
      const R = 8 + 18 * (1 - fade)
      g.beginPath(); for (let n = 0; n < 8; n++) { const an = (n * TAU) / 8 + i.id; g.moveTo(Math.cos(an) * R * 0.4, Math.sin(an) * R * 0.4); g.lineTo(Math.cos(an) * R, Math.sin(an) * R) } g.stroke()
      g.restore()
      if (i.t === 1) for (let n = 0; n < 6; n++) { const an = rnd(0, TAU); v.spawn({ x: i.x, y: i.y, vx: Math.cos(an) * rnd(1.5, 3.5), vy: Math.sin(an) * rnd(1.5, 3.5), life: rnd(12, 22), color: SPARKS[n % SPARKS.length], r: 2, kind: 'star', g: 0.08 }) }
    },
    impactLife: 16,
  },

  juggle: {
    // a juggled fireball: a round ball of flame tumbling end over end, a spiral seam of fire wound round it
    shot: (v, _el, _c, s) => {
      const { g, frame } = v
      const r = Math.max(9, s.r) * 1.25 * (s.kid ? 0.55 : 1)
      const spin = frame * 0.35 + s.id * 1.3
      g.save(); g.globalCompositeOperation = 'lighter'
      for (let i = Math.max(0, s.trail.length - 8); i < s.trail.length; i++) { const k = (i - s.trail.length + 8) / 8; glowDot(g, s.trail[i].x, s.trail[i].y, r * (0.4 + 0.6 * k), '#ff6a1e', 0.3 * k) }
      g.restore()
      g.save(); g.translate(s.x, s.y)
      // flames licking up off the ball
      for (let i = 0; i < 4; i++) { g.save(); g.rotate(-Math.PI / 2 + (i - 1.5) * 0.45); flameArm(g, r * rnd(1.5, 2.1), r * 0.45, rnd(-1, 1) * r * 0.2, 0.75); g.restore() }
      const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r)
      gr.addColorStop(0, '#fffbe0'); gr.addColorStop(0.45, '#ffc040'); gr.addColorStop(1, '#e04418')
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill()
      // the seam: two bright arcs wrapping the ball, rotating so it reads as tumbling
      g.rotate(spin); g.strokeStyle = hexA('#fff4c0', 0.9); g.lineWidth = Math.max(2, r * 0.18); g.lineCap = 'round'
      g.beginPath(); g.ellipse(0, 0, r * 0.85, r * 0.35, 0, -2.4, 0.6); g.stroke()
      g.beginPath(); g.ellipse(0, 0, r * 0.85, r * 0.35, 0, 0.9, 2.2); g.stroke()
      g.restore()
      if (frame % 2 === 0) v.spawn({ x: s.x + rnd(-r, r) * 0.4, y: s.y - r * 0.6, vx: rnd(-0.6, 0.6), vy: rnd(-1.6, -0.6), life: rnd(12, 20), color: FLAME[1 + (frame % 3)], r: rnd(2, 3.5), kind: 'ember', g: -0.04 })
    },
    // it lands and bursts: a round splash of flame tongues fanning out low along the ground, a smoke puff
    impact: (v, _el, _c, i) => {
      const { g, frame } = v
      const k = Math.min(1, i.t / 4), fade = i.t < i.life * 0.4 ? 1 : 1 - (i.t - i.life * 0.4) / (i.life * 0.6)
      const R = Math.max(40, i.r)
      g.save(); g.translate(i.x, i.y)
      glowDot(g, 0, 0, R * 1.1 * k, '#ff8a2a', 0.5 * fade)
      g.scale(1, 0.7)
      for (let n = 0; n < 9; n++) {
        const an = (n / 9) * TAU + hash(i.id, n) * 0.5
        g.save(); g.rotate(an); flameArm(g, R * k * (0.75 + 0.35 * hash(i.id, n + 9)), R * 0.2, Math.sin(frame * 0.6 + n) * R * 0.05, fade); g.restore()
      }
      g.restore()
      g.save(); g.globalCompositeOperation = 'lighter'; glowDot(g, i.x, i.y, R * 0.5, '#fff0b0', 0.8 * fade); g.restore()
      if (i.t === 1) {
        for (let n = 0; n < 10; n++) { const an = rnd(0, TAU); v.spawn({ x: i.x, y: i.y, vx: Math.cos(an) * rnd(2, 4.5), vy: Math.sin(an) * rnd(1.5, 3) - 1.5, life: rnd(16, 26), color: FLAME[1 + (n % 3)], r: rnd(2, 4), kind: 'ember', g: 0.05 }) }
        v.spawn({ x: i.x, y: i.y - 8, vx: 0, vy: -0.6, life: 36, color: '#5a4a44', r: R * 0.45, kind: 'smoke', g: -0.01 })
      }
    },
    impactLife: 24,
  },

  sacredfire: {
    // a phoenix flame: a gold-white flame body edged with every colour of the rainbow, flame tongues licking off it,
    // and a pair of swept flame wings flaring at its head
    beam: (v, _el, _c, b) => {
      const { g, frame } = v
      const L = Math.hypot(b.x2 - b.x1, b.y2 - b.y1), a = Math.atan2(b.y2 - b.y1, b.x2 - b.x1)
      const life = Math.min(1, b.t / 4), w = b.w * (0.8 + 0.2 * life)
      const N = Math.max(8, Math.round(L / 18))
      const edge = (side: number, k: number, ph: number) => {
        g.beginPath()
        for (let i = 0; i <= N; i++) {
          const x = (i / N) * L, taper = Math.min(1, x / 50)
          g.lineTo(x, side * (w / 2) * k * taper * (1 + 0.16 * Math.sin(x * 0.07 - frame * 0.7 + ph)))
        }
      }
      g.save(); g.translate(b.x1, b.y1); g.rotate(a); g.lineCap = 'round'; g.lineJoin = 'round'
      // the rainbow rim: bands from red outside to violet in
      RAINBOW.forEach((col, n) => {
        const k = 1.55 - n * 0.1
        for (const side of [-1, 1]) { edge(side, k, n * 0.5 + side); g.strokeStyle = hexA(col, 0.9 * life); g.lineWidth = 4; g.stroke() }
      })
      // the flame body
      g.beginPath()
      for (let i = 0; i <= N; i++) { const x = (i / N) * L, taper = Math.min(1, x / 50); g.lineTo(x, -(w / 2) * 1.02 * taper * (1 + 0.16 * Math.sin(x * 0.07 - frame * 0.7 - 1))) }
      for (let i = N; i >= 0; i--) { const x = (i / N) * L, taper = Math.min(1, x / 50); g.lineTo(x, (w / 2) * 1.02 * taper * (1 + 0.16 * Math.sin(x * 0.07 - frame * 0.7 + 1))) }
      g.closePath()
      const gr = g.createLinearGradient(0, -w / 2, 0, w / 2)
      gr.addColorStop(0, hexA('#e8401a', 0.9 * life)); gr.addColorStop(0.3, hexA('#ffa030', 0.95 * life)); gr.addColorStop(0.5, hexA('#fff0a0', life)); gr.addColorStop(0.7, hexA('#ffa030', 0.95 * life)); gr.addColorStop(1, hexA('#e8401a', 0.9 * life))
      g.fillStyle = gr; g.fill()
      g.fillStyle = hexA('#ffffff', 0.8 * life); g.fillRect(0, -w * 0.07, L, w * 0.14)
      // tongues licking off the edges, streaming forward
      g.globalCompositeOperation = 'source-over'
      for (let i = 0; i < 8; i++) {
        const p = (frame * 0.035 + i / 8) % 1, side = i % 2 ? 1 : -1
        g.save(); g.translate(p * L, side * w * 0.42); g.rotate(Math.PI - side * 0.55)
        flameArm(g, w * 0.8 * (1 - p * 0.4), w * 0.26, side * Math.sin(frame * 0.5 + i) * 3, 0.8 * life)
        g.restore()
      }
      // the phoenix at the head: two swept-back wings of flame and a crest
      g.translate(L, 0)
      glowDot(g, 0, 0, w * 1.8, '#ffb340', 0.5 * life)
      const flap = Math.sin(frame * 0.35) * 0.18
      for (const side of [-1, 1]) {
        // a wing: four flame feathers fanned back, the outer ones tipped in rainbow
        for (let j = 3; j >= 0; j--) {
          g.save(); g.rotate(Math.PI + side * (0.55 + j * 0.28 + flap))
          flameArm(g, w * (2.5 - j * 0.35), w * 0.34, side * w * 0.3, 0.9 * life)
          tongue(g, w * (2.5 - j * 0.35), w * 0.34, side * w * 0.3); g.strokeStyle = hexA(RAINBOW[(j + (side > 0 ? 3 : 0)) % RAINBOW.length], 0.9 * life); g.lineWidth = 2; g.stroke()
          g.restore()
        }
      }
      g.save(); g.rotate(-Math.PI / 2 * 0.2); flameArm(g, w * 0.9, w * 0.3, 0, life); g.restore()
      glowDot(g, 0, 0, w * 0.6, '#ffffff', 0.9 * life)
      g.restore()
      if (frame % 2 === 0) { const t = Math.random(); v.spawn({ x: b.x1 + (b.x2 - b.x1) * t, y: b.y1 + (b.y2 - b.y1) * t, vx: rnd(-0.8, 0.8), vy: rnd(-2, -0.6), life: 24, color: RAINBOW[Math.floor(rnd(0, RAINBOW.length))], r: 2.5, kind: 'ember', g: -0.03 }) }
    },
    // a phoenix fireball: a white-gold flame with rainbow streamers for a tail and two small wings
    shot: (v, _el, _c, s) => {
      const { g, frame } = v
      const r = Math.max(9, s.r) * 1.35 * (s.kid ? 0.55 : 1)
      g.save(); g.translate(s.x, s.y); g.rotate(s.a + Math.PI); g.lineCap = 'round'
      RAINBOW.forEach((col, n) => {
        const off = (n - 2.5) * r * 0.2
        g.beginPath(); g.moveTo(0, off * 0.3)
        g.quadraticCurveTo(r * 2, off + Math.sin(frame * 0.4 + n) * r * 0.3, r * 3.6, off * 1.8)
        g.strokeStyle = hexA(col, 0.8); g.lineWidth = r * 0.22; g.stroke()
      })
      for (const side of [-1, 1]) { g.save(); g.rotate(side * (1.9 + Math.sin(frame * 0.4) * 0.2)); flameArm(g, r * 1.8, r * 0.4, side * r * 0.2, 0.9); g.restore() }
      g.restore()
      g.save(); g.globalCompositeOperation = 'lighter'; glowDot(g, s.x, s.y, r * 2, '#ffb340', 0.7); g.restore()
      g.fillStyle = '#fff8d8'; g.beginPath(); g.arc(s.x, s.y, r * 0.6, 0, TAU); g.fill()
      if (frame % 2 === 0) v.spawn({ x: s.x, y: s.y, vx: -Math.cos(s.a) * 1.5 + rnd(-0.6, 0.6), vy: -Math.sin(s.a) * 1.5 + rnd(-0.6, 0.6), life: 20, color: RAINBOW[frame % RAINBOW.length], r: 2.5, kind: 'ember', g: -0.03 })
    },
    // a sweep of sacred flame: a gold fan of fire rimmed in rainbow arcs, rainbow embers thrown through it
    cone: (v, _el, _c, w) => {
      const { g, frame } = v
      const fade = 1 - Math.max(0, w.k - 0.4) / 0.6, reach = w.range * Math.min(1, 0.35 + w.k * 1.3)
      g.save(); g.globalCompositeOperation = 'lighter'
      const gr = g.createRadialGradient(w.x, w.y, 0, w.x, w.y, reach)
      gr.addColorStop(0, hexA('#fff4c0', 0.6 * fade)); gr.addColorStop(0.7, hexA('#ffa030', 0.45 * fade)); gr.addColorStop(1, hexA('#ff5a1e', 0))
      g.fillStyle = gr; g.beginPath(); g.moveTo(w.x, w.y); g.arc(w.x, w.y, reach, w.aim - w.arc / 2, w.aim + w.arc / 2); g.closePath(); g.fill()
      g.lineWidth = 4; g.lineCap = 'round'
      RAINBOW.forEach((col, n) => { g.strokeStyle = hexA(col, 0.8 * fade); g.beginPath(); g.arc(w.x, w.y, reach * (1 - n * 0.035) + Math.sin(frame * 0.4 + n) * 2, w.aim - w.arc / 2, w.aim + w.arc / 2); g.stroke() })
      g.restore()
      if (w.k < 0.6) for (let n = 0; n < 2; n++) { const t = w.aim + rnd(-0.5, 0.5) * w.arc, sp = rnd(0.6, 1) * (w.range / 12); v.spawn({ x: w.x + Math.cos(t) * 20, y: w.y + Math.sin(t) * 20, vx: Math.cos(t) * sp, vy: Math.sin(t) * sp, life: 24, color: RAINBOW[Math.floor(rnd(0, RAINBOW.length))], r: 4, kind: 'ember', g: -0.02 }) }
    },
    // the sacred flame catches: a rising column of gold fire ringed by a rainbow halo
    impact: (v, _el, _c, i) => {
      const { g, frame } = v
      const k = Math.min(1, i.t / 5), fade = 1 - i.t / i.life
      g.save(); g.translate(i.x, i.y)
      RAINBOW.forEach((col, n) => { g.strokeStyle = hexA(col, 0.8 * fade); g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, (30 + n * 4) * (0.5 + k), (12 + n * 1.6) * (0.5 + k), 0, 0, TAU); g.stroke() })
      g.rotate(-Math.PI / 2)
      for (let n = -1; n <= 1; n++) { g.save(); g.rotate(n * 0.3); flameArm(g, 70 * k * (n ? 0.7 : 1) * (0.9 + 0.1 * Math.sin(frame * 0.6 + n)), 10, 0, fade); g.restore() }
      g.restore()
      if (i.t === 1) for (let n = 0; n < 12; n++) v.spawn({ x: i.x + rnd(-20, 20), y: i.y, vx: rnd(-1.2, 1.2), vy: rnd(-4, -1.5), life: rnd(18, 30), color: RAINBOW[n % RAINBOW.length], r: 3, kind: 'ember', g: -0.02 })
    },
    impactLife: 26,
  },
}
