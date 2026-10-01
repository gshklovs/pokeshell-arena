// Signature-move looks: psychic and fairy (docs/VFX.md "Signature moves"; the sim side is src/sim/signatures.ts).
// Each move has its own shape language: Psychic a violet mind-orb in psionic rings that warps the air, Power Gem a
// spinning prismatic cut gem (never an orb) that refracts into splinters, Psyshot a quick magenta dart, Confuse Ray a
// woozy swirl orbited by dizzy stars, hearts and musical notes, a pale moon, a rainbow flash, a glittering breeze.
import { TAU, dark, glowDot, hash, hexA, light, rnd, star, type ShotView, type Vfx } from '../vfxkit'
import type { SigDraw } from './types'

/** a prism's spectrum, red to violet */
const RAINBOW = ['#ff5a7a', '#ffa040', '#ffe45a', '#6ee07a', '#4ac8ff', '#6f86ff', '#c77aff']
/** the mind-orb's violets (whatever the attacker's type: Psychic is a violet move) */
const PSY = { core: '#fbeaff', mid: '#d59cff', rim: '#8a3fd0', deep: '#3e1470', ring: '#ff9fe8' }

/** a soft contact shadow under a shot */
function shadow(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(x, y + r * 1.1, r * 0.9, r * 0.35, 0, 0, TAU); g.fill()
}
/** a four-point glint (a sparkle), centred at the origin */
function glint(g: CanvasRenderingContext2D, r: number): void { star(g, r, 4, 0.18) }
/** a heart centred at the origin, about 2r wide, point down */
function heart(g: CanvasRenderingContext2D, r: number): void {
  g.beginPath()
  g.moveTo(0, r * 0.95)
  g.bezierCurveTo(-r * 1.25, r * 0.1, -r * 1.05, -r * 1.05, 0, -r * 0.4)
  g.bezierCurveTo(r * 1.05, -r * 1.05, r * 1.25, r * 0.1, 0, r * 0.95)
  g.closePath()
}
/** a wobbly ring (air rippling), radius R, `n` lobes turning with `ph` */
function warpRing(g: CanvasRenderingContext2D, x: number, y: number, R: number, n: number, amp: number, ph: number): void {
  g.beginPath()
  for (let i = 0; i <= 32; i++) { const t = (i / 32) * TAU, rr = R * (1 + amp * Math.sin(t * n + ph)); g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr) }
  g.closePath()
}
/** a musical note at the origin, head radius r: 0 an eighth note, 1 two beamed eighths, 2 a quarter note */
function note(g: CanvasRenderingContext2D, r: number, kind: number, fill: string, edge: string): void {
  const head = (hx: number, hy: number) => { g.moveTo(hx + r, hy); g.ellipse(hx, hy, r, r * 0.72, -0.4, 0, TAU) }
  const H = r * 3.2, sw = Math.max(2, r * 0.32)
  g.beginPath()
  if (kind === 1) {
    head(-r * 1.1, r * 0.5); head(r * 1.4, r * 0.1)
    g.rect(-r * 0.25 - sw / 2, r * 0.5 - H, sw, H); g.rect(r * 2.25 - sw / 2, r * 0.1 - H, sw, H)
    g.moveTo(-r * 0.25 - sw / 2, r * 0.5 - H); g.lineTo(r * 2.25 + sw / 2, r * 0.1 - H); g.lineTo(r * 2.25 + sw / 2, r * 0.1 - H + r * 0.8); g.lineTo(-r * 0.25 - sw / 2, r * 0.5 - H + r * 0.8); g.closePath()
  } else {
    head(0, 0)
    g.rect(r * 0.85 - sw / 2, -H, sw, H)
    if (kind === 0) { g.moveTo(r * 0.85, -H); g.quadraticCurveTo(r * 2.1, -H * 0.62, r * 1.6, -H * 0.2); g.quadraticCurveTo(r * 1.7, -H * 0.55, r * 0.85, -H * 0.62); g.closePath() }
  }
  g.fillStyle = fill; g.strokeStyle = edge; g.lineWidth = 3.5; g.lineJoin = 'round'
  g.stroke(); g.fill()
}

/** the Psychic mind-orb: a pale-cored violet orb in two gyroscopic psionic rings, the air warping around it, a
 * glowing tail along the bend it just took (the homing) */
function psychicShot(v: Vfx, _el: string, _c: string, s: ShotView): void {
  const { g, frame } = v
  const { x, y } = s, r = Math.max(9, s.r) * 1.35
  shadow(g, x, y, r)
  g.save(); g.globalCompositeOperation = 'lighter'
  // the tail follows the drawn trail, so its curve shows the bend toward the foe
  const t = s.trail
  for (let i = 0; i < t.length; i++) { const k = (i + 1) / t.length; glowDot(g, t[i].x, t[i].y, r * (0.5 + 0.9 * k), i % 2 ? PSY.ring : PSY.mid, 0.28 * k) }
  // rippling distortion: warped rings rolling out from the orb
  g.lineWidth = 2.5
  for (let k = 0; k < 3; k++) {
    const p = (frame * 0.035 + k / 3 + s.id * 0.1) % 1
    g.strokeStyle = hexA(k % 2 ? PSY.ring : PSY.mid, 0.7 * (1 - p))
    warpRing(g, x, y, r * (1.15 + p * 1.7), 5, 0.07, frame * 0.25 + k * 2); g.stroke()
  }
  glowDot(g, x, y, r * 2.5, PSY.rim, 0.55)
  g.restore()
  // the orb
  const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.3, 0, x, y, r)
  gr.addColorStop(0, PSY.core); gr.addColorStop(0.35, PSY.mid); gr.addColorStop(0.8, PSY.rim); gr.addColorStop(1, PSY.deep)
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill()
  // two psionic rings turning round it like a gyroscope
  g.save(); g.translate(x, y); g.globalCompositeOperation = 'lighter'; g.lineWidth = 2.5
  for (let k = 0; k < 2; k++) {
    g.save(); g.rotate(frame * (k ? -0.06 : 0.08) + k * 1.3)
    g.strokeStyle = hexA(k ? '#ffffff' : PSY.ring, 0.85)
    g.beginPath(); g.ellipse(0, 0, r * 1.5, r * 0.42, 0, 0, TAU); g.stroke()
    g.restore()
  }
  g.restore()
  if (frame % 3 === 0) v.spawn({ x: x + rnd(-r, r) * 0.6, y: y + rnd(-r, r) * 0.6, vx: rnd(-0.6, 0.6), vy: rnd(-0.8, 0), life: 22, color: PSY.ring, r: 3, kind: 'star', g: -0.02 })
}

