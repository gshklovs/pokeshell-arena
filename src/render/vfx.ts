// Archetype visuals (docs/VFX.md): how a ranged, area or cone attack looks, by its look (the move-lexicon archetype
// its name reads as, ResolvedAttack.look). Render-only Canvas2D procedural drawing: paths, gradients and the
// renderer's own particles, type-coloured, no assets. Every drawer returns false for a look it doesn't know, and the
// renderer falls back to the plain look of the shape kind. Melee and dash archetypes are drawn elsewhere.
// Randomness here is Math.random (flicker) or a hash of the shape's id (a crack pattern that stays put); the sim
// never sees any of it.
import { SIG } from './sig'
import {
  TAU, bolt, cloud, dark, glowDot, hash, hexA, leaf, light, pkind, rnd, star,
  type AreaView, type BeamView, type ConeView, type ShotView, type Vfx, type VfxParticle,
} from './vfxkit'

export type { AreaView, BeamView, ConeView, ShotView, Vfx, VfxParticle }

// ------------------------------------------------------------------ shots

/** a shot by its look; false: not a look this knows (the renderer draws its plain glowing ball) */
export function drawShot(v: Vfx, look: string | undefined, el: string, c: string, s: ShotView): boolean {
  const sig = look ? SIG[look]?.shot : undefined
  if (sig) { sig(v, el, c, s); return true }
  const { g, frame } = v
  const { x, y, a } = s
  // drawn a size up from the hit radius: a 8 px needle or ember has to read at game scale
  const r = Math.max(9, s.r) * 1.35
  const cx = Math.cos(a), cy = Math.sin(a)
  if (s.wall === 0 && look !== 'phase') { g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(x, y + r * 1.1, r * 0.9, r * 0.35, 0, 0, TAU); g.fill() }
  if (s.wall > 0 && (look === 'wave' || look === 'surf' || look === 'ripple' || look === undefined || look === 'hypno')) {
    if (look === 'ripple') ripple(v, el, c, s)
    else wave(v, el, c, s)
    return true
  }
  switch (look) {
    case 'fireball': {
      // a flaming ball: flame tongues streaming back, a hot core, smoke and embers shed behind
      g.save(); g.translate(x, y); g.rotate(a)
      g.globalCompositeOperation = 'lighter'
      g.globalCompositeOperation = 'source-over'
      for (let i = 0; i < 7; i++) {
        const off = (i - 3) * r * 0.22, len = r * rnd(2, 3.6)
        g.fillStyle = hexA(i % 2 ? '#ff5a1e' : '#ffa030', 0.75)
        g.beginPath(); g.moveTo(r * 0.4, off - r * 0.5); g.quadraticCurveTo(-len * 0.5, off + rnd(-4, 4), -len, off * 1.4); g.quadraticCurveTo(-len * 0.4, off + r * 0.2, r * 0.4, off + r * 0.5); g.fill()
      }
      g.restore()
      const gr = g.createRadialGradient(x + cx * r * 0.2, y + cy * r * 0.2, 0, x, y, r * 1.3)
      gr.addColorStop(0, '#fffbe0'); gr.addColorStop(0.35, '#ffd24a'); gr.addColorStop(0.7, el === 'Fire' ? '#ff6a1e' : c); gr.addColorStop(1, hexA(el === 'Fire' ? '#c0301a' : c, 0))
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 1.3, 0, TAU); g.fill()
      g.fillStyle = '#fffbe0'; g.beginPath(); g.arc(x + cx * r * 0.15, y + cy * r * 0.15, r * 0.5, 0, TAU); g.fill()
      if (frame % 1 === 0) v.spawn({ x: x - cx * r, y: y - cy * r, vx: -cx * 1.5 + rnd(-0.6, 0.6), vy: -cy * 1.5 + rnd(-1, 0.2), life: rnd(14, 26), color: ['#ffd24a', '#ff8a2a', '#ff5a1e'][frame % 3], r: rnd(2, 4), kind: 'ember', g: -0.05 })
      if (frame % 4 === 0) v.spawn({ x: x - cx * r * 1.5, y: y - cy * r * 1.5, vx: rnd(-0.3, 0.3), vy: rnd(-0.8, -0.2), life: 34, color: '#5a4a44', r: r * 0.5, kind: 'smoke', g: -0.02 })
      return true
    }
    case 'fan': {
      // an ember: a bright spark with a short hot streak, flickering
      g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'
      const len = r * 3.2
      const gr = g.createLinearGradient(x - cx * len, y - cy * len, x, y)
      gr.addColorStop(0, hexA('#ff5a1e', 0)); gr.addColorStop(1, hexA('#ffd24a', 0.9))
      g.strokeStyle = gr; g.lineWidth = r * 1.3
      g.beginPath(); g.moveTo(x - cx * len, y - cy * len); g.lineTo(x, y); g.stroke()
      glowDot(g, x, y, r * 2.2 * rnd(0.85, 1.15), el === 'Fire' ? '#ff8a2a' : c, 0.8)
      g.fillStyle = '#fff6d0'; g.beginPath(); g.arc(x, y, r * 0.55, 0, TAU); g.fill()
      g.restore()
      if (frame % 2 === 0) v.spawn({ x, y, vx: -cx * 2 + rnd(-1.2, 1.2), vy: -cy * 2 + rnd(-1.2, 1.2), life: rnd(8, 16), color: '#ffcf4a', r: 2, kind: 'spark', g: 0 })
      return true
    }
    case 'bolt': case 'zigzag': {
      // a crackling bolt: a jagged line along the path it just took, a bright head
      const t = s.trail
      const tail = t[Math.max(0, t.length - 7)] ?? { x: x - cx * 40, y: y - cy * 40 }
      bolt(g, tail.x, tail.y, x, y, el === 'Lightning' ? '#ffe94a' : c, Math.max(3, r * 0.7), 0.5, 1)
      glowDot(g, x, y, r * 2.6, el === 'Lightning' ? '#fff6a0' : c, 0.85)
      return true
    }
    case 'leaves': case 'weave': case 'boomerang': case 'seed': {
      const spin = frame * (look === 'boomerang' ? 0.55 : look === 'seed' ? 0.12 : 0.4) + s.id
      g.save(); g.translate(x, y); g.rotate(spin)
      if (look === 'boomerang') {
        // a spinning blade: a crescent with a bright edge, motion-blurred
        for (let k = 2; k >= 0; k--) {
          g.save(); g.rotate(-k * 0.35)
          g.globalAlpha = k === 0 ? 1 : 0.25
          g.beginPath(); g.arc(0, 0, r * 1.5, -0.2, Math.PI + 0.2); g.arc(0, r * 0.35, r * 1.15, Math.PI + 0.1, -0.1, true); g.closePath()
          g.fillStyle = el === 'Grass' ? '#6fce5a' : c; g.fill()
          if (k === 0) { g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * 1.5, -0.1, Math.PI + 0.1); g.stroke() }
          g.restore()
        }
      } else if (look === 'seed') {
        g.fillStyle = '#8a6a3a'; g.beginPath(); g.ellipse(0, 0, r * 1.1, r * 0.75, 0, 0, TAU); g.fill()
        g.strokeStyle = '#5dbb4f'; g.lineWidth = 2; g.beginPath(); g.moveTo(-r * 0.3, -r * 0.6); g.quadraticCurveTo(0, -r * 1.4, r * 0.6, -r * 1.2); g.stroke()
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-r * 0.3, -r * 0.25, r * 0.35, r * 0.2, 0, 0, TAU); g.fill()
      } else {
        // spinning leaves (a Razor Leaf is three of these; Petal Dance petals are the type colour)
        const fill = el === 'Grass' ? '#7ed957' : light(c, 0.2)
        leaf(g, r * 1.5, fill)
        g.rotate(Math.PI / 2); g.globalAlpha = 0.35; leaf(g, r * 1.3, fill)
      }
      g.restore()
      if (frame % 5 === 0 && look !== 'boomerang') v.spawn({ x, y, vx: rnd(-0.6, 0.6), vy: rnd(-0.6, 0.6), life: 30, color: el === 'Grass' ? '#9be870' : light(c, 0.3), r: 3, kind: 'leaf', g: 0.03 })
      return true
    }
    case 'bubble': {
      const wob = 1 + Math.sin(frame * 0.3 + s.id) * 0.08
      g.save()
      const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r * 1.1)
      gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(0.7, hexA(light(c, 0.2), 0.35)); gr.addColorStop(1, hexA(c, 0.8))
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r * 1.1 * wob, r * 1.1 / wob, 0, 0, TAU); g.fill()
      g.strokeStyle = hexA(dark(c, 0.25), 0.9); g.lineWidth = 2.2; g.stroke()
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(x - r * 0.4, y - r * 0.45, r * 0.28, r * 0.16, -0.6, 0, TAU); g.fill()
      g.restore()
      return true
    }
    case 'stars': {
      g.save(); g.translate(x, y)
      glowDot(g, 0, 0, r * 2.4, c, 0.5)
      g.rotate(frame * 0.2 + s.id)
      star(g, r * 1.5); g.fillStyle = '#fff4a8'; g.fill(); g.strokeStyle = hexA(c, 0.9); g.lineWidth = 2; g.stroke()
      g.restore()
      if (frame % 3 === 0) v.spawn({ x, y, vx: -cx + rnd(-0.5, 0.5), vy: -cy + rnd(-0.5, 0.5), life: 22, color: '#fff4a8', r: 3, kind: 'star', g: 0 })
      return true
    }
    case 'spit': {
      // a gob: a wobbling blob with a drip trailing behind
      g.save(); g.translate(x, y); g.rotate(a)
      const col = el === 'Grass' || el === 'Psychic' || el === 'Darkness' ? '#a45ad0' : c
      g.fillStyle = hexA(col, 0.9)
      g.beginPath()
      for (let i = 0; i <= 12; i++) { const t = (i / 12) * TAU, rr = r * (1 + 0.12 * Math.sin(t * 3 + frame * 0.4)) * (Math.cos(t) < 0 ? 1 - 0.35 * Math.cos(t) : 1); g.lineTo(Math.cos(t) * rr * (Math.cos(t) < 0 ? 1.3 : 1), Math.sin(t) * rr * 0.9) }
      g.fill()
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(r * 0.3, -r * 0.3, r * 0.25, 0, TAU); g.fill()
      g.restore()
      if (frame % 4 === 0) v.spawn({ x: x - cx * r, y: y - cy * r, vx: 0, vy: 0.4, life: 20, color: col, r: 3, kind: 'drop', g: 0.1 })
      return true
    }
    case 'web': {
      // a spinning net: spokes and rings
      g.save(); g.translate(x, y); g.rotate(frame * 0.08)
      const R = r * 1.4
      g.beginPath()
      for (let i = 0; i < 8; i++) { const t = (i / 8) * TAU; g.moveTo(0, 0); g.lineTo(Math.cos(t) * R, Math.sin(t) * R) }
      for (const k of [0.35, 0.65, 1]) { for (let i = 0; i <= 8; i++) { const t = (i / 8) * TAU; const px = Math.cos(t) * R * k, py = Math.sin(t) * R * k; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py) } }
      g.strokeStyle = 'rgba(40,40,50,0.55)'; g.lineWidth = 3.5; g.stroke()
      g.strokeStyle = 'rgba(250,250,250,0.95)'; g.lineWidth = 1.6; g.stroke()
      g.restore()
      return true
    }
    case 'phase': {
      // a shadow wisp: a dark flickering flame with a long smoky tail, half there
      g.save(); g.globalAlpha = 0.75
      const t = s.trail
      for (let i = 0; i < t.length; i++) {
        const k = i / t.length
        g.fillStyle = hexA(el === 'Darkness' || el === 'Psychic' ? '#3a2458' : dark(c, 0.5), 0.35 * k)
        g.beginPath(); g.arc(t[i].x + Math.sin(frame * 0.3 + i) * 2, t[i].y, r * (0.4 + 0.8 * k), 0, TAU); g.fill()
      }
      glowDot(g, x, y, r * 2.2, el === 'Fire' ? '#7fb0ff' : '#b36ee0', 0.6)
      g.fillStyle = '#1a0f28'; g.beginPath(); g.arc(x, y, r * 0.9, 0, TAU); g.fill()
      g.fillStyle = '#e8d8ff'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.15, r * 0.18, 0, TAU); g.arc(x + r * 0.3, y - r * 0.15, r * 0.18, 0, TAU); g.fill()
      g.restore()
      return true
    }
    case 'hypno': {
      // swaying rings of hypnotic light
      g.save(); g.translate(x, y); g.rotate(a)
      for (let k = 0; k < 3; k++) {
        const p = ((frame * 0.05 + k / 3) % 1)
        g.strokeStyle = hexA(k % 2 ? '#ff9fd6' : light(c, 0.3), 0.9 * (1 - p)); g.lineWidth = 3
        g.beginPath(); g.ellipse(0, 0, r * (0.4 + p) * 0.8, r * (0.4 + p) * 1.6, 0, -1.2, 1.2); g.stroke()
      }
      glowDot(g, 0, 0, r * 1.2, '#ff9fd6', 0.7)
      g.restore()
      return true
    }
    case 'bullet': case 'sniper': case 'lance': case 'barrage': {
      // a streak: a tracer, a long spear, a needle; the length reads its speed
      const len = look === 'sniper' ? r * 12 : look === 'lance' ? r * 6 : look === 'barrage' ? r * 4 : r * 4
      g.save(); g.lineCap = 'round'; g.globalCompositeOperation = 'lighter'
      const gr = g.createLinearGradient(x - cx * len, y - cy * len, x, y)
      gr.addColorStop(0, hexA(c, 0)); gr.addColorStop(1, hexA(light(c, 0.3), 0.85))
      g.strokeStyle = gr; g.lineWidth = look === 'barrage' ? r * 0.9 : r * 1.4
      g.beginPath(); g.moveTo(x - cx * len, y - cy * len); g.lineTo(x, y); g.stroke()
      g.restore()
      g.save(); g.translate(x, y); g.rotate(a)
      if (look === 'lance' || look === 'barrage' || look === 'sniper') {
        const L = look === 'lance' ? r * 3 : r * 2
        g.fillStyle = look === 'barrage' ? '#f0f0e0' : light(c, 0.5)
        g.beginPath(); g.moveTo(L * 0.6, 0); g.lineTo(-L * 0.4, -r * 0.45); g.lineTo(-L * 0.6, 0); g.lineTo(-L * 0.4, r * 0.45); g.closePath(); g.fill()
        g.strokeStyle = hexA(c, 0.9); g.lineWidth = 1.2; g.stroke()
      } else {
        // a coin or slug: a bright oval, spinning
        const sp = Math.abs(Math.cos(frame * 0.4 + s.id))
        g.fillStyle = el === 'Metal' || el === 'Colorless' || el === 'Darkness' ? '#ffd24a' : light(c, 0.2)
        g.beginPath(); g.ellipse(0, 0, r * 0.9, r * (0.3 + 0.6 * sp), 0, 0, TAU); g.fill()
        g.strokeStyle = 'rgba(120,80,10,0.8)'; g.lineWidth = 1.5; g.stroke()
      }
      g.restore()
      return true
    }
    case 'lob': {
      // a tumbling rock / lump over its shadow (the renderer lifts it and draws the shadow)
      g.save(); g.translate(x, y); g.rotate(frame * 0.15 + s.id)
      const base = el === 'Fighting' || el === 'Metal' || el === 'Colorless' || el === 'Darkness' ? '#9a8a74' : c
      g.beginPath()
      for (let i = 0; i < 8; i++) { const t = (i / 8) * TAU, rr = r * (0.85 + 0.3 * hash(s.id, i)); g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) }
      g.closePath()
      const gr = g.createLinearGradient(-r, -r, r, r)
      gr.addColorStop(0, light(base, 0.35)); gr.addColorStop(1, dark(base, 0.35))
      g.fillStyle = gr; g.fill(); g.strokeStyle = dark(base, 0.6); g.lineWidth = 2; g.stroke()
      g.restore()
      return true
    }
    case 'bounce': {
      // a mirror-bright disc that flashes as it turns
      g.save(); g.translate(x, y)
      glowDot(g, 0, 0, r * 2.2, light(c, 0.4), 0.6)
      const sp = Math.cos(frame * 0.35 + s.id)
      g.rotate(a); g.fillStyle = light(c, 0.2); g.beginPath(); g.ellipse(0, 0, r * (0.35 + 0.65 * Math.abs(sp)), r, 0, 0, TAU); g.fill()
      g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke()
      g.restore()
      return true
    }
    case 'orb': case 'ball': case 'blast': case 'sphere': {
      // energy orbs: a glow, a core, and the archetype's mark (a pulsing ring, swirling bands, a shock shell)
      glowDot(g, x, y, r * 2.6, c, 0.6)
      const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r)
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, light(c, 0.35)); gr.addColorStop(1, c)
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill()
      g.save(); g.lineWidth = 2.5
      if (look === 'orb') {
        // the psychic orb: pulsing rings
        for (let k = 0; k < 2; k++) {
          const p = (frame * 0.04 + k / 2) % 1
          g.strokeStyle = hexA(light(c, 0.3), 0.9 * (1 - p))
          g.beginPath(); g.arc(x, y, r * (1.1 + p * 1.4), 0, TAU); g.stroke()
        }
      } else if (look === 'ball' || look === 'sphere') {
        // swirling bands around a ball (Shadow Ball, Electro Ball, Aura Sphere)
        g.translate(x, y); g.rotate(frame * 0.25)
        g.strokeStyle = hexA(look === 'sphere' ? '#9fd8ff' : light(c, 0.5), 0.9)
        for (let k = 0; k < 3; k++) { g.rotate(TAU / 3); g.beginPath(); g.arc(0, 0, r * 1.25, 0, 1.4); g.stroke() }
        if (el === 'Lightning') for (let k = 0; k < 2; k++) { const t = rnd(0, TAU); bolt(g, 0, 0, Math.cos(t) * r * 2, Math.sin(t) * r * 2, '#ffe94a', 2, 0.4, 0) }
      } else {
        // a detonating orb: a crackling shell that swells
        g.strokeStyle = hexA('#ffffff', 0.75); g.setLineDash([4, 5]); g.lineDashOffset = -frame
        g.beginPath(); g.arc(x, y, r * (1.3 + 0.12 * Math.sin(frame * 0.6)), 0, TAU); g.stroke()
      }
      g.restore()
      return true
    }
    default:
      return false
  }
}

