// Signature-move looks: grass, poison, ground and rock (docs/VFX.md "Signature moves"; the sim side is src/sim/signatures.ts).
import { TAU, dark, glowDot, hash, hexA, light, rnd, type AreaView, type Vfx } from '../vfxkit'
import type { SigDraw } from './types'

const PETAL = ['#ff8cc6', '#ffb6da', '#ff5fa8', '#ffd0e6']
const SLUDGE = '#8a3fb0', SLIME = '#b4e04a'

/** a petal: a rounded teardrop with a notch at its tip and a pale base, pointing along +x */
function petal(g: CanvasRenderingContext2D, r: number, fill: string): void {
  g.beginPath()
  g.moveTo(-r, 0)
  g.bezierCurveTo(-r * 0.4, -r * 0.75, r * 0.8, -r * 0.7, r, -r * 0.12)
  g.lineTo(r * 0.78, 0)
  g.lineTo(r, r * 0.12)
  g.bezierCurveTo(r * 0.8, r * 0.7, -r * 0.4, r * 0.75, -r, 0)
  g.fillStyle = fill; g.fill()
  g.strokeStyle = 'rgba(170,40,100,0.7)'; g.lineWidth = 1.3; g.stroke()
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(-r * 0.45, 0, r * 0.35, r * 0.16, 0, 0, TAU); g.fill()
}

/** the whirl of Petal Dance: two rings of petals orbiting the caster in an ellipse (the floor's perspective); the
 * half behind the caster is drawn under the fighters, the half in front over them */
function petalWhirl(v: Vfx, a: AreaView, front: boolean): void {
  const { g, frame } = v
  const { x, y, r, fade } = a
  const N = 26
  g.save()
  for (let i = 0; i < N; i++) {
    const ring = i % 2, dir = ring ? -1 : 1
    const rr = r * (ring ? 0.62 : 0.92) * (0.9 + 0.1 * Math.sin(frame * 0.08 + i))
    const t = (i / N) * TAU + frame * 0.09 * dir + hash(a.id, i) * 0.4
    const inFront = Math.sin(t) > 0
    if (inFront !== front) continue
    const lift = 26 + 22 * hash(a.id, i + 7) + Math.sin(frame * 0.12 + i) * 8
    const px = x + Math.cos(t) * rr, py = y + Math.sin(t) * rr * 0.45 - lift
    g.save(); g.translate(px, py)
    g.rotate(t + (dir * Math.PI) / 2 + Math.sin(frame * 0.3 + i) * 0.5)
    g.scale(1, 0.55 + 0.45 * Math.abs(Math.cos(frame * 0.2 + i * 1.3)))
    g.globalAlpha = fade * (front ? 1 : 0.8)
    petal(g, 12 + 4 * hash(a.id, i + 3), PETAL[i % PETAL.length])
    g.restore()
  }
  g.restore()
}

/** a crescent blade of wind pointing along +x (the bulge leads) */
function crescent(g: CanvasRenderingContext2D, R: number): void {
  g.beginPath()
  g.arc(-R * 0.55, 0, R, -1.05, 1.05)
  g.arc(-R * 1.02, 0, R * 0.98, 0.9, -0.9, true)
  g.closePath()
}

/** a jagged stone spike rising out of the ground at (0, 0), h tall, lit from the left */
function spike(g: CanvasRenderingContext2D, h: number, w: number, id: number, k: number): void {
  const j = (n: number) => (hash(id, n) - 0.5) * w * 0.35
  const tip = { x: j(1) * 1.5, y: -h }
  const L = [{ x: -w, y: 0 }, { x: -w * 0.7 + j(2), y: -h * 0.35 }, { x: -w * 0.38 + j(3), y: -h * 0.7 }]
  const R = [{ x: w * 0.4 + j(4), y: -h * 0.72 }, { x: w * 0.75 + j(5), y: -h * 0.4 }, { x: w, y: 0 }]
  // the lit face and the shadowed face, split down a ridge from the tip
  const ridge = { x: w * 0.1 + j(6), y: 0 }
  g.beginPath(); g.moveTo(L[0].x, L[0].y); for (const p of L) g.lineTo(p.x, p.y); g.lineTo(tip.x, tip.y); g.lineTo(ridge.x, ridge.y); g.closePath()
  g.fillStyle = '#b8a88c'; g.fill()
  g.beginPath(); g.moveTo(tip.x, tip.y); for (const p of R) g.lineTo(p.x, p.y); g.lineTo(ridge.x, ridge.y); g.closePath()
  g.fillStyle = '#6e604c'; g.fill()
  g.beginPath(); g.moveTo(L[0].x, L[0].y); for (const p of L) g.lineTo(p.x, p.y); g.lineTo(tip.x, tip.y); for (const p of R) g.lineTo(p.x, p.y)
  g.strokeStyle = '#3a2e22'; g.lineWidth = 2.5; g.lineJoin = 'miter'; g.stroke()
  // a glint on the edge just after it breaks the ground
  if (k < 1) { g.strokeStyle = `rgba(255,250,230,${1 - k})`; g.lineWidth = 2; g.beginPath(); g.moveTo(L[2].x, L[2].y); g.lineTo(tip.x, tip.y); g.stroke() }
}