/** Power Gem: a brilliant-cut gem spinning end over end, every facet a colour of the spectrum and the colours running
 * round it, a white glint hopping from vertex to vertex, a dispersed red/green/blue streak behind it. Its split
 * splinters (s.kid) are tiny prismatic slivers with a glint each */
function gemShot(v: Vfx, _el: string, _c: string, s: ShotView): void {
  const { g, frame } = v
  const { x, y, a } = s
  if (s.kid) {
    const r = Math.max(5, s.r) * 1.8, col = RAINBOW[s.id % RAINBOW.length]
    const t = s.trail, tail = t[Math.max(0, t.length - 4)] ?? { x: x - Math.cos(a) * 20, y: y - Math.sin(a) * 20 }
    g.save(); g.lineCap = 'round'; g.globalCompositeOperation = 'lighter'
    g.strokeStyle = hexA(col, 0.6); g.lineWidth = 2.5; g.beginPath(); g.moveTo(tail.x, tail.y); g.lineTo(x, y); g.stroke()
    glowDot(g, x, y, r * 1.8, col, 0.5)
    g.restore()
    g.save(); g.translate(x, y); g.rotate(a)
    g.beginPath(); g.moveTo(r * 1.5, 0); g.lineTo(0, -r * 0.45); g.lineTo(-r * 1.1, 0); g.lineTo(0, r * 0.45); g.closePath()
    g.fillStyle = col; g.fill(); g.strokeStyle = 'rgba(40,30,80,0.85)'; g.lineWidth = 1.5; g.stroke()
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.moveTo(r * 1.5, 0); g.lineTo(0, -r * 0.45); g.lineTo(0, 0); g.closePath(); g.fill()
    if ((frame + s.id) % 6 < 3) { g.globalCompositeOperation = 'lighter'; g.fillStyle = '#ffffff'; g.translate(r * 0.4, 0); g.rotate(-a + frame * 0.2); glint(g, r * 1.3); g.fill() }
    g.restore()
    return
  }
  const r = Math.max(9, s.r) * 1.35, R = r * 2
  shadow(g, x, y, r)
  // dispersion: the light it carries splits into red, green and blue streaks along its trail
  const t = s.trail
  if (t.length > 2) {
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round'
    const nx = -Math.sin(a), ny = Math.cos(a)
    const bands: [string, number][] = [['#ff4a6a', -1], ['#5aff8a', 0], ['#4a8aff', 1]]
    for (const [col, o] of bands) {
      g.beginPath()
      for (let i = 0; i < t.length; i++) { const k = i / t.length, off = o * R * 0.45 * (1 - k * 0.6); g.lineTo(t[i].x + nx * off, t[i].y + ny * off) }
      g.lineTo(x, y)
      g.strokeStyle = hexA(col, 0.6); g.lineWidth = R * 0.3; g.stroke()
    }
    g.restore()
  }
  g.save(); g.globalCompositeOperation = 'lighter'
  glowDot(g, x, y, R * 1.9, RAINBOW[Math.floor(frame / 3) % RAINBOW.length], 0.5)
  g.restore()
  // the gem: an octagonal crown of facets round a bright table, spinning and tumbling (the x squash flips it)
  g.save(); g.translate(x, y); g.rotate(frame * 0.12 + s.id)
  g.scale(0.6 + 0.4 * Math.abs(Math.cos(frame * 0.17 + s.id)), 1)
  const N = 8, shift = Math.floor(frame / 2)
  const P = (i: number, k: number): [number, number] => { const an = (i / N) * TAU + Math.PI / N; return [Math.cos(an) * R * k, Math.sin(an) * R * k] }
  for (let i = 0; i < N; i++) {
    const [ax, ay] = P(i, 1), [bx, by] = P(i + 1, 1), [cx2, cy2] = P(i + 1, 0.5), [dx, dy] = P(i, 0.5)
    const col = RAINBOW[(i + shift) % RAINBOW.length]
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx2, cy2); g.lineTo(dx, dy); g.closePath()
    g.fillStyle = i % 2 ? col : dark(col, 0.2); g.fill()
  }
  // the table: a pale face with a sheen
  g.beginPath(); for (let i = 0; i < N; i++) { const [px, py] = P(i, 0.5); g.lineTo(px, py) } g.closePath()
  const tg = g.createLinearGradient(-R * 0.5, -R * 0.5, R * 0.5, R * 0.5)
  tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.5, '#e6f4ff'); tg.addColorStop(1, '#ffd8f4')
  g.fillStyle = tg; g.fill()
  // the facet edges: white lines, the girdle outlined darker so it reads as a cut stone
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.3
  g.beginPath()
  for (let i = 0; i < N; i++) { const [ax, ay] = P(i, 1), [dx, dy] = P(i, 0.5); g.moveTo(ax, ay); g.lineTo(dx, dy) }
  g.stroke()
  g.beginPath(); for (let i = 0; i < N; i++) { const [px, py] = P(i, 1); g.lineTo(px, py) } g.closePath()
  g.strokeStyle = 'rgba(40,30,80,0.9)'; g.lineWidth = 2.5; g.stroke()
  g.restore()
  // a glint hopping round its vertices, plus a big flare now and then
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = '#ffffff'
  const gi = Math.floor(frame / 4) % 8, ga = (gi / 8) * TAU + frame * 0.12 + s.id
  g.translate(x + Math.cos(ga) * R * 0.8, y + Math.sin(ga) * R * 0.8); glint(g, R * 0.75); g.fill()
  g.restore()
  if ((frame + s.id) % 14 < 3) { g.save(); g.globalCompositeOperation = 'lighter'; g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = 'rgba(255,255,255,0.9)'; glint(g, R * 1.9); g.fill(); g.restore() }
  // rainbow sparkles shed behind
  v.spawn({ x: x + rnd(-R, R) * 0.7, y: y + rnd(-R, R) * 0.7, vx: -Math.cos(a) * 1.2 + rnd(-0.8, 0.8), vy: -Math.sin(a) * 1.2 + rnd(-0.8, 0.8), life: rnd(14, 22), color: RAINBOW[frame % RAINBOW.length], r: rnd(3, 5), kind: 'star', g: 0 })
}