/** a wave: a wide wall of water across its heading, with a curling white crest and foam, spray thrown forward */
function wave(v: Vfx, el: string, c: string, s: ShotView): void {
  const { g, frame } = v
  const W = s.wall, D = s.r
  const col = el === 'Water' || el === 'Colorless' ? '#3f8fe0' : c
  g.save(); g.translate(s.x, s.y); g.rotate(s.a)
  const front = (t: number) => D * (1.1 - 0.7 * t * t) + Math.sin(t * 5 + frame * 0.25) * 2.5 // t in -1..1 across
  const back = (t: number) => -D * (3.4 - 1.8 * t * t) + Math.sin(t * 7 - frame * 0.2) * 4
  const N = 16
  // the body: a band thickest in the middle, darker at the back
  g.beginPath()
  for (let i = 0; i <= N; i++) { const t = -1 + (2 * i) / N; g.lineTo(front(t), t * W) }
  for (let i = N; i >= 0; i--) { const t = -1 + (2 * i) / N; g.lineTo(back(t), t * W * 0.96) }
  g.closePath()
  const gr = g.createLinearGradient(-D * 3.4, 0, D, 0)
  gr.addColorStop(0, hexA(dark(col, 0.3), 0.1)); gr.addColorStop(0.4, hexA(col, 0.85)); gr.addColorStop(0.85, hexA(light(col, 0.35), 0.95)); gr.addColorStop(1, hexA(light(col, 0.6), 0.95))
  g.fillStyle = gr; g.fill()
  // the curl: the crest leans forward over the face, a lighter lip with a shadowed hollow under it
  g.beginPath()
  for (let i = 0; i <= N; i++) { const t = -1 + (2 * i) / N; g.lineTo(front(t) + 4, t * W * 0.92) }
  for (let i = N; i >= 0; i--) { const t = -1 + (2 * i) / N; g.lineTo(front(t) - D * 0.5, t * W * 0.92) }
  g.closePath(); g.fillStyle = hexA(dark(col, 0.35), 0.45); g.fill()
  g.lineCap = 'round'; g.lineJoin = 'round'
  g.beginPath()
  for (let i = 0; i <= N; i++) { const t = -1 + (2 * i) / N; g.lineTo(front(t) + 2, t * W * 0.97) }
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 5; g.stroke()
  // foam: bubbling blobs along the lip, and streaks on the back slope
  g.fillStyle = 'rgba(255,255,255,0.9)'
  for (let i = 0; i < 14; i++) {
    const t = -0.95 + (1.9 * i) / 13, f = 0.6 + 0.4 * Math.sin(frame * 0.35 + i * 1.7)
    g.beginPath(); g.arc(front(t) + 1, t * W * 0.97, 2.5 + 2.5 * f, 0, TAU); g.fill()
  }
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2
  for (let i = 0; i < 6; i++) {
    const t = -0.8 + (1.6 * i) / 5, x0 = back(t) * 0.55 + Math.sin(frame * 0.2 + i) * 3
    g.beginPath(); g.moveTo(x0, t * W * 0.8); g.lineTo(x0 - D * 0.9, t * W * 0.8 + 3); g.stroke()
  }
  g.restore()
  // spray thrown up off the crest
  const cx = Math.cos(s.a), cy = Math.sin(s.a), nx = -cy, ny = cx
  for (let k = 0; k < 2; k++) {
    const t = rnd(-1, 1), fx = s.x + cx * D + nx * t * W, fy = s.y + cy * D + ny * t * W
    v.spawn({ x: fx, y: fy, vx: cx * rnd(1.5, 3) + rnd(-0.6, 0.6), vy: cy * rnd(1.5, 3) - rnd(0.5, 2), life: rnd(12, 22), color: k ? '#ffffff' : light(col, 0.5), r: rnd(2, 3.5), kind: 'drop', g: 0.15 })
  }
}

