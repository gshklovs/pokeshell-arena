// Signature-move looks: water and ice (docs/VFX.md "Signature moves"; the sim side is src/sim/signatures.ts).
// Water reads as translucent blue with white rims and droplets; ice as pale cyan and white, faceted, with hard dark-blue
// edges. Every look has its own silhouette: a braid of bubble clusters, a crystal-crusted beam, a rainbow ribbon, a
// six-point ice star, icicles, hailstones, a crab's pincer, four-bladed water stars.
import { TAU, dark, glowDot, hash, hexA, light, rnd, star } from '../vfxkit'
import type { SigDraw } from './types'

const SEA = '#3f8fe0'
const ICE = '#9fe4ff', ICE_EDGE = '#2f6fb0'
const water = (el: string, c: string) => (el === 'Water' || el === 'Colorless' ? SEA : c)

/** a small ground shadow under a shot */
function shadow(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.ellipse(x, y + r * 1.2, r * 0.85, r * 0.3, 0, 0, TAU); g.fill()
}

/** a six-armed snowflake of radius R at the origin (arms with two side ticks), stroked */
function snowflake(g: CanvasRenderingContext2D, R: number): void {
  g.beginPath()
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * TAU, cx = Math.cos(t), cy = Math.sin(t)
    g.moveTo(0, 0); g.lineTo(cx * R, cy * R)
    for (const k of [0.45, 0.72]) {
      const bx = cx * R * k, by = cy * R * k, l = R * (k < 0.5 ? 0.3 : 0.2)
      for (const s of [-1, 1]) { const tt = t + s * 0.8; g.moveTo(bx, by); g.lineTo(bx + Math.cos(tt) * l, by + Math.sin(tt) * l) }
    }
  }
}

/** an ice prism: a long faceted crystal of length L and width w from the origin along +x, filled pale with a white facet */
function prism(g: CanvasRenderingContext2D, L: number, w: number, a = 1): void {
  g.beginPath(); g.moveTo(0, -w / 2); g.lineTo(L * 0.72, -w / 2); g.lineTo(L, 0); g.lineTo(L * 0.72, w / 2); g.lineTo(0, w / 2); g.closePath()
  const gr = g.createLinearGradient(0, -w / 2, 0, w / 2)
  gr.addColorStop(0, hexA('#e8f8ff', 0.95 * a)); gr.addColorStop(1, hexA('#6cc0f0', 0.95 * a))
  g.fillStyle = gr; g.fill()
  g.strokeStyle = hexA(ICE_EDGE, 0.95 * a); g.lineWidth = 1.6; g.stroke()
  g.strokeStyle = hexA('#ffffff', 0.9 * a); g.lineWidth = 1.2
  g.beginPath(); g.moveTo(L * 0.05, -w * 0.12); g.lineTo(L * 0.72, -w * 0.12); g.lineTo(L * 0.95, 0); g.stroke()
}

/** a bubble of radius R at (x, y): a nearly clear film with an iridescent rim and a glint */
function bubble(g: CanvasRenderingContext2D, x: number, y: number, R: number, wob: number, a = 1): void {
  const fill = g.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.1, x, y, R)
  fill.addColorStop(0, `rgba(255,255,255,${0.2 * a})`); fill.addColorStop(0.7, hexA('#6cc8ff', 0.35 * a)); fill.addColorStop(1, hexA('#3a9ae8', 0.7 * a))
  g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, R * wob, R / wob, 0, 0, TAU); g.fill()
  // the soap-film rim: pink to cyan to gold
  const rim = g.createLinearGradient(x - R, y - R, x + R, y + R)
  rim.addColorStop(0, hexA('#ff9fe0', 0.95 * a)); rim.addColorStop(0.5, hexA('#7fe8ff', 0.95 * a)); rim.addColorStop(1, hexA('#ffe27a', 0.95 * a))
  g.strokeStyle = hexA('#1e5a9a', 0.7 * a); g.lineWidth = Math.max(2.4, R * 0.24); g.stroke()
  g.strokeStyle = rim; g.lineWidth = Math.max(1.4, R * 0.14); g.stroke()
  g.fillStyle = `rgba(255,255,255,${0.95 * a})`
  g.beginPath(); g.ellipse(x - R * 0.38, y - R * 0.42, R * 0.3, R * 0.15, -0.7, 0, TAU); g.fill()
  g.beginPath(); g.arc(x + R * 0.38, y + R * 0.34, R * 0.09, 0, TAU); g.fill()
}

// ------------------------------------------------------------------ Bubble Beam

/** Bubble Beam: each shot of the braid is a cluster of soap bubbles (a big one leading, little ones tumbling after
 * it along its path), iridescent and nearly clear; they pop into a ring of film shards and spray */