/** Psyshot: a quick magenta dart, a needle of light with a long thin streak, leaving little rings in its wake */
function psyshotShot(v: Vfx, _el: string, _c: string, s: ShotView): void {
  const { g, frame } = v
  const { x, y, a } = s, r = Math.max(9, s.r) * 1.35
  const cx = Math.cos(a), cy = Math.sin(a)
  // the wake: rings standing across the path at points it just passed, growing and fading
  const t = s.trail
  g.save(); g.lineWidth = 2
  for (let j = 1; j <= 3; j++) {
    const i = t.length - 1 - j * 3
    if (i < 0) break
    const k = j / 3
    g.save(); g.translate(t[i].x, t[i].y); g.rotate(a)
    g.strokeStyle = hexA(j % 2 ? '#ff7ad8' : '#ffc8f0', 0.85 * (1 - k * 0.6))
    g.beginPath(); g.ellipse(0, 0, r * 0.3, r * (0.55 + k * 0.7), 0, 0, TAU); g.stroke()
    g.restore()
  }
  g.restore()
  // the streak
  const len = r * 5.5
  g.save(); g.lineCap = 'round'; g.globalCompositeOperation = 'lighter'
  const gr = g.createLinearGradient(x - cx * len, y - cy * len, x, y)
  gr.addColorStop(0, 'rgba(255,122,216,0)'); gr.addColorStop(1, 'rgba(255,160,230,0.9)')
  g.strokeStyle = gr; g.lineWidth = r * 0.7
  g.beginPath(); g.moveTo(x - cx * len, y - cy * len); g.lineTo(x, y); g.stroke()
  glowDot(g, x, y, r * 1.8, '#ff7ad8', 0.7)
  g.restore()
  // the dart: a sharp chevron-tipped needle
  g.save(); g.translate(x, y); g.rotate(a)
  g.beginPath(); g.moveTo(r * 1.5, 0); g.lineTo(-r * 0.4, -r * 0.55); g.lineTo(-r * 0.05, 0); g.lineTo(-r * 0.4, r * 0.55); g.closePath()
  g.fillStyle = '#fff0fb'; g.fill(); g.strokeStyle = '#e040b0'; g.lineWidth = 1.8; g.stroke()
  g.restore()
  if (frame % 3 === 0) v.spawn({ x, y, vx: -cx * 2 + rnd(-0.6, 0.6), vy: -cy * 2 + rnd(-0.6, 0.6), life: 10, color: '#ffc8f0', r: 2, kind: 'spark', g: 0 })
}

/** Confuse Ray: a woozy pale wisp with a hypnotic swirl inside, wobbling out of shape, three dizzy stars orbiting it */
function confuseShot(v: Vfx, _el: string, _c: string, s: ShotView): void {
  const { g, frame } = v
  const { x, y } = s, r = Math.max(9, s.r) * 1.35
  shadow(g, x, y, r)
  // wispy tail: soft puffs that sway off the path
  const t = s.trail
  g.save(); g.globalCompositeOperation = 'lighter'
  for (let i = 0; i < t.length; i += 2) { const k = (i + 1) / t.length; glowDot(g, t[i].x + Math.sin(frame * 0.3 + i) * 4, t[i].y + Math.cos(frame * 0.25 + i) * 4, r * (0.4 + 0.7 * k), '#c8a0ff', 0.3 * k) }
  glowDot(g, x, y, r * 2.2, '#e0c8ff', 0.5)
  g.restore()
  // the wisp: a wobbling blob
  g.save(); g.translate(x, y)
  g.beginPath()
  for (let i = 0; i <= 24; i++) { const an = (i / 24) * TAU, rr = r * (1 + 0.12 * Math.sin(an * 3 + frame * 0.35) + 0.06 * Math.sin(an * 5 - frame * 0.5)); g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) }
  g.closePath()
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, r * 1.1)
  gr.addColorStop(0, '#fff6ff'); gr.addColorStop(0.6, '#d2b0ff'); gr.addColorStop(1, 'rgba(150,100,230,0.8)')
  g.fillStyle = gr; g.fill()
  // the swirl: a spiral turning inside it
  g.rotate(-frame * 0.25)
  g.strokeStyle = 'rgba(110,50,190,0.85)'; g.lineWidth = 2.2; g.lineCap = 'round'
  g.beginPath(); for (let i = 0; i <= 26; i++) { const k = i / 26, an = k * TAU * 2.2; g.lineTo(Math.cos(an) * r * 0.8 * k, Math.sin(an) * r * 0.8 * k) } g.stroke()
  g.restore()
  // three dizzy stars circling on a tilted orbit (the far side behind is dimmer)
  g.save()
  for (let k = 0; k < 3; k++) {
    const an = frame * 0.16 + (k / 3) * TAU, sx = x + Math.cos(an) * r * 1.6, sy = y - r * 0.9 + Math.sin(an) * r * 0.45
    g.save(); g.translate(sx, sy); g.rotate(frame * 0.2 + k)
    star(g, r * (0.42 + 0.12 * Math.sin(an))); g.fillStyle = hexA('#ffe45a', Math.sin(an) > 0 ? 1 : 0.6); g.fill()
    g.strokeStyle = '#b07a10'; g.lineWidth = 1.2; g.stroke()
    g.restore()
  }
  g.restore()
  if (frame % 5 === 0) v.spawn({ x, y, vx: rnd(-0.8, 0.8), vy: rnd(-1, 0), life: 22, color: '#ffe45a', r: 3.5, kind: 'star', g: 0 })
}