/** snaring vines lashing up out of the ground round (x, y): thick dark-edged whips that sway and curl into a snare
 * loop at the tip, leaves along them; `up` 0..1 their height */
function vines(v: Vfx, x: number, y: number, r: number, id: number, up: number): void {
  const { g, frame } = v
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'
  const N = 5
  for (let i = 0; i < N; i++) {
    const t = (i / N) * TAU + hash(id, i) * 0.8, rr = r * (0.35 + 0.4 * hash(id, i + 9))
    const bx = x + Math.cos(t) * rr, by = y + Math.sin(t) * rr * 0.7
    const H = (70 + 40 * hash(id, i + 4)) * up
    const lean = (x - bx) * 0.6, whip = Math.sin(frame * 0.35 + i * 1.7) * 14 * up
    const tx = bx + lean + whip, ty = by - H
    const pts = (): void => { g.beginPath(); g.moveTo(bx, by); g.bezierCurveTo(bx - lean * 0.3, by - H * 0.4, tx - whip * 1.4, by - H * 0.8, tx, ty) }
    pts(); g.strokeStyle = '#1f4a1a'; g.lineWidth = 11; g.stroke()
    pts(); g.strokeStyle = '#4f9e3a'; g.lineWidth = 7; g.stroke()
    pts(); g.strokeStyle = 'rgba(190,255,150,0.55)'; g.lineWidth = 2; g.stroke()
    // the snare: a loop curling over at the tip
    const dir = Math.sign(x - bx) || 1
    g.strokeStyle = '#1f4a1a'; g.lineWidth = 8; g.beginPath(); g.arc(tx + dir * 8, ty + 2, 9, Math.PI, Math.PI + dir * 5); g.stroke()
    g.strokeStyle = '#6fce5a'; g.lineWidth = 4.5; g.stroke()
    // leaves along it
    for (const f of [0.35, 0.65]) {
      const lx = bx + (tx - bx) * f + Math.sin(f * 3) * 4, ly = by + (ty - by) * f
      g.save(); g.translate(lx, ly); g.rotate((i % 2 ? -1 : 1) * 0.9 + whip * 0.02)
      g.fillStyle = '#7ed957'; g.beginPath(); g.ellipse(7, 0, 7, 3.2, 0, 0, TAU); g.fill(); g.restore()
    }
  }
  g.restore()
}