/** a ripple: a broad ring of force rolling forward: nested wavefront arcs across its heading */
function ripple(v: Vfx, el: string, c: string, s: ShotView): void {
  const { g, frame } = v
  g.save(); g.translate(s.x, s.y); g.rotate(s.a)
  g.lineCap = 'round'
  const R = s.wall * 1.25, span = Math.asin(Math.min(1, s.wall / R))
  for (let k = 0; k < 4; k++) {
    const p = (frame * 0.06 + k / 4) % 1
    const back = -p * s.r * 3.5
    g.strokeStyle = hexA(k === 0 ? light(c, 0.6) : c, 0.95 * (1 - p)); g.lineWidth = 4 - p * 2
    g.beginPath(); g.arc(back - R + s.r, 0, R, -span, span); g.stroke()
  }
  g.restore()
  if (el === 'Lightning' && frame % 2 === 0) {
    const cx = Math.cos(s.a), cy = Math.sin(s.a), t1 = rnd(-1, 1), t2 = t1 + rnd(-0.5, 0.5)
    bolt(g, s.x - cy * t1 * s.wall + cx * s.r, s.y + cx * t1 * s.wall + cy * s.r, s.x - cy * t2 * s.wall, s.y + cx * t2 * s.wall, '#ffe94a', 2, 0.4, 0)
  }
}

