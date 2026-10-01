// Signature-move looks: shadow and dragon (docs/VFX.md "Signature moves"; the sim side is src/sim/signatures.ts).
import { TAU, glowDot, hash, hexA, rnd } from '../vfxkit'
import type { SigDraw } from './types'

const INK = '#150820', UMBRA = '#2e1248', VIOLET = '#8a3aff', LILAC = '#c89aff'
const DRAGON = { deep: '#2a1f8a', violet: '#6a5aff', teal: '#3ae0d0', pale: '#d8fbff' }
const MOLTEN = ['#fff2b0', '#ffb340', '#ff6a1e', '#b02a10']

/** a wavy smoke tendril out along +x: length L, half-width w, curling by `curl` */
function tendril(g: CanvasRenderingContext2D, L: number, w: number, curl: number): void {
  g.beginPath(); g.moveTo(0, -w)
  g.bezierCurveTo(L * 0.4, -w + curl, L * 0.7, curl * 1.6, L, curl * 2.2)
  g.bezierCurveTo(L * 0.7, curl * 1.6 + w * 0.4, L * 0.4, w + curl, 0, w)
  g.closePath()
}

export const SHADOW: Record<string, SigDraw> = {
  shadowball: {
    // a roiling ball of shadow: an inky core with violet whorls turning inside it, wrapped in a corona of smoke
    // tendrils that curl round it, a sickly violet rim light
    shot: (v, _el, _c, s) => {
      const { g, frame } = v
      const r = Math.max(9, s.r) * 1.75 * (s.kid ? 0.5 : 1)
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(s.x, s.y + r * 1.2, r, r * 0.38, 0, 0, TAU); g.fill()
      g.save(); g.translate(s.x, s.y)
      g.globalCompositeOperation = 'lighter'
      glowDot(g, 0, 0, r * 2.3, VIOLET, 0.35)
      g.globalCompositeOperation = 'source-over'
      // the corona: tendrils swirling round, trailing a little behind the heading
      const spin = frame * 0.09 + s.id
      for (let i = 0; i < 8; i++) {
        const an = spin + (i * TAU) / 8
        g.save(); g.rotate(an); g.translate(r * 0.7, 0); g.rotate(1.2)
        tendril(g, r * (1.3 + 0.4 * Math.sin(frame * 0.3 + i * 1.7)), r * 0.34, r * 0.3 * Math.sin(frame * 0.2 + i))
        g.fillStyle = hexA(i % 2 ? UMBRA : '#4a1c70', 0.85); g.fill()
        g.strokeStyle = hexA(VIOLET, 0.5); g.lineWidth = 1.2; g.stroke()
        g.restore()
      }
      // the body
      const gr = g.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r)
      gr.addColorStop(0, '#05010a'); gr.addColorStop(0.55, INK); gr.addColorStop(0.85, '#3a1660'); gr.addColorStop(1, '#7a3ad0')
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill()
      // whorls inside, turning the other way
      g.rotate(-frame * 0.16); g.lineCap = 'round'
      for (let k = 0; k < 3; k++) {
        g.rotate(TAU / 3); g.beginPath()
        for (let j = 0; j <= 10; j++) { const t = j / 10, rr = r * (0.15 + 0.7 * t), a = t * 2.6; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) }
        g.strokeStyle = hexA(k === 0 ? LILAC : VIOLET, 0.65); g.lineWidth = Math.max(1.5, r * 0.12); g.stroke()
      }
      g.restore()
      g.save(); g.globalCompositeOperation = 'lighter'
      g.strokeStyle = hexA(LILAC, 0.55); g.lineWidth = 2; g.beginPath(); g.arc(s.x, s.y, r * 1.02, -2.6, -1.1); g.stroke()
      g.restore()
      if (frame % 2 === 0) v.spawn({ x: s.x - Math.cos(s.a) * r + rnd(-r, r) * 0.4, y: s.y - Math.sin(s.a) * r + rnd(-r, r) * 0.4, vx: -Math.cos(s.a) * 0.8 + rnd(-0.4, 0.4), vy: -Math.sin(s.a) * 0.8 + rnd(-0.5, 0.1), life: rnd(22, 34), color: frame % 4 ? '#2a1840' : '#5a2a90', r: r * 0.45, kind: 'smoke', g: -0.01 })
    },
    // it bursts in a dark splash: an ink blot thrown out in spikes and droplets, rimmed violet, drying up
    impact: (v, _el, _c, i) => {
      const { g } = v
      const k = 1 - Math.pow(1 - Math.min(1, i.t / 6), 2), fade = i.t < i.life * 0.45 ? 1 : 1 - (i.t - i.life * 0.45) / (i.life * 0.55)
      const R = Math.max(48, i.r) * 0.95
      g.save(); g.translate(i.x, i.y)
      g.globalCompositeOperation = 'lighter'
      glowDot(g, 0, 0, R * 1.3 * k, VIOLET, 0.35 * fade)
      g.globalCompositeOperation = 'source-over'
      const N = 16
      g.beginPath()
      for (let n = 0; n <= N * 2; n++) {
        const a = (n / (N * 2)) * TAU, spike = n % 2 === 0
        const rr = R * k * (spike ? 0.8 + 0.5 * hash(i.id, n) : 0.45 + 0.15 * hash(i.id, n + 50))
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8)
      }
      g.closePath()
      g.fillStyle = hexA(INK, 0.85 * fade); g.fill()
      g.strokeStyle = hexA(VIOLET, 0.8 * fade); g.lineWidth = 2.5; g.stroke()
      // droplets flung past the spikes
      for (let n = 0; n < N; n++) {
        const a = ((n * 2) / (N * 2)) * TAU, rr = R * k * (1.1 + 0.5 * hash(i.id, n)) * (0.9 + 0.3 * (i.t / i.life))
        g.fillStyle = hexA(n % 3 ? UMBRA : LILAC, 0.9 * fade)
        g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.8, 2.5 + 3 * hash(i.id, n + 7), 0, TAU); g.fill()
      }
      g.fillStyle = hexA('#05010a', 0.9 * fade); g.beginPath(); g.arc(0, 0, R * 0.35 * k, 0, TAU); g.fill()
      g.restore()
      if (i.t === 1) for (let n = 0; n < 14; n++) { const a = rnd(0, TAU), sp = rnd(2, 6); v.spawn({ x: i.x, y: i.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8 - 1, life: rnd(22, 36), color: n % 3 ? '#2a1840' : '#8a4ad0', r: n % 2 ? rnd(6, 12) : rnd(2.5, 4), kind: n % 2 ? 'smoke' : 'drop', g: n % 2 ? -0.01 : 0.12 }) }
    },
    impactLife: 30,
  },

  darkpulse: {
    // a wall of dark rings rolling forward: thick black-violet wavefronts, one behind the other, each with a
    // magenta edge, and a dark pulse at the front that swallows the light
    shot: (v, _el, _c, s) => {
      const { g, frame } = v
      const W = Math.max(20, s.wall), D = Math.max(9, s.r)
      g.save(); g.translate(s.x, s.y); g.rotate(s.a); g.lineCap = 'round'
      const R = W * 1.35, span = Math.asin(Math.min(1, (W * 1.15) / R))
      for (let k = 0; k < 5; k++) {
        const p = (frame * 0.07 + k / 5) % 1
        const back = -p * D * 5
        const al = 1 - p
        g.beginPath(); g.arc(back - R + D, 0, R, -span, span)
        g.strokeStyle = `rgba(16,6,26,${0.85 * al})`; g.lineWidth = 13 - p * 6; g.stroke()
        g.strokeStyle = hexA(k % 2 ? '#d040ff' : VIOLET, 0.95 * al); g.lineWidth = 2.5; g.stroke()
      }
      // the front: a crescent of darkness with a violet shimmer
      g.beginPath(); g.arc(D - R, 0, R, -span, span); g.arc(D - R - D * 1.2, 0, R, span, -span, true); g.closePath()
      g.fillStyle = hexA(INK, 0.8); g.fill()
      g.globalCompositeOperation = 'lighter'
      g.beginPath(); g.arc(D - R + 2, 0, R, -span, span); g.strokeStyle = hexA(LILAC, 0.6 + 0.3 * Math.sin(frame * 0.5)); g.lineWidth = 2.5; g.stroke()
      g.restore()
      if (frame % 2 === 0) {
        const t = rnd(-1, 1), cx = Math.cos(s.a), cy = Math.sin(s.a)
        v.spawn({ x: s.x - cy * t * W, y: s.y + cx * t * W, vx: -cx * 0.8, vy: -cy * 0.8 - 0.3, life: 26, color: '#2a1840', r: 8, kind: 'smoke', g: -0.01 })
      }
    },
    // where it rolls through: two dark rings spreading out, a violet sting at the centre
    impact: (v, _el, _c, i) => {
      const { g } = v
      const p = i.t / i.life
      g.save(); g.translate(i.x, i.y); g.lineCap = 'round'
      for (const lag of [0, 0.25]) {
        const q = Math.max(0, Math.min(1, (p - lag) / (1 - lag))), R = 14 + 56 * q
        if (q <= 0) continue
        g.beginPath(); g.arc(0, 0, R, 0, TAU)
        g.strokeStyle = `rgba(16,6,26,${0.8 * (1 - q)})`; g.lineWidth = 9 * (1 - q) + 2; g.stroke()
        g.strokeStyle = hexA('#d040ff', 0.9 * (1 - q)); g.lineWidth = 2; g.stroke()
      }
      g.globalCompositeOperation = 'lighter'; glowDot(g, 0, 0, 26 * (1 - p), VIOLET, 0.7)
      g.restore()
    },
    impactLife: 20,
  },

  tickingcurse: {
    // a cursed timer drifting (half there) through walls: a dark clock face ringed in violet with a ghost-fire
    // crown, its hand whirling, leaving fading afterimages
    shot: (v, _el, _c, s) => {
      const { g, frame } = v
      const r = Math.max(9, s.r) * 1.8 * (s.kid ? 0.55 : 1)
      const t = s.trail
      g.save()
      for (let i = 0; i < t.length; i += 3) { const k = i / t.length; g.strokeStyle = hexA(VIOLET, 0.3 * k); g.lineWidth = 2; g.beginPath(); g.arc(t[i].x, t[i].y, r * (0.5 + 0.5 * k), 0, TAU); g.stroke() }
      g.globalAlpha = 0.72 + 0.2 * Math.sin(frame * 0.45 + s.id)
      clock(g, s.x, s.y + Math.sin(frame * 0.15 + s.id) * 2, r, frame * 0.35 + s.id, -1, frame)
      g.restore()
      if (frame % 3 === 0) v.spawn({ x: s.x + rnd(-r, r) * 0.6, y: s.y - r, vx: rnd(-0.3, 0.3), vy: rnd(-1.2, -0.5), life: 20, color: frame % 2 ? '#8a5aff' : '#c89aff', r: 2.5, kind: 'ember', g: -0.03 })
    },
    // stuck: a ring of curse on the ground (the blast), its dashes spinning faster and redder as the fuse runs down;
    // then the curse blows: a violet-black shock racing out to the ring
    area: (v, _el, _c, a) => {
      const { g, frame } = v
      const { x, y, r } = a
      if (a.land > 0) {
        const u = a.fuse > 0 ? 1 - a.land / a.fuse : 0
        g.save()
        g.fillStyle = `rgba(20,6,30,${0.12 + 0.25 * u})`; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill()
        g.strokeStyle = hexA(u > 0.66 ? '#ff3a6a' : VIOLET, 0.55 + 0.4 * Math.abs(Math.sin(frame * (0.2 + u * 0.6))))
        g.lineWidth = 3; g.setLineDash([10, 8]); g.lineDashOffset = -frame * (1 + u * 4)
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke()
        g.setLineDash([]); g.strokeStyle = hexA(VIOLET, 0.35); g.lineWidth = 1.5
        g.beginPath(); g.arc(x, y, r * (1 - u) + 12 * u, 0, TAU); g.stroke()
        g.restore()
        return
      }
      const since = -a.land, k = Math.min(1, since / 6), fade = a.fade
      g.save(); g.translate(x, y)
      g.globalCompositeOperation = 'lighter'
      glowDot(g, 0, 0, r * (0.6 + 0.6 * k), '#b040ff', 0.7 * fade * (1 - k * 0.5))
      g.globalCompositeOperation = 'source-over'
      g.strokeStyle = `rgba(16,6,26,${0.85 * fade})`; g.lineWidth = 12 * (1 - k) + 3; g.beginPath(); g.arc(0, 0, r * k, 0, TAU); g.stroke()
      g.strokeStyle = hexA('#ff3a8a', 0.9 * fade); g.lineWidth = 3; g.stroke()
      // the clock's twelve tick marks flung outward
      for (let n = 0; n < 12; n++) { const an = (n * TAU) / 12; g.strokeStyle = hexA(LILAC, 0.9 * fade); g.lineWidth = 3; g.beginPath(); g.moveTo(Math.cos(an) * r * k * 0.7, Math.sin(an) * r * k * 0.7); g.lineTo(Math.cos(an) * r * k * 0.9, Math.sin(an) * r * k * 0.9); g.stroke() }
      g.restore()
      if (since < 1) for (let n = 0; n < 8; n++) { const an = rnd(0, TAU), sp = rnd(3, 6); v.spawn({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: rnd(20, 30), color: n % 2 ? '#2a1840' : '#c070ff', r: n % 2 ? 10 : 3, kind: n % 2 ? 'smoke' : 'ember', g: -0.01 }) }
    },
    // the stuck timer itself, over the fighters so it reads: a bigger clock, the time left as a shrinking red wedge,
    // the hand ticking round in jumps, a countdown numeral over it, shaking as it runs out
    air: (v, _el, _c, a) => {
      const { g, frame } = v
      if (a.land <= 0) return
      const fuse = Math.max(1, a.fuse), u = 1 - a.land / fuse
      const shake = u > 0.6 ? (u - 0.6) * 8 : 0
      const x = a.x + rnd(-1, 1) * shake, y = a.y - 6 + rnd(-1, 1) * shake
      const R = 24 + 3 * Math.abs(Math.sin(a.land * Math.PI / 6))
      // the hand jumps back a notch every tick of the fuse, eating the wedge
      const left = a.land / fuse, notch = Math.ceil(left * 12) / 12
      g.save()
      clock(g, x, y, R, notch * TAU, notch, frame)
      const n = Math.max(1, Math.ceil(a.land / (fuse / 3)))
      g.font = '900 28px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,2,16,0.9)'; g.strokeText(String(n), x, y - R - 26)
      g.fillStyle = n === 1 ? '#ff4a7a' : LILAC; g.fillText(String(n), x, y - R - 26)
      g.restore()
    },
    // the timer sticks: a curse seal clamps down on the spot (a violet ring snapping shut, rune ticks)
    impact: (v, _el, _c, i) => {
      const { g } = v
      const p = i.t / i.life, R = 40 * (1 - p * 0.6)
      g.save(); g.translate(i.x, i.y); g.globalCompositeOperation = 'lighter'
      g.strokeStyle = hexA(VIOLET, 0.9 * (1 - p)); g.lineWidth = 3
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke()
      for (let n = 0; n < 6; n++) { const an = (n * TAU) / 6 + p * 2; g.beginPath(); g.moveTo(Math.cos(an) * R, Math.sin(an) * R); g.lineTo(Math.cos(an) * (R + 10), Math.sin(an) * (R + 10)); g.stroke() }
      g.restore()
    },
    impactLife: 14,
  },

  dragonpulse: {
    // twin serpents of dragon energy coiling round and round a thick indigo beam, braiding under and over it, and
    // meeting at the tip in a dragon's head with open jaws and swept horns
    beam: (v, _el, _c, b) => {
      const { g, frame } = v
      const L = Math.hypot(b.x2 - b.x1, b.y2 - b.y1), a = Math.atan2(b.y2 - b.y1, b.x2 - b.x1)
      const life = Math.min(1, b.t / 4), w = b.w * (0.85 + 0.15 * life)
      g.save(); g.translate(b.x1, b.y1); g.rotate(a); g.lineCap = 'round'; g.lineJoin = 'round'
      g.strokeStyle = hexA(DRAGON.violet, 0.25 * life); g.lineWidth = w * 1.9; g.beginPath(); g.moveTo(0, 0); g.lineTo(L - w * 0.5, 0); g.stroke()
      const gr = g.createLinearGradient(0, -w / 2, 0, w / 2)
      gr.addColorStop(0, hexA(DRAGON.deep, 0.85 * life)); gr.addColorStop(0.5, hexA(DRAGON.violet, 0.95 * life)); gr.addColorStop(1, hexA(DRAGON.deep, 0.85 * life))
      g.fillStyle = gr; g.fillRect(0, -w * 0.5, L - w * 0.5, w)
      // a serpent: a sine ribbon, dark outline under a bright body; `front` draws only the half in front of the beam
      const N = Math.max(16, Math.round(L / 10)), lam = 260
      const serpent = (ph: number, col: string, front: boolean) => {
        let open = false
        g.beginPath()
        for (let i = 0; i <= N; i++) {
          const x = (i / N) * (L - w * 0.3), th = (x / lam) * TAU - frame * 0.28 + ph
          const ramp = Math.min(1, x / 60) * (1 - Math.max(0, (x - (L - w * 1.6)) / (w * 1.3)) * 0.8)
          const inFront = Math.cos(th) > 0
          if (inFront !== front) { open = false; continue }
          const y = Math.sin(th) * w * 1.0 * ramp
          if (!open) { g.moveTo(x, y); open = true } else g.lineTo(x, y)
        }
        g.strokeStyle = hexA('#0c0830', (front ? 0.8 : 0.5) * life); g.lineWidth = w * 0.56; g.stroke()
        g.strokeStyle = hexA(col, (front ? 1 : 0.6) * life); g.lineWidth = w * 0.4; g.stroke()
        // a spine of scales down its back
        g.strokeStyle = hexA(DRAGON.pale, (front ? 0.85 : 0.35) * life); g.lineWidth = w * 0.1; g.setLineDash([5, 6]); g.lineDashOffset = frame * 2; g.stroke(); g.setLineDash([])
      }
      serpent(0, DRAGON.teal, false); serpent(Math.PI, '#b06aff', false)
      g.strokeStyle = hexA(DRAGON.pale, 0.9 * life); g.lineWidth = Math.max(3, w * 0.2); g.beginPath(); g.moveTo(0, 0); g.lineTo(L - w * 0.5, 0); g.stroke()
      serpent(0, DRAGON.teal, true); serpent(Math.PI, '#b06aff', true)
      // the head at the tip
      g.translate(L - w * 0.3, 0)
      const S = w * 0.95, bite = 0.3 + 0.15 * Math.sin(frame * 0.4)
      glowDot(g, S * 0.3, 0, S * 2.2, DRAGON.violet, 0.5 * life)
      g.fillStyle = hexA(DRAGON.violet, 0.95 * life); g.strokeStyle = hexA(DRAGON.pale, 0.9 * life); g.lineWidth = 2
      // horns swept back
      for (const side of [-1, 1]) { g.beginPath(); g.moveTo(-S * 0.2, side * S * 0.35); g.quadraticCurveTo(-S * 0.9, side * S * 0.9, -S * 1.6, side * S * 1.05); g.quadraticCurveTo(-S * 0.8, side * S * 0.55, -S * 0.5, side * S * 0.1); g.closePath(); g.fillStyle = hexA(DRAGON.teal, 0.9 * life); g.fill(); g.stroke() }
      // upper and lower jaw, parted
      for (const side of [-1, 1]) {
        g.save(); g.rotate(side * bite)
        g.beginPath(); g.moveTo(-S * 0.5, 0); g.lineTo(-S * 0.3, side * S * 0.55); g.quadraticCurveTo(S * 0.6, side * S * 0.5, S * 1.25, side * S * 0.08); g.lineTo(S * 0.2, side * S * 0.12); g.closePath()
        g.fillStyle = hexA(side < 0 ? DRAGON.violet : DRAGON.deep, 0.95 * life); g.fill(); g.stroke()
        g.restore()
      }
      g.fillStyle = hexA('#ffffff', life); g.beginPath(); g.ellipse(-S * 0.05, -S * 0.36, S * 0.16, S * 0.06, -0.3, 0, TAU); g.fill()
      g.globalCompositeOperation = 'lighter'; glowDot(g, S * 0.6, 0, S * 0.7, DRAGON.pale, 0.8 * life)
      g.restore()
      if (frame % 2 === 0) v.spawn({ x: b.x2 + rnd(-8, 8), y: b.y2 + rnd(-8, 8), vx: Math.cos(a) * 2 + rnd(-1.5, 1.5), vy: Math.sin(a) * 2 + rnd(-1.5, 1.5), life: 18, color: frame % 4 ? DRAGON.teal : '#b06aff', r: 3, kind: 'spark', g: 0 })
    },
    // the serpents strike: a flare of teal and violet claws raking out from the point
    impact: (v, _el, _c, i) => {
      const { g } = v
      const k = Math.min(1, i.t / 4), fade = 1 - i.t / i.life
      g.save(); g.translate(i.x, i.y); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'
      glowDot(g, 0, 0, 50 * k, DRAGON.violet, 0.6 * fade)
      for (let n = 0; n < 3; n++) {
        const off = (n - 1) * 14
        g.strokeStyle = hexA(n === 1 ? DRAGON.pale : DRAGON.teal, 0.9 * fade); g.lineWidth = 4
        g.beginPath(); g.moveTo(-34 * k + off * 0.5, -30 * k + off); g.quadraticCurveTo(off * 0.3, off, 34 * k + off * 0.5, 30 * k + off); g.stroke()
      }
      g.restore()
    },
    impactLife: 18,
  },

  dracometeor: {
    // where a meteor will fall: a darkening shadow under a spinning ring of dragon runes and a closing crosshair;
    // once it lands, a scorched crater with molten cracks that cool
    area: (v, _el, _c, a) => {
      const { g, frame } = v
      const { x, y, r } = a
      g.save(); g.translate(x, y)
      if (a.land > 0) {
        const k = Math.max(0, Math.min(1, 1 - a.land / 30))
        g.fillStyle = `rgba(20,6,10,${0.1 + 0.3 * k})`; g.beginPath(); g.ellipse(0, 0, r * (0.3 + 0.7 * k), r * (0.3 + 0.7 * k) * 0.8, 0, 0, TAU); g.fill()
        g.rotate(frame * 0.05)
        g.strokeStyle = hexA('#ff8a3a', 0.55 + 0.4 * Math.sin(frame * 0.5)); g.lineWidth = 3; g.setLineDash([14, 9])
        g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); g.setLineDash([])
        g.strokeStyle = hexA(DRAGON.violet, 0.7); g.lineWidth = 2
        g.beginPath(); g.arc(0, 0, r * 0.82, 0, TAU); g.stroke()
        for (let n = 0; n < 4; n++) { const an = (n * TAU) / 4, rr = r * (1.1 - 0.5 * k); g.beginPath(); g.moveTo(Math.cos(an) * rr, Math.sin(an) * rr); g.lineTo(Math.cos(an) * (rr - 14), Math.sin(an) * (rr - 14)); g.strokeStyle = hexA('#ffd24a', 0.9); g.lineWidth = 3; g.stroke() }
        g.restore()
        return
      }
      const since = -a.land, heat = Math.max(0, 1 - since / 40), fade = a.fade
      g.fillStyle = `rgba(30,14,10,${0.55 * fade})`; g.beginPath(); g.ellipse(0, 0, r * 0.85, r * 0.68, 0, 0, TAU); g.fill()
      g.strokeStyle = `rgba(70,40,24,${0.7 * fade})`; g.lineWidth = 4; g.stroke()
      g.lineJoin = 'round'
      for (let n = 0; n < 7; n++) {
        const t0 = (n / 7) * TAU + hash(a.id, n) * 0.7
        g.beginPath(); g.moveTo(0, 0)
        for (let j = 1; j <= 3; j++) { const rr = r * 0.8 * (j / 3), tt = t0 + (hash(a.id, n * 5 + j) - 0.5) * 0.6; g.lineTo(Math.cos(tt) * rr, Math.sin(tt) * rr * 0.8) }
        g.strokeStyle = hexA(heat > 0.5 ? MOLTEN[1] : MOLTEN[2], (0.3 + 0.7 * heat) * fade); g.lineWidth = 2.5; g.stroke()
      }
      g.globalCompositeOperation = 'lighter'; glowDot(g, 0, 0, r * 0.6, '#ff6a1e', 0.5 * heat * fade)
      g.restore()
      if (frame % 4 === 0 && since < 30) v.spawn({ x: x + rnd(-r, r) * 0.5, y: y + rnd(-r, r) * 0.3, vx: rnd(-0.3, 0.3), vy: rnd(-1, -0.4), life: 30, color: '#4a3a34', r: 10, kind: 'smoke', g: -0.01 })
    },
    // the meteor itself, streaking down out of the sky at a slant: a molten rock in a violet dragon aura, dragging a
    // long tail of fire; a white-hot flash as it strikes
    air: (v, _el, _c, a) => {
      const { g, frame } = v
      if (a.land <= 0) {
        const since = -a.land
        if (since < 8) { g.save(); g.globalCompositeOperation = 'lighter'; glowDot(g, a.x, a.y - 10, a.r * 1.4, '#fff2b0', 0.9 * (1 - since / 8)); g.restore() }
        return
      }
      const T = 26
      if (a.land > T) return
      const k = 1 - a.land / T, e = k * k
      const side = hash(a.id, 1) < 0.5 ? -1 : 1
      const dx = side * (160 + 80 * hash(a.id, 2)), dy = -420
      const mx = a.x + dx * (1 - e), my = a.y + dy * (1 - e)
      const L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L
      const R = a.r * 0.42
      g.save(); g.lineCap = 'round'
      const tail = 190
      // the violet dragon aura round the tail, then the fire tail itself
      const tg = g.createLinearGradient(mx, my, mx + ux * tail, my + uy * tail)
      tg.addColorStop(0, hexA(DRAGON.violet, 0.55)); tg.addColorStop(1, hexA(DRAGON.violet, 0))
      g.strokeStyle = tg; g.lineWidth = R * 2.6; g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + ux * tail, my + uy * tail); g.stroke()
      const fg = g.createLinearGradient(mx, my, mx + ux * tail * 0.8, my + uy * tail * 0.8)
      fg.addColorStop(0, hexA(MOLTEN[1], 0.95)); fg.addColorStop(0.35, hexA(MOLTEN[2], 0.8)); fg.addColorStop(1, hexA(MOLTEN[3], 0))
      g.strokeStyle = fg; g.lineWidth = R * 1.7; g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + ux * tail * 0.8, my + uy * tail * 0.8); g.stroke()
      g.strokeStyle = hexA(MOLTEN[0], 0.9); g.lineWidth = R * 0.6; g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + ux * tail * 0.3, my + uy * tail * 0.3); g.stroke()
      glowDot(g, mx, my, R * 2.2, '#ff8a3a', 0.5)
      g.translate(mx, my); g.rotate(frame * 0.12 + a.id)
      g.beginPath(); for (let i = 0; i < 8; i++) { const t = (i / 8) * TAU, rr = R * (0.8 + 0.35 * hash(a.id, i)); g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) } g.closePath()
      const rg = g.createRadialGradient(-R * 0.3, -R * 0.3, 0, 0, 0, R * 1.1)
      rg.addColorStop(0, '#8a5a44'); rg.addColorStop(0.6, '#4a2a22'); rg.addColorStop(1, '#2a1410')
      g.fillStyle = rg; g.fill(); g.strokeStyle = hexA(MOLTEN[1], 0.95); g.lineWidth = 2.5; g.stroke()
      // molten cracks across the rock
      g.strokeStyle = hexA(MOLTEN[0], 0.95); g.lineWidth = 2; g.lineJoin = 'round'
      g.beginPath(); for (let n = 0; n < 3; n++) { const t = hash(a.id, n + 20) * TAU; g.moveTo(0, 0); g.lineTo(Math.cos(t) * R * 0.5, Math.sin(t) * R * 0.5); g.lineTo(Math.cos(t + 0.4) * R * 0.85, Math.sin(t + 0.4) * R * 0.85) } g.stroke()
      g.restore()
      if (frame % 2 === 0) v.spawn({ x: mx + ux * R, y: my + uy * R, vx: ux * 1.5 + rnd(-0.8, 0.8), vy: uy * 1.5 + rnd(-0.8, 0.8), life: 18, color: frame % 4 ? MOLTEN[1] : '#b06aff', r: 3, kind: 'ember', g: 0.02 })
    },
    // the strike: a shock ring and a spray of rock and embers
    impact: (v, _el, _c, i) => {
      const { g } = v
      const p = i.t / i.life
      g.save(); g.translate(i.x, i.y); g.scale(1, 0.8)
      g.strokeStyle = hexA('#ffd24a', 0.9 * (1 - p)); g.lineWidth = 6 * (1 - p) + 1.5
      g.beginPath(); g.arc(0, 0, 20 + 60 * p, 0, TAU); g.stroke()
      g.strokeStyle = hexA(DRAGON.violet, 0.7 * (1 - p)); g.lineWidth = 3
      g.beginPath(); g.arc(0, 0, 10 + 45 * p, 0, TAU); g.stroke()
      g.restore()
      if (i.t === 1) for (let n = 0; n < 12; n++) { const an = rnd(0, TAU), sp = rnd(2, 5); v.spawn({ x: i.x, y: i.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 2, life: rnd(20, 30), color: n % 3 === 0 ? MOLTEN[1] : ['#9a8a74', '#6a5a48'][n % 2], r: rnd(3, 5), kind: n % 3 === 0 ? 'ember' : 'shard', g: 0.25 }) }
    },
    impactLife: 18,
  },
}