/** a charm's heart: a glossy pink heart that beats as it floats, tilting as it sways */
function heartShot(v: Vfx, el: string, c: string, s: ShotView): void {
  const { g, frame } = v
  const { x, y } = s, r = Math.max(9, s.r) * 1.35
  const beat = 1 + 0.16 * Math.max(0, Math.sin(frame * 0.4 + s.id * 1.7)) ** 4
  const col = el === 'Fairy' || el === 'Psychic' || el === 'Colorless' ? '#ff5f9e' : light(c, 0.1)
  shadow(g, x, y, r)
  g.save(); g.globalCompositeOperation = 'lighter'; glowDot(g, x, y, r * 2.2, '#ff8ac0', 0.5); g.restore()
  g.save(); g.translate(x, y); g.rotate(Math.sin(frame * 0.15 + s.id) * 0.3); g.scale(beat, beat)
  heart(g, r)
  const gr = g.createLinearGradient(0, -r, 0, r)
  gr.addColorStop(0, light(col, 0.35)); gr.addColorStop(1, dark(col, 0.1))
  g.fillStyle = gr; g.fill(); g.strokeStyle = dark(col, 0.45); g.lineWidth = 2; g.stroke()
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(-r * 0.45, -r * 0.35, r * 0.24, r * 0.14, -0.7, 0, TAU); g.fill()
  g.restore()
  if (frame % 4 === 0) v.spawn({ x: x + rnd(-r, r) * 0.5, y, vx: rnd(-0.4, 0.4), vy: rnd(-1, -0.4), life: 22, color: '#ffb0d4', r: 3, kind: 'dot', g: -0.01 })
}

/** Sing: a musical note (an eighth, a beamed pair or a quarter, by the shot) swaying on its way, a soft glow behind */
function noteShot(v: Vfx, el: string, c: string, s: ShotView): void {
  const { g, frame } = v
  const { x, y } = s, r = Math.max(9, s.r) * 1.35
  const col = el === 'Colorless' ? '#9fe0ff' : light(c, 0.35)
  g.save(); g.globalCompositeOperation = 'lighter'
  const t = s.trail
  for (let i = 0; i < t.length; i += 3) { const k = (i + 1) / t.length; glowDot(g, t[i].x, t[i].y - r * 0.6, r * 0.7 * k, col, 0.35 * k) }
  glowDot(g, x, y - r * 0.6, r * 2, col, 0.45)
  g.restore()
  g.save(); g.translate(x, y + r * 0.3); g.rotate(Math.sin(frame * 0.18 + s.id * 2) * 0.35)
  note(g, r * 0.55, s.id % 3, dark(col, 0.55), '#ffffff')
  g.restore()
  if (frame % 5 === 0) v.spawn({ x, y: y - r, vx: rnd(-0.4, 0.4), vy: -0.8, life: 20, color: col, r: 2.5, kind: 'star', g: -0.01 })
}

/** Moonblast: a pale full moon, cratered, in a soft pink halo and slow turning moonbeams, swelling as it flies */
function moonShot(v: Vfx, _el: string, _c: string, s: ShotView): void {
  const { g, frame } = v
  const { x, y } = s, r = Math.max(9, s.r) * 1.35
  shadow(g, x, y, r)
  g.save(); g.globalCompositeOperation = 'lighter'
  glowDot(g, x, y, r * 3, '#ffc8ec', 0.45)
  g.translate(x, y); g.rotate(frame * 0.02)
  for (let i = 0; i < 8; i++) {
    g.rotate(TAU / 8)
    const L = r * (1.9 + 0.35 * Math.sin(frame * 0.12 + i * 1.7))
    const gr = g.createLinearGradient(r * 0.8, 0, L, 0); gr.addColorStop(0, 'rgba(255,230,248,0.45)'); gr.addColorStop(1, 'rgba(255,230,248,0)')
    g.fillStyle = gr; g.beginPath(); g.moveTo(r * 0.8, -r * 0.14); g.lineTo(L, 0); g.lineTo(r * 0.8, r * 0.14); g.closePath(); g.fill()
  }
  g.restore()
  // the moon
  g.save(); g.translate(x, y)
  g.beginPath(); g.arc(0, 0, r, 0, TAU)
  const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r)
  gr.addColorStop(0, '#fffdf6'); gr.addColorStop(0.7, '#f6e6f2'); gr.addColorStop(1, '#dcbfe0')
  g.fillStyle = gr; g.fill()
  g.clip()
  // craters (fixed for this moon) and the terminator's soft shade on one limb
  g.fillStyle = 'rgba(200,160,200,0.45)'
  for (let i = 0; i < 5; i++) { const an = hash(s.id, i) * TAU, d = r * 0.6 * hash(s.id, i + 9); g.beginPath(); g.arc(Math.cos(an) * d, Math.sin(an) * d, r * (0.1 + 0.14 * hash(s.id, i + 20)), 0, TAU); g.fill() }
  const sh = g.createRadialGradient(r * 0.9, r * 0.5, r * 0.2, r * 0.9, r * 0.5, r * 1.3)
  sh.addColorStop(0, 'rgba(150,100,170,0.45)'); sh.addColorStop(1, 'rgba(150,100,170,0)')
  g.fillStyle = sh; g.fillRect(-r, -r, r * 2, r * 2)
  g.restore()
  g.save(); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.restore()
  if (frame % 3 === 0) { const an = rnd(0, TAU); v.spawn({ x: x + Math.cos(an) * r * 1.3, y: y + Math.sin(an) * r * 1.3, vx: Math.cos(an) * 0.5, vy: Math.sin(an) * 0.5 - 0.3, life: 24, color: ['#ffffff', '#ffd8f0'][frame % 2], r: 3.5, kind: 'star', g: 0 }) }
}