// ------------------------------------------------------------------ beams

export function drawBeam(v: Vfx, look: string | undefined, el: string, c: string, b: BeamView): boolean {
  const sig = look ? SIG[look]?.beam : undefined
  if (sig) { sig(v, el, c, b); return true }
  const { g, frame } = v
  const { x1, y1, x2, y2, w } = b
  const L = Math.hypot(x2 - x1, y2 - y1), a = Math.atan2(y2 - y1, x2 - x1)
  switch (look) {
    case 'zap':
      // a crackling bolt beam: a fresh zigzag every frame, forked
      bolt(g, x1, y1, x2, y2, el === 'Lightning' ? '#ffe94a' : c, Math.max(4, w * 0.45), 0.22, 2)
      glowDot(g, x2, y2, w * 1.8, '#fff6a0', 0.7)
      return true
    case 'stream': case 'hydro': {
      // a jet of water: a wobbling tube of droplets (Water Gun), or a thick turbulent torrent (Hydro Pump)
      const big = look === 'hydro'
      const col = el === 'Water' || el === 'Colorless' ? '#4aa3f0' : c
      g.save(); g.translate(x1, y1); g.rotate(a)
      const N = Math.max(6, Math.round(L / 14))
      const edge = (side: number) => { for (let i = 0; i <= N; i++) { const x = (i / N) * L, k = Math.min(1, x / 60); g.lineTo(x, side * (w / 2) * (0.5 + 0.5 * k) * (1 + 0.18 * Math.sin(x * 0.09 - frame * 0.8 + side))) } }
      g.beginPath(); edge(-1); for (let i = N; i >= 0; i--) { const x = (i / N) * L, k = Math.min(1, x / 60); g.lineTo(x, (w / 2) * (0.5 + 0.5 * k) * (1 + 0.18 * Math.sin(x * 0.09 - frame * 0.8 + 1))) }
      g.closePath(); g.fillStyle = hexA(col, big ? 0.85 : 0.75); g.fill()
      g.strokeStyle = hexA(dark(col, 0.3), 0.6); g.lineWidth = 2; g.stroke()
      g.fillStyle = 'rgba(235,248,255,0.85)'
      g.fillRect(0, -w * 0.14, L, w * 0.28)
      // droplets streaming along it
      for (let i = 0; i < (big ? 18 : 10); i++) {
        const p = ((frame * (big ? 0.05 : 0.04) + i / (big ? 18 : 10)) % 1), px = p * L, py = Math.sin(i * 2.3) * w * 0.45
        g.beginPath(); g.ellipse(px, py, big ? 7 : 5, big ? 3.5 : 3, 0, 0, TAU); g.fill()
      }
      // the stream breaks into droplets past its end
      if (!big) for (let i = 0; i < 5; i++) { const p = ((frame * 0.08 + i / 5) % 1); g.fillStyle = hexA(col, 0.85 * (1 - p)); g.beginPath(); g.arc(L + p * 36, Math.sin(i * 3.1) * w * 0.6 * p, 4, 0, TAU); g.fill() }
      g.restore()
      if (frame % (big ? 1 : 2) === 0) for (let k = 0; k < (big ? 3 : 1); k++) v.spawn({ x: x2, y: y2, vx: Math.cos(a) * 2 + rnd(-2.5, 2.5), vy: Math.sin(a) * 2 + rnd(-3, 1), life: rnd(14, 24), color: k % 2 ? '#ffffff' : light(col, 0.4), r: rnd(2, big ? 5 : 3), kind: 'drop', g: 0.18 })
      return true
    }
    case 'drain': {
      // a siphoning tether: a wavy line, motes of life flowing back to the caster
      g.save(); g.lineCap = 'round'
      g.strokeStyle = hexA(c, 0.6); g.lineWidth = 3
      g.beginPath()
      for (let i = 0; i <= 24; i++) { const t = i / 24, o = Math.sin(t * 12 - frame * 0.3) * w * 0.4 * Math.sin(Math.PI * t); g.lineTo(x1 + (x2 - x1) * t - Math.sin(a) * o, y1 + (y2 - y1) * t + Math.cos(a) * o) }
      g.stroke()
      for (let i = 0; i < 6; i++) {
        const t = 1 - ((frame * 0.03 + i / 6) % 1)
        glowDot(g, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 9, '#9be870', 0.9)
      }
      g.restore()
      return true
    }
    case 'beam': case 'pulse': case 'hyperbeam': case 'solar': {
      // a solid line of light; the big ones wider with a bright core, Dragon Pulse rings riding it, Solar Beam motes
      const big = look === 'hyperbeam' || look === 'solar'
      const flick = rnd(0.9, 1.1)
      g.save(); g.lineCap = 'round'; g.globalCompositeOperation = 'lighter'
      g.strokeStyle = hexA(c, 0.3); g.lineWidth = w * (big ? 2.6 : 2) * flick
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke()
      g.strokeStyle = hexA(look === 'solar' ? '#fff27a' : c, 0.9); g.lineWidth = w * flick; g.stroke()
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = Math.max(3, w * (big ? 0.55 : 0.35) * flick); g.stroke()
      if (look === 'pulse') {
        g.translate(x1, y1); g.rotate(a)
        for (let i = 0; i < 5; i++) {
          const p = (frame * 0.05 + i / 5) % 1
          g.strokeStyle = hexA(light(c, 0.4), 0.8 * (1 - p * 0.5)); g.lineWidth = 3
          g.beginPath(); g.ellipse(p * L, 0, 6, w * 0.9, 0, 0, TAU); g.stroke()
        }
      }
      g.restore()
      glowDot(g, x1 + Math.cos(a) * 18, y1 + Math.sin(a) * 18, w * 1.3, light(c, 0.4), 0.8)
      glowDot(g, x2, y2, w * 1.6, light(c, 0.4), 0.8)
      if (look === 'solar' && frame % 2 === 0) { const t = Math.random(); v.spawn({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, vx: rnd(-1, 1), vy: rnd(-1.5, -0.3), life: 26, color: '#fff27a', r: 3, kind: 'star', g: -0.02 }) }
      return true
    }
    default:
      return false
  }
}