const bubblebeam: SigDraw = {
  shot(v, _el, _c, s) {
    const { g, frame } = v
    const R = Math.max(9, s.r) * 1.35 * 0.95
    g.save()
    const t = s.trail
    const back = t.length > 5 ? [t[t.length - 4], t[Math.max(0, t.length - 8)]] : []
    back.forEach((p, i) => { if (p) bubble(g, p.x + Math.sin(frame * 0.4 + i * 2 + s.id) * 3, p.y + Math.cos(frame * 0.35 + i) * 3, R * (i ? 0.4 : 0.58), 1, 0.9) })
    bubble(g, s.x, s.y, R, 1 + Math.sin(frame * 0.35 + s.id) * 0.09)
    g.restore()
    if ((frame + s.id) % 5 === 0) v.spawn({ x: s.x + rnd(-R, R) * 0.6, y: s.y + rnd(-R, R) * 0.6, vx: rnd(-0.4, 0.4), vy: rnd(-0.9, -0.3), life: 22, color: '#e8f8ff', r: 2, kind: 'dot', g: -0.02 })
  },
  impact(v, _el, _c, i) {
    // the pop: film shards flung out as broken rainbow arcs, a spritz of drops
    const { g } = v
    const k = i.t / i.life, R = 10 + 22 * k
    g.save(); g.lineCap = 'round'; g.lineWidth = 3 * (1 - k) + 1
    const hues = ['#ff5fc8', '#2ab8ff', '#ffb820', '#3a7ad0']
    for (let n = 0; n < 7; n++) {
      const t0 = (n / 7) * TAU + hash(i.id, n)
      g.strokeStyle = hexA(hues[n % 4], 0.95 * (1 - k))
      g.beginPath(); g.arc(i.x, i.y, R, t0, t0 + 0.45); g.stroke()
    }
    g.restore()
    if (i.t === 1) for (let n = 0; n < 8; n++) { const t = rnd(0, TAU); v.spawn({ x: i.x, y: i.y, vx: Math.cos(t) * rnd(1.5, 3.5), vy: Math.sin(t) * rnd(1.5, 3.5) - 1, life: rnd(12, 20), color: n % 2 ? '#ffffff' : '#9fdcff', r: rnd(1.5, 3), kind: 'drop', g: 0.12 }) }
  },
  impactLife: 22,
}

// ------------------------------------------------------------------ Ice Beam

/** Ice Beam: a pale-cyan crystalline beam with faceted, sawtooth edges; ice prisms grow out of both edges along it
 * as it holds, snowflakes glitter off it; where it strikes, a cluster of ice prisms bursts out */
const icebeam: SigDraw = {
  beam(v, _el, _c, b) {
    const { g, frame } = v
    const { x1, y1, x2, y2, w } = b
    const L = Math.hypot(x2 - x1, y2 - y1), a = Math.atan2(y2 - y1, x2 - x1)
    const age = b.ticks - b.t
    const fade = Math.min(1, b.t / 4)
    g.save(); g.translate(x1, y1); g.rotate(a)
    // a cold haze
    g.strokeStyle = hexA('#7fd0ff', 0.22 * fade); g.lineCap = 'round'; g.lineWidth = w * 2.2
    g.beginPath(); g.moveTo(8, 0); g.lineTo(L, 0); g.stroke()
    // the crystal body: a sawtooth-edged band (the teeth stay put: hashed by beam id)
    const N = Math.max(8, Math.round(L / 16))
    const half = (i: number, side: number) => (w / 2) * (i % 2 ? 0.7 : 1.05 + 0.25 * hash(b.id, i * 2 + (side > 0 ? 1 : 0))) * Math.min(1, (i / N) * L / 40 + 0.35)
    g.beginPath()
    for (let i = 0; i <= N; i++) g.lineTo((i / N) * L, -half(i, -1))
    for (let i = N; i >= 0; i--) g.lineTo((i / N) * L, half(i, 1))
    g.closePath()
    const gr = g.createLinearGradient(0, -w * 0.7, 0, w * 0.7)
    gr.addColorStop(0, hexA('#4aa8e0', 0.95 * fade)); gr.addColorStop(0.35, hexA(ICE, 0.95 * fade)); gr.addColorStop(0.5, hexA('#ffffff', 0.95 * fade)); gr.addColorStop(0.65, hexA(ICE, 0.95 * fade)); gr.addColorStop(1, hexA('#3a90d0', 0.95 * fade))
    g.fillStyle = gr; g.fill()
    g.strokeStyle = hexA(ICE_EDGE, 0.85 * fade); g.lineWidth = 2; g.lineJoin = 'miter'; g.stroke()
    // facets: short slashes across the band
    g.strokeStyle = hexA('#ffffff', 0.7 * fade); g.lineWidth = 1.5
    g.beginPath()
    for (let i = 1; i < N; i += 2) { const px = (i / N) * L; g.moveTo(px - 5, -w * 0.3); g.lineTo(px + 5, w * 0.3) }
    g.stroke()
    // ice prisms growing out of the edges, more of them the longer it holds
    const n = Math.min(14, Math.round(L / 38))
    for (let k = 0; k < n; k++) {
      const grow = Math.max(0, Math.min(1, (age - k * 0.5) / 3))
      if (grow <= 0) continue
      const px = L * (0.12 + 0.85 * hash(b.id, k + 40)), side = k % 2 ? 1 : -1
      const len = w * (1.1 + 0.9 * hash(b.id, k + 70)) * grow
      g.save(); g.translate(px, side * w * 0.35); g.rotate(side * (Math.PI / 2 - 0.6 + 1.0 * hash(b.id, k + 90)))
      prism(g, len, Math.max(5, w * 0.42), fade)
      g.restore()
    }
    // the muzzle: a frosty flare
    g.restore()
    glowDot(g, x1 + Math.cos(a) * 16, y1 + Math.sin(a) * 16, w * 1.2, '#cfefff', 0.8 * fade)
    glowDot(g, x2, y2, w * 1.5, '#dff6ff', 0.75 * fade)
    if (frame % 2 === 0) {
      const t = Math.random()
      v.spawn({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, vx: rnd(-0.6, 0.6), vy: rnd(-0.8, 0.2), life: 26, color: '#ffffff', r: 3, kind: 'star', g: 0.01 })
    }
  },
  impact(v, _el, _c, i) {
    // a cluster of ice prisms bursting out of the struck point, then melting away
    const { g } = v
    const k = i.t / i.life, grow = Math.min(1, i.t / 5), a = Math.min(1, 2 * (1 - k))
    g.save(); g.translate(i.x, i.y)
    glowDot(g, 0, 0, 40, '#dff6ff', 0.7 * (1 - k))
    for (let n = 0; n < 7; n++) {
      g.save(); g.rotate((n / 7) * TAU + hash(i.id, n) * 0.6)
      prism(g, (20 + 16 * hash(i.id, n + 9)) * grow, 8, a)
      g.restore()
    }
    g.restore()
    if (i.t === 1) for (let n = 0; n < 10; n++) { const t = rnd(0, TAU); v.spawn({ x: i.x, y: i.y, vx: Math.cos(t) * rnd(1.5, 4), vy: Math.sin(t) * rnd(1.5, 4) - 1, life: rnd(16, 26), color: n % 2 ? '#ffffff' : ICE, r: rnd(2, 4), kind: 'shard', g: 0.15 }) }
  },
  impactLife: 30,
}