export const NATURE: Record<string, SigDraw> = {
  airslash: {
    // two pale, see-through crescent blades of wind slicing forward, afterimages and wind streaks behind
    shot: (v, el, c, s) => {
      const { g, frame } = v
      const R = Math.max(10, s.r) * 3
      const col = el === 'Colorless' || el === 'Grass' ? '#bfe8ff' : light(c, 0.5)
      g.save(); g.translate(s.x, s.y); g.rotate(s.a)
      g.lineCap = 'round'
      // wind streaks pulled back off the blade's horns
      g.strokeStyle = hexA('#ffffff', 0.7); g.lineWidth = 2
      for (let k = -2; k <= 2; k++) {
        const o = k * R * 0.32, len = R * (1.4 + 0.5 * Math.abs(Math.sin(frame * 0.5 + k)))
        g.beginPath(); g.moveTo(-R * 0.5, o); g.lineTo(-R * 0.5 - len, o); g.stroke()
      }
      // afterimages, fainter and further back
      for (let k = 2; k >= 0; k--) {
        g.save(); g.translate(-k * R * 0.42, 0)
        crescent(g, R * (1 - k * 0.06))
        g.fillStyle = hexA(col, k === 0 ? 0.72 : 0.3 / k); g.fill()
        if (k === 0) {
          g.strokeStyle = 'rgba(70,130,170,0.55)'; g.lineWidth = 1.5; g.stroke()
          g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 2.5; g.beginPath(); g.arc(-R * 0.55, 0, R, -0.95, 0.95); g.stroke()
        }
        g.restore()
      }
      g.restore()
      if (frame % 3 === 0) v.spawn({ x: s.x + rnd(-6, 6), y: s.y + rnd(-6, 6), vx: -Math.cos(s.a) * 2, vy: -Math.sin(s.a) * 2, life: 12, color: '#f0faff', r: 2, kind: 'dot', g: 0 })
    },
    // a cross-cut: two white slash lines crossing where the blade bit, flicking open and fading
    impact: (v, el, c, i) => {
      const { g } = v
      const k = i.t / i.life, L = 34 + 26 * Math.min(1, k * 4)
      g.save(); g.translate(i.x, i.y - 16); g.lineCap = 'round'; g.globalCompositeOperation = 'lighter'
      for (const t of [-0.7, 0.55]) {
        g.save(); g.rotate(t)
        g.strokeStyle = hexA('#bfe6ff', 0.6 * (1 - k)); g.lineWidth = 9 * (1 - k) + 2
        g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke()
        g.strokeStyle = `rgba(255,255,255,${1 - k})`; g.lineWidth = 2.5
        g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke()
        g.restore()
      }
      g.restore()
      if (i.t === 1) for (let n = 0; n < 8; n++) { const t = rnd(0, TAU); v.spawn({ x: i.x, y: i.y - 16, vx: Math.cos(t) * 4, vy: Math.sin(t) * 4, life: 14, color: '#e8f6ff', r: 2, kind: 'spark', g: 0 }) }
      void el; void c
    },
    impactLife: 22,
  },

  petals: {
    // Petal Dance: a pink whirl of petals round the caster, a soft blush on the floor, petals shed off the whirl
    area: (v, el, c, a) => {
      const { g, frame } = v
      g.save()
      const gr = g.createRadialGradient(a.x, a.y, a.r * 0.2, a.x, a.y, a.r)
      gr.addColorStop(0, hexA('#ff9ccf', 0)); gr.addColorStop(0.8, hexA('#ff9ccf', 0.08 * a.fade)); gr.addColorStop(1, hexA('#ff7ab8', 0.16 * a.fade))
      g.fillStyle = gr; g.beginPath(); g.ellipse(a.x, a.y, a.r, a.r * 0.8, 0, 0, TAU); g.fill()
      // swirl lines on the floor
      g.strokeStyle = hexA('#ff7ab8', 0.55 * a.fade); g.lineWidth = 3; g.lineCap = 'round'
      for (let k = 0; k < 3; k++) { const t0 = frame * 0.09 + (k * TAU) / 3; g.beginPath(); g.ellipse(a.x, a.y, a.r * 0.85, a.r * 0.68, 0, t0, t0 + 1.4); g.stroke() }
      g.restore()
      petalWhirl(v, a, false)
      if (frame % 2 === 0) {
        const t = rnd(0, TAU)
        v.spawn({ x: a.x + Math.cos(t) * a.r * 0.9, y: a.y + Math.sin(t) * a.r * 0.4 - 30, vx: -Math.sin(t) * 3, vy: Math.cos(t) * 1.2 - 0.4, life: 34, color: PETAL[frame % 4], r: 4, kind: 'leaf', g: 0.03 })
      }
      void el; void c
    },
    air: (v, el, c, a) => { petalWhirl(v, a, true); void el; void c },
  },

  seedbomb: {
    // a fat striped seed lobbed end over end, a curl of sprout on it
    shot: (v, el, c, s) => {
      const { g, frame } = v
      const r = Math.max(9, s.r) * 1.35
      g.save(); g.translate(s.x, s.y); g.rotate(frame * 0.22 + s.id)
      const gr = g.createLinearGradient(-r, -r, r, r)
      gr.addColorStop(0, '#d8b070'); gr.addColorStop(1, '#6a4a22')
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, r * 1.15, r * 0.8, 0, 0, TAU); g.fill()
      g.strokeStyle = '#4a3218'; g.lineWidth = 2; g.stroke()
      g.strokeStyle = 'rgba(60,40,16,0.6)'; g.lineWidth = 1.5
      for (const k of [-0.4, 0, 0.4]) { g.beginPath(); g.ellipse(k * r, 0, r * 0.12, r * 0.72, 0, 0, TAU); g.stroke() }
      g.strokeStyle = '#5dbb4f'; g.lineWidth = 3; g.lineCap = 'round'
      g.beginPath(); g.moveTo(r * 0.9, 0); g.quadraticCurveTo(r * 1.5, -r * 0.2, r * 1.4, -r * 0.8); g.stroke()
      g.save(); g.translate(r * 1.4, -r * 0.8); g.rotate(-0.8); g.fillStyle = '#7ed957'; g.beginPath(); g.ellipse(r * 0.3, 0, r * 0.35, r * 0.18, 0, 0, TAU); g.fill(); g.restore()
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-r * 0.3, -r * 0.35, r * 0.4, r * 0.15, 0, 0, TAU); g.fill()
      g.restore()
      if (frame % 4 === 0) v.spawn({ x: s.x, y: s.y, vx: rnd(-0.4, 0.4), vy: rnd(-0.4, 0.2), life: 20, color: '#9be870', r: 2.5, kind: 'leaf', g: 0.03 })
      void el; void c
    },
    // the stuck seed: half buried in a dirt mound, sprouting as its fuse runs (a stem, two leaves opening, a bud
    // swelling and blinking faster), the blast ring filling in like a clock
    area: (v, el, c, a) => {
      const { g, frame } = v
      const { x, y } = a
      if (a.land <= 0) {
        // the burst: scorched soil and torn roots, fading
        const since = -a.land
        g.save(); g.fillStyle = `rgba(70,48,24,${0.3 * a.fade})`; g.beginPath(); g.ellipse(x, y, a.r * 0.7, a.r * 0.5, 0, 0, TAU); g.fill()
        g.strokeStyle = hexA('#9be870', 0.8 * a.fade); g.lineWidth = 4; g.beginPath(); g.arc(x, y, a.r * Math.min(1, 0.5 + since / 6), 0, TAU); g.stroke()
        g.restore()
        return
      }
      const fuse = Math.max(1, a.fuse), k = Math.max(0, Math.min(1, 1 - a.land / fuse))
      g.save()
      // the blast ring, a countdown sweep filling it
      g.strokeStyle = hexA('#5dbb4f', 0.35); g.lineWidth = 2; g.setLineDash([8, 7]); g.lineDashOffset = -frame
      g.beginPath(); g.ellipse(x, y, a.r, a.r * 0.8, 0, 0, TAU); g.stroke(); g.setLineDash([])
      g.fillStyle = hexA('#7ed957', 0.14 + 0.1 * k); g.beginPath(); g.moveTo(x, y); g.ellipse(x, y, a.r, a.r * 0.8, 0, -Math.PI / 2, -Math.PI / 2 + TAU * k); g.closePath(); g.fill()
      g.strokeStyle = hexA('#b8ff8a', 0.9); g.lineWidth = 3
      g.beginPath(); g.ellipse(x, y, a.r, a.r * 0.8, 0, -Math.PI / 2, -Math.PI / 2 + TAU * k); g.stroke()
      // the mound and the seed in it, the sprout drawn a size up so it reads
      g.translate(x, y); g.scale(1.6, 1.6); g.translate(-x, -y)
      g.fillStyle = '#5a4020'; g.beginPath(); g.ellipse(x, y + 4, 22, 9, 0, 0, TAU); g.fill()
      g.fillStyle = '#9a6a34'; g.beginPath(); g.ellipse(x, y, 12, 9, -0.3, Math.PI, TAU); g.fill()
      g.strokeStyle = '#4a3218'; g.lineWidth = 1.5; g.stroke()
      // the sprout: a stem rising with k, two leaves opening, a bud swelling
      const H = 10 + 30 * k, sway = Math.sin(frame * 0.2) * 3 * k
      g.strokeStyle = '#4f9e3a'; g.lineWidth = 3.5; g.lineCap = 'round'
      g.beginPath(); g.moveTo(x, y - 4); g.quadraticCurveTo(x - 6, y - H * 0.5, x + sway, y - H); g.stroke()
      for (const side of [-1, 1]) {
        g.save(); g.translate(x - 3 + sway * 0.4, y - H * 0.5); g.rotate(side * (0.3 + 1.1 * k) - Math.PI / 2 + (side > 0 ? Math.PI / 2 : -Math.PI / 2) * 0.6)
        g.fillStyle = '#7ed957'; g.beginPath(); g.ellipse(side * 8 * k, 0, 4 + 7 * k, 3 + 2 * k, 0, 0, TAU); g.fill(); g.restore()
      }
      // the bud blinks faster as the fuse runs down
      const blink = Math.sin(frame * (0.25 + 0.9 * k)) > 0.2
      const br = 4 + 6 * k
      if (blink) glowDot(g, x + sway, y - H, br * 2.6, '#e8ff7a', 0.8)
      g.fillStyle = blink ? '#f4ff9a' : '#c8e060'; g.beginPath(); g.arc(x + sway, y - H, br, 0, TAU); g.fill()
      g.strokeStyle = '#4f9e3a'; g.lineWidth = 1.5; g.stroke()
      g.restore()
      if (frame % 6 === 0) v.spawn({ x: x + rnd(-8, 8), y: y - H, vx: rnd(-0.5, 0.5), vy: -0.6, life: 20, color: '#f4ff9a', r: 2, kind: 'star', g: -0.01 })
      void el; void c
    },
    // the burst: a green-gold flash, a shock ring, leaves and seed husks flung out
    impact: (v, el, c, i) => {
      const { g } = v
      const k = i.t / i.life
      g.save(); g.globalCompositeOperation = 'lighter'
      glowDot(g, i.x, i.y - 10, i.r * (0.4 + 0.5 * k), '#d8ff6a', 0.7 * (1 - k))
      g.globalCompositeOperation = 'source-over'
      g.strokeStyle = hexA('#4f9e3a', 0.9 * (1 - k)); g.lineWidth = 7 * (1 - k) + 2
      g.beginPath(); g.ellipse(i.x, i.y, i.r * (0.3 + 0.8 * k), i.r * (0.24 + 0.64 * k), 0, 0, TAU); g.stroke()
      g.restore()
      if (i.t === 1) {
        for (let n = 0; n < 12; n++) { const t = rnd(0, TAU), sp = rnd(3, 7); v.spawn({ x: i.x, y: i.y - 10, vx: Math.cos(t) * sp, vy: Math.sin(t) * sp - 2, life: rnd(24, 36), color: n % 3 ? '#7ed957' : '#c8e060', r: rnd(3, 5), kind: 'leaf', g: 0.08 }) }
        for (let n = 0; n < 5; n++) { const t = rnd(0, TAU); v.spawn({ x: i.x, y: i.y - 10, vx: Math.cos(t) * 5, vy: Math.sin(t) * 5 - 3, life: 26, color: '#8a6a3a', r: 3.5, kind: 'shard', g: 0.25 }) }
      }
      void el; void c
    },
    impactLife: 24,
  },

  sludgebomb: {
    // a lobbed glob of purple sludge, bubbling and oozing, toxic-green highlights; its shards are dripping droplets
    shot: (v, el, c, s) => {
      const { g, frame } = v
      const r = Math.max(9, s.r) * (s.kid ? 1.2 : 1.35)
      g.save(); g.translate(s.x, s.y)
      if (s.kid) {
        // a droplet: a teardrop along its heading
        g.rotate(s.a)
        g.fillStyle = SLUDGE; g.beginPath(); g.moveTo(r * 1.1, 0); g.quadraticCurveTo(-r * 0.2, -r * 0.8, -r * 0.8, 0); g.quadraticCurveTo(-r * 0.2, r * 0.8, r * 1.1, 0); g.fill()
        g.fillStyle = SLIME; g.beginPath(); g.arc(-r * 0.2, -r * 0.2, r * 0.22, 0, TAU); g.fill()
        g.restore()
        if (frame % 5 === 0) v.spawn({ x: s.x, y: s.y, vx: 0, vy: 0.3, life: 14, color: SLUDGE, r: 2, kind: 'drop', g: 0.1 })
        return
      }
      // the glob: a wobbling blob outline
      g.beginPath()
      for (let n = 0; n <= 16; n++) { const t = (n / 16) * TAU, rr = r * (1 + 0.14 * Math.sin(t * 3 + frame * 0.35) + 0.08 * Math.sin(t * 5 - frame * 0.5)); g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) }
      g.closePath()
      const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.2)
      gr.addColorStop(0, '#c078e0'); gr.addColorStop(0.6, SLUDGE); gr.addColorStop(1, '#3e1654')
      g.fillStyle = gr; g.fill(); g.strokeStyle = '#2a0e3a'; g.lineWidth = 2; g.stroke()
      // toxic bubbles on its skin, popping and coming back
      for (let n = 0; n < 4; n++) {
        const p = (frame * 0.05 + n / 4) % 1, t = hash(s.id, n) * TAU
        g.fillStyle = hexA(SLIME, 0.9 * (1 - p)); g.beginPath(); g.arc(Math.cos(t) * r * 0.55, Math.sin(t) * r * 0.55, r * (0.12 + 0.18 * p), 0, TAU); g.fill()
      }
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(-r * 0.35, -r * 0.45, r * 0.3, r * 0.16, -0.5, 0, TAU); g.fill()
      g.restore()
      if (frame % 2 === 0) v.spawn({ x: s.x + rnd(-r, r) * 0.5, y: s.y + r * 0.6, vx: rnd(-0.3, 0.3), vy: 0.5, life: 18, color: frame % 4 ? SLUDGE : SLIME, r: rnd(2, 3.5), kind: 'drop', g: 0.12 })
      void el; void c
    },
    // the splat: a purple puddle with splash fingers flung out, bubbles popping, fading
    impact: (v, el, c, i) => {
      const { g, frame } = v
      const k = i.t / i.life, grow = Math.min(1, i.t / 5), fade = 1 - Math.max(0, k - 0.6) / 0.4
      const R = Math.min(i.r, 70) * 0.7 * grow
      g.save(); g.translate(i.x, i.y)
      g.fillStyle = hexA(SLUDGE, 0.8 * fade)
      g.beginPath()
      for (let n = 0; n <= 20; n++) { const t = (n / 20) * TAU, rr = R * (0.7 + 0.5 * hash(i.id, n % 20)); g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr * 0.6) }
      g.closePath(); g.fill()
      for (let n = 0; n < 7; n++) {
        const t = hash(i.id, n + 30) * TAU, d = R * (1.1 + 0.4 * hash(i.id, n + 40))
        g.beginPath(); g.ellipse(Math.cos(t) * d, Math.sin(t) * d * 0.6, 5 + 4 * hash(i.id, n), 3.5, t, 0, TAU); g.fill()
      }
      g.fillStyle = hexA(dark(SLUDGE, 0.4), 0.5 * fade); g.beginPath(); g.ellipse(0, 0, R * 0.5, R * 0.28, 0, 0, TAU); g.fill()
      for (let n = 0; n < 3; n++) {
        const p = (frame * 0.06 + n / 3) % 1, t = hash(i.id, n + 50) * TAU
        g.strokeStyle = hexA(SLIME, fade * (1 - p)); g.lineWidth = 2; g.beginPath(); g.arc(Math.cos(t) * R * 0.5, Math.sin(t) * R * 0.3, 2 + 5 * p, 0, TAU); g.stroke()
      }
      g.restore()
      if (i.t === 1) for (let n = 0; n < 12; n++) { const t = rnd(0, TAU), sp = rnd(2.5, 6); v.spawn({ x: i.x, y: i.y - 8, vx: Math.cos(t) * sp, vy: Math.sin(t) * sp * 0.6 - 3, life: rnd(18, 28), color: n % 3 ? SLUDGE : SLIME, r: rnd(2.5, 4.5), kind: 'drop', g: 0.25 }) }
      void el; void c
    },
    impactLife: 54,
  },

  grassknot: {
    // a root racing along just under the ground: a ridge of broken earth heaving up along its path, clods and cracks,
    // the green vine tip poking up at its head, dirt kicked up behind
    shot: (v, el, c, s) => {
      const { g, frame } = v
      const r = Math.max(9, s.r) * 1.35
      const cx = Math.cos(s.a), cy = Math.sin(s.a), nx = -cy, ny = cx
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round'
      // the ridge: a furrow of heaved earth trailing back from the head (drawn off the heading: a phasing shot's trail
      // can be sparse), dark and wide at the head, thinning behind, with clods heaved up along its crest
      const L = r * 7, N = 10
      for (let i = 0; i < N; i++) {
        const k0 = i / N, k1 = (i + 1) / N, w0 = Math.sin(k0 * 5 + s.id) * 2, w1 = Math.sin(k1 * 5 + s.id) * 2
        const x0 = s.x - cx * L * (1 - k0) + nx * w0, y0 = s.y - cy * L * (1 - k0) + ny * w0
        const x1 = s.x - cx * L * (1 - k1) + nx * w1, y1 = s.y - cy * L * (1 - k1) + ny * w1
        g.strokeStyle = `rgba(58,40,20,${0.15 + 0.55 * k1})`; g.lineWidth = r * (0.35 + 0.9 * k1)
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke()
        g.strokeStyle = `rgba(176,136,84,${0.2 + 0.6 * k1})`; g.lineWidth = 1 + r * 0.25 * k1
        g.beginPath(); g.moveTo(x0, y0 - r * 0.25 * k1); g.lineTo(x1, y1 - r * 0.25 * k1); g.stroke()
        if (i % 2 === 0) { g.fillStyle = i % 4 ? '#8a6a3a' : '#a8844c'; g.beginPath(); g.ellipse(x1 + nx * r * 0.35 * (hash(s.id, i) - 0.5) * 2, y1 - r * 0.2, 2 + 2.5 * k1, 1.5 + 1.8 * k1, 0, 0, TAU); g.fill() }
      }
      g.translate(s.x, s.y)
      // the mound at the head, broken clods on it
      g.fillStyle = '#5a4020'; g.beginPath(); g.ellipse(0, 2, r * 1.4, r * 0.75, s.a, 0, TAU); g.fill()
      g.fillStyle = '#7a5a30'; g.beginPath(); g.ellipse(0, 0, r * 0.9, r * 0.45, s.a, 0, TAU); g.fill()
      for (let i = 0; i < 5; i++) {
        const u = hash(s.id, i + Math.floor(frame / 4)) - 0.5, w = hash(s.id, i + 20) - 0.5
        g.fillStyle = i % 2 ? '#8a6a3a' : '#a8844c'
        g.beginPath(); g.ellipse(cx * u * r * 1.6 + nx * w * r, cy * u * r * 1.6 + ny * w * r * 0.6, 3.5, 2.5, u * 3, 0, TAU); g.fill()
      }
      // the vine tip, wriggling up out of the mound
      const sway = Math.sin(frame * 0.5 + s.id) * 5
      g.strokeStyle = '#1f4a1a'; g.lineWidth = 8
      const tip = (): void => { g.beginPath(); g.moveTo(-cx * 4, 0); g.quadraticCurveTo(sway, -r * 0.9, cx * 6 + sway * 0.6, -r * 1.7) }
      tip(); g.stroke(); g.strokeStyle = '#5dbb4f'; g.lineWidth = 4.5; tip(); g.stroke()
      g.fillStyle = '#7ed957'; g.beginPath(); g.ellipse(cx * 6 + sway * 0.6 + 4, -r * 1.2, 5, 2.5, -0.5, 0, TAU); g.fill()
      g.restore()
      if (frame % 2 === 0) v.spawn({ x: s.x - cx * r, y: s.y - cy * r, vx: -cx * 1.5 + rnd(-1, 1), vy: -rnd(1.5, 3), life: 18, color: frame % 4 ? '#8a6a3a' : '#5a4020', r: rnd(2, 3.5), kind: 'shard', g: 0.25 })
      void el; void c
    },
    // the snare: vines lashing up out of the ground under the foe, holding, then sinking back
    impact: (v, el, c, i) => {
      const k = i.t / i.life
      const up = Math.min(1, 0.3 + i.t / 5) * (1 - Math.max(0, k - 0.7) / 0.3)
      const { g } = v
      g.save(); g.fillStyle = `rgba(62,44,22,${0.45 * (1 - k)})`; g.beginPath(); g.ellipse(i.x, i.y + 6, 44, 20, 0, 0, TAU); g.fill(); g.restore()
      vines(v, i.x, i.y + 6, 56, i.id, up)
      if (i.t === 1) for (let n = 0; n < 10; n++) { const t = rnd(0, TAU); v.spawn({ x: i.x + Math.cos(t) * 20, y: i.y + 6 + Math.sin(t) * 10, vx: Math.cos(t) * 2.5, vy: -rnd(2, 4.5), life: 24, color: n % 2 ? '#8a6a3a' : '#5a4020', r: 3.5, kind: 'shard', g: 0.25 }) }
      void el; void c
    },
    impactLife: 40,
    // the telegraph: the ground bulging and cracking over the spot, vine tips poking up and wriggling; then the patch
    // of churned soil the vines lash out of (the vines are over the fighters: air)
    area: (v, el, c, a) => {
      const { g, frame } = v
      const { x, y, r } = a
      const landed = a.land <= 0
      const k = landed ? 1 : Math.max(0, Math.min(1, 1 - a.land / 18))
      g.save()
      g.fillStyle = `rgba(62,44,22,${(0.25 + 0.35 * k) * a.fade})`; g.beginPath(); g.ellipse(x, y, r * (0.5 + 0.5 * k), r * (0.4 + 0.4 * k), 0, 0, TAU); g.fill()
      g.strokeStyle = `rgba(40,26,12,${0.8 * a.fade})`; g.lineWidth = 2.5; g.lineJoin = 'round'
      for (let i = 0; i < 6; i++) {
        const t0 = (i / 6) * TAU + hash(a.id, i)
        g.beginPath(); g.moveTo(x, y)
        for (let j = 1; j <= 3; j++) { const rr = r * k * (j / 3) * 0.9, tt = t0 + (hash(a.id, i * 5 + j) - 0.5) * 0.6; g.lineTo(x + Math.cos(tt) * rr, y + Math.sin(tt) * rr * 0.8) }
        g.stroke()
      }
      if (!landed) {
        g.strokeStyle = hexA('#5dbb4f', 0.5 + 0.4 * Math.sin(frame * 0.5)); g.lineWidth = 3; g.setLineDash([10, 8]); g.lineDashOffset = -frame
        g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, TAU); g.stroke(); g.setLineDash([])
        // tips poking up, wriggling
        g.strokeStyle = '#4f9e3a'; g.lineWidth = 4; g.lineCap = 'round'
        for (let i = 0; i < 5; i++) {
          const t = hash(a.id, i + 20) * TAU, rr = r * 0.55 * hash(a.id, i + 30), bx = x + Math.cos(t) * rr, by = y + Math.sin(t) * rr * 0.8
          const h = 6 + 12 * k
          g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + Math.sin(frame * 0.4 + i) * 6, by - h * 0.6, bx + Math.sin(frame * 0.3 + i * 2) * 4, by - h); g.stroke()
        }
        if (frame % 3 === 0) v.spawn({ x: x + rnd(-r, r) * 0.6, y: y + rnd(-r, r) * 0.4, vx: rnd(-0.5, 0.5), vy: -rnd(0.5, 1.2), life: 20, color: '#8a6a3a', r: 3, kind: 'dot', g: 0.08 })
      }
      g.restore()
      void el; void c
    },
    // the vines: thick green whips lashing up out of the ground, swaying, curling over into a snare loop at the top,
    // leaves along them; they shoot up on landing and sink back as it fades
    air: (v, el, c, a) => {
      if (a.land > 0) return
      const { x, y, r } = a
      const since = -a.land
      const up = Math.min(1, 0.35 + since / 6) * a.fade
      if (up <= 0) return
      vines(v, x, y, r, a.id, up)
      if (since < 3) for (let n = 0; n < 4; n++) { const t = rnd(0, TAU); v.spawn({ x: x + Math.cos(t) * r * 0.4, y: y + Math.sin(t) * r * 0.3, vx: Math.cos(t) * 2, vy: -rnd(2, 4), life: 22, color: n % 2 ? '#8a6a3a' : '#5a4020', r: 3.5, kind: 'shard', g: 0.25 }) }
      void el; void c
    },
  },

  stoneedge: {
    // the telegraph: a crack opening in the ground with grit jumping off it; then the broken ground the spikes stand in
    area: (v, el, c, a) => {
      const { g, frame } = v
      const { x, y, r } = a
      const landed = a.land <= 0
      const k = landed ? 1 : Math.max(0, Math.min(1, 1 - a.land / 12))
      g.save()
      g.fillStyle = `rgba(0,0,0,${(0.1 + 0.2 * k) * a.fade})`; g.beginPath(); g.ellipse(x, y, r * (0.5 + 0.5 * k), r * (0.35 + 0.35 * k), 0, 0, TAU); g.fill()
      g.strokeStyle = `rgba(40,30,20,${0.85 * a.fade})`; g.lineWidth = 3; g.lineJoin = 'miter'
      for (let i = 0; i < 5; i++) {
        const t0 = (i / 5) * TAU + hash(a.id, i) * 1.2
        g.beginPath(); g.moveTo(x, y)
        for (let j = 1; j <= 3; j++) { const rr = r * k * (j / 3), tt = t0 + (hash(a.id, i * 7 + j) - 0.5) * 0.8; g.lineTo(x + Math.cos(tt) * rr, y + Math.sin(tt) * rr * 0.7) }
        g.stroke()
      }
      if (!landed) {
        g.strokeStyle = hexA('#c8a878', 0.5 + 0.4 * Math.sin(frame * 0.6)); g.lineWidth = 2.5; g.setLineDash([6, 6])
        g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0, 0, TAU); g.stroke()
        if (frame % 3 === 0) v.spawn({ x: x + rnd(-r, r) * 0.5, y: y + rnd(-r, r) * 0.3, vx: rnd(-0.6, 0.6), vy: -rnd(1, 2.5), life: 14, color: '#a89878', r: 2.5, kind: 'shard', g: 0.25 })
      }
      g.restore()
      void el; void c
    },
    // the spikes: a cluster of jagged stone blades bursting up (a tall one in the middle, shorter ones leaning out),
    // with a dust ring and flung rock; they crumble back into the ground as it fades
    air: (v, el, c, a) => {
      if (a.land > 0) return
      const { g } = v
      const { x, y, r } = a
      const since = -a.land
      const up = Math.min(1, 0.4 + since / 4), sink = a.fade
      const k = up * sink
      if (k <= 0) return
      g.save()
      if (since < 8) { g.strokeStyle = `rgba(200,184,156,${0.8 * (1 - since / 8)})`; g.lineWidth = 5; g.beginPath(); g.ellipse(x, y, r * (0.6 + since / 10), r * (0.4 + since / 14), 0, 0, TAU); g.stroke() }
      const blades = [[-0.55, 0.55, -0.35], [0.5, 0.6, 0.3], [0, 1, 0.05], [-0.15, 0.45, -0.1]]
      // back to front: the tall middle blade over the side ones
      for (const [n, [ox, hk, tilt]] of blades.entries()) {
        g.save(); g.translate(x + ox * r, y + (n === 3 ? r * 0.25 : 0))
        g.rotate(tilt)
        spike(g, r * 2.1 * hk * k, r * (0.28 + 0.1 * hk), a.id * 5 + n, up)
        g.restore()
      }
      g.restore()
      if (since < 2) for (let n = 0; n < 8; n++) { const t = rnd(0, TAU); v.spawn({ x: x + rnd(-r, r) * 0.4, y: y - rnd(0, r), vx: Math.cos(t) * rnd(2, 5), vy: -rnd(3, 6), life: 28, color: ['#b8a88c', '#6e604c', '#d8ccb0'][n % 3], r: rnd(3, 6), kind: 'shard', g: 0.3 }) }
      void el; void c
    },
  },
}