// ------------------------------------------------------------------ areas

/** an area by its look; false: not a look this knows (the renderer draws its plain dashed circle) */
export function drawArea(v: Vfx, look: string | undefined, el: string, c: string, a: AreaView): boolean {
  const sig = look ? SIG[look] : undefined
  if (sig?.area) { sig.area(v, el, c, a); return true }
  if (sig?.air) return true // all of it is up in the air (drawAreaAir)
  const { g, frame } = v
  const { x, y, r, fade } = a
  const landed = a.land <= 0, since = -a.land
  const warn = () => {
    // the telegraph before it lands: a shadow that darkens, a pulsing edge
    const k = Math.max(0, Math.min(1, 1 - a.land / 30))
    g.save()
    g.fillStyle = `rgba(0,0,0,${0.1 + 0.18 * k})`; g.beginPath(); g.arc(x, y, r * (0.4 + 0.6 * k), 0, TAU); g.fill()
    g.strokeStyle = hexA(c, 0.5 + 0.4 * Math.sin(frame * 0.5)); g.lineWidth = 3; g.setLineDash([12, 8]); g.lineDashOffset = -frame
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke()
    g.restore()
  }
  switch (look) {
    case 'thunder': {
      if (!landed) { warn(); return true }
      // the strike (the bolt itself is drawn over the fighters: drawAreaAir): a flash, a scorch ring
      if (since < 10) glowDot(g, x, y, r * 1.3, '#fffbd0', 0.8 * (1 - since / 10))
      g.save(); g.strokeStyle = hexA(el === 'Lightning' ? '#ffe94a' : c, 0.8 * fade); g.lineWidth = 4
      g.beginPath(); g.arc(x, y, r * Math.min(1, 0.4 + since / 12), 0, TAU); g.stroke(); g.restore()
      if (since < 3) for (let k = 0; k < 6; k++) { const t = rnd(0, TAU); v.spawn({ x, y, vx: Math.cos(t) * 5, vy: Math.sin(t) * 5, life: 14, color: '#fff6a0', r: 3, kind: 'spark', g: 0 }) }
      return true
    }
    case 'rain': {
      // a cloudburst: a cloud over the spot, drops streaking down inside it, splashes on the ground
      if (!landed) warn()
      else { g.fillStyle = hexA('#2f6fc0', 0.25 * fade); g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, TAU); g.fill() }
      if (frame % 2 === 0) { const t = rnd(0, TAU), rr = rnd(0, r * 0.8); v.spawn({ x: x + Math.cos(t) * rr, y: y + Math.sin(t) * rr * 0.6, vx: rnd(-1, 1), vy: rnd(-1.8, -0.8), life: 12, color: '#bfe6ff', r: 2, kind: 'drop', g: 0.2 }) }
      return true
    }
    case 'hazard': case 'vortex': {
      // a storm or a whirlpool: spiral arms turning round a dark eye, debris of its element
      const col = look === 'vortex' && el === 'Water' ? '#3f8fe0' : c
      g.save(); g.translate(x, y)
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r)
      gr.addColorStop(0, hexA(dark(col, 0.5), 0.65 * fade)); gr.addColorStop(0.6, hexA(col, 0.35 * fade)); gr.addColorStop(1, hexA(col, 0.05))
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill()
      g.rotate(frame * (look === 'vortex' ? 0.09 : 0.06))
      g.lineCap = 'round'
      for (let k = 0; k < 4; k++) {
        g.rotate(TAU / 4)
        g.beginPath()
        for (let i = 0; i <= 20; i++) { const t = i / 20, rr = r * (0.12 + 0.88 * t), an = t * 3.2; g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr * (look === 'hazard' ? 0.85 : 1)) }
        g.strokeStyle = hexA(k % 2 ? light(col, 0.4) : dark(col, 0.15), 0.9 * fade); g.lineWidth = look === 'vortex' ? 7 : 6; g.stroke()
      }
      g.restore()
      if (frame % 2 === 0) {
        const t = rnd(0, TAU), rr = rnd(r * 0.3, r)
        v.spawn({ x: x + Math.cos(t) * rr, y: y + Math.sin(t) * rr, vx: -Math.sin(t) * 3, vy: Math.cos(t) * 3, life: 22, color: light(col, 0.3), r: 3, kind: pkind(el), g: 0 })
      }
      if (look === 'hazard' && el === 'Lightning' && Math.random() < 0.1) bolt(g, x + rnd(-r, r) * 0.5, y - r * 0.6, x + rnd(-r, r) * 0.5, y + r * 0.3, '#ffe94a', 2.5, 0.3, 0)
      return true
    }
    case 'quake': {
      // a shockwave through the ground: radial cracks (the same every frame), a rolling ring, dust
      const k = Math.min(1, (a.ticks + 12 - a.t) / 14)
      g.save(); g.translate(x, y)
      g.strokeStyle = `rgba(50,32,20,${0.75 * fade})`; g.lineWidth = 3; g.lineJoin = 'round'
      for (let i = 0; i < 9; i++) {
        const t0 = (i / 9) * TAU + hash(a.id, i) * 0.6
        g.beginPath(); g.moveTo(0, 0)
        let px = 0, py = 0
        for (let j = 1; j <= 4; j++) { const rr = r * k * (j / 4) * (0.7 + 0.3 * hash(a.id, i * 7 + j)), tt = t0 + (hash(a.id, i * 13 + j) - 0.5) * 0.5; px = Math.cos(tt) * rr; py = Math.sin(tt) * rr; g.lineTo(px, py) }
        g.stroke()
      }
      g.strokeStyle = hexA(el === 'Fighting' ? '#d0803e' : c, 0.8 * fade); g.lineWidth = 6 * (1 - k) + 2
      g.beginPath(); g.arc(0, 0, r * k, 0, TAU); g.stroke()
      g.restore()
      if (frame % 2 === 0 && k < 1) for (let j = 0; j < 3; j++) { const t = rnd(0, TAU); v.spawn({ x: x + Math.cos(t) * r * k, y: y + Math.sin(t) * r * k, vx: Math.cos(t) * 1.5, vy: -rnd(0.5, 1.5), life: 30, color: '#b8a080', r: 8, kind: 'smoke', g: -0.01 }) }
      return true
    }
    case 'surf': {
      // a great wave surging out from you: a ring of water with a white crest racing outward
      const k = Math.min(1, (a.ticks + 12 - a.t) / 16)
      const col = el === 'Water' || el === 'Colorless' ? '#3f8fe0' : c
      g.save()
      g.strokeStyle = hexA(col, 0.6 * fade); g.lineWidth = 26 * (1 - k * 0.5)
      g.beginPath(); g.arc(x, y, Math.max(1, r * k - 10), 0, TAU); g.stroke()
      g.strokeStyle = `rgba(255,255,255,${0.9 * fade})`; g.lineWidth = 5
      g.beginPath(); g.arc(x, y, r * k, 0, TAU); g.stroke()
      g.fillStyle = `rgba(255,255,255,${0.85 * fade})`
      for (let i = 0; i < 24; i++) { const t = (i / 24) * TAU + frame * 0.02; g.beginPath(); g.arc(x + Math.cos(t) * r * k, y + Math.sin(t) * r * k, 3 + 2 * Math.sin(frame * 0.4 + i), 0, TAU); g.fill() }
      g.restore()
      if (k < 1) for (let j = 0; j < 3; j++) { const t = rnd(0, TAU); v.spawn({ x: x + Math.cos(t) * r * k, y: y + Math.sin(t) * r * k, vx: Math.cos(t) * 3, vy: Math.sin(t) * 3 - 1.5, life: 18, color: '#e8f6ff', r: 3, kind: 'drop', g: 0.15 }) }
      return true
    }
    case 'sound': case 'roar': {
      // a sound ring: arcs of sound rolling out, one after another
      g.save(); g.lineCap = 'round'
      for (let i = 0; i < 4; i++) {
        const p = (frame * 0.04 + i / 4) % 1
        g.beginPath(); g.arc(x, y, r * p, 0, TAU)
        g.strokeStyle = `rgba(40,30,50,${0.35 * (1 - p) * fade})`; g.lineWidth = 9 * (1 - p) + 3; g.stroke()
        g.strokeStyle = hexA(light(c, 0.2), 0.95 * (1 - p) * fade); g.lineWidth = 6 * (1 - p) + 1.5; g.stroke()
      }
      g.restore()
      return true
    }
    case 'nova': case 'explode': {
      // a burst all around: rays and a bright flash that fades, a hot shell
      const k = Math.min(1, (a.ticks + 12 - a.t) / 12)
      g.save(); g.translate(x, y); g.globalCompositeOperation = 'lighter'
      glowDot(g, 0, 0, r * (0.5 + 0.6 * k), look === 'explode' ? '#ffd24a' : light(c, 0.3), 0.8 * fade * (1 - k * 0.6))
      g.strokeStyle = hexA(light(c, 0.5), 0.7 * fade); g.lineWidth = 3
      for (let i = 0; i < 14; i++) { const t = (i / 14) * TAU + hash(a.id, i); g.beginPath(); g.moveTo(Math.cos(t) * r * 0.2 * k, Math.sin(t) * r * 0.2 * k); g.lineTo(Math.cos(t) * r * k, Math.sin(t) * r * k); g.stroke() }
      g.strokeStyle = hexA(c, 0.9 * fade); g.lineWidth = 5; g.beginPath(); g.arc(0, 0, r * k, 0, TAU); g.stroke()
      g.restore()
      if (look === 'explode' && frame % 2 === 0) v.spawn({ x: x + rnd(-r, r) * 0.4, y: y + rnd(-r, r) * 0.4, vx: rnd(-0.5, 0.5), vy: rnd(-1.5, -0.3), life: 40, color: '#4a3a34', r: 16, kind: 'smoke', g: -0.02 })
      return true
    }
    case 'gas': case 'powder': case 'cloud': {
      // a lingering cloud: soft puffs drifting in place (powder sparkles)
      const col = look === 'gas' && (el === 'Grass' || el === 'Darkness') ? '#8a5ab0' : look === 'powder' ? light(c, 0.2) : c
      for (let i = 0; i < 9; i++) {
        const t = hash(a.id, i) * TAU + frame * 0.01 * (i % 2 ? 1 : -1), rr = r * 0.55 * hash(a.id, i + 20)
        const px = x + Math.cos(t) * rr, py = y + Math.sin(t) * rr * 0.8
        glowDot(g, px, py, r * (0.5 + 0.2 * Math.sin(frame * 0.05 + i)), col, 0.6 * fade)
      }
      if (frame % 3 === 0) { const t = rnd(0, TAU), rr = rnd(0, r * 0.8); v.spawn({ x: x + Math.cos(t) * rr, y: y + Math.sin(t) * rr, vx: rnd(-0.2, 0.2), vy: -0.3, life: 30, color: look === 'powder' ? '#fff6c0' : light(col, 0.3), r: look === 'powder' ? 2 : 6, kind: look === 'powder' ? 'star' : 'smoke', g: -0.005 }) }
      return true
    }
    case 'rockslide': case 'meteor': {
      // rocks falling from above: a growing shadow, a rock dropping onto it, then debris
      if (!landed) { warn(); return true } // the rock itself falls over the fighters: drawAreaAir
      g.save(); g.strokeStyle = `rgba(60,40,24,${0.6 * fade})`; g.lineWidth = 3
      g.beginPath(); g.arc(x, y, r * Math.min(1, 0.5 + since / 10), 0, TAU); g.stroke(); g.restore()
      if (since < 2) for (let k = 0; k < 8; k++) { const t = rnd(0, TAU); v.spawn({ x, y, vx: Math.cos(t) * rnd(2, 5), vy: Math.sin(t) * rnd(2, 5) - 2, life: 26, color: ['#9a8a74', '#6a5a48', '#c8b89c'][k % 3], r: rnd(3, 6), kind: 'shard', g: 0.25 }) }
      return true
    }
    case 'pillar': case 'max': {
      // a column: the telegraph, then a pillar of the element rising out of (or crashing down onto) the spot
      if (!landed) { warn(); return true } // the column rises over the fighters: drawAreaAir
      g.save(); g.strokeStyle = hexA(c, 0.8 * fade); g.lineWidth = 5; g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, TAU); g.stroke(); g.restore()
      if (since < 8) v.spawn({ x: x + rnd(-r, r) * 0.6, y, vx: rnd(-1, 1), vy: -rnd(2, 5), life: 24, color: light(c, 0.4), r: 4, kind: pkind(el), g: 0.05 })
      return true
    }
    default:
      return false
  }
}