// ------------------------------------------------------------------ Aurora Beam

const AURORA = ['#ff3d7f', '#ffa820', '#2ee07a', '#22a8ff', '#8a4cff']

/** Aurora Beam: a shimmering ribbon of rainbow bands, each band waving on its own phase like the northern lights,
 * with pale curtain folds hanging through it; rainbow sparkles drift off it */
const aurora: SigDraw = {
  beam(v, _el, _c, b) {
    const { g, frame } = v
    const { x1, y1, x2, y2, w } = b
    const L = Math.hypot(x2 - x1, y2 - y1), a = Math.atan2(y2 - y1, x2 - x1)
    const fade = Math.min(1, b.t / 4)
    g.save(); g.translate(x1, y1); g.rotate(a)
    g.lineCap = 'round'; g.lineJoin = 'round'
    const N = Math.max(12, Math.round(L / 12))
    const env = (x: number) => Math.min(1, x / 70) * Math.min(1, (L - x) / 40 + 0.4)
    const band = (j: number, x: number) => (j - 2) * w * 0.26 * env(x) + Math.sin(x * 0.016 - frame * 0.16 + j * 0.5) * w * 0.5 * env(x)
    // the curtain: faint folds hanging across the ribbon
    for (let i = 0; i < 16; i++) {
      const px = ((i + 0.5) / 16) * L + Math.sin(frame * 0.07 + i) * 6
      const al = 0.3 * (0.5 + 0.5 * Math.sin(frame * 0.2 + i * 1.9)) * fade
      const gr = g.createLinearGradient(0, -w, 0, w)
      gr.addColorStop(0, hexA(AURORA[i % 5], 0)); gr.addColorStop(0.5, hexA(AURORA[(i + 2) % 5], al)); gr.addColorStop(1, hexA(AURORA[i % 5], 0))
      g.strokeStyle = gr; g.lineWidth = 7
      g.beginPath(); g.moveTo(px, band(0, px) - w * 0.4); g.lineTo(px, band(4, px) + w * 0.4); g.stroke()
    }
    // the bands
    for (let j = 0; j < 5; j++) {
      g.beginPath()
      for (let i = 0; i <= N; i++) { const px = (i / N) * L; g.lineTo(px, band(j, px)) }
      g.strokeStyle = hexA(AURORA[j], 0.3 * fade); g.lineWidth = w * 0.5; g.stroke()
      g.strokeStyle = hexA(AURORA[j], 0.9 * fade); g.lineWidth = w * 0.2; g.stroke()
    }
    // a white thread shimmering down the middle band
    g.beginPath()
    for (let i = 0; i <= N; i++) { const px = (i / N) * L; g.lineTo(px, band(2, px)) }
    g.strokeStyle = `rgba(255,255,255,${0.8 * fade * rnd(0.7, 1)})`; g.lineWidth = 1.5; g.stroke()
    g.restore()
    glowDot(g, x2, y2, w * 1.4, '#e8fff4', 0.6 * fade)
    if (frame % 2 === 0) {
      const t = Math.random()
      v.spawn({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t + rnd(-w, w) * 0.5, vx: rnd(-0.4, 0.4), vy: rnd(-1, -0.2), life: 26, color: AURORA[Math.floor(Math.random() * 5)], r: 3, kind: 'star', g: -0.01 })
    }
  },
  impact(v, _el, _c, i) {
    // a shimmer of rainbow rings rippling out
    const { g } = v
    const k = i.t / i.life, al = Math.min(1, 2 * (1 - k))
    g.save()
    for (let j = 0; j < 5; j++) {
      g.strokeStyle = hexA(AURORA[j], 0.85 * al); g.lineWidth = 3
      g.beginPath(); g.ellipse(i.x, i.y, 12 + (30 + j * 6) * k, (12 + (30 + j * 6) * k) * 0.7, 0, 0, TAU); g.stroke()
    }
    g.restore()
  },
  impactLife: 26,
}

// ------------------------------------------------------------------ Star Freeze

/** Star Freeze: a spinning six-point star of ice, white-hot at the heart with hard dark-blue edges and a facet line
 * down every point, snow glittering in its wake; it strikes as a big snowflake flashing open */