/** the type colours a copied move flickers through (Metronome / Mirror Move) */
const COPIES = ['#f0643c', '#4aa3f0', '#5dbb4f', '#f7d038', '#b36ee0', '#d0803e']
/** one mirror shard at the origin, R across: a silver sliver with a reflection band and the copied move's tint */
function mirrorShard(g: CanvasRenderingContext2D, R: number, tint: string, sweep: number, alpha: number): void {
  const outline = (k: number) => { g.beginPath(); g.moveTo(R * k, -R * 0.15 * k); g.lineTo(R * 0.1 * k, -R * 0.75 * k); g.lineTo(-R * 0.85 * k, -R * 0.3 * k); g.lineTo(-R * 0.6 * k, R * 0.6 * k); g.lineTo(R * 0.3 * k, R * 0.55 * k); g.closePath() }
  g.save(); g.globalAlpha = alpha
  outline(1)
  const gr = g.createLinearGradient(-R, -R, R, R)
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#c4cedc'); gr.addColorStop(1, '#7a8698')
  g.fillStyle = gr; g.fill()
  g.strokeStyle = '#3a4456'; g.lineWidth = 2.2; g.stroke()
  // the reflection: the copied move's colour glimpsed in the glass
  g.save(); g.translate(-R * 0.05, R * 0.05); outline(0.55); g.fillStyle = hexA(tint, 0.75); g.fill(); g.restore()
  // a glare line sliding across it
  outline(1); g.clip()
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = R * 0.14
  g.beginPath(); g.moveTo(sweep - R * 0.2, -R); g.lineTo(sweep - R * 0.6, R); g.stroke()
  g.restore()
}

/** Metronome / Mirror Move: a mirror shard turning over as it ricochets, a sweep of reflection across it and its
 * glass tinted by the move it copies (cycling type colours), two afterimage copies trailing it */
function mimicShot(v: Vfx, _el: string, _c: string, s: ShotView): void {
  const { g, frame } = v
  const { x, y } = s, r = Math.max(9, s.r) * 1.35, R = r * 1.6
  const tint = COPIES[Math.floor(frame / 6 + s.id) % COPIES.length]
  shadow(g, x, y, r)
  g.save(); g.globalCompositeOperation = 'lighter'; glowDot(g, x, y, R * 1.8, tint, 0.35); g.restore()
  const flip = (f: number) => 0.6 + 0.4 * Math.abs(Math.cos(f * 0.12 + s.id))
  // afterimages: copies of the shard where it just was
  const t = s.trail
  for (let j = 2; j >= 1; j--) {
    const p = t[t.length - 1 - j * 3]
    if (!p) continue
    g.save(); g.translate(p.x, p.y); g.rotate((frame - j * 3) * 0.05 + s.id); g.scale(flip(frame - j * 3), 1)
    mirrorShard(g, R, COPIES[Math.floor(frame / 6 + s.id + j) % COPIES.length], 0, 0.35 / j)
    g.restore()
  }
  g.save(); g.translate(x, y); g.rotate(frame * 0.05 + s.id); g.scale(flip(frame), 1)
  mirrorShard(g, R, tint, ((frame * 3) % 48) / 24 * R * 1.6 - R * 0.3, 1)
  g.restore()
  if (frame % 4 === 0) v.spawn({ x: x + rnd(-R, R) * 0.5, y: y + rnd(-R, R) * 0.5, vx: rnd(-0.5, 0.5), vy: rnd(-0.5, 0.5), life: 14, color: frame % 8 ? '#ffffff' : tint, r: 3, kind: 'spark', g: 0 })
}