/** the part of an area up in the air, drawn over the fighters: a storm cloud and its bolt, a rain cloud and its
 * drops, a falling rock, a rising column */
export function drawAreaAir(v: Vfx, look: string | undefined, el: string, c: string, a: AreaView): void {
  const sig = look ? SIG[look] : undefined
  if (sig?.air) { sig.air(v, el, c, a); return }
  if (sig?.area) return
  const { g, frame } = v
  const { x, y, r, fade } = a
  const landed = a.land <= 0, since = -a.land
  switch (look) {
    case 'thunder':
      cloud(g, x, y - 150, r * 0.9, a.id, '#3a3f52', 0.6 * fade)
      if (!landed) { if (Math.random() < 0.08) bolt(g, x + rnd(-r, r) * 0.5, y - 150, x + rnd(-r, r) * 0.6, y - 100, '#fff6a0', 2, 0.3, 0) }
      else if (since < 10) bolt(g, x + rnd(-10, 10), y - 150, x, y, el === 'Lightning' ? '#ffe94a' : c, 12 - since * 0.8, 0.14, 3)
      return
    case 'rain': {
      cloud(g, x, y - 90, r * 1.05, a.id, '#6e7c92', 0.8 * fade)
      g.save(); g.strokeStyle = hexA('#2f6fc0', 0.95 * fade); g.lineWidth = 3.5; g.lineCap = 'round'
      g.beginPath()
      const n = landed ? 26 : 10
      for (let i = 0; i < n; i++) {
        const px = x + (hash(a.id, i) * 2 - 1) * r * 0.9, fall = ((frame * 0.07 + hash(a.id, i + 40)) % 1)
        const py = y - 80 + fall * (80 + r * 0.7)
        g.moveTo(px, py); g.lineTo(px - 4, py + 18)
      }
      g.stroke(); g.restore()
      return
    }
    case 'rockslide': case 'meteor': {
      if (landed) return
      const k = Math.max(0, Math.min(1, 1 - a.land / 24))
      const drop = (1 - k) * 170
      g.save(); g.translate(x, y - drop); g.rotate(frame * 0.1 + a.id)
      const R = r * 0.6
      g.beginPath(); for (let i = 0; i < 8; i++) { const t = (i / 8) * TAU, rr = R * (0.8 + 0.35 * hash(a.id, i)); g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) } g.closePath()
      const gr = g.createLinearGradient(-R, -R, R, R); gr.addColorStop(0, '#c8b89c'); gr.addColorStop(1, '#5a4a3a')
      g.fillStyle = look === 'meteor' ? c : gr; g.fill(); g.strokeStyle = '#3a2e22'; g.lineWidth = 2.5; g.stroke()
      g.restore()
      if (look === 'meteor') glowDot(g, x, y - drop, r * 0.9, '#ffb340', 0.5)
      return
    }
    case 'pillar': case 'max': {
      if (!landed) return
      const k = Math.max(0, 1 - since / 16)
      const H = look === 'max' ? 520 : 200
      g.save(); g.globalCompositeOperation = 'lighter'
      const gr = g.createLinearGradient(0, y - H, 0, y)
      gr.addColorStop(0, hexA(c, 0)); gr.addColorStop(0.6, hexA(light(c, 0.3), 0.7 * k)); gr.addColorStop(1, hexA('#ffffff', 0.9 * k))
      g.fillStyle = gr
      const w = r * (look === 'max' ? 1.2 : 0.9) * (0.7 + 0.3 * k)
      g.beginPath(); g.moveTo(x - w * 0.6, y - H); g.lineTo(x + w * 0.6, y - H); g.lineTo(x + w, y); g.ellipse(x, y, w, w * 0.35, 0, 0, Math.PI); g.lineTo(x - w, y); g.closePath(); g.fill()
      g.restore()
      return
    }
  }
}