const starfreeze: SigDraw = {
  shot(v, _el, _c, s) {
    const { g, frame } = v
    const R = Math.max(9, s.r) * 1.35 * 1.25
    shadow(g, s.x, s.y, R * 0.7)
    // a frosty wake
    g.save()
    const t = s.trail
    for (let i = 0; i < t.length; i += 2) { const k = i / t.length; glowDot(g, t[i].x, t[i].y, R * 0.6 * k, '#cfefff', 0.45 * k) }
    glowDot(g, s.x, s.y, R * 2, '#9fdcff', 0.5)
    g.translate(s.x, s.y); g.rotate(frame * 0.32 + s.id)
    star(g, R, 6, 0.4)
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R)
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, ICE); gr.addColorStop(1, '#4aa8e0')
    g.fillStyle = gr; g.fill()
    g.strokeStyle = ICE_EDGE; g.lineWidth = 2; g.lineJoin = 'miter'; g.stroke()
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.3
    g.beginPath()
    for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6 - Math.PI / 2; g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92) }
    g.stroke()
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, R * 0.16, 0, TAU); g.fill()
    g.restore()
    if (frame % 2 === 0) v.spawn({ x: s.x, y: s.y, vx: rnd(-0.8, 0.8), vy: rnd(-0.8, 0.8), life: 24, color: '#ffffff', r: 2.5, kind: 'star', g: 0.02 })
  },
  impact(v, _el, _c, i) {
    // a big snowflake flashing open over the foe, turning slowly as it fades
    const { g } = v
    const k = Math.max(0, i.t / i.life * 2 - 1), R = 18 + 34 * Math.min(1, i.t / 7)
    g.save(); g.translate(i.x, i.y)
    glowDot(g, 0, 0, R * 1.3, '#bfe8ff', 0.6 * (1 - k))
    g.rotate(k * 0.6); g.lineCap = 'round'
    snowflake(g, R)
    g.strokeStyle = hexA(ICE_EDGE, 0.6 * (1 - k)); g.lineWidth = 6; g.stroke()
    g.strokeStyle = hexA('#ffffff', 0.95 * (1 - k)); g.lineWidth = 2.5; g.stroke()
    g.restore()
    if (i.t === 1) for (let n = 0; n < 10; n++) { const t = (n / 10) * TAU; v.spawn({ x: i.x, y: i.y, vx: Math.cos(t) * 3, vy: Math.sin(t) * 3, life: 22, color: n % 2 ? '#ffffff' : ICE, r: 3, kind: 'star', g: 0 }) }
  },
  impactLife: 30,
}

// ------------------------------------------------------------------ Icicle Missile

/** Icicle Missile: long sharp icicles, clear blue at the root and white at the needle tip, with a frost streak behind;
 * where one hits it shatters into small tumbling ice chips (the split shards) */
const icicle: SigDraw = {
  shot(v, _el, _c, s) {
    const { g, frame } = v
    if (s.kid) {
      // an ice chip: a small tumbling splinter with a white glint
      const R = Math.max(4, s.r) * 1.5
      g.save(); g.translate(s.x, s.y); g.rotate(frame * 0.5 + s.id * 1.7)
      g.beginPath(); g.moveTo(R, 0); g.lineTo(R * 0.1, -R * 0.55); g.lineTo(-R * 0.8, -R * 0.2); g.lineTo(-R * 0.3, R * 0.5); g.closePath()
      g.fillStyle = hexA(ICE, 0.9); g.fill(); g.strokeStyle = ICE_EDGE; g.lineWidth = 1.3; g.stroke()
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(R * 0.8, 0); g.lineTo(R * 0.1, -R * 0.4); g.lineTo(0, -R * 0.1); g.closePath(); g.fill()
      g.restore()
      return
    }
    const r = Math.max(9, s.r) * 1.35
    const L = r * 3.4, W = r * 0.95
    const cx = Math.cos(s.a), cy = Math.sin(s.a)
    shadow(g, s.x, s.y, r * 0.8)
    g.save(); g.lineCap = 'round'; g.globalCompositeOperation = 'lighter'
    const tl = r * 4
    const gs = g.createLinearGradient(s.x - cx * tl, s.y - cy * tl, s.x, s.y)
    gs.addColorStop(0, hexA('#9fdcff', 0)); gs.addColorStop(1, hexA('#dff6ff', 0.6))
    g.strokeStyle = gs; g.lineWidth = W * 0.8
    g.beginPath(); g.moveTo(s.x - cx * tl, s.y - cy * tl); g.lineTo(s.x - cx * L * 0.3, s.y - cy * L * 0.3); g.stroke()
    g.restore()
    g.save(); g.translate(s.x, s.y); g.rotate(s.a)
    // the icicle: a long spike with a ragged frozen root
    g.beginPath()
    g.moveTo(L * 0.6, 0)
    g.lineTo(-L * 0.3, -W / 2); g.lineTo(-L * 0.4, -W * 0.2); g.lineTo(-L * 0.34, 0); g.lineTo(-L * 0.42, W * 0.25); g.lineTo(-L * 0.3, W / 2)
    g.closePath()
    const gr = g.createLinearGradient(-L * 0.4, 0, L * 0.6, 0)
    gr.addColorStop(0, hexA('#5fb8ec', 0.85)); gr.addColorStop(0.6, hexA(ICE, 0.95)); gr.addColorStop(1, '#ffffff')
    g.fillStyle = gr; g.fill()
    g.strokeStyle = ICE_EDGE; g.lineWidth = 1.6; g.lineJoin = 'miter'; g.stroke()
    // the facet ridge
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.4
    g.beginPath(); g.moveTo(-L * 0.28, -W * 0.12); g.lineTo(L * 0.55, 0); g.stroke()
    g.restore()
    if (frame % 3 === 0) v.spawn({ x: s.x - cx * L * 0.3, y: s.y - cy * L * 0.3, vx: -cx + rnd(-0.4, 0.4), vy: -cy + rnd(-0.4, 0.4), life: 16, color: '#e8f8ff', r: 2, kind: 'star', g: 0.02 })
  },
  impact(v, _el, _c, i) {
    // a crack of ice: a sharp four-point glint, a few chips
    const { g } = v
    const k = i.t / i.life, R = (i.r > 20 ? 22 : 14) * (0.6 + 0.6 * k), al = Math.min(1, 2 * (1 - k))
    g.save(); g.translate(i.x, i.y); g.rotate(hash(i.id, 1) * 0.8)
    star(g, R, 4, 0.16)
    g.fillStyle = hexA('#ffffff', 0.95 * al); g.fill()
    g.strokeStyle = hexA(ICE_EDGE, 0.9 * al); g.lineWidth = 1.5; g.stroke()
    g.restore()
    if (i.t === 1) for (let n = 0; n < 4; n++) { const t = rnd(0, TAU); v.spawn({ x: i.x, y: i.y, vx: Math.cos(t) * rnd(1.5, 3), vy: Math.sin(t) * rnd(1.5, 3) - 1.5, life: 18, color: n % 2 ? '#ffffff' : ICE, r: 2.5, kind: 'shard', g: 0.2 }) }
  },
  impactLife: 18,
}