/** a clock face at (x, y), radius R: a dark disc with a violet rim, twelve ticks, a ghost-fire crown and one hand at
 * angle `hand` (0 = twelve); `left` in 0..1 fills the time left as a red wedge (-1: none) */
function clock(g: CanvasRenderingContext2D, x: number, y: number, R: number, hand: number, left: number, frame: number): void {
  g.save(); g.translate(x, y)
  const prev = g.globalCompositeOperation
  g.globalCompositeOperation = 'lighter'
  glowDot(g, 0, 0, R * 2, VIOLET, 0.45)
  // the crown: three little violet flames on top
  for (let n = -1; n <= 1; n++) {
    g.save(); g.translate(n * R * 0.45, -R * 0.8); g.rotate(-Math.PI / 2 + n * 0.35)
    const h = R * (0.8 + 0.25 * Math.sin(frame * 0.5 + n * 2))
    g.beginPath(); g.moveTo(0, -R * 0.2); g.quadraticCurveTo(h * 0.6, -R * 0.2, h, Math.sin(frame * 0.4 + n) * 2); g.quadraticCurveTo(h * 0.6, R * 0.2, 0, R * 0.2); g.closePath()
    g.fillStyle = hexA('#9a5aff', 0.85); g.fill()
    g.restore()
  }
  g.globalCompositeOperation = prev
  g.fillStyle = '#1a0f28'; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill()
  g.fillStyle = '#e8dcff'; g.beginPath(); g.arc(0, 0, R * 0.78, 0, TAU); g.fill()
  if (left >= 0) {
    g.fillStyle = hexA(left < 0.34 ? '#ff2a5a' : '#c04ad0', 0.8)
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R * 0.78, -Math.PI / 2, -Math.PI / 2 + left * TAU); g.closePath(); g.fill()
  }
  g.strokeStyle = '#2a1840'; g.lineWidth = Math.max(1.2, R * 0.08)
  g.beginPath(); for (let n = 0; n < 12; n++) { const an = (n * TAU) / 12, r0 = n % 3 === 0 ? 0.52 : 0.62; g.moveTo(Math.cos(an) * R * r0, Math.sin(an) * R * r0); g.lineTo(Math.cos(an) * R * 0.74, Math.sin(an) * R * 0.74) } g.stroke()
  g.strokeStyle = hexA(VIOLET, 0.95); g.lineWidth = Math.max(2, R * 0.14); g.beginPath(); g.arc(0, 0, R * 0.93, 0, TAU); g.stroke()
  g.rotate(hand); g.strokeStyle = '#150820'; g.lineWidth = Math.max(2, R * 0.12); g.lineCap = 'round'
  g.beginPath(); g.moveTo(0, R * 0.12); g.lineTo(0, -R * 0.66); g.stroke()
  g.fillStyle = '#ff3a6a'; g.beginPath(); g.arc(0, 0, R * 0.12, 0, TAU); g.fill()
  // two ghostly eyes glaring out of the face
  g.rotate(-hand)
  g.fillStyle = hexA('#150820', 0.7); g.beginPath(); g.ellipse(-R * 0.3, R * 0.28, R * 0.1, R * 0.14, 0, 0, TAU); g.ellipse(R * 0.3, R * 0.28, R * 0.1, R * 0.14, 0, 0, TAU); g.fill()
  g.restore()
}