export const PSYCHIC: Record<string, SigDraw> = {
  psychic: {
    shot: psychicShot,
    // the mind strikes: warped rings rolling out, a violet flash at the heart, motes pulled inward
    impact: (v, _el, _c, i) => {
      const { g } = v
      const k = i.t / i.life, R = Math.max(30, i.r * 1.3)
      g.save(); g.globalCompositeOperation = 'lighter'
      glowDot(g, i.x, i.y, R * (1 - k * 0.5), PSY.mid, 0.7 * (1 - k))
      g.lineWidth = 3
      for (let j = 0; j < 3; j++) {
        const p = Math.max(0, Math.min(1, k * 1.4 - j * 0.18))
        if (p <= 0 || p >= 1) continue
        g.strokeStyle = hexA(j % 2 ? '#ffffff' : PSY.ring, 0.85 * (1 - p))
        warpRing(g, i.x, i.y, R * (0.3 + p * 1.5), 6, 0.08, i.t * 0.4 + j); g.stroke()
      }
      g.restore()
      if (i.t === 0) for (let j = 0; j < 10; j++) { const an = (j / 10) * TAU, d = R * 1.4; v.spawn({ x: i.x + Math.cos(an) * d, y: i.y + Math.sin(an) * d, vx: -Math.cos(an) * 3.5, vy: -Math.sin(an) * 3.5, life: 16, color: j % 2 ? PSY.ring : PSY.mid, r: 4, kind: 'star', g: 0 }) }
    },
    impactLife: 34,
  },
  powergem: {
    shot: gemShot,
    // a glint burst: a big white four-point flare, rays of the spectrum and a spray of rainbow splinters
    impact: (v, _el, _c, i) => {
      const { g } = v
      const k = i.t / i.life, R = Math.max(30, i.r * 1.4)
      const pop = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8
      g.save(); g.translate(i.x, i.y); g.globalCompositeOperation = 'lighter'
      glowDot(g, 0, 0, R * 0.9, '#ffffff', 0.7 * pop)
      g.globalCompositeOperation = 'source-over'
      // splinters of the spectrum flying out: long thin crystal slivers, each a colour, dark-edged
      for (let j = 0; j < RAINBOW.length; j++) {
        const an = (j / RAINBOW.length) * TAU + hash(i.id, j) * 0.4, d = R * (0.3 + 1.1 * Math.min(1, k * 2.2)), L = R * 0.55 * (1 - k * 0.5)
        g.save(); g.rotate(an); g.translate(d, 0); g.globalAlpha = 1 - k * k
        g.beginPath(); g.moveTo(L, 0); g.lineTo(0, -L * 0.22); g.lineTo(-L * 0.6, 0); g.lineTo(0, L * 0.22); g.closePath()
        g.fillStyle = RAINBOW[j]; g.fill(); g.strokeStyle = 'rgba(40,30,80,0.8)'; g.lineWidth = 1.5; g.stroke()
        g.restore()
      }
      // the glint: a four-point flare, rimmed so it reads on pale ground
      g.lineJoin = 'round'
      glint(g, R * 1.2 * pop); g.fillStyle = hexA('#ffffff', pop); g.strokeStyle = hexA('#8a6cff', 0.8 * pop); g.lineWidth = 2; g.fill(); g.stroke()
      g.rotate(Math.PI / 4); glint(g, R * 0.6 * pop); g.fill(); g.stroke()
      g.restore()
      if (i.t === 0) for (let j = 0; j < 10; j++) { const an = rnd(0, TAU), sp = rnd(2.5, 5.5); v.spawn({ x: i.x, y: i.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 1, life: rnd(18, 28), color: RAINBOW[j % RAINBOW.length], r: rnd(4, 7), kind: j % 3 ? 'shard' : 'star', g: 0.12, rot: an, vr: rnd(-0.3, 0.3) }) }
    },
    impactLife: 36,
  },
  psybeam: {
    // a thin bright line threaded with rings of every colour rippling along it, rings spilling off the far end
    beam: (v, _el, _c, b) => {
      const { g, frame } = v
      const { x1, y1, x2, y2, w } = b
      const L = Math.hypot(x2 - x1, y2 - y1), a = Math.atan2(y2 - y1, x2 - x1)
      const f = Math.min(1, b.t / 4)
      g.save(); g.translate(x1, y1); g.rotate(a); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'
      g.strokeStyle = hexA('#c070ff', 0.35 * f); g.lineWidth = w * 1.2
      g.beginPath(); g.moveTo(0, 0); g.lineTo(L, 0); g.stroke()
      g.strokeStyle = hexA('#fff4ff', 0.9 * f); g.lineWidth = Math.max(3, w * 0.18)
      g.beginPath(); for (let i = 0; i <= 30; i++) { const px = (i / 30) * L; g.lineTo(px, Math.sin(px * 0.05 - frame * 0.6) * w * 0.12) } g.stroke()
      // the rings: tall thin ellipses of the spectrum marching down the beam, breathing
      const gap = 22, off = (frame * 4) % gap
      g.globalCompositeOperation = 'source-over'; g.lineWidth = 4
      for (let px = off, n = 0; px < L; px += gap, n++) {
        const idx = Math.floor((px - off) / gap) + Math.floor(frame * 4 / gap)
        const col = RAINBOW[((idx % RAINBOW.length) + RAINBOW.length) % RAINBOW.length]
        const h = w * (0.7 + 0.25 * Math.sin(px * 0.04 - frame * 0.4)) * Math.min(1, px / 40)
        g.strokeStyle = hexA(col, 0.9 * f)
        g.beginPath(); g.ellipse(px, 0, 4, h, 0, 0, TAU); g.stroke()
      }
      for (let k = 0; k < 3; k++) { const p = (frame * 0.06 + k / 3) % 1; g.strokeStyle = hexA(RAINBOW[(k * 2 + Math.floor(frame / 6)) % RAINBOW.length], 0.8 * (1 - p) * f); g.beginPath(); g.ellipse(L + p * 30, 0, 5, w * (0.9 + p), 0, 0, TAU); g.stroke() }
      g.restore()
      glowDot(g, x1 + Math.cos(a) * 16, y1 + Math.sin(a) * 16, w * 1.2, '#f0c8ff', 0.8 * f)
    },
    // a small spectrum ring where it strikes
    impact: (v, _el, _c, i) => {
      const { g } = v
      const k = i.t / i.life
      g.save(); g.lineWidth = 3
      for (let j = 0; j < 3; j++) { g.strokeStyle = hexA(RAINBOW[j * 2], 0.9 * (1 - k)); g.beginPath(); g.arc(i.x, i.y, 10 + k * 40 + j * 6, 0, TAU); g.stroke() }
      g.restore()
    },
    impactLife: 14,
  },
  confuse: {
    shot: confuseShot,
    // the foe sees stars: a ring of dizzy stars wheeling over the spot, a fading swirl
    impact: (v, _el, _c, i) => {
      const { g } = v
      const k = i.t / i.life, f = k < 0.8 ? 1 : (1 - k) / 0.2
      g.save(); g.translate(i.x, i.y - 34)
      g.strokeStyle = hexA('#b080ff', 0.7 * (1 - k)); g.lineWidth = 2.5; g.lineCap = 'round'
      g.save(); g.rotate(-i.t * 0.3); g.beginPath(); for (let j = 0; j <= 20; j++) { const p = j / 20, an = p * TAU * 2; g.lineTo(Math.cos(an) * 26 * p, Math.sin(an) * 12 * p) } g.stroke(); g.restore()
      for (let j = 0; j < 4; j++) {
        const an = i.t * 0.2 + (j / 4) * TAU, sx = Math.cos(an) * 30, sy = Math.sin(an) * 10
        g.save(); g.translate(sx, sy); g.rotate(i.t * 0.3 + j); star(g, 7); g.fillStyle = hexA('#ffe45a', f * (Math.sin(an) > 0 ? 1 : 0.6)); g.fill(); g.restore()
      }
      g.restore()
    },
    impactLife: 36,
  },
  psyshot: {
    shot: psyshotShot,
    // a sharp pin-prick: a crossed flash and one quick ring
    impact: (v, _el, _c, i) => {
      const { g } = v
      const k = i.t / i.life
      g.save(); g.translate(i.x, i.y); g.globalCompositeOperation = 'lighter'
      g.fillStyle = hexA('#ffc8f0', 1 - k); g.rotate(0.3); glint(g, 26 * (1 - k * 0.5)); g.fill()
      g.strokeStyle = hexA('#ff7ad8', 0.9 * (1 - k)); g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 8 + k * 30, 0, TAU); g.stroke()
      g.restore()
    },
    impactLife: 24,
  },
  heart: {
    shot: heartShot,
    // a heart pops: an outline heart swelling away, little hearts floating up out of it
    impact: (v, _el, _c, i) => {
      const { g } = v
      const k = i.t / i.life
      g.save(); g.translate(i.x, i.y - 10)
      g.save(); g.scale(1 + k * 1.6, 1 + k * 1.6); heart(g, 16); g.strokeStyle = hexA('#ff3f8e', 1 - k); g.lineWidth = 4 / (1 + k * 1.6); g.stroke(); g.restore()
      for (let j = 0; j < 5; j++) {
        const an = -Math.PI / 2 + (hash(i.id, j) - 0.5) * 2.4, d = 14 + k * 50 * (0.6 + 0.4 * hash(i.id, j + 5))
        g.save(); g.translate(Math.cos(an) * d, Math.sin(an) * d - k * 14); g.rotate((hash(i.id, j + 9) - 0.5) * 0.8)
        heart(g, 6 + 3 * hash(i.id, j + 3)); g.fillStyle = hexA(j % 2 ? '#ff5f9e' : '#ffa8d0', 1 - k); g.fill()
        g.restore()
      }
      g.restore()
    },
    impactLife: 28,
  },
  sing: {
    shot: noteShot,
    // the song lands: a soft ring of sound and a few notes drifting up and away
    impact: (v, el, c, i) => {
      const { g } = v
      const k = i.t / i.life, col = el === 'Colorless' ? '#9fe0ff' : light(c, 0.35)
      g.save()
      g.strokeStyle = hexA(col, 0.8 * (1 - k)); g.lineWidth = 3
      g.beginPath(); g.arc(i.x, i.y, 12 + k * 44, 0, TAU); g.stroke()
      g.globalAlpha = 1 - k
      for (let j = 0; j < 3; j++) {
        g.save(); g.translate(i.x + (j - 1) * 22 + Math.sin(i.t * 0.2 + j) * 5, i.y - 16 - k * 40 - j * 6); g.rotate((j - 1) * 0.25)
        note(g, 5, j, dark(col, 0.55), '#ffffff'); g.restore()
      }
      g.restore()
    },
    impactLife: 30,
  },
  moonblast: {
    shot: moonShot,
    // the moon bursts: a wash of pale moonlight to the blast's edge, a crescent flaring at its heart, sparkles
    impact: (v, _el, _c, i) => {
      const { g } = v
      const k = i.t / i.life, R = i.r
      const e = 1 - (1 - Math.min(1, k * 2)) ** 3
      g.save(); g.translate(i.x, i.y); g.globalCompositeOperation = 'lighter'
      glowDot(g, 0, 0, R * (0.5 + 0.7 * e), '#ffe0f4', 0.75 * (1 - k))
      g.strokeStyle = hexA('#ffffff', 0.8 * (1 - k)); g.lineWidth = 4 * (1 - k) + 1
      g.beginPath(); g.arc(0, 0, R * e, 0, TAU); g.stroke()
      for (let j = 0; j < 10; j++) {
        const an = (j / 10) * TAU + hash(i.id, j) * 0.3, L = R * e * (0.9 + 0.4 * hash(i.id, j + 4))
        g.strokeStyle = hexA('#ffc8ec', 0.5 * (1 - k)); g.lineWidth = 3
        g.beginPath(); g.moveTo(Math.cos(an) * L * 0.3, Math.sin(an) * L * 0.3); g.lineTo(Math.cos(an) * L, Math.sin(an) * L); g.stroke()
      }
      g.restore()
      // the crescent: a pale disc with a bite taken out of it
      g.save(); g.translate(i.x, i.y); g.globalAlpha = Math.max(0, 1 - k * 1.3)
      const cr = R * 0.32 * (0.8 + 0.4 * e)
      g.beginPath(); g.arc(0, 0, cr, 0, TAU); g.arc(cr * 0.45, -cr * 0.2, cr * 0.85, 0, TAU, true)
      g.fillStyle = '#fffaf0'; g.fill('evenodd')
      g.restore()
      if (i.t === 0) for (let j = 0; j < 14; j++) { const an = rnd(0, TAU), sp = rnd(2, 5); v.spawn({ x: i.x, y: i.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 0.5, life: rnd(24, 36), color: j % 2 ? '#ffffff' : '#ffc8ec', r: rnd(3, 6), kind: 'star', g: 0.01 }) }
    },
    impactLife: 32,
  },
  gleam: {
    // on the ground: a white flash and a ring of the spectrum racing out to the edge
    area: (v, _el, _c, a) => {
      const { g } = v
      const k = Math.min(1, (a.ticks + 12 - a.t) / 12), R = a.r * (0.25 + 0.75 * (1 - (1 - k) ** 2))
      g.save(); g.globalCompositeOperation = 'lighter'
      glowDot(g, a.x, a.y, R, '#ffffff', 0.5 * a.fade * (1 - k * 0.6))
      g.lineWidth = 7 * (1 - k) + 3
      const n = RAINBOW.length * 2
      for (let i = 0; i < n; i++) {
        g.strokeStyle = hexA(RAINBOW[i % RAINBOW.length], 0.9 * a.fade)
        g.beginPath(); g.arc(a.x, a.y, R, (i / n) * TAU + k, ((i + 1) / n) * TAU + k); g.stroke()
      }
      g.restore()
    },
    // over the fighters: rays of every colour flaring out from you, sparkles twinkling across the flash
    air: (v, _el, _c, a) => {
      const { g, frame } = v
      const k = Math.min(1, (a.ticks + 12 - a.t) / 12), R = a.r * (0.3 + 0.7 * (1 - (1 - k) ** 2))
      g.save(); g.translate(a.x, a.y - 20); g.globalCompositeOperation = 'lighter'
      g.rotate(frame * 0.02); g.globalCompositeOperation = 'source-over'
      for (let i = 0; i < 14; i++) {
        const an = (i / 14) * TAU, L = R * (i % 2 ? 0.8 : 1.1), wd = 0.07
        g.fillStyle = hexA(RAINBOW[i % RAINBOW.length], 0.5 * a.fade * (1 - k * 0.5))
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(an - wd) * L, Math.sin(an - wd) * L); g.lineTo(Math.cos(an + wd) * L, Math.sin(an + wd) * L); g.closePath(); g.fill()
      }
      g.rotate(-frame * 0.02); g.globalCompositeOperation = 'lighter'
      g.fillStyle = hexA('#ffffff', a.fade * (1 - k * 0.7)); glint(g, 34 * (1 - k * 0.5)); g.fill()
      for (let i = 0; i < 10; i++) {
        const tw = Math.sin(frame * 0.5 + i * 2.1)
        if (tw < 0) continue
        const an = hash(a.id, i) * TAU, d = R * (0.3 + 0.7 * hash(a.id, i + 11))
        g.save(); g.translate(Math.cos(an) * d, Math.sin(an) * d * 0.8); g.fillStyle = hexA('#ffffff', a.fade * tw); glint(g, 5 + 7 * tw); g.fill(); g.restore()
      }
      g.restore()
      if (k < 1) { const an = rnd(0, TAU); v.spawn({ x: a.x + Math.cos(an) * R, y: a.y + Math.sin(an) * R, vx: Math.cos(an) * 2, vy: Math.sin(an) * 2 - 0.5, life: 20, color: RAINBOW[frame % RAINBOW.length], r: 4, kind: 'star', g: 0 }) }
    },
  },
  mimic: {
    shot: mimicShot,
    // the mirror cracks: a white flash, straight cracks radiating out, silver slivers flying
    impact: (v, _el, _c, i) => {
      const { g } = v
      const k = i.t / i.life
      g.save(); g.translate(i.x, i.y)
      g.globalCompositeOperation = 'lighter'; glowDot(g, 0, 0, 34, '#ffffff', 0.8 * (1 - k)); g.globalCompositeOperation = 'source-over'
      g.strokeStyle = hexA('#ffffff', 1 - k); g.lineWidth = 2; g.lineJoin = 'miter'
      g.beginPath()
      for (let j = 0; j < 7; j++) { const an = (j / 7) * TAU + hash(i.id, j), L = 18 + 22 * hash(i.id, j + 7); g.moveTo(0, 0); g.lineTo(Math.cos(an) * L * 0.5, Math.sin(an) * L * 0.5); g.lineTo(Math.cos(an + 0.2) * L, Math.sin(an + 0.2) * L) }
      g.stroke()
      g.restore()
      if (i.t === 0) for (let j = 0; j < 8; j++) { const an = rnd(0, TAU), sp = rnd(2, 5); v.spawn({ x: i.x, y: i.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 1, life: 22, color: j % 3 ? '#e8eef8' : COPIES[j % COPIES.length], r: rnd(4, 7), kind: 'shard', g: 0.15, rot: an, vr: rnd(-0.3, 0.3) }) }
    },
    impactLife: 18,
  },
  fairywind: {
    // a pink breeze: curling gusts sweeping out through the cone, petals and glitter blown along it
    cone: (v, _el, _c, w) => {
      const { g } = v
      const { x, y, aim, range, arc, k } = w
      const fade = 1 - Math.max(0, k - 0.4) / 0.6
      const reach = range * Math.min(1, 0.35 + k * 1.3)
      g.save()
      const gr = g.createRadialGradient(x, y, 0, x, y, reach)
      gr.addColorStop(0, 'rgba(255,190,230,0.35)'); gr.addColorStop(1, 'rgba(255,190,230,0)')
      g.globalAlpha = fade
      g.fillStyle = gr; g.beginPath(); g.moveTo(x, y); g.arc(x, y, reach, aim - arc / 2, aim + arc / 2); g.closePath(); g.fill()
      // curls of wind: a streak ending in a little spiral, riding out with the swing
      g.lineCap = 'round'
      for (let i = 0; i < 5; i++) {
        const t = aim + ((i + 0.5) / 5 - 0.5) * arc * 0.85, d = reach * (0.45 + 0.4 * ((i * 0.37 + k) % 1))
        const px = x + Math.cos(t) * d, py = y + Math.sin(t) * d, cr = 9 + 3 * (i % 2)
        g.strokeStyle = i % 2 ? 'rgba(255,255,255,0.9)' : 'rgba(255,150,210,0.95)'; g.lineWidth = 3
        g.beginPath(); g.moveTo(x + Math.cos(t) * d * 0.45, y + Math.sin(t) * d * 0.45)
        g.quadraticCurveTo(x + Math.cos(t - 0.12) * d * 0.75, y + Math.sin(t - 0.12) * d * 0.75, px, py)
        const ox = px - Math.cos(t - Math.PI / 2) * cr, oy = py - Math.sin(t - Math.PI / 2) * cr
        for (let j = 0; j <= 14; j++) { const q = j / 14, an = t - Math.PI / 2 + q * TAU * 1.1, rr = cr * (1 - q * 0.7); g.lineTo(ox + Math.cos(an) * rr, oy + Math.sin(an) * rr) }
        g.stroke()
      }
      g.restore()
      if (k < 0.6) for (let i = 0; i < 3; i++) {
        const t = aim + rnd(-0.5, 0.5) * arc, sp = rnd(0.6, 1.05) * (range / 12)
        v.spawn({ x: x + Math.cos(t) * 20, y: y + Math.sin(t) * 20, vx: Math.cos(t) * sp, vy: Math.sin(t) * sp, life: 26, color: ['#ffb0dc', '#ffffff', '#ff8ac8'][i], r: i === 1 ? 4 : 6, kind: i === 1 ? 'star' : 'leaf', g: 0, rot: rnd(0, TAU), vr: rnd(-0.2, 0.2) })
      }
    },
  },
}