// ------------------------------------------------------------------ Hail

/** a hailstone: a lumpy pale ice ball with a highlight */
function hailstone(g: CanvasRenderingContext2D, x: number, y: number, R: number, id: number, a = 1): void {
  g.beginPath()
  for (let i = 0; i < 7; i++) { const t = (i / 7) * TAU, rr = R * (0.85 + 0.25 * hash(id, i)); g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr) }
  g.closePath()
  const gr = g.createRadialGradient(x - R * 0.3, y - R * 0.3, 0, x, y, R * 1.1)
  gr.addColorStop(0, hexA('#ffffff', a)); gr.addColorStop(0.6, hexA('#cfeaf8', a)); gr.addColorStop(1, hexA('#7fb4d8', a))
  g.fillStyle = gr; g.fill()
  g.strokeStyle = hexA('#4a7fa8', 0.9 * a); g.lineWidth = 1.5; g.stroke()
}

/** Hail: each impact is a frosty spot: a shadow and an icy dashed ring while a clutch of hailstones falls on it out
 * of a small grey squall, then a frost patch strewn with ice pellets, chips bouncing where they struck */
const hail: SigDraw = {
  area(v, _el, _c, a) {
    const { g, frame } = v
    const { x, y, r, fade } = a
    g.save()
    if (a.land > 0) {
      const k = Math.max(0, Math.min(1, 1 - a.land / 24))
      g.fillStyle = `rgba(20,40,70,${0.1 + 0.2 * k})`; g.beginPath(); g.ellipse(x, y, r * (0.4 + 0.6 * k), r * (0.4 + 0.6 * k) * 0.8, 0, 0, TAU); g.fill()
      g.strokeStyle = hexA('#cfeeff', 0.5 + 0.4 * Math.sin(frame * 0.5)); g.lineWidth = 3; g.setLineDash([6, 8]); g.lineDashOffset = -frame
      g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, TAU); g.stroke()
    } else {
      const since = -a.land
      const gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(0, hexA('#ffffff', 0.55 * fade)); gr.addColorStop(0.7, hexA('#bfe6ff', 0.35 * fade)); gr.addColorStop(1, hexA('#bfe6ff', 0))
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, TAU); g.fill()
      // frost cracks from the strike
      g.strokeStyle = hexA('#ffffff', 0.8 * fade); g.lineWidth = 1.5
      g.beginPath()
      for (let i = 0; i < 6; i++) { const t = (i / 6) * TAU + hash(a.id, i), rr = r * (0.4 + 0.3 * hash(a.id, i + 6)) * Math.min(1, since / 4); g.moveTo(x, y); g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr * 0.8) }
      g.stroke()
      // the pellets lying about
      for (let i = 0; i < 8; i++) { const t = hash(a.id, i + 20) * TAU, rr = r * 0.75 * hash(a.id, i + 30); hailstone(g, x + Math.cos(t) * rr, y + Math.sin(t) * rr * 0.8, 4 + 4 * hash(a.id, i + 40), a.id + i, fade) }
      if (since < 1) for (let k = 0; k < 8; k++) { const t = rnd(0, TAU); v.spawn({ x, y, vx: Math.cos(t) * rnd(1.5, 4), vy: Math.sin(t) * rnd(1, 3) - 2.5, life: 22, color: k % 2 ? '#ffffff' : '#bfe6ff', r: rnd(2, 4), kind: 'shard', g: 0.25 }) }
    }
    g.restore()
  },
  air(v, _el, _c, a) {
    const { g, frame } = v
    const { x, y, r, fade } = a
    const since = -a.land
    // the squall: a small grey cloud over the spot, until the stones are down
    if (a.land > 0 || since < 10) {
      const ca = (a.land > 0 ? 0.5 : 0.5 * (1 - since / 10)) * fade
      g.save()
      for (let i = 0; i < 5; i++) {
        const px = x + (hash(a.id, i + 90) * 2 - 1) * 30, py = y - 175 + (hash(a.id, i + 60) * 2 - 1) * 6
        g.fillStyle = hexA(i % 2 ? '#9aa8bc' : '#7a889e', ca); g.beginPath(); g.arc(px, py, 13 + 8 * hash(a.id, i + 30), 0, TAU); g.fill()
      }
      g.restore()
    }
    // the hailstones: a big one and two smaller ones falling onto the spot, streaking
    g.save()
    for (let j = 0; j < 4; j++) {
      const lead = a.land + j * 3 - 1
      if (lead <= 0 || lead > 18) continue
      const k = lead / 18, drop = k * 170
      const px = x + (hash(a.id, j + 5) * 2 - 1) * Math.min(r, 60) * 0.5 - drop * 0.15, py = y + (hash(a.id, j + 8) * 2 - 1) * Math.min(r, 60) * 0.3 - drop
      const R = j === 0 ? 13 : 11 - j
      g.strokeStyle = 'rgba(200,230,250,0.55)'; g.lineWidth = R * 0.9; g.lineCap = 'round'
      g.beginPath(); g.moveTo(px - 10, py - 44); g.lineTo(px, py); g.stroke()
      hailstone(g, px, py, R, a.id * 3 + j)
    }
    // after the strike a few stragglers still pelt it
    if (a.land <= 0 && since < 8) for (let j = 0; j < 2; j++) {
      const p = ((frame * 0.12 + j * 0.5) % 1), px = x + (hash(a.id, j + 50) * 2 - 1) * r * 0.7, py = y + (hash(a.id, j + 52) * 2 - 1) * r * 0.5
      hailstone(g, px - (1 - p) * 20, py - (1 - p) * 120, 7, a.id + 90 + j, 0.9 * (1 - since / 8))
    }
    g.restore()
  },
  /** a hand kit's hail cone (Articuno): a frosty wedge with hailstones pelting down across it */
  cone(v, _el, _c, w) {
    const { g } = v
    const { x, y, aim, range, arc, k } = w
    const fade = 1 - Math.max(0, k - 0.4) / 0.6
    g.save()
    const gr = g.createRadialGradient(x, y, 0, x, y, range)
    gr.addColorStop(0, hexA('#e8f6ff', 0.35 * fade)); gr.addColorStop(1, hexA('#bfe6ff', 0.05 * fade))
    g.fillStyle = gr; g.beginPath(); g.moveTo(x, y); g.arc(x, y, range, aim - arc / 2, aim + arc / 2); g.closePath(); g.fill()
    for (let i = 0; i < 9; i++) {
      const t = aim + (hash(i, 7) - 0.5) * arc, d = range * (0.3 + 0.65 * hash(i, 11)), p = Math.min(1, k * 2.2 + hash(i, 13) * 0.4)
      const px = x + Math.cos(t) * d, py = y + Math.sin(t) * d - (1 - p) * 110
      if (p < 1) { g.strokeStyle = 'rgba(200,230,250,0.5)'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(px - 6, py - 30); g.lineTo(px, py); g.stroke() }
      hailstone(g, px, py, 6 + 4 * hash(i, 17), i * 5, fade)
    }
    g.restore()
  },
}