// ------------------------------------------------------------------ cones

/** a cone by its look (k: 0 -> 1 over the swing's life); false: the plain crescent */
export function drawCone(v: Vfx, look: string | undefined, el: string, c: string, w: ConeView): boolean {
  const sig = look ? SIG[look]?.cone : undefined
  if (sig) { sig(v, el, c, w); return true }
  const { g, frame } = v
  const { x, y, aim, range, arc, k } = w
  const fade = 1 - Math.max(0, k - 0.4) / 0.6
  const reach = range * Math.min(1, 0.35 + k * 1.3)
  const fan = (fill: string, alpha: number) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, reach)
    gr.addColorStop(0, hexA(fill, alpha)); gr.addColorStop(1, hexA(fill, 0))
    g.fillStyle = gr; g.beginPath(); g.moveTo(x, y); g.arc(x, y, reach, aim - arc / 2, aim + arc / 2); g.closePath(); g.fill()
  }
  // particles thrown through the cone: the renderer's drag (x0.93 a frame) stops them about 13 speeds out, so the
  // speed comes from the cone's range
  const spray = (n: number, kind: VfxParticle['kind'], colors: string[], _speed: number, life: number, r: number, gr = 0) => {
    for (let i = 0; i < n; i++) {
      const t = aim + rnd(-0.5, 0.5) * arc, sp = rnd(0.6, 1.05) * (range / 12)
      v.spawn({ x: x + Math.cos(t) * 20, y: y + Math.sin(t) * 20, vx: Math.cos(t) * sp, vy: Math.sin(t) * sp, life, color: colors[i % colors.length], r, kind, g: gr })
    }
  }
  const life = (_sp: number) => 48
  switch (look) {
    case 'breath': case 'flame': case 'heat': {
      const hot = el === 'Fire' || look !== 'breath' ? ['#fff0a0', '#ffb340', '#ff6a1e'] : [light(c, 0.6), light(c, 0.3), c]
      g.save(); g.globalCompositeOperation = 'lighter'; fan(hot[1], 0.45 * fade)
      if (look === 'heat') { g.strokeStyle = hexA('#fff0a0', 0.5 * fade); g.lineWidth = 3; for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(x, y, reach * i / 3 + Math.sin(frame * 0.4 + i) * 4, aim - arc / 2, aim + arc / 2); g.stroke() } }
      g.restore()
      if (k < 0.6) spray(look === 'flame' ? 5 : 4, el === 'Fire' || look !== 'breath' ? 'ember' : pkind(el), hot, 9, life(9) / 2, look === 'flame' ? 6 : 5, -0.02)
      return true
    }
    case 'snow': {
      g.save(); fan('#e8f6ff', 0.4 * fade); g.restore()
      if (k < 0.6) spray(5, 'star', ['#ffffff', '#cfeaff', '#a8d8ff'], 7, life(7) / 2, 4, 0)
      return true
    }
    case 'mud': {
      g.save(); fan('#8a6a3a', 0.3 * fade); g.restore()
      if (k < 0.3) spray(4, 'drop', ['#7a5a30', '#5a4020', '#9a7a48'], 8, life(8) / 2, 6, 0.08)
      // splats where the mud lands
      g.save()
      for (let i = 0; i < 6; i++) {
        const t = aim + (hash(i, Math.round(x)) - 0.5) * arc, rr = range * (0.5 + 0.5 * hash(i + 9, Math.round(y)))
        g.fillStyle = `rgba(90,64,32,${0.75 * fade})`
        g.beginPath(); g.ellipse(x + Math.cos(t) * rr, y + Math.sin(t) * rr, 9, 6, t, 0, TAU); g.fill()
      }
      g.restore()
      return true
    }
    case 'gust': {
      // wind: curling streaks sweeping out through the cone
      g.save(); g.lineCap = 'round'
      for (let i = 0; i < 6; i++) {
        const t = aim + ((i + 0.5) / 6 - 0.5) * arc, r0 = reach * (0.2 + 0.15 * (i % 3)), r1 = reach
        g.strokeStyle = hexA(el === 'Colorless' ? '#9fb8c8' : c, 0.85 * fade); g.lineWidth = 3.5
        g.beginPath(); g.arc(x, y, (r0 + r1) / 2, t - 0.18, t + 0.18); g.stroke()
        g.beginPath(); g.moveTo(x + Math.cos(t) * r0, y + Math.sin(t) * r0); g.quadraticCurveTo(x + Math.cos(t + 0.2) * (r0 + r1) / 2, y + Math.sin(t + 0.2) * (r0 + r1) / 2, x + Math.cos(t) * r1, y + Math.sin(t) * r1); g.stroke()
      }
      g.restore()
      if (k < 0.5) spray(2, el === 'Grass' ? 'leaf' : 'dot', ['#ffffff', light(c, 0.5)], 10, life(10) / 2, 3, 0)
      return true
    }
    case 'glare': {
      // a glare: a narrow beam of menace from a pair of eyes
      g.save(); fan(el === 'Darkness' ? '#a02040' : c, 0.35 * fade)
      g.fillStyle = hexA('#ff4060', fade)
      const ex = x + Math.cos(aim) * 26, ey = y + Math.sin(aim) * 26, px = -Math.sin(aim) * 8, py = Math.cos(aim) * 8
      g.beginPath(); g.ellipse(ex + px, ey + py, 5, 3, aim, 0, TAU); g.ellipse(ex - px, ey - py, 5, 3, aim, 0, TAU); g.fill()
      g.restore()
      return true
    }
    case 'roar': case 'sound': {
      g.save(); g.lineCap = 'round'
      for (let i = 0; i < 4; i++) {
        const p = (k * 1.5 + i / 4) % 1
        g.beginPath(); g.arc(x, y, range * p, aim - arc / 2, aim + arc / 2)
        g.strokeStyle = `rgba(40,30,50,${0.35 * (1 - p) * fade})`; g.lineWidth = 8; g.stroke()
        g.strokeStyle = hexA(light(c, 0.2), 0.95 * (1 - p) * fade); g.lineWidth = 5; g.stroke()
      }
      g.restore()
      return true
    }
    default:
      return false
  }
}