// ------------------------------------------------------------------ Crabhammer

const CRAB = '#e8583a', CRAB_DARK = '#8a2414', CRAB_LIGHT = '#ffa27a'

/** a crab's pincer at the origin (the palm), pointing along +x, R its size, `open` 0..1 how wide the movable finger
 * swings: a jointed arm reaching back, a swollen palm, two long serrated fingers meeting at the tips */
function pincer(g: CanvasRenderingContext2D, R: number, open: number, a = 1): void {
  g.save(); g.globalAlpha *= a
  g.lineJoin = 'round'
  const shell = () => {
    const gr = g.createLinearGradient(0, -R * 0.6, 0, R * 0.6)
    gr.addColorStop(0, CRAB_LIGHT); gr.addColorStop(0.45, CRAB); gr.addColorStop(1, CRAB_DARK)
    g.fillStyle = gr; g.fill()
    g.strokeStyle = '#4a120a'; g.lineWidth = 3; g.stroke()
  }
  const teeth = (x0: number, x1: number, y: number, dir: number) => {
    g.fillStyle = '#fff0e0'; g.strokeStyle = '#4a120a'; g.lineWidth = 1
    for (let i = 0; i < 5; i++) { const px = x0 + ((x1 - x0) * i) / 5, w = (x1 - x0) / 5; g.beginPath(); g.moveTo(px, y); g.lineTo(px + w * 0.5, y + dir * R * 0.1); g.lineTo(px + w, y); g.closePath(); g.fill(); g.stroke() }
  }
  // the arm, reaching back: two segments and a joint
  g.beginPath(); g.moveTo(-R * 0.3, -R * 0.24); g.lineTo(-R * 0.95, -R * 0.2); g.lineTo(-R * 0.95, R * 0.22); g.lineTo(-R * 0.3, R * 0.24); g.closePath(); shell()
  g.beginPath(); g.moveTo(-R * 1.0, -R * 0.2); g.lineTo(-R * 1.9, -R * 0.26); g.lineTo(-R * 1.9, R * 0.2); g.lineTo(-R * 1.0, R * 0.2); g.closePath(); shell()
  g.beginPath(); g.arc(-R * 0.97, 0, R * 0.16, 0, TAU); g.fillStyle = CRAB_DARK; g.fill()
  // the fixed finger: from the palm's underside to the tip, serrated along its inner edge
  g.beginPath(); g.moveTo(R * 0.3, R * 0.02); g.quadraticCurveTo(R * 1.0, R * 0.08, R * 1.6, -R * 0.02)
  g.quadraticCurveTo(R * 1.3, R * 0.55, R * 0.15, R * 0.42); g.closePath(); shell()
  teeth(R * 0.55, R * 1.3, R * 0.06, -1)
  // the movable finger, hinged at the palm's top, swinging open
  g.save(); g.translate(R * 0.3, -R * 0.08); g.rotate(-open * 0.75)
  g.beginPath(); g.moveTo(0, R * 0.1); g.quadraticCurveTo(R * 0.7, R * 0.12, R * 1.3, R * 0.08)
  g.quadraticCurveTo(R * 0.95, -R * 0.45, -R * 0.1, -R * 0.34); g.closePath(); shell()
  teeth(R * 0.25, R * 1.0, R * 0.1, 1)
  g.restore()
  // the palm, swollen, with spots and a gloss
  g.beginPath(); g.ellipse(0, 0, R * 0.58, R * 0.44, 0, 0, TAU); shell()
  g.fillStyle = hexA(CRAB_LIGHT, 0.85)
  for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-R * 0.3 + R * 0.18 * i, R * (i % 2 ? 0.16 : 0.02), R * 0.05, 0, TAU); g.fill() }
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(-R * 0.1, -R * 0.25, R * 0.3, R * 0.08, -0.1, 0, TAU); g.fill()
  g.restore()
}

/** Crabhammer: a giant red crab pincer raised high over the spot (its shadow darkening under it), then hammered down
 * claws-first: a slam of white water, a splash ring and cracks in the ground */
const crabhammer: SigDraw = {
  area(v, el, c, a) {
    const { g, frame } = v
    const { x, y, r, fade } = a
    const col = water(el, c)
    g.save()
    if (a.land > 0) {
      const k = Math.max(0, Math.min(1, 1 - a.land / 14))
      g.fillStyle = `rgba(40,10,0,${0.12 + 0.25 * k})`; g.beginPath(); g.ellipse(x, y, r * (0.5 + 0.5 * k), r * (0.5 + 0.5 * k) * 0.55, 0, 0, TAU); g.fill()
      g.strokeStyle = hexA(CRAB, 0.5 + 0.4 * Math.sin(frame * 0.6)); g.lineWidth = 3; g.setLineDash([12, 8]); g.lineDashOffset = -frame
      g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0, 0, TAU); g.stroke()
    } else {
      const since = -a.land, k = Math.min(1, since / 10)
      // the crater: cracks out from the slam
      g.strokeStyle = `rgba(40,26,16,${0.7 * fade})`; g.lineWidth = 3; g.lineJoin = 'round'
      for (let i = 0; i < 8; i++) {
        const t0 = (i / 8) * TAU + hash(a.id, i) * 0.5
        g.beginPath(); g.moveTo(x, y)
        for (let j = 1; j <= 3; j++) { const rr = r * 0.8 * (j / 3) * (0.7 + 0.3 * hash(a.id, i * 5 + j)), tt = t0 + (hash(a.id, i * 9 + j) - 0.5) * 0.5; g.lineTo(x + Math.cos(tt) * rr, y + Math.sin(tt) * rr * 0.7) }
        g.stroke()
      }
      // the splash ring racing out, and a pool
      g.fillStyle = hexA(col, 0.3 * fade); g.beginPath(); g.ellipse(x, y, r * 0.7, r * 0.45, 0, 0, TAU); g.fill()
      g.strokeStyle = hexA(light(col, 0.4), 0.85 * (1 - k) * fade); g.lineWidth = 10 * (1 - k) + 2
      g.beginPath(); g.ellipse(x, y, r * (0.5 + 0.6 * k), r * (0.5 + 0.6 * k) * 0.7, 0, 0, TAU); g.stroke()
      g.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k) * fade})`; g.lineWidth = 3; g.stroke()
      if (since < 1) for (let n = 0; n < 14; n++) { const t = rnd(0, TAU); v.spawn({ x: x + Math.cos(t) * r * 0.4, y: y + Math.sin(t) * r * 0.3, vx: Math.cos(t) * rnd(2, 5), vy: Math.sin(t) * rnd(1, 3) - rnd(2, 5), life: rnd(18, 28), color: n % 3 ? light(col, 0.5) : '#ffffff', r: rnd(2.5, 4.5), kind: 'drop', g: 0.25 }) }
    }
    g.restore()
  },
  air(v, el, c, a) {
    const { g } = v
    const { x, y, r, fade } = a
    const R = r * 0.8
    // the swing: a hammer blow round a shoulder up and behind the spot, from raised high to the fingertips on the spot
    const px = x - R * 1.3, py = y - R * 1.9, reach = Math.hypot(R * 1.3, R * 1.9) - R * 1.6, slam = Math.atan2(R * 1.9, R * 1.3)
    const since = -a.land
    const k = a.land > 0 ? Math.max(0, Math.min(1, 1 - a.land / 10)) : 1
    const out = a.land > 0 ? 1 : Math.max(0, 1 - Math.max(0, since - 5) / 8) * fade
    if (out <= 0) return
    const ang = (e: number) => slam - 1.7 * (1 - e * e) - (a.land <= 0 && since < 4 ? 0.06 * Math.sin(since * 1.6) : 0)
    const at = (e: number, open: number, al: number) => {
      const t = ang(e)
      g.save(); g.translate(px + Math.cos(t) * reach, py + Math.sin(t) * reach); g.rotate(t)
      pincer(g, R, open, al)
      g.restore()
    }
    // motion ghosts on the way down
    if (a.land > 0 && k > 0.3) for (let j = 2; j >= 1; j--) at(Math.max(0, k - j * 0.14), 0.4, 0.2)
    at(k, a.land > 0 ? 1 - k * 0.8 : 0.05, out)
    // the slam: a white burst where the claws hit
    if (a.land <= 0 && since < 6) glowDot(g, x, y, r * 1.1, light(water(el, c), 0.6), 0.8 * (1 - since / 6))
  },
}

// ------------------------------------------------------------------ Water Shuriken

/** Water Shuriken: a four-bladed star of water spinning fast, its curved blades translucent blue with bright rims round
 * a dark hub, droplets flung off its tips; it bursts in a splash */
const watershuriken: SigDraw = {
  shot(v, el, c, s) {
    const { g, frame } = v
    const col = water(el, c)
    const R = Math.max(9, s.r) * 1.35 * 1.5
    shadow(g, s.x, s.y, R * 0.7)
    const spin = frame * 0.45 + s.id
    g.save(); g.translate(s.x, s.y)
    // a motion blur ring
    g.strokeStyle = hexA(col, 0.4); g.lineWidth = 4
    g.beginPath(); g.arc(0, 0, R * 0.85, 0, TAU); g.stroke()
    g.rotate(spin)
    // the four blades: tips joined by concave curves, each blade hooked
    g.beginPath()
    for (let i = 0; i < 4; i++) {
      const t = (i / 4) * TAU, tn = t + TAU / 4
      if (i === 0) g.moveTo(Math.cos(t) * R, Math.sin(t) * R)
      g.quadraticCurveTo(Math.cos(t + 0.55) * R * 0.2, Math.sin(t + 0.55) * R * 0.2, Math.cos(tn) * R, Math.sin(tn) * R)
    }
    g.closePath()
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R)
    gr.addColorStop(0, hexA(light(col, 0.5), 0.95)); gr.addColorStop(0.5, hexA(col, 0.92)); gr.addColorStop(1, hexA(dark(col, 0.25), 0.95))
    g.fillStyle = gr; g.fill()
    g.strokeStyle = hexA(dark(col, 0.55), 0.9); g.lineWidth = 3.5; g.stroke()
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 1.6; g.stroke()
    // a flowing highlight on each blade
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5
    g.beginPath()
    for (let i = 0; i < 4; i++) { const t = (i / 4) * TAU; g.moveTo(Math.cos(t + 0.35) * R * 0.3, Math.sin(t + 0.35) * R * 0.3); g.quadraticCurveTo(Math.cos(t + 0.15) * R * 0.6, Math.sin(t + 0.15) * R * 0.6, Math.cos(t) * R * 0.85, Math.sin(t) * R * 0.85) }
    g.stroke()
    // the hub
    g.fillStyle = dark(col, 0.45); g.beginPath(); g.arc(0, 0, R * 0.2, 0, TAU); g.fill()
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.stroke()
    g.restore()
    if (frame % 2 === 0) {
      const t = spin + (Math.floor(Math.random() * 4) * TAU) / 4
      v.spawn({ x: s.x + Math.cos(t) * R, y: s.y + Math.sin(t) * R, vx: -Math.sin(t) * 2.2, vy: Math.cos(t) * 2.2, life: 14, color: light(col, 0.5), r: 2.2, kind: 'drop', g: 0.1 })
    }
  },
  impact(v, el, c, i) {
    // a splash: a crown of water thrown up, a white ring
    const { g } = v
    const col = water(el, c)
    const k = i.t / i.life, al = Math.min(1, 2 * (1 - k))
    g.save()
    g.strokeStyle = hexA(col, 0.8 * al); g.lineWidth = 5
    g.beginPath(); g.ellipse(i.x, i.y, 10 + 26 * k, (10 + 26 * k) * 0.6, 0, 0, TAU); g.stroke()
    g.strokeStyle = hexA('#ffffff', 0.95 * al); g.lineWidth = 2
    g.beginPath(); g.ellipse(i.x, i.y, 10 + 26 * k, (10 + 26 * k) * 0.6, 0, 0, TAU); g.stroke()
    g.restore()
    if (i.t === 1) for (let n = 0; n < 10; n++) { const t = rnd(Math.PI, TAU); v.spawn({ x: i.x, y: i.y, vx: Math.cos(t) * rnd(1, 3.5), vy: Math.sin(t) * rnd(2, 4.5), life: rnd(14, 22), color: n % 2 ? '#ffffff' : light(col, 0.4), r: rnd(2, 3.5), kind: 'drop', g: 0.25 }) }
  },
  impactLife: 22,
}

export const WATER: Record<string, SigDraw> = { bubblebeam, icebeam, aurora, starfreeze, icicle, hail, crabhammer, watershuriken }
